import { startConsumer, type ConsumerMessage } from "@smartlogistics/shared-events";

/**
 * Subscribes to shipment/delivery lifecycle topics and processes each message
 * via the provided handler (e.g. persisting a tracking milestone). Runs as its
 * own consumer group, independent of the user-facing API.
 */
export async function startTrackingConsumers(
  onEvent: (message: ConsumerMessage) => Promise<void>
): Promise<void> {
  await startConsumer({
    clientId: "tracking-service",
    brokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(","),
    groupId: "tracking-events-group",
    topics: ["shipment.dispatched", "courier.status.updated", "delivery.completed", "delivery.failed"],
    eachMessage: onEvent
  });
}
