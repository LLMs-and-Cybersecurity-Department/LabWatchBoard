import { AlertTriangle, Radio, Waves, X } from "lucide-react";

import type { TsunamiLevel } from "./tsunamiSimulation";

export type TsunamiAlertEntry = {
  id: string;
  name: string;
  level: Exclude<TsunamiLevel, 0>;
  timing: string;
  height: string;
  status: "forecast" | "imminent" | "arrived" | "observing" | "unknown";
};

type TsunamiAlertPanelProps = {
  mode: "LIVE" | "REPLAY" | "SIMULATION";
  source: string;
  title: string;
  place: string;
  originTime: string;
  magnitude: number | null;
  depthKm: number | null;
  level: TsunamiLevel;
  entries: TsunamiAlertEntry[];
  disclaimer?: string;
  onClose: () => void;
};

const LEVEL_LABELS: Record<Exclude<TsunamiLevel, 0>, string> = {
  3: "大海啸警报",
  2: "海啸警报",
  1: "海啸注意报",
};

function localDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "时间待确认";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed);
}
export function TsunamiAlertPanel(props: TsunamiAlertPanelProps) {
  const groups = ([3, 2, 1] as const).map((level) => ({
    level,
    entries: props.entries.filter((entry) => entry.level === level),
  })).filter((group) => group.entries.length);
  return <aside className={`tsunami-alert-panel level-${props.level}`} role="alert" aria-live="assertive">
    <header>
      <div><AlertTriangle size={19} /><strong>{props.title}</strong></div>
      <span>{props.source} · {props.mode}</span>
      <button aria-label="暂时关闭海啸警报面板" onClick={props.onClose}><X size={17} /></button>
    </header>
    <section className="tsunami-alert-event">
      <small>{localDateTime(props.originTime)} 左右</small>
      <h3>{props.place}</h3>
      <div><span>震级 <strong>{props.magnitude === null ? "--" : props.magnitude.toFixed(1)}</strong></span><span>深度 <strong>{props.depthKm === null ? "--" : `${Math.round(props.depthKm)}km`}</strong></span></div>
    </section>
    <section className="tsunami-alert-areas">
      <div className="tsunami-alert-rail"><Waves size={21} /></div>
      <div className="tsunami-alert-groups">
        {groups.map((group) => <section key={group.level} className={`tsunami-alert-group level-${group.level}`}>
          <h4>{LEVEL_LABELS[group.level]}</h4>
          {group.entries.map((entry) => <article key={entry.id} className={entry.status}>
            <strong>{entry.name}</strong>
            <span><small>{entry.timing}</small><b>{entry.height}</b>{(entry.status === "imminent" || entry.status === "arrived") && <i>≋</i>}</span>
          </article>)}
        </section>)}
        {!groups.length && <div className="tsunami-alert-empty"><Radio size={17} /><span>警报有效，正在等待分区与观测报文</span></div>}
      </div>
    </section>
    {props.disclaimer && <footer>{props.disclaimer}</footer>}
  </aside>;
}
