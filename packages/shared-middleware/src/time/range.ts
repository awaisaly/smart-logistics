export type RangeQuery = { from?: string; to?: string };
export type RangeBounds = { from: Date; to: Date };

/**
 * Resolve `from`/`to` ISO query params into inclusive Date bounds. When a
 * param is absent or unparseable it falls back to "today" — server-local
 * start-of-day for `from`, now for `to` — so every range-aware endpoint
 * honours the "today by default" contract, even for direct API calls.
 *
 * This is the single source of truth for date-range parsing across services
 * (SQL `created_at` filters and the Mongo equivalent).
 */
export function rangeBounds(query: RangeQuery, now: Date = new Date()): RangeBounds {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const parse = (raw: string | undefined, fallback: Date): Date => {
    if (!raw) return fallback;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? fallback : d;
  };
  return { from: parse(query.from, startOfToday), to: parse(query.to, now) };
}

/** Same as `rangeBounds`, returning ISO strings for SQL parameter binding. */
export function parseRange(query: RangeQuery, now: Date = new Date()): { from: string; to: string } {
  const { from, to } = rangeBounds(query, now);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Mongo `created_at` range filter, defaulting to "today" like `parseRange`. */
export function rangeFilter(query: RangeQuery, now: Date = new Date()): { created_at: { $gte: Date; $lte: Date } } {
  const { from, to } = rangeBounds(query, now);
  return { created_at: { $gte: from, $lte: to } };
}
