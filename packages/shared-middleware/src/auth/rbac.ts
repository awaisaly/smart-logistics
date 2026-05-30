import type { FastifyReply, FastifyRequest } from "fastify";

type Role = "admin" | "warehouse_operator" | "courier" | "customer_support";

export function requireRoles(allowed: Role[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply) {
    const role = request.headers["x-user-role"];
    if (typeof role !== "string" || !allowed.includes(role as Role)) {
      const error = new Error("Insufficient permissions");
      (error as Error & { statusCode?: number }).statusCode = 403;
      throw error;
    }
  };
}
