export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// Persisted auth shape (mirrors AuthUser in lib/auth.tsx). We read/write
// localStorage directly here to avoid importing the auth module (circular dep).
const AUTH_STORAGE_KEY = "sl.auth";
// Fired whenever the api layer mutates persisted auth (token refresh / forced
// logout) so AuthProvider can re-sync its in-memory state within the same tab.
export const AUTH_CHANGED_EVENT = "sl-auth-changed";
type StoredAuth = {
  id?: string;
  email?: string;
  role?: string;
  label?: string;
  pages?: string[];
  accessToken?: string;
  refreshToken?: string;
};

function readAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeAuth(next: StoredAuth | null): void {
  if (typeof window === "undefined") return;
  try {
    if (next) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

// Returns an Authorization header when an access token is present.
function authHeaders(): Record<string, string> {
  const token = readAuth()?.accessToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

// Dedupe concurrent refreshes: many requests can 401 at once, but we only want
// to rotate the refresh token a single time and have the rest await that result.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const auth = readAuth();
    const refreshToken = auth?.refreshToken;
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        accessToken?: string;
        refreshToken?: string;
        user?: { id?: string; email?: string; role?: string; label?: string; pages?: string[] };
      };
      if (!res.ok || !data.accessToken) return null;
      writeAuth({
        ...auth,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? refreshToken,
        ...(data.user
          ? {
              id: data.user.id,
              email: data.user.email,
              role: data.user.role,
              label: data.user.label,
              pages: data.user.pages,
            }
          : {}),
      });
      return data.accessToken;
    } catch {
      return null;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// Refresh token is gone/expired → end the session and send the user to login.
function handleAuthFailure(): void {
  writeAuth(null);
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

// Single fetch path that injects auth, and on a 401 transparently refreshes the
// access token once and retries. If refresh fails, it clears the session.
async function authedFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...authHeaders() };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 && !isRetry) {
    const token = await refreshAccessToken();
    if (token) return authedFetch(path, init, true);
    handleAuthFailure();
  }
  return res;
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
  const res = await authedFetch(path);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function deleteJson<T>(path: string): Promise<T> {
  const res = await authedFetch(path, { method: "DELETE" });
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
  const res = await authedFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
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
