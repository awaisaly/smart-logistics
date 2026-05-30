import { startConsumer, type ConsumerMessage } from "@smartlogistics/shared-events";

/**
 * Subscribes to notification-trigger events and hands each to the provided
 * handler (e.g. enqueue a delivery job + write the notification log). Runs as
 * its own consumer group so it can't block user-facing traffic.
 */
export async function startNotificationTriggerConsumer(
  onEvent: (message: ConsumerMessage) => Promise<void>
): Promise<void> {
  await startConsumer({
    clientId: "notification-service",
    brokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(","),
    groupId: "notification-trigger-group",
    topics: ["notification.trigger"],
    eachMessage: onEvent
  });
}
