import { mmiIntensityColor } from "./seismic";

export type FdsnProviderId = "earthscope" | "geofon" | "orfeus" | "geonet" | "bmkg" | "cwa";

export type FdsnMapViewport = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  zoom: number;
};

export type GlobalSeismicStation = {
  id: string;
  network: string;
  stationCode: string;
  stationName: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  startTime: string | null;
  endTime: string | null;
  providerId: FdsnProviderId;
  providers: FdsnProviderId[];
};

export type FdsnProviderStatus = {
  id: FdsnProviderId;
  label: string;
  organization: string;
  officialUrl: string;
  coverage: string;
  status: "ok" | "error";
  count: number;
  latencyMs: number | null;
  error: string | null;
};

export type GlobalStationSnapshot = {
  generatedAt: string;
  bounds: FdsnMapViewport;
  waveformOnly?: boolean;
  stationCount: number;
  returnedCount: number;
  sampled: boolean;
  stale: boolean;
  stations: GlobalSeismicStation[];
  sources: FdsnProviderStatus[];
  cache: "HIT" | "MISS" | "STALE" | "PERSISTED";
  persistedAt?: string;
};

export type WaveformPoint = { timestamp: number; value: number };

export type WaveformTrace = {
  channel: string;
  sampleRate: number;
  sampleCount: number;
  startTime: number;
  endTime: number;
  minimum: number;
  maximum: number;
  mean: number;
  points: WaveformPoint[];
  /** Complete decoded miniSEED samples, retained only for an explicit recording request. */
  rawPoints?: WaveformPoint[];
};

export type FdsnWaveformSnapshot = {
  providerId: FdsnProviderId;
  providerLabel: string;
  network: string;
  station: string;
  location: string;
  channels: string[];
  sensor: string;
  scaleUnits: string;
  requestedStartTime: string;
  requestedEndTime: string;
  latencyMs: number;
  byteLength: number;
  traces: WaveformTrace[];
};

export const FDSN_PROVIDER_COLORS: Record<FdsnProviderId, string> = {
  earthscope: "#38bdf8",
  geofon: "#c084fc",
  orfeus: "#22c55e",
  geonet: "#2dd4bf",
  bmkg: "#f97316",
  cwa: "#f472b6",
};

export const FDSN_WAVEFORM_INACTIVE_COLOR = "#f472b6";

export function isFdsnWaveformStationActive(rank: number) {
  return Number.isFinite(rank) && rank >= 0.25;
}

export function fdsnWaveformStationColor(rank: number) {
  return isFdsnWaveformStationActive(rank)
    ? mmiIntensityColor(rank)
    : FDSN_WAVEFORM_INACTIVE_COLOR;
}

export const GLOBAL_FDSN_PROVIDER_IDS = ["earthscope", "geofon", "orfeus", "geonet", "bmkg"] as const satisfies readonly FdsnProviderId[];

export const GLOBAL_FDSN_VIEWPORT: FdsnMapViewport = {
  minLatitude: -90,
  maxLatitude: 90,
  minLongitude: -180,
  maxLongitude: 180,
  zoom: 2,
};

export type FdsnStationDistance = {
  station: GlobalSeismicStation;
  distanceKm: number;
};

export type FdsnDetectionBounds = readonly [
  readonly [latitude: number, longitude: number],
  readonly [latitude: number, longitude: number],
];

const FDSN_WAVEFORM_VIEW_WINDOW_MS = 60_000;
const FDSN_P_WAVE_SPEED_KM_PER_SECOND = 6;
const FDSN_AUTOPLAY_POST_ARRIVAL_MS = 8_000;

export function resolveFdsnWaveformAutoPlayCursor(
  bounds: { start: number; end: number },
  eventTime?: string | null,
  distanceKm?: number | null,
) {
  const earliestCursor = Math.min(bounds.end, bounds.start + FDSN_WAVEFORM_VIEW_WINDOW_MS);
  const parsedEventTime = eventTime ? Date.parse(eventTime) : Number.NaN;
  if (!Number.isFinite(parsedEventTime) || distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    return earliestCursor;
  }
  const predictedPArrival = parsedEventTime
    + Math.max(0, distanceKm) / FDSN_P_WAVE_SPEED_KM_PER_SECOND * 1_000
    + FDSN_AUTOPLAY_POST_ARRIVAL_MS;
  return Math.max(earliestCursor, Math.min(bounds.end, predictedPArrival));
}

