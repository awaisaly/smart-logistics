import { buildEvent, publishToTopics, topics } from "@smartlogistics/shared-events";

const brokers = () => (process.env.KAFKA_BROKERS ?? "kafka:9092").split(",");

export async function publishDispatchCompleted(shipmentId: string): Promise<boolean> {
  const event = buildEvent("temporal-service", shipmentId, { shipmentId, milestone: "dispatched" });
  return publishToTopics("temporal-service", brokers(), [
    { topic: topics.SHIPMENT_DISPATCHED, key: shipmentId, event },
    { topic: topics.ANALYTICS_EVENT, key: shipmentId, event },
    { topic: topics.NOTIFICATION_TRIGGER, key: shipmentId, event }
  ]);
}
