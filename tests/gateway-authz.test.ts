import { describe, expect, it, beforeAll } from "vitest";
import { buildPolicy, isAuthorized, isPublic } from "../apps/services/api-gateway/src/authz";
import { ROLE_DEFS, signAccessToken, verifyAccessToken } from "../packages/shared-middleware/src/index";

const policy = buildPolicy(ROLE_DEFS);

describe("gateway public allowlist", () => {
  it("treats auth + health/metrics endpoints as public", () => {
    for (const p of ["/health", "/metrics", "/auth/login", "/auth/refresh", "/auth/logout", "/auth/demo-accounts"]) {
      expect(isPublic(p)).toBe(true);
    }
  });

  it("treats everything else as protected", () => {
    for (const p of ["/shipments", "/users", "/auth/me", "/analytics/overview"]) {
      expect(isPublic(p)).toBe(false);
    }
  });
});

describe("gateway prefix authorization", () => {
  it("lets admins reach user administration and every service prefix", () => {
    expect(isAuthorized(policy, "admin", "/users")).toBe(true);
    expect(isAuthorized(policy, "admin", "/users/abc")).toBe(true);
    expect(isAuthorized(policy, "admin", "/shipments")).toBe(true);
    expect(isAuthorized(policy, "admin", "/notifications")).toBe(true);
  });

  it("denies non-admins access to user administration", () => {
    expect(isAuthorized(policy, "courier", "/users")).toBe(false);
    expect(isAuthorized(policy, "warehouse_operator", "/users")).toBe(false);
  });

  it("only admins may create accounts", () => {
    expect(isAuthorized(policy, "admin", "/auth/register")).toBe(true);
    expect(isAuthorized(policy, "courier", "/auth/register")).toBe(false);
  });

  it("allows any authenticated role to read its own profile", () => {
    for (const role of ROLE_DEFS.map((r) => r.key)) {
      expect(isAuthorized(policy, role, "/auth/me")).toBe(true);
    }
  });

  it("authorizes shared read prefixes for non-admin roles", () => {
    expect(isAuthorized(policy, "courier", "/shipments/SL-1")).toBe(true);
    expect(isAuthorized(policy, "warehouse_operator", "/tracking/events/recent")).toBe(true);
  });

  it("denies prefixes outside a role's policy", () => {
    expect(isAuthorized(policy, "courier", "/notifications")).toBe(false);
    expect(isAuthorized(policy, "courier", "/totally-unknown")).toBe(false);
  });

  it("denies unknown roles everything except authenticated /auth", () => {
    expect(isAuthorized(policy, "ghost", "/shipments")).toBe(false);
    expect(isAuthorized(policy, "ghost", "/auth/me")).toBe(true);
  });
});

describe("access token sign/verify", () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = "test-secret-for-gateway-authz";
  });

  it("round-trips claims through a signed JWT", () => {
    const token = signAccessToken({ sub: "u1", email: "a@b.c", role: "admin", roleId: 1 });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe("u1");
    expect(claims.email).toBe("a@b.c");
    expect(claims.role).toBe("admin");
    expect(claims.roleId).toBe(1);
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "u1", email: "a@b.c", role: "admin" });
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});
