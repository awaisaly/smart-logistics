import { z } from "zod";

export const topics = {
  SHIPMENT_CREATED: "shipment.created",
  SHIPMENT_UPDATED: "shipment.updated",
  SHIPMENT_DISPATCHED: "shipment.dispatched",
  SHIPMENT_STATUS_UPDATED: "shipment.status.updated",
  COURIER_ASSIGNED: "courier.assigned",
  COURIER_STATUS_UPDATED: "courier.status.updated",
  TRACKING_MILESTONE_REACHED: "tracking.milestone.reached",
  DELIVERY_COMPLETED: "delivery.completed",
  DELIVERY_FAILED: "delivery.failed",
  RETURN_INITIATED: "return.initiated",
  WAREHOUSE_STOCK_UPDATED: "warehouse.stock.updated",
  NOTIFICATION_TRIGGER: "notification.trigger",
  ANALYTICS_EVENT: "analytics.event",
  AI_EMBEDDING_TRIGGER: "ai.embedding.trigger"
} as const;

export const baseEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  source: z.string(),
  entityId: z.string(),
  payload: z.record(z.unknown())
});

export type BaseEvent = z.infer<typeof baseEventSchema>;
export * from "./kafka.js";

import type { Consumer } from "kafkajs";
import { createConsumer, createProducer } from "./kafka.js";

/** Build a well-formed domain event envelope. */
export function buildEvent(
  source: string,
  entityId: string,
  payload: Record<string, unknown>
): BaseEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    entityId,
    payload
  };
}

/**
 * Fan a single domain change out to multiple topics with one producer.
 * Returns `false` (without throwing) if the broker is unreachable, so callers
 * can fall back gracefully instead of failing the originating request.
 */
export async function publishToTopics(
  clientId: string,
  brokers: string[],
  messages: Array<{ topic: string; key: string; event: BaseEvent }>
): Promise<boolean> {
  try {
    const producer = await createProducer(clientId, brokers);
    for (const m of messages) {
      await producer.send({ topic: m.topic, messages: [{ key: m.key, value: JSON.stringify(m.event) }] });
    }
    await producer.disconnect();
    return true;
  } catch (err) {
    console.error(`[kafka] publish from ${clientId} failed:`, (err as Error).message);
    return false;
  }
}

export type ConsumerMessage = { topic: string; event: BaseEvent | null; raw: string };

/**
 * Connect a consumer group, subscribe to `topics`, and actually *process*
 * messages via `eachMessage`. Parsing failures and handler errors are caught
 * and logged so one poison message can't crash the consumer. Broker outages
 * are swallowed (returns `null`) so a service still boots without Kafka.
 */
export async function startConsumer(opts: {
  clientId: string;
  brokers: string[];
  groupId: string;
  topics: string[];
  eachMessage: (message: ConsumerMessage) => Promise<void>;
}): Promise<Consumer | null> {
  try {
    const consumer = await createConsumer(opts.clientId, opts.brokers, opts.groupId);
    for (const topic of opts.topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString() ?? "";
        let event: BaseEvent | null = null;
        try {
          event = baseEventSchema.parse(JSON.parse(raw));
        } catch {
          event = null;
        }
        try {
          await opts.eachMessage({ topic, event, raw });
        } catch (err) {
          console.error(`[kafka] ${opts.groupId} failed to handle ${topic}:`, (err as Error).message);
        }
      }
    });
    return consumer;
  } catch (err) {
    console.error(`[kafka] consumer ${opts.groupId} could not start:`, (err as Error).message);
    return null;
  }
}
