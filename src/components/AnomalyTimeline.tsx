import {
  deviceById,
  fmtValue,
  fullTime,
  hm,
  isFresh,
  metricById,
  reconcileAnomalies,
} from "../domain";
import type { Reading, State } from "../types";

interface Props {
  state: State;
  now: number;
}

function touch(a: ReturnType<typeof reconcileAnomalies>[number], backfillIds: Set<string>) {
  return backfillIds.has(a.openedReadingId) ||
    (a.closedReadingId ? backfillIds.has(a.closedReadingId) : false)
    ? "封后补录"
    : null;
}

export function AnomalyTimeline({ state, now }: Props) {
  const anomalies = reconcileAnomalies(state.readings);
  const backfillIds = new Set(state.readings.filter((r) => r.backfill).map((r) => r.id));
  const ttlMs = state.ttlMinutes * 60000;
  const triggerStale = (r: Reading) => !isFresh(r, now, ttlMs);

  return (
    <section className="panel" id="anomalies">
      <div className="heading">
        <div>
          <p>异常记录时间线</p>
          <h2>越限自动开单 / 回区自动解除</h2>
        </div>
        <p className="rule-note">读数过期只退出趋势，异常单不自动关闭；待核值触发的单据带待核标记</p>
      </div>

      {anomalies.length === 0 && <p className="empty">暂无异常记录</p>}

      <ol className="anomaly-list">
        {anomalies.map((a) => {
          const dev = deviceById(a.deviceId);
          const m = metricById(a.metricId);
          const trigger = state.readings.find((r) => r.id === a.openedReadingId);
          const tag = touch(a, backfillIds);
          return (
            <li key={a.id} className={`anomaly ${a.closedAt ? "closed" : "open"}`}>
              <div className="anomaly-dot" />
              <div className="anomaly-body">
                <div className="anomaly-head">
                  <b>
                    {dev.name} · {m.name}
                    {a.direction === "high" ? "高于上限" : "低于下限"}
                  </b>
                  <span className={`anomaly-state ${a.closedAt ? "st-closed" : "st-open"}`}>
                    {a.closedAt ? "已解除" : "未结"}
                  </span>
                  {a.pending && <span className="tag tag-pending">待核</span>}
                  {tag && <span className="tag tag-backfill">{tag}</span>}
                  {!a.closedAt && trigger && triggerStale(trigger) && (
                    <span className="tag tag-stale">触发读数已过期</span>
                  )}
                </div>
                <p className="anomaly-detail">
                  限值 {fmtValue(a.metricId, a.limit)}
                  {m.unit} · 极值{" "}
                  <b className={a.direction === "high" ? "val-high" : "val-low"}>
                    {fmtValue(a.metricId, a.peak)}
                    {m.unit}
                  </b>
                  ，{fullTime(a.openedAt)} {hm(a.openedAt)} 开单
                  {a.closedAt
                    ? `；${fullTime(a.closedAt)} ${hm(a.closedAt)} 读数回区解除`
                    : "，等待回区读数解除"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
