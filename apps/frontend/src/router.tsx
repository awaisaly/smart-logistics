import React from "react";
import { Link, Navigate, Outlet, createRootRoute, createRoute, createRouter, useNavigate, useRouterState } from "@tanstack/react-router";
import { OverviewPage } from "@/pages/OverviewPage";
import { ShipmentsPage } from "@/pages/ShipmentsPage";
import { DispatchPage } from "@/pages/DispatchPage";
import { WarehousePage } from "@/pages/WarehousePage";
import { CouriersPage } from "@/pages/CouriersPage";
import { ReturnsPage } from "@/pages/ReturnsPage";
import { EventsPage } from "@/pages/EventsPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { ObservabilityPage } from "@/pages/ObservabilityPage";
import { AiPage } from "@/pages/AiPage";
import { LoginPage } from "@/pages/LoginPage";
import { AiPanel } from "@/components/features/ai-panel";
import { Icon, type IconName } from "@/components/ui/icon";
import { routeContextKey } from "@/lib/ai-context";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AuthProvider, useAuth } from "@/lib/auth";
import { canAccessPage, canPerform, defaultRouteForUser, pageIdForPath, pagesForUser, PERMISSIONS } from "@/lib/permissions";
import { DateRangeProvider } from "@/lib/date-range";
import { fetchJsonOptional } from "@/lib/api";

type NavItem = {
  to: string;
  id: string;
  label: string;
  icon: IconName;
  badge?: "returns" | "dispatch" | "eventsPulse";
};

const NAV: NavItem[] = [
  { id: "overview", to: "/overview", label: "Overview", icon: "home" },
  { id: "shipments", to: "/shipments", label: "Shipments", icon: "package" },
  { id: "dispatch", to: "/dispatch", label: "Dispatch monitor", icon: "workflow", badge: "dispatch" },
  { id: "warehouse", to: "/warehouses", label: "Warehouses", icon: "warehouse" },
  { id: "couriers", to: "/couriers", label: "Couriers", icon: "courier" },
  { id: "events", to: "/events", label: "Events & queues", icon: "events", badge: "eventsPulse" },
  { id: "analytics", to: "/analytics", label: "Analytics", icon: "chart" },
  { id: "returns", to: "/returns", label: "Returns & RMA", icon: "rotate", badge: "returns" },
  { id: "observability", to: "/observability", label: "Observability", icon: "pulse" },
  { id: "ai", to: "/ai", label: "Assistant", icon: "ai" },
];

function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }, [key, value]);
  return [value, setValue];
}

function SidebarUserSkeleton({ collapsed }: { collapsed?: boolean }): JSX.Element {
  const shimmer: React.CSSProperties = {
    background: "linear-gradient(90deg, #2a2622 0%, #3a332d 50%, #2a2622 100%)",
    backgroundSize: "220% 100%",
    animation: "slShimmer 1.2s ease-in-out infinite",
  };

  if (collapsed) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0", borderTop: "0.5px solid #2A2622" }}>
        <div style={{ ...shimmer, width: 30, height: 30, borderRadius: 999 }} />
      </div>
    );
  }

  return (
    <div
      className="sl-sidebar-user"
      style={{
        padding: "12px 14px",
        borderTop: "0.5px solid #2A2622",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ ...shimmer, width: 30, height: 30, borderRadius: 999, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...shimmer, height: 12, width: "72%", borderRadius: 6 }} />
        <div style={{ ...shimmer, height: 10, width: "48%", borderRadius: 6 }} />
      </div>
      <div style={{ ...shimmer, width: 6, height: 6, borderRadius: 999, flexShrink: 0 }} />
    </div>
  );
}

type SearchHit = {
  category: "Shipments" | "Returns" | "Exceptions" | "Couriers" | "Warehouses" | "Workflows";
  id: string;
  title: string;
  subtitle?: string;
  to: string;
  icon: IconName;
};

