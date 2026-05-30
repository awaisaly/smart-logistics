const seenKeys = new Set<string>();

export function checkIdempotency(key: string): boolean {
  if (seenKeys.has(key)) {
    return false;
  }
  seenKeys.add(key);
  return true;
}
