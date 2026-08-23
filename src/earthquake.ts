import type { FeatureCollection, LineString, MultiLineString } from "geojson";

export type EarthquakeSourceId = "usgs" | "shakealert" | "jma" | "cenc" | "cwa" | "emsc" | "gfz" | "geonet" | "bmkg";
export type EarthquakeRange = "24h" | "7d" | "30d" | "90d";
export type EarthquakeBaseLayer = "terrain" | "satellite";
export type EarthquakeTimeZone = "Asia/Shanghai" | "UTC";

export type ShakeAlertCityReport = {
  name: string;
  mmi: number | null;
  warningSeconds: number | null;
  distanceKm: number | null;
};

export type ShakeAlertPerformanceReport = {
  productId: string;
  reviewStatus: string;
  announcement: string | null;
  issuedAt: string | null;
  weaReport: string | null;
  initialSeconds: number | null;
  peakSeconds: number | null;
  finalSeconds: number | null;
  initialMagnitude: number | null;
  peakMagnitude: number | null;
  finalMagnitude: number | null;
  stationsWithin10Km: number | null;
  stationsWithin100Km: number | null;
  stationsFinal: number | null;
  maximumMmi: number | null;
  cities: ShakeAlertCityReport[];
  summaryJsonUrl: string | null;
  summaryPdfUrl: string | null;
};

export type EarthquakeAffectedArea = {
  name: string;
  intensity: string;
  rank: number;
  warning: boolean;
};

export type EarthquakeEvent = {
  id: string;
  source: EarthquakeSourceId;
  sourceEventId: string;
  time: string;
  updatedAt: string | null;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number;
  magnitudeType: string;
  place: string;
  status: string;
  intensity: string | null;
  intensityValue: number | null;
  intensityScale: "MMI" | "JMA" | "CWA" | null;
  reportedIntensity: string | null;
  felt: number | null;
  tsunami: boolean;
  alert: string | null;
  significance: number | null;
  agency: string;
  url: string;
  detailUrl: string | null;
  mechanismAvailable: boolean;
  shakeMapAvailable: boolean;
  pagerAvailable: boolean;
  dyfiAvailable: boolean;
  note: string | null;
  affectedAreas?: EarthquakeAffectedArea[];
  shakeAlertReport?: ShakeAlertPerformanceReport;
};

export type EarthquakeMechanism = {
  source: "usgs" | "emsc" | "cenc";
  eventId: string;
  type: "moment-tensor" | "focal-mechanism";
  productSource: string;
  reviewStatus: string;
  updateTime: string | null;
  properties: Record<string, string>;
  officialUrl: string;
  documentationUrl: string;
  cache: "HIT" | "MISS";
};

export type EarthquakeShakeMapContourProperties = {
  value: number;
  units: "mmi";
  color: string;
  weight: number;
};

export type EarthquakeShakeMap = {
  source: "usgs";
  eventId: string;
  productSource: string;
  reviewStatus: string;
  issuedAt: string | null;
  updateTime: string | null;
  version: string | null;
  maxMmi: number;
  officialUrl: string;
  intensityImageUrl: string | null;
  intensityOverlayUrl: string | null;
  contours: FeatureCollection<LineString | MultiLineString, EarthquakeShakeMapContourProperties>;
  cache: "HIT" | "MISS";
};

export const SHAKEMAP_MMI_LEVELS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function shakeMapContourLevel(value: number) {
  return Math.max(SHAKEMAP_MMI_LEVELS[0], Math.min(SHAKEMAP_MMI_LEVELS[SHAKEMAP_MMI_LEVELS.length - 1], Math.round(value)));
}

export function filterShakeMapContours(
  shakeMap: EarthquakeShakeMap,
  enabledLevels: readonly number[],
) {
  const enabled = new Set(enabledLevels.map(shakeMapContourLevel));
  return {
    ...shakeMap.contours,
    features: shakeMap.contours.features.filter((feature) => enabled.has(
      shakeMapContourLevel(feature.properties.value),
    )),
  } satisfies EarthquakeShakeMap["contours"];
}

export type EarthquakePagerAlertBin = {
  color: "green" | "yellow" | "orange" | "red" | "unknown";
  minimum: string;
  maximum: string;
  probability: number;
};

