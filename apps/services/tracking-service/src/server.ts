import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, rangeFilter } from "@smartlogistics/shared-middleware";
import { MongoClient } from "mongodb";
import { startTrackingConsumers } from "./consumers/tracking.consumer.js";

const app = Fastify({ logger: buildLogger("tracking-service") });
setupMetrics(app, "tracking-service");
const mongoUri =
  process.env.MONGO_URL ??
  `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME ?? "smartlogistics"}:${process.env.MONGO_INITDB_ROOT_PASSWORD ?? "smartlogistics"}@${process.env.MONGO_HOST ?? "localhost"}:${process.env.MONGO_PORT ?? "27018"}`;
const mongoClient = new MongoClient(mongoUri);
const db = mongoClient.db(process.env.TRACKING_MONGO_DB ?? "tracking_service");
const eventsCol = db.collection("events");
const topicsCol = db.collection("topics");
const consumersCol = db.collection("consumers");
const queuesCol = db.collection("queues");
const dlqMessagesCol = db.collection("dlq_messages");
const dlqReplaysCol = db.collection("dlq_replays");

const trackingEventSchema = z.object({
  eventId: z.string(),
  shipmentId: z.string(),
  milestone: z.string(),
  occurredAt: z.string()
});

app.get("/health", async () => ({ ok: true, service: "tracking-service" }));
app.get("/events/recent", async (request) => ({
  items: await eventsCol
    .find(rangeFilter(request.query as { from?: string; to?: string }), { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray()
}));
app.get("/topics", async () => ({
  items: await topicsCol.find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray()
}));
app.get("/consumers", async () => ({
  items: await consumersCol.find({}, { projection: { _id: 0 } }).sort({ group: 1 }).toArray()
}));
app.get("/queues/celery", async () => ({
  items: await queuesCol.find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray()
}));
app.get("/dlq/messages", async (request) => ({
  items: await dlqMessagesCol
    .find(rangeFilter(request.query as { from?: string; to?: string }), { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(200)
    .toArray()
}));
app.get("/dlq/replays", async (request) => ({
  items: await dlqReplaysCol
    .find(rangeFilter(request.query as { from?: string; to?: string }), { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(200)
    .toArray()
}));
app.get("/events/kpis", async () => {
  const topics = await topicsCol.find({}, { projection: { _id: 0 } }).toArray();
  const consumers = await consumersCol.find({}, { projection: { _id: 0 } }).toArray();
  const celeryQueues = await queuesCol.find({}, { projection: { _id: 0 } }).toArray();
  const totalThroughput = topics.reduce((sum, t) => sum + (t.msg_s ?? 0), 0);
  const totalLag = topics.reduce((sum, t) => sum + (t.lag ?? 0), 0);
  const totalPods = consumers.reduce((sum, c) => sum + (c.pods ?? 0), 0);
  const maxLag = Math.max(...consumers.map((c) => c.lag ?? 0), 0);
  const pendingTasks = celeryQueues.reduce((sum, q) => sum + (q.pending ?? 0), 0);
  const activeTasks = celeryQueues.reduce((sum, q) => sum + (q.active ?? 0), 0);
  const failed24h = celeryQueues.reduce((sum, q) => sum + (q.failed24h ?? 0), 0);
  return {
    totalThroughput: Number(totalThroughput.toFixed(1)),
    topicCount: topics.length,
    totalLag,
    schemaVersions: 17,
    consumerGroups: consumers.length,
    totalPods,
    maxLag,
    rebalances1h: 0,
    queueCount: celeryQueues.length,
    pendingTasks,
    activeTasks,
    failed24h
  };
});

app.post("/events", async (request) => {
  const payload = trackingEventSchema.parse(request.body);
  await eventsCol.insertOne({
    t: new Date(payload.occurredAt).toLocaleTimeString("en-US", { hour12: false }),
    topic: "tracking.milestone.updated",
    key: payload.shipmentId,
    payload: payload.milestone,
    lag: "0ms",
    created_at: new Date()
  });
  return { ok: true, ...payload };
});

app.get("/:shipmentId", async (request) => {
  const { shipmentId } = request.params as { shipmentId: string };
  return { shipmentId, events: [] };
});

app.get("/:shipmentId/live", async (request) => {
  const { shipmentId } = request.params as { shipmentId: string };
  return { shipmentId, status: "IN_TRANSIT" };
});

const port = Number(process.env.TRACKING_SERVICE_PORT ?? 4006);
await mongoClient.connect();

// Event-driven: record a tracking milestone for every lifecycle event the
// platform publishes. Independent consumer group, best-effort startup.
void startTrackingConsumers(async ({ topic, event }) => {
  const shipmentId = event?.entityId ?? String(event?.payload?.shipmentId ?? "unknown");
  await eventsCol.insertOne({
    t: new Date().toLocaleTimeString("en-US", { hour12: false }),
    topic,
    key: shipmentId,
    payload: String(event?.payload?.milestone ?? topic),
    lag: "0ms",
    created_at: new Date()
  });
});

await app.listen({ port, host: "0.0.0.0" });
