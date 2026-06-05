// ─────────────────────────────────────────────────────────────────────────────
// Gateway authorization policy
//
// Pure, dependency-free helpers so the policy can be unit tested without booting
// Fastify. The gateway loads the role → allowed-prefix map from the user-service
// (GET /roles) and falls back to the canonical ROLE_DEFS shipped in
// shared-middleware.
// ─────────────────────────────────────────────────────────────────────────────

export type RolePolicy = Map<string, Set<string>>;

export type RoleConfig = { key: string; apiPrefixes: string[] };

export function buildPolicy(defs: RoleConfig[]): RolePolicy {
  const policy: RolePolicy = new Map();
  for (const def of defs) policy.set(def.key, new Set(def.apiPrefixes));
  return policy;
}

// Paths reachable without a valid access token.
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

// First path segment with a leading slash, e.g. "/shipments/123" → "/shipments".
export function topPrefix(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return `/${seg}`;
}

export function isAuthorized(policy: RolePolicy, role: string, pathname: string): boolean {
  // /auth/* (other than the public ones) only requires authentication, except
  // account creation which is an admin operation.
  if (pathname === "/auth/me" || pathname.startsWith("/auth/")) {
    if (pathname.startsWith("/auth/register")) return role === "admin";
    return true;
  }
  // User administration is admin-only.
  if (topPrefix(pathname) === "/users") return role === "admin";
  return policy.get(role)?.has(topPrefix(pathname)) ?? false;
}
