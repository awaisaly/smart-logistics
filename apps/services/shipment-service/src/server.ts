import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { shipmentStatusSchema } from "@smartlogistics/shared-types";
import { prisma } from "./db.js";

const app = Fastify({ logger: buildLogger("shipment-service") });
setupMetrics(app, "shipment-service");

// Shapes the internal (camelCase) Prisma row into the snake_cased JSON the
// frontend has always consumed (notably `transit_minutes`).
type ShipmentRow = {
  id: string;
  from: string;
  to: string;
  weight: string;
  status: string;
  priority: string;
  courier: string;
  placed: string;
  eta: string;
  risk: number;
  items: number;
  transitMinutes: number;
};
const SHIPMENT_SELECT = {
  id: true,
  from: true,
  to: true,
  weight: true,
  status: true,
  priority: true,
  courier: true,
  placed: true,
  eta: true,
  risk: true,
  items: true,
  transitMinutes: true
} as const;
const shipmentDto = (r: ShipmentRow) => ({
  id: r.id,
  from: r.from,
  to: r.to,
  weight: r.weight,
  status: r.status,
  priority: r.priority,
  courier: r.courier,
  placed: r.placed,
  eta: r.eta,
  risk: r.risk,
  items: r.items,
  transit_minutes: r.transitMinutes
});

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
  await prisma.shipmentRecord.create({ data: created });
  await prisma.shipmentAudit.create({
    data: {
      id: crypto.randomUUID(),
      shipmentId: id,
      t: new Date().toISOString(),
      actor: "api:shipment-service",
      action: "shipment_created",
      reason: "POST /shipments"
    }
  });
  return created;
});

app.get("/", async (request) => {
  const query = request.query as { limit?: string; offset?: string; from?: string; to?: string };
  const limit = Math.min(Math.max(Number(query.limit ?? 500), 1), 1000);
  const offset = Math.max(Number(query.offset ?? 0), 0);
  const { from, to } = parseRange(query);
  const where = { createdAt: { gte: new Date(from), lte: new Date(to) } };
  const total = await prisma.shipmentRecord.count({ where });
  const rows = await prisma.shipmentRecord.findMany({
    where,
    select: SHIPMENT_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset
  });
  return { items: rows.map(shipmentDto), total, page: Math.floor(offset / limit) + 1, limit };
});
app.get("/returns", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const items = await prisma.shipmentReturn.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    select: { id: true, shipment: true, reason: true, initiated: true, stage: true, customer: true, refund: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return { items };
});
app.get("/exceptions", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const rows = await prisma.shipmentException.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    select: { id: true, shipment: true, kind: true, severity: true, age: true, ownerName: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return { items: rows.map((r) => ({ id: r.id, shipment: r.shipment, kind: r.kind, severity: r.severity, age: r.age, owner: r.ownerName })) };
});
app.get("/returns/metrics", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const range = { createdAt: { gte: new Date(from), lte: new Date(to) } };
  return {
    openExceptions: await prisma.shipmentException.count({ where: range }),
    activeReturns: await prisma.shipmentReturn.count({ where: range }),
    refunded24h: "Rs 0",
    returnRatePct: 3.4
  };
});
app.get("/exceptions/taxonomy", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const range = { createdAt: { gte: new Date(from), lte: new Date(to) } };
  const total = await prisma.shipmentException.count({ where: range });
  const grouped = await prisma.shipmentException.groupBy({
    by: ["kind"],
    where: range,
    _count: { kind: true },
    orderBy: { _count: { kind: "desc" } },
    take: 10
  });
  return {
    items: grouped.map((r) => {
      const n = r._count.kind;
      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
      return {
        kind: r.kind,
        n,
        pct,
        tone: pct >= 30 ? "err" : pct >= 20 ? "warn" : "neutral"
      };
    })
  };
});
app.get("/:id", async (request) => {
  const { id } = request.params as { id: string };
  const shipment = await prisma.shipmentRecord.findUnique({ where: { id }, select: SHIPMENT_SELECT });
  return { ...(shipment ? shipmentDto(shipment) : { id }), history: [] };
});
app.get("/:id/timeline", async (request) => {
  const { id } = request.params as { id: string };
  const rows = await prisma.shipmentTimeline.findMany({
    where: { shipmentId: id },
    select: { t: true, label: true, descr: true, done: true, active: true },
    orderBy: { createdAt: "asc" }
  });
  return { items: rows.map((r) => ({ t: r.t, label: r.label, desc: r.descr, done: r.done, active: r.active })) };
});
app.get("/:id/audit", async (request) => {
  const { id } = request.params as { id: string };
  const items = await prisma.shipmentAudit.findMany({
    where: { shipmentId: id },
    select: { t: true, actor: true, action: true, reason: true },
    orderBy: { createdAt: "desc" }
  });
  return { items };
});

const actorSchema = z.object({
  actor: z.string().default("ops:console"),
  reason: z.string().optional(),
});

