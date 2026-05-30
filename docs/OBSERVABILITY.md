# Observability Runbook

## Components

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`
- Jaeger: `http://localhost:16686`

## Tracing

All services use shared telemetry bootstrap and emit traces with `service.name`.

## Metrics

Prometheus scrapes all service endpoints listed in `infra/prometheus/prometheus.yml`.

## Logs

Services log structured JSON through Pino with service-level metadata.
