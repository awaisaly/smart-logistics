import React from "react";
import { fetchJson, withRange } from "@/lib/api";
import { toNumber, formatCompact, formatDateTime, formatTime } from "@/lib/format";
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

export type EventsTab = "kafka" | "consumers" | "celery" | "dlq";

export function EventsPage(): JSX.Element {
  const [tab, setTab] = React.useState<EventsTab>("kafka");
  const [loading, setLoading] = React.useState(true);
  const [kpis, setKpis] = React.useState<Record<string, unknown>>({});
  const [topics, setTopics] = React.useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = React.useState<Array<Record<string, unknown>>>([]);
  const [consumers, setConsumers] = React.useState<Array<Record<string, unknown>>>([]);
  const [queues, setQueues] = React.useState<Array<Record<string, unknown>>>([]);
  const [dlq, setDlq] = React.useState<Array<Record<string, unknown>>>([]);
  const [replays, setReplays] = React.useState<Array<Record<string, unknown>>>([]);
  const { from, to } = useDateRange();

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const range = { from, to };
    void Promise.all([
      fetchJson<Record<string, unknown>>("/tracking/events/kpis"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/tracking/topics"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/tracking/events/recent", range)),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/tracking/consumers"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>("/tracking/queues/celery"),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/tracking/dlq/messages", range)),
      fetchJson<{ items?: Array<Record<string, unknown>> }>(withRange("/tracking/dlq/replays", range)),
    ])
      .then(([k, t, e, c, q, d, r]) => {
        if (!alive) return;
        setKpis(k ?? {});
        setTopics(t.items ?? []);
        setEvents(e.items ?? []);
        setConsumers(c.items ?? []);
        setQueues(q.items ?? []);
        setDlq(d.items ?? []);
        setReplays(r.items ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  return (
    <>
      <PageHeader
        title="Events & queues"
        sub="Kafka spine · Celery workers · DLQ"
        actions={
          <>
            <DateRangeFilter />
            <Segmented
              options={[
                { value: "kafka", label: "Kafka" },
                { value: "consumers", label: "Consumers" },
                { value: "celery", label: "Celery" },
                { value: "dlq", label: "Dead letters" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </>
        }
      />
      <PageBody>
        {loading ? (
          <SkeletonBlock h={320} />
        ) : tab === "kafka" ? (
          <>
            <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
              <PrototypeKpi label="Total throughput" value={`${kpis.totalThroughput ?? 0}/s`} delta="live" tone="info" />
              <PrototypeKpi label="Topics" value={String(kpis.topicCount ?? 0)} delta="all healthy" tone="ink" />
              <PrototypeKpi label="Total lag" value={String(kpis.totalLag ?? 0)} delta="live" tone="warn" />
              <PrototypeKpi label="Schema versions" value={String(kpis.schemaVersions ?? 0)} delta="0 drift" tone="ok" />
            </div>
            <PageCard title="Topics" sub="domain events across brokers" padding={0} bodyStyle={{ padding: 0 }}>
              <Table
                rows={topics}
                columns={[
                  { key: "name", label: "Topic", mono: true, render: (r) => <span style={{ color: "var(--info)", fontWeight: 500 }}>{String(r.name ?? "")}</span> },
                  { key: "partitions", label: "Partitions", align: "right", mono: true },
                  { key: "msg_s", label: "Msg/s", align: "right", mono: true },
                  { key: "lag", label: "Lag", align: "right", mono: true, render: (r) => <span style={{ color: toNumber(r.lag) > 100 ? "var(--err)" : toNumber(r.lag) > 10 ? "var(--warn)" : "var(--mute)" }}>{toNumber(r.lag)}</span> },
                  { key: "schema", label: "Schema", align: "right", render: (r) => <PrototypePill tone="neutral" size="sm">{String(r.schema ?? "")}</PrototypePill> },
                ]}
              />
            </PageCard>
            <PageCard title="Recent messages" sub="across all topics · last 60s" padding={0} bodyStyle={{ padding: 0 }}>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {events.map((e, i) => (
                  <div key={i} className="sl-kafka-row" style={{ padding: "7px 14px", borderBottom: "0.5px solid var(--line)", fontSize: 11.5 }}>
                    <span className="mono" style={{ color: "var(--mute)" }} title={formatDateTime(e.created_at ?? e.t)}>{formatTime(e.created_at ?? e.t)}</span>
                    <span className="mono" style={{ color: "var(--info)" }}>{String(e.topic ?? "")}</span>
                    <span className="mono" style={{ color: "var(--ink)" }}>{String(e.key ?? "")}</span>
                    <span className="mono" style={{ color: "var(--mute)", textAlign: "right" }}>{String(e.lag ?? "")}</span>
                    <span style={{ color: "var(--ink-2)" }}>{String(e.payload ?? "")}</span>
                  </div>
                ))}
              </div>
            </PageCard>
          </>
        ) : tab === "consumers" ? (
          <>
            <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
              <PrototypeKpi label="Consumer groups" value={String(kpis.consumerGroups ?? 0)} delta="all healthy" tone="ink" />
              <PrototypeKpi label="Total pods" value={String(kpis.totalPods ?? 0)} delta="auto-scaled" tone="info" />
              <PrototypeKpi label="Max lag" value={String(kpis.maxLag ?? 0)} delta="live" tone="warn" />
              <PrototypeKpi label="Rebalances (1h)" value={String(kpis.rebalances1h ?? 0)} delta="stable" tone="ok" />
            </div>
            <PageCard title="Consumer groups" sub="committed offsets · auto-scaling pods" padding={0} bodyStyle={{ padding: 0 }}>
              <Table
                rows={consumers}
                columns={[
                  { key: "group", label: "Group", mono: true, render: (r) => <span style={{ fontWeight: 500, color: "var(--ink)" }}>{String(r.group ?? "")}</span> },
                  { key: "pods", label: "Pods", align: "right", mono: true },
                  { key: "lag", label: "Lag", align: "right", mono: true, render: (r) => <span style={{ color: toNumber(r.lag) > 100 ? "var(--err)" : toNumber(r.lag) > 10 ? "var(--warn)" : "var(--mute)" }}>{toNumber(r.lag)}</span> },
                  { key: "status", label: "Status", render: (r) => <PrototypePill tone={r.status === "healthy" ? "ok" : r.status === "lagging" ? "warn" : "neutral"} size="sm">{String(r.status ?? "")}</PrototypePill> },
                ]}
              />
            </PageCard>
          </>
        ) : tab === "celery" ? (
          <>
            <div className="sl-grid" data-cols={4} style={{ gap: 10 }}>
              <PrototypeKpi label="Queues" value={String(kpis.queueCount ?? 0)} delta="all draining" tone="ink" />
              <PrototypeKpi label="Pending tasks" value={String(kpis.pendingTasks ?? 0)} delta="live" tone="warn" />
              <PrototypeKpi label="Active" value={String(kpis.activeTasks ?? 0)} delta="workers live" tone="info" />
              <PrototypeKpi label="Failed 24h" value={String(kpis.failed24h ?? 0)} delta="live" tone="ok" />
            </div>
            <PageCard title="Celery queues" sub="RabbitMQ worker pools" padding={0} bodyStyle={{ padding: 0 }}>
              <Table
                rows={queues}
                columns={[
                  { key: "name", label: "Queue", mono: true, render: (r) => <span style={{ color: "var(--info)", fontWeight: 500 }}>{String(r.name ?? "")}</span> },
                  { key: "pending", label: "Pending", align: "right", mono: true },
                  { key: "active", label: "Active", align: "right", mono: true },
                  { key: "failed24h", label: "Failed 24h", align: "right", mono: true, render: (r) => <span style={{ color: toNumber(r.failed24h) > 0 ? "var(--err)" : "var(--mute)" }}>{toNumber(r.failed24h)}</span> },
                ]}
              />
            </PageCard>
          </>
        ) : (
          <>
            <PageCard title="Dead-letter queue" sub="messages that failed all retries" padding={0} bodyStyle={{ padding: 0 }}>
              {dlq.map((d, i) => (
                <div key={i} style={{ padding: "12px 16px", borderBottom: i < dlq.length - 1 ? "0.5px solid var(--line)" : "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--mute)", minWidth: 50 }} title={formatDateTime(d.created_at ?? d.t ?? d.received)}>{formatTime(d.created_at ?? d.t ?? d.received)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--info)" }}>{String(d.topic ?? d.source ?? "")}</span>
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--ink)" }}>{String(d.key ?? "")}</span>
                      <PrototypePill tone="err" size="sm">{toNumber(d.attempts)} retries</PrototypePill>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--err)", fontFamily: "var(--mono)" }}>{String(d.payload ?? d.err ?? "")}</div>
                  </div>
                </div>
              ))}
            </PageCard>
            <PageCard title="Replay log (last 24h)" sub="manual + automated DLQ replays">
              <Table
                dense
                rows={replays}
                columns={[
                  { key: "created_at", label: "When", mono: true, render: (r) => <span style={{ color: "var(--mute)" }}>{formatDateTime(r.created_at ?? r.range)}</span> },
                  { key: "initiator", label: "By", render: (r) => <span className="mono" style={{ color: "var(--info)" }}>{String(r.initiator ?? "")}</span> },
                  { key: "items", label: "Replayed", align: "right", mono: true },
                  { key: "status", label: "Result", render: (r) => <PrototypePill tone={r.status === "completed" ? "ok" : r.status === "failed" ? "err" : "warn"} size="sm">{String(r.status ?? "")}</PrototypePill> },
                ]}
              />
            </PageCard>
          </>
        )}
      </PageBody>
    </>
  );
}
