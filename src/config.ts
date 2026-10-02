// 工作台静态配置：设备、测点、班次、站点、越限阈值与有效期

import type { Device, MetricDef, MetricKey, Station } from "./types";

export const STATIONS: Station[] = ["机舱", "驾驶台"];

export const DEVICES: Device[] = [
  { id: "main", name: "主机" },
  { id: "gen1", name: "发电机#1" },
  { id: "gen2", name: "发电机#2" },
];

export const METRICS: MetricDef[] = [
  { key: "rpm", label: "转速", unit: "rpm", low: 40, high: 120 },
  { key: "oil", label: "滑油压力", unit: "MPa", low: 0.2, high: 0.6 },
  { key: "water", label: "冷却水温", unit: "℃", low: 60, high: 90 },
];

export const METRIC_MAP: Record<MetricKey, MetricDef> = METRICS.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<MetricKey, MetricDef>
);

/** 班次（4 小时一班），按采样时刻的小时推导 */
export const SHIFT_STARTS = [0, 4, 8, 12, 16, 20];

export function shiftLabelOfHour(hour: number): string {
  const start = Math.floor(hour / 4) * 4;
  const end = start + 4;
  return `${pad(start)}-${pad(end)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 由采样时刻推导班次 id 与展示文案 */
export function shiftFromTs(ts: number): {
  shiftId: string;
  label: string;
  dateStr: string;
} {
  const d = new Date(ts);
  const hour = d.getHours();
  const label = shiftLabelOfHour(hour);
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { shiftId: `${dateStr}|${label}`, label, dateStr };
}

/** 当前时刻所在班次 */
export function currentShift(now: number = Date.now()) {
  return shiftFromTs(now);
}

/** 某班次的起止 epoch（用于判断补录是否落在本班） */
export function shiftRange(shiftId: string): { start: number; end: number } {
  const [dateStr, label] = shiftId.split("|");
  const [y, mo, da] = dateStr.split("-").map(Number);
  const [startH] = label.split("-").map(Number);
  const start = new Date(y, mo - 1, da, startH, 0, 0, 0).getTime();
  const end = start + 4 * 3600 * 1000;
  return { start, end };
}

export function deviceName(id: string): string {
  return DEVICES.find((d) => d.id === id)?.name ?? id;
}

export function metricLabel(key: MetricKey): string {
  return METRIC_MAP[key]?.label ?? key;
}

/** 读数有效期（分钟）：超过此时长的读数视为过期，退出看板与趋势 */
export const DEFAULT_VALIDITY_MIN = 30;

/** 看板多久重算一次状态（毫秒） */
export const RECOMPUTE_INTERVAL_MS = 30_000;
