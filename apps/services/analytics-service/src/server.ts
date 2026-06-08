import Fastify from "fastify";
import { buildLogger, setupMetrics, counter, parseRange } from "@smartlogistics/shared-middleware";
import { prisma, shipmentDb } from "./db.js";
import { startAnalyticsConsumer } from "./consumers/analytics.consumer.js";

const app = Fastify({ logger: buildLogger("analytics-service") });
setupMetrics(app, "analytics-service");

const readSnapshot = async <T>(kind: string, fallback: T): Promise<T> => {
  const row = await prisma.analyticsSnapshot.findUnique({ where: { kind }, select: { payload: true } });
  return (row?.payload as T) ?? fallback;
};

const rangeOf = (request: { query: unknown }) => {
  const { from, to } = parseRange(request.query as { from?: string; to?: string });
  return { from: new Date(from), to: new Date(to) };
};

app.get("/health", async () => ({ ok: true, service: "analytics-service" }));

app.get("/kpis/overview", async (request) => {
  const { from, to } = rangeOf(request);
  const rows = await shipmentDb.shipmentRecord.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { status: true, transitMinutes: true }
  });
  const total = rows.length;
  const delivered = rows.filter((r) => r.status === "delivered").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const returned = rows.filter((r) => r.status === "returned").length;
  const transit = rows
    .map((r) => Number(r.transitMinutes))
    .filter((n) => Number.isFinite(n) && n > 0);
  const avgDeliveryTime = transit.length > 0 ? Math.round(transit.reduce((a, b) => a + b, 0) / transit.length) : 0;
  const returnRate = total > 0 ? Number(((returned / total) * 100).toFixed(1)) : 0;
  // Courier utilization / warehouse throughput are current-state operational
  // gauges (no per-shipment timestamp), so they keep coming from the snapshot.
  const snap = await readSnapshot<Record<string, unknown>>("kpis_overview", {});
  return {
    shipments: total,
    dispatched: total,
    delivered,
    failed,
    avgDeliveryTime,
    courierUtilization: Number(snap.courierUtilization ?? 0),
    warehouseThroughput: Number(snap.warehouseThroughput ?? 0),
    returnRate,
    deltas: (snap.deltas as Record<string, unknown>) ?? {},
    trends: (snap.trends as Record<string, unknown>) ?? {}
  };
});

app.get("/shipments/timeseries", async (request) => {
  const { from, to } = rangeOf(request);
  const rows = await shipmentDb.$queryRaw<Array<{ h: string; dispatched: number; delivered: number; failed: number }>>`
    SELECT to_char(created_at, 'MM-DD') AS h,
           COUNT(*)::int AS dispatched,
           COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM shipment_records
    WHERE created_at >= ${from} AND created_at <= ${to}
    GROUP BY h
    ORDER BY MIN(created_at) ASC`;
  return { points: rows };
});

app.get("/shipments/histogram", async (request) => {
  const { from, to } = rangeOf(request);
  const rows = await shipmentDb.$queryRaw<Array<{ bucket_idx: number; count: number }>>`
    SELECT LEAST(FLOOR(transit_minutes / 120.0)::int, 11) AS bucket_idx, COUNT(*)::int AS count
    FROM shipment_records
    WHERE created_at >= ${from} AND created_at <= ${to} AND transit_minutes > 0
    GROUP BY bucket_idx`;
  const counts = new Map<number, number>(rows.map((r) => [Number(r.bucket_idx), Number(r.count)]));
  // Render all 12 two-hour buckets (0-2h … 22h+) so the distribution shape is stable.
  const points = Array.from({ length: 12 }).map((_, i) => ({
    bucket: i === 11 ? "22h+" : `${i * 2}-${i * 2 + 2}h`,
    count: counts.get(i) ?? 0
  }));
  return { points };
});

