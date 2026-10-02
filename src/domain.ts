import type {
  Anomaly,
  AnomalySnapshot,
  DeviceKind,
  MetricDef,
  MetricId,
  Reading,
  Range,
  State,
  StationId,
} from "./types";

export const STATIONS: { id: StationId; name: string; short: string }[] = [
  { id: "engine", name: "机舱集控室", short: "机舱" },
  { id: "bridge", name: "驾驶台", short: "驾驶台" },
];

export const METRICS: MetricDef[] = [
  { id: "rpm", name: "转速", unit: "rpm", decimals: 0 },
  { id: "oil", name: "滑油压力", unit: "MPa", decimals: 2 },
  { id: "water", name: "冷却水温", unit: "℃", decimals: 1 },
];

export interface DeviceDef {
  id: string;
  name: string;
  kind: DeviceKind;
  ranges: Record<MetricId, Range>;
}

export const DEVICES: DeviceDef[] = [
  {
    id: "ME",
    name: "主机",
    kind: "engine",
    ranges: {
      rpm: { min: 70, max: 100 },
      oil: { min: 0.35, max: 0.55 },
      water: { min: 70, max: 85 },
    },
  },
  {
    id: "DG1",
    name: "1号发电机",
    kind: "generator",
    ranges: {
      rpm: { min: 1450, max: 1550 },
      oil: { min: 0.3, max: 0.5 },
      water: { min: 65, max: 80 },
    },
  },
  {
    id: "DG2",
    name: "2号发电机",
    kind: "generator",
    ranges: {
      rpm: { min: 1450, max: 1550 },
      oil: { min: 0.3, max: 0.5 },
      water: { min: 65, max: 80 },
    },
  },
];

export const deviceById = (id: string): DeviceDef =>
  DEVICES.find((d) => d.id === id) ?? DEVICES[0];

export const metricById = (id: MetricId): MetricDef =>
  METRICS.find((m) => m.id === id) ?? METRICS[0];

export const stationName = (id: StationId): string =>
  STATIONS.find((s) => s.id === id)?.name ?? id;

export const stationShort = (id: StationId): string =>
  STATIONS.find((s) => s.id === id)?.short ?? id;

// ---------- 时间与班次 ----------

const HOUR = 3600_000;
const SHIFT_LEN = 4 * HOUR;

/** 四小时一班：00-04 / 04-08 / ... / 20-24 */
export function shiftBounds(t: number): { id: string; start: number; end: number } {
  const day = new Date(t);
  const midnight = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  const idx = Math.floor((t - midnight) / SHIFT_LEN);
  const start = midnight + idx * SHIFT_LEN;
  const end = start + SHIFT_LEN;
  const h0 = (idx * 4) % 24;
  const label = `${String(h0).padStart(2, "0")}-${String(h0 + 4).padStart(2, "0")}班`;
  return { id: `${ymd(start)}-${label}`, start, end };
}

