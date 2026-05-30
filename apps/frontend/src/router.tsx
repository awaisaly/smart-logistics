import React from "react";
import { Link, Navigate, Outlet, createRootRoute, createRoute, createRouter, useNavigate, useRouterState } from "@tanstack/react-router";
import { OverviewPage } from "@/pages/OverviewPage";
import { ShipmentsPage, type ShipmentRow } from "@/pages/ShipmentsPage";
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
import { routeContextKey } from "@/lib/ai-context";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AuthProvider, useAuth } from "@/lib/auth";
import { canAccessPage, defaultRouteForRole, pageIdForPath, pagesForRole } from "@/lib/permissions";
import { DateRangeProvider } from "@/lib/date-range";

const API_BASE = "http://localhost:4000";

type NavItem = {
  to: string;
  id: string;
  label: string;
  icon: IconName;
  badge?: "returns" | "dispatch" | "eventsPulse";
};

type IconName = "home" | "package" | "workflow" | "warehouse" | "courier" | "events" | "chart" | "rotate" | "pulse" | "ai" | "search" | "truck" | "close" | "send" | "sparkle" | "chevronL" | "chevronR" | "logout";

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

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

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

function SkeletonBlock({ h = 14 }: { h?: number }): JSX.Element {
  return <div className="sl-skeleton" style={{ height: h, borderRadius: 6 }} />;
}

