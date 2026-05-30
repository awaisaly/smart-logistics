import React from "react";
import { fetchJson, postJson, withRange } from "@/lib/api";
import { toNumber, formatCompact, formatDateTime } from "@/lib/format";
import { DISPATCH_STEPS } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDateRange } from "@/lib/date-range";
import {
  PageCard,
  Icon,
  PrototypePill,
  PrototypeKpi,
  Table,
  Segmented,
  StatusPill,
  MiniStat,
  SkeletonBlock,
  FieldRow,
  LoadBar,
  BarChartSeries,
  SlaPie,
  RmaStage,
  LegendDot,
  ProgressRow,
  Sparkline,
  PageHeader,
  PageBody,
  PageShell,
  DateRangeFilter,
  type PillTone,
} from "@/components";

export type WorkflowRow = {
  id: string;
  type?: string;
  shipment?: string;
  started?: string;
  duration?: string;
  status?: string;
  step?: string;
  retries?: number;
  error?: string | null;
};

export type FailureModeRow = { kind?: string; count?: number; trend?: string; samples?: string[] };
export type DispatchKpis = { running?: number; failing?: number; completed?: number; avgDurationSeconds?: number };
export type DispatchFilter = "all" | "running" | "failing" | "completed";

export function DispatchPage(): JSX.Element {
  const { user } = useCurrentUser();
  const actor = user?.email ? `ops:${user.email.split("@")[0]}` : "ops:console";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [workflows, setWorkflows] = React.useState<WorkflowRow[]>([]);
  const [failureModes, setFailureModes] = React.useState<FailureModeRow[]>([]);
  const [kpis, setKpis] = React.useState<DispatchKpis>({});
  const [filter, setFilter] = React.useState<DispatchFilter>("all");
  const [selectedId, setSelectedId] = React.useState("");

  const [refreshing, setRefreshing] = React.useState(false);

  const { from, to } = useDateRange();

  const fetchDispatchData = React.useCallback(async () => {
    const range = { from, to };
    const [wf, fm, k] = await Promise.all([
      fetchJson<{ items?: WorkflowRow[] }>(withRange("/dispatch/workflows", range)),
      fetchJson<{ items?: FailureModeRow[] }>("/dispatch/failure-modes"),
      fetchJson<DispatchKpis>(withRange("/dispatch/kpis", range)),
    ]);
    return { workflows: wf.items ?? [], failureModes: fm.items ?? [], kpis: k ?? {} };
  }, [from, to]);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchDispatchData()
      .then(({ workflows: items, failureModes: fm, kpis: k }) => {
        setWorkflows(items);
        setFailureModes(fm);
        setKpis(k);
        if (items.length > 0) setSelectedId((prev) => (prev && items.some((w) => w.id === prev) ? prev : items[0]!.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dispatch data"))
      .finally(() => setLoading(false));
  }, [fetchDispatchData]);

  const softRefresh = React.useCallback((): Promise<void> => {
    setRefreshing(true);
    return fetchDispatchData()
      .then(({ workflows: items, failureModes: fm, kpis: k }) => {
        setWorkflows(items);
        setFailureModes(fm);
        setKpis(k);
      })
      .catch(() => {
        // keep last known state; the action toast already surfaces errors
      })
      .finally(() => setRefreshing(false));
  }, [fetchDispatchData]);

  const applyWorkflowUpdate = React.useCallback((updated: WorkflowRow) => {
    if (!updated?.id) return;
    setWorkflows((rows) => {
      const idx = rows.findIndex((r) => r.id === updated.id);
      if (idx === -1) return rows;
      const next = rows.slice();
      next[idx] = { ...rows[idx], ...updated };
      return next;
    });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    return workflows.filter((w) => {
      const s = String(w.status ?? "").toLowerCase();
      if (filter === "running") return s === "running";
      if (filter === "failing") return s === "failing" || s === "compensating";
      if (filter === "completed") return s === "completed";
      return true;
    });
  }, [workflows, filter]);

  React.useEffect(() => {
    if (selectedId && !filtered.some((w) => w.id === selectedId) && filtered.length > 0) {
      setSelectedId(filtered[0]!.id);
    }
  }, [filtered, selectedId]);

  const selected = React.useMemo(
    () => workflows.find((w) => w.id === selectedId) ?? filtered[0] ?? workflows[0] ?? null,
    [workflows, filtered, selectedId]
  );

  const stats = React.useMemo(
    () => ({
      running: workflows.filter((w) => w.status === "running").length,
      failing: workflows.filter((w) => w.status === "failing" || w.status === "compensating").length,
      completed: workflows.filter((w) => w.status === "completed").length,
    }),
    [workflows]
  );

  if (loading) {
    return (
      <>
        <PageHeader title="Dispatch monitor" sub="Loading workflows…" />
        <PageBody>
          <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <PageCard key={i} title="">
                <SkeletonBlock h={10} />
                <div style={{ height: 8 }} />
                <SkeletonBlock h={28} />
              </PageCard>
            ))}
          </div>
          <PageCard title="">
            <SkeletonBlock h={280} />
          </PageCard>
        </PageBody>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Dispatch monitor" sub="Unable to load workflow data." />
        <PageBody>
          <PageCard title="Error">
            <div style={{ color: "var(--err)", fontSize: 13 }}>{error}</div>
          </PageCard>
        </PageBody>
      </>
    );
  }

  if (!selected) {
    return (
      <>
        <PageHeader title="Dispatch monitor" sub="No active workflows" />
        <PageBody>
          <PageCard title="Empty">
            <div style={{ color: "var(--mute)", fontSize: 12 }}>No workflow runs available yet.</div>
          </PageCard>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dispatch monitor"
        sub="Temporal workflows · dispatch + return + exception flows"
        actions={
          <>
            <DateRangeFilter />
            <Segmented
              options={[
                { value: "all", label: "All" },
                { value: "running", label: "Running" },
                { value: "failing", label: "Failing" },
                { value: "completed", label: "Completed" },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <button
              type="button"
              onClick={() => {
                void softRefresh();
              }}
              title="Refresh"
              disabled={refreshing}
              style={{
                padding: "5px 10px",
                fontSize: 11.5,
                borderRadius: 6,
                background: "var(--surface)",
                border: "0.5px solid var(--line)",
                color: "var(--mute)",
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              {refreshing ? "…" : "↻"}
            </button>
          </>
        }
      />
      <PageBody>
        <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
          <PrototypeKpi label="Running" value={String(kpis.running ?? stats.running)} delta={`${stats.running} live`} tone="info" />
          <PrototypeKpi label="Failing" value={String(kpis.failing ?? stats.failing)} delta={`${stats.failing} need attention`} tone="err" />
          <PrototypeKpi label="Completed (1h)" value={String(kpis.completed ?? stats.completed)} delta="live" tone="ok" />
          <PrototypeKpi label="Avg duration" value={`${kpis.avgDurationSeconds ?? 0}s`} delta="live" tone="ink" />
        </div>

        <div className="sl-grid" data-cols={12} style={{ gap: 12 }}>
          <PageCard
            title="Workflow runs"
            sub="latest first · click to inspect"
            action={
              <span style={{ fontSize: 11, color: "var(--info)", fontFamily: "var(--mono)" }}>Open in Temporal UI →</span>
            }
            style={{ gridColumn: "span 7" }}
            padding={0}
            bodyStyle={{ padding: 0 }}
          >
            <Table<WorkflowRow>
              dense
              idKey="id"
              selectedId={selectedId}
              onRowClick={(w) => setSelectedId(w.id)}
              rows={filtered}
              emptyText="No workflows match this filter."
              columns={[
                { key: "id", label: "Workflow", mono: true, render: (r) => <span style={{ color: "var(--info)" }}>{r.id}</span> },
                { key: "type", label: "Type", render: (r) => <span style={{ color: "var(--ink-2)" }}>{String(r.type ?? "")}</span> },
                { key: "shipment", label: "Shipment", mono: true },
                {
                  key: "step",
                  label: "Current step",
                  mono: true,
                  render: (r) => (
                    <span style={{ color: r.status === "failing" ? "var(--err)" : "var(--ink-2)" }}>{String(r.step ?? "")}</span>
                  ),
                },
                {
                  key: "retries",
                  label: "Retries",
                  align: "right",
                  mono: true,
                  render: (r) => (
                    <span style={{ color: toNumber(r.retries) > 0 ? "var(--warn)" : "var(--mute)" }}>{toNumber(r.retries)}</span>
                  ),
                },
                {
                  key: "duration",
                  label: "Duration",
                  align: "right",
                  mono: true,
                  render: (r) => <span style={{ color: "var(--mute)" }}>{String(r.duration ?? "")}</span>,
                },
                { key: "status", label: "Status", render: (r) => <StatusPill status={String(r.status ?? "")} /> },
              ]}
            />
          </PageCard>

          <PageCard title="Run inspector" sub={selected.id} style={{ gridColumn: "span 5" }} padding={14}>
            <DispatchRunInspector
              workflow={selected}
              actor={actor}
              onWorkflowUpdated={applyWorkflowUpdate}
              onRefresh={softRefresh}
            />
          </PageCard>
        </div>

        <PageCard title="Failure modes (24h)" sub="grouped by activity · top compensation paths">
          <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
            {failureModes.length === 0 ? (
              <div style={{ color: "var(--mute)", fontSize: 11.5, gridColumn: "1 / -1" }}>No failure mode data.</div>
            ) : (
              failureModes.map((f) => (
                <div key={String(f.kind)} style={{ padding: 12, background: "var(--bg-warm)", borderRadius: 8 }}>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--ink)", fontWeight: 500 }}>{String(f.kind ?? "")}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>{toNumber(f.count)}</span>
                    <span style={{ fontSize: 11, color: f.trend === "up" ? "var(--err)" : f.trend === "down" ? "var(--ok)" : "var(--mute)" }}>
                      {f.trend === "up" ? "↑" : f.trend === "down" ? "↓" : "→"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--mute)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(f.samples ?? []).join(", ") || "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </PageCard>
      </PageBody>
    </>
  );
}

type InspectorAction = "replay" | "skip" | "terminate";

const INSPECTOR_LABELS: Record<InspectorAction, { idle: string; pending: string; success: string }> = {
  replay: { idle: "Replay", pending: "Replaying…", success: "Workflow replayed from current step." },
  skip: { idle: "Skip step", pending: "Skipping…", success: "Advanced to the next step." },
  terminate: {
    idle: "Terminate",
    pending: "Terminating…",
    success: "Workflow terminated; downstream activities stopped."
  }
};

export function DispatchRunInspector({
  workflow,
  actor,
  onWorkflowUpdated,
  onRefresh,
}: {
  workflow: WorkflowRow;
  actor: string;
  onWorkflowUpdated: (updated: WorkflowRow) => void;
  onRefresh: () => Promise<void> | void;
}): JSX.Element {
  const currentIdx = DISPATCH_STEPS.indexOf(String(workflow.step ?? "") as (typeof DISPATCH_STEPS)[number]);
  const idx = currentIdx >= 0 ? currentIdx : 0;
  const status = String(workflow.status ?? "").toLowerCase();
  const isCompleted = status === "completed";
  const isTerminated = status === "terminated";
  const isTerminal = isCompleted || isTerminated;
  const isFailingStatus = status === "failing" || status === "compensating";
  const isLastActiveStep = idx >= DISPATCH_STEPS.length - 2;

  const [pending, setPending] = React.useState<InspectorAction | null>(null);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  React.useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const idempotencyKey = React.useMemo(
    () => `k_${workflow.shipment?.replace(/\W/g, "").slice(-8) ?? "shp"}_${workflow.step ?? "step"}`,
    [workflow.shipment, workflow.step]
  );

  const runAction = (action: InspectorAction): void => {
    if (pending) return;
    setPending(action);
    const newKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    void postJson<{ ok?: boolean; error?: string; workflow?: WorkflowRow }>(
      `/dispatch/${workflow.id}/${action}`,
      {
        actor,
        idempotencyKey: `${workflow.id}:${action}:${newKey}`,
      },
    )
      .then((res) => {
        if (res.ok === false) throw new Error(res.error ?? `${action} failed`);
        if (res.workflow) onWorkflowUpdated(res.workflow);
        setNotice({ tone: "ok", text: INSPECTOR_LABELS[action].success });
        void onRefresh();
      })
      .catch((e) => {
        setNotice({
          tone: "err",
          text: e instanceof Error ? e.message : `Could not ${INSPECTOR_LABELS[action].idle.toLowerCase()} workflow`,
        });
      })
      .finally(() => setPending(null));
  };

  const replayDisabled = Boolean(pending) || isTerminated;
  const skipDisabled = Boolean(pending) || isTerminal;
  const terminateDisabled = Boolean(pending) || isTerminal;

  const buttonBase =
    "text-[11.5px] px-2.5 py-1.5 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed";
  const defaultBtn = `${buttonBase} border-line-strong bg-surface text-ink-2`;
  const dangerBtn = `${buttonBase} border-err bg-err-soft text-err`;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink)" }}>
            <span className="mono" style={{ color: "var(--info)" }}>{workflow.id}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--mute)" }}>
            {String(workflow.type ?? "")} · {String(workflow.shipment ?? "")} · started {formatDateTime(workflow.started)}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {workflow.error && (
        <div style={{ padding: "9px 11px", borderRadius: 8, background: "var(--err-soft)", color: "var(--err)", fontSize: 11.5, marginBottom: 12 }}>
          <strong style={{ fontFamily: "var(--mono)" }}>{String(workflow.error)}</strong>
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            Activity retried {toNumber(workflow.retries) || 3}× with exponential backoff. Next retry in 16s.
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {DISPATCH_STEPS.map((step, i) => {
          const isCurrent = step === workflow.step;
          const isDone = isCompleted || idx > i;
          const isFailing = isCurrent && isFailingStatus;
          return (
            <div
              key={step}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr 60px",
                gap: 10,
                padding: "8px 0",
                alignItems: "center",
                borderBottom: i < DISPATCH_STEPS.length - 1 ? "0.5px dashed var(--line)" : "none",
              }}
            >
              <div style={{ display: "grid", placeItems: "center" }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: isFailing ? "var(--err)" : isDone ? "var(--ok)" : isCurrent ? "var(--info)" : "var(--bg-warm)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 600,
                    display: "grid",
                    placeItems: "center",
                    border: !isDone && !isCurrent ? "1px solid var(--line-strong)" : "none",
                  }}
                  className={isCurrent ? "pulse" : ""}
                >
                  {isDone ? "✓" : isFailing ? "!" : i + 1}
                </span>
              </div>
              <div>
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: isCurrent ? "var(--ink)" : isDone ? "var(--ink-2)" : "var(--mute)",
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {step}
                </div>
                {isFailing && <div style={{ fontSize: 10.5, color: "var(--err)" }}>compensating · releasing inventory</div>}
                {isCurrent && !isFailing && <div style={{ fontSize: 10.5, color: "var(--mute)" }}>activity in flight</div>}
              </div>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--mute)", textAlign: "right" }}>
                {isDone ? "ok" : isFailing ? `retry ${Math.min(toNumber(workflow.retries) || 3, 5)}/5` : isCurrent ? "…" : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className={defaultBtn}
          onClick={() => runAction("replay")}
          disabled={replayDisabled}
          title={isTerminated ? "Terminated workflows cannot be replayed" : "Restart from current step"}
        >
          {pending === "replay" ? INSPECTOR_LABELS.replay.pending : INSPECTOR_LABELS.replay.idle}
        </button>
        <button
          type="button"
          className={defaultBtn}
          onClick={() => runAction("skip")}
          disabled={skipDisabled}
          title={
            isTerminal
              ? `Workflow is ${status}; cannot skip`
              : isLastActiveStep
                ? "Skips final step and marks workflow completed"
                : "Advance to the next step"
          }
        >
          {pending === "skip" ? INSPECTOR_LABELS.skip.pending : INSPECTOR_LABELS.skip.idle}
        </button>
        <button
          type="button"
          className={dangerBtn}
          onClick={() => runAction("terminate")}
          disabled={terminateDisabled}
          title={isTerminal ? `Workflow is already ${status}` : "Terminate this workflow"}
        >
          {pending === "terminate" ? INSPECTOR_LABELS.terminate.pending : INSPECTOR_LABELS.terminate.idle}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--mute)" }}>
          Idempotency key: <span className="mono">{idempotencyKey}</span>
        </span>
      </div>
      {notice && (
        <div
          className={`mt-3 px-3 py-2 rounded-md text-xs ${
            notice.tone === "ok" ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
          }`}
        >
          {notice.text}
        </div>
      )}
    </>
  );
}
