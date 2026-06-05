// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control (RBAC) — data-driven
//
// Page access is no longer hardcoded in the frontend. The backend (user-service
// `roles.pages`, surfaced on the authenticated user as `user.pages`) is the
// single source of truth for which pages a role can see/reach. These helpers
// only sanitize that list and map between routes and page ids.
//
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

const ALL_PAGE_SET = new Set<string>(ALL_PAGES);

// Shared minimum used when a user has no pages yet (e.g. stale session) — every
// role at least gets the overview and the assistant.
const FALLBACK_PAGES: PageId[] = ["overview", "ai"];

// Pure UI routing: maps a route prefix to its page id. Independent of access.
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

const PAGE_TO_PATH: Record<PageId, string> = {
  overview: "/overview",
  shipments: "/shipments",
  dispatch: "/dispatch",
  warehouse: "/warehouses",
  couriers: "/couriers",
  events: "/events",
  analytics: "/analytics",
  returns: "/returns",
  observability: "/observability",
  ai: "/ai",
};

/** Sanitize the backend-provided page list to known page ids (preserving order). */
export function pagesForUser(pages?: string[] | null): PageId[] {
  const valid = (pages ?? []).filter((p): p is PageId => ALL_PAGE_SET.has(p));
  return valid.length > 0 ? valid : FALLBACK_PAGES;
}

export function canAccessPage(pages: string[] | null | undefined, page: PageId): boolean {
  return pagesForUser(pages).includes(page);
}

/** Resolve the top-level page id for a route pathname (e.g. "/shipments/SL-1" → "shipments"). */
export function pageIdForPath(pathname: string): PageId | null {
  const top = "/" + (pathname.replace(/^\//, "").split("/")[0] || "overview");
  return PATH_TO_PAGE[top] ?? null;
}

/** The landing route for a user: their first allowed page (overview for every role). */
export function defaultRouteForUser(pages?: string[] | null): string {
  const first = pagesForUser(pages)[0] ?? "overview";
  return PAGE_TO_PATH[first] ?? "/overview";
}
