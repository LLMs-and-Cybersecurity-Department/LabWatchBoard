export type SeismicNetwork = "NIED" | "K-NET" | "KiK-net" | "KMA" | "S-net" | "DONET1" | "DONET2" | "N-net";

export type SeismicStation = {
  id: string;
  index: number;
  latitude: number;
  longitude: number;
  network: SeismicNetwork | string;
  stationCode: string;
  stationName: string;
  prefecture: string;
  metadataMatched: boolean;
};

export type OceanStation = Omit<SeismicStation, "index" | "prefecture" | "metadataMatched"> & {
  depthM: number;
  realtime: false;
  waveformUrl: string;
};

export type NiedStationCatalogue = {
  generatedAt: string;
  siteConfigId: string;
  stations: SeismicStation[];
  matched: number;
  unmatched: number;
  cache: "HIT" | "MISS" | "STALE";
  source: { id: string; label: string; kind: string; officialUrl: string; termsUrl: string };
};

export type OceanStationCatalogue = {
  generatedAt: string;
  stations: OceanStation[];
  counts: Record<string, number>;
  cache: "HIT" | "MISS" | "STALE";
  source: { id: string; label: string; kind: string; officialUrl: string };
};

export type SnetIntensityStation = {
  stationId: string;
  stationCode: string;
  latitude: number;
  longitude: number;
  intensity: number;
  rgb: [number, number, number];
};

export type SnetIntensityFrame = {
  stamp: string;
  timestamp: string;
  maxIntensity: number;
  activeStationCount: number;
  informationStationCount?: number;
  source?: "msil" | "screenshot";
  sourceLabel?: string;
  forceReport?: boolean;
  stations: SnetIntensityStation[];
};

export type SnetIntensityReport = {
  id: string;
  reportNumber: number;
  frameStamp: string;
  observedAt: string;
  maxIntensity: number;
  stationCount: number;
  changedStationCount: number;
  shindoChangeCount: number;
  source?: "msil" | "screenshot";
  sourceLabel?: string;
};

export type SnetIntensityEvent = {
  id: string;
  startedAt: string;
  endedAt: string;
  peakAt: string;
  maxIntensity: number;
  stationCount: number;
  frameCount: number;
  reportCount: number;
  source?: "msil" | "screenshot";
  sourceLabel?: string;
  active: boolean;
  peakFrame: SnetIntensityFrame;
  reports: SnetIntensityReport[];
  frames: SnetIntensityFrame[];
};

export type SnetIntensitySnapshot = {
  generatedAt: string;
  latestFrame: SnetIntensityFrame;
  events: SnetIntensityEvent[];
  availableFrameCount: number;
  backfillPendingFrameCount: number | null;
  backfillComplete: boolean;
  historyWindowMinutes: number;
  latencyMs: number;
  stale: boolean;
  cache: "HIT" | "MISS" | "STALE";
  error?: string;
  source: {
    id: string;
    label: string;
    kind: string;
    officialUrl: string;
    targetTimesUrl: string;
  };
};

export type NiedRealtimeFrame = {
  generatedAt: string;
  requestStamp: string;
  dataTime: string;
  siteConfigId: string;
  intensity: string;
  latencyMs: number;
  psWave: unknown;
  hypoInfo: unknown;
  estimatedIntensity: unknown;
  cache: "HIT" | "MISS" | "STALE";
  stale: boolean;
  source: { id: string; label: string; kind: string; officialUrl: string; termsUrl: string };
};

export type KmaStation = {
  id: string;
  index: number;
  latitude: number;
  longitude: number;
  network: "KMA";
  stationCode: string;
  stationName: string;
  prefecture: string;
  metadataMatched: false;
};

export type KmaPewsSnapshot = {
  source: "KMA";
  provider: "KMA-PEWS 官方";
  fetchedAt: string;
  sampleTime: number;
  latencyMs: number;
  stale: boolean;
  cache: "MISS" | "STALE";
  stations: Array<{ latitude: number; longitude: number }>;
  mmi: number[];
  error?: string;
};

export type CencIntensitySummary = {
  id: string;
  eventId: string;
  originTime: string;
  place: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
};

export type CencIntensityStation = {
  id: string;
  reportId: string;
  latitude: number;
  longitude: number;
  network: "CENC-烈度";
  stationCode: string;
  stationName: string;
  prefecture: string;
  intensity: number;
  pgaGal: number | null;
  pgvCms: number | null;
  pgaIntensity: number | null;
  pgvIntensity: number | null;
  distanceKm: number | null;
  site: string;
  address: string;
};

export type CencIntensityMetric = {
  id: string;
  reportId: string;
  stationCode: string;
  stationName: string;
  networkCode: string;
  intensity: number;
  pgaGal: number | null;
  pgvCms: number | null;
  distanceKm: number | null;
  site: string;
};

export type CencIntensityReport = CencIntensitySummary & {
  depthKm: number | null;
  createdAt: string;
  stations: CencIntensityStation[];
  stationMetrics: CencIntensityMetric[];
  contourGeoJson: Record<string, unknown> | null;
  relay: "FAN" | "NEDC";
};

export type CencIntensityRelaySnapshot = {
  provider: "FAN CENC-IR 后端中继" | "国家地震科学数据中心强震动参数";
  fetchedAt: string;
  state: "connecting" | "online" | "stale" | "error";
  endpoint: string;
  officialEgressMode: "direct" | "http-proxy" | "config-error";
  latencyMs: number | null;
  lastGoodAt: number | null;
  cache: "LIVE" | "PERSISTED" | "EMPTY";
  error: string | null;
  listEnvelope: unknown | null;
  detailEnvelope: unknown | null;
};

export type PalertStation = {
  id: string;
  stationCode: string;
  network: string;
  locationCode: string;
  stationName: string;
  area: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  floor: number | null;
  serial: number | null;
  startAt: string | null;
};

export type CanvasHitCandidate<T> = {
  x: number;
  y: number;
  radius: number;
  value: T;
};

/** Finds the closest visible Canvas marker inside a forgiving click target. */
export function findNearestCanvasHit<T>(
  candidates: readonly CanvasHitCandidate<T>[],
  x: number,
  y: number,
  minimumRadius = 8,
) {
  let nearest: CanvasHitCandidate<T> | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const hitRadius = Math.max(minimumRadius, candidate.radius + 5);
    const deltaX = candidate.x - x;
    const deltaY = candidate.y - y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared > hitRadius * hitRadius || distanceSquared >= nearestDistanceSquared) continue;
    nearest = candidate;
    nearestDistanceSquared = distanceSquared;
  }
  return nearest;
}

export type PalertSnapshot = {
  provider: string;
  sourceUrl: string;
  termsUrl: string;
  fetchedAt: string;
  upstreamTimestamp: string | null;
  version: string | null;
  state: "online" | "stale" | "error";
  cache: "MISS" | "HIT" | "EMPTY";
  stations: PalertStation[];
  error: string | null;
};

export type PalertRealtimeFrame = {
  provider: string;
  sourceUrl: string;
  termsUrl: string;
  fetchedAt: string;
  dataTime: string | null;
  latencyMs: number | null;
  state: "online" | "stale" | "error";
  cache: "MISS" | "HIT" | "EMPTY";
  stationCount: number;
  dataVals: Record<string, number>;
  error: string | null;
};

export type PalertEvent = {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number;
  hasPga: boolean;
  sourceUrl: string;
};

export type PalertEventCatalogue = {
  provider: string;
  sourceUrl: string;
  fetchedAt: string;
  days: number;
  cache: "MISS" | "HIT";
  events: PalertEvent[];
};

export type PalertEventStation = {
  stationCode: string;
  pgaGal: number | null;
  pgvCms: number | null;
  azimuth: number | null;
  distanceKm: number | null;
};

export type PalertEventStationSnapshot = {
  provider: string;
  sourceUrl: string;
  fetchedAt: string;
  event: string;
  stationCount: number;
  cache: "MISS" | "HIT";
  stations: PalertEventStation[];
};

export type PalertDisplayMetric = "pga" | "pgv";
export type SeismicStationShape = "circle" | "triangle";

export type EewRelaySourceStatus = {
  state: "online" | "stale" | "error";
  latencyMs: number | null;
  count: number;
  error: string | null;
};

export type EewRelaySnapshot = {
  provider: "Wolfx HTTP + P2P地震信息";
  fetchedAt: string;
  state: "online" | "stale" | "error";
  sources: { wolfx: EewRelaySourceStatus; p2p: EewRelaySourceStatus; p2pIntensity: EewRelaySourceStatus };
  events: unknown[];
};

export type ExternalWarningSourceStatus = {
  state: "unconfigured" | "online" | "stale" | "error";
  configured: boolean;
  latencyMs: number | null;
  count: number;
  error: string | null;
  officialUrl: string;
};

export type ExternalWarningSnapshot = {
  provider: "Authorized external warning adapters";
  fetchedAt: string;
  state: "unconfigured" | "online" | "stale" | "error";
  sources: {
    "early-est": ExternalWarningSourceStatus;
    globalquake: ExternalWarningSourceStatus;
  };
  events: LiveEew[];
};

export type JmaTsunamiGrade = "Watch" | "Warning" | "MajorWarning";

export type JmaTsunamiArea = {
  name: string;
  grade: JmaTsunamiGrade;
  level: 1 | 2 | 3;
  immediate: boolean;
  arrivalTime: string | null;
  arrivalCondition: string | null;
  maxHeightM: number | null;
  maxHeightDescription: string | null;
};

export type JmaTsunamiSnapshot = {
  provider: "P2P地震信息 / 气象厅";
  source: "JMA";
  sourceState: "online" | "stale";
  sourceUrl: string;
  relayUrl: string;
  fetchedAt: string;
  issuedAt: string | null;
  reportId: string | null;
  reportType: string | null;
  cancelled: boolean;
  active: boolean;
  level: 0 | 1 | 2 | 3;
  state: "clear" | "advisory" | "warning" | "major-warning";
  title: string;
  stale: boolean;
  cache: "LIVE" | "STALE";
  error?: string;
  areas: JmaTsunamiArea[];
};

export type JmaTsunamiHistorySnapshot = {
  provider: JmaTsunamiSnapshot["provider"];
  source: JmaTsunamiSnapshot["source"];
  sourceState: JmaTsunamiSnapshot["sourceState"];
  sourceUrl: string;
  relayUrl: string;
  fetchedAt: string;
  stale: boolean;
  cache: JmaTsunamiSnapshot["cache"];
  error?: string;
  reports: JmaTsunamiSnapshot[];
};

export type JmaTsunamiReplayEpisode = {
  originTime: string;
  reports: JmaTsunamiSnapshot[];
};

const JMA_TSUNAMI_STANDARD_MATCH_MS = 30 * 60_000;
const JMA_TSUNAMI_EXPECTED_MATCH_MS = 6 * 60 * 60_000;
const JMA_TSUNAMI_EPISODE_MS = 24 * 60 * 60_000;

export function matchJmaTsunamiReplayEpisode(
  originTime: string,
  reports: JmaTsunamiSnapshot[],
  tsunamiExpected = false,
): JmaTsunamiReplayEpisode | null {
  const origin = Date.parse(originTime);
  if (!Number.isFinite(origin)) return null;
  const maximumDelay = tsunamiExpected ? JMA_TSUNAMI_EXPECTED_MATCH_MS : JMA_TSUNAMI_STANDARD_MATCH_MS;
  const ordered = reports
    .filter((report) => report.issuedAt && Number.isFinite(Date.parse(report.issuedAt)))
    .sort((a, b) => Date.parse(a.issuedAt ?? "") - Date.parse(b.issuedAt ?? ""));
  const firstIndex = ordered.findIndex((report) => {
    const issuedAt = Date.parse(report.issuedAt ?? "");
    const delay = issuedAt - origin;
    return report.active && delay >= -60_000 && delay <= maximumDelay;
  });
  if (firstIndex < 0) return null;

  const firstIssuedAt = Date.parse(ordered[firstIndex].issuedAt ?? "");
  const episode: JmaTsunamiSnapshot[] = [];
  for (let index = firstIndex; index < ordered.length; index += 1) {
    const report = ordered[index];
    const issuedAt = Date.parse(report.issuedAt ?? "");
    if (issuedAt - firstIssuedAt > JMA_TSUNAMI_EPISODE_MS) break;
    episode.push(report);
    if (report.cancelled) break;
  }
  return { originTime, reports: episode };
}

