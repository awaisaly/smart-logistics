// ─────────────────────────────────────────────────────────────────────────────
// Portal permission catalog — shared across gateway, user-service, and frontend.
//
// Format: `<resource>:<action>` where action is typically `read` or `write`.
// Roles store a subset of these strings in the database; authorization checks
// the caller's permission list (carried in the JWT after login).
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Platform administration
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  ROLES_READ: "roles:read",
  ROLES_WRITE: "roles:write",

  // Portal modules
  SHIPMENTS_READ: "shipments:read",
  SHIPMENTS_WRITE: "shipments:write",
  DISPATCH_READ: "dispatch:read",
  DISPATCH_WRITE: "dispatch:write",
  WAREHOUSE_READ: "warehouse:read",
  WAREHOUSE_WRITE: "warehouse:write",
  COURIERS_READ: "couriers:read",
  COURIERS_WRITE: "couriers:write",
  ANALYTICS_READ: "analytics:read",
  RETURNS_READ: "returns:read",
  RETURNS_WRITE: "returns:write",
  TRACKING_READ: "tracking:read",
  NOTIFICATIONS_READ: "notifications:read",
  AI_USE: "ai:use",
  OBSERVABILITY_READ: "observability:read"
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export function hasPermission(
  granted: readonly string[] | null | undefined,
  required: Permission
): boolean {
  return (granted ?? []).includes(required);
}

export function hasAnyPermission(
  granted: readonly string[] | null | undefined,
  required: readonly Permission[]
): boolean {
  const set = new Set(granted ?? []);
  return required.some((p) => set.has(p));
}
