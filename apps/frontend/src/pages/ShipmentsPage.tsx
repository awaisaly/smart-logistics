import React from "react";
import { fetchJson, postJson, withRange } from "@/lib/api";
import { canPerform, PERMISSIONS } from "@/lib/permissions";
import { toNumber, formatCompact, formatDateTime, formatTime } from "@/lib/format";
import { useCurrentUser } from "@/hooks/useCurrentUser";
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

export type ShipmentRow = {
  id: string;
  tracking_number?: string;
  from?: string;
  to?: string;
  weight?: string;
  status?: string;
  priority?: string;
  courier?: string;
  courier_id?: string;
  placed?: string;
  eta?: string;
  risk?: number;
  items?: number;
};

export type ShipmentTimelineRow = { t?: string; label?: string; desc?: string; done?: boolean; active?: boolean };
export type ShipmentAuditRow = { t?: string; actor?: string; action?: string; reason?: string };

export type ShipmentFilter = "all" | "active" | "issues" | "delivered";

const SHIPMENT_ACTIONS = [
  { id: "mark_delivered", label: "Mark delivered" },
  { id: "schedule_reattempt", label: "Schedule reattempt" },
  { id: "reassign_courier", label: "Reassign courier" },
  { id: "initiate_return", label: "Initiate return" },
  { id: "cancel_shipment", label: "Cancel shipment" },
] as const;

type ShipmentActionId = (typeof SHIPMENT_ACTIONS)[number]["id"];

function formatAuditTime(value?: string): string {
  // Render the UTC audit timestamp in the browser's local timezone.
  return formatDateTime(value);
}

const ACTIVE_STATUSES = new Set(["created", "dispatched", "in_transit", "in-transit", "picked", "out_for_delivery", "out-for-delivery", "attempted"]);
const ISSUE_STATUSES = new Set(["exception", "attempted", "failed", "returned"]);

function shipmentLabel(s: ShipmentRow): string {
  return String(s.tracking_number ?? s.id ?? "");
}

export function priorityTone(p?: string): PillTone {
  const v = String(p ?? "").toLowerCase();
  if (v === "express") return "accent";
  if (v === "freight") return "info";
  if (v === "same-day") return "warn";
  return "neutral";
}