export function jmaTsunamiSnapshotAt(
  episode: JmaTsunamiReplayEpisode | null,
  replaySeconds: number,
) {
  if (!episode) return null;
  const replayAt = Date.parse(episode.originTime) + Math.max(0, replaySeconds) * 1000;
  return episode.reports.reduce<JmaTsunamiSnapshot | null>((latest, report) => {
    const issuedAt = Date.parse(report.issuedAt ?? "");
    return Number.isFinite(issuedAt) && issuedAt <= replayAt ? report : latest;
  }, null);
}

export function jmaTsunamiReplayDurationSeconds(
  originTime: string,
  episode: JmaTsunamiReplayEpisode | null,
) {
  const origin = Date.parse(originTime);
  if (!Number.isFinite(origin) || !episode?.reports.length) return 300;
  const finalReport = episode.reports[episode.reports.length - 1];
  const finalIssuedAt = Date.parse(finalReport.issuedAt ?? "");
  if (!Number.isFinite(finalIssuedAt)) return 300;
  const tailSeconds = finalReport.cancelled ? 60 : 30 * 60;
  return Math.max(300, Math.min(24 * 60 * 60, Math.ceil((finalIssuedAt - origin) / 1000) + tailSeconds));
}

export const JMA_TSUNAMI_COLORS = {
  1: "#ffff00",
  2: "#ff0000",
  3: "#ff00ff",
} as const;

export function jmaTsunamiLineStyle(level: number) {
  const safeLevel = level === 3 ? 3 : level === 2 ? 2 : 1;
  return {
    color: JMA_TSUNAMI_COLORS[safeLevel],
    weight: safeLevel === 3 ? 7 : safeLevel === 2 ? 6 : 5,
    opacity: 1,
    lineCap: "round" as const,
    lineJoin: "round" as const,
  };
}

export const LIVE_EEW_SOURCE_ORDER = [
  "JMA",
  "KMA",
  "CENC",
  "CWA",
  "EARLY-EST",
  "GLOBALQUAKE",
  "USGS",
  "SHAKEALERT",
  "EMSC",
  "GFZ",
  "GEONET",
  "BMKG",
] as const;

export type LiveEewSource = typeof LIVE_EEW_SOURCE_ORDER[number];
export type WarningSourceFilter = "ALL" | LiveEewSource;

export type EewAffectedArea = {
  name: string;
  intensity: string;
  rank: number;
  warning: boolean;
};

export type LiveEew = {
  id: string;
  source: LiveEewSource;
  title: string;
  serial: number;
  announcedAt: string;
  originTime: string;
  place: string;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number | null;
  maxIntensity: string;
  final: boolean;
  warning: boolean;
  cancelled: boolean;
  assumption: boolean;
  relay: "Wolfx" | "FAN" | "Authorized" | "Catalogue";
  observedIntensity?: boolean;
  /** JMA 震度速報首报 may carry official areas before a hypocenter is available. */
  hypocenterKnown?: boolean;
  affectedAreas?: EewAffectedArea[];
};

export type ReplayIntensityScale = "shindo" | "intensity";

export type JmaSeismicSite = readonly [latitude: number, longitude: number, arv: number];

export type JmaSeismicSiteCatalogue = {
  source: string;
  generatedAt: string;
  regions: Record<string, JmaSeismicSite[]>;
};

export type JmaRegionImpact = {
  rank: number;
  currentRank: number;
  arrived: boolean;
  firstSArrivalSeconds: number;
};

export function eewReportKey(event: LiveEew) {
  return `${event.id}:${event.serial}:${event.announcedAt}`;
}

export function mergeEewHistory(current: LiveEew[], next: LiveEew, limit = 240) {
  const nextKey = eewReportKey(next);
  return [next, ...current.filter((event) => eewReportKey(event) !== nextKey)]
    .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt))
    .slice(0, Math.max(1, limit));
}

export type OfficialHypocenterRecord = {
  id: string;
  source: string;
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
  agency: string;
  url: string;
  intensity?: string | null;
  intensityScale?: string | null;
  affectedAreas?: EewAffectedArea[];
};

export type EewHistoryEvent = {
  key: string;
  latestReport: LiveEew;
  reports: LiveEew[];
  reportCount: number;
  officialHypocenter: OfficialHypocenterRecord | null;
};

export function isSameEewEvent(a: LiveEew, b: LiveEew) {
  if (a.id === b.id) return true;
  if (a.source !== b.source) return false;
  const aOrigin = Date.parse(a.originTime);
  const bOrigin = Date.parse(b.originTime);
  if (!Number.isFinite(aOrigin) || !Number.isFinite(bOrigin) || Math.abs(aOrigin - bOrigin) > 120_000) return false;
  return haversineKm(a, b) <= 100;
}

/**
 * Links reports that belong on the same warning/replay timeline.
 *
 * Located reports must describe the same nearby hypocenter. A source may send
 * an initial "hypocenter unknown" prompt before coordinates arrive, so that
 * one narrow case is allowed to match by source and origin time only. Keeping
 * the exception here prevents unrelated, near-simultaneous catalogue events
 * from being merged across continents.
 */
export function isRelatedEewReport(seed: LiveEew, report: LiveEew) {
  if (isSameEewEvent(seed, report)) return true;
  if (seed.source !== report.source) return false;
  if (seed.hypocenterKnown !== false && report.hypocenterKnown !== false) return false;
  const seedOrigin = Date.parse(seed.originTime);
  const reportOrigin = Date.parse(report.originTime);
  return Number.isFinite(seedOrigin)
    && Number.isFinite(reportOrigin)
    && Math.abs(seedOrigin - reportOrigin) <= 120_000;
}

export function matchOfficialHypocenter(
  event: LiveEew,
  records: OfficialHypocenterRecord[],
) {
  const source = event.source.toLowerCase();
  const eventSourceId = event.id.replace(/^[^:]+:/, "");
  const originTime = Date.parse(event.originTime);
  const candidates = records.flatMap((record) => {
    if (record.source.toLowerCase() !== source) return [];
    const exactId = record.sourceEventId === eventSourceId;
    const officialTime = Date.parse(record.time);
    const timeDistanceMs = Number.isFinite(originTime) && Number.isFinite(officialTime)
      ? Math.abs(originTime - officialTime)
      : Number.POSITIVE_INFINITY;
    const distanceKm = haversineKm(event, record);
    if (!exactId && (timeDistanceMs > 300_000 || distanceKm > 150)) return [];
    return [{ record, score: exactId ? -1 : timeDistanceMs / 1000 + distanceKm }];
  });
  return candidates.sort((a, b) => a.score - b.score)[0]?.record ?? null;
}

export function collapseEewHistoryEvents(
  reports: LiveEew[],
  officialRecords: OfficialHypocenterRecord[] = [],
) {
  const groups: LiveEew[][] = [];
  const sorted = [...reports].sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt));
  for (const report of sorted) {
    const group = groups.find((items) => items.some((item) => isSameEewEvent(item, report)));
    if (group) group.push(report);
    else groups.push([report]);
  }

  return groups.map<EewHistoryEvent>((group) => {
    const uniqueReports = [...group]
      .sort((a, b) => (b.serial - a.serial) || (Date.parse(b.announcedAt) - Date.parse(a.announcedAt)))
      .filter((report, index, items) => items.findIndex((item) => item.serial === report.serial) === index);
    const latestReport = uniqueReports[0];
    const originTime = Date.parse(latestReport.originTime);
    const originKey = Number.isFinite(originTime) ? Math.round(originTime / 1000) : latestReport.originTime;
    return {
      key: `${latestReport.source}:${originKey}:${latestReport.latitude.toFixed(2)}:${latestReport.longitude.toFixed(2)}`,
      latestReport,
      reports: uniqueReports,
      reportCount: uniqueReports.length,
      officialHypocenter: matchOfficialHypocenter(latestReport, officialRecords),
    };
  }).sort((a, b) => Date.parse(b.latestReport.announcedAt) - Date.parse(a.latestReport.announcedAt));
}

const INSTITUTION_EEW_SOURCES: Record<string, LiveEewSource> = {
  usgs: "USGS",
  shakealert: "SHAKEALERT",
  jma: "JMA",
  cenc: "CENC",
  cwa: "CWA",
  emsc: "EMSC",
  gfz: "GFZ",
  geonet: "GEONET",
  bmkg: "BMKG",
};

export function institutionReportToLiveEew(record: OfficialHypocenterRecord): LiveEew | null {
  const source = INSTITUTION_EEW_SOURCES[String(record.source ?? "").toLowerCase()];
  const originTime = Date.parse(record.time);
  const announcedAt = Date.parse(record.updatedAt ?? record.time);
  if (!source || !Number.isFinite(originTime) || !Number.isFinite(announcedAt)) return null;
  if (!Number.isFinite(record.latitude) || !Number.isFinite(record.longitude) || !Number.isFinite(record.magnitude)) return null;
  const intensity = String(record.intensity ?? "").trim();
  const intensityScale = String(record.intensityScale ?? "").trim();
  const maxIntensity = intensity
    ? `${intensityScale ? `${intensityScale} ` : ""}${intensity}`
    : "未提供";

  return {
    id: `${source}:${record.sourceEventId}`,
    source,
    title: source === "SHAKEALERT" ? "ShakeAlert 事后性能报告" : "机构地震报告",
    serial: 1,
    announcedAt: new Date(announcedAt).toISOString(),
    originTime: new Date(originTime).toISOString(),
    place: record.place || "未命名震中",
    latitude: record.latitude,
    longitude: record.longitude,
    depthKm: Number.isFinite(record.depthKm) ? record.depthKm : null,
    magnitude: record.magnitude,
    maxIntensity,
    final: true,
    warning: false,
    cancelled: false,
    assumption: false,
    relay: "Catalogue",
    affectedAreas: record.affectedAreas?.length ? record.affectedAreas : undefined,
  };
}

export function enrichLiveEewWithOfficialAreas(
  event: LiveEew | null,
  records: OfficialHypocenterRecord[],
) {
  if (!event || event.affectedAreas?.length) return event;
  const official = matchOfficialHypocenter(event, records);
  return official?.affectedAreas?.length
    ? { ...event, affectedAreas: official.affectedAreas }
    : event;
}

export function buildInstitutionHistoryReports(
  records: OfficialHypocenterRecord[],
  now = Date.now(),
  windowMs = 7 * 24 * 60 * 60 * 1000,
  perSourceLimit = 80,
) {
  const cutoff = now - Math.max(1, windowMs);
  const sourceCounts = new Map<LiveEewSource, number>();
  return records
    .flatMap((record) => institutionReportToLiveEew(record) ?? [])
    .filter((event) => Date.parse(event.originTime) >= cutoff)
    .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt))
    .filter((event) => {
      const count = sourceCounts.get(event.source) ?? 0;
      if (count >= Math.max(1, perSourceLimit)) return false;
      sourceCounts.set(event.source, count + 1);
      return true;
    });
}

export function filterEewHistoryEventsBySource(
  events: EewHistoryEvent[],
  source: WarningSourceFilter,
) {
  return source === "ALL" ? events : events.filter((event) => event.latestReport.source === source);
}

export function liveEewDisplayDurationMs(event: LiveEew) {
  if (event.cancelled) return 20_000;
  // JMA observed-intensity reports are not EEW warnings and often arrive as
  // a short series (ScalePrompt -> Destination -> DetailScale). Keep the
  // latest official area paint visible long enough to survive a slow poll or
  // a brief relay outage while still expiring it from the live strip.
  const minimumMinutes = event.observedIntensity ? 30 : event.warning ? 6 : 3;
  const magnitude = Number.isFinite(event.magnitude) ? Number(event.magnitude) : minimumMinutes;
  return Math.max(magnitude, minimumMinutes) * 60_000;
}

export function isLiveEewActive(event: LiveEew, now = Date.now()) {
  const announcedAt = Date.parse(event.announcedAt);
  if (!Number.isFinite(announcedAt)) return false;
  const activityStartedAt = event.relay === "Catalogue" ? Date.parse(event.originTime) : announcedAt;
  if (!Number.isFinite(activityStartedAt)) return false;
  // P2P/JMA relays can be ahead of the local clock (and ScalePrompt is still
  // actionable as soon as it is received). Do not hide an observed report
  // merely because its published timestamp is a few minutes or hours ahead.
  const observedClockSkew = Boolean(event.observedIntensity)
    && announcedAt > now
    && announcedAt - now <= 6 * 60 * 60_000;
  return (observedClockSkew || now >= announcedAt - 120_000)
    && (observedClockSkew || now >= activityStartedAt - 120_000)
    && now <= activityStartedAt + liveEewDisplayDurationMs(event);
}

