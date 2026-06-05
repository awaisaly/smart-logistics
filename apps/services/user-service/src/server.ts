import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the workspace-root .env so JWT_ACCESS_SECRET / DEMO_PASSWORD are available
// when running under `tsx` without the vars exported in the shell.
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env"));
} catch {
  // .env is optional; fall back to ambient environment variables.
}

import Fastify from "fastify";
import { z } from "zod";
import {
  buildLogger,
  setupMetrics,
  signAccessToken,
  hashPassword,
  verifyPassword,
  newOpaqueToken,
  hashToken,
  ROLE_DEFS,
  ROLE_BY_KEY
} from "@smartlogistics/shared-middleware";
import { prisma } from "./db.js";
import { Prisma } from "./generated/prisma/index.js";

const app = Fastify({ logger: buildLogger("user-service") });
setupMetrics(app, "user-service");

// Shared demo password for the seeded prototype accounts. Any seeded user can sign in
// with this regardless of their stored hash, which lets us showcase multiple roles.
// It is a deliberate convenience for demos and is disabled in production so the
// stored (scrypt) hashes are the only accepted credential there.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || "smartlogistics";
const ALLOW_DEMO_PASSWORD = process.env.NODE_ENV !== "production";

// Access tokens are short-lived JWTs; refresh tokens are opaque rows we can revoke.
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);

// Stable primary admin used by the operations console.
const PRIMARY_ADMIN = {
  id: "00000000-0000-0000-0000-00000000a1a1",
  email: "awais.ali@smartlogistics.example",
  fullName: "Awais Ali"
} as const;

// ── role config in memory (seeded into the roles table on startup) ──────────────
type RoleRow = { id: number; key: string; label: string; description: string | null; pages: string[]; apiPrefixes: string[] };
const rolesByKey = new Map<string, RoleRow>();

const seedRoles = async (): Promise<void> => {
  for (const def of ROLE_DEFS) {
    const row = await prisma.role.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        label: def.label,
        description: def.description,
        pages: def.pages as unknown as Prisma.InputJsonValue,
        apiPrefixes: def.apiPrefixes as unknown as Prisma.InputJsonValue
      },
      update: {
        label: def.label,
        description: def.description,
        pages: def.pages as unknown as Prisma.InputJsonValue,
        apiPrefixes: def.apiPrefixes as unknown as Prisma.InputJsonValue
      }
    });
    rolesByKey.set(def.key, {
      id: row.id,
      key: row.key,
      label: row.label,
      description: row.description,
      pages: (row.pages as string[]) ?? [],
      apiPrefixes: (row.apiPrefixes as string[]) ?? []
    });
  }
};

const ensurePrimaryAdmin = async (): Promise<void> => {
  const adminRole = rolesByKey.get("admin");
  await prisma.user.upsert({
    where: { email: PRIMARY_ADMIN.email },
    create: {
      id: PRIMARY_ADMIN.id,
      email: PRIMARY_ADMIN.email,
      passwordHash: "seed-password-hash",
      role: "admin",
      roleId: adminRole?.id ?? null,
      fullName: PRIMARY_ADMIN.fullName,
      region: "Global",
      status: "active"
    },
    update: { role: "admin", roleId: adminRole?.id ?? null, fullName: PRIMARY_ADMIN.fullName }
  });
  await prisma.adminProfile.upsert({
    where: { userId: PRIMARY_ADMIN.id },
    create: {
      userId: PRIMARY_ADMIN.id,
      accessLevel: "owner",
      managedRegions: ["Global"] as unknown as Prisma.InputJsonValue,
      canManageUsers: true,
      notes: "Primary console administrator"
    },
    update: { accessLevel: "owner", canManageUsers: true }
  });
};

// ── helpers ─────────────────────────────────────────────────────────────────
type UserWithRole = Prisma.UserGetPayload<{ include: { roleRef: true } }>;

const publicUser = (u: UserWithRole) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  roleId: u.roleId,
  label: u.roleRef?.label ?? u.role,
  pages: (u.roleRef?.pages as string[] | undefined) ?? [],
  fullName: u.fullName,
  phone: u.phone,
  employeeId: u.employeeId,
  region: u.region,
  status: u.status,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt
});

