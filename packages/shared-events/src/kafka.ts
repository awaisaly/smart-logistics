import { Kafka, type Producer, type Consumer } from "kafkajs";

export function createKafkaClient(clientId: string, brokers: string[]) {
  return new Kafka({ clientId, brokers });
}

export async function createProducer(clientId: string, brokers: string[]): Promise<Producer> {
  const kafka = createKafkaClient(clientId, brokers);
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

export async function createConsumer(
  clientId: string,
  brokers: string[],
  groupId: string
): Promise<Consumer> {
  const kafka = createKafkaClient(clientId, brokers);
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}
