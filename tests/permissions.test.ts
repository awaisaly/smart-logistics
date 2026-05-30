import { describe, expect, it } from "vitest";
import {
  canAccessPage,
  defaultRouteForRole,
  pageIdForPath,
  pagesForRole
} from "../apps/frontend/src/lib/permissions";

describe("RBAC page access", () => {
  it("gives admins every page", () => {
    expect(pagesForRole("admin")).toContain("observability");
    expect(canAccessPage("admin", "analytics")).toBe(true);
  });

  it("scopes warehouse operators to their surfaces", () => {
    expect(canAccessPage("warehouse_operator", "warehouse")).toBe(true);
    expect(canAccessPage("warehouse_operator", "observability")).toBe(false);
    expect(canAccessPage("warehouse_operator", "returns")).toBe(false);
  });

  it("scopes customer support to cases/returns/analytics", () => {
    expect(canAccessPage("customer_support", "returns")).toBe(true);
    expect(canAccessPage("customer_support", "dispatch")).toBe(false);
  });

  it("scopes couriers to routes and shipments", () => {
    expect(canAccessPage("courier", "couriers")).toBe(true);
    expect(canAccessPage("courier", "analytics")).toBe(false);
  });

  it("lets everyone reach overview and the AI assistant", () => {
    for (const role of ["admin", "warehouse_operator", "customer_support", "courier"]) {
      expect(canAccessPage(role, "overview")).toBe(true);
      expect(canAccessPage(role, "ai")).toBe(true);
    }
  });

  it("falls back to the shared minimum for unknown roles", () => {
    expect(pagesForRole("bogus")).toEqual(["overview", "ai"]);
    expect(canAccessPage(undefined, "shipments")).toBe(false);
  });

  it("resolves a nested route pathname to its top-level page", () => {
    expect(pageIdForPath("/shipments/SL-123")).toBe("shipments");
    expect(pageIdForPath("/warehouses")).toBe("warehouse");
    expect(pageIdForPath("/")).toBe("overview");
    expect(pageIdForPath("/totally-unknown")).toBeNull();
  });

  it("lands every role on overview by default", () => {
    expect(defaultRouteForRole("courier")).toBe("/overview");
    expect(defaultRouteForRole("admin")).toBe("/overview");
  });
});