export type EarthquakePagerAlert = {
  type: "fatality" | "economic";
  units: string;
  level: "green" | "yellow" | "orange" | "red" | "unknown";
  estimatedValue: number | null;
  summary: boolean;
  bins: EarthquakePagerAlertBin[];
};

export type EarthquakePagerExposureGroup = {
  label: string;
  minimumMmi: number;
  maximumMmi: number;
  population: number;
};

export type EarthquakePagerCity = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  population: number;
  mmi: number;
  capital: boolean;
  onOfficialMap: boolean;
};

export type EarthquakePager = {
  source: "usgs";
  eventId: string;
  productSource: string;
  reviewStatus: string;
  issuedAt: string | null;
  updateTime: string | null;
  alertLevel: string;
  maxMmi: number | null;
  event: {
    place: string;
    magnitude: number | null;
    time: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  officialUrl: string;
  onePagerPdfUrl: string | null;
  images: {
    populationExposure: string | null;
    fatalities: string | null;
    economicLosses: string | null;
  };
  alerts: {
    fatality: EarthquakePagerAlert | null;
    economic: EarthquakePagerAlert | null;
  };
  populationExposure: {
    groups: EarthquakePagerExposureGroup[];
    maximumBorderMmi: number | null;
    totalPopulation: number;
    countries: Array<{ countryCode: string; population: number; byMmi: number[] }>;
  };
  allCities: EarthquakePagerCity[];
  citySource: string | null;
  comments: {
    impact: string[];
    structure: string | null;
    historical: string | null;
    secondaryHazards: string | null;
  } | null;
  cache: "HIT" | "MISS";
};

export type EarthquakeDyfi = {
  source: "usgs";
  eventId: string;
  productSource: string;
  reviewStatus: string;
  updateTime: string | null;
  maxMmi: number | null;
  responses: number | null;
  officialUrl: string;
  images: {
    communityIntensity: string | null;
    geocodedIntensity: string | null;
    intensityDistance: string | null;
    responseTime: string | null;
  };
  geoJsonUrl: string | null;
  cache: "HIT" | "MISS";
};

export type FnetNodalPlane = {
  strike: number;
  dip: number;
  rake: number;
};

export type FnetMechanismProduct = {
  eventId: string;
  originTime: string;
  latitude: number;
  longitude: number;
  jmaDepthKm: number | null;
  jmaMagnitude: number | null;
  region: string;
  nodalPlanes: [FnetNodalPlane, FnetNodalPlane];
  scalarMomentNm: number | null;
  fittedDepthKm: number | null;
  momentMagnitude: number | null;
  varianceReduction: number | null;
  stationCount: number | null;
  stations: string[];
  officialUrl: string;
  solutionMethod: "automatic" | "reviewed" | "unknown";
  mechanismImageUrl: string | null;
  seismicityImageUrl: string | null;
  match: {
    timeDifferenceSeconds: number;
    distanceKm: number;
    magnitudeDifference: number;
  };
};

export type NiedOfficialProductLink = {
  id: "aqua-cmt" | "hinet-hypocenter";
  title: string;
  officialUrl: string;
  mode: "official-link";
  note: string;
};

export type NiedProductsSnapshot = {
  generatedAt: string;
  query: {
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number | null;
  };
  fnet: {
    status: "available" | "not-found" | "outside-coverage" | "error";
    message: string | null;
    product: FnetMechanismProduct | null;
  };
  aquaCmt: NiedOfficialProductLink;
  hypocenter: NiedOfficialProductLink;
  cache: "HIT" | "MISS";
};

export type EarthquakeSourceStatus = {
  id: EarthquakeSourceId;
  label: string;
  organization: string;
  url: string;
  coverage: string;
  status: "ok" | "stale" | "error";
  count: number;
  latencyMs: number;
  error: string | null;
};

export type EarthquakeSourceAvailability = {
  onlineCount: number;
  availableCount: number;
  state: "online" | "stale" | "error";
};

export type EarthquakeSnapshot = {
  generatedAt: string;
  window: {
    range: EarthquakeRange;
    startTime: string;
    endTime: string;
    minMagnitude: number;
  };
  stale: boolean;
  partial: boolean;
  truncated: boolean;
  events: EarthquakeEvent[];
  sources: EarthquakeSourceStatus[];
  cache: "HIT" | "MISS" | "STALE" | "PERSISTED";
};

export const EARTHQUAKE_SOURCE_COLORS: Record<EarthquakeSourceId, string> = {
  usgs: "#38bdf8",
  shakealert: "#fb923c",
  jma: "#f87171",
  cenc: "#facc15",
  cwa: "#f472b6",
  emsc: "#4ade80",
  gfz: "#c084fc",
  geonet: "#2dd4bf",
  bmkg: "#f97316",
};

export const EARTHQUAKE_SOURCE_LABELS: Record<EarthquakeSourceId, string> = {
  usgs: "USGS",
  shakealert: "ShakeAlert",
  jma: "JMA",
  cenc: "CENC",
  cwa: "CWA",
  emsc: "EMSC",
  gfz: "GFZ",
  geonet: "GeoNet",
  bmkg: "BMKG",
};

export function summarizeEarthquakeSourceAvailability(
  sources: EarthquakeSourceStatus[],
): EarthquakeSourceAvailability {
  const onlineCount = sources.filter((source) => source.status === "ok").length;
  const availableCount = sources.filter((source) => source.status !== "error").length;
  return {
    onlineCount,
    availableCount,
    state: sources.length > 0 && onlineCount === sources.length
      ? "online"
      : availableCount > 0
        ? "stale"
        : "error",
  };
}

export const DEPTH_BANDS = [
  { id: "shallow", label: "浅源 0–35 km", min: 0, max: 35, color: "#ef4444" },
  { id: "upper", label: "较浅 35–70 km", min: 35, max: 70, color: "#f59e0b" },
  { id: "intermediate", label: "中源 70–300 km", min: 70, max: 300, color: "#22c7d6" },
  { id: "deep", label: "深源 300 km+", min: 300, max: Number.POSITIVE_INFINITY, color: "#a78bfa" },
] as const;

export function depthColor(depthKm: number | null) {
  if (depthKm === null) return "#94a3b8";
  return DEPTH_BANDS.find((band) => depthKm >= band.min && depthKm < band.max)?.color ?? "#94a3b8";
}

export function formatMagnitudeType(value: string) {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  const known: Record<string, string> = {
    mw: "Mw",
    mww: "Mww",
    mwc: "Mwc",
    mb: "mb",
    ml: "ML",
    ms: "Ms",
    mi: "Mi",
    mj: "Mj",
    md: "Md",
    m: "M",
  };
  return known[lower] ?? (normalized || "M");
}

export function isMechanismQueryable(event: EarthquakeEvent) {
  return event.mechanismAvailable || event.source === "emsc";
}

export function isShakeMapQueryable(event: EarthquakeEvent) {
  return event.source === "usgs" && event.shakeMapAvailable;
}

export function isPagerQueryable(event: EarthquakeEvent) {
  return event.source === "usgs" && event.pagerAvailable;
}

export function isDyfiQueryable(event: EarthquakeEvent) {
  return event.source === "usgs" && event.dyfiAvailable;
}

export function isNiedQueryable(event: EarthquakeEvent) {
  const timestamp = Date.parse(event.time);
  return Number.isFinite(timestamp)
    && timestamp >= Date.UTC(1997, 0, 1)
    && event.latitude >= 19
    && event.latitude <= 47
    && event.longitude >= 120
    && event.longitude <= 157;
}

export function earthquakeBurstExpansion(magnitude: number, progress: number) {
  const normalizedMagnitude = Math.max(0, magnitude);
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  return (12 + normalizedMagnitude ** 2 * 2.2) * normalizedProgress;
}

export function normalizeEarthquakeRefreshSeconds(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 60;
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

export function mergeEarthquakeEventHistory(
  current: EarthquakeEvent[],
  incoming: EarthquakeEvent[],
  now = Date.now(),
  maxAgeMs = 90 * 24 * 60 * 60 * 1000,
  maxEvents = 6_000,
) {
  const cutoff = now - Math.max(1, maxAgeMs);
  const events = new Map<string, EarthquakeEvent>();
  for (const report of current) {
    if (Date.parse(report.time) >= cutoff) events.set(report.id, report);
  }
  for (const report of incoming) {
    if (Date.parse(report.time) < cutoff) continue;
    const previous = events.get(report.id);
    events.set(report.id, previous
      ? {
          ...report,
          mechanismAvailable: report.mechanismAvailable || previous.mechanismAvailable,
          shakeMapAvailable: report.shakeMapAvailable || previous.shakeMapAvailable,
          pagerAvailable: report.pagerAvailable || previous.pagerAvailable,
          dyfiAvailable: report.dyfiAvailable || previous.dyfiAvailable,
          affectedAreas: report.affectedAreas?.length ? report.affectedAreas : previous.affectedAreas,
        }
      : report);
  }
  return [...events.values()]
    .sort((a, b) => Date.parse(b.updatedAt ?? b.time) - Date.parse(a.updatedAt ?? a.time))
    .slice(0, Math.max(1, maxEvents));
}

export function formatEarthquakeTime(value: string, timeZone: EarthquakeTimeZone, withSeconds = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

export async function fetchEarthquakeSnapshot(options: {
  range: EarthquakeRange;
  minMagnitude: number;
  sources?: EarthquakeSourceId[];
  force?: boolean;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    range: options.range,
    min_magnitude: String(options.minMagnitude),
  });
  if (options.sources?.length) params.set("sources", options.sources.join(","));
  if (options.force) params.set("force", "1");
  const response = await fetch(`/api/earthquakes?${params}`, {
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as EarthquakeSnapshot | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("events" in payload) || !Array.isArray(payload.events)) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `地震接口返回 ${response.status}`);
  }
  return payload;
}

export async function fetchEarthquakeMechanism(event: EarthquakeEvent, signal?: AbortSignal) {
  const params = new URLSearchParams({
    source: event.source,
    event_id: event.sourceEventId,
    time: event.time,
    latitude: String(event.latitude),
    longitude: String(event.longitude),
    magnitude: String(event.magnitude),
  });
  const response = await fetch(`/api/earthquake-mechanism?${params}`, { signal, headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as EarthquakeMechanism | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("properties" in payload)) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `机制解接口返回 ${response.status}`);
  }
  return payload;
}

