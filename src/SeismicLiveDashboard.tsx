import {
  Activity,
  AlertTriangle,
  Antenna,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Database,
  ExternalLink,
  FastForward,
  Filter,
  Gauge,
  Globe2,
  Hand,
  History as HistoryIcon,
  Layers3,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Minus,
  Moon,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Siren,
  GripVertical,
  SkipBack,
  Sun,
  Video,
  Volume2,
  Waves,
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { icon as createLeafletIcon, type Icon as LeafletIcon } from "leaflet";
import { Circle, CircleMarker, GeoJSON as LeafletGeoJSON, MapContainer, Marker, Pane, Popup, Rectangle, ScaleControl, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { feature as topojsonFeature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import {
  advanceMovieCameraQueue,
  buildNiedDetectionGridCells,
  buildStationNeighborMap,
  buildInstitutionHistoryReports,
  buildGlobalImpactContours,
  calculateJmaShindo,
  calculateLocalIntensity,
  cencIntensityColor,
  collapseEewHistoryEvents,
  constrainHypocenterEstimate,
  estimateGroundMotion,
  eewReportKey,
  enrichLiveEewWithOfficialAreas,
  filterEewHistoryEventsBySource,
  fetchCencIntensity,
  fetchEewRelay,
  fetchExternalWarnings,
  fetchJmaTsunami,
  fetchJmaTsunamiHistory,
  fetchKmaPews,
  fetchNiedRealtime,
  fetchNiedStations,
  fetchOceanStations,
  fetchPalertStations,
  fetchSnetIntensity,
  haversineKm,
  inferHypocenter,
  geodesicCircleCoordinates,
  institutionReportToLiveEew,
  intensityRomanLabel,
  intensityColor,
  isLiveEewActive,
  isSameEewEvent,
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
  prepareReplayStationResponse,
  replayNiedSoundIndex,
  selectAutoLocatedGlobalEvent,
  selectAutoLocatedGlobalEvents,
  isReplayPropagationActive,
  shouldDisplayLiveWavefront,
  JMA_SHINDO_LEGEND,
  MMI_LEGEND,
  jmaShindoColor,
  jmaShindoLabel,
  jmaShindoRank,
  jmaTsunamiLineStyle,
  jmaTsunamiReplayDurationSeconds,
  jmaTsunamiSnapshotAt,
  matchJmaTsunamiReplayEpisode,
  meetsEewMagnitudeThreshold,
  mmiIntensityColor,
  simulatePreparedReplayStationResponse,
  updateKmaPewsDetection,
  updateNiedShakeDetection,
  usesShindoScaleForLocation,
  waveRadiusKm,
  seismicWaveArrivalSeconds,
  type CencIntensityReport,
  type CencIntensityStation,
  type CencIntensitySummary,
  type HypocenterEstimate,
  type KmaStation,
  type JmaSeismicSiteCatalogue,
  type JmaTsunamiSnapshot,
  type JmaTsunamiHistorySnapshot,
  type LiveEew,
  type LiveEewSource,
  type NiedRealtimeFrame,
  type NiedGridAnchor,
  type NiedSoundCue,
  type NiedStationCatalogue,
  type OceanStation,
  type OceanStationCatalogue,
  type PalertStation,
  type PalertSnapshot,
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
  filterEarthquakeEvents,
  filterShakeMapContours,
  fetchEarthquakeShakeMap,
  fetchEarthquakePager,
  fetchEarthquakeSnapshot,
  formatMagnitudeType,
  isDyfiQueryable,
  isMechanismQueryable,
  isPagerQueryable,
  isShakeMapQueryable,
  mergeEarthquakeEventHistory,
  normalizeEarthquakeRefreshSeconds,
  shakeMapContourLevel,
  SHAKEMAP_MMI_LEVELS,
  summarizeEarthquakeSourceAvailability,
  type EarthquakeEvent,
  type EarthquakePager,
  type EarthquakePagerCity,
  type EarthquakeShakeMap,
  type EarthquakeSourceId,
} from "./earthquake";
import {
  eewSoundAssetForTransition,
  eewSoundCueKey,
  eewSoundEventKey,
  isNewerEewSoundReport,
  isRegionalEewSoundSource,
  NIED_SOUND_ASSETS,
  replaySecondSoundAsset,
  replaySoundMilestone,
  SEISMIC_SOUND_LIBRARY,
  tsunamiSoundAssetForTransition,
  type SeismicSoundAssetId,
} from "./seismicAudio";
import { usePersistentState } from "./usePersistentState";
import type { Station } from "./types";
import { FdsnWaveformPanel } from "./FdsnWaveformPanel";
import { FocalMechanismDialog } from "./FocalMechanismDialog";
import { UsgsDyfiDialog } from "./UsgsDyfiDialog";
import { UsgsPagerDialog } from "./UsgsPagerDialog";
import { JshisDialog } from "./JshisDialog";
import { SeismicCameraRelay } from "./SeismicCameraRelay";
import {
  WNI_CAMERA_MAP_URL,
  fetchWniCameras,
  nearestWniCamera,
  selectWniCamerasForViewport,
  type WniCamera,
} from "./wniCameras";
import { GNSS_STATIONS, type GnssStation } from "./gnssStations";
import {
  impactRegionMatchesName,
  loadEastAsiaImpactRegions,
  mergeImpactRegionCollections,
  normalizeJapanImpactRegions,
  type ImpactRegionCollection,
  type ImpactRegionFeature,
  type ImpactRegionProperties,
} from "./impactRegions";
import {
  FDSN_PROVIDER_COLORS,
  FDSN_WAVEFORM_INACTIVE_COLOR,
  fdsnWaveformStationColor,
  fetchCwaStations,
  fetchWorldFdsnStations,
  isFdsnWaveformStationActive,
  probeFdsnWaveform,
  rankFdsnStationsByDistance,
  rankNiedWaveformCandidates,
  sampleGlobalStationsForMap,
  type FdsnMapViewport,
  type FdsnStationDistance,
  type GlobalSeismicStation,
  type GlobalStationSnapshot,
} from "./fdsn";
import {
  isJshisPositionSupported,
  type JshisFaultShape,
  type JshisLocationSnapshot,
} from "./jshis";

type SeismicLiveDashboardProps = {
  onToggleSidebar: () => void;
  onOpenGlobal: () => void;
  userStation: Station;
};

type PanelTab = "station" | "intensity" | "snet" | "exposure";
type BottomTab = "inference" | "replay" | "warnings" | "reports";
type WarningOverlayTab = "latest" | "selected";
type SeismicMapTheme = "dark" | "light";
type SeismicMapInteractionMode = "drag" | "select";
type MovieCameraMode = "locked" | "auto";
type MonitorDock = "top" | "right" | "bottom" | "left";
type MonitorWidgetId = "tsunami" | "warning" | "nied" | "kma" | "jma" | "cwa" | "global" | "ocean";
type MonitorWidgetDockMap = Record<MonitorWidgetId, MonitorDock>;
type ReplaySpeed = 1 | 10 | 60 | 300;
type SourceState = "connecting" | "unconfigured" | "online" | "stale" | "error";
type SnetViewMode = "measured" | "simulation";
type StationSelectionReason = "manual" | "nied-auto" | "waveform-auto";
type SelectableStation = SeismicStation | KmaStation | OceanStation | CencIntensityStation | GlobalSeismicStation;
type MapFocusTarget = {
  key: string;
  latitude: number;
  longitude: number;
  zoom: number;
  exact?: boolean;
  radiusKm?: number;
};
type OceanResponseMode = "idle" | "measured" | "local" | "replay";
type JmaRegionProperties = ImpactRegionProperties;
type JmaRegionFeature = ImpactRegionFeature;
type JmaRegionCollection = ImpactRegionCollection;
type TsunamiRegionProperties = {
  code: string;
  name: string;
  namekana?: string;
  grade?: string;
  level?: number;
};
type TsunamiRegionCollection = FeatureCollection<Geometry, TsunamiRegionProperties>;
type GlobalFaultProperties = {
  level: 1 | 2 | 3 | 4;
  label: string;
  color: string;
  featureCount: number;
  traceCount: number;
};
type GlobalFaultCollection = FeatureCollection<Geometry, GlobalFaultProperties> & {
  metadata?: {
    title?: string;
    source?: string;
    license?: string;
    generatedAt?: string;
    sourceFeatureCount?: number;
    traceCount?: number;
    classification?: string;
  };
};

const HISTORY_LIMIT = 180;
const INSTITUTION_REPORT_PAGE_SIZE = 120;
const INSTITUTION_REPORT_SOURCE_ORDER: EarthquakeSourceId[] = ["usgs", "shakealert", "jma", "cenc", "cwa", "emsc", "gfz", "geonet", "bmkg"];
const INSTITUTION_SOURCE_TOTAL = INSTITUTION_REPORT_SOURCE_ORDER.length;
const INSTITUTION_MAGNITUDE_BANDS = [
  { id: "all", label: "全部 M4.0+", minimum: 4, maximum: null },
  { id: "m4", label: "M4.0–4.9", minimum: 4, maximum: 5 },
  { id: "m5", label: "M5.0–5.9", minimum: 5, maximum: 6 },
  { id: "m6", label: "M6.0–6.9", minimum: 6, maximum: 7 },
  { id: "m7", label: "M7.0+", minimum: 7, maximum: null },
] as const;
type InstitutionMagnitudeBand = typeof INSTITUTION_MAGNITUDE_BANDS[number]["id"];

function clampPanelDimension(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

const MONITOR_DOCKS: MonitorDock[] = ["top", "right", "bottom", "left"];
const MONITOR_WIDGET_IDS: MonitorWidgetId[] = ["tsunami", "warning", "nied", "kma", "jma", "cwa", "global", "ocean"];
const MONITOR_WIDE_WIDGETS = new Set<MonitorWidgetId>(["tsunami", "warning", "ocean"]);
const MONITOR_WIDGET_LABELS: Record<MonitorWidgetId, string> = {
  tsunami: "海啸警报",
  warning: "最新预警",
  nied: "NIED 实时",
  kma: "KMA-PEWS",
  jma: "JMA 震度速报",
  cwa: "CWA / CWASN",
  global: "全球 FDSN 响应",
  ocean: "海底测站",
};
const PERSISTENT_REGIONAL_EEW_SOURCES = new Set<LiveEewSource>(["JMA", "KMA", "CENC", "CWA"]);

function normalizeMonitorDock(value: unknown): MonitorDock {
  return MONITOR_DOCKS.includes(value as MonitorDock) ? value as MonitorDock : "left";
}

function defaultMonitorWidgetDocks(dock: MonitorDock): MonitorWidgetDockMap {
  return Object.fromEntries(MONITOR_WIDGET_IDS.map((id) => [id, dock])) as MonitorWidgetDockMap;
}

function normalizeMonitorWidgetDocks(value: unknown, fallback: MonitorDock): MonitorWidgetDockMap {
  const candidate = value && typeof value === "object" ? value as Partial<Record<MonitorWidgetId, unknown>> : {};
  return Object.fromEntries(MONITOR_WIDGET_IDS.map((id) => [id, normalizeMonitorDock(candidate[id] ?? fallback)])) as MonitorWidgetDockMap;
}

function clampMonitorScale(value: number) {
  return Math.max(0.65, Math.min(1.6, Number.isFinite(value) ? value : 1));
}

function nearestMonitorDock(clientX: number, clientY: number, bounds: DOMRect): MonitorDock {
  const x = Math.max(0, Math.min(bounds.width, clientX - bounds.left));
  const y = Math.max(0, Math.min(bounds.height, clientY - bounds.top));
  let dock: MonitorDock = "top";
  let distance = y;
  if (bounds.width - x < distance) { dock = "right"; distance = bounds.width - x; }
  if (bounds.height - y < distance) { dock = "bottom"; distance = bounds.height - y; }
  if (x < distance) dock = "left";
  return dock;
}

function formatSArrivalCountdown(remainingSeconds: number) {
  const tenths = Math.max(0, Math.round(remainingSeconds * 10));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths % 600 / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

const NIED_GRID_COLORS = {
  green: "#16a34a",
  yellow: "#facc15",
  red: "#ef4444",
} as const;
const EMPTY_NUMBERS: number[] = [];
const EMPTY_STATION_IDS: string[] = [];
const EMPTY_RANKS: Record<string, number> = {};

const NIED_SOUND_CUES: Record<NiedSoundCue, SeismicSoundAssetId> = NIED_SOUND_ASSETS;

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

const INTENSITY_ICON_URLS: Record<number, string> = {
  0: new URL("../icon/intensity/0.svg", import.meta.url).href,
  1: new URL("../icon/intensity/1.svg", import.meta.url).href,
  2: new URL("../icon/intensity/2.svg", import.meta.url).href,
  3: new URL("../icon/intensity/3.svg", import.meta.url).href,
  4: new URL("../icon/intensity/4.svg", import.meta.url).href,
  5: new URL("../icon/intensity/5.svg", import.meta.url).href,
  6: new URL("../icon/intensity/6.svg", import.meta.url).href,
  7: new URL("../icon/intensity/7.svg", import.meta.url).href,
  8: new URL("../icon/intensity/8.svg", import.meta.url).href,
  9: new URL("../icon/intensity/9.svg", import.meta.url).href,
  10: new URL("../icon/intensity/10.svg", import.meta.url).href,
  11: new URL("../icon/intensity/11.svg", import.meta.url).href,
  12: new URL("../icon/intensity/12.svg", import.meta.url).href,
};

const SHINDO_ICON_URLS: Record<string, string> = {
  "0": new URL("../icon/shindo/0.svg", import.meta.url).href,
  "1": new URL("../icon/shindo/1.svg", import.meta.url).href,
  "2": new URL("../icon/shindo/2.svg", import.meta.url).href,
  "3": new URL("../icon/shindo/3.svg", import.meta.url).href,
  "4": new URL("../icon/shindo/4.svg", import.meta.url).href,
  "5-": new URL("../icon/shindo/5-.svg", import.meta.url).href,
  "5+": new URL("../icon/shindo/5+.svg", import.meta.url).href,
  "6-": new URL("../icon/shindo/6-.svg", import.meta.url).href,
  "6+": new URL("../icon/shindo/6+.svg", import.meta.url).href,
  "7": new URL("../icon/shindo/7.svg", import.meta.url).href,
};

const HYPOCENTER_ICON_URLS = {
  cancelled: new URL("../icon/hypocenter/cancelCross.svg", import.meta.url).href,
  eew: new URL("../icon/hypocenter/eewCross.svg", import.meta.url).href,
  catalogue: new URL("../icon/hypocenter/eqlistCross.svg", import.meta.url).href,
} as const;

const stationValueIconCache = new Map<string, LeafletIcon>();
const hypocenterIconCache = new Map<keyof typeof HYPOCENTER_ICON_URLS, LeafletIcon>();

function stationValueMapIcon(scale: "intensity" | "shindo", rank: number, selected = false) {
  const valueKey = scale === "shindo"
    ? jmaShindoLabel(rank)
    : String(Math.max(0, Math.min(12, Math.round(Number(rank) || 0))));
  const cacheKey = `${scale}:${valueKey}:${selected ? "selected" : "normal"}`;
  const cached = stationValueIconCache.get(cacheKey);
  if (cached) return cached;
  const size = selected ? 30 : 24;
  const iconUrl = scale === "shindo" ? SHINDO_ICON_URLS[valueKey] : INTENSITY_ICON_URLS[Number(valueKey)];
  const valueIcon = createLeafletIcon({
    iconUrl,
    iconRetinaUrl: iconUrl,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 5)],
    className: `seismic-station-value-icon seismic-station-value-icon--${scale}${selected ? " selected" : ""}`,
  });
  stationValueIconCache.set(cacheKey, valueIcon);
  return valueIcon;
}

function hypocenterMapIcon(kind: keyof typeof HYPOCENTER_ICON_URLS) {
  const cached = hypocenterIconCache.get(kind);
  if (cached) return cached;
  const eventIcon = createLeafletIcon({
    iconUrl: HYPOCENTER_ICON_URLS[kind],
    iconRetinaUrl: HYPOCENTER_ICON_URLS[kind],
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -23],
    className: "seismic-hypocenter-icon",
  });
  hypocenterIconCache.set(kind, eventIcon);
  return eventIcon;
}

const StationValueMarker = memo(function StationValueMarker(props: {
  latitude: number;
  longitude: number;
  rank: number;
  scale: "intensity" | "shindo";
  selected?: boolean;
  label: string;
}) {
  return <Marker
    position={[props.latitude, props.longitude]}
    icon={stationValueMapIcon(props.scale, props.rank, props.selected)}
    interactive={false}
    keyboard={false}
    bubblingMouseEvents={false}
    alt={props.label}
  />;
});

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

function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current] ?? [];
    const [previousLongitude, previousLatitude] = ring[previous] ?? [];
    if (![currentLongitude, currentLatitude, previousLongitude, previousLatitude].every(Number.isFinite)) continue;
    const crosses = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < (previousLongitude - currentLongitude) * (latitude - currentLatitude)
        / (previousLatitude - currentLatitude || Number.EPSILON) + currentLongitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry: Geometry, latitude: number, longitude: number): boolean {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return Boolean(rings[0] && pointInRing(longitude, latitude, rings[0]))
      && !rings.slice(1).some((ring) => pointInRing(longitude, latitude, ring));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => geometryContainsPoint(
      { type: "Polygon", coordinates: polygon },
      latitude,
      longitude,
    ));
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some((child) => geometryContainsPoint(child, latitude, longitude));
  }
  return false;
}

function administrativeRegionSamples(region: JmaRegionFeature, event: LiveEew) {
  const center = geometryCenter(region);
  const boundaryPoints = geometryRings(region.geometry).flat();
  const step = Math.max(1, Math.ceil(boundaryPoints.length / 48));
  const sampledBoundary = boundaryPoints.filter((_, index) => index % step === 0);
  const samples = [
    ...(geometryContainsPoint(region.geometry, event.latitude, event.longitude)
      ? [[event.longitude, event.latitude]]
      : []),
    ...(center ? [[center.longitude, center.latitude]] : []),
    ...sampledBoundary,
  ];
  return samples
    .filter(([longitude, latitude]) => Number.isFinite(latitude) && Number.isFinite(longitude))
    .map(([longitude, latitude]) => ({ latitude, longitude }));
}

type AdministrativeImpactProfile = {
  rank: number;
  arrivals: Array<{ rank: number; seconds: number }>;
};

const administrativeImpactProfileCache = new WeakMap<JmaRegionFeature, Map<string, AdministrativeImpactProfile | null>>();
const impactCatalogueIds = new WeakMap<object, number>();
let nextImpactCatalogueId = 1;

function impactCatalogueId(value: object | null) {
  if (!value) return 0;
  const existing = impactCatalogueIds.get(value);
  if (existing) return existing;
  const id = nextImpactCatalogueId;
  nextImpactCatalogueId += 1;
  impactCatalogueIds.set(value, id);
  return id;
}

function eventImpactKey(event: LiveEew, sites: JmaSeismicSiteCatalogue | null) {
  return [
    event.latitude,
    event.longitude,
    event.depthKm ?? 10,
    event.magnitude ?? 0,
    impactCatalogueId(sites),
  ].join(":");
}

function administrativeImpactProfile(
  region: JmaRegionFeature,
  event: LiveEew,
  sites: JmaSeismicSiteCatalogue | null,
) {
  let cachedByEvent = administrativeImpactProfileCache.get(region);
  if (!cachedByEvent) {
    cachedByEvent = new Map();
    administrativeImpactProfileCache.set(region, cachedByEvent);
  }
  const cacheKey = eventImpactKey(event, sites);
  if (cachedByEvent.has(cacheKey)) return cachedByEvent.get(cacheKey) ?? null;

  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  let profile: AdministrativeImpactProfile | null = null;
  if (region.properties.scale !== "intensity" && depthKm <= 150) {
    const regionSites = sites?.regions[region.properties.name]
      ?? administrativeRegionSamples(region, event).map(({ latitude, longitude }) => [latitude, longitude, 1.4] as const);
    const arrivals = regionSites.flatMap(([latitude, longitude, arv]) => {
      const location = { latitude, longitude, arv };
      const rank = jmaShindoRank(calculateJmaShindo(event, location));
      if (rank < 1) return [];
      return [{
        rank,
        seconds: Math.hypot(haversineKm(event, location), depthKm) / 3.5,
      }];
    });
    const rank = Math.max(0, ...arrivals.map((arrival) => arrival.rank));
    if (rank >= 1) profile = { rank, arrivals };
  } else if (region.properties.scale === "intensity") {
    const samples = administrativeRegionSamples(region, event);
    const intensity = Math.max(0, ...samples.map((sample) => calculateLocalIntensity(event, sample)));
    const rank = Math.max(0, Math.min(10, Math.floor(intensity + 0.5)));
    if (rank >= 1) {
      const seconds = Math.min(...samples.map((sample) => (
        Math.hypot(haversineKm(event, sample), depthKm) / 3.5
      )));
      profile = { rank, arrivals: [{ rank, seconds }] };
    }
  }

  if (cachedByEvent.size >= 8) cachedByEvent.delete(cachedByEvent.keys().next().value as string);
  cachedByEvent.set(cacheKey, profile);
  return profile;
}

function simulateAdministrativeRegionImpact(
  region: JmaRegionFeature,
  event: LiveEew,
  sites: JmaSeismicSiteCatalogue | null,
  elapsedSeconds: number | null,
) {
  if (!geometryCenter(region)) return null;
  const profile = administrativeImpactProfile(region, event, sites);
  if (!profile) return null;
  if (elapsedSeconds === null) {
    return { rank: profile.rank, currentRank: profile.rank, arrived: true };
  }
  let currentRank = 0;
  for (const arrival of profile.arrivals) {
    const sinceArrival = elapsedSeconds - arrival.seconds;
    if (sinceArrival < 0) continue;
    currentRank = Math.max(currentRank, arrival.rank * Math.min(1, (sinceArrival + 0.5) / 2.5));
  }
  currentRank = Number(currentRank.toFixed(2));
  return { rank: profile.rank, currentRank, arrived: currentRank >= 0.5 };
}

const globalImpactContourCache = new Map<string, ReturnType<typeof buildGlobalImpactContours>>();
const staticImpactCircleCache = new Map<string, ReturnType<typeof geodesicCircleCoordinates>>();

function cachedGlobalImpactContours(event: LiveEew, scale: "shindo" | "intensity") {
  const key = `${event.latitude}:${event.longitude}:${event.depthKm ?? 10}:${event.magnitude ?? 0}:${scale}`;
  const cached = globalImpactContourCache.get(key);
  if (cached) return cached;
  const contours = buildGlobalImpactContours(event, null, scale);
  if (globalImpactContourCache.size >= 24) globalImpactContourCache.delete(globalImpactContourCache.keys().next().value as string);
  globalImpactContourCache.set(key, contours);
  return contours;
}

function cachedStaticImpactCircle(event: LiveEew, radiusKm: number) {
  const key = `${event.latitude}:${event.longitude}:${radiusKm.toFixed(1)}`;
  const cached = staticImpactCircleCache.get(key);
  if (cached) return cached;
  const coordinates = geodesicCircleCoordinates(event, radiusKm);
  if (staticImpactCircleCache.size >= 160) staticImpactCircleCache.delete(staticImpactCircleCache.keys().next().value as string);
  staticImpactCircleCache.set(key, coordinates);
  return coordinates;
}

function affectedRegionLayers(
  regions: JmaRegionCollection | null,
  sites: JmaSeismicSiteCatalogue | null,
  event: LiveEew | null,
  elapsedSeconds: number | null,
): { local: JmaRegionCollection; official: JmaRegionCollection } {
  const empty: JmaRegionCollection = { type: "FeatureCollection", features: [] };
  if (!event || event.cancelled) return { local: empty, official: empty };
  const hasHypocenter = event.hypocenterKnown !== false
    && Number.isFinite(event.latitude)
    && Number.isFinite(event.longitude)
    && event.latitude >= -90
    && event.latitude <= 90
    && event.longitude >= -180
    && event.longitude <= 180;
  const contourScale = usesShindoScaleForLocation(event) ? "shindo" : "intensity";
  const depthKm = Math.max(0, Number(event.depthKm ?? 10));
  const travelledKm = elapsedSeconds === null ? Number.POSITIVE_INFINITY : Math.max(0, elapsedSeconds) * 3.5;
  const currentHorizontalRadiusKm = elapsedSeconds === null
    ? Number.POSITIVE_INFINITY
    : Math.sqrt(Math.max(0, travelledKm * travelledKm - depthKm * depthKm));
  const contours = hasHypocenter ? cachedGlobalImpactContours(event, contourScale).map((contour) => ({
    ...contour,
    currentRadiusKm: Number(Math.min(contour.radiusKm, currentHorizontalRadiusKm).toFixed(1)),
    arrived: elapsedSeconds === null || currentHorizontalRadiusKm >= 1,
  })) : [];
  const dynamicCircles = new Map<number, ReturnType<typeof geodesicCircleCoordinates>>();
  const contourFeature = (radiusKm: number, rank: number, arrived: boolean, cacheStatic = false): JmaRegionFeature | null => {
    let coordinates = cacheStatic ? cachedStaticImpactCircle(event, radiusKm) : dynamicCircles.get(radiusKm);
    if (!coordinates) {
      coordinates = geodesicCircleCoordinates(event, radiusKm);
      dynamicCircles.set(radiusKm, coordinates);
    }
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
    : contours.flatMap((contour) => contourFeature(contour.radiusKm, contour.rank, false, true) ?? []);
  const arrivedContours = contours.flatMap((contour) => {
    const radiusKm = elapsedSeconds === null ? contour.radiusKm : contour.currentRadiusKm;
    return contour.arrived ? contourFeature(radiusKm, contour.rank, true, elapsedSeconds === null) ?? [] : [];
  });
  const contourFeatures = [...forecastContours, ...arrivedContours];
  if (!regions) {
    return {
      local: { type: "FeatureCollection", features: contourFeatures },
      official: empty,
    };
  }
  const localFeatures: JmaRegionFeature[] = [];
  const officialFeatures: JmaRegionFeature[] = [];

  for (const region of regions.features) {
    const officialArea = (event.affectedAreas ?? [])
      .filter((area) => impactRegionMatchesName(region.properties, area.name))
      .sort((left, right) => right.rank - left.rank)[0];
    if (officialArea) {
      officialFeatures.push({
        ...region,
        properties: {
          ...region.properties,
          rank: officialArea.rank,
          currentRank: officialArea.rank,
          arrived: true,
          source: "official",
        },
      });
      continue;
    }
    const impact = hasHypocenter
      ? simulateAdministrativeRegionImpact(region, event, sites, elapsedSeconds)
      : null;
    if (!impact) continue;
    localFeatures.push({
      ...region,
      properties: {
        ...region.properties,
        rank: impact.rank,
        currentRank: impact.currentRank,
        arrived: impact.arrived,
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

function InstitutionReportDetail({ record, onFocus, onMechanism, onShakeMap, onPager, onDyfi, onJshis }: {
  record: EarthquakeEvent;
  onFocus: () => void;
  onMechanism: (record: EarthquakeEvent) => void;
  onShakeMap: (record: EarthquakeEvent) => void;
  onPager: (record: EarthquakeEvent) => void;
  onDyfi: (record: EarthquakeEvent) => void;
  onJshis: (record: EarthquakeEvent) => void;
}) {
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
      <div className="seismic-institution-actions"><button onClick={onFocus}><LocateFixed size={14} />定位报告</button>{isMechanismQueryable(record) && <button onClick={() => onMechanism(record)}><CircleGauge size={14} />{record.source === "usgs" ? "USGS 机制解" : "机制解"}</button>}{isJshisPositionSupported(record.latitude, record.longitude) && <button onClick={() => onJshis(record)}><Layers3 size={14} />J-SHIS</button>}{isShakeMapQueryable(record) && <button onClick={() => onShakeMap(record)}><MapIcon size={14} />叠加 ShakeMap</button>}{isPagerQueryable(record) && <button onClick={() => onPager(record)}><BarChart3 size={14} />PAGER 影响</button>}{isDyfiQueryable(record) && <button onClick={() => onDyfi(record)}><MessageCircle size={14} />DYFI</button>}<a href={record.url} target="_blank" rel="noreferrer">机构原文<ExternalLink size={13} /></a>{report?.summaryJsonUrl && <a href={report.summaryJsonUrl} target="_blank" rel="noreferrer">报告 JSON<ExternalLink size={13} /></a>}{report?.summaryPdfUrl && <a href={report.summaryPdfUrl} target="_blank" rel="noreferrer">报告 PDF<ExternalLink size={13} /></a>}</div>
    </aside>
  );
}

function PagerExposurePanel({ pager, loading, error }: {
  pager: EarthquakePager | null;
  loading: boolean;
  error: string;
}) {
  if (loading) return <div className="seismic-empty"><Loader2 className="spin" size={28} /><strong>正在读取 Population Exposure</strong><span>数据来自所选 USGS 事件的 PAGER 官方产品。</span></div>;
  if (error) return <div className="seismic-empty"><AlertTriangle size={28} /><strong>PAGER 暂不可用</strong><span>{error}</span></div>;
  if (!pager) return <div className="seismic-empty"><BarChart3 size={28} /><strong>请选择带 PAGER 产品的 USGS 报告</strong><span>只有目录确认存在 losspager 产品时才会显示数据与入口。</span></div>;
  const maximum = Math.max(1, ...pager.populationExposure.groups.map((group) => group.population));
  return <>
    <header className="seismic-section-heading"><div><strong>Population Exposure</strong><span>USGS PAGER · 按 MMI 分级人口</span></div><b className={`pager-level-${pager.alertLevel}`}>{pager.alertLevel.toUpperCase()}</b></header>
    <div className="seismic-pager-exposure-summary"><div><span>总暴露人口</span><strong>{pager.populationExposure.totalPopulation.toLocaleString("zh-CN")}</strong></div><div><span>全部城市</span><strong>{pager.allCities.length}</strong></div><div><span>最大 MMI</span><strong>{pager.maxMmi?.toFixed(1) ?? "--"}</strong></div></div>
    <div className="seismic-pager-exposure-list">
      {pager.populationExposure.groups.map((group) => <article key={group.label}>
        <span>MMI <strong>{group.label}</strong></span>
        <div><i style={{ width: `${Math.max(group.population > 0 ? 2 : 0, group.population / maximum * 100)}%`, background: mmiIntensityColor(group.maximumMmi) }} /></div>
        <b>{group.population.toLocaleString("zh-CN")} 人</b>
      </article>)}
    </div>
    <p className="seismic-data-label">人数来自 USGS PAGER population_exposure；II 与 III 依照官方展示逻辑合并，其他等级逐级显示。该估算不是人口普查实时值。</p>
  </>;
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
    : state === "unconfigured"
      ? "待授权配置"
    : state === "stale"
      ? latency === null ? "缓存 · 重连中" : `缓存 · ${latency} ms`
      : latency === null
        ? state === "connecting" ? "连接中" : "等待数据"
        : `${latency} ms`;
  return (
    <div className="seismic-source-indicator">
      <span className={`latency-dot ${state === "online" ? "green" : state === "connecting" ? "checking" : state === "stale" ? "yellow" : state === "unconfigured" ? "muted" : "red"}`} />
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
    if (target.radiusKm && target.radiusKm > 0) {
      const latitudeDelta = target.radiusKm / 111.32;
      const longitudeScale = Math.max(0.12, Math.cos(target.latitude * Math.PI / 180));
      const longitudeDelta = target.radiusKm / (111.32 * longitudeScale);
      map.fitBounds([
        [Math.max(-89.9, target.latitude - latitudeDelta), Math.max(-180, target.longitude - longitudeDelta)],
        [Math.min(89.9, target.latitude + latitudeDelta), Math.min(180, target.longitude + longitudeDelta)],
      ], {
        animate: true,
        duration: 0.8,
        padding: [54, 54],
        maxZoom: 13,
      });
      return;
    }
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

function SeismicMapInteractionBehavior({ mode }: { mode: SeismicMapInteractionMode }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    container.classList.remove("seismic-map--drag", "seismic-map--select");
    container.classList.add(`seismic-map--${mode}`);
    if (mode === "select") {
      map.dragging.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
    } else {
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
    }
    return () => {
      container.classList.remove("seismic-map--drag", "seismic-map--select");
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
    };
  }, [map, mode]);
  return null;
}

function SeismicMapResizeSync() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const sync = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        map.invalidateSize({ animate: false, pan: false });
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [map]);
  return null;
}

function jshisPointPositions(collection: JshisFaultShape["features"]) {
  const positions: number[] = [];
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    const source = geometry.type === "Point"
      ? [geometry.coordinates]
      : geometry.type === "MultiPoint"
        ? geometry.coordinates
        : [];
    for (const coordinate of source) {
      const longitude = Number(coordinate[0]);
      const latitude = Number(coordinate[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
      const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
      const sine = Math.sin(clampedLatitude * Math.PI / 180);
      positions.push(
        (longitude + 180) / 360,
        0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI),
      );
    }
  }
  return new Float32Array(positions);
}

function jshisFaultMapExtent(collection: JshisFaultShape["features"]) {
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;
  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  const visitCoordinates = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2
      && Number.isFinite(Number(value[0]))
      && Number.isFinite(Number(value[1]))
    ) {
      const longitude = Number(value[0]);
      const latitude = Number(value[1]);
      minLatitude = Math.min(minLatitude, latitude);
      maxLatitude = Math.max(maxLatitude, latitude);
      minLongitude = Math.min(minLongitude, longitude);
      maxLongitude = Math.max(maxLongitude, longitude);
      return;
    }
    for (const child of value) visitCoordinates(child);
  };
  for (const feature of collection.features) {
    if ("coordinates" in feature.geometry) visitCoordinates(feature.geometry.coordinates);
  }
  if (![minLatitude, maxLatitude, minLongitude, maxLongitude].every(Number.isFinite)) return null;
  const latitude = (minLatitude + maxLatitude) / 2;
  const longitude = (minLongitude + maxLongitude) / 2;
  return {
    latitude,
    longitude,
    radiusKm: Math.max(
      12,
      haversineKm({ latitude, longitude }, { latitude: minLatitude, longitude: minLongitude }),
      haversineKm({ latitude, longitude }, { latitude: maxLatitude, longitude: maxLongitude }),
    ),
  };
}

function compileJshisShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

const JshisFaultPointCloud = memo(function JshisFaultPointCloud(props: {
  fault: JshisFaultShape;
}) {
  const map = useMap();
  const normalizedPositions = useMemo(() => jshisPointPositions(props.fault.features), [props.fault.features]);

  useEffect(() => {
    if (!normalizedPositions.length) return undefined;
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.className = "seismic-jshis-webgl-layer";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      preserveDrawingBuffer: false,
    });
    const context2d = gl ? null : canvas.getContext("2d");
    let frame = 0;
    let disposed = false;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;

    if (gl) {
      const vertex = compileJshisShader(gl, gl.VERTEX_SHADER, `
        attribute vec2 a_position;
        uniform float u_world_scale;
        uniform vec2 u_pixel_origin;
        uniform vec2 u_viewport;
        uniform float u_point_size;
        void main() {
          vec2 pixel = a_position * u_world_scale - u_pixel_origin;
          vec2 clip = vec2(pixel.x / u_viewport.x * 2.0 - 1.0, 1.0 - pixel.y / u_viewport.y * 2.0);
          gl_Position = vec4(clip, 0.0, 1.0);
          gl_PointSize = u_point_size;
        }
      `);
      const fragment = compileJshisShader(gl, gl.FRAGMENT_SHADER, `
        precision mediump float;
        void main() {
          vec2 delta = gl_PointCoord - vec2(0.5);
          float radius = length(delta);
          if (radius > 0.5) discard;
          float edge = 1.0 - smoothstep(0.34, 0.5, radius);
          gl_FragColor = vec4(0.94, 0.16, 0.19, 0.82 * edge);
        }
      `);
      if (vertex && fragment) {
        program = gl.createProgram();
        if (program) {
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);
            program = null;
          }
        }
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, normalizedPositions, gl.STATIC_DRAW);
    }

    const draw = () => {
      frame = 0;
      if (disposed) return;
      const size = map.getSize();
      // A full-size 2x Retina WebGL buffer quadruples the pixels cleared when
      // the view settles. Fault points remain crisp with modest supersampling.
      const pixelRatio = Math.min(1.25, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(size.x * pixelRatio));
      const height = Math.max(1, Math.round(size.y * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      const origin = map.getPixelOrigin();
      const worldScale = 256 * 2 ** map.getZoom();
      if (gl && program && buffer) {
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const position = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(gl.getUniformLocation(program, "u_world_scale"), worldScale * pixelRatio);
        gl.uniform2f(gl.getUniformLocation(program, "u_pixel_origin"), origin.x * pixelRatio, origin.y * pixelRatio);
        gl.uniform2f(gl.getUniformLocation(program, "u_viewport"), width, height);
        gl.uniform1f(gl.getUniformLocation(program, "u_point_size"), 4.5 * pixelRatio);
        gl.drawArrays(gl.POINTS, 0, normalizedPositions.length / 2);
        return;
      }
      if (context2d) {
        context2d.clearRect(0, 0, width, height);
        context2d.fillStyle = "rgba(239, 68, 68, 0.78)";
        const pointCount = normalizedPositions.length / 2;
        const coordinateStride = Math.max(2, Math.ceil(pointCount / 12_000) * 2);
        for (let index = 0; index < normalizedPositions.length; index += coordinateStride) {
          const x = (normalizedPositions[index] * worldScale - origin.x) * pixelRatio;
          const y = (normalizedPositions[index + 1] * worldScale - origin.y) * pixelRatio;
          context2d.fillRect(x - pixelRatio, y - pixelRatio, 2 * pixelRatio, 2 * pixelRatio);
        }
      }
    };
    const scheduleDraw = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    map.on("move zoom resize viewreset", scheduleDraw);
    scheduleDraw();
    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      map.off("move zoom resize viewreset", scheduleDraw);
      if (gl) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
      canvas.remove();
    };
  }, [map, normalizedPositions]);

  const nonPointFeatures = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: props.fault.features.features.filter((feature) => !["Point", "MultiPoint"].includes(feature.geometry.type)),
  }), [props.fault.features]);
  return nonPointFeatures.features.length
    ? <LeafletGeoJSON data={nonPointFeatures} interactive={false} style={{ color: "#ef4444", fillColor: "#dc2626", weight: 2.4, opacity: 0.98, fillOpacity: 0.24 }} />
    : null;
});

