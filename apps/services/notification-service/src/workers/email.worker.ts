import { Worker } from "bullmq";

export function startEmailWorker(): Worker {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Worker(
    "email",
    async (job) => {
      return { sent: true, channel: "email", id: job.id };
    },
    {
      connection: { url: redisUrl }
    }
  );
}
