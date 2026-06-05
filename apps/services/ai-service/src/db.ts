import { databaseUrl } from "@smartlogistics/shared-middleware";
import { PrismaClient } from "./generated/prisma/index.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl({ database: "ai_service", defaultPort: 5438 }) } }
});

export type AiPrisma = typeof prisma;
