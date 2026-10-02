// 轮机值班工作台 —— 状态管理（useReducer + localStorage 持久化）
// 核心规则：
// 1. 读数带采样时刻；看板只信每台设备最近一条没过期的读数，过期退出趋势并重算状态
// 2. 异常项随越限读数生成、随恢复读数解除
// 3. 交接班把本班读数和未结异常封成摘要；封后补录只记差异，不改摘要
// 4. 机舱/驾驶台断网各记一份，回网按设备+时刻合并；同一时刻不同值都保留并标待核

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import {
  DEFAULT_VALIDITY_MIN,
  METRICS,
  currentShift,
  shiftFromTs,
} from "./config";
import type {
  Abnormal,
  DeviceStatus,
  MetricKey,
  MetricState,
  Reading,
  ShiftSummary,
  Station,
  Supplement,
} from "./types";

const STORAGE_KEY = "lunjizhiban-workbench-v1";

export interface Limits {
  low: number;
  high: number;
}

export interface State {
  readings: Reading[]; // 中央（已合并）读数
  summaries: Record<string, ShiftSummary>; // 按班次 id 封存的摘要
  outbox: Record<Station, Reading[]>; // 各站断网未同步的读数
  station: Station; // 本站
  online: boolean; // 是否联网
  validityMin: number; // 读数有效期（分钟）
  limits: Record<MetricKey, Limits>;
  activeShiftId: string; // 当前查看的班次
}

// ---------- 纯函数 ----------

let seq = 0;
export function uid(prefix = "r"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;
}

export function parseShiftId(shiftId: string): {
  dateStr: string;
  label: string;
} {
  const [dateStr, label] = shiftId.split("|");
  return { dateStr, label };
}

/** 本站可见读数 = 中央已合并 + 本站断网未同步（他站断网的看不到） */
export function visibleReadings(state: State): Reading[] {
  return [...state.readings, ...state.outbox[state.station]];
}

/** 全部读数（用于历史与 id 解析）= 中央 + 各站 outbox */
export function allReadings(state: State): Reading[] {
  return [
    ...state.readings,
    ...state.outbox["机舱"],
    ...state.outbox["驾驶台"],
  ];
}

function isOut(value: number, lim: Limits): "high" | "low" | null {
  if (value > lim.high) return "high";
  if (value < lim.low) return "low";
  return null;
}

/**
 * 由读数序列推导异常项生命周期：
 * 越限读数生成（或沿用未结）异常项，恢复读数解除。冲突读数不参与。
 */
