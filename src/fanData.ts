import { useSyncExternalStore } from "react";

export type FanInterfaceId =
  | "cenc-ws"
  | "aqi"
  | "cloud"
  | "ip"
  | "ntp"
  | "radar"
  | "rain-forecast"
  | "station-all"
  | "station-history"
  | "tile-map"
  | "typhoon"
  | "wind-field"
  | "wsdi";

export type FanInterfaceDefinition = {
  id: FanInterfaceId;
  label: string;
  category: "seismic" | "weather" | "tool" | "map" | "visualization";
  endpoint: string;
  proxy: boolean;
  description: string;
};

export const FAN_INTERFACES: readonly FanInterfaceDefinition[] = Object.freeze([
  { id: "cenc-ws", label: "CENC 实时烈度 WebSocket", category: "seismic", endpoint: "wss://ws.fanstudio.tech/all", proxy: false, description: "FAN 授权 WebSocket，驱动实时烈度报告。" },
  { id: "aqi", label: "城市空气质量指数（AQI）", category: "weather", endpoint: "/we/aqi.php", proxy: true, description: "城市 AQI、主要污染物与健康提示。" },
  { id: "cloud", label: "东南沿海及西太卫星云图", category: "weather", endpoint: "/we/img/cloud_china.php", proxy: true, description: "卫星云图图像服务。" },
  { id: "ip", label: "IP 地理位置查询", category: "tool", endpoint: "/tool/ip/", proxy: true, description: "按需查询 IP 的公开地理信息。" },
  { id: "ntp", label: "获取服务器时间", category: "tool", endpoint: "/tool/ntp.php", proxy: true, description: "FAN 服务器 UTC 与 UTC+8 时间。" },
  { id: "radar", label: "全国雷达矢量图", category: "weather", endpoint: "/we/img/radar_china.php", proxy: true, description: "全国天气雷达图像服务。" },
  { id: "rain-forecast", label: "全国未来降水分布数据", category: "weather", endpoint: "/we/rain_forecast_china.php", proxy: true, description: "24、48、72 小时降水 GeoJSON。" },
  { id: "station-all", label: "全国气象站数据", category: "weather", endpoint: "/we/station_all.php", proxy: true, description: "温度、气压、风、湿度、能见度和降水站点数据。" },
  { id: "station-history", label: "气象站单站历史数据", category: "weather", endpoint: "/we/station_history.php", proxy: true, description: "按站号与日期读取历史观测。" },
  { id: "tile-map", label: "基础瓦片地图服务", category: "map", endpoint: "https://tilemap.fanstudio.tech", proxy: false, description: "FAN 基础瓦片服务入口。" },
  { id: "typhoon", label: "台风实时与历史数据", category: "weather", endpoint: "/we/typhoon.php", proxy: true, description: "台风路径、强度、风圈、登陆和多机构预报。" },
  { id: "wind-field", label: "全球风场网格数据", category: "weather", endpoint: "/we/wind_field.php", proxy: true, description: "全球风场网格数据，按需加载。" },
  { id: "wsdi", label: "气象数据可视化服务（WSDI）", category: "visualization", endpoint: "https://api.fanstudio.tech/we/wsdi", proxy: false, description: "FAN 官方气象数据可视化入口。" },
]);

export type FanDataSettings = {
  enabled: boolean;
  interfaces: Record<FanInterfaceId, boolean>;
};

const FAN_SETTINGS_KEY = "labwatch-fan-data-settings-v1";

export function createDefaultFanSettings(): FanDataSettings {
  return {
    enabled: true,
    interfaces: Object.fromEntries(FAN_INTERFACES.map((item) => [item.id, true])) as Record<FanInterfaceId, boolean>,
  };
}

function normalizeFanSettings(value: unknown): FanDataSettings {
  const defaults = createDefaultFanSettings();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Partial<FanDataSettings>;
  const interfaces = record.interfaces && typeof record.interfaces === "object" ? record.interfaces : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : defaults.enabled,
    interfaces: Object.fromEntries(FAN_INTERFACES.map((item) => [
      item.id,
      typeof (interfaces as Partial<Record<FanInterfaceId, boolean>>)[item.id] === "boolean"
        ? (interfaces as Partial<Record<FanInterfaceId, boolean>>)[item.id]
        : defaults.interfaces[item.id],
    ])) as Record<FanInterfaceId, boolean>,
  };
}

function loadFanSettings() {
  if (typeof window === "undefined") return createDefaultFanSettings();
  try {
    return normalizeFanSettings(JSON.parse(window.localStorage.getItem(FAN_SETTINGS_KEY) ?? "null"));
  } catch {
    return createDefaultFanSettings();
  }
}

