import { databaseUrl } from "@smartlogistics/shared-middleware";
import { PrismaClient } from "./generated/prisma/index.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl({ database: "user_service", defaultPort: 5441 }) } }
});
