import type { Pool } from "pg";
import { generateObject, NoObjectGeneratedError } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";

export type SuggestionItem = {
  id: string;
  kind: "reco" | "delay" | "anomaly";
  text: string;
  impact: string;
  action?: string;
  pageHint?: string;
  score?: number;
};

export type SuggestionsMode = "groq" | "rules" | "seed";

export type SuggestionsArtifact = {
  items: SuggestionItem[];
  mode: SuggestionsMode;
  generatedAt: string;
  candidatesCount: number;
  notes?: string[];
};

type OpsSnapshot = {
  shipments: {
    total: number;
    atSlaRisk: Array<{ id: string; from: string; to: string; risk: number; courier?: string; status: string; priority?: string }>;
  };
  exceptions: Array<{ id: string; shipment: string; kind: string; severity: string; age?: string; owner?: string }>;
  couriers: {
    overloaded: Array<{ id: string; name?: string; zone?: string; city?: string; load: number; capacity: number; status?: string }>;
    idle: Array<{ id: string; name?: string; zone?: string; load: number; capacity: number; status?: string }>;
  };
  dispatch: {
    failed: Array<{ id: string; shipment?: string; step?: string; retries?: number; error?: string | null }>;
    stuck: Array<{ id: string; shipment?: string; step?: string; retries?: number }>;
  };
  kpis: {
    failed?: number;
    failedDelta?: string;
    delivered?: number;
    deliveredDelta?: string;
    shipments?: number;
    dispatched?: number;
  };
};

const fetchWithTimeout = async <T>(url: string, timeoutMs = 3000): Promise<T | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const numericLoad = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const utilisation = (load: number, capacity: number): number => {
  if (!capacity) return 0;
  return load / capacity;
};

export const buildOpsSnapshot = async (gatewayUrl: string): Promise<OpsSnapshot> => {
  const [shipResp, excResp, courResp, kpiResp, dispResp] = await Promise.all([
    fetchWithTimeout<{ items?: Array<Record<string, unknown>>; total?: number }>(`${gatewayUrl}/shipments?limit=500`),
    fetchWithTimeout<{ items?: Array<Record<string, unknown>> }>(`${gatewayUrl}/shipments/exceptions`),
    fetchWithTimeout<{ items?: Array<Record<string, unknown>> }>(`${gatewayUrl}/couriers`),
    fetchWithTimeout<Record<string, unknown>>(`${gatewayUrl}/analytics/kpis/overview`),
    fetchWithTimeout<{ items?: Array<Record<string, unknown>>; total?: number }>(`${gatewayUrl}/dispatch/workflows`)
  ]);

  const shipmentsRaw = shipResp?.items ?? [];
  const couriersRaw = courResp?.items ?? [];
  const exceptionsRaw = excResp?.items ?? [];
  const workflowsRaw = dispResp?.items ?? [];

  const activeShipments = shipmentsRaw.filter((s) => {
    const status = String(s.status ?? "");
    return status !== "delivered" && status !== "failed" && status !== "returned";
  });

  const atSlaRisk = activeShipments
    .filter((s) => Number(s.risk ?? 0) >= 0.7)
    .sort((a, b) => Number(b.risk ?? 0) - Number(a.risk ?? 0))
    .slice(0, 8)
    .map((s) => ({
      id: String(s.id),
      from: String(s.from ?? ""),
      to: String(s.to ?? ""),
      risk: Number(s.risk ?? 0),
      courier: s.courier ? String(s.courier) : undefined,
      status: String(s.status ?? ""),
      priority: s.priority ? String(s.priority) : undefined
    }));

  const overloaded = couriersRaw
    .map((c) => ({
      id: String(c.id),
      name: c.name ? String(c.name) : undefined,
      zone: c.zone ? String(c.zone) : undefined,
      city: c.city ? String(c.city) : undefined,
      status: c.status ? String(c.status) : undefined,
      load: numericLoad(c.load),
      capacity: numericLoad(c.capacity)
    }))
    .filter((c) => c.capacity > 0 && utilisation(c.load, c.capacity) >= 0.85)
    .sort((a, b) => utilisation(b.load, b.capacity) - utilisation(a.load, a.capacity))
    .slice(0, 6);

  const idle = couriersRaw
    .map((c) => ({
      id: String(c.id),
      name: c.name ? String(c.name) : undefined,
      zone: c.zone ? String(c.zone) : undefined,
      status: c.status ? String(c.status) : undefined,
      load: numericLoad(c.load),
      capacity: numericLoad(c.capacity)
    }))
    .filter((c) => c.capacity > 0 && utilisation(c.load, c.capacity) <= 0.2 && c.status === "available")
    .slice(0, 6);

  const failedWorkflows = workflowsRaw
    .filter((w) => String(w.status ?? "") === "failed")
    .slice(0, 8)
    .map((w) => ({
      id: String(w.id),
      shipment: w.shipment ? String(w.shipment) : undefined,
      step: w.step ? String(w.step) : undefined,
      retries: Number(w.retries ?? 0),
      error: typeof w.error === "string" ? w.error : null
    }));

  const stuckWorkflows = workflowsRaw
    .filter((w) => String(w.status ?? "") === "running" && Number(w.retries ?? 0) >= 2)
    .slice(0, 6)
    .map((w) => ({
      id: String(w.id),
      shipment: w.shipment ? String(w.shipment) : undefined,
      step: w.step ? String(w.step) : undefined,
      retries: Number(w.retries ?? 0)
    }));

  const exceptions = exceptionsRaw
    .filter((e) => String(e.severity ?? "") === "high")
    .slice(0, 6)
    .map((e) => ({
      id: String(e.id),
      shipment: String(e.shipment ?? ""),
      kind: String(e.kind ?? ""),
      severity: String(e.severity ?? ""),
      age: e.age ? String(e.age) : undefined,
      owner: e.owner ? String(e.owner) : undefined
    }));

  const deltas = (kpiResp?.deltas as Record<string, string> | undefined) ?? {};
  const kpis = {
    failed: typeof kpiResp?.failed === "number" ? Number(kpiResp.failed) : undefined,
    failedDelta: deltas.failed,
    delivered: typeof kpiResp?.delivered === "number" ? Number(kpiResp.delivered) : undefined,
    deliveredDelta: deltas.delivered,
    shipments: typeof kpiResp?.shipments === "number" ? Number(kpiResp.shipments) : undefined,
    dispatched: typeof kpiResp?.dispatched === "number" ? Number(kpiResp.dispatched) : undefined
  };

  return {
    shipments: { total: shipResp?.total ?? shipmentsRaw.length, atSlaRisk },
    exceptions,
    couriers: { overloaded, idle },
    dispatch: { failed: failedWorkflows, stuck: stuckWorkflows },
    kpis
  };
};

