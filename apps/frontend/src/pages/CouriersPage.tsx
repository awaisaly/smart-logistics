import React from "react";
import { fetchJson, withRange } from "@/lib/api";
import { toNumber, formatCompact } from "@/lib/format";
import { MAP_CITIES, type ShipmentRow, type WarehouseRow } from "@/lib/constants";
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

export function mapPos(city: string, index = 0): { x: number; y: number } {
  const hub = MAP_CITIES[city] ?? { x: 50, y: 50, label: city };
  const jitter = ((index % 5) - 2) * 2.5;
  return { x: Math.max(8, Math.min(92, hub.x + jitter)), y: Math.max(8, Math.min(92, hub.y + jitter * 0.6)) };
}

export type CourierRow = {
  id: string;
  name?: string;
  city?: string;
  zone?: string;
  status?: string;
  load?: number;
  capacity?: number;
  rating?: number;
  since?: string;
  attempts?: number;
  delivered?: number;
};

export function CouriersPage(): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [couriers, setCouriers] = React.useState<CourierRow[]>([]);
  const [shipments, setShipments] = React.useState<ShipmentRow[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [city, setCity] = React.useState("All");
  const { from, to } = useDateRange();

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const range = { from, to };
    void Promise.all([
      fetchJson<{ items?: CourierRow[] }>(withRange("/couriers", range)),
      fetchJson<{ items?: ShipmentRow[] }>(withRange("/shipments", range)),
    ])
      .then(([co, sh]) => {
        if (!alive) return;
        const items = co.items ?? [];
        setCouriers(items);
        setShipments(sh.items ?? []);
        if (items.length > 0) setSelectedId(items[0]!.id);
      })
      .catch((e) => {
        if (!alive) setError(e instanceof Error ? e.message : "Failed to load couriers");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  const cityOptions = React.useMemo(() => ["All", ...Array.from(new Set(couriers.map((c) => String(c.city ?? "")).filter(Boolean)))], [couriers]);
  const rows = city === "All" ? couriers : couriers.filter((c) => c.city === city);
  const liveOnMap = rows.filter((c) => String(c.status ?? "").toLowerCase() !== "off");
  const selected = couriers.find((c) => c.id === selectedId) ?? rows[0] ?? null;
  const offStates = new Set(["off", "offline", "inactive", "break"]);
  const activeCount = couriers.filter((c) => !offStates.has(String(c.status ?? "").toLowerCase())).length;
  const exceptionCount = couriers.filter((c) => String(c.status ?? "").toLowerCase() === "exception").length;
  const availableCount = couriers.filter((c) => String(c.status ?? "").toLowerCase() === "available").length;
  const assigned = selected ? shipments.filter((s) => s.courier === selected.id).slice(0, 6) : [];

  if (loading) {
    return (
      <>
        <PageHeader title="Couriers" sub="Loading roster…" />
        <PageBody>
          <SkeletonBlock h={320} />
          <SkeletonBlock h={200} />
        </PageBody>
      </>
    );
  }

  if (error || !selected) {
    return (
      <>
        <PageHeader title="Couriers" sub="No couriers available" />
        <PageBody>
          <PageCard title="Empty">
            <div style={{ color: error ? "var(--err)" : "var(--mute)", fontSize: 12 }}>{error ?? "No courier roster data found."}</div>
          </PageCard>
        </PageBody>
      </>
    );
  }

  const loadPct = toNumber(selected.load) / Math.max(toNumber(selected.capacity), 1);

  return (
    <>
      <PageHeader
        title="Couriers"
        sub={`${activeCount} active · ${availableCount} available · ${exceptionCount} in exception`}
        actions={
          <>
            <DateRangeFilter />
            <Segmented options={cityOptions as string[]} value={city} onChange={setCity} />
          </>
        }
      />
      <PageBody>
        <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
          <PageCard
            title="Live positions"
            sub={city === "All" ? `Pakistan network · ${liveOnMap.length} live couriers` : `${city} region · ${liveOnMap.length} live`}
            style={{ gridColumn: "span 7" }}
            padding={0}
            bodyStyle={{ padding: 0 }}
          >
            <CouriersMap couriers={liveOnMap} warehouses={[]} cityFilter={city} selectedId={selectedId} onSelect={setSelectedId} />
          </PageCard>

          <PageCard title="Courier detail" sub={selected.id} style={{ gridColumn: "span 5" }} padding={16}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--bg-warm)", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 500, color: "var(--ink)", border: "0.5px solid var(--line)" }}>
                {String(selected.name ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{String(selected.name ?? "")}</span>
                  <StatusPill status={String(selected.status ?? "")} />
                </div>
                <div style={{ fontSize: 11, color: "var(--mute)" }}>
                  <span className="mono">{selected.id}</span> · {String(selected.city ?? "")} · {String(selected.zone ?? "")} · since {String(selected.since ?? "")}
                </div>
              </div>
            </div>
            <div className="sl-grid" data-cols={3} style={{ gap: 8, marginBottom: 14 }}>
              <MiniStat label="Load" value={`${toNumber(selected.load)}/${toNumber(selected.capacity)}`} unit="pkg" tone={loadPct >= 1 ? "err" : loadPct > 0.8 ? "warn" : undefined} />
              <MiniStat label="Today" value={toNumber(selected.delivered)} unit={`/ ${toNumber(selected.attempts)}`} />
              <MiniStat label="Rating" value={toNumber(selected.rating).toFixed(2)} unit="★" />
            </div>
            <div style={{ marginBottom: 6, fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned today</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {assigned.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 6, background: "var(--bg-warm)" }}>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--info)" }}>{s.id}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-2)", flex: 1, padding: "0 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(s.to ?? "")}</span>
                  <StatusPill status={String(s.status ?? "")} />
                </div>
              ))}
              {assigned.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--mute)", fontSize: 11.5 }}>No active assignments</div>}
            </div>
            {loadPct > 0.85 && (
              <div style={{ marginTop: 14, padding: 10, background: "var(--accent-soft)", color: "var(--accent-ink)", borderRadius: 6, fontSize: 11.5, display: "flex", gap: 8, alignItems: "center" }}>
                <Icon name="sparkle" size={14} />
                <span style={{ flex: 1 }}>Over capacity — AI suggests rerouting overflow shipments</span>
              </div>
            )}
          </PageCard>
        </div>

        <PageCard title="Roster" sub={`${rows.length} couriers · ${city}`} padding={0} bodyStyle={{ padding: 0 }}>
          <Table<CourierRow>
            dense
            idKey="id"
            selectedId={selectedId}
            onRowClick={(c) => setSelectedId(c.id)}
            rows={rows}
            columns={[
              { key: "id", label: "ID", mono: true, render: (r) => <span style={{ color: "var(--info)" }}>{r.id}</span> },
              { key: "name", label: "Name", render: (r) => <span style={{ color: "var(--ink)", fontWeight: 500 }}>{String(r.name ?? "")}</span> },
              { key: "city", label: "City" },
              { key: "zone", label: "Zone" },
              { key: "status", label: "Status", render: (r) => <StatusPill status={String(r.status ?? "")} /> },
              { key: "load", label: "Load", align: "right", render: (r) => <LoadBar load={toNumber(r.load)} capacity={toNumber(r.capacity)} /> },
              { key: "delivered", label: "Today", align: "right", mono: true, render: (r) => <span>{toNumber(r.delivered)}/{toNumber(r.attempts)}</span> },
              { key: "rating", label: "Rating", align: "right", mono: true, render: (r) => <span>{toNumber(r.rating).toFixed(2)}</span> },
            ]}
          />
        </PageCard>
      </PageBody>
    </>
  );
}