// Refresh tokens are opaque random strings; only their SHA-256 fingerprint is
// persisted so a leaked DB row cannot be replayed as a valid session.
const issueRefreshToken = async (userId: string): Promise<string> => {
  const raw = newOpaqueToken();
  await prisma.authToken.create({ data: { id: crypto.randomUUID(), userId, kind: "refresh", token: hashToken(raw) } });
  return raw;
};

const profileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  employeeId: z.string().optional(),
  region: z.string().optional(),
  status: z.string().optional(),
  accessLevel: z.string().optional(),
  managedRegions: z.array(z.string()).optional(),
  canManageUsers: z.boolean().optional(),
  notes: z.string().optional()
});

const roleKey = z.string().refine((k) => k in ROLE_BY_KEY, "unknown role");

const createUserSchema = profileSchema.extend({
  email: z.string().email(),
  password: z.string().min(8),
  role: roleKey
});

const upsertAdminProfile = async (userId: string, p: z.infer<typeof profileSchema>): Promise<void> => {
  await prisma.adminProfile.upsert({
    where: { userId },
    create: {
      userId,
      accessLevel: p.accessLevel ?? "standard",
      managedRegions: (p.managedRegions ?? []) as unknown as Prisma.InputJsonValue,
      canManageUsers: p.canManageUsers ?? true,
      notes: p.notes ?? null
    },
    update: {
      ...(p.accessLevel ? { accessLevel: p.accessLevel } : {}),
      ...(p.managedRegions ? { managedRegions: p.managedRegions as unknown as Prisma.InputJsonValue } : {}),
      ...(p.canManageUsers !== undefined ? { canManageUsers: p.canManageUsers } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {})
    }
  });
};

app.get("/health", async () => ({ ok: true, service: "user-service" }));

// ── roles policy (consumed by the gateway) ──────────────────────────────────
app.get("/roles", async () => ({
  items: ROLE_DEFS.map((def) => {
    const row = rolesByKey.get(def.key);
    return {
      id: row?.id ?? null,
      key: def.key,
      label: def.label,
      description: def.description,
      pages: def.pages,
      apiPrefixes: def.apiPrefixes
    };
  })
}));

// ── auth ─────────────────────────────────────────────────────────────────────
app.post("/auth/register", async (request) => {
  const payload = createUserSchema.parse(request.body);
  const role = rolesByKey.get(payload.role);
  const id = crypto.randomUUID();
  const user = await prisma.user.upsert({
    where: { email: payload.email },
    create: {
      id,
      email: payload.email,
      passwordHash: hashPassword(payload.password),
      role: payload.role,
      roleId: role?.id ?? null,
      fullName: payload.fullName ?? null,
      phone: payload.phone ?? null,
      employeeId: payload.employeeId ?? null,
      region: payload.region ?? null,
      status: payload.status ?? "active"
    },
    update: { role: payload.role, roleId: role?.id ?? null },
    include: { roleRef: true }
  });
  if (payload.role === "admin") await upsertAdminProfile(user.id, payload);
  return publicUser(user);
});

app.post("/auth/login", async (request, reply) => {
  const payload = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: payload.email }, include: { roleRef: true } });
  if (!user) {
    reply.code(401);
    return { ok: false, error: "Invalid email or password" };
  }
  const passwordOk =
    verifyPassword(payload.password, user.passwordHash) ||
    (ALLOW_DEMO_PASSWORD && payload.password === DEMO_PASSWORD);
  if (!passwordOk) {
    reply.code(401);
    return { ok: false, error: "Invalid email or password" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, roleId: user.roleId });
  const refreshToken = await issueRefreshToken(user.id);
  return { ok: true, accessToken, refreshToken, user: publicUser(user) };
});

app.post("/auth/refresh", async (request) => {
  const payload = z.object({ refreshToken: z.string().optional() }).parse(request.body);
  if (!payload.refreshToken) return { accessToken: "" };
  const existing = await prisma.authToken.findFirst({
    where: { kind: "refresh", token: hashToken(payload.refreshToken) },
    orderBy: { createdAt: "desc" }
  });
  if (!existing) return { accessToken: "" };
  // Reject stale refresh tokens beyond the configured TTL.
  const ageMs = Date.now() - existing.createdAt.getTime();
  if (ageMs > REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000) {
    await prisma.authToken.delete({ where: { id: existing.id } }).catch(() => undefined);
    return { accessToken: "" };
  }
  const user = await prisma.user.findUnique({ where: { id: existing.userId }, include: { roleRef: true } });
  if (!user) return { accessToken: "" };
  // Rotate: revoke the presented refresh token and mint a fresh pair.
  await prisma.authToken.delete({ where: { id: existing.id } }).catch(() => undefined);
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, roleId: user.roleId });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken, user: publicUser(user) };
});

