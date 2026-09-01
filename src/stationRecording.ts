import type { StationSample } from "./seismic";

export type StationDisplayMode = "auto" | "station" | "waveform";
export type StationRecordingState = "idle" | "recording" | "paused" | "stopped";

export type RecordedStationSample = StationSample & {
  stationId: string;
  network: string;
  stationCode: string;
  unit: string;
};

export type RecordedWaveformSample = {
  timestamp: number;
  stationId: string;
  network: string;
  stationCode: string;
  channel: string;
  sampleRate: number;
  value: number;
  unit: string;
};

type StationRecordingCsvInput = {
  stationSamples: readonly RecordedStationSample[];
  waveformSamples: readonly RecordedWaveformSample[];
};

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
}

function isoTimestamp(timestamp: number) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

export function buildStationRecordingCsv({ stationSamples, waveformSamples }: StationRecordingCsvInput) {
  const rows: Array<Array<string | number>> = [[
    "record_type",
    "timestamp",
    "timestamp_ms",
    "station_id",
    "network",
    "station_code",
    "channel",
    "sample_rate_hz",
    "value",
    "unit",
    "label",
  ]];

  for (const sample of stationSamples) {
    rows.push([
      "station_scroll",
      isoTimestamp(sample.timestamp),
      sample.timestamp,
      sample.stationId,
      sample.network,
      sample.stationCode,
      "",
      "",
      sample.value,
      sample.unit,
      sample.label,
    ]);
  }

  for (const sample of waveformSamples) {
    rows.push([
      "raw_waveform",
      isoTimestamp(sample.timestamp),
      sample.timestamp,
      sample.stationId,
      sample.network,
      sample.stationCode,
      sample.channel,
      sample.sampleRate,
      sample.value,
      sample.unit,
      "miniSEED decoded sample",
    ]);
  }

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function stationRecordingFilename(network: string, stationCode: string, timestamp = Date.now()) {
  const safeStation = `${network}-${stationCode}`.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "station";
  return `seismic-${safeStation}-${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}.csv`;
}

export function downloadStationRecordingCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