type SearchIndex = {
  shipments: Array<Record<string, unknown>>;
  returns: Array<Record<string, unknown>>;
  exceptions: Array<Record<string, unknown>>;
  couriers: Array<Record<string, unknown>>;
  warehouses: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
};

const EMPTY_INDEX: SearchIndex = {
  shipments: [],
  returns: [],
  exceptions: [],
  couriers: [],
  warehouses: [],
  workflows: [],
};

function matches(value: unknown, q: string): boolean {
  return String(value ?? "").toLowerCase().includes(q);
}

function buildSearchHits(index: SearchIndex, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];

  for (const row of index.shipments) {
    if (
      matches(row.tracking_number, q) ||
      matches(row.id, q) ||
      matches(row.to, q) ||
      matches(row.from, q) ||
      matches(row.courier, q) ||
      matches(row.status, q)
    ) {
      hits.push({
        category: "Shipments",
        id: String(row.id ?? ""),
        title: String(row.tracking_number ?? row.id ?? "Shipment"),
        subtitle: `${row.from ?? "?"} → ${row.to ?? "?"} · ${row.status ?? "unknown"}`,
        to: "/shipments",
        icon: "package",
      });
    }
  }
  for (const row of index.returns) {
    if (matches(row.code, q) || matches(row.id, q) || matches(row.shipment, q) || matches(row.customer, q) || matches(row.reason, q)) {
      hits.push({
        category: "Returns",
        id: String(row.id ?? ""),
        title: String(row.code ?? row.id ?? "Return"),
        subtitle: `${row.shipment ?? "?"} · ${row.reason ?? "?"}`,
        to: "/returns",
        icon: "rotate",
      });
    }
  }
  for (const row of index.exceptions) {
    if (matches(row.code, q) || matches(row.id, q) || matches(row.shipment, q) || matches(row.kind, q) || matches(row.owner, q)) {
      hits.push({
        category: "Exceptions",
        id: String(row.id ?? ""),
        title: String(row.code ?? row.kind ?? "Exception"),
        subtitle: `${row.shipment ?? "?"} · ${row.severity ?? "?"} · ${row.owner ?? "?"}`,
        to: "/returns",
        icon: "rotate",
      });
    }
  }
  for (const row of index.couriers) {
    if (matches(row.code, q) || matches(row.id, q) || matches(row.name, q) || matches(row.city, q) || matches(row.zone, q) || matches(row.status, q)) {
      hits.push({
        category: "Couriers",
        id: String(row.id ?? ""),
        title: `${row.name ?? "Courier"} (${row.code ?? row.id ?? "?"})`,
        subtitle: `${row.city ?? "?"} · ${row.zone ?? "?"} · ${row.status ?? "?"}`,
        to: "/couriers",
        icon: "courier",
      });
    }
  }
  for (const row of index.warehouses) {
    if (matches(row.code, q) || matches(row.id, q) || matches(row.name, q) || matches(row.city, q)) {
      hits.push({
        category: "Warehouses",
        id: String(row.id ?? ""),
        title: `${row.name ?? "Warehouse"} (${row.code ?? row.id ?? "?"})`,
        subtitle: `${row.city ?? "?"} · ${row.lanes ?? "?"} lanes`,
        to: "/warehouses",
        icon: "warehouse",
      });
    }
  }
  for (const row of index.workflows) {
    if (matches(row.code, q) || matches(row.id, q) || matches(row.shipment, q) || matches(row.type, q) || matches(row.status, q) || matches(row.step, q)) {
      hits.push({
        category: "Workflows",
        id: String(row.id ?? ""),
        title: String(row.code ?? row.id ?? "Workflow"),
        subtitle: `${row.shipment ?? "?"} · ${row.status ?? "?"} · ${row.step ?? "?"}`,
        to: "/dispatch",
        icon: "workflow",
      });
    }
  }
  return hits;
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const perms = authUser?.permissions ?? [];
  const canShipments = canPerform(perms, PERMISSIONS.SHIPMENTS_READ);
  const canReturns = canPerform(perms, PERMISSIONS.RETURNS_READ);
  const canCouriers = canPerform(perms, PERMISSIONS.COURIERS_READ);
  const canWarehouse = canPerform(perms, PERMISSIONS.WAREHOUSE_READ);
  const canDispatch = canPerform(perms, PERMISSIONS.DISPATCH_READ);
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState<SearchIndex>(EMPTY_INDEX);
  const [loading, setLoading] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    inputRef.current?.focus();
    setLoading(true);
    void Promise.all([
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>("/shipments", canShipments),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>("/shipments/returns", canReturns),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>("/shipments/exceptions", canShipments),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>("/couriers", canCouriers),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>("/warehouses", canWarehouse),
      fetchJsonOptional<{ items?: Array<Record<string, unknown>> }>("/dispatch/workflows", canDispatch),
    ]).then(([s, r, e, c, w, wf]) => {
        setIndex({
          shipments: s?.items ?? [],
          returns: r?.items ?? [],
          exceptions: e?.items ?? [],
          couriers: c?.items ?? [],
          warehouses: w?.items ?? [],
          workflows: wf?.items ?? [],
        });
      })
      .finally(() => setLoading(false));
  }, [open, canShipments, canReturns, canCouriers, canWarehouse, canDispatch]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const hits = React.useMemo(() => {
    const all = buildSearchHits(index, query);
    // Only surface results for pages this role can actually open.
    return all.filter((hit) => {
      const page = pageIdForPath(hit.to);
      return !page || canAccessPage(authUser?.pages, page);
    });
  }, [index, query, authUser]);
  const flatHits = hits.slice(0, 100);

  React.useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const grouped = React.useMemo(() => {
    const map = new Map<SearchHit["category"], SearchHit[]>();
    for (const hit of flatHits) {
      const list = map.get(hit.category) ?? [];
      if (list.length < 6) list.push(hit);
      map.set(hit.category, list);
    }
    return Array.from(map.entries());
  }, [flatHits]);

  const visibleHits = grouped.flatMap(([, list]) => list);

  const goTo = (hit: SearchHit): void => {
    onClose();
    void navigate({ to: hit.to });
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(visibleHits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const hit = visibleHits[activeIdx];
      if (hit) {
        e.preventDefault();
        goTo(hit);
      }
    }
  };

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,18,15,0.42)",
        backdropFilter: "blur(2px)",
        zIndex: 80,
        display: "grid",
        placeItems: "start center",
        paddingTop: "12vh",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(640px, 92vw)",
          background: "var(--surface)",
          color: "var(--ink)",
          borderRadius: 12,
          border: "0.5px solid var(--line-strong)",
          boxShadow: "0 20px 60px -20px rgba(20,18,15,0.4), 0 6px 16px -8px rgba(20,18,15,0.18)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "70vh",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "0.5px solid var(--line)" }}>
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search SL-, RMA-, EX-, C-, WH-, couriers, warehouses…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "var(--sans)",
              fontSize: 14,
              color: "var(--ink)",
            }}
          />
          <span style={{ fontSize: 10.5, color: "var(--mute)", fontFamily: "var(--mono)", border: "0.5px solid var(--line)", borderRadius: 3, padding: "1px 5px" }}>ESC</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {!query.trim() && (
            <div style={{ padding: "18px 16px", color: "var(--mute)", fontSize: 12.5 }}>
              {loading ? "Loading workspace…" : "Type to search shipments, returns, exceptions, couriers, warehouses, and workflows."}
            </div>
          )}

          {query.trim() && visibleHits.length === 0 && !loading && (
            <div style={{ padding: "18px 16px", color: "var(--mute)", fontSize: 12.5 }}>
              No matches for <span className="mono">{query}</span>.
            </div>
          )}

          {grouped.map(([category, list]) => (
            <div key={category}>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 10.5,
                  color: "var(--mute)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {category}
              </div>
              {list.map((hit) => {
                runningIdx += 1;
                const active = runningIdx === activeIdx;
                return (
                  <button
                    key={`${hit.category}-${hit.id || hit.title}-${runningIdx}`}
                    type="button"
                    onClick={() => goTo(hit)}
                    onMouseEnter={() => setActiveIdx(runningIdx)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: active ? "var(--bg-warm)" : "transparent",
                      borderTop: "0.5px solid var(--line)",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: "var(--bg-warm)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--ink-2)",
                      }}
                    >
                      <Icon name={hit.icon} size={12} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{hit.title}</span>
                      {hit.subtitle && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--mute)" }}>{hit.subtitle}</span>
                      )}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{hit.to}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            borderTop: "0.5px solid var(--line)",
            fontSize: 10.5,
            color: "var(--mute)",
          }}
        >
          <span>
            <span className="mono">{visibleHits.length}</span> {visibleHits.length === 1 ? "match" : "matches"}
          </span>
          <span>
            <span className="mono">↑↓</span> navigate · <span className="mono">↵</span> open · <span className="mono">⌘K</span> toggle
          </span>
        </div>
      </div>
    </div>
  );
}

