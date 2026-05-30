import client from "prom-client";
import type { FastifyInstance } from "fastify";

// Accept any Fastify instance regardless of its concrete logger/server generics
// (services construct theirs with a pino logger, which narrows the type).
type AnyFastify = FastifyInstance<any, any, any, any, any>;

let defaultsCollected = false;

/**
 * Wire Prometheus metrics into a Fastify service:
 * - default process metrics (CPU, memory, event loop, GC),
 * - per-request `http_requests_total` + `http_request_duration_seconds`,
 * - a `GET /metrics` scrape endpoint.
 *
 * Uses the shared default registry so domain counters created via `counter()`
 * are exposed on the same endpoint.
 */
export function setupMetrics(app: AnyFastify, serviceName: string): void {
  client.register.setDefaultLabels({ service: serviceName });
  if (!defaultsCollected) {
    client.collectDefaultMetrics();
    defaultsCollected = true;
  }

  const httpTotal = counter("http_requests_total", "Total HTTP requests", [
    "method",
    "route",
    "status_code"
  ]);
  const httpDuration = histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "route", "status_code"],
    [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
  );

  app.addHook("onResponse", async (request, reply) => {
    const r = request as unknown as { routeOptions?: { url?: string }; routerPath?: string; url: string };
    const route = r.routeOptions?.url ?? r.routerPath ?? r.url ?? "unknown";
    if (route === "/metrics") return;
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };
    httpTotal.inc(labels);
    httpDuration.observe(labels, (reply.elapsedTime ?? 0) / 1000);
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", client.register.contentType);
    return client.register.metrics();
  });
}

/** Get-or-create a Counter on the shared registry (safe across imports). */
export function counter(name: string, help: string, labelNames: string[] = []): client.Counter<string> {
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing as client.Counter<string>;
  return new client.Counter({ name, help, labelNames });
}

/** Get-or-create a Histogram on the shared registry. */
export function histogram(
  name: string,
  help: string,
  labelNames: string[] = [],
  buckets?: number[]
): client.Histogram<string> {
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing as client.Histogram<string>;
  return new client.Histogram({ name, help, labelNames, buckets });
}
