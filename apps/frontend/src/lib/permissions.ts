// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control (RBAC)
//
// Each role only sees and can reach the pages relevant to its job. `overview` and
// the AI assistant are shared by everyone; everything else is scoped per role.
// Page ids match the sidebar NAV item ids in router.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_PAGES = [
  "overview",
  "shipments",
  "dispatch",
  "warehouse",
  "couriers",
  "events",
  "analytics",
  "returns",
  "observability",
  "ai",
] as const;

export type PageId = (typeof ALL_PAGES)[number];

export const ROLE_PAGE_ACCESS: Record<string, PageId[]> = {
  // Administrators run the whole operation.
  admin: [...ALL_PAGES],

  // Warehouse operators care about inbound/outbound flows and the workflows moving them.
  warehouse_operator: ["overview", "shipments", "dispatch", "warehouse", "events", "ai"],

  // Customer support handles cases, returns, SLAs and the analytics behind them.
  customer_support: ["overview", "shipments", "returns", "analytics", "ai"],

  // Couriers focus on their routes, deliveries and the shipments they carry.
  courier: ["overview", "couriers", "shipments", "ai"],
};

// Fallback for unknown/missing roles: the shared minimum.
const FALLBACK_PAGES: PageId[] = ["overview", "ai"];

const PATH_TO_PAGE: Record<string, PageId> = {
  "/overview": "overview",
  "/shipments": "shipments",
  "/dispatch": "dispatch",
  "/warehouses": "warehouse",
  "/warehouse": "warehouse",
  "/couriers": "couriers",
  "/events": "events",
  "/analytics": "analytics",
  "/returns": "returns",
  "/observability": "observability",
  "/ai": "ai",
};

export function pagesForRole(role?: string | null): PageId[] {
  return ROLE_PAGE_ACCESS[role ?? ""] ?? FALLBACK_PAGES;
}

export function canAccessPage(role: string | undefined | null, page: PageId): boolean {
  return pagesForRole(role).includes(page);
}

/** Resolve the top-level page id for a route pathname (e.g. "/shipments/SL-1" → "shipments"). */
export function pageIdForPath(pathname: string): PageId | null {
  const top = "/" + (pathname.replace(/^\//, "").split("/")[0] || "overview");
  return PATH_TO_PAGE[top] ?? null;
}

/** The landing route for a role: its first allowed page (overview for every role). */
export function defaultRouteForRole(role?: string | null): string {
  const first = pagesForRole(role)[0] ?? "overview";
  const entry = Object.entries(PATH_TO_PAGE).find(([, page]) => page === first);
  return entry?.[0] ?? "/overview";
}
