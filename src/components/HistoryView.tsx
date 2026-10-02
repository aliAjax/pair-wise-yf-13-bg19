import { useState } from "react";
import {
  DEVICES,
  deviceById,
  fmtValue,
  fullTime,
  hm,
  metricById,
  shiftBounds,
  stationShort,
  violationOf,
} from "../domain";
import type { DeviceKind, Reading, State } from "../types";

interface Props {
  state: State;
  now: number;
}

export function HistoryView({ state, now }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [showVoid, setShowVoid] = useState(true);

  const rows = state.readings
    .filter((r) => (filter === "all" ? true : r.deviceId === filter))
    .filter((r) => (showVoid ? true : !r.voided))
    .sort((a, b) => b.sampledAt - a.sampledAt || b.recordedAt - a.recordedAt);

  const kinds: { id: string; name: string; kind?: DeviceKind }[] = [
    { id: "all", name: "全部设备" },
    ...DEVICES.map((d) => ({ id: d.id, name: d.name })),
  ];

  return (
    <section className="panel" id="history">
      <div className="heading">
        <div>
          <p>历史记录</p>
          <h2>读数流水（按设备筛选）</h2>
        </div>
        <div className="history-tools">
          <label className="check">
            <input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} />
            显示已舍弃值
          </label>
        </div>
      </div>

      <div className="chips">
        {kinds.map((k) => (
          <button
            key={k.id}
            className={filter === k.id ? "chip-on" : ""}
            onClick={() => setFilter(k.id)}
          >
            {k.name}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>采样时刻</th>
              <th>班次</th>
              <th>设备</th>
              <th>参数</th>
              <th>读数</th>
              <th>来源 / 状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = violationOf(r.deviceId, r.metricId, r.value);
              const sh = shiftBounds(r.sampledAt);
              const sealed = state.summaries.some((s) => s.shiftId === sh.id);
              const ageMin = Math.max(0, Math.round((now - r.sampledAt) / 60000));
              return (
                <tr key={r.id} className={r.voided ? "row-void" : v ? "row-alarm" : ""}>
                  <td>
                    {fullTime(r.sampledAt)} {hm(r.sampledAt)}
                    <small>（{ageMin} 分钟前采）</small>
                  </td>
                  <td>{sh.id.split("-").slice(1).join("-")}</td>
                  <td>{deviceById(r.deviceId).name}</td>
                  <td>{metricById(r.metricId).name}</td>
                  <td>
                    <b className={v === "high" ? "val-high" : v === "low" ? "val-low" : ""}>
                      {fmtValue(r.metricId, r.value)}
                    </b>{" "}
                    {metricById(r.metricId).unit}
                  </td>
                  <td className="flag-cell">
                    <span className="tag tag-src">{r.stations.map(stationShort).join("/")}</span>
                    {r.pendingVerify && <span className="tag tag-pending">待核</span>}
                    {r.voided && <span className="tag tag-void">已舍弃</span>}
                    {r.backfill && <span className="tag tag-backfill">封后补录</span>}
                    {sealed && !r.backfill && <span className="tag tag-sealed">已封版</span>}
                    {ageMin > state.ttlMinutes && !r.voided && (
                      <span className="tag tag-stale">已退出趋势</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty">暂无记录</p>}
      </div>
    </section>
  );
}