export function shouldDisplayLiveWavefront(
  event: LiveEew,
  now = Date.now(),
  stopOnFinal = true,
) {
  if (event.cancelled || event.observedIntensity || (stopOnFinal && event.final)) return false;
  if (event.hypocenterKnown === false || !Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) return false;
  const originTime = Date.parse(event.originTime);
  if (!Number.isFinite(originTime)) return false;
  const elapsedMs = now - originTime;
  return elapsedMs >= 0 && elapsedMs < 300_000;
}

export function shouldDisplayRegionalWarning(
  event: LiveEew,
  keepLatestWarningVisible: boolean,
  terminated: boolean,
  now = Date.now(),
) {
  return keepLatestWarningVisible || (!terminated && shouldDisplayLiveWavefront(event, now));
}

export function isReplayPropagationActive(elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return false;
  // The replay clock is rendered to hundredths. Close propagation as soon as
  // the visible clock rounds to T+300.00 so circles and detection grids cannot
  // linger for one extra render at values such as 299.996.
  return Math.round(elapsedSeconds * 100) < 30_000;
}

export function meetsEewMagnitudeThreshold(
  event: Pick<LiveEew, "magnitude"> & Partial<Pick<LiveEew, "observedIntensity">>,
  minimumMagnitude: number,
) {
  const threshold = Math.max(1, Math.min(9, Number(minimumMagnitude) || 1));
  if (event.observedIntensity) return true;
  return Number.isFinite(event.magnitude) && Number(event.magnitude) >= threshold;
}

export function selectAutoLocatedGlobalEvent(
  events: LiveEew[],
  minimumMagnitude: number,
  now = Date.now(),
) {
  return selectAutoLocatedGlobalEvents(events, minimumMagnitude, now)[0] ?? null;
}

export function selectAutoLocatedGlobalEvents(
  events: LiveEew[],
  minimumMagnitude: number,
  now = Date.now(),
) {
  const threshold = Math.max(0, Number(minimumMagnitude) || 0);
  const newestReports = new Map<string, LiveEew>();
  for (const event of events) {
    if (event.relay !== "Catalogue" && event.relay !== "Authorized") continue;
    const physicalKey = `${event.id}:${event.originTime}`;
    const previous = newestReports.get(physicalKey);
    if (!previous
      || event.serial > previous.serial
      || Date.parse(event.announcedAt) > Date.parse(previous.announcedAt)) {
      newestReports.set(physicalKey, event);
    }
  }
  return [...newestReports.values()]
    .filter((event) => (event.relay === "Catalogue" || event.relay === "Authorized")
      && !event.cancelled
      && (event.magnitude ?? Number.NEGATIVE_INFINITY) >= threshold
      && isLiveEewActive(event, now))
    .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt)
      || Date.parse(b.originTime) - Date.parse(a.originTime));
}

export type MovieCameraQueueState = {
  currentKey: string | null;
  enteredAt: number;
  knownKeys: string[];
};

export function advanceMovieCameraQueue(
  events: LiveEew[],
  state: MovieCameraQueueState,
  now = Date.now(),
  dwellMs = 5_000,
): MovieCameraQueueState {
  const eventKeys = [...new Set(events.map((event) => `${event.id}:${event.originTime}`))];
  if (!eventKeys.length) return { currentKey: null, enteredAt: 0, knownKeys: [] };
  const activeKeys = new Set(eventKeys);
  const knownKeys = state.knownKeys.filter((key) => activeKeys.has(key));
  const knownSet = new Set(knownKeys);
  const newestUnseen = eventKeys.find((key) => !knownSet.has(key));
  for (const key of eventKeys) {
    if (!knownSet.has(key)) knownKeys.push(key);
  }
  if (newestUnseen) return { currentKey: newestUnseen, enteredAt: now, knownKeys };
  const currentIndex = eventKeys.indexOf(state.currentKey ?? "");
  if (currentIndex < 0) return { currentKey: eventKeys[0], enteredAt: now, knownKeys };
  if (eventKeys.length > 1 && now - state.enteredAt >= Math.max(1, dwellMs)) {
    return {
      currentKey: eventKeys[(currentIndex + 1) % eventKeys.length],
      enteredAt: now,
      knownKeys,
    };
  }
  return { currentKey: state.currentKey, enteredAt: state.enteredAt, knownKeys };
}

export type StationSample = {
  timestamp: number;
  value: number;
  label: string;
};

export type TriggerObservation = {
  stationId: string;
  latitude: number;
  longitude: number;
  triggeredAt: number;
};

type DetectorSample = {
  timestamp: number;
  level: number;
};

type DetectorStationState = {
  recent: DetectorSample[];
  ascend: number;
  activity: number;
  activityLevel: number;
  activeUntil: number;
  activationAt: number;
  triggerAt: number;
};

export type ShakeDetectorState = {
  kind: "NIED" | "KMA-PEWS";
  stations: DetectorStationState[];
  periodStartedAt: number;
  periodMaxLevel: number;
  qualifiedUntil: number;
  lastTimestamp: number;
};

export type ShakeDetectionStatus = {
  network: "NIED" | "KMA-PEWS";
  detected: boolean;
  activeStationIds: string[];
  /** Isolated or sub-threshold rises that have not formed a detection cluster. */
  weakStationIds: string[];
  clusterCount: number;
  currentMaxLevel: number;
  currentMaxLabel: string;
  periodMaxLevel: number;
  periodMaxLabel: string;
  updatedAt: number;
};

export type ShakeDetectionUpdate = {
  state: ShakeDetectorState;
  status: ShakeDetectionStatus;
  observations: TriggerObservation[];
};

export type HypocenterEstimate = {
  latitude: number;
  longitude: number;
  depthKm: number;
  originTime: number;
  residualMs: number;
  confidence: number;
  stationCount: number;
  method: string;
  referenceDistanceKm?: number;
  unconstrainedDistanceKm?: number;
};

export type ReplayStationSimulation = {
  ranks: Record<string, number>;
  /** Stations reached by the P wave. This set only grows as replay time advances. */
  arrivedStationIds: string[];
  /** Stations reached by the S wave. This set only grows as replay time advances. */
  sArrivedStationIds: string[];
  activeStationIds: string[];
  observations: TriggerObservation[];
  maxRank: number;
};

export type ReplayStationResponseProfile = {
  originTime: number;
  maximumRank: number;
  stations: Array<{
    id: string;
    latitude: number;
    longitude: number;
    pArrivalSeconds: number;
    sArrivalSeconds: number;
    expectedPeak: number;
  }>;
};

export type NiedGridAnchor = {
  latitude: number;
  longitude: number;
};

export type NiedDetectionGridCell = {
  id: string;
  center: [number, number];
  bounds: [[number, number], [number, number]];
  stationIds: string[];
  maxRank: number;
  color: "green" | "yellow" | "red";
};

export type NiedSoundCue = "shindo0" | "shindo1" | "shindo2" | "shindo3" | "shindo4" | "shindo5" | "shindo6";

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as T | { error?: string; detail?: string } | null;
  if (!response.ok || !payload) {
    const errorPayload = payload as { error?: string; detail?: string } | null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `接口返回 ${response.status}`);
  }
  return payload as T;
}

export function fetchNiedStations(signal?: AbortSignal) {
  return fetchJson<NiedStationCatalogue>("/api/seismic/nied/stations", signal);
}

export function fetchNiedRealtime(signal?: AbortSignal) {
  return fetchJson<NiedRealtimeFrame>("/api/seismic/nied/realtime", signal);
}

export function fetchKmaPews(signal?: AbortSignal) {
  return fetchJson<KmaPewsSnapshot>("/api/seismic/kma-pews", signal);
}

export function fetchCencIntensity(id?: string | null, signal?: AbortSignal) {
  const query = id ? `?id=${encodeURIComponent(id)}` : "";
  return fetchJson<CencIntensityRelaySnapshot>(`/api/seismic/cenc-intensity${query}`, signal);
}

export function fetchPalertStations(signal?: AbortSignal) {
  return fetchJson<PalertSnapshot>("/api/seismic/palert", signal);
}

export function fetchPalertRealtime(signal?: AbortSignal) {
  return fetchJson<PalertRealtimeFrame>("/api/seismic/palert/realtime", signal);
}

export function fetchPalertEvents(days = 120, signal?: AbortSignal) {
  return fetchJson<PalertEventCatalogue>(`/api/seismic/palert/events?days=${encodeURIComponent(days)}`, signal);
}

export function fetchPalertEventStations(event: string, signal?: AbortSignal) {
  return fetchJson<PalertEventStationSnapshot>(`/api/seismic/palert/event-stations?event=${encodeURIComponent(event)}`, signal);
}

export function palertEventFileUrl(event: string, type: string) {
  return `/api/seismic/palert/event-file?event=${encodeURIComponent(event)}&type=${encodeURIComponent(type)}`;
}

export function fetchEewRelay(signal?: AbortSignal) {
  return fetchJson<EewRelaySnapshot>("/api/seismic/eew", signal);
}

export function fetchExternalWarnings(signal?: AbortSignal) {
  return fetchJson<ExternalWarningSnapshot>("/api/seismic/external-warnings", signal);
}

export function fetchJmaTsunami(signal?: AbortSignal) {
  return fetchJson<JmaTsunamiSnapshot>("/api/seismic/jma-tsunami", signal);
}

export function fetchJmaTsunamiHistory(signal?: AbortSignal) {
  return fetchJson<JmaTsunamiHistorySnapshot>("/api/seismic/jma-tsunami-history", signal);
}

export function fetchOceanStations(signal?: AbortSignal) {
  return fetchJson<OceanStationCatalogue>("/api/seismic/ocean-stations", signal);
}

export function fetchSnetIntensity(signal?: AbortSignal) {
  return fetchJson<SnetIntensitySnapshot>("/api/seismic/snet-intensity", signal);
}

export function niedCharToLevel(value: string | undefined) {
  if (!value) return 0;
  return Math.max(0, Math.min(20, value.charCodeAt(0) - 100));
}

export function niedLevelLabel(level: number) {
  if (level <= 7) return "0";
  if (level <= 9) return "1";
  if (level <= 11) return "2";
  if (level <= 13) return "3";
  if (level <= 15) return "4";
  if (level === 16) return "5-";
  if (level === 17) return "5+";
  if (level === 18) return "6-";
  if (level === 19) return "6+";
  return "7";
}

export function niedLevelRank(level: number) {
  const label = niedLevelLabel(level);
  return ({ "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5-": 5, "5+": 5.5, "6-": 6, "6+": 6.5, "7": 7 } as Record<string, number>)[label];
}

export function intensityColor(rank: number) {
  return jmaShindoColor(rank);
}

const KANAMEISHI_COLORS = {
  darkGray: "#9f9f9f",
  gray: "#cfcfcf",
  skyBlue: "#5fcfff",
  blue: "#3fafff",
  green: "#5fdf8f",
  yellow: "#f7e757",
  orange: "#ff8f00",
  darkOrange: "#ff4f00",
  red: "#df0f0f",
  darkRed: "#af0000",
  purple: "#7f007f",
} as const;

export const MMI_LEGEND = [
  { rank: 1, label: "I" },
  { rank: 2, label: "II" },
  { rank: 3, label: "III" },
  { rank: 4, label: "IV" },
  { rank: 5, label: "V" },
  { rank: 6, label: "VI" },
  { rank: 7, label: "VII" },
  { rank: 8, label: "VIII" },
  { rank: 9, label: "IX" },
  { rank: 10, label: "\u2265X" },
] as const;

export const JMA_SHINDO_LEGEND = [
  { rank: 1, label: "1" },
  { rank: 2, label: "2" },
  { rank: 3, label: "3" },
  { rank: 4, label: "4" },
  { rank: 5, label: "5-" },
  { rank: 5.5, label: "5+" },
  { rank: 6, label: "6-" },
  { rank: 6.5, label: "6+" },
  { rank: 7, label: "7" },
] as const;