const fmtUtil = (load: number, capacity: number): string => `${load}/${capacity} (${Math.round(utilisation(load, capacity) * 100)}%)`;

export const generateCandidates = (snapshot: OpsSnapshot): SuggestionItem[] => {
  const candidates: SuggestionItem[] = [];

  for (const c of snapshot.couriers.overloaded.slice(0, 4)) {
    candidates.push({
      id: `reco:courier:${c.id}:overload`,
      kind: "reco",
      text: `Courier ${c.id}${c.zone ? ` in ${c.zone}` : ""} at ${fmtUtil(c.load, c.capacity)} capacity.`,
      impact: `${c.load - Math.floor(c.capacity * 0.8)} overflow stops`,
      action: "Rebalance",
      pageHint: "couriers",
      score: 70 + Math.round(utilisation(c.load, c.capacity) * 25)
    });
  }

  for (const c of snapshot.couriers.idle.slice(0, 2)) {
    candidates.push({
      id: `reco:courier:${c.id}:idle`,
      kind: "reco",
      text: `Courier ${c.id}${c.zone ? ` in ${c.zone}` : ""} idle at ${fmtUtil(c.load, c.capacity)}.`,
      impact: `${Math.max(0, Math.floor(c.capacity * 0.7) - c.load)} spare stops`,
      action: "Assign load",
      pageHint: "couriers",
      score: 35
    });
  }

  for (const s of snapshot.shipments.atSlaRisk.slice(0, 4)) {
    candidates.push({
      id: `delay:shipment:${s.id}:sla`,
      kind: "delay",
      text: `${s.id} from ${s.from} → ${s.to} risks SLA breach (risk ${s.risk.toFixed(2)}).`,
      impact: s.priority ? `${s.priority} priority` : "1 shipment",
      action: "Notify customer",
      pageHint: "shipments",
      score: 60 + Math.round(s.risk * 30)
    });
  }

  for (const w of snapshot.dispatch.failed.slice(0, 4)) {
    candidates.push({
      id: `anomaly:workflow:${w.id}:failed`,
      kind: "anomaly",
      text: `Workflow ${w.id} failed${w.step ? ` at step "${w.step}"` : ""}${w.retries ? ` after ${w.retries} retries` : ""}.`,
      impact: w.shipment ? `${w.shipment}` : "1 workflow",
      action: "Replay",
      pageHint: "dispatch",
      score: 80
    });
  }

  for (const w of snapshot.dispatch.stuck.slice(0, 2)) {
    candidates.push({
      id: `anomaly:workflow:${w.id}:stuck`,
      kind: "anomaly",
      text: `Workflow ${w.id} stuck at "${w.step ?? "?"}" with ${w.retries} retries.`,
      impact: w.shipment ?? "1 workflow",
      action: "Skip step",
      pageHint: "dispatch",
      score: 65
    });
  }

  for (const e of snapshot.exceptions.slice(0, 3)) {
    candidates.push({
      id: `anomaly:exception:${e.id}:severity`,
      kind: "anomaly",
      text: `High-severity ${e.kind} on ${e.shipment}${e.age ? ` (${e.age})` : ""}.`,
      impact: e.owner ?? "1 exception",
      action: "Escalate",
      pageHint: "shipments",
      score: 75
    });
  }

  return candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
};

