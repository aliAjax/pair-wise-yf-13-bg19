import { useEffect, useReducer, useState } from "react";
import type { Reading, State, StationId } from "./types";
import { mergeReadings, shiftBounds, snapshotOpenAnomalies } from "./domain";

const STORAGE_KEY = "hxyfront-62001-watch-desk-v1";

export type Action =
  | {
      type: "add";
      station: StationId;
      online: boolean;
      now: number;
      readings: Reading[];
    }
  | { type: "sync" }
  | { type: "setOnline"; online: boolean }
  | { type: "setStation"; station: StationId }
  | { type: "setTtl"; minutes: number }
  | {
      type: "resolveConflict";
      groupId: string;
      keepId: string;
    }
  | { type: "seal"; engineer: string; relief: string; note: string; sealedAt: number }
  | { type: "reset" }
  | { type: "setClock"; offsetMs: number };

function markBackfills(readings: Reading[], now: number, summaries: State["summaries"]): Reading[] {
  // 采样时刻落在已封版班次内 → 封后补录
  const cur = shiftBounds(now).id;
  return readings.map((r) => {
    const sid = shiftBounds(r.sampledAt).id;
    if (sid !== cur && summaries.some((s) => s.shiftId === sid)) {
      return { ...r, backfill: true };
    }
    return r;
  });
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      let readings = state.readings;
      let conflicts = state.conflicts;
      const stamped = markBackfills(action.readings, action.now, state.summaries);
      if (action.online) {
        for (const r of stamped) {
          const m = mergeReadings(readings, conflicts, r);
          readings = m.readings;
          conflicts = m.conflicts;
        }
        return { ...state, readings, conflicts };
      }
      // 断网：当前站点各记一份
      const outboxes = {
        ...state.outboxes,
        [action.station]: [...state.outboxes[action.station], ...stamped],
      };
      return { ...state, outboxes };
    }
    case "sync": {
      if (!state.online) return state;
      let readings = state.readings;
      let conflicts = state.conflicts;
      const engine = [...state.outboxes.engine];
      const bridge = [...state.outboxes.bridge];
      // 两端独立记录，按录入顺序回放合并
      const total = Math.max(engine.length, bridge.length);
      for (let i = 0; i < total; i++) {
        for (const r of [engine[i], bridge[i]]) {
          if (!r) continue;
          const m = mergeReadings(readings, conflicts, r);
          readings = m.readings;
          conflicts = m.conflicts;
        }
      }
      return {
        ...state,
        readings,
        conflicts,
        outboxes: { engine: [], bridge: [] },
      };
    }
    case "setOnline":
      return { ...state, online: action.online };
    case "setStation":
      return { ...state, activeStation: action.station };
    case "setTtl":
      return { ...state, ttlMinutes: action.minutes };
    case "resolveConflict": {
      const group = state.conflicts.find((g) => g.id === action.groupId);
      if (!group) return state;
      const readings = state.readings.map((r) => {
        if (!group.readingIds.includes(r.id)) return r;
        const keep = r.id === action.keepId;
        return {
          ...r,
          voided: !keep,
          pendingVerify: false,
          conflictGroupId: keep ? undefined : r.conflictGroupId,
        };
      });
      const conflicts = state.conflicts.map((g) =>
        g.id === action.groupId
          ? { ...g, resolved: true, resolvedReadingId: action.keepId }
          : g
      );
      return { ...state, readings, conflicts };
    }
    case "seal": {
      const cur = shiftBounds(action.sealedAt);
      if (state.summaries.some((s) => s.shiftId === cur.id)) return state;
      const shiftReadings = state.readings
        .filter((r) => r.sampledAt >= cur.start && r.sampledAt < cur.end)
        .map((r) => ({ ...r }));
      const openAnomalies = snapshotOpenAnomalies(state.readings, action.sealedAt);
      const summary = {
        shiftId: cur.id,
        start: cur.start,
        end: cur.end,
        sealedAt: action.sealedAt,
        engineer: action.engineer,
        relief: action.relief,
        note: action.note,
        readings: shiftReadings,
        openAnomalies,
      };
      return { ...state, summaries: [...state.summaries, summary] };
    }
    case "reset":
      return initialState(true);
    case "setClock":
      return { ...state, clockOffsetMs: action.offsetMs };
    default:
      return state;
  }
}

// ---------- 种子数据：一班已交接 + 当前班进行中，含越限与跨端冲突 ----------

function rid(): string {
  return `r-${Math.random().toString(36).slice(2, 10)}`;
}

function mkReading(
  deviceId: string,
  metricId: Reading["metricId"],
  value: number,
  sampledAt: number,
  station: StationId,
  extra: Partial<Reading> = {}
): Reading {
  return {
    id: rid(),
    deviceId,
    metricId,
    value,
    sampledAt,
    recordedAt: sampledAt + 2 * 60000,
    sampledBy: station,
    stations: [station],
    pendingVerify: false,
    voided: false,
    backfill: false,
    ...extra,
  };
}

