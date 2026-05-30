import { z } from "zod";

const serviceEnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MONGO_URL: z.string().optional(),
  KAFKA_BROKERS: z.string().default("kafka:9092"),
  SCHEMA_REGISTRY_URL: z.string().default("http://schema-registry:8081"),
  TEMPORAL_ADDRESS: z.string().default("temporal:7233"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://jaeger:4318")
});

export type ServiceEnv = z.infer<typeof serviceEnvSchema>;

export function parseServiceEnv(env: NodeJS.ProcessEnv): ServiceEnv {
  return serviceEnvSchema.parse(env);
}