let fanSettingsSnapshot = loadFanSettings();
const fanSettingsListeners = new Set<() => void>();

function persistFanSettings(next: FanDataSettings) {
  fanSettingsSnapshot = normalizeFanSettings(next);
  if (typeof window !== "undefined") window.localStorage.setItem(FAN_SETTINGS_KEY, JSON.stringify(fanSettingsSnapshot));
  fanSettingsListeners.forEach((listener) => listener());
}

export function updateFanInterfaceSetting(settings: FanDataSettings, id: FanInterfaceId, enabled: boolean) {
  return { ...settings, interfaces: { ...settings.interfaces, [id]: enabled } };
}

export function setFanDataEnabled(enabled: boolean) {
  persistFanSettings({ ...fanSettingsSnapshot, enabled });
}

export function setFanInterfaceEnabled(id: FanInterfaceId, enabled: boolean) {
  persistFanSettings(updateFanInterfaceSetting(fanSettingsSnapshot, id, enabled));
}

export function useFanDataSettings() {
  return useSyncExternalStore(
    (listener) => {
      fanSettingsListeners.add(listener);
      return () => fanSettingsListeners.delete(listener);
    },
    () => fanSettingsSnapshot,
    createDefaultFanSettings,
  );
}

export function isFanInterfaceEnabled(settings: FanDataSettings, id: FanInterfaceId) {
  return settings.enabled && settings.interfaces[id];
}

export async function fetchFanInterface<T>(id: FanInterfaceId, searchParams?: URLSearchParams, signal?: AbortSignal) {
  const definition = FAN_INTERFACES.find((item) => item.id === id);
  if (!definition?.proxy) throw new Error(`${definition?.label ?? id} 不是 JSON 代理接口`);
  const query = searchParams?.toString();
  const response = await fetch(`/api/fan/${id}${query ? `?${query}` : ""}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as T | { error?: string; detail?: string } | null;
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? payload as { error?: string; detail?: string } : null;
    throw new Error(error?.detail || error?.error || `FAN ${definition.label} 返回 ${response.status}`);
  }
  return payload as T;
}

export function fanProxyUrl(id: FanInterfaceId, searchParams?: URLSearchParams) {
  const query = searchParams?.toString();
  return `/api/fan/${id}${query ? `?${query}` : ""}`;
}

export type FanTyphoonPoint = {
  time: string;
  latitude: number;
  longitude: number;
  power: number | null;
  pressure: number | null;
  speed: number | null;
  strong: string;
};

export type FanTyphoon = {
  id: string;
  name: string;
  englishName: string;
  active: boolean;
  track: FanTyphoonPoint[];
  forecasts: Array<{ agency: string; points: FanTyphoonPoint[] }>;
};

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTyphoonPoint(value: unknown): FanTyphoonPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  const latitude = finiteNumber(point.lat);
  const longitude = finiteNumber(point.lng);
  if (latitude === null || longitude === null) return null;
  return {
    time: String(point.time ?? ""),
    latitude,
    longitude,
    power: finiteNumber(point.power),
    pressure: finiteNumber(point.pressure),
    speed: finiteNumber(point.speed),
    strong: String(point.strong ?? ""),
  };
}

export function normalizeFanTyphoons(payload: unknown): FanTyphoon[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((value): FanTyphoon[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = String(item.tfid ?? "").trim();
    const points = Array.isArray(item.points) ? item.points : [];
    const track = points.flatMap((point) => {
      const normalized = normalizeTyphoonPoint(point);
      return normalized ? [normalized] : [];
    });
    if (!id || !track.length) return [];
    const latestPoint = points.length ? points[points.length - 1] : undefined;
    const forecastGroups = latestPoint && typeof latestPoint === "object" && Array.isArray((latestPoint as Record<string, unknown>).forecast)
      ? (latestPoint as Record<string, unknown>).forecast as unknown[]
      : [];
    const forecasts = forecastGroups.flatMap((group): FanTyphoon["forecasts"] => {
      if (!group || typeof group !== "object") return [];
      const record = group as Record<string, unknown>;
      const forecastPoints = Array.isArray(record.forecastpoints)
        ? record.forecastpoints.flatMap((point) => {
          const normalized = normalizeTyphoonPoint(point);
          return normalized ? [normalized] : [];
        })
        : [];
      return forecastPoints.length ? [{ agency: String(record.tm ?? "预报"), points: forecastPoints }] : [];
    });
    return [{
      id,
      name: String(item.name ?? id),
      englishName: String(item.enname ?? ""),
      active: String(item.isactive ?? "0") === "1",
      track,
      forecasts,
    }];
  });
}
