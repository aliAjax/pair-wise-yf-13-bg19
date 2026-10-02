// 设置：读数有效期（过期退出看板/趋势）、清空演示数据

import { useState } from "react";
import type { Store } from "../store";

export default function SettingsPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [val, setVal] = useState(String(state.validityMin));

  return (
    <section className="panel settings-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">设置</p>
          <h2>有效期与数据</h2>
        </div>
      </div>
      <div className="settings-row">
        <label className="validity-label">
          <span>读数有效期（分钟），过期即退出看板与趋势</span>
          <input
            type="number"
            min={1}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              const n = Number(val);
              if (!Number.isNaN(n) && n >= 1)
                dispatch({ type: "SET_VALIDITY", validityMin: n });
              else setVal(String(state.validityMin));
            }}
          />
        </label>
        <button
          onClick={() => {
            if (confirm("清空全部读数、摘要与同步记录？"))
              dispatch({ type: "RESET_ALL" });
          }}
        >
          清空数据
        </button>
      </div>
    </section>
  );
}
