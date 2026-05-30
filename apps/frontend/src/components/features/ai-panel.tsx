import React from "react";
import { deleteJson, fetchJson, postJson, streamSse } from "@/lib/api";
import {
  AI_CONTEXT_SUGGESTIONS,
  suggestionKindColor,
  type AiMessage,
  type AiSuggestion,
} from "@/lib/ai-context";
import { Icon } from "@/components/ui/icon";
import { useCurrentUser } from "@/hooks/useCurrentUser";

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

export function AiPanel({
  open,
  onToggle,
  context,
}: {
  open: boolean;
  onToggle: () => void;
  context: string;
}): JSX.Element {
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<AiMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<AiSuggestion[]>([]);
  const [info, setInfo] = React.useState<AiInfo>({});
  const [meta, setMeta] = React.useState<SuggestionsMeta>({});
  const [refreshing, setRefreshing] = React.useState(false);
  const [, forceTick] = React.useReducer((x: number) => x + 1, 0);
  const [pendingFeedback, setPendingFeedback] = React.useState<Record<string, "accepted" | "dismissed" | undefined>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const { firstName } = useCurrentUser();

  const loadSuggestions = React.useCallback(() => {
    const path = context ? `/ai/suggestions?pageHint=${encodeURIComponent(context)}` : "/ai/suggestions";
    void fetchJson<{ items?: AiSuggestion[]; mode?: string; generatedAt?: string | null; candidatesCount?: number }>(path)
      .then((res) => {
        setSuggestions(res.items ?? []);
        setMeta({ mode: res.mode, generatedAt: res.generatedAt ?? null, candidatesCount: res.candidatesCount });
      })
      .catch(() => undefined);
  }, [context]);

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

  const loadHistory = React.useCallback(() => {
    void fetchJson<{ items?: AiMessage[] }>("/ai/assistant/history")
      .then((res) => {
        setMessages((prev) => {
          // Defensive: never clobber a conversation the user has already started locally.
          if (prev.length > 0) return prev;
          return res.items ?? [];
        });
      })
      .catch(() => undefined);
  }, []);

  // Mount-only: load history + /ai/info exactly once. Reloading on every context
  // change would race with an in-flight POST /assistant/stream and wipe the
  // just-sent user message from the panel until a real page reload.
  React.useEffect(() => {
    loadHistory();
    void fetchJson<AiInfo>("/ai/info")
      .then(setInfo)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount-only stream abort. Context changes should NOT abort an in-flight reply.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Context-driven: refresh suggestions whenever the user navigates to a new page.
  React.useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

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
  }, [messages, streaming, open]);

  const promptList = AI_CONTEXT_SUGGESTIONS[context] ?? AI_CONTEXT_SUGGESTIONS.overview;

  const send = (text?: string): void => {
    const value = (text ?? input).trim();
    if (!value || streaming) return;
    setMessages((m) => [...m, { role: "user", text: value }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = "";
    let toolStatus = "";
    let added = false;
    let tools: string[] = [];
    let grounded: string[] = [];

    const displayText = (): string => assistantText || toolStatus;

    const upsertAssistant = () => {
      setMessages((m) => {
        if (!added) {
          added = true;
          return [...m, { role: "assistant", text: displayText(), tools, grounded }];
        }
        const next = [...m];
        next[next.length - 1] = { role: "assistant", text: displayText(), tools, grounded };
        return next;
      });
    };

    void streamSse(
      "/ai/assistant/stream",
      { prompt: value, context },
      {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "chunk" && typeof event.text === "string") {
            assistantText += event.text;
            toolStatus = "";
            upsertAssistant();
          } else if (event.type === "tool-call" && typeof event.toolName === "string") {
            if (!tools.includes(event.toolName)) tools = [...tools, event.toolName];
            const args = (event.args ?? {}) as Record<string, unknown>;
            const id = typeof args.id === "string" ? args.id : "";
            if (id && !grounded.includes(id)) grounded = [...grounded, id];
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
            if (Array.isArray(event.tools)) tools = event.tools as string[];
            if (Array.isArray(event.grounded)) grounded = event.grounded as string[];
            if (typeof event.text === "string" && event.text.length > assistantText.length) {
              assistantText = event.text;
            }
            toolStatus = "";
            upsertAssistant();
          } else if (event.type === "error" && typeof event.error === "string") {
            assistantText = assistantText
              ? `${assistantText}\n\n_(stream interrupted: ${event.error})_`
              : `Assistant error: ${event.error}`;
            upsertAssistant();
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
            { role: "assistant", text: `Assistant is unreachable: ${message}`, tools: [] },
          ]);
        } else {
          assistantText = `${assistantText}\n\n_(stream failed: ${message})_`;
          upsertAssistant();
        }
      })
      .finally(() => {
        setStreaming(false);
        abortRef.current = null;
      });
  };

  const respondToSuggestion = (s: AiSuggestion, kind: "accepted" | "dismissed"): void => {
    if (!s.id) return;
    setPendingFeedback((p) => ({ ...p, [s.id!]: kind }));
    void postJson<{ ok: boolean }>(`/ai/suggestions/${s.id}/feedback`, {
      status: kind,
      actor: firstName || "ops:console",
    })
      .then(() => {
        if (kind === "dismissed") {
          setSuggestions((items) => items.filter((it) => it.id !== s.id));
        } else {
          loadSuggestions();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setPendingFeedback((p) => {
          const next = { ...p };
          delete next[s.id!];
          return next;
        });
      });
    if (kind === "accepted" && s.text) {
      send(`Help me action this recommendation: ${s.text}`);
    }
  };

  const clearChat = (): void => {
    void deleteJson("/ai/assistant/history")
      .then(() => setMessages([]))
      .catch(() => setMessages([]));
  };

  if (!open) {
    return (
      <aside
        className="sl-ai-collapsed"
        style={{
          width: 44,
          background: "var(--bg-warm)",
          borderLeft: "0.5px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 0",
          gap: 14,
        }}
      >
        <button
          onClick={onToggle}
          title="Open assistant"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--ink)",
            color: "var(--bg)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon name="ai" size={16} />
        </button>
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 10.5,
            color: "var(--mute)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Operations assistant
        </div>
      </aside>
    );
  }

  const statusLabel = info.groqEnabled
    ? `grounded · streaming · ${info.model ?? "groq"}`
    : "grounded · stub (set GROQ_API_KEY)";
  const statusDotColor = info.groqEnabled ? "var(--ok)" : "var(--warn)";

  return (
    <aside
      className="sl-ai-panel"
      style={{
        width: 360,
        background: "var(--bg-warm)",
        borderLeft: "0.5px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <header
        style={{
          padding: "12px 14px",
          borderBottom: "0.5px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "var(--ink)",
              color: "var(--bg)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="ai" size={12} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Operations assistant</div>
            <div style={{ fontSize: 10.5, color: "var(--mute)" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: statusDotColor,
                  marginRight: 5,
                  verticalAlign: "middle",
                }}
              />
              {statusLabel}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={clearChat}
            title="Clear conversation"
            style={{ color: "var(--mute)", padding: 4, fontSize: 11 }}
          >
            Clear
          </button>
          <button onClick={onToggle} title="Collapse" style={{ color: "var(--mute)", padding: 4 }}>
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      <div style={{ padding: "10px 14px 8px", borderBottom: "0.5px solid var(--line)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: "var(--mute)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Live recommendations
          </div>
          <button
            type="button"
            onClick={refreshSuggestions}
            disabled={refreshing}
            title="Regenerate from live operations"
            style={{
              fontSize: 10,
              color: "var(--ink-2)",
              padding: "2px 6px",
              border: "0.5px solid var(--line)",
              borderRadius: 4,
              background: "var(--surface)",
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {suggestions.length === 0 ? (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--mute)",
                padding: "9px 11px",
                background: "var(--surface)",
                borderRadius: 8,
                border: "0.5px solid var(--line)",
              }}
            >
              No live recommendations right now.
            </div>
          ) : (
            suggestions.slice(0, 2).map((s, i) => {
              const pending = s.id ? pendingFeedback[s.id] : undefined;
              return (
                <div
                  key={s.id ?? i}
                  style={{
                    padding: "9px 11px",
                    background: "var(--surface)",
                    borderRadius: 8,
                    border: "0.5px solid var(--line)",
                    fontSize: 11.5,
                    lineHeight: 1.45,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{ width: 5, height: 5, borderRadius: 999, background: suggestionKindColor(s.kind) }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--mute)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {s.kind ?? "suggestion"}
                    </span>
                    {s.impact && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          color: "var(--mute)",
                        }}
                      >
                        {s.impact}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--ink-2)" }}>{s.text}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {s.action && (
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
                        {pending === "accepted" ? "Working…" : s.action}
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
            })
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 9.5, color: "var(--mute-2)", display: "flex", justifyContent: "space-between" }}>
          <span>{meta.mode ? `${meta.mode === "groq" ? "Groq-ranked" : meta.mode === "rules" ? "Rules" : "Seed"} · ${meta.candidatesCount ?? suggestions.length} candidates` : ""}</span>
          <span>Updated {formatRelativeTime(meta.generatedAt)}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 && !streaming && (
          <div style={{ fontSize: 11.5, color: "var(--mute)", textAlign: "center", padding: "32px 8px" }}>
            Ask anything about today's operations.
          </div>
        )}
        {messages.map((m, i) => (
          <AiChatMessage key={i} message={m} />
        ))}
        {streaming && messages.at(-1)?.role !== "assistant" && (
          <div
            style={{
              display: "flex",
              gap: 4,
              alignItems: "center",
              color: "var(--mute)",
              fontSize: 11.5,
              padding: "0 4px",
            }}
          >
            <span
              className="pulse"
              style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)" }}
            />
            <span style={{ marginLeft: 8 }}>Retrieving context…</span>
          </div>
        )}
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "0.5px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {promptList.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={streaming}
              style={{
                fontSize: 10.5,
                padding: "3px 8px",
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
            gap: 6,
            background: "var(--surface)",
            border: "0.5px solid var(--line-strong)",
            borderRadius: 8,
            padding: "6px 6px 6px 10px",
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the operations assistant…"
            disabled={streaming}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 12.5,
              fontFamily: "var(--sans)",
              color: "var(--ink)",
            }}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "var(--ink)",
              color: "var(--bg)",
              display: "grid",
              placeItems: "center",
              opacity: streaming || !input.trim() ? 0.6 : 1,
            }}
          >
            <Icon name="send" size={12} />
          </button>
        </form>
        <div style={{ fontSize: 9.5, color: "var(--mute-2)", textAlign: "center" }}>
          {info.groqEnabled
            ? `Groq ${info.model} · grounded on operational context · responses can be inaccurate`
            : "Stub responder · add GROQ_API_KEY for live answers"}
        </div>
      </div>
    </aside>
  );
}

