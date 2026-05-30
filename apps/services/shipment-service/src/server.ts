import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { shipmentStatusSchema } from "@smartlogistics/shared-types";
import { Pool } from "pg";

const app = Fastify({ logger: buildLogger("shipment-service") });
setupMetrics(app, "shipment-service");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5433"}/shipment_service`
});

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_records (
      id TEXT PRIMARY KEY,
      "from" TEXT NOT NULL,
      "to" TEXT NOT NULL,
      weight TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      courier TEXT NOT NULL,
      placed TEXT NOT NULL,
      eta TEXT NOT NULL,
      risk DOUBLE PRECISION NOT NULL DEFAULT 0,
      items INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_returns (
      id TEXT PRIMARY KEY,
      shipment TEXT NOT NULL,
      reason TEXT NOT NULL,
      initiated TEXT NOT NULL,
      stage TEXT NOT NULL,
      customer TEXT NOT NULL,
      refund TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_exceptions (
      id TEXT PRIMARY KEY,
      shipment TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      age TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_timelines (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      t TEXT NOT NULL,
      label TEXT NOT NULL,
      descr TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_audits_v2 (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      t TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE shipment_records ADD COLUMN IF NOT EXISTS transit_minutes INTEGER NOT NULL DEFAULT 0;
  `);
};

const createShipmentSchema = z.object({
  reference: z.string().min(2),
  priority: z.string().default("standard")
});

app.get("/health", async () => ({ ok: true, service: "shipment-service" }));

app.post("/", async (request) => {
  const payload = createShipmentSchema.parse(request.body);
  const id = `SL-${Math.floor(1000000 + Math.random() * 9000000)}`;
  const created = {
    id,
    from: "KHI-W1",
    to: payload.reference,
    weight: "1.0kg",
    status: "created",
    priority: payload.priority,
    courier: "-",
    placed: "now",
    eta: "tomorrow",
    risk: 0.1,
    items: 1,
    transitMinutes: 0
  };
  await pool.query(
    `INSERT INTO shipment_records (id, "from", "to", weight, status, priority, courier, placed, eta, risk, items, transit_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, created.from, created.to, created.weight, created.status, created.priority, created.courier, created.placed, created.eta, created.risk, created.items, created.transitMinutes]
  );
  await pool.query(
    `INSERT INTO shipment_audits_v2 (id, shipment_id, t, actor, action, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), id, new Date().toISOString(), "api:shipment-service", "shipment_created", "POST /shipments"]
  );
  return created;
});

app.get("/", async (request) => {
  const query = request.query as { limit?: string; offset?: string; from?: string; to?: string };
  const limit = Math.min(Math.max(Number(query.limit ?? 500), 1), 1000);
  const offset = Math.max(Number(query.offset ?? 0), 0);
  const { from, to } = parseRange(query);
  const total = Number(
    (await pool.query(`SELECT COUNT(*)::int AS c FROM shipment_records WHERE created_at >= $1 AND created_at <= $2`, [from, to])).rows[0]?.c ?? 0
  );
  const { rows } = await pool.query(
    `SELECT id, "from", "to", weight, status, priority, courier, placed, eta, risk, items, transit_minutes
     FROM shipment_records
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [from, to, limit, offset]
  );
  return { items: rows, total, page: Math.floor(offset / limit) + 1, limit };
});
app.get("/returns", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const { rows } = await pool.query(
    `SELECT id, shipment, reason, initiated, stage, customer, refund
     FROM shipment_returns
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [from, to]
  );
  return { items: rows };
});
app.get("/exceptions", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const { rows } = await pool.query(
    `SELECT id, shipment, kind, severity, age, owner_name AS owner
     FROM shipment_exceptions
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [from, to]
  );
  return { items: rows };
});
app.get("/returns/metrics", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  return {
    openExceptions: Number(
      (await pool.query(`SELECT COUNT(*)::int AS c FROM shipment_exceptions WHERE created_at >= $1 AND created_at <= $2`, [from, to])).rows[0]?.c ?? 0
    ),
    activeReturns: Number(
      (await pool.query(`SELECT COUNT(*)::int AS c FROM shipment_returns WHERE created_at >= $1 AND created_at <= $2`, [from, to])).rows[0]?.c ?? 0
    ),
    refunded24h: "Rs 0",
    returnRatePct: 3.4
  };
});
app.get("/exceptions/taxonomy", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const total = Number(
    (await pool.query(`SELECT COUNT(*)::int AS c FROM shipment_exceptions WHERE created_at >= $1 AND created_at <= $2`, [from, to])).rows[0]?.c ?? 0
  );
  const { rows } = await pool.query(
    `SELECT kind, COUNT(*)::int AS n
     FROM shipment_exceptions
     WHERE created_at >= $1 AND created_at <= $2
     GROUP BY kind
     ORDER BY n DESC
     LIMIT 10`,
    [from, to]
  );
  return {
    items: rows.map((r: { kind: string; n: number | string }) => {
      const pct = total > 0 ? Math.round((Number(r.n) / total) * 100) : 0;
      return {
        kind: r.kind,
        n: Number(r.n),
        pct,
        tone: pct >= 30 ? "err" : pct >= 20 ? "warn" : "neutral"
      };
    })
  };
});
app.get("/:id", async (request) => {
  const { id } = request.params as { id: string };
  const shipment = (
    await pool.query(
      `SELECT id, "from", "to", weight, status, priority, courier, placed, eta, risk, items, transit_minutes
       FROM shipment_records
       WHERE id = $1`,
      [id]
    )
  ).rows[0];
  return { ...(shipment ?? { id }), history: [] };
});
app.get("/:id/timeline", async (request) => {
  const { id } = request.params as { id: string };
  const { rows } = await pool.query(
    `SELECT t, label, descr AS desc, done, active
     FROM shipment_timelines
     WHERE shipment_id = $1
     ORDER BY created_at ASC`,
    [id]
  );
  return { items: rows };
});
app.get("/:id/audit", async (request) => {
  const { id } = request.params as { id: string };
  const { rows } = await pool.query(
    `SELECT t, actor, action, reason
     FROM shipment_audits_v2
     WHERE shipment_id = $1
     ORDER BY created_at DESC`,
    [id]
  );
  return { items: rows };
});