function PageCard({
  title,
  sub,
  action,
  children,
  padding,
  bodyStyle,
  style,
}: {
  title?: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padding?: number;
  bodyStyle?: React.CSSProperties;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", minWidth: 0, ...style }}>
      {(title || action || sub) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 14px 6px", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {title && <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{title}</div>}
            {sub && <div style={{ fontSize: 10.5, color: "var(--mute)", marginTop: 2 }}>{sub}</div>}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: padding ?? 14, paddingTop: title || sub || action ? 8 : padding ?? 14, minWidth: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function Icon({ name, size = 16, stroke = 1.6 }: { name: IconName; size?: number; stroke?: number }): JSX.Element | null {
  const paths: Record<IconName, JSX.Element> = {
    home: (
      <>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 9.5V21h14V9.5" />
      </>
    ),
    package: (
      <>
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 7v10l9 4 9-4V7" />
        <path d="M12 11v10" />
      </>
    ),
    workflow: (
      <>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.5 6H15.5M6 8.5v7M18 8.5v7M8.5 18h7" />
      </>
    ),
    warehouse: (
      <>
        <path d="M3 21V9l9-5 9 5v12" />
        <path d="M3 21h18" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
    courier: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
      </>
    ),
    events: (
      <>
        <path d="M4 6h16M4 12h10M4 18h16" />
        <circle cx="19" cy="12" r="1.6" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V4M4 20h16" />
        <path d="M8 16l3-4 3 2 5-7" />
      </>
    ),
    rotate: (
      <>
        <path d="M21 12a9 9 0 11-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    ai: (
      <>
        <path d="M12 3l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
        <path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>
    ),
    truck: (
      <>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7" />
        <circle cx="7" cy="18" r="1.8" />
        <circle cx="17" cy="18" r="1.8" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6L6 18" />,
    send: (
      <>
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4z" />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        <path d="M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" />
      </>
    ),
    chevronL: <path d="M15 6l-6 6 6 6" />,
    chevronR: <path d="M9 6l6 6-6 6" />,
    logout: (
      <>
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
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
    if (matches(row.id, q) || matches(row.to, q) || matches(row.from, q) || matches(row.courier, q) || matches(row.status, q)) {
      hits.push({
        category: "Shipments",
        id: String(row.id ?? ""),
        title: String(row.id ?? "Shipment"),
        subtitle: `${row.from ?? "?"} → ${row.to ?? "?"} · ${row.status ?? "unknown"}`,
        to: "/shipments",
        icon: "package",
      });
    }
  }
  for (const row of index.returns) {
    if (matches(row.id, q) || matches(row.shipment, q) || matches(row.customer, q) || matches(row.reason, q)) {
      hits.push({
        category: "Returns",
        id: String(row.id ?? ""),
        title: String(row.id ?? "Return"),
        subtitle: `${row.shipment ?? "?"} · ${row.reason ?? "?"}`,
        to: "/returns",
        icon: "rotate",
      });
    }
  }
  for (const row of index.exceptions) {
    if (matches(row.id, q) || matches(row.shipment, q) || matches(row.kind, q) || matches(row.owner, q)) {
      hits.push({
        category: "Exceptions",
        id: String(row.id ?? ""),
        title: String(row.kind ?? "Exception"),
        subtitle: `${row.shipment ?? "?"} · ${row.severity ?? "?"} · ${row.owner ?? "?"}`,
        to: "/returns",
        icon: "rotate",
      });
    }
  }
  for (const row of index.couriers) {
    if (matches(row.id, q) || matches(row.name, q) || matches(row.city, q) || matches(row.zone, q) || matches(row.status, q)) {
      hits.push({
        category: "Couriers",
        id: String(row.id ?? ""),
        title: `${row.name ?? "Courier"} (${row.id ?? "?"})`,
        subtitle: `${row.city ?? "?"} · ${row.zone ?? "?"} · ${row.status ?? "?"}`,
        to: "/couriers",
        icon: "courier",
      });
    }
  }
  for (const row of index.warehouses) {
    if (matches(row.id, q) || matches(row.name, q) || matches(row.city, q)) {
      hits.push({
        category: "Warehouses",
        id: String(row.id ?? ""),
        title: `${row.name ?? "Warehouse"} (${row.id ?? "?"})`,
        subtitle: `${row.city ?? "?"} · ${row.lanes ?? "?"} lanes`,
        to: "/warehouses",
        icon: "warehouse",
      });
    }
  }
  for (const row of index.workflows) {
    if (matches(row.id, q) || matches(row.shipment, q) || matches(row.type, q) || matches(row.status, q) || matches(row.step, q)) {
      hits.push({
        category: "Workflows",
        id: String(row.id ?? ""),
        title: String(row.id ?? "Workflow"),
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
    void Promise.allSettled([
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/shipments"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/shipments/returns"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/shipments/exceptions"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/couriers"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/warehouses"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/dispatch/workflows"),
    ])
      .then(([s, r, e, c, w, wf]) => {
        setIndex({
          shipments: s.status === "fulfilled" ? s.value.items ?? [] : [],
          returns: r.status === "fulfilled" ? r.value.items ?? [] : [],
          exceptions: e.status === "fulfilled" ? e.value.items ?? [] : [],
          couriers: c.status === "fulfilled" ? c.value.items ?? [] : [],
          warehouses: w.status === "fulfilled" ? w.value.items ?? [] : [],
          workflows: wf.status === "fulfilled" ? wf.value.items ?? [] : [],
        });
      })
      .finally(() => setLoading(false));
  }, [open]);

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
      return !page || canAccessPage(authUser?.role, page);
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
    const load = async () => {
      const [returnsMetrics, dispatchKpis, eventsKpis] = await Promise.allSettled([
        fetchJson<{ openExceptions?: number }>("/shipments/returns/metrics"),
        fetchJson<{ failing?: number }>("/dispatch/kpis"),
        fetchJson<{ totalThroughput?: number }>("/tracking/events/kpis"),
      ]);
      if (!alive) return;
      setBadges({
        returns: returnsMetrics.status === "fulfilled" ? (returnsMetrics.value.openExceptions ?? 0) : 0,
        dispatch: dispatchKpis.status === "fulfilled" ? (dispatchKpis.value.failing ?? 0) : 0,
        eventsPulse: eventsKpis.status === "fulfilled" ? (eventsKpis.value.totalThroughput ?? 0) > 0 : false,
      });
    };
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

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
  if (authUser && currentPageId && !canAccessPage(authUser.role, currentPageId)) {
    return <Navigate to={defaultRouteForRole(authUser.role)} />;
  }

  const allowedPages = pagesForRole(authUser?.role);
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

function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }): JSX.Element {
  return (
    <div className="sl-page-header">
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--ink)" }}>{title}</h1>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--mute)" }}>{sub}</p>}
      </div>
      {actions && <div className="sl-page-header-actions">{actions}</div>}
    </div>
  );
}

function PageBody({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="sl-page-body">{children}</div>;
}

function GenericRoutePage({ title, endpoint, extractItems }: { title: string; endpoint: string; extractItems: (v: any) => any[] }): JSX.Element {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void fetchJson<any>(endpoint)
      .then((v) => {
        if (!alive) return;
        setItems(extractItems(v));
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [endpoint, extractItems]);

  return (
    <>
      <PageHeader title={title} sub="Loading page data from backend services." actions={<div style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{pathnameLabel(endpoint)}</div>} />
      <PageBody>
        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            <PageCard title="Loading">
              <SkeletonBlock h={20} />
              <div style={{ height: 10 }} />
              <SkeletonBlock />
              <div style={{ height: 8 }} />
              <SkeletonBlock />
            </PageCard>
            <PageCard title="Loading rows">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <SkeletonBlock />
                </div>
              ))}
            </PageCard>
          </div>
        ) : error ? (
          <PageCard title="Error">
            <div style={{ color: "var(--err)", fontSize: 13 }}>{error}</div>
          </PageCard>
        ) : (
          <PageCard title={`${items.length} records`}>
            {items.length === 0 ? (
              <div style={{ color: "var(--mute)", fontSize: 13 }}>No data available.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {items.slice(0, 25).map((row, i) => (
                  <pre
                    key={i}
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: "var(--ink-2)",
                      background: "var(--surface-2)",
                      border: "0.5px solid var(--line)",
                      borderRadius: 8,
                      padding: 8,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ))}
              </div>
            )}
          </PageCard>
        )}
      </PageBody>
    </>
  );
}

