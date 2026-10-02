import "./styles.css";
import { useStore } from "./store";
import SyncBar from "./components/SyncBar";
import ShiftBar from "./components/ShiftBar";
import ReadingForm from "./components/ReadingForm";
import Dashboard from "./components/Dashboard";
import ConflictPanel from "./components/ConflictPanel";
import TrendPanel from "./components/TrendPanel";
import AbnormalPanel from "./components/AbnormalPanel";
import SummaryPanel from "./components/SummaryPanel";
import HistoryPanel from "./components/HistoryPanel";
import SettingsPanel from "./components/SettingsPanel";

export default function App() {
  const store = useStore();

  return (
    <main className="app">
      <section className="hero">
        <p>船舶轮机值班记录 · 能交接的工作台</p>
        <h1>轮机值班台</h1>
        <span>
          每班抄录主机与发电机的转速、滑油压力、冷却水温，读数带采样时刻；
          看板只信每台设备最近一次没过期的值，过期读数退出趋势并重算设备状态，
          异常项随越限读数生成或解除。交接班把本班读数与未结异常封成摘要，
          封后补录只留差异、不改摘要；机舱与驾驶台断网各记一份，回网按设备与
          时刻合并，同刻异值都保留并标待核。
        </span>
      </section>

      <SyncBar store={store} />
      <ShiftBar store={store} />

      <div className="workspace">
        <aside className="stack">
          <ReadingForm store={store} />
          <SummaryPanel store={store} />
        </aside>

        <section className="stack">
          <Dashboard store={store} />
          <ConflictPanel store={store} />
          <TrendPanel store={store} />
          <AbnormalPanel store={store} />
          <HistoryPanel store={store} />
          <SettingsPanel store={store} />
        </section>
      </div>

      <footer className="foot">
        数据保存在本机浏览器（localStorage），后续可扩展为船队统一管理。
      </footer>
    </main>
  );
}
