// Gateway authorization — maps proxied paths + HTTP methods to granular permissions.

import { PERMISSIONS, type Permission } from "@smartlogistics/shared-types";

export type RoutePermission = { read: Permission; write: Permission };

export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  "/users": { read: PERMISSIONS.USERS_READ, write: PERMISSIONS.USERS_WRITE },
  "/roles": { read: PERMISSIONS.ROLES_READ, write: PERMISSIONS.ROLES_WRITE },
  "/shipments": { read: PERMISSIONS.SHIPMENTS_READ, write: PERMISSIONS.SHIPMENTS_WRITE },
  "/warehouses": { read: PERMISSIONS.WAREHOUSE_READ, write: PERMISSIONS.WAREHOUSE_WRITE },
  "/couriers": { read: PERMISSIONS.COURIERS_READ, write: PERMISSIONS.COURIERS_WRITE },
  "/dispatch": { read: PERMISSIONS.DISPATCH_READ, write: PERMISSIONS.DISPATCH_WRITE },
  "/tracking": { read: PERMISSIONS.TRACKING_READ, write: PERMISSIONS.TRACKING_READ },
  "/notifications": { read: PERMISSIONS.NOTIFICATIONS_READ, write: PERMISSIONS.NOTIFICATIONS_READ },
  "/analytics": { read: PERMISSIONS.ANALYTICS_READ, write: PERMISSIONS.ANALYTICS_READ },
  "/ai": { read: PERMISSIONS.AI_USE, write: PERMISSIONS.AI_USE }
};

export function isWriteMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

export function topPrefix(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return `/${seg}`;
}

export function requiredPermission(pathname: string, method: string): Permission | null {
  if (pathname.startsWith("/auth/register")) return PERMISSIONS.USERS_WRITE;
  const route = ROUTE_PERMISSIONS[topPrefix(pathname)];
  if (!route) return null;
  return isWriteMethod(method) ? route.write : route.read;
}

export function isAuthorized(
  permissions: readonly string[] | null | undefined,
  pathname: string,
  method: string
): boolean {
  if (pathname === "/auth/me" || (pathname.startsWith("/auth/") && !pathname.startsWith("/auth/register"))) {
    return true;
  }
  const required = requiredPermission(pathname, method);
  if (!required) return false;
  return (permissions ?? []).includes(required);
}

export const PUBLIC_PATHS = new Set([
  "/health",
  "/metrics",
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/demo-accounts"
]);

export function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}
