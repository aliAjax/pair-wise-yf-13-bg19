// 异常时间线：异常项随越限读数生成、随恢复读数解除

import { DEVICES, METRIC_MAP } from "../config";
import type { Store } from "../store";
import { deriveAbnormals, visibleReadings } from "../store";
import { fmtDateTime, fmtValue } from "../format";

export default function AbnormalPanel({ store }: { store: Store }) {
  const { state } = store;
  const abnormals = deriveAbnormals(
    visibleReadings(state).filter((r) => !r.conflict),
    state.limits
  );
  const openCount = abnormals.filter((a) => a.status === "open").length;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">异常巡检</p>
          <h2>异常时间线</h2>
        </div>
        <span className={openCount > 0 ? "badge alarm" : "badge ok"}>
          {openCount > 0 ? `未结 ${openCount} 项` : "无未结异常"}
        </span>
      </div>

      {abnormals.length === 0 ? (
        <p className="empty">暂无异常项。读数越限时自动生成，恢复时自动解除。</p>
      ) : (
        <div className="timeline">
          {abnormals.map((a) => {
            const dev = DEVICES.find((d) => d.id === a.deviceId);
            const m = METRIC_MAP[a.metric];
            const isOpen = a.status === "open";
            return (
              <article key={a.key} className={`tl-item ${isOpen ? "tl-open" : "tl-cleared"}`}>
                <span className={`tl-dot ${isOpen ? "dot-open" : "dot-cleared"}`} />
                <div className="tl-body">
                  <div className="tl-title">
                    <strong>{dev?.name ?? a.deviceId}</strong>
                    <span>{m.label}</span>
                    <span className="tl-dir">
                      {a.limit === "high" ? "超上限" : "低于下限"}
                    </span>
                    <span className={`tl-status ${isOpen ? "st-open" : "st-cleared"}`}>
                      {isOpen ? "未结" : "已解除"}
                    </span>
                  </div>
                  <p className="tl-detail">
                    越限读数 <b>{fmtValue(a.value)}</b> {m.unit}（限 {m.low}~{m.high}）
                    {isOpen
                      ? ` · 采样于 ${fmtDateTime(a.openedAt)}`
                      : ` · ${fmtDateTime(a.openedAt)} 越限，${fmtDateTime(
                          a.clearedAt!
                        )} 恢复至 ${fmtValue(a.clearedValue!)} ${m.unit}`}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
