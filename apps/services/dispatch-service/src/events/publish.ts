import { buildEvent, publishToTopics, topics } from "@smartlogistics/shared-events";

const brokers = () => (process.env.KAFKA_BROKERS ?? "kafka:9092").split(",");

/**
 * On dispatch completion, fan the change out to three independent consumer
 * groups over Kafka: tracking (records a milestone), analytics (counts the
 * event), and notification (queues a customer update). Returns `false` if the
 * broker is unreachable so the caller can fall back.
 */
export async function publishDispatchCompleted(shipmentId: string): Promise<boolean> {
  const event = buildEvent("dispatch-service", shipmentId, { shipmentId, milestone: "dispatched" });
  return publishToTopics("dispatch-service", brokers(), [
    { topic: topics.SHIPMENT_DISPATCHED, key: shipmentId, event },
    { topic: topics.ANALYTICS_EVENT, key: shipmentId, event },
    { topic: topics.NOTIFICATION_TRIGGER, key: shipmentId, event }
  ]);
}