export function AiChatMessage({ message }: { message: AiMessage }): JSX.Element {
  if (message.role === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "85%",
          background: "var(--ink)",
          color: "var(--bg)",
          padding: "8px 11px",
          borderRadius: "10px 10px 2px 10px",
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
      >
        {message.text}
      </div>
    );
  }
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--line)",
          padding: "9px 11px",
          borderRadius: "10px 10px 10px 2px",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--ink-2)",
          whiteSpace: "pre-wrap",
        }}
        dangerouslySetInnerHTML={{
          __html: renderMarkdownLite(message.text),
        }}
      />
      {message.grounded && message.grounded.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 4 }}>
          <span style={{ fontSize: 10, color: "var(--mute)" }}>grounded on:</span>
          {message.grounded.map((g) => (
            <span
              key={g}
              className="mono"
              style={{ fontSize: 10, color: "var(--info)", background: "var(--info-soft)", padding: "1px 6px", borderRadius: 4 }}
            >
              {g}
            </span>
          ))}
        </div>
      )}
      {message.tools && message.tools.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 4 }}>
          <span style={{ fontSize: 10, color: "var(--mute)" }}>tools:</span>
          {message.tools.map((t) => (
            <span key={t} className="mono" style={{ fontSize: 10, color: "var(--mute)" }}>
              {t}()
            </span>
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
    .replace(/`([^`]+)`/g, '<code class="mono" style="background:var(--bg-warm);padding:0 4px;border-radius:3px;font-size:11.5px;">$1</code>');
}
