// 趋势迷你图：只画有效期内的读数（过期已退出），并标出越限带

import { METRIC_MAP } from "../config";
import type { MetricKey, Reading } from "../types";

interface Props {
  readings: Reading[]; // 已按时刻升序、且在有效期内
  metric: MetricKey;
  width?: number;
  height?: number;
}

export default function Sparkline({
  readings,
  metric,
  width = 260,
  height = 72,
}: Props) {
  const def = METRIC_MAP[metric];
  const padX = 6;
  const padY = 10;
  if (readings.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="spark"
      >
        <line
          x1={padX}
          y1={height / 2}
          x2={width - padX}
          y2={height / 2}
          stroke="#cbd5e1"
          strokeDasharray="4 4"
        />
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle" fontSize="10" fill="#94a3b8">
          有效期内无读数
        </text>
      </svg>
    );
  }

  const values = readings.map((r) => r.value);
  const lo = Math.min(def.low, ...values);
  const hi = Math.max(def.high, ...values);
  const span = hi - lo || 1;
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const xFor = (i: number) =>
    readings.length === 1
      ? width / 2
      : padX + (i / (readings.length - 1)) * (width - padX * 2);
  const yFor = (v: number) =>
    padY + (1 - (v - yMin) / (yMax - yMin || 1)) * (height - padY * 2);

  const path = readings
    .map((r, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(r.value).toFixed(1)}`)
    .join(" ");

  const yLow = yFor(def.low);
  const yHigh = yFor(def.high);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className="spark"
      preserveAspectRatio="none"
    >
      {/* 正常范围带 */}
      <rect
        x={padX}
        y={yHigh}
        width={width - padX * 2}
        height={Math.max(0, yLow - yHigh)}
        fill="#0f766e"
        opacity={0.07}
      />
      <line x1={padX} y1={yHigh} x2={width - padX} y2={yHigh} stroke="#f97316" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={padX} y1={yLow} x2={width - padX} y2={yLow} stroke="#f97316" strokeWidth={1} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth={1.8} />
      {readings.map((r, i) => {
        const out = r.value > def.high || r.value < def.low;
        return (
          <circle
            key={r.id}
            cx={xFor(i)}
            cy={yFor(r.value)}
            r={3}
            fill={out ? "#dc2626" : "#0f766e"}
            stroke="#fff"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
