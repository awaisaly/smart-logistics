import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MiniStat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "warn" | "err";
}): JSX.Element {
  const colorClass =
    tone === "warn" ? "text-warn" : tone === "err" ? "text-err" : "text-ink";

  return (
    <div className="p-2.5 bg-bg-warm rounded-md">
      <div className="text-[10.5px] text-mute uppercase tracking-wide">
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={cn("text-xl font-medium tracking-tight", colorClass)}>
          {value}
        </span>
        {unit && <span className="text-[10.5px] text-mute">{unit}</span>}
      </div>
    </div>
  );
}

export function LegendDot({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value?: ReactNode;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px]">
      <span
        className="w-[7px] h-[7px] rounded-full"
        style={{ background: color }}
      />
      <span className="text-ink-2">{label}</span>
      {value !== undefined && (
        <span className="font-mono text-mute ml-1">{value}</span>
      )}
    </span>
  );
}

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-dashed border-line/80 text-xs">
      <span className="text-mute">{label}</span>
      <span className="text-ink-2 text-right">{children}</span>
    </div>
  );
}
