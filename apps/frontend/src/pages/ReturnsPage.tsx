import React from "react";
import { fetchJson, withRange } from "@/lib/api";
import { toNumber } from "@/lib/format";
import { useDateRange } from "@/lib/date-range";
import {
  PageCard,
  PrototypePill,
  PrototypeKpi,
  Table,
  Segmented,
  SkeletonBlock,
  RmaStage,
  PageHeader,
  PageBody,
  DateRangeFilter,
} from "@/components";

export type ExceptionRow = { id?: string; code?: string; shipment?: string; kind?: string; severity?: string; age?: string; owner?: string };
export type ReturnRow = { id?: string; code?: string; shipment?: string; reason?: string; initiated?: string; stage?: string; customer?: string; refund?: string };
export type TaxonomyRow = { kind?: string; n?: number; pct?: number; tone?: string };

export function ReturnsPage(): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<"exceptions" | "returns">("exceptions");
  const [exceptions, setExceptions] = React.useState<ExceptionRow[]>([]);
  const [returns, setReturns] = React.useState<ReturnRow[]>([]);
  const [taxonomy, setTaxonomy] = React.useState<TaxonomyRow[]>([]);
  const [metrics, setMetrics] = React.useState<Record<string, unknown>>({});
  const { from, to } = useDateRange();

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const range = { from, to };
    void Promise.all([
      fetchJson<{ items?: ExceptionRow[] }>(withRange("/shipments/exceptions", range)),
      fetchJson<{ items?: ReturnRow[] }>(withRange("/shipments/returns", range)),
      fetchJson<{ items?: TaxonomyRow[] }>(withRange("/shipments/exceptions/taxonomy", range)),
      fetchJson<Record<string, unknown>>(withRange("/shipments/returns/metrics", range)),
    ])
      .then(([ex, ret, tax, met]) => {
        if (!alive) return;
        setExceptions(ex.items ?? []);
        setReturns(ret.items ?? []);
        setTaxonomy(tax.items ?? []);
        setMetrics(met ?? {});
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
      <PageHeader
        title="Returns & exceptions"
        sub="open queue · workflow-managed"
        actions={
          <>
            <DateRangeFilter />
            <Segmented
              options={[
                { value: "exceptions", label: "Exceptions" },
                { value: "returns", label: "Returns" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </>
        }
      />
      <PageBody>
        {loading ? (
          <SkeletonBlock h={280} />
        ) : (
          <>
            <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
              <PrototypeKpi label="Open exceptions" value={String(metrics.openExceptions ?? exceptions.length)} delta="live" tone="err" />
              <PrototypeKpi label="Active returns" value={String(metrics.activeReturns ?? returns.length)} delta="live" tone="warn" />
              <PrototypeKpi label="Refunded 24h" value={String(metrics.refunded24h ?? "Rs 0")} delta="live" tone="ink" />
              <PrototypeKpi label="Return rate" value={`${metrics.returnRatePct ?? 0}%`} delta="live" tone="ok" />
            </div>

            {tab === "exceptions" ? (
              <>
                <PageCard title="Exception queue" sub="grouped by severity · auto-assigned to owners" padding={0} bodyStyle={{ padding: 0 }}>
                  <Table<ExceptionRow>
                    idKey="id"
                    rows={exceptions}
                    columns={[
                      { key: "severity", label: "Severity", render: (r) => <PrototypePill tone={r.severity === "high" ? "err" : r.severity === "medium" ? "warn" : "neutral"}>{String(r.severity ?? "")}</PrototypePill> },
                      { key: "code", label: "ID", mono: true, render: (r) => <span style={{ color: "var(--info)" }}>{String(r.code ?? r.id ?? "")}</span> },
                      { key: "kind", label: "Kind", mono: true, render: (r) => <span style={{ color: "var(--err)" }}>{String(r.kind ?? "")}</span> },
                      { key: "shipment", label: "Shipment", mono: true },
                      { key: "owner", label: "Owner", mono: true, render: (r) => <span style={{ color: "var(--mute)" }}>{String(r.owner ?? "")}</span> },
                      { key: "age", label: "Age", align: "right", mono: true },
                    ]}
                  />
                </PageCard>
                <PageCard title="Reason taxonomy (24h)" sub="top causes · click to filter">
                  <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
                    {taxonomy.map((c) => (
                      <div key={String(c.kind)} style={{ padding: 12, background: "var(--bg-warm)", borderRadius: 8 }}>
                        <div className="mono" style={{ fontSize: 11, color: "var(--ink)" }}>{String(c.kind ?? "")}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em" }}>{toNumber(c.n)}</span>
                          <span style={{ fontSize: 11, color: "var(--mute)" }}>{toNumber(c.pct)}%</span>
                        </div>
                        <div style={{ marginTop: 6, height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, toNumber(c.pct) * 3)}%`, height: "100%", background: c.tone === "err" ? "var(--err)" : c.tone === "warn" ? "var(--warn)" : "var(--mute)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </PageCard>
              </>
            ) : (
              <PageCard title="Active returns" sub="RMA workflow · pickup → inspect → refund" padding={0} bodyStyle={{ padding: 0 }}>
                <Table<ReturnRow>
                  rows={returns}
                  columns={[
                    { key: "code", label: "RMA", mono: true, render: (r) => <span style={{ color: "var(--info)" }}>{String(r.code ?? r.id ?? "")}</span> },
                    { key: "shipment", label: "Shipment", mono: true },
                    { key: "customer", label: "Customer", render: (r) => <span style={{ color: "var(--ink)" }}>{String(r.customer ?? "")}</span> },
                    { key: "reason", label: "Reason" },
                    { key: "stage", label: "Stage", render: (r) => <RmaStage stage={String(r.stage ?? "")} /> },
                    { key: "refund", label: "Refund", align: "right", mono: true },
                    { key: "initiated", label: "Initiated", align: "right", mono: true, render: (r) => <span style={{ color: "var(--mute)" }}>{String(r.initiated ?? "")}</span> },
                  ]}
                />
              </PageCard>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
