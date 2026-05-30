export function initTelemetry(serviceName: string): void {
  // Placeholder bootstrap for OpenTelemetry wiring.
  if (process.env.NODE_ENV !== "test") {
    process.stdout.write(`[telemetry] initialized for ${serviceName}\n`);
  }
}
