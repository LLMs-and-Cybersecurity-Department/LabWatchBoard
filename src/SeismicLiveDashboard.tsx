import {
  Activity,
  AlertTriangle,
  Antenna,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Database,
  ExternalLink,
  FastForward,
  Gauge,
  Globe2,
  History as HistoryIcon,
  Layers3,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Siren,
  SkipBack,
  Sun,
  Volume2,
  Waves,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, GeoJSON as LeafletGeoJSON, MapContainer, Pane, Popup, Rectangle, ScaleControl, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { feature as topojsonFeature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import {
  buildNiedDetectionGridCells,
  buildStationNeighborMap,
  buildInstitutionHistoryReports,
  buildGlobalImpactContours,
  cencIntensityColor,
  collapseEewHistoryEvents,
  constrainHypocenterEstimate,
  estimateGroundMotion,
  eewReportKey,
  filterEewHistoryEventsBySource,
  fetchCencIntensity,
  fetchEewRelay,
  fetchKmaPews,
  fetchNiedRealtime,
  fetchNiedStations,
  fetchOceanStations,
  fetchSnetIntensity,
  haversineKm,
  inferHypocenter,
  geodesicCircleCoordinates,
  institutionReportToLiveEew,
  intensityRomanLabel,
  intensityColor,
  isLiveEewActive,
  LIVE_EEW_SOURCE_ORDER,
  makeKmaStations,
  mergeEewHistory,
  niedCharToLevel,
  niedGridAnchor,
  niedGridColor,
  niedLevelLabel,
  niedLevelRank,
  niedSoundCueForRise,
  niedSoundIndex,
  niedStationDisplayColor,
  normalizeCencIntensityDetail,
  normalizeCencIntensityList,
  normalizeWolfxEew,
  replayNiedSoundIndex,
  JMA_SHINDO_LEGEND,
  MMI_LEGEND,
  jmaShindoColor,
  jmaShindoLabel,
  mmiIntensityColor,
  simulateJmaRegionImpact,
  simulateReplayStationResponse,
  updateKmaPewsDetection,
  updateNiedShakeDetection,
  waveRadiusKm,
  type CencIntensityReport,
  type CencIntensityStation,
  type CencIntensitySummary,
  type HypocenterEstimate,
  type KmaStation,
  type JmaSeismicSiteCatalogue,
  type LiveEew,
  type LiveEewSource,
  type NiedRealtimeFrame,
  type NiedGridAnchor,
  type NiedSoundCue,
  type NiedStationCatalogue,
  type OceanStation,
  type OceanStationCatalogue,
  type SnetIntensityEvent,
  type SnetIntensitySnapshot,
  type SeismicStation,
  type ShakeDetectionStatus,
  type ShakeDetectorState,
  type StationSample,
  type TriggerObservation,
  type WarningSourceFilter,
} from "./seismic";
import {
  EARTHQUAKE_SOURCE_COLORS,
  EARTHQUAKE_SOURCE_LABELS,
  fetchEarthquakeSnapshot,
  formatMagnitudeType,
  mergeEarthquakeEventHistory,
  normalizeEarthquakeRefreshSeconds,
  summarizeEarthquakeSourceAvailability,
  type EarthquakeEvent,
} from "./earthquake";
import { usePersistentState } from "./usePersistentState";
import { FdsnWaveformPanel } from "./FdsnWaveformPanel";
import { SeismicCameraRelay } from "./SeismicCameraRelay";
import {
  FDSN_PROVIDER_COLORS,
  GLOBAL_FDSN_PROVIDER_IDS,
  buildEventStationViewport,
  fetchCwaStations,
  fetchGlobalStations,
  sampleGlobalStationsForMap,
  type FdsnMapViewport,
  type GlobalSeismicStation,
  type GlobalStationSnapshot,
} from "./fdsn";

type SeismicLiveDashboardProps = {
  onToggleSidebar: () => void;
  onOpenGlobal: () => void;
};

type PanelTab = "station" | "intensity" | "snet";
type BottomTab = "inference" | "replay" | "warnings" | "reports";
type WarningOverlayTab = "latest" | "selected";
type SeismicMapTheme = "dark" | "light";
type SourceState = "connecting" | "online" | "stale" | "error";
type SnetViewMode = "measured" | "simulation";
type StationSelectionReason = "manual" | "nied-auto";
type SelectableStation = SeismicStation | KmaStation | OceanStation | CencIntensityStation | GlobalSeismicStation;
type MapFocusTarget = { key: string; latitude: number; longitude: number; zoom: number; exact?: boolean };
type OceanResponseMode = "idle" | "measured" | "local" | "replay";
type JmaRegionProperties = {
  code?: string;
  name: string;
  namekana?: string;
  rank?: number;
  currentRank?: number;
  arrived?: boolean;
  scale?: "shindo" | "intensity";
  source?: "local" | "official";
  contour?: boolean;
  phase?: "forecast" | "arrived";
};
type JmaRegionFeature = Feature<Geometry, JmaRegionProperties>;
type JmaRegionCollection = FeatureCollection<Geometry, JmaRegionProperties>;

const HISTORY_LIMIT = 180;
const INSTITUTION_SOURCE_TOTAL = 9;

const NIED_GRID_COLORS = {
  green: "#16a34a",
  yellow: "#facc15",
  red: "#ef4444",
} as const;
const EMPTY_NUMBERS: number[] = [];
const EMPTY_STATION_IDS: string[] = [];
const EMPTY_RANKS: Record<string, number> = {};

const NIED_SOUND_URLS: Record<NiedSoundCue, string> = {
  shindo0: "/sound/srev/shindo0.mp3",
  shindo1: "/sound/srev/shindo1.mp3",
  shindo2: "/sound/srev/shindo2.mp3",
  shindo3: "/sound/srev/shindo3.mp3",
  shindo4: "/sound/srev/shindo4.mp3",
  shindo5: "/sound/srev/shindo5.mp3",
  shindo6: "/sound/srev/shindo6.mp3",
};

function withBrowserTimeout<T>(promise: Promise<T>, milliseconds: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(reason)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

const SEISMIC_MAP_LAYERS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
} as const;

function formatTime(value: string | number, seconds = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function displayRankLabel(rank: number) {
  return jmaShindoLabel(rank);
}

function liveEventStatusLabel(event: LiveEew) {
  if (event.cancelled) return "已取消";
  if (event.relay === "Catalogue") return event.source === "SHAKEALERT" ? "事后报告" : "机构报告";
  if (event.final) return "最终";
  return event.warning ? "警报" : "预报";
}

const geometryCenterCache = new WeakMap<JmaRegionFeature, { latitude: number; longitude: number } | null>();

function geometryCenter(feature: JmaRegionFeature) {
  if (geometryCenterCache.has(feature)) return geometryCenterCache.get(feature) ?? null;
  const coordinates: number[][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      coordinates.push(value as number[]);
      return;
    }
    value.forEach(visit);
  };
  visit("coordinates" in feature.geometry ? feature.geometry.coordinates : []);
  if (!coordinates.length) {
    geometryCenterCache.set(feature, null);
    return null;
  }
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  const center = {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
  geometryCenterCache.set(feature, center);
  return center;
}

function affectedRegionLayers(
  regions: JmaRegionCollection | null,
  sites: JmaSeismicSiteCatalogue | null,
  event: LiveEew | null,
  elapsedSeconds: number | null,
): { local: JmaRegionCollection; official: JmaRegionCollection } {
  const empty: JmaRegionCollection = { type: "FeatureCollection", features: [] };
  if (!event || event.cancelled) return { local: empty, official: empty };
  const contourScale = event.source === "JMA" || event.source === "CWA" ? "shindo" : "intensity";
  const contours = buildGlobalImpactContours(event, elapsedSeconds, contourScale);
  const contourFeature = (radiusKm: number, rank: number, arrived: boolean): JmaRegionFeature | null => {
    const coordinates = geodesicCircleCoordinates(event, radiusKm);
    if (!coordinates.length) return null;
    const scaleLabel = contourScale === "shindo" ? `震度 ${jmaShindoLabel(rank)}` : `MMI ${intensityRomanLabel(rank)}`;
    const phase = arrived ? "arrived" : "forecast";
    return {
      type: "Feature",
      properties: {
        code: `global-${contourScale}-${rank}-${phase}`,
        name: `本地推算 ${scaleLabel}`,
        rank,
        currentRank: arrived ? rank : 0,
        arrived,
        scale: contourScale,
        source: "local",
        contour: true,
        phase,
      },
      geometry: { type: "Polygon", coordinates: [coordinates] },
    };
  };
  const forecastContours = elapsedSeconds === null
    ? []
    : contours.flatMap((contour) => contourFeature(contour.radiusKm, contour.rank, false) ?? []);
  const arrivedContours = contours.flatMap((contour) => {
    const radiusKm = elapsedSeconds === null ? contour.radiusKm : contour.currentRadiusKm;
    return contour.arrived ? contourFeature(radiusKm, contour.rank, true) ?? [] : [];
  });
  const contourFeatures = [...forecastContours, ...arrivedContours];
  const localImpactRadiusKm = Math.max(0, ...contours.map((contour) => contour.radiusKm)) + 350;
  if (!regions) {
    return {
      local: { type: "FeatureCollection", features: contourFeatures },
      official: empty,
    };
  }
  const officialRanks = new Map((event.affectedAreas ?? []).map((area) => [area.name, area.rank]));
  const localFeatures: JmaRegionFeature[] = [];
  const officialFeatures: JmaRegionFeature[] = [];

  for (const region of regions.features) {
    const officialRank = officialRanks.get(region.properties.name);
    if (officialRank !== undefined) {
      officialFeatures.push({ ...region, properties: { ...region.properties, rank: officialRank, currentRank: officialRank, arrived: true, scale: "shindo", source: "official" } });
    }
    const center = geometryCenter(region);
    if (!center) continue;
    if (haversineKm(event, center) > localImpactRadiusKm) continue;
    const regionSites = sites?.regions[region.properties.name] ?? [[center.latitude, center.longitude, 1.4]];
    const impact = simulateJmaRegionImpact(event, regionSites, elapsedSeconds);
    if (!impact) continue;
    localFeatures.push({
      ...region,
      properties: {
        ...region.properties,
        rank: impact.rank,
        currentRank: impact.currentRank,
        arrived: impact.arrived,
        scale: "shindo",
        source: "local",
      },
    });
  }

  return {
    local: { type: "FeatureCollection", features: [...contourFeatures, ...localFeatures] } as JmaRegionCollection,
    official: { type: "FeatureCollection", features: officialFeatures } as JmaRegionCollection,
  };
}

function isNiedStation(station: SelectableStation): station is SeismicStation {
  return station.id.startsWith("nied:");
}

function isKmaStation(station: SelectableStation): station is KmaStation {
  return station.id.startsWith("kma:");
}

function isOceanStation(station: SelectableStation): station is OceanStation {
  return station.id.startsWith("ocean:");
}

function isCencStation(station: SelectableStation): station is CencIntensityStation {
  return station.id.startsWith("cenc:");
}

function isGlobalStation(station: SelectableStation): station is GlobalSeismicStation {
  return "providers" in station && station.id.startsWith("fdsn:");
}

function isCwaStation(station: SelectableStation): station is GlobalSeismicStation {
  return isGlobalStation(station) && station.providerId === "cwa";
}

const JAPAN_MINI_MAP = { width: 300, height: 330, minLon: 127, maxLon: 149, minLat: 29, maxLat: 46.5 } as const;

function projectJapan(latitude: number, longitude: number) {
  const { width, height, minLon, maxLon, minLat, maxLat } = JAPAN_MINI_MAP;
  return {
    x: ((longitude - minLon) / (maxLon - minLon)) * width,
    y: ((maxLat - latitude) / (maxLat - minLat)) * height,
  };
}

function geometryRings(geometry: Geometry): number[][][] {
  if (geometry.type === "Polygon") return geometry.coordinates as number[][][];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat() as number[][][];
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(geometryRings);
  return [];
}

function JapanMiniMap(props: {
  regions: JmaRegionCollection | null;
  stations?: OceanStation[];
  ranks?: Record<string, number>;
  selectedStationId?: string | null;
  onSelectStation?: (station: OceanStation) => void;
  hypocenter?: Pick<EarthquakeEvent, "latitude" | "longitude" | "place"> | null;
}) {
  const paths = useMemo(() => (props.regions?.features ?? []).flatMap((feature, featureIndex) =>
    geometryRings(feature.geometry).map((ring, ringIndex) => {
      const points = ring.map(([longitude, latitude]) => projectJapan(latitude, longitude));
      if (points.length < 2) return null;
      return {
        key: `${feature.properties.code ?? featureIndex}:${ringIndex}`,
        d: `${points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")} Z`,
      };
    }).filter((path): path is { key: string; d: string } => Boolean(path))), [props.regions]);
  const hypocenterPoint = props.hypocenter ? projectJapan(props.hypocenter.latitude, props.hypocenter.longitude) : null;

  return (
    <svg className="seismic-japan-mini-map" viewBox={`0 0 ${JAPAN_MINI_MAP.width} ${JAPAN_MINI_MAP.height}`} role="img" aria-label={props.hypocenter ? `${props.hypocenter.place} 震源位置` : "S-net 测站震度分布"}>
      <rect width={JAPAN_MINI_MAP.width} height={JAPAN_MINI_MAP.height} fill="#0c1214" />
      <g className="seismic-japan-outline">{paths.map((path) => <path key={path.key} d={path.d} />)}</g>
      <g className="seismic-mini-stations">{(props.stations ?? []).map((station) => {
        const point = projectJapan(station.latitude, station.longitude);
        const rank = props.ranks?.[station.id] ?? 0;
        const selected = station.id === props.selectedStationId;
        return <circle
          key={station.id}
          cx={point.x}
          cy={point.y}
          r={selected ? 4.4 : rank >= 0.25 ? 3.5 : 2.5}
          fill={rank >= 0.25 ? intensityColor(rank) : "#1447e6"}
          stroke={selected ? "#ffffff" : rank >= 0.25 ? "#bff7ff" : "#5b78ff"}
          strokeWidth={selected ? 1.8 : 0.7}
          role={props.onSelectStation ? "button" : undefined}
          tabIndex={props.onSelectStation ? 0 : undefined}
          aria-label={`${station.network} ${station.stationCode} ${rank.toFixed(1)}`}
          onClick={() => props.onSelectStation?.(station)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") props.onSelectStation?.(station); }}
        />;
      })}</g>
      {hypocenterPoint && <g className="seismic-mini-hypocenter" transform={`translate(${hypocenterPoint.x} ${hypocenterPoint.y})`}><circle r="8" /><path d="M-5 0H5M0-5V5" /></g>}
    </svg>
  );
}

function OfficialHypocenterCard({ record, regions }: { record: EarthquakeEvent; regions: JmaRegionCollection | null }) {
  return (
    <section className="seismic-official-hypocenter-card" aria-label={`${record.agency} 震源情报`}>
      <div>
        <header><span>[{record.agency} 震源情报]</span><strong>{record.status || "已发布"}</strong></header>
        <dl>
          <div><dt>时间</dt><dd>{formatTime(record.time)}</dd></div>
          <div><dt>震源</dt><dd>{record.place} ({record.latitude.toFixed(3)}N, {record.longitude.toFixed(3)}E)</dd></div>
          <div><dt>深度</dt><dd>{record.depthKm?.toFixed(1) ?? "--"} km</dd></div>
          <div><dt>震级</dt><dd>{record.magnitudeType || "M"} {record.magnitude.toFixed(1)}</dd></div>
          <div><dt>更新</dt><dd>{record.updatedAt ? formatTime(record.updatedAt) : "--"}</dd></div>
        </dl>
        <a href={record.url} target="_blank" rel="noreferrer">打开机构原文<ExternalLink size={13} /></a>
      </div>
      <JapanMiniMap regions={regions} hypocenter={record} />
    </section>
  );
}

function InstitutionReportDetail({ record, onFocus }: { record: EarthquakeEvent; onFocus: () => void }) {
  const report = record.shakeAlertReport;
  return (
    <aside className="seismic-institution-detail">
      <header><i style={{ background: EARTHQUAKE_SOURCE_COLORS[record.source] }} /><div><strong>{EARTHQUAKE_SOURCE_LABELS[record.source]}</strong><span>{record.agency}</span></div><b>{formatMagnitudeType(record.magnitudeType)} {record.magnitude.toFixed(1)}</b></header>
      <h3>{record.place}</h3>
      <dl className="earthquake-detail-list">
        <div><dt>发震时间</dt><dd>{formatTime(record.time)}</dd></div>
        <div><dt>震源坐标</dt><dd>{record.latitude.toFixed(3)}, {record.longitude.toFixed(3)}</dd></div>
        <div><dt>深度</dt><dd>{record.depthKm?.toFixed(1) ?? "--"} km</dd></div>
        <div><dt>烈度 / 震度</dt><dd>{record.intensityScale && record.intensity ? `${record.intensityScale} ${record.intensity}` : "未提供"}</dd></div>
        <div><dt>发布状态</dt><dd>{record.status}</dd></div>
        <div><dt>事件编号</dt><dd>{record.sourceEventId}</dd></div>
      </dl>
      {report && <section className="seismic-shakealert-summary">
        <div className="shakealert-stage-grid">
          <article><span>首报</span><strong>M {report.initialMagnitude?.toFixed(1) ?? "--"}</strong><small>+{report.initialSeconds?.toFixed(1) ?? "--"} s</small></article>
          <article><span>峰值</span><strong>M {report.peakMagnitude?.toFixed(1) ?? "--"}</strong><small>+{report.peakSeconds?.toFixed(1) ?? "--"} s</small></article>
          <article><span>终报</span><strong>M {report.finalMagnitude?.toFixed(1) ?? "--"}</strong><small>+{report.finalSeconds?.toFixed(1) ?? "--"} s</small></article>
        </div>
        <p>{report.weaReport ?? report.announcement ?? "ShakeAlert 性能附件已发布。"}</p>
        {report.cities.length > 0 && <div className="seismic-shakealert-cities">{report.cities.slice(0, 4).map((city) => <span key={city.name}><strong>{city.name}</strong><em>{city.mmi === null ? "--" : `MMI ${city.mmi.toFixed(0)}`} · {city.warningSeconds === null ? "--" : `${city.warningSeconds.toFixed(1)} s`}</em></span>)}</div>}
      </section>}
      {record.note && <p className="earthquake-event-note">{record.note}</p>}
      <div className="seismic-institution-actions"><button onClick={onFocus}><LocateFixed size={14} />定位报告</button><a href={record.url} target="_blank" rel="noreferrer">机构原文<ExternalLink size={13} /></a>{report?.summaryJsonUrl && <a href={report.summaryJsonUrl} target="_blank" rel="noreferrer">报告 JSON<ExternalLink size={13} /></a>}{report?.summaryPdfUrl && <a href={report.summaryPdfUrl} target="_blank" rel="noreferrer">报告 PDF<ExternalLink size={13} /></a>}</div>
    </aside>
  );
}

function blankDetection(network: ShakeDetectionStatus["network"]): ShakeDetectionStatus {
  return {
    network,
    detected: false,
    activeStationIds: [],
    clusterCount: 0,
    currentMaxLevel: -1,
    currentMaxLabel: "等待数据",
    periodMaxLevel: -1,
    periodMaxLabel: "--",
    updatedAt: 0,
  };
}

function SourceIndicator({ label, state, latency }: { label: string; state: SourceState; latency: number | null }) {
  const status = state === "error"
    ? "异常 · 重试中"
    : state === "stale"
      ? latency === null ? "缓存 · 重连中" : `缓存 · ${latency} ms`
      : latency === null
        ? state === "connecting" ? "连接中" : "等待数据"
        : `${latency} ms`;
  return (
    <div className="seismic-source-indicator">
      <span className={`latency-dot ${state === "online" ? "green" : state === "connecting" ? "checking" : state === "stale" ? "yellow" : "red"}`} />
      <strong>{label}</strong>
      <small>{status}</small>
    </div>
  );
}

function SeismicIntensityLegend() {
  return (
    <section className="seismic-intensity-legend" aria-label="烈度与震度等级颜色表">
      <div><strong>烈度 MMI</strong><span>{MMI_LEGEND.map((item) => <i key={item.label} title={`烈度 ${item.label}`} style={{ background: mmiIntensityColor(item.rank) }}>{item.label}</i>)}</span></div>
      <div><strong>震度 JMA</strong><span>{JMA_SHINDO_LEGEND.map((item) => <i key={item.label} title={`震度 ${item.label}`} style={{ background: jmaShindoColor(item.rank) }}>{item.label}</i>)}</span></div>
    </section>
  );
}

function SeismicMapFocus({ target }: { target: MapFocusTarget | null }) {
  const map = useMap();
  const previous = useRef("");
  useEffect(() => {
    if (!target || previous.current === target.key) return;
    previous.current = target.key;
    map.setView(
      [target.latitude, target.longitude],
      target.exact ? target.zoom : Math.max(map.getZoom(), target.zoom),
      { animate: false },
    );
  }, [map, target]);
  return null;
}

function normalizedLongitude(value: number) {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

function SeismicMapViewport({ onChange }: { onChange: (viewport: FdsnMapViewport) => void }) {
  const report = useCallback((map: ReturnType<typeof useMap>) => {
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const world = east - west >= 355;
    onChange({
      minLatitude: Math.max(-90, bounds.getSouth()),
      maxLatitude: Math.min(90, bounds.getNorth()),
      minLongitude: world ? -180 : normalizedLongitude(west),
      maxLongitude: world ? 180 : normalizedLongitude(east),
      zoom: map.getZoom(),
    });
  }, [onChange]);
  const map = useMapEvents({
    moveend: (event) => report(event.target),
    zoomend: (event) => report(event.target),
  });
  useEffect(() => report(map), [map, report]);
  return null;
}

function SeismicMapThemeClass({ theme }: { theme: SeismicMapTheme }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    container.classList.remove("seismic-map--dark", "seismic-map--light");
    container.classList.add(`seismic-map--${theme}`);
  }, [map, theme]);
  return null;
}

const GlobalStationBaseMarkers = memo(function GlobalStationBaseMarkers(props: {
  stations: GlobalSeismicStation[];
  onSelectStation: (station: SelectableStation) => void;
}) {
  return <>
    {props.stations.map((station) => {
      const color = FDSN_PROVIDER_COLORS[station.providerId] ?? "#38bdf8";
      return <CircleMarker
        key={station.id}
        center={[station.latitude, station.longitude]}
        radius={2.15}
        pathOptions={{ color, fillColor: color, weight: 0.45, opacity: 0.92, fillOpacity: 0.72 }}
        eventHandlers={{ click: () => props.onSelectStation(station) }}
      />;
    })}
  </>;
});

const NiedStationBaseMarkers = memo(function NiedStationBaseMarkers(props: {
  stations: SeismicStation[];
  onSelectStation: (station: SelectableStation) => void;
}) {
  return <>
    {props.stations.map((station) => <CircleMarker
      key={station.id}
      center={[station.latitude, station.longitude]}
      radius={2.1}
      pathOptions={{ color: "#1447e6", fillColor: "#1447e6", weight: 0.45, opacity: 0.86, fillOpacity: 0.76 }}
      eventHandlers={{ click: () => props.onSelectStation(station) }}
    />)}
  </>;
});

const KmaStationBaseMarkers = memo(function KmaStationBaseMarkers(props: {
  stations: KmaStation[];
  onSelectStation: (station: SelectableStation) => void;
}) {
  return <>{props.stations.map((station) => <CircleMarker key={station.id} center={[station.latitude, station.longitude]} radius={2.2} pathOptions={{ color: "#1d4ed8", fillColor: "#1d4ed8", weight: 0.6, fillOpacity: 0.62 }} eventHandlers={{ click: () => props.onSelectStation(station) }} />)}</>;
});

function oceanStationBaseColor(network: OceanStation["network"]) {
  if (network === "S-net") return "#1447e6";
  if (network === "N-net") return "#10b981";
  return "#22d3ee";
}

const OceanStationBaseMarkers = memo(function OceanStationBaseMarkers(props: {
  stations: OceanStation[];
  onSelectStation: (station: SelectableStation) => void;
}) {
  return <>{props.stations.map((station) => {
    const color = oceanStationBaseColor(station.network);
    return <CircleMarker
      key={station.id}
      center={[station.latitude, station.longitude]}
      radius={station.network === "S-net" ? 2.1 : 2.35}
      pathOptions={{ color, fillColor: color, weight: 0.55, opacity: 0.9, fillOpacity: 0.78 }}
      eventHandlers={{ click: () => props.onSelectStation(station) }}
    />;
  })}</>;
});

const CwaStationBaseMarkers = memo(function CwaStationBaseMarkers(props: {
  stations: GlobalSeismicStation[];
  onSelectStation: (station: SelectableStation) => void;
}) {
  return <>{props.stations.map((station) => <CircleMarker key={station.id} center={[station.latitude, station.longitude]} radius={2.6} pathOptions={{ color: FDSN_PROVIDER_COLORS.cwa, fillColor: FDSN_PROVIDER_COLORS.cwa, weight: 0.7, opacity: 0.96, fillOpacity: 0.8 }} eventHandlers={{ click: () => props.onSelectStation(station) }} />)}</>;
});

const GlobalStationBaseLayer = memo(function GlobalStationBaseLayer(props: { stations: GlobalSeismicStation[]; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const stations = useMemo(() => sampleGlobalStationsForMap(props.stations, 120), [props.stations]);
  return <Pane name="seismic-station-base-global" style={{ zIndex: 460 }}>{props.show && <GlobalStationBaseMarkers stations={stations} onSelectStation={props.onSelectStation} />}</Pane>;
});

const CwaStationBaseLayer = memo(function CwaStationBaseLayer(props: { stations: GlobalSeismicStation[]; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const stations = useMemo(() => sampleGlobalStationsForMap(props.stations, 90), [props.stations]);
  return <Pane name="seismic-station-base-cwa" style={{ zIndex: 460 }}>{props.show && <CwaStationBaseMarkers stations={stations} onSelectStation={props.onSelectStation} />}</Pane>;
});

const NiedStationBaseLayer = memo(function NiedStationBaseLayer(props: { stations: SeismicStation[]; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const stations = useMemo(() => sampleStationMarkers(props.stations, 260), [props.stations]);
  return <Pane name="seismic-station-base-nied" style={{ zIndex: 460 }}>{props.show && <NiedStationBaseMarkers stations={stations} onSelectStation={props.onSelectStation} />}</Pane>;
});

const KmaStationBaseLayer = memo(function KmaStationBaseLayer(props: { stations: KmaStation[]; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const stations = useMemo(() => sampleStationMarkers(props.stations, 80), [props.stations]);
  return <Pane name="seismic-station-base-kma" style={{ zIndex: 460 }}>{props.show && <KmaStationBaseMarkers stations={stations} onSelectStation={props.onSelectStation} />}</Pane>;
});

const OceanStationBaseLayer = memo(function OceanStationBaseLayer(props: { stations: OceanStation[]; showSnet: boolean; showOther: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const stations = useMemo(() => props.stations.filter((station) => (
    station.network === "S-net" ? props.showSnet : props.showOther
  )), [props.showOther, props.showSnet, props.stations]);
  return <Pane name="seismic-station-base-ocean" style={{ zIndex: 460 }}>{stations.length > 0 && <OceanStationBaseMarkers stations={stations} onSelectStation={props.onSelectStation} />}</Pane>;
});

function sampleStationMarkers<T extends { id: string; latitude: number; longitude: number }>(stations: T[], maxMarkers: number) {
  if (stations.length <= maxMarkers) return stations;
  const ordered = [...stations].sort((a, b) => (
    a.longitude - b.longitude
    || a.latitude - b.latitude
    || a.id.localeCompare(b.id)
  ));
  const stride = ordered.length / maxMarkers;
  return Array.from({ length: maxMarkers }, (_, index) => ordered[Math.floor(index * stride)]);
}

const SeismicMap = memo(function SeismicMap(props: {
  theme: SeismicMapTheme;
  niedStations: SeismicStation[];
  kmaStations: KmaStation[];
  oceanStations: OceanStation[];
  globalStations: GlobalSeismicStation[];
  globalResponseStations: GlobalSeismicStation[];
  cwaStations: GlobalSeismicStation[];
  cencReport: CencIntensityReport | null;
  niedFrame: NiedRealtimeFrame | null;
  kmaValues: number[];
  kmaReplayRanks: Record<string, number> | null;
  showNied: boolean;
  showKma: boolean;
  showOcean: boolean;
  showOtherOcean: boolean;
  showCenc: boolean;
  showGlobal: boolean;
  showCwa: boolean;
  selectedStation: SelectableStation | null;
  selectedEvent: LiveEew | null;
  selectedReport: EarthquakeEvent | null;
  estimate: HypocenterEstimate | null;
  estimateMode: "live" | "replay";
  replayRanks: Record<string, number> | null;
  oceanRanks: Record<string, number>;
  globalRanks: Record<string, number>;
  cwaRanks: Record<string, number>;
  oceanMode: OceanResponseMode;
  localRegions: JmaRegionCollection;
  officialRegions: JmaRegionCollection;
  showLocalImpact: boolean;
  showOfficialImpact: boolean;
  detectionStationIds: string[];
  detectionRanks: Record<string, number>;
  detectionMode: "live" | "replay";
  detectionSessionKey: string;
  blinkNow: number;
  waveNow: number;
  showWaves: boolean;
  focusTarget: MapFocusTarget | null;
  onSelectStation: (station: SelectableStation) => void;
  onViewportChange: (viewport: FdsnMapViewport) => void;
}) {
  const layer = SEISMIC_MAP_LAYERS[props.theme];
  const [baseLayerStage, setBaseLayerStage] = useState(0);
  useEffect(() => {
    if (baseLayerStage >= 5) return;
    const timer = window.setTimeout(() => setBaseLayerStage((stage) => stage + 1), 350);
    return () => window.clearTimeout(timer);
  }, [baseLayerStage]);
  const pRadius = props.selectedEvent && props.showWaves ? waveRadiusKm(props.selectedEvent.originTime, 6, props.waveNow) : 0;
  const sRadius = props.selectedEvent && props.showWaves ? waveRadiusKm(props.selectedEvent.originTime, 3.5, props.waveNow) : 0;
  const detectionStationSet = new Set(props.detectionStationIds);
  const detectedStations = props.niedStations.filter((station) => detectionStationSet.has(station.id));
  const respondingNiedStations = props.niedStations.filter((station) => {
    const liveRank = niedLevelRank(niedCharToLevel(props.niedFrame?.intensity[station.index]));
    const replayRank = props.replayRanks?.[station.id] ?? 0;
    return liveRank > 0 || replayRank >= 0.25 || detectionStationSet.has(station.id) || props.selectedStation?.id === station.id;
  });
  const displayedNiedResponses = sampleStationMarkers(respondingNiedStations, 180);
  if (props.selectedStation && isNiedStation(props.selectedStation)
    && !displayedNiedResponses.some((station) => station.id === props.selectedStation?.id)) {
    displayedNiedResponses.push(props.selectedStation);
  }
  const gridAnchorRef = useRef<{ sessionKey: string; anchor: NiedGridAnchor } | null>(null);
  if (!detectedStations.length) gridAnchorRef.current = null;
  else if (gridAnchorRef.current?.sessionKey !== props.detectionSessionKey) {
    const strongest = [...detectedStations].sort((a, b) => (props.detectionRanks[b.id] ?? 0) - (props.detectionRanks[a.id] ?? 0))[0];
    gridAnchorRef.current = { sessionKey: props.detectionSessionKey, anchor: niedGridAnchor(strongest) };
  }
  const detectionCells = buildNiedDetectionGridCells(
    props.niedStations,
    props.detectionStationIds,
    props.detectionRanks,
    gridAnchorRef.current?.anchor,
  );
  const blinkOn = Math.floor(props.blinkNow / 450) % 2 === 0;
  const labeledStationIds = new Set(
    [...detectedStations]
      .filter((station) => (props.detectionRanks[station.id] ?? 0) >= 1)
      .sort((a, b) => (props.detectionRanks[b.id] ?? 0) - (props.detectionRanks[a.id] ?? 0))
      .slice(0, 48)
      .map((station) => station.id),
  );
  const labeledOceanStationIds = new Set(
    props.oceanStations
      .filter((station) => (props.oceanRanks[station.id] ?? 0) >= 1)
      .sort((a, b) => (props.oceanRanks[b.id] ?? 0) - (props.oceanRanks[a.id] ?? 0))
      .slice(0, 36)
      .map((station) => station.id),
  );
  const labeledKmaStationIds = new Set(
    props.kmaReplayRanks === null
      ? []
      : props.kmaStations
        .filter((station) => (props.kmaReplayRanks?.[station.id] ?? 0) >= 1)
        .sort((a, b) => (props.kmaReplayRanks?.[b.id] ?? 0) - (props.kmaReplayRanks?.[a.id] ?? 0))
        .slice(0, 36)
        .map((station) => station.id),
  );
  const labeledGlobalStationIds = new Set(
    props.globalResponseStations
      .filter((station) => (props.globalRanks[station.id] ?? 0) >= 1)
      .sort((a, b) => (props.globalRanks[b.id] ?? 0) - (props.globalRanks[a.id] ?? 0))
      .slice(0, 30)
      .map((station) => station.id),
  );
  const respondingGlobalStations = props.globalResponseStations.filter((station) => (
    (props.globalRanks[station.id] ?? 0) >= 0.25
    || props.selectedStation?.id === station.id
  ));
  const displayedGlobalResponses = sampleGlobalStationsForMap(respondingGlobalStations, 96);
  if (props.selectedStation && isGlobalStation(props.selectedStation) && !isCwaStation(props.selectedStation)
    && !displayedGlobalResponses.some((station) => station.id === props.selectedStation?.id)) {
    displayedGlobalResponses.push(props.selectedStation);
  }
  const labeledCwaStationIds = new Set(
    props.cwaStations
      .filter((station) => (props.cwaRanks[station.id] ?? 0) >= 1)
      .sort((a, b) => (props.cwaRanks[b.id] ?? 0) - (props.cwaRanks[a.id] ?? 0))
      .slice(0, 30)
      .map((station) => station.id),
  );
  const displayedCwaResponses = sampleStationMarkers(props.cwaStations.filter((station) => (
    (props.cwaRanks[station.id] ?? 0) >= 0.25 || props.selectedStation?.id === station.id
  )), 96);
  if (props.selectedStation && isCwaStation(props.selectedStation)
    && !displayedCwaResponses.some((station) => station.id === props.selectedStation?.id)) {
    displayedCwaResponses.push(props.selectedStation);
  }
  const displayedKmaResponses = sampleStationMarkers(props.kmaStations.filter((station) => {
    const rank = props.kmaReplayRanks === null
      ? Math.max(0, Number(props.kmaValues[station.index] ?? 0))
      : Math.max(0, Number(props.kmaReplayRanks[station.id] ?? 0));
    return rank >= 0.25 || props.selectedStation?.id === station.id;
  }), 96);
  if (props.selectedStation && isKmaStation(props.selectedStation)
    && !displayedKmaResponses.some((station) => station.id === props.selectedStation?.id)) {
    displayedKmaResponses.push(props.selectedStation);
  }
  const displayedOceanResponses = sampleStationMarkers(props.oceanStations.filter((station) => {
    const rank = props.oceanRanks[station.id] ?? 0;
    const measured = props.oceanMode === "measured" && Object.prototype.hasOwnProperty.call(props.oceanRanks, station.id);
    return rank >= (measured ? 0.5 : 0.25) || props.selectedStation?.id === station.id;
  }), 96);
  if (props.selectedStation && isOceanStation(props.selectedStation)
    && !displayedOceanResponses.some((station) => station.id === props.selectedStation?.id)) {
    displayedOceanResponses.push(props.selectedStation);
  }
  const localRegionKey = props.localRegions.features
    .map((feature) => `${feature.properties.code ?? feature.properties.name}:${feature.properties.rank}:${feature.properties.arrived ? 1 : 0}:${Math.floor(feature.properties.currentRank ?? 0)}`)
    .join("|");
  return (
    <MapContainer center={[36.2, 133.2]} zoom={5} minZoom={2} maxZoom={13} worldCopyJump preferCanvas scrollWheelZoom zoomControl={false} className={`seismic-map seismic-map--${props.theme}`}>
      <SeismicMapThemeClass theme={props.theme} />
      <TileLayer key={props.theme} url={layer.url} attribution={layer.attribution} maxZoom={19} />
      <Pane name="seismic-impact-local" style={{ zIndex: 310, pointerEvents: "none" }}>
        {props.showLocalImpact && props.localRegions.features.length > 0 && <LeafletGeoJSON key={`local:${props.selectedEvent?.id}:${props.selectedEvent?.serial}:${localRegionKey}`} data={props.localRegions} interactive={false} style={(feature) => { const rank = Number(feature?.properties?.rank ?? 0); const currentRank = Number(feature?.properties?.currentRank ?? 0); const arrived = Boolean(feature?.properties?.arrived); const scale = feature?.properties?.scale === "intensity" ? "intensity" : "shindo"; const displayRank = arrived ? Math.max(1, currentRank) : rank; const color = scale === "intensity" ? mmiIntensityColor(displayRank) : jmaShindoColor(displayRank); const contour = Boolean(feature?.properties?.contour); return { color, fillColor: color, weight: arrived ? contour ? 1.8 : 1.45 : 0.8, opacity: arrived ? 0.96 : 0.66, fillOpacity: arrived ? contour ? 0.28 : 0.44 : contour ? 0.08 : 0.16, dashArray: arrived ? undefined : "4 3" }; }} />}
      </Pane>
      <Pane name="seismic-impact-official" style={{ zIndex: 320, pointerEvents: "none" }}>
        {props.showOfficialImpact && props.officialRegions.features.length > 0 && <LeafletGeoJSON key={`official:${props.selectedEvent?.id}:${props.selectedEvent?.serial}`} data={props.officialRegions} interactive={false} style={(feature) => { const rank = Number(feature?.properties?.rank ?? 0); return { color: "#ffffff", fillColor: jmaShindoColor(rank), weight: 1.5, opacity: 0.9, fillOpacity: 0.5 }; }} />}
      </Pane>
      <Pane name="seismic-wave-pane" style={{ zIndex: 390, pointerEvents: "none" }}>
        {props.selectedEvent && !props.selectedEvent.cancelled && <>
          {pRadius > 0 && <Circle center={[props.selectedEvent.latitude, props.selectedEvent.longitude]} radius={pRadius * 1000} interactive={false} pathOptions={{ color: "#38bdf8", weight: 2, opacity: 0.8, fillOpacity: 0.03 }} />}
          {sRadius > 0 && <Circle center={[props.selectedEvent.latitude, props.selectedEvent.longitude]} radius={sRadius * 1000} interactive={false} pathOptions={{ color: "#f97316", weight: 3, opacity: 0.88, fillOpacity: 0.04 }} />}
        </>}
      </Pane>
      <Pane name="seismic-grid-pane" style={{ zIndex: 410, pointerEvents: "none" }}>
        {detectionCells.map((cell) => <Rectangle key={`${props.detectionSessionKey}:${cell.id}`} bounds={cell.bounds} interactive={false} pathOptions={{ color: NIED_GRID_COLORS[cell.color], weight: blinkOn ? 2.8 : 1.6, opacity: blinkOn ? 1 : 0.28, dashArray: props.detectionMode === "replay" ? "7 5" : undefined, fill: false }} />)}
      </Pane>
      <Pane name="seismic-event-pane" style={{ zIndex: 440 }}>
        {props.selectedEvent && !props.selectedEvent.cancelled && <CircleMarker center={[props.selectedEvent.latitude, props.selectedEvent.longitude]} radius={10} pathOptions={{ color: "#fff", fillColor: "#ef4444", weight: 2, fillOpacity: 0.95 }}>
          <Popup><strong>{props.selectedEvent.source} {props.selectedEvent.title}</strong><br />{props.selectedEvent.place}<br />M {props.selectedEvent.magnitude?.toFixed(1) ?? "--"}</Popup>
        </CircleMarker>}
        {props.selectedReport && <CircleMarker center={[props.selectedReport.latitude, props.selectedReport.longitude]} radius={8} pathOptions={{ color: "#ffffff", fillColor: EARTHQUAKE_SOURCE_COLORS[props.selectedReport.source], weight: 2, fillOpacity: 0.94 }}>
          <Popup><strong>{EARTHQUAKE_SOURCE_LABELS[props.selectedReport.source]} 机构报告</strong><br />{props.selectedReport.place}<br />{formatMagnitudeType(props.selectedReport.magnitudeType)} {props.selectedReport.magnitude.toFixed(1)}<br /><a href={props.selectedReport.url} target="_blank" rel="noreferrer">打开机构原文</a></Popup>
        </CircleMarker>}
      </Pane>
      <Pane name="seismic-estimate-pane" style={{ zIndex: 450, pointerEvents: "none" }}>
        {props.estimate && <CircleMarker center={[props.estimate.latitude, props.estimate.longitude]} radius={7} interactive={false} pathOptions={{ color: "#fef08a", fillColor: "#a855f7", weight: 2, fillOpacity: 0.9 }}>
          <LeafletTooltip permanent direction="bottom" offset={[0, 9]} className="seismic-estimate-tooltip"><strong>{props.estimateMode === "replay" ? "回放反演" : "NIED 本地推算"}</strong><span>{props.estimate.latitude.toFixed(3)}, {props.estimate.longitude.toFixed(3)} · 深 {props.estimate.depthKm.toFixed(0)} km</span></LeafletTooltip>
        </CircleMarker>}
      </Pane>
      <CwaStationBaseLayer stations={props.cwaStations} show={props.showCwa && baseLayerStage >= 1} onSelectStation={props.onSelectStation} />
      <GlobalStationBaseLayer stations={props.globalStations} show={props.showGlobal && baseLayerStage >= 2} onSelectStation={props.onSelectStation} />
      <OceanStationBaseLayer stations={props.oceanStations} showSnet={props.showOcean && baseLayerStage >= 3} showOther={props.showOtherOcean && baseLayerStage >= 3} onSelectStation={props.onSelectStation} />
      <KmaStationBaseLayer stations={props.kmaStations} show={props.showKma && baseLayerStage >= 4} onSelectStation={props.onSelectStation} />
      <NiedStationBaseLayer stations={props.niedStations} show={props.showNied && baseLayerStage >= 5} onSelectStation={props.onSelectStation} />
      <Pane name="seismic-station-response-pane" style={{ zIndex: 470 }}>
        {props.showGlobal && displayedGlobalResponses.map((station) => {
          const selected = props.selectedStation?.id === station.id;
          const rank = props.globalRanks[station.id] ?? 0;
          const active = rank >= 0.25;
          const color = active ? mmiIntensityColor(rank) : FDSN_PROVIDER_COLORS[station.providerId] ?? "#38bdf8";
          return <CircleMarker key={`response:${station.id}`} center={[station.latitude, station.longitude]} radius={selected ? 6 : blinkOn ? 5 : 4.2} pathOptions={{ color: "#ffffff", fillColor: color, weight: selected ? 2 : 1.4, opacity: 0.92, fillOpacity: 0.96 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
            {selected && <Popup><strong>{station.network} {station.stationCode}</strong><br />{station.stationName}<br />FDSN：{station.providers.join(" / ")}<br />本地传播估算 MMI {rank.toFixed(1)} · {intensityRomanLabel(rank)}<br />海拔 {station.elevationM?.toFixed(0) ?? "--"} m</Popup>}
            {active && labeledGlobalStationIds.has(station.id) && <LeafletTooltip permanent direction="center" className="kma-station-intensity-label global">{intensityRomanLabel(rank)}</LeafletTooltip>}
          </CircleMarker>;
        })}
        {props.showCwa && displayedCwaResponses.map((station) => {
          const selected = props.selectedStation?.id === station.id;
          const rank = props.cwaRanks[station.id] ?? 0;
          const active = rank >= 0.25;
          const color = active ? jmaShindoColor(rank) : FDSN_PROVIDER_COLORS.cwa;
          return <CircleMarker key={`response:${station.id}`} center={[station.latitude, station.longitude]} radius={selected ? 6 : blinkOn ? 5.2 : 4.4} pathOptions={{ color: "#ffffff", fillColor: color, weight: selected ? 2.2 : 1.6, opacity: 0.96, fillOpacity: 0.98 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
            {selected && <Popup><strong>CWA CWASN {station.stationCode}</strong><br />{station.stationName}<br />本地传播估算震度 {jmaShindoLabel(rank)} · {rank.toFixed(1)}<br /><a href="https://gdms.cwa.gov.tw/map.php" target="_blank" rel="noreferrer">打开 CWA GDMS</a></Popup>}
            {active && labeledCwaStationIds.has(station.id) && <LeafletTooltip permanent direction="center" className={`nied-station-intensity-label cwa rank-${Math.min(7, Math.floor(rank))}`}>{jmaShindoLabel(rank)}</LeafletTooltip>}
          </CircleMarker>;
        })}
        {props.showNied && displayedNiedResponses.map((station) => {
          const level = niedCharToLevel(props.niedFrame?.intensity[station.index]);
          const replayRank = props.replayRanks?.[station.id];
          const rank = props.replayRanks === null ? niedLevelRank(level) : replayRank ?? 0;
          const detected = detectionStationSet.has(station.id);
          const activeRank = detected ? props.detectionRanks[station.id] ?? rank : null;
          const color = niedStationDisplayColor(props.replayRanks === null ? level : 0, activeRank);
          const selected = props.selectedStation?.id === station.id;
          return <CircleMarker key={`response:${station.id}`} center={[station.latitude, station.longitude]} radius={selected ? 6 : detected ? blinkOn ? 5.2 : 4.4 : rank >= 1 ? 4 : 3.2} pathOptions={{ color: selected || detected ? "#ffffff" : color, fillColor: color, weight: selected ? 2.4 : detected ? blinkOn ? 2.2 : 1.1 : 0.8, opacity: detected ? 1 : 0.94, fillOpacity: detected ? 1 : rank >= 1 ? 0.94 : 0.86 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
            {selected && <Popup><strong>{station.stationName}</strong><br />{station.network} {station.stationCode}<br />{props.replayRanks === null ? `实时震度 ${niedLevelLabel(level)}` : `回放模拟震度 ${rank.toFixed(1)}`}</Popup>}
            {detected && labeledStationIds.has(station.id) && <LeafletTooltip permanent direction="center" className={`nied-station-intensity-label rank-${Math.min(7, Math.floor(activeRank ?? 0))}`}>{props.replayRanks === null ? niedLevelLabel(level) : displayRankLabel(activeRank ?? 0)}</LeafletTooltip>}
          </CircleMarker>;
        })}
        {props.showKma && displayedKmaResponses.map((station) => {
          const rank = props.kmaReplayRanks === null
            ? Math.max(0, Number(props.kmaValues[station.index] ?? 0))
            : Math.max(0, Number(props.kmaReplayRanks[station.id] ?? 0));
          const active = props.kmaReplayRanks !== null && rank >= 0.25;
          const selected = props.selectedStation?.id === station.id;
          const color = mmiIntensityColor(rank);
          return <CircleMarker key={`response:${station.id}`} center={[station.latitude, station.longitude]} radius={selected ? 6 : active ? blinkOn ? 5.2 : 4.4 : 3.2} pathOptions={{ color: "#ffffff", fillColor: color, weight: selected ? 2 : 1.5, fillOpacity: rank >= 1 ? 0.94 : 0.82 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
            {selected && <Popup><strong>{station.stationName}</strong><br />KMA-PEWS {props.kmaReplayRanks === null ? "官方实时" : "回放模拟"}测站<br />烈度 {intensityRomanLabel(rank)} · MMI {rank.toFixed(1)}</Popup>}
            {active && labeledKmaStationIds.has(station.id) && <LeafletTooltip permanent direction="center" className="kma-station-intensity-label">{intensityRomanLabel(rank)}</LeafletTooltip>}
          </CircleMarker>;
        })}
        {displayedOceanResponses.filter((station) => (
          props.selectedStation?.id === station.id
          || (station.network === "S-net" ? props.showOcean : props.showOtherOcean)
        )).map((station) => {
          const selected = props.selectedStation?.id === station.id;
          const rank = props.oceanRanks[station.id] ?? 0;
          const measured = props.oceanMode === "measured" && Object.prototype.hasOwnProperty.call(props.oceanRanks, station.id);
          const active = rank >= (measured ? 0.5 : 0.25);
          const color = measured ? intensityColor(Math.max(0, rank)) : active ? intensityColor(rank) : oceanStationBaseColor(station.network);
          const sampleLabel = props.oceanMode === "replay" ? "回放模拟震度" : props.oceanMode === "measured" ? "MSIL 实测色值反算震度" : props.oceanMode === "local" ? "本地预测震度" : "等待数据";
          return <CircleMarker key={`response:${station.id}`} center={[station.latitude, station.longitude]} radius={selected ? 6 : active ? blinkOn ? 5 : 4.3 : 3.2} pathOptions={{ color: "#ffffff", fillColor: color, weight: selected ? 2.2 : 1.5, fillOpacity: active ? 0.96 : 0.82 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
            {selected && <Popup><strong>{station.network} {station.stationCode}</strong><br />海底深度 {station.depthM.toFixed(0)} m<br />{sampleLabel}{measured ? ` ${rank.toFixed(2)} [${displayRankLabel(rank)}]` : active ? ` ${displayRankLabel(rank)}` : ""}<br /><a href={station.waveformUrl} target="_blank" rel="noreferrer">查看官方延迟波形</a></Popup>}
            {active && labeledOceanStationIds.has(station.id) && <LeafletTooltip permanent direction="center" className={`nied-station-intensity-label ocean rank-${Math.min(7, Math.floor(rank))}`}>{displayRankLabel(rank)}</LeafletTooltip>}
          </CircleMarker>;
        })}
        {props.showCenc && props.cencReport && <>
          <CircleMarker center={[props.cencReport.latitude, props.cencReport.longitude]} radius={8} pathOptions={{ color: "#fef3c7", fillColor: "#dc2626", weight: 2, fillOpacity: 0.92 }}><Popup><strong>CENC 仪器烈度报告</strong><br />{props.cencReport.place}<br />M {props.cencReport.magnitude?.toFixed(1) ?? "--"} · {props.cencReport.stations.length} 站</Popup></CircleMarker>
          {props.cencReport.stations.map((station) => { const selected = props.selectedStation?.id === station.id; const color = cencIntensityColor(station.intensity); return <CircleMarker key={station.id} center={[station.latitude, station.longitude]} radius={selected ? 7 : Math.max(3, Math.min(6, station.intensity / 1.8))} pathOptions={{ color: selected ? "#ffffff" : color, fillColor: color, weight: selected ? 2 : 0.8, fillOpacity: 0.92 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>{selected && <Popup><strong>{station.stationName} ({station.stationCode})</strong><br />仪器烈度 {intensityRomanLabel(station.intensity)} · {station.intensity.toFixed(1)}<br />PGA {station.pgaGal?.toFixed(1) ?? "--"} gal · PGV {station.pgvCms?.toFixed(1) ?? "--"} cm/s</Popup>}</CircleMarker>; })}
        </>}
      </Pane>
      <SeismicMapFocus target={props.focusTarget} />
      <SeismicMapViewport onChange={props.onViewportChange} />
      <ZoomControl position="topright" />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
  );
});

export function SeismicLiveDashboard({ onToggleSidebar, onOpenGlobal }: SeismicLiveDashboardProps) {
  const [panelTab, setPanelTab] = usePersistentState<PanelTab>("seismic-panel-tab", "station");
  const [bottomTab, setBottomTab] = usePersistentState<BottomTab>("seismic-bottom-tab", "warnings");
  const [warningOverlayTab, setWarningOverlayTab] = useState<WarningOverlayTab>("latest");
  const [mapTheme, setMapTheme] = usePersistentState<SeismicMapTheme>("seismic-map-theme", "dark");
  const [showNied, setShowNied] = usePersistentState("seismic-show-nied", true);
  const [showKma, setShowKma] = usePersistentState("seismic-show-kma", true);
  const [showOcean, setShowOcean] = usePersistentState("seismic-show-ocean", true);
  const [showOtherOcean, setShowOtherOcean] = usePersistentState("seismic-show-other-ocean", false);
  const [showCenc, setShowCenc] = usePersistentState("seismic-show-cenc-intensity", true);
  const [showGlobalStations, setShowGlobalStations] = usePersistentState("seismic-show-global-fdsn", true);
  const [showCwaStations, setShowCwaStations] = usePersistentState("seismic-show-cwa-cwasn", true);
  const [showLocalImpact, setShowLocalImpact] = usePersistentState("seismic-show-local-impact", true);
  const [showOfficialImpact, setShowOfficialImpact] = usePersistentState("seismic-show-official-impact", true);
  const [snetViewMode, setSnetViewMode] = usePersistentState<SnetViewMode>("seismic-snet-view-mode", "measured");
  const [niedSoundEnabled, setNiedSoundEnabled] = usePersistentState("seismic-nied-sound-enabled", true);
  const [niedSoundVolume, setNiedSoundVolume] = usePersistentState("seismic-nied-sound-volume", 70);
  const [niedSoundStatus, setNiedSoundStatus] = useState("等待最大震度上升");
  const [niedPreviewCue, setNiedPreviewCue] = useState<NiedSoundCue>("shindo2");
  const [catalogue, setCatalogue] = useState<NiedStationCatalogue | null>(null);
  const [oceanCatalogue, setOceanCatalogue] = useState<OceanStationCatalogue | null>(null);
  const [snetSnapshot, setSnetSnapshot] = useState<SnetIntensitySnapshot | null>(null);
  const [snetState, setSnetState] = useState<SourceState>("connecting");
  const [selectedSnetEventId, setSelectedSnetEventId] = useState<string | null>(null);
  const [selectedSnetReportId, setSelectedSnetReportId] = useState<string | null>(null);
  const [jmaRegions, setJmaRegions] = useState<JmaRegionCollection | null>(null);
  const [jmaSeismicSites, setJmaSeismicSites] = useState<JmaSeismicSiteCatalogue | null>(null);
  const [niedFrame, setNiedFrame] = useState<NiedRealtimeFrame | null>(null);
  const [niedState, setNiedState] = useState<SourceState>("connecting");
  const [kmaState, setKmaState] = useState<SourceState>("connecting");
  const [wolfxState, setWolfxState] = useState<SourceState>("connecting");
  const [fanState, setFanState] = useState<SourceState>("connecting");
  const [fallbackLatency, setFallbackLatency] = useState<number | null>(null);
  const [niedCatalogueError, setNiedCatalogueError] = useState("");
  const [oceanCatalogueError, setOceanCatalogueError] = useState("");
  const [jmaCatalogueError, setJmaCatalogueError] = useState("");
  const [globalStationSnapshot, setGlobalStationSnapshot] = useState<GlobalStationSnapshot | null>(null);
  const [eventGlobalStationSnapshot, setEventGlobalStationSnapshot] = useState<{
    eventKey: string;
    snapshot: GlobalStationSnapshot;
  } | null>(null);
  const [globalStationState, setGlobalStationState] = useState<SourceState>("connecting");
  const [globalStationError, setGlobalStationError] = useState("");
  const [cwaStationSnapshot, setCwaStationSnapshot] = useState<GlobalStationSnapshot | null>(null);
  const [cwaStationState, setCwaStationState] = useState<SourceState>("connecting");
  const [cwaStationError, setCwaStationError] = useState("");
  const [globalStationReloadKey, setGlobalStationReloadKey] = useState(0);
  const [mapViewport, setMapViewport] = useState<FdsnMapViewport>({
    minLatitude: 20,
    maxLatitude: 52,
    minLongitude: 112,
    maxLongitude: 154,
    zoom: 5,
  });
  const mapViewportZoomRef = useRef(mapViewport.zoom);
  const [kmaStations, setKmaStations] = useState<KmaStation[]>([]);
  const [kmaValues, setKmaValues] = useState<number[]>([]);
  const [kmaSampleTime, setKmaSampleTime] = useState(0);
  const [kmaLatency, setKmaLatency] = useState<number | null>(null);
  const [wolfxLatency, setWolfxLatency] = useState<number | null>(null);
  const [cencLatency, setCencLatency] = useState<number | null>(null);
  const [cencProvider, setCencProvider] = useState("CENC 后端聚合");
  const [eews, setEews] = useState<LiveEew[]>([]);
  const [eewHistory, setEewHistory] = usePersistentState<LiveEew[]>("seismic-eew-history", []);
  const [warningSourceFilter, setWarningSourceFilter] = usePersistentState<WarningSourceFilter>("seismic-warning-source-filter", "ALL");
  const [warningHistoryLimit, setWarningHistoryLimit] = useState(60);
  const [storedGlobalRefreshSeconds, setGlobalRefreshSeconds] = usePersistentState("earthquake-refresh-interval-seconds", 60);
  const [institutionReports, setInstitutionReports] = useState<EarthquakeEvent[]>([]);
  const [officialState, setOfficialState] = useState<SourceState>("connecting");
  const [officialLatency, setOfficialLatency] = useState<number | null>(null);
  const [institutionSourceCount, setInstitutionSourceCount] = useState(0);
  const [selectedInstitutionReportId, setSelectedInstitutionReportId] = useState<string | null>(null);
  const [expandedOfficialKey, setExpandedOfficialKey] = useState<string | null>(null);
  const [selectedEewKey, setSelectedEewKey] = useState<string | null>(null);
  const [selectedPreviewUntil, setSelectedPreviewUntil] = useState(0);
  const [cencReports, setCencReports] = usePersistentState<CencIntensitySummary[]>("seismic-cenc-intensity-list", []);
  const [cencReport, setCencReport] = usePersistentState<CencIntensityReport | null>("seismic-cenc-intensity-detail", null);
  const [selectedCencId, setSelectedCencId] = useState<string | null>(() => cencReport?.id ?? cencReports[0]?.id ?? null);
  const [cencState, setCencState] = useState<SourceState>(() => cencReports.length || cencReport ? "stale" : "connecting");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedGlobalStation, setSelectedGlobalStation] = useState<GlobalSeismicStation | null>(null);
  const [stationSelectionReason, setStationSelectionReason] = useState<StationSelectionReason>("manual");
  const [stationSearch, setStationSearch] = useState("");
  const [history, setHistory] = useState<StationSample[]>([]);
  const [triggers, setTriggers] = useState<TriggerObservation[]>([]);
  const [niedDetection, setNiedDetection] = useState(() => blankDetection("NIED"));
  const [kmaDetection, setKmaDetection] = useState(() => blankDetection("KMA-PEWS"));
  const [replaySeconds, setReplaySeconds] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const niedDetector = useRef<ShakeDetectorState | undefined>(undefined);
  const kmaDetector = useRef<ShakeDetectorState | undefined>(undefined);
  const previousNiedSoundState = useRef<{ sessionKey: string; index: number } | null>(null);
  const previousReplayNiedSoundState = useRef<{ sessionKey: string; index: number } | null>(null);
  const replayClockRef = useRef<number | null>(null);
  const niedAudioRef = useRef<HTMLAudioElement | null>(null);
  const niedAudioContextRef = useRef<AudioContext | null>(null);
  const niedAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const niedAudioBuffersRef = useRef(new Map<NiedSoundCue, AudioBuffer>());
  const autoNiedSelectionSession = useRef<string | null>(null);
  const globalRefreshSeconds = normalizeEarthquakeRefreshSeconds(storedGlobalRefreshSeconds);

  useEffect(() => {
    setEewHistory((current) => {
      const regionalOnly = current.filter((event) => event.relay !== "Catalogue");
      return regionalOnly.length === current.length ? current : regionalOnly;
    });
  }, [setEewHistory]);

  useEffect(() => {
    const legacyPanel = String(panelTab);
    if (legacyPanel === "inference" || legacyPanel === "replay") setBottomTab(legacyPanel);
    if (legacyPanel !== "station" && legacyPanel !== "intensity" && legacyPanel !== "snet") setPanelTab("station");
    if (!["inference", "replay", "warnings", "reports"].includes(String(bottomTab))) setBottomTab("warnings");
    if (warningSourceFilter !== "ALL" && !LIVE_EEW_SOURCE_ORDER.includes(warningSourceFilter as LiveEewSource)) setWarningSourceFilter("ALL");
  }, [bottomTab, panelTab, setBottomTab, setPanelTab, setWarningSourceFilter, warningSourceFilter]);

  const focusMap = useCallback((id: string, latitude: number, longitude: number, zoom: number, exact = false) => {
    setMapFocus({ key: `${id}:${Date.now()}`, latitude, longitude, zoom, exact });
  }, []);

  const updateMapViewport = useCallback((next: FdsnMapViewport) => {
    mapViewportZoomRef.current = next.zoom;
    setMapViewport((current) => {
      const unchanged = current.zoom === next.zoom
        && Math.abs(current.minLatitude - next.minLatitude) < 0.001
        && Math.abs(current.maxLatitude - next.maxLatitude) < 0.001
        && Math.abs(current.minLongitude - next.minLongitude) < 0.001
        && Math.abs(current.maxLongitude - next.maxLongitude) < 0.001;
      return unchanged ? current : next;
    });
  }, []);

  const clearReplayPresentation = useCallback(() => {
    setReplayPlaying(false);
    setReplaySeconds(0);
    setSelectedPreviewUntil(0);
    setWarningOverlayTab("latest");
  }, []);

  const getNiedAudio = useCallback(() => {
    if (!niedAudioRef.current) niedAudioRef.current = new Audio();
    return niedAudioRef.current;
  }, []);

  const getNiedAudioContext = useCallback(() => {
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!niedAudioContextRef.current || niedAudioContextRef.current.state === "closed") {
      niedAudioContextRef.current = new AudioContextConstructor();
    }
    return niedAudioContextRef.current;
  }, []);

  const playNiedCue = useCallback(async (cue: NiedSoundCue) => {
    const cueLabel = cue.replace("shindo", "震度 ");
    setNiedSoundStatus(`正在加载 ${cueLabel}`);
    try {
      const context = getNiedAudioContext();
      if (context?.state === "running") {
        let buffer = niedAudioBuffersRef.current.get(cue);
        if (!buffer) {
          const decodedBuffer = await withBrowserTimeout<AudioBuffer>(
            fetch(NIED_SOUND_URLS[cue]).then(async (response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return context.decodeAudioData(await response.arrayBuffer());
            }),
            5_000,
            "load-timeout",
          );
          niedAudioBuffersRef.current.set(cue, decodedBuffer);
          buffer = decodedBuffer;
        }
        try { niedAudioSourceRef.current?.stop(); } catch { /* already stopped */ }
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = Math.max(0, Math.min(1, niedSoundVolume / 100));
        source.connect(gain);
        gain.connect(context.destination);
        source.onended = () => {
          if (niedAudioSourceRef.current !== source) return;
          niedAudioSourceRef.current = null;
          setNiedSoundStatus(`播放完成 ${cueLabel}`);
        };
        niedAudioSourceRef.current = source;
        source.start();
        setNiedSoundStatus(`正在播放 ${cueLabel}`);
      } else {
        if (context?.state === "suspended") void context.resume().catch(() => undefined);
        const audio = getNiedAudio();
        audio.pause();
        audio.src = NIED_SOUND_URLS[cue];
        audio.preload = "auto";
        audio.volume = Math.max(0, Math.min(1, niedSoundVolume / 100));
        audio.currentTime = 0;
        audio.onended = () => setNiedSoundStatus(`播放完成 ${cueLabel}`);
        await withBrowserTimeout(audio.play(), 5_000, "load-timeout");
        setNiedSoundStatus(`正在播放 ${cueLabel}`);
      }
    } catch (error) {
      niedAudioRef.current?.pause();
      const message = error instanceof Error ? error.message : "";
      setNiedSoundStatus(message === "load-timeout"
        ? "音效加载超时，请检查本地服务"
        : "浏览器阻止自动播放，请点击试听授权");
    }
  }, [getNiedAudio, getNiedAudioContext, niedSoundVolume]);

  const primeReplayAudio = useCallback(async () => {
    if (!niedSoundEnabled) return;
    const context = getNiedAudioContext();
    const audio = getNiedAudio();
    audio.pause();
    audio.src = NIED_SOUND_URLS.shindo0;
    audio.preload = "auto";
    audio.volume = 0;
    audio.currentTime = 0;
    const attempts: Promise<unknown>[] = [
      withBrowserTimeout(audio.play(), 2_500, "media-prime-timeout").then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = Math.max(0, Math.min(1, niedSoundVolume / 100));
      }),
    ];
    if (context) attempts.push(withBrowserTimeout(context.resume(), 2_500, "context-prime-timeout"));
    const outcomes = await Promise.allSettled(attempts);
    if (outcomes.some((outcome) => outcome.status === "fulfilled")) {
      setNiedSoundStatus("回放音效已授权，等待最大震度上升");
    } else {
      setNiedSoundStatus("浏览器阻止自动播放，请点击试听授权");
    }
  }, [getNiedAudio, getNiedAudioContext, niedSoundEnabled, niedSoundVolume]);

  useEffect(() => () => {
    try { niedAudioSourceRef.current?.stop(); } catch { /* already stopped */ }
    niedAudioRef.current?.pause();
    void niedAudioContextRef.current?.close();
  }, []);

  const ingestEew = useCallback((normalized: LiveEew) => {
    setEews((current) => {
      const existing = current.find((event) => event.id === normalized.id);
      const next = existing && existing.serial > normalized.serial
        ? current
        : [normalized, ...current.filter((event) => event.id !== normalized.id)];
      return next.sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt)).slice(0, 30);
    });
    setEewHistory((current) => mergeEewHistory(current, normalized));
    setSelectedEewKey((current) => current ?? eewReportKey(normalized));
  }, [setEewHistory]);

  const loadCatalogues = useCallback(() => {
    setNiedCatalogueError("");
    setOceanCatalogueError("");
    const niedTask = fetchNiedStations()
      .then((nied) => setCatalogue(nied))
      .catch((error) => {
        setNiedCatalogueError(error instanceof Error ? error.message : String(error));
        throw error;
      });
    const oceanTask = fetchOceanStations()
      .then((ocean) => setOceanCatalogue(ocean))
      .catch((error) => {
        setOceanCatalogueError(error instanceof Error ? error.message : String(error));
        throw error;
      });
    return Promise.allSettled([niedTask, oceanTask]);
  }, []);

  useEffect(() => {
    let active = true;
    let retryTimer = 0;
    const load = async () => {
      const results = await loadCatalogues();
      if (active && results.some((result) => result.status === "rejected")) {
        retryTimer = window.setTimeout(load, 15_000);
      }
    };
    void load();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, [loadCatalogues]);

  useEffect(() => {
    if (!showGlobalStations) {
      setGlobalStationState("stale");
      return;
    }
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setGlobalStationState("connecting");
      setGlobalStationError("");
      let nextDelay = 10 * 60_000;
      try {
        const snapshot = await fetchGlobalStations(mapViewport, controller.signal, GLOBAL_FDSN_PROVIDER_IDS);
        if (!active) return;
        setGlobalStationSnapshot(snapshot);
        setGlobalStationState(snapshot.stale ? "stale" : "online");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        nextDelay = 15_000;
        setGlobalStationState("error");
        setGlobalStationError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) timer = window.setTimeout(load, nextDelay);
      }
    };
    timer = window.setTimeout(load, 420);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [globalStationReloadKey, mapViewport, showGlobalStations]);

  useEffect(() => {
    if (!showCwaStations) {
      setCwaStationState("stale");
      return;
    }
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setCwaStationState("connecting");
      setCwaStationError("");
      let nextDelay = 10 * 60_000;
      try {
        const snapshot = await fetchCwaStations(controller.signal);
        if (!active) return;
        setCwaStationSnapshot(snapshot);
        setCwaStationState(snapshot.stale ? "stale" : "online");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        nextDelay = 15_000;
        setCwaStationState("error");
        setCwaStationError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) timer = window.setTimeout(load, nextDelay);
      }
    };
    void load();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [globalStationReloadKey, showCwaStations]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchSnetIntensity(controller.signal);
        if (!active) return;
        setSnetSnapshot(snapshot);
        setSnetState(snapshot.stale ? "stale" : "online");
        setSelectedSnetEventId((current) => current && snapshot.events.some((event) => event.id === current)
          ? current
          : snapshot.events[0]?.id ?? null);
        setSelectedSnetReportId((current) => current && snapshot.events.some((event) => event.reports?.some((report) => report.id === current))
          ? current
          : snapshot.events[0]?.reports?.slice(-1)[0]?.id ?? null);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setSnetState("error");
      } finally {
        if (active) timer = window.setTimeout(poll, 15_000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/data/jp.eew.topo.json", { signal: controller.signal }),
      fetch("/data/jma-seismic-sites.json", { signal: controller.signal }),
    ])
      .then(async ([topologyResponse, sitesResponse]) => {
        if (!topologyResponse.ok) throw new Error(`JMA 区域边界 ${topologyResponse.status}`);
        if (!sitesResponse.ok) throw new Error(`JMA 观测点目录 ${sitesResponse.status}`);
        return Promise.all([
          topologyResponse.json() as Promise<{ objects?: { region?: unknown } }>,
          sitesResponse.json() as Promise<JmaSeismicSiteCatalogue>,
        ]);
      })
      .then(([topology, sites]) => {
        if (!topology.objects?.region) throw new Error("JMA 区域边界格式无效");
        if (!sites.regions || !Object.keys(sites.regions).length) throw new Error("JMA 观测点目录格式无效");
        setJmaRegions(topojsonFeature(topology, topology.objects.region) as JmaRegionCollection);
        setJmaSeismicSites(sites);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setJmaCatalogueError((current) => current || (error instanceof Error ? error.message : String(error)));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      const started = Date.now();
      try {
        const snapshot = await fetchEarthquakeSnapshot({ range: "90d", minMagnitude: 4, signal: controller.signal });
        if (!active) return;
        setInstitutionReports((current) => mergeEarthquakeEventHistory(current, snapshot.events));
        const availability = summarizeEarthquakeSourceAvailability(snapshot.sources);
        setInstitutionSourceCount(availability.availableCount);
        setOfficialLatency(Date.now() - started);
        setOfficialState(availability.state);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setOfficialState("error");
      } finally {
        if (active) timer = window.setTimeout(poll, globalRefreshSeconds * 1000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [globalRefreshSeconds]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const frame = await fetchNiedRealtime();
        if (!active) return;
        setNiedFrame(frame);
        setNiedState(frame.stale ? "stale" : "online");
      } catch {
        if (active) setNiedState("error");
      } finally {
        if (active) timer = window.setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchKmaPews(controller.signal);
        if (!active || snapshot.stations.length !== snapshot.mmi.length) return;
        setKmaStations(makeKmaStations(snapshot.stations));
        setKmaValues(snapshot.mmi);
        setKmaSampleTime(snapshot.sampleTime);
        setKmaLatency(snapshot.latencyMs);
        setKmaState(snapshot.stale ? "stale" : "online");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setKmaState("error");
      } finally {
        if (active) timer = window.setTimeout(poll, 1_000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchEewRelay(controller.signal);
        if (!active) return;
        snapshot.events.map(normalizeWolfxEew).filter((event): event is LiveEew => Boolean(event)).forEach(ingestEew);
        setWolfxState(snapshot.sources.wolfx.state);
        setWolfxLatency(snapshot.sources.wolfx.latencyMs);
        setFanState(snapshot.sources.p2p.state);
        setFallbackLatency(snapshot.sources.p2p.latencyMs);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setWolfxState("error");
        setFanState("error");
        setWolfxLatency(null);
        setFallbackLatency(null);
      } finally {
        if (active) timer = window.setTimeout(poll, 3_000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [ingestEew]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    let hasCachedData = cencReports.length > 0 || cencReport !== null;
    let listSignature = cencReports.map((report) => report.id).join("|");
    let detailSignature = cencReport ? `${cencReport.id}:${cencReport.createdAt}:${cencReport.stationMetrics?.length ?? cencReport.stations.length}` : "";
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchCencIntensity(selectedCencId, controller.signal);
        if (!active) return;
        setCencProvider(snapshot.provider);
        const reports = normalizeCencIntensityList(snapshot.listEnvelope);
        if (reports.length) {
          hasCachedData = true;
          const nextListSignature = reports.map((report) => report.id).join("|");
          if (nextListSignature !== listSignature) {
            listSignature = nextListSignature;
            setCencReports(reports);
          }
          setSelectedCencId((current) => current && reports.some((report) => report.id === current) ? current : reports[0].id);
        }
        const report = normalizeCencIntensityDetail(snapshot.detailEnvelope);
        if (report && (!selectedCencId || report.id === selectedCencId)) {
          hasCachedData = true;
          const nextDetailSignature = `${report.id}:${report.createdAt}:${report.stationMetrics.length}`;
          if (nextDetailSignature !== detailSignature) {
            detailSignature = nextDetailSignature;
            setCencReport(report);
          }
        }
        setCencState(snapshot.state === "online" ? "online" : hasCachedData ? "stale" : snapshot.state);
        setCencLatency(snapshot.latencyMs);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setCencState(hasCachedData ? "stale" : "error");
        setCencLatency(null);
      } finally {
        if (active) timer = window.setTimeout(poll, 2_000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [selectedCencId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setClock(Date.now()), 1_000);
    return () => window.clearTimeout(timer);
  }, [clock]);

  useEffect(() => {
    if (warningOverlayTab === "selected" && selectedPreviewUntil > 0 && clock >= selectedPreviewUntil) setWarningOverlayTab("latest");
  }, [clock, selectedPreviewUntil, warningOverlayTab]);

  useEffect(() => {
    if (!replayPlaying) {
      replayClockRef.current = null;
      return;
    }
    if (replayClockRef.current === null) replayClockRef.current = performance.now();
    const timer = window.setTimeout(() => {
      const currentTick = performance.now();
      const elapsedSeconds = Math.max(0, (currentTick - (replayClockRef.current ?? currentTick)) / 1000);
      replayClockRef.current = currentTick;
      setReplaySeconds((value) => Math.min(300, value + elapsedSeconds));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [replayPlaying, replaySeconds]);

  useEffect(() => {
    if (replaySeconds < 300) return;
    clearReplayPresentation();
  }, [clearReplayPresentation, replaySeconds]);

  useEffect(() => {
    if (bottomTab === "replay") return;
    clearReplayPresentation();
  }, [bottomTab, clearReplayPresentation]);

  useEffect(() => {
    setReplayPlaying(false);
    setReplaySeconds(0);
  }, [selectedEewKey]);

  const niedNeighbors = useMemo(() => buildStationNeighborMap(catalogue?.stations ?? []), [catalogue]);
  const kmaNeighbors = useMemo(() => buildStationNeighborMap(kmaStations, 30, 64), [kmaStations]);

  useEffect(() => {
    niedDetector.current = undefined;
    setTriggers([]);
    setNiedDetection(blankDetection("NIED"));
  }, [catalogue?.siteConfigId]);

  useEffect(() => {
    if (!catalogue || !niedFrame || catalogue.siteConfigId !== niedFrame.siteConfigId) return;
    const timestamp = Date.parse(niedFrame.dataTime);
    if (!Number.isFinite(timestamp)) return;
    const update = updateNiedShakeDetection(niedDetector.current, catalogue.stations, niedFrame.intensity, timestamp, niedNeighbors);
    niedDetector.current = update.state;
    setNiedDetection(update.status);
    setTriggers(update.observations);
  }, [catalogue, niedFrame, niedNeighbors]);

  useEffect(() => {
    kmaDetector.current = undefined;
    setKmaDetection(blankDetection("KMA-PEWS"));
  }, [kmaStations.length, kmaStations[0]?.latitude, kmaStations[kmaStations.length - 1]?.longitude]);

  useEffect(() => {
    if (!kmaStations.length || kmaValues.length !== kmaStations.length || !kmaSampleTime) return;
    const update = updateKmaPewsDetection(kmaDetector.current, kmaStations, kmaValues, kmaSampleTime, kmaNeighbors);
    kmaDetector.current = update.state;
    setKmaDetection(update.status);
  }, [kmaNeighbors, kmaSampleTime, kmaStations, kmaValues]);

  const institutionEewReports = useMemo(
    () => institutionReports.flatMap((report) => institutionReportToLiveEew(report) ?? []),
    [institutionReports],
  );
  const institutionHistoryReports = useMemo(
    () => buildInstitutionHistoryReports(institutionReports),
    [institutionReports],
  );
  const regionalHistory = useMemo(
    () => eewHistory.filter((event) => event.relay !== "Catalogue"),
    [eewHistory],
  );
  const historyEvents = useMemo(
    () => collapseEewHistoryEvents([...regionalHistory, ...institutionHistoryReports], institutionReports),
    [institutionHistoryReports, institutionReports, regionalHistory],
  );
  const filteredHistoryEvents = useMemo(
    () => filterEewHistoryEventsBySource(historyEvents, warningSourceFilter),
    [historyEvents, warningSourceFilter],
  );
  const displayedHistoryEvents = useMemo(
    () => filteredHistoryEvents.slice(0, warningHistoryLimit),
    [filteredHistoryEvents, warningHistoryLimit],
  );
  const historySourceCounts = useMemo(() => Object.fromEntries(
    LIVE_EEW_SOURCE_ORDER.map((source) => [source, historyEvents.filter((event) => event.latestReport.source === source).length]),
  ) as Record<LiveEewSource, number>, [historyEvents]);
  const activeEews = useMemo(() => {
    const reports = new Map<string, LiveEew>();
    for (const event of [...eews, ...regionalHistory, ...institutionEewReports]) reports.set(eewReportKey(event), event);
    return [...reports.values()]
      .filter((event) => isLiveEewActive(event, clock))
      .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt));
  }, [clock, eews, institutionEewReports, regionalHistory]);
  const latestEvent = activeEews[0] ?? null;
  const selectedEvent = useMemo(() => {
    const selected = selectedEewKey
      ? [...regionalHistory, ...institutionEewReports].find((event) => eewReportKey(event) === selectedEewKey)
      : null;
    return selected ?? historyEvents[0]?.latestReport ?? latestEvent ?? null;
  }, [historyEvents, institutionEewReports, latestEvent, regionalHistory, selectedEewKey]);
  const selectedInstitutionReport = institutionReports.find((report) => report.id === selectedInstitutionReportId) ?? null;
  const cwaStations = useMemo(
    () => cwaStationSnapshot?.stations ?? [],
    [cwaStationSnapshot],
  );
  const globalFdsnStations = useMemo(
    () => (globalStationSnapshot?.stations ?? []).filter((station) => station.providerId !== "cwa"),
    [globalStationSnapshot],
  );
  const stationProviderSources = useMemo(() => [
    ...(globalStationSnapshot?.sources ?? []),
    ...(cwaStationSnapshot?.sources ?? []),
  ], [cwaStationSnapshot, globalStationSnapshot]);
  const allSelectableStations = useMemo<SelectableStation[]>(() => {
    const stations = [
      ...(catalogue?.stations ?? []),
      ...kmaStations,
      ...(oceanCatalogue?.stations ?? []),
      ...(cencReport?.stations ?? []),
      ...globalFdsnStations,
      ...(eventGlobalStationSnapshot?.snapshot.stations ?? []).filter((station) => station.providerId !== "cwa"),
      ...cwaStations,
    ];
    return [...new Map(stations.map((station) => [station.id, station])).values()];
  }, [catalogue, cencReport, cwaStations, eventGlobalStationSnapshot, globalFdsnStations, kmaStations, oceanCatalogue]);
  const selectedStation = allSelectableStations.find((station) => station.id === selectedStationId)
    ?? (selectedGlobalStation?.id === selectedStationId ? selectedGlobalStation : null);
  const replayEvent = selectedEvent && (replayPlaying || replaySeconds > 0) ? selectedEvent : null;
  const replaySimulation = useMemo(() => replayEvent && catalogue
    ? simulateReplayStationResponse(replayEvent, catalogue.stations, replaySeconds)
    : null, [catalogue, replayEvent, replaySeconds]);
  const kmaReplaySimulation = useMemo(() => replayEvent && kmaStations.length
    ? simulateReplayStationResponse(replayEvent, kmaStations, replaySeconds, "intensity")
    : null, [kmaStations, replayEvent, replaySeconds]);
  const oceanResponseEvent = replayEvent ?? latestEvent;
  const oceanResponseElapsed = oceanResponseEvent
    ? replayEvent
      ? replaySeconds
      : Math.max(0, Math.min(300, (clock - Date.parse(oceanResponseEvent.originTime)) / 1000))
    : 0;
  const oceanSimulation = useMemo(() => oceanResponseEvent && oceanCatalogue
    ? simulateReplayStationResponse(oceanResponseEvent, oceanCatalogue.stations, oceanResponseElapsed)
    : null, [oceanCatalogue, oceanResponseElapsed, oceanResponseEvent]);
  const eventStationKey = oceanResponseEvent
    ? `${oceanResponseEvent.id}:${oceanResponseEvent.latitude.toFixed(4)}:${oceanResponseEvent.longitude.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!showGlobalStations || !oceanResponseEvent || !eventStationKey) {
      setEventGlobalStationSnapshot(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setEventGlobalStationSnapshot((current) => current?.eventKey === eventStationKey ? current : null);
    void fetchGlobalStations(
      buildEventStationViewport(oceanResponseEvent.latitude, oceanResponseEvent.longitude),
      controller.signal,
      GLOBAL_FDSN_PROVIDER_IDS,
    ).then((snapshot) => {
      if (active) setEventGlobalStationSnapshot({ eventKey: eventStationKey, snapshot });
    }).catch((error) => {
      if (active && !(error instanceof DOMException && error.name === "AbortError")) {
        setGlobalStationError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [eventStationKey, globalStationReloadKey, oceanResponseEvent?.latitude, oceanResponseEvent?.longitude, showGlobalStations]);
  const globalResponseStations = useMemo(() => {
    const merged = new Map(globalFdsnStations.map((station) => [station.id, station]));
    if (eventGlobalStationSnapshot?.eventKey === eventStationKey) {
      for (const station of eventGlobalStationSnapshot.snapshot.stations) {
        if (station.providerId !== "cwa") merged.set(station.id, station);
      }
    }
    return [...merged.values()];
  }, [eventGlobalStationSnapshot, eventStationKey, globalFdsnStations]);
  const mapGlobalFdsnStations = useMemo(
    () => sampleGlobalStationsForMap(globalFdsnStations),
    [globalFdsnStations],
  );
  const globalSimulation = useMemo(() => oceanResponseEvent && globalResponseStations.length
    ? simulateReplayStationResponse(oceanResponseEvent, globalResponseStations, oceanResponseElapsed, "intensity")
    : null, [globalResponseStations, oceanResponseElapsed, oceanResponseEvent]);
  const cwaSimulation = useMemo(() => oceanResponseEvent && cwaStations.length
    ? simulateReplayStationResponse(oceanResponseEvent, cwaStations, oceanResponseElapsed, "shindo")
    : null, [cwaStations, oceanResponseElapsed, oceanResponseEvent]);
  const oceanMode: OceanResponseMode = replayEvent ? "replay" : latestEvent ? "local" : "idle";
  const selectedSnetEvent = useMemo<SnetIntensityEvent | null>(() => (
    snetSnapshot?.events.find((event) => event.id === selectedSnetEventId)
      ?? snetSnapshot?.events[0]
      ?? null
  ), [selectedSnetEventId, snetSnapshot]);
  const selectedSnetReport = selectedSnetEvent?.reports?.find((report) => report.id === selectedSnetReportId)
    ?? selectedSnetEvent?.reports?.slice(-1)[0]
    ?? null;
  const snetMeasuredFrame = selectedSnetEvent?.frames.find((frame) => frame.stamp === selectedSnetReport?.frameStamp)
    ?? selectedSnetEvent?.peakFrame
    ?? snetSnapshot?.latestFrame
    ?? null;
  const snetMeasuredRanks = useMemo(() => Object.fromEntries(
    (snetMeasuredFrame?.stations ?? []).map((station) => [station.stationId, station.intensity]),
  ), [snetMeasuredFrame]);
  const displayedOceanRanks = replayEvent
    ? oceanSimulation?.ranks ?? {}
    : snetViewMode === "measured" && snetMeasuredFrame
      ? snetMeasuredRanks
      : oceanSimulation?.ranks ?? {};
  const displayedOceanMode: OceanResponseMode = replayEvent
    ? "replay"
    : snetViewMode === "measured" && snetMeasuredFrame
      ? "measured"
      : oceanMode;
  const liveDetectionRanks = useMemo(() => {
    const ranks: Record<string, number> = {};
    const activeIds = new Set(niedDetection.activeStationIds);
    for (const station of catalogue?.stations ?? []) {
      if (!activeIds.has(station.id)) continue;
      const detectorLevel = niedDetector.current?.stations[station.index]?.activityLevel;
      const frameLevel = niedCharToLevel(niedFrame?.intensity[station.index]);
      ranks[station.id] = niedLevelRank(detectorLevel !== undefined && detectorLevel >= 0 ? detectorLevel : frameLevel);
    }
    return ranks;
  }, [catalogue, niedDetection, niedFrame]);

  const currentLiveNiedSoundIndex = niedSoundIndex(niedDetection.currentMaxLevel);
  const replayNiedSoundSessionKey = replayEvent ? `replay:${eewReportKey(replayEvent)}` : "";
  const currentReplayNiedSoundIndex = replayNiedSoundIndex(replaySimulation);
  useEffect(() => {
    if (replayEvent) return;
    const previous = previousNiedSoundState.current;
    previousNiedSoundState.current = { sessionKey: "live", index: currentLiveNiedSoundIndex };
    if (currentLiveNiedSoundIndex < 0) setNiedSoundStatus(niedSoundEnabled ? "等待最大震度上升" : "音效已关闭");
    if (!previous || previous.sessionKey !== "live") return;
    const cue = niedSoundCueForRise(previous.index, currentLiveNiedSoundIndex, niedSoundEnabled);
    if (!cue) return;
    void playNiedCue(cue);
  }, [currentLiveNiedSoundIndex, niedSoundEnabled, playNiedCue, replayEvent]);

  useEffect(() => {
    if (!replayEvent) {
      previousReplayNiedSoundState.current = null;
      return;
    }
    const previous = previousReplayNiedSoundState.current;
    previousReplayNiedSoundState.current = {
      sessionKey: replayNiedSoundSessionKey,
      index: currentReplayNiedSoundIndex,
    };
    if (currentReplayNiedSoundIndex < 0) setNiedSoundStatus(niedSoundEnabled ? "回放等待最大震度上升" : "音效已关闭");
    if (!previous || previous.sessionKey !== replayNiedSoundSessionKey) return;
    const cue = niedSoundCueForRise(previous.index, currentReplayNiedSoundIndex, niedSoundEnabled);
    if (!cue || !replayPlaying) return;
    setNiedSoundStatus(`正在播放 ${cue.replace("shindo", "震度 ")}`);
    void playNiedCue(cue);
  }, [currentReplayNiedSoundIndex, niedSoundEnabled, playNiedCue, replayEvent, replayNiedSoundSessionKey, replayPlaying]);

  const focusStation = useCallback((station: SelectableStation, reason: StationSelectionReason = "manual") => {
    setSelectedStationId(station.id);
    setSelectedGlobalStation(isGlobalStation(station) ? station : null);
    setStationSelectionReason(reason);
    setPanelTab("station");
    focusMap(`station:${station.id}`, station.latitude, station.longitude, isCencStation(station) ? 9 : isGlobalStation(station) ? Math.max(6, mapViewportZoomRef.current) : 7);
  }, [focusMap, setPanelTab]);

  useEffect(() => {
    if (selectedStationId || !catalogue?.stations.length) return;
    const tokyo = [...catalogue.stations].sort((a, b) => Math.hypot(a.latitude - 35.681, a.longitude - 139.767) - Math.hypot(b.latitude - 35.681, b.longitude - 139.767))[0];
    if (tokyo) setSelectedStationId(tokyo.id);
  }, [catalogue, selectedStationId]);

  const selectedRank = useMemo(() => {
    if (!selectedStation) return null;
    if (isCwaStation(selectedStation)) return cwaSimulation?.ranks[selectedStation.id] ?? 0;
    if (isGlobalStation(selectedStation)) return globalSimulation?.ranks[selectedStation.id] ?? 0;
    if (isNiedStation(selectedStation)) return replaySimulation?.ranks[selectedStation.id] ?? niedLevelRank(niedCharToLevel(niedFrame?.intensity[selectedStation.index]));
    if (isKmaStation(selectedStation)) return kmaReplaySimulation?.ranks[selectedStation.id] ?? Math.max(0, Number(kmaValues[selectedStation.index] ?? 0));
    if (isCencStation(selectedStation)) return selectedStation.intensity;
    return displayedOceanRanks[selectedStation.id] ?? 0;
  }, [cwaSimulation, displayedOceanRanks, globalSimulation, kmaReplaySimulation, kmaValues, niedFrame, replaySimulation, selectedStation]);

  useEffect(() => { setHistory([]); }, [selectedStationId]);

  useEffect(() => {
    if (!selectedStation || selectedRank === null || replayEvent || isCencStation(selectedStation)) return;
    if (isOceanStation(selectedStation) && displayedOceanMode === "measured") return;
    const timestamp = isNiedStation(selectedStation)
      ? Date.parse(niedFrame?.dataTime ?? "")
      : isKmaStation(selectedStation)
        ? kmaSampleTime
        : latestEvent
          ? clock
          : 0;
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    setHistory((current) => {
      if (current[current.length - 1]?.timestamp === timestamp) return current;
      const label = isNiedStation(selectedStation)
        ? `JMA ${selectedRank}`
        : isKmaStation(selectedStation)
          ? `MMI ${selectedRank.toFixed(1)}`
          : `本地预测 ${selectedRank.toFixed(1)}`;
      return [...current, { timestamp, value: selectedRank, label }].slice(-HISTORY_LIMIT);
    });
  }, [clock, displayedOceanMode, kmaSampleTime, latestEvent, niedFrame?.dataTime, replayEvent, selectedRank, selectedStation]);

  const replayStationHistory = useMemo<StationSample[]>(() => {
    if (!replayEvent || !selectedStation || isCencStation(selectedStation)) return [];
    const originTime = Date.parse(replayEvent.originTime);
    if (!Number.isFinite(originTime)) return [];
    const lastStep = Math.max(0, Math.round(replaySeconds * 4));
    const firstStep = Math.max(0, lastStep - HISTORY_LIMIT + 1);
    const samples: StationSample[] = [];
    for (let step = firstStep; step <= lastStep; step += 1) {
      const elapsedSeconds = step / 4;
      const value = simulateReplayStationResponse(
        replayEvent,
        [selectedStation],
        elapsedSeconds,
        isKmaStation(selectedStation) || (isGlobalStation(selectedStation) && !isCwaStation(selectedStation)) ? "intensity" : "shindo",
      ).ranks[selectedStation.id] ?? 0;
      samples.push({
        timestamp: originTime + elapsedSeconds * 1000,
        value,
        label: isKmaStation(selectedStation) || (isGlobalStation(selectedStation) && !isCwaStation(selectedStation))
          ? `回放烈度 ${intensityRomanLabel(value)}`
          : `回放震度 ${jmaShindoLabel(value)}`,
      });
    }
    return samples;
  }, [replayEvent, replaySeconds, selectedStation]);
  const snetMeasuredStationHistory = useMemo<StationSample[]>(() => {
    if (!selectedStation || !isOceanStation(selectedStation) || displayedOceanMode !== "measured") return [];
    const frames = selectedSnetEvent?.frames ?? (snetSnapshot?.latestFrame ? [snetSnapshot.latestFrame] : []);
    return frames.flatMap((frame) => {
      const sample = frame.stations.find((station) => station.stationId === selectedStation.id);
      return sample ? [{
        timestamp: Date.parse(frame.timestamp),
        value: sample.intensity,
        label: `实测反算 ${jmaShindoLabel(sample.intensity)}`,
      }] : [];
    });
  }, [displayedOceanMode, selectedSnetEvent, selectedStation, snetSnapshot]);
  const rollingHistory = replayEvent
    ? replayStationHistory
    : selectedStation && isOceanStation(selectedStation) && displayedOceanMode === "measured"
      ? snetMeasuredStationHistory
      : history;

  const searchResults = useMemo(() => {
    const query = stationSearch.trim().toLowerCase();
    if (!query) return [];
    return allSelectableStations.filter((station) => {
      const prefecture = "prefecture" in station ? station.prefecture : "";
      const address = isCencStation(station) ? station.address : "";
      return `${station.stationName} ${station.stationCode} ${prefecture} ${station.network} ${address}`.toLowerCase().includes(query);
    }).slice(0, 60);
  }, [allSelectableStations, stationSearch]);

  const selectNearest = (latitude: number, longitude: number, network?: "KMA") => {
    const candidates = network === "KMA" ? kmaStations : catalogue?.stations ?? [];
    const nearest = [...candidates].sort((a, b) => Math.hypot(a.latitude - latitude, a.longitude - longitude) - Math.hypot(b.latitude - latitude, b.longitude - longitude))[0];
    if (nearest) focusStation(nearest);
  };

  const chooseEvent = (event: LiveEew, showSelection = true) => {
    setSelectedEewKey(eewReportKey(event));
    if (showSelection) {
      setWarningOverlayTab("selected");
      setSelectedPreviewUntil(Date.now() + 20_000);
    }
    focusMap(`event:${eewReportKey(event)}`, event.latitude, event.longitude, 6, true);
  };

  const chooseInstitutionReport = (report: EarthquakeEvent) => {
    setSelectedInstitutionReportId(report.id);
    const event = institutionReportToLiveEew(report);
    if (event) {
      setSelectedEewKey(eewReportKey(event));
      setWarningOverlayTab("selected");
      setSelectedPreviewUntil(Date.now() + 20_000);
    }
    setBottomTab("reports");
    focusMap(`institution:${report.id}`, report.latitude, report.longitude, report.source === "shakealert" ? 6 : 5, true);
  };

  const chooseCencReport = (reportId: string, shouldFocus = true) => {
    setSelectedCencId(reportId);
    setPanelTab("intensity");
    const summary = cencReports.find((report) => report.id === reportId);
    if (summary && shouldFocus) focusMap(`cenc-report:${reportId}`, summary.latitude, summary.longitude, 7);
  };

  const chooseSnetEvent = (eventId: string) => {
    setSelectedSnetEventId(eventId);
    const selected = snetSnapshot?.events.find((event) => event.id === eventId);
    setSelectedSnetReportId(selected?.reports?.slice(-1)[0]?.id ?? null);
    setSnetViewMode("measured");
    setPanelTab("snet");
  };

  const chooseSnetReport = (reportId: string) => {
    setSelectedSnetReportId(reportId);
    setSnetViewMode("measured");
    setPanelTab("snet");
  };

  const focusStrongestDetection = (network: "NIED" | "KMA-PEWS") => {
    if (network === "KMA-PEWS" && replayEvent && kmaReplaySimulation) {
      const activeIds = new Set(kmaReplaySimulation.activeStationIds);
      const strongest = [...kmaStations]
        .filter((station) => activeIds.has(station.id))
        .sort((a, b) => (kmaReplaySimulation.ranks[b.id] ?? 0) - (kmaReplaySimulation.ranks[a.id] ?? 0))[0];
      if (strongest) focusStation(strongest);
      return;
    }
    const detection = network === "NIED" ? niedDetection : kmaDetection;
    const candidates = detection.activeStationIds.flatMap((id) => allSelectableStations.find((station) => station.id === id) ?? []);
    const strongest = candidates.sort((a, b) => {
      const rank = (station: SelectableStation) => isNiedStation(station) ? niedLevelRank(niedCharToLevel(niedFrame?.intensity[station.index])) : isKmaStation(station) ? Number(kmaValues[station.index] ?? 0) : 0;
      return rank(b) - rank(a);
    })[0];
    if (strongest) focusStation(strongest);
  };

  const focusStrongestOceanResponse = () => {
    const threshold = displayedOceanMode === "measured" ? 0.5 : 0.25;
    const strongest = [...(oceanCatalogue?.stations ?? [])]
      .filter((station) => (displayedOceanRanks[station.id] ?? Number.NEGATIVE_INFINITY) >= threshold)
      .sort((a, b) => (displayedOceanRanks[b.id] ?? 0) - (displayedOceanRanks[a.id] ?? 0))[0];
    if (strongest) focusStation(strongest);
    setPanelTab("snet");
  };

  const rawLiveEstimate = useMemo(() => inferHypocenter(triggers), [triggers]);
  const replayObservationCount = replaySimulation?.observations.length ?? 0;
  const rawReplayEstimate = useMemo(() => inferHypocenter((replaySimulation?.observations ?? []).slice(0, 24)), [replayEvent?.id, replayObservationCount]);
  const liveEstimate = useMemo(() => rawLiveEstimate && latestEvent
    ? constrainHypocenterEstimate(rawLiveEstimate, latestEvent, 10)
    : rawLiveEstimate, [latestEvent, rawLiveEstimate]);
  const replayEstimate = useMemo(() => rawReplayEstimate && replayEvent
    ? constrainHypocenterEstimate(rawReplayEstimate, replayEvent, 10)
    : rawReplayEstimate, [rawReplayEstimate, replayEvent]);
  const estimate = replayEvent ? replayEstimate : liveEstimate;
  const motion = estimateGroundMotion(Math.max(0, Math.min(7, selectedRank ?? 0)));
  const selectedDisplayColor = selectedStation && (isKmaStation(selectedStation) || isCencStation(selectedStation))
    || selectedStation && isGlobalStation(selectedStation) && !isCwaStation(selectedStation)
    ? mmiIntensityColor(selectedRank ?? 0)
    : jmaShindoColor(selectedRank ?? 0);
  const selectedOrigin = selectedEvent ? Date.parse(selectedEvent.originTime) : 0;
  const previewEvent = warningOverlayTab === "selected" && selectedEvent && clock < selectedPreviewUntil ? selectedEvent : null;
  const mapEvent = replayEvent ?? previewEvent ?? latestEvent;
  const cameraEvent = replayEvent ?? latestEvent;
  const mapOrigin = mapEvent ? Date.parse(mapEvent.originTime) : 0;
  const impactElapsed = replayEvent
    ? replaySeconds
    : mapEvent === latestEvent && mapOrigin
      ? Math.max(0, Math.min(300, (clock - mapOrigin) / 1000))
      : null;
  const affectedLayers = useMemo(
    () => affectedRegionLayers(jmaRegions, jmaSeismicSites, mapEvent, impactElapsed),
    [impactElapsed, jmaRegions, jmaSeismicSites, mapEvent],
  );
  const waveNow = replayEvent ? mapOrigin + replaySeconds * 1000 : mapOrigin ? Math.min(clock, mapOrigin + 300_000) : clock;
  const showWaves = replayEvent ? replaySeconds > 0 : Boolean(mapEvent === latestEvent && latestEvent && !latestEvent.cancelled);
  const rawMapDetectionStationIds = replayEvent
    ? replaySimulation?.activeStationIds ?? EMPTY_STATION_IDS
    : niedDetection.detected
      ? niedDetection.activeStationIds
      : EMPTY_STATION_IDS;
  const mapDetectionStationIds = rawMapDetectionStationIds.length ? rawMapDetectionStationIds : EMPTY_STATION_IDS;
  const rawMapDetectionRanks = replayEvent ? replaySimulation?.ranks ?? EMPTY_RANKS : liveDetectionRanks;
  const mapDetectionRanks = mapDetectionStationIds.length ? rawMapDetectionRanks : EMPTY_RANKS;
  const mapDetectionMaxRank = Math.max(0, ...mapDetectionStationIds.map((id) => mapDetectionRanks[id] ?? 0));
  const mapDetectionSeverity = niedGridColor(mapDetectionMaxRank);
  const replayDetected = Boolean(replayEvent && mapDetectionStationIds.length >= 4);
  const mapDetectionSelectionActive = replayEvent ? replayDetected : niedDetection.detected;
  const activeNiedCount = replayEvent ? replaySimulation?.activeStationIds.length ?? 0 : niedDetection.activeStationIds.length;
  const activeKmaCount = replayEvent ? kmaReplaySimulation?.activeStationIds.length ?? 0 : kmaDetection.activeStationIds.length;
  const activeOceanCount = Object.values(displayedOceanRanks).filter((rank) => rank >= (displayedOceanMode === "measured" ? 0.5 : 0.25)).length;
  const activeGlobalCount = globalSimulation?.activeStationIds.length ?? 0;
  const activeCwaCount = cwaSimulation?.activeStationIds.length ?? 0;
  const oceanHistorySelected = displayedOceanMode === "measured" && Boolean(snetMeasuredFrame) && !selectedSnetEvent?.active;
  const oceanResponseActive = displayedOceanMode === "measured"
    ? Boolean(selectedSnetEvent?.active && activeOceanCount)
    : Boolean(activeOceanCount);
  const overlayEvent = warningOverlayTab === "selected" ? selectedEvent ?? latestEvent : latestEvent;
  const cencMetrics = cencReport?.stationMetrics?.length ? cencReport.stationMetrics : cencReport?.stations ?? [];
  const cencMaxIntensity = cencMetrics[0]?.intensity ?? null;
  const cencMaxPga = cencMetrics.length ? cencMetrics.reduce((max, station) => Math.max(max, station.pgaGal ?? 0), 0) : null;
  const rollingSampleMode = replayEvent
    ? "确定性回放模拟"
    : selectedStation && isGlobalStation(selectedStation)
      ? isCwaStation(selectedStation) ? "CWA 台站本地传播估算" : "FDSN miniSEED 原始计数"
      : selectedStation && isOceanStation(selectedStation)
      ? displayedOceanMode === "measured" ? "MSIL 实测色值反算" : oceanMode === "local" ? "EEW 驱动本地预测" : "等待有效事件"
      : selectedStation && isCencStation(selectedStation)
        ? "单次仪器烈度报告"
        : "实时离散值";
  const snetStations = useMemo(
    () => (oceanCatalogue?.stations ?? []).filter((station) => station.network === "S-net"),
    [oceanCatalogue],
  );
  const snetSimulationRows = useMemo(() => snetStations
    .map((station) => ({ station, rank: oceanSimulation?.ranks[station.id] ?? 0 }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5), [oceanSimulation, snetStations]);
  const snetMeasuredRows = useMemo(() => (snetMeasuredFrame?.stations ?? []).slice(0, 5).flatMap((sample) => {
    const station = snetStations.find((candidate) => candidate.id === sample.stationId);
    return station ? [{ station, rank: sample.intensity }] : [];
  }), [snetMeasuredFrame, snetStations]);
  const snetSimulationActiveCount = snetStations.filter((station) => (oceanSimulation?.ranks[station.id] ?? 0) >= 0.25).length;
  const snetSimulationMaxRank = Math.max(0, ...snetStations.map((station) => oceanSimulation?.ranks[station.id] ?? 0));

  useEffect(() => {
    if (!mapDetectionSelectionActive || !mapDetectionStationIds.length) {
      autoNiedSelectionSession.current = null;
      return;
    }
    const sessionKey = replayEvent ? `replay:${replayEvent.id}` : "live";
    if (autoNiedSelectionSession.current === sessionKey) return;
    const activeIds = new Set(mapDetectionStationIds);
    const strongest = [...(catalogue?.stations ?? [])]
      .filter((station) => activeIds.has(station.id))
      .sort((a, b) => (mapDetectionRanks[b.id] ?? 0) - (mapDetectionRanks[a.id] ?? 0))[0];
    if (!strongest) return;
    autoNiedSelectionSession.current = sessionKey;
    focusStation(strongest, "nied-auto");
  }, [catalogue, focusStation, mapDetectionRanks, mapDetectionSelectionActive, mapDetectionStationIds, replayEvent]);

  const focusReplayDetection = () => {
    const activeStationSet = new Set(replaySimulation?.activeStationIds ?? []);
    const strongest = [...(catalogue?.stations ?? [])]
      .filter((station) => activeStationSet.has(station.id))
      .sort((a, b) => (replaySimulation?.ranks[b.id] ?? 0) - (replaySimulation?.ranks[a.id] ?? 0))[0];
    if (strongest) focusStation(strongest);
  };

  const toggleReplay = () => {
    if (!selectedEvent) return;
    if (!replayPlaying) {
      void primeReplayAudio();
      focusMap(`replay:${eewReportKey(selectedEvent)}`, selectedEvent.latitude, selectedEvent.longitude, 5, true);
    }
    setReplayPlaying((value) => !value);
  };

  return (
    <>
      <aside className="sidebar earthquake-sidebar seismic-sidebar" aria-label="实时地震预警控制面板">
        <div className="sidebar-rail">
          <div className="brand-mark seismic-brand-mark">警</div>
          <button title="切换侧栏" aria-label="切换侧栏" onClick={onToggleSidebar}><Siren size={18} /></button>
          <button title="刷新台网目录" aria-label="刷新台网目录" onClick={() => { void loadCatalogues(); setGlobalStationReloadKey((value) => value + 1); }}><RefreshCw size={18} /></button>
          <button title="定位东京测站" aria-label="定位东京测站" onClick={() => selectNearest(35.681, 139.767)}><MapPin size={18} /></button>
        </div>
        <div className="sidebar-inner">
          <div className="sidebar-head"><div><span className={`latency-dot ${niedState === "online" ? "green" : "checking"}`} /><strong>实时地震预警</strong></div></div>
          <section className="control-section">
            <div className="section-title"><span><Activity /></span><strong>地震看板</strong></div>
            <div className="earthquake-segmented seismic-mode-switch"><button className="active" onClick={clearReplayPresentation}><Radio size={14} />实时预警</button><button onClick={onOpenGlobal}><Globe2 size={14} />全球情报</button></div>
          </section>
          <section className="control-section">
            <div className="section-title"><span><Antenna /></span><strong>实时源状态</strong></div>
            <div className="seismic-source-stack">
              <SourceIndicator label="NIED / Yahoo 强震监视" state={niedState} latency={niedFrame?.latencyMs ?? null} />
              <SourceIndicator label="KMA-PEWS 官方实时" state={kmaState} latency={kmaLatency} />
              <SourceIndicator label="Wolfx HTTP 多机构 EEW" state={wolfxState} latency={wolfxLatency} />
              <SourceIndicator label="P2P / JMA EEW 回退" state={fanState} latency={fallbackLatency} />
              <SourceIndicator label="CENC 烈度多源后端" state={cencState} latency={cencLatency} />
              <SourceIndicator label="MSIL S-net 实测历史" state={snetState} latency={snetSnapshot?.latencyMs ?? null} />
              <SourceIndicator label={`全球机构报告 ${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL}`} state={officialState} latency={officialLatency} />
              <SourceIndicator
                label={`全球 FDSN 测站 ${globalStationSnapshot?.returnedCount ?? 0}`}
                state={globalStationState}
                latency={globalStationSnapshot
                  ? Math.max(0, ...globalStationSnapshot.sources.filter((source) => source.status === "ok").map((source) => source.latencyMs ?? 0)) || null
                  : null}
              />
              <SourceIndicator
                label={`CWA CWASN ${cwaStationSnapshot?.returnedCount ?? 0}`}
                state={cwaStationState}
                latency={cwaStationSnapshot?.sources[0]?.latencyMs ?? null}
              />
            </div>
            <label className="earthquake-refresh-interval seismic-global-refresh">
              <span><strong>全球机构轮询</strong><span className="seismic-refresh-stepper"><button type="button" title="减少轮询间隔" aria-label="减少全球机构刷新间隔" disabled={globalRefreshSeconds <= 1} onClick={() => setGlobalRefreshSeconds(Math.max(1, globalRefreshSeconds - 1))}><Minus size={12} /></button><output>{globalRefreshSeconds} 秒</output><button type="button" title="增加轮询间隔" aria-label="增加全球机构刷新间隔" disabled={globalRefreshSeconds >= 60} onClick={() => setGlobalRefreshSeconds(Math.min(60, globalRefreshSeconds + 1))}><Plus size={12} /></button></span></span>
              <input type="range" min="1" max="60" step="1" value={globalRefreshSeconds} aria-label="实时地震全球机构刷新间隔（秒）" onInput={(event) => setGlobalRefreshSeconds(normalizeEarthquakeRefreshSeconds(event.currentTarget.value))} />
              <small><span>1 秒</span><span>60 秒</span></small>
            </label>
            {(globalStationError || cwaStationError) && <p className="seismic-source-error">{[globalStationError, cwaStationError].filter(Boolean).join("；")}</p>}
          </section>
          <section className="control-section">
            <div className="section-title"><span><Layers3 /></span><strong>测站图层</strong></div>
            <label className="toggle-row"><input type="checkbox" checked={showNied} onChange={(event) => setShowNied(event.target.checked)} />NIED K-NET / KiK-net <em>{catalogue?.stations.length ?? "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showKma} onChange={(event) => setShowKma(event.target.checked)} />韩国 KMA-PEWS <em>{kmaStations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showCenc} onChange={(event) => setShowCenc(event.target.checked)} />CENC 仪器烈度 <em>{cencReport ? cencMetrics.length : "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showOcean} onChange={(event) => setShowOcean(event.target.checked)} />S-net 海底测站 <em>{oceanCatalogue?.counts["S-net"] ?? "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showOtherOcean} onChange={(event) => setShowOtherOcean(event.target.checked)} />DONET / N-net <em>{oceanCatalogue ? (oceanCatalogue.counts.DONET1 ?? 0) + (oceanCatalogue.counts.DONET2 ?? 0) + (oceanCatalogue.counts["N-net"] ?? 0) : "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showGlobalStations} onChange={(event) => setShowGlobalStations(event.target.checked)} />全球 FDSN 测站 <em>{globalFdsnStations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showCwaStations} onChange={(event) => setShowCwaStations(event.target.checked)} />CWA 台湾 CWASN <em>{cwaStations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showLocalImpact} onChange={(event) => setShowLocalImpact(event.target.checked)} />本地预测烈度 / 震度区域 <em>{affectedLayers.local.features.length}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showOfficialImpact} onChange={(event) => setShowOfficialImpact(event.target.checked)} />官方影响地区 <em>{affectedLayers.official.features.length}</em></label>
          </section>
          <section className="control-section seismic-station-search">
            <div className="section-title"><span><Search /></span><strong>观测测站</strong></div>
            <div className="earthquake-source-actions"><button onClick={() => selectNearest(35.681, 139.767)}>东京</button><button onClick={() => selectNearest(37.5665, 126.978, "KMA")}>首尔</button></div>
            <label className="search-field"><span><Search size={14} /><input value={stationSearch} onChange={(event) => setStationSearch(event.target.value)} placeholder="名称、代码、地区" /></span></label>
            {searchResults.length > 0 && <div className="seismic-search-results">{searchResults.map((station) => <button key={station.id} onClick={() => { focusStation(station); setStationSearch(""); }}><strong>{station.stationName}</strong><small>{station.network} {station.stationCode}</small></button>)}</div>}
          </section>
          <section className="control-section seismic-sound-controls">
            <div className="section-title"><span><Volume2 /></span><strong>NIED 检知音效</strong></div>
            <label className="toggle-row"><input type="checkbox" checked={niedSoundEnabled} onChange={(event) => setNiedSoundEnabled(event.target.checked)} />实时 / 回放最大震度上升时播放 <em>{niedSoundEnabled ? "启用" : "关闭"}</em></label>
            <label className="seismic-sound-volume"><span>音量</span><input aria-label="NIED 检知音效音量" type="range" min="0" max="100" step="5" value={niedSoundVolume} onChange={(event) => setNiedSoundVolume(Number(event.target.value))} /><strong>{niedSoundVolume}%</strong></label>
            <div className="seismic-sound-preview"><select aria-label="试听震度等级" value={niedPreviewCue} onChange={(event) => setNiedPreviewCue(event.target.value as NiedSoundCue)}>{Object.keys(NIED_SOUND_URLS).map((cue) => <option key={cue} value={cue}>{cue.replace("shindo", "震度 ")}</option>)}</select><button title="试听所选震度音效" onClick={() => void playNiedCue(niedPreviewCue)}><Play size={14} />试听</button></div>
            <output className={niedSoundStatus.includes("阻止") ? "error" : ""}>{niedSoundEnabled ? niedSoundStatus : "音效已关闭"}</output>
          </section>
          <section className="control-section seismic-legal-note">
            <div className="section-title"><span><AlertTriangle /></span><strong>数据级别</strong></div>
            <p>NIED 帧经 Yahoo 公开边缘端点读取；S-net 实测历史来自 MSIL 观测瓦片色值反算。全球台站来自 FDSN Station，CWASN 位置来自 CWA GDMS；地图响应属于事件驱动确定性估算，只有 FDSN 台站详情中的 miniSEED 是开放原始波形。所有本地推算和传播回放均不作为官方预警。</p>
          </section>
        </div>
      </aside>

      <main className="workspace earthquake-workspace seismic-workspace">
        <header className="topbar earthquake-topbar seismic-topbar">
          <div><h2>实时地震预警与全球专业测站监视</h2><p>区域实时台网 / 九机构地震目录 / 全球 FDSN · CWA CWASN</p></div>
          <div className="status-strip">
            <div className={`earthquake-status-pill ${activeNiedCount ? "danger" : ""}`}><span>NIED 检知</span><strong>{activeNiedCount} 站</strong></div>
            <div className={`earthquake-status-pill ${activeKmaCount ? "danger" : ""}`}><span>KMA-PEWS</span><strong>{activeKmaCount} 站</strong></div>
            <div className={`earthquake-status-pill ${latestEvent?.warning ? "danger" : "ok"}`}><span>最新事件</span><strong>{latestEvent ? latestEvent.relay === "Catalogue" ? `${latestEvent.source} 机构报告` : `${latestEvent.source} 第 ${latestEvent.serial} 报` : "监视中"}</strong></div>
            <div className={`earthquake-status-pill ${officialState === "online" ? "ok" : "warn"}`}><span>机构报告</span><strong>{institutionReports.length} 条</strong></div>
            <div className={`earthquake-status-pill ${activeGlobalCount || activeCwaCount ? "danger" : ""}`}><span>全球 / CWA 响应</span><strong>{activeGlobalCount} / {activeCwaCount} 站</strong></div>
            <div className={`earthquake-status-pill ${oceanResponseActive ? "danger" : ""}`}><span>{oceanHistorySelected ? "S-net 历史回看" : "海底台网响应"}</span><strong>{activeOceanCount ? oceanHistorySelected ? `历史 ${activeOceanCount} 站` : `${activeOceanCount} 站` : "待机"}</strong></div>
            <div className="earthquake-status-pill"><span>本地时间</span><strong>{formatTime(clock)}</strong></div>
          </div>
        </header>
        {(niedCatalogueError || oceanCatalogueError || jmaCatalogueError) && <div className="error-banner">台网目录更新失败：{[
          niedCatalogueError && `NIED：${niedCatalogueError}`,
          oceanCatalogueError && `海底台网：${oceanCatalogueError}`,
          jmaCatalogueError && `JMA：${jmaCatalogueError}`,
        ].filter(Boolean).join("；")}</div>}

        <section className="seismic-primary-grid">
          <div className="earthquake-map-panel seismic-map-panel">
            <header className="earthquake-panel-header">
              <div><strong>全球实时测站与烈震度影响地图</strong><span>{replayEvent ? "预测区先显示；S 波到区后加深，全球与 CWASN 测站按到时激活" : "区域实时台网、全球 FDSN 与 CWA CWASN 台站均可点击"}</span></div>
              <div className="seismic-map-header-actions">
                <div className="seismic-map-summary"><span><i className="nied" />NIED {catalogue?.stations.length ?? 0}</span><span><i className="kma" />KMA {kmaStations.length}</span><span><i className="cenc" />CENC {cencMetrics.length}</span><span><i className="ocean" />海底 {oceanCatalogue?.stations.length ?? 0}</span><span><i className="fdsn" />FDSN {globalFdsnStations.length}</span><span><i className="cwa" />CWA {cwaStations.length}</span></div>
                <button className="seismic-map-theme-button" title="全球测站视图" aria-label="全球测站视图" onClick={() => setMapFocus({ key: `global:${Date.now()}`, latitude: 18, longitude: 0, zoom: 2, exact: true })}><Globe2 size={15} /></button>
                <button className="seismic-map-theme-button" title={mapTheme === "dark" ? "切换为浅色地图" : "切换为深色地图"} aria-label={mapTheme === "dark" ? "切换为浅色地图" : "切换为深色地图"} onClick={() => setMapTheme((value) => value === "dark" ? "light" : "dark")}>{mapTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
              </div>
            </header>
            <div className="seismic-map-shell">
              {!catalogue && <div className="earthquake-map-loading"><Loader2 size={24} /><span>正在加载东亚测站目录</span></div>}
              <SeismicMap
                theme={mapTheme}
                niedStations={catalogue?.stations ?? []}
                kmaStations={kmaStations}
                oceanStations={oceanCatalogue?.stations ?? []}
                globalStations={mapGlobalFdsnStations}
                globalResponseStations={globalResponseStations}
                cwaStations={cwaStations}
                cencReport={showCenc ? cencReport : null}
                niedFrame={mapDetectionStationIds.length ? niedFrame : null}
                kmaValues={kmaDetection.activeStationIds.length ? kmaValues : EMPTY_NUMBERS}
                kmaReplayRanks={replayEvent ? kmaReplaySimulation?.ranks ?? EMPTY_RANKS : null}
                showNied={showNied}
                showKma={showKma}
                showOcean={showOcean}
                showOtherOcean={showOtherOcean}
                showCenc={showCenc}
                showGlobal={showGlobalStations}
                showCwa={showCwaStations}
                selectedStation={selectedStation}
                selectedEvent={mapEvent ?? null}
                selectedReport={selectedInstitutionReport}
                estimate={estimate}
                estimateMode={replayEvent ? "replay" : "live"}
                replayRanks={replayEvent ? replaySimulation?.ranks ?? EMPTY_RANKS : null}
                oceanRanks={displayedOceanRanks}
                globalRanks={globalSimulation?.ranks ?? EMPTY_RANKS}
                cwaRanks={cwaSimulation?.ranks ?? EMPTY_RANKS}
                oceanMode={displayedOceanMode}
                localRegions={affectedLayers.local}
                officialRegions={affectedLayers.official}
                showLocalImpact={showLocalImpact}
                showOfficialImpact={showOfficialImpact}
                detectionStationIds={mapDetectionStationIds}
                detectionRanks={mapDetectionRanks}
                detectionMode={replayEvent ? "replay" : "live"}
                detectionSessionKey={replayEvent ? `replay:${replayEvent.id}` : "live"}
                blinkNow={mapDetectionStationIds.length ? clock : 0}
                waveNow={waveNow}
                showWaves={showWaves}
                focusTarget={mapFocus}
                onSelectStation={focusStation}
                onViewportChange={updateMapViewport}
              />
              <SeismicIntensityLegend />
              <SeismicCameraRelay
                event={cameraEvent}
                replayMode={Boolean(replayEvent)}
                replayTimestamp={replayEvent ? Date.parse(replayEvent.originTime) : null}
              />
              <div className="seismic-map-overlay-stack">
                <section className="seismic-map-warning-overlay">
                  <nav aria-label="地图预警摘要">
                    <button className={warningOverlayTab === "latest" ? "active" : ""} onClick={() => setWarningOverlayTab("latest")}><Siren size={13} />最新预警</button>
                    <button className={warningOverlayTab === "selected" ? "active" : ""} onClick={() => { setWarningOverlayTab("selected"); setSelectedPreviewUntil(Date.now() + 20_000); }} disabled={!selectedEvent}><MapPin size={13} />当前选择</button>
                    <span className={`earthquake-live-dot ${wolfxState === "error" && fanState === "error" ? "error" : ""}`} />
                  </nav>
                  {overlayEvent ? <button className="seismic-warning-summary" onClick={() => chooseEvent(overlayEvent, warningOverlayTab === "selected")}>
                    <span><b>{overlayEvent.source}</b><strong>{overlayEvent.place}</strong><em>{liveEventStatusLabel(overlayEvent)}</em></span>
                    <span><small>M {overlayEvent.magnitude?.toFixed(1) ?? "--"}</small><small>最大 {overlayEvent.maxIntensity}</small><small>第 {overlayEvent.serial} 报{overlayEvent.final ? " · 最终" : ""}</small></span>
                    <time>{formatTime(overlayEvent.announcedAt)}</time>
                  </button> : <div className="seismic-warning-waiting"><Radio size={16} />正在监视区域 EEW 与全球机构报告</div>}
                </section>
                <div className="seismic-detection-strip">
                  <button className={replayEvent ? replayDetected ? `detected replay ${mapDetectionSeverity}` : "replay" : niedDetection.detected ? `detected ${mapDetectionSeverity}` : ""} onClick={() => replayEvent ? focusReplayDetection() : focusStrongestDetection("NIED")} disabled={replayEvent ? !mapDetectionStationIds.length : !niedDetection.activeStationIds.length}>
                    <span><i />{replayEvent ? "NIED 回放模拟" : "NIED 实时"}</span><strong>{replayEvent ? `震度 ${jmaShindoLabel(replaySimulation?.maxRank ?? 0)}` : niedDetection.currentMaxLabel}</strong><small>{replayEvent ? replayDetected ? `${mapDetectionStationIds.length} 站 · 已形成检知框` : `${mapDetectionStationIds.length} 站响应` : niedDetection.detected ? `${niedDetection.activeStationIds.length} 站 · ${niedDetection.clusterCount} 簇` : "摇晃检知待机"}</small><time>{replayEvent ? `T+${replaySeconds.toFixed(2)} s` : niedFrame ? formatTime(niedFrame.dataTime) : "等待帧"}</time>
                  </button>
                  <button className={activeKmaCount ? "detected" : ""} onClick={() => focusStrongestDetection("KMA-PEWS")} disabled={!activeKmaCount}>
                    <span><i />KMA-PEWS</span><strong>{replayEvent ? `烈度 ${intensityRomanLabel(kmaReplaySimulation?.maxRank ?? 0)}` : kmaDetection.currentMaxLabel}</strong><small>{replayEvent ? `${activeKmaCount} 站 · 回放模拟` : kmaDetection.detected ? `${kmaDetection.activeStationIds.length} 站 · ${kmaDetection.clusterCount} 簇` : "实时摇晃检知待机"}</small><time>{replayEvent ? `T+${replaySeconds.toFixed(2)} s` : kmaDetection.updatedAt ? formatTime(kmaDetection.updatedAt) : "建立 60 秒基线"}</time>
                  </button>
                  <button className={oceanResponseActive ? "detected ocean" : "ocean"} onClick={focusStrongestOceanResponse} disabled={!activeOceanCount}>
                    <span><i />S-net / DONET / N-net</span><strong>{displayedOceanMode === "measured" && snetMeasuredFrame ? `震度 ${displayRankLabel(snetMeasuredFrame.maxIntensity)}` : oceanSimulation ? `震度 ${oceanSimulation.maxRank.toFixed(1)}` : "待机"}</strong><small>{activeOceanCount ? displayedOceanMode === "measured" ? oceanHistorySelected ? `${activeOceanCount} 站 · 历史已结束` : `${activeOceanCount} 站 · MSIL 实测反算` : `${activeOceanCount} 站 · ${oceanMode === "replay" ? "回放模拟" : "EEW 本地预测"}` : displayedOceanMode === "measured" ? "S-net 实测待机" : "等待有效地震事件"}</small><time>{displayedOceanMode === "measured" && snetMeasuredFrame ? formatTime(snetMeasuredFrame.timestamp) : oceanResponseEvent ? `T+${oceanResponseElapsed.toFixed(2)} s` : "等待数据"}</time>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="seismic-professional-panel">
            <nav className="seismic-panel-tabs" aria-label="专业地震面板">
              <button className={panelTab === "station" ? "active" : ""} title="测站数据" onClick={() => setPanelTab("station")}><Antenna size={15} /><span>测站详情</span></button>
              <button className={panelTab === "intensity" ? "active" : ""} title="CENC 仪器烈度" onClick={() => setPanelTab("intensity")}><Database size={15} /><span>CENC 烈度</span></button>
              <button className={panelTab === "snet" ? "active" : ""} title="S-net 震度情报" onClick={() => setPanelTab("snet")}><Waves size={15} /><span>S-net 震度</span></button>
            </nav>
            <div className="seismic-panel-body">
              {panelTab === "station" && (
                selectedStation ? (
                  isGlobalStation(selectedStation) ? <>
                    <header className="seismic-station-heading"><span style={{ background: selectedDisplayColor }} /><div><strong>{selectedStation.stationName}</strong><small>{selectedStation.network} · {selectedStation.stationCode}</small></div><b>{isCwaStation(selectedStation) ? `CWASN · 震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `FDSN · MMI ${(selectedRank ?? 0).toFixed(1)}`}</b></header>
                    <dl className="earthquake-detail-list"><div><dt>坐标</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div><div><dt>海拔</dt><dd>{selectedStation.elevationM?.toFixed(0) ?? "--"} m</dd></div><div><dt>启用时间</dt><dd>{selectedStation.startTime ? formatTime(selectedStation.startTime, false) : "--"}</dd></div><div><dt>目录节点</dt><dd>{selectedStation.providers.join(" / ")}</dd></div><div><dt>事件响应</dt><dd>{oceanResponseEvent ? `${isCwaStation(selectedStation) ? `本地估算震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `本地估算 MMI ${(selectedRank ?? 0).toFixed(1)}`} · T+${oceanResponseElapsed.toFixed(1)} s` : "等待有效地震事件"}</dd></div></dl>
                    <div className="fdsn-provider-links">{stationProviderSources.filter((source) => selectedStation.providers.includes(source.id)).map((source) => <a key={source.id} href={source.officialUrl} target="_blank" rel="noreferrer"><i style={{ background: FDSN_PROVIDER_COLORS[source.id] }} />{source.label}<small>{source.status === "ok" ? `${source.latencyMs ?? "--"} ms` : "当前异常"}</small><ExternalLink size={12} /></a>)}</div>
                    <p className="seismic-data-label">{isCwaStation(selectedStation) ? "台站位置来自 CWA GDMS 的 CWASN 官方目录；地图变色与下方滚动是明确标注的本地传播估算，不是 CWA 实时波形或官方震度报告。" : "台站位置来自 FDSN Station；地图响应是本地传播估算，下方波形仅显示 Dataselect 返回并由浏览器解压的 miniSEED 原始计数，不从震度或震级合成。"}</p>
                  </> : isCencStation(selectedStation) ? <>
                    <header className="seismic-station-heading"><span style={{ background: cencIntensityColor(selectedStation.intensity) }} /><div><strong>{selectedStation.stationName}</strong><small>CENC 仪器烈度 · {selectedStation.stationCode}</small></div><b>烈度 {intensityRomanLabel(selectedStation.intensity)}</b></header>
                    <div className="seismic-gauge-grid"><article><Gauge size={18} /><span>仪器烈度</span><strong>{intensityRomanLabel(selectedStation.intensity)} · {selectedStation.intensity.toFixed(1)}</strong><meter min="0" max="12" value={selectedStation.intensity} /></article><article><Activity size={18} /><span>PGA 实测</span><strong>{selectedStation.pgaGal?.toFixed(1) ?? "--"} gal</strong><meter min="0" max="2000" value={selectedStation.pgaGal ?? 0} /></article><article><Waves size={18} /><span>PGV 实测</span><strong>{selectedStation.pgvCms?.toFixed(1) ?? "--"} cm/s</strong><meter min="0" max="100" value={selectedStation.pgvCms ?? 0} /></article></div>
                    <dl className="earthquake-detail-list"><div><dt>地址</dt><dd>{selectedStation.address || "--"}</dd></div><div><dt>坐标</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div><div><dt>震中距</dt><dd>{selectedStation.distanceKm?.toFixed(2) ?? "--"} km</dd></div><div><dt>PGA / PGV 烈度</dt><dd>{selectedStation.pgaIntensity?.toFixed(1) ?? "--"} / {selectedStation.pgvIntensity?.toFixed(1) ?? "--"}</dd></div><div><dt>场地</dt><dd>{selectedStation.site || "--"}</dd></div></dl>
                    <p className="seismic-data-label">这里显示 CENC 烈度报告中接口返回的仪器测站数据，没有根据震中反推或插值。</p>
                  </> : isOceanStation(selectedStation) ? <>
                    <header className="seismic-station-heading"><span style={{ background: intensityColor(Math.max(0, selectedRank ?? 0)) }} /><div><strong>{selectedStation.network} {selectedStation.stationCode}</strong><small>NIED 海底地震观测网</small></div><b>{displayedOceanMode === "measured" ? `实测反算震度 ${jmaShindoLabel(selectedRank ?? 0)}` : oceanMode === "replay" ? `模拟震度 ${jmaShindoLabel(selectedRank ?? 0)}` : oceanMode === "local" ? `预测震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `${selectedStation.depthM.toFixed(0)} m`}</b></header>
                    <div className="seismic-gauge-grid"><article><Gauge size={18} /><span>{displayedOceanMode === "measured" ? "MSIL 色值反算" : oceanMode === "replay" ? "回放强度" : "本地预测"}</span><strong>{(selectedRank ?? 0).toFixed(displayedOceanMode === "measured" ? 2 : 1)}</strong><meter min="-3" max="7" value={selectedRank ?? 0} /></article><article><Activity size={18} /><span>PGA 经验换算</span><strong>{motion.pgaGal.toFixed(2)} gal</strong><meter min="0" max="1000" value={motion.pgaGal} /></article><article><Waves size={18} /><span>PGV 经验换算</span><strong>{motion.pgvCms.toFixed(2)} cm/s</strong><meter min="0" max="100" value={motion.pgvCms} /></article></div>
                    <dl className="earthquake-detail-list"><div><dt>坐标</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div><div><dt>海底深度</dt><dd>{selectedStation.depthM.toFixed(0)} m</dd></div><div><dt>当前样本</dt><dd>{displayedOceanMode === "measured" ? snetMeasuredFrame ? `${formatTime(snetMeasuredFrame.timestamp)} MSIL 观测帧` : "等待 MSIL 帧" : oceanMode === "replay" ? `T+${replaySeconds.toFixed(2)} s 回放` : oceanMode === "local" ? `T+${oceanResponseElapsed.toFixed(2)} s 本地预测` : "等待有效事件"}</dd></div><div><dt>数据性质</dt><dd>{displayedOceanMode === "measured" ? "海しる强震动观测瓦片色值反算" : "事件驱动确定性传播计算"}</dd></div></dl>
                    <a className="seismic-station-link" href={selectedStation.waveformUrl} target="_blank" rel="noreferrer">打开官方延迟波形<ExternalLink size={13} /></a>
                    <p className="seismic-data-label">{displayedOceanMode === "measured" ? "这是 MSIL 每分钟观测瓦片的色标反算值，与截图所用方法一致；它不是 NIED 发布的官方震度公告，也不是原始波形计算结果。" : "地图变色和滚动值来自当前 EEW 或回放事件的确定性传播计算，不是 NIED 官方实时观测。"}</p>
                  </> : <>
                    <header className="seismic-station-heading"><span style={{ background: selectedDisplayColor }} /><div><strong>{selectedStation.stationName}</strong><small>{selectedStation.network} · {selectedStation.stationCode}</small></div><b>{isNiedStation(selectedStation) ? `震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `烈度 ${intensityRomanLabel(selectedRank ?? 0)}`}</b></header>
                    <div className="seismic-gauge-grid"><article><Gauge size={18} /><span>{isNiedStation(selectedStation) ? "震度" : "烈度"}</span><strong>{isNiedStation(selectedStation) ? `${jmaShindoLabel(selectedRank ?? 0)} · ${(selectedRank ?? 0).toFixed(1)}` : `${intensityRomanLabel(selectedRank ?? 0)} · ${(selectedRank ?? 0).toFixed(1)}`}</strong><meter min="0" max={isKmaStation(selectedStation) ? 12 : 7} value={selectedRank ?? 0} /></article><article><Activity size={18} /><span>PGA 经验估算</span><strong>{motion.pgaGal.toFixed(2)} gal</strong><meter min="0" max="1000" value={motion.pgaGal} /></article><article><Waves size={18} /><span>PGV 经验估算</span><strong>{motion.pgvCms.toFixed(2)} cm/s</strong><meter min="0" max="100" value={motion.pgvCms} /></article></div>
                    <dl className="earthquake-detail-list"><div><dt>坐标</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div><div><dt>最新采样</dt><dd>{replayEvent ? `T+${replaySeconds.toFixed(2)} s` : rollingHistory.length ? formatTime(rollingHistory[rollingHistory.length - 1].timestamp) : "等待数据"}</dd></div><div><dt>采样类型</dt><dd>{isNiedStation(selectedStation) ? replayEvent ? "历史事件确定性回放模拟" : "NIED 离散实时强度" : replayEvent ? "历史事件确定性回放模拟" : "KMA-PEWS 官方逐秒 MMI"}</dd></div></dl>
                    <p className="seismic-data-label">{replayEvent ? "当前值来自历史事件的传播回放，不是 NIED 实测；PGA/PGV 仍为经验换算。" : "PGA/PGV 为根据震度换算的经验估算，不是测站原始加速度计数据。"}</p>
                  </>
                ) : <div className="seismic-empty"><MapPin size={28} /><strong>请在地图或搜索结果中选择测站</strong></div>
              )}

              {panelTab === "intensity" && <>
                <header className="seismic-section-heading"><div><strong>CENC 仪器烈度分布</strong><span>后端单例聚合 · {cencProvider}</span></div><b className={cencState === "online" ? "online" : ""}>{cencState === "online" ? "在线" : cencState === "stale" ? "缓存 · 重连中" : cencState === "error" ? "中断 · 重试中" : "连接中"}</b></header>
                <div className="seismic-cenc-picker"><select value={selectedCencId ?? ""} onChange={(event) => chooseCencReport(event.target.value)} disabled={!cencReports.length}><option value="">等待烈度报告</option>{cencReports.map((report) => <option key={report.id} value={report.id}>{formatTime(report.originTime)} · {report.place} M{report.magnitude?.toFixed(1) ?? "--"}</option>)}</select><button title="在地图定位报告" aria-label="在地图定位报告" disabled={!selectedCencId} onClick={() => selectedCencId && chooseCencReport(selectedCencId)}><LocateFixed size={16} /></button></div>
                {cencReport && cencReport.id === selectedCencId ? <>
                  <h3>{cencReport.place}</h3>
                  <div className="seismic-eew-metrics"><div><span>震级 / 深度</span><strong>M {cencReport.magnitude?.toFixed(1) ?? "--"} · {cencReport.depthKm?.toFixed(0) ?? "--"} km</strong></div><div><span>最大仪器烈度</span><strong>{cencMaxIntensity === null ? "--" : `${intensityRomanLabel(cencMaxIntensity)} · ${cencMaxIntensity.toFixed(1)}`}</strong></div><div><span>报告测站</span><strong>{cencMetrics.length}</strong></div></div>
                  <dl className="earthquake-detail-list"><div><dt>发震时刻</dt><dd>{formatTime(cencReport.originTime)}</dd></div><div><dt>报告生成</dt><dd>{formatTime(cencReport.createdAt)}</dd></div><div><dt>最大 PGA</dt><dd>{cencMaxPga?.toFixed(1) ?? "--"} gal</dd></div><div><dt>坐标</dt><dd>{cencReport.latitude.toFixed(3)}, {cencReport.longitude.toFixed(3)}</dd></div></dl>
                  <div className="seismic-cenc-station-list"><div><span>测站</span><span>仪器烈度</span><span>PGA</span></div>{cencMetrics.slice(0, 24).map((metric) => { const mappedStation = cencReport.stations.find((station) => station.stationCode === metric.stationCode); const networkCode = "networkCode" in metric ? metric.networkCode : "CENC"; return <button key={metric.id} disabled={!mappedStation} title={mappedStation ? "在地图定位测站" : "官方公开页未提供该测站坐标"} onClick={() => mappedStation && focusStation(mappedStation)}><span><i style={{ background: cencIntensityColor(metric.intensity) }} /><b>{metric.stationName}</b><small>{networkCode} · {metric.stationCode}</small></span><strong>{intensityRomanLabel(metric.intensity)}</strong><em>{metric.pgaGal?.toFixed(1) ?? "--"} gal</em></button>; })}</div>
                  <p className="seismic-data-label">烈度、PGA 与 PGV 均来自当前实际提供方；国家地震科学数据中心公开页没有给出测站坐标时只列实测值，不在地图伪造测站位置。</p>
                </> : <div className="seismic-empty"><Loader2 className="spin" size={28} /><strong>正在读取 CENC 烈度详情</strong><span>{cencState === "stale" ? "后端正在切换公开源，已保留最后有效报告。" : cencState === "error" ? "FAN 与国家地震科学数据中心当前均不可达；未使用模拟烈度补数。" : "列表和详情由后端多源聚合统一更新。"}</span></div>}
              </>}

              {panelTab === "snet" && <>
                <header className="seismic-section-heading"><div><strong>S-net 震度情报</strong><span>{snetViewMode === "measured" ? selectedSnetEvent?.source === "screenshot" ? `截图补录 · ${selectedSnetEvent.reportCount} 份报告` : `海しる MSIL · ${snetSnapshot?.availableFrameCount ?? 0} 个观测帧${snetSnapshot && !snetSnapshot.backfillComplete && snetSnapshot.backfillPendingFrameCount !== null ? ` · 历史补录剩余 ${snetSnapshot.backfillPendingFrameCount} 帧` : ""}` : oceanResponseEvent ? `${oceanMode === "replay" ? "历史事件回放" : "当前 EEW 本地响应"} · ${oceanResponseEvent.place}` : "等待有效地震事件"}</span></div><b className={snetState === "online" ? "online" : "experimental"}>{snetViewMode === "measured" ? selectedSnetEvent?.source === "screenshot" ? "截图补录" : snetState === "online" ? snetSnapshot?.backfillComplete ? "实测在线" : "实时在线 · 补录中" : snetState === "stale" ? "缓存" : snetState === "error" ? "中断" : "加载中" : "实验性"}</b></header>
                <nav className="seismic-snet-mode-tabs" aria-label="S-net 数据模式">
                  <button className={snetViewMode === "measured" ? "active" : ""} onClick={() => setSnetViewMode("measured")}><Database size={14} />实测历史</button>
                  <button className={snetViewMode === "simulation" ? "active" : ""} onClick={() => setSnetViewMode("simulation")}><CircleGauge size={14} />本地推算</button>
                </nav>
                {snetViewMode === "measured" ? <>
                  <div className="seismic-snet-summary three"><div><span>{selectedSnetReport ? `${selectedSnetReport.source === "screenshot" ? "截图补录" : "MSIL"} 第 ${selectedSnetReport.reportNumber} 报` : "MSIL 观测帧"}</span><strong>{selectedSnetReport ? formatTime(selectedSnetReport.observedAt) : snetMeasuredFrame ? formatTime(snetMeasuredFrame.timestamp) : "--"}</strong></div><div><span>最大震度</span><strong>{snetMeasuredFrame ? `${displayRankLabel(snetMeasuredFrame.maxIntensity)} · ${snetMeasuredFrame.maxIntensity.toFixed(2)}` : "-"}</strong></div><div><span>震度 1 以上</span><strong>{snetMeasuredFrame?.activeStationCount ?? 0} 站</strong></div></div>
                  <div className="seismic-snet-picker"><select aria-label="S-net 检知事件" value={selectedSnetEventId ?? ""} onChange={(event) => chooseSnetEvent(event.target.value)} disabled={!snetSnapshot?.events.length}><option value="">暂无检知历史</option>{snetSnapshot?.events.map((event) => <option key={event.id} value={event.id}>{formatTime(event.peakAt)} · {event.reportCount ?? event.reports?.length ?? 1} 报 · 最大震度 {displayRankLabel(event.maxIntensity)}{event.source === "screenshot" ? " · 截图补录" : ""}</option>)}</select><button title="定位最强 S-net 测站" aria-label="定位最强 S-net 测站" onClick={focusStrongestOceanResponse} disabled={!snetMeasuredRows.length}><LocateFixed size={16} /></button></div>
                  {selectedSnetEvent?.reports?.length ? <div className="seismic-snet-picker reports"><select aria-label="S-net 事件报次" value={selectedSnetReport?.id ?? ""} onChange={(event) => chooseSnetReport(event.target.value)}>{selectedSnetEvent.reports.map((report) => <option key={report.id} value={report.id}>第 {report.reportNumber} 报 · {formatTime(report.observedAt)} · 震度 {displayRankLabel(report.maxIntensity)} · {report.stationCount} 站{report.source === "screenshot" ? " · 补录" : ""}</option>)}</select></div> : null}
                  {snetMeasuredRows.length ? <div className="seismic-snet-ranking measured">{snetMeasuredRows.map(({ station, rank }) => <button key={station.id} onClick={() => focusStation(station)}><span><i style={{ background: intensityColor(Math.max(0, rank)) }} /><strong>{station.stationCode}</strong></span><em>{rank.toFixed(2)} <small>[{displayRankLabel(rank)}]</small></em></button>)}</div> : <div className="seismic-snet-waiting"><Loader2 className={snetState === "connecting" ? "spin" : ""} size={18} /><span>{snetState === "error" ? "MSIL 暂不可用，保留已持久化历史并继续重试。" : "正在回补 MSIL 最近一小时 S-net 观测瓦片。"}</span></div>}
                  {snetSnapshot?.events.length ? <div className="seismic-snet-history"><header><strong>检知历史</strong><span>同一连续震动为一个事件，事件内保留多报</span></header>{snetSnapshot.events.slice(0, 10).map((event) => <button key={event.id} className={selectedSnetEvent?.id === event.id ? "active" : ""} onClick={() => chooseSnetEvent(event.id)}><time>{formatTime(event.peakAt)}</time><span><b>震度 {displayRankLabel(event.maxIntensity)}</b><small>{event.reportCount ?? event.reports?.length ?? 1} 报 · {event.stationCount} 站 · {event.frameCount} 帧</small></span><em className={event.active ? "live" : ""}>{event.source === "screenshot" ? "截图补录" : event.active ? "进行中" : "结束"}</em></button>)}</div> : null}
                  <JapanMiniMap regions={jmaRegions} stations={snetStations} ranks={snetMeasuredRanks} selectedStationId={selectedStationId} onSelectStation={(station) => focusStation(station)} />
                  <p className="seismic-data-label">实时数据来自海上保安厅“海しる”S-net 每分钟强震动瓦片，按色标反算连续震度并在本机保存历史；标有“截图补录”的记录来自用户提供的原始 S-net 震度情报截图。两者均不是 NIED 官方震度公告。</p>
                </> : <>
                  <div className="seismic-snet-summary"><div><span>推算时间</span><strong>{oceanResponseEvent ? formatTime(Date.parse(oceanResponseEvent.originTime) + oceanResponseElapsed * 1000) : "--"}</strong></div><div><span>最大震度</span><strong>{snetSimulationActiveCount ? displayRankLabel(snetSimulationMaxRank) : "-"}</strong></div></div>
                  {oceanResponseEvent ? <div className="seismic-snet-ranking">{snetSimulationRows.map(({ station, rank }) => <button key={station.id} onClick={() => focusStation(station)}><span><i style={{ background: rank >= 0.25 ? intensityColor(rank) : "#1447e6" }} /><strong>{station.stationCode}</strong></span><em>{rank >= 0.25 ? displayRankLabel(rank) : "-"}</em></button>)}</div> : <div className="seismic-snet-waiting"><Radio size={18} /><span>收到有效 EEW 后生成明确标注的本地确定性响应。</span></div>}
                  <JapanMiniMap regions={jmaRegions} stations={snetStations} ranks={oceanSimulation?.ranks} selectedStationId={selectedStationId} onSelectStation={(station) => focusStation(station)} />
                  <p className="seismic-data-label">这里是事件驱动的确定性传播推算，不是测站实测；它与“实测历史”完全分离。</p>
                </>}
              </>}
            </div>
            {selectedStation && isGlobalStation(selectedStation) && !isCwaStation(selectedStation) ? <FdsnWaveformPanel station={selectedStation} /> : <section className="seismic-station-rolling-panel" aria-live="polite">
              <header><div><Activity size={14} /><span><strong>测站滚动</strong><small>{selectedStation ? `${selectedStation.network} ${selectedStation.stationCode}` : "未选择测站"}</small></span></div><b className={stationSelectionReason === "nied-auto" ? "auto" : ""}>{stationSelectionReason === "nied-auto" ? "NIED 自动选站" : rollingSampleMode}</b></header>
              <div className="seismic-station-rolling-content">
                <div className="seismic-station-rolling-chart">{rollingHistory.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={rollingHistory}><CartesianGrid stroke="#2b3539" vertical={false} /><XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} hide /><YAxis domain={[selectedStation && isOceanStation(selectedStation) && displayedOceanMode === "measured" ? -3 : 0, selectedStation && (isKmaStation(selectedStation) || isCencStation(selectedStation) || isGlobalStation(selectedStation) && !isCwaStation(selectedStation)) ? 12 : 7]} hide /><Tooltip labelFormatter={(value) => formatTime(Number(value))} contentStyle={{ background: "#111719", border: "1px solid #364247", borderRadius: 4 }} /><Line type="stepAfter" dataKey="value" name="强度" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer> : <div className="seismic-rolling-empty"><Waves size={20} /><span>{selectedStation && isCencStation(selectedStation) ? "该报告只有单次仪器烈度" : replayEvent ? "推进回放后显示" : "等待所选测站采样"}</span></div>}</div>
                <div className="seismic-station-rolling-values">{rollingHistory.slice(-4).reverse().map((sample) => <div key={sample.timestamp}><time>{formatTime(sample.timestamp).slice(-8)}</time><span>{sample.label}</span><strong style={{ color: selectedStation && (isKmaStation(selectedStation) || isCencStation(selectedStation) || isGlobalStation(selectedStation) && !isCwaStation(selectedStation)) ? mmiIntensityColor(sample.value) : jmaShindoColor(sample.value) }}>{sample.value.toFixed(1)}</strong></div>)}</div>
              </div>
            </section>}
          </aside>
        </section>

        <section className="seismic-lower-panel">
          <nav className="seismic-lower-tabs" aria-label="地震监测分析面板">
            <button className={bottomTab === "inference" ? "active" : ""} onClick={() => setBottomTab("inference")}><CircleGauge size={15} /><span>震源推算</span><em>{triggers.length}</em></button>
            <button className={bottomTab === "replay" ? "active" : ""} onClick={() => setBottomTab("replay")}><Clock3 size={15} /><span>传播回放</span><em>{selectedEvent ? 1 : 0}</em></button>
            <button className={bottomTab === "warnings" ? "active" : ""} onClick={() => setBottomTab("warnings")}><HistoryIcon size={15} /><span>预警历史</span><em>{historyEvents.length}</em></button>
            <button className={bottomTab === "reports" ? "active" : ""} onClick={() => setBottomTab("reports")}><Database size={15} /><span>机构报告</span><em>{institutionReports.length}</em></button>
          </nav>
          <div className="seismic-lower-body">
            {bottomTab === "inference" && <>
              <header className="seismic-lower-heading"><div><strong>突发地震本地震源推算</strong><span>NIED 聚类检知站的首次上升时刻 · 确定性网格反演</span></div><div><span>活动簇</span><strong>{niedDetection.clusterCount} 簇 / {niedDetection.activeStationIds.length} 站</strong></div><b className="experimental">实验性 · 非官方 EEW</b></header>
              <div className="seismic-bottom-analysis-grid"><div>{estimate ? <><div className="seismic-inference-result"><strong>{estimate.latitude.toFixed(3)}, {estimate.longitude.toFixed(3)}</strong><span>深度 {estimate.depthKm.toFixed(1)} km · {formatTime(estimate.originTime)}</span></div><div className="seismic-eew-metrics"><div><span>参与测站</span><strong>{estimate.stationCount}</strong></div><div><span>中位残差</span><strong>{estimate.residualMs} ms</strong></div><div><span>置信度</span><strong>{estimate.confidence}%</strong></div></div><dl className="earthquake-detail-list"><div><dt>方法</dt><dd>{estimate.method}</dd></div><div><dt>官方震源距离</dt><dd>{estimate.referenceDistanceKm !== undefined ? `${estimate.referenceDistanceKm.toFixed(2)} km` : "无同期官方震源"}{estimate.unconstrainedDistanceKm !== undefined ? `（约束前 ${estimate.unconstrainedDistanceKm.toFixed(1)} km）` : ""}</dd></div><div><dt>P 波速度</dt><dd>6.0 km/s</dd></div><div><dt>有效窗口</dt><dd>聚类激活后 120 秒</dd></div></dl></> : <div className="seismic-lower-empty"><CircleGauge size={28} /><strong>等待 NIED 邻站聚类检知</strong><span>至少 4 个有效触发站后生成本地震源；当前 {triggers.length} 站。</span></div>}</div><div className="seismic-trigger-list seismic-bottom-trigger-list">{triggers.length ? triggers.slice(0, 40).map((trigger) => { const station = catalogue?.stations.find((item) => item.id === trigger.stationId); return <div key={trigger.stationId}><i /><span><strong>{station?.stationName ?? trigger.stationId}</strong><small>{station?.stationCode ?? "NIED"}</small></span><time>{formatTime(trigger.triggeredAt)}</time></div>; }) : <div className="seismic-lower-empty"><Antenna size={22} /><span>尚无通过聚类判定的触发站</span></div>}</div></div>
            </>}

            {bottomTab === "replay" && <>
              <header className="seismic-lower-heading"><div><strong>地震波传播与测站响应回放</strong><span>{selectedEvent ? `${selectedEvent.source} ${selectedEvent.place}` : "请从预警历史选择事件"}</span></div><div><span>发震时刻</span><strong>{selectedEvent ? formatTime(selectedEvent.originTime) : "--"}</strong></div><b className="experimental">确定性模拟 · 非实测</b></header>
              <div className="seismic-bottom-replay-grid">
                <div>
                  <div className="seismic-replay-clock"><span>T+{replaySeconds.toFixed(2)} s</span><strong>{selectedEvent ? formatTime(selectedOrigin + replaySeconds * 1000) : "--"}</strong></div>
                  <input className="seismic-replay-slider" type="range" min="0" max="300" step="0.25" value={replaySeconds} disabled={!selectedEvent} onChange={(event) => setReplaySeconds(Number(event.target.value))} />
                  <div className="seismic-replay-controls"><button title="回到起点" onClick={clearReplayPresentation}><SkipBack size={16} /></button><button className="primary" title={replayPlaying ? "暂停" : "播放"} disabled={!selectedEvent} onClick={toggleReplay}>{replayPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button title="前进 10 秒" onClick={() => setReplaySeconds((value) => Math.min(300, value + 10))}><FastForward size={16} /></button><button title="查看右侧测站滚动" disabled={!selectedEvent} onClick={() => { setPanelTab("station"); focusReplayDetection(); }}><Activity size={16} /></button><button title="重置" onClick={clearReplayPresentation}><RotateCcw size={16} /></button></div>
                </div>
                <div>
                  <div className="seismic-wave-legend"><div><i className="p" /><span>P 波</span><strong>{selectedEvent ? waveRadiusKm(selectedEvent.originTime, 6, selectedOrigin + replaySeconds * 1000).toFixed(0) : 0} km</strong></div><div><i className="s" /><span>S 波</span><strong>{selectedEvent ? waveRadiusKm(selectedEvent.originTime, 3.5, selectedOrigin + replaySeconds * 1000).toFixed(0) : 0} km</strong></div></div>
                  <dl className="earthquake-detail-list"><div><dt>NIED 陆地响应</dt><dd>{replaySimulation ? `${replaySimulation.activeStationIds.length} 站 / 最大震度 ${jmaShindoLabel(replaySimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>KMA-PEWS 响应</dt><dd>{kmaReplaySimulation ? `${kmaReplaySimulation.activeStationIds.length} 站 / 最大烈度 ${intensityRomanLabel(kmaReplaySimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>海底台网响应</dt><dd>{oceanSimulation ? `${oceanSimulation.activeStationIds.length} 站 / 最大震度 ${jmaShindoLabel(oceanSimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>全球 FDSN 响应</dt><dd>{globalSimulation ? `${globalSimulation.activeStationIds.length} 站 / 最大 MMI ${globalSimulation.maxRank.toFixed(1)}` : "等待播放"}</dd></div><div><dt>CWA CWASN 响应</dt><dd>{cwaSimulation ? `${cwaSimulation.activeStationIds.length} 站 / 最大震度 ${jmaShindoLabel(cwaSimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>回放音效</dt><dd>{niedSoundEnabled ? "随最大震度上升播放" : "已关闭"}</dd></div><div><dt>P / S 速度</dt><dd>6.0 / 3.5 km/s</dd></div><div><dt>用途</dt><dd>传播时序与本地算法验证，不代表官方到时预报</dd></div></dl>
                  {replayEstimate ? <div className="seismic-replay-inference"><span><CircleGauge size={15} />回放本地震源反演</span><strong>{replayEstimate.latitude.toFixed(3)}, {replayEstimate.longitude.toFixed(3)}</strong><small>深度 {replayEstimate.depthKm.toFixed(1)} km · {replayEstimate.stationCount} 站 · 残差 {replayEstimate.residualMs} ms · 距官方 {replayEstimate.referenceDistanceKm?.toFixed(2) ?? "--"} km</small></div> : <div className="seismic-replay-inference waiting"><span><CircleGauge size={15} />等待至少 4 个模拟 P 波触发站</span><small>测站按理论到时逐一响应，满足条件后自动生成震源。</small></div>}
                </div>
              </div>
            </>}

            {bottomTab === "warnings" && <>
              <header className="seismic-lower-heading seismic-warning-heading"><div><strong>实时预警事件历史</strong><span>显示 {filteredHistoryEvents.length} / 全部 {historyEvents.length} 个事件；区域 EEW 持久保留，全球目录保留近 7 天且每机构独立限额</span></div><div className="seismic-warning-filter"><span>机构筛选</span><select aria-label="预警历史机构筛选" value={warningSourceFilter} onChange={(event) => { setWarningSourceFilter(event.target.value as WarningSourceFilter); setWarningHistoryLimit(60); }}><option value="ALL">全部机构（{historyEvents.length}）</option>{LIVE_EEW_SOURCE_ORDER.map((source) => <option key={source} value={source}>{source}（{historySourceCounts[source]}）</option>)}</select></div><b>{officialState === "online" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 机构目录在线` : officialState === "stale" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 机构目录可用 · 含缓存` : "机构目录连接中"}</b></header>
              {filteredHistoryEvents.length ? <div className="seismic-warning-history-table" role="table" aria-label="预警事件历史">
                <div className="seismic-warning-history-head" role="row"><span>最新发布时间</span><span>机构</span><span>震中</span><span>报数</span><span>震级 / 最大震度</span><span>状态</span><span>震源情报</span></div>
                {displayedHistoryEvents.map((historyEvent) => {
                  const event = historyEvent.latestReport;
                  const selected = historyEvent.reports.some((report) => eewReportKey(report) === selectedEewKey);
                  const official = historyEvent.officialHypocenter as EarthquakeEvent | null;
                  const expanded = expandedOfficialKey === historyEvent.key;
                  return <div key={historyEvent.key} className={`seismic-warning-history-event ${selected ? "active" : ""}`} role="row">
                    <button className="seismic-warning-history-main" onClick={() => chooseEvent(event)}>
                      <time>{formatTime(event.announcedAt)}</time>
                      <strong>{event.source} · {event.relay}</strong>
                      <span title={event.place}>{event.place}</span>
                      <span>最新第 {event.serial} 报 · 共 {historyEvent.reportCount} 报</span>
                      <span>M {event.magnitude?.toFixed(1) ?? "--"} · {event.maxIntensity}</span>
                      <em className={event.cancelled ? "cancelled" : event.warning ? "warning" : "forecast"}>{liveEventStatusLabel(event)}</em>
                    </button>
                    <div className="seismic-warning-official-cell">{official && <button aria-expanded={expanded} onClick={() => setExpandedOfficialKey((current) => current === historyEvent.key ? null : historyEvent.key)}>{official.source.toUpperCase()} 震源</button>}</div>
                    {official && expanded && <OfficialHypocenterCard record={official} regions={jmaRegions} />}
                  </div>;
                })}
                {displayedHistoryEvents.length < filteredHistoryEvents.length && <button className="seismic-warning-history-more" onClick={() => setWarningHistoryLimit((current) => Math.min(filteredHistoryEvents.length, current + 60))}>加载更多历史（{displayedHistoryEvents.length} / {filteredHistoryEvents.length}）</button>}
              </div> : <div className="seismic-lower-empty seismic-warning-empty"><HistoryIcon size={26} /><strong>{historyEvents.length ? "该机构暂无事件" : "正在建立预警历史"}</strong><span>{historyEvents.length ? "可切换到全部机构查看其他来源。" : "收到区域 EEW 或全球机构报告后会按地震事件归并并持续更新。"}</span></div>}
            </>}

            {bottomTab === "reports" && <>
              <header className="seismic-lower-heading"><div><strong>全球机构地震报告</strong><span>近 90 天 M4+ · USGS、ShakeAlert、JMA、CENC、CWA、EMSC、GFZ、GeoNet、BMKG 独立保留</span></div><div><span>显示 / 总数</span><strong>{Math.min(240, institutionReports.length)} / {institutionReports.length}</strong></div><b>{officialState === "online" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 来源在线` : officialState === "stale" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 来源可用 · 含缓存` : "来源连接中"}</b></header>
              {institutionReports.length ? <div className="seismic-institution-layout">
                <div className="seismic-institution-table" role="table" aria-label="全球机构地震报告">
                  <div className="seismic-institution-head" role="row"><span>发震时间</span><span>机构</span><span>震中</span><span>震级</span><span>状态</span><span>原文</span></div>
                  {institutionReports.slice(0, 240).map((report) => <div key={report.id} className={`seismic-institution-row ${selectedInstitutionReportId === report.id ? "active" : ""}`} role="row">
                    <button onClick={() => chooseInstitutionReport(report)}>
                      <time>{formatTime(report.time)}</time>
                      <strong style={{ color: EARTHQUAKE_SOURCE_COLORS[report.source] }}>{EARTHQUAKE_SOURCE_LABELS[report.source]}</strong>
                      <span title={report.place}>{report.place}</span>
                      <b>{formatMagnitudeType(report.magnitudeType)} {report.magnitude.toFixed(1)}</b>
                      <em>{report.status}</em>
                    </button>
                    <a href={report.url} target="_blank" rel="noreferrer" aria-label={`打开 ${report.place} 机构原文`}><ExternalLink size={13} /></a>
                  </div>)}
                </div>
                {selectedInstitutionReport
                  ? <InstitutionReportDetail record={selectedInstitutionReport} onFocus={() => chooseInstitutionReport(selectedInstitutionReport)} />
                  : <div className="seismic-lower-empty seismic-institution-empty"><Database size={26} /><strong>选择一份机构报告</strong><span>可查看来源原值，并在地图中定位震中。</span></div>}
              </div> : <div className="seismic-lower-empty"><Loader2 className="spin" size={26} /><strong>正在获取机构报告</strong><span>其他实时台网与预警流不受目录加载影响。</span></div>}
            </>}
          </div>
        </section>

        <section className="seismic-network-footer">
          <div><CheckCircle2 size={15} /><strong>NIED 站点匹配</strong><span>{catalogue ? `${catalogue.matched}/${catalogue.stations.length}` : "加载中"}</span></div>
          <div><Antenna size={15} /><strong>海底台网</strong><span>{oceanCatalogue ? Object.entries(oceanCatalogue.counts).map(([key, value]) => `${key} ${value}`).join(" · ") : "加载中"}</span></div>
          <div><Waves size={15} /><strong>S-net 实测历史</strong><span>{snetSnapshot ? `${snetSnapshot.events.length} 事件 · ${snetSnapshot.events.reduce((total, event) => total + (event.reportCount ?? event.reports?.length ?? 1), 0)} 报 · ${snetSnapshot.availableFrameCount} 帧${!snetSnapshot.backfillComplete && snetSnapshot.backfillPendingFrameCount !== null ? ` · 补录 ${snetSnapshot.backfillPendingFrameCount}` : ""}` : snetState === "error" ? "连接中断" : "加载中"}</span></div>
          <a href="https://www.kyoshin.bosai.go.jp/" target="_blank" rel="noreferrer">NIED 官方监视器<ExternalLink size={13} /></a>
          <a href="https://www.msil.go.jp/msil/htm/main.html?Lang=0" target="_blank" rel="noreferrer">MSIL 海しる<ExternalLink size={13} /></a>
          <a href="https://typhoon.yahoo.co.jp/weather/jp/earthquake/kyoshin/" target="_blank" rel="noreferrer">Yahoo 实时震度<ExternalLink size={13} /></a>
          <a href="https://www.cenc.ac.cn/" target="_blank" rel="noreferrer">CENC 官方网站<ExternalLink size={13} /></a>
        </section>
      </main>
    </>
  );
}
