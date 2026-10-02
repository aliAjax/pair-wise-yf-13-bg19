// 轮机值班工作台 —— 数据类型定义

export type Station = "机舱" | "驾驶台";

export type MetricKey = "rpm" | "oil" | "water";

/** 一台设备 */
export interface Device {
  id: string;
  name: string;
}

/** 一个测点（参数）的定义 */
export interface MetricDef {
  key: MetricKey;
  label: string; // 转速 / 滑油压力 / 冷却水温
  unit: string;
  low: number; // 越限低限
  high: number; // 越限高限
}

/**
 * 一条读数。读数带采样时刻 sampledAt，是整个工作台的核心。
 * - synced=false 表示断网时记在本站 outbox、尚未回网合并
 * - conflict=true 表示回网合并时同一设备同一时刻出现了不同值，予以保留并标待核
 * - isSupplement=true 表示交接班封摘要后的补录（不改摘要，只记差异）
 */
export interface Reading {
  id: string;
  deviceId: string;
  metric: MetricKey;
  value: number;
  sampledAt: number; // 采样时刻（epoch ms）
  shiftId: string; // 所属班次，由采样时刻推导
  station: Station; // 记录本站
  synced: boolean;
  conflict: boolean;
  isSupplement: boolean;
  note?: string;
  createdAt: number;
}

/** 越限异常项，随越限读数生成、随恢复读数解除 */
export interface Abnormal {
  key: string; // deviceId|metric|openedAt
  deviceId: string;
  metric: MetricKey;
  value: number;
  limit: "high" | "low";
  openedAt: number;
  status: "open" | "cleared";
  clearedAt?: number;
  clearedValue?: number;
}

/** 封进摘要的未结异常快照（不可变） */
export interface OpenAbnormalSnapshot {
  deviceId: string;
  metric: MetricKey;
  value: number;
  limit: "high" | "low";
  openedAt: number;
}

/** 补录差异：封摘要后再补的读数，只留差异，不动摘要 */
export interface Supplement {
  id: string;
  at: number; // 补录操作时刻
  deviceId: string;
  metric: MetricKey;
  sampledAt: number;
  type: "add" | "correct"; // 新增 / 更正
  oldValue?: number;
  newValue: number;
  note?: string;
}

/** 交接班摘要：一班一封，封后只读 */
export interface ShiftSummary {
  shiftId: string;
  shiftLabel: string;
  dateStr: string;
  sealedAt: number;
  readingIds: string[]; // 封入摘要的本班读数
  readingCount: number;
  openAbnormals: OpenAbnormalSnapshot[]; // 封摘要时的未结异常
  supplements: Supplement[]; // 封后补录差异
}

/** 设备实时状态（由最近一条没过期的有效读数重算） */
export type DeviceStatus = "normal" | "alarm" | "stale";

export interface MetricState {
  metric: MetricKey;
  reading?: Reading;
  status: DeviceStatus;
  ageMin?: number;
}
