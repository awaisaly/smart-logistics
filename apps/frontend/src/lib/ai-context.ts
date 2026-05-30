export type AiSuggestion = { id?: string; kind?: string; text?: string; impact?: string; action?: string };
export type AiMessage = { role: "user" | "assistant"; text: string; grounded?: string[]; tools?: string[] };

export const AI_CONTEXT_SUGGESTIONS: Record<string, string[]> = {
  overview: ["Which shipments will breach SLA today?", "Summarize today's exceptions", "Recommend a courier rebalance"],
  shipments: ["Why is this shipment delayed?", "Find similar exceptions in last 7d", "Suggest reattempt window"],
  dispatch: ["Why did TPL-d-90ab44 fail?", "List failing workflows by step", "Compensation status for SL-2397382"],
  warehouse: ["Bottleneck root cause in LHE-W1", "Rebalance Gulberg-bound load", "Stock below threshold for tomorrow"],
  warehouses: ["Bottleneck root cause in LHE-W1", "Rebalance Gulberg-bound load", "Stock below threshold for tomorrow"],
  couriers: ["Best courier for SL-2397401", "Overloaded couriers right now", "Reassign C-4833's overflow"],
  events: ["What's behind tracking.milestone lag?", "Replay DLQ since 14:00", "Schema drift on courier.assignment"],
  analytics: ["Why did failed rate drop 12%?", "Compare week-over-week throughput", "Top 5 zones by attempt rate"],
  returns: ["RMA reasons clustered this week", "Refund SLA breach risk", "Damaged-in-transit hotspots"],
  observability: ["Top error endpoints", "Embedding pipeline backlog cause", "P95 regressions last hour"],
  ai: ["What can you help me with?", "Show recent recommendations", "How is delay prediction performing?"],
};

export function routeContextKey(pathname: string): string {
  const key = pathname.replace(/^\//, "").split("/")[0] || "overview";
  return AI_CONTEXT_SUGGESTIONS[key] ? key : "overview";
}

export function suggestionKindColor(kind?: string): string {
  if (kind === "anomaly") return "var(--err)";
  if (kind === "delay") return "var(--warn)";
  return "var(--accent)";
}
