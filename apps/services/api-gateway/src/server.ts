import Fastify from "fastify";
import proxy from "@fastify/http-proxy";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { attachRequestId, buildLogger, setupMetrics } from "@smartlogistics/shared-middleware";

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

await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
await app.register(cors, { origin: true, credentials: true });
app.addHook("onRequest", attachRequestId);

app.get("/health", async () => ({ ok: true, service: "api-gateway" }));

await app.register(proxy, {
  upstream: upstream.user,
  prefix: "/auth",
  rewritePrefix: "/auth"
});

await app.register(proxy, {
  upstream: upstream.user,
  prefix: "/users",
  rewritePrefix: "/users"
});

await app.register(proxy, {
  upstream: upstream.shipment,
  prefix: "/shipments"
});

await app.register(proxy, {
  upstream: upstream.warehouse,
  prefix: "/warehouses"
});

await app.register(proxy, {
  upstream: upstream.courier,
  prefix: "/couriers"
});

await app.register(proxy, {
  upstream: upstream.dispatch,
  prefix: "/dispatch"
});

await app.register(proxy, {
  upstream: upstream.tracking,
  prefix: "/tracking"
});

await app.register(proxy, {
  upstream: upstream.notification,
  prefix: "/notifications"
});

await app.register(proxy, {
  upstream: upstream.analytics,
  prefix: "/analytics"
});

await app.register(proxy, {
  upstream: upstream.ai,
  prefix: "/ai"
});

const port = Number(process.env.API_GATEWAY_PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
