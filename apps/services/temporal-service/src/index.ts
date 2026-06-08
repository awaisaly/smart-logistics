import Fastify from "fastify";
import { buildLogger, setupMetrics } from "@smartlogistics/shared-middleware";
import { startTemporalWorker } from "./worker.js";

const app = Fastify({ logger: buildLogger("temporal-service") });
setupMetrics(app, "temporal-service");

app.get("/health", async () => ({ ok: true, service: "temporal-service" }));

const port = Number(process.env.TEMPORAL_SERVICE_PORT ?? 4011);

void startTemporalWorker().catch((err) =>
  app.log.error({ err: (err as Error).message }, "Temporal worker failed to start")
);

await app.listen({ port, host: "0.0.0.0" });
