/**
 * Prisma orchestration for the monorepo.
 *
 *   pnpm db:generate   → generate the Prisma client for every service
 *   pnpm db:migrate    → apply committed migrations (prisma migrate deploy)
 *   pnpm db:push       → push schema directly without migrations (prototyping)
 *
 * One-time / maintenance modes (run manually):
 *   tsx scripts/prisma.ts init       → create the initial 0_init migration per
 *                                       service from the current schema (offline)
 *   tsx scripts/prisma.ts baseline   → mark 0_init as already-applied on a DB
 *                                       that was provisioned via `db push`
 *
 * Each Postgres service owns its own schema.prisma + database, so we run the
 * Prisma CLI once per schema with the matching connection URL in the env.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Name of the baseline migration created from the existing schema.
const INIT_MIGRATION = "0_init";

function buildUrl(database: string, defaultPort: number, portEnvVar = "POSTGRES_PORT"): string {
  const user = process.env.POSTGRES_USER ?? "smartlogistics";
  const password = process.env.POSTGRES_PASSWORD ?? "smartlogistics";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env[portEnvVar] ?? String(defaultPort);
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

type SchemaTarget = {
  /** absolute path to the service directory */
  dir: string;
  /** schema file relative to the service dir */
  schema: string;
  /** env var the schema's datasource reads */
  urlEnvVar: string;
  /** connection url to inject */
  url: string;
  /**
   * Read-only schema: generate the client but never push/migrate. Such a schema
   * models a subset of another service's database (e.g. the analytics read view
   * of shipment_service), which that other service owns and migrates.
   */
  generateOnly?: boolean;
};

const svc = (name: string) => path.join(repoRoot, "apps/services", name);

const TARGETS: SchemaTarget[] = [
  { dir: svc("user-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("user_service", 5441) },
  { dir: svc("shipment-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("shipment_service", 5433) },
  { dir: svc("warehouse-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("warehouse_service", 5434) },
  { dir: svc("courier-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("courier_service", 5435) },
  { dir: svc("dispatch-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("dispatch_service", 5436) },
  { dir: svc("notification-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("notification_service", 5437) },
  { dir: svc("ai-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("ai_service", 5438) },
  { dir: svc("analytics-service"), schema: "prisma/schema.prisma", urlEnvVar: "DATABASE_URL", url: buildUrl("analytics_service", 5439) },
  // analytics also reads the shipment DB (cross-service analytics). This is a
  // read-only view onto shipment-service's database, so it is generate-only —
  // shipment-service owns that schema and is the only target that migrates it.
  { dir: svc("analytics-service"), schema: "prisma/shipment.prisma", urlEnvVar: "SHIPMENT_DATABASE_URL", url: buildUrl("shipment_service", 5433, "SHIPMENT_POSTGRES_PORT"), generateOnly: true }
];

function runPrisma(target: SchemaTarget, args: string[]): void {
  execFileSync("pnpm", ["exec", "prisma", ...args, "--schema", target.schema], {
    cwd: target.dir,
    stdio: "inherit",
    env: { ...process.env, [target.urlEnvVar]: target.url }
  });
}

// Retry wrapper for commands that touch the DB (it may still be warming up right
// after `docker compose up`).
async function withRetry(fn: () => void, attempts = 12): Promise<void> {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      fn();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

// Generate the initial migration from the current schema, offline (no DB needed).
function init(target: SchemaTarget): void {
  const migrationDir = path.join(target.dir, "prisma/migrations", INIT_MIGRATION);
  mkdirSync(migrationDir, { recursive: true });
  const sql = execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", target.schema, "--script"],
    { cwd: target.dir, env: { ...process.env, [target.urlEnvVar]: target.url } }
  ).toString();
  writeFileSync(path.join(migrationDir, "migration.sql"), sql);
  writeFileSync(
    path.join(target.dir, "prisma/migrations/migration_lock.toml"),
    '# Managed by Prisma — do not edit.\nprovider = "postgresql"\n'
  );
}

type Mode = "generate" | "push" | "migrate" | "baseline" | "init";

async function main(): Promise<void> {
  const mode = process.argv[2] as Mode;
  if (!["generate", "push", "migrate", "baseline", "init"].includes(mode)) {
    console.error("usage: tsx scripts/prisma.ts <generate|push|migrate|baseline|init>");
    process.exit(1);
  }
  // generate runs for every schema (incl. the read-only client); everything
  // else only touches schemas a service actually owns.
  const targets = mode === "generate" ? TARGETS : TARGETS.filter((t) => !t.generateOnly);
  for (const target of targets) {
    const label = `${path.basename(target.dir)} (${target.schema})`;
    console.log(`\n▶ prisma ${mode} — ${label}`);
    switch (mode) {
      case "generate":
        runPrisma(target, ["generate"]);
        break;
      case "push":
        await withRetry(() => runPrisma(target, ["db", "push", "--skip-generate", "--accept-data-loss"]));
        break;
      case "migrate":
        await withRetry(() => runPrisma(target, ["migrate", "deploy"]));
        break;
      case "baseline":
        await withRetry(() => runPrisma(target, ["migrate", "resolve", "--applied", INIT_MIGRATION]));
        break;
      case "init":
        init(target);
        break;
    }
  }
  console.log(`\n✔ prisma ${mode} complete for ${targets.length} schema(s)`);
}

void main();
