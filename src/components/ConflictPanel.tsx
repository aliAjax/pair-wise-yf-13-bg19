// 待核面板：回网合并时同一设备同一时刻出现不同值，两条都保留并标待核

import { METRIC_MAP, deviceName } from "../config";
import type { Store } from "../store";
import { conflictGroups } from "../store";
import { fmtClock, fmtValue } from "../format";

export default function ConflictPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const groups = conflictGroups(state.readings);

  if (groups.length === 0) return null;

  return (
    <section className="panel conflict-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">数据待核</p>
          <h2>同刻异值（{groups.length} 组）</h2>
        </div>
        <span className="badge alarm">都保留 · 待核实</span>
      </div>
      <div className="conflict-list">
        {groups.map((g) => (
          <article key={g.key} className="conflict-item">
            <header className="conflict-head">
              <strong>{deviceName(g.deviceId)}</strong>
              <span>采样 {fmtClock(g.sampledAt)}</span>
            </header>
            <ul className="conflict-vals">
              {g.readings.map((r) => (
                <li key={r.id} className="conflict-val">
                  <span className="cv-station">{r.station}</span>
                  <span className="cv-metric">{METRIC_MAP[r.metric].label}</span>
                  <b>
                    {fmtValue(r.value)} {METRIC_MAP[r.metric].unit}
                  </b>
                  {r.note && <em className="cv-note">{r.note}</em>}
                </li>
              ))}
            </ul>
            <div className="conflict-actions">
              <button
                onClick={() =>
                  dispatch({
                    type: "RESOLVE_CONFLICT",
                    deviceId: g.deviceId,
                    sampledAt: g.sampledAt,
                  })
                }
              >
                标记已核（保留两值）
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
