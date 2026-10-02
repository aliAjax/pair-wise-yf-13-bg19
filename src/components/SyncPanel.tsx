import { deviceById, fullTime, metricById, stationShort } from "../domain";
import type { Action } from "../store";
import type { State } from "../types";

interface Props {
  state: State;
  dispatch: React.Dispatch<Action>;
}

export function SyncPanel({ state, dispatch }: Props) {
  const pending = state.outboxes.engine.length + state.outboxes.bridge.length;
  const unresolved = state.conflicts.filter((c) => !c.resolved);

  return (
    <section className="panel" id="sync">
      <div className="heading">
        <div>
          <p>机舱 / 驾驶台 双端记录</p>
          <h2>网络与合并</h2>
        </div>
        <label className="net-switch">
          <input
            type="checkbox"
            checked={state.online}
            onChange={(e) => dispatch({ type: "setOnline", online: e.target.checked })}
          />
          <span className={state.online ? "net-on" : "net-off"}>
            {state.online ? "● 联网" : "○ 断网"}
          </span>
        </label>
      </div>

      <div className="outbox-grid">
        {(["engine", "bridge"] as const).map((sid) => (
          <div key={sid} className={`outbox ${state.outboxes[sid].length ? "has-data" : ""}`}>
            <strong>{stationShort(sid)}本地暂存</strong>
            <span>{state.outboxes[sid].length} 条</span>
          </div>
        ))}
      </div>

      {!state.online && (
        <p className="sync-hint">
          断网期间两端各记一份；当前录入端：
          <b>{stationShort(state.activeStation)}</b>。可切换站点模拟两端分别抄表。
        </p>
      )}

      <div className="sync-actions">
        <button
          className="primary"
          disabled={state.online === false || pending === 0}
          onClick={() => dispatch({ type: "sync" })}
          title={!state.online ? "需先恢复联网" : "按设备与采样时刻合并双端读数"}
        >
          回网合并（{pending} 条）
        </button>
        <div className="station-switch">
          {(["engine", "bridge"] as const).map((sid) => (
            <button
              key={sid}
              className={state.activeStation === sid ? "selected" : ""}
              onClick={() => dispatch({ type: "setStation", station: sid })}
            >
              {stationShort(sid)}
            </button>
          ))}
        </div>
      </div>

      {unresolved.length > 0 && (
        <div className="conflict-box">
          <h4>待核读数：同一时刻两端填了不同值，均保留</h4>
          {unresolved.map((g) => {
            const rs = g.readingIds
              .map((id) => state.readings.find((r) => r.id === id))
              .filter((r): r is (typeof state.readings)[number] => r !== undefined && !r.voided);
            return (
              <div key={g.id} className="conflict-item">
                <p>
                  <b>
                    {deviceById(g.deviceId).name} · {metricById(g.metricId).name}
                  </b>
                  ，采样 {fullTime(g.sampledAt)}
                </p>
                <div className="conflict-values">
                  {rs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        dispatch({
                          type: "resolveConflict",
                          groupId: g.id,
                          keepId: r.id,
                        })
                      }
                      title="核实为该值，另一条留痕舍弃"
                    >
                      <strong>
                        {r.value} {metricById(g.metricId).unit}
                      </strong>
                      <span>
                        {r.stations.map(stationShort).join("/")} · 核实采用
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