export function ymd(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function hm(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fullTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** <input type="datetime-local"> 使用 */
export function toLocalInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(s: string): number {
  return new Date(s).getTime();
}

export function ageMinutes(sampledAt: number, now: number): number {
  return Math.max(0, Math.round((now - sampledAt) / 60000));
}

// ---------- 越限判定 ----------

export type Violation = "high" | "low" | null;

export function violationOf(deviceId: string, metricId: MetricId, value: number): Violation {
  const r = deviceById(deviceId).ranges[metricId];
  if (value < r.min) return "low";
  if (value > r.max) return "high";
  return null;
}

export const isFresh = (r: Reading, now: number, ttlMs: number): boolean =>
  !r.voided && now - r.sampledAt <= ttlMs;

// ---------- 异常自动生成 / 解除 ----------
// 每台设备每个参数维护一条“越限事件链”：越限打开、回到区间内关闭；
// 过期读数退出趋势（视为不再可信），不自动关单；待核读数同样能触发，但标记待核。

export interface ReconcileResult {
  anomalies: Anomaly[];
}

function anomalyId(deviceId: string, metricId: MetricId, openedAt: number): string {
  return `${deviceId}|${metricId}|${openedAt}`;
}

export function reconcileAnomalies(readings: Reading[]): Anomaly[] {
  const active = readings.filter((r) => !r.voided);
  const byKey = new Map<string, Reading[]>();
  for (const r of active) {
    const k = `${r.deviceId}|${r.metricId}`;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }

  const out: Anomaly[] = [];
  for (const [, list] of byKey) {
    list.sort((a, b) => a.sampledAt - b.sampledAt || a.recordedAt - b.recordedAt);
    let open: Anomaly | null = null;
    for (const r of list) {
      const v = violationOf(r.deviceId, r.metricId, r.value);
      const range = deviceById(r.deviceId).ranges[r.metricId];
      if (v) {
        if (!open) {
          open = {
            id: anomalyId(r.deviceId, r.metricId, r.sampledAt),
            deviceId: r.deviceId,
            metricId: r.metricId,
            direction: v,
            limit: v === "high" ? range.max : range.min,
            openedAt: r.sampledAt,
            openedReadingId: r.id,
            peak: r.value,
            pending: r.pendingVerify,
          };
        } else {
          open.peak =
            open.direction === "high"
              ? Math.max(open.peak, r.value)
              : Math.min(open.peak, r.value);
          if (r.pendingVerify) open.pending = true;
          // 待核读数在越限方向上与已开单相反，不做翻转，仅留待核标记
        }
      } else if (open) {
        // 回到区间内 → 解除；待核的“正常值”也关单（后续核实若舍弃，单据会重新打开）
        open.closedAt = r.sampledAt;
        open.closedReadingId = r.id;
        if (r.pendingVerify) open.pending = true;
        out.push(open);
        open = null;
      }
    }
    if (open) out.push(open);
  }
  out.sort((a, b) => b.openedAt - a.openedAt);
  return out;
}

/** 封版时刻的未结异常快照；只看采样时刻 <= sealAt 的读数 */
export function snapshotOpenAnomalies(
  readings: Reading[],
  sealAt: number
): AnomalySnapshot[] {
  const relevant = readings.filter((r) => r.sampledAt <= sealAt);
  const anomalies = reconcileAnomalies(relevant).filter((a) => a.closedAt === undefined);
  return anomalies.map((a) => {
    // 取 <= sealAt 的最后一条读数作为封版时现值
    const chain = relevant
      .filter((r) => r.deviceId === a.deviceId && r.metricId === a.metricId)
      .sort((x, y) => x.sampledAt - y.sampledAt);
    return {
      anomalyId: a.id,
      deviceId: a.deviceId,
      metricId: a.metricId,
      direction: a.direction,
      limit: a.limit,
      openedAt: a.openedAt,
      peak: a.peak,
      pending: a.pending,
      valueAtSeal: chain.length ? chain[chain.length - 1].value : a.peak,
    };
  });
}

// ---------- 回网合并 ----------
// 按 设备+参数+采样时刻 归并：同值 → 合并来源端；不同值 → 都保留并组待核组。

export interface MergeResult {
  readings: Reading[];
  conflicts: State["conflicts"];
}

export function mergeReadings(
  existing: Reading[],
  conflicts: State["conflicts"],
  incoming: Reading
): MergeResult {
  const readings = existing.map((r) => ({ ...r, stations: [...r.stations] }));
  const groups = conflicts.map((c) => ({ ...c, readingIds: [...c.readingIds] }));

  const alive = readings.filter((r) => !r.voided);
  const sameKey = alive.filter(
    (r) =>
      r.deviceId === incoming.deviceId &&
      r.metricId === incoming.metricId &&
      r.sampledAt === incoming.sampledAt
  );

  if (sameKey.length === 0) {
    readings.push(incoming);
    return { readings, conflicts: groups };
  }

  const equal = sameKey.find((r) => r.value === incoming.value);
  if (equal) {
    // 同值：并入来源端；若该值在一个待核组内且组中其余值都已舍弃 → 自动结案
    if (!equal.stations.includes(incoming.sampledBy)) {
      equal.stations.push(incoming.sampledBy);
    }
    if (equal.conflictGroupId) {
      const g = groups.find((g) => g.id === equal.conflictGroupId);
      if (g) {
        const othersAlive = g.readingIds
          .filter((id) => id !== equal.id)
          .some((id) => readings.find((r) => r.id === id && !r.voided));
        if (!othersAlive && !incoming.pendingVerify) {
          g.resolved = true;
          g.resolvedReadingId = equal.id;
          equal.pendingVerify = false;
          delete equal.conflictGroupId;
        }
      }
    }
    return { readings, conflicts: groups };
  }

  // 不同值：同端重复抄录以最新一条为准
  const sameStation = sameKey.find((r) => r.sampledBy === incoming.sampledBy);
  if (sameStation) {
    sameStation.voided = true;
    sameStation.pendingVerify = false;
    if (sameStation.conflictGroupId) {
      const g = groups.find((g) => g.id === sameStation.conflictGroupId);
      if (g) g.readingIds = g.readingIds.filter((id) => id !== sameStation.id);
    }
  }

  // 建立或加入待核组
  let group = groups.find(
    (g) =>
      !g.resolved &&
      g.deviceId === incoming.deviceId &&
      g.metricId === incoming.metricId &&
      g.sampledAt === incoming.sampledAt
  );
  const flagged = sameKey.filter((r) => r !== sameStation);
  if (!group) {
    group = {
      id: `cg-${incoming.deviceId}-${incoming.metricId}-${incoming.sampledAt}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      deviceId: incoming.deviceId,
      metricId: incoming.metricId,
      sampledAt: incoming.sampledAt,
      readingIds: flagged.map((r) => r.id),
      resolved: false,
    };
    groups.push(group);
    for (const r of flagged) {
      r.pendingVerify = true;
      r.conflictGroupId = group.id;
    }
  }
  incoming.pendingVerify = true;
  incoming.conflictGroupId = group.id;
  group.readingIds.push(incoming.id);
  readings.push(incoming);
  return { readings, conflicts: groups };
}

export function fmtValue(metricId: MetricId, v: number): string {
  const m = metricById(metricId);
  return v.toFixed(m.decimals);
}

export function rangeText(deviceId: string, metricId: MetricId): string {
  const r = deviceById(deviceId).ranges[metricId];
  return `${fmtValue(metricId, r.min)} ~ ${fmtValue(metricId, r.max)}`;
}
