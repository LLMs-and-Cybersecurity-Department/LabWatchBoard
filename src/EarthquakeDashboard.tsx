import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Database,
  ExternalLink,
  Filter,
  Globe2,
  Layers3,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Radio,
  Satellite,
  Search,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON as LeafletGeoJSON, MapContainer, Pane, Popup, ScaleControl, TileLayer, useMap, ZoomControl } from "react-leaflet";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "leaflet/dist/leaflet.css";

import {
  buildDepthHistogram,
  buildMagnitudeHistogram,
  buildSourceHistogram,
  buildTimelineData,
  DEPTH_BANDS,
  depthColor,
  EARTHQUAKE_SOURCE_COLORS,
  EARTHQUAKE_SOURCE_LABELS,
  earthquakeBurstExpansion,
  fetchEarthquakeSnapshot,
  filterEarthquakeEvents,
  formatEarthquakeTime,
  formatMagnitudeType,
  isMechanismQueryable,
  isNiedQueryable,
  isDyfiQueryable,
  isPagerQueryable,
  isShakeMapQueryable,
  normalizeEarthquakeRefreshSeconds,
  type EarthquakeBaseLayer,
  type EarthquakeEvent,
  type EarthquakeRange,
  type EarthquakeSnapshot,
  type EarthquakeSourceId,
  type EarthquakeTimeZone,
} from "./earthquake";
import { FocalMechanismDialog } from "./FocalMechanismDialog";
import { CencProductsDialog } from "./CencProductsDialog";
import { NiedProductsDialog } from "./NiedProductsDialog";
import { JshisDialog } from "./JshisDialog";
import { ShakeMapDialog } from "./ShakeMapDialog";
import { SeismicLiveDashboard } from "./SeismicLiveDashboard";
import { UsgsDyfiDialog } from "./UsgsDyfiDialog";
import { UsgsPagerDialog } from "./UsgsPagerDialog";
import { usePersistentState } from "./usePersistentState";
import {
  isJshisPositionSupported,
  type JshisFaultShape,
  type JshisLocationSnapshot,
} from "./jshis";
import type { CencProductLayer } from "./cencProducts";

const SOURCE_ORDER: EarthquakeSourceId[] = ["usgs", "shakealert", "jma", "cenc", "cwa", "emsc", "gfz", "geonet", "bmkg"];
const MIN_MAGNITUDES = [0, 1, 2.5, 4, 5, 6];
const MAP_EVENT_LIMIT = 1200;
const TABLE_EVENT_LIMIT = 100;

const MAGNITUDE_GUIDE = [
  { code: "Mw", name: "矩震级", detail: "由地震矩计算，适合中强及巨大地震，较少出现饱和。" },
  { code: "mb", name: "体波震级", detail: "主要使用短周期 P 波体波振幅，常见于远震目录。" },
  { code: "ML", name: "地方震级", detail: "里氏震级的地方台网实现，适用于近距离中小地震。" },
  { code: "Ms", name: "面波震级", detail: "依据约 20 秒周期面波振幅，强震时可能出现饱和。" },
  { code: "Mi", name: "烈度震级", detail: "依据宏观烈度及衰减关系估算，具体定义随机构和地区而异。" },
  { code: "Mj", name: "JMA 震级", detail: "日本气象厅使用的震级制式，常见于日本附近地震速报。" },
  { code: "Md", name: "持续时间震级", detail: "依据地震信号持续时间估算，多用于地方台网小震。" },
  { code: "M", name: "未注明制式", detail: "来源只发布数值而未标明震级制式，不能据此假定为 Mw。" },
];

const BASE_LAYERS = {
  terrain: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
} as const;

type EarthquakeDashboardProps = {
  onToggleSidebar: () => void;
};

type EarthquakeSection = "live" | "global";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function magnitudeRadius(magnitude: number) {
  return clamp(3 + magnitude * 1.65, 5, 18);
}

function sourceTone(source: EarthquakeSourceId) {
  return EARTHQUAKE_SOURCE_COLORS[source];
}

function intensityLabel(event: EarthquakeEvent) {
  if (event.intensity === null || event.intensityScale === null) return "未提供";
  if (event.intensityScale === "JMA") return `JMA 震度 ${event.intensity}`;
  if (event.intensityScale === "CWA") return `CWA 震度 ${event.intensity}`;
  return `MMI ${event.intensity}`;
}

function MapFocus({ event }: { event: EarthquakeEvent | null }) {
  const map = useMap();
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    if (!event || previousId.current === event.id) return;
    previousId.current = event.id;
    map.flyTo([event.latitude, event.longitude], Math.max(map.getZoom(), 5), { duration: 0.55 });
  }, [event, map]);
  return null;
}

function MapResizeSync() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const invalidate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false, pan: false }));
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(container);
    invalidate();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);
  return null;
}