export function rankFdsnStationsByDistance(
  stations: GlobalSeismicStation[],
  latitude: number,
  longitude: number,
  atTime?: string | null,
) {
  const targetTime = atTime ? Date.parse(atTime) : Number.NaN;
  const providerIds = new Set<FdsnProviderId>(GLOBAL_FDSN_PROVIDER_IDS);
  const latitudeRadians = latitude * Math.PI / 180;
  return [...new Map(stations.map((station) => [station.id, station])).values()]
    .filter((station) => (
      Number.isFinite(station.latitude)
      && Number.isFinite(station.longitude)
      && station.providers.some((provider) => providerIds.has(provider))
      && (!Number.isFinite(targetTime) || !station.startTime || Date.parse(station.startTime) <= targetTime)
      && (!Number.isFinite(targetTime) || !station.endTime || Date.parse(station.endTime) >= targetTime)
    ))
    .map((station): FdsnStationDistance => {
      const stationLatitudeRadians = station.latitude * Math.PI / 180;
      const latitudeDelta = stationLatitudeRadians - latitudeRadians;
      const longitudeDelta = (station.longitude - longitude) * Math.PI / 180;
      const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(latitudeRadians) * Math.cos(stationLatitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;
      return {
        station,
        distanceKm: 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine))),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.station.id.localeCompare(b.station.id));
}

export function selectNiedWaveformStation(
  stations: GlobalSeismicStation[],
  detectionCells: Array<{ bounds: FdsnDetectionBounds }>,
  latitude: number,
  longitude: number,
  atTime?: string | null,
) {
  return rankNiedWaveformCandidates(stations, detectionCells, latitude, longitude, atTime)[0] ?? null;
}

export function rankNiedWaveformCandidates(
  stations: GlobalSeismicStation[],
  detectionCells: Array<{ bounds: FdsnDetectionBounds }>,
  latitude: number,
  longitude: number,
  atTime?: string | null,
) {
  const ranked = rankFdsnStationsByDistance(stations, latitude, longitude, atTime);
  const inside: Array<FdsnStationDistance & { mode: "inside" }> = [];
  const nearest: Array<FdsnStationDistance & { mode: "nearest" }> = [];
  for (const candidate of ranked) {
    const inDetectionCell = detectionCells.some(({ bounds }) => (
      candidate.station.latitude >= bounds[0][0]
      && candidate.station.latitude <= bounds[1][0]
      && candidate.station.longitude >= bounds[0][1]
      && candidate.station.longitude <= bounds[1][1]
    ));
    if (inDetectionCell) inside.push({ ...candidate, mode: "inside" });
    else nearest.push({ ...candidate, mode: "nearest" });
  }
  return [...inside, ...nearest];
}

export function sampleGlobalStationsForMap(stations: GlobalSeismicStation[], maxMarkers = 360) {
  const limit = Math.max(1, Math.floor(maxMarkers));
  if (stations.length <= limit) return stations;
  const ordered = [...stations].sort((a, b) => (
    a.longitude - b.longitude
    || a.latitude - b.latitude
    || a.id.localeCompare(b.id)
  ));
  const stride = ordered.length / limit;
  return Array.from({ length: limit }, (_, index) => ordered[Math.floor(index * stride)]);
}

const CWA_STATION_VIEWPORT: FdsnMapViewport = {
  minLatitude: 20,
  maxLatitude: 27,
  minLongitude: 116,
  maxLongitude: 123,
  zoom: 7,
};

function roundedCoordinate(value: number) {
  return Number(value.toFixed(4));
}

function wrapLongitude(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function buildEventStationViewport(
  latitude: number,
  longitude: number,
  radiusKm = 1_950,
): FdsnMapViewport {
  const centerLatitude = Math.max(-90, Math.min(90, Number.isFinite(latitude) ? latitude : 0));
  const centerLongitude = wrapLongitude(Number.isFinite(longitude) ? longitude : 0);
  const safeRadiusKm = Math.max(100, Math.min(5_000, Number.isFinite(radiusKm) ? radiusKm : 1_950));
  const latitudeDelta = safeRadiusKm / 111.32;
  const longitudeScale = Math.max(0.08, Math.abs(Math.cos(centerLatitude * Math.PI / 180)));
  const longitudeDelta = safeRadiusKm / (111.32 * longitudeScale);
  const minLatitude = Math.max(-90, centerLatitude - latitudeDelta);
  const maxLatitude = Math.min(90, centerLatitude + latitudeDelta);
  const globalLongitudeCoverage = longitudeDelta >= 180 || minLatitude <= -89.9 || maxLatitude >= 89.9;

  return {
    minLatitude: roundedCoordinate(minLatitude),
    maxLatitude: roundedCoordinate(maxLatitude),
    minLongitude: globalLongitudeCoverage ? -180 : roundedCoordinate(wrapLongitude(centerLongitude - longitudeDelta)),
    maxLongitude: globalLongitudeCoverage ? 180 : roundedCoordinate(wrapLongitude(centerLongitude + longitudeDelta)),
    zoom: 4,
  };
}

function responseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as { error?: unknown; detail?: unknown };
  return String(record.detail ?? record.error ?? fallback);
}

