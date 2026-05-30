import { startConsumer, type ConsumerMessage } from "@smartlogistics/shared-events";

/**
 * Subscribes to analytics events and processes each via the provided handler
 * (e.g. incrementing operational counters). Independent consumer group.
 */
export async function startAnalyticsConsumer(
  onEvent: (message: ConsumerMessage) => Promise<void>
): Promise<void> {
  await startConsumer({
    clientId: "analytics-service",
    brokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(","),
    groupId: "analytics-event-group",
    topics: ["analytics.event"],
    eachMessage: onEvent
  });
}
