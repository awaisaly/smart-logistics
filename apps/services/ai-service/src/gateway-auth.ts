/** Headers for server-to-server gateway reads (suggestions refresh, etc.). */
export function internalGatewayHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_SERVICE_SECRET?.trim();
  return secret ? { "x-internal-service-secret": secret } : {};
}

/** Prefer the operator's bearer token; fall back to internal secret for dev. */
export function gatewayHeaders(authorization?: string): Record<string, string> {
  const bearer = authorization?.trim();
  if (bearer) return { authorization: bearer };
  return internalGatewayHeaders();
}