function seedState(): State {
  const now = Date.now();
  const cur = shiftBounds(now);
  const prevStart = cur.start - 4 * 3600_000;
  const prevEnd = cur.start;
  const at = (base: number, h: number, m = 0) => base + h * 3600_000 + m * 60000;

  let readings: Reading[] = [];

  type DeviceSample = [string, [string, number][]];
  const pushSampleSet = (t: number, devs: DeviceSample[], station: StationId) => {
    for (const [d, metrics] of devs) {
      for (const [m, v] of metrics) {
        readings.push(mkReading(d, m as Reading["metricId"], v, t, station));
      }
    }
  };

  // —— 上一班（已封版）：0/2 小时两轮抄表 ——
  const prevSet: DeviceSample[] = [
    ["ME", [["rpm", 82], ["oil", 0.42], ["water", 78.5]]],
    ["DG1", [["rpm", 1500], ["oil", 0.38], ["water", 72.0]]],
    ["DG2", [["rpm", 1502], ["oil", 0.37], ["water", 84.2]]], // 水温越上限
  ];
  pushSampleSet(at(prevStart, 0), prevSet, "engine");
  pushSampleSet(at(prevStart, 2), prevSet, "engine");

  // 封版后对上一班的补录：DG2 水温回落到 79.0（该异常在补录差异里体现为解除）
  readings.push(
    mkReading("DG2", "water", 79.0, at(prevStart, 3, 20), "engine", {
      recordedAt: now - 10 * 60000,
      backfill: true,
    })
  );

  // —— 当前班：最近 25 分钟内的有效读数 ——
  const t25 = now - 25 * 60000;
  const t10 = now - 10 * 60000;
  pushSampleSet(
    t25,
    [
      ["ME", [["rpm", 83], ["oil", 0.43], ["water", 79.0]]],
      ["DG1", [["rpm", 1498], ["oil", 0.39], ["water", 73.5]]],
      ["DG2", [["rpm", 1501], ["oil", 0.36], ["water", 78.8]]],
    ],
    "engine"
  );
  pushSampleSet(
    t10,
    [
      ["DG1", [["rpm", 1500], ["oil", 0.38], ["water", 72.6]]],
      ["DG2", [["rpm", 1499], ["oil", 0.37], ["water", 77.9]]],
    ],
    "engine"
  );

  // 主机最新转速：机舱与驾驶台断网各记一份，值不一致 → 回网后待核
  const t5 = now - 5 * 60000;
  readings.push(mkReading("ME", "rpm", 84, t5, "engine"));
  readings.push(mkReading("ME", "rpm", 88, t5, "bridge"));

  // 用合并逻辑构造冲突组（模拟这两条刚回网）
  let conflicts: State["conflicts"] = [];
  const a = readings[readings.length - 2];
  const b = readings[readings.length - 1];
  let merged = mergeReadings(readings.slice(0, -2), conflicts, a);
  merged = mergeReadings(merged.readings, merged.conflicts, b);
  readings = merged.readings;
  conflicts = merged.conflicts;

  // 上一班交接摘要（封版时刻 = 当班开始；快照里 DG2 水温异常未结，现值 84.2）
  const sealedReadings = readings.filter(
    (r) => r.sampledAt >= prevStart && r.sampledAt < prevEnd && !r.backfill
  );
  const summary = {
    shiftId: shiftBounds(prevStart).id,
    start: prevStart,
    end: prevEnd,
    sealedAt: prevEnd + 3 * 60000,
    engineer: "王轮机",
    relief: "李值班",
    note: "DG2 冷却水温偏高，已调大淡水量，下一班持续关注。",
    readings: sealedReadings.map((r) => ({ ...r })),
    openAnomalies: snapshotOpenAnomalies(sealedReadings, prevEnd + 3 * 60000),
  };

  return {
    readings,
    conflicts,
    summaries: [summary],
    outboxes: { engine: [], bridge: [] },
    online: true,
    activeStation: "engine",
    ttlMinutes: 30,
    clockOffsetMs: 0,
  };
}

export function initialState(forceSeed = false): State {
  if (!forceSeed) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as State;
    } catch {
      // fall through to seed
    }
  }
  return seedState();
}

export function useStore(): [State, React.Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅保留内存态
    }
  }, [state]);
  return [state, dispatch];
}

/** 演示时钟：每秒走动，可快进/回拨用于观察过期退趋势 */
export function useNow(clockOffsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);
  useEffect(() => {
    const tick = () => setNow(Date.now() + clockOffsetMs);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [clockOffsetMs]);
  return now;
}
