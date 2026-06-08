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
  hashToken
} from "@smartlogistics/shared-middleware";
import { ALL_PERMISSIONS, type Permission } from "@smartlogistics/shared-types";
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
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

const refreshExpiresAt = (): Date => new Date(Date.now() + REFRESH_TTL_MS);

// Stable primary admin used by the operations console.
const PRIMARY_ADMIN = {
  id: "00000000-0000-0000-0000-00000000a1a1",
  email: "awais.ali@smartlogistics.example",
  fullName: "Awais Ali"
} as const;

// Roles live in the `roles` table and are installed by the seed script. This
// ensures the console's primary admin user exists against the system role
// (isSystem=true, typically holds users:write). No-op until roles are seeded.
const ensurePrimaryAdmin = async (): Promise<void> => {
  const adminRole = await prisma.role.findFirst({ where: { isSystem: true }, orderBy: { label: "asc" } });
  if (!adminRole) {
    app.log.warn("no system role found; run the seed script to install roles before creating the primary admin");
    return;
  }
  await prisma.user.upsert({
    where: { email: PRIMARY_ADMIN.email },
    create: {
      id: PRIMARY_ADMIN.id,
      email: PRIMARY_ADMIN.email,
      passwordHash: "seed-password-hash",
      role: adminRole.label,
      roleId: adminRole.id,
      fullName: PRIMARY_ADMIN.fullName,
      region: "Global",
      status: "active"
    },
    update: {
      role: adminRole.label,
      roleId: adminRole.id,
      fullName: PRIMARY_ADMIN.fullName
    }
  });
};

// ── helpers ─────────────────────────────────────────────────────────────────
type UserWithRole = Prisma.UserGetPayload<{ include: { roleRef: true } }>;

const rolePermissions = (role: { permissions: unknown } | null | undefined): string[] =>
  (role?.permissions as string[] | undefined) ?? [];

const publicUser = (u: UserWithRole) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  roleId: u.roleId,
  label: u.roleRef?.label ?? u.role,
  pages: (u.roleRef?.pages as string[] | undefined) ?? [],
  permissions: rolePermissions(u.roleRef),
  fullName: u.fullName,
  phone: u.phone,
  employeeId: u.employeeId,
  region: u.region,
  status: u.status,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt
});

const accessTokenFor = (u: UserWithRole) =>
  signAccessToken({
    sub: u.id,
    email: u.email,
    role: u.role,
    roleId: u.roleId,
    permissions: rolePermissions(u.roleRef)
  });

// Refresh tokens are opaque random strings; only their SHA-256 fingerprint is
// persisted so a leaked DB row cannot be replayed as a valid session.
const issueRefreshToken = async (userId: string): Promise<string> => {
  const raw = newOpaqueToken();
  await prisma.authToken.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      kind: "refresh",
      token: hashToken(raw),
      expiresAt: refreshExpiresAt()
    }
  });
  return raw;
};

const profileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  employeeId: z.string().optional(),
  region: z.string().optional(),
  status: z.string().optional()
});

const createUserSchema = profileSchema.extend({
  email: z.string().email(),
  password: z.string().min(8),
  roleId: z.string().uuid()
});

const updateUserSchema = profileSchema.extend({ roleId: z.string().uuid().optional() });

const permissionSchema = z
  .string()
  .refine((p): p is Permission => (ALL_PERMISSIONS as readonly string[]).includes(p), "unknown permission");

const roleBodySchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  pages: z.array(z.string()).optional(),
  apiPrefixes: z.array(z.string()).optional(),
  permissions: z.array(permissionSchema).optional()
});

// Resolves the role assigned to a user. Users reference roles by id; the role's
// label is denormalized onto User.role for display/back-compat.
const findRole = (id: string) => prisma.role.findUnique({ where: { id } });

const publicRole = (r: {
  id: string;
  label: string;
  description: string | null;
  pages: unknown;
  apiPrefixes: unknown;
  permissions: unknown;
  isSystem: boolean;
}) => ({
  id: r.id,
  label: r.label,
  description: r.description,
  pages: (r.pages as string[] | undefined) ?? [],
  apiPrefixes: (r.apiPrefixes as string[] | undefined) ?? [],
  permissions: (r.permissions as string[] | undefined) ?? [],
  isSystem: r.isSystem
});

app.get("/health", async () => ({ ok: true, service: "user-service" }));

// ── role management (gateway loads /roles for its policy; CRUD is admin-only) ─
app.get("/roles", async () => {
  const roles = await prisma.role.findMany({ orderBy: { label: "asc" } });
  return { items: roles.map(publicRole) };
});

app.post("/roles", async (request) => {
  const payload = roleBodySchema.parse(request.body);
  const role = await prisma.role.create({
    data: {
      label: payload.label,
      description: payload.description ?? null,
      pages: (payload.pages ?? []) as unknown as Prisma.InputJsonValue,
      apiPrefixes: (payload.apiPrefixes ?? []) as unknown as Prisma.InputJsonValue,
      permissions: (payload.permissions ?? []) as unknown as Prisma.InputJsonValue
    }
  });
  return publicRole(role);
});

