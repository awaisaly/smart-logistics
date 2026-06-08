import { databaseUrl } from "@smartlogistics/shared-middleware";
import { PrismaClient as ShipmentClient } from "./generated/shipment/index.js";
import { PrismaClient as WarehouseClient } from "./generated/warehouse/index.js";
import { PrismaClient as CourierClient } from "./generated/courier/index.js";
import { PrismaClient as DispatchClient } from "./generated/dispatch/index.js";

export const shipmentDb = new ShipmentClient({
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

export const warehouseDb = new WarehouseClient({
  datasources: {
    db: {
      url: databaseUrl({
        database: "warehouse_service",
        defaultPort: 5434,
        urlEnvVar: "WAREHOUSE_DATABASE_URL",
        portEnvVar: "WAREHOUSE_POSTGRES_PORT"
      })
    }
  }
});

export const courierDb = new CourierClient({
  datasources: {
    db: {
      url: databaseUrl({
        database: "courier_service",
        defaultPort: 5435,
        urlEnvVar: "COURIER_DATABASE_URL",
        portEnvVar: "COURIER_POSTGRES_PORT"
      })
    }
  }
});

export const dispatchDb = new DispatchClient({
  datasources: {
    db: {
      url: databaseUrl({
        database: "dispatch_service",
        defaultPort: 5436,
        urlEnvVar: "DISPATCH_DATABASE_URL",
        portEnvVar: "DISPATCH_POSTGRES_PORT"
      })
    }
  }
});
