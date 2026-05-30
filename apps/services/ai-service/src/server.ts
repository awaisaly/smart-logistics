import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load the workspace-root .env so local dev (tsx watch) picks up GROQ_API_KEY etc.
loadDotenv({ path: path.resolve(__dirname, "../../../../.env"), quiet: true });

import Fastify from "fastify";
import { z } from "zod";
import { buildLogger, setupMetrics, counter } from "@smartlogistics/shared-middleware";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { streamText, stepCountIs } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { refreshSuggestions, type SuggestionsArtifact } from "./suggestions.js";
import { buildOpsTools } from "./tools/ops.js";
import { startEmbeddingTriggerConsumer } from "./consumers/embedding-trigger.consumer.js";

const app = Fastify({ logger: buildLogger("ai-service") });
setupMetrics(app, "ai-service");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5438"}/ai_service`
});

const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
const GROQ_ENABLED = GROQ_API_KEY.length > 0 && GROQ_API_KEY !== "replace_me";

const groqProvider = GROQ_ENABLED ? createGroq({ apiKey: GROQ_API_KEY }) : null;

const INTERNAL_GATEWAY_URL =
  process.env.INTERNAL_API_GATEWAY_URL?.trim() ||
  `http://localhost:${process.env.API_GATEWAY_PORT ?? 4000}`;
const SUGGESTIONS_REFRESH_MS = Math.max(15000, Number(process.env.SUGGESTIONS_REFRESH_MS ?? 60000));

