export type SegOption<T extends string> = T | { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="inline-flex border border-line/80 rounded-md bg-surface overflow-hidden">
      {options.map((o, i) => {
        const v = typeof o === "object" && o !== null ? o.value : o;
        const label =
          typeof o === "object" && o !== null ? o.label : String(o);
        const active = v === value;

        return (
          <button
            key={`${String(v)}-${i}`}
            type="button"
            onClick={() => onChange(v)}
            className={`px-3 py-1.5 text-[11.5px] ${active ? "bg-ink text-bg" : "bg-transparent text-ink-2"} ${i < options.length - 1 ? "border-r border-line/80" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
