import { Kafka, logLevel, type Producer, type Consumer } from "kafkajs";

export type KafkaClientOptions = {
  /** Max connection retries before giving up (default 5). Keep low for fast-fail in dev. */
  retries?: number;
  /**
   * Called when the consumer runner crashes. Return `false` to stop the restart
   * loop (e.g. broker permanently unreachable) instead of retrying forever.
   */
  restartOnFailure?: (err: Error) => Promise<boolean>;
};

export function createKafkaClient(clientId: string, brokers: string[], opts: KafkaClientOptions = {}) {
  return new Kafka({
    clientId,
    brokers,
    // Only surface real errors; suppress kafkajs's verbose per-attempt warnings.
    logLevel: logLevel.ERROR,
    retry: { retries: opts.retries ?? 5, initialRetryTime: 300, maxRetryTime: 30_000 },
    ...(opts.restartOnFailure ? { restartOnFailure: opts.restartOnFailure } : {})
  });
}

export async function createProducer(clientId: string, brokers: string[]): Promise<Producer> {
  const kafka = createKafkaClient(clientId, brokers, { retries: 3 });
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

export async function createConsumer(
  clientId: string,
  brokers: string[],
  groupId: string,
  opts: KafkaClientOptions = {}
): Promise<Consumer> {
  const kafka = createKafkaClient(clientId, brokers, opts);
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}
