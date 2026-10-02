// 读数录入：选设备、定采样时刻（默认当前）、填转速/油压/水温
// 若所选时刻的班次已封摘要，则自动按补录处理（只记差异，不改摘要）

import { useMemo, useState } from "react";
import { DEVICES, METRICS, shiftFromTs } from "../config";
import type { MetricKey } from "../types";
import type { Store } from "../store";
import { toLocalInputValue } from "../format";

export default function ReadingForm({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const [localTs, setLocalTs] = useState(toLocalInputValue(Date.now()));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const sampledAt = useMemo(() => {
    const t = new Date(localTs).getTime();
    return Number.isNaN(t) ? Date.now() : t;
  }, [localTs]);

  const { shiftId, label, dateStr } = shiftFromTs(sampledAt);
  const sealed = !!state.summaries[shiftId];

  const setVal = (k: MetricKey, v: string) =>
    setVals((prev) => ({ ...prev, [k]: v }));

  const submit = () => {
    const values: Partial<Record<MetricKey, number>> = {};
    for (const m of METRICS) {
      const raw = vals[m.key];
      if (raw !== undefined && raw.trim() !== "") {
        const n = Number(raw);
        if (!Number.isNaN(n)) values[m.key] = n;
      }
    }
    if (Object.keys(values).length === 0) {
      setMsg("请至少填写一个测点读数");
      return;
    }
    dispatch({
      type: "ADD_READINGS",
      payload: { deviceId, sampledAt, values, note: note.trim() || undefined },
    });
    setVals({});
    setNote("");
    setMsg(
      sealed
        ? `已按补录记入 ${dateStr} ${label}班（摘要保持不变，仅留差异）`
        : `已记入 ${dateStr} ${label}班`
    );
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">参数读数</p>
          <h2>抄录读数</h2>
        </div>
        {sealed && <span className="badge warn">补录模式</span>}
      </div>

      <div className="form-stack">
        <label>
          <span>设备</span>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>采样时刻</span>
          <input
            type="datetime-local"
            value={localTs}
            onChange={(e) => setLocalTs(e.target.value)}
          />
        </label>

        <div className="metric-inputs">
          {METRICS.map((m) => (
            <label key={m.key}>
              <span>
                {m.label}
                <em className="unit">({m.unit})</em>
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder={`${m.low} ~ ${m.high}`}
                value={vals[m.key] ?? ""}
                onChange={(e) => setVal(m.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <label>
          <span>备注（可选）</span>
          <input
            placeholder="如：风浪大、负荷波动"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button className="primary" onClick={submit}>
          保存读数
        </button>
        {msg && <p className="form-msg">{msg}</p>}
        {!state.online && (
          <p className="form-msg off">
            当前断网：读数仅记 {state.station} 本站，回网时自动合并
          </p>
        )}
      </div>
    </section>
  );
}
