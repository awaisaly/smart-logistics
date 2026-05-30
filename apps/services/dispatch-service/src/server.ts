import Fastify from "fastify";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { startDispatchWorkflow } from "./temporal/client.js";
import { startDispatchWorker } from "./temporal/worker.js";
import * as dispatchActivities from "./temporal/activities/dispatch.activities.js";
import { Pool } from "pg";

const app = Fastify({ logger: buildLogger("dispatch-service") });
setupMetrics(app, "dispatch-service");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5436"}/dispatch_service`
});

const DISPATCH_STEPS = [
  "assign_courier",
  "pickup_at_warehouse",
  "in_transit",
  "last_mile",
  "deliver",
  "request_signature",
  "close",
  "compensate"
] as const;
type DispatchStep = (typeof DISPATCH_STEPS)[number];

const TERMINAL_STATUSES = new Set(["completed", "terminated"]);

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_workflows (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      shipment TEXT NOT NULL,
      started TEXT NOT NULL,
      duration TEXT NOT NULL,
      status TEXT NOT NULL,
      step TEXT NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_failure_modes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      trend TEXT NOT NULL DEFAULT 'flat',
      samples JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_workflow_audit (
      id SERIAL PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      from_step TEXT,
      to_step TEXT,
      from_status TEXT,
      to_status TEXT,
      idempotency_key TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS dispatch_workflow_audit_workflow_idx
      ON dispatch_workflow_audit (workflow_id, created_at DESC);
  `);
};

type WorkflowRow = {
  id: string;
  type: string;
  shipment: string;
  started: string;
  duration: string;
  status: string;
  step: string;
  retries: number;
  error: string | null;
};

const getWorkflow = async (id: string): Promise<WorkflowRow | null> => {
  const { rows } = await pool.query<WorkflowRow>(
    `SELECT id, type, shipment, started, duration, status, step, retries, error
     FROM dispatch_workflows
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
};

const recordAudit = async (entry: {
  workflowId: string;
  actor: string;
  action: string;
  reason?: string | null;
  fromStep?: string | null;
  toStep?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  idempotencyKey?: string | null;
}): Promise<boolean> => {
  const result = await pool.query(
    `INSERT INTO dispatch_workflow_audit
       (workflow_id, actor, action, reason, from_step, to_step, from_status, to_status, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      entry.workflowId,
      entry.actor,
      entry.action,
      entry.reason ?? null,
      entry.fromStep ?? null,
      entry.toStep ?? null,
      entry.fromStatus ?? null,
      entry.toStatus ?? null,
      entry.idempotencyKey ?? null
    ]
  );
  return (result.rowCount ?? 0) > 0;
};

const readActionBody = (
  body: unknown
): { actor: string; reason: string | null; idempotencyKey: string | null } => {
  const raw = (body ?? {}) as { actor?: unknown; reason?: unknown; idempotencyKey?: unknown };
  const actor = String(raw.actor ?? "").trim() || "ops:console";
  const reason =
    typeof raw.reason === "string" && raw.reason.trim().length > 0 ? raw.reason.trim() : null;
  const idempotencyKey =
    typeof raw.idempotencyKey === "string" && raw.idempotencyKey.trim().length > 0
      ? raw.idempotencyKey.trim()
      : null;
  return { actor, reason, idempotencyKey };
};

app.get("/health", async () => ({ ok: true, service: "dispatch-service" }));
app.get("/workflows", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const { rows } = await pool.query(
    `SELECT id, type, shipment, started, duration, status, step, retries, error
     FROM dispatch_workflows
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [from, to]
  );
  return { items: rows };
});
app.get("/failure-modes", async () => {
  const { rows } = await pool.query(
    `SELECT kind, count, trend, samples
     FROM dispatch_failure_modes
     ORDER BY count DESC
     LIMIT 50`
  );
  return { items: rows.map((r: { samples: unknown[] }) => ({ ...r, samples: Array.isArray(r.samples) ? r.samples : [] })) };
});
app.get("/kpis", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const { rows } = await pool.query(
    `SELECT status, duration
     FROM dispatch_workflows
     WHERE created_at >= $1 AND created_at <= $2`,
    [from, to]
  );
  const running = rows.filter((w: { status: string }) => w.status === "running").length;
  const failing = rows.filter((w: { status: string }) => w.status === "failing" || w.status === "compensating").length;
  const completed = rows.filter((w: { status: string }) => w.status === "completed").length;
  const durationSeconds = rows
    .map((w: { duration?: string }) => Number.parseInt(String(w.duration ?? "").replace(/[^\d]/g, ""), 10))
    .filter((n: number) => Number.isFinite(n));
  const avgDurationSeconds =
    durationSeconds.length > 0 ? Math.round(durationSeconds.reduce((a: number, b: number) => a + b, 0) / durationSeconds.length) : 0;
  return { running, failing, completed, avgDurationSeconds };
});

