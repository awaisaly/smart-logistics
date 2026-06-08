import React from "react";
import { fetchJson, withRange } from "@/lib/api";
import { toNumber, formatTime } from "@/lib/format";
import { useDateRange } from "@/lib/date-range";
import {
  PageCard,
  PrototypePill,
  PrototypeKpi,
  Table,
  SkeletonBlock,
  PageHeader,
  PageBody,
  DateRangeFilter,
} from "@/components";

export function ObservabilityPage(): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [kpis, setKpis] = React.useState<Record<string, unknown>>({});
  const [services, setServices] = React.useState<Array<Record<string, unknown>>>([]);
  const [traces, setTraces] = React.useState<Array<Record<string, unknown>>>([]);
  const [alerts, setAlerts] = React.useState<Array<Record<string, unknown>>>([]);
  const [budgets, setBudgets] = React.useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = React.useState<Record<string, unknown> | null>(null);
  const { from, to } = useDateRange();

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      fetchJson<Record<string, unknown>>("/analytics/observability/kpis"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/analytics/observability/services"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/analytics/observability/traces", { from, to })),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/analytics/observability/alerts"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/analytics/observability/error-budgets"),
    ])
      .then(([k, s, t, a, b]) => {
        if (!alive) return;
        setKpis(k ?? {});
        setServices(s.items ?? []);
        setTraces(t.items ?? []);
        setAlerts(a.items ?? []);
        setBudgets(b.items ?? []);
        if ((t.items ?? []).length > 0) setSelected(t.items![0]!);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  return (
    <>
      <PageHeader title="Observability" sub="Jaeger · Prometheus · OpenTelemetry" actions={<DateRangeFilter />} />
      <PageBody>
        {loading ? (
          <SkeletonBlock h={320} />
        ) : (
          <>
            <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
              <PrototypeKpi label="p50 latency" value={`${kpis.p50LatencyMs ?? 0}ms`} delta="live" tone="ok" />
              <PrototypeKpi label="p95 latency" value={`${kpis.p95LatencyMs ?? 0}ms`} delta="live" tone="warn" />
              <PrototypeKpi label="Error rate" value={`${kpis.errorRatePct ?? 0}%`} delta="live" tone="warn" />
              <PrototypeKpi label="Active alerts" value={String(kpis.activeAlerts ?? 0)} delta="live" tone="err" />
            </div>

            <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
              <PageCard title="Services" sub="health · p95 · error rate" style={{ gridColumn: "span 5" }} padding={0} bodyStyle={{ padding: 0 }}>
                <Table
                  dense
                  rows={services}
                  columns={[
                    { key: "service", label: "Service", mono: true, render: (r) => <span style={{ fontWeight: 500, color: "var(--ink)" }}>{String(r.service ?? "")}</span> },
                    { key: "p95", label: "p95", align: "right", mono: true, render: (r) => <span style={{ color: "var(--mute)" }}>{toNumber(r.p95)}ms</span> },
                    { key: "errorRate", label: "Err", align: "right", mono: true, render: (r) => <span style={{ color: toNumber(r.errorRate) > 2 ? "var(--err)" : "var(--mute)" }}>{toNumber(r.errorRate)}%</span> },
                  ]}
                />
              </PageCard>
              <PageCard title="Recent traces" sub="latest endpoint spans" style={{ gridColumn: "span 7" }} padding={0} bodyStyle={{ padding: 0 }}>
                <Table
                  dense
                  idKey="id"
                  selectedId={String(selected?.id ?? "")}
                  onRowClick={(r) => setSelected(r)}
                  rows={traces}
                  columns={[
                    { key: "ts", label: "When", mono: true, render: (r) => <span style={{ color: "var(--mute)" }}>{formatTime(r.ts)}</span> },
                    { key: "id", label: "Trace ID", mono: true, render: (r) => <span style={{ color: "var(--info)" }}>{String(r.id ?? "")}</span> },
                    { key: "span", label: "Endpoint", mono: true },
                    { key: "latencyMs", label: "Duration", align: "right", mono: true, render: (r) => <span style={{ color: toNumber(r.latencyMs) > 500 ? "var(--err)" : "var(--ink-2)" }}>{toNumber(r.latencyMs)}ms</span> },
                    { key: "status", label: "Status", render: (r) => <PrototypePill tone={r.status === "ok" ? "ok" : "err"} size="sm">{String(r.status ?? "")}</PrototypePill> },
                  ]}
                />
              </PageCard>
            </div>

            {selected && (
              <PageCard title="Trace inspector" sub={`${String(selected.span ?? selected.endpoint ?? "")} · ${toNumber(selected.latencyMs)}ms`}>
                <div style={{ fontSize: 11.5, color: "var(--mute)" }}>
                  Trace <span className="mono" style={{ color: "var(--info)" }}>{String(selected.id ?? "")}</span> · service {String(selected.service ?? "")}
                </div>
              </PageCard>
            )}

            <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
              <PageCard title="Active alerts" sub={`${alerts.length} firing`} style={{ gridColumn: "span 6" }} padding={0} bodyStyle={{ padding: 0 }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ padding: "11px 14px", borderBottom: i < alerts.length - 1 ? "0.5px solid var(--line)" : "none", display: "flex", gap: 10, alignItems: "center" }}>
                    <PrototypePill tone={a.severity === "high" ? "err" : "warn"} size="sm">{String(a.severity ?? "")}</PrototypePill>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--ink)" }}>{String(a.title ?? "")}</div>
                      <div style={{ fontSize: 11, color: "var(--mute)" }}>{String(a.service ?? "")} · since {String(a.since ?? "")}</div>
                    </div>
                  </div>
                ))}
              </PageCard>
              <PageCard title="Error budget · this week" sub="SLO targets · per service" style={{ gridColumn: "span 6" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {budgets.map((b) => {
                    const current = toNumber(b.budgetPct);
                    return (
                      <div key={String(b.service)}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                          <span className="mono" style={{ color: "var(--ink)" }}>{String(b.service ?? "")}</span>
                          <span className="mono" style={{ color: current >= 80 ? "var(--ok)" : "var(--err)" }}>{current}%</span>
                        </div>
                        <div style={{ height: 4, background: "var(--bg-warm)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, current)}%`, height: "100%", background: current >= 80 ? "var(--ok)" : "var(--err)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PageCard>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
