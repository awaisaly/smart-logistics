type SlaPieDatum = {
  label: string;
  value: number;
  color: string;
};

export function SlaPie({ data }: { data: SlaPieDatum[] }): JSX.Element {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="text-mute text-[11.5px]">No SLA data available.</div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  const r = 60;
  const c = 2 * Math.PI * r;
  const headline = data[0];

  return (
    <div className="sl-sla-pie">
      <svg width={150} height={150} viewBox="0 0 160 160">
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="var(--bg-warm)"
          strokeWidth="18"
        />
        {data.map((d, i) => {
          const dash = (d.value / total) * c;
          const seg = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += dash;
          return seg;
        })}
        <text
          x="80"
          y="76"
          textAnchor="middle"
          fontSize="22"
          fontWeight="500"
          fill="var(--ink)"
          fontFamily="var(--sans)"
          style={{ letterSpacing: "-0.02em" }}
        >
          {Math.round((headline.value / total) * 100)}%
        </text>
        <text
          x="80"
          y="92"
          textAnchor="middle"
          fontSize="9"
          fill="var(--mute)"
          letterSpacing="0.1em"
        >
          {headline.label.toUpperCase()}
        </text>
      </svg>
      <div className="flex-1 flex flex-col gap-2 min-w-[140px]">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex justify-between items-center text-xs"
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ background: d.color }}
              />
              <span className="text-ink-2">{d.label}</span>
            </span>
            <span className="font-mono text-ink font-medium">
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RmaStage({ stage }: { stage: string }): JSX.Element {
  const stages = [
    "requested",
    "approved",
    "in_transit",
    "received",
    "refunded",
  ] as const;
  const lowered = stage.toLowerCase();
  const idx = lowered === "rejected" ? -1 : stages.indexOf(lowered as (typeof stages)[number]);

  return (
    <div className="inline-flex gap-0.5 items-center">
      {stages.map((s, i) => (
        <span
          key={s}
          className="w-[18px] h-[5px] rounded-full"
          style={{
            background:
              idx >= 0 && i <= idx
                ? i === stages.length - 1
                  ? "var(--ok)"
                  : "var(--accent)"
                : lowered === "rejected"
                  ? "var(--err)"
                  : "var(--bg-warm)",
          }}
        />
      ))}
      <span className="font-mono text-[10.5px] text-ink-2 ml-1.5">
        {lowered || "unknown"}
      </span>
    </div>
  );
}
