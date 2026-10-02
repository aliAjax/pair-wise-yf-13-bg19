// 趋势面板：所选设备各测点的有效期内读数曲线（过期读数已退出趋势）

import { useState } from "react";
import { DEVICES, METRICS } from "../config";
import type { Store } from "../store";
import { trendReadings, visibleReadings } from "../store";
import Sparkline from "./Sparkline";
import { fmtClock, fmtValue } from "../format";

export default function TrendPanel({ store }: { store: Store }) {
  const { state, now } = store;
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const readings = visibleReadings(state);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">参数趋势</p>
          <h2>近期曲线</h2>
        </div>
        <div className="chips">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              className={deviceId === d.id ? "chip-on" : ""}
              onClick={() => setDeviceId(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="trend-grid">
        {METRICS.map((m) => {
          const list = trendReadings(
            readings,
            deviceId,
            m.key,
            now,
            state.validityMin
          );
          return (
            <div key={m.key} className="trend-cell">
              <div className="trend-head">
                <strong>{m.label}</strong>
                <span className="trend-unit">
                  {m.unit} · 限 {m.low}~{m.high}
                </span>
              </div>
              <Sparkline readings={list} metric={m.key} />
              <div className="trend-x">
                <span>
                  {list.length ? fmtClock(list[0].sampledAt) : "--:--"}
                </span>
                <span className="trend-last">
                  {list.length
                    ? `最新 ${fmtValue(list[list.length - 1].value)}`
                    : "无有效读数"}
                </span>
                <span>
                  {list.length
                    ? fmtClock(list[list.length - 1].sampledAt)
                    : "--:--"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