export function jmaShindoColor(rank: number) {
  if (rank < 1) return KANAMEISHI_COLORS.darkGray;
  if (rank < 2) return KANAMEISHI_COLORS.gray;
  if (rank < 3) return KANAMEISHI_COLORS.blue;
  if (rank < 4) return KANAMEISHI_COLORS.green;
  if (rank < 5) return KANAMEISHI_COLORS.yellow;
  if (rank < 5.5) return KANAMEISHI_COLORS.orange;
  if (rank < 6) return KANAMEISHI_COLORS.darkOrange;
  if (rank < 6.5) return KANAMEISHI_COLORS.red;
  if (rank < 7) return KANAMEISHI_COLORS.darkRed;
  return KANAMEISHI_COLORS.purple;
}

export function jmaShindoLabel(rank: number) {
  if (rank < 0.5) return "0";
  if (rank < 1.5) return "1";
  if (rank < 2.5) return "2";
  if (rank < 3.5) return "3";
  if (rank < 4.5) return "4";
  if (rank < 5.25) return "5-";
  if (rank < 5.75) return "5+";
  if (rank < 6.25) return "6-";
  if (rank < 6.75) return "6+";
  return "7";
}

export function jmaShindoRank(instShindo: number) {
  if (!Number.isFinite(instShindo) || instShindo < 0.5) return 0;
  if (instShindo < 1.5) return 1;
  if (instShindo < 2.5) return 2;
  if (instShindo < 3.5) return 3;
  if (instShindo < 4.5) return 4;
  if (instShindo < 5) return 5;
  if (instShindo < 5.5) return 5.5;
  if (instShindo < 6) return 6;
  if (instShindo < 6.5) return 6.5;
  return 7;
}

export function intensityRomanLabel(intensity: number) {
  const rounded = Math.round(Number(intensity));
  if (!Number.isFinite(rounded) || rounded < 1) return "<I";
  return MMI_LEGEND[Math.min(10, rounded) - 1].label;
}

export function mmiIntensityColor(intensity: number) {
  const rounded = Math.round(Number(intensity));
  if (rounded <= 1) return KANAMEISHI_COLORS.darkGray;
  if (rounded === 2) return KANAMEISHI_COLORS.gray;
  if (rounded === 3) return KANAMEISHI_COLORS.skyBlue;
  if (rounded === 4) return KANAMEISHI_COLORS.blue;
  if (rounded === 5) return KANAMEISHI_COLORS.green;
  if (rounded === 6) return KANAMEISHI_COLORS.yellow;
  if (rounded === 7) return KANAMEISHI_COLORS.orange;
  if (rounded === 8) return KANAMEISHI_COLORS.darkOrange;
  if (rounded === 9) return KANAMEISHI_COLORS.red;
  return KANAMEISHI_COLORS.purple;
}

export const PALERT_PGA_LEGEND = [
  { minimum: Number.NEGATIVE_INFINITY, label: "<0.8", color: "rgb(255, 255, 255)" },
  { minimum: 0.8, label: "0.8", color: "rgb(200, 255, 211)" },
  { minimum: 2.5, label: "2.5", color: "rgb(28, 255, 28)" },
  { minimum: 8, label: "8", color: "rgb(255, 255, 0)" },
  { minimum: 25, label: "25", color: "rgb(255, 170, 0)" },
  { minimum: 80, label: "80", color: "rgb(255, 90, 0)" },
  { minimum: 140, label: "140", color: "rgb(209, 54, 15)" },
  { minimum: 250, label: "250", color: "rgb(161, 52, 35)" },
  { minimum: 440, label: "440", color: "rgb(153, 12, 51)" },
  { minimum: 800, label: "800", color: "rgb(153, 41, 165)" },
] as const;

export const PALERT_PGV_LEGEND = [
  { minimum: Number.NEGATIVE_INFINITY, label: "<0.2", color: "rgb(255, 255, 255)" },
  { minimum: 0.2, label: "0.2", color: "rgb(200, 255, 211)" },
  { minimum: 0.7, label: "0.7", color: "rgb(28, 255, 28)" },
  { minimum: 1.9, label: "1.9", color: "rgb(255, 255, 0)" },
  { minimum: 5.7, label: "5.7", color: "rgb(255, 170, 0)" },
  { minimum: 15, label: "15", color: "rgb(255, 90, 0)" },
  { minimum: 30, label: "30", color: "rgb(209, 54, 15)" },
  { minimum: 50, label: "50", color: "rgb(161, 52, 35)" },
  { minimum: 80, label: "80", color: "rgb(153, 12, 51)" },
  { minimum: 140, label: "140", color: "rgb(153, 41, 165)" },
] as const;

export function palertPgaColor(pgaGal: number | null | undefined) {
  if (pgaGal === null || pgaGal === undefined || !Number.isFinite(pgaGal) || pgaGal < 0) return "#050706";
  for (let index = PALERT_PGA_LEGEND.length - 1; index >= 0; index -= 1) {
    const item = PALERT_PGA_LEGEND[index];
    if (pgaGal >= item.minimum) return item.color;
  }
  return PALERT_PGA_LEGEND[0].color;
}

export function palertPgvColor(pgvCms: number | null | undefined) {
  if (pgvCms === null || pgvCms === undefined || !Number.isFinite(pgvCms) || pgvCms < 0) return "#050706";
  for (let index = PALERT_PGV_LEGEND.length - 1; index >= 0; index -= 1) {
    const item = PALERT_PGV_LEGEND[index];
    if (pgvCms >= item.minimum) return item.color;
  }
  return PALERT_PGV_LEGEND[0].color;
}

export function shouldShowStationValueIcon(scale: "intensity" | "shindo", rank: number, includeLowest: boolean) {
  if (!Number.isFinite(rank)) return false;
  if (scale === "shindo") return rank >= (includeLowest ? 0 : 0.5);
  return rank >= (includeLowest ? 0.5 : 1.5);
}

const NIED_RAW_COLORS = [
  "#0003cf", "#0014da", "#0037f0", "#006cdc", "#00b3a2", "#12dc72",
  "#31f049", "#64fb2a", "#9dfe17", "#ccff09", "#ebff03", "#fff500",
  "#ffe500", "#ffca00", "#ffa600", "#ff7e00", "#ff5900", "#fd3500",
  "#f81100", "#e50000", "#bd0000",
] as const;

export function niedStationDisplayColor(rawLevel: number, activeRank: number | null) {
  if (activeRank !== null) {
    if (activeRank < 1) return "#31f049";
    if (activeRank < 2) return "#d1d5db";
    if (activeRank < 3) return "#38bdf8";
    if (activeRank < 4) return "#22c55e";
    if (activeRank < 5) return "#facc15";
    if (activeRank < 6) return "#fb923c";
    if (activeRank < 7) return "#ef4444";
    return "#a855f7";
  }
  const index = Math.max(0, Math.min(NIED_RAW_COLORS.length - 1, Math.round(rawLevel)));
  return NIED_RAW_COLORS[index];
}

const NIED_PRO_COLORS = [
  "#20df54", "#47c7aa", "#b8e3b4", "#d8ddc4", "#d8cf65",
  "#d88d32", "#d15331", "#c43a3c", "#8f2030", "#942a86",
] as const;

/** NIED Pro's compact map palette: idle stations stay blue and every weak
 * response becomes green before the official JMA intensity colors take over. */
export function niedProStationDisplayColor(activeRank: number | null, weak = false) {
  if (activeRank === null) return "#1447e6";
  if (weak || activeRank < 0.5) return NIED_PRO_COLORS[0];
  if (activeRank < 1.5) return NIED_PRO_COLORS[1];
  if (activeRank < 2.5) return NIED_PRO_COLORS[2];
  if (activeRank < 3.5) return NIED_PRO_COLORS[3];
  if (activeRank < 4.5) return NIED_PRO_COLORS[4];
  if (activeRank < 5.25) return NIED_PRO_COLORS[5];
  if (activeRank < 5.75) return NIED_PRO_COLORS[6];
  if (activeRank < 6.25) return NIED_PRO_COLORS[7];
  if (activeRank < 6.75) return NIED_PRO_COLORS[8];
  return NIED_PRO_COLORS[9];
}

export function niedGridColor(maxRank: number): NiedDetectionGridCell["color"] {
  if (maxRank >= 4) return "red";
  if (maxRank >= 2) return "yellow";
  return "green";
}

function coordinateFraction(value: number) {
  const fraction = ((value + 180) % 1 + 1) % 1;
  return Math.round(fraction * 100) / 100;
}

export function niedGridAnchor(station: Pick<SeismicStation, "latitude" | "longitude">): NiedGridAnchor {
  return {
    latitude: coordinateFraction(station.latitude),
    longitude: coordinateFraction(station.longitude),
  };
}