export function deriveAbnormals(
  readings: Reading[],
  limits: Record<MetricKey, Limits>
): Abnormal[] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    if (r.conflict) continue; // 待核数据不驱动异常
    const key = `${r.deviceId}|${r.metric}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const out: Abnormal[] = [];
  for (const [key, list] of groups) {
    const [deviceId, metric] = key.split("|") as [string, MetricKey];
    list.sort(
      (a, b) => a.sampledAt - b.sampledAt || a.createdAt - b.createdAt
    );
    let open: Abnormal | null = null;
    for (const r of list) {
      const lim = limits[metric];
      const dir = isOut(r.value, lim);
      if (dir) {
        if (!open) {
          open = {
            key: `${deviceId}|${metric}|${r.sampledAt}`,
            deviceId,
            metric,
            value: r.value,
            limit: dir,
            openedAt: r.sampledAt,
            status: "open",
          };
          out.push(open);
        }
      } else if (open) {
        open.status = "cleared";
        open.clearedAt = r.sampledAt;
        open.clearedValue = r.value;
        open = null;
      }
    }
  }
  return out.sort((a, b) => b.openedAt - a.openedAt);
}

/** 某设备某测点最近一条没过期的有效读数（过期则状态 stale） */
export function metricState(
  readings: Reading[],
  deviceId: string,
  metric: MetricKey,
  now: number,
  validityMin: number,
  limits: Record<MetricKey, Limits>
): MetricState {
  const valid = readings
    .filter(
      (r) =>
        r.deviceId === deviceId &&
        r.metric === metric &&
        !r.conflict &&
        now - r.sampledAt < validityMin * 60_000
    )
    .sort(
      (a, b) => b.sampledAt - a.sampledAt || b.createdAt - a.createdAt
    );
  const reading = valid[0];
  if (!reading) return { metric, status: "stale" };
  const dir = isOut(reading.value, limits[metric]);
  return {
    metric,
    reading,
    status: dir ? "alarm" : "normal",
    ageMin: (now - reading.sampledAt) / 60_000,
  };
}

export interface DeviceState {
  deviceId: string;
  overall: DeviceStatus;
  metrics: Record<MetricKey, MetricState>;
}

export function deviceStates(
  readings: Reading[],
  deviceIds: string[],
  now: number,
  validityMin: number,
  limits: Record<MetricKey, Limits>
): DeviceState[] {
  return deviceIds.map((deviceId) => {
    const metrics = {} as Record<MetricKey, MetricState>;
    let overall: DeviceStatus = "normal";
    for (const m of METRICS) {
      const ms = metricState(readings, deviceId, m.key, now, validityMin, limits);
      metrics[m.key] = ms;
      if (ms.status === "alarm") overall = "alarm";
      else if (ms.status === "stale" && overall !== "alarm") overall = "stale";
    }
    return { deviceId, overall, metrics };
  });
}

/** 趋势：只取有效期内的读数（过期退出趋势），按时刻升序 */
export function trendReadings(
  readings: Reading[],
  deviceId: string,
  metric: MetricKey,
  now: number,
  validityMin: number
): Reading[] {
  return readings
    .filter(
      (r) =>
        r.deviceId === deviceId &&
        r.metric === metric &&
        !r.conflict &&
        now - r.sampledAt < validityMin * 60_000
    )
    .sort((a, b) => a.sampledAt - b.sampledAt);
}

export interface ConflictGroup {
  key: string; // deviceId|sampledAt
  deviceId: string;
  sampledAt: number;
  readings: Reading[]; // 同一设备同一时刻的不同值
}

/** 待核分组：同一设备同一时刻存在多条不同值（合并时都保留） */
export function conflictGroups(readings: Reading[]): ConflictGroup[] {
  const map = new Map<string, Reading[]>();
  for (const r of readings) {
    if (!r.conflict) continue;
    const key = `${r.deviceId}|${r.sampledAt}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map.values()]
    .map((list) => {
      list.sort((a, b) => a.metric.localeCompare(b.metric));
      const [deviceId, ts] = list[0]
        ? [list[0].deviceId, list[0].sampledAt]
        : ["", 0];
      return { key: `${deviceId}|${ts}`, deviceId, sampledAt: ts, readings: list };
    })
    .sort((a, b) => b.sampledAt - a.sampledAt);
}

/**
 * 回网合并：把某站 outbox 并入中央。
 * 按 设备+测点+采样时刻 对齐：
 *  - 无记录：新增
 *  - 值相同：去重保留
 *  - 值不同：两条都保留并标 conflict（待核）
 */
export function mergeOutbox(
  central: Reading[],
  outbox: Reading[]
): { readings: Reading[]; mergedCount: number } {
  const readings = central.slice();
  let mergedCount = 0;
  for (const r of outbox) {
    const idx = readings.findIndex(
      (c) =>
        c.deviceId === r.deviceId &&
        c.metric === r.metric &&
        c.sampledAt === r.sampledAt
    );
    if (idx === -1) {
      readings.push({ ...r, synced: true });
      mergedCount += 1;
    } else if (readings[idx].value === r.value) {
      readings[idx] = { ...readings[idx], synced: true };
      mergedCount += 1;
    } else {
      readings[idx] = { ...readings[idx], conflict: true, synced: true };
      readings.push({ ...r, conflict: true, synced: true });
      mergedCount += 1;
    }
  }
  return { readings, mergedCount };
}