export async function fetchGlobalStations(
  viewport: FdsnMapViewport,
  signal?: AbortSignal,
  providers: readonly FdsnProviderId[] = [],
  options: { full?: boolean; waveformOnly?: boolean } = {},
) {
  const params = new URLSearchParams({
    min_lat: String(viewport.minLatitude),
    max_lat: String(viewport.maxLatitude),
    min_lon: String(viewport.minLongitude),
    max_lon: String(viewport.maxLongitude),
    zoom: String(viewport.zoom),
  });
  if (providers.length) params.set("providers", providers.join(","));
  if (options.full) params.set("full", "1");
  if (options.waveformOnly) params.set("waveform", "1");
  const response = await fetch(`/api/seismic/fdsn/stations?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as GlobalStationSnapshot | null;
  if (!response.ok || !payload || !Array.isArray(payload.stations)) {
    throw new Error(responseError(payload, `FDSN 测站接口返回 ${response.status}`));
  }
  return payload;
}

export function fetchWorldFdsnStations(signal?: AbortSignal, waveformOnly = false) {
  return fetchGlobalStations(
    GLOBAL_FDSN_VIEWPORT,
    signal,
    GLOBAL_FDSN_PROVIDER_IDS,
    { full: true, waveformOnly },
  );
}

export function fetchCwaStations(signal?: AbortSignal) {
  return fetchGlobalStations(CWA_STATION_VIEWPORT, signal, ["cwa"], { full: true });
}

function decodedHeader(response: Response, name: string, fallback = "") {
  const value = response.headers.get(name);
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readResponseBuffer(response: Response, onProgress?: (progress: number) => void) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.(85);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    const ratio = Number.isFinite(declaredLength) && declaredLength > 0 ? received / declaredLength : 1 - Math.exp(-received / 200_000);
    onProgress?.(Math.min(85, Math.max(3, Math.round(ratio * 85))));
  }
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

export function downsampleWaveformPoints(points: WaveformPoint[], maxPoints = 1_600) {
  if (points.length <= maxPoints || maxPoints < 4) return points;
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const bucketSize = (points.length - 2) / bucketCount;
  const output: WaveformPoint[] = [points[0]];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor(bucket * bucketSize);
    const end = Math.min(points.length - 1, 1 + Math.floor((bucket + 1) * bucketSize));
    if (start >= end) continue;
    let minimum = points[start];
    let maximum = points[start];
    for (let index = start + 1; index < end; index += 1) {
      if (points[index].value < minimum.value) minimum = points[index];
      if (points[index].value > maximum.value) maximum = points[index];
    }
    if (minimum.timestamp <= maximum.timestamp) output.push(minimum, maximum);
    else output.push(maximum, minimum);
  }
  output.push(points[points.length - 1]);
  return output;
}

type NumericSamples = Int32Array | Float32Array | Float64Array;
type RawWaveformSegment = {
  channel: string;
  startTime: number;
  sampleRate: number;
  samples: NumericSamples;
};

function buildWaveformTraces(segments: RawWaveformSegment[], includeRawPoints = false) {
  const byChannel = new Map<string, RawWaveformSegment[]>();
  for (const segment of segments) {
    if (!Number.isFinite(segment.startTime) || !Number.isFinite(segment.sampleRate) || segment.sampleRate <= 0 || !segment.samples.length) continue;
    const list = byChannel.get(segment.channel) ?? [];
    list.push(segment);
    byChannel.set(segment.channel, list);
  }

  return [...byChannel.entries()].map(([channel, channelSegments]) => {
    channelSegments.sort((a, b) => a.startTime - b.startTime);
    let sampleCount = 0;
    let sum = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const segment of channelSegments) {
      sampleCount += segment.samples.length;
      for (const value of segment.samples) {
        sum += value;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
    const mean = sampleCount ? sum / sampleCount : 0;
    const points: WaveformPoint[] = [];
    const rawPoints: WaveformPoint[] | undefined = includeRawPoints ? [] : undefined;
    let previousTimestamp = Number.NEGATIVE_INFINITY;
    for (const segment of channelSegments) {
      const periodMs = 1_000 / segment.sampleRate;
      for (let index = 0; index < segment.samples.length; index += 1) {
        const timestamp = segment.startTime + index * periodMs;
        if (timestamp <= previousTimestamp) continue;
        previousTimestamp = timestamp;
        const rawValue = segment.samples[index];
        points.push({ timestamp, value: rawValue - mean });
        rawPoints?.push({ timestamp, value: rawValue });
      }
    }
    return {
      channel,
      sampleRate: Math.max(...channelSegments.map((segment) => segment.sampleRate)),
      sampleCount,
      startTime: points[0]?.timestamp ?? 0,
      endTime: points[points.length - 1]?.timestamp ?? 0,
      minimum,
      maximum,
      mean,
      points: downsampleWaveformPoints(points),
      ...(rawPoints ? { rawPoints } : {}),
    } satisfies WaveformTrace;
  }).filter((trace) => trace.points.length > 1).sort((a, b) => a.channel.localeCompare(b.channel)).slice(0, 3);
}

async function parseMiniSeed(buffer: ArrayBuffer, includeRawPoints = false) {
  const seisplot = await import("seisplotjs");
  const segments: RawWaveformSegment[] = [];
  if (seisplot.mseed3.mightBeMSeed3Records(buffer)) {
    for (const record of seisplot.mseed3.parseMSeed3Records(buffer)) {
      const sourceId = record.getSourceId();
      segments.push({
        channel: sourceId.formChannelCode(),
        startTime: record.header.start.toMillis(),
        sampleRate: record.header.sampleRate,
        samples: record.decompress(),
      });
    }
  } else {
    for (const record of seisplot.miniseed.parseDataRecords(buffer)) {
      segments.push({
        channel: record.header.chanCode.trim(),
        startTime: record.header.startTime.toMillis(),
        sampleRate: record.header.sampleRate,
        samples: record.decompress(),
      });
    }
  }
  const traces = buildWaveformTraces(segments, includeRawPoints);
  if (!traces.length) throw new Error("miniSEED 中没有可解压的波形样本");
  return traces;
}

function fdsnWaveformParams(station: GlobalSeismicStation, minutes: number, eventTime?: string | null) {
  const params = new URLSearchParams({
    network: station.network,
    station: station.stationCode,
    providers: station.providers.join(","),
    minutes: String(minutes),
  });
  if (eventTime) params.set("event_time", eventTime);
  return params;
}

export async function probeFdsnWaveform(
  station: GlobalSeismicStation,
  minutes: number,
  eventTime?: string | null,
  signal?: AbortSignal,
) {
  const params = fdsnWaveformParams(station, minutes, eventTime);
  params.set("probe", "1");
  const response = await fetch(`/api/seismic/fdsn/waveform?${params}`, {
    method: "HEAD",
    signal,
    headers: { Accept: "application/vnd.fdsn.mseed,application/octet-stream;q=0.9" },
  });
  return response.ok;
}

export async function fetchFdsnWaveform(
  station: GlobalSeismicStation,
  minutes: number,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
  eventTime?: string | null,
  includeRawPoints = false,
) {
  const params = fdsnWaveformParams(station, minutes, eventTime);
  onProgress?.(1);
  const response = await fetch(`/api/seismic/fdsn/waveform?${params}`, {
    signal,
    headers: { Accept: "application/vnd.fdsn.mseed,application/octet-stream;q=0.9" },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(responseError(payload, `FDSN 波形接口返回 ${response.status}`));
  }
  const buffer = await readResponseBuffer(response, onProgress);
  onProgress?.(90);
  const traces = await parseMiniSeed(buffer, includeRawPoints);
  onProgress?.(100);
  return {
    providerId: response.headers.get("x-fdsn-provider") as FdsnProviderId,
    providerLabel: decodedHeader(response, "x-fdsn-provider-label", "FDSN"),
    network: response.headers.get("x-fdsn-network") ?? station.network,
    station: response.headers.get("x-fdsn-station") ?? station.stationCode,
    location: response.headers.get("x-fdsn-location") ?? "--",
    channels: (response.headers.get("x-fdsn-channels") ?? "").split(",").filter(Boolean),
    sensor: decodedHeader(response, "x-fdsn-sensor", "未注明传感器"),
    scaleUnits: decodedHeader(response, "x-fdsn-scale-units", "count"),
    requestedStartTime: response.headers.get("x-fdsn-window-start") ?? new Date(traces[0].startTime).toISOString(),
    requestedEndTime: response.headers.get("x-fdsn-window-end") ?? new Date(traces[0].endTime).toISOString(),
    latencyMs: Number(response.headers.get("x-fdsn-latency-ms")) || 0,
    byteLength: buffer.byteLength,
    traces,
  } satisfies FdsnWaveformSnapshot;
}