export function buildNiedDetectionGridCells(
  stations: Array<Pick<SeismicStation, "id" | "latitude" | "longitude">>,
  activeStationIds: string[],
  ranks: Record<string, number>,
  anchor?: NiedGridAnchor,
): NiedDetectionGridCell[] {
  const activeSet = new Set(activeStationIds);
  const activeStations = stations.filter((station) => activeSet.has(station.id));
  if (!activeStations.length) return [];
  const resolvedAnchor = anchor ?? niedGridAnchor(activeStations[0]);
  const cells = new Map<string, NiedDetectionGridCell>();

  for (const station of activeStations) {
    const latitude = Math.round((Math.round(station.latitude - resolvedAnchor.latitude) + resolvedAnchor.latitude) * 100) / 100;
    const longitude = Math.round((Math.round(station.longitude - resolvedAnchor.longitude) + resolvedAnchor.longitude) * 100) / 100;
    const id = `${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    const rank = Math.max(0, Number(ranks[station.id] ?? 0));
    const current = cells.get(id);
    if (current) {
      current.stationIds.push(station.id);
      current.maxRank = Math.max(current.maxRank, rank);
      current.color = niedGridColor(current.maxRank);
      continue;
    }
    cells.set(id, {
      id,
      center: [latitude, longitude],
      bounds: [[latitude - 0.5, longitude - 0.5], [latitude + 0.5, longitude + 0.5]],
      stationIds: [station.id],
      maxRank: rank,
      color: niedGridColor(rank),
    });
  }

  return [...cells.values()].sort((a, b) => a.center[0] - b.center[0] || a.center[1] - b.center[1]);
}

export function niedSoundIndex(rawLevel: number) {
  if (rawLevel < 0) return -1;
  return Math.floor(niedLevelRank(rawLevel));
}

export function replayNiedSoundIndex(simulation: Pick<ReplayStationSimulation, "activeStationIds" | "maxRank"> | null) {
  if (!simulation?.activeStationIds.length) return -1;
  return Math.floor(Math.max(0, Math.min(7, simulation.maxRank)));
}

export function niedSoundCueForRise(previousShindo: number, currentShindo: number, enabled: boolean): NiedSoundCue | null {
  if (!enabled || currentShindo < 0 || currentShindo <= previousShindo) return null;
  return `shindo${Math.min(6, currentShindo)}` as NiedSoundCue;
}

export function estimateGroundMotion(intensityRank: number) {
  if (intensityRank <= 0) return { pgaGal: 0, pgvCms: 0 };
  return {
    pgaGal: Math.min(2500, 10 ** (0.5 * intensityRank - 0.35)),
    pgvCms: Math.min(250, 10 ** (0.5 * intensityRank - 1.3)),
  };
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRegionalTime(value: unknown, offset: "+09:00" | "+08:00") {
  const text = String(value ?? "").trim();
  if (!text) return new Date().toISOString();
  if (/Z$|[+-]\d\d:\d\d$/.test(text)) return new Date(text).toISOString();
  const normalized = text.replace(/\//g, "-").replace(" ", "T");
  const parsed = new Date(`${normalized}${offset}`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function parseKmaTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  const text = String(value ?? "").trim();
  if (!text) return Date.now();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  return Date.parse(parseRegionalTime(text, "+09:00"));
}

export function normalizeCencIntensityList(raw: unknown): CencIntensitySummary[] {
  if (!raw || typeof raw !== "object") return [];
  const envelope = raw as Record<string, unknown>;
  const rows = Array.isArray(envelope.Data) ? envelope.Data : Array.isArray(raw) ? raw : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const latitude = finite(item.epiLat ?? item.latitude);
    const longitude = finite(item.epiLon ?? item.longitude);
    if (latitude === null || longitude === null || item.id === undefined || item.id === null) return [];
    return [{
      id: String(item.id),
      eventId: String(item.uniEventId ?? item.eventId ?? item.id),
      originTime: parseRegionalTime(item.oriTime ?? item.shockTime, "+08:00"),
      place: String(item.locName ?? item.placeName ?? item.nameByInfo ?? "位置待定"),
      latitude,
      longitude,
      magnitude: finite(item.magnitude),
    }];
  }).sort((a, b) => Date.parse(b.originTime) - Date.parse(a.originTime));
}

export function normalizeCencIntensityDetail(raw: unknown): CencIntensityReport | null {
  if (!raw || typeof raw !== "object") return null;
  const envelope = raw as Record<string, unknown>;
  const value = envelope.Data && typeof envelope.Data === "object" ? envelope.Data : raw;
  const item = value as Record<string, unknown>;
  const latitude = finite(item.epiLat ?? item.latitude);
  const longitude = finite(item.epiLon ?? item.longitude);
  if (latitude === null || longitude === null || item.id === undefined || item.id === null) return null;
  const reportId = String(item.id);
  const stationRows = Array.isArray(item.station_metrics_json)
    ? item.station_metrics_json
    : Array.isArray(item.instrument_intensity_json)
      ? item.instrument_intensity_json
      : [];
  const stationMetrics = stationRows.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const station = row as Record<string, unknown>;
    const intensity = finite(station.INT);
    if (intensity === null) return [];
    const stationCode = String(station.stID ?? `IR-${index + 1}`);
    return [{
      id: `cenc-metric:${reportId}:${stationCode}`,
      reportId,
      stationCode,
      stationName: String(station.stName ?? stationCode),
      networkCode: String(station.NetCode ?? station.networkCode ?? "CENC"),
      intensity,
      pgaGal: finite(station.PGA),
      pgvCms: finite(station.PGV),
      distanceKm: finite(station.Dist),
      site: String(station.Site ?? ""),
    }];
  }).sort((a, b) => b.intensity - a.intensity);
  const stations = stationRows.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const station = row as Record<string, unknown>;
    const stationLatitude = finite(station.stla);
    const stationLongitude = finite(station.stlo);
    const intensity = finite(station.INT);
    if (stationLatitude === null || stationLongitude === null || intensity === null) return [];
    const stationCode = String(station.stID ?? `IR-${index + 1}`);
    const address = [station.Province, station.City, station.County, station.Town].map((part) => String(part ?? "").trim()).filter(Boolean).join("");
    return [{
      id: `cenc:${reportId}:${stationCode}`,
      reportId,
      latitude: stationLatitude,
      longitude: stationLongitude,
      network: "CENC-烈度" as const,
      stationCode,
      stationName: String(station.stName ?? stationCode),
      prefecture: String(station.Province ?? ""),
      intensity,
      pgaGal: finite(station.PGA),
      pgvCms: finite(station.PGV),
      pgaIntensity: finite(station.IPGA),
      pgvIntensity: finite(station.IPGV),
      distanceKm: finite(station.Dist),
      site: String(station.Site ?? ""),
      address,
    }];
  }).sort((a, b) => b.intensity - a.intensity);
  const contour = item.contour_geojson;
  return {
    id: reportId,
    eventId: String(item.uniEventId ?? item.eventId ?? reportId),
    originTime: parseRegionalTime(item.oriTime ?? item.shockTime, "+08:00"),
    place: String(item.locName ?? item.placeName ?? item.nameByInfo ?? "位置待定"),
    latitude,
    longitude,
    magnitude: finite(item.magnitude),
    depthKm: finite(item.focDepth ?? item.depth),
    createdAt: parseRegionalTime(item.gmtCreate ?? item.createTime ?? item.oriTime, "+08:00"),
    stations,
    stationMetrics,
    contourGeoJson: contour && typeof contour === "object" ? contour as Record<string, unknown> : null,
    relay: Array.isArray(item.station_metrics_json) ? "NEDC" : "FAN",
  };
}

export function cencIntensityColor(intensity: number) {
  return mmiIntensityColor(intensity);
}

export function normalizeWolfxEew(raw: unknown): LiveEew | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const type = String(item.type ?? "");
  if (type === "heartbeat") return null;

  if (type === "jma_intensity") {
    const rawLatitude = item.Latitude === null || item.Latitude === undefined ? null : finite(item.Latitude);
    const rawLongitude = item.Longitude === null || item.Longitude === undefined ? null : finite(item.Longitude);
    const hypocenterKnown = rawLatitude !== null && rawLatitude >= -90 && rawLatitude <= 90
      && rawLongitude !== null && rawLongitude >= -180 && rawLongitude <= 180;
    const latitude = hypocenterKnown ? rawLatitude : 0;
    const longitude = hypocenterKnown ? rawLongitude : 0;
    const affectedAreas = normalizeAffectedAreas(item.WarnArea, item.MaxIntensity);
    return {
      id: `JMA-INT:${String(item.EventID ?? item.OriginTime ?? "unknown")}`,
      source: "JMA",
      title: String(item.Title ?? "JMA 震度速報"),
      serial: finite(item.Serial) ?? 1,
      announcedAt: parseRegionalTime(item.AnnouncedTime, "+09:00"),
      originTime: parseRegionalTime(item.OriginTime, "+09:00"),
      place: String(item.Hypocenter || (hypocenterKnown ? "日本附近" : "震源待定")),
      latitude,
      longitude,
      depthKm: (() => { const raw = item.Depth; const value = raw === null || raw === undefined ? null : finite(raw); return value !== null && value >= 0 ? value : null; })(),
      magnitude: (() => { const raw = item.Magunitude ?? item.Magnitude; const value = raw === null || raw === undefined ? null : finite(raw); return value !== null && value >= 0 ? value : null; })(),
      maxIntensity: String(item.MaxIntensity ?? "--"),
      final: Boolean(item.isFinal),
      warning: false,
      cancelled: Boolean(item.isCancel),
      assumption: false,
      relay: "FAN",
      observedIntensity: true,
      hypocenterKnown,
      affectedAreas: affectedAreas.length ? affectedAreas : undefined,
    };
  }

  if (type === "jma_eew") {
    const latitude = finite(item.Latitude);
    const longitude = finite(item.Longitude);
    if (latitude === null || longitude === null) return null;
    const affectedAreas = normalizeAffectedAreas(item.WarnArea, item.MaxIntensity);
    return {
      id: `JMA:${String(item.EventID ?? item.OriginTime ?? "unknown")}`,
      source: "JMA",
      title: String(item.Title ?? "紧急地震速报"),
      serial: finite(item.Serial) ?? 1,
      announcedAt: parseRegionalTime(item.AnnouncedTime, "+09:00"),
      originTime: parseRegionalTime(item.OriginTime, "+09:00"),
      place: String(item.Hypocenter ?? "日本附近"),
      latitude,
      longitude,
      depthKm: finite(item.Depth),
      magnitude: finite(item.Magunitude ?? item.Magnitude),
      maxIntensity: String(item.MaxIntensity ?? "--"),
      final: Boolean(item.isFinal),
      warning: Boolean(item.isWarn),
      cancelled: Boolean(item.isCancel),
      assumption: Boolean(item.isAssumption),
      relay: "Wolfx",
      affectedAreas: affectedAreas.length ? affectedAreas : undefined,
    };
  }

  const source = type === "kma_eew" ? "KMA" : type === "cenc_eew" ? "CENC" : type === "cwa_eew" ? "CWA" : null;
  if (!source) return null;
  const latitude = finite(item.Latitude ?? item.latitude);
  const longitude = finite(item.Longitude ?? item.longitude);
  if (latitude === null || longitude === null) return null;
  const offset = source === "CENC" || source === "CWA" ? "+08:00" : "+09:00";
  const affectedAreas = normalizeAffectedAreas(
    item.WarnArea ?? item.affectedAreas ?? item.locationDesc,
    item.MaxIntensity ?? item.epiIntensity,
  );
  return {
    id: `${source}:${String(item.EventID ?? item.ID ?? item.id ?? item.OriginTime ?? item.shockTime ?? "unknown")}`,
    source,
    title: String(item.Title ?? `${source} 地震预警`),
    serial: finite(item.Serial ?? item.ReportNum ?? item.updates) ?? 1,
    announcedAt: parseRegionalTime(item.ReportTime ?? item.createTime ?? item.AnnouncedTime, offset),
    originTime: parseRegionalTime(item.OriginTime ?? item.shockTime, offset),
    place: String(item.HypoCenter ?? item.Hypocenter ?? item.placeName ?? "震中待定"),
    latitude,
    longitude,
    depthKm: finite(item.Depth ?? item.depth),
    magnitude: finite(item.Magunitude ?? item.Magnitude ?? item.magnitude),
    maxIntensity: String(item.MaxIntensity ?? item.epiIntensity ?? "--"),
    final: Boolean(item.isFinal),
    warning: Boolean(item.isWarn ?? true),
    cancelled: Boolean(item.isCancel),
    assumption: Boolean(item.isAssumption),
    relay: "Wolfx",
    affectedAreas: affectedAreas.length ? affectedAreas : undefined,
  };
}

function fanBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return new Set(["true", "1", "yes", "y"]).has(String(value ?? "").trim().toLowerCase());
}

export function intensityRank(value: unknown) {
  const text = String(value ?? "").trim();
  const direct = finite(text);
  if (direct !== null) return direct;
  const normalized = text
    .replace(/[级級]/g, "")
    .replace("弱", "-")
    .replace(/[强強]/g, "+");
  const ranks: Record<string, number> = { "5-": 5, "5+": 5.5, "6-": 6, "6+": 6.5, "7": 7 };
  return ranks[normalized] ?? null;
}

function normalizeAffectedAreas(value: unknown, fallbackIntensity: unknown): EewAffectedArea[] {
  if (!Array.isArray(value)) return [];
  const fallbackText = String(fallbackIntensity ?? "--");
  return value.flatMap((row) => {
    if (typeof row === "string") {
      const name = row.trim();
      if (!name) return [];
      return [{
        name,
        intensity: fallbackText,
        rank: intensityRank(fallbackText) ?? 0,
        warning: true,
      }];
    }
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const name = String(item.Chiiki ?? item.name ?? item.area ?? item.region ?? "").trim();
    if (!name) return [];
    const intensity = String(item.Shindo1 ?? item.intensity ?? item.maxIntensity ?? fallbackText);
    return [{
      name,
      intensity,
      rank: intensityRank(intensity) ?? intensityRank(fallbackText) ?? 0,
      warning: String(item.Type ?? item.type ?? "").includes("警") || Boolean(item.warning ?? true),
    }];
  });
}

function normalizeFanEew(sourceKey: string, raw: unknown): LiveEew | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const source = sourceKey === "jma"
    ? "JMA"
    : sourceKey === "cwa-eew"
      ? "CWA"
      : sourceKey === "cea" || sourceKey === "cea-pr"
        ? "CENC"
        : sourceKey === "kma-eew"
          ? "KMA"
          : null;
  if (!source) return null;

  const latitude = finite(item.latitude ?? item.Latitude ?? item.epiLat ?? item.lat);
  const longitude = finite(item.longitude ?? item.Longitude ?? item.epiLon ?? item.lon);
  if (latitude === null || longitude === null) return null;
  const offset = source === "JMA" || source === "KMA" ? "+09:00" : "+08:00";
  const eventId = String(item.eventId ?? item.EventID ?? item.id ?? item.ID ?? item.shockTime ?? "unknown");
  const maxIntensity = item.maxIntensity ?? item.MaxIntensity ?? item.epiIntensity ?? "--";
  const explicitWarning = item.warning ?? item.isWarn;
  const intensityValue = intensityRank(maxIntensity);
  const warning = explicitWarning === undefined
    ? source === "JMA"
      ? String(item.infoTypeName ?? item.typeName ?? "").includes("警報")
      : source === "CWA"
        ? (intensityValue ?? 0) >= 5
        : (intensityValue ?? 0) >= 6.5
    : fanBoolean(explicitWarning);

  const affectedAreas = normalizeAffectedAreas(
    item.WarnArea ?? item.affectedAreas ?? item.locationDesc,
    maxIntensity,
  );

  return {
    id: `${source}:${eventId}`,
    source,
    title: String(item.title ?? item.Title ?? item.infoTypeName ?? `${source} 地震预警`),
    serial: finite(item.updates ?? item.Serial ?? item.serial ?? item.ReportNum) ?? 1,
    announcedAt: parseRegionalTime(item.updateTime ?? item.createTime ?? item.reportTime ?? item.AnnouncedTime ?? item.shockTime, offset),
    originTime: parseRegionalTime(item.shockTime ?? item.OriginTime ?? item.originTime, offset),
    place: String(item.placeName ?? item.Hypocenter ?? item.HypoCenter ?? item.location ?? "震中待定"),
    latitude,
    longitude,
    depthKm: finite(item.depth ?? item.Depth ?? item.focDepth),
    magnitude: finite(item.magnitude ?? item.Magnitude ?? item.Magunitude),
    maxIntensity: String(maxIntensity),
    final: fanBoolean(item.final ?? item.isFinal),
    warning,
    cancelled: fanBoolean(item.cancel ?? item.isCancel),
    assumption: fanBoolean(item.assumption ?? item.isAssumption),
    relay: "FAN",
    affectedAreas: affectedAreas.length ? affectedAreas : undefined,
  };
}

export function normalizeFanEewEnvelope(raw: unknown): LiveEew[] {
  if (!raw || typeof raw !== "object") return [];
  const envelope = raw as Record<string, unknown>;
  const type = String(envelope.type ?? "");
  if (type === "update") {
    const sourceKey = String(envelope.source ?? "");
    const event = normalizeFanEew(sourceKey, envelope.Data ?? envelope.data);
    return event ? [event] : [];
  }
  if (type !== "initial_all" && type !== "query_response") return [];

  const nested = envelope.Data && typeof envelope.Data === "object"
    ? envelope.Data as Record<string, unknown>
    : envelope;
  const rows: Array<[string, unknown]> = [
    ["jma", nested.jma],
    ["cwa-eew", nested["cwa-eew"]],
    ["cea", nested.cea ?? nested["cea-pr"]],
    ["kma-eew", nested["kma-eew"]],
  ];
  return rows.flatMap(([sourceKey, value]) => {
    const wrapper = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const event = normalizeFanEew(sourceKey, wrapper?.Data ?? wrapper?.data ?? value);
    return event ? [event] : [];
  });
}

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function seismicWaveArrivalSeconds(
  event: { latitude: number; longitude: number; depthKm?: number | null },
  location: { latitude: number; longitude: number },
  velocityKmPerSecond: number,
) {
  const velocity = Number(velocityKmPerSecond);
  if (!Number.isFinite(velocity) || velocity <= 0) return Number.POSITIVE_INFINITY;
  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  const surfaceDistanceKm = haversineKm(event, location);
  return Math.hypot(surfaceDistanceKm, depthKm) / velocity;
}

const EARTH_RADIUS_KM = 6371;

function sourceToSurfaceDistanceKm(depthKm: number, surfaceDistanceKm: number) {
  const theta = surfaceDistanceKm / EARTH_RADIUS_KM;
  const sourceRadius = EARTH_RADIUS_KM - depthKm;
  return Math.sqrt(
    sourceRadius * sourceRadius
      + EARTH_RADIUS_KM * EARTH_RADIUS_KM
      - 2 * sourceRadius * EARTH_RADIUS_KM * Math.cos(theta),
  );
}

export function calculateJmaShindo(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  location: { latitude: number; longitude: number; arv?: number },
) {
  const magnitude = Number(event.magnitude ?? 0);
  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  const arv = Math.max(0.01, Number(location.arv ?? 1.4));
  if (!Number.isFinite(magnitude) || magnitude <= 0) return -3;
  const momentMagnitude = magnitude - 0.171;
  const ruptureLengthKm = 10 ** (0.5 * momentMagnitude - 1.85) / 2;
  const surfaceDistanceKm = haversineKm(event, location);
  const hypocentralDistanceKm = sourceToSurfaceDistanceKm(depthKm, surfaceDistanceKm) - ruptureLengthKm;
  const x = Math.max(hypocentralDistanceKm, 3);
  const pgv600 = 10 ** (
    0.58 * momentMagnitude
      + 0.0038 * depthKm
      - 1.29
      - Math.log10(x + 0.0028 * 10 ** (0.5 * momentMagnitude))
      - 0.002 * x
  );
  const pgv = pgv600 * 1.307 * arv;
  return 2.68 + 1.72 * Math.log10(Math.max(pgv, Number.EPSILON));
}

export function calculateLocalIntensity(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  location: { latitude: number; longitude: number },
) {
  const magnitude = Number(event.magnitude ?? 0);
  const depthKm = Math.max(10, Number(event.depthKm ?? 10));
  if (!Number.isFinite(magnitude) || magnitude <= 0) return 0;
  const surfaceDistanceKm = haversineKm(event, location);
  const lineDistanceKm = sourceToSurfaceDistanceKm(depthKm, surfaceDistanceKm);
  const ruptureLengthKm = 10 ** ((magnitude - 3.821) / 1.86);
  const adjustedDistanceKm = Math.max(
    lineDistanceKm - 10 - ruptureLengthKm,
    surfaceDistanceKm - ruptureLengthKm,
    0.2 * (lineDistanceKm - 10),
    0,
  );
  const cea = (distanceKm: number) => 1.297 * magnitude - 4.368 * Math.log10(distanceKm + 15) + 5.363;
  return Math.max(0, Math.min(12, (cea(surfaceDistanceKm) + cea(adjustedDistanceKm)) / 2));
}

export type GlobalImpactContour = {
  rank: number;
  radiusKm: number;
  currentRadiusKm: number;
  arrived: boolean;
  scale: ReplayIntensityScale;
};

const GLOBAL_SHINDO_CONTOURS = [
  { rank: 1, threshold: 0.5 },
  { rank: 2, threshold: 1.5 },
  { rank: 3, threshold: 2.5 },
  { rank: 4, threshold: 3.5 },
  { rank: 5, threshold: 4.5 },
  { rank: 5.5, threshold: 5 },
  { rank: 6, threshold: 5.5 },
  { rank: 6.5, threshold: 6 },
  { rank: 7, threshold: 6.5 },
] as const;

const GLOBAL_MMI_CONTOURS = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  threshold: index + 0.5,
}));

function destinationCoordinate(
  origin: { latitude: number; longitude: number },
  distanceKm: number,
  bearingRadians: number,
) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const latitude = origin.latitude * Math.PI / 180;
  const longitude = origin.longitude * Math.PI / 180;
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const targetLongitude = longitude + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
  );
  let longitudeDegrees = targetLongitude * 180 / Math.PI;
  while (longitudeDegrees - origin.longitude > 180) longitudeDegrees -= 360;
  while (longitudeDegrees - origin.longitude < -180) longitudeDegrees += 360;
  return {
    latitude: targetLatitude * 180 / Math.PI,
    longitude: longitudeDegrees,
  };
}

function impactAtDistance(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  distanceKm: number,
  scale: ReplayIntensityScale,
) {
  const location = destinationCoordinate(event, distanceKm, Math.PI / 2);
  return scale === "shindo"
    ? calculateJmaShindo(event, location)
    : calculateLocalIntensity(event, location);
}

function impactContourRadiusKm(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  threshold: number,
  scale: ReplayIntensityScale,
) {
  if (impactAtDistance(event, 0, scale) < threshold) return 0;
  const maximumRadiusKm = 5_000;
  let lower = 0;
  let upper = 10;
  while (upper < maximumRadiusKm && impactAtDistance(event, upper, scale) >= threshold) {
    lower = upper;
    upper = Math.min(maximumRadiusKm, upper * 2);
  }
  if (upper === maximumRadiusKm && impactAtDistance(event, upper, scale) >= threshold) return maximumRadiusKm;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (impactAtDistance(event, middle, scale) >= threshold) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

export function buildGlobalImpactContours(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  elapsedSeconds: number | null,
  scale: ReplayIntensityScale,
): GlobalImpactContour[] {
  const magnitude = Number(event.magnitude ?? 0);
  if (
    !Number.isFinite(magnitude)
    || magnitude <= 0
    || !Number.isFinite(event.latitude)
    || !Number.isFinite(event.longitude)
  ) return [];

  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  const elapsed = elapsedSeconds === null ? null : Math.max(0, Number(elapsedSeconds) || 0);
  const travelledKm = elapsed === null ? Number.POSITIVE_INFINITY : elapsed * 3.5;
  const currentHorizontalRadiusKm = elapsed === null
    ? Number.POSITIVE_INFINITY
    : Math.sqrt(Math.max(0, travelledKm * travelledKm - depthKm * depthKm));
  const thresholds = scale === "shindo" ? GLOBAL_SHINDO_CONTOURS : GLOBAL_MMI_CONTOURS;

  return thresholds.flatMap(({ rank, threshold }) => {
    const radiusKm = impactContourRadiusKm(event, threshold, scale);
    if (radiusKm < 1) return [];
    const currentRadiusKm = Math.min(radiusKm, currentHorizontalRadiusKm);
    return [{
      rank,
      radiusKm: Number(radiusKm.toFixed(1)),
      currentRadiusKm: Number(currentRadiusKm.toFixed(1)),
      arrived: elapsed === null || currentRadiusKm >= 1,
      scale,
    }];
  });
}

export function geodesicCircleCoordinates(
  center: { latitude: number; longitude: number },
  radiusKm: number,
  steps = 72,
) {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  const count = Math.max(24, Math.min(180, Math.round(steps)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const coordinate = destinationCoordinate(center, radiusKm, index / count * Math.PI * 2);
    return [Number(coordinate.longitude.toFixed(6)), Number(coordinate.latitude.toFixed(6))] as [number, number];
  });
}

export function simulateJmaRegionImpact(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  sites: JmaSeismicSite[],
  elapsedSeconds: number | null,
): JmaRegionImpact | null {
  if (Number(event.depthKm ?? 10) > 150 || !sites.length) return null;
  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  let rank = 0;
  let currentRank = 0;
  let firstSArrivalSeconds = Number.POSITIVE_INFINITY;

  for (const [latitude, longitude, arv] of sites) {
    const location = { latitude, longitude, arv };
    const siteRank = jmaShindoRank(calculateJmaShindo(event, location));
    if (siteRank < 1) continue;
    rank = Math.max(rank, siteRank);
    const distanceKm = Math.hypot(haversineKm(event, location), depthKm);
    const sArrivalSeconds = distanceKm / 3.5;
    firstSArrivalSeconds = Math.min(firstSArrivalSeconds, sArrivalSeconds);
    if (elapsedSeconds === null) {
      currentRank = Math.max(currentRank, siteRank);
      continue;
    }
    const sinceArrival = elapsedSeconds - sArrivalSeconds;
    if (sinceArrival < 0) continue;
    const rise = Math.min(1, (sinceArrival + 0.5) / 2.5);
    currentRank = Math.max(currentRank, siteRank * rise);
  }

  if (rank < 1) return null;
  return {
    rank,
    currentRank: Number(Math.max(0, currentRank).toFixed(2)),
    arrived: currentRank >= 0.5,
    firstSArrivalSeconds: Number(firstSArrivalSeconds.toFixed(2)),
  };
}

export function estimateLocalIntensity(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude">,
  location: { latitude: number; longitude: number },
) {
  return Number(Math.max(0, Math.min(7, calculateJmaShindo(event, location))).toFixed(2));
}

/**
 * JMA/CWA shindo labels are jurisdiction-specific. Source names are not a
 * reliable proxy: a relayed JMA/CWA catalogue item can describe an event well
 * outside Japan or Taiwan.
 */
export function usesShindoScaleForLocation(location: { latitude: number; longitude: number }) {
  const { latitude, longitude } = location;
  const inTaiwan = latitude >= 20 && latitude <= 27.5 && longitude >= 116 && longitude <= 123.5;
  const inJapan = latitude >= 24 && latitude <= 50 && longitude <= 154
    && ((latitude < 33 && longitude >= 122) || longitude >= 128);
  return inTaiwan || inJapan;
}

export function prepareReplayStationResponse(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude" | "originTime">,
  stations: Array<Pick<SeismicStation, "id" | "latitude" | "longitude">>,
  scale: ReplayIntensityScale = "shindo",
): ReplayStationResponseProfile {
  const originTime = Date.parse(event.originTime);
  const magnitude = Math.max(0, Number(event.magnitude ?? 0));
  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  const maximumRank = scale === "intensity" ? 12 : 7;

  if (!Number.isFinite(originTime) || magnitude <= 0) {
    return { originTime, maximumRank, stations: [] };
  }

  return {
    originTime,
    maximumRank,
    // Sorting once when an event is prepared lets every animation tick stop as
    // soon as it reaches a station the P wave has not reached yet. This keeps
    // early replay frames proportional to the visible wavefront instead of the
    // complete (often 10k+) FDSN catalogue.
    stations: stations.map((station) => {
      const horizontalKm = haversineKm(event, station);
      const distanceKm = Math.hypot(horizontalKm, depthKm);
      return {
        id: station.id,
        latitude: station.latitude,
        longitude: station.longitude,
        pArrivalSeconds: distanceKm / 6,
        sArrivalSeconds: distanceKm / 3.5,
        expectedPeak: scale === "intensity"
          ? calculateLocalIntensity(event, station)
          : estimateLocalIntensity(event, station),
      };
    }).sort((a, b) => a.pArrivalSeconds - b.pArrivalSeconds || a.id.localeCompare(b.id)),
  };
}

export function simulatePreparedReplayStationResponse(
  profile: ReplayStationResponseProfile,
  elapsedSeconds: number,
): ReplayStationSimulation {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const ranks: Record<string, number> = {};
  const arrivedStationIds: string[] = [];
  const sArrivedStationIds: string[] = [];
  const activeStationIds: string[] = [];
  const observations: TriggerObservation[] = [];
  let maxRank = 0;

  for (const station of profile.stations) {
    if (elapsed < station.pArrivalSeconds) break;
    let rank = 0;

    arrivedStationIds.push(station.id);
    if (station.expectedPeak >= 0.45) observations.push({
      stationId: station.id,
      latitude: station.latitude,
      longitude: station.longitude,
      triggeredAt: profile.originTime + station.pArrivalSeconds * 1000,
    });
    rank = Math.min(0.75, station.expectedPeak * 0.22);
    if (elapsed >= station.sArrivalSeconds) {
      sArrivedStationIds.push(station.id);
      const sinceArrival = elapsed - station.sArrivalSeconds;
      const rise = Math.min(1, (sinceArrival + 0.5) / 2.5);
      // A replay represents the peak response observed up to the current time.
      // Holding that peak prevents fixed stations from flashing off after the
      // S-wave front has passed them.
      rank = Math.max(rank, station.expectedPeak * rise);
    }

    rank = Number(Math.max(0, Math.min(profile.maximumRank, rank)).toFixed(2));
    ranks[station.id] = rank;
    if (rank >= 0.25) activeStationIds.push(station.id);
    maxRank = Math.max(maxRank, rank);
  }

  observations.sort((a, b) => a.triggeredAt - b.triggeredAt);
  return {
    ranks,
    arrivedStationIds,
    sArrivedStationIds,
    activeStationIds,
    observations,
    maxRank: Number(maxRank.toFixed(2)),
  };
}

export function simulateReplayStationResponse(
  event: Pick<LiveEew, "latitude" | "longitude" | "depthKm" | "magnitude" | "originTime">,
  stations: Array<Pick<SeismicStation, "id" | "latitude" | "longitude">>,
  elapsedSeconds: number,
  scale: ReplayIntensityScale = "shindo",
): ReplayStationSimulation {
  return simulatePreparedReplayStationResponse(
    prepareReplayStationResponse(event, stations, scale),
    elapsedSeconds,
  );
}

export function buildStationNeighborMap(
  stations: Array<{ latitude: number; longitude: number }>,
  radiusKm = 30,
  limit = 6,
) {
  if (!stations.length) return [];
  const cellSize = Math.max(0.15, radiusKm / 100);
  const buckets = new Map<string, number[]>();
  const cellFor = (station: { latitude: number; longitude: number }) => [
    Math.floor(station.latitude / cellSize),
    Math.floor(station.longitude / cellSize),
  ] as const;
  stations.forEach((station, index) => {
    const [row, column] = cellFor(station);
    const key = `${row}:${column}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });
  const cellReach = 2;
  return stations.map((station, stationIndex) => {
    const [row, column] = cellFor(station);
    const candidates = new Set<number>([stationIndex]);
    for (let rowOffset = -cellReach; rowOffset <= cellReach; rowOffset += 1) {
      for (let columnOffset = -cellReach; columnOffset <= cellReach; columnOffset += 1) {
        for (const index of buckets.get(`${row + rowOffset}:${column + columnOffset}`) ?? []) candidates.add(index);
      }
    }
    const nearby = [...candidates]
      .map((index) => ({ index, distance: index === stationIndex ? 0 : haversineKm(station, stations[index]) }))
      .filter((entry) => entry.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
    if (nearby.length <= 1) {
      const fallback = [...candidates]
        .filter((index) => index !== stationIndex)
        .map((index) => ({ index, distance: haversineKm(station, stations[index]) }))
        .filter((entry) => entry.distance <= 40)
        .sort((a, b) => a.distance - b.distance)[0];
      if (fallback) nearby.push(fallback);
    }
    return nearby.slice(0, Math.max(1, limit)).map((entry) => entry.index);
  });
}

