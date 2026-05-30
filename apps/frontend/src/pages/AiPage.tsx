import React from "react";
import { deleteJson, fetchJson, postJson, streamSse } from "@/lib/api";
import { toNumber } from "@/lib/format";
import { suggestionKindColor } from "@/lib/ai-context";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  PageCard,
  Icon,
  PrototypePill,
  FieldRow,
  PageHeader,
} from "@/components";

export type AiChatMsg = {
  role: "user" | "assistant";
  text: string;
  grounded?: string[];
  tools?: string[];
  latency?: string;
  streamed?: boolean;
};

type AiInfo = { groqEnabled?: boolean; model?: string };
type SuggestionsMeta = { mode?: string; generatedAt?: string | null; candidatesCount?: number };

const SUGGESTIONS_POLL_MS = 30_000;

const formatRelativeTime = (iso?: string | null): string => {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

export function AiPage(): JSX.Element {
  const [messages, setMessages] = React.useState<AiChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Array<Record<string, unknown>>>([]);
  const [tools, setTools] = React.useState<Array<Record<string, unknown>>>([]);
  const [metrics, setMetrics] = React.useState<Record<string, unknown>>({});
  const [prompts, setPrompts] = React.useState<Array<Record<string, unknown>>>([]);
  const [info, setInfo] = React.useState<AiInfo>({});
  const [meta, setMeta] = React.useState<SuggestionsMeta>({});
  const [refreshing, setRefreshing] = React.useState(false);
  const [, forceTick] = React.useReducer((x: number) => x + 1, 0);
  const [pendingFeedback, setPendingFeedback] = React.useState<Record<string, "accepted" | "dismissed" | undefined>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const { firstName } = useCurrentUser();

  const loadSuggestions = React.useCallback(() => {
    void fetchJson<{ items?: Array<Record<string, unknown>>; mode?: string; generatedAt?: string | null; candidatesCount?: number }>("/ai/suggestions?pageHint=ai")
      .then((res) => {
        setSuggestions(res.items ?? []);
        setMeta({ mode: res.mode, generatedAt: res.generatedAt ?? null, candidatesCount: res.candidatesCount });
      })
      .catch(() => undefined);
  }, []);

  const refreshSuggestions = React.useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    void postJson<{ ok: boolean }>("/ai/suggestions/refresh", {})
      .catch(() => undefined)
      .finally(() => {
        loadSuggestions();
        setRefreshing(false);
      });
  }, [refreshing, loadSuggestions]);

  React.useEffect(() => {
    void Promise.allSettled([
      fetchJson<{ items?: AiChatMsg[] }>("/ai/assistant/history"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/ai/suggestions"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/ai/assistant/tools"),
      fetchJson<Record<string, unknown>>("/ai/assistant/metrics"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/ai/assistant/prompts"),
      fetchJson<AiInfo>("/ai/info"),
    ]).then(([hist, sugg, tl, met, pr, inf]) => {
      if (hist.status === "fulfilled") setMessages(hist.value.items ?? []);
      if (sugg.status === "fulfilled") setSuggestions(sugg.value.items ?? []);
      if (tl.status === "fulfilled") setTools(tl.value.items ?? []);
      if (met.status === "fulfilled") setMetrics(met.value ?? {});
      if (pr.status === "fulfilled") setPrompts(pr.value.items ?? []);
      if (inf.status === "fulfilled") setInfo(inf.value ?? {});
    });
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    const interval = window.setInterval(() => loadSuggestions(), SUGGESTIONS_POLL_MS);
    const onFocus = () => loadSuggestions();
    const tick = window.setInterval(forceTick, 5000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadSuggestions]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  const send = (text?: string): void => {
    const value = (text ?? input).trim();
    if (!value || streaming) return;
    setMessages((m) => [...m, { role: "user", text: value }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();
    let assistantText = "";
    let toolStatus = "";
    let added = false;
    let toolsRef: string[] = [];
    let groundedRef: string[] = [];

    const upsertAssistant = (overrides?: Partial<AiChatMsg>) => {
      setMessages((m) => {
        const base: AiChatMsg = {
          role: "assistant",
          text: assistantText || toolStatus,
          tools: toolsRef,
          grounded: groundedRef,
          streamed: true,
          ...(overrides ?? {}),
        };
        if (!added) {
          added = true;
          return [...m, base];
        }
        const next = [...m];
        next[next.length - 1] = base;
        return next;
      });
    };

    void streamSse(
      "/ai/assistant/stream",
      { prompt: value, context: "ai" },
      {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "chunk" && typeof event.text === "string") {
            assistantText += event.text;
            toolStatus = "";
            upsertAssistant();
          } else if (event.type === "tool-call" && typeof event.toolName === "string") {
            if (!toolsRef.includes(event.toolName)) toolsRef = [...toolsRef, event.toolName];
            const args = (event.args ?? {}) as Record<string, unknown>;
            const id = typeof args.id === "string" ? args.id : "";
            if (id && !groundedRef.includes(id)) groundedRef = [...groundedRef, id];
            if (!assistantText) {
              toolStatus = id
                ? `Inspecting ${event.toolName} (${id})…`
                : `Inspecting ${event.toolName}…`;
            }
            upsertAssistant();
          } else if (event.type === "tool-result") {
            upsertAssistant();
          } else if (event.type === "tool-error" && typeof event.toolName === "string") {
            if (!assistantText) {
              toolStatus = `Tool ${event.toolName} failed: ${String(event.error ?? "unknown")}`;
            }
            upsertAssistant();
          } else if (event.type === "done") {
            if (Array.isArray(event.tools)) toolsRef = event.tools as string[];
            if (Array.isArray(event.grounded)) groundedRef = event.grounded as string[];
            if (typeof event.text === "string" && event.text.length > assistantText.length) {
              assistantText = event.text;
            }
            toolStatus = "";
            const latencyMs = typeof event.latencyMs === "number" ? event.latencyMs : Math.round(performance.now() - startedAt);
            upsertAssistant({ latency: `${latencyMs}ms` });
          } else if (event.type === "error" && typeof event.error === "string") {
            assistantText = assistantText
              ? `${assistantText}\n\n_(stream interrupted: ${event.error})_`
              : `Assistant error: ${event.error}`;
            upsertAssistant({ latency: "error" });
          }
        },
      },
    )
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "unknown";
        if (controller.signal.aborted) return;
        if (!added) {
          setMessages((m) => [
            ...m,
            { role: "assistant", text: `Assistant stream error: ${message}`, latency: "error" },
          ]);
        } else {
          assistantText = `${assistantText}\n\n_(stream failed: ${message})_`;
          upsertAssistant({ latency: "error" });
        }
      })
      .finally(() => {
        setStreaming(false);
        abortRef.current = null;
      });
  };

  const respondToSuggestion = (s: Record<string, unknown>, kind: "accepted" | "dismissed"): void => {
    const id = String(s.id ?? "");
    if (!id) return;
    setPendingFeedback((p) => ({ ...p, [id]: kind }));
    void postJson<{ ok: boolean }>(`/ai/suggestions/${id}/feedback`, {
      status: kind,
      actor: firstName || "ops:console",
    })
      .then(() => {
        if (kind === "dismissed") {
          setSuggestions((items) => items.filter((it) => String(it.id ?? "") !== id));
        } else {
          loadSuggestions();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setPendingFeedback((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      });
    if (kind === "accepted" && typeof s.text === "string") {
      send(`Help me action this recommendation: ${s.text}`);
    }
  };

  const clearChat = (): void => {
    void deleteJson("/ai/assistant/history")
      .then(() => setMessages([]))
      .catch(() => setMessages([]));
  };

  const quickPrompts = prompts.length > 0
    ? prompts.map((p) => String(p.text ?? "")).filter(Boolean)
    : [
        "Summarize today's exceptions",
        "Show shipments at risk of SLA breach",
        "Suggest courier rebalance for North zone",
      ];

  const statusTone: "ok" | "warn" = info.groqEnabled ? "ok" : "warn";
  const statusLabel = info.groqEnabled ? `live · ${info.model ?? "groq"}` : "stub mode";

  return (
    <>
      <PageHeader
        title="Operations assistant"
        sub={info.groqEnabled
          ? `Groq ${info.model} · streaming · grounded on operational context`
          : "Grounded · streaming · stub mode (add GROQ_API_KEY to enable Groq)"}
        actions={(
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PrototypePill tone={statusTone} size="sm">{statusLabel}</PrototypePill>
            <button
              onClick={clearChat}
              style={{
                fontSize: 11.5,
                padding: "5px 10px",
                borderRadius: 6,
                border: "0.5px solid var(--line-strong)",
                background: "var(--surface)",
                color: "var(--ink-2)",
              }}
            >
              Clear chat
            </button>
          </div>
        )}
      />
      <div className="sl-split-ai">
        <div style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: "20px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              maxWidth: 800,
              margin: "0 auto",
              width: "100%",
            }}
          >
            {messages.length === 0 && !streaming && (
              <div style={{ textAlign: "center", color: "var(--mute)", fontSize: 12.5, padding: "32px 8px" }}>
                Ask anything about today&rsquo;s operations.
              </div>
            )}
            {messages.map((m, i) => (
              <AiFullChatMessage key={i} m={m} />
            ))}
            {streaming && messages.at(-1)?.role !== "assistant" && (
              <div style={{ color: "var(--mute)", fontSize: 12, padding: "4px 4px" }}>Retrieving context…</div>
            )}
          </div>
          <div style={{ padding: "12px 28px 18px", borderTop: "0.5px solid var(--line)", background: "var(--bg)" }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {quickPrompts.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={streaming}
                    style={{
                      fontSize: 11.5,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: "var(--surface)",
                      border: "0.5px solid var(--line)",
                      color: "var(--ink-2)",
                      opacity: streaming ? 0.6 : 1,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--surface)",
                  border: "0.5px solid var(--line-strong)",
                  borderRadius: 12,
                  padding: "8px 8px 8px 14px",
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about operations…"
                  disabled={streaming}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 13.5,
                    fontFamily: "var(--sans)",
                    color: "var(--ink)",
                  }}
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "var(--ink)",
                    color: "var(--bg)",
                    fontSize: 12.5,
                    opacity: streaming || !input.trim() ? 0.6 : 1,
                  }}
                >
                  Send
                </button>
              </form>
              {streaming && <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--mute)" }}>Streaming response…</div>}
            </div>
          </div>
        </div>
        <aside style={{ background: "var(--bg)", padding: 16, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
          <PageCard
            title="Live recommendations"
            sub={meta.mode ? `${meta.mode === "groq" ? "Groq-ranked" : meta.mode === "rules" ? "Rules-based" : "Seed"} · updated ${formatRelativeTime(meta.generatedAt)}` : "proactive · acceptance tracked"}
            action={(
              <button
                type="button"
                onClick={refreshSuggestions}
                disabled={refreshing}
                style={{
                  fontSize: 10.5,
                  color: "var(--ink-2)",
                  padding: "3px 8px",
                  border: "0.5px solid var(--line)",
                  borderRadius: 4,
                  background: "var(--surface)",
                  opacity: refreshing ? 0.6 : 1,
                }}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            padding={0}
            bodyStyle={{ padding: 0 }}
          >
            {suggestions.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 11.5, color: "var(--mute)" }}>No suggestions right now.</div>
            )}
            {suggestions.map((s, i) => {
              const id = String(s.id ?? i);
              const pending = pendingFeedback[id];
              const action = typeof s.action === "string" ? (s.action as string) : undefined;
              return (
                <div
                  key={id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: i < suggestions.length - 1 ? "0.5px solid var(--line)" : "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: suggestionKindColor(String(s.kind)) }} />
                    <span style={{ fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{String(s.kind ?? "")}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--mute)", fontFamily: "var(--mono)" }}>{String(s.impact ?? "")}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{String(s.text ?? "")}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {action && (
                      <button
                        disabled={pending !== undefined || streaming}
                        onClick={() => respondToSuggestion(s, "accepted")}
                        style={{
                          background: "var(--surface)",
                          color: "var(--ink)",
                          border: "0.5px solid var(--line-strong)",
                          borderRadius: 6,
                          fontSize: 11.5,
                          padding: "4px 10px",
                          opacity: pending ? 0.6 : 1,
                        }}
                      >
                        {pending === "accepted" ? "Working…" : action}
                      </button>
                    )}
                    <button
                      disabled={pending !== undefined}
                      onClick={() => respondToSuggestion(s, "dismissed")}
                      style={{
                        background: "transparent",
                        color: "var(--ink-2)",
                        borderRadius: 6,
                        fontSize: 11.5,
                        padding: "4px 10px",
                        opacity: pending ? 0.6 : 1,
                      }}
                    >
                      {pending === "dismissed" ? "Dismissing…" : "Dismiss"}
                    </button>
                  </div>
                </div>
              );
            })}
          </PageCard>
          <PageCard title="Tools available" sub="LangGraph nodes" padding={0} bodyStyle={{ padding: 0 }}>
            {tools.map((t, i) => (
              <div key={String(t.name ?? i)} style={{ padding: "8px 12px", borderBottom: i < tools.length - 1 ? "0.5px solid var(--line)" : "none" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--info)" }}>{String(t.name ?? "")}()</span>
                <div style={{ fontSize: 10.5, color: "var(--mute)" }}>p95 {toNumber(t.p95Ms)}ms · {toNumber(t.successPct)}% success</div>
              </div>
            ))}
          </PageCard>
          <PageCard title="Recent metrics" sub="last 24h" padding={14}>
            <FieldRow label="Sessions"><span className="mono">{toNumber(metrics.sessions)}</span></FieldRow>
            <FieldRow label="Questions"><span className="mono">{toNumber(metrics.questions)}</span></FieldRow>
            <FieldRow label="Avg response time"><span className="mono">{toNumber(metrics.avgResponseMs)}ms</span></FieldRow>
            <FieldRow label="Reco acceptance"><span className="mono" style={{ color: "var(--ok)" }}>{toNumber(metrics.recoAcceptancePct)}%</span></FieldRow>
          </PageCard>
        </aside>
      </div>
    </>
  );
}

export function AiFullChatMessage({ m }: { m: AiChatMsg }): JSX.Element {
  if (m.role === "user") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "75%" }}>
        <div style={{ background: "var(--ink)", color: "var(--bg)", padding: "10px 14px", borderRadius: "12px 12px 2px 12px", fontSize: 13.5, lineHeight: 1.5 }}>
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--ink)", color: "var(--bg)", display: "grid", placeItems: "center" }}>
          <Icon name="ai" size={12} />
        </div>
        <span style={{ fontSize: 11.5, color: "var(--mute)" }}>operations assistant</span>
        {m.streamed && <PrototypePill tone="ok" size="sm">streamed</PrototypePill>}
        {m.latency && <span className="mono" style={{ fontSize: 10.5, color: "var(--mute)" }}>{m.latency}</span>}
      </div>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--line)",
          padding: "12px 16px",
          borderRadius: "12px 12px 12px 2px",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--ink-2)",
          whiteSpace: "pre-wrap",
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdownLite(m.text) }}
      />
      {m.grounded && m.grounded.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontSize: 10.5, color: "var(--mute)" }}>grounded on:</span>
          {m.grounded.map((g) => (
            <span key={g} className="mono" style={{ fontSize: 10.5, color: "var(--info)", background: "var(--info-soft)", padding: "1px 6px", borderRadius: 4 }}>
              {g}
            </span>
          ))}
        </div>
      )}
      {m.tools && m.tools.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontSize: 10.5, color: "var(--mute)" }}>tools:</span>
          {m.tools.map((t) => (
            <span key={t} className="mono" style={{ fontSize: 10.5, color: "var(--mute)" }}>{t}()</span>
          ))}
        </div>
      )}
    </div>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownLite(input: string): string {
  const safe = escapeHtml(input);
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="mono" style="background:var(--bg-warm);padding:0 4px;border-radius:3px;font-size:12px;">$1</code>');
}
