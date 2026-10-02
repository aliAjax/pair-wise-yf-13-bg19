import "./styles.css";
import { AnomalyTimeline } from "./components/AnomalyTimeline";
import { Dashboard } from "./components/Dashboard";
import { EntryForm } from "./components/EntryForm";
import { HistoryView } from "./components/HistoryView";
import { ShiftHandover } from "./components/ShiftHandover";
import { SyncPanel } from "./components/SyncPanel";
import { TopBar } from "./components/TopBar";
import { useNow, useStore } from "./store";

export default function App() {
  const [state, dispatch] = useStore();
  const now = useNow(state.clockOffsetMs);

  return (
    <div className="app">
      <TopBar state={state} now={now} dispatch={dispatch} />

      <Dashboard state={state} now={now} />

      <div className="two-col">
        <EntryForm
          now={now}
          station={state.activeStation}
          online={state.online}
          onSubmit={(readings) =>
            dispatch({
              type: "add",
              station: state.activeStation,
              online: state.online,
              now,
              readings,
            })
          }
        />
        <SyncPanel state={state} dispatch={dispatch} />
      </div>

      <div className="two-col">
        <AnomalyTimeline state={state} now={now} />
        <ShiftHandover state={state} now={now} dispatch={dispatch} />
      </div>

      <HistoryView state={state} now={now} />

      <footer className="foot">
        数据保存在本浏览器（localStorage）。规则：采样时刻驱动看板与过期；异常随越限读数生成、随回区读数解除；交接封版不可改，封后补录只留差异；断网两端各记一份，回网按设备+时刻合并，同时刻异值双留待核。
      </footer>
    </div>
  );
}
