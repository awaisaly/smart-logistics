import React from "react";
import { API_BASE } from "@/lib/api";

export type AuthUser = {
  id?: string;
  email: string;
  role: string;
  accessToken?: string;
  refreshToken?: string;
};

type LoginResult = { ok: true; user: AuthUser } | { ok: false; error: string };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  pending: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
};

const STORAGE_KEY = "sl.auth";

const AuthContext = React.createContext<AuthContextValue | null>(null);

function readStoredAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed && typeof parsed.email === "string" && typeof parsed.role === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the access token outside React (used by the api layer to attach headers). */
export function getAuthToken(): string | null {
  return readStoredAuth()?.accessToken ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setUser(readStoredAuth());
    setLoading(false);
  }, []);

  const persist = React.useCallback((next: AuthUser | null) => {
    setUser(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }, []);

  const login = React.useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      setPending(true);
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          accessToken?: string;
          refreshToken?: string;
          user?: { id?: string; email: string; role: string };
        };
        if (!res.ok || data.ok === false || !data.accessToken || !data.user) {
          return { ok: false, error: data.error ?? "Invalid email or password" };
        }
        const next: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          role: data.user.role,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        };
        persist(next);
        return { ok: true, user: next };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Network error" };
      } finally {
        setPending(false);
      }
    },
    [persist]
  );

  const logout = React.useCallback(() => {
    const token = user?.refreshToken;
    // Best-effort server logout; we don't block the UI on it.
    void fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => undefined);
    persist(null);
  }, [persist, user]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, loading, pending, login, logout }),
    [user, loading, pending, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
