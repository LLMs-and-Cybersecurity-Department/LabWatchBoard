import {
  Activity,
  Bell,
  Calendar,
  Check,
  CloudRain,
  Crosshair,
  Database,
  Download,
  Expand,
  Eye,
  EyeOff,
  Film,
  Gauge,
  Globe2,
  Hand,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  MessageSquare,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Ruler,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Star,
  SkipBack,
  SkipForward,
  UserCircle,
  Volume2,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { lazy, Suspense, type CSSProperties, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  advanceFrameVisual,
  buildAnimationSessionSignature,
  buildFrameSignature,
  frameCrossfadeDurationMs,
  loadFrameGroupWithRetry,
  mergeOrderedFrames,
  nextPlayableFrame,
  resolveSelectedFrameValue,
  summarizePreloadProgress,
  type FrameVisualState,
} from "./animation";
import {
  animationDurationSeconds,
  animationFrameUrl,
  downloadAnimationExport,
  exportWeatherAnimation,
  selectCompleteAnimationFrames,
  type AnimationExportFormat,
  type AnimationExportProgress,
} from "./animationExport";
import { AnimationFramePreloader } from "./animationPreloader";
import { fetchMeteogram } from "./ecmwfApi";
import {
  buildChineseDescription,
  formatUtcLabel,
  translateFacet,
  translateLegendTitle,
  translateMeteogramText,
  translatePackage,
  translateProductTitle,
  translateRegion,
  translateValue,
} from "./i18n";
import { evaluateRisks, speakRisk } from "./risk";
import {
  fetchProviderAxisFrames,
  fetchProviderPackages,
  fetchProviderProductDetail,
  fetchProviderProducts,
  fullQualityModelChartFrame,
  latencyStatus,
  measureProviderLatency,
  PROVIDER_BY_ID,
  PROVIDERS,
  type ProviderConfig,
  type ProviderHealthStatus,
  type ProviderId,
} from "./providers";
import { evaluatePointForecastRisks, fetchPointForecast, type PointForecast } from "./pointForecast";
import { PointWeatherPanel } from "./PointWeatherPanel";
import type {
  Axis,
  AxisOption,
  EcmwfPackage,
  FrameItem,
  MeteogramResult,
  ProductDetail,
  ProductSummary,
  RiskCard,
  Station,
  Thresholds,
} from "./types";
import { usePersistentState } from "./usePersistentState";
import { DEFAULT_USER_NAME, MAX_USER_NAME_LENGTH, normalizeUserName } from "./userName";
import {
  advanceWeatherAlertCycle,
  appendWeatherAlertEvent,
  createWeatherAlertEvent,
  EMPTY_WEATHER_ALERT_CYCLE,
  normalizeWeatherAlertHistory,
  weatherAlertSignature,
  type WeatherAlertEvent,
  type WeatherAlertSource,
} from "./weatherAlerts";

const EarthquakeDashboard = lazy(async () => {
  const module = await import("./EarthquakeDashboard");
  return { default: module.EarthquakeDashboard };
});

const FanWeatherDashboard = lazy(async () => {
  const module = await import("./FanWeatherDashboard");
  return { default: module.FanWeatherDashboard };
});

const DEFAULT_STATION: Station = { name: "上海", lat: 31.2304, lon: 121.4737 };
const APP_TITLE = "天气与地震信息看板 · 多模式天气";
const EARTHQUAKE_APP_TITLE = "天气与地震信息看板 · 全球地震";
const FAN_WEATHER_APP_TITLE = "LabWatch · FAN 气象数据";
const FPS_OPTIONS = [1, 2, 5, 10, 24, 30, 60];
const DEFAULT_PRODUCT = "medium-mslp-rain";
const DEFAULT_PACKAGE = "opencharts";
const DEFAULT_PROJECTION = "opencharts_eastern_asia";
type PreloadStatus = {
  signature: string;
  total: number;
  loaded: number;
  failed: number;
  ready: boolean;
  playableValues: string[];
};

type DrawerView = "messages" | "alerts" | "settings" | "help" | "user" | "info" | "layers" | "legend" | null;

type ToolMode = "ens" | "browse" | "measure";

type DashboardView = "weather" | "earthquake" | "fan-weather";

type MeasurementPoint = {
  x: number;
  y: number;
  mapX: number;
  mapY: number;
  crs: string;
};

type ProviderHealth = {
  status: ProviderHealthStatus;
  latency: number | null;
  error?: string;
};

function axisByName(detail: ProductDetail | null, name: string) {
  return detail?.axis?.find((axis) => axis.name === name);
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function frameRequest(detail: ProductDetail | null, frame: FrameItem | undefined, fallback: Record<string, string | number>) {
  return {
    ...(detail?.values ?? {}),
    ...fallback,
    ...(frame?.values?.request ?? {}),
  };
}

function formatLastUpdated(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(value);
}

function formatForecastTime(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

function metric(value: number | null, unit: string, digits = 1) {
  return value === null ? "暂无" : `${value.toFixed(digits)} ${unit}`;
}

function measurementDistance(first: MeasurementPoint, second: MeasurementPoint) {
  if (first.crs !== second.crs) return "投影已变化，请重新选择起点";
  if (/4326|longlat|latlon/i.test(first.crs)) {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const lat1 = toRadians(first.mapY);
    const lat2 = toRadians(second.mapY);
    const deltaLat = lat2 - lat1;
    const deltaLon = toRadians(second.mapX - first.mapX);
    const haversine =
      Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return `${(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))).toFixed(1)} km`;
  }
  const projectedDistance = Math.hypot(second.mapX - first.mapX, second.mapY - first.mapY);
  if (projectedDistance > 1000) return `${(projectedDistance / 1000).toFixed(1)} km`;
  return `${projectedDistance.toFixed(1)} 个投影单位`;
}

function fallbackMapCoordinates(projection: string, xRatio: number, yRatio: number) {
  const value = projection.toLowerCase();
  const bounds: [number, number, number, number] = value.includes("eastern_asia")
    ? [70, 160, 0, 65]
    : value.includes("western_pacific")
      ? [90, 180, -20, 65]
      : value.includes("china")
        ? [72, 136, 17, 55]
        : value.includes("japan")
          ? [122, 153, 24, 48]
          : value.includes("europe")
            ? [-30, 45, 25, 72]
            : value.includes("arctic")
              ? [-180, 180, 55, 90]
              : value.includes("antarctic")
                ? [-180, 180, -90, -55]
                : [-180, 180, -90, 90];
  const [west, east, south, north] = bounds;
  return {
    lon: west + xRatio * (east - west),
    lat: north - yRatio * (north - south),
  };
}

function loadBrowserImage(url: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const image = new Image();
    image.decoding = "async";
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      image.onload = null;
      image.onerror = null;
      image.src = "";
      cleanup();
      reject(signal.reason);
    };
    image.onload = () => {
      cleanup();
      resolve();
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`动画图帧加载失败：${url}`));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    image.src = url;
  });
}

