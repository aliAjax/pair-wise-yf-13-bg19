import { deviceById, metricById } from "../domain";
import type { Reading } from "../types";

interface Props {
  deviceId: string;
  metricId: Reading["metricId"];
  data: Reading[];
  width?: number;
  height?: number;
}

/** 迷你趋势：含上下限参考线；待核点空心，正常值实心，越限红色 */
export function Sparkline({ deviceId, metricId, data, width = 260, height = 56 }: Props) {
  const range = deviceById(deviceId).ranges[metricId];
  const pad = 4;
  const values = data.map((d) => d.value);
  const lo = Math.min(range.min, ...values) - 0.5;
  const hi = Math.max(range.max, ...values) + 0.5;
  const span = hi - lo || 1;
  const x = (i: number) =>
    data.length <= 1 ? width / 2 : pad + (i * (width - pad * 2)) / (data.length - 1);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);

  const yMax = y(range.max);
  const yMin = y(range.min);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");

  return (
    <svg className="spark" width={width} height={height} role="img" aria-label="近期趋势">
      <line x1={0} y1={yMax} x2={width} y2={yMax} className="spark-limit" strokeDasharray="4 3" />
      <line x1={0} y1={yMin} x2={width} y2={yMin} className="spark-limit" strokeDasharray="4 3" />
      {data.length > 1 && <path d={path} className="spark-line" fill="none" />}
      {data.map((d, i) => {
        const bad = d.value > range.max || d.value < range.min;
        return (
          <circle
            key={d.id}
            cx={x(i)}
            cy={y(d.value)}
            r={d.pendingVerify ? 4 : 3}
            className={
              d.pendingVerify ? "spark-point pending" : bad ? "spark-point alarm" : "spark-point"
            }
          />
        );
      })}
      <text x={4} y={yMax - 2} className="spark-label">
        {range.max}
      </text>
      <text x={4} y={height - 2} className="spark-label">
        {range.min}
      </text>
      <text x={width - 4} y={10} textAnchor="end" className="spark-unit">
        {metricById(metricId).unit}
      </text>
    </svg>
  );
}
