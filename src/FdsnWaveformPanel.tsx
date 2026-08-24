import { Activity, AlertTriangle, ChevronLeft, ChevronRight, Loader2, Pause, Play, RefreshCw, RotateCcw, Waves } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  FDSN_PROVIDER_COLORS,
  fetchFdsnWaveform,
  resolveFdsnWaveformAutoPlayCursor,
  type FdsnWaveformSnapshot,
  type GlobalSeismicStation,
} from "./fdsn";
import type { StationSample } from "./seismic";
import { StationRecordingControls } from "./StationRecordingControls";
import {
  buildStationRecordingCsv,
  downloadStationRecordingCsv,
  stationRecordingFilename,
  type RecordedStationSample,
  type RecordedWaveformSample,
  type StationDisplayMode,
  type StationRecordingState,
} from "./stationRecording";
import { usePersistentState } from "./usePersistentState";

const VIEW_WINDOW_MS = 60_000;
const RAW_CAPTURE_INTERVAL_MS = 30_000;
const MAX_STATION_RECORDING_SAMPLES = 86_400;
const MAX_RAW_RECORDING_SAMPLES = 600_000;
const TRACE_COLORS = ["#38bdf8", "#f59e0b", "#22c55e"];

function compactTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function withoutRawPoints(snapshot: FdsnWaveformSnapshot): FdsnWaveformSnapshot {
  return {
    ...snapshot,
    traces: snapshot.traces.map(({ rawPoints: _rawPoints, ...trace }) => trace),
  };
}

type FdsnWaveformPanelProps = {
  station: GlobalSeismicStation;
  eventTime?: string | null;
  verifiedIndex?: number;
  verifiedCount?: number;
  distanceKm?: number | null;
  autoPlayKey?: string | null;
  autoPlayLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  rollingHistory: readonly StationSample[];
  rollingSampleMode: string;
  rollingYDomain: [number, number];
  rollingValueDigits?: number;
  rollingValueUnit?: string;
  rollingValueColor: (value: number) => string;
  rollingEmptyText: string;
  selectionAutomatic?: boolean;
};