const actorSchema = z.object({
  actor: z.string().default("ops:console"),
  reason: z.string().optional(),
});

async function appendAudit(shipmentId: string, actor: string, action: string, reason: string): Promise<void> {
  await pool.query(
    `INSERT INTO shipment_audits_v2 (id, shipment_id, t, actor, action, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), shipmentId, new Date().toISOString(), actor, action, reason]
  );
}

// Canonical lifecycle steps. Kept identical to the seed (scripts/seed.ts) so that
// runtime-advanced timelines and seeded timelines render the same way.
const LIFECYCLE_STEPS = ["Created", "Picked up", "In transit", "Out for delivery", "Delivered"] as const;

// Maps a shipment status to "how many steps are complete". The step at this index
// becomes the active (pulsing) node; everything before it is done. Mirrors the seed
// mapping so the timeline never contradicts the status pill.
function doneIdxForStatus(status: string): number {
  const s = String(status ?? "").toLowerCase();
  if (s === "delivered") return LIFECYCLE_STEPS.length;
  if (s === "out_for_delivery" || s === "out-for-delivery") return 4;
  if (s === "in_transit" || s === "in-transit") return 3;
  if (s === "attempted") return 3;
  if (s === "exception") return 3;
  if (s === "failed" || s === "returned") return 3;
  if (s === "picked" || s === "dispatched") return 2;
  if (s === "created") return 1;
  return 1;
}

// Guarantees a shipment has the 5 canonical lifecycle rows (e.g. shipments created
// via POST / have none until now).
async function ensureTimeline(shipmentId: string): Promise<void> {
  const count = Number(
    (await pool.query(`SELECT COUNT(*)::int AS c FROM shipment_timelines WHERE shipment_id = $1`, [shipmentId])).rows[0]?.c ?? 0
  );
  if (count > 0) return;
  for (const label of LIFECYCLE_STEPS) {
    await pool.query(
      `INSERT INTO shipment_timelines (id, shipment_id, t, label, descr, done, active)
       VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)`,
      [crypto.randomUUID(), shipmentId, new Date().toISOString(), label, label]
    );
  }
}

// Recomputes done/active flags for the canonical timeline steps from the shipment's
// current status, so the Lifecycle timeline stays in sync with actions/escalations.
// Optionally stamps the freshly-reached step with a new timestamp + description.
async function syncTimelineToStatus(shipmentId: string, status: string, descrOverride?: string): Promise<void> {
  await ensureTimeline(shipmentId);
  const rows = (
    await pool.query(`SELECT id FROM shipment_timelines WHERE shipment_id = $1 ORDER BY created_at ASC`, [shipmentId])
  ).rows as Array<{ id: string }>;
  if (rows.length === 0) return;

  const doneIdx = doneIdxForStatus(status);
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += 1) {
    const done = i < doneIdx;
    const active = !done && i === doneIdx;
    const justReached = active || (done && i === doneIdx - 1);
    if (justReached) {
      await pool.query(
        `UPDATE shipment_timelines
         SET done = $2, active = $3, t = $4${descrOverride ? ", descr = $5" : ""}
         WHERE id = $1`,
        descrOverride
          ? [rows[i]!.id, done, active, now, descrOverride]
          : [rows[i]!.id, done, active, now]
      );
    } else {
      await pool.query(`UPDATE shipment_timelines SET done = $2, active = $3 WHERE id = $1`, [rows[i]!.id, done, active]);
    }
  }
}

async function getShipmentRow(id: string) {
  return (
    await pool.query(
      `SELECT id, "from", "to", weight, status, priority, courier, placed, eta, risk, items, transit_minutes
       FROM shipment_records
       WHERE id = $1`,
      [id]
    )
  ).rows[0];
}

app.post("/:id/escalate", async (request) => {
  const { id } = request.params as { id: string };
  const body = actorSchema.parse(request.body ?? {});
  const shipment = await getShipmentRow(id);
  if (!shipment) return { ok: false, error: "Shipment not found" };

  const reason = body.reason ?? "Manual escalation from operations console";
  await appendAudit(id, body.actor, "exception_escalated", reason);

  const existing = await pool.query(
    `SELECT id FROM shipment_exceptions WHERE shipment = $1 AND kind = 'escalated' LIMIT 1`,
    [id]
  );
  let exceptionId = existing.rows[0]?.id as string | undefined;
  if (!exceptionId) {
    exceptionId = `EX-${id.replace(/\W/g, "").slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    await pool.query(
      `INSERT INTO shipment_exceptions (id, shipment, kind, severity, age, owner_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [exceptionId, id, "escalated", "high", "just now", body.actor]
    );
  }

  if (String(shipment.status).toLowerCase() !== "delivered") {
    await pool.query(`UPDATE shipment_records SET status = 'exception' WHERE id = $1`, [id]);
  }

  const updated = await getShipmentRow(id);
  await syncTimelineToStatus(id, String(updated?.status ?? shipment.status), `Escalated: ${reason}`);
  const { rows: auditRows } = await pool.query(
    `SELECT t, actor, action, reason FROM shipment_audits_v2 WHERE shipment_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [id]
  );
  return { ok: true, shipment: updated, exceptionId, audit: auditRows };
});

