import { AlertTriangle, Crosshair, MapPin, Play, Waves, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { TsunamiCountry, TsunamiScenario, TsunamiSource } from "./tsunamiSimulation";

export type TsunamiPickedLocation = {
  sourceId: string;
  latitude: number;
  longitude: number;
  nonce: number;
};

export type TsunamiMapPickTarget = {
  sourceId: string;
  sourceOrder: number;
};

type TsunamiSimulationDialogProps = {
  open: boolean;
  pickedLocation: TsunamiPickedLocation | null;
  onClose: () => void;
  onRequestMapPick: (sourceId: string, sourceOrder: number) => void;
  onRequestMapPickSequence: (targets: TsunamiMapPickTarget[]) => void;
  onStart: (scenario: TsunamiScenario) => void;
};

type SourceDraft = TsunamiSource;
type ScenarioDraft = {
  place: string;
  magnitude: number;
  depthKm: number;
  originLocal: string;
  reportDelaySeconds: number;
  conservativeBias: number;
  countries: TsunamiCountry[];
  multiSource: boolean;
  sourceCount: number;
  sources: SourceDraft[];
};

type PresetDraft = Pick<ScenarioDraft, "place" | "magnitude" | "depthKm" | "reportDelaySeconds" | "conservativeBias" | "countries"> & {
  latitude: number;
  longitude: number;
};

const COUNTRY_LABELS: Array<{ id: TsunamiCountry; label: string }> = [
  { id: "JP", label: "日本" },
  { id: "CN", label: "中国大陆" },
  { id: "TW", label: "台湾" },
  { id: "KR", label: "韩国" },
];

const PRESETS: Array<{ id: string; label: string; draft: PresetDraft }> = [
  { id: "nankai", label: "南海海槽 M8.5", draft: { place: "四国冲 / 南海海槽", latitude: 32.8, longitude: 135.2, magnitude: 8.5, depthKm: 15, reportDelaySeconds: 180, conservativeBias: 62, countries: ["JP", "CN", "TW", "KR"] } },
  { id: "tohoku", label: "日本海沟 M9.0", draft: { place: "三陆冲 / 日本海沟", latitude: 38.1, longitude: 143.2, magnitude: 9, depthKm: 24, reportDelaySeconds: 180, conservativeBias: 68, countries: ["JP", "CN", "TW", "KR"] } },
  { id: "taiwan", label: "台湾东部 M8.0", draft: { place: "台湾东部海域", latitude: 23.6, longitude: 122.3, magnitude: 8, depthKm: 18, reportDelaySeconds: 120, conservativeBias: 58, countries: ["JP", "CN", "TW", "KR"] } },
  { id: "ryukyu", label: "琉球海沟 M8.2", draft: { place: "琉球海沟", latitude: 26.4, longitude: 129.4, magnitude: 8.2, depthKm: 20, reportDelaySeconds: 150, conservativeBias: 60, countries: ["JP", "CN", "TW", "KR"] } },
  { id: "japan-sea", label: "日本海 M7.8", draft: { place: "日本海东缘", latitude: 38.2, longitude: 137.7, magnitude: 7.8, depthKm: 12, reportDelaySeconds: 120, conservativeBias: 55, countries: ["JP", "CN", "KR"] } },
];

function currentLocalInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}

function sourceDraft(order: number, latitude: number, longitude: number, place: string): SourceDraft {
  return {
    id: `source-${order}-${Date.now().toString(36)}`,
    name: order === 1 ? place : `${place} · 震源 ${order}`,
    latitude,
    longitude,
    reportCount: 3,
    reportIntervalSeconds: 10,
  };
}

function draftFromPreset(preset: PresetDraft, originLocal = currentLocalInputValue()): ScenarioDraft {
  return {
    ...preset,
    originLocal,
    multiSource: false,
    sourceCount: 1,
    sources: [sourceDraft(1, preset.latitude, preset.longitude, preset.place)],
  };
}

function initialDraft() {
  return draftFromPreset(PRESETS[0].draft);
}

