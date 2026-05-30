import pino from "pino";

export function buildLogger(service: string) {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service }
  });
}
