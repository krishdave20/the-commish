import { extent, line, scaleLinear } from 'd3';

export interface SparkPoint {
  x: number;
  y: number;
  /** colours the dot green (won) or red (lost); omit for neutral */
  win?: boolean;
}

interface Props {
  points: SparkPoint[];
  width?: number;
  height?: number;
  /** accessible description; defaults to the list of values */
  label?: string;
}

/** A small weekly-points line with a dot and value per week, for team drawers. */
export function Sparkline({ points, width = 220, height = 54, label }: Props) {
  const name = label ?? (points.length ? `Weekly points: ${points.map((p) => Math.round(p.y)).join(', ')}` : 'No weekly points yet');
  if (points.length === 0) {
    return <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} role="img" aria-label={name} />;
  }
  const [x0, x1] = extent(points, (p) => p.x) as [number, number];
  const [y0, y1] = extent(points, (p) => p.y) as [number, number];
  const x = scaleLinear().domain([x0, x1 === x0 ? x0 + 1 : x1]).range([8, width - 8]);
  const y = scaleLinear().domain([y0 - 8, y1 + 8]).range([height - 14, 6]);
  const d = line<SparkPoint>().x((p) => x(p.x)).y((p) => y(p.y))(points) ?? '';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} role="img" aria-label={name}>
      <path d={d} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.x}>
          <circle
            className="spark-dot" cx={x(p.x)} cy={y(p.y)} r={3.2}
            fill={p.win === undefined ? 'var(--ink-2)' : p.win ? 'var(--green)' : 'var(--red)'}
          />
          <text className="ax" x={x(p.x)} y={height - 2} textAnchor="middle" fontSize={9}>{Math.round(p.y)}</text>
        </g>
      ))}
    </svg>
  );
}
