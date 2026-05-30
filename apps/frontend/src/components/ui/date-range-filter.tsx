import React from "react";
import { useDateRange, type DateRangePreset } from "@/lib/date-range";

const PRESETS: Array<{ value: Exclude<DateRangePreset, "custom">; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

function toInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DateRangeFilter(): JSX.Element {
  const { preset, from, to, setPreset, setCustom, label } = useDateRange();
  const [open, setOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState(() => toInputValue(from));
  const [draftTo, setDraftTo] = React.useState(() => toInputValue(to));
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDraftFrom(toInputValue(from));
    setDraftTo(toInputValue(to));
  }, [from, to]);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    const a = draftFrom <= draftTo ? draftFrom : draftTo;
    const b = draftFrom <= draftTo ? draftTo : draftFrom;
    setCustom(a, b);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-flex items-center gap-1.5">
      <div className="inline-flex border border-line/80 rounded-md bg-surface overflow-hidden">
        {PRESETS.map((o, i) => {
          const active = o.value === preset;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setPreset(o.value)}
              className={`px-2.5 py-1.5 text-[11.5px] ${active ? "bg-ink text-bg" : "bg-transparent text-ink-2"} ${i < PRESETS.length - 1 ? "border-r border-line/80" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Custom range"
          className={`px-2.5 py-1.5 text-[11.5px] border-l border-line/80 ${preset === "custom" ? "bg-ink text-bg" : "bg-transparent text-ink-2"}`}
        >
          {preset === "custom" ? label : "Custom"}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-md border border-line/80 bg-surface p-3 shadow-lg">
          <div className="text-[10.5px] uppercase tracking-wide text-mute mb-2">Custom range</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2 text-[11.5px] text-ink-2">
              <span>From</span>
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="bg-bg border border-line/80 rounded px-2 py-1 text-[11.5px] text-ink"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11.5px] text-ink-2">
              <span>To</span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                className="bg-bg border border-line/80 rounded px-2 py-1 text-[11.5px] text-ink"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2.5 py-1.5 text-[11.5px] text-ink-2 rounded border border-line/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo}
              className="px-2.5 py-1.5 text-[11.5px] rounded bg-ink text-bg disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
