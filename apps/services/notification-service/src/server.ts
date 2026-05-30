import Fastify from "fastify";
import { buildLogger, setupMetrics } from "@smartlogistics/shared-middleware";
import { Queue } from "bullmq";
import { startEmailWorker } from "./workers/email.worker.js";
import { startNotificationTriggerConsumer } from "./consumers/notification-trigger.consumer.js";
import { Pool } from "pg";

const app = Fastify({ logger: buildLogger("notification-service") });
setupMetrics(app, "notification-service");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = { connection: { url: redisUrl } };
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5437"}/notification_service`
});

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_log_v2 (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const emailQueue = new Queue("email", connection);
const smsQueue = new Queue("sms", connection);
const pushQueue = new Queue("push", connection);
const webhookQueue = new Queue("webhook", connection);
startEmailWorker();

app.get("/health", async () => ({ ok: true, service: "notification-service" }));

app.get("/:id", async (request) => {
  const { id } = request.params as { id: string };
  const row = (
    await pool.query(
      `SELECT status
       FROM notification_log_v2
       WHERE event_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    )
  ).rows[0];
  return { id, status: row?.status ?? "queued" };
});

app.post("/retry/:id", async (request) => {
  const { id } = request.params as { id: string };
  await emailQueue.add("retry-email", { id });
  await smsQueue.add("retry-sms", { id });
  await pushQueue.add("retry-push", { id });
  await webhookQueue.add("retry-webhook", { id });
  await pool.query(
    `INSERT INTO notification_log_v2 (id, event_id, channel, recipient, status)
     VALUES
      ($1,$2,$3,$4,$5),
      ($6,$7,$8,$9,$10),
      ($11,$12,$13,$14,$15),
      ($16,$17,$18,$19,$20)`,
    [
      crypto.randomUUID(), id, "email", "unknown", "queued",
      crypto.randomUUID(), id, "sms", "unknown", "queued",
      crypto.randomUUID(), id, "push", "unknown", "queued",
      crypto.randomUUID(), id, "webhook", "unknown", "queued"
    ]
  );
  return { ok: true };
});

const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 4007);
await ensureSchema();

// Event-driven: when a notification.trigger event arrives, enqueue the email
// side-effect on BullMQ and record the notification as queued.
void startNotificationTriggerConsumer(async ({ event }) => {
  const eventId = event?.eventId ?? crypto.randomUUID();
  const recipient = String(event?.payload?.recipient ?? "ops@smartlogistics.example");
  await emailQueue.add("dispatch-notification", { eventId, recipient });
  await pool.query(
    `INSERT INTO notification_log_v2 (id, event_id, channel, recipient, status)
     VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), eventId, "email", recipient, "queued"]
  );
});

await app.listen({ port, host: "0.0.0.0" });