const shipmentActionSchema = z.object({
  action: z.enum(["mark_delivered", "schedule_reattempt", "reassign_courier", "initiate_return", "cancel_shipment"]),
  actor: z.string().default("ops:console"),
  reason: z.string().optional(),
});

app.post("/:id/actions", async (request) => {
  const { id } = request.params as { id: string };
  const body = shipmentActionSchema.parse(request.body ?? {});
  const shipment = await getShipmentRow(id);
  if (!shipment) return { ok: false, error: "Shipment not found" };

  const actor = body.actor;
  let auditAction = "status_changed";
  let auditReason = body.reason ?? body.action;

  switch (body.action) {
    case "mark_delivered":
      await pool.query(`UPDATE shipment_records SET status = 'delivered', eta = 'delivered' WHERE id = $1`, [id]);
      auditReason = body.reason ?? "Marked delivered from actions menu";
      break;
    case "schedule_reattempt":
      await pool.query(`UPDATE shipment_records SET status = 'attempted', eta = '19:30 today' WHERE id = $1`, [id]);
      auditAction = "reattempt_scheduled";
      auditReason = body.reason ?? "Reattempt scheduled for 19:30";
      break;
    case "reassign_courier": {
      const courier = `C-${Math.floor(1000 + Math.random() * 9000)}`;
      await pool.query(`UPDATE shipment_records SET courier = $2 WHERE id = $1`, [id, courier]);
      auditAction = "courier_assigned";
      auditReason = body.reason ?? `Reassigned to ${courier}`;
      break;
    }
    case "initiate_return":
      await pool.query(`UPDATE shipment_records SET status = 'returned' WHERE id = $1`, [id]);
      auditAction = "return_initiated";
      auditReason = body.reason ?? "Return initiated from actions menu";
      break;
    case "cancel_shipment":
      await pool.query(`UPDATE shipment_records SET status = 'failed', courier = '-' WHERE id = $1`, [id]);
      auditAction = "shipment_cancelled";
      auditReason = body.reason ?? "Cancelled from actions menu";
      break;
  }

  await appendAudit(id, actor, auditAction, auditReason);

  const updated = await getShipmentRow(id);
  // Advance the lifecycle timeline so it never contradicts the new status. We only
  // re-sync when the status actually moved (reassign_courier leaves status untouched).
  if (String(updated?.status ?? "") !== String(shipment.status ?? "")) {
    await syncTimelineToStatus(id, String(updated?.status ?? shipment.status), auditReason);
  }
  const { rows: auditRows } = await pool.query(
    `SELECT t, actor, action, reason FROM shipment_audits_v2 WHERE shipment_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [id]
  );
  return { ok: true, shipment: updated, audit: auditRows };
});

app.patch("/:id", async () => ({ ok: true }));
app.post("/:id/approve", async () => ({ ok: true, status: "APPROVED" }));

app.patch("/:id/status", async (request) => {
  const body = z.object({ status: shipmentStatusSchema }).parse(request.body);
  return { ok: true, status: body.status };
});

app.post("/:id/returns", async () => ({ ok: true, status: "RETURNED" }));

const port = Number(process.env.SHIPMENT_SERVICE_PORT ?? 4002);
await ensureSchema();
await app.listen({ port, host: "0.0.0.0" });
