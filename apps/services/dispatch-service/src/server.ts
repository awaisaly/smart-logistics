import Fastify from "fastify";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { startDispatchWorkflow } from "./temporal/client.js";
import { startDispatchWorker } from "./temporal/worker.js";
import * as dispatchActivities from "./temporal/activities/dispatch.activities.js";
import { prisma } from "./db.js";

const app = Fastify({ logger: buildLogger("dispatch-service") });
setupMetrics(app, "dispatch-service");

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

const WORKFLOW_SELECT = {
  id: true,
  type: true,
  shipment: true,
  started: true,
  duration: true,
  status: true,
  step: true,
  retries: true,
  error: true
} as const;

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
  return prisma.dispatchWorkflow.findUnique({ where: { id }, select: WORKFLOW_SELECT });
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
  try {
    await prisma.dispatchWorkflowAudit.create({
      data: {
        workflowId: entry.workflowId,
        actor: entry.actor,
        action: entry.action,
        reason: entry.reason ?? null,
        fromStep: entry.fromStep ?? null,
        toStep: entry.toStep ?? null,
        fromStatus: entry.fromStatus ?? null,
        toStatus: entry.toStatus ?? null,
        idempotencyKey: entry.idempotencyKey ?? null
      }
    });
    return true;
  } catch (err) {
    // Unique violation on idempotency_key → this action was already recorded.
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }
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
  const items = await prisma.dispatchWorkflow.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    select: WORKFLOW_SELECT,
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return { items };
});
app.get("/failure-modes", async () => {
  const rows = await prisma.dispatchFailureMode.findMany({
    select: { kind: true, count: true, trend: true, samples: true },
    orderBy: { count: "desc" },
    take: 50
  });
  return { items: rows.map((r) => ({ ...r, samples: Array.isArray(r.samples) ? r.samples : [] })) };
});
app.get("/kpis", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const rows = await prisma.dispatchWorkflow.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    select: { status: true, duration: true }
  });
  const running = rows.filter((w) => w.status === "running").length;
  const failing = rows.filter((w) => w.status === "failing" || w.status === "compensating").length;
  const completed = rows.filter((w) => w.status === "completed").length;
  const durationSeconds = rows
    .map((w) => Number.parseInt(String(w.duration ?? "").replace(/[^\d]/g, ""), 10))
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
  const startedAt = new Date().toISOString();
  await prisma.dispatchWorkflow.upsert({
    where: { id: workflowId },
    create: {
      id: workflowId,
      type: "DispatchWorkflow",
      shipment: shipmentId,
      started: startedAt,
      duration: "-",
      status: "running",
      step: "assign_courier",
      retries: 0,
      error: null
    },
    update: { status: "running", step: "assign_courier", error: null, started: startedAt }
  });

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
  const row = await prisma.dispatchWorkflow.findFirst({
    where: { shipment: shipmentId },
    orderBy: { createdAt: "desc" },
    select: { status: true }
  });
  return { shipmentId, status: String(row?.status ?? "UNKNOWN").toUpperCase() };
});

app.get("/:workflowId/audit", async (request, reply) => {
  const { workflowId } = request.params as { workflowId: string };
  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    reply.code(404);
    return { ok: false, error: "workflow not found" };
  }
  const rows = await prisma.dispatchWorkflowAudit.findMany({
    where: { workflowId },
    select: {
      actor: true,
      action: true,
      reason: true,
      fromStep: true,
      toStep: true,
      fromStatus: true,
      toStatus: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return {
    ok: true,
    items: rows.map((r) => ({
      t: r.createdAt,
      actor: r.actor,
      action: r.action,
      reason: r.reason,
      fromStep: r.fromStep,
      toStep: r.toStep,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus
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

  await prisma.dispatchWorkflow.update({
    where: { id: workflowId },
    data: { status: "running", retries: 0, error: null, duration: "0s", started: new Date().toISOString() }
  });

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

  await prisma.dispatchWorkflow.update({
    where: { id: workflowId },
    data: { step: nextStep, status: nextStatus, retries: 0, error: null }
  });

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

  await prisma.dispatchWorkflow.update({
    where: { id: workflowId },
    data: { status: "terminated", error: workflow.error ?? "terminated by operator" }
  });

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

// Best-effort: run the Temporal worker alongside the API. If Temporal isn't
// reachable the API still serves and dispatch falls back to inline execution.
if (process.env.DISPATCH_WORKER_INPROCESS !== "false") {
  void startDispatchWorker().catch((err) =>
    app.log.warn({ err: (err as Error).message }, "dispatch Temporal worker not started")
  );
}

await app.listen({ port, host: "0.0.0.0" });