function buildSummary(state: State, shiftId: string): ShiftSummary {
  const visible = visibleReadings(state).filter(
    (r) => r.shiftId === shiftId && !r.conflict
  );
  const abnormals = deriveAbnormals(
    visibleReadings(state).filter((r) => !r.conflict),
    state.limits
  );
  const open = abnormals.filter((a) => a.status === "open");
  const { dateStr, label } = parseShiftId(shiftId);
  return {
    shiftId,
    shiftLabel: label,
    dateStr,
    sealedAt: Date.now(),
    readingIds: visible.map((r) => r.id),
    readingCount: visible.length,
    openAbnormals: open.map((a) => ({
      deviceId: a.deviceId,
      metric: a.metric,
      value: a.value,
      limit: a.limit,
      openedAt: a.openedAt,
    })),
    supplements: [],
  };
}

// ---------- 初始数据 ----------

function defaultLimits(): Record<MetricKey, Limits> {
  return {
    rpm: { low: 40, high: 120 },
    oil: { low: 0.2, high: 0.6 },
    water: { low: 60, high: 90 },
  };
}

function seedReadings(): Reading[] {
  // 首跑灌入当前班次的演示读数，让看板立刻有值；可在设置里清空
  const now = Date.now();
  const mk = (
    deviceId: string,
    metric: MetricKey,
    value: number,
    ageMin: number
  ): Reading => {
    const sampledAt = now - ageMin * 60_000;
    const { shiftId } = shiftFromTs(sampledAt);
    return {
      id: uid("seed"),
      deviceId,
      metric,
      value,
      sampledAt,
      shiftId,
      station: "机舱",
      synced: true,
      conflict: false,
      isSupplement: false,
      createdAt: sampledAt,
    };
  };
  return [
    mk("main", "rpm", 86, 3),
    mk("main", "oil", 0.42, 3),
    mk("main", "water", 78, 3),
    mk("gen1", "rpm", 95, 6),
    mk("gen1", "oil", 0.45, 6),
    mk("gen1", "water", 92, 6), // 水温偏高 → 异常
    mk("gen2", "rpm", 72, 9),
    mk("gen2", "oil", 0.38, 9),
    mk("gen2", "water", 75, 9),
  ];
}

function initialState(): State {
  const { shiftId } = currentShift();
  return {
    readings: seedReadings(),
    summaries: {},
    outbox: { 机舱: [], 驾驶台: [] },
    station: "机舱",
    online: true,
    validityMin: DEFAULT_VALIDITY_MIN,
    limits: defaultLimits(),
    activeShiftId: shiftId,
  };
}

// ---------- reducer ----------