// Run the dispatch activity sequence in-process. Used as a graceful fallback
// when Temporal is unreachable so the dispatch flow still completes locally.
const runDispatchInline = async (shipmentId: string): Promise<void> => {
  await dispatchActivities.validateShipment(shipmentId);
  await dispatchActivities.reserveInventory(shipmentId);
  await dispatchActivities.generateShippingLabel(shipmentId);
  await dispatchActivities.assignCourier(shipmentId);
  await dispatchActivities.initializeTracking(shipmentId);
  await dispatchActivities.markDispatched(shipmentId);
};

app.post("/:shipmentId/trigger", async (request) => {
  const { shipmentId } = request.params as { shipmentId: string };
  const workflowId = `dispatch-${shipmentId}`;

  // Record the durable workflow row up front so it's visible immediately.
  await pool.query(
    `INSERT INTO dispatch_workflows (id, type, shipment, started, duration, status, step, retries, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE
       SET status = 'running', step = 'assign_courier', error = NULL, started = EXCLUDED.started`,
    [workflowId, "DispatchWorkflow", shipmentId, new Date().toISOString(), "-", "running", "assign_courier", 0, null]
  );

  // Preferred path: hand the orchestration to Temporal (durable, retryable,
  // observable). If Temporal can't be reached, degrade to inline execution.
  let orchestrator = "temporal";
  try {
    await startDispatchWorkflow(shipmentId);
  } catch (err) {
    app.log.warn({ err: (err as Error).message, shipmentId }, "temporal unavailable; running dispatch inline");
    orchestrator = "inline";
    await runDispatchInline(shipmentId);
  }

  return { ok: true, workflowId, orchestrator };
});

app.get("/:shipmentId/status", async (request) => {
  const { shipmentId } = request.params as { shipmentId: string };
  const status = (
    await pool.query(
      `SELECT status
       FROM dispatch_workflows
       WHERE shipment = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId]
    )
  ).rows[0]?.status;
  return { shipmentId, status: String(status ?? "UNKNOWN").toUpperCase() };
});

app.get("/:workflowId/audit", async (request, reply) => {
  const { workflowId } = request.params as { workflowId: string };
  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    reply.code(404);
    return { ok: false, error: "workflow not found" };
  }
  const { rows } = await pool.query(
    `SELECT actor, action, reason, from_step, to_step, from_status, to_status, created_at
     FROM dispatch_workflow_audit
     WHERE workflow_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [workflowId]
  );
  return {
    ok: true,
    items: rows.map((r: Record<string, unknown>) => ({
      t: r.created_at,
      actor: r.actor,
      action: r.action,
      reason: r.reason,
      fromStep: r.from_step,
      toStep: r.to_step,
      fromStatus: r.from_status,
      toStatus: r.to_status
    }))
  };
});

app.post("/:workflowId/replay", async (request, reply) => {
  const { workflowId } = request.params as { workflowId: string };
  const { actor, reason, idempotencyKey } = readActionBody(request.body);

  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    reply.code(404);
    return { ok: false, error: "workflow not found" };
  }
  if (workflow.status === "terminated") {
    reply.code(409);
    return { ok: false, error: "workflow is terminated and cannot be replayed" };
  }

  await pool.query(
    `UPDATE dispatch_workflows
     SET status = 'running',
         retries = 0,
         error = NULL,
         duration = '0s',
         started = $2
     WHERE id = $1`,
    [workflowId, new Date().toISOString()]
  );

  const inserted = await recordAudit({
    workflowId,
    actor,
    action: "workflow_replayed",
    reason: reason ?? "manual replay",
    fromStep: workflow.step,
    toStep: workflow.step,
    fromStatus: workflow.status,
    toStatus: "running",
    idempotencyKey
  });

  const updated = await getWorkflow(workflowId);
  return { ok: true, workflow: updated, deduped: !inserted };
});

