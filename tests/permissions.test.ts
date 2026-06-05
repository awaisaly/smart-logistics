import { describe, expect, it } from "vitest";
import {
  canAccessPage,
  defaultRouteForUser,
  pageIdForPath,
  pagesForUser
} from "../apps/frontend/src/lib/permissions";

// Page access is now data-driven: the backend hands the frontend a `pages` list
// per user. These tests exercise the sanitizing/mapping helpers around that list.

const ADMIN_PAGES = ["overview", "shipments", "dispatch", "warehouse", "couriers", "events", "analytics", "returns", "observability", "ai"];
const WAREHOUSE_PAGES = ["overview", "shipments", "dispatch", "warehouse", "events", "ai"];
const SUPPORT_PAGES = ["overview", "shipments", "returns", "analytics", "ai"];
const COURIER_PAGES = ["overview", "couriers", "shipments", "ai"];

describe("RBAC page access (data-driven)", () => {
  it("keeps the full admin page list", () => {
    expect(pagesForUser(ADMIN_PAGES)).toContain("observability");
    expect(canAccessPage(ADMIN_PAGES, "analytics")).toBe(true);
  });

  it("scopes warehouse operators to their surfaces", () => {
    expect(canAccessPage(WAREHOUSE_PAGES, "warehouse")).toBe(true);
    expect(canAccessPage(WAREHOUSE_PAGES, "observability")).toBe(false);
    expect(canAccessPage(WAREHOUSE_PAGES, "returns")).toBe(false);
  });

  it("scopes customer support to cases/returns/analytics", () => {
    expect(canAccessPage(SUPPORT_PAGES, "returns")).toBe(true);
    expect(canAccessPage(SUPPORT_PAGES, "dispatch")).toBe(false);
  });

  it("scopes couriers to routes and shipments", () => {
    expect(canAccessPage(COURIER_PAGES, "couriers")).toBe(true);
    expect(canAccessPage(COURIER_PAGES, "analytics")).toBe(false);
  });

  it("drops unknown page ids from the backend list", () => {
    expect(pagesForUser(["overview", "bogus", "ai"])).toEqual(["overview", "ai"]);
  });

  it("falls back to the shared minimum when no pages are present", () => {
    expect(pagesForUser([])).toEqual(["overview", "ai"]);
    expect(pagesForUser(undefined)).toEqual(["overview", "ai"]);
    expect(canAccessPage(undefined, "shipments")).toBe(false);
  });

  it("resolves a nested route pathname to its top-level page", () => {
    expect(pageIdForPath("/shipments/SL-123")).toBe("shipments");
    expect(pageIdForPath("/warehouses")).toBe("warehouse");
    expect(pageIdForPath("/")).toBe("overview");
    expect(pageIdForPath("/totally-unknown")).toBeNull();
  });

  it("lands a user on their first allowed page", () => {
    expect(defaultRouteForUser(COURIER_PAGES)).toBe("/overview");
    expect(defaultRouteForUser(["couriers", "shipments"])).toBe("/couriers");
    expect(defaultRouteForUser([])).toBe("/overview");
  });
});
