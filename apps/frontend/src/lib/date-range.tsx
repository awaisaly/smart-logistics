import React from "react";

export type DateRangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export type DateRange = {
  /** Inclusive lower bound as an ISO timestamp. */
  from: string;
  /** Inclusive upper bound as an ISO timestamp. */
  to: string;
};

export type DateRangeContextValue = {
  preset: DateRangePreset;
  from: string;
  to: string;
  /** Switch to a named preset (today / 7d / 30d / 90d). */
  setPreset: (preset: Exclude<DateRangePreset, "custom">) => void;
  /** Set an explicit custom range from two `YYYY-MM-DD` date strings. */
  setCustom: (fromDate: string, toDate: string) => void;
  /** Human-readable label for the active range, for headers/footers. */
  label: string;
};

const STORAGE_KEY = "sl.dateRange";

const DateRangeContext = React.createContext<DateRangeContextValue | null>(null);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Computes ISO from/to bounds for a named preset. "today" runs from local
// start-of-day through now; multi-day presets span N days back through now.
function boundsForPreset(preset: Exclude<DateRangePreset, "custom">): DateRange {
  const now = new Date();
  const to = now.toISOString();
  if (preset === "today") {
    return { from: startOfDay(now).toISOString(), to };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const fromDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60_000);
  return { from: startOfDay(fromDate).toISOString(), to };
}

type PersistedRange = { preset: DateRangePreset; from?: string; to?: string };

function readStored(): PersistedRange | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRange;
  } catch {
    return null;
  }
}

function presetLabel(preset: DateRangePreset, from: string, to: string): string {
  if (preset === "today") return "Today";
  if (preset === "7d") return "Last 7 days";
  if (preset === "30d") return "Last 30 days";
  if (preset === "90d") return "Last 90 days";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function DateRangeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = React.useState<{ preset: DateRangePreset; from: string; to: string }>(() => {
    const stored = readStored();
    if (stored && stored.preset === "custom" && stored.from && stored.to) {
      return { preset: "custom", from: stored.from, to: stored.to };
    }
    const stage: Exclude<DateRangePreset, "custom"> =
      stored?.preset === "7d" || stored?.preset === "30d" || stored?.preset === "90d" ? stored.preset : "today";
    return { preset: stage, ...boundsForPreset(stage) };
  });

  const persist = React.useCallback((next: { preset: DateRangePreset; from: string; to: string }) => {
    setState(next);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preset: next.preset, from: next.from, to: next.to })
      );
    } catch {
      /* ignore */
    }
  }, []);

  const setPreset = React.useCallback(
    (preset: Exclude<DateRangePreset, "custom">) => {
      const bounds = boundsForPreset(preset);
      persist({ preset, ...bounds });
    },
    [persist]
  );

  const setCustom = React.useCallback(
    (fromDate: string, toDate: string) => {
      const from = startOfDay(new Date(fromDate)).toISOString();
      const to = endOfDay(new Date(toDate)).toISOString();
      persist({ preset: "custom", from, to });
    },
    [persist]
  );

  const value = React.useMemo<DateRangeContextValue>(
    () => ({
      preset: state.preset,
      from: state.from,
      to: state.to,
      setPreset,
      setCustom,
      label: presetLabel(state.preset, state.from, state.to),
    }),
    [state, setPreset, setCustom]
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange(): DateRangeContextValue {
  const ctx = React.useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within a DateRangeProvider");
  return ctx;
}