function pathnameLabel(endpoint: string): string {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCompact(value: unknown): string {
  const n = toNumber(value);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

type PillTone = "neutral" | "ok" | "warn" | "err" | "info" | "accent";

function PrototypePill({ tone = "neutral", children, size = "md" }: { tone?: PillTone; children: React.ReactNode; size?: "sm" | "md" }): JSX.Element {
  const tones: Record<PillTone, { bg: string; fg: string }> = {
    neutral: { bg: "var(--neutral-soft)", fg: "var(--neutral)" },
    ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
    err: { bg: "var(--err-soft)", fg: "var(--err)" },
    info: { bg: "var(--info-soft)", fg: "var(--info)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent-ink)" },
  };
  const c = tones[tone] ?? tones.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: size === "sm" ? "2px 6px" : "3px 8px", borderRadius: 999, background: c.bg, color: c.fg, fontSize: size === "sm" ? 10.5 : 11, fontWeight: 500, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

type SegOption<T extends string> = T | { value: T; label: string };

function Segmented<T extends string>({ options, value, onChange }: { options: ReadonlyArray<SegOption<T>>; value: T; onChange: (v: T) => void }): JSX.Element {
  return (
    <div style={{ display: "inline-flex", border: "0.5px solid var(--line)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
      {options.map((o, i) => {
        const v = (typeof o === "object" && o !== null ? o.value : o) as T;
        const label = typeof o === "object" && o !== null ? o.label : String(o);
        const active = v === value;
        return (
          <button
            key={`${String(v)}-${i}`}
            onClick={() => onChange(v)}
            style={{
              padding: "5px 12px",
              fontSize: 11.5,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--bg)" : "var(--ink-2)",
              borderRight: i < options.length - 1 ? "0.5px solid var(--line)" : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

type TableColumn<R> = {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
  render?: (row: R) => React.ReactNode;
  width?: number | string;
};

function Table<R extends Record<string, any>>({
  columns,
  rows,
  idKey = "id",
  selectedId,
  onRowClick,
  dense,
  emptyText = "No rows available.",
}: {
  columns: Array<TableColumn<R>>;
  rows: R[];
  idKey?: string;
  selectedId?: string;
  onRowClick?: (row: R) => void;
  dense?: boolean;
  emptyText?: string;
}): JSX.Element {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: "14px 16px", fontSize: 11.5, color: "var(--mute)" }}>{emptyText}</div>;
  }
  return (
    <div style={{ overflow: "auto", minWidth: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: dense ? 11.5 : 12.5 }}>
        <thead>
          <tr style={{ background: "var(--bg-warm)", color: "var(--mute)" }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  padding: dense ? "6px 10px" : "8px 12px",
                  textAlign: c.align ?? "left",
                  fontWeight: 500,
                  width: c.width,
                  borderBottom: "0.5px solid var(--line)",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ridx) => {
            const id = String(row[idKey] ?? ridx);
            const active = selectedId !== undefined && String(selectedId) === id;
            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? "pointer" : "default", background: active ? "var(--info-soft)" : "transparent" }}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: dense ? "6px 10px" : "8px 12px",
                      borderBottom: "0.5px solid var(--line)",
                      textAlign: c.align ?? "left",
                      fontFamily: c.mono ? "var(--mono)" : undefined,
                      color: "var(--ink-2)",
                      verticalAlign: "middle",
                    }}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniStat({ label, value, unit, tone }: { label: string; value: React.ReactNode; unit?: string; tone?: "warn" | "err" }): JSX.Element {
  const color = tone === "warn" ? "var(--warn)" : tone === "err" ? "var(--err)" : "var(--ink)";
  return (
    <div style={{ padding: 10, background: "var(--bg-warm)", borderRadius: 8 }}>
      <div style={{ fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", color }}>{value}</span>
        {unit && <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{unit}</span>}
      </div>
    </div>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value?: React.ReactNode }): JSX.Element {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      <span style={{ color: "var(--ink-2)" }}>{label}</span>
      {value !== undefined && <span className="mono" style={{ color: "var(--mute)", marginLeft: 4 }}>{value}</span>}
    </span>
  );
}

function LoadBar({ load, capacity }: { load: number; capacity: number }): JSX.Element {
  const pct = (load / Math.max(capacity, 1)) * 100;
  const tone = pct >= 100 ? "var(--err)" : pct > 80 ? "var(--warn)" : "var(--ok)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 5, background: "var(--bg-warm)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: tone }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--mute)", minWidth: 32, textAlign: "right" }}>{load}/{capacity}</span>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  max,
  right,
  tone = "ink",
}: {
  label: string;
  value: number;
  max: number;
  right?: React.ReactNode;
  tone?: "ink" | "ok" | "warn" | "err";
}): JSX.Element {
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : tone === "err" ? "var(--err)" : "var(--ink)";
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <span style={{ color: "var(--ink-2)" }}>{label}</span>
        {right}
      </div>
      <div style={{ height: 6, borderRadius: 999, overflow: "hidden", background: "var(--bg-warm)" }}>
        <div style={{ width: `${Math.min(100, (value / Math.max(max, 1)) * 100)}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function Sparkline({ data, height = 32, width = 100, color = "var(--ink-2)" }: { data: number[]; height?: number; width?: number; color?: string }): JSX.Element {
  if (!data || data.length === 0) return <div style={{ height, width }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function BarChartSeries({
  data,
  series,
  height = 160,
  formatLabel,
  colors,
}: {
  data: Array<Record<string, unknown>>;
  series: string[];
  height?: number;
  formatLabel?: (label: string) => string;
  colors?: Record<string, string>;
}): JSX.Element {
  if (!data || data.length === 0) {
    return <div style={{ height, display: "grid", placeItems: "center", color: "var(--mute)", fontSize: 11.5 }}>No data.</div>;
  }
  const labelKey = Object.keys(data[0] ?? {}).find((k) => !series.includes(k)) ?? "h";
  const defaultColors: Record<string, string> = {
    dispatched: "var(--ink-2)",
    delivered: "var(--ok)",
    failed: "var(--err)",
    inbound: "var(--info)",
    outbound: "var(--accent)",
  };
  const colorMap = { ...defaultColors, ...(colors ?? {}) };
  const max = Math.max(...data.flatMap((d) => series.map((s) => toNumber(d[s]))), 1);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: 4, height }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 2, alignItems: "flex-end", minWidth: 0 }}>
            {series.map((s) => (
              <div key={s} style={{ flex: 1, height: `${(toNumber(d[s]) / max) * 100}%`, background: colorMap[s] ?? "var(--ink-2)", borderRadius: "3px 3px 0 0" }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: 4 }}>
        {data.map((d, i) => (
          <span key={i} style={{ textAlign: "center", fontSize: 9.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>
            {formatLabel ? formatLabel(String(d[labelKey])) : String(d[labelKey] ?? "")}
          </span>
        ))}
      </div>
    </div>
  );
}

function SlaPie({ data }: { data: Array<{ label: string; value: number; color: string }> }): JSX.Element {
  if (!Array.isArray(data) || data.length === 0) {
    return <div style={{ color: "var(--mute)", fontSize: 11.5 }}>No SLA data available.</div>;
  }
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  const r = 60;
  const c = 2 * Math.PI * r;
  const headline = data[0]!;
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={150} height={150} viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-warm)" strokeWidth="18" />
        {data.map((d, i) => {
          const dash = (d.value / total) * c;
          const seg = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += dash;
          return seg;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="22" fontWeight="500" fill="var(--ink)" fontFamily="var(--sans)" style={{ letterSpacing: "-0.02em" }}>
          {Math.round((headline.value / total) * 100)}%
        </text>
        <text x="80" y="92" textAnchor="middle" fontSize="9" fill="var(--mute)" letterSpacing="0.1em">
          {headline.label.toUpperCase()}
        </text>
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
              <span style={{ color: "var(--ink-2)" }}>{d.label}</span>
            </span>
            <span className="mono" style={{ color: "var(--ink)", fontWeight: 500 }}>
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RmaStage({ stage }: { stage: string }): JSX.Element {
  const stages = ["requested", "approved", "in_transit", "received", "refunded"];
  const lowered = stage.toLowerCase();
  const idx = lowered === "rejected" ? -1 : stages.indexOf(lowered);
  return (
    <div style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {stages.map((s, i) => (
        <span
          key={s}
          style={{
            width: 18,
            height: 5,
            borderRadius: 999,
            background: idx >= 0 && i <= idx ? (i === stages.length - 1 ? "var(--ok)" : "var(--accent)") : lowered === "rejected" ? "var(--err)" : "var(--bg-warm)",
          }}
        />
      ))}
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)", marginLeft: 6 }}>{lowered || "unknown"}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }): JSX.Element {
  const s = String(status ?? "").toLowerCase();
  const map: Record<string, { tone: PillTone; label?: string }> = {
    delivered: { tone: "ok" },
    in_transit: { tone: "info", label: "in transit" },
    "in-transit": { tone: "info", label: "in transit" },
    out_for_delivery: { tone: "accent", label: "out for delivery" },
    "out-for-delivery": { tone: "accent", label: "out for delivery" },
    picked: { tone: "info" },
    created: { tone: "neutral" },
    dispatched: { tone: "info" },
    attempted: { tone: "warn" },
    exception: { tone: "err" },
    failed: { tone: "err" },
    returned: { tone: "warn" },
    available: { tone: "ok" },
    active: { tone: "info" },
    on_route: { tone: "info", label: "on route" },
    off: { tone: "neutral" },
    break: { tone: "neutral" },
    running: { tone: "info" },
    failing: { tone: "err" },
    compensating: { tone: "warn" },
    completed: { tone: "ok" },
    scheduled: { tone: "neutral" },
  };
  const cfg = map[s] ?? { tone: "neutral" };
  return <PrototypePill tone={cfg.tone} size="sm">{cfg.label ?? s.replace(/_/g, " ")}</PrototypePill>;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: "0.5px dashed var(--line)", fontSize: 12 }}>
      <span style={{ color: "var(--mute)" }}>{label}</span>
      <span style={{ color: "var(--ink-2)", textAlign: "right" }}>{children}</span>
    </div>
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
