import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { warehouseCode } from "@smartlogistics/shared-types";
import { prisma } from "./db.js";

const app = Fastify({ logger: buildLogger("warehouse-service") });
setupMetrics(app, "warehouse-service");

app.get("/health", async () => ({ ok: true, service: "warehouse-service" }));

app.post("/", async (request) => {
  const payload = z.object({ name: z.string(), city: z.string() }).parse(request.body);
  const created = {
    id: crypto.randomUUID(),
    code: warehouseCode(payload.city.slice(0, 3).toUpperCase(), Math.floor(Math.random() * 9)),
    ...payload,
    util: 0.2,
    lanes: 8,
    inbound: 0,
    outbound: 0,
    throughput: "0%",
    stockLow: 0
  };
  await prisma.warehouseRecord.create({ data: created });
  return created;
});

app.get("/", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const items = await prisma.warehouseRecord.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      city: true,
      name: true,
      util: true,
      lanes: true,
      inbound: true,
      outbound: true,
      throughput: true,
      stockLow: true
    }
  });
  return { items };
});
app.patch("/:id", async () => ({ ok: true }));
app.get("/:id/inventory", async () => ({ items: [] }));
app.get("/:id/lanes", async (request) => {
  const { id } = request.params as { id: string };
  const rows = await prisma.warehouseLaneOccupancy.findMany({
    where: { warehouseId: id },
    orderBy: { laneIndex: "asc" },
    select: { occupancyPct: true }
  });
  return { items: rows.map((r) => Number(r.occupancyPct)) };
});
app.get("/:id/stock", async (request) => {
  const { id } = request.params as { id: string };
  const rows = await prisma.warehouseStockItem.findMany({
    where: { warehouseId: id },
    orderBy: { createdAt: "desc" },
    select: { sku: true, name: true, onHand: true, reserved: true, thresholdValue: true, hot: true }
  });
  return {
    items: rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      on: r.onHand,
      reserved: r.reserved,
      threshold: r.thresholdValue,
      hot: r.hot
    }))
  };
});

app.post("/inventory/reserve", async () => ({ ok: true, reservationId: crypto.randomUUID() }));
app.post("/inventory/release", async () => ({ ok: true }));
app.post("/inventory/adjust", async () => ({ ok: true }));

const port = Number(process.env.WAREHOUSE_SERVICE_PORT ?? 4003);
await app.listen({ port, host: "0.0.0.0" });