function AppLayout(): JSX.Element {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [badges, setBadges] = React.useState({ returns: 0, dispatch: 0, eventsPulse: false });
  const [aiOpen, setAiOpen] = usePersistedState<boolean>("sl.aiOpen", true);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState<boolean>("sl.sidebarCollapsed", false);
  const { user: authUser, loading: authLoading, logout } = useAuth();
  const { user: currentUser, userName, userInitials, userRoleLabel, loading: userLoading } = useCurrentUser();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const activePage = React.useMemo(() => NAV.find((item) => item.to === pathname), [pathname]);
  const aiContext = React.useMemo(() => routeContextKey(pathname), [pathname]);

  React.useEffect(() => {
    if (pathname === "/ai") setAiOpen(false);
  }, [pathname, setAiOpen]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      const isSlash = e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA";
      if (isCmdK || isSlash) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    let alive = true;
    const perms = authUser?.permissions ?? [];
    const canReturns = canPerform(perms, PERMISSIONS.RETURNS_READ);
    const canDispatch = canPerform(perms, PERMISSIONS.DISPATCH_READ);
    const canTracking = canPerform(perms, PERMISSIONS.TRACKING_READ);
    const load = async () => {
      const [returnsMetrics, dispatchKpis, eventsKpis] = await Promise.all([
        fetchJsonOptional<{ openExceptions?: number }>("/shipments/returns/metrics", canReturns),
        fetchJsonOptional<{ failing?: number }>("/dispatch/kpis", canDispatch),
        fetchJsonOptional<{ totalThroughput?: number }>("/tracking/events/kpis", canTracking),
      ]);
      if (!alive) return;
      setBadges({
        returns: returnsMetrics?.openExceptions ?? 0,
        dispatch: dispatchKpis?.failing ?? 0,
        eventsPulse: (eventsKpis?.totalThroughput ?? 0) > 0,
      });
    };
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [authUser?.permissions]);

  const renderBadge = (item: NavItem): JSX.Element | null => {
    const baseStyle: React.CSSProperties = {
      fontSize: 10,
      padding: "0 6px",
      borderRadius: 999,
      color: "#fff",
      fontWeight: 600,
      fontFamily: "var(--mono)",
      minWidth: 16,
      textAlign: "center",
      lineHeight: "16px",
    };
    if (item.badge === "returns" && badges.returns > 0) {
      return (
        <span style={{ ...baseStyle, background: "var(--err)" }}>
          {badges.returns}
        </span>
      );
    }
    if (item.badge === "dispatch" && badges.dispatch > 0) {
      return (
        <span style={{ ...baseStyle, background: "var(--warn)" }}>
          {badges.dispatch}
        </span>
      );
    }
    if (item.badge === "eventsPulse" && badges.eventsPulse) {
      return <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--ok)" }} className="pulse" />;
    }
    return null;
  };

  // Auth guard: once the session has hydrated, bounce anonymous visitors to /login.
  if (!authLoading && !authUser) {
    return <Navigate to="/login" />;
  }

  // Access guard: redirect to the role's landing page if the current route is not
  // permitted for this user's role.
  const currentPageId = pageIdForPath(pathname);
  if (authUser && currentPageId && !canAccessPage(authUser.pages, currentPageId)) {
    return <Navigate to={defaultRouteForUser(authUser.pages)} />;
  }

  const allowedPages = pagesForUser(authUser?.pages);
  const visibleNav = NAV.filter((item) => allowedPages.includes(item.id as (typeof allowedPages)[number]));

  return (
    <DateRangeProvider>
    <div className="sl-app" style={{ background: "var(--bg)" }}>
      <nav
        className={`sl-sidebar${sidebarCollapsed ? " sl-sidebar--collapsed" : ""}`}
        style={{
          width: sidebarCollapsed ? 64 : 220,
          background: "var(--sidebar)",
          color: "var(--sidebar-ink)",
          display: "flex",
          flexDirection: "column",
          transition: "width 180ms ease",
          position: "relative",
          zIndex: 20,
        }}
      >
        <div
          style={{
            padding: sidebarCollapsed ? "16px 10px 14px" : "16px 14px 14px",
            borderBottom: "0.5px solid #2A2622",
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: sidebarCollapsed ? "center" : "flex-start",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--accent)", display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 }}>
              <Icon name="truck" size={15} stroke={2} />
            </div>
            {!sidebarCollapsed && (
              <div className="sl-sidebar-brand-text" style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: "-0.005em" }}>SmartLogistics</span>
                <span style={{ fontSize: 10, color: "var(--sidebar-mute)", letterSpacing: "0.04em" }}>TransFleet · prod</span>
              </div>
            )}
          </div>
        </div>

        {!sidebarCollapsed ? (
          <div style={{ padding: "10px 14px" }}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search (⌘K)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 9px",
                background: "#221F1B",
                border: "0.5px solid transparent",
                borderRadius: 6,
                color: "var(--sidebar-mute)",
                fontSize: 11.5,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                transition: "border-color 160ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#3A332D";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "transparent";
              }}
            >
              <Icon name="search" size={12} />
              <span className="sl-sidebar-search-text">Search SL-, RMA-, C-…</span>
              <span
                className="sl-sidebar-search-text"
                style={{
                  marginLeft: "auto",
                  padding: "0 4px",
                  border: "0.5px solid #3A332D",
                  borderRadius: 3,
                  fontSize: 9.5,
                  fontFamily: "var(--mono)",
                }}
              >
                ⌘K
              </span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 2px" }}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search (⌘K)"
              aria-label="Open search"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#221F1B",
                color: "var(--sidebar-ink)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <Icon name="search" size={14} />
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: sidebarCollapsed ? "6px 6px" : "6px 8px" }}>
          {visibleNav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="sl-nav-btn"
                title={sidebarCollapsed ? item.label : undefined}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: sidebarCollapsed ? 0 : 9,
                  justifyContent: sidebarCollapsed ? "center" : "flex-start",
                  padding: sidebarCollapsed ? "9px 0" : "7px 10px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: active ? "var(--sidebar-active)" : "transparent",
                  color: active ? "#fff" : "var(--sidebar-ink)",
                  fontWeight: active ? 500 : 400,
                  marginBottom: 1,
                  position: "relative",
                  textDecoration: "none",
                }}
              >
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 6,
                      bottom: 6,
                      width: 2,
                      background: "var(--accent)",
                      borderRadius: "0 2px 2px 0",
                    }}
                  />
                )}
                <Icon name={item.icon} size={14} stroke={1.6} />
                {!sidebarCollapsed && (
                  <span className="sl-nav-label" style={{ flex: 1 }}>
                    {item.label}
                  </span>
                )}
                {!sidebarCollapsed && renderBadge(item)}
                {sidebarCollapsed && item.badge === "returns" && badges.returns > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--err)",
                    }}
                  />
                )}
                {sidebarCollapsed && item.badge === "dispatch" && badges.dispatch > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--warn)",
                    }}
                  />
                )}
                {sidebarCollapsed && item.badge === "eventsPulse" && badges.eventsPulse && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--ok)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {!sidebarCollapsed ? (
          userLoading ? (
            <SidebarUserSkeleton />
          ) : (
          <div
            className="sl-sidebar-user"
            style={{
              padding: "12px 14px",
              borderTop: "0.5px solid #2A2622",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: "#3A332D",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              }}
              title={currentUser?.email ?? "Not signed in"}
            >
              {userInitials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#fff",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userName}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--sidebar-mute)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userRoleLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="sl-sidebar-logout"
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon name="logout" size={14} />
            </button>
          </div>
          )
        ) : userLoading ? (
          <SidebarUserSkeleton collapsed />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "12px 0",
              borderTop: "0.5px solid #2A2622",
            }}
            title={currentUser ? `${userName} · ${userRoleLabel}` : "Not signed in"}
          >
            <div
              style={{
                position: "relative",
                width: 30,
                height: 30,
                borderRadius: 999,
                background: "#3A332D",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {userInitials}
              <span
                style={{
                  position: "absolute",
                  bottom: -1,
                  right: -1,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: currentUser ? "var(--ok)" : "var(--mute-2)",
                  border: "1.5px solid var(--sidebar)",
                }}
              />
            </div>
            <button
              type="button"
              onClick={logout}
              className="sl-sidebar-logout"
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon name="logout" size={14} />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="sl-sidebar-rail-toggle"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          style={{
            position: "absolute",
            right: -13,
            bottom: 22,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: "var(--sidebar)",
            color: "var(--sidebar-ink)",
            border: "0.5px solid var(--line-strong)",
            boxShadow: "0 4px 10px rgba(20,18,15,0.18), 0 1px 0 rgba(255,255,255,0.04) inset",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            zIndex: 20,
            transition: "transform 180ms ease, background 160ms ease, color 160ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent)";
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.transform = "scale(1.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--sidebar)";
            e.currentTarget.style.color = "var(--sidebar-ink)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Icon name={sidebarCollapsed ? "chevronR" : "chevronL"} size={13} stroke={2} />
        </button>
      </nav>

      <main className="sl-main" style={{ background: "var(--bg)" }} data-screen-label={activePage?.label ?? "SmartLogistics"}>
        <Outlet />
      </main>

      <AiPanel open={aiOpen} onToggle={() => setAiOpen((v) => !v)} context={aiContext} />

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </DateRangeProvider>
  );
}

function RootShell(): JSX.Element {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

const rootRoute = createRootRoute({ component: RootShell });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

// Pathless layout route: renders the authenticated app chrome (sidebar, AI panel)
// and guards all child routes. Anonymous users are redirected to /login by AppLayout.
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: () => <Navigate to="/overview" />,
});

const overviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/overview",
  component: OverviewPage,
});

const shipmentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/shipments",
  component: ShipmentsPage,
});

const dispatchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dispatch",
  component: DispatchPage,
});

const warehouseRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/warehouses",
  component: WarehousePage,
});

const warehouseLegacyRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/warehouse",
  component: () => <Navigate to="/warehouses" />,
});

const couriersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/couriers",
  component: CouriersPage,
});

const eventsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/events",
  component: EventsPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

const returnsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/returns",
  component: ReturnsPage,
});

const observabilityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/observability",
  component: ObservabilityPage,
});

const aiRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/ai",
  component: AiPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    overviewRoute,
    shipmentsRoute,
    dispatchRoute,
    warehouseRoute,
    warehouseLegacyRoute,
    couriersRoute,
    eventsRoute,
    analyticsRoute,
    returnsRoute,
    observabilityRoute,
    aiRoute,
  ]),
]);

export const router = createRouter({ routeTree });
