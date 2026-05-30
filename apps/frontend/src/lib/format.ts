export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCompact(value: unknown): string {
  const n = toNumber(value);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

export function pathnameLabel(endpoint: string): string {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local-time formatting
//
// Backend timestamps are stored/sent in UTC (ISO 8601). These helpers parse a
// value and render it in the *browser's* local timezone. Values that aren't
// real timestamps (e.g. "now", "tomorrow", "19:30 today") are passed through
// unchanged so free-form labels still display.
// ─────────────────────────────────────────────────────────────────────────────

function toLocalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Treat small numbers as epoch seconds, larger as milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function passthrough(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/** Local date + time, e.g. "May 30, 2026, 4:52:01 PM". */
export function formatDateTime(value: unknown, fallback = "—"): string {
  const d = toLocalDate(value);
  if (!d) return passthrough(value, fallback);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/** Local time only, e.g. "4:52:01 PM". Best for compact live feeds. */
export function formatTime(value: unknown, fallback = "—"): string {
  const d = toLocalDate(value);
  if (!d) return passthrough(value, fallback);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/** Local date only, e.g. "May 30, 2026". */
export function formatDate(value: unknown, fallback = "—"): string {
  const d = toLocalDate(value);
  if (!d) return passthrough(value, fallback);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
