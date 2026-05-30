import React from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { fetchJson } from "@/lib/api";
import { routeContextKey } from "@/lib/ai-context";
import { NAV } from "@/lib/nav";
import { deriveUserInitials, deriveUserName, formatRole, type CurrentUser } from "@/lib/user";
import { usePersistedState } from "@/hooks/usePersistedState";
import { AiPanel } from "@/components/features/ai-panel";
import { SearchDialog } from "@/components/features/search-dialog";
import { Icon } from "@/components/ui/icon";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppLayout(): JSX.Element {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [badges, setBadges] = React.useState({ returns: 0, dispatch: 0, eventsPulse: false });
  const [aiOpen, setAiOpen] = usePersistedState<boolean>("sl.aiOpen", true);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState<boolean>("sl.sidebarCollapsed", false);
  const [currentUser, setCurrentUser] = React.useState<CurrentUser | null>(null);
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
    void fetchJson<{ items?: CurrentUser[] }>("/users")
      .then((res) => {
        if (!alive) return;
        const users = res.items ?? [];
        const admin = users.find((u) => u.role === "admin");
        const chosen = admin ?? users[0];
        if (chosen) setCurrentUser(chosen);
      })
      .catch(() => {
        // fall back to anonymous placeholder
      });
    return () => {
      alive = false;
    };
  }, []);

  const userName = currentUser ? deriveUserName(currentUser.email) : "Guest user";
  const userInitials = currentUser ? deriveUserInitials(currentUser.email) : "GU";
  const userRoleLabel = currentUser ? formatRole(currentUser.role) : "Not signed in";

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

  return (
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
          {NAV.map((item) => {
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
            <span
              title={currentUser ? "Signed in" : "Not signed in"}
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: currentUser ? "var(--ok)" : "var(--mute-2)",
                flexShrink: 0,
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
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
  );
}
