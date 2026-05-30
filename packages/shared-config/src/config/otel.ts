export type OtelConfig = {
  endpoint: string;
  serviceName: string;
};

export function getOtelConfig(env: NodeJS.ProcessEnv, serviceName: string): OtelConfig {
  return {
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://jaeger:4318",
    serviceName
  };
}