const opsTools = buildOpsTools(INTERNAL_GATEWAY_URL);

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id UUID PRIMARY KEY,
      user_id UUID,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tools JSONB NOT NULL DEFAULT '[]'::jsonb,
      grounded JSONB NOT NULL DEFAULT '[]'::jsonb,
      latency_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS grounded JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
    CREATE TABLE IF NOT EXISTS ai_artifacts (
      kind TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_suggestion_feedback (
      suggestion_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      actor TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const readArtifact = async <T>(kind: string, fallback: T): Promise<T> => {
  const row = (await pool.query(`SELECT payload FROM ai_artifacts WHERE kind = $1`, [kind])).rows[0];
  return (row?.payload as T) ?? fallback;
};

const DEFAULT_SESSION_ID = "00000000-0000-0000-0000-000000000001";

const ensureDefaultSession = async (): Promise<string> => {
  await pool.query(
    `INSERT INTO ai_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_SESSION_ID]
  );
  return DEFAULT_SESSION_ID;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  tools: string[];
  grounded: string[];
  latencyMs?: number | null;
  createdAt: string;
};

const recentMessages = async (sessionId: string, limit = 16): Promise<StoredMessage[]> => {
  const { rows } = await pool.query(
    `SELECT id, role, content AS text, tools, grounded, latency_ms, created_at
     FROM ai_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows
    .map((r: Record<string, unknown>) => ({
      id: String(r.id),
      role: String(r.role) as StoredMessage["role"],
      text: String(r.text ?? ""),
      tools: Array.isArray(r.tools) ? (r.tools as string[]) : [],
      grounded: Array.isArray(r.grounded) ? (r.grounded as string[]) : [],
      latencyMs: typeof r.latency_ms === "number" ? r.latency_ms : null,
      createdAt: String(r.created_at)
    }))
    .reverse();
};

const insertMessage = async (params: {
  sessionId: string;
  role: StoredMessage["role"];
  text: string;
  tools?: string[];
  grounded?: string[];
  latencyMs?: number;
}): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ai_messages (id, session_id, role, content, tools, grounded, latency_ms)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [
      id,
      params.sessionId,
      params.role,
      params.text,
      JSON.stringify(params.tools ?? []),
      JSON.stringify(params.grounded ?? []),
      params.latencyMs ?? null
    ]
  );
  return id;
};

const promptSchema = z.object({
  prompt: z.string().min(1),
  sessionId: z.string().optional(),
  context: z.string().optional()
});

const buildSystemPrompt = async (contextKey?: string): Promise<string> => {
  const suggestions = await readArtifact<Array<Record<string, unknown>>>("suggestions", []);
  const recos = suggestions
    .slice(0, 6)
    .map((s) => `- [${String(s.kind ?? "info")}] ${String(s.text ?? "")} (${String(s.impact ?? "")})`)
    .join("\n");
  const ctxLine = contextKey
    ? `User is currently viewing the "${contextKey}" screen of the operations console.`
    : "User is in the operations console.";

  return [
    "You are SmartLogistics' Operations Assistant.",
    "You help dispatch operators answer questions about shipments, couriers, warehouses, dispatch workflows, returns, exceptions, and analytics.",
    "Be concise (4–8 sentences), structured, and operationally useful. Use markdown bold (**...**) for key entities and numbers.",
    "When you don't have specific data, say so plainly and suggest the next operational step.",
    "Never fabricate IDs (SL-, C-, W-) — refer to them only if the user mentions them.",
    "Always end with a short 'Suggested next step' line when applicable.",
    "",
    ctxLine,
    recos ? `Active recommendations the operator can see right now:\n${recos}` : "No active live recommendations right now."
  ].join("\n");
};

app.get("/health", async () => ({
  ok: true,
  service: "ai-service",
  groq: { enabled: GROQ_ENABLED, model: GROQ_MODEL }
}));

app.get("/info", async () => ({
  groqEnabled: GROQ_ENABLED,
  model: GROQ_ENABLED ? GROQ_MODEL : "stub"
}));

app.post("/assistant/stream", async (request, reply) => {
  const body = promptSchema.parse(request.body);
  const sessionId = body.sessionId ?? (await ensureDefaultSession());

  const startedAt = Date.now();
  await insertMessage({ sessionId, role: "user", text: body.prompt });

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders?.();

  const sendEvent = (event: Record<string, unknown>): void => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let collected = "";
  const usedTools: string[] = [];
  const grounded: string[] = [];
  const recordTool = (name: string) => {
    if (name && !usedTools.includes(name)) usedTools.push(name);
  };
  const recordGrounded = (value: string) => {
    if (value && !grounded.includes(value)) grounded.push(value);
  };

  try {
    sendEvent({ type: "start", sessionId, model: GROQ_ENABLED ? GROQ_MODEL : "stub" });

    if (GROQ_ENABLED && groqProvider) {
      const history = await recentMessages(sessionId, 14);
      const systemPrompt = await buildSystemPrompt(body.context);

      const messages = [
        ...history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(0, -1)
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
        { role: "user" as const, content: body.prompt }
      ];

      const result = streamText({
        model: groqProvider(GROQ_MODEL),
        system: systemPrompt,
        tools: opsTools,
        toolChoice: "auto",
        stopWhen: stepCountIs(4),
        temperature: 0.4,
        messages
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta": {
            if (part.text) {
              collected += part.text;
              sendEvent({ type: "chunk", text: part.text });
            }
            break;
          }
          case "tool-call": {
            recordTool(part.toolName);
            const input = (part.input ?? {}) as Record<string, unknown>;
            if (typeof input.id === "string") recordGrounded(input.id);
            sendEvent({ type: "tool-call", toolName: part.toolName, args: input });
            break;
          }
          case "tool-result": {
            sendEvent({ type: "tool-result", toolName: part.toolName });
            break;
          }
          case "tool-error": {
            sendEvent({
              type: "tool-error",
              toolName: part.toolName,
              error: part.error instanceof Error ? part.error.message : String(part.error)
            });
            break;
          }
          case "error": {
            const message = part.error instanceof Error ? part.error.message : String(part.error);
            sendEvent({ type: "error", error: message });
            break;
          }
          default:
            // ignore reasoning / source / file / step-bracket events
            break;
        }
      }

      recordGrounded(`model:${GROQ_MODEL}`);
    } else {
      const stubText = stubReply(body.prompt);
      for (const segment of stubText.match(/.{1,32}(\s|$)|.+$/g) ?? [stubText]) {
        collected += segment;
        sendEvent({ type: "chunk", text: segment });
        await new Promise((r) => setTimeout(r, 40));
      }
      recordTool("stub_responder");
      recordGrounded("stub");
    }

    const latencyMs = Date.now() - startedAt;
    await insertMessage({
      sessionId,
      role: "assistant",
      text: collected,
      tools: usedTools,
      grounded,
      latencyMs
    });

    sendEvent({ type: "done", text: collected, latencyMs, tools: usedTools, grounded });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown assistant error";
    app.log.error({ err }, "assistant stream failed");
    sendEvent({ type: "error", error: message });
    if (collected.length > 0) {
      await insertMessage({
        sessionId,
        role: "assistant",
        text: `${collected}\n\n_(assistant interrupted: ${message})_`,
        tools: usedTools,
        grounded,
        latencyMs: Date.now() - startedAt
      });
    }
  } finally {
    reply.raw.end();
  }

  return reply;
});

