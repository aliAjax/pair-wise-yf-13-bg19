import { hm, shiftBounds } from "../domain";
import type { Action } from "../store";
import type { State } from "../types";

interface Props {
  state: State;
  now: number;
  dispatch: React.Dispatch<Action>;
}

const TTL_OPTIONS = [15, 30, 60];

export function TopBar({ state, now, dispatch }: Props) {
  const cur = shiftBounds(now);
  const label = cur.id.split("-").slice(1).join("-");
  const jump = (ms: number) => dispatch({ type: "setClock", offsetMs: state.clockOffsetMs + ms });

  return (
    <header className="topbar">
      <div className="brand">
        <h1>船舶轮机值班工作台</h1>
        <span>读数留时刻 · 看板只信新值 · 交接可封版 · 断网双份待核</span>
      </div>

      <div className="top-controls">
        <div className="clock-box">
          <div className="clock-main">
            {new Date(now).toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </div>
          <div className="clock-sub">
            当前 {label}（{hm(cur.start)}–{hm(cur.end)}）
          </div>
          <div className="clock-btns">
            <button onClick={() => jump(-15 * 60000)} title="回拨 15 分钟">
              -15分
            </button>
            <button onClick={() => jump(45 * 60000)} title="快进 45 分钟，观察读数过期">
              +45分
            </button>
            <button onClick={() => dispatch({ type: "setClock", offsetMs: 0 })}>对时</button>
          </div>
        </div>

        <label className="ttl-box">
          <span>读数有效期</span>
          <select
            value={state.ttlMinutes}
            onChange={(e) => dispatch({ type: "setTtl", minutes: Number(e.target.value) })}
          >
            {TTL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} 分钟
              </option>
            ))}
          </select>
        </label>

        <button className="ghost reset-btn" onClick={() => {
          if (window.confirm("重置为演示数据？当前所有记录将被清空。")) {
            dispatch({ type: "reset" });
          }
        }}>
          重置演示
        </button>
      </div>
    </header>
  );
}
