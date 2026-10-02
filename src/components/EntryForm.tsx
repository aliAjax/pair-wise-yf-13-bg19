import { useState } from "react";
import { DEVICES, METRICS, deviceById, fromLocalInput, rangeText, toLocalInput } from "../domain";
import type { MetricId, Reading, StationId } from "../types";

interface Props {
  now: number;
  station: StationId;
  online: boolean;
  onSubmit: (readings: Reading[]) => void;
}

const PRESETS: Record<string, Partial<Record<MetricId, number>>> = {
  ME: { rpm: 84, oil: 0.42, water: 79 },
  DG1: { rpm: 1500, oil: 0.38, water: 73 },
  DG2: { rpm: 1500, oil: 0.37, water: 74 },
};

let seq = 0;
function newId(): string {
  seq += 1;
  return `r-${Date.now().toString(36)}-${seq}`;
}

export function EntryForm({ now, station, online, onSubmit }: Props) {
  const [deviceId, setDeviceId] = useState("ME");
  const [sampledAt, setSampledAt] = useState(toLocalInput(now));
  const [values, setValues] = useState<Record<MetricId, string>>({
    rpm: "",
    oil: "",
    water: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const def = deviceById(deviceId);

  const applyPreset = () => {
    const p = PRESETS[deviceId] ?? {};
    setValues({
      rpm: p.rpm?.toString() ?? "",
      oil: p.oil?.toString() ?? "",
      water: p.water?.toString() ?? "",
    });
  };

  const submit = () => {
    const t = fromLocalInput(sampledAt);
    if (!Number.isFinite(t)) {
      setMsg("采样时刻无效");
      return;
    }
    const filled: Reading[] = [];
    for (const m of METRICS) {
      const raw = values[m.id].trim();
      if (!raw) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        setMsg(`${m.name} 不是有效数字`);
        return;
      }
      filled.push({
        id: newId(),
        deviceId,
        metricId: m.id,
        value: v,
        sampledAt: t,
        recordedAt: Date.now(),
        sampledBy: station,
        stations: [station],
        pendingVerify: false,
        voided: false,
        backfill: false,
      });
    }
    if (!filled.length) {
      setMsg("至少填写一个参数");
      return;
    }
    onSubmit(filled);
    setMsg(
      online
        ? `已记录 ${filled.length} 项 · 采样 ${new Date(t).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : `断网暂存 ${filled.length} 项于${station === "engine" ? "机舱" : "驾驶台"}，回网后合并`
    );
    setValues({ rpm: "", oil: "", water: "" });
    setSampledAt(toLocalInput(now));
  };

  return (
    <section className="panel" id="entry">
      <div className="heading">
        <div>
          <p>值班抄表</p>
          <h2>新增读数</h2>
        </div>
        <button className="ghost" onClick={applyPreset}>
          填入正常值
        </button>
      </div>

      <div className="form-grid">
        <label className="span2">
          <span>设备</span>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="span2">
          <span>采样时刻（可改时间补录）</span>
          <input
            type="datetime-local"
            value={sampledAt}
            onChange={(e) => setSampledAt(e.target.value)}
          />
        </label>

        {METRICS.map((m) => (
          <label key={m.id}>
            <span>
              {m.name}（{rangeText(deviceId, m.id)} {m.unit}）
            </span>
            <input
              inputMode="decimal"
              placeholder={`${m.name} ${m.unit}`}
              value={values[m.id]}
              onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="form-foot">
        <button className="primary" onClick={submit}>
          {online ? "提交读数" : "断网暂存"}
        </button>
        {msg && <span className="form-msg">{msg}</span>}
      </div>
    </section>
  );
}
