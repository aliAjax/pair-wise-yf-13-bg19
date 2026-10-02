// 机舱参数看板：每台设备只信最近一条没过期的读数，过期即重算为“无有效读数”

import { DEVICES, METRICS } from "../config";
import type { Store } from "../store";
import { deviceStates, visibleReadings } from "../store";
import { fmtAge, fmtValue } from "../format";

const STATUS_TEXT: Record<string, string> = {
  normal: "正常",
  alarm: "越限",
  stale: "无有效读数",
};

export default function Dashboard({ store }: { store: Store }) {
  const { state, now } = store;
  const readings = visibleReadings(state).filter((r) => !r.conflict);
  const states = deviceStates(
    readings,
    DEVICES.map((d) => d.id),
    now,
    state.validityMin,
    state.limits
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">实时看板</p>
          <h2>设备状态</h2>
        </div>
        <span className="badge">读数有效期 {state.validityMin} 分钟</span>
      </div>

      <div className="dash-grid">
        {states.map((ds) => {
          const dev = DEVICES.find((d) => d.id === ds.deviceId)!;
          return (
            <article key={ds.deviceId} className={`dash-card status-${ds.overall}`}>
              <header className="dash-head">
                <h3>{dev.name}</h3>
                <span className={`status-pill status-${ds.overall}`}>
                  {STATUS_TEXT[ds.overall]}
                </span>
              </header>
              <ul className="dash-metrics">
                {METRICS.map((m) => {
                  const ms = ds.metrics[m.key];
                  return (
                    <li key={m.key} className={`dash-metric status-${ms.status}`}>
                      <div className="dm-label">
                        {m.label}
                        <span className="dm-limit">
                          限 {m.low}~{m.high}
                        </span>
                      </div>
                      <div className="dm-value">
                        {ms.reading ? (
                          <>
                            <strong>{fmtValue(ms.reading.value)}</strong>
                            <em>{m.unit}</em>
                          </>
                        ) : (
                          <strong className="dm-na">—</strong>
                        )}
                      </div>
                      <div className="dm-foot">
                        {ms.reading ? (
                          <>
                            <span className="dm-age">
                              {fmtAge(ms.ageMin ?? 0)}
                            </span>
                            <span className={`dm-tag status-${ms.status}`}>
                              {STATUS_TEXT[ms.status]}
                            </span>
                          </>
                        ) : (
                          <span className="dm-age">读数已过期</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