app.post("/:workflowId/skip", async (request, reply) => {
  const { workflowId } = request.params as { workflowId: string };
  const { actor, reason, idempotencyKey } = readActionBody(request.body);

  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    reply.code(404);
    return { ok: false, error: "workflow not found" };
  }
  if (TERMINAL_STATUSES.has(workflow.status)) {
    reply.code(409);
    return { ok: false, error: `workflow is ${workflow.status}; cannot skip` };
  }

  const currentIdx = DISPATCH_STEPS.indexOf(workflow.step as DispatchStep);
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;
  const isLast = safeIdx >= DISPATCH_STEPS.length - 2; // index of 'close' is steps.length-2
  const nextStep = isLast ? workflow.step : DISPATCH_STEPS[safeIdx + 1];
  const nextStatus = isLast ? "completed" : "running";

  await pool.query(
    `UPDATE dispatch_workflows
     SET step = $2,
         status = $3,
         retries = 0,
         error = NULL
     WHERE id = $1`,
    [workflowId, nextStep, nextStatus]
  );

  const inserted = await recordAudit({
    workflowId,
    actor,
    action: "workflow_step_skipped",
    reason: reason ?? `skipped from ${workflow.step}`,
    fromStep: workflow.step,
    toStep: nextStep,
    fromStatus: workflow.status,
    toStatus: nextStatus,
    idempotencyKey
  });

  const updated = await getWorkflow(workflowId);
  return { ok: true, workflow: updated, deduped: !inserted };
});

app.post("/:workflowId/terminate", async (request, reply) => {
  const { workflowId } = request.params as { workflowId: string };
  const { actor, reason, idempotencyKey } = readActionBody(request.body);

  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    reply.code(404);
    return { ok: false, error: "workflow not found" };
  }
  if (TERMINAL_STATUSES.has(workflow.status)) {
    reply.code(409);
    return { ok: false, error: `workflow is already ${workflow.status}` };
  }

  await pool.query(
    `UPDATE dispatch_workflows
     SET status = 'terminated',
         error = COALESCE(error, 'terminated by operator')
     WHERE id = $1`,
    [workflowId]
  );

  const inserted = await recordAudit({
    workflowId,
    actor,
    action: "workflow_terminated",
    reason: reason ?? "terminated by operator",
    fromStep: workflow.step,
    toStep: workflow.step,
    fromStatus: workflow.status,
    toStatus: "terminated",
    idempotencyKey
  });

  const updated = await getWorkflow(workflowId);
  return { ok: true, workflow: updated, deduped: !inserted };
});

app.post("/delivery/:shipmentId/trigger", async () => ({ ok: true }));

const port = Number(process.env.DISPATCH_SERVICE_PORT ?? 4005);
await ensureSchema();

// Best-effort: run the Temporal worker alongside the API. If Temporal isn't
// reachable the API still serves and dispatch falls back to inline execution.
if (process.env.DISPATCH_WORKER_INPROCESS !== "false") {
  void startDispatchWorker().catch((err) =>
    app.log.warn({ err: (err as Error).message }, "dispatch Temporal worker not started")
  );
}

await app.listen({ port, host: "0.0.0.0" });
