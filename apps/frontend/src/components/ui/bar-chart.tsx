import { toNumber } from "@/lib/format";

export function BarChartSeries({
  data,
  series,
  height = 160,
  formatLabel,
  colors,
}: {
  data: Array<Record<string, unknown>>;
  series: string[];
  height?: number;
  formatLabel?: (label: string) => string;
  colors?: Record<string, string>;
}): JSX.Element {
  if (!data || data.length === 0) {
    return (
      <div
        className="grid place-items-center text-mute text-[11.5px]"
        style={{ height }}
      >
        No data.
      </div>
    );
  }

  const labelKey =
    Object.keys(data[0] ?? {}).find((k) => !series.includes(k)) ?? "h";
  const defaultColors: Record<string, string> = {
    dispatched: "var(--ink-2)",
    delivered: "var(--ok)",
    failed: "var(--err)",
    inbound: "var(--info)",
    outbound: "var(--accent)",
  };
  const colorMap = { ...defaultColors, ...(colors ?? {}) };
  const max = Math.max(
    ...data.flatMap((d) => series.map((s) => toNumber(d[s]))),
    1,
  );

  // Adapt spacing + label density to the number of buckets. With wide ranges
  // (e.g. 90 daily buckets) tight gaps keep bars readable, and we only render a
  // subset of x-axis labels so they don't collide/overlap.
  const count = data.length;
  const colGap = count > 45 ? 1 : count > 24 ? 2 : 4;
  const seriesGap = count > 24 ? 0 : 2;
  // Pick a small, evenly-spaced set of labels (at most ~8) so they never collide,
  // independent of bucket count. Rendered as a justify-between strip below.
  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(count / maxLabels));
  const labelIndices = data
    .map((_, i) => i)
    .filter((i) => i % labelStep === 0 || i === count - 1);
  const fmt = (i: number) =>
    formatLabel ? formatLabel(String(data[i]?.[labelKey])) : String(data[i]?.[labelKey] ?? "");

  return (
    <div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          columnGap: colGap,
          height,
        }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            className="flex items-end min-w-0"
            style={{ columnGap: seriesGap }}
          >
            {series.map((s) => (
              <div
                key={s}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${(toNumber(d[s]) / max) * 100}%`,
                  background: colorMap[s] ?? "var(--ink-2)",
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9.5px] text-mute font-mono">
        {labelIndices.map((i) => (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {fmt(i)}
          </span>
        ))}
      </div>
    </div>
  );
}
