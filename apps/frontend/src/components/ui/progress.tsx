import type { ReactNode } from "react";

export function LoadBar({
  load,
  capacity,
}: {
  load: number;
  capacity: number;
}): JSX.Element {
  const pct = (load / Math.max(capacity, 1)) * 100;
  const toneClass = pct >= 100 ? "bg-err" : pct > 80 ? "bg-warn" : "bg-ok";

  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-[60px] h-[5px] bg-bg-warm rounded-full overflow-hidden">
        <div
          className={toneClass}
          style={{ width: `${Math.min(100, pct)}%`, height: "100%" }}
        />
      </div>
      <span className="font-mono text-[11px] text-mute min-w-8 text-right">
        {load}/{capacity}
      </span>
    </div>
  );
}

export function ProgressRow({
  label,
  value,
  max,
  right,
  tone = "ink",
}: {
  label: string;
  value: number;
  max: number;
  right?: ReactNode;
  tone?: "ink" | "ok" | "warn" | "err";
}): JSX.Element {
  const colorClass =
    tone === "ok"
      ? "bg-ok"
      : tone === "warn"
        ? "bg-warn"
        : tone === "err"
          ? "bg-err"
          : "bg-ink";

  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-[11.5px]">
        <span className="text-ink-2">{label}</span>
        {right}
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-bg-warm">
        <div
          className={colorClass}
          style={{
            width: `${Math.min(100, (value / Math.max(max, 1)) * 100)}%`,
            height: "100%",
          }}
        />
      </div>
    </div>
  );
}
