# Observability Runbook

## Components

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`
- Jaeger: `http://localhost:16686`
- Temporal UI: `http://localhost:8080`

## Metrics (wired)

Every service and the API gateway expose Prometheus metrics at `GET /metrics`
via the shared `setupMetrics()` middleware. Prometheus scrapes each target
listed in `infra/prometheus/prometheus.yml`.

Exposed metrics include:

- `http_requests_total{method,route,status_code}` — request counter per route.
- `http_request_duration_seconds{...}` — request latency histogram.
- Default Node process metrics (CPU, memory, event loop lag, GC).
- Domain counters off the event bus:
  - `analytics_events_processed_total` (analytics-service)
  - `ai_embedding_triggers_total` (ai-service)

Quick check:

```bash
curl http://localhost:4002/metrics   # shipment-service
curl http://localhost:4005/metrics   # dispatch-service
```

## Tracing (scoped)

Jaeger is provisioned and a telemetry bootstrap hook exists, but **OpenTelemetry
trace export is not yet wired into the services** — there is no OTLP exporter
configured today. Distributed traces are a known follow-up; metrics above are
the current source of cross-service signal.

## Logs

Services log structured JSON through Pino with service-level metadata
(`service` field) and a propagated `x-request-id` for correlation.