async function appendAudit(shipmentId: string, actor: string, action: string, reason: string): Promise<void> {
  await prisma.shipmentAudit.create({
    data: { id: crypto.randomUUID(), shipmentId, t: new Date().toISOString(), actor, action, reason }
  });
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
  const count = await prisma.shipmentTimeline.count({ where: { shipmentId } });
  if (count > 0) return;
  const now = new Date().toISOString();
  await prisma.shipmentTimeline.createMany({
    data: LIFECYCLE_STEPS.map((label) => ({
      id: crypto.randomUUID(),
      shipmentId,
      t: now,
      label,
      descr: label,
      done: false,
      active: false
    }))
  });
}

// Recomputes done/active flags for the canonical timeline steps from the shipment's
// current status, so the Lifecycle timeline stays in sync with actions/escalations.
// Optionally stamps the freshly-reached step with a new timestamp + description.
async function syncTimelineToStatus(shipmentId: string, status: string, descrOverride?: string): Promise<void> {
  await ensureTimeline(shipmentId);
  const rows = await prisma.shipmentTimeline.findMany({
    where: { shipmentId },
    select: { id: true },
    orderBy: { createdAt: "asc" }
  });
  if (rows.length === 0) return;

  const doneIdx = doneIdxForStatus(status);
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += 1) {
    const done = i < doneIdx;
    const active = !done && i === doneIdx;
    const justReached = active || (done && i === doneIdx - 1);
    await prisma.shipmentTimeline.update({
      where: { id: rows[i]!.id },
      data: justReached
        ? { done, active, t: now, ...(descrOverride ? { descr: descrOverride } : {}) }
        : { done, active }
    });
  }
}

async function getShipmentRow(id: string): Promise<ShipmentRow | null> {
  return prisma.shipmentRecord.findUnique({ where: { id }, select: SHIPMENT_SELECT });
}

app.post("/:id/escalate", async (request) => {
  const { id } = request.params as { id: string };
  const body = actorSchema.parse(request.body ?? {});
  const shipment = await getShipmentRow(id);
  if (!shipment) return { ok: false, error: "Shipment not found" };

  const reason = body.reason ?? "Manual escalation from operations console";
  await appendAudit(id, body.actor, "exception_escalated", reason);

  const existing = await prisma.shipmentException.findFirst({
    where: { shipment: id, kind: "escalated" },
    select: { id: true }
  });
  let exceptionId = existing?.id;
  if (!exceptionId) {
    exceptionId = `EX-${id.replace(/\W/g, "").slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    await prisma.shipmentException.create({
      data: { id: exceptionId, shipment: id, kind: "escalated", severity: "high", age: "just now", ownerName: body.actor }
    });
  }

  if (String(shipment.status).toLowerCase() !== "delivered") {
    await prisma.shipmentRecord.update({ where: { id }, data: { status: "exception" } });
  }

  const updated = await getShipmentRow(id);
  await syncTimelineToStatus(id, String(updated?.status ?? shipment.status), `Escalated: ${reason}`);
  const auditRows = await prisma.shipmentAudit.findMany({
    where: { shipmentId: id },
    select: { t: true, actor: true, action: true, reason: true },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return { ok: true, shipment: updated ? shipmentDto(updated) : null, exceptionId, audit: auditRows };
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
      await prisma.shipmentRecord.update({ where: { id }, data: { status: "delivered", eta: "delivered" } });
      auditReason = body.reason ?? "Marked delivered from actions menu";
      break;
    case "schedule_reattempt":
      await prisma.shipmentRecord.update({ where: { id }, data: { status: "attempted", eta: "19:30 today" } });
      auditAction = "reattempt_scheduled";
      auditReason = body.reason ?? "Reattempt scheduled for 19:30";
      break;
    case "reassign_courier": {
      const courier = `C-${Math.floor(1000 + Math.random() * 9000)}`;
      await prisma.shipmentRecord.update({ where: { id }, data: { courier } });
      auditAction = "courier_assigned";
      auditReason = body.reason ?? `Reassigned to ${courier}`;
      break;
    }
    case "initiate_return":
      await prisma.shipmentRecord.update({ where: { id }, data: { status: "returned" } });
      auditAction = "return_initiated";
      auditReason = body.reason ?? "Return initiated from actions menu";
      break;
    case "cancel_shipment":
      await prisma.shipmentRecord.update({ where: { id }, data: { status: "failed", courier: "-" } });
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
  const auditRows = await prisma.shipmentAudit.findMany({
    where: { shipmentId: id },
    select: { t: true, actor: true, action: true, reason: true },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return { ok: true, shipment: updated ? shipmentDto(updated) : null, audit: auditRows };
});

app.patch("/:id", async () => ({ ok: true }));
app.post("/:id/approve", async () => ({ ok: true, status: "APPROVED" }));

app.patch("/:id/status", async (request) => {
  const body = z.object({ status: shipmentStatusSchema }).parse(request.body);
  return { ok: true, status: body.status };
});

app.post("/:id/returns", async () => ({ ok: true, status: "RETURNED" }));

const port = Number(process.env.SHIPMENT_SERVICE_PORT ?? 4002);
await app.listen({ port, host: "0.0.0.0" });