function emptyDetectorStation(): DetectorStationState {
  return { recent: [], ascend: 0, activity: 0, activityLevel: -1, activeUntil: 0, activationAt: 0, triggerAt: 0 };
}

function detectorState(kind: ShakeDetectorState["kind"], count: number, timestamp: number, previous?: ShakeDetectorState) {
  if (previous?.kind === kind && previous.stations.length === count) return {
    ...previous,
    stations: previous.stations.map((station) => ({ ...station, recent: [...station.recent] })),
  };
  return {
    kind,
    stations: Array.from({ length: count }, emptyDetectorStation),
    periodStartedAt: timestamp,
    periodMaxLevel: -1,
    qualifiedUntil: 0,
    lastTimestamp: 0,
  } satisfies ShakeDetectorState;
}

function trimSamples(samples: DetectorSample[], timestamp: number, windowMs = 60_000) {
  return samples.filter((sample) => sample.timestamp >= timestamp - windowMs).slice(0, 60);
}

function niedActivity(level: number, ascend: number, wasActive: boolean) {
  let levelActivity = 0;
  if (ascend > 0 || wasActive) {
    if (level <= 5) levelActivity = 0;
    else if (level <= 7) levelActivity = (wasActive ? 0.5 : 0.25) * (level - 5);
    else if (level <= 11) levelActivity = 2 * (level - 7);
    else levelActivity = 6 * (level - 10);
  }
  let ascendActivity = 0;
  if (ascend <= 0) ascendActivity = 0;
  else if (ascend <= 1) ascendActivity = wasActive ? 0.5 : 0.25;
  else if (ascend <= 6) ascendActivity = 2 * (ascend - 2) + 1;
  else ascendActivity = 6 * (ascend - 5);
  return levelActivity + ascendActivity;
}