export async function fetchEarthquakeShakeMap(event: EarthquakeEvent, signal?: AbortSignal) {
  if (!isShakeMapQueryable(event)) throw new Error("该事件目录未确认存在 USGS ShakeMap 产品");
  const params = new URLSearchParams({ event_id: event.sourceEventId });
  const response = await fetch(`/api/earthquake-shakemap?${params}`, { signal, headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as EarthquakeShakeMap | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("contours" in payload)) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `ShakeMap 接口返回 ${response.status}`);
  }
  return payload;
}

export async function fetchEarthquakePager(event: EarthquakeEvent, signal?: AbortSignal) {
  if (!isPagerQueryable(event)) throw new Error("该事件目录未确认存在 USGS PAGER 产品");
  const params = new URLSearchParams({ event_id: event.sourceEventId });
  const response = await fetch(`/api/earthquake-pager?${params}`, { signal, headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as EarthquakePager | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("populationExposure" in payload) || !Array.isArray(payload.allCities)) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `PAGER 接口返回 ${response.status}`);
  }
  return payload;
}

export async function fetchEarthquakeDyfi(event: EarthquakeEvent, signal?: AbortSignal) {
  if (!isDyfiQueryable(event)) throw new Error("该事件目录未确认存在 USGS Did You Feel It? 产品");
  const params = new URLSearchParams({ event_id: event.sourceEventId });
  const response = await fetch(`/api/earthquake-dyfi?${params}`, { signal, headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as EarthquakeDyfi | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("images" in payload)) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `DYFI 接口返回 ${response.status}`);
  }
  return payload;
}