app.post("/auth/logout", async (request) => {
  const payload = z.object({ refreshToken: z.string().optional() }).parse(request.body ?? {});
  if (payload.refreshToken) {
    await prisma.authToken.deleteMany({ where: { kind: "refresh", token: hashToken(payload.refreshToken) } });
  }
  return { ok: true };
});

// Public: limited fields used by the login screen to offer demo accounts.
app.get("/auth/demo-accounts", async () => {
  const users = await prisma.user.findMany({
    where: { status: "active" },
    include: { roleRef: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    take: 50
  });
  return {
    items: users.map((u) => ({
      email: u.email,
      role: u.role,
      label: u.roleRef?.label ?? u.role,
      name: u.fullName ?? u.email
    }))
  };
});

// Current authenticated user (gateway injects x-user-id after verifying the JWT).
app.get("/auth/me", async (request, reply) => {
  const userId = request.headers["x-user-id"];
  if (typeof userId !== "string" || !userId) {
    reply.code(401);
    return { ok: false, error: "Not authenticated" };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roleRef: true } });
  if (!user) {
    reply.code(404);
    return { ok: false, error: "User not found" };
  }
  const adminProfile = user.role === "admin" ? await prisma.adminProfile.findUnique({ where: { userId } }) : null;
  return { ok: true, user: publicUser(user), adminProfile };
});

// ── admin user management (gateway restricts /users to admins) ───────────────
app.get("/users", async () => {
  const users = await prisma.user.findMany({
    include: { roleRef: true },
    orderBy: { createdAt: "desc" },
    take: 300
  });
  return { items: users.map(publicUser) };
});

app.post("/users", async (request) => {
  const payload = createUserSchema.parse(request.body);
  const role = rolesByKey.get(payload.role);
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: payload.email,
      passwordHash: hashPassword(payload.password),
      role: payload.role,
      roleId: role?.id ?? null,
      fullName: payload.fullName ?? null,
      phone: payload.phone ?? null,
      employeeId: payload.employeeId ?? null,
      region: payload.region ?? null,
      status: payload.status ?? "active"
    },
    include: { roleRef: true }
  });
  if (payload.role === "admin") await upsertAdminProfile(user.id, payload);
  return publicUser(user);
});

const updateUserSchema = profileSchema.extend({ role: roleKey.optional() });

app.patch("/users/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const payload = updateUserSchema.parse(request.body ?? {});
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    reply.code(404);
    return { ok: false, error: "User not found" };
  }
  const role = payload.role ? rolesByKey.get(payload.role) : undefined;
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(payload.role ? { role: payload.role, roleId: role?.id ?? null } : {}),
      ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
      ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
      ...(payload.region !== undefined ? { region: payload.region } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {})
    },
    include: { roleRef: true }
  });
  if (user.role === "admin") await upsertAdminProfile(user.id, payload);
  return publicUser(user);
});

app.delete("/users/:id", async (request) => {
  const { id } = request.params as { id: string };
  await prisma.authToken.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
});

app.patch("/users/:id/role", async (request, reply) => {
  const { id } = request.params as { id: string };
  const payload = z.object({ role: roleKey }).parse(request.body ?? {});
  const role = rolesByKey.get(payload.role);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    reply.code(404);
    return { ok: false, error: "User not found" };
  }
  const user = await prisma.user.update({
    where: { id },
    data: { role: payload.role, roleId: role?.id ?? null },
    include: { roleRef: true }
  });
  return publicUser(user);
});

// courier profile stubs (unchanged behavior)
app.post("/couriers/:userId/profile", async () => ({ ok: true }));
app.patch("/couriers/:userId/availability", async () => ({ ok: true }));

const port = Number(process.env.USER_SERVICE_PORT ?? 4001);
await seedRoles();
await ensurePrimaryAdmin();
await app.listen({ port, host: "0.0.0.0" });
app.log.info({ email: PRIMARY_ADMIN.email, roles: ROLE_DEFS.length }, "roles seeded; primary admin ensured");
