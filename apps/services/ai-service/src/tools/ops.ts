import { tool } from "ai";
import { z } from "zod";

const fetchWithTimeout = async <T>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 4000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};

const utilisation = (load: number, capacity: number): number => (capacity > 0 ? load / capacity : 0);

type ShipmentRow = {
  id: string;
  from?: string;
  to?: string;
  status?: string;
  priority?: string;
  courier?: string;
  risk?: number;
  weight?: string;
  placed?: string;
  eta?: string;
  items?: number;
};

type CourierRow = {
  id: string;
  name?: string;
  city?: string;
  zone?: string;
  status?: string;
  load?: number;
  capacity?: number;
  rating?: number;
  attempts?: number;
  delivered?: number;
};

type WorkflowRow = {
  id: string;
  shipment?: string;
  type?: string;
  started?: string;
  duration?: string;
  status?: string;
  step?: string;
  retries?: number;
  error?: string | null;
};

type ExceptionRow = {
  id: string;
  code?: string;
  shipment: string;
  kind: string;
  severity: string;
  age?: string;
  owner?: string;
};

type ExceptionTaxonomyRow = {
  kind: string;
  n: number;
  pct: number;
  tone?: string;
};

export const buildOpsTools = (gatewayUrl: string, headers: Record<string, string> = {}) => {
  const gw = <T>(path: string) => fetchWithTimeout<T>(`${gatewayUrl}${path}`, headers);

  const safeGw = async <T>(path: string, fallback: T): Promise<T> => {
    try {
      return await gw<T>(path);
    } catch (err) {
      return { ...(fallback as object), error: err instanceof Error ? err.message : "lookup failed" } as T;
    }
  };

  return {
    getShipmentSummary: tool({
      description:
        "Get the current snapshot of a single shipment by id (status, route, courier, priority, risk, ETA). Use when the user mentions a specific shipment id like SL-2398472.",
      inputSchema: z.object({
        id: z.string().describe("Shipment id, e.g. SL-2398472")
      }),
      execute: async ({ id }) => {
        try {
          const shipment = await fetchWithTimeout<ShipmentRow>(
            `${gatewayUrl}/shipments/${encodeURIComponent(id)}`,
            headers
          );
          return { found: true, shipment };
        } catch (err) {
          return { found: false, id, error: err instanceof Error ? err.message : "lookup failed" };
        }
      }
    }),

    getShipmentTimeline: tool({
      description:
        "Get the chronological event timeline for a single shipment id. Use for questions about why a shipment is delayed or what happened to it.",
      inputSchema: z.object({
        id: z.string().describe("Shipment id, e.g. SL-2398472")
      }),
      execute: async ({ id }) => {
        try {
          const timeline = await gw<{ items?: unknown[] }>(`/shipments/${encodeURIComponent(id)}/timeline`);
          return { id, items: timeline.items ?? [] };
        } catch (err) {
          return { id, items: [], error: err instanceof Error ? err.message : "lookup failed" };
        }
      }
    }),

    listAtRiskShipments: tool({
      description:
        "List active shipments (not delivered/failed/returned) whose risk score is at or above the threshold, sorted highest first.",
      inputSchema: z.object({
        limit: z.coerce.number().int().min(1).max(20).default(5),
        minRisk: z.coerce.number().min(0).max(1).default(0.7)
      }),
      execute: async ({ limit, minRisk }) => {
        const data = await safeGw(`/shipments?limit=500`, { items: [] as ShipmentRow[] });
        const items = ((data.items ?? []) as ShipmentRow[])
          .filter((s) => Number(s.risk ?? 0) >= minRisk && s.status !== "delivered" && s.status !== "failed" && s.status !== "returned")
          .sort((a, b) => Number(b.risk ?? 0) - Number(a.risk ?? 0))
          .slice(0, limit);
        return { count: items.length, items };
      }
    }),

    getCourierLoad: tool({
      description:
        "Get the current load, capacity, and zone for a single courier id. Use when the user mentions a specific courier like C-4017.",
      inputSchema: z.object({ id: z.string().describe("Courier id, e.g. C-4017") }),
      execute: async ({ id }) => {
        const data = await safeGw(`/couriers`, { items: [] as CourierRow[] });
        const courier = ((data.items ?? []) as CourierRow[]).find((c) => c.id === id);
        if (!courier) return { found: false, id };
        return {
          found: true,
          courier,
          utilizationPct: Math.round(utilisation(courier.load ?? 0, courier.capacity ?? 0) * 100)
        };
      }
    }),

    findOverloadedCouriers: tool({
      description: "List couriers currently at or above the given utilization threshold, sorted by utilization.",
      inputSchema: z.object({
        limit: z.coerce.number().int().min(1).max(20).default(5),
        thresholdPct: z.coerce.number().min(0).max(100).default(85)
      }),
      execute: async ({ limit, thresholdPct }) => {
        const data = await safeGw(`/couriers`, { items: [] as CourierRow[] });
        const items = ((data.items ?? []) as CourierRow[])
          .filter((c) => (c.capacity ?? 0) > 0 && utilisation(c.load ?? 0, c.capacity ?? 0) * 100 >= thresholdPct)
          .sort((a, b) => utilisation(b.load ?? 0, b.capacity ?? 0) - utilisation(a.load ?? 0, a.capacity ?? 0))
          .slice(0, limit)
          .map((c) => ({ ...c, utilizationPct: Math.round(utilisation(c.load ?? 0, c.capacity ?? 0) * 100) }));
        return { count: items.length, items };
      }
    }),

    getWorkflowDetail: tool({
      description:
        "Inspect a dispatch workflow's status, current step, retries, and error. Use when the user mentions a workflow id like TPL-disp-abc123.",
      inputSchema: z.object({ id: z.string().describe("Workflow id, e.g. TPL-disp-abc123") }),
      execute: async ({ id }) => {
        const data = await safeGw(`/dispatch/workflows`, { items: [] as WorkflowRow[] });
        const workflow = ((data.items ?? []) as WorkflowRow[]).find((w) => w.id === id);
        if (!workflow) return { found: false, id };
        return { found: true, workflow };
      }
    }),

    listFailedWorkflows: tool({
      description: "List currently failed dispatch workflows.",
      inputSchema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }),
      execute: async ({ limit }) => {
        const data = await safeGw(`/dispatch/workflows`, { items: [] as WorkflowRow[] });
        const items = ((data.items ?? []) as WorkflowRow[]).filter((w) => w.status === "failed").slice(0, limit);
        return { count: items.length, items };
      }
    }),

    listTodayExceptions: tool({
      description:
        "List and summarize today's shipment exceptions (all severities). Use when the user asks to summarize today's exceptions, open issues, or exception breakdown.",
      inputSchema: z.object({ limit: z.coerce.number().int().min(1).max(30).default(15) }),
      execute: async ({ limit }) => {
        const [exc, tax] = await Promise.all([
          safeGw(`/shipments/exceptions`, { items: [] as ExceptionRow[] }),
          safeGw(`/shipments/exceptions/taxonomy`, { items: [] as ExceptionTaxonomyRow[] })
        ]);
        const items = ((exc.items ?? []) as ExceptionRow[]).slice(0, limit);
        const taxonomy = (tax.items ?? []) as ExceptionTaxonomyRow[];
        const bySeverity = items.reduce<Record<string, number>>((acc, row) => {
          acc[row.severity] = (acc[row.severity] ?? 0) + 1;
          return acc;
        }, {});
        return {
          totalToday: items.length,
          bySeverity,
          taxonomy: taxonomy.slice(0, 8),
          items
        };
      }
    }),

    listHighSeverityExceptions: tool({
      description: "List only high-severity shipment exceptions for today.",
      inputSchema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }),
      execute: async ({ limit }) => {
        const data = await safeGw(`/shipments/exceptions`, { items: [] as ExceptionRow[] });
        const items = ((data.items ?? []) as ExceptionRow[]).filter((e) => e.severity === "high").slice(0, limit);
        return { count: items.length, items };
      }
    }),

    getAnalyticsKpis: tool({
      description:
        "Get the current operations KPI snapshot: counts and short trend lines for shipments, dispatched, delivered, failed, plus week-over-week deltas.",
      inputSchema: z.object({}),
      execute: async () => safeGw<Record<string, unknown>>(`/analytics/kpis/overview`, {})
    })
  };
};

export type OpsTools = ReturnType<typeof buildOpsTools>;
