// 历史记录：按设备筛选，展示全部读数并标注 待核 / 补录 / 未同步

import { useMemo, useState } from "react";
import { DEVICES, METRIC_MAP, deviceName } from "../config";
import type { Store } from "../store";
import { allReadings } from "../store";
import { fmtDateTime, fmtValue } from "../format";

export default function HistoryPanel({ store }: { store: Store }) {
  const { state } = store;
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");

  const shifts = useMemo(() => {
    const set = new Set(allReadings(state).map((r) => r.shiftId));
    return [...set].sort().reverse();
  }, [state]);

  const list = useMemo(() => {
    return allReadings(state)
      .filter((r) => (deviceFilter === "all" ? true : r.deviceId === deviceFilter))
      .filter((r) => (shiftFilter === "all" ? true : r.shiftId === shiftFilter))
      .sort((a, b) => b.sampledAt - a.sampledAt || b.createdAt - a.createdAt);
  }, [state, deviceFilter, shiftFilter]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">历史记录</p>
          <h2>读数台账</h2>
        </div>
        <span className="badge">共 {list.length} 条</span>
      </div>

      <div className="filter-row">
        <div className="chips">
          <button
            className={deviceFilter === "all" ? "chip-on" : ""}
            onClick={() => setDeviceFilter("all")}
          >
            全部设备
          </button>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              className={deviceFilter === d.id ? "chip-on" : ""}
              onClick={() => setDeviceFilter(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
        <select
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value)}
        >
          <option value="all">全部班次</option>
          {shifts.map((sid) => {
            const [ds, lab] = sid.split("|");
            return (
              <option key={sid} value={sid}>
                {ds} {lab}班
              </option>
            );
          })}
        </select>
      </div>

      {list.length === 0 ? (
        <p className="empty">暂无读数。</p>
      ) : (
        <div className="records">
          {list.map((r) => (
            <article key={r.id} className={r.conflict ? "row-conflict" : ""}>
              <b className="row-time">{fmtDateTime(r.sampledAt).slice(5)}</b>
              <div>
                <h3>
                  {deviceName(r.deviceId)} · {METRIC_MAP[r.metric].label}{" "}
                  <span className="row-value">
                    {fmtValue(r.value)} {METRIC_MAP[r.metric].unit}
                  </span>
                </h3>
                <p>
                  <span className="row-shift">
                    {r.shiftId.split("|")[0].slice(5)} {r.shiftId.split("|")[1]}班
                  </span>
                  <span className="row-station">{r.station}记</span>
                  {r.conflict && <span className="badge alarm">待核</span>}
                  {r.isSupplement && <span className="badge warn">补录</span>}
                  {!r.synced && <span className="badge off">未同步</span>}
                  {r.note && <em className="row-note">{r.note}</em>}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