const JshisMapLayers = memo(function JshisMapLayers(props: {
  location: JshisLocationSnapshot | null;
  fault: JshisFaultShape | null;
  showHazard: boolean;
  showSite: boolean;
  showFault: boolean;
}) {
  const showGridLocator = Boolean(
    props.location
    && ((props.showHazard && props.location.hazard) || (props.showSite && props.location.site)),
  );
  const meshcode = props.location?.hazard?.meshcode ?? props.location?.site?.meshcode ?? "";
  return <>
    <Pane name="seismic-jshis-products" style={{ zIndex: 335, pointerEvents: "none" }}>
      {props.showHazard && props.location?.hazard && <LeafletGeoJSON
        key={`jshis-hazard:${props.location.hazard.meshcode}`}
        data={props.location.hazard.feature}
        interactive={false}
        style={{ color: "#facc15", fillColor: "#f97316", weight: 3.4, opacity: 1, fillOpacity: 0.34, dashArray: "5 3" }}
      />}
      {props.showSite && props.location?.site && <LeafletGeoJSON
        key={`jshis-site:${props.location.site.meshcode}`}
        data={props.location.site.feature}
        interactive={false}
        style={{ color: "#22d3ee", fillColor: "#0891b2", weight: 2.6, opacity: 1, fillOpacity: 0.26 }}
      />}
      {props.showFault && props.fault && <JshisFaultPointCloud key={`jshis-fault:${props.fault.code}`} fault={props.fault} />}
    </Pane>
    {showGridLocator && props.location && <Pane name="seismic-jshis-locator" style={{ zIndex: 505, pointerEvents: "none" }}>
      <CircleMarker
        center={[props.location.latitude, props.location.longitude]}
        radius={7}
        interactive={false}
        pathOptions={{ color: "#fef08a", fillColor: "#06b6d4", weight: 2.4, opacity: 1, fillOpacity: 0.9 }}
      >
        <LeafletTooltip permanent direction="top" offset={[0, -8]} className="seismic-jshis-grid-label">
          J-SHIS {meshcode}
        </LeafletTooltip>
      </CircleMarker>
    </Pane>}
  </>;
});

const ShakeMapContourLayer = memo(function ShakeMapContourLayer(props: {
  visible: boolean;
  shakeMap: EarthquakeShakeMap | null;
  contours: EarthquakeShakeMap["contours"] | null;
}) {
  return <Pane name="seismic-usgs-shakemap" style={{ zIndex: 340, pointerEvents: "none" }}>
    {props.visible && props.shakeMap && props.contours && <LeafletGeoJSON
      key={`${props.shakeMap.eventId}:${props.shakeMap.updateTime ?? "unknown"}:${props.contours.features.map((feature) => shakeMapContourLevel(feature.properties.value)).join(",")}`}
      data={props.contours}
      interactive={false}
      style={(feature) => ({
        color: String(feature?.properties?.color ?? "#38bdf8"),
        weight: Math.max(2, Number(feature?.properties?.weight ?? 2)),
        opacity: 0.96,
        lineCap: "round",
        lineJoin: "round",
      })}
    />}
  </Pane>;
});

const PagerCityMapLayer = memo(function PagerCityMapLayer(props: {
  visible: boolean;
  cities: EarthquakePagerCity[];
}) {
  return <Pane name="seismic-usgs-pager-cities" style={{ zIndex: 465 }}>
    {props.visible && props.cities.map((city) => {
      const rank = Math.max(1, Math.min(10, city.mmi));
      return <CircleMarker
        key={`pager-city:${city.id}`}
        center={[city.latitude, city.longitude]}
        radius={2.2}
        pathOptions={{ color: "#ffffff", fillColor: mmiIntensityColor(rank), weight: 0.8, opacity: 0.82, fillOpacity: 0.72 }}
      >
        <LeafletTooltip permanent direction="center" className={`pager-map-city-label mmi-${Math.round(rank)}`}>{intensityRomanLabel(rank)}</LeafletTooltip>
        <Popup><strong>{city.name}</strong><br />USGS PAGER 城市估算<br />MMI {city.mmi.toFixed(1)} · {intensityRomanLabel(rank)}<br />人口 {city.population.toLocaleString("zh-CN")}<br />{city.onOfficialMap ? "USGS 默认地图城市" : "Show all cities 扩展城市"}</Popup>
      </CircleMarker>;
    })}
  </Pane>;
});

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
        radius={2.35}
        pathOptions={{
          color,
          fillColor: color,
          weight: 0.5,
          opacity: 0.82,
          fillOpacity: 0.58,
        }}
        eventHandlers={{ click: () => props.onSelectStation(station) }}
      >
        <LeafletTooltip direction="top" offset={[0, -4]}><strong>{station.network} {station.stationCode}</strong><br />全球 FDSN 台站目录 · {station.stationName}</LeafletTooltip>
      </CircleMarker>;
    })}
  </>;
});

const WaveformStationBaseMarkers = memo(function WaveformStationBaseMarkers(props: {
  stations: GlobalSeismicStation[];
  verifiedStationIds: string[];
  onSelectStation: (station: SelectableStation) => void;
}) {
  const verifiedStationIds = useMemo(() => new Set(props.verifiedStationIds), [props.verifiedStationIds]);
  return <>{props.stations.map((station) => {
    const verified = verifiedStationIds.has(station.id);
    return <CircleMarker
      key={`waveform:${station.id}`}
      center={[station.latitude, station.longitude]}
      radius={verified ? 4.6 : 3.45}
      pathOptions={{
        color: verified ? "#ffffff" : "#fbcfe8",
        fillColor: FDSN_WAVEFORM_INACTIVE_COLOR,
        weight: verified ? 1.6 : 0.85,
        opacity: verified ? 1 : 0.88,
        fillOpacity: verified ? 0.96 : 0.78,
      }}
      eventHandlers={{ click: () => props.onSelectStation(station) }}
    >
      <LeafletTooltip direction="top" offset={[0, -4]}><strong>{station.network} {station.stationCode}</strong><br />{verified ? "已核验存在原始波形" : "目录声明近实时波形通道"} · 点击读取 miniSEED</LeafletTooltip>
    </CircleMarker>;
  })}</>;
});

