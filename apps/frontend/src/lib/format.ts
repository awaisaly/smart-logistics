export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCompact(value: unknown): string {
  const n = toNumber(value);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

export function pathnameLabel(endpoint: string): string {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}
