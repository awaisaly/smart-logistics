/** Human-readable identifiers for portal search and operator-facing UI. */

export function trackingNumber(n = Math.floor(2_300_000 + Math.random() * 199_999)): string {
  return `SL-${n}`;
}

export function warehouseCode(cityCode: string, index: number): string {
  return `${cityCode}-W${index + 1}`;
}

export function courierCode(index: number): string {
  return `C-${4000 + index}`;
}

export function rmaCode(n = Math.floor(800 + Math.random() * 9200)): string {
  return `RMA-${n}`;
}

export function exceptionCode(n = Math.floor(1000 + Math.random() * 9000)): string {
  return `EX-${n}`;
}

export function workflowCode(typeLabel: string): string {
  const slug = typeLabel.slice(0, 4).toLowerCase().replace(/\W/g, "") || "flow";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `TPL-${slug}-${suffix}`;
}

/** Pick a unique tracking number from a set of already-used values. */
export function uniqueTrackingNumber(used: Set<string>): string {
  let code = trackingNumber();
  while (used.has(code)) code = trackingNumber();
  used.add(code);
  return code;
}