export const FdsnWaveformPanel = memo(function FdsnWaveformPanel({
  station,
  eventTime,
  verifiedIndex = -1,
  verifiedCount = 0,
  distanceKm = null,
  autoPlayKey = null,
  autoPlayLabel = "自动选站联动 · 已自动开始波形滚动",
  onPrevious,
  onNext,
  rollingHistory,
  rollingSampleMode,
  rollingYDomain,
  rollingValueDigits = 1,
  rollingValueUnit = "MMI",
  rollingValueColor,
  rollingEmptyText,
  selectionAutomatic = false,
}: FdsnWaveformPanelProps) {
  const providerKey = station.providers.join(",");
  const [mode, setMode] = usePersistentState<StationDisplayMode>("seismic-station-display-mode", "auto");
  const [minutes, setMinutes] = useState(5);
  const [snapshot, setSnapshot] = useState<FdsnWaveformSnapshot | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [recordingState, setRecordingState] = useState<StationRecordingState>("idle");
  const [stationSampleCount, setStationSampleCount] = useState(0);
  const [waveformSampleCount, setWaveformSampleCount] = useState(0);
  const [rawCaptureStatus, setRawCaptureStatus] = useState("原始样本待记录");
  const lastTickRef = useRef(0);
  const lastAutoPlayRef = useRef<{ key: string; snapshot: string } | null>(null);
  const stationSamplesRef = useRef<RecordedStationSample[]>([]);
  const waveformSamplesRef = useRef<RecordedWaveformSample[]>([]);
  const lastStationTimestampRef = useRef(Number.NEGATIVE_INFINITY);
  const lastWaveformTimestampRef = useRef(new Map<string, number>());
  const resolvedMode = mode === "auto" ? "waveform" : mode;

  const load = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    setRecordingState("idle");
    setStationSampleCount(0);
    setWaveformSampleCount(0);
    setRawCaptureStatus("原始样本待记录");
    stationSamplesRef.current = [];
    waveformSamplesRef.current = [];
    lastStationTimestampRef.current = Number.NEGATIVE_INFINITY;
    lastWaveformTimestampRef.current.clear();
  }, [station.id]);

  useEffect(() => {
    if (resolvedMode !== "waveform") return;
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    setLoadingProgress(1);
    setPlaying(false);
    void fetchFdsnWaveform(station, minutes, controller.signal, setLoadingProgress, eventTime)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSnapshot(next);
        const start = Math.min(...next.traces.map((trace) => trace.startTime));
        const end = Math.max(...next.traces.map((trace) => trace.endTime));
        setCursor(Math.min(end, start + VIEW_WINDOW_MS));
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoadingProgress(0);
      });
    return () => controller.abort();
  }, [eventTime, minutes, providerKey, reloadKey, resolvedMode, station.id, station.network, station.stationCode]);

  const appendRawSnapshot = useCallback((next: FdsnWaveformSnapshot) => {
    let remaining = MAX_RAW_RECORDING_SAMPLES - waveformSamplesRef.current.length;
    for (const trace of next.traces) {
      if (remaining <= 0) break;
      const previous = lastWaveformTimestampRef.current.get(trace.channel) ?? Number.NEGATIVE_INFINITY;
      let newest = previous;
      for (const point of trace.rawPoints ?? []) {
        if (point.timestamp <= previous) continue;
        waveformSamplesRef.current.push({
          timestamp: point.timestamp,
          stationId: station.id,
          network: station.network,
          stationCode: station.stationCode,
          channel: trace.channel,
          sampleRate: trace.sampleRate,
          value: point.value,
          unit: next.scaleUnits || "count",
        });
        newest = point.timestamp;
        remaining -= 1;
        if (remaining <= 0) break;
      }
      if (newest > previous) lastWaveformTimestampRef.current.set(trace.channel, newest);
    }
    setWaveformSampleCount(waveformSamplesRef.current.length);
    if (remaining <= 0) {
      setRawCaptureStatus("原始样本达到 600,000 条上限");
      setRecordingState("stopped");
    } else {
      setRawCaptureStatus(`已同步 ${waveformSamplesRef.current.length.toLocaleString("zh-CN")} 条原始样本`);
    }
  }, [station.id, station.network, station.stationCode]);

  useEffect(() => {
    if (recordingState !== "recording") return;
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const capture = async () => {
      controller?.abort();
      controller = new AbortController();
      setRawCaptureStatus("正在同步 miniSEED 原始样本");
      try {
        const next = await fetchFdsnWaveform(station, minutes, controller.signal, undefined, eventTime, true);
        if (!active || controller.signal.aborted) return;
        appendRawSnapshot(next);
        setSnapshot(withoutRawPoints(next));
      } catch (reason) {
        if (!active || reason instanceof DOMException && reason.name === "AbortError") return;
        setRawCaptureStatus(`原始样本同步失败：${reason instanceof Error ? reason.message : String(reason)}`);
      } finally {
        if (active && !eventTime) timer = window.setTimeout(capture, RAW_CAPTURE_INTERVAL_MS);
      }
    };
    void capture();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [appendRawSnapshot, eventTime, minutes, recordingState, station]);

  useEffect(() => {
    if (recordingState !== "recording" || !rollingHistory.length) return;
    const additions = rollingHistory.filter((sample) => sample.timestamp > lastStationTimestampRef.current);
    if (!additions.length) return;
    const remaining = Math.max(0, MAX_STATION_RECORDING_SAMPLES - stationSamplesRef.current.length);
    if (!remaining) {
      setRecordingState("stopped");
      return;
    }
    const accepted = additions.slice(0, remaining).map((sample) => ({
      ...sample,
      stationId: station.id,
      network: station.network,
      stationCode: station.stationCode,
      unit: rollingValueUnit,
    }));
    stationSamplesRef.current.push(...accepted);
    lastStationTimestampRef.current = accepted[accepted.length - 1]?.timestamp ?? lastStationTimestampRef.current;
    setStationSampleCount(stationSamplesRef.current.length);
    if (accepted.length < additions.length) setRecordingState("stopped");
  }, [recordingState, rollingHistory, rollingValueUnit, station.id, station.network, station.stationCode]);

  const startRecording = useCallback(() => {
    if (recordingState !== "paused") {
      stationSamplesRef.current = [];
      waveformSamplesRef.current = [];
      const latestTimestamp = rollingHistory[rollingHistory.length - 1]?.timestamp;
      lastStationTimestampRef.current = latestTimestamp === undefined ? Number.NEGATIVE_INFINITY : latestTimestamp - 0.001;
      lastWaveformTimestampRef.current.clear();
      setStationSampleCount(0);
      setWaveformSampleCount(0);
      setRawCaptureStatus("正在准备原始样本记录");
    }
    setRecordingState("recording");
  }, [recordingState, rollingHistory]);

  const exportRecording = useCallback(() => {
    if (!stationSamplesRef.current.length && !waveformSamplesRef.current.length) return;
    const csv = buildStationRecordingCsv({ stationSamples: stationSamplesRef.current, waveformSamples: waveformSamplesRef.current });
    downloadStationRecordingCsv(stationRecordingFilename(station.network, station.stationCode), csv);
  }, [station.network, station.stationCode]);

  const bounds = useMemo(() => snapshot ? {
    start: Math.min(...snapshot.traces.map((trace) => trace.startTime)),
    end: Math.max(...snapshot.traces.map((trace) => trace.endTime)),
  } : null, [snapshot]);

  useEffect(() => {
    if (resolvedMode !== "waveform" || !autoPlayKey || !snapshot || !bounds) return;
    const snapshotKey = `${station.id}:${snapshot.providerId}:${bounds.start}:${bounds.end}:${reloadKey}`;
    if (lastAutoPlayRef.current?.key === autoPlayKey && lastAutoPlayRef.current.snapshot === snapshotKey) return;
    lastAutoPlayRef.current = { key: autoPlayKey, snapshot: snapshotKey };
    setCursor(resolveFdsnWaveformAutoPlayCursor(bounds, eventTime, distanceKm));
    setPlaying(true);
  }, [autoPlayKey, bounds, distanceKm, eventTime, reloadKey, resolvedMode, snapshot, station.id]);

  useEffect(() => {
    if (resolvedMode !== "waveform" || !playing || !bounds) return;
    let frame = 0;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      setCursor((current) => {
        const next = Math.min(bounds.end, current + elapsed * speed);
        if (next >= bounds.end) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bounds, playing, resolvedMode, speed]);

  const togglePlayback = () => {
    if (!bounds) return;
    if (!playing && cursor >= bounds.end - 5) setCursor(Math.min(bounds.end, bounds.start + VIEW_WINDOW_MS));
    setPlaying((value) => !value);
  };

  const resetPlayback = () => {
    if (!bounds) return;
    setPlaying(false);
    setCursor(Math.min(bounds.end, bounds.start + VIEW_WINDOW_MS));
  };

  const providerColor = snapshot ? FDSN_PROVIDER_COLORS[snapshot.providerId] ?? "#38bdf8" : "#38bdf8";

  return (
    <section className={`fdsn-waveform-panel station-recorder-panel ${resolvedMode}`} aria-live="polite">
      <header>
        <div>{resolvedMode === "waveform" ? <Waves size={14} /> : <Activity size={14} />}<span><strong>{resolvedMode === "waveform" ? "原始地震仪波形" : "测站滚动"}</strong><small>{station.network} {station.stationCode}{resolvedMode === "waveform" ? ` · ${snapshot?.providerLabel ?? station.providers.join(" / ")}${distanceKm !== null ? ` · 震中距 ${distanceKm.toFixed(1)} km` : ""}` : ""}</small></span></div>
        {resolvedMode === "waveform" ? <div className="fdsn-waveform-actions">
          <div className="fdsn-waveform-station-nav" aria-label="有原始波形的测站切换">
            <button title="上一个有原始波形的测站" aria-label="上一个有原始波形的测站" onClick={onPrevious} disabled={!onPrevious || verifiedCount < 2}><ChevronLeft size={13} /></button>
            <span>{verifiedIndex >= 0 ? `${verifiedIndex + 1}/${verifiedCount}` : `0/${verifiedCount}`}</span>
            <button title="下一个有原始波形的测站" aria-label="下一个有原始波形的测站" onClick={onNext} disabled={!onNext || verifiedCount < 2}><ChevronRight size={13} /></button>
          </div>
          <select aria-label="波形快照时长" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} disabled={loadingProgress > 0 && loadingProgress < 100}>
            <option value={5}>5 分钟</option><option value={10}>10 分钟</option><option value={20}>20 分钟</option>
          </select>
          <button title="刷新波形快照" aria-label="刷新波形快照" onClick={load} disabled={loadingProgress > 0 && loadingProgress < 100}><RefreshCw size={13} /></button>
        </div> : <b className={selectionAutomatic ? "auto" : ""}>{selectionAutomatic ? "自动选站" : rollingSampleMode}</b>}
      </header>

      <StationRecordingControls
        mode={mode}
        recordingState={recordingState}
        stationSampleCount={stationSampleCount}
        waveformSampleCount={waveformSampleCount}
        rawWaveformAvailable
        onModeChange={setMode}
        onStart={startRecording}
        onPause={() => setRecordingState("paused")}
        onStop={() => setRecordingState("stopped")}
        onExport={exportRecording}
      />

      {resolvedMode === "station" ? <div className="seismic-station-rolling-content">
        <div className="seismic-station-rolling-chart">{rollingHistory.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={rollingHistory}><CartesianGrid stroke="#2b3539" vertical={false} /><XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} hide /><YAxis domain={rollingYDomain} hide /><Tooltip labelFormatter={(value) => compactTime(Number(value))} contentStyle={{ background: "#111719", border: "1px solid #364247", borderRadius: 4 }} /><Line type="stepAfter" dataKey="value" name="强度" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer> : <div className="seismic-rolling-empty"><Waves size={20} /><span>{rollingEmptyText}</span></div>}</div>
        <div className="seismic-station-rolling-values">{rollingHistory.slice(-4).reverse().map((sample) => <div key={sample.timestamp}><time>{compactTime(sample.timestamp)}</time><span>{sample.label}</span><strong style={{ color: rollingValueColor(sample.value) }}>{sample.value.toFixed(rollingValueDigits)}</strong></div>)}</div>
      </div> : loadingProgress > 0 && loadingProgress < 100 ? <div className="fdsn-waveform-loading">
        <span><Loader2 className="spin" size={15} />正在读取并解压 miniSEED <b>{loadingProgress}%</b></span>
        <progress max="100" value={loadingProgress} />
      </div> : error ? <div className="fdsn-waveform-error"><AlertTriangle size={16} /><span>{error}</span><button onClick={load}>重试</button></div> : snapshot && bounds ? <>
        {autoPlayKey && lastAutoPlayRef.current?.key === autoPlayKey && <div className="fdsn-waveform-autoplay">{autoPlayLabel}</div>}
        <div className="fdsn-waveform-transport">
          <button className="primary" title={playing ? "暂停波形" : "播放波形"} aria-label={playing ? "暂停波形" : "播放波形"} onClick={togglePlayback}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <button title="回到快照起点" aria-label="回到快照起点" onClick={resetPlayback}><RotateCcw size={13} /></button>
          <div className="fdsn-speed-control" aria-label="波形播放速度">{[1, 5, 10].map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}x</button>)}</div>
          <span>{compactTime(Math.max(bounds.start, cursor - VIEW_WINDOW_MS))} - {compactTime(cursor)}</span>
        </div>
        <div className="fdsn-waveform-traces">
          {snapshot.traces.map((trace, index) => {
            const data = trace.points.filter((point) => point.timestamp >= cursor - VIEW_WINDOW_MS && point.timestamp <= cursor);
            return <div className="fdsn-waveform-trace" key={trace.channel}>
              <b style={{ color: TRACE_COLORS[index] }}>{trace.channel}</b>
              <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}><CartesianGrid stroke="#263236" vertical={false} /><XAxis dataKey="timestamp" type="number" domain={[cursor - VIEW_WINDOW_MS, cursor]} hide /><YAxis domain={["auto", "auto"]} hide /><ReferenceLine y={0} stroke="#536267" strokeDasharray="2 3" /><Line type="linear" dataKey="value" stroke={TRACE_COLORS[index]} strokeWidth={1.1} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
            </div>;
          })}
        </div>
        <footer><span style={{ color: providerColor }}>{snapshot.providerLabel}</span><span>{recordingState === "idle" ? snapshot.channels.join(" / ") : rawCaptureStatus}</span><span>{snapshot.traces.reduce((sum, trace) => sum + trace.sampleCount, 0).toLocaleString("zh-CN")} 样本</span><span>{(snapshot.byteLength / 1024).toFixed(0)} KB</span></footer>
      </> : <div className="fdsn-waveform-loading"><span><Loader2 className="spin" size={15} />正在建立波形视图</span></div>}
    </section>
  );
});