export function ShipmentsPage(): JSX.Element {
  const { user, permissions } = useCurrentUser();
  const canWriteShipments = canPerform(permissions, PERMISSIONS.SHIPMENTS_WRITE);
  const actor = user?.email ? `ops:${user.email.split("@")[0]}` : "ops:console";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [shipments, setShipments] = React.useState<ShipmentRow[]>([]);
  const [totalShipments, setTotalShipments] = React.useState(0);
  const [filter, setFilter] = React.useState<ShipmentFilter>("all");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [timeline, setTimeline] = React.useState<ShipmentTimelineRow[]>([]);
  const [audit, setAudit] = React.useState<ShipmentAuditRow[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = React.useState(0);
  const { from, to } = useDateRange();

  const reloadShipments = React.useCallback(() => {
    void fetchJson<{ items?: ShipmentRow[]; total?: number }>(withRange("/shipments", { from, to })).then((v) => {
      const items = v.items ?? [];
      setShipments(items);
      setTotalShipments(v.total ?? items.length);
    });
  }, [from, to]);

  const reloadDetail = React.useCallback(() => {
    setDetailRefreshKey((k) => k + 1);
    reloadShipments();
  }, [reloadShipments]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void fetchJson<{ items?: ShipmentRow[]; total?: number }>(withRange("/shipments", { from, to }))
      .then((v) => {
        if (!alive) return;
        const items = v.items ?? [];
        setShipments(items);
        setTotalShipments(v.total ?? items.length);
        if (items.length > 0 && !selectedId) setSelectedId(items[0]!.id);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load shipments");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  React.useEffect(() => {
    if (!selectedId) {
      setTimeline([]);
      setAudit([]);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    void Promise.allSettled([
      fetchJson<{ items?: ShipmentTimelineRow[] }>(`/shipments/${selectedId}/timeline`),
      fetchJson<{ items?: ShipmentAuditRow[] }>(`/shipments/${selectedId}/audit`),
    ])
      .then(([tl, au]) => {
        if (!alive) return;
        setTimeline(tl.status === "fulfilled" ? tl.value.items ?? [] : []);
        setAudit(au.status === "fulfilled" ? au.value.items ?? [] : []);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId, detailRefreshKey]);

  const filteredRows = React.useMemo(() => {
    return shipments.filter((s) => {
      const status = String(s.status ?? "").toLowerCase();
      if (filter === "active" && !ACTIVE_STATUSES.has(status)) return false;
      if (filter === "issues" && !ISSUE_STATUSES.has(status)) return false;
      if (filter === "delivered" && status !== "delivered") return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${s.tracking_number ?? ""} ${s.id} ${s.to ?? ""} ${s.from ?? ""} ${s.courier ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, filter, search]);

  React.useEffect(() => {
    if (selectedId && !filteredRows.some((r) => r.id === selectedId) && filteredRows.length > 0) {
      setSelectedId(filteredRows[0]!.id);
    }
  }, [filteredRows, selectedId]);

  const selected = React.useMemo<ShipmentRow | null>(() => {
    if (filteredRows.length === 0 && shipments.length === 0) return null;
    return shipments.find((s) => s.id === selectedId) ?? filteredRows[0] ?? shipments[0] ?? null;
  }, [shipments, filteredRows, selectedId]);

  return (
    <PageShell>
      <PageHeader
        title="Shipments"
        sub={
          loading
            ? "Loading shipments…"
            : `${(totalShipments || shipments.length).toLocaleString()} total · ${filteredRows.length.toLocaleString()} matched`
        }
        actions={<DateRangeFilter />}
      />
      <div className="sl-split">
        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "12px 20px 10px",
              borderBottom: "0.5px solid var(--line)",
            }}
          >
            <Segmented
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "issues", label: "Issues" },
                { value: "delivered", label: "Delivered" },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 9px",
                background: "var(--surface)",
                border: "0.5px solid var(--line-strong)",
                borderRadius: 6,
                minWidth: 240,
                flex: 1,
              }}
            >
              <Icon name="search" size={12} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SL-, origin, destination, courier…"
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 12,
                  flex: 1,
                  fontFamily: "var(--sans)",
                  color: "var(--ink)",
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>
              {filteredRows.length} matched
            </span>
          </div>
          <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: 16, display: "grid", gap: 8 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <SkeletonBlock key={i} h={26} />
                ))}
              </div>
            ) : error ? (
              <div style={{ padding: 16, fontSize: 12, color: "var(--err)" }}>{error}</div>
            ) : (
              <Table<ShipmentRow>
                dense
                idKey="id"
                selectedId={selectedId}
                onRowClick={(r) => setSelectedId(r.id)}
                rows={filteredRows}
                emptyText="No shipments match the current filter."
                columns={[
                  {
                    key: "id",
                    label: "Shipment",
                    mono: true,
                    render: (r) => (
                      <span style={{ color: "var(--info)", fontWeight: 500 }}>{shipmentLabel(r)}</span>
                    ),
                  },
                  { key: "from", label: "Origin", mono: true },
                  {
                    key: "to",
                    label: "Destination",
                    render: (r) => <span style={{ color: "var(--ink)" }}>{String(r.to ?? "")}</span>,
                  },
                  {
                    key: "priority",
                    label: "Priority",
                    render: (r) => (
                      <PrototypePill tone={priorityTone(r.priority)} size="sm">
                        {String(r.priority ?? "—")}
                      </PrototypePill>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <StatusPill status={String(r.status ?? "")} />,
                  },
                  {
                    key: "courier",
                    label: "Courier",
                    mono: true,
                    render: (r) => (
                      <span style={{ color: r.courier && r.courier !== "—" ? "var(--ink-2)" : "var(--mute)" }}>
                        {String(r.courier ?? "—")}
                      </span>
                    ),
                  },
                  {
                    key: "eta",
                    label: "ETA",
                    align: "right",
                    mono: true,
                    render: (r) => (
                      <span style={{ color: toNumber(r.risk) > 0.3 ? "var(--err)" : "var(--mute)" }}>
                        {String(r.eta ?? "")}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </div>

        {/* Detail */}
        <div
          style={{
            background: "var(--bg)",
            overflow: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
          }}
        >
          {!selected ? (
            <PageCard title="No shipment selected">
              <div style={{ color: "var(--mute)", fontSize: 12 }}>
                Pick a shipment on the left to inspect its lifecycle and audit trail.
              </div>
            </PageCard>
          ) : (
            <ShipmentDetail
              shipment={selected}
              timeline={timeline}
              audit={audit}
              loading={detailLoading}
              actor={actor}
              canWrite={canWriteShipments}
              onRefresh={reloadDetail}
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}

function ShipmentAuditTrail({
  audit,
  loading,
}: {
  audit: ShipmentAuditRow[];
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return (
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} h={48} />
        ))}
      </div>
    );
  }

  if (audit.length === 0) {
    return (
      <div style={{ padding: "12px 14px", color: "var(--mute)", fontSize: 11.5 }}>
        No audit rows available for this shipment.
      </div>
    );
  }

  return (
    <div className="sl-audit-list">
      {audit.map((entry, i) => (
        <div key={`${entry.t ?? ""}-${entry.action ?? ""}-${i}`} className="sl-audit-entry">
          <div className="sl-audit-entry-meta">
            <span className="sl-audit-entry-time">{formatAuditTime(entry.t)}</span>
            {entry.actor && <span className="sl-audit-entry-actor">{String(entry.actor)}</span>}
          </div>
          <div className="sl-audit-entry-action">{String(entry.action ?? "—")}</div>
          {entry.reason && (
            <div className="sl-audit-entry-reason">{String(entry.reason)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ShipmentDetail({
  shipment,
  timeline,
  audit,
  loading,
  actor,
  canWrite,
  onRefresh,
}: {
  shipment: ShipmentRow;
  timeline: ShipmentTimelineRow[];
  audit: ShipmentAuditRow[];
  loading: boolean;
  actor: string;
  canWrite: boolean;
  onRefresh: () => void;
}): JSX.Element {
  const auditRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  React.useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const scrollToAudit = (): void => {
    auditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEscalate = (): void => {
    setPending("escalate");
    void postJson<{ ok?: boolean; error?: string }>(`/shipments/${shipment.id}/escalate`, { actor })
      .then((res) => {
        if (res.ok === false) throw new Error(res.error ?? "Escalation failed");
        setNotice({ tone: "ok", text: "Shipment escalated — exception opened and audit logged." });
        onRefresh();
        window.setTimeout(scrollToAudit, 150);
      })
      .catch((e) => {
        setNotice({ tone: "err", text: e instanceof Error ? e.message : "Could not escalate shipment" });
      })
      .finally(() => setPending(null));
  };

  const runAction = (action: ShipmentActionId): void => {
    setMenuOpen(false);
    setPending(action);
    void postJson<{ ok?: boolean; error?: string }>(`/shipments/${shipment.id}/actions`, { action, actor })
      .then((res) => {
        if (res.ok === false) throw new Error(res.error ?? "Action failed");
        const label = SHIPMENT_ACTIONS.find((a) => a.id === action)?.label ?? "Action";
        setNotice({ tone: "ok", text: `${label} applied successfully.` });
        onRefresh();
      })
      .catch((e) => {
        setNotice({ tone: "err", text: e instanceof Error ? e.message : "Could not apply action" });
      })
      .finally(() => setPending(null));
  };

  const risk = toNumber(shipment.risk);
  const items = toNumber(shipment.items);
  const btnClass =
    "text-[11.5px] px-2.5 py-1.5 rounded-md border border-line-strong bg-surface text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const primaryBtnClass =
    "text-[11.5px] px-2.5 py-1.5 rounded-md border border-ink bg-ink text-bg disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <>
      <PageCard padding={16}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 13, color: "var(--info)", fontWeight: 600 }}>
                {shipmentLabel(shipment)}
              </span>
              <StatusPill status={String(shipment.status ?? "")} />
              <PrototypePill tone={priorityTone(shipment.priority)} size="sm">
                {String(shipment.priority ?? "—")}
              </PrototypePill>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink)" }}>
              {String(shipment.from ?? "—")} → {String(shipment.to ?? "—")}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 2 }}>
              {String(shipment.weight ?? "—")} · {items} {items === 1 ? "item" : "items"} · placed {String(shipment.placed ?? "")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className={btnClass} onClick={scrollToAudit} disabled={Boolean(pending)}>
              Audit log
            </button>
            {canWrite && (
              <>
                <button type="button" className={btnClass} onClick={handleEscalate} disabled={Boolean(pending)}>
                  {pending === "escalate" ? "Escalating…" : "Escalate"}
                </button>
                <div ref={menuRef} style={{ position: "relative" }}>
                  <button
                    type="button"
                    className={primaryBtnClass}
                    onClick={() => setMenuOpen((v) => !v)}
                    disabled={Boolean(pending)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    Actions ▾
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[180px] rounded-md border border-line-strong bg-surface shadow-md py-1"
                    >
                      {SHIPMENT_ACTIONS.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          role="menuitem"
                          className="block w-full text-left px-3 py-2 text-[11.5px] text-ink-2 hover:bg-bg-warm disabled:opacity-50"
                          onClick={() => runAction(action.id)}
                          disabled={pending === action.id}
                        >
                          {pending === action.id ? `${action.label}…` : action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {notice && (
          <div
            className={`mt-3 px-3 py-2 rounded-md text-xs ${notice.tone === "ok" ? "bg-ok-soft text-ok" : "bg-err-soft text-err"}`}
          >
            {notice.text}
          </div>
        )}
        {risk > 0.3 && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--err-soft)", borderRadius: 8, fontSize: 12, color: "var(--err)", display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="pulse" size={14} />
            <div style={{ flex: 1 }}>
              <strong>Delay risk: {Math.round(risk * 100)}%</strong>
              <div style={{ color: "var(--err)", opacity: 0.85, marginTop: 2 }}>
                AI suggests reattempt at 19:30. Recipient typically home after 19:00.
              </div>
            </div>
          </div>
        )}
      </PageCard>

      <div className="sl-detail-cards">
        <PageCard title="Recipient & contents" padding={12}>
          <FieldRow label="Recipient">{`Recipient of ${shipmentLabel(shipment)}`}</FieldRow>
          <FieldRow label="Address">{String(shipment.to ?? "—")}</FieldRow>
          <FieldRow label="Items">{items}</FieldRow>
          <FieldRow label="Weight">{String(shipment.weight ?? "—")}</FieldRow>
          <FieldRow label="Idempotency key">
            <span className="mono">k_{shipmentLabel(shipment).replace(/\W/g, "").toLowerCase().slice(-8)}</span>
          </FieldRow>
        </PageCard>
        <PageCard title="Routing" padding={12}>
          <FieldRow label="Origin">{String(shipment.from ?? "—")}</FieldRow>
          <FieldRow label="Destination">{String(shipment.to ?? "—")}</FieldRow>
          <FieldRow label="Courier">
            <span className="mono">{String(shipment.courier ?? "—")}</span>
          </FieldRow>
          <FieldRow label="ETA">
            <span className="mono">{String(shipment.eta ?? "—")}</span>
          </FieldRow>
          <FieldRow label="Priority">
            <span className="mono">{String(shipment.priority ?? "—")}</span>
          </FieldRow>
          <FieldRow label="Risk">
            <span className="mono" style={{ color: risk > 0.3 ? "var(--err)" : "var(--ink-2)" }}>
              {Math.round(risk * 100)}%
            </span>
          </FieldRow>
        </PageCard>
      </div>

      <PageCard title="Lifecycle timeline" sub="durable · audited · idempotent">
        {loading ? (
          <div style={{ display: "grid", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} h={26} />
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <div style={{ padding: "10px 0", color: "var(--mute)", fontSize: 11.5 }}>
            No timeline yet for this shipment.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {timeline.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 22px 1fr",
                  gap: 8,
                  padding: "8px 0",
                  alignItems: "flex-start",
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: "var(--mute)", paddingTop: 2 }}>
                  {formatTime(t.t)}
                </span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: t.done ? (t.active ? "var(--accent)" : "var(--ok)") : "var(--bg-warm)",
                      border: `1.5px solid ${t.done ? (t.active ? "var(--accent)" : "var(--ok)") : "var(--line-strong)"}`,
                    }}
                    className={t.active ? "pulse" : ""}
                  />
                  {i < timeline.length - 1 && (
                    <span
                      style={{
                        width: 1,
                        flex: 1,
                        background: t.done ? "var(--line-strong)" : "var(--line)",
                        marginTop: 2,
                        minHeight: 16,
                      }}
                    />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: t.done ? "var(--ink)" : "var(--mute)",
                      fontWeight: t.active ? 500 : 400,
                    }}
                  >
                    {String(t.label ?? "")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--mute)" }}>{String(t.desc ?? "")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      <div ref={auditRef}>
        <PageCard
          title="Audit trail"
          sub="append-only · actor + reason + timestamp"
          padding={0}
          bodyStyle={{ padding: 0 }}
          action={
            !loading && audit.length > 0 ? (
              <PrototypePill tone="neutral" size="sm">
                {audit.length} {audit.length === 1 ? "entry" : "entries"}
              </PrototypePill>
            ) : undefined
          }
        >
          <ShipmentAuditTrail audit={audit} loading={loading} />
        </PageCard>
      </div>
    </>
  );
}

