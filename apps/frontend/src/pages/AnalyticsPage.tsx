import React from "react";
import { fetchJson, withRange } from "@/lib/api";
import { toNumber, formatCompact } from "@/lib/format";
import { useDateRange } from "@/lib/date-range";
import {
  PageCard,
  PrototypeKpi,
  Table,
  SkeletonBlock,
  BarChartSeries,
  SlaPie,
  ProgressRow,
  PageHeader,
  PageBody,
  DateRangeFilter,
} from "@/components";

export function AnalyticsPage(): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<Record<string, unknown>>({});
  const [volumeTrend, setVolumeTrend] = React.useState<Array<Record<string, unknown>>>([]);
  const [regions, setRegions] = React.useState<Array<Record<string, unknown>>>([]);
  const [sla, setSla] = React.useState<Array<Record<string, unknown>>>([]);
  const [zones, setZones] = React.useState<Array<Record<string, unknown>>>([]);
  const [histogram, setHistogram] = React.useState<Array<Record<string, unknown>>>([]);
  const { from, to } = useDateRange();

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const range = { from, to };
    void Promise.all([
      fetchJson<Record<string, unknown>>(withRange("/analytics/kpis/overview", range)),
      fetchJson<{ points?: Array<Record<string, unknown>> }>(withRange("/analytics/shipments/timeseries", range)),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/analytics/regions/volume", range)),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/analytics/sla/breakdown", range)),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/analytics/exceptions/zones", range)),
      fetchJson<{ points?: Array<Record<string, unknown>> }>(withRange("/analytics/shipments/histogram", range)),
    ])
      .then(([ov, vol, reg, slaData, z, hist]) => {
        if (!alive) return;
        setOverview(ov ?? {});
        setVolumeTrend(vol.points ?? []);
        setRegions(reg.items ?? []);
        setSla(slaData.items ?? []);
        setZones(z.items ?? []);
        setHistogram(hist.points ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  const slaPieData = sla.map((b, i) => ({
    label: String(b.bucket ?? `Bucket ${i}`),
    value: toNumber(b.onTime),
    color: i === 0 ? "var(--ok)" : i === 1 ? "var(--warn)" : "var(--err)",
  }));
  const histBuckets = React.useMemo(
    () =>
      histogram.map((h, i) => ({
        label: String(h.bucket ?? h.label ?? `b${i}`),
        count: toNumber(h.count),
      })),
    [histogram],
  );
  const histMax = histBuckets.reduce((m, b) => Math.max(m, b.count), 0);
  const histTotal = histBuckets.reduce((s, b) => s + b.count, 0);
  const histModeLabel = histBuckets.find((b) => b.count === histMax)?.label ?? "";
  const deltas = (overview.deltas as Record<string, unknown> | undefined) ?? {};

  return (
    <>
      <PageHeader title="Analytics" sub="Operational metrics · derived from Kafka + Postgres" actions={<DateRangeFilter />} />
      <PageBody>
        {loading ? (
          <SkeletonBlock h={320} />
        ) : (
          <>
            <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
              <PrototypeKpi label="Shipments" value={formatCompact(overview.shipments)} delta={String(deltas.shipments ?? "")} />
              <PrototypeKpi label="Avg delivery time" value={`${toNumber(overview.avgDeliveryTime)}m`} delta={String(deltas.delivered ?? "")} tone="ok" />
              <PrototypeKpi label="Courier utilization" value={`${toNumber(overview.courierUtilization)}%`} tone="info" />
              <PrototypeKpi label="Return rate" value={`${toNumber(overview.returnRate)}%`} tone="ok" />
            </div>

            <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
              <PageCard title="Volume trend" sub="dispatched · delivered · failed" style={{ gridColumn: "span 8" }}>
                <BarChartSeries data={volumeTrend} series={["dispatched", "delivered", "failed"]} height={200} formatLabel={(h) => String(h)} />
              </PageCard>
              <PageCard title="By region" sub="last 7 days" style={{ gridColumn: "span 4" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {regions.map((r) => {
                    const vol = toNumber(r.volume);
                    const maxVol = Math.max(...regions.map((x) => toNumber(x.volume)), 1);
                    return (
                      <ProgressRow
                        key={String(r.name ?? r.region)}
                        label={String(r.name ?? r.region ?? "")}
                        value={vol}
                        max={maxVol}
                        right={
                          <span>
                            <span className="mono" style={{ color: "var(--ink)" }}>{formatCompact(vol)}</span>
                          </span>
                        }
                      />
                    );
                  })}
                </div>
              </PageCard>
            </div>

            <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
              <PageCard title="Delivery SLA" sub="on-time vs late vs failed" style={{ gridColumn: "span 5" }}>
                <SlaPie data={slaPieData.length > 0 ? slaPieData : [{ label: "On time", value: 1, color: "var(--ok)" }]} />
              </PageCard>
              <PageCard title="Top zones by exception rate" sub="last 7 days" style={{ gridColumn: "span 7" }} padding={0} bodyStyle={{ padding: 0 }}>
                <Table
                  dense
                  rows={zones}
                  columns={[
                    { key: "zone", label: "Zone", render: (r) => <span style={{ color: "var(--ink)" }}>{String(r.zone ?? "")}</span> },
                    { key: "count", label: "Exceptions", align: "right", mono: true, render: (r) => toNumber(r.count) },
                  ]}
                />
              </PageCard>
            </div>

            <PageCard
              title="Dispatch-to-delivery time distribution"
              sub={
                histTotal > 0
                  ? `${formatCompact(histTotal)} deliveries · last 7 days`
                  : "delivery cohort histogram"
              }
            >
              {histBuckets.length === 0 ? (
                <div style={{ color: "var(--mute)", fontSize: 11.5 }}>
                  No delivery histogram data available.
                </div>
              ) : (
                <>
                  <div className="sl-chart-histogram" style={{ height: 160, alignItems: "stretch" }}>
                    {histBuckets.map((b, i) => {
                      const pct = histMax > 0 ? (b.count / histMax) * 100 : 0;
                      const isMode = histMax > 0 && b.count === histMax;
                      return (
                        <div
                          key={`${b.label}-${i}`}
                          title={`${b.label} · ${b.count.toLocaleString()} deliveries`}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            minWidth: 8,
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: `${Math.max(pct, b.count > 0 ? 2 : 0)}%`,
                              background: isMode ? "var(--accent)" : "var(--ink-2)",
                              borderRadius: "3px 3px 0 0",
                              transition: "height 200ms ease-out",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: "0.5px dashed var(--line)",
                    }}
                  >
                    {histBuckets.map((b, i) => (
                      <div
                        key={`${b.label}-label-${i}`}
                        className="mono"
                        style={{
                          flex: 1,
                          minWidth: 8,
                          textAlign: "center",
                          fontSize: 10,
                          color: "var(--mute)",
                        }}
                      >
                        {b.label}
                      </div>
                    ))}
                  </div>
                  {histModeLabel && (
                    <div style={{ marginTop: 10, fontSize: 11, color: "var(--mute)" }}>
                      <span
                        className="mono"
                        style={{ color: "var(--accent)", fontWeight: 500 }}
                      >
                        Mode: {histModeLabel}
                      </span>
                      <span> · median live · p95 live</span>
                    </div>
                  )}
                </>
              )}
            </PageCard>
          </>
        )}
      </PageBody>
    </>
  );
}
