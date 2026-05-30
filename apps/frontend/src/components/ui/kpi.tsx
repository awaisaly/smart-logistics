import { PrototypePill, type PillTone } from "@/components/ui/pill";

type StatusConfig = {
  tone: PillTone;
  label?: string;
};

export function StatusPill({ status }: { status: string }): JSX.Element {
  const s = String(status ?? "").toLowerCase();
  const map: Record<string, StatusConfig> = {
    delivered: { tone: "ok" },
    in_transit: { tone: "info", label: "in transit" },
    "in-transit": { tone: "info", label: "in transit" },
    out_for_delivery: { tone: "accent", label: "out for delivery" },
    "out-for-delivery": { tone: "accent", label: "out for delivery" },
    picked: { tone: "info" },
    created: { tone: "neutral" },
    dispatched: { tone: "info" },
    attempted: { tone: "warn" },
    exception: { tone: "err" },
    failed: { tone: "err" },
    returned: { tone: "warn" },
    available: { tone: "ok" },
    active: { tone: "info" },
    on_route: { tone: "info", label: "on route" },
    off: { tone: "neutral" },
    break: { tone: "neutral" },
    running: { tone: "info" },
    failing: { tone: "err" },
    compensating: { tone: "warn" },
    completed: { tone: "ok" },
    scheduled: { tone: "neutral" },
  };
  const cfg = map[s] ?? { tone: "neutral" };

  return (
    <PrototypePill tone={cfg.tone} size="sm">
      {cfg.label ?? s.replace(/_/g, " ")}
    </PrototypePill>
  );
}

export function PrototypeKpi({
  label,
  value,
  delta,
  tone = "ink",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "ink" | "ok" | "err" | "info" | "warn";
}): JSX.Element {
  const colorClass =
    tone === "ok"
      ? "text-ok"
      : tone === "err"
        ? "text-err"
        : tone === "info"
          ? "text-info"
          : tone === "warn"
            ? "text-warn"
            : "text-ink";

  return (
    <div className="bg-surface border border-line/80 rounded-lg px-4 py-3.5 flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-[11.5px] text-mute">{label}</span>
        {delta ? (
          <span className="text-[11px] text-mute font-mono">{delta}</span>
        ) : null}
      </div>
      <span
        className={`text-[28px] leading-none tracking-tight ${colorClass}`}
      >
        {value}
      </span>
    </div>
  );
}
