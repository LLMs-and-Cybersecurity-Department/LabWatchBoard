import { AlertTriangle, Loader2, Pause, Play, RefreshCw, RotateCcw, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import {
  FDSN_PROVIDER_COLORS,
  fetchFdsnWaveform,
  type FdsnWaveformSnapshot,
  type GlobalSeismicStation,
} from "./fdsn";

const VIEW_WINDOW_MS = 60_000;
const TRACE_COLORS = ["#38bdf8", "#f59e0b", "#22c55e"];

function compactTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function FdsnWaveformPanel({ station }: { station: GlobalSeismicStation }) {
  const providerKey = station.providers.join(",");
  const [minutes, setMinutes] = useState(5);
  const [snapshot, setSnapshot] = useState<FdsnWaveformSnapshot | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const lastTickRef = useRef(0);

  const load = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    setLoadingProgress(1);
    setPlaying(false);
    void fetchFdsnWaveform(station, minutes, controller.signal, setLoadingProgress)
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
  }, [minutes, providerKey, reloadKey, station.id, station.network, station.stationCode]);

  const bounds = useMemo(() => snapshot ? {
    start: Math.min(...snapshot.traces.map((trace) => trace.startTime)),
    end: Math.max(...snapshot.traces.map((trace) => trace.endTime)),
  } : null, [snapshot]);

  useEffect(() => {
    if (!playing || !bounds) return;
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
  }, [bounds, playing, speed]);

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
    <section className="fdsn-waveform-panel" aria-live="polite">
      <header>
        <div><Waves size={14} /><span><strong>原始地震仪波形</strong><small>{station.network} {station.stationCode} · {snapshot?.providerLabel ?? station.providers.join(" / ")}</small></span></div>
        <div className="fdsn-waveform-actions">
          <select aria-label="波形快照时长" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} disabled={loadingProgress > 0 && loadingProgress < 100}>
            <option value={5}>5 分钟</option><option value={10}>10 分钟</option><option value={20}>20 分钟</option>
          </select>
          <button title="刷新波形快照" aria-label="刷新波形快照" onClick={load} disabled={loadingProgress > 0 && loadingProgress < 100}><RefreshCw size={13} /></button>
        </div>
      </header>

      {loadingProgress > 0 && loadingProgress < 100 ? <div className="fdsn-waveform-loading">
        <span><Loader2 className="spin" size={15} />正在读取并解压 miniSEED <b>{loadingProgress}%</b></span>
        <progress max="100" value={loadingProgress} />
      </div> : error ? <div className="fdsn-waveform-error"><AlertTriangle size={16} /><span>{error}</span><button onClick={load}>重试</button></div> : snapshot && bounds ? <>
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
        <footer><span style={{ color: providerColor }}>{snapshot.providerLabel}</span><span>{snapshot.channels.join(" / ")}</span><span>{snapshot.traces.reduce((sum, trace) => sum + trace.sampleCount, 0).toLocaleString("zh-CN")} 样本</span><span>{(snapshot.byteLength / 1024).toFixed(0)} KB</span></footer>
      </> : <div className="fdsn-waveform-loading"><span><Loader2 className="spin" size={15} />正在建立波形视图</span></div>}
    </section>
  );
}
