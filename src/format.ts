// 时间与数值格式化

import { pad } from "./config";

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${fmtTime(ts)}`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 读数年龄文案 */
export function fmtAge(ageMin: number): string {
  if (ageMin < 1) return "刚刚";
  if (ageMin < 60) return `${Math.floor(ageMin)} 分钟前`;
  const h = Math.floor(ageMin / 60);
  const m = Math.floor(ageMin % 60);
  if (m === 0) return `${h} 小时前`;
  return `${h} 小时 ${m} 分前`;
}

/** datetime-local 输入框的值（本地时区） */
export function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function fmtValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
