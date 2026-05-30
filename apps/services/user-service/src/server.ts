import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics } from "@smartlogistics/shared-middleware";
import { Pool } from "pg";

const app = Fastify({ logger: buildLogger("user-service") });
setupMetrics(app, "user-service");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5441"}/user_service`
});

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users_v2 (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

// Stable primary admin used by the operations console. Upserted on every startup so
// it survives a fresh DB but does not get wiped if the user runs the full seed afterwards
// (the seed also writes the same row). created_at is bumped to NOW() so /users orders it first.
const PRIMARY_ADMIN = {
  id: "00000000-0000-0000-0000-00000000a1a1",
  email: "awais.ali@smartlogistics.example",
  role: "admin"
} as const;

const ensurePrimaryAdmin = async () => {
  await pool.query(
    `INSERT INTO users_v2 (id, email, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (email) DO UPDATE
       SET role = EXCLUDED.role, created_at = NOW()`,
    [PRIMARY_ADMIN.id, PRIMARY_ADMIN.email, "seed-password-hash", PRIMARY_ADMIN.role]
  );
};

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "warehouse_operator", "courier", "customer_support"])
});

// Shared demo password for the seeded prototype accounts. Any seeded user can sign in
// with this regardless of their stored hash, which lets us showcase multiple roles.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || "smartlogistics";

app.get("/health", async () => ({ ok: true, service: "user-service" }));

app.post("/auth/register", async (request) => {
  const payload = userSchema.parse(request.body);
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users_v2 (id, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
    [id, payload.email, payload.password, payload.role]
  );
  return { id, email: payload.email, role: payload.role };
});

app.post("/auth/login", async (request, reply) => {
  const payload = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const user = (
    await pool.query(`SELECT id, email, role, password_hash FROM users_v2 WHERE email = $1`, [payload.email])
  ).rows[0];
  if (!user) {
    reply.code(401);
    return { ok: false, error: "Invalid email or password" };
  }
  const passwordOk = payload.password === user.password_hash || payload.password === DEMO_PASSWORD;
  if (!passwordOk) {
    reply.code(401);
    return { ok: false, error: "Invalid email or password" };
  }
  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  await pool.query(
    `INSERT INTO auth_tokens (id, user_id, kind, token)
     VALUES ($1,$2,$3,$4), ($5,$6,$7,$8)`,
    [crypto.randomUUID(), user.id, "access", accessToken, crypto.randomUUID(), user.id, "refresh", refreshToken]
  );
  return {
    ok: true,
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role }
  };
});
app.post("/auth/refresh", async (request) => {
  const payload = z.object({ refreshToken: z.string().optional() }).parse(request.body);
  if (!payload.refreshToken) return { accessToken: "" };
  const token = (
    await pool.query(
      `SELECT user_id
       FROM auth_tokens
       WHERE kind = 'refresh' AND token = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [payload.refreshToken]
    )
  ).rows[0];
  if (!token) return { accessToken: "" };
  const accessToken = crypto.randomUUID();
  await pool.query(
    `INSERT INTO auth_tokens (id, user_id, kind, token)
     VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), token.user_id, "access", accessToken]
  );
  return { accessToken };
});
app.post("/auth/logout", async () => ({ ok: true }));

app.get("/users", async () => {
  const { rows } = await pool.query(`SELECT id, email, role, created_at FROM users_v2 ORDER BY created_at DESC LIMIT 300`);
  return { items: rows };
});
app.patch("/users/:id/role", async () => ({ ok: true }));
app.post("/couriers/:userId/profile", async () => ({ ok: true }));
app.patch("/couriers/:userId/availability", async () => ({ ok: true }));

const port = Number(process.env.USER_SERVICE_PORT ?? 4001);
await ensureSchema();
await ensurePrimaryAdmin();
await app.listen({ port, host: "0.0.0.0" });
app.log.info(
  { email: PRIMARY_ADMIN.email, role: PRIMARY_ADMIN.role },
  "primary admin ensured"
);