export function CouriersMap({
  couriers,
  cityFilter,
  selectedId,
  onSelect,
}: {
  couriers: CourierRow[];
  warehouses: WarehouseRow[];
  cityFilter: string;
  selectedId: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  const cityLabels = cityFilter === "All" ? Object.values(MAP_CITIES) : MAP_CITIES[cityFilter] ? [MAP_CITIES[cityFilter]!] : [];
  return (
    <div style={{ position: "relative", height: "clamp(240px, 42vw, 360px)", overflow: "hidden", background: "linear-gradient(180deg, #F4F1EA, #EDE8DC)", borderRadius: "0 0 var(--r-lg) var(--r-lg)" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <line key={`v${i}`} x1={i * 10} y1={0} x2={i * 10} y2={100} stroke="var(--line)" strokeWidth="0.1" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <line key={`h${i}`} x1={0} y1={i * 10} x2={100} y2={i * 10} stroke="var(--line)" strokeWidth="0.1" />
        ))}
        <path d="M 14 10 L 28 8 L 40 12 L 50 20 L 58 30 L 62 42 L 64 54 L 58 66 L 48 74 L 36 78 L 26 82 L 18 78 L 12 66 L 10 50 L 12 34 L 16 20 Z" fill="rgba(255,255,255,0.65)" stroke="var(--line-strong)" strokeWidth="0.3" strokeDasharray="0.6 0.4" />
      </svg>
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        {cityLabels.map((c) => (
          <div key={c.label} style={{ position: "absolute", left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%, calc(-100% - 10px))", fontSize: 10, fontWeight: 600, color: "var(--ink-2)", background: "rgba(251,250,246,0.85)", padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap" }}>
            {c.label}
          </div>
        ))}
        {couriers.map((c, i) => {
          const p = mapPos(String(c.city ?? "Karachi"), i);
          const isSelected = c.id === selectedId;
          const st = String(c.status ?? "").toLowerCase();
          const dotColor = st === "exception" ? "var(--err)" : st === "available" ? "var(--ok)" : st === "out_for_delivery" || st === "out-for-delivery" ? "var(--accent)" : "var(--info)";
          return (
            <button key={c.id} type="button" onClick={() => onSelect(c.id)} title={`${c.name} · ${c.city}`} style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)", padding: 0, border: "none", background: "transparent", cursor: "pointer", zIndex: isSelected ? 4 : 3 }}>
              <div style={{ width: isSelected ? 16 : 12, height: isSelected ? 16 : 12, borderRadius: 999, border: "2px solid var(--surface-2)", background: dotColor, boxShadow: isSelected ? "0 0 0 2px var(--ink)" : "0 2px 4px rgba(20,18,15,0.25)", transition: "all 200ms" }} className={isSelected ? "pulse" : ""} />
            </button>
          );
        })}
        {couriers.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, color: "var(--mute)" }}>No live couriers in this region</div>
        )}
      </div>
    </div>
  );
}
