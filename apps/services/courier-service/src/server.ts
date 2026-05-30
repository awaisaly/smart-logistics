import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { Pool } from "pg";

const app = Fastify({ logger: buildLogger("courier-service") });
setupMetrics(app, "courier-service");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5435"}/courier_service`
});

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courier_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Karachi',
      zone TEXT NOT NULL DEFAULT 'Unassigned',
      status TEXT NOT NULL DEFAULT 'available',
      load INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 10,
      rating DOUBLE PRECISION NOT NULL DEFAULT 5,
      since TEXT NOT NULL DEFAULT '2026',
      attempts INTEGER NOT NULL DEFAULT 0,
      delivered INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

app.get("/health", async () => ({ ok: true, service: "courier-service" }));

app.post("/", async (request) => {
  const payload = z.object({ userId: z.string(), name: z.string() }).parse(request.body);
  const created = {
    id: `C-${Math.floor(1000 + Math.random() * 9000)}`,
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
  await pool.query(
    `INSERT INTO courier_records (id, user_id, name, city, zone, status, load, capacity, rating, since, attempts, delivered)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [created.id, created.userId, created.name, created.city, created.zone, created.status, created.load, created.capacity, created.rating, created.since, created.attempts, created.delivered]
  );
  return created;
});

app.get("/", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const { rows } = await pool.query(
    `SELECT id, name, city, zone, status, load, capacity, rating, since, attempts, delivered
     FROM courier_records
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT 300`,
    [from, to]
  );
  return { items: rows };
});
app.patch("/:id/status", async () => ({ ok: true }));
app.patch("/:id/availability", async () => ({ ok: true }));
app.post("/assign", async () => ({ ok: true }));
app.get("/:id/performance", async () => ({ deliveryRate: 0 }));

const port = Number(process.env.COURIER_SERVICE_PORT ?? 4004);
await ensureSchema();
await app.listen({ port, host: "0.0.0.0" });