function resizeSources(current: ScenarioDraft, count: number): ScenarioDraft {
  const sourceCount = Math.max(1, Math.min(10, Math.round(count || 1)));
  const next = current.sources.slice(0, sourceCount);
  while (next.length < sourceCount) {
    const previous = next[next.length - 1] ?? sourceDraft(1, 32.8, 135.2, current.place);
    next.push(sourceDraft(next.length + 1, previous.latitude + 0.18, previous.longitude + 0.18, current.place));
  }
  return { ...current, sourceCount, sources: next };
}

export function TsunamiSimulationDialog({ open, pickedLocation, onClose, onRequestMapPick, onRequestMapPickSequence, onStart }: TsunamiSimulationDialogProps) {
  const [draft, setDraft] = useState<ScenarioDraft>(initialDraft);
  const [presetId, setPresetId] = useState(PRESETS[0].id);

  useEffect(() => {
    if (!pickedLocation) return;
    setDraft((current) => ({
      ...current,
      sources: current.sources.map((source) => source.id === pickedLocation.sourceId
        ? { ...source, latitude: pickedLocation.latitude, longitude: pickedLocation.longitude }
        : source),
    }));
  }, [pickedLocation]);

  const activeSources = draft.sources.slice(0, draft.multiSource ? draft.sourceCount : 1);
  const validity = activeSources.length > 0
    && activeSources.every((source) => Number.isFinite(source.latitude)
      && Number.isFinite(source.longitude)
      && source.latitude >= -90 && source.latitude <= 90
      && source.longitude >= -180 && source.longitude <= 180
      && source.reportCount >= 1 && source.reportCount <= 99
      && source.reportIntervalSeconds >= 1 && source.reportIntervalSeconds <= 600)
    && draft.magnitude >= 5 && draft.magnitude <= 10
    && draft.depthKm >= 0 && draft.depthKm <= 700
    && draft.countries.length > 0
    && Number.isFinite(Date.parse(draft.originLocal));

  if (!open) return null;

  const updateNumber = (key: "magnitude" | "depthKm" | "reportDelaySeconds" | "conservativeBias", value: string) => {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  };
  const updateSource = (sourceId: string, changes: Partial<SourceDraft>) => {
    setPresetId("");
    setDraft((current) => ({ ...current, sources: current.sources.map((source) => source.id === sourceId ? { ...source, ...changes } : source) }));
  };

  return <div className="tsunami-simulator-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="tsunami-simulator-dialog" role="dialog" aria-modal="true" aria-label="地震与海啸模拟">
      <header>
        <div><Waves size={22} /><span><strong>地震 / 海啸模拟</strong><small>KESHI-LITE-1 · 单震源 / 多震源顺序报文</small></span></div>
        <button aria-label="关闭地震与海啸模拟" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="tsunami-simulator-warning"><AlertTriangle size={17} /><span><strong>SIMULATION / 非官方</strong> 仅用于演示不同震级、深度与破裂点的视觉效果，不用于避难或风险决策。</span></div>
      <div className="tsunami-simulator-presets">
        {PRESETS.map((preset) => <button key={preset.id} className={presetId === preset.id ? "active" : ""} onClick={() => {
          setPresetId(preset.id);
          setDraft((current) => draftFromPreset(preset.draft, current.originLocal));
        }}>{preset.label}</button>)}
      </div>
      <div className="tsunami-simulator-form">
        <label className="wide"><span>事件名称</span><input value={draft.place} onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value }))} /></label>
        <label><span>震级 M</span><input type="number" min="5" max="10" step="0.1" value={draft.magnitude} onChange={(event) => updateNumber("magnitude", event.target.value)} /></label>
        <label><span>深度 km</span><input type="number" min="0" max="700" step="1" value={draft.depthKm} onChange={(event) => updateNumber("depthKm", event.target.value)} /></label>
        <label className="wide"><span>模拟发震时间</span><input type="datetime-local" step="1" value={draft.originLocal} onChange={(event) => setDraft((current) => ({ ...current, originLocal: event.target.value }))} /></label>
        <label><span>海啸首报延迟 s</span><input type="number" min="0" max="600" step="10" value={draft.reportDelaySeconds} onChange={(event) => updateNumber("reportDelaySeconds", event.target.value)} /></label>
        <label><span>保守系数 {Math.round(draft.conservativeBias)}%</span><input type="range" min="0" max="100" step="1" value={draft.conservativeBias} onChange={(event) => updateNumber("conservativeBias", event.target.value)} /></label>
      </div>
      <section className="tsunami-simulator-source-config" aria-label="模拟震源配置">
        <header>
          <label><input type="checkbox" checked={draft.multiSource} onChange={(event) => setDraft((current) => resizeSources({ ...current, multiSource: event.target.checked }, event.target.checked ? Math.max(2, current.sourceCount) : 1))} /><span>多震源</span></label>
          {draft.multiSource && <label><span>震源数</span><input aria-label="多震源数量" type="number" min="1" max="10" step="1" value={draft.sourceCount} onChange={(event) => setDraft((current) => resizeSources(current, Number(event.target.value)))} /></label>}
          {draft.multiSource && <button type="button" className="sequence-pick" onClick={() => onRequestMapPickSequence(activeSources.map((source, index) => ({ sourceId: source.id, sourceOrder: index + 1 })))}><Crosshair size={13} />依次拾取 {activeSources.length} 个震源</button>}
          <small>按列表顺序开始下一震源；上一震源的报数 × 间隔决定下一个起始时刻。</small>
        </header>
        <div className="tsunami-simulator-source-list">
          {activeSources.map((source, index) => <article key={source.id}>
            <div className="tsunami-source-heading"><strong><i>{index + 1}</i>{source.name || `震源 ${index + 1}`}</strong><button type="button" onClick={() => onRequestMapPick(source.id, index + 1)}><Crosshair size={13} />地图拾取</button></div>
            <label className="name"><span>震源名称</span><input value={source.name} onChange={(event) => updateSource(source.id, { name: event.target.value })} /></label>
            <label><span>纬度</span><input aria-label={`震源 ${index + 1} 纬度`} type="number" step="0.0001" value={source.latitude} onChange={(event) => updateSource(source.id, { latitude: Number(event.target.value) })} /></label>
            <label><span>经度</span><input aria-label={`震源 ${index + 1} 经度`} type="number" step="0.0001" value={source.longitude} onChange={(event) => updateSource(source.id, { longitude: Number(event.target.value) })} /></label>
            <label><span>报数</span><input aria-label={`震源 ${index + 1} 报数`} type="number" min="1" max="99" step="1" value={source.reportCount} onChange={(event) => updateSource(source.id, { reportCount: Number(event.target.value) })} /></label>
            <label><span>每报间隔 s</span><input aria-label={`震源 ${index + 1} 每报间隔`} type="number" min="1" max="600" step="1" value={source.reportIntervalSeconds} onChange={(event) => updateSource(source.id, { reportIntervalSeconds: Number(event.target.value) })} /></label>
          </article>)}
        </div>
      </section>
      <fieldset className="tsunami-simulator-countries">
        <legend>参与估算与沿海上色</legend>
        {COUNTRY_LABELS.map((country) => <label key={country.id}><input type="checkbox" checked={draft.countries.includes(country.id)} onChange={(event) => setDraft((current) => ({ ...current, countries: event.target.checked ? [...new Set([...current.countries, country.id])] : current.countries.filter((item) => item !== country.id) }))} /><span>{country.label}</span></label>)}
      </fieldset>
      <footer>
        <div><MapPin size={15} /><span>地图拾取会暂时收起本窗口；点击一次后自动返回并写入 4 位小数坐标。</span></div>
        <button className="primary" disabled={!validity} onClick={() => {
          const sources = activeSources.map((source, index) => ({ ...source, id: `${Date.now().toString(36)}-${index + 1}` }));
          const primary = sources[0];
          const originTime = new Date(draft.originLocal).toISOString();
          onStart({
            id: `${Date.now().toString(36)}-${Math.round(primary.latitude * 100)}-${Math.round(primary.longitude * 100)}`,
            place: draft.place.trim() || primary.name || "模拟震源",
            latitude: primary.latitude,
            longitude: primary.longitude,
            magnitude: draft.magnitude,
            depthKm: draft.depthKm,
            originTime,
            reportDelaySeconds: draft.reportDelaySeconds,
            conservativeBias: draft.conservativeBias,
            countries: draft.countries,
            multiSource: draft.multiSource,
            sources,
          });
        }}><Play size={16} />开始模拟</button>
      </footer>
    </section>
  </div>;
}
