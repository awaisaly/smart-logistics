export type KafkaConfig = {
  brokers: string[];
  clientId: string;
  schemaRegistryUrl: string;
};

export function getKafkaConfig(env: NodeJS.ProcessEnv): KafkaConfig {
  return {
    brokers: (env.KAFKA_BROKERS ?? "kafka:9092").split(","),
    clientId: env.KAFKA_CLIENT_ID ?? "smart-logistics",
    schemaRegistryUrl: env.SCHEMA_REGISTRY_URL ?? "http://schema-registry:8081"
  };
}
