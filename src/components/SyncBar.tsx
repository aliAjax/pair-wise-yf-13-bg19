// 断网/回网 同步条：选择本站（机舱/驾驶台）、切换网络、回网合并、待核提示

import { STATIONS } from "../config";
import type { Station } from "../types";
import type { Store } from "../store";
import { conflictGroups } from "../store";

export default function SyncBar({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const groups = conflictGroups(state.readings);
  const outboxCount =
    state.outbox["机舱"].length + state.outbox["驾驶台"].length;

  return (
    <section className="panel syncbar">
      <div className="sync-group">
        <span className="sync-label">本站</span>
        <div className="chips">
          {STATIONS.map((s: Station) => (
            <button
              key={s}
              className={state.station === s ? "chip-on" : ""}
              onClick={() => dispatch({ type: "SET_STATION", station: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="sync-group">
        <span className="sync-label">网络</span>
        <button
          className={state.online ? "net-on" : "net-off"}
          onClick={() =>
            dispatch({ type: "SET_ONLINE", online: !state.online })
          }
          title={state.online ? "点击进入断网状态" : "点击回网并合并各站记录"}
        >
          {state.online ? "● 联网" : "○ 断网"}
        </button>
      </div>

      <div className="sync-status">
        {state.online ? (
          outboxCount > 0 ? (
            <span className="badge warn">本站有 {outboxCount} 条未同步</span>
          ) : (
            <span className="badge ok">各站记录已合并</span>
          )
        ) : (
          <span className="badge off">断网中：读数仅记本站，回网时合并</span>
        )}
        {groups.length > 0 && (
          <span className="badge alarm">待核 {groups.length} 组（同刻异值）</span>
        )}
      </div>

      <div className="sync-actions">
        <button
          className="primary"
          disabled={!state.online || outboxCount === 0}
          onClick={() => dispatch({ type: "MERGE_NOW" })}
          title="把各站断网记录按设备+时刻合并，异值留并标待核"
        >
          回网合并
        </button>
      </div>
    </section>
  );
}
