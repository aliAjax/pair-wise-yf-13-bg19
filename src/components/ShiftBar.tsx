// 班次条：切换查看班次、对本班执行交接封摘要

import { SHIFT_STARTS, pad } from "../config";
import type { Store } from "../store";

export default function ShiftBar({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const { activeShiftId } = state;
  const [dateStr, label] = activeShiftId.split("|");
  const sealed = !!state.summaries[activeShiftId];

  // 以当前班次为基准，给出相邻若干班供切换
  const base = new Date(`${dateStr}T00:00:00`).getTime();
  const shifts: string[] = [];
  for (let i = -2; i <= 2; i++) {
    const d = new Date(base + i * 4 * 3600 * 1000);
    const h = d.getHours();
    const start = Math.floor(h / 4) * 4;
    const lab = `${pad(start)}-${pad(start + 4)}`;
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    shifts.push(`${ds}|${lab}`);
  }

  return (
    <section className="panel shiftbar">
      <div className="shift-head">
        <div>
          <p className="eyebrow">值班班次</p>
          <h2>
            {dateStr} {label}班
            {sealed && <span className="badge sealed">已交接封摘要</span>}
          </h2>
        </div>
        {!sealed ? (
          <button
            className="primary"
            onClick={() => dispatch({ type: "SEAL_SHIFT", shiftId: activeShiftId })}
            title="把本班读数与未结异常封成摘要，封后只读，补录只记差异"
          >
            交接 · 封本班摘要
          </button>
        ) : (
          <button
            onClick={() =>
              document
                .getElementById("summary-panel")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            查看交接摘要
          </button>
        )}
      </div>
      <div className="chips">
        {shifts.map((sid) => {
          const [ds, lab] = sid.split("|");
          const isActive = sid === activeShiftId;
          const isSealed = !!state.summaries[sid];
          return (
            <button
              key={sid}
              className={isActive ? "chip-on" : ""}
              onClick={() => dispatch({ type: "SET_ACTIVE_SHIFT", shiftId: sid })}
            >
              {ds.slice(5)} {lab}
              {isSealed ? " ✓" : ""}
            </button>
          );
        })}
      </div>
    </section>
  );
}
