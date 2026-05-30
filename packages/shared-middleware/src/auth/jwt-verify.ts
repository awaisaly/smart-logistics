export function verifyInternalServiceSecret(secret?: string): boolean {
  return secret === process.env.INTERNAL_SERVICE_SECRET;
}
