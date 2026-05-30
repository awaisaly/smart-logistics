import type { IconName } from "@/components/ui/icon";

export type SearchHit = {
  category: "Shipments" | "Returns" | "Exceptions" | "Couriers" | "Warehouses" | "Workflows";
  id: string;
  title: string;
  subtitle?: string;
  to: string;
  icon: IconName;
};

export type SearchIndex = {
  shipments: Array<Record<string, unknown>>;
  returns: Array<Record<string, unknown>>;
  exceptions: Array<Record<string, unknown>>;
  couriers: Array<Record<string, unknown>>;
  warehouses: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
};

export const EMPTY_INDEX: SearchIndex = {
  shipments: [],
  returns: [],
  exceptions: [],
  couriers: [],
  warehouses: [],
  workflows: [],
};

function matches(value: unknown, q: string): boolean {
  return String(value ?? "").toLowerCase().includes(q);
}

export function buildSearchHits(index: SearchIndex, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];

  for (const row of index.shipments) {
    if (matches(row.id, q) || matches(row.to, q) || matches(row.from, q) || matches(row.courier, q) || matches(row.status, q)) {
      hits.push({
        category: "Shipments",
        id: String(row.id ?? ""),
        title: String(row.id ?? "Shipment"),
        subtitle: `${row.from ?? "?"} → ${row.to ?? "?"} · ${row.status ?? "unknown"}`,
        to: "/shipments",
        icon: "package",
      });
    }
  }
  for (const row of index.returns) {
    if (matches(row.id, q) || matches(row.shipment, q) || matches(row.customer, q) || matches(row.reason, q)) {
      hits.push({
        category: "Returns",
        id: String(row.id ?? ""),
        title: String(row.id ?? "Return"),
        subtitle: `${row.shipment ?? "?"} · ${row.reason ?? "?"}`,
        to: "/returns",
        icon: "rotate",
      });
    }
  }
  for (const row of index.exceptions) {
    if (matches(row.id, q) || matches(row.shipment, q) || matches(row.kind, q) || matches(row.owner, q)) {
      hits.push({
        category: "Exceptions",
        id: String(row.id ?? ""),
        title: String(row.kind ?? "Exception"),
        subtitle: `${row.shipment ?? "?"} · ${row.severity ?? "?"} · ${row.owner ?? "?"}`,
        to: "/returns",
        icon: "rotate",
      });
    }
  }
  for (const row of index.couriers) {
    if (matches(row.id, q) || matches(row.name, q) || matches(row.city, q) || matches(row.zone, q) || matches(row.status, q)) {
      hits.push({
        category: "Couriers",
        id: String(row.id ?? ""),
        title: `${row.name ?? "Courier"} (${row.id ?? "?"})`,
        subtitle: `${row.city ?? "?"} · ${row.zone ?? "?"} · ${row.status ?? "?"}`,
        to: "/couriers",
        icon: "courier",
      });
    }
  }
  for (const row of index.warehouses) {
    if (matches(row.id, q) || matches(row.name, q) || matches(row.city, q)) {
      hits.push({
        category: "Warehouses",
        id: String(row.id ?? ""),
        title: `${row.name ?? "Warehouse"} (${row.id ?? "?"})`,
        subtitle: `${row.city ?? "?"} · ${row.lanes ?? "?"} lanes`,
        to: "/warehouses",
        icon: "warehouse",
      });
    }
  }
  for (const row of index.workflows) {
    if (matches(row.id, q) || matches(row.shipment, q) || matches(row.type, q) || matches(row.status, q) || matches(row.step, q)) {
      hits.push({
        category: "Workflows",
        id: String(row.id ?? ""),
        title: String(row.id ?? "Workflow"),
        subtitle: `${row.shipment ?? "?"} · ${row.status ?? "?"} · ${row.step ?? "?"}`,
        to: "/dispatch",
        icon: "workflow",
      });
    }
  }
  return hits;
}