const stubReply = (prompt: string): string => {
  const lines = [
    `**Assistant (stub):** I don't have a Groq API key yet, so this is a placeholder response.`,
    `You asked: "${prompt.slice(0, 220)}${prompt.length > 220 ? "…" : ""}".`,
    `**Suggested next step:** set GROQ_API_KEY in .env and restart the ai-service to enable live answers.`
  ];
  return lines.join("\n\n");
};

app.delete("/assistant/history", async (request) => {
  const { sessionId } = (request.query ?? {}) as { sessionId?: string };
  const session = sessionId ?? (await ensureDefaultSession());
  await pool.query(`DELETE FROM ai_messages WHERE session_id = $1`, [session]);
  return { ok: true, sessionId: session };
});

app.get("/assistant/history", async () => {
  const session = await ensureDefaultSession();
  const messages = await recentMessages(session, 300);
  return {
    items: messages.map((m) => ({
      role: m.role,
      text: m.text,
      tools: m.tools,
      grounded: m.grounded,
      latency: m.latencyMs ? `${m.latencyMs}ms` : undefined
    }))
  };
});

app.post("/recommend/courier", async () => ({ suggestions: [] }));
app.post("/recommend/delay-mitigation", async () => ({ suggestions: await readArtifact("suggestions", []) }));

type SuggestionsMeta = {
  mode?: "groq" | "rules" | "seed";
  generatedAt?: string;
  candidatesCount?: number;
  notes?: string[];
};

const readSuggestionsMeta = async (): Promise<SuggestionsMeta> => {
  const row = (await pool.query(`SELECT payload, updated_at FROM ai_artifacts WHERE kind = 'suggestions_meta'`)).rows[0];
  if (!row) return { mode: "seed" };
  const payload = (row.payload ?? {}) as SuggestionsMeta;
  return { ...payload, generatedAt: payload.generatedAt ?? new Date(row.updated_at).toISOString() };
};

app.get("/suggestions", async (request) => {
  const query = (request.query ?? {}) as { pageHint?: string };
  const items = await readArtifact<Array<Record<string, unknown>>>("suggestions", []);
  const meta = await readSuggestionsMeta();
  const { rows } = await pool.query(`SELECT suggestion_id, status FROM ai_suggestion_feedback`);
  const dismissed = new Set<string>(
    rows.filter((r: { status: string }) => r.status === "dismissed").map((r: { suggestion_id: string }) => r.suggestion_id)
  );
  const accepted = new Set<string>(
    rows.filter((r: { status: string }) => r.status === "accepted").map((r: { suggestion_id: string }) => r.suggestion_id)
  );
  let visible = items.filter((s) => !dismissed.has(String(s.id ?? "")));
  if (query.pageHint) {
    const hint = query.pageHint;
    const matching = visible.filter((s) => String(s.pageHint ?? "") === hint);
    if (matching.length > 0) visible = [...matching, ...visible.filter((s) => String(s.pageHint ?? "") !== hint)];
  }
  return {
    items: visible.map((s) => ({ ...s, accepted: accepted.has(String(s.id ?? "")) })),
    mode: meta.mode ?? "seed",
    generatedAt: meta.generatedAt ?? null,
    candidatesCount: meta.candidatesCount ?? items.length
  };
});

