import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, parseRange } from "@smartlogistics/shared-middleware";
import { Pool } from "pg";

const app = Fastify({ logger: buildLogger("warehouse-service") });
setupMetrics(app, "warehouse-service");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5434"}/warehouse_service`
});

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouse_records (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      name TEXT NOT NULL,
      util DOUBLE PRECISION NOT NULL DEFAULT 0,
      lanes INTEGER NOT NULL DEFAULT 0,
      inbound INTEGER NOT NULL DEFAULT 0,
      outbound INTEGER NOT NULL DEFAULT 0,
      throughput TEXT NOT NULL DEFAULT '0%',
      stock_low INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS warehouse_lane_occupancy (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      lane_index INTEGER NOT NULL,
      occupancy_pct INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS warehouse_stock_items (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      on_hand INTEGER NOT NULL DEFAULT 0,
      reserved INTEGER NOT NULL DEFAULT 0,
      threshold_value INTEGER NOT NULL DEFAULT 0,
      hot BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

app.get("/health", async () => ({ ok: true, service: "warehouse-service" }));

app.post("/", async (request) => {
  const payload = z.object({ name: z.string(), city: z.string() }).parse(request.body);
  const created = { id: `WH-${Math.floor(1000 + Math.random() * 9000)}`, ...payload, util: 0.2, lanes: 8, inbound: 0, outbound: 0, throughput: "0%", stockLow: 0 };
  await pool.query(
    `INSERT INTO warehouse_records (id, city, name, util, lanes, inbound, outbound, throughput, stock_low)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [created.id, created.city, created.name, created.util, created.lanes, created.inbound, created.outbound, created.throughput, created.stockLow]
  );
  return created;
});

app.get("/", async (request) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  const { rows } = await pool.query(
    `SELECT id, city, name, util, lanes, inbound, outbound, throughput, stock_low AS "stockLow"
     FROM warehouse_records
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [from, to]
  );
  return { items: rows };
});
app.patch("/:id", async () => ({ ok: true }));
app.get("/:id/inventory", async () => ({ items: [] }));
app.get("/:id/lanes", async (request) => {
  const { id } = request.params as { id: string };
  const { rows } = await pool.query(
    `SELECT occupancy_pct
     FROM warehouse_lane_occupancy
     WHERE warehouse_id = $1
     ORDER BY lane_index ASC`,
    [id]
  );
  return { items: rows.map((r: { occupancy_pct: number | string }) => Number(r.occupancy_pct)) };
});
app.get("/:id/stock", async (request) => {
  const { id } = request.params as { id: string };
  const { rows } = await pool.query(
    `SELECT sku, name, on_hand AS "on", reserved, threshold_value AS threshold, hot
     FROM warehouse_stock_items
     WHERE warehouse_id = $1
     ORDER BY created_at DESC`,
    [id]
  );
  return { items: rows };
});

app.post("/inventory/reserve", async () => ({ ok: true, reservationId: crypto.randomUUID() }));
app.post("/inventory/release", async () => ({ ok: true }));
app.post("/inventory/adjust", async () => ({ ok: true }));

const port = Number(process.env.WAREHOUSE_SERVICE_PORT ?? 4003);
await ensureSchema();
await app.listen({ port, host: "0.0.0.0" });