function periodValues(state: ShakeDetectorState, currentLevel: number, timestamp: number) {
  if (!state.periodStartedAt || timestamp - state.periodStartedAt > 600_000) {
    state.periodStartedAt = timestamp;
    state.periodMaxLevel = currentLevel;
  } else {
    state.periodMaxLevel = Math.max(state.periodMaxLevel, currentLevel);
  }
}

function activateCluster(
  seed: number,
  stationStates: DetectorStationState[],
  neighbors: number[][],
  timestamp: number,
  activeIndexes: Set<number>,
) {
  const pending = new Set([seed]);
  const cluster: number[] = [];
  while (pending.size) {
    const current = pending.values().next().value as number;
    pending.delete(current);
    if (activeIndexes.has(current) || stationStates[current]?.activity <= 0) continue;
    activeIndexes.add(current);
    cluster.push(current);
    for (const neighbor of neighbors[current] ?? []) {
      if (!activeIndexes.has(neighbor) && stationStates[neighbor]?.activity > 0) pending.add(neighbor);
    }
  }
  for (const index of cluster) {
    const station = stationStates[index];
    const wasActive = station.activeUntil > timestamp;
    station.activeUntil = timestamp + 12_500;
    if (!wasActive) station.activationAt = timestamp;
  }
  return cluster;
}

export function updateNiedShakeDetection(
  previous: ShakeDetectorState | undefined,
  stations: SeismicStation[],
  intensity: string,
  timestamp: number,
  neighbors = buildStationNeighborMap(stations),
): ShakeDetectionUpdate {
  const state = detectorState("NIED", stations.length, timestamp, previous);
  const activityThreshold = [Infinity, 8, 11, 13, 14, 15, 16];
  state.stations.forEach((station, index) => {
    const raw = intensity[index];
    const level = raw ? raw.charCodeAt(0) - 100 : -1;
    if (station.recent[0]?.timestamp !== timestamp) station.recent.unshift({ timestamp, level });
    station.recent = trimSamples(station.recent, timestamp);
    const pastValid = station.recent.filter((sample) => sample.timestamp < timestamp && sample.timestamp >= timestamp - 20_000 && sample.level >= 0);
    const baseline = pastValid.length ? Math.min(...pastValid.map((sample) => sample.level)) : level;
    const ascend = level >= 0 && baseline >= 0 ? Math.max(0, level - baseline) : 0;
    if (ascend > 0 && station.ascend <= 0) {
      const baselineSample = [...pastValid].reverse().find((sample) => sample.level === baseline);
      station.triggerAt = baselineSample?.timestamp ?? timestamp;
    }
    if (ascend <= 0 && station.activeUntil <= timestamp) station.triggerAt = 0;
    station.ascend = ascend;
    station.activityLevel = level;
    station.activity = niedActivity(level, ascend, station.activeUntil > timestamp);
  });

  const activeIndexes = new Set<number>();
  const clusters: number[][] = [];
  state.stations.forEach((station, index) => {
    if (activeIndexes.has(index) || station.activity <= 0) return;
    if (station.activeUntil > timestamp && station.ascend > 0) {
      const cluster = activateCluster(index, state.stations, neighbors, timestamp, activeIndexes);
      if (cluster.length) clusters.push(cluster);
      return;
    }
    const nearby = (neighbors[index] ?? [index]).filter((neighbor) => state.stations[neighbor]?.activityLevel >= 0);
    const nearbyActiveScore = nearby.reduce((sum, neighbor) => {
      const candidate = state.stations[neighbor];
      if (!candidate || candidate.activity <= 0) return sum;
      if (candidate.activeUntil > timestamp) return sum + 1;
      return sum + (candidate.ascend <= 1 ? 0.5 : 1);
    }, 0);
    const numberThreshold = nearby.length <= 2 ? (nearby.length + 1) / 2 : nearby.length / 2;
    const nearbyActivity = nearby.reduce((sum, neighbor) => sum + (state.stations[neighbor]?.activity ?? 0), 0)
      + nearbyActiveScore * (nearbyActiveScore + 1) / 2;
    if (nearbyActiveScore >= numberThreshold && nearbyActivity >= (activityThreshold[nearby.length] ?? 16)) {
      const cluster = activateCluster(index, state.stations, neighbors, timestamp, activeIndexes);
      if (cluster.length) clusters.push(cluster);
    }
  });

  const active = state.stations.flatMap((station, index) => station.activeUntil > timestamp ? [index] : []);
  const weak = state.stations.flatMap((station, index) => (
    station.activeUntil <= timestamp && station.activity > 0 ? [index] : []
  ));
  const currentMaxLevel = active.length ? Math.max(...active.map((index) => state.stations[index].activityLevel)) : -1;
  if (currentMaxLevel >= 8) state.qualifiedUntil = timestamp + 120_000;
  periodValues(state, currentMaxLevel, timestamp);
  state.lastTimestamp = timestamp;
  const observations = state.stations.flatMap((station, index) => {
    if (timestamp > state.qualifiedUntil || !station.activationAt || timestamp - station.activationAt > 120_000 || !station.triggerAt) return [];
    const source = stations[index];
    return [{ stationId: source.id, latitude: source.latitude, longitude: source.longitude, triggeredAt: station.triggerAt }];
  }).sort((a, b) => a.triggeredAt - b.triggeredAt);
  const periodMaxLevel = state.periodMaxLevel;
  return {
    state,
    observations,
    status: {
      network: "NIED",
      detected: active.length > 0,
      activeStationIds: active.map((index) => stations[index].id),
      weakStationIds: weak.map((index) => stations[index].id),
      clusterCount: clusters.length || (active.length ? 1 : 0),
      currentMaxLevel,
      currentMaxLabel: currentMaxLevel >= 0 ? niedLevelLabel(currentMaxLevel) : "未检知",
      periodMaxLevel,
      periodMaxLabel: periodMaxLevel >= 0 ? niedLevelLabel(periodMaxLevel) : "--",
      updatedAt: timestamp,
    },
  };
}

