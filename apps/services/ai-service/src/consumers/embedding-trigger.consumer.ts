import { startConsumer, type ConsumerMessage } from "@smartlogistics/shared-events";

/**
 * Subscribes to the embedding-trigger topic so operational changes can be
 * indexed for retrieval. The handler is provided by the caller (the assistant
 * currently answers via live tool-calling; this is the indexing hook).
 */
export async function startEmbeddingTriggerConsumer(
  onEvent: (message: ConsumerMessage) => Promise<void>
): Promise<void> {
  await startConsumer({
    clientId: "ai-service",
    brokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(","),
    groupId: "ai-embedding-trigger-group",
    topics: ["ai.embedding.trigger"],
    eachMessage: onEvent
  });
}
