import { describe, expect, it } from "vitest";
import { checkIdempotency } from "../packages/shared-middleware/src/idempotency/redis-idempotency";

describe("idempotency keys", () => {
  it("accepts a key the first time and rejects repeats", () => {
    const key = `op-${Math.random()}`;
    expect(checkIdempotency(key)).toBe(true);
    expect(checkIdempotency(key)).toBe(false);
    expect(checkIdempotency(key)).toBe(false);
  });

  it("treats distinct keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(checkIdempotency(a)).toBe(true);
    expect(checkIdempotency(b)).toBe(true);
  });
});