app.patch("/roles/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const payload = roleBodySchema.partial().parse(request.body ?? {});
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) {
    reply.code(404);
    return { ok: false, error: "Role not found" };
  }
  const role = await prisma.role.update({
    where: { id },
    data: {
      ...(payload.label !== undefined ? { label: payload.label } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.pages !== undefined ? { pages: payload.pages as unknown as Prisma.InputJsonValue } : {}),
      ...(payload.apiPrefixes !== undefined ? { apiPrefixes: payload.apiPrefixes as unknown as Prisma.InputJsonValue } : {}),
      ...(payload.permissions !== undefined ? { permissions: payload.permissions as unknown as Prisma.InputJsonValue } : {})
    }
  });
  return publicRole(role);
});

app.delete("/roles/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) {
    reply.code(404);
    return { ok: false, error: "Role not found" };
  }
  if (existing.isSystem) {
    reply.code(409);
    return { ok: false, error: "System roles cannot be deleted" };
  }
  const inUse = await prisma.user.count({ where: { roleId: id } });
  if (inUse > 0) {
    reply.code(409);
    return { ok: false, error: `Role is assigned to ${inUse} user(s)` };
  }
  await prisma.role.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
});

// ── auth ─────────────────────────────────────────────────────────────────────
app.post("/auth/register", async (request, reply) => {
  const payload = createUserSchema.parse(request.body);
  const role = await findRole(payload.roleId);
  if (!role) {
    reply.code(400);
    return { ok: false, error: "Unknown roleId" };
  }
  const id = crypto.randomUUID();
  const user = await prisma.user.upsert({
    where: { email: payload.email },
    create: {
      id,
      email: payload.email,
      passwordHash: hashPassword(payload.password),
      role: role.label,
      roleId: role.id,
      fullName: payload.fullName ?? null,
      phone: payload.phone ?? null,
      employeeId: payload.employeeId ?? null,
      region: payload.region ?? null,
      status: payload.status ?? "active"
    },
    update: { role: role.label, roleId: role.id },
    include: { roleRef: true }
  });
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
  const accessToken = accessTokenFor(user);
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
  if (existing.expiresAt.getTime() <= Date.now()) {
    await prisma.authToken.delete({ where: { id: existing.id } }).catch(() => undefined);
    return { accessToken: "" };
  }
  const user = await prisma.user.findUnique({ where: { id: existing.userId }, include: { roleRef: true } });
  if (!user) return { accessToken: "" };
  // Rotate: revoke the presented refresh token and mint a fresh pair.
  await prisma.authToken.delete({ where: { id: existing.id } }).catch(() => undefined);
  const accessToken = accessTokenFor(user);
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
  return { ok: true, user: publicUser(user) };
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

app.post("/users", async (request, reply) => {
  const payload = createUserSchema.parse(request.body);
  const role = await findRole(payload.roleId);
  if (!role) {
    reply.code(400);
    return { ok: false, error: "Unknown roleId" };
  }
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: payload.email,
      passwordHash: hashPassword(payload.password),
      role: role.label,
      roleId: role.id,
      fullName: payload.fullName ?? null,
      phone: payload.phone ?? null,
      employeeId: payload.employeeId ?? null,
      region: payload.region ?? null,
      status: payload.status ?? "active"
    },
    include: { roleRef: true }
  });
  return publicUser(user);
});

app.patch("/users/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const payload = updateUserSchema.parse(request.body ?? {});
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    reply.code(404);
    return { ok: false, error: "User not found" };
  }
  let roleData: { role: string; roleId: string } | undefined;
  if (payload.roleId) {
    const role = await findRole(payload.roleId);
    if (!role) {
      reply.code(400);
      return { ok: false, error: "Unknown roleId" };
    }
    roleData = { role: role.label, roleId: role.id };
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(roleData ?? {}),
      ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
      ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
      ...(payload.region !== undefined ? { region: payload.region } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {})
    },
    include: { roleRef: true }
  });
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
  const payload = z.object({ roleId: z.string().uuid() }).parse(request.body ?? {});
  const role = await findRole(payload.roleId);
  if (!role) {
    reply.code(400);
    return { ok: false, error: "Unknown roleId" };
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    reply.code(404);
    return { ok: false, error: "User not found" };
  }
  const user = await prisma.user.update({
    where: { id },
    data: { role: role.label, roleId: role.id },
    include: { roleRef: true }
  });
  return publicUser(user);
});

// courier profile stubs (unchanged behavior)
app.post("/couriers/:userId/profile", async () => ({ ok: true }));
app.patch("/couriers/:userId/availability", async () => ({ ok: true }));

const port = Number(process.env.USER_SERVICE_PORT ?? 4001);
await ensurePrimaryAdmin();
await app.listen({ port, host: "0.0.0.0" });
app.log.info({ email: PRIMARY_ADMIN.email }, "primary admin ensured (roles served from the roles table)");