export default function App() {
  const [activeDashboard, setActiveDashboard] = usePersistentState<DashboardView>("ecmwf-pboard-dashboard", "weather");
  const [developerMode, setDeveloperMode] = usePersistentState("labwatch-developer-mode", import.meta.env.DEV);
  const [earthquakeMounted, setEarthquakeMounted] = useState(activeDashboard === "earthquake");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("ecmwf");
  const [packages, setPackages] = useState<EcmwfPackage[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [frameState, setFrameState] = useState<{ signature: string; items: FrameItem[] }>({
    signature: "",
    items: [],
  });
  const [selectedPackage, setSelectedPackage] = useState(DEFAULT_PACKAGE);
  const [selectedProduct, setSelectedProduct] = useState(DEFAULT_PRODUCT);
  const [selectedProjection, setSelectedProjection] = useState(DEFAULT_PROJECTION);
  const [selectedBaseTime, setSelectedBaseTime] = useState("");
  const [selectedValidTime, setSelectedValidTime] = useState("");
  const [selectedInterval, setSelectedInterval] = useState("6");
  const [searchText, setSearchText] = useState("");
  const [selectedParameter, setSelectedParameter] = useState("");
  const [selectedProductType, setSelectedProductType] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = usePersistentState("ecmwf-pboard-fps", 24);
  const [smooth, setSmooth] = usePersistentState("ecmwf-pboard-smooth", true);
  const [userName, setUserName] = usePersistentState("ecmwf-pboard-user-name", DEFAULT_USER_NAME);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState("ecmwf-pboard-sidebar-collapsed", false);
  const [favorites, setFavorites] = usePersistentState<string[]>("ecmwf-pboard-favorites", []);
  const [layerVisible, setLayerVisible] = usePersistentState("ecmwf-pboard-layer-visible", true);
  const [layerOpacity, setLayerOpacity] = usePersistentState("ecmwf-pboard-layer-opacity", 1);
  const [station, setStation] = usePersistentState<Station>("ecmwf-pboard-station", DEFAULT_STATION);
  const [thresholds, setThresholds] = usePersistentState<Thresholds>("ecmwf-pboard-thresholds", {
    rainMm: 50,
    windMs: 25,
    efi: 0.8,
    autoSpeak: false,
    sound: "double",
  });
  const [storedWeatherAlertHistory, setStoredWeatherAlertHistory] = usePersistentState<WeatherAlertEvent[]>(
    "ecmwf-pboard-weather-alert-history",
    [],
  );
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [error, setError] = useState("");
  const [meteogram, setMeteogram] = useState<MeteogramResult | null>(null);
  const [loadingMeteogram, setLoadingMeteogram] = useState(false);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<DrawerView>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("ens");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPoint[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());
  const [reloadNonce, setReloadNonce] = useState(0);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth>({
    status: "checking",
    latency: null,
  });
  const [pointForecasts, setPointForecasts] = useState<Partial<Record<ProviderId, PointForecast>>>({});
  const [loadingPointForecast, setLoadingPointForecast] = useState(false);
  const [pointForecastErrors, setPointForecastErrors] = useState<Partial<Record<ProviderId, string>>>({});
  const [preloadStatus, setPreloadStatus] = useState<PreloadStatus>({
    signature: "",
    total: 0,
    loaded: 0,
    failed: 0,
    ready: false,
    playableValues: [],
  });
  const [animationExportOpen, setAnimationExportOpen] = useState(false);
  const [animationExportFormat, setAnimationExportFormat] = useState<AnimationExportFormat>("mp4");
  const [animationExportProgress, setAnimationExportProgress] = useState<AnimationExportProgress | null>(null);
  const [animationExportError, setAnimationExportError] = useState("");
  const [animationExportRunning, setAnimationExportRunning] = useState(false);
  const [frameVisual, setFrameVisual] = useState<FrameVisualState>({
    signature: "",
    currentUrl: "",
    previousUrl: null,
    revision: 0,
  });
  const weatherAlertHistory = useMemo(
    () => normalizeWeatherAlertHistory(storedWeatherAlertHistory),
    [storedWeatherAlertHistory],
  );
  const weatherAlertHistoryRef = useRef(weatherAlertHistory);
  weatherAlertHistoryRef.current = weatherAlertHistory;
  const displayUserName = normalizeUserName(userName);
  const alertCycle = useRef({ ...EMPTY_WEATHER_ALERT_CYCLE });
  const chartPanelRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const activePreloadSignature = useRef("");
  const preloadLoaded = useRef(new Set<string>());
  const preloadFailed = useRef(new Set<string>());
  const framePreloader = useRef<AnimationFramePreloader | null>(null);
  const frameRequestStarted = useRef(new Set<string>());
  const selectedTimelineKey = useRef("");
  const initialMeteogramStarted = useRef(false);
  const animationExportAbort = useRef<AbortController | null>(null);
  const meteogramAbort = useRef<AbortController | null>(null);
  const preloadContext = useRef<{
    signature: string;
    frames: FrameItem[];
    frameValues: string[];
    loading: boolean;
  }>({ signature: "", frames: [], frameValues: [], loading: false });

  const syncAnimationPreloadStatus = useCallback((signature: string) => {
    const context = preloadContext.current;
    if (context.signature !== signature || activePreloadSignature.current !== signature) return;
    const progress = summarizePreloadProgress(
      context.frames,
      context.frameValues,
      preloadLoaded.current,
      preloadFailed.current,
      context.loading,
    );
    setPreloadStatus({ signature, ...progress });
  }, []);

  const selectedProviderConfig = PROVIDER_BY_ID[selectedProvider];
  const pointForecast = pointForecasts[selectedProvider] ?? null;
  const pointForecastError = pointForecastErrors[selectedProvider] ?? "";

  const selectedProductSummary = useMemo(
    () => products.find((product) => product.name === selectedProduct),
    [products, selectedProduct],
  );

  const parameterOptions = useMemo(
    () => uniqueSorted(products.flatMap((product) => product.tags?.Parameters ?? [])),
    [products],
  );

  const productTypeOptions = useMemo(
    () => uniqueSorted(products.flatMap((product) => product.tags?.["Product type"] ?? [])),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return products.filter((product) => {
      const title = `${product.title} ${translateProductTitle(product.title)} ${product.name}`.toLowerCase();
      const matchesSearch = !needle || title.includes(needle);
      const matchesParameter = !selectedParameter || product.tags?.Parameters?.includes(selectedParameter);
      const matchesType = !selectedProductType || product.tags?.["Product type"]?.includes(selectedProductType);
      return matchesSearch && matchesParameter && matchesType;
    });
  }, [products, searchText, selectedParameter, selectedProductType]);

  const baseAxis = axisByName(detail, "base_time");
  const projectionAxis = axisByName(detail, "projection");
  const intervalAxis = axisByName(detail, "interval");
  const baseOption = baseAxis?.values.find((option) => option.value === selectedBaseTime) ?? baseAxis?.values[0];
  const animatedAxisName = baseOption?.linked_axis ?? baseAxis?.name ?? "";
  const validOptions = baseOption?.linked_values?.length ? baseOption.linked_values : baseAxis?.values ?? [];
  const frameValues = validOptions.map((option) => option.value);
  const frameValuesKey = frameValues.join("|");
  const frameIdentitySignature = useMemo(
    () =>
      buildFrameSignature([
        selectedProvider,
        selectedPackage,
        selectedProduct,
        animatedAxisName,
        selectedProjection,
        selectedInterval,
        selectedBaseTime,
        frameValuesKey,
      ]),
    [
      selectedProvider,
      selectedPackage,
      selectedProduct,
      animatedAxisName,
      selectedProjection,
      selectedInterval,
      selectedBaseTime,
      frameValuesKey,
    ],
  );
  const frameSignature = useMemo(
    () => buildAnimationSessionSignature(frameIdentitySignature, reloadNonce),
    [frameIdentitySignature, reloadNonce],
  );
  const frames = frameState.signature === frameSignature ? frameState.items : [];
  const setFramesForSignature = (next: SetStateAction<FrameItem[]>) => {
    setFrameState((previous) => {
      const current = previous.signature === frameSignature ? previous.items : [];
      return {
        signature: frameSignature,
        items: typeof next === "function" ? next(current) : next,
      };
    });
  };
  preloadContext.current = {
    signature: frameSignature,
    frames,
    frameValues,
    loading: loadingFrames,
  };
  const playableFrameValues =
    preloadStatus.signature === frameSignature
      ? preloadStatus.playableValues.filter((value) => frameValues.includes(value))
      : [];
  const playableFrameValueSet = new Set(playableFrameValues);
  const currentFrame =
    frames.find((frame) => frame.value === selectedValidTime) ??
    frames.find((frame) => playableFrameValueSet.has(frame.value)) ??
    frames[0];
  const firstTimelineFrame = frames.find((frame) => frame.value === frameValues[0]);
  const firstPreviewLoaded = Boolean(
    firstTimelineFrame &&
    preloadStatus.signature === frameSignature &&
    preloadLoaded.current.has(firstTimelineFrame.url),
  );
  const currentImageUrl = currentFrame?.url ? animationFrameUrl(currentFrame.url) : "";
  const crossfadeDurationMs = frameCrossfadeDurationMs(fps);
  const currentFrameIndex = Math.max(
    0,
    validOptions.findIndex((option) => option.value === selectedValidTime),
  );
  const animationFullyReady =
    preloadStatus.ready &&
    preloadStatus.signature === frameSignature &&
    preloadStatus.total > 0 &&
    frames.length >= preloadStatus.total;
  const animationPlayable = preloadStatus.signature === frameSignature && playableFrameValues.length >= 2;
  const animationExportFrames = selectCompleteAnimationFrames(frames, frameValues, preloadLoaded.current);
  const animationExportReady =
    animationFullyReady && animationExportFrames.length === frameValues.length && frameValues.length > 1;
  const preloadPercent = preloadStatus.total
    ? Math.min(100, Math.round((preloadStatus.loaded / preloadStatus.total) * 100))
    : 0;

  const chartRisks = useMemo(
    () => evaluateRisks(selectedProductSummary, currentFrame, thresholds),
    [currentFrame, selectedProductSummary, thresholds],
  );
  const risks = useMemo(() => {
    if (!pointForecast) return chartRisks;
    const pointRisks = evaluatePointForecastRisks(pointForecast, thresholds);
    const efiRisk = chartRisks.find((risk) => risk.id === "efi");
    return efiRisk ? [...pointRisks, efiRisk] : pointRisks;
  }, [chartRisks, pointForecast, thresholds]);

  const triggerWeatherAlert = useCallback(
    (source: WeatherAlertSource, force = false) => {
      const event = createWeatherAlertEvent({
        provider: selectedProvider,
        providerLabel: selectedProviderConfig.shortLabel,
        station,
        thresholds,
        risks,
        source,
      });
      if (!event) return false;
      const result = appendWeatherAlertEvent(weatherAlertHistoryRef.current, event, { force });
      if (!result.added) return false;
      weatherAlertHistoryRef.current = result.history;
      setStoredWeatherAlertHistory(result.history);
      speakRisk(risks, station.name, thresholds.sound);
      return true;
    },
    [risks, selectedProvider, selectedProviderConfig.shortLabel, setStoredWeatherAlertHistory, station, thresholds],
  );

  const announceCurrentRisk = useCallback(() => {
    const recorded = triggerWeatherAlert("manual");
    setNotice(recorded ? "当前风险已播报并写入预警历史。" : "当前没有需要播报的超阈值风险。");
  }, [triggerWeatherAlert]);

  const clearWeatherAlertHistory = useCallback(() => {
    weatherAlertHistoryRef.current = [];
    setStoredWeatherAlertHistory([]);
    setNotice("气象预警历史已清空。");
  }, [setStoredWeatherAlertHistory]);

  useLayoutEffect(() => {
    setFrameVisual((previous) => advanceFrameVisual(previous, frameSignature, currentImageUrl, smooth));
  }, [currentImageUrl, frameSignature, smooth]);

  useEffect(() => {
    if (!frameVisual.previousUrl) return;
    const revision = frameVisual.revision;
    const timer = window.setTimeout(() => {
      setFrameVisual((current) => current.revision === revision ? { ...current, previousUrl: null } : current);
    }, crossfadeDurationMs + 24);
    return () => window.clearTimeout(timer);
  }, [crossfadeDurationMs, frameVisual.previousUrl, frameVisual.revision]);

  useEffect(() => {
    frameRequestStarted.current = new Set();
  }, [frameSignature]);

  useEffect(() => {
    const handleFallback = (event: Event) => {
      const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope ?? "ECMWF";
      setNotice(`实时 ${scope}目录暂不可用，已切换到随应用发布的最近目录快照；图帧仍需联网加载。`);
    };
    window.addEventListener("ecmwf-pboard:catalogue-fallback", handleFallback);
    return () => window.removeEventListener("ecmwf-pboard:catalogue-fallback", handleFallback);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (activeDashboard !== "weather") return;
    let cancelled = false;
    const controller = new AbortController();
    fetchProviderPackages(selectedProvider, controller.signal)
      .then((items) => {
        if (cancelled) return;
        setPackages(items);
        if (!items.some((item) => item.name === selectedPackage)) {
          setSelectedPackage(selectedProviderConfig.defaultPackage);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(`加载图表包失败：${String(reason.message ?? reason)}`);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeDashboard, selectedProvider, selectedProviderConfig.defaultPackage]);

  useEffect(() => {
    if (activeDashboard !== "weather") return;
    let cancelled = false;
    const controller = new AbortController();
    setLoadingProducts(true);
    setError("");
    fetchProviderProducts(selectedProvider, selectedPackage, controller.signal)
      .then((items) => {
        if (cancelled) return;
        setProducts(items);
        if (!items.some((item) => item.name === selectedProduct)) {
          setSelectedProduct(
            items.find((item) => item.name === selectedProviderConfig.defaultProduct)?.name ??
              items.find((item) => item.name === DEFAULT_PRODUCT)?.name ??
              items[0]?.name ??
              "",
          );
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(`加载产品列表失败：${String(reason.message ?? reason)}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeDashboard, selectedPackage, selectedProvider, selectedProviderConfig.defaultProduct]);

  useEffect(() => {
    if (activeDashboard !== "weather" || !selectedProduct) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoadingDetail(true);
    setError("");
    setFramesForSignature([]);
    setIsPlaying(false);
    setMeteogram(null);
    fetchProviderProductDetail(selectedProvider, selectedPackage, selectedProduct, undefined, controller.signal)
      .then((productDetail) => {
        if (cancelled) return;
        setDetail(productDetail);
      })
      .catch((reason) => {
        if (!cancelled && !controller.signal.aborted) {
          setError(`加载产品详情失败：${String(reason.message ?? reason)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeDashboard, reloadNonce, selectedPackage, selectedProduct, selectedProvider]);

  useEffect(() => {
    if (!detail) return;
    const nextBase = axisByName(detail, "base_time")?.values[0]?.value ?? "";
    const projections = axisByName(detail, "projection")?.values ?? [];
    const nextProjection =
      projections.find((option) => option.value === selectedProjection)?.value ??
      projections.find((option) => option.value === selectedProviderConfig.defaultProjection)?.value ??
      projections.find((option) => option.value === DEFAULT_PROJECTION)?.value ??
      projections[0]?.value ??
      "";
    const intervals = axisByName(detail, "interval")?.values ?? [];
    const nextInterval =
      intervals.find((option) => option.value === selectedInterval)?.value ??
      String(detail.values?.interval ?? intervals[0]?.value ?? "6");

    setSelectedBaseTime((current) =>
      axisByName(detail, "base_time")?.values.some((option) => option.value === current) ? current : nextBase,
    );
    setSelectedProjection(nextProjection);
    setSelectedInterval(nextInterval);
  }, [detail, selectedProjection, selectedProviderConfig.defaultProjection, selectedInterval]);

  useEffect(() => {
    if (!validOptions.length) return;
    const timelineKey = buildFrameSignature([
      selectedProvider,
      selectedPackage,
      selectedProduct,
      selectedBaseTime,
    ]);
    const resetToStart = selectedTimelineKey.current !== timelineKey;
    selectedTimelineKey.current = timelineKey;
    setSelectedValidTime((current) => resolveSelectedFrameValue(current, frameValues, resetToStart));
  }, [selectedBaseTime, selectedPackage, selectedProduct, selectedProvider, frameValuesKey]);

  useEffect(() => {
    if (
      activeDashboard !== "weather" ||
      !detail ||
      !selectedProduct ||
      !animatedAxisName ||
      !frameValues.length ||
      !selectedBaseTime ||
      !selectedProjection ||
      !selectedInterval
    ) {
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const params: Record<string, string | number | undefined> = {
      projection: selectedProjection,
      interval: selectedInterval,
      base_time: selectedBaseTime,
      expver: detail.values?.expver ?? 1,
    };
    if (animatedAxisName === "base_time") delete params.base_time;

    async function loadFrames() {
      setLoadingFrames(true);
      setFramesForSignature([]);
      setIsPlaying(false);
      setError("");
      let loadedCount = 0;
      let failedCount = 0;
      const requestGroups = [[frameValues[0]], ...chunk(frameValues.slice(1), 8)];

      for (const group of requestGroups) {
        try {
          group.forEach((value) => frameRequestStarted.current.add(`${frameSignature}:${value}`));
          const result = await loadFrameGroupWithRetry(
            group,
            (pendingValues) => fetchProviderAxisFrames(
              selectedProvider,
              selectedPackage,
              selectedProduct,
              animatedAxisName,
              params,
              pendingValues,
              controller.signal,
            ),
            { signal: controller.signal },
          );
          if (cancelled) return;
          if (result.frames.length) setLastUpdatedAt(new Date());
          loadedCount += result.frames.length;
          failedCount += result.missingValues.length;
          result.missingValues.forEach((value) => frameRequestStarted.current.delete(`${frameSignature}:${value}`));
          if (result.frames.length) {
            setFramesForSignature((previous) => mergeOrderedFrames(previous, result.frames, frameValues));
          }
          if (result.missingValues.length) {
            console.warn(
              `${selectedProviderConfig.shortLabel} frame batch incomplete after ${result.attempts} attempts`,
              result.lastError,
            );
          }
        } catch (reason) {
          if (controller.signal.aborted) return;
          failedCount += group.length;
          group.forEach((value) => frameRequestStarted.current.delete(`${frameSignature}:${value}`));
          console.warn(`${selectedProviderConfig.shortLabel} frame batch failed`, reason);
        }
      }

      if (!cancelled && failedCount > 0) {
        if (loadedCount === 0) {
          setError(`加载图帧失败：${selectedProviderConfig.shortLabel} 暂时没有返回可显示图帧`);
        } else {
          setNotice(`还有 ${failedCount} 张图帧索引失败，自动重试后仍未补齐；已就绪帧可正常播放。`);
        }
      }
      if (!cancelled) setLoadingFrames(false);
    }

    loadFrames();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeDashboard,
    detail,
    selectedProvider,
    selectedPackage,
    selectedProduct,
    animatedAxisName,
    selectedProjection,
    selectedInterval,
    selectedBaseTime,
    selectedProviderConfig.shortLabel,
  ]);

  useEffect(() => {
    if (
      activeDashboard !== "weather" ||
      !detail ||
      !selectedProduct ||
      !animatedAxisName ||
      !selectedValidTime ||
      !frameValues.includes(selectedValidTime) ||
      frames.some((frame) => frame.value === selectedValidTime) ||
      !selectedBaseTime ||
      !selectedProjection ||
      !selectedInterval
    ) {
      return;
    }

    const requestKey = `${frameSignature}:${selectedValidTime}`;
    if (frameRequestStarted.current.has(requestKey)) return;

    let cancelled = false;
    const controller = new AbortController();
    const params: Record<string, string | number | undefined> = {
      projection: selectedProjection,
      interval: selectedInterval,
      base_time: selectedBaseTime,
      expver: detail.values?.expver ?? 1,
    };
    if (animatedAxisName === "base_time") delete params.base_time;

    frameRequestStarted.current.add(requestKey);
    loadFrameGroupWithRetry(
      [selectedValidTime],
      (pendingValues) => fetchProviderAxisFrames(
        selectedProvider,
        selectedPackage,
        selectedProduct,
        animatedAxisName,
        params,
        pendingValues,
        controller.signal,
      ),
      { signal: controller.signal, maxAttempts: 3 },
    )
      .then((result) => {
        if (cancelled) return;
        if (result.frames.length) setLastUpdatedAt(new Date());
        if (result.frames.length) {
          setFramesForSignature((previous) => mergeOrderedFrames(previous, result.frames, frameValues));
        }
        if (result.missingValues.length) frameRequestStarted.current.delete(requestKey);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        frameRequestStarted.current.delete(requestKey);
        console.warn(`${selectedProviderConfig.shortLabel} selected frame request failed`, reason);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeDashboard,
    animatedAxisName,
    detail,
    frameSignature,
    frameValuesKey,
    frames,
    selectedProvider,
    selectedBaseTime,
    selectedInterval,
    selectedPackage,
    selectedProduct,
    selectedProjection,
    selectedValidTime,
    selectedProviderConfig.shortLabel,
  ]);

  useEffect(() => {
    activePreloadSignature.current = activeDashboard === "weather" ? frameSignature : "";
    preloadLoaded.current = new Set();
    preloadFailed.current = new Set();
    framePreloader.current?.cancel();
    const signature = frameSignature;
    const preloader = activeDashboard === "weather" && signature && frameValues.length
      ? new AnimationFramePreloader({
        concurrency: selectedProvider === "ecmwf" ? 6 : 3,
        load: (url, signal) => loadBrowserImage(animationFrameUrl(url), signal),
        onLoaded: (url) => {
          if (activePreloadSignature.current !== signature) return;
          preloadLoaded.current.add(url);
          preloadFailed.current.delete(url);
          syncAnimationPreloadStatus(signature);
        },
        onFailed: (url) => {
          if (activePreloadSignature.current !== signature) return;
          preloadFailed.current.add(url);
          syncAnimationPreloadStatus(signature);
        },
      })
      : null;
    framePreloader.current = preloader;
    animationExportAbort.current?.abort();
    animationExportAbort.current = null;
    setAnimationExportOpen(false);
    setAnimationExportRunning(false);
    setAnimationExportProgress(null);
    setAnimationExportError("");
    setIsPlaying(false);
    setPreloadStatus({
      signature: frameSignature,
      total: frameValues.length,
      loaded: 0,
      failed: 0,
      ready: false,
      playableValues: [],
    });
    setMeasurementPoints([]);
    return () => {
      preloader?.cancel();
      if (framePreloader.current === preloader) framePreloader.current = null;
    };
  }, [activeDashboard, frameSignature, frameValues.length, selectedProvider, syncAnimationPreloadStatus]);

  useEffect(() => {
    if (activeDashboard !== "weather" || !frameSignature || !frameValues.length) return;
    const signature = frameSignature;
    framePreloader.current?.enqueue(frames.flatMap((frame) => frame.url ? [frame.url] : []));
    syncAnimationPreloadStatus(signature);
  }, [activeDashboard, frames, frameSignature, frameValues.length, loadingFrames, syncAnimationPreloadStatus]);

  useEffect(() => {
    if (
      activeDashboard !== "weather" ||
      selectedProvider === "ecmwf" ||
      !firstTimelineFrame ||
      !firstPreviewLoaded
    ) {
      return;
    }
    const upgradedFrame = fullQualityModelChartFrame(firstTimelineFrame);
    if (!upgradedFrame) return;
    const signature = frameSignature;
    const upgradePreloader = new AnimationFramePreloader({
      concurrency: 1,
      retryDelaysMs: [1_000, 3_000, 8_000],
      load: (url, signal) => loadBrowserImage(animationFrameUrl(url), signal),
      onLoaded: (url) => {
        if (activePreloadSignature.current !== signature) return;
        if (framePreloader.current) {
          framePreloader.current.adoptLoaded(url);
        } else {
          preloadLoaded.current.add(url);
          preloadFailed.current.delete(url);
        }
        setFrameState((previous) => previous.signature === signature
          ? {
              signature,
              items: mergeOrderedFrames(previous.items, [upgradedFrame], frameValues),
            }
          : previous);
        setLastUpdatedAt(new Date());
      },
      onFailed: () => {
        if (activePreloadSignature.current !== signature) return;
        setNotice("首帧完整网格升级失败，继续保留快速预览；其他时次不受影响。");
      },
    });
    upgradePreloader.enqueue([upgradedFrame.url]);
    return () => upgradePreloader.cancel();
  }, [
    activeDashboard,
    firstPreviewLoaded,
    firstTimelineFrame?.url,
    frameSignature,
    frameValuesKey,
    selectedProvider,
  ]);

  useEffect(() => {
    if (isPlaying && !animationPlayable) setIsPlaying(false);
  }, [animationPlayable, isPlaying]);

  useEffect(() => {
    if (activeDashboard !== "weather" || !isPlaying || !animationPlayable) return;
    const frameDuration = 1000 / fps;
    let animationFrame = 0;
    let lastAdvanceAt = performance.now();
    const advance = (now: number) => {
      if (now - lastAdvanceAt >= frameDuration) {
        lastAdvanceAt = now;
        setSelectedValidTime((current) => {
          return nextPlayableFrame(frameValues, playableFrameValues, current, 1);
        });
      }
      animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeDashboard, animationPlayable, fps, frameValues, isPlaying, playableFrameValues]);

  useEffect(() => {
    if (activeDashboard !== "weather" || !thresholds.autoSpeak) {
      alertCycle.current = { ...EMPTY_WEATHER_ALERT_CYCLE };
      return;
    }
    const signature = weatherAlertSignature(selectedProvider, station, thresholds, risks);
    const decision = advanceWeatherAlertCycle(alertCycle.current, signature);
    alertCycle.current = decision.state;
    if (decision.shouldTrigger) triggerWeatherAlert("automatic", decision.force);
  }, [activeDashboard, risks, selectedProvider, station, thresholds, triggerWeatherAlert]);

  useEffect(() => {
    if (activeDashboard !== "weather") return;
    let cancelled = false;
    const controller = new AbortController();
    setProviderHealth({ status: "checking", latency: null });
    measureProviderLatency(selectedProvider, 8000, controller.signal)
      .then((latency) => {
        if (cancelled) return;
        setProviderHealth({ status: latencyStatus(latency), latency });
      })
      .catch((reason) => {
        if (cancelled) return;
        setProviderHealth({
          status: "red",
          latency: null,
          error: String((reason as Error).message ?? reason),
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeDashboard, selectedProvider, reloadNonce]);

  useEffect(() => {
    if (activeDashboard !== "weather") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingPointForecast(true);
      setPointForecasts({});
      setPointForecastErrors({});
      let pending = PROVIDERS.length;

      const loadProviderForecast = async (providerId: ProviderId) => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
          try {
            return await fetchPointForecast(providerId, station.lat, station.lon, controller.signal);
          } catch (reason) {
            lastError = reason;
            if (controller.signal.aborted || attempt === 2) throw reason;
            await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
        throw lastError;
      };

      PROVIDERS.forEach((provider) => {
        loadProviderForecast(provider.id)
          .then((forecast) => {
            if (controller.signal.aborted) return;
            setPointForecasts((current) => ({ ...current, [provider.id]: forecast }));
          })
          .catch((reason) => {
            if (controller.signal.aborted) return;
            setPointForecastErrors((current) => ({
              ...current,
              [provider.id]: String((reason as Error).message ?? reason),
            }));
          })
          .finally(() => {
            if (controller.signal.aborted) return;
            pending -= 1;
            if (pending === 0) setLoadingPointForecast(false);
          });
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeDashboard, reloadNonce, station.lat, station.lon]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const syncViewport = () => {
      setIsMobileViewport(media.matches);
      if (!media.matches) setMobileSidebarOpen(false);
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    setDrawer(null);
    setMobileSidebarOpen(false);
    if (activeDashboard === "earthquake") {
      setEarthquakeMounted(true);
      setIsPlaying(false);
      animationExportAbort.current?.abort();
      meteogramAbort.current?.abort();
      initialMeteogramStarted.current = false;
    }

    const resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    return () => window.clearTimeout(resizeTimer);
  }, [activeDashboard]);

  useEffect(() => {
    if (!developerMode && activeDashboard === "fan-weather") setActiveDashboard("weather");
  }, [activeDashboard, developerMode, setActiveDashboard]);

  useEffect(() => {
    if (!isMobileViewport || !mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, mobileSidebarOpen]);

  const requestMeteogram = async (
    location:
      | { type: "projection"; x: number; y: number; crs: string }
      | { type: "latlon"; lat: number; lon: number; station_name?: string },
  ) => {
    if (activeDashboard !== "weather" || !detail || !currentFrame) return;
    if (selectedProvider !== "ecmwf") {
      setNotice(`${selectedProviderConfig.shortLabel} 当前未提供 ECMWF 十天 ENS feature API；请切回 ECMWF 后生成原始 ENS。`);
      return;
    }
    meteogramAbort.current?.abort();
    const controller = new AbortController();
    meteogramAbort.current = controller;
    setLoadingMeteogram(true);
    setError("");
    try {
      const feature = currentFrame.click?.axis?.[0];
      const result = await fetchMeteogram({
        packageName: selectedPackage,
        productName: selectedProduct,
        location,
        axis: frameRequest(detail, currentFrame, {
          base_time: selectedBaseTime,
          valid_time: selectedValidTime,
          projection: selectedProjection,
          interval: selectedInterval,
        }),
        featureName: feature?.name ?? "epsgrams",
        featureValue: feature?.values?.[0]?.value ?? "classical_10d",
        signal: controller.signal,
      });
      if (meteogramAbort.current !== controller) return;
      setMeteogram(result);
      if (isNumber(result.lat) && isNumber(result.lon)) {
        setStation((current) => ({
          name: location.type === "projection" ? "图上点击位置" : current.name || "当前点位",
          lat: Number(result.lat.toFixed(4)),
          lon: Number(result.lon.toFixed(4)),
        }));
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(`生成 ENS 气象图失败：${String((reason as Error).message ?? reason)}`);
    } finally {
      if (meteogramAbort.current === controller) {
        meteogramAbort.current = null;
        setLoadingMeteogram(false);
      }
    }
  };

  useEffect(() => {
    if (
      activeDashboard !== "weather" ||
      initialMeteogramStarted.current ||
      selectedProvider !== "ecmwf" ||
      !detail ||
      !currentFrame?.url ||
      meteogram ||
      loadingMeteogram
    ) {
      return;
    }
    initialMeteogramStarted.current = true;
    requestMeteogram({ type: "latlon", lat: station.lat, lon: station.lon, station_name: station.name });
  }, [activeDashboard, currentFrame?.url, detail, loadingMeteogram, meteogram, selectedProvider, station.lat, station.lon, station.name]);

  const handleChartClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (toolMode === "browse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const navigation = currentFrame?.click?.navigation;

    const mapPoint: MeasurementPoint = navigation
      ? {
          x: (px / rect.width) * 100,
          y: (py / rect.height) * 100,
          mapX: navigation.xmin + (px * navigation.width) / rect.width,
          mapY: navigation.ymin + ((rect.height - py) * navigation.height) / rect.height,
          crs: navigation.crs,
        }
      : {
          x: (px / rect.width) * 100,
          y: (py / rect.height) * 100,
          mapX: -180 + (px / rect.width) * 360,
          mapY: 90 - (py / rect.height) * 180,
          crs: "EPSG:4326",
        };

    if (toolMode === "measure") {
      const nextPoints =
        measurementPoints.length === 1 && measurementPoints[0].crs === mapPoint.crs
          ? [measurementPoints[0], mapPoint]
          : [mapPoint];
      setMeasurementPoints(nextPoints);
      setNotice(
        nextPoints.length === 2
          ? `测距完成：${measurementDistance(nextPoints[0], nextPoints[1])}。再次点击可设置新的起点。`
          : "测距起点已设置，请在图面选择终点。",
      );
      return;
    }

    if (!navigation) {
      const coordinates = fallbackMapCoordinates(selectedProjection, px / rect.width, py / rect.height);
      const lat = coordinates.lat;
      const lon = coordinates.lon;
      setMarker({ x: mapPoint.x, y: mapPoint.y });
      setStation({
        name: "图上点击位置",
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
      });
      if (selectedProvider === "ecmwf") {
        requestMeteogram({ type: "latlon", lat, lon, station_name: "图上点击位置" });
      } else {
        setNotice(`${selectedProviderConfig.shortLabel} 图层已记录点击点；该接口暂不支持原始 ECMWF 十天 ENS。`);
      }
      return;
    }
    setMarker({ x: mapPoint.x, y: mapPoint.y });
    if (/4326|longlat|latlon/i.test(mapPoint.crs)) {
      setStation({
        name: "图上点击位置",
        lat: Number(mapPoint.mapY.toFixed(4)),
        lon: Number(mapPoint.mapX.toFixed(4)),
      });
    }
    requestMeteogram({ type: "projection", x: mapPoint.mapX, y: mapPoint.mapY, crs: mapPoint.crs });
  };

  const jumpFrame = (direction: -1 | 1) => {
    const candidates = playableFrameValues.length ? playableFrameValues : frameValues;
    if (!candidates.length) return;
    setSelectedValidTime(nextPlayableFrame(frameValues, candidates, selectedValidTime, direction));
  };

  const togglePlayback = () => {
    if (!animationPlayable) return;
    setIsPlaying((value) => !value);
  };

  const switchProvider = (providerId: ProviderId) => {
    const nextProvider = PROVIDER_BY_ID[providerId];
    setSelectedProvider(providerId);
    setSelectedPackage(nextProvider.defaultPackage);
    setSelectedProduct(nextProvider.defaultProduct);
    setSelectedProjection(nextProvider.defaultProjection);
    setSelectedBaseTime("");
    setSelectedValidTime("");
    setSelectedInterval("6");
    setSearchText("");
    setSelectedParameter("");
    setSelectedProductType("");
    setFramesForSignature([]);
    setDetail(null);
    setMeteogram(null);
    setMarker(null);
    setMeasurementPoints([]);
    setIsPlaying(false);
    setMobileSidebarOpen(false);
    setNotice(`${nextProvider.shortLabel} 接口已切换，正在加载该接口的图表目录和延迟状态。`);
  };

  const chooseGlobalProjection = () => {
    const global = projectionAxis?.values.find((option) => /global/i.test(option.label) || /global/i.test(option.value));
    if (!global) {
      setNotice("当前接口没有全球区域选项。");
      return;
    }
    setSelectedProjection(global.value);
    setNotice("已切换到全球区域。");
  };

  const fullscreenChart = async () => {
    try {
      await chartPanelRef.current?.requestFullscreen?.();
    } catch {
      setNotice("浏览器未允许进入全屏，请在页面权限中启用全屏后重试。");
    }
  };

  const toggleSidebar = () => {
    if (isMobileViewport) {
      setMobileSidebarOpen((value) => {
        if (!value && sidebarRef.current) sidebarRef.current.scrollTop = 0;
        return !value;
      });
      return;
    }
    setSidebarCollapsed((value) => !value);
  };

  const selectToolMode = (mode: ToolMode) => {
    setToolMode(mode);
    if (mode !== "measure") setMeasurementPoints([]);
    if (mode === "browse") setNotice("已进入浏览模式，点击图面不会生成点位或 ENS。");
    if (mode === "measure") setNotice("已进入测距模式，请依次点击起点和终点。");
    if (mode === "ens") setNotice("已进入点选 ENS 模式，单击图面即可生成当前点位气象图。");
  };

  const favoriteKey = `${selectedProvider}:${selectedPackage}:${selectedProduct}`;
  const isFavorite = favorites.includes(favoriteKey);
  const toggleFavorite = () => {
    setFavorites((current) =>
      current.includes(favoriteKey) ? current.filter((item) => item !== favoriteKey) : [...current, favoriteKey],
    );
    setNotice(
      isFavorite
        ? `已取消收藏：${translateProductTitle(selectedProductSummary?.title ?? selectedProduct)}`
        : `已收藏：${translateProductTitle(selectedProductSummary?.title ?? selectedProduct)}`,
    );
  };

  const downloadCurrentFrame = () => {
    if (!currentFrame?.url) {
      setNotice("当前帧尚未加载，暂时无法下载。");
      return;
    }
    const link = document.createElement("a");
    link.href = animationFrameUrl(currentFrame.url);
    link.download = `${selectedProvider}-${selectedProduct}-${selectedValidTime || "current"}.png`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  };

  const openAnimationExport = () => {
    if (!animationExportReady) {
      setNotice("全部动画图片加载完成后才可导出 GIF 或 MP4。");
      return;
    }
    setIsPlaying(false);
    setAnimationExportProgress(null);
    setAnimationExportError("");
    setAnimationExportOpen(true);
  };

  const startAnimationExport = async () => {
    if (!animationExportReady || animationExportRunning || animationExportFrames.length < 2) return;
    const controller = new AbortController();
    animationExportAbort.current = controller;
    setAnimationExportRunning(true);
    setAnimationExportError("");
    setAnimationExportProgress({
      phase: "preparing",
      percent: 0,
      completed: 0,
      total: animationExportFrames.length,
      message: "正在读取已加载动画帧",
    });
    try {
      const result = await exportWeatherAnimation({
        frames: animationExportFrames,
        fps,
        format: animationExportFormat,
        filenameBase: `${selectedProvider}-${selectedProduct}-${selectedProjection}-${selectedBaseTime || "latest"}`,
        signal: controller.signal,
        onProgress: setAnimationExportProgress,
      });
      downloadAnimationExport(result);
      setNotice(`已导出 ${result.frameCount} 帧 ${animationExportFormat.toUpperCase()}：${result.filename}`);
    } catch (reason) {
      if ((reason as Error)?.name === "AbortError") {
        setAnimationExportProgress(null);
      } else {
        setAnimationExportError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (animationExportAbort.current === controller) animationExportAbort.current = null;
      setAnimationExportRunning(false);
    }
  };

  const cancelAnimationExport = () => {
    animationExportAbort.current?.abort();
  };

  const changeAnimationExportFormat = (format: AnimationExportFormat) => {
    if (animationExportRunning) return;
    setAnimationExportFormat(format);
    setAnimationExportProgress(null);
    setAnimationExportError("");
  };

  const productCountText = loadingProducts ? "加载中" : `${filteredProducts.length}/${products.length}`;

  const currentDescription =
    selectedProvider === "ecmwf"
      ? buildChineseDescription({
          title: selectedProductSummary?.title ?? detail?.title,
          parameters: selectedProductSummary?.tags?.Parameters,
          productTypes: selectedProductSummary?.tags?.["Product type"],
          range: selectedProductSummary?.tags?.Range,
        })
      : `${selectedProviderConfig.label} 模式图层：${translateProductTitle(
          selectedProductSummary?.title ?? detail?.title ?? "当前图表",
        )}。该接口已接入统一产品选择、区域、基准时间、有效时间、动画播放和延迟检测；十天 ENS 点选仍以 ECMWF 原始 feature API 为准。官方源入口：${selectedProviderConfig.sourceUrl}`;
  const stationLabel = `${station.lat.toFixed(4)}°N, ${station.lon.toFixed(4)}°E`;
  const currentValidLabel = formatUtcLabel(validOptions.find((item) => item.value === selectedValidTime)?.label);
  const activeRiskCount = risks.filter((risk) => risk.level !== "normal").length;
  const currentAppTitle = activeDashboard === "earthquake" ? EARTHQUAKE_APP_TITLE : activeDashboard === "fan-weather" ? FAN_WEATHER_APP_TITLE : APP_TITLE;
  const compactAppTitle = activeDashboard === "earthquake" ? "地震速报" : activeDashboard === "fan-weather" ? "FAN 气象" : "气象图表";

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${mobileSidebarOpen ? " mobile-sidebar-open" : ""}`}
    >
      <header className="global-header">
        <div className="global-brand">
          <button
            className="chrome-button"
            title={
              isMobileViewport
                ? mobileSidebarOpen
                  ? "关闭控制面板"
                  : "打开控制面板"
                : sidebarCollapsed
                  ? "展开控制面板"
                  : "收起控制面板"
            }
            aria-label={
              isMobileViewport
                ? mobileSidebarOpen
                  ? "关闭控制面板"
                  : "打开控制面板"
                : sidebarCollapsed
                  ? "展开控制面板"
                  : "收起控制面板"
            }
            aria-expanded={isMobileViewport ? mobileSidebarOpen : !sidebarCollapsed}
            data-testid="sidebar-toggle"
            onClick={toggleSidebar}
          >
            <Menu size={18} />
          </button>
          <strong title={currentAppTitle}>
            <span className="brand-title-full">{currentAppTitle}</span>
            <span className="brand-title-compact">{compactAppTitle}</span>
          </strong>
          <nav className="dashboard-tabs" aria-label="Dashboard 切换">
            <button className={activeDashboard !== "earthquake" ? "active" : ""} aria-pressed={activeDashboard !== "earthquake"} title="气象 Dashboard" onClick={() => setActiveDashboard("weather")}>
              <CloudRain size={15} /><span>气象</span>
            </button>
            <button className={activeDashboard === "earthquake" ? "active" : ""} aria-pressed={activeDashboard === "earthquake"} title="地震 Dashboard" onClick={() => setActiveDashboard("earthquake")}>
              <Activity size={15} /><span>地震</span>
            </button>
          </nav>
          {activeDashboard !== "earthquake" ? (
            <div className="provider-switcher" title="选择图表接口">
              <Database size={15} />
              <select
                aria-label="图表接口"
                value={activeDashboard === "fan-weather" ? "__fan__" : selectedProvider}
                onChange={(event) => {
                  if (event.target.value === "__fan__") setActiveDashboard("fan-weather");
                  else {
                    setActiveDashboard("weather");
                    switchProvider(event.target.value as ProviderId);
                  }
                }}
              >
                {PROVIDERS.map((provider) => (
                  <option value={provider.id} key={provider.id}>
                    {provider.shortLabel}
                  </option>
                ))}
                {developerMode ? <option value="__fan__">FAN 气象数据</option> : null}
              </select>
              <span className={`latency-dot ${activeDashboard === "fan-weather" ? "green" : providerHealth.status}`} />
              <span className="latency-text">
                {activeDashboard === "fan-weather"
                  ? "按需"
                  : providerHealth.latency === null
                  ? providerHealth.status === "checking"
                    ? "检测中"
                    : "连接异常"
                  : `${providerHealth.latency} ms`}
              </span>
            </div>
          ) : (
            <div className="earthquake-header-source" title="地震速报数据源">
              <Database size={15} /><span>USGS · ShakeAlert · JMA · CENC · CWA · EMSC · GFZ · GeoNet · BMKG</span><i />
            </div>
          )}
        </div>
        <div className="global-actions">
          {activeDashboard !== "earthquake" ? (
            <>
              <span className="header-source">接口：{activeDashboard === "fan-weather" ? "FAN Studio" : selectedProviderConfig.label}</span>
              <button title="消息" aria-label="消息" onClick={() => setDrawer("messages")}>
                <MessageSquare size={17} />
                <span className="action-label">消息</span>
                <b>3</b>
              </button>
              <button title="告警" aria-label="告警" onClick={() => setDrawer("alerts")}>
                <Bell size={17} />
                <span className="action-label">告警</span>
                {activeRiskCount > 0 && <b>{activeRiskCount}</b>}
              </button>
              <button title="设置" aria-label="设置" onClick={() => setDrawer("settings")}>
                <Settings size={17} />
                <span className="action-label">设置</span>
              </button>
              <button title="帮助" aria-label="帮助" onClick={() => setDrawer("help")}>
                <HelpCircle size={17} />
                <span className="action-label">帮助</span>
              </button>
              <button title={`欢迎：${displayUserName}`} aria-label={`欢迎：${displayUserName}`} onClick={() => setDrawer("user")}>
                <UserCircle size={20} />
                <span className="action-label">欢迎：{displayUserName}</span>
              </button>
            </>
          ) : (
            <>
              <span className="header-source">全球地震目录实时聚合</span>
              <span className="earthquake-header-live"><Activity size={15} />速报监测</span>
              <button
                className="earthquake-header-user"
                title={`欢迎：${displayUserName}`}
                aria-label={`欢迎：${displayUserName}`}
                onClick={() => setDrawer("user")}
              >
                <UserCircle size={18} />欢迎：{displayUserName}
              </button>
            </>
          )}
        </div>
      </header>

      <button className="sidebar-scrim" aria-label="关闭控制面板" onClick={() => setMobileSidebarOpen(false)} />

      <div
        className={`dashboard-route${activeDashboard === "earthquake" ? "" : " dashboard-route-inactive"}`}
        aria-hidden={activeDashboard !== "earthquake"}
      >
        {earthquakeMounted && (
          <Suspense fallback={<div className="dashboard-route-loading"><Loader2 size={24} /><span>正在加载地震分析组件</span></div>}>
            <EarthquakeDashboard onToggleSidebar={toggleSidebar} userStation={station} developerMode={developerMode} />
          </Suspense>
        )}
      </div>
      <div
        className={`dashboard-route${activeDashboard === "weather" ? "" : " dashboard-route-inactive"}`}
        aria-hidden={activeDashboard !== "weather"}
      >
      <>
      <aside className="sidebar" aria-label="图表控制面板" ref={sidebarRef}>
        <div className="sidebar-rail">
          <div className="brand-mark">{selectedProviderConfig.shortLabel.slice(0, 1)}</div>
          <button title="展开控制面板" aria-label="展开控制面板" onClick={toggleSidebar}>
            <PanelLeftOpen size={18} />
          </button>
          <button
            title="生成默认点 ENS"
            aria-label="生成默认点 ENS"
            onClick={() =>
              requestMeteogram({ type: "latlon", lat: station.lat, lon: station.lon, station_name: station.name })
            }
          >
            <Crosshair size={18} />
          </button>
          <button title="系统设置" aria-label="系统设置" onClick={() => setDrawer("settings")}>
            <Settings size={18} />
          </button>
        </div>

        <div className="sidebar-inner">
        <div className="sidebar-head">
          <div>
            <span className={`latency-dot ${providerHealth.status}`} />
            <strong>{selectedProviderConfig.shortLabel} 控制台</strong>
          </div>
          <button title="收起控制面板" aria-label="收起控制面板" onClick={toggleSidebar}>
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="brand-row sidebar-brand-context">
          <div className="brand-mark">{selectedProviderConfig.shortLabel.slice(0, 1)}</div>
          <div>
            <h1>{selectedProviderConfig.label}</h1>
            <p>产品、区域、动画与点位预报</p>
          </div>
        </div>

        <section className="control-section station-section">
          <SectionTitle icon={<MapPin />} title="默认观测点" />
          <div className="station-card">
            <MapPin size={17} />
            <div>
              <strong>{stationLabel}</strong>
              <span>{station.name || "当前点位"}</span>
            </div>
            <button
              className="mini-icon"
              title="定位到默认观测点"
              onClick={() =>
                requestMeteogram({ type: "latlon", lat: station.lat, lon: station.lon, station_name: station.name })
              }
            >
              <Crosshair size={15} />
            </button>
          </div>
          <label>
            名称
            <input value={station.name} onChange={(event) => setStation({ ...station, name: event.target.value })} />
          </label>
          <div className="input-grid">
            <label>
              纬度
              <input
                type="number"
                step="0.0001"
                value={station.lat}
                onChange={(event) => setStation({ ...station, lat: Number(event.target.value) })}
              />
            </label>
            <label>
              经度
              <input
                type="number"
                step="0.0001"
                value={station.lon}
                onChange={(event) => setStation({ ...station, lon: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="button-row">
            <button
              className="primary-button"
              onClick={() =>
                requestMeteogram({ type: "latlon", lat: station.lat, lon: station.lon, station_name: station.name })
              }
            >
              <LocateFixed size={16} />
              生成该点 ENS
            </button>
            <button
              className="icon-button"
              title="使用浏览器定位"
              onClick={() => useBrowserLocation(setStation, setNotice)}
            >
              <Crosshair size={16} />
            </button>
          </div>
        </section>

        <section className="control-section">
          <SectionTitle icon={<Settings2 />} title="图表选择" meta={productCountText} />
          <label>
            图表包
            <select value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)}>
              {packages.map((item) => (
                <option value={item.name} key={item.name}>
                  {translatePackage(item.name, item.title)}
                </option>
              ))}
            </select>
          </label>
          <label className="search-field">
            搜索图表
            <span>
              <Search size={15} />
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="降水、风、EFI..." />
            </span>
          </label>
          <label>
            气象要素
            <select value={selectedParameter} onChange={(event) => setSelectedParameter(event.target.value)}>
              <option value="">全部要素</option>
              {parameterOptions.map((item) => (
                <option value={item} key={item}>
                  {translateValue(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            图表类型
            <select value={selectedProductType} onChange={(event) => setSelectedProductType(event.target.value)}>
              <option value="">全部类型</option>
              {productTypeOptions.map((item) => (
                <option value={item} key={item}>
                  {translateValue(item)}
                </option>
              ))}
            </select>
          </label>
          <div className="field-label">
            <span className="field-caption">产品</span>
            <span className="select-with-action">
              <select
                id="product-select"
                aria-label="产品"
                value={selectedProduct}
                onChange={(event) => setSelectedProduct(event.target.value)}
              >
                {filteredProducts.map((product) => (
                  <option value={product.name} key={product.name}>
                    {translateProductTitle(product.title)}
                  </option>
                ))}
              </select>
              <button
                className={isFavorite ? "active" : ""}
                title={isFavorite ? "取消收藏" : "收藏图表"}
                aria-label={isFavorite ? "取消收藏" : "收藏图表"}
                aria-pressed={isFavorite}
                onClick={toggleFavorite}
              >
                <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </span>
          </div>
        </section>

        <section className="control-section">
          <SectionTitle icon={<Gauge />} title="时空维度" />
          <div className="field-label">
            <span className="field-caption">区域</span>
            <span className="select-with-action">
              <select
                id="projection-select"
                aria-label="区域"
                value={selectedProjection}
                onChange={(event) => setSelectedProjection(event.target.value)}
              >
                {projectionAxis?.values.map((option) => (
                  <option value={option.value} key={option.value}>
                    {translateRegion(option.label)}
                  </option>
                ))}
              </select>
              <button title="全球区域" onClick={chooseGlobalProjection}>
                <Globe2 size={15} />
              </button>
            </span>
          </div>
          {intervalAxis && (
            <label>
              间隔（小时）
              <select
                id="interval-select"
                value={selectedInterval}
                onChange={(event) => setSelectedInterval(event.target.value)}
              >
                {intervalAxis.values.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            基准时间
            <select
              id="base-time-select"
              value={selectedBaseTime}
              onChange={(event) => setSelectedBaseTime(event.target.value)}
            >
              {baseAxis?.values.map((option) => (
                <option value={option.value} key={option.value}>
                  {formatUtcLabel(option.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            有效时间
            <select
              id="valid-time-select"
              value={selectedValidTime}
              onChange={(event) => setSelectedValidTime(event.target.value)}
            >
              {validOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {formatUtcLabel(option.label)}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="control-section">
          <SectionTitle icon={<Play />} title="动画播放" />
          <label>
            默认帧率
            <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
              {FPS_OPTIONS.map((value) => (
                <option value={value} key={value}>
                  {value} fps
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={smooth} onChange={(event) => setSmooth(event.target.checked)} />
            平滑动画
          </label>
        </section>

        <section className="control-section">
          <SectionTitle icon={<Bell />} title="阈值告警" />
          <div className="input-grid">
            <label>
              降水 mm
              <input
                type="number"
                value={thresholds.rainMm}
                onChange={(event) => setThresholds({ ...thresholds, rainMm: Number(event.target.value) })}
              />
            </label>
            <label>
              风速 m/s
              <input
                type="number"
                value={thresholds.windMs}
                onChange={(event) => setThresholds({ ...thresholds, windMs: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            警告声
            <select value={thresholds.sound} onChange={(event) => setThresholds({ ...thresholds, sound: event.target.value as Thresholds["sound"] })}>
              <option value="double">双音 + 语音</option>
              <option value="beep">短促蜂鸣</option>
              <option value="voice">中文播报</option>
              <option value="silent">静音</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={thresholds.autoSpeak}
              onChange={(event) => setThresholds({ ...thresholds, autoSpeak: event.target.checked })}
            />
            超阈值自动播报
          </label>
          <button className="secondary-button" onClick={() => speakRisk(risks, station.name, thresholds.sound)}>
            <Volume2 size={15} />
            试听告警
          </button>
          <div className="threshold-actions">
            <button
              onClick={() => {
                setThresholds({ rainMm: 50, windMs: 25, efi: 0.8, autoSpeak: false, sound: "double" });
                setNotice("告警阈值已恢复为默认值。");
              }}
            >
              重置
            </button>
            <button className="apply-button" onClick={() => setNotice("告警阈值与播报设置已保存到本机。") }>
              <Check size={15} />
              应用
            </button>
          </div>
          <p className="last-updated">上次更新：{formatLastUpdated(lastUpdatedAt)} UTC</p>
        </section>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h2>{translateProductTitle(selectedProductSummary?.title ?? detail?.title ?? "图表加载中")}</h2>
            <p>
              {selectedProviderConfig.shortLabel} / {selectedPackage} / {selectedProduct} ·{" "}
              {translateRegion(projectionAxis?.values.find((item) => item.value === selectedProjection)?.label ?? "")}
            </p>
          </div>
          <div className="status-strip">
            <StatusPill
              label="接口"
              value={
                providerHealth.latency === null
                  ? providerHealth.status === "checking"
                    ? "检测中"
                    : "异常"
                  : `${providerHealth.latency} ms`
              }
            />
            <StatusPill label="目录" value={products.length ? `${products.length} 个产品` : "加载中"} />
            <StatusPill label="区域" value={projectionAxis?.values.length ? `${projectionAxis.values.length} 个` : "无"} />
            <StatusPill label="帧" value={frames.length ? `${frames.length}/${validOptions.length}` : "等待"} />
            <StatusPill
              label="图片"
              value={
                animationFullyReady
                  ? "全部就绪"
                  : animationPlayable
                    ? `${playableFrameValues.length}/${preloadStatus.total} 可播`
                    : `${preloadStatus.loaded}/${preloadStatus.total}`
              }
            />
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}
        {notice && (
          <div className="notice-banner">
            <span>{notice}</span>
            <button onClick={() => setNotice("")}>关闭</button>
          </div>
        )}
        {animationExportOpen && (
          <AnimationExportDialog
            format={animationExportFormat}
            fps={fps}
            frameCount={animationExportFrames.length}
            ready={animationExportReady}
            running={animationExportRunning}
            progress={animationExportProgress}
            error={animationExportError}
            onFormatChange={changeAnimationExportFormat}
            onStart={startAnimationExport}
            onCancel={cancelAnimationExport}
            onClose={() => setAnimationExportOpen(false)}
          />
        )}

        <section className="chart-stage">
          <div className="map-stack">
            <div className="chart-panel" ref={chartPanelRef}>
              <div className="chart-toolbar">
                <div>
                  <strong>{currentValidLabel}</strong>
                  <span>{selectedInterval} 小时间隔 · {fps} fps</span>
                </div>
                <div className="tool-buttons">
                  <button title="刷新当前产品" onClick={() => setReloadNonce((value) => value + 1)}>
                    <RefreshCw size={16} />
                  </button>
                  <button title="下载当前图" disabled={!currentFrame?.url} onClick={downloadCurrentFrame}>
                    <Download size={16} />
                  </button>
                  <button
                    title={animationExportReady ? "导出完整动画" : "全部图片加载完成后可导出动画"}
                    disabled={!animationExportReady}
                    onClick={openAnimationExport}
                  >
                    <Film size={16} />
                  </button>
                  <button title="说明" onClick={() => setDrawer("info")}>
                    <Info size={16} />
                  </button>
                  <button title="全屏" onClick={fullscreenChart}>
                    <Expand size={16} />
                  </button>
                </div>
              </div>

              <div className={`image-shell ${smooth ? "smooth" : ""} mode-${toolMode}`}>
                <div className="map-title-badge">
                  <strong>{translateProductTitle(selectedProductSummary?.title ?? detail?.title ?? "图表")}</strong>
                  <span>{translateRegion(projectionAxis?.values.find((item) => item.value === selectedProjection)?.label ?? "")}</span>
                </div>
                {(loadingDetail || (loadingFrames && !currentFrame?.url)) && (
                  <div className="loading-overlay">
                    <Loader2 size={28} />
                    加载 {selectedProviderConfig.shortLabel} 图帧
                  </div>
                )}
                {frameVisual.currentUrl ? (
                  <div
                    className="weather-frame-layer"
                    style={{
                      opacity: layerVisible ? layerOpacity : 0,
                      "--frame-crossfade-ms": `${crossfadeDurationMs}ms`,
                    } as CSSProperties}
                  >
                    {frameVisual.previousUrl && (
                      <img
                        className="weather-frame-previous"
                        src={frameVisual.previousUrl}
                        alt=""
                        aria-hidden="true"
                      />
                    )}
                    <img
                      key={`${frameVisual.signature}:${frameVisual.revision}`}
                      className={`weather-frame-current${smooth && frameVisual.previousUrl ? " crossfade" : ""}`}
                      src={frameVisual.currentUrl}
                      alt={`${selectedProviderConfig.shortLabel} 图表`}
                      onClick={handleChartClick}
                    />
                  </div>
                ) : (
                  <div className="empty-chart">当前选择暂无可显示图帧</div>
                )}
                {currentFrame?.url && !animationFullyReady && (
                  <PreloadOverlay
                    indexed={frames.length}
                    loaded={preloadStatus.loaded}
                    playable={playableFrameValues.length}
                    total={preloadStatus.total}
                    failed={preloadStatus.failed}
                    percent={preloadPercent}
                    loadingFrames={loadingFrames}
                  />
                )}
                {marker && (
                  <div className="map-marker" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>
                    <span />
                    <em>{stationLabel}</em>
                  </div>
                )}
                {measurementPoints.length > 0 && (
                  <div className="measurement-overlay" aria-label="测距结果">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      {measurementPoints.length === 2 && (
                        <line
                          x1={measurementPoints[0].x}
                          y1={measurementPoints[0].y}
                          x2={measurementPoints[1].x}
                          y2={measurementPoints[1].y}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                    {measurementPoints.map((point, index) => (
                      <i
                        key={`${point.x}-${point.y}-${index}`}
                        className={`measure-point point-${index + 1}`}
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      >
                        {index + 1}
                      </i>
                    ))}
                    {measurementPoints.length === 2 && (
                      <strong
                        style={{
                          left: `${(measurementPoints[0].x + measurementPoints[1].x) / 2}%`,
                          top: `${(measurementPoints[0].y + measurementPoints[1].y) / 2}%`,
                        }}
                      >
                        {measurementDistance(measurementPoints[0], measurementPoints[1])}
                      </strong>
                    )}
                  </div>
                )}
                <div className="tool-mode-badge">
                  {toolMode === "ens" ? "点选 ENS" : toolMode === "measure" ? "测距参考" : "浏览模式"}
                </div>
                <div className="right-rail">
                  <button
                    className={toolMode === "ens" ? "active" : ""}
                    title="点击图面生成 ENS"
                    aria-pressed={toolMode === "ens"}
                    onClick={() => selectToolMode("ens")}
                  >
                    <Crosshair size={17} />
                  </button>
                  <button
                    className={toolMode === "browse" ? "active" : ""}
                    title="浏览模式"
                    aria-pressed={toolMode === "browse"}
                    onClick={() => selectToolMode("browse")}
                  >
                    <Hand size={17} />
                  </button>
                  <button
                    className={toolMode === "measure" ? "active" : ""}
                    title="测量距离"
                    aria-pressed={toolMode === "measure"}
                    onClick={() => selectToolMode("measure")}
                  >
                    <Ruler size={17} />
                  </button>
                  <button
                    title="默认观测点"
                    onClick={() =>
                      requestMeteogram({ type: "latlon", lat: station.lat, lon: station.lon, station_name: station.name })
                    }
                  >
                    <MapPin size={17} />
                  </button>
                  <button className={!layerVisible ? "muted-active" : ""} title="图层" onClick={() => setDrawer("layers")}>
                    <Layers size={17} />
                  </button>
                  <button title="图例" onClick={() => setDrawer("legend")}>
                    <CloudRain size={17} />
                  </button>
                </div>
                <div className="scale-badge">
                  <strong>500 km</strong>
                  <span>比例尺 1:14,000,000</span>
                </div>
              </div>

              <div className="player">
                <button title="上一帧" aria-label="上一帧" onClick={() => jumpFrame(-1)}>
                  <SkipBack size={16} />
                </button>
                <button
                  className="play-button"
                  disabled={!animationPlayable}
                  title={
                    animationPlayable
                      ? isPlaying
                        ? "暂停动画"
                        : "播放已就绪帧，后台继续索引"
                      : "至少需要 2 张图片完成加载后才能播放"
                  }
                  onClick={togglePlayback}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button title="下一帧" aria-label="下一帧" onClick={() => jumpFrame(1)}>
                  <SkipForward size={16} />
                </button>
                <button title="回到起点" onClick={() => setSelectedValidTime(frameValues[0] ?? "")}>
                  <RotateCcw size={16} />
                </button>
                <select
                  className="fps-inline"
                  aria-label="播放器帧率"
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                >
                  {FPS_OPTIONS.map((value) => (
                    <option value={value} key={value}>
                      {value} fps
                    </option>
                  ))}
                </select>
                <input
                  aria-label="动画时间轴"
                  type="range"
                  min={0}
                  max={Math.max(validOptions.length - 1, 0)}
                  value={currentFrameIndex}
                  onChange={(event) => setSelectedValidTime(validOptions[Number(event.target.value)]?.value ?? "")}
                />
                <span>{formatUtcLabel(validOptions[currentFrameIndex]?.label)}</span>
                <button
                  title={animationPlayable ? "循环播放已就绪帧" : "至少需要 2 张图片完成加载后才能播放"}
                  disabled={!animationPlayable}
                  onClick={() => setIsPlaying(true)}
                >
                  循环播放
                </button>
                <div className="player-preload">
                  <span>
                    {animationFullyReady
                      ? "动画已全量预加载"
                      : animationPlayable
                        ? `可播放 ${playableFrameValues.length} 帧，后台继续索引 ${frames.length}/${preloadStatus.total}`
                        : `索引 ${frames.length}/${preloadStatus.total}，图片 ${preloadStatus.loaded}/${preloadStatus.total}`}
                  </span>
                  <i>
                    <b style={{ width: `${preloadPercent}%` }} />
                  </i>
                </div>
              </div>
            </div>

            <PointWeatherPanel
              station={station}
              forecasts={pointForecasts}
              errors={pointForecastErrors}
              loading={loadingPointForecast}
              selectedProvider={selectedProvider}
              alertHistory={weatherAlertHistory}
              onClearAlertHistory={clearWeatherAlertHistory}
            />

          </div>

          <aside className="inspector">
            <section>
              <SectionTitle icon={<Zap />} title="当前定位的极端天气" />
              <div className="risk-list">
                {risks.map((risk) => (
                  <article className={`risk-card ${risk.level}`} key={risk.id}>
                    <strong>{risk.title}</strong>
                    <span>{risk.level === "warning" ? "警告" : risk.level === "watch" ? "关注" : "正常"}</span>
                    <p>{risk.detail}</p>
                  </article>
                ))}
              </div>
              {loadingPointForecast && (
                <div className="point-forecast-loading">
                  <Loader2 size={16} />
                  正在更新点位模式预报
                </div>
              )}
              {pointForecastError && <p className="point-forecast-error">点位预报暂不可用：{pointForecastError}</p>}
              {pointForecast && (
                <>
                  <div className="observation-table point-forecast-table">
                    <strong>
                      最近预报时次 · {formatForecastTime(pointForecast.forecastTime)} UTC
                    </strong>
                    <dl>
                      <div><dt>天气</dt><dd>{pointForecast.current.weatherText}</dd></div>
                      <div><dt>降水</dt><dd>{metric(pointForecast.current.precipitationMm, "mm")}</dd></div>
                      <div><dt>气温</dt><dd>{metric(pointForecast.current.temperatureC, "°C")}</dd></div>
                      <div><dt>相对湿度</dt><dd>{metric(pointForecast.current.humidityPercent, "%", 0)}</dd></div>
                      <div><dt>平均风速</dt><dd>{metric(pointForecast.current.windSpeedMs, "m/s")}</dd></div>
                      <div><dt>最大阵风</dt><dd>{metric(pointForecast.current.windGustMs, "m/s")}</dd></div>
                      <div><dt>海平面气压</dt><dd>{metric(pointForecast.current.pressureHpa, "hPa")}</dd></div>
                      <div><dt>未来 24h 降水</dt><dd>{pointForecast.next24Hours.precipitationMm.toFixed(1)} mm</dd></div>
                    </dl>
                  </div>
                  <div className="data-source point-forecast-source">
                    <Database size={14} />
                    <span>
                      {pointForecast.model} · 网格 {pointForecast.latitude.toFixed(2)}, {pointForecast.longitude.toFixed(2)} ·{" "}
                      <a href={pointForecast.sourceUrl} target="_blank" rel="noreferrer">{pointForecast.sourceLabel}</a>
                    </span>
                  </div>
                </>
              )}
            </section>

            <section>
              <SectionTitle icon={<Waves />} title="十天 ENS 气象图" />
              <div className="station-readout">
                <strong>{station.name || "当前点位"}</strong>
                <span>
                  {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
                </span>
              </div>
              {loadingMeteogram && (
                <div className="meteogram-loading">
                  <Loader2 size={22} />
                  正在生成 ENS 气象图
                </div>
              )}
              {meteogram?.url ? (
                <div className="meteogram-card">
                  <img src={meteogram.url} alt="十天 ENS 气象图" />
                  <p>{translateMeteogramText(meteogram.text)}</p>
                </div>
              ) : (
                <p className="muted">点击主图任意位置，或输入经纬度后生成该点十天 ENS 气象图。</p>
              )}
            </section>

            <section>
              <SectionTitle icon={<Wind />} title="图层图例" />
              <LegendList frame={currentFrame} />
            </section>
          </aside>
        </section>

        <section className="description-panel">
          <h3>产品说明</h3>
          <p>{currentDescription}</p>
          <div className="tag-row">
            {Object.entries(selectedProductSummary?.tags ?? {}).flatMap(([key, values]) =>
              values.slice(0, 2).map((value) => (
                <span key={`${key}-${value}`}>
                  {translateFacet(key)}：{translateValue(value)}
                </span>
              )),
            )}
          </div>
        </section>
      </main>
      </>
      </div>
      <div
        className={`dashboard-route${activeDashboard === "fan-weather" ? "" : " dashboard-route-inactive"}`}
        aria-hidden={activeDashboard !== "fan-weather"}
      >
        {activeDashboard === "fan-weather" ? <Suspense fallback={<div className="dashboard-route-loading"><Loader2 size={24} /><span>正在加载 FAN 气象数据板</span></div>}><FanWeatherDashboard /></Suspense> : null}
      </div>
      <DashboardDrawer
        view={drawer}
        onClose={() => setDrawer(null)}
        userName={userName}
        setUserName={setUserName}
        provider={selectedProviderConfig}
        providerHealth={providerHealth}
        risks={risks}
        fps={fps}
        setFps={setFps}
        smooth={smooth}
        setSmooth={setSmooth}
        thresholds={thresholds}
        setThresholds={setThresholds}
        currentDescription={currentDescription}
        currentFrame={currentFrame}
        products={products}
        frames={frames}
        preloadStatus={preloadStatus}
        animationPlayable={animationPlayable}
        favoritesCount={favorites.length}
        layerVisible={layerVisible}
        setLayerVisible={setLayerVisible}
        layerOpacity={layerOpacity}
        setLayerOpacity={setLayerOpacity}
        legend={<LegendList frame={currentFrame} />}
        alertHistoryCount={weatherAlertHistory.length}
        onSpeak={announceCurrentRisk}
        developerMode={developerMode}
        setDeveloperMode={setDeveloperMode}
      />
    </div>
  );
}

function DashboardDrawer(props: {
  view: DrawerView;
  onClose: () => void;
  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
  provider: ProviderConfig;
  providerHealth: ProviderHealth;
  risks: RiskCard[];
  fps: number;
  setFps: React.Dispatch<React.SetStateAction<number>>;
  smooth: boolean;
  setSmooth: React.Dispatch<React.SetStateAction<boolean>>;
  thresholds: Thresholds;
  setThresholds: React.Dispatch<React.SetStateAction<Thresholds>>;
  currentDescription: string;
  currentFrame?: FrameItem;
  products: ProductSummary[];
  frames: FrameItem[];
  preloadStatus: PreloadStatus;
  animationPlayable: boolean;
  favoritesCount: number;
  layerVisible: boolean;
  setLayerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  layerOpacity: number;
  setLayerOpacity: React.Dispatch<React.SetStateAction<number>>;
  legend: React.ReactNode;
  alertHistoryCount: number;
  onSpeak: () => void;
  developerMode: boolean;
  setDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (!props.view) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.view, props.onClose]);

  if (!props.view) return null;
  const activeRisks = props.risks.filter((risk) => risk.level !== "normal");
  const titleMap: Record<Exclude<DrawerView, null>, string> = {
    messages: "消息中心",
    alerts: "告警设置",
    settings: "系统设置",
    help: "帮助",
    user: "用户",
    info: "图表说明",
    layers: "图层",
    legend: "图例",
  };

  return (
    <div className="drawer-backdrop" role="presentation" onClick={props.onClose}>
      <aside
        className="dashboard-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={titleMap[props.view]}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{titleMap[props.view]}</strong>
          <button title="关闭" aria-label="关闭" onClick={props.onClose}>
            <X size={17} />
          </button>
        </header>

        {props.view === "messages" && (
          <div className="drawer-content">
            <DrawerMetric label="接口延迟" value={latencyText(props.providerHealth)} tone={props.providerHealth.status} />
            <DrawerMetric label="产品目录" value={`${props.products.length} 个产品`} />
            <DrawerMetric
              label="动画帧"
              value={`${props.frames.length}/${props.preloadStatus.total || 0} 已索引 · ${props.preloadStatus.loaded} 已加载`}
            />
            <div className="message-list">
              <article>
                <Check size={15} />
                <div><strong>动画索引器已启用</strong><span>可播放帧会立即进入时间轴</span></div>
              </article>
              <article>
                <Database size={15} />
                <div><strong>{props.provider.shortLabel} 接口已连接</strong><span>{latencyText(props.providerHealth)}</span></div>
              </article>
              <article>
                <Star size={15} />
                <div><strong>收藏夹</strong><span>已保存 {props.favoritesCount} 个图表</span></div>
              </article>
            </div>
            <p className="muted">
              {props.animationPlayable
                ? "当前动画已可播放，未完成的帧会继续在后台索引。"
                : "至少需要两张图片完成加载后才允许播放，避免播放到空帧时卡住。"}
            </p>
          </div>
        )}

        {props.view === "alerts" && (
          <div className="drawer-content">
            <div className="risk-list">
              {(activeRisks.length ? activeRisks : props.risks).map((risk) => (
                <article className={`risk-card ${risk.level}`} key={`drawer-${risk.id}`}>
                  <strong>{risk.title}</strong>
                  <span>{risk.level === "warning" ? "警告" : risk.level === "watch" ? "关注" : "正常"}</span>
                  <p>{risk.detail}</p>
                </article>
              ))}
            </div>
            <button className="secondary-button" onClick={props.onSpeak}>
              <Volume2 size={15} />
              立即播报
            </button>
            <p className="muted">点位面板已保留 {props.alertHistoryCount} 条气象预警历史。</p>
          </div>
        )}

        {props.view === "settings" && (
          <div className="drawer-content">
            <label>
              默认帧率
              <select value={props.fps} onChange={(event) => props.setFps(Number(event.target.value))}>
                {FPS_OPTIONS.map((value) => (
                  <option value={value} key={value}>
                    {value} fps
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={props.smooth} onChange={(event) => props.setSmooth(event.target.checked)} />
              平滑动画
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={props.developerMode} onChange={(event) => props.setDeveloperMode(event.target.checked)} />
              开发者模式（显示 FAN 实验数据源）
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={props.thresholds.autoSpeak}
                onChange={(event) => props.setThresholds({ ...props.thresholds, autoSpeak: event.target.checked })}
              />
              超阈值自动播报
            </label>
            <label>
              警告声
              <select
                value={props.thresholds.sound}
                onChange={(event) => props.setThresholds({ ...props.thresholds, sound: event.target.value as Thresholds["sound"] })}
              >
                <option value="double">双音 + 语音</option>
                <option value="beep">短促蜂鸣</option>
                <option value="voice">中文播报</option>
                <option value="silent">静音</option>
              </select>
            </label>
          </div>
        )}

        {props.view === "help" && (
          <div className="drawer-content">
            <p>
              页眉接口选择会切换产品目录、区域、基准时间、有效时间和播放器数据。延迟灯按接口探测耗时显示：绿色快，黄色偏慢，红色异常或超时。
            </p>
            <p>
              ECMWF 使用 opencharts API 并支持原始十天 ENS 点选。GFS、ICON、CMA/NMC、JMA 使用各机构单次模式运行的真实网格值，按所选区域和时次生成降水、气压、温度及风场图。
            </p>
            <p>动画播放只使用已索引且已完成图片加载的帧；未完成帧会在后台继续补齐，不会阻塞已就绪动画。</p>
          </div>
        )}

        {props.view === "user" && (
          <div className="drawer-content">
            <label className="user-name-editor">
              显示名称
              <input
                aria-label="用户显示名称"
                type="text"
                value={props.userName}
                maxLength={MAX_USER_NAME_LENGTH}
                placeholder={DEFAULT_USER_NAME}
                autoComplete="nickname"
                onChange={(event) => props.setUserName(event.target.value.slice(0, MAX_USER_NAME_LENGTH))}
                onBlur={() => props.setUserName((value) => normalizeUserName(value))}
              />
            </label>
            <DrawerMetric label="欢迎" value={normalizeUserName(props.userName)} />
            <DrawerMetric label="当前接口" value={props.provider.shortLabel} />
            <DrawerMetric label="使用定位" value="公众信息展示与学习" />
            <DrawerMetric label="收藏图表" value={`${props.favoritesCount} 个`} />
            <p className="muted">偏好设置会保存在本机浏览器 localStorage 中。</p>
          </div>
        )}

        {props.view === "info" && (
          <div className="drawer-content">
            <DrawerMetric label="接口" value={props.provider.label} tone={props.providerHealth.status} />
            <p>{props.currentDescription}</p>
            {props.currentFrame?.info && <p className="muted">{props.currentFrame.info}</p>}
            <a className="drawer-link" href={props.provider.sourceUrl} target="_blank" rel="noreferrer">
              打开官方源
            </a>
            {props.provider.id !== "ecmwf" && (
              <a className="drawer-link" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                数据传输：Open-Meteo
              </a>
            )}
          </div>
        )}

        {props.view === "layers" && (
          <div className="drawer-content">
            <DrawerMetric label="当前接口" value={props.provider.shortLabel} />
            <DrawerMetric label="图层帧" value={`${props.frames.length}/${props.preloadStatus.total || 0}`} />
            <div className="layer-toggle-row">
              <span>主气象图层</span>
              <button
                className={props.layerVisible ? "active" : ""}
                aria-pressed={props.layerVisible}
                aria-label={props.layerVisible ? "隐藏主气象图层" : "显示主气象图层"}
                title={props.layerVisible ? "隐藏主气象图层" : "显示主气象图层"}
                onClick={() => props.setLayerVisible((value) => !value)}
              >
                {props.layerVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                {props.layerVisible ? "隐藏" : "显示"}
              </button>
            </div>
            <label>
              图层透明度：{Math.round(props.layerOpacity * 100)}%
              <input
                aria-label="图层透明度"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={props.layerOpacity}
                onChange={(event) => props.setLayerOpacity(Number(event.target.value))}
              />
            </label>
            <p className="muted">主气象图层可即时显隐并调整透明度，播放、点选和图例状态保持不变。</p>
          </div>
        )}

        {props.view === "legend" && <div className="drawer-content">{props.legend}</div>}
      </aside>
    </div>
  );
}

function DrawerMetric(props: { label: string; value: string; tone?: ProviderHealthStatus }) {
  return (
    <div className={`drawer-metric ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function AnimationExportDialog(props: {
  format: AnimationExportFormat;
  fps: number;
  frameCount: number;
  ready: boolean;
  running: boolean;
  progress: AnimationExportProgress | null;
  error: string;
  onFormatChange: (format: AnimationExportFormat) => void;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const duration = animationDurationSeconds(props.frameCount, props.fps);
  return (
    <div
      className="animation-export-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.running) props.onClose();
      }}
    >
      <section className="animation-export-dialog" role="dialog" aria-modal="true" aria-labelledby="animation-export-title">
        <header>
          <div>
            <Film size={18} />
            <span>
              <strong id="animation-export-title">导出气象动画</strong>
              <small>仅导出当前已完整加载的时间轴</small>
            </span>
          </div>
          <button title="关闭导出窗口" aria-label="关闭导出窗口" disabled={props.running} onClick={props.onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="animation-export-formats" role="group" aria-label="动画导出格式">
          <button className={props.format === "gif" ? "active" : ""} disabled={props.running} onClick={() => props.onFormatChange("gif")}>GIF</button>
          <button className={props.format === "mp4" ? "active" : ""} disabled={props.running} onClick={() => props.onFormatChange("mp4")}>MP4</button>
        </div>

        <dl className="animation-export-metrics">
          <div><dt>图帧</dt><dd>{props.frameCount} 张</dd></div>
          <div><dt>帧率</dt><dd>{props.fps} fps</dd></div>
          <div><dt>时长</dt><dd>{duration.toFixed(duration < 10 ? 1 : 0)} 秒</dd></div>
        </dl>

        <div className="animation-export-progress" aria-live="polite">
          <span><strong>{props.progress?.message ?? (props.ready ? "动画帧已全部就绪" : "等待全部图帧加载")}</strong><em>{props.progress?.percent ?? 0}%</em></span>
          <i><b style={{ width: `${props.progress?.percent ?? 0}%` }} /></i>
          {props.error && <p>{props.error}</p>}
        </div>

        <footer>
          <button onClick={props.running ? props.onCancel : props.onClose}>{props.running ? "取消导出" : "关闭"}</button>
          <button className="primary" disabled={!props.ready || props.running} onClick={props.onStart}>
            {props.running ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
            {props.running ? "正在生成" : `导出 ${props.format.toUpperCase()}`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function latencyText(health: ProviderHealth) {
  if (health.latency !== null) return `${health.latency} ms`;
  if (health.status === "checking") return "检测中";
  return health.error ? "连接异常" : "无数据";
}

function SectionTitle(props: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="section-title">
      <span>{props.icon}</span>
      <strong>{props.title}</strong>
      {props.meta && <em>{props.meta}</em>}
    </div>
  );
}

function StatusPill(props: { label: string; value: string }) {
  return (
    <div className="status-pill">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PreloadOverlay(props: {
  indexed: number;
  loaded: number;
  playable: number;
  total: number;
  failed: number;
  percent: number;
  loadingFrames: boolean;
}) {
  const waitingForIndex = props.loadingFrames && props.indexed < props.total;
  const canPlayPartial = props.playable >= 2;
  const incompleteIndex = !props.loadingFrames && props.indexed < props.total;
  return (
    <div className="preload-overlay">
      <div>
        <strong>
          {canPlayPartial && props.loadingFrames
            ? "可边播放边索引"
            : incompleteIndex
              ? "部分图帧待重试"
              : waitingForIndex
                ? "正在获取图帧索引"
                : "正在预加载动画图片"}
        </strong>
        <span>
          可播 {props.playable} · 索引 {props.indexed}/{props.total} · 图片 {props.loaded}/{props.total} · {props.percent}%
          {props.failed ? ` · ${props.failed} 张失败` : ""}
        </span>
      </div>
      <div className="preload-bar" aria-label="动画图片预加载进度">
        <i style={{ width: `${props.percent}%` }} />
      </div>
      <p>
        {canPlayPartial
          ? props.loadingFrames
            ? "播放时只跳转已索引且已加载的图片；剩余图片会在后台继续补齐。"
            : incompleteIndex
              ? "已自动重试失败索引；当前只播放已就绪图帧，可用刷新按钮再次补齐。"
              : "播放时只跳转已索引且已加载的图片。"
          : "首帧已可查看。至少 2 张图片加载完成后即可播放，未索引的帧会先跳过。"}
      </p>
    </div>
  );
}

function LegendList({ frame }: { frame?: FrameItem }) {
  if (!frame?.legend?.length) return <p className="muted">当前图层没有返回图例。</p>;
  return (
    <div className="legend-list">
      {frame.legend.map((legend, index) => (
        <div className="legend-group" key={`${legend.data?.title}-${index}`}>
          <strong>{translateLegendTitle(legend.data?.title ?? "图例")}</strong>
          <div>
            {(legend.data?.entries ?? []).slice(0, 8).map((entry, itemIndex) => (
              <span className="legend-swatch" key={itemIndex}>
                <i style={{ background: rgbaToCss(entry.colour) }} />
                {entry["min-range"] && entry["max-range"]
                  ? `${entry["min-range"]}-${entry["max-range"]}`
                  : translateLegendToken(entry.text || entry.line1_style || "线")}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function rgbaToCss(value?: string) {
  if (!value) return "#f59e0b";
  return value.replace("RGBA", "rgba");
}

function useBrowserLocation(
  setStation: (station: Station | ((station: Station) => Station)) => void,
  setNotice: (message: string) => void,
) {
  if (!navigator.geolocation) {
    setNotice("当前浏览器不支持定位服务，请直接输入经纬度。");
    return;
  }
  setNotice("正在请求浏览器定位权限…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setStation((current) => ({
        ...current,
        name: current.name || "浏览器定位",
        lat: Number(position.coords.latitude.toFixed(4)),
        lon: Number(position.coords.longitude.toFixed(4)),
      }));
      setNotice("浏览器定位已更新，可生成该点 ENS 气象图。");
    },
    () => setNotice("无法读取浏览器定位，请检查位置权限或直接输入经纬度。"),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
  );
}

function translateLegendToken(value: string) {
  const tokens: Record<string, string> = {
    solid: "实线",
    dashed: "虚线",
    dotted: "点线",
  };
  return tokens[value] ?? value;
}
