import { deviceById, metricById, rangeText, violationOf } from "../domain";
import {
  deviceStatusText,
  latestText,
  metricStatusText,
  selectDeviceViews,
  trendSeries,
} from "../selectors";
import type { State } from "../types";
import { Sparkline } from "./Sparkline";

interface Props {
  state: State;
  now: number;
}

export function Dashboard({ state, now }: Props) {
  const views = selectDeviceViews(state.readings, state.ttlMinutes, now);

  return (
    <section className="panel" id="dashboard">
      <div className="heading">
        <div>
          <p>机舱参数看板</p>
          <h2>设备实时状态</h2>
        </div>
        <p className="rule-note">
          仅采信每台设备最近一次、{state.ttlMinutes} 分钟内未过期的读数；过期即退出趋势并重算状态
        </p>
      </div>

      <div className="device-grid">
        {views.map((dv) => (
          <article key={dv.deviceId} className={`device-card status-${dv.status}`}>
            <header>
              <div>
                <h3>{dv.name}</h3>
                <span className="kind">{dv.deviceId === "ME" ? "主机" : "发电机"}</span>
              </div>
              <span className={`badge badge-${dv.status}`}>{deviceStatusText(dv.status)}</span>
            </header>

            <div className="metric-list">
              {dv.metrics.map((mv) => {
                const def = deviceById(dv.deviceId);
                const mDef = metricById(mv.metricId);
                const series = trendSeries(
                  state.readings,
                  dv.deviceId,
                  mv.metricId,
                  state.ttlMinutes,
                  now
                );
                return (
                  <div key={mv.metricId} className={`metric-row status-${mv.status}`}>
                    <div className="metric-head">
                      <span className="metric-name">{mDef.name}</span>
                      <span className={`badge badge-${mv.status}`}>
                        {metricStatusText(mv.status)}
                      </span>
                    </div>
                    <div className="metric-value-line">
                      <strong className="metric-value">
                        {latestText(mv)}
                        <em>{mDef.unit}</em>
                      </strong>
                      <span className="metric-meta">
                        {mv.ageMin === null
                          ? "本时段无读数"
                          : `采于 ${Math.floor(mv.ageMin)} 分钟前`}
                      </span>
                    </div>
                    {mv.latest.some((r) => r.pendingVerify) && (
                      <p className="pending-note">
                        同时刻存在不同抄录值（
                        {mv.latest
                          .map((r) => `${r.value} ${mDef.unit}@${r.sampledBy === "engine" ? "机舱" : "驾驶台"}`)
                          .join("；")}
                        ），已挂待核
                      </p>
                    )}
                    <Sparkline deviceId={dv.deviceId} metricId={mv.metricId} data={series} />
                    <p className="range-note">
                      正常区间 {rangeText(dv.deviceId, mv.metricId)} {mDef.unit}
                      {mv.latest.some(
                        (r) => violationOf(def.id, mv.metricId, r.value) !== null
                      ) && <b className="out-note">· 越限已开异常单</b>}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
