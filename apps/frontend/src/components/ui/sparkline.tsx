export function Sparkline({
  data,
  height = 32,
  width = 100,
  color = "var(--ink-2)",
}: {
  data: number[];
  height?: number;
  width?: number;
  color?: string;
}): JSX.Element {
  if (!data || data.length === 0) {
    return <div style={{ height, width }} />;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