type Action =
  | {
      type: "ADD_READINGS";
      payload: {
        deviceId: string;
        sampledAt: number;
        values: Partial<Record<MetricKey, number>>;
        note?: string;
      };
    }
  | { type: "SET_STATION"; station: Station }
  | { type: "SET_ONLINE"; online: boolean }
  | { type: "MERGE_NOW" }
  | { type: "RESOLVE_CONFLICT"; deviceId: string; sampledAt: number }
  | { type: "SEAL_SHIFT"; shiftId: string }
  | { type: "SET_ACTIVE_SHIFT"; shiftId: string }
  | { type: "SET_VALIDITY"; validityMin: number }
  | { type: "RESET_ALL" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_READINGS": {
      const { deviceId, sampledAt, values, note } = action.payload;
      const { shiftId } = shiftFromTs(sampledAt);
      const sealed = !!state.summaries[shiftId];
      const createdAt = Date.now();
      const entries = (Object.keys(values) as MetricKey[]).filter(
        (k) => values[k] !== undefined && !Number.isNaN(values[k])
      );
      const newReadings: Reading[] = entries.map((metric) => ({
        id: uid(),
        deviceId,
        metric,
        value: values[metric] as number,
        sampledAt,
        shiftId,
        station: state.station,
        synced: state.online,
        conflict: false,
        isSupplement: sealed,
        note,
        createdAt,
      }));

      let next: State = { ...state };
      if (state.online) {
        next.readings = [...state.readings, ...newReadings];
      } else {
        next.outbox = {
          ...state.outbox,
          [state.station]: [...state.outbox[state.station], ...newReadings],
        };
      }

      // 封班后补录：只往摘要里追加差异，不动 readingIds / openAbnormals
      if (sealed) {
        // 注意：用补录前的可见读数判断“新增/更正”，避免把自己误判为已存在
        const visible = visibleReadings(state);
        const summary = next.summaries[shiftId];
        const supplements: Supplement[] = [...summary.supplements];
        for (const nr of newReadings) {
          const existing = visible.find(
            (r) =>
              r.deviceId === nr.deviceId &&
              r.metric === nr.metric &&
              r.sampledAt === nr.sampledAt
          );
          supplements.push({
            id: uid("sup"),
            at: createdAt,
            deviceId: nr.deviceId,
            metric: nr.metric,
            sampledAt: nr.sampledAt,
            type: existing ? "correct" : "add",
            oldValue: existing?.value,
            newValue: nr.value,
            note,
          });
        }
        next.summaries = {
          ...next.summaries,
          [shiftId]: { ...summary, supplements },
        };
      }
      return next;
    }

    case "SET_STATION":
      return { ...state, station: action.station };

    case "SET_ONLINE": {
      if (action.online === state.online) return state;
      if (action.online) {
        // 回网：合并各站 outbox，按设备+时刻对齐，异值留并标待核
        let readings = state.readings;
        for (const st of ["机舱", "驾驶台"] as Station[]) {
          const res = mergeOutbox(readings, state.outbox[st]);
          readings = res.readings;
        }
        return {
          ...state,
          online: true,
          readings,
          outbox: { 机舱: [], 驾驶台: [] },
        };
      }
      return { ...state, online: false };
    }

    case "MERGE_NOW": {
      if (!state.online) return state;
      let readings = state.readings;
      for (const st of ["机舱", "驾驶台"] as Station[]) {
        const res = mergeOutbox(readings, state.outbox[st]);
        readings = res.readings;
      }
      return {
        ...state,
        readings,
        outbox: { 机舱: [], 驾驶台: [] },
      };
    }

    case "RESOLVE_CONFLICT": {
      const { deviceId, sampledAt } = action;
      const clear = (r: Reading) =>
        r.deviceId === deviceId && r.sampledAt === sampledAt
          ? { ...r, conflict: false }
          : r;
      return {
        ...state,
        readings: state.readings.map(clear),
        outbox: {
          机舱: state.outbox["机舱"].map(clear),
          驾驶台: state.outbox["驾驶台"].map(clear),
        },
      };
    }

    case "SEAL_SHIFT": {
      const { shiftId } = action;
      if (state.summaries[shiftId]) return state; // 已封，不可重复封
      const summary = buildSummary(state, shiftId);
      return {
        ...state,
        summaries: { ...state.summaries, [shiftId]: summary },
      };
    }

    case "SET_ACTIVE_SHIFT":
      return { ...state, activeShiftId: action.shiftId };

    case "SET_VALIDITY":
      return { ...state, validityMin: Math.max(1, action.validityMin) };

    case "RESET_ALL": {
      const fresh = initialState();
      return { ...fresh, readings: [] };
    }

    default:
      return state;
  }
}

// ---------- 持久化 hook ----------

function loadState(): State {
  const fallback = initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      ...fallback,
      ...parsed,
      limits: { ...defaultLimits(), ...(parsed.limits ?? {}) },
      outbox: {
        机舱: parsed.outbox?.["机舱"] ?? [],
        驾驶台: parsed.outbox?.["驾驶台"] ?? [],
      },
      summaries: parsed.summaries ?? {},
    } as State;
  } catch {
    return fallback;
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储失败（隐私模式等）忽略
    }
  }, [state]);

  // 每 30s 重算一次“最近没过期读数”，让过期读数自动退出看板/趋势
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tick = useCallback(() => setNow(Date.now()), []);

  const value = useMemo(() => ({ state, dispatch, now, tick }), [state, now, tick]);
  return value;
}

export type Store = ReturnType<typeof useStore>;
