import jwt from "jsonwebtoken";

// Short-lived signed access token. Claims are intentionally small: identity +
// role, which the gateway verifies on every request to authorize by role.
export type AccessTokenClaims = {
  sub: string;
  email: string;
  role: string;
  roleId?: number | null;
};

const DEFAULT_EXPIRES_IN = process.env.JWT_ACCESS_TTL?.trim() || "15m";

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET?.trim();
  if (!value) throw new Error("JWT_ACCESS_SECRET is not set");
  return value;
}

export function signAccessToken(
  claims: AccessTokenClaims,
  options: { expiresIn?: string | number } = {}
): string {
  const { sub, email, role, roleId } = claims;
  return jwt.sign({ email, role, roleId: roleId ?? null }, secret(), {
    subject: sub,
    expiresIn: options.expiresIn ?? DEFAULT_EXPIRES_IN
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, secret()) as jwt.JwtPayload;
  return {
    sub: String(decoded.sub ?? ""),
    email: String(decoded.email ?? ""),
    role: String(decoded.role ?? ""),
    roleId: typeof decoded.roleId === "number" ? decoded.roleId : null
  };
}

// Extracts a bearer token from an Authorization header value.
export function bearerFromHeader(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() ?? null;
}