function EarthquakeMap(props: {
  events: EarthquakeEvent[];
  selectedId: string | null;
  focusedEvent: EarthquakeEvent | null;
  baseLayer: EarthquakeBaseLayer;
  updateBursts: Record<string, number>;
  burstClock: number;
  jshisLocation: JshisLocationSnapshot | null;
  jshisFault: JshisFaultShape | null;
  cencLayers: CencProductLayer[];
  onSelect: (event: EarthquakeEvent, focus?: boolean) => void;
}) {
  const layer = BASE_LAYERS[props.baseLayer];
  return (
    <MapContainer
      center={[22, 112]}
      zoom={2}
      minZoom={1}
      maxZoom={12}
      scrollWheelZoom
      worldCopyJump
      preferCanvas
      zoomControl={false}
      className="earthquake-map"
    >
      <TileLayer key={props.baseLayer} url={layer.url} attribution={layer.attribution} maxZoom={19} />
      {props.baseLayer === "satellite" && (
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution="Boundaries &copy; Esri"
          maxZoom={19}
        />
      )}
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" imperial={false} />
      <MapResizeSync />
      <MapFocus event={props.focusedEvent} />
      <Pane name="global-jshis-products" style={{ zIndex: 390, pointerEvents: "none" }}>
        {props.jshisLocation?.hazard && <LeafletGeoJSON data={props.jshisLocation.hazard.feature} interactive={false} style={{ color: "#facc15", fillColor: "#f97316", weight: 2.2, opacity: 0.98, fillOpacity: 0.22, dashArray: "5 3" }} />}
        {props.jshisLocation?.site && <LeafletGeoJSON data={props.jshisLocation.site.feature} interactive={false} style={{ color: "#22d3ee", fillColor: "#0891b2", weight: 1.8, opacity: 0.95, fillOpacity: 0.18 }} />}
        {props.jshisFault && <LeafletGeoJSON data={props.jshisFault.features} interactive={false} style={{ color: "#ef4444", fillColor: "#dc2626", weight: 2.4, opacity: 0.98, fillOpacity: 0.24 }} />}
      </Pane>
      <Pane name="global-cenc-products" style={{ zIndex: 395, pointerEvents: "none" }}>
        {props.cencLayers.map((layer, index) => layer.data && <LeafletGeoJSON key={`${layer.title}:${index}`} data={layer.data} interactive={false} style={{ color: "#f59e0b", fillColor: "#f97316", weight: 2, opacity: 0.9, fillOpacity: 0.18 }} />)}
      </Pane>
      {props.events.map((event) => {
        const selected = event.id === props.selectedId;
        const burstStartedAt = props.updateBursts[event.id];
        const burstAge = burstStartedAt ? (props.burstClock - burstStartedAt) / 4000 : 2;
        return (
          <Fragment key={event.id}>
            {burstAge >= 0 && burstAge < 1 && [0, 0.18, 0.36].map((delay) => {
              const progress = clamp((burstAge - delay) / (1 - delay), 0, 1);
              if (burstAge < delay) return null;
              return <CircleMarker key={`${event.id}:${delay}`} center={[event.latitude, event.longitude]} radius={magnitudeRadius(event.magnitude) + earthquakeBurstExpansion(event.magnitude, progress)} interactive={false} pathOptions={{ color: event.magnitude >= 6 ? "#ef4444" : sourceTone(event.source), weight: Math.max(1, 4 - progress * 3), fillOpacity: 0, opacity: (1 - progress) * 0.9 }} />;
            })}
            <CircleMarker
              center={[event.latitude, event.longitude]}
              radius={magnitudeRadius(event.magnitude) + (selected ? 2 : 0)}
              pathOptions={{
                color: selected ? "#ffffff" : sourceTone(event.source),
                weight: selected ? 3 : 1.8,
                fillColor: depthColor(event.depthKm),
                fillOpacity: selected ? 0.92 : 0.68,
                opacity: 0.98,
              }}
              eventHandlers={{ click: () => props.onSelect(event) }}
            >
              <Popup>
                <div className="earthquake-popup">
                  <b>{formatMagnitudeType(event.magnitudeType)} {event.magnitude.toFixed(1)}</b>
                  <strong>{event.place}</strong>
                  <span>{EARTHQUAKE_SOURCE_LABELS[event.source]} · 深度 {event.depthKm?.toFixed(0) ?? "--"} km</span>
                  <button onClick={() => props.onSelect(event, true)}>查看完整速报</button>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}

function EarthquakeStatusPill({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className={`earthquake-status-pill${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HypocenterProfile({ event }: { event: EarthquakeEvent }) {
  const depth = event.depthKm;
  const position = depth === null ? 0 : clamp((depth / 700) * 100, 1.5, 100);
  return (
    <div className="hypocenter-profile" aria-label={`震源深度 ${depth?.toFixed(1) ?? "未知"} 千米`}>
      <div className="hypocenter-scale">
        <span style={{ top: "0%" }}>地表 0</span>
        <span style={{ top: "10%" }}>70 km</span>
        <span style={{ top: "43%" }}>300 km</span>
        <span style={{ top: "94%" }}>700 km</span>
      </div>
      <div className="hypocenter-column">
        <i className="surface-line" />
        {depth !== null && (
          <i className="hypocenter-dot" style={{ top: `${position}%`, background: depthColor(depth) }}>
            <span>震源 {depth.toFixed(1)} km</span>
          </i>
        )}
      </div>
    </div>
  );
}

function reportValue(value: number | null, suffix: string) {
  return value === null ? "--" : `${value.toFixed(1)}${suffix}`;
}

function ShakeAlertPerformancePanel({ event, timeZone }: { event: EarthquakeEvent; timeZone: EarthquakeTimeZone }) {
  const report = event.shakeAlertReport;
  if (!report) return null;
  const stages = [
    { label: "首报", magnitude: report.initialMagnitude, elapsed: report.initialSeconds },
    { label: "峰值", magnitude: report.peakMagnitude, elapsed: report.peakSeconds },
    { label: "终报", magnitude: report.finalMagnitude, elapsed: report.finalSeconds },
  ];
  return (
    <section className="shakealert-performance-panel">
      <header><Radio size={15} /><div><strong>ShakeAlert 性能报告</strong><span>{report.issuedAt ? `消息发布 ${formatEarthquakeTime(report.issuedAt, timeZone, true)}` : "消息发布时间未提供"}</span></div><b>{report.reviewStatus}</b></header>
      <div className="shakealert-stage-grid">{stages.map((stage) => <article key={stage.label}><span>{stage.label}</span><strong>M {stage.magnitude?.toFixed(1) ?? "--"}</strong><small>震后 {reportValue(stage.elapsed, " s")}</small></article>)}</div>
      <dl className="earthquake-detail-list shakealert-detail-list">
        <div><dt>10 / 100 km 台站</dt><dd>{report.stationsWithin10Km ?? "--"} / {report.stationsWithin100Km ?? "--"}</dd></div>
        <div><dt>终报使用台站</dt><dd>{report.stationsFinal ?? "--"}</dd></div>
        <div><dt>最大估计烈度</dt><dd>{report.maximumMmi === null ? "--" : `MMI ${report.maximumMmi.toFixed(1)}`}</dd></div>
        <div><dt>WEA</dt><dd title={report.weaReport ?? undefined}>{report.weaReport ? (/distributed/i.test(report.weaReport) ? "已发送" : report.weaReport) : "未说明"}</dd></div>
      </dl>
      {report.cities.length > 0 && <div className="shakealert-city-list"><div><span>城市</span><span>预计烈度</span><span>预警时间</span></div>{report.cities.slice(0, 5).map((city) => <div key={city.name}><strong>{city.name}</strong><span>{city.mmi === null ? "--" : `MMI ${city.mmi.toFixed(0)}`}</span><em>{city.warningSeconds === null ? "--" : city.warningSeconds > 0 ? `${city.warningSeconds.toFixed(1)} s` : "0 s"}</em></div>)}</div>}
    </section>
  );
}

function ReportChart(props: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <article className="earthquake-report-card">
      <header>
        <div>
          <strong>{props.title}</strong>
          <span>{props.subtitle}</span>
        </div>
        <BarChart3 size={16} />
      </header>
      <div className="earthquake-report-chart">{props.children}</div>
    </article>
  );
}

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ fill: "rgba(255,255,255,0.045)" }}
      contentStyle={{ background: "#111719", border: "1px solid #364247", borderRadius: 5, fontSize: 11 }}
      labelStyle={{ color: "#dce6e4" }}
      itemStyle={{ color: "#f4b458" }}
    />
  );
}

function GlobalEarthquakeDashboard({ onToggleSidebar, onOpenLive }: EarthquakeDashboardProps & { onOpenLive: () => void }) {
  const [range, setRange] = usePersistentState<EarthquakeRange>("earthquake-range", "7d");
  const [minMagnitude, setMinMagnitude] = usePersistentState("earthquake-min-magnitude", 2.5);
  const [enabledSources, setEnabledSources] = usePersistentState<EarthquakeSourceId[]>("earthquake-sources-v2", SOURCE_ORDER);
  const [magnitudeTypeFilter, setMagnitudeTypeFilter] = usePersistentState("earthquake-magnitude-type", "");
  const [baseLayer, setBaseLayer] = usePersistentState<EarthquakeBaseLayer>("earthquake-base-layer", "satellite");
  const [timeZone, setTimeZone] = usePersistentState<EarthquakeTimeZone>("earthquake-time-zone", "Asia/Shanghai");
  const [autoRefresh, setAutoRefresh] = usePersistentState("earthquake-auto-refresh", true);
  const [storedRefreshIntervalSeconds, setRefreshIntervalSeconds] = usePersistentState("earthquake-refresh-interval-seconds", 60);
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState<EarthquakeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const [mechanismEvent, setMechanismEvent] = useState<EarthquakeEvent | null>(null);
  const [shakeMapEvent, setShakeMapEvent] = useState<EarthquakeEvent | null>(null);
  const [pagerEvent, setPagerEvent] = useState<EarthquakeEvent | null>(null);
  const [dyfiEvent, setDyfiEvent] = useState<EarthquakeEvent | null>(null);
  const [niedEvent, setNiedEvent] = useState<EarthquakeEvent | null>(null);
  const [jshisEvent, setJshisEvent] = useState<EarthquakeEvent | null>(null);
  const [jshisLocation, setJshisLocation] = useState<JshisLocationSnapshot | null>(null);
  const [jshisFault, setJshisFault] = useState<JshisFaultShape | null>(null);
  const [cencEvent, setCencEvent] = useState<EarthquakeEvent | null>(null);
  const [cencLayers, setCencLayers] = useState<CencProductLayer[]>([]);
  const [updateBursts, setUpdateBursts] = useState<Record<string, number>>({});
  const [burstClock, setBurstClock] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const previousEventIdsRef = useRef<Set<string> | null>(null);
  const previousQueryRef = useRef("");
  const refreshIntervalSeconds = normalizeEarthquakeRefreshSeconds(storedRefreshIntervalSeconds);

  useEffect(() => {
    setEnabledSources((current) => {
      const required: EarthquakeSourceId[] = ["shakealert", "cwa"];
      const missing = required.filter((source) => !current.includes(source));
      return missing.length ? [...current, ...missing] : current;
    });
  }, [setEnabledSources]);

  const loadSnapshot = useCallback(async (force = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const next = await fetchEarthquakeSnapshot({ range, minMagnitude, force, signal: controller.signal });
      const queryKey = `${range}:${minMagnitude}`;
      if (previousQueryRef.current !== queryKey) {
        previousQueryRef.current = queryKey;
        previousEventIdsRef.current = null;
        setUpdateBursts({});
      }
      if (previousEventIdsRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const startedAt = Date.now();
        const additions = next.events.filter((event) => !previousEventIdsRef.current?.has(event.id)).slice(0, 24);
        if (additions.length) setUpdateBursts((current) => ({ ...current, ...Object.fromEntries(additions.map((event) => [event.id, startedAt])) }));
      }
      previousEventIdsRef.current = new Set(next.events.map((event) => event.id));
      setSnapshot(next);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [range, minMagnitude]);

  useEffect(() => {
    void loadSnapshot(false);
    return () => abortRef.current?.abort();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!autoRefresh) return;
    let active = true;
    let timer = window.setTimeout(async function refresh() {
      await loadSnapshot(false);
      if (active) timer = window.setTimeout(refresh, refreshIntervalSeconds * 1000);
    }, refreshIntervalSeconds * 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [autoRefresh, loadSnapshot, refreshIntervalSeconds]);

  const hasUpdateBursts = Object.keys(updateBursts).length > 0;

  useEffect(() => {
    if (!hasUpdateBursts) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setBurstClock(now);
      setUpdateBursts((current) => Object.fromEntries(Object.entries(current).filter(([, startedAt]) => now - startedAt < 4200)));
    }, 80);
    return () => window.clearInterval(timer);
  }, [hasUpdateBursts]);

  const magnitudeTypes = useMemo(() => Array.from(new Set(
    (snapshot?.events ?? []).map((event) => formatMagnitudeType(event.magnitudeType)),
  )).sort((a, b) => a.localeCompare(b)), [snapshot]);

  const filteredEvents = useMemo(() => filterEarthquakeEvents(snapshot?.events ?? [], {
    sources: enabledSources,
    magnitudeType: magnitudeTypeFilter,
    search,
  }), [snapshot, enabledSources, magnitudeTypeFilter, search]);

  useEffect(() => {
    if (!filteredEvents.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredEvents.some((event) => event.id === selectedId)) setSelectedId(filteredEvents[0].id);
  }, [filteredEvents, selectedId]);

  const selectedEvent = filteredEvents.find((event) => event.id === selectedId) ?? filteredEvents[0] ?? null;
  const focusedEvent = filteredEvents.find((event) => event.id === focusEventId) ?? null;
  const strongestEvent = filteredEvents.reduce<EarthquakeEvent | null>(
    (strongest, event) => !strongest || event.magnitude > strongest.magnitude ? event : strongest,
    null,
  );
  const last24Hours = filteredEvents.filter((event) => Date.now() - Date.parse(event.time) <= 24 * 60 * 60 * 1000).length;
  const availableSources = snapshot?.sources.filter((source) => source.status === "ok").length ?? 0;
  const mapEvents = filteredEvents.slice(0, MAP_EVENT_LIMIT);
  const tableEvents = filteredEvents.slice(0, TABLE_EVENT_LIMIT);
  const timeline = useMemo(() => snapshot
    ? buildTimelineData(filteredEvents, range, snapshot.window.endTime, timeZone)
    : [], [snapshot, filteredEvents, range, timeZone]);
  const magnitudeHistogram = useMemo(() => buildMagnitudeHistogram(filteredEvents), [filteredEvents]);
  const depthHistogram = useMemo(() => buildDepthHistogram(filteredEvents), [filteredEvents]);
  const sourceHistogram = useMemo(() => buildSourceHistogram(filteredEvents), [filteredEvents]);

  const chooseEvent = (event: EarthquakeEvent, focus = false) => {
    setSelectedId(event.id);
    if (focus) setFocusEventId(event.id);
  };

  const openCencProducts = (event: EarthquakeEvent) => {
    setCencLayers([]);
    setCencEvent(event);
  };

  const toggleSource = (source: EarthquakeSourceId) => {
    setEnabledSources((current) => current.includes(source)
      ? current.filter((item) => item !== source)
      : [...current, source]);
  };

  return (
    <>
      <aside className="sidebar earthquake-sidebar" aria-label="地震看板控制面板">
        <div className="sidebar-rail">
          <div className="brand-mark earthquake-brand-mark">震</div>
          <button title="展开地震控制面板" aria-label="展开地震控制面板" onClick={onToggleSidebar}><PanelLeftOpen size={18} /></button>
          <button title="刷新地震速报" aria-label="刷新地震速报" onClick={() => void loadSnapshot(true)}><RefreshCw size={18} /></button>
          <button title="定位最强地震" aria-label="定位最强地震" disabled={!strongestEvent} onClick={() => strongestEvent && chooseEvent(strongestEvent, true)}><MapPin size={18} /></button>
        </div>

        <div className="sidebar-inner">
          <div className="sidebar-head">
            <div><span className={`latency-dot ${error ? "red" : loading ? "checking" : "green"}`} /><strong>全球地震控制台</strong></div>
            <button title="收起地震控制面板" aria-label="收起地震控制面板" onClick={onToggleSidebar}><PanelLeftClose size={17} /></button>
          </div>

          <section className="control-section">
            <div className="section-title"><span><Activity /></span><strong>地震看板</strong></div>
            <div className="earthquake-segmented seismic-mode-switch">
              <button onClick={onOpenLive}><Waves size={14} />实时预警</button>
              <button className="active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Globe2 size={14} />全球情报</button>
            </div>
          </section>

          <section className="control-section">
            <div className="section-title"><span><Clock3 /></span><strong>时间与震级</strong></div>
            <div className="earthquake-segmented" aria-label="地震时间范围">
              {(["24h", "7d", "30d", "90d"] as EarthquakeRange[]).map((value) => (
                <button key={value} className={range === value ? "active" : ""} aria-pressed={range === value} onClick={() => setRange(value)}>
                  {value === "24h" ? "24 小时" : value === "7d" ? "7 天" : value === "30d" ? "30 天" : "90 天"}
                </button>
              ))}
            </div>
            <label>
              最小震级
              <select value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))}>
                {MIN_MAGNITUDES.map((value) => <option key={value} value={value}>M {value.toFixed(value % 1 ? 1 : 0)} 以上</option>)}
              </select>
            </label>
            <label>
              震级制式
              <select value={magnitudeTypeFilter} onChange={(event) => setMagnitudeTypeFilter(event.target.value)}>
                <option value="">全部制式</option>
                {magnitudeTypes.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="search-field">
              搜索震中或事件号
              <span><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="地点、机构、事件号" /></span>
            </label>
          </section>

          <section className="control-section">
            <div className="section-title"><span><Database /></span><strong>速报机构</strong><em>{availableSources}/{SOURCE_ORDER.length} 在线</em></div>
            <div className="earthquake-source-controls">
              {SOURCE_ORDER.map((sourceId) => {
                const status = snapshot?.sources.find((source) => source.id === sourceId);
                return (
                  <label key={sourceId}>
                    <input type="checkbox" checked={enabledSources.includes(sourceId)} onChange={() => toggleSource(sourceId)} />
                    <i style={{ background: EARTHQUAKE_SOURCE_COLORS[sourceId] }} />
                    <span><strong>{EARTHQUAKE_SOURCE_LABELS[sourceId]}</strong><small>{status?.status === "error" ? "连接异常" : status?.status === "stale" ? `缓存 ${status.count} 条 · 上游异常` : `${status?.count ?? 0} 条 · ${status?.latencyMs ?? "--"} ms`}</small></span>
                    {status?.status === "error" ? <AlertTriangle size={14} /> : status?.status === "stale" ? <Database size={14} /> : <CheckCircle2 size={14} />}
                  </label>
                );
              })}
            </div>
            <div className="earthquake-source-actions">
              <button onClick={() => setEnabledSources(SOURCE_ORDER)}>全选</button>
              <button onClick={() => setEnabledSources([])}>清空</button>
            </div>
          </section>

          <section className="control-section">
            <div className="section-title"><span><Layers3 /></span><strong>地图与显示</strong></div>
            <div className="earthquake-segmented" aria-label="地震地图底图">
              <button className={baseLayer === "terrain" ? "active" : ""} aria-pressed={baseLayer === "terrain"} onClick={() => setBaseLayer("terrain")}><MapIcon size={14} />地图</button>
              <button className={baseLayer === "satellite" ? "active" : ""} aria-pressed={baseLayer === "satellite"} onClick={() => setBaseLayer("satellite")}><Satellite size={14} />卫星</button>
            </div>
            <label>
              时间显示
              <select value={timeZone} onChange={(event) => setTimeZone(event.target.value as EarthquakeTimeZone)}>
                <option value="Asia/Shanghai">北京时间 UTC+8</option>
                <option value="UTC">协调世界时 UTC</option>
              </select>
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              自动刷新全球情报
            </label>
            <label className={`earthquake-refresh-interval ${autoRefresh ? "" : "disabled"}`}>
              <span><strong>刷新间隔</strong><output>{refreshIntervalSeconds} 秒</output></span>
              <input type="range" min="1" max="60" step="1" value={refreshIntervalSeconds} disabled={!autoRefresh} aria-label="全球情报刷新间隔（秒）" onInput={(event) => setRefreshIntervalSeconds(normalizeEarthquakeRefreshSeconds(event.currentTarget.value))} />
              <small><span>1 秒</span><span>60 秒</span></small>
            </label>
            <button className="primary-button earthquake-refresh" disabled={loading} onClick={() => void loadSnapshot(true)}>
              {loading ? <Loader2 size={15} /> : <RefreshCw size={15} />}
              {loading ? "正在更新" : "立即刷新全部源"}
            </button>
          </section>

          <section className="control-section earthquake-depth-legend">
            <div className="section-title"><span><CircleGauge /></span><strong>震源深度图例</strong></div>
            {DEPTH_BANDS.map((band) => <div key={band.id}><i style={{ background: band.color }} /><span>{band.label}</span></div>)}
            <p>圆点面积表示震级大小，边框颜色表示速报机构，填充颜色表示震源深度。</p>
          </section>
        </div>
      </aside>

      <main className="workspace earthquake-workspace">
        <header className="topbar earthquake-topbar">
          <div>
            <h2>全球地震速报与震源分析</h2>
            <p>USGS · ShakeAlert · JMA · CENC · CWA · EMSC · GFZ · GeoNet · BMKG 机构报告 · 地图最多绘制 {MAP_EVENT_LIMIT} 个最新事件</p>
          </div>
          <div className="status-strip">
            <EarthquakeStatusPill label="当前筛选" value={`${filteredEvents.length} 条`} />
            <EarthquakeStatusPill label="近 24 小时" value={`${last24Hours} 条`} />
            <EarthquakeStatusPill label="最强事件" value={strongestEvent ? `${formatMagnitudeType(strongestEvent.magnitudeType)} ${strongestEvent.magnitude.toFixed(1)}` : "暂无"} tone={strongestEvent && strongestEvent.magnitude >= 6 ? "danger" : undefined} />
            <EarthquakeStatusPill label="数据源" value={`${availableSources}/${SOURCE_ORDER.length}`} tone={availableSources < SOURCE_ORDER.length ? "warn" : "ok"} />
            <EarthquakeStatusPill label="更新时间" value={snapshot ? formatEarthquakeTime(snapshot.generatedAt, timeZone) : "加载中"} />
          </div>
        </header>

        {error && <div className="error-banner">地震速报更新失败：{error}。{snapshot ? "继续显示上次成功数据。" : ""}</div>}
        {snapshot?.partial && <div className="earthquake-partial-banner"><AlertTriangle size={15} />部分机构暂不可用；有成功快照的机构继续显示缓存报告，其余地图和报表保持更新。</div>}

        <section className="earthquake-primary-grid">
          <div className="earthquake-map-panel">
            <header className="earthquake-panel-header">
              <div><strong>全球震中分布</strong><span>{baseLayer === "satellite" ? "Esri 卫星影像与行政标注" : "OpenStreetMap 地图"}</span></div>
              <div className="earthquake-map-actions">
                <button title="定位最强地震" disabled={!strongestEvent} onClick={() => strongestEvent && chooseEvent(strongestEvent, true)}><Waves size={15} />最强</button>
                <button title="刷新地震速报" disabled={loading} onClick={() => void loadSnapshot(true)}>{loading ? <Loader2 size={15} /> : <RefreshCw size={15} />}</button>
              </div>
            </header>
            <div className="earthquake-map-shell">
              {!snapshot && loading && <div className="earthquake-map-loading"><Loader2 size={24} /><span>正在汇集全部机构地震报告</span></div>}
              <EarthquakeMap
                events={mapEvents}
                selectedId={selectedEvent?.id ?? null}
                focusedEvent={focusedEvent}
                baseLayer={baseLayer}
                updateBursts={updateBursts}
                burstClock={burstClock}
                jshisLocation={jshisLocation}
                jshisFault={jshisFault}
                cencLayers={cencLayers}
                onSelect={chooseEvent}
              />
              <div className="earthquake-map-legend" aria-label="地图编码图例">
                <strong>机构边框</strong>
                <div>{SOURCE_ORDER.map((source) => <span key={source}><i style={{ borderColor: sourceTone(source) }} />{EARTHQUAKE_SOURCE_LABELS[source]}</span>)}</div>
              </div>
            </div>
          </div>

          <aside className="earthquake-detail-panel">
            {selectedEvent ? (
              <>
                <header>
                  <span style={{ color: sourceTone(selectedEvent.source) }}>{EARTHQUAKE_SOURCE_LABELS[selectedEvent.source]}</span>
                  <b>{formatMagnitudeType(selectedEvent.magnitudeType)} {selectedEvent.magnitude.toFixed(1)}</b>
                  {selectedEvent.tsunami && <em><TriangleAlert size={14} />海啸信息</em>}
                </header>
                <h3>{selectedEvent.place}</h3>
                <p className="earthquake-origin-time">发震：{formatEarthquakeTime(selectedEvent.time, timeZone, true)} {timeZone === "UTC" ? "UTC" : "北京时间"}</p>
                <dl className="earthquake-detail-list">
                  <div><dt>震源坐标</dt><dd>{selectedEvent.latitude.toFixed(3)}, {selectedEvent.longitude.toFixed(3)}</dd></div>
                  <div><dt>震源深度</dt><dd>{selectedEvent.depthKm?.toFixed(1) ?? "--"} km</dd></div>
                  <div><dt>震级制式</dt><dd>{formatMagnitudeType(selectedEvent.magnitudeType)}</dd></div>
                  <div><dt>震度 / 烈度</dt><dd>{intensityLabel(selectedEvent)}</dd></div>
                  {selectedEvent.reportedIntensity !== null && <div><dt>公众震感 CDI</dt><dd>{selectedEvent.reportedIntensity}</dd></div>}
                  <div><dt>测定机构</dt><dd>{selectedEvent.agency}</dd></div>
                  <div><dt>发布状态</dt><dd>{selectedEvent.status}</dd></div>
                  <div><dt>事件编号</dt><dd>{selectedEvent.sourceEventId}</dd></div>
                </dl>
                {selectedEvent.shakeAlertReport
                  ? <ShakeAlertPerformancePanel event={selectedEvent} timeZone={timeZone} />
                  : <HypocenterProfile event={selectedEvent} />}
                {selectedEvent.note && <p className="earthquake-event-note">{selectedEvent.note}</p>}
                <div className="earthquake-detail-actions">
                  <button onClick={() => chooseEvent(selectedEvent, true)}><MapPin size={15} />定位震中</button>
                  {isNiedQueryable(selectedEvent) && <button onClick={() => setNiedEvent(selectedEvent)}><Activity size={15} />NIED 一键详情</button>}
                  {isMechanismQueryable(selectedEvent) && <button onClick={() => setMechanismEvent(selectedEvent)}><CircleGauge size={15} />{selectedEvent.source === "emsc" ? "查询 EMSC 机制解" : "官方机制解"}</button>}
                  {isJshisPositionSupported(selectedEvent.latitude, selectedEvent.longitude) && <button onClick={() => setJshisEvent(selectedEvent)}><Layers3 size={15} />J-SHIS 位置产品</button>}
                  {selectedEvent.source === "cenc" && <button onClick={() => openCencProducts(selectedEvent)}><Layers3 size={15} />CENC 官方专题</button>}
                  {isShakeMapQueryable(selectedEvent) && <button onClick={() => setShakeMapEvent(selectedEvent)}><MapIcon size={15} />USGS ShakeMap</button>}
                  {isPagerQueryable(selectedEvent) && <button onClick={() => setPagerEvent(selectedEvent)}><BarChart3 size={15} />USGS PAGER</button>}
                  {isDyfiQueryable(selectedEvent) && <button onClick={() => setDyfiEvent(selectedEvent)}><MessageCircle size={15} />Did You Feel It?</button>}
                  <a href={selectedEvent.url} target="_blank" rel="noreferrer">官方记录<ExternalLink size={14} /></a>
                  {selectedEvent.shakeAlertReport?.summaryJsonUrl && <a href={selectedEvent.shakeAlertReport.summaryJsonUrl} target="_blank" rel="noreferrer">报告 JSON<ExternalLink size={14} /></a>}
                  {selectedEvent.shakeAlertReport?.summaryPdfUrl && <a href={selectedEvent.shakeAlertReport.summaryPdfUrl} target="_blank" rel="noreferrer">报告 PDF<ExternalLink size={14} /></a>}
                </div>
              </>
            ) : (
              <div className="earthquake-empty-detail"><Globe2 size={28} /><strong>当前筛选无地震事件</strong><span>调整时间、最小震级或机构筛选。</span></div>
            )}
          </aside>
        </section>

        <section className="earthquake-report-grid" aria-label="地震统计报表">
          <ReportChart title="时间分布" subtitle={range === "24h" ? "每 2 小时" : range === "7d" ? "每 12 小时" : range === "30d" ? "每日" : "每 3 日"}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#2b3539" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip />
                <Bar dataKey="count" name="事件数" fill="#e89a2d" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportChart>
          <ReportChart title="震级分布" subtitle="不同制式不做数值换算">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={magnitudeHistogram} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#2b3539" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip />
                <Bar dataKey="count" name="事件数" fill="#38bdf8" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportChart>
          <ReportChart title="震源深度" subtitle="单位：km">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={depthHistogram} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#2b3539" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip />
                <Bar dataKey="count" name="事件数" radius={[2, 2, 0, 0]}>{depthHistogram.map((item) => <Cell key={item.label} fill={item.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </ReportChart>
          <ReportChart title="机构报送" subtitle="保留同一地震的多机构报告">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceHistogram} layout="vertical" margin={{ top: 8, right: 16, left: 2, bottom: 0 }}>
                <CartesianGrid stroke="#2b3539" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8fa09d", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fill: "#c9d4d2", fontSize: 10 }} axisLine={false} tickLine={false} width={68} />
                <ChartTooltip />
                <Bar dataKey="count" name="报告数" radius={[0, 2, 2, 0]}>{sourceHistogram.map((item) => <Cell key={item.source} fill={item.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </ReportChart>
        </section>

        <section className="earthquake-feed-panel">
          <header className="earthquake-panel-header">
            <div><strong>全球地震速报</strong><span>显示最新 {tableEvents.length}/{filteredEvents.length} 条，点击震中名称可定位</span></div>
            <div className="earthquake-feed-meta"><Filter size={14} />M {minMagnitude}+ · {enabledSources.length} 个机构</div>
          </header>
          <div className="earthquake-table-shell">
            <table>
              <thead><tr><th>发震时间</th><th>机构</th><th>震中与坐标</th><th>震级</th><th>深度</th><th>震度 / 烈度</th><th>状态</th><th>产品</th></tr></thead>
              <tbody>
                {tableEvents.map((event) => (
                  <tr key={event.id} className={event.id === selectedEvent?.id ? "selected" : ""}>
                    <td><strong>{formatEarthquakeTime(event.time, timeZone, true)}</strong><small>{timeZone === "UTC" ? "UTC" : "北京时间"}</small></td>
                    <td><span className="earthquake-source-badge" style={{ borderColor: sourceTone(event.source), color: sourceTone(event.source) }}>{EARTHQUAKE_SOURCE_LABELS[event.source]}</span></td>
                    <td><button className="earthquake-event-name" onClick={() => chooseEvent(event, true)}>{event.place}</button><small>{event.latitude.toFixed(2)}, {event.longitude.toFixed(2)}</small></td>
                    <td><b>{formatMagnitudeType(event.magnitudeType)} {event.magnitude.toFixed(1)}</b></td>
                    <td><span className="depth-readout"><i style={{ background: depthColor(event.depthKm) }} />{event.depthKm?.toFixed(0) ?? "--"} km</span></td>
                    <td>{intensityLabel(event)}</td>
                    <td>{event.status}</td>
                    <td><div className="earthquake-product-actions">{event.shakeAlertReport && <button title="查看 ShakeAlert 性能报告" aria-label={`查看 ${event.place} ShakeAlert 性能报告`} onClick={() => chooseEvent(event)}><Radio size={14} /></button>}{isNiedQueryable(event) && <button title="查看 NIED F-net / Hi-net 一键详情" aria-label={`查看 ${event.place} NIED 一键详情`} onClick={() => setNiedEvent(event)}><Activity size={14} /></button>}{isMechanismQueryable(event) && <button title={event.source === "emsc" ? "查询 EMSC 收录的机制解" : "查看官方机制解"} aria-label={`查看 ${event.place} 官方机制解`} onClick={() => setMechanismEvent(event)}><CircleGauge size={14} /></button>}{isJshisPositionSupported(event.latitude, event.longitude) && <button title="查看 J-SHIS 官方位置产品" aria-label={`查看 ${event.place} J-SHIS`} onClick={() => setJshisEvent(event)}><Layers3 size={14} /></button>}{event.source === "cenc" && <button title="查看 CENC 官方专题产品" aria-label={`查看 ${event.place} CENC 官方专题`} onClick={() => openCencProducts(event)}><Layers3 size={14} /></button>}{isShakeMapQueryable(event) && <button title="查看已确认存在的 USGS ShakeMap" aria-label={`查看 ${event.place} USGS ShakeMap`} onClick={() => setShakeMapEvent(event)}><MapIcon size={14} /></button>}{isPagerQueryable(event) && <button title="查看已确认存在的 USGS PAGER 人口与损失估算" aria-label={`查看 ${event.place} USGS PAGER`} onClick={() => setPagerEvent(event)}><BarChart3 size={14} /></button>}{isDyfiQueryable(event) && <button title="查看已确认存在的 USGS Did You Feel It? 图片与图表" aria-label={`查看 ${event.place} USGS DYFI`} onClick={() => setDyfiEvent(event)}><MessageCircle size={14} /></button>}<a href={event.url} target="_blank" rel="noreferrer" aria-label={`打开 ${event.place} 官方记录`}><ExternalLink size={14} /></a></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tableEvents.length && <div className="earthquake-table-empty">当前筛选没有可显示的地震速报。</div>}
          </div>
        </section>

        <section className="earthquake-guide-panel">
          <header className="earthquake-panel-header">
            <div><strong>震级制式与震度说明</strong><span>保留来源机构原值，不在不同震级制式之间自动换算</span></div>
            <Activity size={17} />
          </header>
          <div className="magnitude-guide-grid">
            {MAGNITUDE_GUIDE.map((item) => <article key={item.code}><b>{item.code}</b><div><strong>{item.name}</strong><p>{item.detail}</p></div></article>)}
          </div>
          <div className="intensity-guide">
            <article><strong>JMA 震度</strong><span>0、1、2、3、4、5弱、5强、6弱、6强、7，共 10 个等级；表示具体地点的摇晃强度。</span></article>
            <article><strong>MMI 烈度</strong><span>修订麦加利烈度 I–XII；USGS GeoJSON 中的 MMI 通常来自 ShakeMap 仪器烈度。</span></article>
            <article><strong>震级与烈度不同</strong><span>震级描述地震规模；震度或烈度描述某个地点的实际或估计摇晃程度。</span></article>
          </div>
        </section>

        <footer className="earthquake-sources-footer">
          <Database size={14} />
          <span>数据来源：</span>
          {snapshot?.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}
          <span>· ShakeAlert 为震后性能报告，不是保护性实时预警 · EMSC 数据按 CC BY 4.0 标注 · JMA 高频 Feed 不是历史完整目录 · 参数可能被机构修订</span>
        </footer>
      </main>
      {mechanismEvent && <FocalMechanismDialog event={mechanismEvent} onClose={() => setMechanismEvent(null)} />}
      {niedEvent && <NiedProductsDialog event={niedEvent} timeZone={timeZone} onClose={() => setNiedEvent(null)} />}
      {shakeMapEvent && <ShakeMapDialog event={shakeMapEvent} onClose={() => setShakeMapEvent(null)} />}
      {pagerEvent && <UsgsPagerDialog event={pagerEvent} onClose={() => setPagerEvent(null)} />}
      {dyfiEvent && <UsgsDyfiDialog event={dyfiEvent} onClose={() => setDyfiEvent(null)} />}
      {jshisEvent && <JshisDialog
        latitude={jshisEvent.latitude}
        longitude={jshisEvent.longitude}
        label={`${EARTHQUAKE_SOURCE_LABELS[jshisEvent.source]} · ${jshisEvent.place}`}
        onLoaded={setJshisLocation}
        onFaultLoaded={setJshisFault}
        onClose={() => setJshisEvent(null)}
      />}
      {cencEvent && <CencProductsDialog
        event={cencEvent}
        onClose={() => setCencEvent(null)}
        onShowLayer={(layer) => setCencLayers((current) => [...current.filter((existing) => existing.title !== layer.title), layer])}
      />}
    </>
  );
}

export function EarthquakeDashboard({ onToggleSidebar }: EarthquakeDashboardProps) {
  const [section, setSection] = usePersistentState<EarthquakeSection>("earthquake-section", "live");
  return section === "live"
    ? <SeismicLiveDashboard onToggleSidebar={onToggleSidebar} onOpenGlobal={() => setSection("global")} />
    : <GlobalEarthquakeDashboard onToggleSidebar={onToggleSidebar} onOpenLive={() => setSection("live")} />;
}
