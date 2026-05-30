import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { fetchJson } from "@/lib/api";
import { buildSearchHits, EMPTY_INDEX, type SearchHit, type SearchIndex } from "@/lib/search";
import { Icon } from "@/components/ui/icon";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const navigate = useNavigate();
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

  const hits = React.useMemo(() => buildSearchHits(index, query), [index, query]);
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