app.post("/suggestions/refresh", async (_request, reply) => {
  try {
    const artifact = await refreshSuggestions({ pool, gatewayUrl: INTERNAL_GATEWAY_URL, groqApiKey: GROQ_ENABLED ? GROQ_API_KEY : null, model: GROQ_MODEL });
    return {
      ok: true,
      mode: artifact.mode,
      generatedAt: artifact.generatedAt,
      candidatesCount: artifact.candidatesCount,
      itemsCount: artifact.items.length,
      notes: artifact.notes ?? []
    };
  } catch (err) {
    app.log.error({ err }, "suggestions refresh failed");
    reply.code(500);
    return { ok: false, error: err instanceof Error ? err.message : "refresh failed" };
  }
});

const feedbackSchema = z.object({
  status: z.enum(["accepted", "dismissed"]),
  actor: z.string().optional(),
  note: z.string().optional()
});

app.post("/suggestions/:id/feedback", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = feedbackSchema.parse(request.body ?? {});
  const actor = body.actor?.trim() || "ops:console";
  const items = await readArtifact<Array<Record<string, unknown>>>("suggestions", []);
  const exists = items.some((s) => String(s.id ?? "") === id);
  if (!exists) {
    reply.code(404);
    return { ok: false, error: "suggestion not found" };
  }
  await pool.query(
    `INSERT INTO ai_suggestion_feedback (suggestion_id, status, actor, note)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (suggestion_id) DO UPDATE SET status = EXCLUDED.status, actor = EXCLUDED.actor, note = EXCLUDED.note, created_at = NOW()`,
    [id, body.status, actor, body.note ?? null]
  );
  return { ok: true, suggestionId: id, status: body.status };
});

app.get("/assistant/tools", async () => ({ items: await readArtifact("assistant_tools", []) }));
app.get("/assistant/metrics", async () =>
  readArtifact("assistant_metrics", {
    sessions: 0,
    questions: 0,
    avgResponseMs: 0,
    recoAcceptancePct: 0,
    delayPredictionAccPct: 0,
    retrievalP95Ms: 0
  })
);
app.get("/assistant/prompts", async () => ({ items: await readArtifact("assistant_prompts", []) }));
app.get("/reports/daily-dispatch", async () => ({ report: await readArtifact("daily_dispatch_report", "No report generated yet.") }));

const port = Number(process.env.AI_SERVICE_PORT ?? 4009);
await ensureSchema();

// Event-driven indexing hook: count operational changes flagged for retrieval.
// (The assistant answers via live tool-calling; this is the embedding trigger.)
const embeddingTriggers = counter("ai_embedding_triggers_total", "AI embedding-trigger events received");
void startEmbeddingTriggerConsumer(async () => {
  embeddingTriggers.inc();
});

await app.listen({ port, host: "0.0.0.0" });
app.log.info(
  { groq: GROQ_ENABLED, model: GROQ_MODEL, gateway: INTERNAL_GATEWAY_URL, refreshMs: SUGGESTIONS_REFRESH_MS },
  GROQ_ENABLED ? "Groq streaming enabled" : "Groq disabled — set GROQ_API_KEY to enable"
);

let refreshInFlight: Promise<SuggestionsArtifact> | null = null;
const triggerRefresh = (): Promise<SuggestionsArtifact> => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshSuggestions({ pool, gatewayUrl: INTERNAL_GATEWAY_URL, groqApiKey: GROQ_ENABLED ? GROQ_API_KEY : null, model: GROQ_MODEL })
    .then((artifact) => {
      app.log.info(
        { mode: artifact.mode, count: artifact.items.length, candidates: artifact.candidatesCount, notes: artifact.notes },
        "suggestions refreshed"
      );
      return artifact;
    })
    .catch((err) => {
      app.log.error({ err }, "scheduled suggestions refresh failed");
      throw err;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

// initial refresh after a short delay so other services have had a chance to be ready
setTimeout(() => {
  void triggerRefresh().catch(() => undefined);
}, 4000);

setInterval(() => {
  void triggerRefresh().catch(() => undefined);
}, SUGGESTIONS_REFRESH_MS).unref();