export function updateKmaPewsDetection(
  previous: ShakeDetectorState | undefined,
  stations: KmaStation[],
  intensities: number[],
  timestamp: number,
  neighbors = buildStationNeighborMap(stations, 30, 64),
): ShakeDetectionUpdate {
  const state = detectorState("KMA-PEWS", stations.length, timestamp, previous);
  state.stations.forEach((station, index) => {
    const raw = Number(intensities[index]);
    const level = Number.isFinite(raw) && raw > -3 ? raw + 2 : -1;
    if (station.recent[0]?.timestamp !== timestamp) station.recent.unshift({ timestamp, level });
    station.recent = trimSamples(station.recent, timestamp);
    const activity = station.recent.filter((sample) => sample.timestamp >= timestamp - 12_000 && sample.level >= 0);
    const past = station.recent.filter((sample) => sample.timestamp < timestamp - 12_000 && sample.level >= 0);
    station.activityLevel = activity.length ? Math.max(...activity.map((sample) => sample.level)) : -1;
    station.ascend = past.length >= 36 ? activity.filter((sample) => sample.level > Math.max(...past.map((sample) => sample.level))).length : 0;
    station.activity = station.ascend > 0 || station.activeUntil > timestamp ? Math.max(0, station.activityLevel + station.ascend) : 0;
    if (station.ascend > 0 && !station.triggerAt) station.triggerAt = activity.find((sample) => sample.level > Math.max(...past.map((item) => item.level)))?.timestamp ?? timestamp;
    if (station.ascend <= 0 && station.activeUntil <= timestamp) station.triggerAt = 0;
  });

  const activated = new Set<number>();
  const clusters: number[][] = [];
  state.stations.forEach((station, index) => {
    if (activated.has(index)) return;
    const nearby = neighbors[index] ?? [index];
    let flagged = station.activeUntil > timestamp && station.ascend > 0;
    if (!flagged && (station.activeUntil > timestamp || station.ascend > 0)) {
      const activeCandidates = nearby.filter((neighbor) => {
        const candidate = state.stations[neighbor];
        return candidate && (candidate.activeUntil > timestamp || candidate.ascend > 0);
      });
      const levels = activeCandidates.map((neighbor) => state.stations[neighbor].activityLevel);
      const ascends = nearby.map((neighbor) => state.stations[neighbor]?.ascend ?? 0);
      const countInt1 = levels.filter((level) => level >= 3).length;
      const countInt2 = levels.filter((level) => level >= 4).length;
      const countAsc2 = ascends.filter((ascend) => ascend >= 2).length;
      flagged = countInt1 >= Math.max(0.5 * nearby.length, 3)
        || countInt2 >= Math.max(0.15 * nearby.length, 2)
        || countAsc2 >= Math.max(0.6 * nearby.length, 4);
    }
    if (!flagged) return;
    const cluster = nearby.filter((neighbor) => {
      const candidate = state.stations[neighbor];
      return candidate && (candidate.activeUntil > timestamp || candidate.ascend > 0);
    });
    cluster.forEach((neighbor) => {
      const candidate = state.stations[neighbor];
      const wasActive = candidate.activeUntil > timestamp;
      candidate.activeUntil = timestamp + 12_500;
      candidate.activity = Math.max(candidate.activity, candidate.activityLevel);
      if (!wasActive) candidate.activationAt = timestamp;
      activated.add(neighbor);
    });
    if (cluster.length) clusters.push(cluster);
  });

  const active = state.stations.flatMap((station, index) => station.activeUntil > timestamp ? [index] : []);
  const currentMaxLevel = active.length ? Math.max(...active.map((index) => state.stations[index].activityLevel)) : -1;
  periodValues(state, currentMaxLevel, timestamp);
  state.lastTimestamp = timestamp;
  const currentMmi = currentMaxLevel >= 0 ? Math.max(0, currentMaxLevel - 2) : -1;
  const periodMmi = state.periodMaxLevel >= 0 ? Math.max(0, state.periodMaxLevel - 2) : -1;
  return {
    state,
    observations: [],
    status: {
      network: "KMA-PEWS",
      detected: active.length > 0,
      activeStationIds: active.map((index) => stations[index].id),
      weakStationIds: [],
      clusterCount: clusters.length || (active.length ? 1 : 0),
      currentMaxLevel,
      currentMaxLabel: currentMmi >= 0 ? `MMI ${currentMmi.toFixed(1)}` : "未检知",
      periodMaxLevel: state.periodMaxLevel,
      periodMaxLabel: periodMmi >= 0 ? `MMI ${periodMmi.toFixed(1)}` : "--",
      updatedAt: timestamp,
    },
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function evaluateCandidate(observations: TriggerObservation[], latitude: number, longitude: number, depthKm: number) {
  const arrivals = observations.map((observation) => {
    const horizontal = haversineKm({ latitude, longitude }, observation);
    const distance = Math.hypot(horizontal, depthKm);
    return observation.triggeredAt - distance / 6 * 1000;
  });
  const originTime = median(arrivals);
  const residuals = arrivals.map((value) => Math.abs(value - originTime)).sort((a, b) => a - b);
  const retained = residuals.slice(0, Math.max(4, Math.ceil(residuals.length * 0.8)));
  const robustRmse = Math.sqrt(retained.reduce((sum, value) => sum + value ** 2, 0) / retained.length);
  const upperResidual = residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * 0.75))];
  const residualMs = median(residuals);
  const scoreMs = residualMs * 0.45 + robustRmse * 0.45 + upperResidual * 0.1;
  return { latitude, longitude, depthKm, originTime, residualMs, scoreMs };
}

export function inferHypocenter(observations: TriggerObservation[]): HypocenterEstimate | null {
  const unique = [...new Map(observations.map((item) => [item.stationId, item])).values()]
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Number.isFinite(item.triggeredAt));
  if (unique.length < 4) return null;

  const latitudes = unique.map((item) => item.latitude);
  const longitudes = unique.map((item) => item.longitude);
  const triggerTimes = unique.map((item) => item.triggeredAt);
  const travelSpreadKm = (Math.max(...triggerTimes) - Math.min(...triggerTimes)) / 1000 * 6;
  const expansion = Math.max(2.5, Math.min(8, travelSpreadKm / 111 + 1.5));
  const minLatitude = Math.max(-85, Math.min(...latitudes) - expansion);
  const maxLatitude = Math.min(85, Math.max(...latitudes) + expansion);
  const minLongitude = Math.max(-179, Math.min(...longitudes) - expansion);
  const maxLongitude = Math.min(179, Math.max(...longitudes) + expansion);
  const largestSpan = Math.max(maxLatitude - minLatitude, maxLongitude - minLongitude);
  const coarseStep = Math.max(0.2, largestSpan / 30);
  const coarseDepths = [5, 10, 20, 35, 60, 100, 150];
  const coarseCandidates: ReturnType<typeof evaluateCandidate>[] = [];
  const keepCandidate = (candidate: ReturnType<typeof evaluateCandidate>) => {
    coarseCandidates.push(candidate);
    coarseCandidates.sort((a, b) => a.scoreMs - b.scoreMs || a.residualMs - b.residualMs);
    if (coarseCandidates.length > 10) coarseCandidates.pop();
  };

  const latitudeSteps = Math.ceil((maxLatitude - minLatitude) / coarseStep);
  const longitudeSteps = Math.ceil((maxLongitude - minLongitude) / coarseStep);
  for (let row = 0; row <= latitudeSteps; row += 1) {
    const latitude = Math.min(maxLatitude, minLatitude + row * coarseStep);
    for (let column = 0; column <= longitudeSteps; column += 1) {
      const longitude = Math.min(maxLongitude, minLongitude + column * coarseStep);
      for (const depthKm of coarseDepths) keepCandidate(evaluateCandidate(unique, latitude, longitude, depthKm));
    }
  }

  const centerLatitude = latitudes.reduce((sum, value) => sum + value, 0) / unique.length;
  const centerLongitude = longitudes.reduce((sum, value) => sum + value, 0) / unique.length;
  for (const depthKm of coarseDepths) keepCandidate(evaluateCandidate(unique, centerLatitude, centerLongitude, depthKm));

  const horizontalSteps = Array.from(new Set([
    Number((coarseStep / 2).toFixed(5)),
    0.08,
    0.025,
    0.008,
    0.0025,
  ])).sort((a, b) => b - a);
  const depthSteps = [20, 10, 5, 2, 0.75];
  const refine = (seed: ReturnType<typeof evaluateCandidate>) => {
    let current = seed;
    for (let stage = 0; stage < horizontalSteps.length; stage += 1) {
      const horizontalStep = horizontalSteps[stage];
      const depthStep = depthSteps[Math.min(stage, depthSteps.length - 1)];
      for (let iteration = 0; iteration < 8; iteration += 1) {
        let next = current;
        for (const latitudeOffset of [-horizontalStep, 0, horizontalStep]) {
          for (const longitudeOffset of [-horizontalStep, 0, horizontalStep]) {
            for (const depthOffset of [-depthStep, 0, depthStep]) {
              if (!latitudeOffset && !longitudeOffset && !depthOffset) continue;
              const candidate = evaluateCandidate(
                unique,
                Math.max(-85, Math.min(85, current.latitude + latitudeOffset)),
                Math.max(-179, Math.min(179, current.longitude + longitudeOffset)),
                Math.max(3, Math.min(300, current.depthKm + depthOffset)),
              );
              if (candidate.scoreMs < next.scoreMs - 0.001) next = candidate;
            }
          }
        }
        if (next === current) break;
        current = next;
      }
    }
    return current;
  };

  const best = coarseCandidates
    .map(refine)
    .sort((a, b) => a.scoreMs - b.scoreMs || a.residualMs - b.residualMs)[0];

  return {
    latitude: Number(best.latitude.toFixed(3)),
    longitude: Number(best.longitude.toFixed(3)),
    depthKm: Number(best.depthKm.toFixed(1)),
    originTime: best.originTime,
    residualMs: Math.round(best.residualMs),
    confidence: Math.round(Math.max(0, Math.min(99, 100 - best.scoreMs / 12 - 120 / unique.length))),
    stationCount: unique.length,
    method: "P 波走时多起点稳健网格反演",
  };
}

export function constrainHypocenterEstimate(
  estimate: HypocenterEstimate,
  reference: { latitude: number; longitude: number },
  maxDistanceKm = 10,
): HypocenterEstimate {
  const distanceKm = haversineKm(estimate, reference);
  const limitKm = Math.max(0.1, maxDistanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm <= limitKm) {
    return { ...estimate, referenceDistanceKm: Number(distanceKm.toFixed(2)) };
  }

  const radians = Math.PI / 180;
  const referenceLatitude = reference.latitude * radians;
  const estimateLatitude = estimate.latitude * radians;
  const longitudeDelta = (estimate.longitude - reference.longitude) * radians;
  const bearing = Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(estimateLatitude),
    Math.cos(referenceLatitude) * Math.sin(estimateLatitude)
      - Math.sin(referenceLatitude) * Math.cos(estimateLatitude) * Math.cos(longitudeDelta),
  );
  const angularDistance = limitKm / 6371;
  const latitude = Math.asin(
    Math.sin(referenceLatitude) * Math.cos(angularDistance)
      + Math.cos(referenceLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude = reference.longitude * radians + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(referenceLatitude),
    Math.cos(angularDistance) - Math.sin(referenceLatitude) * Math.sin(latitude),
  );

  return {
    ...estimate,
    latitude: Number((latitude / radians).toFixed(4)),
    longitude: Number((longitude / radians).toFixed(4)),
    referenceDistanceKm: Number(limitKm.toFixed(2)),
    unconstrainedDistanceKm: Number(distanceKm.toFixed(1)),
    method: `${estimate.method}（官方震源 ${limitKm.toFixed(0)} km 稳定约束）`,
  };
}

export function waveRadiusKm(originTime: string | number, velocityKmPerSecond: number, now = Date.now()) {
  const origin = typeof originTime === "number" ? originTime : Date.parse(originTime);
  if (!Number.isFinite(origin)) return 0;
  return Math.max(0, (now - origin) / 1000 * velocityKmPerSecond);
}

export function makeKmaStations(coordinates: Array<{ latitude: number; longitude: number }>): KmaStation[] {
  return coordinates.map((coordinate, index) => ({
    id: `kma:${index}`,
    index,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    network: "KMA",
    stationCode: `KMA-${String(index + 1).padStart(3, "0")}`,
    stationName: `韩国测站 ${index + 1}`,
    prefecture: "",
    metadataMatched: false,
  }));
}
