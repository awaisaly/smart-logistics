import { databaseUrl } from "@smartlogistics/shared-middleware";
import { PrismaClient as AnalyticsClient } from "./generated/analytics/index.js";
import { PrismaClient as ShipmentReadClient } from "./generated/shipment/index.js";

// Analytics' own datastore.
export const prisma = new AnalyticsClient({
  datasources: { db: { url: databaseUrl({ database: "analytics_service", defaultPort: 5439 }) } }
});

// Read-only connection to the shipment-service database. Business metrics are
// recomputed live from real shipment rows per requested date range.
export const shipmentDb = new ShipmentReadClient({
  datasources: {
    db: {
      url: databaseUrl({
        database: "shipment_service",
        defaultPort: 5433,
        urlEnvVar: "SHIPMENT_DATABASE_URL",
        portEnvVar: "SHIPMENT_POSTGRES_PORT"
      })
    }
  }
});
