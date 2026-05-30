import React from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { fetchJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DEMO_PASSWORD = "smartlogistics";

type AccountRow = { id?: string; email: string; role: string };

type RolePreset = { role: string; label: string; blurb: string };

const ROLE_PRESETS: RolePreset[] = [
  { role: "admin", label: "Administrator", blurb: "Full operational control" },
  { role: "customer_support", label: "Customer Support", blurb: "Cases, returns & SLAs" },
  { role: "warehouse_operator", label: "Warehouse Operator", blurb: "Inbound & outbound flows" },
  { role: "courier", label: "Courier", blurb: "Routes & deliveries" },
];

const FEATURES = [
  "Live dispatch monitoring across every workflow",
  "AI operations assistant grounded on real data",
  "Shipment lifecycle, audit trails & escalations",
];

function LogoMark(): JSX.Element {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

function EyeIcon({ off }: { off?: boolean }): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export function LoginPage(): JSX.Element {
  const { user, loading, pending, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [accounts, setAccounts] = React.useState<AccountRow[]>([]);

  React.useEffect(() => {
    void fetchJson<{ items?: AccountRow[] }>("/users")
      .then((res) => setAccounts(res.items ?? []))
      .catch(() => undefined);
  }, []);

  if (!loading && user) {
    return <Navigate to="/overview" />;
  }

  const fillRole = (role: string): void => {
    const match = accounts.find((a) => a.role === role) ?? accounts[0];
    if (!match) return;
    setEmail(match.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    const result = await login(email, password);
    if (result.ok) {
      void navigate({ to: "/overview" });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="sl-login">
      {/* Brand / showcase panel */}
      <aside className="sl-login-brand">
        <div className="sl-login-brand-top">
          <div className="sl-login-logo">
            <LogoMark />
            <span>SmartLogistics</span>
          </div>
          <p className="sl-login-tagline">
            The operations console for modern, event-driven logistics.
          </p>
        </div>

        <ul className="sl-login-features">
          {FEATURES.map((f) => (
            <li key={f}>
              <span className="sl-login-feature-dot" />
              {f}
            </li>
          ))}
        </ul>

        <div className="sl-login-brand-foot">
          <div className="sl-login-stat">
            <span className="sl-login-stat-value">9</span>
            <span className="sl-login-stat-label">microservices</span>
          </div>
          <div className="sl-login-stat">
            <span className="sl-login-stat-value">24/7</span>
            <span className="sl-login-stat-label">dispatch watch</span>
          </div>
          <div className="sl-login-stat">
            <span className="sl-login-stat-value">AI</span>
            <span className="sl-login-stat-label">assisted ops</span>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="sl-login-main">
        <div className="sl-login-card">
          <div className="sl-login-card-head">
            <h1>Welcome back</h1>
            <p>Sign in to the operations console.</p>
          </div>

          <form className="sl-login-form" onSubmit={(e) => void submit(e)}>
            <label className="sl-login-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                placeholder="you@smartlogistics.example"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
            </label>

            <label className="sl-login-field">
              <span>Password</span>
              <div className="sl-login-password">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pending}
                />
                <button
                  type="button"
                  className="sl-login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </label>

            {error && <div className="sl-login-error">{error}</div>}

            <button type="submit" className="sl-login-submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="sl-login-divider">
            <span>Quick demo access</span>
          </div>

          <div className="sl-login-roles">
            {ROLE_PRESETS.map((preset) => {
              const available = accounts.some((a) => a.role === preset.role);
              return (
                <button
                  key={preset.role}
                  type="button"
                  className="sl-login-role"
                  onClick={() => fillRole(preset.role)}
                  disabled={pending || !available}
                  title={available ? `Fill credentials for a ${preset.label}` : "No seeded account for this role"}
                >
                  <span className="sl-login-role-label">{preset.label}</span>
                  <span className="sl-login-role-blurb">{preset.blurb}</span>
                </button>
              );
            })}
          </div>

          <p className="sl-login-hint">
            Demo password for all accounts: <code>{DEMO_PASSWORD}</code>
            {accounts.length > 0 && (
              <>
                {" · "}
                {accounts.length} accounts available
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