const WaveformStationResponseMarkers = memo(function WaveformStationResponseMarkers(props: {
  stations: GlobalSeismicStation[];
  ranks: Record<string, number>;
  labeledStationIds: Set<string>;
  selectedStationId: string | null;
  onSelectStation: (station: SelectableStation) => void;
}) {
  return <>{props.stations.map((station) => {
    const selected = props.selectedStationId === station.id;
    const rank = props.ranks[station.id] ?? 0;
    const active = isFdsnWaveformStationActive(rank);
    const color = fdsnWaveformStationColor(rank);
    const strength = Math.max(0, Math.min(1, rank / 8));
    const radius = selected ? 7 : 4.6 + strength * 2;
    return <Fragment key={`response:${station.id}`}>
      <CircleMarker
        center={[station.latitude, station.longitude]}
        radius={radius}
        pathOptions={{
          color: selected || active ? "#ffffff" : "#fbcfe8",
          fillColor: color,
          weight: selected ? 2.2 : 1.1 + strength,
          opacity: 0.9 + strength * 0.1,
          fillOpacity: 0.74 + strength * 0.22,
        }}
        eventHandlers={{ click: () => props.onSelectStation(station) }}
      >
        {selected && <Popup><strong>{station.network} {station.stationCode}</strong><br />{station.stationName}<br />FDSN：{station.providers.join(" / ")}<br />本地传播模拟 MMI {rank.toFixed(1)} · {intensityRomanLabel(rank)}<br />待机为粉色，激活后按 MMI 烈度表填色；点击后核验并读取原始 miniSEED<br />海拔 {station.elevationM?.toFixed(0) ?? "--"} m</Popup>}
      </CircleMarker>
      {active && props.labeledStationIds.has(station.id) && <StationValueMarker latitude={station.latitude} longitude={station.longitude} rank={rank} scale="intensity" selected={selected} label={`${station.network} ${station.stationCode} MMI ${intensityRomanLabel(rank)}`} />}
    </Fragment>;
  })}</>;
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

const GnssStationMarkers = memo(function GnssStationMarkers(props: { stations: readonly GnssStation[]; selectMode: boolean }) {
  return <>{props.stations.map((station) => <CircleMarker
    key={station.id}
    center={[station.latitude, station.longitude]}
    radius={props.selectMode ? 5.5 : 2.15}
    pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", weight: 0.5, opacity: 0.92, fillOpacity: 0.74 }}
  >
    <Popup>
      <strong>{station.stationName}（{station.stationCode}）</strong><br />
      中国大陆 GNSS 站点<br />
      {station.networkName}{station.networkType ? ` · ${station.networkType}` : ""}<br />
      {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
      {station.address ? <><br />{station.address}</> : null}
      <br /><small>应用内置站点目录 · 非实时位移数据</small>
    </Popup>
  </CircleMarker>)}</>;
});

const PalertStationMarkers = memo(function PalertStationMarkers(props: { stations: PalertStation[]; selectMode: boolean }) {
  return <>{props.stations.map((station) => <CircleMarker
    key={station.id}
    center={[station.latitude, station.longitude]}
    radius={props.selectMode ? 5.5 : 2.3}
    pathOptions={{ color: "#f0abfc", fillColor: "#d946ef", weight: 0.65, opacity: 0.96, fillOpacity: 0.82 }}
  >
    <Popup>
      <strong>{station.stationName}（{station.stationCode}）</strong><br />
      P-Alert 强震网 · {station.network}<br />
      {station.area || "台湾"}{station.floor === null ? "" : ` · ${station.floor} 楼`}<br />
      {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}<br />
      海拔 {station.elevationM?.toFixed(0) ?? "--"} m
    </Popup>
  </CircleMarker>)}</>;
});

type StationCanvasPoint = {
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
};

/** Draws large, non-interactive station sets in one canvas instead of one SVG
 * node per station. The Leaflet pane owns geographic movement; the canvas is
 * re-anchored only after the viewport settles or the station data changes. */
const StationCanvasLayer = memo(function StationCanvasLayer(props: {
  paneName: string;
  points: StationCanvasPoint[];
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef(props.points);
  const redrawRef = useRef<() => void>(() => undefined);
  pointsRef.current = props.points;

  useEffect(() => {
    const pane = map.getPane(props.paneName);
    if (!pane) return;
    const canvas = document.createElement("canvas");
    canvas.className = "seismic-station-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    pane.appendChild(canvas);
    canvasRef.current = canvas;
    let animationFrame = 0;

    const draw = () => {
      animationFrame = 0;
      const context = canvas.getContext("2d");
      if (!context) return;
      const size = map.getSize();
      // A full-size 2x Retina backing store quadruples the pixels cleared and
      // redrawn for every replay frame. Station dots remain crisp at 1.25x.
      const pixelRatio = Math.min(1.25, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(size.x * pixelRatio));
      canvas.height = Math.max(1, Math.round(size.y * pixelRatio));
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      canvas.style.transform = `translate3d(${topLeft.x}px, ${topLeft.y}px, 0)`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, size.x, size.y);

      const batches = new Map<string, { point: StationCanvasPoint; centers: Array<[number, number]> }>();
      for (const point of pointsRef.current) {
        const position = map.latLngToContainerPoint([point.latitude, point.longitude]);
        if (position.x < -10 || position.y < -10 || position.x > size.x + 10 || position.y > size.y + 10) continue;
        const key = `${point.color}|${point.radius}|${point.opacity ?? 1}|${point.strokeColor ?? ""}|${point.strokeWidth ?? 0}`;
        const batch = batches.get(key) ?? { point, centers: [] };
        batch.centers.push([position.x, position.y]);
        batches.set(key, batch);
      }
      for (const { point, centers } of batches.values()) {
        context.beginPath();
        for (const [x, y] of centers) {
          context.moveTo(x + point.radius, y);
          context.arc(x, y, point.radius, 0, Math.PI * 2);
        }
        context.globalAlpha = point.opacity ?? 1;
        context.fillStyle = point.color;
        context.fill();
        if (point.strokeColor && (point.strokeWidth ?? 0) > 0) {
          context.strokeStyle = point.strokeColor;
          context.lineWidth = point.strokeWidth ?? 1;
          context.stroke();
        }
      }
      context.globalAlpha = 1;
    };
    const scheduleDraw = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(draw);
    };
    redrawRef.current = scheduleDraw;
    map.on("moveend zoomend resize viewreset", scheduleDraw);
    scheduleDraw();
    return () => {
      map.off("moveend zoomend resize viewreset", scheduleDraw);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      redrawRef.current = () => undefined;
      canvasRef.current = null;
      canvas.remove();
    };
  }, [map, props.paneName]);

  useEffect(() => redrawRef.current(), [props.points]);
  return null;
});

const GlobalStationBaseLayer = memo(function GlobalStationBaseLayer(props: { stations: GlobalSeismicStation[]; maxMarkers?: number; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const points = useMemo<StationCanvasPoint[]>(() => sampleStationMarkers(props.stations, props.maxMarkers ?? 600).map((station) => ({
    latitude: station.latitude,
    longitude: station.longitude,
    color: FDSN_PROVIDER_COLORS[station.providerId] ?? "#38bdf8",
    radius: 2.2,
    opacity: 0.7,
  })), [props.maxMarkers, props.stations]);
  return <Pane name="seismic-station-base-global" style={{ zIndex: 458 }}>{props.show && <StationCanvasLayer paneName="seismic-station-base-global" points={points} />}</Pane>;
});

const WaveformStationBaseLayer = memo(function WaveformStationBaseLayer(props: { stations: GlobalSeismicStation[]; maxMarkers?: number; verifiedStationIds: string[]; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const points = useMemo<StationCanvasPoint[]>(() => {
    const verified = new Set(props.verifiedStationIds);
    const sampled = sampleStationMarkers(props.stations, props.maxMarkers ?? 600);
    const verifiedStations = props.stations.filter((station) => verified.has(station.id));
    const stations = [...new Map([...sampled, ...verifiedStations].map((station) => [station.id, station])).values()];
    return stations.map((station) => ({
      latitude: station.latitude,
      longitude: station.longitude,
      color: FDSN_WAVEFORM_INACTIVE_COLOR,
      radius: verified.has(station.id) ? 4.4 : 3.2,
      opacity: verified.has(station.id) ? 0.96 : 0.78,
      strokeColor: verified.has(station.id) ? "#ffffff" : "#fbcfe8",
      strokeWidth: verified.has(station.id) ? 1.5 : 0.7,
    }));
  }, [props.maxMarkers, props.stations, props.verifiedStationIds]);
  return <Pane name="seismic-station-base-waveform" className="seismic-waveform-station-pane" style={{ zIndex: 466 }}>{props.show && <StationCanvasLayer paneName="seismic-station-base-waveform" points={points} />}</Pane>;
});

const CwaStationBaseLayer = memo(function CwaStationBaseLayer(props: { stations: GlobalSeismicStation[]; maxMarkers?: number; show: boolean; onSelectStation: (station: SelectableStation) => void }) {
  const points = useMemo<StationCanvasPoint[]>(() => sampleStationMarkers(props.stations, props.maxMarkers ?? 180).map((station) => ({
    latitude: station.latitude,
    longitude: station.longitude,
    color: FDSN_PROVIDER_COLORS.cwa,
    radius: 2.6,
    opacity: 0.86,
    strokeColor: "#ffffff",
    strokeWidth: 0.6,
  })), [props.maxMarkers, props.stations]);
  return <Pane name="seismic-station-base-cwa" style={{ zIndex: 460 }}>{props.show && <StationCanvasLayer paneName="seismic-station-base-cwa" points={points} />}</Pane>;
});

const GnssStationLayer = memo(function GnssStationLayer(props: { stations: readonly GnssStation[]; show: boolean; selectMode: boolean }) {
  const stations = useMemo(() => sampleStationMarkers(props.stations, 520), [props.stations]);
  return <Pane name="seismic-station-base-gnss" style={{ zIndex: 455 }}>{props.show ? <GnssStationMarkers stations={stations} selectMode={props.selectMode} /> : null}</Pane>;
});

const GnssResponseMarkers = memo(function GnssResponseMarkers(props: {
  stations: readonly GnssStation[];
  ranks: Record<string, number>;
  mode: "live" | "replay";
  maxLabels: number;
}) {
  const displayed = useMemo(() => sampleStableStationMarkers(
    props.stations.filter((station) => (props.ranks[station.id] ?? 0) >= 0.25),
    48,
  ), [props.ranks, props.stations]);
  const labeledIds = useMemo(() => new Set(
    [...displayed]
      .sort((a, b) => (props.ranks[b.id] ?? 0) - (props.ranks[a.id] ?? 0))
      .slice(0, props.maxLabels)
      .map((station) => station.id),
  ), [displayed, props.maxLabels, props.ranks]);
  return <>{displayed.map((station) => {
    const rank = props.ranks[station.id] ?? 0;
    const color = mmiIntensityColor(rank);
    return <Fragment key={`gnss-response:${station.id}`}>
      <CircleMarker
        center={[station.latitude, station.longitude]}
        radius={Math.max(3.4, Math.min(6.8, 3.2 + rank * 0.34))}
        pathOptions={{ color: "#ffffff", fillColor: color, weight: 1.2, opacity: 0.9, fillOpacity: 0.9 }}
      >
        <Popup><strong>{station.stationName}（{station.stationCode}）</strong><br />中国大陆 GNSS 站点<br />{props.mode === "replay" ? "历史事件回放" : "当前事件传播"}模拟 MMI {rank.toFixed(1)} · {intensityRomanLabel(rank)}<br /><small>确定性地震波传播模拟，不是 GNSS 实测烈度或位移</small></Popup>
      </CircleMarker>
      {labeledIds.has(station.id) && <StationValueMarker latitude={station.latitude} longitude={station.longitude} rank={rank} scale="intensity" label={`${station.stationCode} MMI ${intensityRomanLabel(rank)}`} />}
    </Fragment>;
  })}</>;
});

const PalertStationLayer = memo(function PalertStationLayer(props: { stations: PalertStation[]; show: boolean; selectMode: boolean }) {
  const stations = useMemo(() => sampleStationMarkers(props.stations, 360), [props.stations]);
  return <Pane name="seismic-station-base-palert" style={{ zIndex: 458 }}>{props.show ? <PalertStationMarkers stations={stations} selectMode={props.selectMode} /> : null}</Pane>;
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
  const stations = useMemo(() => sampleStationMarkers(props.stations.filter((station) => (
    station.network === "S-net" ? props.showSnet : props.showOther
  )), 360), [props.showOther, props.showSnet, props.stations]);
  return <Pane name="seismic-station-base-ocean" style={{ zIndex: 460 }}>{stations.length > 0 && <OceanStationBaseMarkers stations={stations} onSelectStation={props.onSelectStation} />}</Pane>;
});

function sampleStationMarkers<T extends { id: string; latitude: number; longitude: number }>(stations: readonly T[], maxMarkers: number) {
  if (stations.length <= maxMarkers) return [...stations];
  const ordered = [...stations].sort((a, b) => (
    a.longitude - b.longitude
    || a.latitude - b.latitude
    || a.id.localeCompare(b.id)
  ));
  const stride = ordered.length / maxMarkers;
  return Array.from({ length: maxMarkers }, (_, index) => ordered[Math.floor(index * stride)]);
}

function sampleStableStationMarkers<T>(stations: readonly T[], maxMarkers: number) {
  if (stations.length <= maxMarkers) return [...stations];
  // Response collections are ordered by theoretical P-wave arrival. Keeping
  // the first sample stable prevents existing interactive markers from being
  // replaced whenever a new station arrives; the canvas layer still renders
  // every arrived station.
  return stations.slice(0, maxMarkers);
}

const SeismicMap = memo(function SeismicMap(props: {
  theme: SeismicMapTheme;
  interactionMode: SeismicMapInteractionMode;
  layerComplexity: number;
  niedStations: SeismicStation[];
  kmaStations: KmaStation[];
  oceanStations: OceanStation[];
  globalStations: GlobalSeismicStation[];
  waveformStations: GlobalSeismicStation[];
  globalResponseStations: GlobalSeismicStation[];
  cwaStations: GlobalSeismicStation[];
  gnssStations: readonly GnssStation[];
  verifiedWaveformStationIds: string[];
  palertStations: PalertStation[];
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
  showWaveform: boolean;
  showCwa: boolean;
  showGnss: boolean;
  showPalert: boolean;
  selectedStation: SelectableStation | null;
  selectedEvent: LiveEew | null;
  waveEvent: LiveEew | null;
  selectedReport: EarthquakeEvent | null;
  estimate: HypocenterEstimate | null;
  estimateMode: "live" | "replay";
  replayRanks: Record<string, number> | null;
  replayMode: boolean;
  oceanRanks: Record<string, number>;
  globalRanks: Record<string, number>;
  globalArrivedStationIds: string[];
  gnssRanks: Record<string, number>;
  gnssMode: "live" | "replay";
  cwaRanks: Record<string, number>;
  cwaArrivedStationIds: string[];
  cwaDetectionStationIds: string[];
  kmaArrivedStationIds: string[];
  oceanMode: OceanResponseMode;
  localRegions: JmaRegionCollection;
  officialRegions: JmaRegionCollection;
  tsunamiRegions: TsunamiRegionCollection;
  globalFaults: GlobalFaultCollection | null;
  jshisLocation: JshisLocationSnapshot | null;
  jshisFault: JshisFaultShape | null;
  shakeMap: EarthquakeShakeMap | null;
  shakeMapContours: EarthquakeShakeMap["contours"] | null;
  pagerCities: EarthquakePagerCity[];
  showLocalImpact: boolean;
  showOfficialImpact: boolean;
  showTsunami: boolean;
  showGlobalFaults: boolean;
  showJshisHazard: boolean;
  showJshisSite: boolean;
  showJshisFault: boolean;
  showShakeMap: boolean;
  showPagerCities: boolean;
  showWniCameras: boolean;
  wniCameras: WniCamera[];
  highlightedWniCameraId: string | null;
  warningLocation: Station | null;
  detectionStationIds: string[];
  detectionRanks: Record<string, number>;
  kmaDetectionStationIds: string[];
  kmaDetectionRanks: Record<string, number>;
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
  const layerComplexity = Math.max(1, Math.min(6, Math.round(Number(props.layerComplexity) || 4)));
  const baseStationBudget = [0, 24, 56, 120, 220, 360, 600][layerComplexity];
  const responseBudget = [0, 8, 12, 24, 40, 64, 96][layerComplexity];
  const responseLabelBudget = Math.max(6, Math.floor(responseBudget / 2));
  const [baseLayerStage, setBaseLayerStage] = useState(0);
  useEffect(() => {
    if (baseLayerStage >= 5) return;
    const timer = window.setTimeout(() => setBaseLayerStage((stage) => stage + 1), 350);
    return () => window.clearTimeout(timer);
  }, [baseLayerStage]);
  const pRadius = props.waveEvent && props.showWaves ? waveRadiusKm(props.waveEvent.originTime, 6, props.waveNow) : 0;
  const sRadius = props.waveEvent && props.showWaves ? waveRadiusKm(props.waveEvent.originTime, 3.5, props.waveNow) : 0;
  const detectionStationSet = useMemo(() => new Set(props.detectionStationIds), [props.detectionStationIds]);
  const cwaArrivedStationSet = useMemo(() => new Set(props.cwaArrivedStationIds), [props.cwaArrivedStationIds]);
  const cwaDetectedStationSet = useMemo(() => new Set(props.cwaDetectionStationIds), [props.cwaDetectionStationIds]);
  const detectedStations = useMemo(
    () => props.niedStations.filter((station) => detectionStationSet.has(station.id)),
    [detectionStationSet, props.niedStations],
  );
  const respondingNiedStations = useMemo(() => props.niedStations.filter((station) => {
    const liveRank = niedLevelRank(niedCharToLevel(props.niedFrame?.intensity[station.index]));
    const replayRank = props.replayRanks?.[station.id] ?? 0;
    return liveRank > 0 || replayRank >= 0.25 || detectionStationSet.has(station.id) || props.selectedStation?.id === station.id;
  }), [detectionStationSet, props.niedFrame, props.niedStations, props.replayRanks, props.selectedStation]);
  const displayedNiedResponses = useMemo(() => {
    const displayed = sampleStableStationMarkers(respondingNiedStations, Math.max(6, responseBudget));
    if (props.selectedStation && isNiedStation(props.selectedStation)
      && !displayed.some((station) => station.id === props.selectedStation?.id)) displayed.push(props.selectedStation);
    return displayed;
  }, [props.selectedStation, respondingNiedStations, responseBudget]);
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
  const kmaDetectedStationSet = useMemo(() => new Set(props.kmaDetectionStationIds), [props.kmaDetectionStationIds]);
  const kmaDetectedStations = useMemo(
    () => props.kmaStations.filter((station) => kmaDetectedStationSet.has(station.id)),
    [kmaDetectedStationSet, props.kmaStations],
  );
  const kmaGridAnchorRef = useRef<{ sessionKey: string; anchor: NiedGridAnchor } | null>(null);
  if (!kmaDetectedStations.length) kmaGridAnchorRef.current = null;
  else if (kmaGridAnchorRef.current?.sessionKey !== props.detectionSessionKey) {
    const strongest = [...kmaDetectedStations]
      .sort((a, b) => (props.kmaDetectionRanks[b.id] ?? 0) - (props.kmaDetectionRanks[a.id] ?? 0))[0];
    kmaGridAnchorRef.current = { sessionKey: props.detectionSessionKey, anchor: niedGridAnchor(strongest) };
  }
  const kmaDetectionCells = buildNiedDetectionGridCells(
    props.kmaStations,
    props.kmaDetectionStationIds,
    props.kmaDetectionRanks,
    kmaGridAnchorRef.current?.anchor,
  );
  const cwaDetectedStations = useMemo(
    () => props.cwaStations.filter((station) => cwaDetectedStationSet.has(station.id)),
    [cwaDetectedStationSet, props.cwaStations],
  );
  const cwaGridAnchorRef = useRef<{ sessionKey: string; anchor: NiedGridAnchor } | null>(null);
  if (!cwaDetectedStations.length) cwaGridAnchorRef.current = null;
  else if (cwaGridAnchorRef.current?.sessionKey !== props.detectionSessionKey) {
    const strongest = [...cwaDetectedStations]
      .sort((a, b) => (props.cwaRanks[b.id] ?? 0) - (props.cwaRanks[a.id] ?? 0))[0];
    cwaGridAnchorRef.current = { sessionKey: props.detectionSessionKey, anchor: niedGridAnchor(strongest) };
  }
  const cwaDetectionCells = buildNiedDetectionGridCells(
    props.cwaStations,
    props.cwaDetectionStationIds,
    props.cwaRanks,
    cwaGridAnchorRef.current?.anchor,
  );
  const blinkOn = Math.floor(props.blinkNow / 450) % 2 === 0;
  const labeledStationIds = useMemo(() => new Set(
    [...displayedNiedResponses]
      .filter((station) => {
        const rank = props.replayRanks === null
          ? niedLevelRank(niedCharToLevel(props.niedFrame?.intensity[station.index]))
          : props.replayRanks?.[station.id] ?? 0;
        return rank >= 0.5;
      })
      .sort((a, b) => {
        const rank = (station: SeismicStation) => props.replayRanks === null
          ? niedLevelRank(niedCharToLevel(props.niedFrame?.intensity[station.index]))
          : props.replayRanks?.[station.id] ?? 0;
        return rank(b) - rank(a);
      })
      .slice(0, responseLabelBudget)
      .map((station) => station.id),
  ), [displayedNiedResponses, props.niedFrame, props.replayRanks, responseLabelBudget]);
  const globalResponseStationById = useMemo(
    () => new Map(props.globalResponseStations.map((station) => [station.id, station])),
    [props.globalResponseStations],
  );
  const respondingGlobalStations = useMemo(() => {
    const displayed = props.globalArrivedStationIds
      .map((id) => globalResponseStationById.get(id))
      .filter((station): station is GlobalSeismicStation => Boolean(station));
    if (props.selectedStation && isGlobalStation(props.selectedStation) && !isCwaStation(props.selectedStation)
      && !displayed.some((station) => station.id === props.selectedStation?.id)) displayed.push(props.selectedStation);
    return displayed;
  }, [globalResponseStationById, props.globalArrivedStationIds, props.selectedStation]);
  const displayedGlobalResponses = useMemo(
    () => sampleStableStationMarkers(respondingGlobalStations, Math.max(6, responseBudget)),
    [respondingGlobalStations, responseBudget],
  );
  const cwaStationById = useMemo(
    () => new Map(props.cwaStations.map((station) => [station.id, station])),
    [props.cwaStations],
  );
  const displayedCwaResponses = useMemo(() => {
    const arrived = props.cwaArrivedStationIds
      .map((id) => cwaStationById.get(id))
      .filter((station): station is GlobalSeismicStation => Boolean(station));
    const displayed = sampleStableStationMarkers(arrived, Math.max(6, responseBudget));
    if (props.selectedStation && isCwaStation(props.selectedStation)
      && !displayed.some((station) => station.id === props.selectedStation?.id)) displayed.push(props.selectedStation);
    return displayed;
  }, [cwaStationById, props.cwaArrivedStationIds, props.selectedStation, responseBudget]);
  const displayedKmaResponses = useMemo(() => {
    const stationById = new Map(props.kmaStations.map((station) => [station.id, station]));
    const responding = props.kmaReplayRanks === null
      ? props.kmaStations.filter((station) => Math.max(0, Number(props.kmaValues[station.index] ?? 0)) >= 0.25)
      : props.kmaArrivedStationIds
        .map((id) => stationById.get(id))
        .filter((station): station is KmaStation => Boolean(station));
    const displayed = sampleStableStationMarkers(responding, Math.max(6, responseBudget));
    if (props.selectedStation && isKmaStation(props.selectedStation)
      && !displayed.some((station) => station.id === props.selectedStation?.id)) displayed.push(props.selectedStation);
    return displayed;
  }, [props.kmaArrivedStationIds, props.kmaReplayRanks, props.kmaStations, props.kmaValues, props.selectedStation, responseBudget]);
  const displayedOceanResponses = useMemo(() => {
    const responding = props.oceanStations.filter((station) => {
      const rank = props.oceanRanks[station.id] ?? 0;
      const measured = props.oceanMode === "measured" && Object.prototype.hasOwnProperty.call(props.oceanRanks, station.id);
      return measured || rank >= 0.25 || props.selectedStation?.id === station.id;
    });
    const displayed = sampleStableStationMarkers(responding, Math.max(6, responseBudget));
    if (props.selectedStation && isOceanStation(props.selectedStation)
      && !displayed.some((station) => station.id === props.selectedStation?.id)) displayed.push(props.selectedStation);
    return displayed;
  }, [props.oceanMode, props.oceanRanks, props.oceanStations, props.selectedStation, responseBudget]);
  const labeledGlobalStationIds = useMemo(() => new Set(
    [...displayedGlobalResponses]
      .filter((station) => (props.globalRanks[station.id] ?? 0) >= 1)
      .sort((a, b) => (props.globalRanks[b.id] ?? 0) - (props.globalRanks[a.id] ?? 0))
      .slice(0, responseLabelBudget)
      .map((station) => station.id),
  ), [displayedGlobalResponses, props.globalRanks, responseLabelBudget]);
  const labeledCwaStationIds = useMemo(() => new Set(
    [...displayedCwaResponses]
      .filter((station) => (props.cwaRanks[station.id] ?? 0) >= 0.5)
      .sort((a, b) => (props.cwaRanks[b.id] ?? 0) - (props.cwaRanks[a.id] ?? 0))
      .slice(0, responseLabelBudget)
      .map((station) => station.id),
  ), [displayedCwaResponses, props.cwaRanks, responseLabelBudget]);
  const labeledKmaStationIds = useMemo(() => new Set(
    [...displayedKmaResponses]
      .filter((station) => {
        const rank = props.kmaReplayRanks === null
          ? Number(props.kmaValues[station.index] ?? 0)
          : Number(props.kmaReplayRanks[station.id] ?? 0);
        return rank >= 1;
      })
      .sort((a, b) => {
        const rank = (station: KmaStation) => props.kmaReplayRanks === null
          ? Number(props.kmaValues[station.index] ?? 0)
          : Number(props.kmaReplayRanks[station.id] ?? 0);
        return rank(b) - rank(a);
      })
      .slice(0, responseLabelBudget)
      .map((station) => station.id),
  ), [displayedKmaResponses, props.kmaReplayRanks, props.kmaValues, responseLabelBudget]);
  const labeledOceanStationIds = useMemo(() => new Set(
    [...displayedOceanResponses]
      .filter((station) => props.oceanMode === "measured"
        ? Object.prototype.hasOwnProperty.call(props.oceanRanks, station.id)
        : (props.oceanRanks[station.id] ?? 0) >= 1)
      .sort((a, b) => (props.oceanRanks[b.id] ?? 0) - (props.oceanRanks[a.id] ?? 0))
      .slice(0, responseLabelBudget)
      .map((station) => station.id),
  ), [displayedOceanResponses, props.oceanMode, props.oceanRanks, responseLabelBudget]);
  /* The canvas layers below retain the complete response sets. These small,
   * stable SVG subsets exist only for hit targets, popups and a few labels. */
  const liveGlobalSelectionStations = useMemo(() => [
    ...(props.showGlobal ? props.globalStations : []),
    ...(props.showWaveform ? props.waveformStations : []),
  ], [props.globalStations, props.showGlobal, props.showWaveform, props.waveformStations]);
  const globalSelectionSource = props.replayMode ? respondingGlobalStations : liveGlobalSelectionStations;
  const selectableGlobalStations = useMemo(
    () => sampleGlobalStationsForMap(globalSelectionSource, 420),
    [globalSelectionSource],
  );
  const cwaSelectionSource = props.replayMode ? displayedCwaResponses : props.cwaStations;
  const selectableCwaStations = useMemo(
    () => sampleGlobalStationsForMap(cwaSelectionSource, 90),
    [cwaSelectionSource],
  );
  const globalResponsePoints = useMemo<StationCanvasPoint[]>(() => sampleStableStationMarkers(respondingGlobalStations, Math.max(12, responseBudget * 2)).map((station) => {
    const rank = props.globalRanks[station.id] ?? 0;
    return {
      latitude: station.latitude,
      longitude: station.longitude,
      color: fdsnWaveformStationColor(rank),
      // Keep only three geometry styles. Using the raw fractional rank here
      // created hundreds of Canvas batches and effectively one draw call per
      // station during large-event replay.
      radius: rank >= 7 ? 5.2 : rank >= 4 ? 4.8 : 4.4,
      opacity: 0.9,
      strokeColor: "#ffffff",
      strokeWidth: 0.8,
    };
  }), [props.globalRanks, respondingGlobalStations, responseBudget]);
  const cwaResponsePoints = useMemo<StationCanvasPoint[]>(() => sampleStableStationMarkers(props.cwaStations
    .filter((station) => cwaArrivedStationSet.has(station.id))
    , Math.max(12, responseBudget * 2)).map((station) => {
      const rank = props.cwaRanks[station.id] ?? 0;
      return {
        latitude: station.latitude,
        longitude: station.longitude,
        color: rank >= 0.25 ? jmaShindoColor(rank) : FDSN_PROVIDER_COLORS.cwa,
        radius: 4.1,
        opacity: 0.96,
        strokeColor: "#ffffff",
        strokeWidth: 1,
      };
    }), [props.cwaRanks, props.cwaStations, props.cwaArrivedStationIds, responseBudget]);
  const selectableHitStations = useMemo(() => {
    if (props.interactionMode !== "select") return [];
    const stations = new Map<string, SelectableStation>();
    const add = (items: SelectableStation[]) => items.forEach((station) => stations.set(station.id, station));
    if (props.showCwa && layerComplexity >= 2 && baseLayerStage >= 1) add(selectableCwaStations);
    if ((props.showGlobal || props.showWaveform) && layerComplexity >= 3 && baseLayerStage >= 2) add(selectableGlobalStations);
    if (layerComplexity >= 3 && baseLayerStage >= 3) add(sampleStationMarkers(props.oceanStations.filter((station) => (
      station.network === "S-net" ? props.showOcean : props.showOtherOcean
    )), Math.max(12, baseStationBudget)));
    if (props.showKma && layerComplexity >= 4 && baseLayerStage >= 4) add(sampleStationMarkers(props.kmaStations, Math.max(12, baseStationBudget)));
    if (props.showNied && layerComplexity >= 5 && baseLayerStage >= 5) add(sampleStationMarkers(props.niedStations, Math.max(12, baseStationBudget)));
    if (props.showCenc && layerComplexity >= 2 && props.cencReport) add(sampleStationMarkers(props.cencReport.stations, Math.max(12, responseBudget)));
    return [...stations.values()];
  }, [
    baseLayerStage,
    baseStationBudget,
    layerComplexity,
    props.cencReport,
    props.interactionMode,
    props.kmaStations,
    props.niedStations,
    props.oceanStations,
    props.replayMode,
    props.showCenc,
    props.showCwa,
    props.showGlobal,
    props.showKma,
    props.showNied,
    props.showOcean,
    props.showOtherOcean,
    props.showWaveform,
    responseBudget,
    selectableCwaStations,
    selectableGlobalStations,
  ]);
  const localRegionKey = props.localRegions.features
    .map((feature) => `${feature.properties.code ?? feature.properties.name}:${feature.properties.rank}:${feature.properties.arrived ? 1 : 0}:${Math.floor(feature.properties.currentRank ?? 0)}`)
    .join("|");
  return (
    <MapContainer center={[36.2, 133.2]} zoom={5} minZoom={2} maxZoom={13} worldCopyJump preferCanvas scrollWheelZoom zoomControl={false} className={`seismic-map seismic-map--${props.theme} seismic-map--${props.interactionMode}`}>
      <SeismicMapThemeClass theme={props.theme} />
      <SeismicMapInteractionBehavior mode={props.interactionMode} />
      <SeismicMapResizeSync />
      <TileLayer key={props.theme} url={layer.url} attribution={layer.attribution} maxZoom={19} />
      <Pane name="seismic-impact-local" style={{ zIndex: 310, pointerEvents: "none" }}>
        {props.showLocalImpact && layerComplexity >= 3 && props.localRegions.features.length > 0 && <LeafletGeoJSON key={`local:${props.selectedEvent?.id}:${props.selectedEvent?.serial}:${localRegionKey}`} data={props.localRegions} interactive={false} style={(feature) => { const rank = Number(feature?.properties?.rank ?? 0); const currentRank = Number(feature?.properties?.currentRank ?? 0); const arrived = Boolean(feature?.properties?.arrived); const scale = feature?.properties?.scale === "intensity" ? "intensity" : "shindo"; const displayRank = arrived ? Math.max(1, currentRank) : rank; const color = scale === "intensity" ? mmiIntensityColor(displayRank) : jmaShindoColor(displayRank); const contour = Boolean(feature?.properties?.contour); return { color, fillColor: color, weight: arrived ? contour ? 1.8 : 1.45 : 0.8, opacity: arrived ? 0.96 : 0.66, fillOpacity: arrived ? contour ? 0.28 : 0.44 : contour ? 0.08 : 0.16, dashArray: arrived ? undefined : "4 3" }; }} />}
      </Pane>
      <Pane name="seismic-impact-official" style={{ zIndex: 320, pointerEvents: "none" }}>
        {props.showOfficialImpact && props.officialRegions.features.length > 0 && <LeafletGeoJSON key={`official:${props.selectedEvent?.id}:${props.selectedEvent?.serial}`} data={props.officialRegions} interactive={false} style={(feature) => { const rank = Number(feature?.properties?.rank ?? 0); const scale = feature?.properties?.scale === "intensity" ? "intensity" : "shindo"; const color = scale === "intensity" ? mmiIntensityColor(rank) : jmaShindoColor(rank); return { color: "#ffffff", fillColor: color, weight: 1.5, opacity: 0.94, fillOpacity: 0.56 }; }} />}
      </Pane>
      <Pane name="seismic-global-faults" style={{ zIndex: 330, pointerEvents: "none" }}>
        {props.showGlobalFaults && layerComplexity >= 5 && props.globalFaults && <LeafletGeoJSON
          data={props.globalFaults}
          interactive={false}
          style={(feature) => {
            const level = Number(feature?.properties?.level ?? 1);
            return {
              color: String(feature?.properties?.color ?? "#22c55e"),
              weight: level >= 4 ? 1.8 : level === 3 ? 1.5 : 1.1,
              opacity: level >= 3 ? 0.9 : 0.68,
              dashArray: level === 1 ? "3 4" : undefined,
              lineCap: "round",
              lineJoin: "round",
            };
          }}
        />}
      </Pane>
      <JshisMapLayers
        location={props.jshisLocation}
        fault={props.jshisFault}
        showHazard={props.showJshisHazard && layerComplexity >= 4}
        showSite={props.showJshisSite && layerComplexity >= 4}
        showFault={props.showJshisFault && layerComplexity >= 4}
      />
      <ShakeMapContourLayer visible={props.showShakeMap} shakeMap={props.shakeMap} contours={props.shakeMapContours} />
      <Pane name="seismic-wave-pane" style={{ zIndex: 390, pointerEvents: "none" }}>
        {props.waveEvent && props.waveEvent.hypocenterKnown !== false && !props.waveEvent.cancelled && <>
          {pRadius > 0 && <Circle center={[props.waveEvent.latitude, props.waveEvent.longitude]} radius={pRadius * 1000} interactive={false} pathOptions={{ color: "#38bdf8", weight: 2, opacity: 0.8, fillOpacity: 0.03 }} />}
          {sRadius > 0 && <Circle center={[props.waveEvent.latitude, props.waveEvent.longitude]} radius={sRadius * 1000} interactive={false} pathOptions={{ color: "#f97316", weight: 3, opacity: 0.88, fillOpacity: 0.04 }} />}
        </>}
      </Pane>
      <Pane name="seismic-grid-pane" style={{ zIndex: 410, pointerEvents: "none" }}>
        {layerComplexity >= 3 && detectionCells.map((cell) => <Rectangle key={`${props.detectionSessionKey}:${cell.id}`} bounds={cell.bounds} interactive={false} pathOptions={{ color: NIED_GRID_COLORS[cell.color], weight: blinkOn ? 2.8 : 1.6, opacity: blinkOn ? 1 : 0.28, dashArray: props.detectionMode === "replay" ? "7 5" : undefined, fill: false }} />)}
        {layerComplexity >= 3 && props.showKma && kmaDetectionCells.map((cell) => <Rectangle key={`kma:${props.detectionSessionKey}:${cell.id}`} bounds={cell.bounds} interactive={false} pathOptions={{ color: NIED_GRID_COLORS[cell.color], weight: blinkOn ? 2.5 : 1.5, opacity: blinkOn ? 0.95 : 0.3, dashArray: "8 4", fill: false }} />)}
        {layerComplexity >= 3 && props.showCwa && cwaDetectionCells.map((cell) => <Rectangle key={`cwa:${props.detectionSessionKey}:${cell.id}`} bounds={cell.bounds} interactive={false} pathOptions={{ color: NIED_GRID_COLORS[cell.color], weight: blinkOn ? 2.4 : 1.5, opacity: blinkOn ? 0.92 : 0.32, dashArray: "3 4", fill: false }} />)}
      </Pane>
      <Pane name="seismic-jma-tsunami-pane" style={{ zIndex: 430, pointerEvents: "none" }}>
        {props.showTsunami && props.tsunamiRegions.features.length > 0 && <LeafletGeoJSON
          key={props.tsunamiRegions.features.map((feature) => `${feature.properties.code}:${feature.properties.level}`).join("|")}
          data={props.tsunamiRegions}
          interactive={false}
          style={(feature) => jmaTsunamiLineStyle(Number(feature?.properties?.level ?? 1))}
        />}
      </Pane>
      <Pane name="seismic-event-pane" style={{ zIndex: 490 }}>
        {props.selectedEvent && props.selectedEvent.hypocenterKnown !== false && <Marker
          position={[props.selectedEvent.latitude, props.selectedEvent.longitude]}
          icon={hypocenterMapIcon(props.selectedEvent.cancelled ? "cancelled" : props.selectedEvent.relay === "Catalogue" ? "catalogue" : "eew")}
          zIndexOffset={1200}
          riseOnHover
          alt={`${props.selectedEvent.place} 震中`}
        >
          <Popup><strong>{props.selectedEvent.source} {props.selectedEvent.title}</strong><br />{props.selectedEvent.place}<br />M {props.selectedEvent.magnitude?.toFixed(1) ?? "--"}</Popup>
        </Marker>}
        {props.selectedReport && <Marker position={[props.selectedReport.latitude, props.selectedReport.longitude]} icon={hypocenterMapIcon("catalogue")} zIndexOffset={1100} riseOnHover alt={`${props.selectedReport.place} 机构报告震中`}>
          <Popup><strong>{EARTHQUAKE_SOURCE_LABELS[props.selectedReport.source]} 机构报告</strong><br />{props.selectedReport.place}<br />{formatMagnitudeType(props.selectedReport.magnitudeType)} {props.selectedReport.magnitude.toFixed(1)}<br /><a href={props.selectedReport.url} target="_blank" rel="noreferrer">打开机构原文</a></Popup>
        </Marker>}
      </Pane>
      <Pane name="seismic-user-location-pane" style={{ zIndex: 455, pointerEvents: "none" }}>
        {props.warningLocation && <CircleMarker
          center={[props.warningLocation.lat, props.warningLocation.lon]}
          radius={7}
          interactive={false}
          pathOptions={{ color: "#ffffff", fillColor: "#ef4444", weight: 2.4, opacity: 1, fillOpacity: 0.94 }}
        >
          <LeafletTooltip permanent direction="top" offset={[0, -8]} className="seismic-user-location-label">
            定位点 · {props.warningLocation.name}
          </LeafletTooltip>
        </CircleMarker>}
      </Pane>
      <Pane name="seismic-wni-camera-pane" style={{ zIndex: props.interactionMode === "select" ? 480 : 445 }}>
        {props.showWniCameras && props.wniCameras.map((camera) => {
          const highlighted = camera.id === props.highlightedWniCameraId;
          return <CircleMarker
            key={camera.id}
            center={[camera.latitude, camera.longitude]}
            radius={highlighted ? 7 : props.interactionMode === "select" ? 6 : 4.2}
            pathOptions={{
              color: highlighted ? "#fef3c7" : "#cffafe",
              fillColor: highlighted ? "#f59e0b" : "#0891b2",
              weight: highlighted ? 2.4 : 1.4,
              opacity: 0.96,
              fillOpacity: 0.9,
            }}
          >
            <LeafletTooltip direction="top" offset={[0, -4]}>WNI现场摄像头 · {camera.name}</LeafletTooltip>
            <Popup minWidth={220} maxWidth={260}>
              <article className="wni-camera-popup">
                <header><Video size={15} /><span><strong>WNI现场摄像头</strong><small>{camera.name}</small></span></header>
                <img src={camera.imageUrl} alt={`${camera.name} 最新现场画面`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
                <footer><span>{camera.prefecture || "日本"} · 最新静态画面</span><a href={camera.detailUrl} target="_blank" rel="noreferrer">打开 WNI 详情<ExternalLink size={11} /></a></footer>
              </article>
            </Popup>
          </CircleMarker>;
        })}
      </Pane>
      <Pane name="seismic-estimate-pane" style={{ zIndex: 450, pointerEvents: "none" }}>
        {props.estimate && <CircleMarker center={[props.estimate.latitude, props.estimate.longitude]} radius={7} interactive={false} pathOptions={{ color: "#fef08a", fillColor: "#a855f7", weight: 2, fillOpacity: 0.9 }}>
          <LeafletTooltip permanent direction="bottom" offset={[0, 9]} className="seismic-estimate-tooltip"><strong>{props.estimateMode === "replay" ? "回放反演" : "NIED 本地推算"}</strong><span>{props.estimate.latitude.toFixed(3)}, {props.estimate.longitude.toFixed(3)} · 深 {props.estimate.depthKm.toFixed(0)} km</span></LeafletTooltip>
        </CircleMarker>}
      </Pane>
      <PagerCityMapLayer visible={props.showPagerCities && layerComplexity >= 5} cities={props.pagerCities} />
      <CwaStationBaseLayer stations={props.cwaStations} maxMarkers={baseStationBudget} show={!props.replayMode && props.showCwa && layerComplexity >= 2 && baseLayerStage >= 1} onSelectStation={props.onSelectStation} />
      <GnssStationLayer stations={props.gnssStations} show={props.showGnss && layerComplexity >= 4} selectMode={props.interactionMode === "select"} />
      <PalertStationLayer stations={props.palertStations} show={props.showPalert && layerComplexity >= 3} selectMode={props.interactionMode === "select"} />
      <GlobalStationBaseLayer stations={props.globalStations} maxMarkers={baseStationBudget} show={!props.replayMode && props.showGlobal && layerComplexity >= 3 && baseLayerStage >= 2} onSelectStation={props.onSelectStation} />
      <WaveformStationBaseLayer stations={props.waveformStations} maxMarkers={baseStationBudget} verifiedStationIds={props.verifiedWaveformStationIds} show={!props.replayMode && props.showWaveform && layerComplexity >= 3 && baseLayerStage >= 2} onSelectStation={props.onSelectStation} />
      <OceanStationBaseLayer stations={props.oceanStations} showSnet={props.showOcean && layerComplexity >= 3 && baseLayerStage >= 3} showOther={props.showOtherOcean && layerComplexity >= 4 && baseLayerStage >= 3} onSelectStation={props.onSelectStation} />
      <KmaStationBaseLayer stations={props.kmaStations} show={props.showKma && layerComplexity >= 4 && baseLayerStage >= 4} onSelectStation={props.onSelectStation} />
      <NiedStationBaseLayer stations={props.niedStations} show={props.showNied && layerComplexity >= 5 && baseLayerStage >= 5} onSelectStation={props.onSelectStation} />
      <Pane name="seismic-waveform-response-pane" className="seismic-waveform-response-pane" style={{ zIndex: 471 }}>
        {layerComplexity >= 3 && (props.showGlobal || props.showWaveform) && <>
          <StationCanvasLayer paneName="seismic-waveform-response-pane" points={globalResponsePoints} />
          <WaveformStationResponseMarkers
          stations={displayedGlobalResponses}
          ranks={props.globalRanks}
          labeledStationIds={labeledGlobalStationIds}
          selectedStationId={props.selectedStation && isGlobalStation(props.selectedStation) && props.selectedStation.providerId !== "cwa" ? props.selectedStation.id : null}
          onSelectStation={props.onSelectStation}
          />
        </>}
      </Pane>
      <Pane name="seismic-station-response-pane" style={{ zIndex: 470 }}>
        {layerComplexity >= 2 && props.showCwa && <StationCanvasLayer paneName="seismic-station-response-pane" points={cwaResponsePoints} />}
        {layerComplexity >= 4 && props.showGnss && <GnssResponseMarkers stations={props.gnssStations} ranks={props.gnssRanks} mode={props.gnssMode} maxLabels={responseLabelBudget} />}
        {layerComplexity >= 2 && props.showCwa && displayedCwaResponses.map((station) => {
          const selected = props.selectedStation?.id === station.id;
          const rank = props.cwaRanks[station.id] ?? 0;
          const active = rank >= 0.25;
          const color = active ? jmaShindoColor(rank) : FDSN_PROVIDER_COLORS.cwa;
          return <Fragment key={`response:${station.id}`}>
            <CircleMarker center={[station.latitude, station.longitude]} radius={selected ? 6 : blinkOn ? 5.2 : 4.4} pathOptions={{ color: "#ffffff", fillColor: color, weight: selected ? 2.2 : 1.6, opacity: 0.96, fillOpacity: 0.98 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
              {selected && <Popup><strong>CWA CWASN {station.stationCode}</strong><br />{station.stationName}<br />本地传播估算震度 {jmaShindoLabel(rank)} · {rank.toFixed(1)}<br /><a href="https://gdms.cwa.gov.tw/map.php" target="_blank" rel="noreferrer">打开 CWA GDMS</a></Popup>}
            </CircleMarker>
            {active && labeledCwaStationIds.has(station.id) && <StationValueMarker latitude={station.latitude} longitude={station.longitude} rank={rank} scale="shindo" selected={selected} label={`CWA ${station.stationCode} 震度 ${jmaShindoLabel(rank)}`} />}
          </Fragment>;
        })}
        {layerComplexity >= 3 && props.showNied && displayedNiedResponses.map((station) => {
          const level = niedCharToLevel(props.niedFrame?.intensity[station.index]);
          const replayRank = props.replayRanks?.[station.id];
          const rank = props.replayRanks === null ? niedLevelRank(level) : replayRank ?? 0;
          const detected = detectionStationSet.has(station.id);
          const activeRank = detected ? props.detectionRanks[station.id] ?? rank : null;
          const color = niedStationDisplayColor(props.replayRanks === null ? level : 0, activeRank);
          const selected = props.selectedStation?.id === station.id;
          return <Fragment key={`response:${station.id}`}>
            <CircleMarker center={[station.latitude, station.longitude]} radius={selected ? 6 : detected ? blinkOn ? 5.2 : 4.4 : rank >= 1 ? 4 : 3.2} pathOptions={{ color: selected || detected ? "#ffffff" : color, fillColor: color, weight: selected ? 2.4 : detected ? blinkOn ? 2.2 : 1.1 : 0.8, opacity: detected ? 1 : 0.94, fillOpacity: detected ? 1 : rank >= 1 ? 0.94 : 0.86 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
              {selected && <Popup><strong>{station.stationName}</strong><br />{station.network} {station.stationCode}<br />{props.replayRanks === null ? `实时震度 ${niedLevelLabel(level)}` : `回放模拟震度 ${rank.toFixed(1)}`}</Popup>}
            </CircleMarker>
            {labeledStationIds.has(station.id) && <StationValueMarker latitude={station.latitude} longitude={station.longitude} rank={rank} scale="shindo" selected={selected} label={`${station.network} ${station.stationCode} 震度 ${jmaShindoLabel(rank)}`} />}
          </Fragment>;
        })}
        {layerComplexity >= 3 && props.showKma && displayedKmaResponses.map((station) => {
          const rank = props.kmaReplayRanks === null
            ? Math.max(0, Number(props.kmaValues[station.index] ?? 0))
            : Math.max(0, Number(props.kmaReplayRanks[station.id] ?? 0));
          const active = rank >= 0.25;
          const selected = props.selectedStation?.id === station.id;
          const color = mmiIntensityColor(rank);
          return <Fragment key={`response:${station.id}`}>
            <CircleMarker center={[station.latitude, station.longitude]} radius={selected ? 6 : active ? blinkOn ? 5.2 : 4.4 : 3.2} pathOptions={{ color: "#ffffff", fillColor: color, weight: selected ? 2 : 1.5, fillOpacity: rank >= 1 ? 0.94 : 0.82 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>
              {selected && <Popup><strong>{station.stationName}</strong><br />KMA-PEWS {props.kmaReplayRanks === null ? "官方实时" : "回放模拟"}测站<br />烈度 {intensityRomanLabel(rank)} · MMI {rank.toFixed(1)}</Popup>}
            </CircleMarker>
            {active && labeledKmaStationIds.has(station.id) && <StationValueMarker latitude={station.latitude} longitude={station.longitude} rank={rank} scale="intensity" selected={selected} label={`KMA ${station.stationCode} MMI ${intensityRomanLabel(rank)}`} />}
          </Fragment>;
        })}
        {layerComplexity >= 3 && displayedOceanResponses.filter((station) => (
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
            {labeledOceanStationIds.has(station.id) && (measured || active) && <LeafletTooltip permanent direction="right" offset={[10, 0]} className="ocean-station-side-label">{displayRankLabel(rank)}</LeafletTooltip>}
          </CircleMarker>;
        })}
        {layerComplexity >= 2 && props.showCenc && props.cencReport && <>
          <Marker position={[props.cencReport.latitude, props.cencReport.longitude]} icon={hypocenterMapIcon("catalogue")} zIndexOffset={1100} riseOnHover alt={`${props.cencReport.place} CENC 仪器烈度报告震中`}><Popup><strong>CENC 仪器烈度报告</strong><br />{props.cencReport.place}<br />M {props.cencReport.magnitude?.toFixed(1) ?? "--"} · {props.cencReport.stationMetrics.length} 站报告 / {props.cencReport.stations.length} 站有坐标</Popup></Marker>
          {props.cencReport.stations.map((station) => { const selected = props.selectedStation?.id === station.id; const color = cencIntensityColor(station.intensity); return <Fragment key={station.id}><CircleMarker center={[station.latitude, station.longitude]} radius={selected ? 7 : Math.max(3, Math.min(6, station.intensity / 1.8))} pathOptions={{ color: selected ? "#ffffff" : color, fillColor: color, weight: selected ? 2 : 0.8, fillOpacity: 0.92 }} eventHandlers={{ click: () => props.onSelectStation(station) }}>{selected && <Popup><strong>{station.stationName} ({station.stationCode})</strong><br />仪器烈度 {intensityRomanLabel(station.intensity)} · {station.intensity.toFixed(1)}<br />PGA {station.pgaGal?.toFixed(1) ?? "--"} gal · PGV {station.pgvCms?.toFixed(1) ?? "--"} cm/s</Popup>}</CircleMarker><StationValueMarker latitude={station.latitude} longitude={station.longitude} rank={station.intensity} scale="intensity" selected={selected} label={`CENC ${station.stationCode} MMI ${intensityRomanLabel(station.intensity)}`} /></Fragment>; })}
        </>}
      </Pane>
      <Pane name="seismic-station-hit-pane" className="seismic-station-hit-pane" style={{ zIndex: 469 }}>
        {selectableHitStations.map((station) => <CircleMarker
          key={`hit:${station.id}`}
          center={[station.latitude, station.longitude]}
          radius={7}
          pathOptions={{ color: "transparent", fillColor: "#ffffff", weight: 0, opacity: 0, fillOpacity: 0.001 }}
          eventHandlers={{ click: () => props.onSelectStation(station) }}
        >
          <LeafletTooltip direction="top" offset={[0, -7]}><strong>{station.stationName}</strong><br />{station.stationCode} · 点击查看测站</LeafletTooltip>
        </CircleMarker>)}
      </Pane>
      <SeismicMapFocus target={props.focusTarget} />
      <SeismicMapViewport onChange={props.onViewportChange} />
      <ZoomControl position="topright" />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
  );
});

export function SeismicLiveDashboard({ onToggleSidebar, onOpenGlobal, userStation }: SeismicLiveDashboardProps) {
  const [panelTab, setPanelTab] = usePersistentState<PanelTab>("seismic-panel-tab", "station");
  const [bottomTab, setBottomTab] = usePersistentState<BottomTab>("seismic-bottom-tab", "warnings");
  const [warningOverlayTab, setWarningOverlayTab] = useState<WarningOverlayTab>("latest");
  const [mapTheme, setMapTheme] = usePersistentState<SeismicMapTheme>("seismic-map-theme", "dark");
  const [mapInteractionMode, setMapInteractionMode] = usePersistentState<SeismicMapInteractionMode>("seismic-map-interaction-mode", "drag");
  const [sidePanelWidth, setSidePanelWidth] = usePersistentState("seismic-side-panel-width", 410);
  const [mapPanelHeight, setMapPanelHeight] = usePersistentState("seismic-map-panel-height", 650);
  const [mapLayerComplexity, setMapLayerComplexity] = usePersistentState("seismic-map-layer-complexity", 4);
  const [monitorDock] = usePersistentState<MonitorDock>("seismic-monitor-dock", "left");
  const [monitorWidgetDocks, setMonitorWidgetDocks] = usePersistentState<Partial<MonitorWidgetDockMap>>(
    "seismic-monitor-widget-docks-v1",
    defaultMonitorWidgetDocks(normalizeMonitorDock(monitorDock)),
  );
  const [monitorScale, setMonitorScale] = usePersistentState("seismic-monitor-scale", 1);
  const [draggingMonitorWidget, setDraggingMonitorWidget] = useState<MonitorWidgetId | null>(null);
  const [monitorDropTarget, setMonitorDropTarget] = useState<MonitorDock>("left");
  const [autoSelectWaveformStation, setAutoSelectWaveformStation] = usePersistentState("seismic-auto-select-waveform-station", true);
  const [autoOpenWniMonitor, setAutoOpenWniMonitor] = usePersistentState("seismic-auto-open-wni-monitor", true);
  const [enabledEewSources, setEnabledEewSources] = usePersistentState<LiveEewSource[]>("seismic-enabled-eew-sources", [...LIVE_EEW_SOURCE_ORDER]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const primaryGridRef = useRef<HTMLElement | null>(null);
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const monitorOverlayRef = useRef<HTMLDivElement | null>(null);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const monitorPointerCleanupRef = useRef<(() => void) | null>(null);
  const monitorDropTargetRef = useRef<MonitorDock>("left");
  const [showNied, setShowNied] = usePersistentState("seismic-show-nied", true);
  const [showKma, setShowKma] = usePersistentState("seismic-show-kma", true);
  const [showOcean, setShowOcean] = usePersistentState("seismic-show-ocean", true);
  const [showOtherOcean, setShowOtherOcean] = usePersistentState("seismic-show-other-ocean", false);
  const [showCenc, setShowCenc] = usePersistentState("seismic-show-cenc-intensity", true);
  const [showGlobalStations, setShowGlobalStations] = usePersistentState("seismic-show-global-fdsn", true);
  const [showWaveformStations, setShowWaveformStations] = usePersistentState("seismic-show-waveform-fdsn", true);
  const [autoLocateGlobalEarthquakes, setAutoLocateGlobalEarthquakes] = usePersistentState("seismic-auto-locate-global-earthquakes", true);
  const [autoLocateMagnitude, setAutoLocateMagnitude] = usePersistentState("seismic-auto-locate-global-magnitude", 5);
  const [receiveMagnitude, setReceiveMagnitude] = usePersistentState("seismic-receive-global-magnitude", 1);
  const [movieModeEnabled, setMovieModeEnabled] = usePersistentState("seismic-movie-mode-enabled", false);
  const [movieCameraMode, setMovieCameraMode] = usePersistentState<MovieCameraMode>("seismic-movie-camera-mode", "locked");
  const [showCwaStations, setShowCwaStations] = usePersistentState("seismic-show-cwa-cwasn", true);
  const [showGnssStations, setShowGnssStations] = usePersistentState("seismic-show-china-gnss", false);
  const [showPalertStations, setShowPalertStations] = usePersistentState("seismic-show-palert", true);
  const [showWniCameras, setShowWniCameras] = usePersistentState("seismic-show-wni-cameras", true);
  const [showGlobalFaults, setShowGlobalFaults] = usePersistentState("seismic-show-global-faults", false);
  const [showJshisHazard, setShowJshisHazard] = usePersistentState("seismic-show-jshis-hazard", true);
  const [showJshisSite, setShowJshisSite] = usePersistentState("seismic-show-jshis-site", true);
  const [showJshisFault, setShowJshisFault] = usePersistentState("seismic-show-jshis-fault", true);
  const [showUsgsShakeMap, setShowUsgsShakeMap] = usePersistentState("seismic-show-usgs-shakemap", true);
  const [shakeMapMmiLevels, setShakeMapMmiLevels] = usePersistentState<number[]>(
    "seismic-usgs-shakemap-mmi-levels",
    [...SHAKEMAP_MMI_LEVELS],
  );
  const [showPagerCities, setShowPagerCities] = usePersistentState("seismic-show-usgs-pager-cities", true);
  const [showJmaTsunami, setShowJmaTsunami] = usePersistentState("seismic-show-jma-tsunami", true);
  const [jmaTsunamiSoundEnabled, setJmaTsunamiSoundEnabled] = usePersistentState("seismic-jma-tsunami-sound-enabled", true);
  const [showLocalImpact, setShowLocalImpact] = usePersistentState("seismic-show-local-impact", true);
  const [showOfficialImpact, setShowOfficialImpact] = usePersistentState("seismic-show-official-impact", true);
  const [snetViewMode, setSnetViewMode] = usePersistentState<SnetViewMode>("seismic-snet-view-mode", "measured");
  const [niedSoundEnabled, setNiedSoundEnabled] = usePersistentState("seismic-nied-sound-enabled", true);
  const [seismicAlertSoundEnabled, setSeismicAlertSoundEnabled] = usePersistentState("seismic-alert-sound-enabled", true);
  const [niedSoundVolume, setNiedSoundVolume] = usePersistentState("seismic-nied-sound-volume", 70);
  const [niedSoundStatus, setNiedSoundStatus] = useState("等待最大震度上升");
  const [seismicSoundStatus, setSeismicSoundStatus] = useState("等待实时预警或回放报文");
  const [niedPreviewCue, setNiedPreviewCue] = useState<NiedSoundCue>("shindo2");
  const [soundPreviewAsset, setSoundPreviewAsset] = useState<SeismicSoundAssetId>("srev-detail");
  const [, setCustomSoundVersion] = useState(0);
  const [catalogue, setCatalogue] = useState<NiedStationCatalogue | null>(null);
  const [oceanCatalogue, setOceanCatalogue] = useState<OceanStationCatalogue | null>(null);
  const [snetSnapshot, setSnetSnapshot] = useState<SnetIntensitySnapshot | null>(null);
  const [snetState, setSnetState] = useState<SourceState>("connecting");
  const [selectedSnetEventId, setSelectedSnetEventId] = useState<string | null>(null);
  const [selectedSnetReportId, setSelectedSnetReportId] = useState<string | null>(null);
  const [jmaRegions, setJmaRegions] = useState<JmaRegionCollection | null>(null);
  const [eastAsiaImpactRegions, setEastAsiaImpactRegions] = useState<JmaRegionCollection | null>(null);
  const [jmaSeismicSites, setJmaSeismicSites] = useState<JmaSeismicSiteCatalogue | null>(null);
  const [tsunamiRegions, setTsunamiRegions] = useState<TsunamiRegionCollection | null>(null);
  const [jmaTsunami, setJmaTsunami] = useState<JmaTsunamiSnapshot | null>(null);
  const [jmaTsunamiHistory, setJmaTsunamiHistory] = useState<JmaTsunamiHistorySnapshot | null>(null);
  const [jmaTsunamiHistoryError, setJmaTsunamiHistoryError] = useState("");
  const [jmaTsunamiSoundStatus, setJmaTsunamiSoundStatus] = useState("等待海啸回放报文");
  const [jmaTsunamiState, setJmaTsunamiState] = useState<SourceState>("connecting");
  const [jmaTsunamiLatency, setJmaTsunamiLatency] = useState<number | null>(null);
  const [jmaTsunamiError, setJmaTsunamiError] = useState("");
  const [niedFrame, setNiedFrame] = useState<NiedRealtimeFrame | null>(null);
  const [niedState, setNiedState] = useState<SourceState>("connecting");
  const [kmaState, setKmaState] = useState<SourceState>("connecting");
  const [wolfxState, setWolfxState] = useState<SourceState>("connecting");
  const [fanState, setFanState] = useState<SourceState>("connecting");
  const [jmaIntensityState, setJmaIntensityState] = useState<SourceState>("connecting");
  const [earlyEstState, setEarlyEstState] = useState<SourceState>("connecting");
  const [globalQuakeState, setGlobalQuakeState] = useState<SourceState>("connecting");
  const [fallbackLatency, setFallbackLatency] = useState<number | null>(null);
  const [niedCatalogueError, setNiedCatalogueError] = useState("");
  const [oceanCatalogueError, setOceanCatalogueError] = useState("");
  const [jmaCatalogueError, setJmaCatalogueError] = useState("");
  const [regionalBoundaryError, setRegionalBoundaryError] = useState("");
  const [tsunamiCatalogueError, setTsunamiCatalogueError] = useState("");
  const [globalStationSnapshot, setGlobalStationSnapshot] = useState<GlobalStationSnapshot | null>(null);
  const [globalStationState, setGlobalStationState] = useState<SourceState>("connecting");
  const [globalStationError, setGlobalStationError] = useState("");
  const [waveformStationSnapshot, setWaveformStationSnapshot] = useState<GlobalStationSnapshot | null>(null);
  const [waveformStationState, setWaveformStationState] = useState<SourceState>("connecting");
  const [waveformStationError, setWaveformStationError] = useState("");
  const [cwaStationSnapshot, setCwaStationSnapshot] = useState<GlobalStationSnapshot | null>(null);
  const [cwaStationState, setCwaStationState] = useState<SourceState>("connecting");
  const [cwaStationError, setCwaStationError] = useState("");
  const [palertSnapshot, setPalertSnapshot] = useState<PalertSnapshot | null>(null);
  const [palertState, setPalertState] = useState<SourceState>("connecting");
  const [palertError, setPalertError] = useState("");
  const [wniCameras, setWniCameras] = useState<WniCamera[]>([]);
  const [wniCameraState, setWniCameraState] = useState<SourceState>("connecting");
  const [wniCameraError, setWniCameraError] = useState("");
  const [wniCameraReloadKey, setWniCameraReloadKey] = useState(0);
  const [globalFaults, setGlobalFaults] = useState<GlobalFaultCollection | null>(null);
  const [globalFaultError, setGlobalFaultError] = useState("");
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
  const [earlyEstLatency, setEarlyEstLatency] = useState<number | null>(null);
  const [globalQuakeLatency, setGlobalQuakeLatency] = useState<number | null>(null);
  const [jmaIntensityLatency, setJmaIntensityLatency] = useState<number | null>(null);
  const [cencLatency, setCencLatency] = useState<number | null>(null);
  const [cencProvider, setCencProvider] = useState("CENC 后端聚合");
  const [cencOfficialEgressMode, setCencOfficialEgressMode] = useState<"direct" | "http-proxy" | "config-error">("direct");
  const [eews, setEews] = useState<LiveEew[]>([]);
  const [eewHistory, setEewHistory] = usePersistentState<LiveEew[]>("seismic-eew-history", []);
  const [warningSourceFilter, setWarningSourceFilter] = usePersistentState<WarningSourceFilter>("seismic-warning-source-filter", "ALL");
  const [warningHistoryLimit, setWarningHistoryLimit] = useState(60);
  const [storedGlobalRefreshSeconds, setGlobalRefreshSeconds] = usePersistentState("earthquake-refresh-interval-seconds", 60);
  const [institutionReports, setInstitutionReports] = useState<EarthquakeEvent[]>([]);
  const [institutionMagnitudeBand, setInstitutionMagnitudeBand] = usePersistentState<InstitutionMagnitudeBand>("seismic-institution-magnitude-band", "all");
  const [institutionReportSources, setInstitutionReportSources] = usePersistentState<EarthquakeSourceId[]>("seismic-institution-report-sources", INSTITUTION_REPORT_SOURCE_ORDER);
  const [institutionReportLimit, setInstitutionReportLimit] = useState(INSTITUTION_REPORT_PAGE_SIZE);
  const [officialState, setOfficialState] = useState<SourceState>("connecting");
  const [officialLatency, setOfficialLatency] = useState<number | null>(null);
  const [cwaOfficialState, setCwaOfficialState] = useState<SourceState>("connecting");
  const [cwaOfficialLatency, setCwaOfficialLatency] = useState<number | null>(null);
  const [institutionSourceCount, setInstitutionSourceCount] = useState(0);
  const [selectedInstitutionReportId, setSelectedInstitutionReportId] = useState<string | null>(null);
  const [mechanismEvent, setMechanismEvent] = useState<EarthquakeEvent | null>(null);
  const [pagerEvent, setPagerEvent] = useState<EarthquakeEvent | null>(null);
  const [shakeMapReport, setShakeMapReport] = useState<EarthquakeEvent | null>(null);
  const [pagerReport, setPagerReport] = useState<EarthquakeEvent | null>(null);
  const [dyfiEvent, setDyfiEvent] = useState<EarthquakeEvent | null>(null);
  const [jshisTarget, setJshisTarget] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
  const [jshisLocation, setJshisLocation] = useState<JshisLocationSnapshot | null>(null);
  const [jshisFault, setJshisFault] = useState<JshisFaultShape | null>(null);
  const [usgsShakeMap, setUsgsShakeMap] = useState<EarthquakeShakeMap | null>(null);
  const [usgsShakeMapLoading, setUsgsShakeMapLoading] = useState(false);
  const [usgsShakeMapError, setUsgsShakeMapError] = useState("");
  const [usgsPager, setUsgsPager] = useState<EarthquakePager | null>(null);
  const [usgsPagerLoading, setUsgsPagerLoading] = useState(false);
  const [usgsPagerError, setUsgsPagerError] = useState("");
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
  const [verifiedWaveformStations, setVerifiedWaveformStations] = useState<FdsnStationDistance[]>([]);
  const [waveformProbeState, setWaveformProbeState] = useState<"idle" | "probing" | "ready" | "unavailable">("idle");
  const [waveformProbeAttempt, setWaveformProbeAttempt] = useState(0);
  const [waveformAutoPlayKey, setWaveformAutoPlayKey] = useState<string | null>(null);
  const [autoGlobalEventKey, setAutoGlobalEventKey] = useState<string | null>(null);
  const [movieCameraEventKey, setMovieCameraEventKey] = useState<string | null>(null);
  const [movieCameraEnteredAt, setMovieCameraEnteredAt] = useState(0);
  const [stationSearch, setStationSearch] = useState("");
  const [waveformStationSearch, setWaveformStationSearch] = useState("");
  const [history, setHistory] = useState<StationSample[]>([]);
  const [triggers, setTriggers] = useState<TriggerObservation[]>([]);
  const [niedDetection, setNiedDetection] = useState(() => blankDetection("NIED"));
  const [kmaDetection, setKmaDetection] = useState(() => blankDetection("KMA-PEWS"));
  const [replaySeconds, setReplaySeconds] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = usePersistentState<ReplaySpeed>("seismic-replay-speed", 60);
  const [clock, setClock] = useState(Date.now());
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const mapFocusSequence = useRef(0);
  const niedDetector = useRef<ShakeDetectorState | undefined>(undefined);
  const kmaDetector = useRef<ShakeDetectorState | undefined>(undefined);
  const previousNiedSoundState = useRef<{ sessionKey: string; index: number } | null>(null);
  const previousReplayNiedSoundState = useRef<{ sessionKey: string; index: number } | null>(null);
  const previousReplayTsunamiSoundState = useRef<{
    sessionKey: string;
    reportKey: string;
    playing: boolean;
    snapshot: { level: number; cancelled: boolean } | null;
  } | null>(null);
  const previousLiveTsunamiSoundState = useRef<{ reportKey: string; level: number; cancelled: boolean } | null>(null);
  const liveEewSoundReports = useRef(new Map<string, LiveEew>());
  const liveEewSoundCues = useRef(new Set<string>());
  const customSoundUrlsRef = useRef(new Map<SeismicSoundAssetId, string>());
  const replaySoundClock = useRef<{ sessionKey: string; seconds: number } | null>(null);
  const replayResponseSoundState = useRef<{ sessionKey: string; arrived: boolean } | null>(null);
  const intenseSoundSession = useRef<string | null>(null);
  const replayClockRef = useRef<number | null>(null);
  const replayDurationRef = useRef(300);
  const niedAudioRef = useRef<HTMLAudioElement | null>(null);
  const niedAudioContextRef = useRef<AudioContext | null>(null);
  const niedAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const niedAudioBuffersRef = useRef(new Map<SeismicSoundAssetId, AudioBuffer>());
  const autoNiedSelectionSession = useRef<string | null>(null);
  const autoWaveformSelection = useRef<{ eventKey: string; stationId: string; distanceKm: number } | null>(null);
  const autoNiedWaveformSelection = useRef<{ sessionKey: string; stationId: string; mode: "inside" | "nearest" } | null>(null);
  const niedWaveformProbeSession = useRef<string | null>(null);
  const handledGlobalAutoEvent = useRef<string | null>(null);
  const movieCameraQueueState = useRef({
    currentKey: null as string | null,
    enteredAt: 0,
    knownKeys: [] as string[],
  });
  const globalRefreshSeconds = normalizeEarthquakeRefreshSeconds(storedGlobalRefreshSeconds);
  const normalizedReplaySpeed: ReplaySpeed = replaySpeed === 1 || replaySpeed === 10 || replaySpeed === 60 || replaySpeed === 300
    ? replaySpeed
    : 60;
  const autoMagnitudeThreshold = Math.max(1, Math.min(9, Number(autoLocateMagnitude) || 5));
  const receiveMagnitudeThreshold = Math.max(1, Math.min(9, Number(receiveMagnitude) || 1));
  const normalizedSidePanelWidth = clampPanelDimension(Number(sidePanelWidth), 300, 620);
  const normalizedMapPanelHeight = clampPanelDimension(Number(mapPanelHeight), 440, 980);
  const normalizedMapLayerComplexity = Math.max(1, Math.min(6, Math.round(Number(mapLayerComplexity) || 4)));
  const normalizedMonitorDock = normalizeMonitorDock(monitorDock);
  const normalizedMonitorWidgetDocks = normalizeMonitorWidgetDocks(monitorWidgetDocks, normalizedMonitorDock);
  const normalizedMonitorScale = clampMonitorScale(Number(monitorScale));
  const monitorDragging = draggingMonitorWidget !== null;
  const enabledEewSourceSet = useMemo(
    () => new Set(LIVE_EEW_SOURCE_ORDER.filter((source) => enabledEewSources.includes(source))),
    [enabledEewSources],
  );
  const commitMapFocus = useCallback((target: Omit<MapFocusTarget, "key"> & { id: string }) => {
    mapFocusSequence.current += 1;
    const { id, ...focus } = target;
    setMapFocus({ key: `${id}:${mapFocusSequence.current}`, ...focus });
  }, []);
  const beginPanelResize = useCallback((axis: "horizontal" | "vertical", event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const grid = primaryGridRef.current;
    if (!grid) return;
    event.preventDefault();
    panelResizeCleanupRef.current?.();
    const bounds = grid.getBoundingClientRect();
    const startPointer = axis === "vertical" ? event.clientX : event.clientY;
    const startValue = axis === "vertical" ? normalizedSidePanelWidth : normalizedMapPanelHeight;
    const maximum = axis === "vertical"
      ? Math.max(300, Math.min(620, bounds.width - 488))
      : 980;
    let nextValue = clampPanelDimension(startValue, axis === "vertical" ? 300 : 440, maximum);

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.classList.remove("seismic-panel-resizing");
      panelResizeCleanupRef.current = null;
    };
    const handleMove = (moveEvent: PointerEvent) => {
      const pointer = axis === "vertical" ? moveEvent.clientX : moveEvent.clientY;
      const delta = axis === "vertical" ? startPointer - pointer : pointer - startPointer;
      nextValue = clampPanelDimension(startValue + delta, axis === "vertical" ? 300 : 440, maximum);
      grid.style.setProperty(
        axis === "vertical" ? "--seismic-side-panel-width" : "--seismic-map-panel-height",
        `${Math.round(nextValue)}px`,
      );
    };
    const handleEnd = () => {
      cleanup();
      if (axis === "vertical") setSidePanelWidth(Math.round(nextValue));
      else setMapPanelHeight(Math.round(nextValue));
    };
    panelResizeCleanupRef.current = cleanup;
    document.body.classList.add("seismic-panel-resizing");
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
  }, [normalizedMapPanelHeight, normalizedSidePanelWidth, setMapPanelHeight, setSidePanelWidth]);
  const beginMonitorDrag = useCallback((widgetId: MonitorWidgetId, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const shell = mapShellRef.current;
    const widget = event.currentTarget.closest<HTMLElement>(".seismic-monitor-widget");
    if (!shell || !widget) return;
    event.preventDefault();
    event.stopPropagation();
    monitorPointerCleanupRef.current?.();
    const bounds = shell.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const currentDock = normalizedMonitorWidgetDocks[widgetId];
    monitorDropTargetRef.current = currentDock;
    setMonitorDropTarget(currentDock);
    setDraggingMonitorWidget(widgetId);

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.classList.remove("seismic-monitor-moving");
      widget.style.setProperty("--monitor-drag-x", "0px");
      widget.style.setProperty("--monitor-drag-y", "0px");
      widget.style.removeProperty("z-index");
      monitorPointerCleanupRef.current = null;
    };
    const handleMove = (moveEvent: PointerEvent) => {
      widget.style.setProperty("--monitor-drag-x", `${Math.round((moveEvent.clientX - startX) / normalizedMonitorScale)}px`);
      widget.style.setProperty("--monitor-drag-y", `${Math.round((moveEvent.clientY - startY) / normalizedMonitorScale)}px`);
      widget.style.setProperty("z-index", "12");
      const target = nearestMonitorDock(moveEvent.clientX, moveEvent.clientY, bounds);
      if (target === monitorDropTargetRef.current) return;
      monitorDropTargetRef.current = target;
      setMonitorDropTarget(target);
    };
    const handleEnd = () => {
      const target = monitorDropTargetRef.current;
      cleanup();
      setDraggingMonitorWidget(null);
      setMonitorWidgetDocks((current) => ({
        ...normalizeMonitorWidgetDocks(current, normalizedMonitorDock),
        [widgetId]: target,
      }));
    };
    monitorPointerCleanupRef.current = cleanup;
    document.body.classList.add("seismic-monitor-moving");
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
  }, [normalizedMonitorDock, normalizedMonitorScale, normalizedMonitorWidgetDocks, setMonitorWidgetDocks]);
  const beginMonitorResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const shell = mapShellRef.current;
    const overlay = monitorOverlayRef.current;
    if (!shell || !overlay) return;
    event.preventDefault();
    event.stopPropagation();
    monitorPointerCleanupRef.current?.();
    const shellBounds = shell.getBoundingClientRect();
    const startX = event.clientX;
    const widthLimit = (shellBounds.width - 28) / 330;
    const maximumScale = Math.max(0.65, Math.min(1.6, widthLimit));
    let nextScale = Math.min(normalizedMonitorScale, maximumScale);

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.classList.remove("seismic-monitor-resizing");
      monitorPointerCleanupRef.current = null;
    };
    const handleMove = (moveEvent: PointerEvent) => {
      nextScale = Math.max(0.65, Math.min(maximumScale, normalizedMonitorScale + (moveEvent.clientX - startX) / 330));
      overlay.style.setProperty("--monitor-scale", String(nextScale));
    };
    const handleEnd = () => {
      cleanup();
      setMonitorScale(Number(nextScale.toFixed(2)));
    };
    monitorPointerCleanupRef.current = cleanup;
    document.body.classList.add("seismic-monitor-resizing");
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
  }, [normalizedMonitorScale, setMonitorScale]);
  useEffect(() => () => monitorPointerCleanupRef.current?.(), []);
  const adjustSidePanelWidth = useCallback((delta: number) => {
    setSidePanelWidth(clampPanelDimension(normalizedSidePanelWidth + delta, 300, 620));
  }, [normalizedSidePanelWidth, setSidePanelWidth]);
  const adjustMapPanelHeight = useCallback((delta: number) => {
    setMapPanelHeight(clampPanelDimension(normalizedMapPanelHeight + delta, 440, 980));
  }, [normalizedMapPanelHeight, setMapPanelHeight]);
  const focusJshisLocation = useCallback((snapshot: JshisLocationSnapshot) => {
    const meshcode = snapshot.hazard?.meshcode ?? snapshot.site?.meshcode ?? "unknown";
    commitMapFocus({
      id: `jshis-grid:${meshcode}`,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      zoom: 13,
      exact: true,
    });
  }, [commitMapFocus]);
  const focusJshisFault = useCallback((fault: JshisFaultShape) => {
    const extent = jshisFaultMapExtent(fault.features);
    if (!extent) return;
    commitMapFocus({
      id: `jshis-fault:${fault.code}`,
      latitude: extent.latitude,
      longitude: extent.longitude,
      zoom: 8,
      radiusKm: extent.radiusKm,
    });
  }, [commitMapFocus]);
  const handleJshisLoaded = useCallback((snapshot: JshisLocationSnapshot) => {
    setJshisLocation(snapshot);
    setShowJshisHazard(Boolean(snapshot.hazard));
    setShowJshisSite(Boolean(snapshot.site));
    focusJshisLocation(snapshot);
  }, [focusJshisLocation, setShowJshisHazard, setShowJshisSite]);
  const handleJshisFaultLoaded = useCallback((fault: JshisFaultShape) => {
    setJshisFault(fault);
    setShowJshisFault(true);
    focusJshisFault(fault);
  }, [focusJshisFault, setShowJshisFault]);

  useEffect(() => () => panelResizeCleanupRef.current?.(), []);

  useEffect(() => {
    setEewHistory((current) => {
      const regionalOnly = current.filter((event) => event.relay !== "Catalogue");
      return regionalOnly.length === current.length ? current : regionalOnly;
    });
  }, [setEewHistory]);

  useEffect(() => {
    const legacyPanel = String(panelTab);
    if (legacyPanel === "inference" || legacyPanel === "replay") setBottomTab(legacyPanel);
    if (legacyPanel !== "station" && legacyPanel !== "intensity" && legacyPanel !== "snet" && legacyPanel !== "exposure") setPanelTab("station");
    if (!["inference", "replay", "warnings", "reports"].includes(String(bottomTab))) setBottomTab("warnings");
    if (warningSourceFilter !== "ALL" && !LIVE_EEW_SOURCE_ORDER.includes(warningSourceFilter as LiveEewSource)) setWarningSourceFilter("ALL");
  }, [bottomTab, panelTab, setBottomTab, setPanelTab, setWarningSourceFilter, warningSourceFilter]);

  const focusMap = useCallback((
    id: string,
    latitude: number,
    longitude: number,
    zoom: number,
    exact = false,
    radiusKm?: number,
  ) => {
    if (movieModeEnabled && movieCameraMode === "locked") return;
    commitMapFocus({ id, latitude, longitude, zoom, exact, radiusKm });
  }, [commitMapFocus, movieCameraMode, movieModeEnabled]);

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

  useEffect(() => {
    if (!showWniCameras) return;
    const controller = new AbortController();
    setWniCameraState(wniCameras.length ? "stale" : "connecting");
    setWniCameraError("");
    void fetchWniCameras(controller.signal)
      .then((cameras) => {
        setWniCameras(cameras);
        setWniCameraState("online");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setWniCameraState(wniCameras.length ? "stale" : "error");
        setWniCameraError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [showWniCameras, wniCameraReloadKey]);

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

  const playSoundAsset = useCallback(async (
    assetId: SeismicSoundAssetId,
    statusSetter: (value: string) => void = setSeismicSoundStatus,
  ) => {
    const asset = SEISMIC_SOUND_LIBRARY[assetId];
    const sourceUrl = customSoundUrlsRef.current.get(assetId) ?? asset.url;
    const label = asset.label;
    const updateStatus = (value: string) => {
      statusSetter(value);
      if (statusSetter !== setSeismicSoundStatus) setSeismicSoundStatus(value);
    };
    updateStatus(`正在加载 ${label}`);
    try {
      const context = getNiedAudioContext();
      if (context?.state === "running") {
        let buffer = niedAudioBuffersRef.current.get(assetId);
        if (!buffer) {
          const decodedBuffer = await withBrowserTimeout<AudioBuffer>(
            fetch(sourceUrl).then(async (response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return context.decodeAudioData(await response.arrayBuffer());
            }),
            5_000,
            "load-timeout",
          );
          niedAudioBuffersRef.current.set(assetId, decodedBuffer);
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
          updateStatus(`播放完成 ${label}`);
        };
        niedAudioSourceRef.current = source;
        source.start();
        updateStatus(`正在播放 ${label}`);
      } else {
        if (context?.state === "suspended") void context.resume().catch(() => undefined);
        const audio = getNiedAudio();
        audio.pause();
        audio.src = sourceUrl;
        audio.preload = "auto";
        audio.volume = Math.max(0, Math.min(1, niedSoundVolume / 100));
        audio.currentTime = 0;
        audio.onended = () => updateStatus(`播放完成 ${label}`);
        await withBrowserTimeout(audio.play(), 5_000, "load-timeout");
        updateStatus(`正在播放 ${label}`);
      }
    } catch (error) {
      niedAudioRef.current?.pause();
      const message = error instanceof Error ? error.message : "";
      updateStatus(message === "load-timeout"
        ? "音效加载超时，请检查本地服务"
        : "浏览器阻止自动播放，请点击试听授权");
    }
  }, [getNiedAudio, getNiedAudioContext, niedSoundVolume]);

  const playNiedCue = useCallback(async (cue: NiedSoundCue) => {
    const cueLabel = cue.replace("shindo", "震度 ");
    setNiedSoundStatus(`正在加载 ${cueLabel}`);
    await playSoundAsset(NIED_SOUND_CUES[cue], setNiedSoundStatus);
  }, [playSoundAsset]);

  const playJmaTsunamiCue = useCallback(async (
    snapshot: JmaTsunamiSnapshot,
    previous: { level: number; cancelled: boolean } | null = null,
  ) => {
    if (!jmaTsunamiSoundEnabled) return;
    const assetId = tsunamiSoundAssetForTransition(snapshot.level, snapshot.cancelled, previous);
    if (!assetId) return;
    await playSoundAsset(assetId, setJmaTsunamiSoundStatus);
  }, [jmaTsunamiSoundEnabled, playSoundAsset]);

  const primeReplayAudio = useCallback(async () => {
    if (!niedSoundEnabled && !jmaTsunamiSoundEnabled && !seismicAlertSoundEnabled) return;
    const context = getNiedAudioContext();
    const attempts: Promise<unknown>[] = [];
    if (niedSoundEnabled || seismicAlertSoundEnabled) {
      const audio = getNiedAudio();
      audio.pause();
      const primeAssetId = seismicAlertSoundEnabled ? "general-ews" : NIED_SOUND_CUES.shindo0;
      const primeAsset = SEISMIC_SOUND_LIBRARY[primeAssetId];
      audio.src = customSoundUrlsRef.current.get(primeAssetId) ?? primeAsset.url;
      audio.preload = "auto";
      audio.volume = 0;
      audio.currentTime = 0;
      attempts.push(withBrowserTimeout(audio.play(), 2_500, "media-prime-timeout").then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = Math.max(0, Math.min(1, niedSoundVolume / 100));
      }));
    }
    if (context) attempts.push(withBrowserTimeout(context.resume(), 2_500, "context-prime-timeout"));
    const outcomes = await Promise.allSettled(attempts);
    if (outcomes.some((outcome) => outcome.status === "fulfilled")) {
      if (niedSoundEnabled) setNiedSoundStatus("回放音效已授权，等待最大震度上升");
      if (seismicAlertSoundEnabled) setSeismicSoundStatus("回放音效已授权，等待报文与传播节点");
      if (jmaTsunamiSoundEnabled) setJmaTsunamiSoundStatus("回放音效已授权，等待海啸报文");
    } else {
      if (niedSoundEnabled) setNiedSoundStatus("浏览器阻止自动播放，请点击试听授权");
      if (seismicAlertSoundEnabled) setSeismicSoundStatus("浏览器阻止自动播放，请点击试听授权");
      if (jmaTsunamiSoundEnabled) setJmaTsunamiSoundStatus("浏览器阻止海啸回放音效，请再次点击播放");
    }
  }, [getNiedAudio, getNiedAudioContext, jmaTsunamiSoundEnabled, niedSoundEnabled, niedSoundVolume, seismicAlertSoundEnabled]);

  useEffect(() => () => {
    try { niedAudioSourceRef.current?.stop(); } catch { /* already stopped */ }
    niedAudioRef.current?.pause();
    void niedAudioContextRef.current?.close();
    for (const url of customSoundUrlsRef.current.values()) URL.revokeObjectURL(url);
    customSoundUrlsRef.current.clear();
  }, []);

  const ingestEew = useCallback((normalized: LiveEew) => {
    if (!enabledEewSourceSet.has(normalized.source)) return;
    if (!meetsEewMagnitudeThreshold(normalized, receiveMagnitudeThreshold)) return;
    if (isRegionalEewSoundSource(normalized)) {
      const soundKey = eewSoundEventKey(normalized);
      const previous = liveEewSoundReports.current.get(soundKey) ?? null;
      if (isNewerEewSoundReport(normalized, previous)) {
        const assetId = eewSoundAssetForTransition(normalized, previous, autoMagnitudeThreshold);
        liveEewSoundReports.current.set(soundKey, normalized);
        const announcedAt = Date.parse(normalized.announcedAt);
        const isFresh = Number.isFinite(announcedAt) && Math.abs(Date.now() - announcedAt) <= 120_000;
        if (seismicAlertSoundEnabled && assetId && (previous !== null || isFresh)) {
          const cueKey = eewSoundCueKey(normalized, assetId);
          if (!liveEewSoundCues.current.has(cueKey)) {
            liveEewSoundCues.current.add(cueKey);
            if (liveEewSoundCues.current.size > 512) {
              const staleKeys = [...liveEewSoundCues.current].slice(0, 128);
              staleKeys.forEach((key) => liveEewSoundCues.current.delete(key));
            }
            void playSoundAsset(assetId);
          }
        }
      }
    }
    setEews((current) => {
      const existing = current.find((event) => event.id === normalized.id);
      const next = existing && existing.serial > normalized.serial
        ? current
        : [normalized, ...current.filter((event) => event.id !== normalized.id)];
      return next.sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt)).slice(0, 30);
    });
    setEewHistory((current) => mergeEewHistory(current, normalized));
    setSelectedEewKey((current) => current ?? eewReportKey(normalized));
  }, [autoMagnitudeThreshold, enabledEewSourceSet, playSoundAsset, receiveMagnitudeThreshold, setEewHistory, seismicAlertSoundEnabled]);

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
        const snapshot = await fetchWorldFdsnStations(controller.signal, false);
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
  }, [globalStationReloadKey]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setWaveformStationState("connecting");
      setWaveformStationError("");
      let nextDelay = 10 * 60_000;
      try {
        const snapshot = await fetchWorldFdsnStations(controller.signal, true);
        if (!active) return;
        setWaveformStationSnapshot(snapshot);
        setWaveformStationState(snapshot.stale ? "stale" : "online");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        nextDelay = 15_000;
        setWaveformStationState("error");
        setWaveformStationError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) timer = window.setTimeout(load, nextDelay);
      }
    };
    timer = window.setTimeout(load, 520);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [globalStationReloadKey]);

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
    if (!showPalertStations) {
      setPalertState("stale");
      return;
    }
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setPalertError("");
      let nextDelay = 10 * 60_000;
      try {
        const snapshot = await fetchPalertStations(controller.signal);
        if (!active) return;
        setPalertSnapshot(snapshot);
        setPalertState(snapshot.state);
        setPalertError(snapshot.error ?? "");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        nextDelay = 20_000;
        setPalertState("error");
        setPalertError(error instanceof Error ? error.message : String(error));
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
  }, [showPalertStations]);

  useEffect(() => {
    if (!showGlobalFaults || globalFaults) return;
    const controller = new AbortController();
    setGlobalFaultError("");
    void fetch("/data/global-active-faults.geo.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const collection = await response.json() as GlobalFaultCollection;
        if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
          throw new Error("断裂带数据格式无效");
        }
        setGlobalFaults(collection);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setGlobalFaultError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [globalFaults, showGlobalFaults]);

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
          : null);
        setSelectedSnetReportId((current) => current && snapshot.events.some((event) => event.reports?.some((report) => report.id === current))
          ? current
          : null);
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
        setJmaRegions(normalizeJapanImpactRegions(
          topojsonFeature(topology, topology.objects.region) as JmaRegionCollection,
        ));
        setJmaSeismicSites(sites);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setJmaCatalogueError((current) => current || (error instanceof Error ? error.message : String(error)));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadEastAsiaImpactRegions(controller.signal)
      .then((regions) => {
        setEastAsiaImpactRegions(regions);
        setRegionalBoundaryError("");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRegionalBoundaryError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/jp.tsunami.topo.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`JMA 海啸预报区边界 ${response.status}`);
        return response.json() as Promise<{ objects?: { region?: unknown } }>;
      })
      .then((topology) => {
        if (!topology.objects?.region) throw new Error("JMA 海啸预报区边界格式无效");
        setTsunamiRegions(topojsonFeature(topology, topology.objects.region) as TsunamiRegionCollection);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTsunamiCatalogueError(error instanceof Error ? error.message : String(error));
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
        const snapshot = await fetchJmaTsunami(controller.signal);
        if (!active) return;
        setJmaTsunami(snapshot);
        setJmaTsunamiState(snapshot.sourceState);
        setJmaTsunamiLatency(Date.now() - started);
        setJmaTsunamiError(snapshot.error ?? "");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setJmaTsunamiState("error");
        setJmaTsunamiLatency(null);
        setJmaTsunamiError(error instanceof Error ? error.message : String(error));
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
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchJmaTsunamiHistory(controller.signal);
        if (!active) return;
        setJmaTsunamiHistory(snapshot);
        setJmaTsunamiHistoryError(snapshot.error ?? "");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setJmaTsunamiHistoryError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) timer = window.setTimeout(poll, 5 * 60_000);
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
      const started = Date.now();
      try {
        const snapshot = await fetchEarthquakeSnapshot({
          range: "24h",
          minMagnitude: receiveMagnitudeThreshold,
          signal: controller.signal,
        });
        if (!active) return;
        setInstitutionReports((current) => mergeEarthquakeEventHistory(current, snapshot.events));
        const availability = summarizeEarthquakeSourceAvailability(snapshot.sources);
        const cwa = snapshot.sources.find((source) => source.id === "cwa");
        setInstitutionSourceCount(availability.availableCount);
        setOfficialLatency(Date.now() - started);
        setOfficialState(availability.state);
        setCwaOfficialState(cwa?.status === "ok" ? "online" : cwa?.status === "stale" ? "stale" : "error");
        setCwaOfficialLatency(cwa?.latencyMs ?? null);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setOfficialState("error");
        setCwaOfficialState("error");
        setCwaOfficialLatency(null);
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
  }, [globalRefreshSeconds, receiveMagnitudeThreshold]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchEarthquakeSnapshot({ range: "90d", minMagnitude: 4, signal: controller.signal })
      .then((snapshot) => {
        setInstitutionReports((current) => mergeEarthquakeEventHistory(current, snapshot.events));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => {
      controller.abort();
    };
  }, []);

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
        setJmaIntensityState(snapshot.sources.p2pIntensity.state);
        setJmaIntensityLatency(snapshot.sources.p2pIntensity.latencyMs);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setWolfxState("error");
        setFanState("error");
        setJmaIntensityState("error");
        setWolfxLatency(null);
        setFallbackLatency(null);
        setJmaIntensityLatency(null);
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
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchExternalWarnings(controller.signal);
        if (!active) return;
        snapshot.events.forEach(ingestEew);
        setEarlyEstState(snapshot.sources["early-est"].state);
        setEarlyEstLatency(snapshot.sources["early-est"].latencyMs);
        setGlobalQuakeState(snapshot.sources.globalquake.state);
        setGlobalQuakeLatency(snapshot.sources.globalquake.latencyMs);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setEarlyEstState("error");
        setEarlyEstLatency(null);
        setGlobalQuakeState("error");
        setGlobalQuakeLatency(null);
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
    let detailSignature = cencReport ? `${cencReport.id}:${cencReport.createdAt}:${cencReport.stationMetrics.length}:${cencReport.stations.length}` : "";
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const snapshot = await fetchCencIntensity(selectedCencId, controller.signal);
        if (!active) return;
        setCencProvider(snapshot.provider);
        setCencOfficialEgressMode(snapshot.officialEgressMode);
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
          const nextDetailSignature = `${report.id}:${report.createdAt}:${report.stationMetrics.length}:${report.stations.length}`;
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
      setReplaySeconds((value) => Math.min(replayDurationRef.current, value + elapsedSeconds * normalizedReplaySpeed));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [normalizedReplaySpeed, replayPlaying, replaySeconds]);

  useEffect(() => {
    if (replaySeconds < replayDurationRef.current) return;
    setReplayPlaying(false);
  }, [replaySeconds]);

  useEffect(() => {
    if (bottomTab === "replay") return;
    clearReplayPresentation();
  }, [bottomTab, clearReplayPresentation]);

  useEffect(() => {
    setReplayPlaying(false);
    setReplaySeconds(0);
    replayDurationRef.current = 300;
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
  const receivedInstitutionEewReports = useMemo(
    () => institutionEewReports.filter((event) => meetsEewMagnitudeThreshold(event, receiveMagnitudeThreshold)),
    [institutionEewReports, receiveMagnitudeThreshold],
  );
  const activeInstitutionMagnitudeBand = INSTITUTION_MAGNITUDE_BANDS.find((band) => band.id === institutionMagnitudeBand)
    ?? INSTITUTION_MAGNITUDE_BANDS[0];
  const institutionMagnitudeCounts = useMemo(() => Object.fromEntries(
    INSTITUTION_MAGNITUDE_BANDS.map((band) => [band.id, filterEarthquakeEvents(institutionReports, {
      sources: INSTITUTION_REPORT_SOURCE_ORDER,
      magnitudeType: "",
      search: "",
      minimumMagnitude: band.minimum,
      maximumMagnitude: band.maximum,
    }).length]),
  ) as Record<InstitutionMagnitudeBand, number>, [institutionReports]);
  const institutionReportSourceCounts = useMemo(() => Object.fromEntries(
    INSTITUTION_REPORT_SOURCE_ORDER.map((source) => [source, filterEarthquakeEvents(institutionReports, {
      sources: [source],
      magnitudeType: "",
      search: "",
      minimumMagnitude: activeInstitutionMagnitudeBand.minimum,
      maximumMagnitude: activeInstitutionMagnitudeBand.maximum,
    }).length]),
  ) as Record<EarthquakeSourceId, number>, [activeInstitutionMagnitudeBand.maximum, activeInstitutionMagnitudeBand.minimum, institutionReports]);
  const filteredInstitutionReports = useMemo(() => filterEarthquakeEvents(institutionReports, {
    sources: institutionReportSources,
    magnitudeType: "",
    search: "",
    minimumMagnitude: activeInstitutionMagnitudeBand.minimum,
    maximumMagnitude: activeInstitutionMagnitudeBand.maximum,
  }), [activeInstitutionMagnitudeBand.maximum, activeInstitutionMagnitudeBand.minimum, institutionReportSources, institutionReports]);
  const displayedInstitutionReports = useMemo(
    () => filteredInstitutionReports.slice(0, institutionReportLimit),
    [filteredInstitutionReports, institutionReportLimit],
  );
  const institutionHistoryReports = useMemo(
    () => buildInstitutionHistoryReports(institutionReports)
      .filter((event) => meetsEewMagnitudeThreshold(event, receiveMagnitudeThreshold)),
    [institutionReports, receiveMagnitudeThreshold],
  );
  const regionalHistory = useMemo(
    () => eewHistory.filter((event) => event.relay !== "Catalogue"
      && meetsEewMagnitudeThreshold(event, receiveMagnitudeThreshold)),
    [eewHistory, receiveMagnitudeThreshold],
  );
  const latestRegionalState = useMemo(() => {
    const regionalReports = regionalHistory.filter((event) => PERSISTENT_REGIONAL_EEW_SOURCES.has(event.source));
    const groups = collapseEewHistoryEvents(regionalReports).map((group) => ({
      group,
      updatedAt: Math.max(...group.reports.map((report) => Date.parse(report.announcedAt)).filter(Number.isFinite), 0),
    })).sort((left, right) => right.updatedAt - left.updatedAt);
    const current = groups[0];
    if (!current) return { displayEvent: null, impactEvent: null, waveEvent: null, terminated: false, updatedAt: 0 };
    const seed = current.group.latestReport;
    const seedOrigin = Date.parse(seed.originTime);
    const relatedReports = regionalReports.filter((report) => {
      if (isSameEewEvent(seed, report)) return true;
      const reportOrigin = Date.parse(report.originTime);
      return seed.source === report.source
        && Number.isFinite(seedOrigin)
        && Number.isFinite(reportOrigin)
        && Math.abs(seedOrigin - reportOrigin) <= 120_000
        && (seed.hypocenterKnown === false || report.hypocenterKnown === false);
    });
    const reports = [...new Map(relatedReports.map((report) => [eewReportKey(report), report])).values()].sort((left, right) => (
      Date.parse(right.announcedAt) - Date.parse(left.announcedAt)
      || right.serial - left.serial
    ));
    const displayEvent = reports[0] ?? current.group.latestReport;
    const terminated = reports.some((report) => report.cancelled || report.final || report.observedIntensity);
    const impactEvent = reports.find((report) => report.observedIntensity || (report.affectedAreas?.length ?? 0) > 0)
      ?? displayEvent;
    const waveEvent = terminated
      ? null
      : reports.find((report) => report.hypocenterKnown !== false && !report.cancelled) ?? null;
    return { displayEvent, impactEvent, waveEvent, terminated, updatedAt: current.updatedAt };
  }, [regionalHistory]);
  const persistentRegionalEvent = latestRegionalState.displayEvent;
  const persistentRegionalImpactEvent = latestRegionalState.impactEvent;
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
    for (const event of [...eews, ...regionalHistory, ...receivedInstitutionEewReports]) reports.set(eewReportKey(event), event);
    return [...reports.values()]
      .filter((event) => isLiveEewActive(event, clock))
      .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt));
  }, [clock, eews, receivedInstitutionEewReports, regionalHistory]);
  const latestEvent = activeEews[0] ?? null;
  const selectedEvent = useMemo(() => {
    const selected = selectedEewKey
      ? [...regionalHistory, ...institutionEewReports].find((event) => eewReportKey(event) === selectedEewKey)
      : null;
    return selected ?? historyEvents[0]?.latestReport ?? latestEvent ?? null;
  }, [historyEvents, institutionEewReports, latestEvent, regionalHistory, selectedEewKey]);
  const selectedInstitutionRecord = useMemo(() => {
    if (!selectedEvent) return null;
    return institutionReports.find((report) => {
      const converted = institutionReportToLiveEew(report);
      return converted?.id === selectedEvent.id && converted.originTime === selectedEvent.originTime;
    }) ?? null;
  }, [institutionReports, selectedEvent]);
  const replayTsunamiEpisode = useMemo(
    () => selectedEvent
      ? matchJmaTsunamiReplayEpisode(
        selectedEvent.originTime,
        jmaTsunamiHistory?.reports ?? [],
        Boolean(selectedInstitutionRecord?.tsunami),
      )
      : null,
    [jmaTsunamiHistory, selectedEvent, selectedInstitutionRecord?.tsunami],
  );
  const replayDurationSeconds = useMemo(
    () => selectedEvent
      ? jmaTsunamiReplayDurationSeconds(selectedEvent.originTime, replayTsunamiEpisode)
      : 300,
    [replayTsunamiEpisode, selectedEvent],
  );
  useEffect(() => {
    replayDurationRef.current = replayDurationSeconds;
    setReplaySeconds((value) => Math.min(value, replayDurationSeconds));
  }, [replayDurationSeconds]);
  const movieAutoTracking = movieModeEnabled && movieCameraMode === "auto" && autoLocateGlobalEarthquakes;
  const eligibleGlobalEvents = useMemo(
    () => selectAutoLocatedGlobalEvents(activeEews, autoMagnitudeThreshold, clock),
    [activeEews, autoMagnitudeThreshold, clock],
  );

  useEffect(() => {
    const next = advanceMovieCameraQueue(
      movieAutoTracking ? eligibleGlobalEvents : [],
      movieCameraQueueState.current,
      clock,
    );
    movieCameraQueueState.current = next;
    setMovieCameraEventKey((current) => current === next.currentKey ? current : next.currentKey);
    setMovieCameraEnteredAt((current) => current === next.enteredAt ? current : next.enteredAt);
  }, [clock, eligibleGlobalEvents, movieAutoTracking]);

  const movieCameraEvent = useMemo(
    () => eligibleGlobalEvents.find((event) => `${event.id}:${event.originTime}` === movieCameraEventKey) ?? null,
    [eligibleGlobalEvents, movieCameraEventKey],
  );
  const autoGlobalEvent = useMemo(() => {
    if (!autoLocateGlobalEarthquakes) return null;
    if (movieAutoTracking) return movieCameraEvent;
    return selectAutoLocatedGlobalEvent(activeEews, autoMagnitudeThreshold, clock);
  }, [activeEews, autoLocateGlobalEarthquakes, autoMagnitudeThreshold, clock, movieAutoTracking, movieCameraEvent]);

  useEffect(() => {
    if (!autoLocateGlobalEarthquakes || !autoGlobalEvent) {
      handledGlobalAutoEvent.current = null;
      setAutoGlobalEventKey(null);
      return;
    }
    const reportKey = eewReportKey(autoGlobalEvent);
    const physicalEventKey = `${autoGlobalEvent.id}:${autoGlobalEvent.originTime}`;
    const cameraPresentationKey = movieAutoTracking
      ? `${physicalEventKey}:${movieCameraEnteredAt}`
      : physicalEventKey;
    setAutoGlobalEventKey((current) => current === reportKey ? current : reportKey);
    if (handledGlobalAutoEvent.current === cameraPresentationKey) return;
    handledGlobalAutoEvent.current = cameraPresentationKey;
    const institutionReport = institutionReports.find((report) => {
      const event = institutionReportToLiveEew(report);
      return event?.id === autoGlobalEvent.id && event.originTime === autoGlobalEvent.originTime;
    });
    setSelectedEewKey(reportKey);
    setSelectedInstitutionReportId(institutionReport?.id ?? null);
    setWarningOverlayTab("selected");
    setSelectedPreviewUntil(Date.now() + 20_000);
    setShowWaveformStations(true);
    if (seismicAlertSoundEnabled) void playSoundAsset("srev-hypocenter");
    focusMap(
      `${movieAutoTracking ? "movie" : "global-auto"}:${reportKey}:${cameraPresentationKey}`,
      autoGlobalEvent.latitude,
      autoGlobalEvent.longitude,
      6,
      true,
    );
  }, [
    autoGlobalEvent,
    autoLocateGlobalEarthquakes,
    focusMap,
    institutionReports,
    movieAutoTracking,
    movieCameraEnteredAt,
    playSoundAsset,
    setShowWaveformStations,
    seismicAlertSoundEnabled,
  ]);

  const selectedInstitutionReport = institutionReports.find((report) => report.id === selectedInstitutionReportId) ?? null;
  const enabledShakeMapMmiLevels = useMemo(
    () => SHAKEMAP_MMI_LEVELS.filter((level) => shakeMapMmiLevels.includes(level)),
    [shakeMapMmiLevels],
  );
  const availableShakeMapMmiLevels = useMemo(
    () => new Set((usgsShakeMap?.contours.features ?? []).map((feature) => (
      shakeMapContourLevel(feature.properties.value)
    ))),
    [usgsShakeMap],
  );
  const visibleShakeMapContours = useMemo(
    () => usgsShakeMap
      ? filterShakeMapContours(usgsShakeMap, enabledShakeMapMmiLevels)
      : null,
    [enabledShakeMapMmiLevels, usgsShakeMap],
  );
  const toggleShakeMapMmiLevel = useCallback((level: number) => {
    setShakeMapMmiLevels((current) => (
      current.includes(level)
        ? current.filter((candidate) => candidate !== level)
        : [...current, level].sort((a, b) => a - b)
    ));
  }, [setShakeMapMmiLevels]);
  useEffect(() => {
    if (!shakeMapReport || !isShakeMapQueryable(shakeMapReport)) {
      setUsgsShakeMapLoading(false);
      setUsgsShakeMapError("");
      return;
    }
    const controller = new AbortController();
    setUsgsShakeMap(null);
    setUsgsShakeMapLoading(true);
    setUsgsShakeMapError("");
    fetchEarthquakeShakeMap(shakeMapReport, controller.signal)
      .then(setUsgsShakeMap)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUsgsShakeMapError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsgsShakeMapLoading(false);
      });
    return () => controller.abort();
  }, [shakeMapReport]);
  useEffect(() => {
    if (!pagerReport || !isPagerQueryable(pagerReport)) {
      setUsgsPagerLoading(false);
      setUsgsPagerError("");
      return;
    }
    const controller = new AbortController();
    setUsgsPager(null);
    setUsgsPagerLoading(true);
    setUsgsPagerError("");
    fetchEarthquakePager(pagerReport, controller.signal)
      .then(setUsgsPager)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUsgsPagerError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsgsPagerLoading(false);
      });
    return () => controller.abort();
  }, [pagerReport]);
  const cwaStations = useMemo(
    () => cwaStationSnapshot?.stations ?? [],
    [cwaStationSnapshot],
  );
  const verifiedWaveformStationIds = useMemo(
    () => verifiedWaveformStations.map(({ station }) => station.id),
    [verifiedWaveformStations],
  );
  const globalFdsnStations = useMemo(
    () => (globalStationSnapshot?.stations ?? []).filter((station) => station.providerId !== "cwa"),
    [globalStationSnapshot],
  );
  const waveformFdsnStations = useMemo(
    () => (waveformStationSnapshot?.stations ?? []).filter((station) => station.providerId !== "cwa"),
    [waveformStationSnapshot],
  );
  const globalResponseStations = useMemo(() => [...new Map(
    [...globalFdsnStations, ...waveformFdsnStations].map((station) => [station.id, station]),
  ).values()], [globalFdsnStations, waveformFdsnStations]);
  const stationProviderSources = useMemo(() => [
    ...(globalStationSnapshot?.sources ?? []),
    ...(waveformStationSnapshot?.sources ?? []),
    ...(cwaStationSnapshot?.sources ?? []),
  ], [cwaStationSnapshot, globalStationSnapshot, waveformStationSnapshot]);
  const allSelectableStations = useMemo<SelectableStation[]>(() => {
    const stations = [
      ...(catalogue?.stations ?? []),
      ...kmaStations,
      ...(oceanCatalogue?.stations ?? []),
      ...(cencReport?.stations ?? []),
      ...globalFdsnStations,
      ...waveformFdsnStations,
      ...cwaStations,
    ];
    return [...new Map(stations.map((station) => [station.id, station])).values()];
  }, [catalogue, cencReport, cwaStations, globalFdsnStations, kmaStations, oceanCatalogue, waveformFdsnStations]);
  const selectedStation = allSelectableStations.find((station) => station.id === selectedStationId)
    ?? (selectedGlobalStation?.id === selectedStationId ? selectedGlobalStation : null);
  const replayEvent = selectedEvent && (replayPlaying || replaySeconds > 0) ? selectedEvent : null;
  const replaySeismicSeconds = Math.min(replaySeconds, 300);
  const regionalLiveWaveEvent = latestRegionalState.waveEvent
    && shouldDisplayLiveWavefront(latestRegionalState.waveEvent, clock)
    ? latestRegionalState.waveEvent
    : null;
  const autoGlobalSuppressedByRegionalReport = Boolean(
    autoGlobalEvent
      && persistentRegionalEvent
      && latestRegionalState.terminated
      && isSameEewEvent(autoGlobalEvent, persistentRegionalEvent),
  );
  const globalLiveWaveEvent = autoGlobalEvent
    && !autoGlobalSuppressedByRegionalReport
    && shouldDisplayLiveWavefront(autoGlobalEvent, clock, false)
    ? autoGlobalEvent
    : null;
  const liveWavefrontEvent = [regionalLiveWaveEvent, globalLiveWaveEvent]
    .filter((event): event is LiveEew => Boolean(event))
    .sort((left, right) => Date.parse(right.announcedAt) - Date.parse(left.announcedAt))[0] ?? null;
  const wavefrontEvent = replayEvent ?? liveWavefrontEvent;
  const replayTsunamiSnapshot = replayEvent
    ? jmaTsunamiSnapshotAt(replayTsunamiEpisode, replaySeconds)
    : null;
  const displayedJmaTsunami = replayEvent ? replayTsunamiSnapshot : jmaTsunami;
  const replayProfile = useMemo(() => replayEvent && catalogue
    ? prepareReplayStationResponse(replayEvent, catalogue.stations)
    : null, [catalogue, replayEvent]);
  const replaySimulation = useMemo(() => replayProfile
    ? simulatePreparedReplayStationResponse(replayProfile, replaySeismicSeconds)
    : null, [replayProfile, replaySeismicSeconds]);
  const kmaReplayProfile = useMemo(() => replayEvent && kmaStations.length
    ? prepareReplayStationResponse(replayEvent, kmaStations, "intensity")
    : null, [kmaStations, replayEvent]);
  const kmaReplaySimulation = useMemo(() => kmaReplayProfile
    ? simulatePreparedReplayStationResponse(kmaReplayProfile, replaySeismicSeconds)
    : null, [kmaReplayProfile, replaySeismicSeconds]);
  const oceanResponseEvent = replayEvent ?? liveWavefrontEvent ?? persistentRegionalEvent ?? autoGlobalEvent ?? latestEvent;
  const oceanResponseElapsed = oceanResponseEvent
    ? replayEvent
      ? replaySeismicSeconds
      : Math.max(0, Math.min(300, (clock - Date.parse(oceanResponseEvent.originTime)) / 1000))
    : 0;
  const oceanResponseProfile = useMemo(() => oceanResponseEvent && oceanCatalogue
    ? prepareReplayStationResponse(oceanResponseEvent, oceanCatalogue.stations)
    : null, [oceanCatalogue, oceanResponseEvent]);
  const oceanSimulation = useMemo(() => oceanResponseProfile
    ? simulatePreparedReplayStationResponse(oceanResponseProfile, oceanResponseElapsed)
    : null, [oceanResponseElapsed, oceanResponseProfile]);
  const eventStationKey = oceanResponseEvent
    ? `${oceanResponseEvent.source}:${oceanResponseEvent.id}`
    : null;
  const [waveformEventWindow, setWaveformEventWindow] = useState<{
    eventKey: string;
    originTime: string;
  } | null>(null);
  useEffect(() => {
    if (!eventStationKey || !oceanResponseEvent) {
      setWaveformEventWindow(null);
      return;
    }
    setWaveformEventWindow((current) => current?.eventKey === eventStationKey
      ? current
      : { eventKey: eventStationKey, originTime: oceanResponseEvent.originTime });
  }, [eventStationKey, oceanResponseEvent]);
  const waveformEventTime = waveformEventWindow?.eventKey === eventStationKey
    ? waveformEventWindow.originTime
    : oceanResponseEvent?.originTime ?? null;
  const manualFdsnStations = useMemo(() => [...waveformFdsnStations].sort((a, b) => (
    a.network.localeCompare(b.network)
    || a.stationCode.localeCompare(b.stationCode)
  )), [waveformFdsnStations]);
  const selectedManualFdsnStationId = selectedStation && isGlobalStation(selectedStation)
    && selectedStation.providerId !== "cwa" ? selectedStation.id : "";
  const manualFdsnOptions = useMemo(() => {
    const query = waveformStationSearch.trim().toLocaleLowerCase();
    const options: GlobalSeismicStation[] = [];
    const selected = selectedManualFdsnStationId
      ? manualFdsnStations.find((station) => station.id === selectedManualFdsnStationId)
      : undefined;
    if (selected) options.push(selected);
    for (const station of manualFdsnStations) {
      if (options.length >= 120 || station.id === selectedManualFdsnStationId) continue;
      if (query && !`${station.network} ${station.stationCode} ${station.stationName}`.toLocaleLowerCase().includes(query)) continue;
      options.push(station);
    }
    return options;
  }, [manualFdsnStations, selectedManualFdsnStationId, waveformStationSearch]);
  const waveformCandidates = useMemo(() => oceanResponseEvent
    ? rankFdsnStationsByDistance(
      waveformFdsnStations,
      oceanResponseEvent.latitude,
      oceanResponseEvent.longitude,
      waveformEventTime,
    ).slice(0, 18)
    : [], [oceanResponseEvent, waveformEventTime, waveformFdsnStations]);
  const globalResponseProfile = useMemo(() => oceanResponseEvent && globalResponseStations.length
    ? prepareReplayStationResponse(oceanResponseEvent, globalResponseStations, "intensity")
    : null, [globalResponseStations, oceanResponseEvent]);
  const globalSimulation = useMemo(() => globalResponseProfile
    ? simulatePreparedReplayStationResponse(globalResponseProfile, oceanResponseElapsed)
    : null, [globalResponseProfile, oceanResponseElapsed]);
  const cwaResponseProfile = useMemo(() => oceanResponseEvent && cwaStations.length
    ? prepareReplayStationResponse(oceanResponseEvent, cwaStations, "shindo")
    : null, [cwaStations, oceanResponseEvent]);
  const cwaSimulation = useMemo(() => cwaResponseProfile
    ? simulatePreparedReplayStationResponse(cwaResponseProfile, oceanResponseElapsed)
    : null, [cwaResponseProfile, oceanResponseElapsed]);
  const gnssResponseProfile = useMemo(() => showGnssStations && oceanResponseEvent
    ? prepareReplayStationResponse(oceanResponseEvent, GNSS_STATIONS, "intensity")
    : null, [oceanResponseEvent, showGnssStations]);
  const gnssSimulation = useMemo(() => gnssResponseProfile
    ? simulatePreparedReplayStationResponse(gnssResponseProfile, oceanResponseElapsed)
    : null, [gnssResponseProfile, oceanResponseElapsed]);
  const oceanMode: OceanResponseMode = replayEvent ? "replay" : oceanResponseEvent ? "local" : "idle";
  const selectedSnetEvent = useMemo<SnetIntensityEvent | null>(() => (
    snetSnapshot?.events.find((event) => event.id === selectedSnetEventId)
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
  const liveKmaDetectionRanks = useMemo(() => Object.fromEntries(
    kmaDetection.activeStationIds.flatMap((id) => {
      const station = kmaStations.find((candidate) => candidate.id === id);
      return station ? [[id, Math.max(0, Number(kmaValues[station.index] ?? 0))]] : [];
    }),
  ), [kmaDetection.activeStationIds, kmaStations, kmaValues]);

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

  useEffect(() => {
    if (!replayEvent) {
      previousReplayTsunamiSoundState.current = null;
      setJmaTsunamiSoundStatus(jmaTsunamiSoundEnabled ? "等待海啸回放报文" : "海啸回放音效已关闭");
      return;
    }
    const sessionKey = `${replayNiedSoundSessionKey}:${replayTsunamiEpisode?.reports[0]?.reportId ?? "none"}`;
    const reportKey = replayTsunamiSnapshot
      ? `${replayTsunamiSnapshot.reportId ?? "report"}:${replayTsunamiSnapshot.issuedAt ?? "unknown"}:${replayTsunamiSnapshot.state}`
      : "waiting";
    const previous = previousReplayTsunamiSoundState.current;
    const shouldPlay = Boolean(
      replayPlaying
      && replayTsunamiSnapshot
      && (!previous
        || previous.sessionKey !== sessionKey
        || previous.reportKey !== reportKey
        || !previous.playing),
    );
    previousReplayTsunamiSoundState.current = {
      sessionKey,
      reportKey,
      playing: replayPlaying,
      snapshot: replayTsunamiSnapshot
        ? { level: replayTsunamiSnapshot.level, cancelled: replayTsunamiSnapshot.cancelled }
        : null,
    };
    if (!replayTsunamiSnapshot) {
      setJmaTsunamiSoundStatus(replayTsunamiEpisode ? "等待首份 JMA 海啸预报" : "当前事件没有匹配的 JMA 海啸历史");
      return;
    }
    if (shouldPlay) void playJmaTsunamiCue(replayTsunamiSnapshot, previous?.snapshot ?? null);
  }, [jmaTsunamiSoundEnabled, playJmaTsunamiCue, replayEvent, replayNiedSoundSessionKey, replayPlaying, replayTsunamiEpisode, replayTsunamiSnapshot]);

  useEffect(() => {
    if (!replayEvent || !replayPlaying || !seismicAlertSoundEnabled) {
      if (!replayEvent) replaySoundClock.current = null;
      return;
    }
    const sessionKey = replayNiedSoundSessionKey;
    const previousSeconds = replaySoundClock.current?.sessionKey === sessionKey
      ? replaySoundClock.current.seconds
      : replaySeconds;
    const milestone = replaySoundMilestone(previousSeconds, replaySeconds, normalizedReplaySpeed);
    replaySoundClock.current = { sessionKey, seconds: replaySeconds };
    if (milestone === null) return;
    const assetId = replaySecondSoundAsset(milestone);
    if (assetId) void playSoundAsset(assetId);
  }, [normalizedReplaySpeed, playSoundAsset, replayEvent, replayNiedSoundSessionKey, replayPlaying, replaySeconds, seismicAlertSoundEnabled]);

  const replayWaveResponseArrived = Boolean(
    replayEvent
      && ((replaySimulation?.arrivedStationIds.length ?? 0) > 0
        || (kmaReplaySimulation?.arrivedStationIds.length ?? 0) > 0
        || (globalSimulation?.arrivedStationIds.length ?? 0) > 0
        || (cwaSimulation?.arrivedStationIds.length ?? 0) > 0),
  );
  useEffect(() => {
    if (!replayEvent || !replayPlaying || !seismicAlertSoundEnabled) {
      if (!replayEvent) replayResponseSoundState.current = null;
      return;
    }
    const sessionKey = replayNiedSoundSessionKey;
    const previous = replayResponseSoundState.current;
    replayResponseSoundState.current = { sessionKey, arrived: replayWaveResponseArrived };
    if ((!previous || previous.sessionKey !== sessionKey || previous.arrived) && replayWaveResponseArrived) return;
    if (replayWaveResponseArrived && previous && !previous.arrived) void playSoundAsset("srev-detail");
  }, [cwaSimulation?.arrivedStationIds.length, globalSimulation?.arrivedStationIds.length, kmaReplaySimulation?.arrivedStationIds.length, playSoundAsset, replayEvent, replayNiedSoundSessionKey, replayPlaying, replayWaveResponseArrived, seismicAlertSoundEnabled, replaySimulation?.arrivedStationIds.length]);

  const motionSoundSessionKey = replayEvent ? replayNiedSoundSessionKey : "live";
  const motionSoundMaximum = replayEvent
    ? Math.max(
      replaySimulation?.maxRank ?? -1,
      kmaReplaySimulation?.maxRank ?? -1,
      globalSimulation?.maxRank ?? -1,
      cwaSimulation?.maxRank ?? -1,
    )
    : currentLiveNiedSoundIndex;
  useEffect(() => {
    if (!seismicAlertSoundEnabled || motionSoundMaximum < 5) {
      if (!replayEvent) intenseSoundSession.current = null;
      return;
    }
    if (intenseSoundSession.current === motionSoundSessionKey) return;
    intenseSoundSession.current = motionSoundSessionKey;
    void playSoundAsset("general-intense");
  }, [motionSoundMaximum, motionSoundSessionKey, playSoundAsset, replayEvent, seismicAlertSoundEnabled]);

  useEffect(() => {
    if (!jmaTsunami || replayEvent || !jmaTsunamiSoundEnabled) return;
    const reportKey = `${jmaTsunami.reportId ?? "unknown"}:${jmaTsunami.issuedAt ?? jmaTsunami.fetchedAt}:${jmaTsunami.cancelled ? "cancel" : jmaTsunami.level}`;
    const previous = previousLiveTsunamiSoundState.current;
    previousLiveTsunamiSoundState.current = {
      reportKey,
      level: jmaTsunami.level,
      cancelled: jmaTsunami.cancelled,
    };
    if (previous?.reportKey === reportKey) return;
    const issuedAt = Date.parse(jmaTsunami.issuedAt ?? jmaTsunami.fetchedAt);
    const fresh = previous !== null || !Number.isFinite(issuedAt) || Date.now() - issuedAt <= 5 * 60_000;
    if (fresh) void playJmaTsunamiCue(jmaTsunami, previous);
  }, [jmaTsunami, jmaTsunamiSoundEnabled, playJmaTsunamiCue, replayEvent]);

  const focusStation = useCallback((station: SelectableStation, reason: StationSelectionReason = "manual") => {
    setSelectedStationId(station.id);
    setSelectedGlobalStation(isGlobalStation(station) ? station : null);
    setStationSelectionReason(reason);
    setPanelTab("station");
    focusMap(`station:${station.id}`, station.latitude, station.longitude, isCencStation(station) ? 9 : isGlobalStation(station) ? Math.max(6, mapViewportZoomRef.current) : 7);
  }, [focusMap, setPanelTab]);

  useEffect(() => {
    setVerifiedWaveformStations([]);
    setWaveformProbeState(eventStationKey ? "probing" : "idle");
    setWaveformProbeAttempt(0);
    autoWaveformSelection.current = null;
  }, [eventStationKey]);

  useEffect(() => {
    if (
      !autoSelectWaveformStation
      ||
      !oceanResponseEvent
      || !eventStationKey
      || !waveformCandidates.length
    ) return;
    let active = true;
    let retryTimer: number | undefined;
    const controller = new AbortController();
    const matches: FdsnStationDistance[] = [];
    setWaveformProbeState("probing");

    const run = async () => {
      for (let offset = 0; offset < waveformCandidates.length && matches.length < 6; offset += 3) {
        const batch = waveformCandidates.slice(offset, offset + 3);
        const results = await Promise.all(batch.map(async (candidate) => {
          try {
            return await probeFdsnWaveform(
              candidate.station,
              5,
              oceanResponseEvent.originTime,
              controller.signal,
            ) ? candidate : null;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            return null;
          }
        }));
        if (!active || controller.signal.aborted) return;
        matches.push(...results.filter((candidate): candidate is FdsnStationDistance => candidate !== null));
        matches.sort((a, b) => a.distanceKm - b.distanceKm || a.station.id.localeCompare(b.station.id));
        setVerifiedWaveformStations([...matches]);

        const nearest = matches[0];
        const previous = autoWaveformSelection.current;
        if (nearest && !autoNiedWaveformSelection.current?.stationId && (
          previous?.eventKey !== eventStationKey
          || nearest.distanceKm + 0.01 < previous.distanceKm
        )) {
          autoWaveformSelection.current = {
            eventKey: eventStationKey,
            stationId: nearest.station.id,
            distanceKm: nearest.distanceKm,
          };
          setShowWaveformStations(true);
          focusStation(nearest.station, "waveform-auto");
          const autoPrefix = autoGlobalEventKey === eewReportKey(oceanResponseEvent) ? "global" : "event";
          setWaveformAutoPlayKey(`${autoPrefix}:${eventStationKey}:${nearest.station.id}`);
        }
      }
      if (!active) return;
      setWaveformProbeState(matches.length ? "ready" : "unavailable");
      const originAgeMs = Date.now() - Date.parse(oceanResponseEvent.originTime);
      if (!matches.length && originAgeMs >= -60_000 && originAgeMs < 15 * 60_000) {
        retryTimer = window.setTimeout(() => setWaveformProbeAttempt((attempt) => attempt + 1), 30_000);
      }
    };
    void run().catch((error) => {
      if (!active || error instanceof DOMException && error.name === "AbortError") return;
      setWaveformProbeState("unavailable");
    });
    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [autoGlobalEventKey, autoSelectWaveformStation, eventStationKey, focusStation, oceanResponseEvent, setShowWaveformStations, waveformCandidates, waveformProbeAttempt]);

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

  const replayStationHistoryProfile = useMemo(() => {
    if (!replayEvent || !selectedStation || isCencStation(selectedStation)) return null;
    return prepareReplayStationResponse(
      replayEvent,
      [selectedStation],
      isKmaStation(selectedStation) || (isGlobalStation(selectedStation) && !isCwaStation(selectedStation)) ? "intensity" : "shindo",
    );
  }, [replayEvent, selectedStation]);
  const replayStationHistory = useMemo<StationSample[]>(() => {
    if (!replayEvent || !selectedStation || isCencStation(selectedStation) || !replayStationHistoryProfile) return [];
    const originTime = Date.parse(replayEvent.originTime);
    if (!Number.isFinite(originTime)) return [];
    const lastStep = Math.max(0, Math.round(replaySeismicSeconds * 4));
    const firstStep = Math.max(0, lastStep - HISTORY_LIMIT + 1);
    const samples: StationSample[] = [];
    for (let step = firstStep; step <= lastStep; step += 1) {
      const elapsedSeconds = step / 4;
      const value = simulatePreparedReplayStationResponse(replayStationHistoryProfile, elapsedSeconds).ranks[selectedStation.id] ?? 0;
      samples.push({
        timestamp: originTime + elapsedSeconds * 1000,
        value,
        label: isKmaStation(selectedStation) || (isGlobalStation(selectedStation) && !isCwaStation(selectedStation))
          ? `回放烈度 ${intensityRomanLabel(value)}`
          : `回放震度 ${jmaShindoLabel(value)}`,
      });
    }
    return samples;
  }, [replayEvent, replaySeismicSeconds, replayStationHistoryProfile, selectedStation]);
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
    if (event.hypocenterKnown !== false) {
      focusMap(`event:${eewReportKey(event)}`, event.latitude, event.longitude, 6, true);
    }
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

  const chooseInstitutionMagnitudeBand = (band: InstitutionMagnitudeBand) => {
    setInstitutionMagnitudeBand(band);
    setInstitutionReportLimit(INSTITUTION_REPORT_PAGE_SIZE);
  };

  const toggleInstitutionReportSource = (source: EarthquakeSourceId) => {
    setInstitutionReportSources((current) => current.includes(source)
      ? current.filter((candidate) => candidate !== source)
      : INSTITUTION_REPORT_SOURCE_ORDER.filter((candidate) => current.includes(candidate) || candidate === source));
    setInstitutionReportLimit(INSTITUTION_REPORT_PAGE_SIZE);
  };

  const chooseAllInstitutionReportSources = (enabled: boolean) => {
    setInstitutionReportSources(enabled ? INSTITUTION_REPORT_SOURCE_ORDER : []);
    setInstitutionReportLimit(INSTITUTION_REPORT_PAGE_SIZE);
  };

  const chooseShakeMapReport = (report: EarthquakeEvent) => {
    setShakeMapReport(report);
    setShowUsgsShakeMap(true);
    chooseInstitutionReport(report);
  };

  const choosePagerReport = (report: EarthquakeEvent) => {
    setPagerReport(report);
    setShowPagerCities(true);
    setPagerEvent(report);
    setPanelTab("exposure");
    chooseInstitutionReport(report);
  };

  const chooseDyfiReport = (report: EarthquakeEvent) => {
    setDyfiEvent(report);
    chooseInstitutionReport(report);
  };

  const chooseJshisReport = (report: EarthquakeEvent) => {
    setJshisTarget({
      latitude: report.latitude,
      longitude: report.longitude,
      label: `${EARTHQUAKE_SOURCE_LABELS[report.source]} · ${report.place}`,
    });
    chooseInstitutionReport(report);
  };

  const chooseCencReport = (reportId: string, shouldFocus = true) => {
    setSelectedCencId(reportId);
    setPanelTab("intensity");
    const summary = cencReports.find((report) => report.id === reportId);
    if (summary && shouldFocus) focusMap(`cenc-report:${reportId}`, summary.latitude, summary.longitude, 7);
  };

  const chooseSnetEvent = (eventId: string) => {
    if (eventId === "__live__") {
      setSelectedSnetEventId(null);
      setSelectedSnetReportId(null);
      setSnetViewMode("measured");
      setPanelTab("snet");
      return;
    }
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
    const strongest = [...(oceanCatalogue?.stations ?? [])]
      .filter((station) => {
        const rank = displayedOceanRanks[station.id];
        return displayedOceanMode === "measured" ? Number.isFinite(rank) : (rank ?? Number.NEGATIVE_INFINITY) >= 0.25;
      })
      .sort((a, b) => (displayedOceanRanks[b.id] ?? 0) - (displayedOceanRanks[a.id] ?? 0))[0];
    if (strongest) focusStation(strongest);
    setPanelTab("snet");
  };

  const focusStrongestGlobalResponse = () => {
    const arrived = new Set(globalSimulation?.arrivedStationIds ?? []);
    const strongest = [...globalResponseStations]
      .filter((station) => arrived.has(station.id))
      .sort((a, b) => (globalSimulation?.ranks[b.id] ?? 0) - (globalSimulation?.ranks[a.id] ?? 0))[0];
    if (strongest) focusStation(strongest);
  };

  const focusStrongestCwaResponse = () => {
    const arrived = new Set(cwaSimulation?.arrivedStationIds ?? []);
    const strongest = [...cwaStations]
      .filter((station) => arrived.has(station.id))
      .sort((a, b) => (cwaSimulation?.ranks[b.id] ?? 0) - (cwaSimulation?.ranks[a.id] ?? 0))[0];
    if (strongest) focusStation(strongest);
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
  const selectedIsGlobalFdsn = Boolean(selectedStation && isGlobalStation(selectedStation) && !isCwaStation(selectedStation));
  const selectedUsesMmi = Boolean(selectedStation && (isKmaStation(selectedStation) || isCencStation(selectedStation)));
  const selectedDisplayColor = selectedIsGlobalFdsn
    ? fdsnWaveformStationColor(selectedRank ?? 0)
    : selectedUsesMmi
      ? mmiIntensityColor(selectedRank ?? 0)
      : jmaShindoColor(selectedRank ?? 0);
  const selectedOrigin = selectedEvent ? Date.parse(selectedEvent.originTime) : 0;
  const previewEvent = warningOverlayTab === "selected" && selectedEvent && clock < selectedPreviewUntil ? selectedEvent : null;
  const rawMapEvent = replayEvent ?? previewEvent ?? liveWavefrontEvent ?? persistentRegionalEvent ?? autoGlobalEvent ?? latestEvent;
  const mapEvent = useMemo(
    () => enrichLiveEewWithOfficialAreas(rawMapEvent, institutionReports),
    [institutionReports, rawMapEvent],
  );
  const persistentRegionalMapEvent = useMemo(
    () => enrichLiveEewWithOfficialAreas(persistentRegionalImpactEvent, institutionReports),
    [institutionReports, persistentRegionalImpactEvent],
  );
  const cameraEventCandidate = replayEvent ?? liveWavefrontEvent ?? autoGlobalEvent ?? persistentRegionalEvent ?? latestEvent;
  const cameraEvent = autoOpenWniMonitor && cameraEventCandidate && cameraEventCandidate.hypocenterKnown !== false
    ? cameraEventCandidate
    : null;
  const visibleWniCameras = useMemo(
    () => showWniCameras ? selectWniCamerasForViewport(wniCameras, mapViewport) : [],
    [mapViewport, showWniCameras, wniCameras],
  );
  const closestWniCamera = useMemo(
    () => cameraEvent && wniCameras.length ? nearestWniCamera(wniCameras, cameraEvent) : null,
    [cameraEvent?.latitude, cameraEvent?.longitude, wniCameras],
  );
  const mapOrigin = mapEvent ? Date.parse(mapEvent.originTime) : 0;
  const impactElapsed = replayEvent
    ? replaySeismicSeconds
    : rawMapEvent === liveWavefrontEvent && mapOrigin
      ? Math.max(0, Math.min(300, (clock - mapOrigin) / 1000))
      : null;
  const impactRegions = useMemo(
    () => mergeImpactRegionCollections(jmaRegions, eastAsiaImpactRegions),
    [eastAsiaImpactRegions, jmaRegions],
  );
  const currentAffectedLayers = useMemo(
    () => affectedRegionLayers(impactRegions, jmaSeismicSites, mapEvent, impactElapsed),
    [impactElapsed, impactRegions, jmaSeismicSites, mapEvent],
  );
  const supplementPersistentRegionalOfficial = Boolean(
    !replayEvent
      && persistentRegionalMapEvent
      && (!mapEvent || eewReportKey(mapEvent) !== eewReportKey(persistentRegionalMapEvent)),
  );
  const persistentRegionalOfficialRegions = useMemo(
    () => supplementPersistentRegionalOfficial && persistentRegionalMapEvent
      ? affectedRegionLayers(impactRegions, jmaSeismicSites, persistentRegionalMapEvent, null).official
      : null,
    [impactRegions, jmaSeismicSites, persistentRegionalMapEvent, supplementPersistentRegionalOfficial],
  );
  const affectedLayers = useMemo(() => ({
    local: currentAffectedLayers.local,
    official: mergeImpactRegionCollections(currentAffectedLayers.official, persistentRegionalOfficialRegions)
      ?? currentAffectedLayers.official,
  }), [currentAffectedLayers, persistentRegionalOfficialRegions]);
  const localAdministrativeRegionCount = affectedLayers.local.features
    .filter((feature) => !feature.properties.contour).length;
  const activeTsunamiRegions = useMemo<TsunamiRegionCollection>(() => {
    if (!tsunamiRegions || !displayedJmaTsunami?.active) return { type: "FeatureCollection", features: [] };
    const activeAreas = new Map(displayedJmaTsunami.areas.map((area) => [area.name, area]));
    return {
      type: "FeatureCollection",
      features: tsunamiRegions.features.flatMap((feature) => {
        const area = activeAreas.get(feature.properties.name);
        return area ? [{
          ...feature,
          properties: {
            ...feature.properties,
            grade: area.grade,
            level: area.level,
          },
        }] : [];
      }),
    };
  }, [displayedJmaTsunami, tsunamiRegions]);
  const waveOrigin = wavefrontEvent ? Date.parse(wavefrontEvent.originTime) : 0;
  const waveNow = replayEvent ? waveOrigin + replaySeismicSeconds * 1000 : clock;
  const replayPropagationActive = Boolean(replayEvent && isReplayPropagationActive(replaySeconds));
  const showWaves = replayEvent
    ? replayPropagationActive
    : Boolean(liveWavefrontEvent);
  const userWarningLocation = Number.isFinite(userStation.lat) && Number.isFinite(userStation.lon)
    ? { latitude: userStation.lat, longitude: userStation.lon }
    : null;
  const sWaveArrivalSeconds = wavefrontEvent && userWarningLocation
    ? seismicWaveArrivalSeconds(wavefrontEvent, userWarningLocation, 3.5)
    : Number.POSITIVE_INFINITY;
  const sWaveElapsedSeconds = replayEvent
    ? replaySeconds
    : waveOrigin
      ? Math.max(0, (clock - waveOrigin) / 1000)
      : 0;
  const sWaveRemainingSeconds = sWaveArrivalSeconds - sWaveElapsedSeconds;
  const sWaveArrived = sWaveRemainingSeconds <= 0;
  const sWaveWarningVisible = Boolean(
    showWaves
      && wavefrontEvent
      && userWarningLocation
      && Number.isFinite(sWaveArrivalSeconds)
      && sWaveRemainingSeconds > -12,
  );
  const userSurfaceDistanceKm = wavefrontEvent && userWarningLocation
    ? haversineKm(wavefrontEvent, userWarningLocation)
    : 0;
  const userExpectedIntensity = wavefrontEvent && userWarningLocation
    ? usesShindoScaleForLocation(userWarningLocation)
      ? `预计震度 ${jmaShindoLabel(jmaShindoRank(calculateJmaShindo(wavefrontEvent, userWarningLocation)))}`
      : `预计烈度 ${intensityRomanLabel(calculateLocalIntensity(wavefrontEvent, userWarningLocation))}`
    : "预计烈度 --";
  const globalAutoPresentation = Boolean(!replayEvent && autoGlobalEvent && rawMapEvent === autoGlobalEvent);
  const rawMapDetectionStationIds = globalAutoPresentation
    ? EMPTY_STATION_IDS
    : replayEvent
      ? replayPropagationActive
        ? replaySimulation?.activeStationIds ?? EMPTY_STATION_IDS
        : EMPTY_STATION_IDS
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
  const measuredOceanCount = displayedOceanMode === "measured" ? Object.keys(displayedOceanRanks).length : 0;
  const activeGlobalCount = globalSimulation?.arrivedStationIds.length ?? 0;
  const activeCwaCount = cwaSimulation?.arrivedStationIds.length ?? 0;
  const jmaRealtimeWarning = activeEews.find((event) => event.source === "JMA" && event.relay !== "Catalogue" && event.warning && !event.cancelled) ?? null;
  const jmaRealtimeIntensity = activeEews.find((event) => event.source === "JMA" && event.observedIntensity && !event.cancelled) ?? null;
  const cwaRealtimeWarning = activeEews.find((event) => event.source === "CWA" && event.relay !== "Catalogue" && event.warning && !event.cancelled) ?? null;
  const latestCwaOfficialReport = institutionReports.find((event) => event.source === "cwa") ?? null;
  const oceanHistorySelected = displayedOceanMode === "measured" && Boolean(snetMeasuredFrame) && !selectedSnetEvent?.active;
  const oceanResponseActive = displayedOceanMode === "measured"
    ? Boolean(selectedSnetEvent?.active && activeOceanCount)
    : Boolean(activeOceanCount);
  const overlayEvent = warningOverlayTab === "selected"
    ? selectedEvent ?? persistentRegionalEvent ?? autoGlobalEvent ?? latestEvent
    : persistentRegionalEvent ?? autoGlobalEvent ?? latestEvent;
  const latestDisplayEvent = persistentRegionalEvent ?? latestEvent;
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
  const niedWaveformCandidates = useMemo(() => {
    if (!mapDetectionSelectionActive || !mapDetectionStationIds.length || !catalogue?.stations.length) return [];
    const activeIds = new Set(mapDetectionStationIds);
    const strongest = catalogue.stations
      .filter((station) => activeIds.has(station.id))
      .sort((a, b) => (mapDetectionRanks[b.id] ?? 0) - (mapDetectionRanks[a.id] ?? 0))[0];
    if (!strongest) return [];
    const cells = buildNiedDetectionGridCells(
      catalogue.stations,
      mapDetectionStationIds,
      mapDetectionRanks,
      niedGridAnchor(strongest),
    );
    return rankNiedWaveformCandidates(
      waveformFdsnStations,
      cells,
      strongest.latitude,
      strongest.longitude,
      waveformEventTime,
    );
  }, [catalogue, mapDetectionRanks, mapDetectionSelectionActive, mapDetectionStationIds, waveformEventTime, waveformFdsnStations]);
  const niedWaveformCandidateKey = niedWaveformCandidates
    .slice(0, 30)
    .map((candidate) => `${candidate.mode}:${candidate.station.id}`)
    .join("|");
  const niedWaveformCandidatesRef = useRef(niedWaveformCandidates);
  niedWaveformCandidatesRef.current = niedWaveformCandidates;
  const niedWaveformSessionKey = mapDetectionSelectionActive && mapDetectionStationIds.length
    ? replayEvent ? `replay:${eewReportKey(replayEvent)}` : "live"
    : null;
  const hasNiedWaveformCandidates = Boolean(niedWaveformCandidateKey);

  useEffect(() => {
    if (!autoSelectWaveformStation) {
      autoNiedWaveformSelection.current = null;
      niedWaveformProbeSession.current = null;
      return;
    }
    if (!niedWaveformSessionKey) {
      autoNiedWaveformSelection.current = null;
      niedWaveformProbeSession.current = null;
      if (waveformAutoPlayKey?.startsWith("nied:")) setWaveformAutoPlayKey(null);
      return;
    }
    if (niedWaveformProbeSession.current === niedWaveformSessionKey || !hasNiedWaveformCandidates) return;
    niedWaveformProbeSession.current = niedWaveformSessionKey;
    const controller = new AbortController();
    let active = true;
    const run = async () => {
      const candidates = niedWaveformCandidatesRef.current;
      const inside = candidates.filter((candidate) => candidate.mode === "inside").slice(0, 12);
      const nearest = candidates.filter((candidate) => candidate.mode === "nearest").slice(0, 24);
      let selected: typeof candidates[number] | null = null;
      for (const group of [inside, nearest]) {
        for (let offset = 0; offset < group.length && !selected; offset += 3) {
          const batch = group.slice(offset, offset + 3);
          const checks = await Promise.all(batch.map(async (candidate) => {
            try {
              const available = await probeFdsnWaveform(
                candidate.station,
                5,
                waveformEventTime,
                controller.signal,
              );
              return available ? candidate : null;
            } catch (error) {
              if (error instanceof DOMException && error.name === "AbortError") throw error;
              return null;
            }
          }));
          selected = checks.find((candidate): candidate is typeof group[number] => candidate !== null) ?? null;
        }
        if (selected) break;
      }
      if (!active || !selected) return;
      autoNiedWaveformSelection.current = {
        sessionKey: niedWaveformSessionKey,
        stationId: selected.station.id,
        mode: selected.mode,
      };
      autoNiedSelectionSession.current = niedWaveformSessionKey;
      setVerifiedWaveformStations((current) => [
        selected,
        ...current.filter((candidate) => candidate.station.id !== selected.station.id),
      ].sort((a, b) => a.distanceKm - b.distanceKm));
      setShowWaveformStations(true);
      focusStation(selected.station, "waveform-auto");
      setWaveformAutoPlayKey(`nied:${selected.mode}:${niedWaveformSessionKey}:${selected.station.id}`);
    };
    void run().catch((error) => {
      if (!active || error instanceof DOMException && error.name === "AbortError") return;
      niedWaveformProbeSession.current = null;
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [autoSelectWaveformStation, focusStation, hasNiedWaveformCandidates, niedWaveformSessionKey, setShowWaveformStations, waveformAutoPlayKey, waveformEventTime]);

  useEffect(() => {
    if (!autoSelectWaveformStation) {
      autoNiedSelectionSession.current = null;
      return;
    }
    const sessionKey = replayEvent ? `replay:${eewReportKey(replayEvent)}` : "live";
    if (autoNiedWaveformSelection.current?.sessionKey === sessionKey
      && autoNiedWaveformSelection.current.stationId) {
      autoNiedSelectionSession.current = sessionKey;
      return;
    }
    if (eventStationKey && autoWaveformSelection.current?.eventKey === eventStationKey && verifiedWaveformStations.length) {
      autoNiedSelectionSession.current = null;
      return;
    }
    if (!mapDetectionSelectionActive || !mapDetectionStationIds.length) {
      autoNiedSelectionSession.current = null;
      return;
    }
    if (autoNiedSelectionSession.current === sessionKey) return;
    const activeIds = new Set(mapDetectionStationIds);
    const strongest = [...(catalogue?.stations ?? [])]
      .filter((station) => activeIds.has(station.id))
      .sort((a, b) => (mapDetectionRanks[b.id] ?? 0) - (mapDetectionRanks[a.id] ?? 0))[0];
    if (!strongest) return;
    autoNiedSelectionSession.current = sessionKey;
    focusStation(strongest, "nied-auto");
  }, [autoSelectWaveformStation, catalogue, eventStationKey, focusStation, mapDetectionRanks, mapDetectionSelectionActive, mapDetectionStationIds, replayEvent, verifiedWaveformStations.length]);

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
      replaySoundClock.current = {
        sessionKey: `replay:${eewReportKey(selectedEvent)}`,
        seconds: replaySeconds,
      };
      replayResponseSoundState.current = {
        sessionKey: `replay:${eewReportKey(selectedEvent)}`,
        arrived: Boolean(replaySimulation?.arrivedStationIds.length),
      };
      if (seismicAlertSoundEnabled) {
        void primeReplayAudio()
          .then(() => playSoundAsset("general-countdown"))
          .then(() => playSoundAsset("srev-prompt"));
      } else {
        void primeReplayAudio();
      }
      focusMap(`replay:${eewReportKey(selectedEvent)}`, selectedEvent.latitude, selectedEvent.longitude, 5, true);
    }
    setReplayPlaying((value) => !value);
  };

  const verifiedWaveformIndex = selectedStation
    ? verifiedWaveformStations.findIndex(({ station }) => station.id === selectedStation.id)
    : -1;
  const focusVerifiedWaveformStation = useCallback((direction: -1 | 1) => {
    if (verifiedWaveformStations.length < 2) return;
    const currentIndex = verifiedWaveformIndex >= 0 ? verifiedWaveformIndex : 0;
    const nextIndex = (currentIndex + direction + verifiedWaveformStations.length) % verifiedWaveformStations.length;
    focusStation(verifiedWaveformStations[nextIndex].station, "waveform-auto");
  }, [focusStation, verifiedWaveformIndex, verifiedWaveformStations]);
  const focusPreviousVerifiedWaveformStation = useCallback(
    () => focusVerifiedWaveformStation(-1),
    [focusVerifiedWaveformStation],
  );
  const focusNextVerifiedWaveformStation = useCallback(
    () => focusVerifiedWaveformStation(1),
    [focusVerifiedWaveformStation],
  );
  const selectedWaveformDistance = verifiedWaveformIndex >= 0
    ? verifiedWaveformStations[verifiedWaveformIndex].distanceKm
    : null;
  const selectedWaveformAutoPlayKey = selectedStation && isGlobalStation(selectedStation)
    && (autoNiedWaveformSelection.current?.stationId === selectedStation.id
      || autoWaveformSelection.current?.stationId === selectedStation.id)
    ? waveformAutoPlayKey
    : null;
  const selectedWaveformAutoPlayLabel = selectedWaveformAutoPlayKey?.startsWith("nied:nearest:")
    ? "NIED 框内无可用波形 · 最近站已切换，从预计 P 波到时滚动"
    : selectedWaveformAutoPlayKey?.startsWith("nied:inside:")
      ? "NIED 框内波形站联动 · 已从预计 P 波到时开始滚动"
      : "自动选站联动 · 已自动开始波形滚动";
  const monitorWidgetContent: Record<MonitorWidgetId, ReactNode> = {
    tsunami: showJmaTsunami && displayedJmaTsunami?.active ? <section className={`jma-tsunami-alert ${displayedJmaTsunami.state}`} aria-live="assertive">
      <header><AlertTriangle size={16} /><strong>JMA · {displayedJmaTsunami.title}</strong><em>{replayEvent ? "REPLAY" : "LIVE"}</em></header>
      <div className="jma-tsunami-alert-legend">
        <span><i className="major" />大海啸警报</span>
        <span><i className="warning" />海啸警报</span>
        <span><i className="advisory" />海啸注意报</span>
      </div>
      <footer><b>{displayedJmaTsunami.areas.length} 个预报区</b><span>{displayedJmaTsunami.issuedAt ? formatTime(displayedJmaTsunami.issuedAt) : "发布时间待确认"}</span></footer>
    </section> : null,
    warning: <section className="seismic-map-warning-overlay">
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
    </section>,
    nied: <button className={`seismic-detection-card ${replayEvent ? replayDetected ? `detected replay ${mapDetectionSeverity}` : "replay" : niedDetection.detected ? `detected ${mapDetectionSeverity}` : ""}`} onClick={() => replayEvent ? focusReplayDetection() : focusStrongestDetection("NIED")} disabled={replayEvent ? !mapDetectionStationIds.length : !niedDetection.activeStationIds.length}>
      <span><i />{replayEvent ? "NIED 回放模拟" : "NIED 实时"}</span><strong>{replayEvent ? `震度 ${jmaShindoLabel(replaySimulation?.maxRank ?? 0)}` : niedDetection.currentMaxLabel}</strong><small>{replayEvent ? replayDetected ? `${mapDetectionStationIds.length} 站 · 已形成检知框` : `${mapDetectionStationIds.length} 站响应` : niedDetection.detected ? `${niedDetection.activeStationIds.length} 站 · ${niedDetection.clusterCount} 簇` : "摇晃检知待机"}</small><time>{replayEvent ? `T+${replaySeconds.toFixed(2)} s` : niedFrame ? formatTime(niedFrame.dataTime) : "等待帧"}</time>
    </button>,
    kma: <button className={`seismic-detection-card ${activeKmaCount ? "detected" : ""}`} onClick={() => focusStrongestDetection("KMA-PEWS")} disabled={!activeKmaCount}>
      <span><i />KMA-PEWS</span><strong>{replayEvent ? `烈度 ${intensityRomanLabel(kmaReplaySimulation?.maxRank ?? 0)}` : kmaDetection.currentMaxLabel}</strong><small>{replayEvent ? `${activeKmaCount} 站 · 回放模拟` : kmaDetection.detected ? `${kmaDetection.activeStationIds.length} 站 · ${kmaDetection.clusterCount} 簇` : "实时摇晃检知待机"}</small><time>{replayEvent ? `T+${replaySeconds.toFixed(2)} s` : kmaDetection.updatedAt ? formatTime(kmaDetection.updatedAt) : "建立 60 秒基线"}</time>
    </button>,
    jma: <button className={`seismic-detection-card ${jmaRealtimeWarning ? "detected red" : jmaRealtimeIntensity ? "detected yellow" : ""}`} onClick={() => (jmaRealtimeWarning ?? jmaRealtimeIntensity) && chooseEvent(jmaRealtimeWarning ?? jmaRealtimeIntensity!)} disabled={!jmaRealtimeWarning && !jmaRealtimeIntensity}>
      <span><i />JMA 震度速报</span><strong>{jmaRealtimeWarning ? `预警震度 ${jmaRealtimeWarning.maxIntensity}` : jmaRealtimeIntensity ? `实测震度 ${jmaRealtimeIntensity.maxIntensity}` : "无速报"}</strong><small>{jmaRealtimeWarning ? `${jmaRealtimeWarning.affectedAreas?.length ?? 0} 区 · 第 ${jmaRealtimeWarning.serial} 报` : jmaRealtimeIntensity ? `${jmaRealtimeIntensity.affectedAreas?.length ?? 0} 区 · 官方受灾区域已上色` : jmaIntensityState === "online" ? "震度速报通道在线" : "震度速报通道连接中"}</small><time>{(jmaRealtimeWarning ?? jmaRealtimeIntensity) ? formatTime((jmaRealtimeWarning ?? jmaRealtimeIntensity)!.announcedAt) : "等待 JMA 官方报文"}</time>
    </button>,
    cwa: <button className={`seismic-detection-card ${cwaRealtimeWarning || activeCwaCount ? "detected yellow" : ""}`} onClick={() => cwaRealtimeWarning ? chooseEvent(cwaRealtimeWarning) : focusStrongestCwaResponse()} disabled={!cwaRealtimeWarning && !activeCwaCount}>
      <span><i />CWA / CWASN</span><strong>{cwaRealtimeWarning ? `震度 ${cwaRealtimeWarning.maxIntensity}` : cwaSimulation ? `震度 ${jmaShindoLabel(cwaSimulation.maxRank)}` : "待机"}</strong><small>{cwaRealtimeWarning ? `${cwaRealtimeWarning.affectedAreas?.length ?? 0} 区 · 官方预警中继` : activeCwaCount ? `${activeCwaCount} 站传播响应 · 检知框为本地模拟` : latestCwaOfficialReport ? `最近官方报告 M ${latestCwaOfficialReport.magnitude.toFixed(1)}` : "官方报告通道待机"}</small><time>{cwaRealtimeWarning ? formatTime(cwaRealtimeWarning.announcedAt) : oceanResponseEvent ? `T+${oceanResponseElapsed.toFixed(2)} s` : latestCwaOfficialReport ? formatTime(latestCwaOfficialReport.time) : "等待数据"}</time>
    </button>,
    global: <button className={`seismic-detection-card ${activeGlobalCount ? "detected" : ""}`} onClick={focusStrongestGlobalResponse} disabled={!activeGlobalCount}>
      <span><i />全球 FDSN 响应</span><strong>{globalSimulation ? `MMI ${globalSimulation.maxRank.toFixed(1)}` : "待机"}</strong><small>{activeGlobalCount ? `${activeGlobalCount} 站已被 P 波扫过并保持显示` : "等待有效事件"}</small><time>{oceanResponseEvent ? `T+${oceanResponseElapsed.toFixed(2)} s` : "等待数据"}</time>
    </button>,
    ocean: <button className={`seismic-detection-card ocean ${oceanResponseActive ? "detected" : ""}`} onClick={focusStrongestOceanResponse} disabled={displayedOceanMode === "measured" ? !snetMeasuredRows.length : !activeOceanCount}>
      <span><i />S-net / DONET / N-net</span><strong>{displayedOceanMode === "measured" && snetMeasuredFrame ? `震度 ${displayRankLabel(snetMeasuredFrame.maxIntensity)} · ${snetMeasuredFrame.maxIntensity.toFixed(2)}` : oceanSimulation ? `震度 ${oceanSimulation.maxRank.toFixed(1)}` : "待机"}</strong><small>{displayedOceanMode === "measured" && snetMeasuredFrame ? selectedSnetEvent ? oceanHistorySelected ? `${measuredOceanCount} 站观测 · 历史已结束` : `${measuredOceanCount} 站观测 · MSIL 实测反算` : `${measuredOceanCount} 站观测 · 最新帧（微小值也显示）` : activeOceanCount ? `${activeOceanCount} 站 · ${oceanMode === "replay" ? "回放模拟" : "EEW 本地预测"}` : "等待有效地震事件"}</small><time>{displayedOceanMode === "measured" && snetMeasuredFrame ? formatTime(snetMeasuredFrame.timestamp) : oceanResponseEvent ? `T+${oceanResponseElapsed.toFixed(2)} s` : "等待数据"}</time>
    </button>,
  };
  const visibleMonitorWidgetIds = MONITOR_WIDGET_IDS.filter((widgetId) => monitorWidgetContent[widgetId] !== null);

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
              <SourceIndicator label="P2P / JMA 震度速报" state={jmaIntensityState} latency={jmaIntensityLatency} />
              <SourceIndicator label="INGV Early-est 授权源" state={earlyEstState} latency={earlyEstLatency} />
              <SourceIndicator label="GlobalQuake 授权源" state={globalQuakeState} latency={globalQuakeLatency} />
              <SourceIndicator label="JMA 海啸预报 code 552" state={jmaTsunamiState} latency={jmaTsunamiLatency} />
              <SourceIndicator label={`CENC 烈度多源后端${cencOfficialEgressMode === "http-proxy" ? " · NSTI 7893" : cencOfficialEgressMode === "config-error" ? " · 代理配置错误" : ""}`} state={cencState} latency={cencLatency} />
              <SourceIndicator label="MSIL S-net 实测历史" state={snetState} latency={snetSnapshot?.latencyMs ?? null} />
              <SourceIndicator label="CWA 官方地震报告 API" state={cwaOfficialState} latency={cwaOfficialLatency} />
              <SourceIndicator label={`全球机构报告 ${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL}`} state={officialState} latency={officialLatency} />
              <SourceIndicator
                label={`全球 FDSN 目录 ${globalStationSnapshot?.returnedCount ?? 0}`}
                state={globalStationState}
                latency={globalStationSnapshot
                  ? Math.max(0, ...globalStationSnapshot.sources.filter((source) => source.status === "ok").map((source) => source.latencyMs ?? 0)) || null
                  : null}
              />
              <SourceIndicator
                label={`FDSN 原始波形通道 ${waveformStationSnapshot?.returnedCount ?? 0}`}
                state={waveformStationState}
                latency={waveformStationSnapshot
                  ? Math.max(0, ...waveformStationSnapshot.sources.filter((source) => source.status === "ok").map((source) => source.latencyMs ?? 0)) || null
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
            <div className="seismic-global-auto-locate">
              <label className="toggle-row"><input type="checkbox" checked={movieModeEnabled} onChange={(event) => setMovieModeEnabled(event.target.checked)} />电影模式 <em>{!movieModeEnabled ? "关闭" : movieCameraMode === "locked" ? "固定视野" : `${eligibleGlobalEvents.length} 个震源轮巡`}</em></label>
              <div className="seismic-movie-camera-modes" role="group" aria-label="电影模式镜头方式">
                <button
                  type="button"
                  className={movieCameraMode === "locked" ? "active" : ""}
                  disabled={!movieModeEnabled}
                  onClick={() => setMovieCameraMode("locked")}
                ><MapIcon size={13} />固定当前视野</button>
                <button
                  type="button"
                  className={movieCameraMode === "auto" ? "active" : ""}
                  disabled={!movieModeEnabled}
                  onClick={() => {
                    setMovieCameraMode("auto");
                    setAutoLocateGlobalEarthquakes(true);
                  }}
                ><LocateFixed size={13} />阈值自动镜头</button>
              </div>
              {movieModeEnabled && movieCameraMode === "locked" && <small>程序化镜头已锁定在当前范围：纬度 {mapViewport.minLatitude.toFixed(2)}–{mapViewport.maxLatitude.toFixed(2)}、经度 {mapViewport.minLongitude.toFixed(2)}–{mapViewport.maxLongitude.toFixed(2)}；仍可手动平移缩放，点击测站只更新详情。</small>}
              {movieModeEnabled && movieCameraMode === "auto" && <small>{autoGlobalEvent
                ? `镜头 ${autoGlobalEvent.place} · M ${(autoGlobalEvent.magnitude ?? 0).toFixed(1)}；${eligibleGlobalEvents.length > 1 ? `每 5 秒轮巡 ${eligibleGlobalEvents.length} 个震源，新震源立即抢占。` : "等待其他震源进入队列。"}`
                : "等待达到阈值的全球机构或授权预警；新震源会立即抢占镜头。"
              }</small>}
              <label className="toggle-row"><input type="checkbox" checked={autoLocateGlobalEarthquakes} disabled={movieModeEnabled && movieCameraMode === "locked"} onChange={(event) => setAutoLocateGlobalEarthquakes(event.target.checked)} />全球地震达到阈值时自动定位 <em>{autoGlobalEvent ? "已激活" : "监视中"}</em></label>
              <label className="seismic-receive-threshold">
                <span><strong>接收并写入历史阈值</strong><output>M {receiveMagnitudeThreshold.toFixed(1)}+</output></span>
                <input type="range" min="1" max="9" step="0.5" value={receiveMagnitudeThreshold} aria-label="全球地震预警接收并写入历史震级阈值" onInput={(event) => setReceiveMagnitude(Number(event.currentTarget.value))} />
                <small>达到此阈值的实时中继或官方机构报告会进入预警历史并驱动 P / S 波传播；不会因此自动移动镜头。</small>
              </label>
              <label className="seismic-auto-locate-threshold">
                <span><strong>电影模式自动定位阈值</strong><output>M {autoMagnitudeThreshold.toFixed(1)}+</output></span>
                <input type="range" min="1" max="9" step="0.5" value={autoMagnitudeThreshold} disabled={!autoLocateGlobalEarthquakes || (movieModeEnabled && movieCameraMode === "locked")} aria-label="电影模式全球地震自动定位震级阈值" onInput={(event) => setAutoLocateMagnitude(Number(event.currentTarget.value))} />
              </label>
              {!movieModeEnabled && <small>{autoGlobalEvent ? `正在跟踪 ${autoGlobalEvent.place} · M ${(autoGlobalEvent.magnitude ?? 0).toFixed(1)}；无 NIED 检知框，已激活传播测站与最近波形站。` : "自动定位只作用于已接收事件；达到定位阈值后定位震中、激活全球测站，并核验最近可用原始波形。"}</small>}
            </div>
            {(globalStationError || waveformStationError || cwaStationError) && <p className="seismic-source-error">{[globalStationError, waveformStationError, cwaStationError].filter(Boolean).join("；")}</p>}
          </section>
          <section className="control-section seismic-tsunami-control">
            <div className="section-title"><span><Waves /></span><strong>JMA 海啸预报</strong></div>
            <div className={`jma-tsunami-status ${displayedJmaTsunami?.state ?? (replayEvent ? "clear" : jmaTsunamiState)}`}>
              <header><AlertTriangle size={15} /><strong>{displayedJmaTsunami?.title ?? (replayEvent ? replayTsunamiEpisode ? "等待回放中的首份海啸预报" : "当前事件没有匹配的海啸历史" : "正在读取气象厅海啸预报")}</strong><em>{displayedJmaTsunami?.active ? `${displayedJmaTsunami.areas.length} 区` : replayEvent ? "REPLAY" : jmaTsunamiState === "online" ? "监视中" : "连接中"}</em></header>
              <p>{displayedJmaTsunami?.issuedAt ? `${replayEvent ? "回放报文" : "气象厅最近发布"}：${formatTime(displayedJmaTsunami.issuedAt)}` : replayEvent ? `历史报文 ${replayTsunamiEpisode?.reports.length ?? 0} 份` : "尚未取得发布时间"}{displayedJmaTsunami?.stale ? " · 当前显示缓存并重连" : ""}</p>
              <div className="jma-tsunami-legend" aria-label="JMA 海啸预报等级">
                <span><i className="major" />大海啸警报</span>
                <span><i className="warning" />海啸警报</span>
                <span><i className="advisory" />海啸注意报</span>
              </div>
            </div>
            <label className="toggle-row"><input type="checkbox" checked={showJmaTsunami} onChange={(event) => setShowJmaTsunami(event.target.checked)} />JMA 海啸预报区 <em>{tsunamiRegions?.features.length ?? "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={jmaTsunamiSoundEnabled} onChange={(event) => setJmaTsunamiSoundEnabled(event.target.checked)} />海啸预报 / 解除回放音效 <em>{jmaTsunamiSoundEnabled ? "启用" : "关闭"}</em></label>
            <output className={jmaTsunamiSoundStatus.includes("阻止") ? "error" : ""}>{jmaTsunamiSoundEnabled ? jmaTsunamiSoundStatus : "海啸回放音效已关闭"}</output>
            <a className="seismic-tsunami-source-link" href={jmaTsunami?.sourceUrl ?? "https://www.data.jma.go.jp/multi/tsunami/index.html?lang=jp"} target="_blank" rel="noreferrer">打开气象厅官方海啸信息<ExternalLink size={12} /></a>
            {(jmaTsunamiError || jmaTsunamiHistoryError) && <p className="seismic-source-error">{[jmaTsunamiError, jmaTsunamiHistoryError && `历史：${jmaTsunamiHistoryError}`].filter(Boolean).join("；")}</p>}
          </section>
          <section className="control-section">
            <div className="section-title"><span><Layers3 /></span><strong>测站图层</strong></div>
            <label className="seismic-layer-complexity"><span><strong>图层复杂度</strong><output>{normalizedMapLayerComplexity}/6</output></span><input type="range" min="1" max="6" step="1" value={normalizedMapLayerComplexity} aria-label="地图图层复杂度 1 到 6" onChange={(event) => setMapLayerComplexity(Number(event.target.value))} /><small>级别越低越少绘制测站、标签与背景产品，优先保障传播回放帧率。</small></label>
            <label className="toggle-row"><input type="checkbox" checked={showNied} onChange={(event) => setShowNied(event.target.checked)} />NIED K-NET / KiK-net <em>{catalogue?.stations.length ?? "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showKma} onChange={(event) => setShowKma(event.target.checked)} />韩国 KMA-PEWS <em>{kmaStations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showCenc} onChange={(event) => setShowCenc(event.target.checked)} />CENC 仪器烈度 <em>{cencReport ? `${cencReport.stations.length} / ${cencMetrics.length} 可定位` : "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showOcean} onChange={(event) => setShowOcean(event.target.checked)} />S-net 海底测站 <em>{oceanCatalogue?.counts["S-net"] ?? "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showOtherOcean} onChange={(event) => setShowOtherOcean(event.target.checked)} />DONET / N-net <em>{oceanCatalogue ? (oceanCatalogue.counts.DONET1 ?? 0) + (oceanCatalogue.counts.DONET2 ?? 0) + (oceanCatalogue.counts["N-net"] ?? 0) : "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showGlobalStations} onChange={(event) => setShowGlobalStations(event.target.checked)} />全球 FDSN 测站 <em>{globalFdsnStations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showWaveformStations} onChange={(event) => setShowWaveformStations(event.target.checked)} />FDSN 原始波形测站（粉色） <em>{waveformFdsnStations.length || "--"}</em></label>
            <div className="fdsn-manual-picker">
              <input
                type="search"
                aria-label="搜索 FDSN 原始波形测站"
                placeholder="搜索网络、台站代码或名称"
                value={waveformStationSearch}
                onChange={(event) => setWaveformStationSearch(event.target.value)}
                disabled={!manualFdsnStations.length}
              />
              <select
                aria-label="手动选择 FDSN 原始波形测站"
                value={selectedManualFdsnStationId}
                onChange={(event) => {
                  const station = manualFdsnStations.find((candidate) => candidate.id === event.target.value);
                  if (station) {
                    focusStation(station);
                    setWaveformStationSearch("");
                  }
                }}
                disabled={!manualFdsnStations.length}
              >
                <option value="">手动选择波形测站（待机也可查看）</option>
                {manualFdsnOptions.map((station) => <option key={station.id} value={station.id}>{station.network} {station.stationCode} · {station.stationName}</option>)}
              </select>
              <span>搜索结果最多显示 120 个（地图层仍显示全部测站）；点击后实际核验并读取最新 5 分钟 miniSEED</span>
            </div>
            <label className="toggle-row"><input type="checkbox" checked={showCwaStations} onChange={(event) => setShowCwaStations(event.target.checked)} />CWA 台湾 CWASN <em>{cwaStations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showPalertStations} onChange={(event) => setShowPalertStations(event.target.checked)} />台湾 P-Alert 强震网 <em>{palertSnapshot?.stations.length || "--"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showGnssStations} onChange={(event) => setShowGnssStations(event.target.checked)} />中国大陆GNSS站点 · 模拟 MMI <em>{showGnssStations && gnssSimulation ? `${GNSS_STATIONS.length} · ${gnssSimulation.maxRank.toFixed(1)}` : GNSS_STATIONS.length}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showLocalImpact} onChange={(event) => setShowLocalImpact(event.target.checked)} />本地预测烈度 / 震度区域 <em>{localAdministrativeRegionCount} / {impactRegions?.features.length ?? "--"} 区</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showOfficialImpact} onChange={(event) => setShowOfficialImpact(event.target.checked)} />官方影响地区 <em>{affectedLayers.official.features.length}</em></label>
            {regionalBoundaryError && <p className="seismic-source-error">中港台行政区边界：{regionalBoundaryError}</p>}
            <a className="seismic-tsunami-source-link" href={palertSnapshot?.sourceUrl ?? "https://palert.earth.sinica.edu.tw/stations"} target="_blank" rel="noreferrer">打开 P-Alert 官方站点目录<ExternalLink size={12} /></a>
            {palertState !== "online" && palertError && <p className="seismic-source-error">P-Alert：{palertError}</p>}
          </section>
          <section className="control-section seismic-wni-camera-control">
            <div className="section-title"><span><Video /></span><strong>现场摄像头</strong></div>
            <label className="toggle-row"><input type="checkbox" checked={showWniCameras} onChange={(event) => setShowWniCameras(event.target.checked)} />WNI现场摄像头 <em>{wniCameras.length || "--"}</em></label>
            <div className={`seismic-wni-camera-source ${showWniCameras ? wniCameraState : "disabled"}`}>
              <span><i />{!showWniCameras ? "图层已关闭" : wniCameraState === "online" ? `已载入 ${wniCameras.length} 个全国点位` : wniCameraState === "error" ? "目录连接失败" : wniCameraState === "stale" ? "保留旧目录并刷新" : "正在载入 WNI 全国目录"}</span>
              <button title="刷新 WNI 摄像头目录" aria-label="刷新 WNI 摄像头目录" onClick={() => setWniCameraReloadKey((value) => value + 1)} disabled={!showWniCameras}><RefreshCw size={13} /></button>
            </div>
            <a className="seismic-tsunami-source-link" href={WNI_CAMERA_MAP_URL} target="_blank" rel="noreferrer">打开 WNI 官方全国地图<ExternalLink size={12} /></a>
            {showWniCameras && wniCameraError && <p className="seismic-source-error">WNI：{wniCameraError}</p>}
          </section>
          <section className="control-section seismic-fault-control">
            <div className="section-title"><span><Layers3 /></span><strong>地质构造图层</strong></div>
            <label className="toggle-row"><input type="checkbox" checked={showGlobalFaults} onChange={(event) => setShowGlobalFaults(event.target.checked)} />全球断裂带 <em>{globalFaults?.metadata?.sourceFeatureCount ?? (showGlobalFaults ? "加载中" : "关闭")}</em></label>
            <div className="seismic-fault-legend" aria-label="全球断裂带最近活动年代分级">
              <span><i className="older" />年代较老 / 未知</span>
              <span><i className="late-quaternary" />晚第四纪</span>
              <span><i className="holocene" />全新世</span>
              <span><i className="recent" />历史 / 近期</span>
            </div>
            <p className="seismic-fault-note">按 GEM 的 last_movement 字段分级：绿色不代表“无断层”，仅表示活动年代较老或资料未知。</p>
            <a className="seismic-tsunami-source-link" href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noreferrer">打开 GEM 全球活动断层数据库<ExternalLink size={12} /></a>
            {globalFaultError && <p className="seismic-source-error">全球断裂带：{globalFaultError}</p>}
          </section>
          <section className="control-section seismic-jshis-control">
            <div className="section-title"><span><Layers3 /></span><strong>J-SHIS 日本官方产品</strong></div>
            <label className="toggle-row"><input type="checkbox" checked={showJshisHazard} disabled={!jshisLocation?.hazard} onChange={(event) => { setShowJshisHazard(event.target.checked); if (event.target.checked && jshisLocation) focusJshisLocation(jshisLocation); }} />概率地震动网格 <em>{jshisLocation?.hazard?.meshcode ?? "未查询"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showJshisSite} disabled={!jshisLocation?.site} onChange={(event) => { setShowJshisSite(event.target.checked); if (event.target.checked && jshisLocation) focusJshisLocation(jshisLocation); }} />浅层地盘网格 <em>{jshisLocation?.site?.meshcode ?? "未查询"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={showJshisFault} disabled={!jshisFault} onChange={(event) => { setShowJshisFault(event.target.checked); if (event.target.checked && jshisFault) focusJshisFault(jshisFault); }} />所选断层面 <em>{jshisFault?.code ?? "未选择"}</em></label>
            {jshisLocation
              ? <><div className="seismic-jshis-actions"><button onClick={() => focusJshisLocation(jshisLocation)}><LocateFixed size={12} />定位网格</button><button onClick={() => setJshisTarget({ latitude: jshisLocation.latitude, longitude: jshisLocation.longitude, label: `J-SHIS 网格 ${jshisLocation.hazard?.meshcode ?? jshisLocation.site?.meshcode ?? ""}` })}>查看四类位置产品</button>{jshisFault && <button onClick={() => focusJshisFault(jshisFault)}><LocateFixed size={12} />定位断层</button>}</div><p className="seismic-fault-note">官方位置 API 返回单个约 250 米网格，载入及重新开启图层时会定位到 13 级；黄色为长期概率危险度，青色为浅层地盘，红色断层点云使用 WebGL。</p></>
              : <p className="seismic-fault-note">选择日本周边测站或机构报告后点击 J-SHIS，才会读取官方位置端点；不会在全球范围伪造结果。</p>}
            <a className="seismic-tsunami-source-link" href="https://www.j-shis.bosai.go.jp/en/api-list" target="_blank" rel="noreferrer">打开 J-SHIS API 文档<ExternalLink size={12} /></a>
          </section>
          <section className="control-section seismic-shakemap-control">
            <div className="section-title"><span><MapIcon /></span><strong>USGS ShakeMap</strong></div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showUsgsShakeMap}
                disabled={!shakeMapReport || (!usgsShakeMap && !usgsShakeMapLoading)}
                onChange={(event) => setShowUsgsShakeMap(event.target.checked)}
              />
              官方 MMI 等值线
              <em>{usgsShakeMapLoading ? "加载中" : usgsShakeMap ? `${visibleShakeMapContours?.features.length ?? 0}/${usgsShakeMap.contours.features.length} 组` : "未选择"}</em>
            </label>
            {usgsShakeMap && <div className="seismic-shakemap-levels" aria-label="ShakeMap MMI 分级图层">
              {SHAKEMAP_MMI_LEVELS.map((level) => {
                const available = availableShakeMapMmiLevels.has(level);
                return <label key={level} className={available ? "" : "unavailable"} title={available ? `显示或隐藏 MMI ${intensityRomanLabel(level)} 等值线` : `当前官方产品没有 MMI ${intensityRomanLabel(level)} 等值线`}>
                  <input
                    type="checkbox"
                    checked={enabledShakeMapMmiLevels.includes(level)}
                    disabled={!available}
                    onChange={() => toggleShakeMapMmiLevel(level)}
                  />
                  <i style={{ background: mmiIntensityColor(level) }} />
                  <span>{intensityRomanLabel(level)}</span>
                </label>;
              })}
            </div>}
            {usgsShakeMap
              ? <><div className="seismic-shakemap-meta"><span>最大 MMI <strong>{usgsShakeMap.maxMmi.toFixed(1)}</strong></span><span>{usgsShakeMap.reviewStatus}</span></div><p className="seismic-fault-note">已锁定：{shakeMapReport?.place ?? usgsShakeMap.eventId}。自动轮巡不会清空或重新请求此图层。</p></>
              : <p className="seismic-fault-note">在机构报告中选择带 ShakeMap 标记的 USGS 地震后叠加；没有官方产品时不会显示按钮或图层。</p>}
            {usgsShakeMap && <a className="seismic-tsunami-source-link" href={usgsShakeMap.officialUrl} target="_blank" rel="noreferrer">打开 USGS ShakeMap 产品页<ExternalLink size={12} /></a>}
            {usgsShakeMapError && <p className="seismic-source-error">ShakeMap：{usgsShakeMapError}</p>}
          </section>
          <section className="control-section seismic-shakemap-control">
            <div className="section-title"><span><BarChart3 /></span><strong>USGS PAGER</strong></div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showPagerCities}
                disabled={!pagerReport || (!usgsPager && !usgsPagerLoading)}
                onChange={(event) => setShowPagerCities(event.target.checked)}
              />
              Show all cities 烈度标
              <em>{usgsPagerLoading ? "加载中" : usgsPager ? `${usgsPager.allCities.length} 城市` : "未选择"}</em>
            </label>
            {usgsPager
              ? <><div className="seismic-shakemap-meta"><span>人口暴露 <strong>{usgsPager.populationExposure.totalPopulation.toLocaleString("zh-CN")}</strong></span><span>{usgsPager.alertLevel.toUpperCase()}</span></div><p className="seismic-fault-note">已锁定：{pagerReport?.place ?? usgsPager.eventId}。轮巡仅切换震中，不刷新已发布人口产品。</p><button className="seismic-control-product-button" onClick={() => pagerReport && setPagerEvent(pagerReport)}>打开三图与结构摘要</button></>
              : <p className="seismic-fault-note">选择带 PAGER 标记的 USGS 报告后，地图会绘制官方 all_cities 全部城市，不只显示默认 on_map 子集。</p>}
            {usgsPagerError && <p className="seismic-source-error">PAGER：{usgsPagerError}</p>}
          </section>
          <section className="control-section seismic-station-search">
            <div className="section-title"><span><Search /></span><strong>观测测站</strong></div>
            <div className="earthquake-source-actions"><button onClick={() => selectNearest(35.681, 139.767)}>东京</button><button onClick={() => selectNearest(37.5665, 126.978, "KMA")}>首尔</button></div>
            <label className="search-field"><span><Search size={14} /><input value={stationSearch} onChange={(event) => setStationSearch(event.target.value)} placeholder="名称、代码、地区" /></span></label>
            {searchResults.length > 0 && <div className="seismic-search-results">{searchResults.map((station) => <button key={station.id} onClick={() => { focusStation(station); setStationSearch(""); }}><strong>{station.stationName}</strong><small>{station.network} {station.stationCode}</small></button>)}</div>}
          </section>
          <section className="control-section seismic-sound-controls">
            <div className="section-title"><span><Volume2 /></span><strong>地震音效库</strong></div>
            <label className="toggle-row"><input type="checkbox" checked={seismicAlertSoundEnabled} onChange={(event) => setSeismicAlertSoundEnabled(event.target.checked)} />实时预警 / 回放报文与传播音效 <em>{seismicAlertSoundEnabled ? "启用" : "关闭"}</em></label>
            <label className="toggle-row"><input type="checkbox" checked={niedSoundEnabled} onChange={(event) => setNiedSoundEnabled(event.target.checked)} />实时 / 回放最大震度上升时播放 <em>{niedSoundEnabled ? "启用" : "关闭"}</em></label>
            <label className="seismic-sound-volume"><span>音量</span><input aria-label="NIED 检知音效音量" type="range" min="0" max="100" step="5" value={niedSoundVolume} onChange={(event) => setNiedSoundVolume(Number(event.target.value))} /><strong>{niedSoundVolume}%</strong></label>
            <div className="seismic-sound-preview"><select aria-label="试听震度等级" value={niedPreviewCue} onChange={(event) => setNiedPreviewCue(event.target.value as NiedSoundCue)}>{Object.keys(NIED_SOUND_CUES).map((cue) => <option key={cue} value={cue}>{cue.replace("shindo", "震度 ")}</option>)}</select><button title="试听所选震度音效" onClick={() => void playNiedCue(niedPreviewCue)}><Play size={14} />试听</button></div>
            <div className="seismic-sound-preview seismic-sound-library-preview"><select aria-label="试听地震音效库" value={soundPreviewAsset} onChange={(event) => setSoundPreviewAsset(event.target.value as SeismicSoundAssetId)}>{Object.entries(SEISMIC_SOUND_LIBRARY).map(([assetId, asset]) => <option key={assetId} value={assetId}>{asset.label}{customSoundUrlsRef.current.has(assetId as SeismicSoundAssetId) ? " · 自定义" : ""}</option>)}</select><button title="试听所选地震音效" onClick={() => void playSoundAsset(soundPreviewAsset)}><Play size={14} />试听</button></div>
            <div className="seismic-sound-custom"><label>替换所选音效<input type="file" accept="audio/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; const previous = customSoundUrlsRef.current.get(soundPreviewAsset); if (previous) URL.revokeObjectURL(previous); customSoundUrlsRef.current.set(soundPreviewAsset, URL.createObjectURL(file)); niedAudioBuffersRef.current.delete(soundPreviewAsset); setCustomSoundVersion((version) => version + 1); event.currentTarget.value = ""; }} /></label>{customSoundUrlsRef.current.has(soundPreviewAsset) && <button title="恢复内置音效" onClick={() => { const previous = customSoundUrlsRef.current.get(soundPreviewAsset); if (previous) URL.revokeObjectURL(previous); customSoundUrlsRef.current.delete(soundPreviewAsset); niedAudioBuffersRef.current.delete(soundPreviewAsset); setCustomSoundVersion((version) => version + 1); }}>恢复内置</button>}</div>
            <output className={niedSoundStatus.includes("阻止") ? "error" : ""}>{niedSoundEnabled ? niedSoundStatus : "音效已关闭"}</output>
            <output className={seismicSoundStatus.includes("阻止") || seismicSoundStatus.includes("超时") ? "error" : ""}>{seismicAlertSoundEnabled ? seismicSoundStatus : "实时预警 / 回放报文音效已关闭"}</output>
            <p className="seismic-fault-note">JMA 震度速报使用 detail（同一物理事件只播一次）；JMA/KMA/CWA/CENC 区域源的 issue/update/final/cancel 按报文状态去重播放；hypocenter 是自动定位；prompt/countdown 与 1–60s 是回放节点；detail 也用于首个 P/S 响应；intense 是强震；shindo 与 tsunami 按震度、海啸等级升级播放。全球目录与授权全球源不触发区域 EEW 音效。</p>
          </section>
          <section className="control-section seismic-legal-note">
            <div className="section-title"><span><AlertTriangle /></span><strong>数据级别</strong></div>
            <p>NIED 帧经 Yahoo 公开边缘端点读取；S-net 实测历史来自 MSIL 观测瓦片色值反算。JMA 海啸状态由 P2P 地震信息转发的气象厅 code 552 报文驱动，海岸预报线来自 JMA 官方 GIS；CWA API 金钥只在本机服务端读取官方 E-A0015 / E-A0016 地震报告，这些是震后报告，不冒充秒级 EEW。CWA 实时预警若出现则来自已标明 relay 的区域转发源。全球台站来自 FDSN Station，CWASN 位置来自 CWA GDMS，P-Alert 仅实时读取中研院官方站点目录并遵守其资料使用说明。WNI 摄像头图层读取 Weathernews 官方公开目录，缩略图和详情均直接指向官方站点。全球断裂带来自 GEM GAF-DB（CC BY-SA 4.0），是地质背景参考，不代表实时风险。所有本地推算和传播回放均不作为官方预警。</p>
          </section>
        </div>
      </aside>

      <main className="workspace earthquake-workspace seismic-workspace">
        <header className="topbar earthquake-topbar seismic-topbar">
          <div><h2>实时地震预警与全球专业测站监视</h2><p>区域实时台网 / 九机构地震目录 / 全球 FDSN · CWA CWASN</p></div>
          <div className="seismic-topbar-actions">
            <div className="status-strip">
            <div className={`earthquake-status-pill ${activeNiedCount ? "danger" : ""}`}><span>NIED 检知</span><strong>{activeNiedCount} 站</strong></div>
            <div className={`earthquake-status-pill ${activeKmaCount ? "danger" : ""}`}><span>KMA-PEWS</span><strong>{activeKmaCount} 站</strong></div>
            <div className={`earthquake-status-pill ${latestDisplayEvent?.warning ? "danger" : "ok"}`}><span>最新事件</span><strong>{latestDisplayEvent ? latestDisplayEvent.relay === "Catalogue" ? `${latestDisplayEvent.source} 机构报告` : `${latestDisplayEvent.source} 第 ${latestDisplayEvent.serial} 报` : "监视中"}</strong></div>
            <div className={`earthquake-status-pill ${officialState === "online" ? "ok" : "warn"}`}><span>机构报告</span><strong>{institutionReports.length} 条</strong></div>
            <div className={`earthquake-status-pill ${activeGlobalCount || activeCwaCount ? "danger" : ""}`}><span>全球 / CWA 响应</span><strong>{activeGlobalCount} / {activeCwaCount} 站</strong></div>
            <div className={`earthquake-status-pill ${oceanResponseActive ? "danger" : ""}`}><span>{oceanHistorySelected ? "S-net 历史回看" : "海底台网响应"}</span><strong>{activeOceanCount ? oceanHistorySelected ? `历史 ${activeOceanCount} 站` : `${activeOceanCount} 站` : "待机"}</strong></div>
            <div className={`earthquake-status-pill ${displayedJmaTsunami?.active ? "danger" : replayEvent || jmaTsunamiState === "online" ? "ok" : "warn"}`}><span>JMA 海啸</span><strong>{displayedJmaTsunami?.active ? displayedJmaTsunami.title : replayEvent ? displayedJmaTsunami?.cancelled ? "回放已解除" : "回放等待报文" : jmaTsunamiState === "online" ? "无警报" : "连接中"}</strong></div>
            <div className="earthquake-status-pill"><span>本地时间</span><strong>{formatTime(clock)}</strong></div>
            </div>
            <button className="seismic-settings-button" aria-label="打开实时地震设置" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}><Settings size={16} /><span>设置</span></button>
            {settingsOpen && <div className="seismic-settings-popover" role="dialog" aria-label="实时地震快速设置" onClick={(event) => event.stopPropagation()}>
              <header><div><strong>实时监控设置</strong><small>低档复杂度优先保证回放帧率</small></div><button aria-label="关闭实时地震设置" onClick={() => setSettingsOpen(false)}>×</button></header>
              <label className="toggle-row"><input type="checkbox" checked={autoSelectWaveformStation} onChange={(event) => setAutoSelectWaveformStation(event.target.checked)} />自动寻找最近可用波形测站 <em>{autoSelectWaveformStation ? "开启" : "关闭"}</em></label>
              <label className="toggle-row"><input type="checkbox" checked={autoOpenWniMonitor} onChange={(event) => setAutoOpenWniMonitor(event.target.checked)} />自动打开 WNI / 实时监控 <em>{autoOpenWniMonitor ? "开启" : "关闭"}</em></label>
              <label className="toggle-row"><input type="checkbox" checked={showWniCameras} onChange={(event) => setShowWniCameras(event.target.checked)} />显示 WNI 摄像头图层 <em>{showWniCameras ? "显示" : "隐藏"}</em></label>
              <label className="toggle-row"><input type="checkbox" checked={seismicAlertSoundEnabled} onChange={(event) => setSeismicAlertSoundEnabled(event.target.checked)} />实时预警与回放音效 <em>{seismicAlertSoundEnabled ? "开启" : "关闭"}</em></label>
              <label className="seismic-layer-complexity"><span><strong>图层复杂度</strong><output>{normalizedMapLayerComplexity}/6</output></span><input type="range" min="1" max="6" step="1" value={normalizedMapLayerComplexity} aria-label="地图图层复杂度 1 到 6" onChange={(event) => setMapLayerComplexity(Number(event.target.value))} /><small>1 仅事件与核心响应；6 显示完整测站、标签、产品和背景层。</small></label>
              <div className="seismic-settings-source-block"><div className="seismic-settings-source-heading"><strong>接收源</strong><button onClick={() => setEnabledEewSources([...LIVE_EEW_SOURCE_ORDER])}>全选</button><button onClick={() => setEnabledEewSources([])}>清空</button></div><div className="seismic-settings-source-grid">{LIVE_EEW_SOURCE_ORDER.map((source) => <label key={source}><input type="checkbox" checked={enabledEewSourceSet.has(source)} onChange={(event) => setEnabledEewSources((current) => event.target.checked ? [...new Set([...current, source])] : current.filter((item) => item !== source))} /><span>{source}</span></label>)}</div><small>关闭的源不会进入实时历史、自动定位或音效；历史记录不会被删除。</small></div>
            </div>}
          </div>
        </header>
        {(niedCatalogueError || oceanCatalogueError || jmaCatalogueError || tsunamiCatalogueError || regionalBoundaryError) && <div className="error-banner">台网目录更新失败：{[
          niedCatalogueError && `NIED：${niedCatalogueError}`,
          oceanCatalogueError && `海底台网：${oceanCatalogueError}`,
          jmaCatalogueError && `JMA：${jmaCatalogueError}`,
          tsunamiCatalogueError && `JMA 海啸：${tsunamiCatalogueError}`,
          regionalBoundaryError && `中港台边界：${regionalBoundaryError}`,
        ].filter(Boolean).join("；")}</div>}

        <section
          ref={primaryGridRef}
          className="seismic-primary-grid"
          style={{
            "--seismic-side-panel-width": `${normalizedSidePanelWidth}px`,
            "--seismic-map-panel-height": `${normalizedMapPanelHeight}px`,
          } as CSSProperties}
        >
          <div className="earthquake-map-panel seismic-map-panel">
            <header className="earthquake-panel-header">
              <div><strong>全球实时测站与烈震度影响地图</strong><span>{replayEvent ? "回放开始时 FDSN / CWASN 隐藏；P 波扫过后逐站出现并保持，S 波到达后更新峰值" : "勾选的 FDSN / CWASN 固定测站全量常驻；实时事件共用 P / S 波传播动画"}</span></div>
              <div className="seismic-map-header-actions">
                <div className="seismic-map-summary"><span><i className="nied" />NIED {catalogue?.stations.length ?? 0}</span><span><i className="kma" />KMA {kmaStations.length}</span><span><i className="cenc" />CENC {cencReport?.stations.length ?? 0}/{cencMetrics.length}</span><span><i className="ocean" />海底 {oceanCatalogue?.stations.length ?? 0}</span><span><i className="fdsn" />FDSN {globalFdsnStations.length}</span><span><i className="waveform" />波形层 {waveformFdsnStations.length} · {waveformProbeState === "probing" ? `事件核验中${verifiedWaveformStations.length ? ` ${verifiedWaveformStations.length}` : ""}` : waveformProbeState === "ready" ? `事件已核验 ${verifiedWaveformStations.length}` : waveformProbeState === "unavailable" ? "事件暂无" : "待机"}</span><span><i className="cwa" />CWA {cwaStations.length}</span><span><i className="palert" />P-Alert {palertSnapshot?.stations.length ?? 0}</span><span><i className="gnss" />GNSS {GNSS_STATIONS.length}{showGnssStations && gnssSimulation ? ` · MMI ${gnssSimulation.maxRank.toFixed(1)}` : ""}</span>{showGlobalFaults && <span><i className="fault" />断裂 {globalFaults?.metadata?.sourceFeatureCount ?? "--"}</span>}{jshisLocation && <span><i className="jshis" />J-SHIS {jshisLocation.hazard?.meshcode ?? jshisLocation.site?.meshcode}</span>}{showUsgsShakeMap && usgsShakeMap && <span><i className="shakemap" />ShakeMap {visibleShakeMapContours?.features.length ?? 0}/{usgsShakeMap.contours.features.length}</span>}{showPagerCities && usgsPager && <span><i className="pager" />PAGER 城市 {usgsPager.allCities.length}</span>}</div>
                <div className="seismic-map-interaction-switch" role="group" aria-label="地图操作模式">
                  <button className={mapInteractionMode === "drag" ? "active" : ""} aria-pressed={mapInteractionMode === "drag"} title="拖动地图" onClick={() => setMapInteractionMode("drag")}><Hand size={13} /><span>拖动</span></button>
                  <button className={mapInteractionMode === "select" ? "active" : ""} aria-pressed={mapInteractionMode === "select"} title="点击摄像头或测站" onClick={() => setMapInteractionMode("select")}><MousePointer2 size={13} /><span>点击</span></button>
                </div>
                <button className="seismic-map-theme-button" title="全球测站视图" aria-label="全球测站视图" onClick={() => commitMapFocus({ id: "global", latitude: 18, longitude: 0, zoom: 2, exact: true })}><Globe2 size={15} /></button>
                <button className="seismic-map-theme-button" title={mapTheme === "dark" ? "切换为浅色地图" : "切换为深色地图"} aria-label={mapTheme === "dark" ? "切换为浅色地图" : "切换为深色地图"} onClick={() => setMapTheme((value) => value === "dark" ? "light" : "dark")}>{mapTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
              </div>
            </header>
            <div ref={mapShellRef} className={`seismic-map-shell${sWaveWarningVisible ? " has-s-wave-warning" : ""}`}>
              {!catalogue && <div className="earthquake-map-loading"><Loader2 size={24} /><span>正在加载东亚测站目录</span></div>}
              <SeismicMap
                theme={mapTheme}
                interactionMode={mapInteractionMode}
                layerComplexity={normalizedMapLayerComplexity}
                niedStations={catalogue?.stations ?? []}
                kmaStations={kmaStations}
                oceanStations={oceanCatalogue?.stations ?? []}
                globalStations={globalFdsnStations}
                waveformStations={waveformFdsnStations}
                globalResponseStations={globalResponseStations}
                cwaStations={cwaStations}
                gnssStations={GNSS_STATIONS}
                verifiedWaveformStationIds={verifiedWaveformStationIds}
                palertStations={palertSnapshot?.stations ?? []}
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
                showWaveform={showWaveformStations}
                showCwa={showCwaStations}
                showGnss={showGnssStations}
                showPalert={showPalertStations}
                selectedStation={selectedStation}
                selectedEvent={mapEvent ?? null}
                waveEvent={wavefrontEvent}
                selectedReport={selectedInstitutionReport}
                estimate={estimate}
                estimateMode={replayEvent ? "replay" : "live"}
                replayRanks={replayEvent ? replaySimulation?.ranks ?? EMPTY_RANKS : null}
                replayMode={Boolean(replayEvent)}
                oceanRanks={displayedOceanRanks}
                globalRanks={globalSimulation?.ranks ?? EMPTY_RANKS}
                globalArrivedStationIds={globalSimulation?.arrivedStationIds ?? EMPTY_STATION_IDS}
                gnssRanks={gnssSimulation?.ranks ?? EMPTY_RANKS}
                gnssMode={replayEvent ? "replay" : "live"}
                cwaRanks={cwaSimulation?.ranks ?? EMPTY_RANKS}
                cwaArrivedStationIds={cwaSimulation?.arrivedStationIds ?? EMPTY_STATION_IDS}
                cwaDetectionStationIds={replayPropagationActive
                  ? cwaSimulation?.activeStationIds ?? EMPTY_STATION_IDS
                  : EMPTY_STATION_IDS}
                kmaArrivedStationIds={kmaReplaySimulation?.arrivedStationIds ?? EMPTY_STATION_IDS}
                oceanMode={displayedOceanMode}
                localRegions={affectedLayers.local}
                officialRegions={affectedLayers.official}
                tsunamiRegions={activeTsunamiRegions}
                globalFaults={globalFaults}
                jshisLocation={jshisLocation}
                jshisFault={jshisFault}
                shakeMap={usgsShakeMap}
                shakeMapContours={visibleShakeMapContours}
                pagerCities={usgsPager?.allCities ?? []}
                showLocalImpact={showLocalImpact}
                showOfficialImpact={showOfficialImpact}
                showTsunami={showJmaTsunami}
                showGlobalFaults={showGlobalFaults}
                showJshisHazard={showJshisHazard}
                showJshisSite={showJshisSite}
                showJshisFault={showJshisFault}
                showShakeMap={showUsgsShakeMap}
                showPagerCities={showPagerCities}
                showWniCameras={showWniCameras}
                wniCameras={visibleWniCameras}
                highlightedWniCameraId={closestWniCamera?.camera.id ?? null}
                detectionStationIds={mapDetectionStationIds}
                detectionRanks={mapDetectionRanks}
                kmaDetectionStationIds={replayEvent
                  ? replayPropagationActive
                    ? kmaReplaySimulation?.activeStationIds ?? EMPTY_STATION_IDS
                    : EMPTY_STATION_IDS
                  : kmaDetection.activeStationIds}
                kmaDetectionRanks={replayEvent
                  ? kmaReplaySimulation?.ranks ?? EMPTY_RANKS
                  : liveKmaDetectionRanks}
                detectionMode={replayEvent ? "replay" : "live"}
                detectionSessionKey={replayEvent ? `replay:${replayEvent.id}` : "live"}
                blinkNow={mapDetectionStationIds.length ? clock : 0}
                waveNow={waveNow}
                showWaves={showWaves}
                warningLocation={sWaveWarningVisible ? userStation : null}
                focusTarget={mapFocus}
                onSelectStation={focusStation}
                onViewportChange={updateMapViewport}
              />
              {sWaveWarningVisible && <section className={`seismic-s-wave-banner ${sWaveArrived ? "arrived" : "counting"}`} role="status" aria-live="assertive">
                <div className="seismic-s-wave-stripes" aria-hidden="true" />
                <div className="seismic-s-wave-title">
                  <Siren size={18} />
                  <span><strong>S-WAVE WARNING</strong><small>S 波到达警报 · {userStation.name}</small></span>
                </div>
                <output aria-label={sWaveArrived ? "S 波已到达定位点" : `S 波预计 ${formatSArrivalCountdown(sWaveRemainingSeconds)} 后到达定位点`}>
                  {sWaveArrived ? "已到达" : formatSArrivalCountdown(sWaveRemainingSeconds)}
                </output>
                <div className="seismic-s-wave-meta"><strong>{userExpectedIntensity}</strong><small>震中距 {userSurfaceDistanceKm.toFixed(0)} km</small></div>
                <div className="seismic-s-wave-stripes" aria-hidden="true" />
                <div className="seismic-s-wave-marquee"><span>{sWaveArrived ? "S 波已抵达定位点，请注意强烈摇晃并远离坠落物。" : `S 波正向定位点传播，预计 ${formatSArrivalCountdown(sWaveRemainingSeconds)} 后到达。`} 理论速度 3.5 km/s · {replayEvent ? `回放 T+${replaySeconds.toFixed(1)} s` : "实时传播定位"} · {wavefrontEvent?.place}</span></div>
              </section>}
              <SeismicIntensityLegend />
              {showWniCameras && <a className={`seismic-wni-camera-map-status ${wniCameraState}`} href={WNI_CAMERA_MAP_URL} target="_blank" rel="noreferrer" title="打开 WNI 官方全国摄像头地图">
                <Video size={15} />
                <span><strong>WNI现场摄像头</strong><small>{wniCameraState === "online" ? `当前视野 ${visibleWniCameras.length} / 全国 ${wniCameras.length}` : wniCameraState === "stale" ? `显示缓存 ${visibleWniCameras.length} 个点位` : wniCameraState === "error" ? "目录连接失败" : "正在载入全国点位"}</small></span>
                <ExternalLink size={12} />
              </a>}
              <SeismicCameraRelay
                event={cameraEvent}
                replayMode={Boolean(replayEvent)}
                replayTimestamp={replayEvent ? Date.parse(replayEvent.originTime) : null}
                wniCamera={closestWniCamera}
              />
              {monitorDragging && <div className="seismic-monitor-drop-zones" aria-hidden="true">
                {MONITOR_DOCKS.map((dock) => <span key={dock} className={monitorDropTarget === dock ? "active" : ""} data-dock={dock}><b>{dock === "top" ? "上方" : dock === "right" ? "右侧" : dock === "bottom" ? "下方" : "左侧"}</b></span>)}
              </div>}
              <div
                ref={monitorOverlayRef}
                className={`seismic-monitor-layer${monitorDragging ? " is-dragging" : ""}`}
                style={{ "--monitor-scale": normalizedMonitorScale } as CSSProperties}
              >
                <div className="seismic-monitor-toolbar">
                  <button
                    className="seismic-monitor-scale-handle"
                    aria-label="等比例缩放所有监视组件"
                    title="左右拖动等比例缩放；双击恢复 100%"
                    onPointerDown={beginMonitorResize}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      setMonitorScale(normalizedMonitorScale >= 1.6 ? 1 : clampMonitorScale(normalizedMonitorScale + 0.1));
                    }}
                    onDoubleClick={() => setMonitorScale(1)}
                  >
                    <GripVertical size={14} /><span>独立拖放</span><small>拖每张卡片上沿到地图四侧</small>
                  </button>
                  <output aria-label={`监视组件缩放 ${Math.round(normalizedMonitorScale * 100)}%`}>{Math.round(normalizedMonitorScale * 100)}%</output>
                </div>
                {MONITOR_DOCKS.map((dock) => <div className="seismic-monitor-rail" data-dock={dock} key={dock}>
                  {visibleMonitorWidgetIds.filter((widgetId) => normalizedMonitorWidgetDocks[widgetId] === dock).map((widgetId) => <article
                    className={`seismic-monitor-widget${MONITOR_WIDE_WIDGETS.has(widgetId) ? " is-wide" : ""}${draggingMonitorWidget === widgetId ? " is-dragging" : ""}`}
                    data-widget={widgetId}
                    key={widgetId}
                    style={{ "--monitor-drag-x": "0px", "--monitor-drag-y": "0px" } as CSSProperties}
                  >
                    <button
                      className="seismic-monitor-widget-drag-handle"
                      aria-label={`拖动${MONITOR_WIDGET_LABELS[widgetId]}组件到地图边缘停靠`}
                      title="拖至地图上、右、下、左侧停靠"
                      onPointerDown={(event) => beginMonitorDrag(widgetId, event)}
                      onClick={(event) => {
                        if (event.detail !== 0) return;
                        const currentIndex = MONITOR_DOCKS.indexOf(normalizedMonitorWidgetDocks[widgetId]);
                        setMonitorWidgetDocks((current) => ({
                          ...normalizeMonitorWidgetDocks(current, normalizedMonitorDock),
                          [widgetId]: MONITOR_DOCKS[(currentIndex + 1) % MONITOR_DOCKS.length],
                        }));
                      }}
                    ><GripVertical size={12} /><span>{MONITOR_WIDGET_LABELS[widgetId]}</span><small>拖动停靠</small></button>
                    {monitorWidgetContent[widgetId]}
                  </article>)}
                </div>)}
              </div>
              <div
                className="seismic-panel-resizer seismic-panel-resizer--height"
                role="separator"
                tabIndex={0}
                aria-label="调整地图面板高度"
                aria-orientation="horizontal"
                aria-valuemin={440}
                aria-valuemax={980}
                aria-valuenow={Math.round(normalizedMapPanelHeight)}
                title="拖动调整地图高度；方向键可微调"
                onPointerDown={(event) => beginPanelResize("horizontal", event)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") { event.preventDefault(); adjustMapPanelHeight(-24); }
                  if (event.key === "ArrowDown") { event.preventDefault(); adjustMapPanelHeight(24); }
                  if (event.key === "Home") { event.preventDefault(); setMapPanelHeight(440); }
                  if (event.key === "End") { event.preventDefault(); setMapPanelHeight(980); }
                }}
              ><span /></div>
            </div>
          </div>

          <div
            className="seismic-panel-resizer seismic-panel-resizer--width"
            role="separator"
            tabIndex={0}
            aria-label="调整地图与详情面板宽度"
            aria-orientation="vertical"
            aria-valuemin={300}
            aria-valuemax={620}
            aria-valuenow={Math.round(normalizedSidePanelWidth)}
            title="拖动调整地图与详情面板比例；方向键可微调"
            onPointerDown={(event) => beginPanelResize("vertical", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); adjustSidePanelWidth(24); }
              if (event.key === "ArrowRight") { event.preventDefault(); adjustSidePanelWidth(-24); }
              if (event.key === "Home") { event.preventDefault(); setSidePanelWidth(300); }
              if (event.key === "End") { event.preventDefault(); setSidePanelWidth(620); }
            }}
          ><span /></div>

          <aside className="seismic-professional-panel">
            <nav className="seismic-panel-tabs" aria-label="专业地震面板">
              <button className={panelTab === "station" ? "active" : ""} title="测站数据" onClick={() => setPanelTab("station")}><Antenna size={15} /><span>测站详情</span></button>
              <button className={panelTab === "intensity" ? "active" : ""} title="CENC 仪器烈度" onClick={() => setPanelTab("intensity")}><Database size={15} /><span>CENC 烈度</span></button>
              <button className={panelTab === "snet" ? "active" : ""} title="S-net 震度情报" onClick={() => setPanelTab("snet")}><Waves size={15} /><span>S-net 震度</span></button>
              <button className={panelTab === "exposure" ? "active" : ""} title="USGS PAGER 人口暴露" onClick={() => setPanelTab("exposure")}><BarChart3 size={15} /><span>人口暴露</span></button>
            </nav>
            <div className="seismic-panel-body">
              {panelTab === "station" && (
                selectedStation ? (
                  isGlobalStation(selectedStation) ? <>
                    <header className="seismic-station-heading"><span style={{ background: selectedDisplayColor }} /><div><strong>{selectedStation.stationName}</strong><small>{selectedStation.network} · {selectedStation.stationCode}</small></div><b>{isCwaStation(selectedStation) ? `CWASN · 震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `FDSN · MMI ${(selectedRank ?? 0).toFixed(1)}`}</b></header>
                    {!isCwaStation(selectedStation) && oceanResponseEvent && <div className={`fdsn-waveform-discovery ${waveformProbeState}`}>
                      {waveformProbeState === "probing" ? <Loader2 className="spin" size={13} /> : <Waves size={13} />}
                      <span>{waveformProbeState === "probing"
                        ? `正在按震中距核验原始波形${verifiedWaveformStations.length ? ` · 已找到 ${verifiedWaveformStations.length} 站` : ""}`
                        : waveformProbeState === "ready"
                          ? `已核验 ${verifiedWaveformStations.length} 个发震时段原始波形测站`
                          : "暂未找到发震时段可读取的原始波形，实时事件会自动重试"}</span>
                    </div>}
                    <dl className="earthquake-detail-list"><div><dt>坐标</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div><div><dt>海拔</dt><dd>{selectedStation.elevationM?.toFixed(0) ?? "--"} m</dd></div><div><dt>启用时间</dt><dd>{selectedStation.startTime ? formatTime(selectedStation.startTime, false) : "--"}</dd></div><div><dt>目录节点</dt><dd>{selectedStation.providers.join(" / ")}</dd></div><div><dt>事件响应</dt><dd>{oceanResponseEvent ? `${isCwaStation(selectedStation) ? `本地估算震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `本地估算 MMI ${(selectedRank ?? 0).toFixed(1)}`} · T+${oceanResponseElapsed.toFixed(1)} s` : "等待有效地震事件"}</dd></div></dl>
                    <div className="fdsn-provider-links">{stationProviderSources.filter((source) => selectedStation.providers.includes(source.id)).map((source) => <a key={source.id} href={source.officialUrl} target="_blank" rel="noreferrer"><i style={{ background: FDSN_PROVIDER_COLORS[source.id] }} />{source.label}<small>{source.status === "ok" ? `${source.latencyMs ?? "--"} ms` : "当前异常"}</small><ExternalLink size={12} /></a>)}</div>
                    <p className="seismic-data-label">{isCwaStation(selectedStation) ? "台站位置来自 CWA GDMS 的 CWASN 官方目录；地图变色与下方滚动是明确标注的本地传播估算，不是 CWA 实时波形或官方震度报告。" : "台站位置来自 FDSN Station；地图响应是本地传播估算，下方波形仅显示 Dataselect 返回并由浏览器解压的 miniSEED 原始计数，不从震度或震级合成。"}</p>
                    {isJshisPositionSupported(selectedStation.latitude, selectedStation.longitude) && <button className="seismic-station-jshis-button" onClick={() => setJshisTarget({ latitude: selectedStation.latitude, longitude: selectedStation.longitude, label: `${selectedStation.network} ${selectedStation.stationCode} · ${selectedStation.stationName}` })}><Layers3 size={14} />J-SHIS 位置风险 / 地盘 / 滑坡 / 断层</button>}
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
                    {isJshisPositionSupported(selectedStation.latitude, selectedStation.longitude) && <button className="seismic-station-jshis-button" onClick={() => setJshisTarget({ latitude: selectedStation.latitude, longitude: selectedStation.longitude, label: `${selectedStation.network} ${selectedStation.stationCode}` })}><Layers3 size={14} />J-SHIS 位置风险 / 地盘 / 滑坡 / 断层</button>}
                  </> : <>
                    <header className="seismic-station-heading"><span style={{ background: selectedDisplayColor }} /><div><strong>{selectedStation.stationName}</strong><small>{selectedStation.network} · {selectedStation.stationCode}</small></div><b>{isNiedStation(selectedStation) ? `震度 ${jmaShindoLabel(selectedRank ?? 0)}` : `烈度 ${intensityRomanLabel(selectedRank ?? 0)}`}</b></header>
                    <div className="seismic-gauge-grid"><article><Gauge size={18} /><span>{isNiedStation(selectedStation) ? "震度" : "烈度"}</span><strong>{isNiedStation(selectedStation) ? `${jmaShindoLabel(selectedRank ?? 0)} · ${(selectedRank ?? 0).toFixed(1)}` : `${intensityRomanLabel(selectedRank ?? 0)} · ${(selectedRank ?? 0).toFixed(1)}`}</strong><meter min="0" max={isKmaStation(selectedStation) ? 12 : 7} value={selectedRank ?? 0} /></article><article><Activity size={18} /><span>PGA 经验估算</span><strong>{motion.pgaGal.toFixed(2)} gal</strong><meter min="0" max="1000" value={motion.pgaGal} /></article><article><Waves size={18} /><span>PGV 经验估算</span><strong>{motion.pgvCms.toFixed(2)} cm/s</strong><meter min="0" max="100" value={motion.pgvCms} /></article></div>
                    <dl className="earthquake-detail-list"><div><dt>坐标</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div><div><dt>最新采样</dt><dd>{replayEvent ? `T+${replaySeconds.toFixed(2)} s` : rollingHistory.length ? formatTime(rollingHistory[rollingHistory.length - 1].timestamp) : "等待数据"}</dd></div><div><dt>采样类型</dt><dd>{isNiedStation(selectedStation) ? replayEvent ? "历史事件确定性回放模拟" : "NIED 离散实时强度" : replayEvent ? "历史事件确定性回放模拟" : "KMA-PEWS 官方逐秒 MMI"}</dd></div></dl>
                    <p className="seismic-data-label">{replayEvent ? "当前值来自历史事件的传播回放，不是 NIED 实测；PGA/PGV 仍为经验换算。" : "PGA/PGV 为根据震度换算的经验估算，不是测站原始加速度计数据。"}</p>
                    {isJshisPositionSupported(selectedStation.latitude, selectedStation.longitude) && <button className="seismic-station-jshis-button" onClick={() => setJshisTarget({ latitude: selectedStation.latitude, longitude: selectedStation.longitude, label: `${selectedStation.network} ${selectedStation.stationCode} · ${selectedStation.stationName}` })}><Layers3 size={14} />J-SHIS 位置风险 / 地盘 / 滑坡 / 断层</button>}
                  </>
                ) : <div className="seismic-empty"><MapPin size={28} /><strong>请在地图或搜索结果中选择测站</strong></div>
              )}

              {panelTab === "intensity" && <>
                <header className="seismic-section-heading"><div><strong>CENC 仪器烈度分布</strong><span>公开 24 列坐标导出 + 实时中继合并 · {cencProvider} · NSTI {cencOfficialEgressMode === "http-proxy" ? "7893 HTTP 代理" : cencOfficialEgressMode === "config-error" ? "代理配置错误" : "直连"}</span></div><b className={cencState === "online" ? "online" : ""}>{cencState === "online" ? "在线" : cencState === "stale" ? "缓存 · 重连中" : cencState === "error" ? "中断 · 重试中" : "连接中"}</b></header>
                <div className="seismic-cenc-picker"><select value={selectedCencId ?? ""} onChange={(event) => chooseCencReport(event.target.value)} disabled={!cencReports.length}><option value="">等待烈度报告</option>{cencReports.map((report) => <option key={report.id} value={report.id}>{formatTime(report.originTime)} · {report.place} M{report.magnitude?.toFixed(1) ?? "--"}</option>)}</select><button title="在地图定位报告" aria-label="在地图定位报告" disabled={!selectedCencId} onClick={() => selectedCencId && chooseCencReport(selectedCencId)}><LocateFixed size={16} /></button></div>
                {cencReport && cencReport.id === selectedCencId ? <>
                  <h3>{cencReport.place}</h3>
                  <div className="seismic-eew-metrics"><div><span>震级 / 深度</span><strong>M {cencReport.magnitude?.toFixed(1) ?? "--"} · {cencReport.depthKm?.toFixed(0) ?? "--"} km</strong></div><div><span>最大仪器烈度</span><strong>{cencMaxIntensity === null ? "--" : `${intensityRomanLabel(cencMaxIntensity)} · ${cencMaxIntensity.toFixed(1)}`}</strong></div><div><span>报告 / 可定位测站</span><strong>{cencMetrics.length} / {cencReport.stations.length}</strong></div></div>
                  {cencMetrics.length > cencReport.stations.length && <p className="seismic-source-error">国家地震科学数据中心公开表提供烈度、PGA 与震中距，但未公开这些记录的台站经纬度；应用只绘制实时源曾返回并已核验坐标的测站，不按震中距伪造位置。</p>}
                  <dl className="earthquake-detail-list"><div><dt>发震时刻</dt><dd>{formatTime(cencReport.originTime)}</dd></div><div><dt>报告生成</dt><dd>{formatTime(cencReport.createdAt)}</dd></div><div><dt>最大 PGA</dt><dd>{cencMaxPga?.toFixed(1) ?? "--"} gal</dd></div><div><dt>坐标</dt><dd>{cencReport.latitude.toFixed(3)}, {cencReport.longitude.toFixed(3)}</dd></div></dl>
                  <div className="seismic-cenc-station-list"><div><span>测站</span><span>仪器烈度</span><span>PGA</span></div>{cencMetrics.slice(0, 24).map((metric) => { const mappedStation = cencReport.stations.find((station) => station.stationCode === metric.stationCode); const networkCode = "networkCode" in metric ? metric.networkCode : "CENC"; return <button key={metric.id} disabled={!mappedStation} title={mappedStation ? "在地图定位测站" : "该条速报的官方坐标导出仍在更新"} onClick={() => mappedStation && focusStation(mappedStation)}><span><i style={{ background: cencIntensityColor(metric.intensity) }} /><b>{metric.stationName}</b><small>{networkCode} · {metric.stationCode}</small></span><strong>{intensityRomanLabel(metric.intensity)}</strong><em>{metric.pgaGal?.toFixed(1) ?? "--"} gal</em></button>; })}</div>
                  <p className="seismic-data-label">烈度、PGA 与 PGV 均来自当前实际提供方；国家地震科学数据中心公开页没有给出测站坐标时只列实测值，不在地图伪造测站位置。</p>
                </> : <div className="seismic-empty"><Loader2 className="spin" size={28} /><strong>正在读取 CENC 烈度详情</strong><span>{cencState === "stale" ? "后端正在切换公开源，已保留最后有效报告。" : cencState === "error" ? "FAN 与国家地震科学数据中心当前均不可达；未使用模拟烈度补数。" : "列表和详情由后端多源聚合统一更新。"}</span></div>}
              </>}

              {panelTab === "snet" && <>
                <header className="seismic-section-heading"><div><strong>S-net 震度情报</strong><span>{snetViewMode === "measured" ? selectedSnetEvent?.source === "screenshot" ? `截图补录 · ${selectedSnetEvent.reportCount} 份报告` : selectedSnetEvent ? `海しる MSIL 历史检知 · ${selectedSnetEvent.reportCount} 报` : `海しる MSIL 最新观测 · ${snetSnapshot?.availableFrameCount ?? 0} 个帧缓存${snetSnapshot && !snetSnapshot.backfillComplete && snetSnapshot.backfillPendingFrameCount !== null ? ` · 历史补录剩余 ${snetSnapshot.backfillPendingFrameCount} 帧` : ""}` : oceanResponseEvent ? `${oceanMode === "replay" ? "历史事件回放" : "当前 EEW 本地响应"} · ${oceanResponseEvent.place}` : "等待有效地震事件"}</span></div><b className={snetState === "online" ? "online" : "experimental"}>{snetViewMode === "measured" ? selectedSnetEvent?.source === "screenshot" ? "截图补录" : selectedSnetEvent ? "历史实测" : snetState === "online" ? snetSnapshot?.backfillComplete ? "最新实测在线" : "实时在线 · 补录中" : snetState === "stale" ? "缓存" : snetState === "error" ? "中断" : "加载中" : "实验性"}</b></header>
                <nav className="seismic-snet-mode-tabs" aria-label="S-net 数据模式">
                  <button className={snetViewMode === "measured" ? "active" : ""} onClick={() => setSnetViewMode("measured")}><Database size={14} />实测历史</button>
                  <button className={snetViewMode === "simulation" ? "active" : ""} onClick={() => setSnetViewMode("simulation")}><CircleGauge size={14} />本地推算</button>
                </nav>
                {snetViewMode === "measured" ? <>
                  <div className="seismic-snet-summary three"><div><span>{selectedSnetReport ? `${selectedSnetReport.source === "screenshot" ? "截图补录" : "MSIL"} 第 ${selectedSnetReport.reportNumber} 报` : selectedSnetEvent ? "MSIL 历史观测帧" : "MSIL 最新观测帧"}</span><strong>{selectedSnetReport ? formatTime(selectedSnetReport.observedAt) : snetMeasuredFrame ? formatTime(snetMeasuredFrame.timestamp) : "--"}</strong></div><div><span>最大连续震度</span><strong>{snetMeasuredFrame ? `${displayRankLabel(snetMeasuredFrame.maxIntensity)} · ${snetMeasuredFrame.maxIntensity.toFixed(2)}` : "-"}</strong></div><div><span>全部 / 震度 1 以上</span><strong>{snetMeasuredFrame ? `${snetMeasuredFrame.stations.length} / ${snetMeasuredFrame.activeStationCount}` : "0 / 0"} 站</strong></div></div>
                  <div className="seismic-snet-picker"><select aria-label="S-net 检知事件" value={selectedSnetEventId ?? "__live__"} onChange={(event) => chooseSnetEvent(event.target.value)} disabled={!snetSnapshot?.latestFrame}><option value="__live__">{snetSnapshot?.latestFrame ? `最新观测 ${formatTime(snetSnapshot.latestFrame.timestamp)} · 最大连续震度 ${snetSnapshot.latestFrame.maxIntensity.toFixed(2)}（微小值也显示）` : "等待最新观测"}</option>{snetSnapshot?.events.map((event) => <option key={event.id} value={event.id}>{formatTime(event.peakAt)} · {event.reportCount ?? event.reports?.length ?? 1} 报 · 最大震度 {displayRankLabel(event.maxIntensity)}{event.source === "screenshot" ? " · 截图补录" : ""}</option>)}</select><button title="定位最强 S-net 测站" aria-label="定位最强 S-net 测站" onClick={focusStrongestOceanResponse} disabled={!snetMeasuredRows.length}><LocateFixed size={16} /></button></div>
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

              {panelTab === "exposure" && <PagerExposurePanel pager={usgsPager} loading={usgsPagerLoading} error={usgsPagerError} />}
            </div>
            {selectedStation && isGlobalStation(selectedStation) && !isCwaStation(selectedStation) ? <FdsnWaveformPanel
              station={selectedStation}
              eventTime={waveformEventTime}
              verifiedIndex={verifiedWaveformIndex}
              verifiedCount={verifiedWaveformStations.length}
              distanceKm={selectedWaveformDistance}
              autoPlayKey={selectedWaveformAutoPlayKey}
              autoPlayLabel={selectedWaveformAutoPlayLabel}
              onPrevious={verifiedWaveformStations.length > 1 ? focusPreviousVerifiedWaveformStation : undefined}
              onNext={verifiedWaveformStations.length > 1 ? focusNextVerifiedWaveformStation : undefined}
            /> : <section className="seismic-station-rolling-panel" aria-live="polite">
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
                  <div className="seismic-replay-clock"><span>T+{replaySeconds.toFixed(replaySeconds < 300 ? 2 : 0)} s / {Math.round(replayDurationSeconds / 60)} min</span><strong>{selectedEvent ? formatTime(selectedOrigin + replaySeconds * 1000) : "--"}</strong></div>
                  <input className="seismic-replay-slider" type="range" min="0" max={replayDurationSeconds} step="0.25" value={replaySeconds} disabled={!selectedEvent} onChange={(event) => setReplaySeconds(Number(event.target.value))} />
                  <div className="seismic-replay-controls"><button title="回到起点" onClick={clearReplayPresentation}><SkipBack size={16} /></button><button className="primary" title={replayPlaying ? "暂停" : "播放"} disabled={!selectedEvent} onClick={toggleReplay}>{replayPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button title={`前进 ${Math.max(10, normalizedReplaySpeed)} 秒`} onClick={() => setReplaySeconds((value) => Math.min(replayDurationSeconds, value + Math.max(10, normalizedReplaySpeed)))}><FastForward size={16} /></button><label className="seismic-replay-speed"><span>倍速</span><select aria-label="历史回放速度" value={normalizedReplaySpeed} onChange={(event) => setReplaySpeed(Number(event.target.value) as ReplaySpeed)}><option value={1}>1x</option><option value={10}>10x</option><option value={60}>60x</option><option value={300}>300x</option></select></label><button title="查看右侧测站滚动" disabled={!selectedEvent} onClick={() => { setPanelTab("station"); focusReplayDetection(); }}><Activity size={16} /></button><button title="重置" onClick={clearReplayPresentation}><RotateCcw size={16} /></button></div>
                </div>
                <div>
                  <div className="seismic-wave-legend"><div><i className="p" /><span>P 波</span><strong>{selectedEvent ? waveRadiusKm(selectedEvent.originTime, 6, selectedOrigin + replaySeismicSeconds * 1000).toFixed(0) : 0} km</strong></div><div><i className="s" /><span>S 波</span><strong>{selectedEvent ? waveRadiusKm(selectedEvent.originTime, 3.5, selectedOrigin + replaySeismicSeconds * 1000).toFixed(0) : 0} km</strong></div></div>
                  <dl className="earthquake-detail-list"><div><dt>JMA 海啸回放</dt><dd>{replayTsunamiSnapshot ? `${replayTsunamiSnapshot.cancelled ? "预报解除" : replayTsunamiSnapshot.title} · ${formatTime(replayTsunamiSnapshot.issuedAt ?? selectedOrigin)}` : replayTsunamiEpisode ? `等待首报 · 共 ${replayTsunamiEpisode.reports.length} 份` : jmaTsunamiHistory ? "当前事件无匹配报文" : "历史报文加载中"}</dd></div><div><dt>NIED 陆地响应</dt><dd>{replaySimulation ? `${replaySimulation.activeStationIds.length} 站 / 最大震度 ${jmaShindoLabel(replaySimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>KMA-PEWS 响应</dt><dd>{kmaReplaySimulation ? `${kmaReplaySimulation.activeStationIds.length} 站 / 最大烈度 ${intensityRomanLabel(kmaReplaySimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>海底台网响应</dt><dd>{oceanSimulation ? `${oceanSimulation.activeStationIds.length} 站 / 最大震度 ${jmaShindoLabel(oceanSimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>全球 FDSN 响应</dt><dd>{globalSimulation ? `${globalSimulation.arrivedStationIds.length} 站已到达 / 最大 MMI ${globalSimulation.maxRank.toFixed(1)}` : "等待播放"}</dd></div><div><dt>CWA CWASN 响应</dt><dd>{cwaSimulation ? `${cwaSimulation.arrivedStationIds.length} 站已到达 / 最大震度 ${jmaShindoLabel(cwaSimulation.maxRank)}` : "等待播放"}</dd></div><div><dt>回放音效</dt><dd>NIED {niedSoundEnabled ? "启用" : "关闭"} / 海啸 {jmaTsunamiSoundEnabled ? "启用" : "关闭"}</dd></div><div><dt>P / S 速度</dt><dd>6.0 / 3.5 km/s（仅前 300 秒）</dd></div><div><dt>用途</dt><dd>传播时序与官方海啸报文复盘，不代表当前预警</dd></div></dl>
                  {replayEstimate ? <div className="seismic-replay-inference"><span><CircleGauge size={15} />回放本地震源反演</span><strong>{replayEstimate.latitude.toFixed(3)}, {replayEstimate.longitude.toFixed(3)}</strong><small>深度 {replayEstimate.depthKm.toFixed(1)} km · {replayEstimate.stationCount} 站 · 残差 {replayEstimate.residualMs} ms · 距官方 {replayEstimate.referenceDistanceKm?.toFixed(2) ?? "--"} km</small></div> : <div className="seismic-replay-inference waiting"><span><CircleGauge size={15} />等待至少 4 个模拟 P 波触发站</span><small>测站按理论到时逐一响应，满足条件后自动生成震源。</small></div>}
                </div>
              </div>
            </>}

            {bottomTab === "warnings" && <>
              <header className="seismic-lower-heading seismic-warning-heading"><div><strong>实时预警事件历史</strong><span>接收阈值 M{receiveMagnitudeThreshold.toFixed(1)}+ · 显示 {filteredHistoryEvents.length} / 全部 {historyEvents.length} 个事件；区域 EEW 持久保留，全球目录保留近 7 天且每机构独立限额</span></div><div className="seismic-warning-filter"><span>机构筛选</span><select aria-label="预警历史机构筛选" value={warningSourceFilter} onChange={(event) => { setWarningSourceFilter(event.target.value as WarningSourceFilter); setWarningHistoryLimit(60); }}><option value="ALL">全部机构（{historyEvents.length}）</option>{LIVE_EEW_SOURCE_ORDER.map((source) => <option key={source} value={source}>{source}（{historySourceCounts[source]}）</option>)}</select></div><b>{officialState === "online" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 机构目录在线` : officialState === "stale" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 机构目录可用 · 含缓存` : "机构目录连接中"}</b></header>
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
              <header className="seismic-lower-heading"><div><strong>全球机构地震报告</strong><span>近 90 天 M4+ · 按震级分组和机构独立筛选；分页可展开全部结果，不再固定截断 240 条</span></div><div><span>显示 / 筛选 / 全部</span><strong>{displayedInstitutionReports.length} / {filteredInstitutionReports.length} / {institutionReports.length}</strong></div><b>{officialState === "online" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 来源在线` : officialState === "stale" ? `${institutionSourceCount}/${INSTITUTION_SOURCE_TOTAL} 来源可用 · 含缓存` : "来源连接中"}</b></header>
              {institutionReports.length ? <>
                <div className="seismic-institution-filterbar">
                  <label className="seismic-institution-magnitude-filter"><span>震级分类</span><select aria-label="机构报告震级分类" value={activeInstitutionMagnitudeBand.id} onChange={(event) => chooseInstitutionMagnitudeBand(event.target.value as InstitutionMagnitudeBand)}>{INSTITUTION_MAGNITUDE_BANDS.map((band) => <option key={band.id} value={band.id}>{band.label}（{institutionMagnitudeCounts[band.id]}）</option>)}</select></label>
                  <div className="seismic-institution-source-filter" role="group" aria-label="机构报告来源筛选">{INSTITUTION_REPORT_SOURCE_ORDER.map((source) => <label key={source} className={institutionReportSources.includes(source) ? "active" : ""}><input type="checkbox" checked={institutionReportSources.includes(source)} onChange={() => toggleInstitutionReportSource(source)} /><i style={{ background: EARTHQUAKE_SOURCE_COLORS[source] }} /><span>{EARTHQUAKE_SOURCE_LABELS[source]}</span><em>{institutionReportSourceCounts[source]}</em></label>)}</div>
                  <div className="seismic-institution-filter-actions"><button onClick={() => chooseAllInstitutionReportSources(true)}>全选</button><button onClick={() => chooseAllInstitutionReportSources(false)}>清空</button></div>
                </div>
                <div className="seismic-institution-layout">
                  <div className="seismic-institution-table" role="table" aria-label="全球机构地震报告">
                    <div className="seismic-institution-head" role="row"><span>发震时间</span><span>机构</span><span>震中</span><span>震级</span><span>状态</span><span>产品 / 原文</span></div>
                    {displayedInstitutionReports.map((report) => <div key={report.id} className={`seismic-institution-row ${selectedInstitutionReportId === report.id ? "active" : ""}`} role="row">
                      <button onClick={() => chooseInstitutionReport(report)}>
                        <time>{formatTime(report.time)}</time>
                        <strong style={{ color: EARTHQUAKE_SOURCE_COLORS[report.source] }}>{EARTHQUAKE_SOURCE_LABELS[report.source]}</strong>
                        <span title={report.place}>{report.place}</span>
                        <b>{formatMagnitudeType(report.magnitudeType)} {report.magnitude.toFixed(1)}</b>
                        <em>{report.status}</em>
                      </button>
                      <div className="seismic-institution-row-actions">{isMechanismQueryable(report) && <button title="查看已确认存在的官方机制解" aria-label={`查看 ${report.place} 官方机制解`} onClick={() => setMechanismEvent(report)}><CircleGauge size={13} /></button>}{isJshisPositionSupported(report.latitude, report.longitude) && <button title="查看震中 J-SHIS 官方位置产品" aria-label={`查看 ${report.place} J-SHIS`} onClick={() => chooseJshisReport(report)}><Layers3 size={13} /></button>}{isShakeMapQueryable(report) && <button title="在实时地图叠加官方 USGS ShakeMap" aria-label={`叠加 ${report.place} USGS ShakeMap`} onClick={() => chooseShakeMapReport(report)}><MapIcon size={13} /></button>}{isPagerQueryable(report) && <button title="查看 USGS PAGER 三图、全部城市与人口暴露" aria-label={`查看 ${report.place} USGS PAGER`} onClick={() => choosePagerReport(report)}><BarChart3 size={13} /></button>}{isDyfiQueryable(report) && <button title="查看 USGS Did You Feel It? 图片与图表" aria-label={`查看 ${report.place} USGS DYFI`} onClick={() => chooseDyfiReport(report)}><MessageCircle size={13} /></button>}<a href={report.url} target="_blank" rel="noreferrer" aria-label={`打开 ${report.place} 机构原文`}><ExternalLink size={13} /></a></div>
                    </div>)}
                    {!filteredInstitutionReports.length && <div className="seismic-institution-filter-empty"><Filter size={18} /><span>当前震级与机构组合没有报告</span></div>}
                    {displayedInstitutionReports.length < filteredInstitutionReports.length && <button className="seismic-institution-load-more" onClick={() => setInstitutionReportLimit((current) => Math.min(filteredInstitutionReports.length, current + INSTITUTION_REPORT_PAGE_SIZE))}>加载更多报告（{displayedInstitutionReports.length} / {filteredInstitutionReports.length}）</button>}
                  </div>
                  {selectedInstitutionReport
                    ? <InstitutionReportDetail record={selectedInstitutionReport} onFocus={() => chooseInstitutionReport(selectedInstitutionReport)} onMechanism={setMechanismEvent} onShakeMap={chooseShakeMapReport} onPager={choosePagerReport} onDyfi={chooseDyfiReport} onJshis={chooseJshisReport} />
                    : <div className="seismic-lower-empty seismic-institution-empty"><Database size={26} /><strong>选择一份机构报告</strong><span>可查看来源原值，并在地图中定位震中。</span></div>}
                </div>
              </> : <div className="seismic-lower-empty"><Loader2 className="spin" size={26} /><strong>正在获取机构报告</strong><span>其他实时台网与预警流不受目录加载影响。</span></div>}
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
      {mechanismEvent && <FocalMechanismDialog event={mechanismEvent} onClose={() => setMechanismEvent(null)} />}
      {pagerEvent && <UsgsPagerDialog event={pagerEvent} initialPager={usgsPager} onLoaded={setUsgsPager} onClose={() => setPagerEvent(null)} />}
      {dyfiEvent && <UsgsDyfiDialog event={dyfiEvent} onClose={() => setDyfiEvent(null)} />}
      {jshisTarget && <JshisDialog
        latitude={jshisTarget.latitude}
        longitude={jshisTarget.longitude}
        label={jshisTarget.label}
        onLoaded={handleJshisLoaded}
        onFaultLoaded={handleJshisFaultLoaded}
        onClose={() => setJshisTarget(null)}
      />}
    </>
  );
}
