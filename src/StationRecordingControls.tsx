import { Download, Pause, Play, Square } from "lucide-react";
import { memo } from "react";

import type { StationDisplayMode, StationRecordingState } from "./stationRecording";

type StationRecordingControlsProps = {
  mode: StationDisplayMode;
  recordingState: StationRecordingState;
  stationSampleCount: number;
  waveformSampleCount: number;
  rawWaveformAvailable: boolean;
  disabled?: boolean;
  onModeChange: (mode: StationDisplayMode) => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onExport: () => void;
};

function recordingStatusLabel(state: StationRecordingState, total: number) {
  if (state === "recording") return `记录中 · ${total.toLocaleString("zh-CN")}`;
  if (state === "paused") return `已暂停 · ${total.toLocaleString("zh-CN")}`;
  if (state === "stopped") return `已停止 · ${total.toLocaleString("zh-CN")}`;
  return "待记录";
}

export const StationRecordingControls = memo(function StationRecordingControls({
  mode,
  recordingState,
  stationSampleCount,
  waveformSampleCount,
  rawWaveformAvailable,
  disabled = false,
  onModeChange,
  onStart,
  onPause,
  onStop,
  onExport,
}: StationRecordingControlsProps) {
  const total = stationSampleCount + waveformSampleCount;
  return <div className="station-recorder-controls">
    <label>
      <span>显示</span>
      <select aria-label="测站显示模式" value={mode} onChange={(event) => onModeChange(event.target.value as StationDisplayMode)}>
        <option value="auto">自动选择</option>
        <option value="station">测站滚动</option>
        <option value="waveform">原始波形{rawWaveformAvailable ? "" : "（无源）"}</option>
      </select>
    </label>
    <div className="station-recorder-transport" role="group" aria-label="测站记录控制">
      <button className={recordingState === "recording" ? "active" : ""} title={recordingState === "paused" ? "继续记录" : "开始记录"} aria-label={recordingState === "paused" ? "继续记录" : "开始记录"} disabled={disabled || recordingState === "recording"} onClick={onStart}><Play size={12} /></button>
      <button title="暂停记录" aria-label="暂停记录" disabled={recordingState !== "recording"} onClick={onPause}><Pause size={12} /></button>
      <button title="停止记录" aria-label="停止记录" disabled={recordingState === "idle" || recordingState === "stopped"} onClick={onStop}><Square size={11} /></button>
      <button title="导出记录 CSV" aria-label="导出记录 CSV" disabled={!total} onClick={onExport}><Download size={12} /></button>
    </div>
    <output className={recordingState} aria-live="polite">{recordingStatusLabel(recordingState, total)}</output>
  </div>;
});
