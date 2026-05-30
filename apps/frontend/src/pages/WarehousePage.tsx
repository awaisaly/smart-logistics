import React from "react";
import { fetchJson, withRange } from "@/lib/api";
import { toNumber, formatCompact } from "@/lib/format";
import { useDateRange } from "@/lib/date-range";
import {
  PageCard,
  Icon,
  PrototypePill,
  PrototypeKpi,
  Table,
  Segmented,
  StatusPill,
  MiniStat,
  SkeletonBlock,
  FieldRow,
  LoadBar,
  BarChartSeries,
  SlaPie,
  RmaStage,
  LegendDot,
  ProgressRow,
  Sparkline,
  PageHeader,
  PageBody,
  PageShell,
  DateRangeFilter,
  type PillTone,
} from "@/components";

export type WarehouseRow = {
  id: string;
  city?: string;
  name?: string;
  util?: number;
  lanes?: number;
  inbound?: number;
  outbound?: number;
  throughput?: string;
  stockLow?: number;
};

export function WarehousePage(): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [warehouses, setWarehouses] = React.useState<WarehouseRow[]>([]);
  const [throughput, setThroughput] = React.useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [lanes, setLanes] = React.useState<number[]>([]);
  const [stock, setStock] = React.useState<Array<Record<string, unknown>>>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const { from, to } = useDateRange();

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const range = { from, to };
    void Promise.all([
      fetchJson<{ items?: WarehouseRow[] }>(withRange("/warehouses", range)),
      fetchJson<{ points?: Array<Record<string, unknown>> }>(withRange("/analytics/shipments/timeseries", range)),
    ])
      .then(([wh, ts]) => {
        if (!alive) return;
        const items = wh.items ?? [];
        setWarehouses(items);
        setThroughput(ts.points ?? []);
        if (items.length > 0) setSelectedId(items[0]!.id);
      })
      .catch((e) => {
        if (!alive) setError(e instanceof Error ? e.message : "Failed to load warehouses");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  React.useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    setDetailLoading(true);
    void Promise.allSettled([
      fetchJson<{ items?: number[] }>(`/warehouses/${selectedId}/lanes`),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(`/warehouses/${selectedId}/stock`),
    ])
      .then(([ln, st]) => {
        if (!alive) return;
        setLanes(ln.status === "fulfilled" ? ln.value.items ?? [] : []);
        setStock(st.status === "fulfilled" ? st.value.items ?? [] : []);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const selected = warehouses.find((w) => w.id === selectedId) ?? warehouses[0] ?? null;
  const totalInbound = warehouses.reduce((s, w) => s + toNumber(w.inbound), 0);
  const totalLanes = warehouses.reduce((s, w) => s + toNumber(w.lanes), 0);
  const reservedUnits = stock.reduce((s, r) => s + toNumber(r.reserved), 0);

  if (loading) {
    return (
      <>
        <PageHeader title="Warehouses" sub="Loading facilities…" />
        <PageBody>
          <SkeletonBlock h={120} />
          <SkeletonBlock h={280} />
        </PageBody>
      </>
    );
  }

  if (error || !selected) {
    return (
      <>
        <PageHeader title="Warehouses" sub={error ? "Unable to load data" : "No warehouses available"} />
        <PageBody>
          <PageCard title="Empty">
            <div style={{ color: error ? "var(--err)" : "var(--mute)", fontSize: 12 }}>{error ?? "No warehouse data found."}</div>
          </PageCard>
        </PageBody>
      </>
    );
  }

  const utilPct = Math.round(toNumber(selected.util) * 100);
  const laneCount = Math.min(toNumber(selected.lanes), 11);
  const laneData = lanes.length > 0 ? lanes.slice(0, laneCount) : Array.from({ length: laneCount }).map(() => 0);
  const hourly8 = throughput.slice(0, 8).map((h) => ({
    h: h.h,
    inbound: Math.round(toNumber(h.dispatched) * 0.4),
    outbound: Math.round(toNumber(h.delivered) * 0.6),
  }));

  return (
    <>
      <PageHeader
        title="Warehouses"
        sub={`${warehouses.length} facilities · ${totalLanes} lanes · ${formatCompact(totalInbound)} inbound today`}
        actions={<DateRangeFilter />}
      />
      <PageBody>
        <div className="sl-grid" data-cols={6} style={{ gap: 10 }}>
          {warehouses.map((w) => {
            const active = w.id === selectedId;
            const u = Math.round(toNumber(w.util) * 100);
            return (
              <button key={w.id} type="button" onClick={() => setSelectedId(w.id)} style={{ textAlign: "left", padding: 0 }}>
                <div
                  style={{
                    padding: 14,
                    background: active ? "var(--ink)" : "var(--surface)",
                    color: active ? "var(--bg)" : "var(--ink)",
                    border: "0.5px solid var(--line)",
                    borderRadius: "var(--r-lg)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    height: "100%",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 11, opacity: 0.75 }}>{w.id}</span>
                    <PrototypePill tone={u > 90 ? "err" : u > 80 ? "warn" : "ok"} size="sm">{u}%</PrototypePill>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{String(w.name ?? "")}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{String(w.city ?? "")}</div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10.5,
                      opacity: 0.85,
                      fontFamily: "var(--mono)",
                      paddingTop: 6,
                      borderTop: `0.5px solid ${active ? "rgba(255,255,255,0.12)" : "var(--line)"}`,
                    }}
                  >
                    <span>↓ {toNumber(w.inbound)}</span>
                    <span>↑ {toNumber(w.outbound)}</span>
                    <span>{toNumber(w.lanes)} lanes</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
          <PageCard
            title={`${selected.name} · ${selected.id}`}
            sub={`${selected.city} · ${selected.lanes} lanes · stock health`}
            action={<PrototypePill tone={utilPct > 90 ? "err" : utilPct > 80 ? "warn" : "ok"}>{utilPct}% utilization</PrototypePill>}
            style={{ gridColumn: "span 8" }}
          >
            <div className="sl-grid" data-cols={4} style={{ gap: 10, marginBottom: 14 }}>
              <MiniStat label="Inbound today" value={toNumber(selected.inbound)} unit="pkg" />
              <MiniStat label="Outbound today" value={toNumber(selected.outbound)} unit="pkg" />
              <MiniStat label="Reserved" value={detailLoading ? "…" : reservedUnits || stock.reduce((s, r) => s + toNumber(r.reserved), 0)} unit="units" />
              <MiniStat label="Low stock" value={toNumber(selected.stockLow)} unit="SKUs" tone="warn" />
            </div>

            <div style={{ marginBottom: 8, fontSize: 11.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Lane occupancy</div>
            <div className="sl-scroll-x" style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(laneData.length, 1)}, minmax(28px, 1fr))`, gap: 4, minWidth: Math.max(laneData.length, 1) * 32 }}>
                {laneData.map((lanePct, i) => {
                  const fill = Math.max(0, Math.min(1, lanePct / 100));
                  const tone = fill > 0.85 ? "var(--err)" : fill > 0.6 ? "var(--warn)" : "var(--ok)";
                  return (
                    <div
                      key={i}
                      title={`Lane ${i + 1}: ${Math.round(fill * 100)}%`}
                      style={{ height: 38, background: "var(--bg-warm)", borderRadius: 4, position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
                    >
                      <div style={{ position: "absolute", inset: 0, top: `${(1 - fill) * 100}%`, background: tone, opacity: 0.7 }} />
                      <span className="mono" style={{ fontSize: 9, color: "var(--ink)", position: "relative", paddingBottom: 2 }}>{i + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 8, fontSize: 11.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Throughput by day</div>
            <BarChartSeries data={hourly8} series={["inbound", "outbound"]} height={120} formatLabel={(h) => String(h)} />
          </PageCard>

          <PageCard title="Stock & reservations" sub="below threshold + active holds" style={{ gridColumn: "span 4" }} padding={0} bodyStyle={{ padding: 0 }}>
            {detailLoading ? (
              <div style={{ padding: 14, display: "grid", gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonBlock key={i} h={36} />
                ))}
              </div>
            ) : stock.length === 0 ? (
              <div style={{ padding: "10px 14px", color: "var(--mute)", fontSize: 11.5 }}>No stock rows available.</div>
            ) : (
              stock.map((r, i) => {
                const on = toNumber(r.on);
                const threshold = toNumber(r.threshold);
                return (
                  <div key={String(r.sku ?? i)} style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className="mono" style={{ fontSize: 11, color: "var(--info)" }}>{String(r.sku ?? "")}</span>
                        {r.hot ? <PrototypePill tone="err" size="sm">low</PrototypePill> : null}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{String(r.name ?? "")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 12, color: on < threshold ? "var(--err)" : "var(--ink)" }}>{on}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--mute)" }}>{toNumber(r.reserved)} held</div>
                    </div>
                  </div>
                );
              })
            )}
          </PageCard>
        </div>

        <PageCard title="Inbound / outbound flow" sub="all warehouses combined">
          <BarChartSeries
            data={throughput.map((h) => ({ h: h.h, inbound: Math.round(toNumber(h.dispatched) * 0.6), outbound: toNumber(h.delivered) }))}
            series={["inbound", "outbound"]}
            height={160}
            formatLabel={(h) => String(h)}
          />
          <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11.5 }}>
            <LegendDot color="var(--info)" label="Inbound" value={formatCompact(totalInbound)} />
            <LegendDot color="var(--accent)" label="Outbound" value={formatCompact(warehouses.reduce((s, w) => s + toNumber(w.outbound), 0))} />
          </div>
        </PageCard>
      </PageBody>
    </>
  );
}
