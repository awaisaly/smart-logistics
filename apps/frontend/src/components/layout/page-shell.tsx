export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }): JSX.Element {
  return (
    <div className="sl-page-header">
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--ink)" }}>{title}</h1>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--mute)" }}>{sub}</p>}
      </div>
      {actions && <div className="sl-page-header-actions">{actions}</div>}
    </div>
  );
}

export function PageBody({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="sl-page-body">{children}</div>;
}

export function PageShell({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="sl-page-shell">{children}</div>;
}
