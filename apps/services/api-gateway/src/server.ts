import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the workspace-root .env so JWT_ACCESS_SECRET is available when running
// under `tsx` without the vars exported in the shell.
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env"));
} catch {
  // .env is optional; fall back to ambient environment variables.
}

import type { IncomingHttpHeaders } from "node:http";
import Fastify, { type FastifyRequest, type RawServerBase, type RouteGenericInterface } from "fastify";
import proxy from "@fastify/http-proxy";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import {
  attachRequestId,
  buildLogger,
  setupMetrics,
  bearerFromHeader,
  verifyAccessToken
} from "@smartlogistics/shared-middleware";
import { isAuthorized, isPublic } from "./authz.js";

// Carry the verified identity from the auth hook to the proxy header rewrite.
declare module "fastify" {
  interface FastifyRequest {
    authUserId?: string;
    authUserRole?: string;
  }
}

const app = Fastify({ logger: buildLogger("api-gateway") });
setupMetrics(app, "api-gateway");
const upstream = {
  user: process.env.USER_SERVICE_UPSTREAM ?? "http://localhost:4001",
  shipment: process.env.SHIPMENT_SERVICE_UPSTREAM ?? "http://localhost:4002",
  warehouse: process.env.WAREHOUSE_SERVICE_UPSTREAM ?? "http://localhost:4003",
  courier: process.env.COURIER_SERVICE_UPSTREAM ?? "http://localhost:4004",
  dispatch: process.env.DISPATCH_SERVICE_UPSTREAM ?? "http://localhost:4005",
  tracking: process.env.TRACKING_SERVICE_UPSTREAM ?? "http://localhost:4006",
  notification: process.env.NOTIFICATION_SERVICE_UPSTREAM ?? "http://localhost:4007",
  analytics: process.env.ANALYTICS_SERVICE_UPSTREAM ?? "http://localhost:4008",
  ai: process.env.AI_SERVICE_UPSTREAM ?? "http://localhost:4009"
};

// Replace any client-supplied identity headers with the verified identity so a
// downstream service can trust x-user-id / x-user-role (defense in depth).
function rewriteRequestHeaders(
  req: FastifyRequest<RouteGenericInterface, RawServerBase>,
  headers: IncomingHttpHeaders
): IncomingHttpHeaders {
  const next: IncomingHttpHeaders = { ...headers };
  delete next["x-user-id"];
  delete next["x-user-role"];
  if (req.authUserId) next["x-user-id"] = req.authUserId;
  if (req.authUserRole) next["x-user-role"] = req.authUserRole;
  return next;
}

// A single dashboard page fans out to ~14 endpoints (doubled under React
// StrictMode in dev) plus background polling, so the cap is generous and
// configurable. Auth-recovery and health/metrics are never throttled, otherwise
// a capped client could not refresh or log back in until the window reset.
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW ?? "1 minute";
await app.register(rateLimit, {
  max: RATE_LIMIT_MAX,
  timeWindow: RATE_LIMIT_WINDOW,
  allowList: (req) => {
    const pathname = (req.url ?? "").split("?")[0];
    return pathname === "/health" || pathname === "/metrics" || pathname.startsWith("/auth/");
  }
});
await app.register(cors, { origin: true, credentials: true });
app.addHook("onRequest", attachRequestId);

// Centralized authN + authZ for every proxied request. Permissions are resolved
// at login and carried in the JWT; the gateway checks them against the path and
// HTTP method — no hardcoded admin role id or policy cache.
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS") return; // CORS preflight
  const pathname = request.url.split("?")[0];
  if (isPublic(pathname)) return;

  const token = bearerFromHeader(request.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: "Unauthorized", message: "Missing bearer token" });
    return reply;
  }
  let role: string;
  let permissions: string[];
  try {
    const claims = verifyAccessToken(token);
    request.authUserId = claims.sub;
    request.authUserRole = claims.role;
    role = claims.role;
    permissions = claims.permissions ?? [];
  } catch {
    reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
    return reply;
  }
  if (!isAuthorized(permissions, pathname, request.method)) {
    reply.code(403).send({ error: "Forbidden", message: `Role '${role}' may not access ${pathname}` });
    return reply;
  }
});

app.get("/health", async () => ({ ok: true, service: "api-gateway" }));

const proxyDefaults = { replyOptions: { rewriteRequestHeaders } };

await app.register(proxy, {
  upstream: upstream.user,
  prefix: "/auth",
  rewritePrefix: "/auth",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.user,
  prefix: "/users",
  rewritePrefix: "/users",
  ...proxyDefaults
});

// Role administration (authorized via roles:read / roles:write permissions).
await app.register(proxy, {
  upstream: upstream.user,
  prefix: "/roles",
  rewritePrefix: "/roles",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.shipment,
  prefix: "/shipments",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.warehouse,
  prefix: "/warehouses",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.courier,
  prefix: "/couriers",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.dispatch,
  prefix: "/dispatch",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.tracking,
  prefix: "/tracking",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.notification,
  prefix: "/notifications",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.analytics,
  prefix: "/analytics",
  ...proxyDefaults
});

await app.register(proxy, {
  upstream: upstream.ai,
  prefix: "/ai",
  ...proxyDefaults
});

const port = Number(process.env.API_GATEWAY_PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
