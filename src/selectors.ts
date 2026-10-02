import {
  DEVICES,
  deviceById,
  fmtValue,
  isFresh,
  reconcileAnomalies,
  violationOf,
} from "./domain";
import type { Anomaly, MetricId, Reading } from "./types";
import type { State } from "./types";

export type MetricStatus = "normal" | "alarm" | "stale" | "pending";

export interface MetricView {
  metricId: MetricId;
  /** 该参数最近一次没过期、未舍弃的读数（同刻多值待核时不止一条） */
  latest: Reading[];
  ageMin: number | null;
  status: MetricStatus;
}

export interface DeviceView {
  deviceId: string;
  name: string;
  metrics: MetricView[];
  status: MetricStatus;
  alarms: number;
  pending: number;
  stale: number;
}

/** 看板只信“每台设备每个参数最近一次没过期、未舍弃的值” */
export function selectDeviceViews(
  readings: Reading[],
  ttlMinutes: number,
  now: number
): DeviceView[] {
  const ttlMs = ttlMinutes * 60000;
  return DEVICES.map((def) => {
    const metrics: MetricView[] = (["rpm", "oil", "water"] as MetricId[]).map((metricId) => {
      const alive = readings.filter(
        (r) => r.deviceId === def.id && r.metricId === metricId && !r.voided
      );
      let latest: Reading[] = [];
      if (alive.length) {
        const tMax = Math.max(...alive.map((r) => r.sampledAt));
        latest = alive.filter((r) => r.sampledAt === tMax);
      }
      const fresh = latest.length > 0 && isFresh(latest[0], now, ttlMs);
      const ageMin = latest.length ? (now - latest[0].sampledAt) / 60000 : null;

      const pending = latest.some((r) => r.pendingVerify);
      const alarm =
        fresh && latest.some((r) => violationOf(def.id, metricId, r.value) !== null);
      const status: MetricStatus = !fresh
        ? "stale"
        : pending
        ? "pending"
        : alarm
        ? "alarm"
        : "normal";
      return {
        metricId,
        latest: fresh ? latest : [], // 过期即退出看板
        ageMin: ageMin === null ? null : Math.max(0, ageMin),
        status,
      };
    });

    const alarms = metrics.filter((m) => m.status === "alarm").length;
    const pending = metrics.filter((m) => m.status === "pending").length;
    const stale = metrics.filter((m) => m.status === "stale").length;
    const status: MetricStatus = alarms
      ? "alarm"
      : pending
      ? "pending"
      : stale
      ? "stale"
      : "normal";
    return { deviceId: def.id, name: def.name, metrics, status, alarms, pending, stale };
  });
}

/** 过期读数退出趋势：只取未过期、未舍弃的点；待核点保留并标注 */
export function trendSeries(
  readings: Reading[],
  deviceId: string,
  metricId: MetricId,
  ttlMinutes: number,
  now: number
): Reading[] {
  const ttlMs = ttlMinutes * 60000;
  return readings
    .filter(
      (r) =>
        r.deviceId === deviceId &&
        r.metricId === metricId &&
        !r.voided &&
        isFresh(r, now, ttlMs)
    )
    .sort((a, b) => a.sampledAt - b.sampledAt);
}

export interface ShiftView {
  readings: Reading[];
  anomalies: Anomaly[];
  backfills: Reading[];
}

export function selectShift(readings: Reading[], start: number, end: number): ShiftView {
  const inShift = readings.filter((r) => r.sampledAt >= start && r.sampledAt < end);
  return {
    readings: inShift,
    anomalies: reconcileAnomalies(inShift),
    backfills: inShift.filter((r) => r.backfill),
  };
}

export function latestText(v: MetricView): string {
  if (!v.latest.length) return "—";
  return v.latest.map((r) => fmtValue(v.metricId, r.value)).join(" / ");
}

export function metricStatusText(s: MetricStatus): string {
  return s === "alarm"
    ? "越限"
    : s === "pending"
    ? "待核"
    : s === "stale"
    ? "过期"
    : "正常";
}

export function deviceStatusText(s: MetricStatus): string {
  return s === "alarm"
    ? "异常"
    : s === "pending"
    ? "待核"
    : s === "stale"
    ? "读数过期"
    : "运行正常";
}

export function unresolvedConflicts(state: State) {
  return state.conflicts.filter((c) => !c.resolved);
}

export { deviceById };