app.get("/regions/volume", async (request) => {
  const { from, to } = rangeOf(request);
  const rows = await shipmentDb.$queryRaw<Array<{ name: string; volume: number }>>`
    SELECT split_part(to_code, '-', 1) AS name, COUNT(*)::int AS volume
    FROM shipment_records
    WHERE created_at >= ${from} AND created_at <= ${to}
    GROUP BY name
    ORDER BY volume DESC
    LIMIT 12`;
  return { items: rows.map((r) => ({ name: r.name, region: r.name, volume: Number(r.volume) })) };
});

app.get("/sla/breakdown", async (request) => {
  const { from, to } = rangeOf(request);
  const rows = await shipmentDb.$queryRaw<Array<{ on_time: number; at_risk: number; breach: number }>>`
    SELECT
      COUNT(*) FILTER (WHERE risk < 0.4)::int AS on_time,
      COUNT(*) FILTER (WHERE risk >= 0.4 AND risk < 0.7)::int AS at_risk,
      COUNT(*) FILTER (WHERE risk >= 0.7)::int AS breach
    FROM shipment_records
    WHERE created_at >= ${from} AND created_at <= ${to}`;
  const row = rows[0];
  return {
    items: [
      { bucket: "On time", onTime: Number(row?.on_time ?? 0) },
      { bucket: "At risk", onTime: Number(row?.at_risk ?? 0) },
      { bucket: "Breach", onTime: Number(row?.breach ?? 0) }
    ]
  };
});

app.get("/exceptions/zones", async (request) => {
  const { from, to } = rangeOf(request);
  const rows = await shipmentDb.$queryRaw<Array<{ zone: string; count: number }>>`
    SELECT kind AS zone, COUNT(*)::int AS count
    FROM shipment_exceptions
    WHERE created_at >= ${from} AND created_at <= ${to}
    GROUP BY kind
    ORDER BY count DESC
    LIMIT 8`;
  return { items: rows.map((r) => ({ zone: r.zone, count: Number(r.count) })) };
});

// Current-state snapshots (no per-event timestamp to filter on).
app.get("/couriers/utilization", async () => ({ points: await readSnapshot("couriers_utilization", []) }));
app.get("/warehouses/throughput", async () => ({ points: await readSnapshot("warehouses_throughput", []) }));
app.get("/failures/regions", async () => ({ points: await readSnapshot("failures_regions", []) }));
app.get("/shipments/volume-trend", async () => ({ points: await readSnapshot("shipments_volume_trend", []) }));
app.get("/observability/services", async () => ({ items: await readSnapshot("observability_services", []) }));
app.get("/observability/kpis", async () =>
  readSnapshot("observability_kpis", {
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    errorRatePct: 0,
    activeAlerts: 0,
    trends: { p50LatencyMs: [], p95LatencyMs: [], errorRatePct: [] }
  })
);
app.get("/observability/traces", async (request) => {
  const { from, to } = rangeOf(request);
  const items = await readSnapshot<Array<Record<string, unknown>>>("observability_traces", []);
  const lo = new Date(from).getTime();
  const hi = new Date(to).getTime();
  // Traces carry an embedded `ts`; filter by it when present, otherwise pass through.
  const filtered = items.filter((it) => {
    const ts = it.ts ? new Date(String(it.ts)).getTime() : NaN;
    return Number.isNaN(ts) ? true : ts >= lo && ts <= hi;
  });
  return { items: filtered };
});
app.get("/observability/alerts", async () => ({ items: await readSnapshot("observability_alerts", []) }));
app.get("/observability/error-budgets", async () => ({ items: await readSnapshot("observability_error_budgets", []) }));

const port = Number(process.env.ANALYTICS_SERVICE_PORT ?? 4008);

// Event-driven: count analytics events as they flow through the bus. Exposed
// at /metrics for Prometheus.
const analyticsEvents = counter("analytics_events_processed_total", "Analytics events processed");
void startAnalyticsConsumer(async () => {
  analyticsEvents.inc();
});

await app.listen({ port, host: "0.0.0.0" });
