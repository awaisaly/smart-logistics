import { toNumber } from "@/lib/format";

export function renderThroughputBars(points: Array<Record<string, unknown>>): JSX.Element {
  const normalized = points.slice(-12).map((p, i) => ({
    label: String(p.h ?? p.hour ?? i),
    dispatched: toNumber(p.dispatched),
    delivered: toNumber(p.delivered),
    failed: toNumber(p.failed),
  }));
  const max = Math.max(...normalized.flatMap((item) => [item.dispatched, item.delivered, item.failed]), 1);

  return (
    <div>
      <div
        className="grid gap-1 h-[180px]"
        style={{ gridTemplateColumns: `repeat(${Math.max(normalized.length, 1)}, minmax(0, 1fr))` }}
      >
        {normalized.map((item) => (
          <div key={item.label} className="flex gap-0.5 items-end min-w-0">
            <div className="flex-1 bg-ink-2 rounded-t-sm" style={{ height: `${(item.dispatched / max) * 100}%` }} />
            <div className="flex-1 bg-ok rounded-t-sm" style={{ height: `${(item.delivered / max) * 100}%` }} />
            <div className="flex-1 bg-err rounded-t-sm" style={{ height: `${(item.failed / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(normalized.length, 1)}, minmax(0, 1fr))` }}
      >
        {normalized.map((item) => (
          <span key={`${item.label}-label`} className="text-center text-[10px] text-mute font-mono">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
