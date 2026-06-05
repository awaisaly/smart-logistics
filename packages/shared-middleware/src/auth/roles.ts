// ─────────────────────────────────────────────────────────────────────────────
// Canonical role definitions — the single source of truth for RBAC.
//
//   • `pages`       drive frontend nav/route access (page ids match the sidebar).
//   • `apiPrefixes` drive gateway authorization (gateway path prefixes the role
//                   may call). Each role's prefixes are the union of what its
//                   visible pages fetch, so enabling a page never causes a 403.
//
// user-service seeds these into the `roles` table on startup and the seed script
// uses them; the gateway loads them from GET /roles (with this list as fallback).
// ─────────────────────────────────────────────────────────────────────────────

export type RoleDef = {
  key: string;
  label: string;
  description: string;
  pages: string[];
  apiPrefixes: string[];
};

// Overview aggregates several services, so any role that can see it needs read
// access across these prefixes.
const COMMON_READ = ["/analytics", "/shipments", "/tracking", "/dispatch", "/warehouses", "/couriers", "/ai"];

export const ROLE_DEFS: RoleDef[] = [
  {
    key: "admin",
    label: "Administrator",
    description: "Full access to every console page and management API.",
    pages: ["overview", "shipments", "dispatch", "warehouse", "couriers", "events", "analytics", "returns", "observability", "ai"],
    apiPrefixes: ["/shipments", "/warehouses", "/couriers", "/dispatch", "/tracking", "/notifications", "/analytics", "/ai", "/users"]
  },
  {
    key: "warehouse_operator",
    label: "Warehouse Operator",
    description: "Inbound/outbound flows and the dispatch workflows moving them.",
    pages: ["overview", "shipments", "dispatch", "warehouse", "events", "ai"],
    apiPrefixes: COMMON_READ
  },
  {
    key: "customer_support",
    label: "Customer Support",
    description: "Cases, returns, SLAs and the analytics behind them.",
    pages: ["overview", "shipments", "returns", "analytics", "ai"],
    apiPrefixes: COMMON_READ
  },
  {
    key: "courier",
    label: "Courier",
    description: "Routes, deliveries and the shipments being carried.",
    pages: ["overview", "couriers", "shipments", "ai"],
    apiPrefixes: COMMON_READ
  }
];

export const ROLE_KEYS = ROLE_DEFS.map((r) => r.key);

export const ROLE_BY_KEY: Record<string, RoleDef> = Object.fromEntries(ROLE_DEFS.map((r) => [r.key, r]));