// Lenient schema: any field that fails validation falls back to "" / a benign default so a single
// off-field doesn't tank the whole batch. We re-filter by allowedIds + dedupe after parse.
const polishedItemSchema = z.object({
  id: z.string().catch("").describe("Stable candidate id; must be one of the provided candidate ids."),
  kind: z.enum(["reco", "delay", "anomaly"]).catch("reco").describe("Recommendation kind."),
  text: z.string().catch("").describe("Single-line operational insight referencing the concrete entity."),
  impact: z.string().catch("").describe("Short impact label, e.g. '3 overflow stops'."),
  action: z.string().catch("").describe("Imperative verb (e.g. Rebalance, Notify, Replay)."),
  pageHint: z.string().catch("").describe("Console page this best maps to (e.g. shipments, couriers, dispatch).")
});

export const polishWithGroq = async (
  apiKey: string,
  model: string,
  snapshot: OpsSnapshot,
  candidates: SuggestionItem[]
): Promise<SuggestionItem[] | null> => {
  if (candidates.length === 0) return [];

  const allowedIds = new Set(candidates.map((c) => c.id));
  const compactSnapshot = {
    kpis: snapshot.kpis,
    shipmentsAtRisk: snapshot.shipments.atSlaRisk.slice(0, 5),
    overloadedCouriers: snapshot.couriers.overloaded.slice(0, 4),
    idleCouriers: snapshot.couriers.idle.slice(0, 3),
    failedWorkflows: snapshot.dispatch.failed.slice(0, 4),
    stuckWorkflows: snapshot.dispatch.stuck.slice(0, 3),
    highSeverityExceptions: snapshot.exceptions.slice(0, 4)
  };

  const system = [
    "You are the recommendation ranker for the SmartLogistics operations console.",
    "Respond with a JSON object that conforms to the requested schema.",
    "Input is a JSON snapshot of live operations plus candidate recommendations with stable IDs.",
    "Pick the 4-6 most operationally useful recommendations.",
    "KEEP each candidate's id EXACTLY as provided (do not invent new ids).",
    "Rewrite each text to be a single concise operational insight (max 160 chars) referencing the concrete entity (shipment/courier/workflow id) and the metric.",
    "Reuse the candidate's `kind` and `action` verb. Plain prose, no emojis, no markdown.",
    "Drop candidates that are not interesting given the snapshot. Order most urgent first."
  ].join(" ");

  const prompt = `Snapshot and candidates in JSON:\n${JSON.stringify({ snapshot: compactSnapshot, candidates }, null, 0)}`;

  let polishedItems: Array<z.infer<typeof polishedItemSchema>>;
  try {
    const provider = createGroq({ apiKey });
    // Older Llama models on Groq don't support strict `json_schema`; ask the provider to fall
    // back to `json_object` mode. In that mode the model is free to pick its own wrapper key
    // (e.g. "recommendations" instead of "elements"), so we normalise it via experimental_repairText.
    const result = await generateObject({
      model: provider(model),
      output: "array",
      schema: polishedItemSchema,
      schemaName: "rankedRecommendation",
      schemaDescription: "A single operationally useful recommendation drawn from the candidate set.",
      providerOptions: { groq: { structuredOutputs: false } },
      system,
      prompt,
      temperature: 0.2,
      maxRetries: 1,
      experimental_repairText: async ({ text }) => {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return JSON.stringify({ elements: parsed });
          if (parsed && typeof parsed === "object") {
            const obj = parsed as Record<string, unknown>;
            if (Array.isArray(obj.elements)) return text;
            const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
            if (arrayKey) return JSON.stringify({ elements: obj[arrayKey] });
          }
          return null;
        } catch {
          return null;
        }
      }
    });
    polishedItems = result.object;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      // eslint-disable-next-line no-console
      console.error(
        "[suggestions] generateObject rejected. raw text:",
        err.text?.slice(0, 1000),
        "| cause:",
        err.cause instanceof Error ? err.cause.message : err.cause
      );
    } else {
      // eslint-disable-next-line no-console
      console.error("[suggestions] generateObject failed:", err instanceof Error ? err.message : err);
    }
    return null;
  }

  try {
    const seen = new Set<string>();
    const cleaned: SuggestionItem[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];
    for (const item of polishedItems) {
      if (!allowedIds.has(item.id)) {
        rejected.push({ id: item.id || "(empty)", reason: "id not in candidate set" });
        continue;
      }
      if (seen.has(item.id)) {
        rejected.push({ id: item.id, reason: "duplicate" });
        continue;
      }
      seen.add(item.id);
      cleaned.push({
        id: item.id,
        kind: item.kind,
        text: item.text.trim().slice(0, 200),
        impact: (item.impact ?? "").trim().slice(0, 80),
        action: item.action?.trim() || candidates.find((c) => c.id === item.id)?.action,
        pageHint: item.pageHint || candidates.find((c) => c.id === item.id)?.pageHint
      });
      if (cleaned.length >= 6) break;
    }
    if (cleaned.length === 0) {
      // eslint-disable-next-line no-console
      console.error(
        "[suggestions] polish produced 0 valid items.",
        "received ids:", polishedItems.map((i) => i.id),
        "rejected:", rejected
      );
    }
    return cleaned;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[suggestions] post-validation failed:", err instanceof Error ? err.message : err);
    return null;
  }
};

