import jwt from "jsonwebtoken";

// Short-lived signed access token. Carries identity plus the role's permission list
// resolved at login/refresh so the gateway can authorize without a DB lookup.
export type AccessTokenClaims = {
  sub: string;
  email: string;
  role: string;
  roleId?: string | null;
  permissions?: string[];
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
  const { sub, email, role, roleId, permissions } = claims;
  return jwt.sign({ email, role, roleId: roleId ?? null, permissions: permissions ?? [] }, secret(), {
    subject: sub,
    expiresIn: options.expiresIn ?? DEFAULT_EXPIRES_IN
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, secret()) as jwt.JwtPayload;
  const rawPerms = decoded.permissions;
  return {
    sub: String(decoded.sub ?? ""),
    email: String(decoded.email ?? ""),
    role: String(decoded.role ?? ""),
    roleId: typeof decoded.roleId === "string" ? decoded.roleId : null,
    permissions: Array.isArray(rawPerms) ? rawPerms.map(String) : []
  };
}

// Extracts a bearer token from an Authorization header value.
export function bearerFromHeader(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() ?? null;
}