export async function fetchNiedProducts(event: EarthquakeEvent, signal?: AbortSignal) {
  const params = new URLSearchParams({
    time: event.time,
    latitude: String(event.latitude),
    longitude: String(event.longitude),
    magnitude: String(event.magnitude),
  });
  const response = await fetch(`/api/seismic/nied-products?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as NiedProductsSnapshot | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("fnet" in payload) || !("aquaCmt" in payload)) {
    const errorPayload = payload && "error" in payload ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `NIED 产品接口返回 ${response.status}`);
  }
  return payload;
}

export function filterEarthquakeEvents(
  events: EarthquakeEvent[],
  options: {
    sources: EarthquakeSourceId[];
    magnitudeType: string;
    search: string;
    minimumMagnitude?: number;
    maximumMagnitude?: number | null;
  },
) {
  const sourceSet = new Set(options.sources);
  const magnitudeType = options.magnitudeType.toLowerCase();
  const search = options.search.trim().toLowerCase();
  const minimumMagnitude = Number.isFinite(options.minimumMagnitude)
    ? Number(options.minimumMagnitude)
    : Number.NEGATIVE_INFINITY;
  const maximumMagnitude = Number.isFinite(options.maximumMagnitude)
    ? Number(options.maximumMagnitude)
    : Number.POSITIVE_INFINITY;
  return events.filter((event) => {
    if (!sourceSet.has(event.source)) return false;
    if (event.magnitude < minimumMagnitude || event.magnitude >= maximumMagnitude) return false;
    if (magnitudeType && formatMagnitudeType(event.magnitudeType).toLowerCase() !== magnitudeType) return false;
    if (search && !`${event.place} ${event.agency} ${event.sourceEventId}`.toLowerCase().includes(search)) return false;
    return true;
  });
}

export function buildTimelineData(
  events: EarthquakeEvent[],
  range: EarthquakeRange,
  endTime: string,
  timeZone: EarthquakeTimeZone,
) {
  const end = new Date(endTime).getTime();
  const config = range === "24h"
    ? { buckets: 12, stepHours: 2 }
    : range === "7d"
      ? { buckets: 14, stepHours: 12 }
      : range === "30d"
        ? { buckets: 30, stepHours: 24 }
        : { buckets: 30, stepHours: 72 };
  const stepMs = config.stepHours * 60 * 60 * 1000;
  const start = end - config.buckets * stepMs;
  const counts = Array.from({ length: config.buckets }, (_, index) => ({
    start: start + index * stepMs,
    count: 0,
  }));
  for (const event of events) {
    const index = Math.floor((new Date(event.time).getTime() - start) / stepMs);
    if (index >= 0 && index < counts.length) counts[index].count += 1;
  }
  return counts.map((item) => ({
    label: new Intl.DateTimeFormat("zh-CN", {
      month: range === "24h" ? undefined : "2-digit",
      day: range === "24h" ? undefined : "2-digit",
      hour: range === "24h" ? "2-digit" : undefined,
      hour12: false,
      timeZone,
    }).format(new Date(item.start)),
    count: item.count,
  }));
}

export function buildMagnitudeHistogram(events: EarthquakeEvent[]) {
  const bins = [
    { label: "<2", min: Number.NEGATIVE_INFINITY, max: 2, count: 0 },
    { label: "2–2.9", min: 2, max: 3, count: 0 },
    { label: "3–3.9", min: 3, max: 4, count: 0 },
    { label: "4–4.9", min: 4, max: 5, count: 0 },
    { label: "5–5.9", min: 5, max: 6, count: 0 },
    { label: "6–6.9", min: 6, max: 7, count: 0 },
    { label: "7+", min: 7, max: Number.POSITIVE_INFINITY, count: 0 },
  ];
  for (const event of events) {
    const bin = bins.find((item) => event.magnitude >= item.min && event.magnitude < item.max);
    if (bin) bin.count += 1;
  }
  return bins.map(({ label, count }) => ({ label, count }));
}

export function buildDepthHistogram(events: EarthquakeEvent[]) {
  return DEPTH_BANDS.map((band) => ({
    label: band.id === "shallow" ? "0–35" : band.id === "upper" ? "35–70" : band.id === "intermediate" ? "70–300" : "300+",
    count: events.filter((event) => event.depthKm !== null && event.depthKm >= band.min && event.depthKm < band.max).length,
    color: band.color,
  }));
}

export function buildSourceHistogram(events: EarthquakeEvent[]) {
  return (Object.keys(EARTHQUAKE_SOURCE_LABELS) as EarthquakeSourceId[]).map((source) => ({
    source,
    label: EARTHQUAKE_SOURCE_LABELS[source],
    count: events.filter((event) => event.source === source).length,
    color: EARTHQUAKE_SOURCE_COLORS[source],
  }));
}
