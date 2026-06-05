import { databaseUrl } from "@smartlogistics/shared-middleware";
import { PrismaClient } from "./generated/prisma/index.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl({ database: "courier_service", defaultPort: 5435 }) } }
});
