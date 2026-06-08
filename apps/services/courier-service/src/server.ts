import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { courierCode } from "@smartlogistics/shared-types";
import { prisma } from "./db.js";

const app = Fastify({ logger: buildLogger("courier-service") });
setupMetrics(app, "courier-service");

app.get("/health", async () => ({ ok: true, service: "courier-service" }));

app.post("/", async (request) => {
  const payload = z.object({ userId: z.string().uuid(), name: z.string() }).parse(request.body);
  const created = {
    id: crypto.randomUUID(),
    code: courierCode(Math.floor(Math.random() * 9000)),
    userId: payload.userId,
    name: payload.name,
    city: "Karachi",
    zone: "Unassigned",
    status: "available",
    load: 0,
    capacity: 10,
    rating: 5,
    since: "2026",
    attempts: 0,
    delivered: 0
  };
  await prisma.courierRecord.create({ data: created });
  return created;
});

app.get("/", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const items = await prisma.courierRecord.findMany({
    where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      code: true,
      name: true,
      city: true,
      zone: true,
      status: true,
      load: true,
      capacity: true,
      rating: true,
      since: true,
      attempts: true,
      delivered: true
    }
  });
  return { items };
});
app.patch("/:id/status", async () => ({ ok: true }));
app.patch("/:id/availability", async () => ({ ok: true }));
app.post("/assign", async () => ({ ok: true }));
app.get("/:id/performance", async () => ({ deliveryRate: 0 }));

const port = Number(process.env.COURIER_SERVICE_PORT ?? 4004);
await app.listen({ port, host: "0.0.0.0" });
