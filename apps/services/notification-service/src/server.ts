import Fastify from "fastify";
import { buildLogger, setupMetrics } from "@smartlogistics/shared-middleware";
import { Queue } from "bullmq";
import { startEmailWorker } from "./workers/email.worker.js";
import { startNotificationTriggerConsumer } from "./consumers/notification-trigger.consumer.js";
import { prisma } from "./db.js";

const app = Fastify({ logger: buildLogger("notification-service") });
setupMetrics(app, "notification-service");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = { connection: { url: redisUrl } };

const emailQueue = new Queue("email", connection);
const smsQueue = new Queue("sms", connection);
const pushQueue = new Queue("push", connection);
const webhookQueue = new Queue("webhook", connection);
startEmailWorker();

app.get("/health", async () => ({ ok: true, service: "notification-service" }));

app.get("/:id", async (request) => {
  const { id } = request.params as { id: string };
  const row = await prisma.notificationLog.findFirst({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
    select: { status: true }
  });
  return { id, status: row?.status ?? "queued" };
});

app.post("/retry/:id", async (request) => {
  const { id } = request.params as { id: string };
  await emailQueue.add("retry-email", { id });
  await smsQueue.add("retry-sms", { id });
  await pushQueue.add("retry-push", { id });
  await webhookQueue.add("retry-webhook", { id });
  await prisma.notificationLog.createMany({
    data: ["email", "sms", "push", "webhook"].map((channel) => ({
      id: crypto.randomUUID(),
      eventId: id,
      channel,
      recipient: "unknown",
      status: "queued"
    }))
  });
  return { ok: true };
});

const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 4007);

// Event-driven: when a notification.trigger event arrives, enqueue the email
// side-effect on BullMQ and record the notification as queued.
void startNotificationTriggerConsumer(async ({ event }) => {
  const eventId = event?.eventId ?? crypto.randomUUID();
  const recipient = String(event?.payload?.recipient ?? "ops@smartlogistics.example");
  await emailQueue.add("dispatch-notification", { eventId, recipient });
  await prisma.notificationLog.create({
    data: { id: crypto.randomUUID(), eventId, channel: "email", recipient, status: "queued" }
  });
});

await app.listen({ port, host: "0.0.0.0" });
