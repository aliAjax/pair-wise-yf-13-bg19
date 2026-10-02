// 轮机值班工作台领域模型

export type StationId = "engine" | "bridge"; // 机舱 / 驾驶台
export type MetricId = "rpm" | "oil" | "water"; // 转速 / 滑油压力 / 冷却水温
export type DeviceKind = "engine" | "generator";

export interface MetricDef {
  id: MetricId;
  name: string;
  unit: string;
  decimals: number;
}

export interface Range {
  min: number;
  max: number;
}

/** 一条抄表读数：采样时刻与录入时刻分离，支持补录与多端合并 */
export interface Reading {
  id: string;
  deviceId: string;
  metricId: MetricId;
  value: number;
  sampledAt: number; // 采样时刻（交接、合并、过期判定都以它为准）
  recordedAt: number; // 实际录入时刻
  sampledBy: StationId; // 首次录入端
  stations: StationId[]; // 同值合并后，两端都抄到过
  conflictGroupId?: string; // 同时刻不同值的待核组
  pendingVerify: boolean; // 待核
  voided: boolean; // 待核被核实后舍弃的值，留痕但不再参与看板/趋势/异常
  backfill: boolean; // 封版后补录
}

export interface ConflictGroup {
  id: string;
  deviceId: string;
  metricId: MetricId;
  sampledAt: number;
  readingIds: string[];
  resolved: boolean;
  resolvedReadingId?: string;
}

export interface Anomaly {
  id: string; // 由 设备|参数|打开时刻 确定性生成
  deviceId: string;
  metricId: MetricId;
  direction: "high" | "low";
  limit: number;
  openedAt: number;
  openedReadingId: string;
  peak: number;
  pending: boolean; // 触发链路上含待核读数
  closedAt?: number;
  closedReadingId?: string;
}

/** 封版时固化的未结异常快照 */
export interface AnomalySnapshot {
  anomalyId: string;
  deviceId: string;
  metricId: MetricId;
  direction: "high" | "low";
  limit: number;
  openedAt: number;
  peak: number;
  pending: boolean;
  valueAtSeal: number;
}

/** 交接摘要：一旦封版即不可变 */
export interface ShiftSummary {
  shiftId: string;
  start: number;
  end: number;
  sealedAt: number;
  engineer: string;
  relief: string;
  note: string;
  readings: Reading[];
  openAnomalies: AnomalySnapshot[];
}

export interface State {
  readings: Reading[];
  conflicts: ConflictGroup[];
  summaries: ShiftSummary[];
  outboxes: Record<StationId, Reading[]>;
  online: boolean;
  activeStation: StationId;
  ttlMinutes: number;
  clockOffsetMs: number; // 演示时钟相对真实时间的偏移
}
