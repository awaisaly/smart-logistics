export const API_BASE = "http://localhost:4000";

// Reads the persisted access token without importing the auth module (avoids a
// circular dependency). Returns an Authorization header when a token is present.
function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("sl.auth");
    if (!raw) return {};
    const token = (JSON.parse(raw) as { accessToken?: string }).accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Appends `from`/`to` ISO bounds to a path, preserving any existing query string.
export function withRange(path: string, range?: { from?: string; to?: string } | null): string {
  if (!range?.from && !range?.to) return path;
  const [base, existing = ""] = path.split("?");
  const params = new URLSearchParams(existing);
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function deleteJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export type SseEvent =
  | { type: "start"; sessionId?: string; model?: string }
  | { type: "chunk"; text: string }
  | { type: "tool-call"; toolName: string; args?: Record<string, unknown> }
  | { type: "tool-result"; toolName: string }
  | { type: "tool-error"; toolName: string; error: string }
  | { type: "done"; text?: string; latencyMs?: number; tools?: string[]; grounded?: string[] }
  | { type: "error"; error: string }
  | { type: string; [k: string]: unknown };

export type StreamHandlers = {
  onEvent?: (event: SseEvent) => void;
  signal?: AbortSignal;
};

export async function streamSse(path: string, body: unknown, handlers: StreamHandlers = {}): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...authHeaders() },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`${path} stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const raw of events) {
      const lines = raw.split("\n");
      const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
      if (dataLines.length === 0) continue;
      const data = dataLines.join("\n");
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as SseEvent;
        handlers.onEvent?.(parsed);
      } catch {
        handlers.onEvent?.({ type: "chunk", text: data });
      }
    }
  }
}