export const refreshSuggestions = async (params: {
  pool: Pool;
  gatewayUrl: string;
  groqApiKey: string | null;
  model: string;
}): Promise<SuggestionsArtifact> => {
  const { pool, gatewayUrl, groqApiKey, model } = params;
  const notes: string[] = [];

  let snapshot: OpsSnapshot;
  try {
    snapshot = await buildOpsSnapshot(gatewayUrl);
  } catch (err) {
    notes.push(`snapshot failed: ${err instanceof Error ? err.message : "unknown"}`);
    snapshot = {
      shipments: { total: 0, atSlaRisk: [] },
      exceptions: [],
      couriers: { overloaded: [], idle: [] },
      dispatch: { failed: [], stuck: [] },
      kpis: {}
    };
  }

  const candidates = generateCandidates(snapshot);
  let mode: SuggestionsMode = "rules";
  let items: SuggestionItem[] = candidates.slice(0, 6);

  if (groqApiKey && candidates.length > 0) {
    const polished = await polishWithGroq(groqApiKey, model, snapshot, candidates);
    if (polished && polished.length > 0) {
      items = polished;
      mode = "groq";
    } else {
      notes.push("groq polish failed; fell back to rules");
    }
  }

  const artifact: SuggestionsArtifact = {
    items,
    mode,
    generatedAt: new Date().toISOString(),
    candidatesCount: candidates.length,
    notes: notes.length > 0 ? notes : undefined
  };

  await pool.query(
    `INSERT INTO ai_artifacts (kind, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (kind) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    ["suggestions", JSON.stringify(items)]
  );
  await pool.query(
    `INSERT INTO ai_artifacts (kind, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (kind) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [
      "suggestions_meta",
      JSON.stringify({
        mode,
        generatedAt: artifact.generatedAt,
        candidatesCount: candidates.length,
        notes: artifact.notes ?? []
      })
    ]
  );

  return artifact;
};
