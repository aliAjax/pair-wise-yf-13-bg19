// 交接班摘要：未封时可预览并封班；封后只读，补录只追加差异、不改摘要

import { useMemo, useState } from "react";
import { DEVICES, METRICS, METRIC_MAP, deviceName } from "../config";
import type { MetricKey } from "../types";
import type { Store } from "../store";
import {
  allReadings,
  deriveAbnormals,
  visibleReadings,
} from "../store";
import { fmtDateTime, fmtValue, toLocalInputValue } from "../format";

export default function SummaryPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const shiftId = state.activeShiftId;
  const summary = state.summaries[shiftId];
  const [dateStr, label] = shiftId.split("|");

  // 本班（未封）预览读数与未结异常
  const previewReadings = visibleReadings(state).filter(
    (r) => r.shiftId === shiftId && !r.conflict
  );
  const previewOpen = deriveAbnormals(
    visibleReadings(state).filter((r) => !r.conflict),
    state.limits
  ).filter((a) => a.status === "open");

  // 封入摘要的读数（按 id 解析）
  const sealedReadings = useMemo(() => {
    if (!summary) return [];
    const all = allReadings(state);
    return summary.readingIds
      .map((id) => all.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => !!r);
  }, [summary, state]);

  return (
    <section className="panel" id="summary-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">交接班</p>
          <h2>
            {dateStr} {label}班 摘要
          </h2>
        </div>
        {summary ? (
          <span className="badge sealed">已封 · {fmtDateTime(summary.sealedAt)}</span>
        ) : (
          <span className="badge">未封班</span>
        )}
      </div>

      {!summary ? (
        <div className="summary-preview">
          <p className="summary-hint">
            封班将把本班 <b>{previewReadings.length}</b> 条读数与{" "}
            <b>{previewOpen.length}</b> 项未结异常封入摘要。封后摘要只读，
            之后补录只记差异、不改摘要。
          </p>
          {previewOpen.length > 0 && (
            <ul className="summary-abn">
              {previewOpen.map((a) => (
                <li key={a.key} className="abn-open">
                  <span className="dot-open" />
                  {deviceName(a.deviceId)} · {METRIC_MAP[a.metric].label}{" "}
                  越限 {fmtValue(a.value)} {METRIC_MAP[a.metric].unit}（
                  {a.limit === "high" ? "超上限" : "低于下限"}）
                </li>
              ))}
            </ul>
          )}
          <button
            className="primary"
            disabled={previewReadings.length === 0}
            onClick={() => dispatch({ type: "SEAL_SHIFT", shiftId })}
          >
            封本班摘要
          </button>
        </div>
      ) : (
        <div className="summary-sealed">
          <div className="summary-stats">
            <div>
              <small>本班读数</small>
              <strong>{summary.readingCount}</strong>
            </div>
            <div>
              <small>未结异常</small>
              <strong className={summary.openAbnormals.length ? "num-alarm" : ""}>
                {summary.openAbnormals.length}
              </strong>
            </div>
            <div>
              <small>补录差异</small>
              <strong>{summary.supplements.length}</strong>
            </div>
          </div>

          {summary.openAbnormals.length > 0 && (
            <div className="summary-block">
              <h4>封入的未结异常</h4>
              <ul className="summary-abn">
                {summary.openAbnormals.map((a, i) => (
                  <li key={i} className="abn-open">
                    <span className="dot-open" />
                    {deviceName(a.deviceId)} · {METRIC_MAP[a.metric].label}{" "}
                    越限 {fmtValue(a.value)} {METRIC_MAP[a.metric].unit}（
                    {a.limit === "high" ? "超上限" : "低于下限"}）· 采样{" "}
                    {fmtDateTime(a.openedAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="summary-block">
            <h4>本班读数（封入快照，共 {sealedReadings.length} 条）</h4>
            {sealedReadings.length === 0 ? (
              <p className="empty">无读数</p>
            ) : (
              <ul className="summary-readings">
                {sealedReadings.slice(0, 50).map((r) => (
                  <li key={r.id}>
                    <span className="sr-time">{fmtDateTime(r.sampledAt)}</span>
                    <span className="sr-dev">{deviceName(r.deviceId)}</span>
                    <span className="sr-metric">{METRIC_MAP[r.metric].label}</span>
                    <b>
                      {fmtValue(r.value)} {METRIC_MAP[r.metric].unit}
                    </b>
                    {r.station !== state.station && (
                      <em className="sr-station">{r.station}记</em>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="summary-block">
            <h4>补录差异（摘要保持不变）</h4>
            {summary.supplements.length === 0 ? (
              <p className="empty">封班后暂无补录。</p>
            ) : (
              <ul className="sup-list">
                {summary.supplements.map((s) => (
                  <li key={s.id}>
                    <span className="sr-time">{fmtDateTime(s.at)}</span>
                    <span className={s.type === "correct" ? "tag-correct" : "tag-add"}>
                      {s.type === "correct" ? "更正" : "新增"}
                    </span>
                    <span className="sr-dev">{deviceName(s.deviceId)}</span>
                    <span className="sr-metric">{METRIC_MAP[s.metric].label}</span>
                    {s.type === "correct" ? (
                      <b>
                        {fmtValue(s.oldValue!)} → {fmtValue(s.newValue)}{" "}
                        {METRIC_MAP[s.metric].unit}
                      </b>
                    ) : (
                      <b>
                        {fmtValue(s.newValue)} {METRIC_MAP[s.metric].unit}
                      </b>
                    )}
                    <span className="sr-time">采样 {fmtDateTime(s.sampledAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <SupplementForm
              shiftId={shiftId}
              defaultTs={shiftStartTs(shiftId)}
              dispatch={dispatch}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function shiftStartTs(shiftId: string): number {
  const [dateStr, label] = shiftId.split("|");
  const [y, mo, da] = dateStr.split("-").map(Number);
  const startH = Number(label.split("-")[0]);
  return new Date(y, mo - 1, da, startH, 0, 0, 0).getTime();
}

function SupplementForm({
  shiftId,
  defaultTs,
  dispatch,
}: {
  shiftId: string;
  defaultTs: number;
  dispatch: Store["dispatch"];
}) {
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const [localTs, setLocalTs] = useState(toLocalInputValue(defaultTs));
  const [metric, setMetric] = useState<MetricKey>("rpm");
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState("");

  const submit = () => {
    const n = Number(val);
    if (val.trim() === "" || Number.isNaN(n)) {
      setMsg("请填写补录数值");
      return;
    }
    const sampledAt = new Date(localTs).getTime();
    dispatch({
      type: "ADD_READINGS",
      payload: {
        deviceId,
        sampledAt,
        values: { [metric]: n } as Partial<Record<MetricKey, number>>,
        note: "封班后补录",
      },
    });
    setVal("");
    setMsg("已补录：仅记入差异，本班摘要不变");
  };

  return (
    <div className="sup-form">
      <div className="sup-form-row">
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          {DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={localTs}
          onChange={(e) => setLocalTs(e.target.value)}
        />
        <input
          type="number"
          inputMode="decimal"
          placeholder="补录数值"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button onClick={submit}>补录</button>
      </div>
      {msg && <p className="form-msg">{msg}</p>}
    </div>
  );
}
