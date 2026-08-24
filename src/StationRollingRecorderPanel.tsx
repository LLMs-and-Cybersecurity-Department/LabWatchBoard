import { Activity, Waves } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { jmaShindoColor, mmiIntensityColor, palertPgaColor, palertPgvColor, type StationSample } from "./seismic";
import { StationRecordingControls } from "./StationRecordingControls";
import {
  buildStationRecordingCsv,
  downloadStationRecordingCsv,
  stationRecordingFilename,
  type RecordedStationSample,
  type StationDisplayMode,
  type StationRecordingState,
} from "./stationRecording";
import { usePersistentState } from "./usePersistentState";

type StationValueScale = "shindo" | "mmi" | "palert-pga" | "palert-pgv";

type StationRollingRecorderPanelProps = {
  station: { id: string; network: string; stationCode: string } | null;
  history: readonly StationSample[];
  sampleMode: string;
  selectionAutomatic: boolean;
  emptyText: string;
  valueScale: StationValueScale;
  valueDigits: number;
  valueUnit: string;
  yDomain: [number, number];
};

const MAX_STATION_RECORDING_SAMPLES = 86_400;

function sampleColor(scale: StationValueScale, value: number) {
  if (scale === "palert-pga") return palertPgaColor(value);
  if (scale === "palert-pgv") return palertPgvColor(value);
  if (scale === "mmi") return mmiIntensityColor(value);
  return jmaShindoColor(value);
}

function compactTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

export const StationRollingRecorderPanel = memo(function StationRollingRecorderPanel({
  station,
  history,
  sampleMode,
  selectionAutomatic,
  emptyText,
  valueScale,
  valueDigits,
  valueUnit,
  yDomain,
}: StationRollingRecorderPanelProps) {
  const [mode, setMode] = usePersistentState<StationDisplayMode>("seismic-station-display-mode", "auto");
  const [recordingState, setRecordingState] = useState<StationRecordingState>("idle");
  const [stationSampleCount, setStationSampleCount] = useState(0);
  const recordedSamplesRef = useRef<RecordedStationSample[]>([]);
  const lastRecordedTimestampRef = useRef(Number.NEGATIVE_INFINITY);
  const resolvedMode = mode === "auto" ? "station" : mode;

  useEffect(() => {
    setRecordingState("idle");
    setStationSampleCount(0);
    recordedSamplesRef.current = [];
    lastRecordedTimestampRef.current = Number.NEGATIVE_INFINITY;
  }, [station?.id]);

  useEffect(() => {
    if (recordingState !== "recording" || !station || !history.length) return;
    const additions = history.filter((sample) => sample.timestamp > lastRecordedTimestampRef.current);
    if (!additions.length) return;
    const remaining = Math.max(0, MAX_STATION_RECORDING_SAMPLES - recordedSamplesRef.current.length);
    if (!remaining) {
      setRecordingState("stopped");
      return;
    }
    const accepted = additions.slice(0, remaining).map((sample) => ({
      ...sample,
      stationId: station.id,
      network: station.network,
      stationCode: station.stationCode,
      unit: valueUnit,
    }));
    recordedSamplesRef.current.push(...accepted);
    lastRecordedTimestampRef.current = accepted[accepted.length - 1]?.timestamp ?? lastRecordedTimestampRef.current;
    setStationSampleCount(recordedSamplesRef.current.length);
    if (accepted.length < additions.length) setRecordingState("stopped");
  }, [history, recordingState, station, valueUnit]);

  const startRecording = useCallback(() => {
    if (!station) return;
    if (recordingState !== "paused") {
      recordedSamplesRef.current = [];
      const latestTimestamp = history[history.length - 1]?.timestamp;
      lastRecordedTimestampRef.current = latestTimestamp === undefined ? Number.NEGATIVE_INFINITY : latestTimestamp - 0.001;
      setStationSampleCount(0);
    }
    setRecordingState("recording");
  }, [history, recordingState, station]);

  const exportRecording = useCallback(() => {
    if (!station || !recordedSamplesRef.current.length) return;
    const csv = buildStationRecordingCsv({ stationSamples: recordedSamplesRef.current, waveformSamples: [] });
    downloadStationRecordingCsv(stationRecordingFilename(station.network, station.stationCode), csv);
  }, [station]);

  return <section className="seismic-station-rolling-panel station-recorder-panel" aria-live="polite">
    <header><div><Activity size={14} /><span><strong>{resolvedMode === "waveform" ? "原始地震波形" : "测站滚动"}</strong><small>{station ? `${station.network} ${station.stationCode}` : "未选择测站"}</small></span></div><b className={selectionAutomatic ? "auto" : ""}>{selectionAutomatic ? "自动选站" : sampleMode}</b></header>
    <StationRecordingControls
      mode={mode}
      recordingState={recordingState}
      stationSampleCount={stationSampleCount}
      waveformSampleCount={0}
      rawWaveformAvailable={false}
      disabled={!station}
      onModeChange={setMode}
      onStart={startRecording}
      onPause={() => setRecordingState("paused")}
      onStop={() => setRecordingState("stopped")}
      onExport={exportRecording}
    />
    {resolvedMode === "waveform" ? <div className="seismic-rolling-empty station-recorder-unavailable"><Waves size={20} /><span>所选测站没有可读取的 FDSN miniSEED 原始波形；可切换到测站滚动，或在地图选择粉色 FDSN 波形站。</span></div> : <div className="seismic-station-rolling-content">
      <div className="seismic-station-rolling-chart">{history.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={history}><CartesianGrid stroke="#2b3539" vertical={false} /><XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} hide /><YAxis domain={yDomain} hide /><Tooltip labelFormatter={(value) => compactTime(Number(value))} contentStyle={{ background: "#111719", border: "1px solid #364247", borderRadius: 4 }} /><Line type="stepAfter" dataKey="value" name="强度" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer> : <div className="seismic-rolling-empty"><Waves size={20} /><span>{emptyText}</span></div>}</div>
      <div className="seismic-station-rolling-values">{history.slice(-4).reverse().map((sample) => <div key={sample.timestamp}><time>{compactTime(sample.timestamp)}</time><span>{sample.label}</span><strong style={{ color: sampleColor(valueScale, sample.value) }}>{sample.value.toFixed(valueDigits)}</strong></div>)}</div>
    </div>}
  </section>;
});
