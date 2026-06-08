import { describe, expect, it, beforeAll } from "vitest";
import { isAuthorized, isPublic } from "../apps/services/api-gateway/src/authz";
import { ALL_PERMISSIONS, PERMISSIONS } from "../packages/shared-types/src/permissions";
import { signAccessToken, verifyAccessToken } from "../packages/shared-middleware/src/index";

const ADMIN_PERMS = [...ALL_PERMISSIONS];

const WAREHOUSE_PERMS = [
  PERMISSIONS.SHIPMENTS_READ,
  PERMISSIONS.SHIPMENTS_WRITE,
  PERMISSIONS.DISPATCH_READ,
  PERMISSIONS.TRACKING_READ
];

const COURIER_PERMS = [PERMISSIONS.SHIPMENTS_READ, PERMISSIONS.COURIERS_READ, PERMISSIONS.AI_USE];

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

describe("gateway permission authorization", () => {
  it("lets admins reach user/role administration and service APIs", () => {
    expect(isAuthorized(ADMIN_PERMS, "/users", "GET")).toBe(true);
    expect(isAuthorized(ADMIN_PERMS, "/users/abc", "PATCH")).toBe(true);
    expect(isAuthorized(ADMIN_PERMS, "/roles", "GET")).toBe(true);
    expect(isAuthorized(ADMIN_PERMS, "/roles", "POST")).toBe(true);
    expect(isAuthorized(ADMIN_PERMS, "/shipments", "GET")).toBe(true);
    expect(isAuthorized(ADMIN_PERMS, "/notifications", "GET")).toBe(true);
  });

  it("denies non-admins access to user and role administration", () => {
    expect(isAuthorized(COURIER_PERMS, "/users", "GET")).toBe(false);
    expect(isAuthorized(WAREHOUSE_PERMS, "/users", "GET")).toBe(false);
    expect(isAuthorized(COURIER_PERMS, "/roles", "GET")).toBe(false);
  });

  it("only callers with users:write may register accounts", () => {
    expect(isAuthorized(ADMIN_PERMS, "/auth/register", "POST")).toBe(true);
    expect(isAuthorized(COURIER_PERMS, "/auth/register", "POST")).toBe(false);
  });

  it("allows any authenticated role to read its own profile", () => {
    for (const perms of [ADMIN_PERMS, COURIER_PERMS, WAREHOUSE_PERMS]) {
      expect(isAuthorized(perms, "/auth/me", "GET")).toBe(true);
    }
  });

  it("authorizes read prefixes when the matching read permission is granted", () => {
    expect(isAuthorized(COURIER_PERMS, "/shipments/SL-1", "GET")).toBe(true);
    expect(isAuthorized(WAREHOUSE_PERMS, "/tracking/events/recent", "GET")).toBe(true);
  });

  it("requires write permission for mutating requests", () => {
    expect(isAuthorized(COURIER_PERMS, "/shipments/SL-1", "POST")).toBe(false);
    expect(isAuthorized(ADMIN_PERMS, "/shipments/SL-1", "POST")).toBe(true);
  });

  it("denies routes outside the permission map", () => {
    expect(isAuthorized(COURIER_PERMS, "/totally-unknown", "GET")).toBe(false);
  });

  it("denies empty permission lists", () => {
    expect(isAuthorized([], "/shipments", "GET")).toBe(false);
    expect(isAuthorized([], "/auth/me", "GET")).toBe(true);
  });
});

describe("access token sign/verify", () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = "test-secret-for-gateway-authz";
  });

  it("round-trips claims including permissions through a signed JWT", () => {
    const token = signAccessToken({
      sub: "u1",
      email: "a@b.c",
      role: "Administrator",
      roleId: "10000000-0000-4000-8000-000000000001",
      permissions: [PERMISSIONS.USERS_WRITE, PERMISSIONS.SHIPMENTS_READ]
    });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe("u1");
    expect(claims.email).toBe("a@b.c");
    expect(claims.role).toBe("Administrator");
    expect(claims.roleId).toBe("10000000-0000-4000-8000-000000000001");
    expect(claims.permissions).toEqual([PERMISSIONS.USERS_WRITE, PERMISSIONS.SHIPMENTS_READ]);
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "u1", email: "a@b.c", role: "admin" });
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});
