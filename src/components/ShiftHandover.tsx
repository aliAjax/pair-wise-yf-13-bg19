import { useState } from "react";
import {
  deviceById,
  fmtValue,
  fullTime,
  hm,
  metricById,
  reconcileAnomalies,
  shiftBounds,
} from "../domain";
import type { Action } from "../store";
import type { State } from "../types";

interface Props {
  state: State;
  now: number;
  dispatch: React.Dispatch<Action>;
}

export function ShiftHandover({ state, now, dispatch }: Props) {
  const cur = shiftBounds(now);
  const alreadySealed = state.summaries.some((s) => s.shiftId === cur.id);
  const pendingOutbox = state.outboxes.engine.length + state.outboxes.bridge.length;

  const [engineer, setEngineer] = useState("");
  const [relief, setRelief] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const inShift = state.readings.filter(
    (r) => r.sampledAt >= cur.start && r.sampledAt < cur.end
  );

  const seal = () => {
    if (!engineer.trim() || !relief.trim()) {
      setErr("请填写交班轮机员与接班人");
      return;
    }
    if (pendingOutbox > 0) {
      setErr("机舱/驾驶台尚有断网暂存读数，请先回网合并再交接");
      return;
    }
    dispatch({
      type: "seal",
      engineer: engineer.trim(),
      relief: relief.trim(),
      note: note.trim(),
      sealedAt: now,
    });
    setErr(null);
    setNote("");
  };

  return (
    <section className="panel" id="handover">
      <div className="heading">
        <div>
          <p>交接班摘要</p>
          <h2>本班封版与历史交接</h2>
        </div>
        <p className="rule-note">封版只固化本班读数与未结异常；之后补录仅追加差异，不改摘要</p>
      </div>

      {!alreadySealed ? (
        <div className="seal-box">
          <div className="seal-info">
            <span>当前班次</span>
            <b>
              {cur.id.split("-").slice(1).join("-")}（{hm(cur.start)}–{hm(cur.end)}）
            </b>
            <span>本班读数 {inShift.length} 项</span>
            <span>
              未结异常{" "}
              {
                reconcileAnomalies(inShift.filter((r) => r.sampledAt <= now)).filter(
                  (a) => !a.closedAt
                ).length
              }{" "}
              项
            </span>
          </div>
          <div className="seal-form">
            <label>
              <span>交班轮机员</span>
              <input value={engineer} onChange={(e) => setEngineer(e.target.value)} placeholder="签名" />
            </label>
            <label>
              <span>接班轮机员</span>
              <input value={relief} onChange={(e) => setRelief(e.target.value)} placeholder="签名" />
            </label>
            <label className="span2">
              <span>交接备注</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="遗留事项 / 下一班关注" />
            </label>
          </div>
          {err && <p className="form-error">{err}</p>}
          <button className="primary seal-btn" onClick={seal}>
            封版交接
          </button>
        </div>
      ) : (
        <p className="seal-done">本班已于 {fullTime(now)} 完成封版，继续抄表自动计入下一班</p>
      )}

      <div className="summary-list">
        {[...state.summaries].reverse().map((s) => {
          // 封后补录：采样落本班、带 backfill 标记
          const later = state.readings.filter(
            (r) => r.backfill && r.sampledAt >= s.start && r.sampledAt < s.end
          );
          const liveAnoms = reconcileAnomalies(
            state.readings.filter((r) => r.sampledAt >= s.start && r.sampledAt < s.end)
          );
          const sealedOpenIds = new Set(s.openAnomalies.map((o) => o.anomalyId));
          const resolvedAfter = liveAnoms.filter(
            (a) => sealedOpenIds.has(a.id) && a.closedAt
          );
          const newAfter = liveAnoms.filter(
            (a) => !sealedOpenIds.has(a.id) && (later.some((r) => r.id === a.openedReadingId))
          );

          return (
            <article key={s.shiftId} className="summary-card">
              <header>
                <div>
                  <h3>{s.shiftId}</h3>
                  <p>
                    {fullTime(s.start)} {hm(s.start)}–{hm(s.end)} · 封版于{" "}
                    {fullTime(s.sealedAt)} {hm(s.sealedAt)}
                  </p>
                </div>
                <span className="seal-stamp">已封版</span>
              </header>

              <p className="sign-line">
                交班 <b>{s.engineer}</b> → 接班 <b>{s.relief}</b>
              </p>
              {s.note && <p className="note-line">备注：{s.note}</p>}

              <div className="summary-cols">
                <div>
                  <h4>封版读数（{s.readings.length} 项，不可改）</h4>
                  <ul className="mini-list">
                    {s.readings.slice(0, 6).map((r) => (
                      <li key={r.id}>
                        {hm(r.sampledAt)} {deviceById(r.deviceId).name}·
                        {metricById(r.metricId).name}{" "}
                        <b>
                          {fmtValue(r.metricId, r.value)}
                          {metricById(r.metricId).unit}
                        </b>
                      </li>
                    ))}
                    {s.readings.length > 6 && <li>…其余 {s.readings.length - 6} 项见历史</li>}
                  </ul>
                </div>
                <div>
                  <h4>未结异常快照（{s.openAnomalies.length}）</h4>
                  {s.openAnomalies.length === 0 ? (
                    <p className="empty">无</p>
                  ) : (
                    <ul className="mini-list">
                      {s.openAnomalies.map((o) => (
                        <li key={o.anomalyId}>
                          {deviceById(o.deviceId).name}·{metricById(o.metricId).name}{" "}
                          {o.direction === "high" ? "超高" : "超低"}，封版现值{" "}
                          <b
                            className={o.direction === "high" ? "val-high" : "val-low"}
                          >
                            {fmtValue(o.metricId, o.valueAtSeal)}
                            {metricById(o.metricId).unit}
                          </b>
                          {o.pending && <span className="tag tag-pending">待核</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="diff-box">
                <h4>封后补录差异（只追加，摘要不变）</h4>
                {later.length === 0 ? (
                  <p className="empty">暂无补录</p>
                ) : (
                  <>
                    <ul className="mini-list">
                      {later.map((r) => (
                        <li key={r.id}>
                          <span className="tag tag-backfill">补录</span>
                          采样 {hm(r.sampledAt)}，{fullTime(r.recordedAt)} 录入 ·{" "}
                          {deviceById(r.deviceId).name}·{metricById(r.metricId).name}{" "}
                          <b>
                            {fmtValue(r.metricId, r.value)}
                            {metricById(r.metricId).unit}
                          </b>
                        </li>
                      ))}
                    </ul>
                    {(resolvedAfter.length > 0 || newAfter.length > 0) && (
                      <p className="diff-anom">
                        补录导致：
                        {resolvedAfter.map(
                          (a) =>
                            `${deviceById(a.deviceId).name}${metricById(a.metricId).name}异常解除`
                        )}
                        {newAfter.map(
                          (a) =>
                            `新增${deviceById(a.deviceId).name}${metricById(a.metricId).name}异常`
                        )}
                        （仅影响后续班次视图，封版快照不变）
                      </p>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
