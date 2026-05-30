import type { FastifyReply, FastifyRequest } from "fastify";

export function attachRequestId(request: FastifyRequest, _reply: FastifyReply, done: () => void) {
  const incoming = request.headers["x-request-id"];
  request.headers["x-request-id"] = typeof incoming === "string" ? incoming : crypto.randomUUID();
  done();
}
