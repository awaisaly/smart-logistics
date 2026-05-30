import { describe, expect, it } from "vitest";
import { parseRange, rangeBounds, rangeFilter } from "../packages/shared-middleware/src/time/range";

// Use a fixed "now" so assertions are deterministic regardless of when tests run.
const NOW = new Date("2026-05-30T16:11:00.000Z");

describe("date-range parsing", () => {
  it("defaults to today (start-of-day → now) when no params are given", () => {
    const { from, to } = rangeBounds({}, NOW);
    expect(to.getTime()).toBe(NOW.getTime());
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getSeconds()).toBe(0);
    // start-of-day is the same calendar day as now and not after it
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime());
    expect(from.getDate()).toBe(NOW.getDate());
  });

  it("honours explicit from/to ISO values", () => {
    const { from, to } = parseRange(
      { from: "2026-03-01T00:00:00.000Z", to: "2026-03-31T23:59:59.000Z" },
      NOW
    );
    expect(from).toBe("2026-03-01T00:00:00.000Z");
    expect(to).toBe("2026-03-31T23:59:59.000Z");
  });

  it("falls back to today bounds for unparseable values", () => {
    const today = rangeBounds({}, NOW);
    const { from, to } = rangeBounds({ from: "not-a-date", to: "also-bad" }, NOW);
    expect(from.getTime()).toBe(today.from.getTime());
    expect(to.getTime()).toBe(today.to.getTime());
  });

  it("falls back per-field when only one bound is valid", () => {
    const { from, to } = parseRange({ from: "2026-01-01T00:00:00.000Z" }, NOW);
    expect(from).toBe("2026-01-01T00:00:00.000Z");
    expect(to).toBe(NOW.toISOString()); // missing `to` → now
  });

  it("produces a Mongo created_at filter with matching bounds", () => {
    const filter = rangeFilter({ from: "2026-02-01T00:00:00.000Z" }, NOW);
    expect(filter.created_at.$gte.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(filter.created_at.$lte.getTime()).toBe(NOW.getTime());
  });
});
