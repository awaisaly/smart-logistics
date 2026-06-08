import React from "react";
import { fetchJsonOptional, withRange } from "@/lib/api";
import { toNumber, formatCompact, formatDateTime, formatTime } from "@/lib/format";
import { useCurrentUser, useTimeGreeting } from "@/hooks/useCurrentUser";
import { useDateRange } from "@/lib/date-range";
import { canPerform, PERMISSIONS } from "@/lib/permissions";
import {
  PageCard,
  PrototypePill,
  PrototypeKpi,
  SkeletonBlock,
  PageHeader,
  PageBody,
  DateRangeFilter,
} from "@/components";
import { renderThroughputBars } from "@/lib/charts";

export function OverviewPage(): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [overview, setOverview] = React.useState<Record<string, unknown>>({});
  const [exceptions, setExceptions] = React.useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = React.useState<Array<Record<string, unknown>>>([]);
  const [workflows, setWorkflows] = React.useState<Array<Record<string, unknown>>>([]);
  const [warehouses, setWarehouses] = React.useState<Array<Record<string, unknown>>>([]);
  const [couriers, setCouriers] = React.useState<Array<Record<string, unknown>>>([]);
  const [throughput, setThroughput] = React.useState<Array<Record<string, unknown>>>([]);
  const { from, to } = useDateRange();
  const { permissions } = useCurrentUser();
  const canAnalytics = canPerform(permissions, PERMISSIONS.ANALYTICS_READ);
  const canShipments = canPerform(permissions, PERMISSIONS.SHIPMENTS_READ);
  const canTracking = canPerform(permissions, PERMISSIONS.TRACKING_READ);
  const canDispatch = canPerform(permissions, PERMISSIONS.DISPATCH_READ);
  const canWarehouse = canPerform(permissions, PERMISSIONS.WAREHOUSE_READ);
  const canCouriers = canPerform(permissions, PERMISSIONS.COURIERS_READ);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const range = { from, to };
    void Promise.all([
      fetchJsonOptional<Record<string, unknown>>(withRange("/analytics/kpis/overview", range), canAnalytics),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>(
        withRange("/shipments/exceptions", range),
        canShipments
      ),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>(
        withRange("/tracking/events/recent", range),
        canTracking
      ),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>(
        withRange("/dispatch/workflows", range),
        canDispatch
      ),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>(withRange("/warehouses", range), canWarehouse),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>(withRange("/couriers", range), canCouriers),
      fetchJsonOptional<{ points?: Array<Record<string, unknown>> }>(
        withRange("/analytics/shipments/timeseries", range),
        canAnalytics
      ),
    ])
      .then(([ov, ex, ev, wf, wh, co, ts]) => {
        if (!alive) return;
        setOverview(ov ?? {});
        setExceptions(ex?.items ?? []);
        setEvents(ev?.items ?? []);
        setWorkflows(wf?.items ?? []);
        setWarehouses(wh?.items ?? []);
        setCouriers(co?.items ?? []);
        setThroughput(ts?.points ?? []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load overview");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to, canAnalytics, canShipments, canTracking, canDispatch, canWarehouse, canCouriers]);

  const { firstName } = useCurrentUser();
  const greeting = useTimeGreeting(firstName);

  const subtitle = React.useMemo(() => {
    const parts: string[] = [];
    if (canWarehouse) {
      const regionSet = new Set(
        warehouses
          .map((w) => String(w.city ?? w.region ?? "").trim())
          .filter((v) => v.length > 0)
      );
      parts.push(regionSet.size > 0 ? `${regionSet.size} region${regionSet.size === 1 ? "" : "s"}` : "All regions");
      parts.push(`${warehouses.length} warehouse${warehouses.length === 1 ? "" : "s"}`);
    }
    if (canCouriers) {
      const offStates = new Set(["off", "offline", "inactive", "paused"]);
      const activeCouriers = couriers.filter((c) => !offStates.has(String(c.status ?? "").toLowerCase())).length;
      parts.push(`${activeCouriers} courier${activeCouriers === 1 ? "" : "s"} active`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Operations snapshot for your role";
  }, [warehouses, couriers, canWarehouse, canCouriers]);

  if (loading) {
    return (
      <>
        <PageHeader title={greeting} sub="Loading regions, warehouses, and couriers…" />
        <PageBody>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <PageCard key={i} title="">
                <SkeletonBlock h={10} />
                <div style={{ height: 8 }} />
                <SkeletonBlock h={28} />
              </PageCard>
            ))}
          </div>
          <PageCard title="">
            <SkeletonBlock h={220} />
          </PageCard>
        </PageBody>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Overview" sub="Unable to load dashboard data." />
        <PageBody>
          <PageCard title="Error">
            <div style={{ color: "var(--err)" }}>{error}</div>
          </PageCard>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={greeting}
        sub={subtitle}
        actions={<DateRangeFilter />}
      />
      <PageBody>
        <div className="sl-grid" data-cols={6} style={{ gap: 10 }}>
          {canAnalytics && (
            <>
          <PrototypeKpi label="Shipments" value={formatCompact(overview.shipments)} delta={String((overview.deltas as Record<string, unknown> | undefined)?.shipments ?? "")} />
          <PrototypeKpi label="Dispatched" value={formatCompact(overview.dispatched)} delta={String((overview.deltas as Record<string, unknown> | undefined)?.dispatched ?? "")} />
          <PrototypeKpi label="Delivered" value={formatCompact(overview.delivered)} tone="ok" delta={String((overview.deltas as Record<string, unknown> | undefined)?.delivered ?? "")} />
          <PrototypeKpi label="Failed" value={formatCompact(overview.failed)} tone="err" delta={String((overview.deltas as Record<string, unknown> | undefined)?.failed ?? "")} />
          <PrototypeKpi label="Avg delivery" value={`${toNumber(overview.avgDeliveryTime)}m`} tone="info" />
          <PrototypeKpi label="Return rate" value={`${toNumber(overview.returnRate)}%`} />
            </>
          )}
        </div>

        <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
          {canAnalytics && (
          <PageCard title="Hourly throughput">
            {renderThroughputBars(throughput)}
          </PageCard>
          )}
          {canShipments && (
          <PageCard title="Active exceptions">
            <div style={{ display: "grid", gap: 8 }}>
              {exceptions.slice(0, 5).map((row, i) => {
                const severity = String(row.severity ?? "low");
                const tone = severity === "high" ? "err" : severity === "medium" ? "warn" : "neutral";
                const kind = String(row.kind ?? "Exception");
                const shipment = String(row.shipment ?? "");
                const age = String(row.age ?? "-");
                return (
                  <div key={String(row.id ?? i)} style={{ display: "flex", gap: 10, alignItems: "center", paddingBottom: 8, borderBottom: "0.5px solid var(--line)" }}>
                    <span style={{ flexShrink: 0 }}>
                      <PrototypePill tone={tone}>{severity}</PrototypePill>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={kind} style={{ color: "var(--ink)", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kind}</div>
                      <div title={shipment} style={{ color: "var(--mute)", fontSize: 10.5, fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shipment}</div>
                    </div>
                    <span style={{ color: "var(--mute)", fontSize: 10.5, fontFamily: "var(--mono)", flexShrink: 0, whiteSpace: "nowrap" }}>{age}</span>
                  </div>
                );
              })}
            </div>
          </PageCard>
          )}
        </div>

        <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
          {canTracking && (
          <PageCard title="Live event stream">
            <div style={{ maxHeight: 270, overflow: "auto", display: "grid", gap: 0 }}>
              {events.slice(0, 12).map((row, i) => {
                const key = String(row.key ?? row.id ?? "");
                const payload = String(row.payload ?? "");
                return (
                  <div key={String(row.id ?? i)} className="sl-event-row">
                    <span className="mono" style={{ color: "var(--mute)" }} title={formatDateTime(row.created_at ?? row.t)}>{formatTime(row.created_at ?? row.t)}</span>
                    <span className="mono" style={{ color: "var(--info)" }} title={String(row.topic ?? "")}>{String(row.topic ?? "")}</span>
                    <span style={{ color: "var(--ink-2)" }} title={key ? `${key} · ${payload}` : payload}>
                      {key && <span className="mono" style={{ color: "var(--ink)" }}>{key}</span>}
                      {key && payload && <span style={{ color: "var(--mute)" }}> · </span>}
                      <span style={{ color: "var(--mute)" }}>{payload}</span>
                    </span>
                    <span className="mono" style={{ color: "var(--mute)" }} title={String(row.lag ?? "")}>{String(row.lag ?? "")}</span>
                  </div>
                );
              })}
            </div>
          </PageCard>
          )}
          {canDispatch && (
          <PageCard title="Active workflows">
            <div style={{ maxHeight: 270, overflow: "auto", display: "grid", gap: 8 }}>
              {workflows.slice(0, 7).map((row, i) => {
                const status = String(row.status ?? "scheduled");
                const tone = status === "completed" ? "ok" : status === "failing" ? "err" : status === "running" ? "info" : "warn";
                return (
                  <div key={String(row.id ?? i)} style={{ borderBottom: "0.5px solid var(--line)", paddingBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--info)" }}>{String(row.id ?? "")}</span>
                      <PrototypePill tone={tone}>{status}</PrototypePill>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                      <span className="mono">{String(row.shipment ?? "")}</span>
                      <span style={{ color: "var(--mute)" }}>{String(row.step ?? "")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </PageCard>
          )}
        </div>

        {(canWarehouse || canCouriers) && (
        <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
          {canWarehouse && (
          <PageCard title="Warehouse utilization">
            <div style={{ display: "grid", gap: 10 }}>
              {warehouses.slice(0, 6).map((row, i) => {
                const util = Math.round(toNumber(row.util) * 100);
                const tone = util > 90 ? "var(--err)" : util > 80 ? "var(--warn)" : "var(--ok)";
                return (
                  <div key={String(row.id ?? i)} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                      <span>
                        <span className="mono" style={{ color: "var(--mute)", marginRight: 8 }}>{String(row.id ?? "")}</span>
                        <span>{String(row.name ?? "")}</span>
                      </span>
                      <span className="mono" style={{ color: "var(--mute)" }}>{util}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, overflow: "hidden", background: "var(--bg-warm)" }}>
                      <div style={{ width: `${util}%`, height: "100%", background: tone }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </PageCard>
          )}
          {canCouriers && (
          <PageCard title="Courier roster">
            <div style={{ display: "grid", gap: 7 }}>
              {couriers.slice(0, 7).map((row, i) => (
                <div
                  key={String(row.id ?? i)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
                    alignItems: "center",
                    gap: 10,
                    borderBottom: "0.5px solid var(--line)",
                    paddingBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <span className="mono" style={{ color: "var(--info)" }}>{String(row.id ?? "")}</span>
                  <span
                    style={{
                      color: "var(--ink)",
                      fontWeight: 500,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={String(row.name ?? "")}
                  >
                    {String(row.name ?? "")}
                  </span>
                  <span
                    style={{
                      color: "var(--mute)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={String(row.status ?? "")}
                  >
                    {String(row.status ?? "")}
                  </span>
                  <span className="mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {toNumber(row.load)}/{toNumber(row.capacity)}
                  </span>
                </div>
              ))}
            </div>
          </PageCard>
          )}
        </div>
        )}
      </PageBody>
    </>
  );
}
