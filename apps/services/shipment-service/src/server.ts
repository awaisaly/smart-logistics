import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { exceptionCode, shipmentStatusSchema, trackingNumber } from "@smartlogistics/shared-types";
import { prisma } from "./db.js";

const app = Fastify({ logger: buildLogger("shipment-service") });
setupMetrics(app, "shipment-service");

const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000000";

type ShipmentRow = {
  id: string;
  trackingNumber: string;
  fromCode: string;
  toCode: string;
  courierId: string;
  courierCode: string;
  weight: string;
  status: string;
  priority: string;
  placed: string;
  eta: string;
  risk: number;
  items: number;
  transitMinutes: number;
};

const SHIPMENT_SELECT = {
  id: true,
  trackingNumber: true,
  fromCode: true,
  toCode: true,
  courierId: true,
  courierCode: true,
  weight: true,
  status: true,
  priority: true,
  placed: true,
  eta: true,
  risk: true,
  items: true,
  transitMinutes: true
} as const;

/** Portal-facing JSON: human-readable codes in legacy `from`/`to`/`courier` fields. */
const shipmentDto = (r: ShipmentRow) => ({
  id: r.id,
  tracking_number: r.trackingNumber,
  from: r.fromCode,
  to: r.toCode,
  courier: r.courierCode,
  courier_id: r.courierId,
  weight: r.weight,
  status: r.status,
  priority: r.priority,
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
  const id = crypto.randomUUID();
  const row = {
    id,
    trackingNumber: trackingNumber(),
    fromWarehouseId: UNASSIGNED_ID,
    toWarehouseId: UNASSIGNED_ID,
    fromCode: "ORIGIN",
    toCode: payload.reference,
    courierId: UNASSIGNED_ID,
    courierCode: "-",
    weight: "1.0kg",
    status: "created",
    priority: payload.priority,
    placed: "now",
    eta: "tomorrow",
    risk: 0.1,
    items: 1,
    transitMinutes: 0
  };
  await prisma.shipmentRecord.create({ data: row });
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
  return shipmentDto(row);
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
    select: {
      id: true,
      code: true,
      shipmentTracking: true,
      reason: true,
      initiated: true,
      stage: true,
      customer: true,
      refund: true
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return {
    items: items.map((r) => ({
      id: r.id,
      code: r.code,
      shipment: r.shipmentTracking,
      reason: r.reason,
      initiated: r.initiated,
      stage: r.stage,
      customer: r.customer,
      refund: r.refund
    }))
  };
});

app.get("/exceptions", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const rows = await prisma.shipmentException.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    select: { id: true, code: true, shipmentTracking: true, kind: true, severity: true, age: true, ownerName: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      code: r.code,
      shipment: r.shipmentTracking,
      kind: r.kind,
      severity: r.severity,
      age: r.age,
      owner: r.ownerName
    }))
  };
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
  reason: z.string().optional()
});

async function appendAudit(shipmentId: string, actor: string, action: string, reason: string): Promise<void> {
  await prisma.shipmentAudit.create({
    data: { id: crypto.randomUUID(), shipmentId, t: new Date().toISOString(), actor, action, reason }
  });
}

const LIFECYCLE_STEPS = ["Created", "Picked up", "In transit", "Out for delivery", "Delivered"] as const;

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
    where: { shipmentId: id, kind: "escalated" },
    select: { id: true, code: true }
  });
  let exceptionId = existing?.id;
  let exceptionCodeOut = existing?.code;
  if (!exceptionId) {
    exceptionId = crypto.randomUUID();
    exceptionCodeOut = exceptionCode();
    await prisma.shipmentException.create({
      data: {
        id: exceptionId,
        code: exceptionCodeOut,
        shipmentId: id,
        shipmentTracking: shipment.trackingNumber,
        kind: "escalated",
        severity: "high",
        age: "just now",
        ownerName: body.actor
      }
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
  return { ok: true, shipment: updated ? shipmentDto(updated) : null, exceptionId: exceptionCodeOut, audit: auditRows };
});

const shipmentActionSchema = z.object({
  action: z.enum(["mark_delivered", "schedule_reattempt", "reassign_courier", "initiate_return", "cancel_shipment"]),
  actor: z.string().default("ops:console"),
  reason: z.string().optional()
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
      const nextCode = `C-${Math.floor(1000 + Math.random() * 9000)}`;
      await prisma.shipmentRecord.update({
        where: { id },
        data: { courierId: UNASSIGNED_ID, courierCode: nextCode }
      });
      auditAction = "courier_assigned";
      auditReason = body.reason ?? `Reassigned to ${nextCode}`;
      break;
    }
    case "initiate_return":
      await prisma.shipmentRecord.update({ where: { id }, data: { status: "returned" } });
      auditAction = "return_initiated";
      auditReason = body.reason ?? "Return initiated from actions menu";
      break;
    case "cancel_shipment":
      await prisma.shipmentRecord.update({
        where: { id },
        data: { status: "failed", courierId: UNASSIGNED_ID, courierCode: "-" }
      });
      auditAction = "shipment_cancelled";
      auditReason = body.reason ?? "Cancelled from actions menu";
      break;
  }

  await appendAudit(id, actor, auditAction, auditReason);

  const updated = await getShipmentRow(id);
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
