import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PALERT_GRAPHQL_URL = "https://palert.earth.sinica.edu.tw/graphql/";
const PALERT_STATIONS_URL = "https://palert.earth.sinica.edu.tw/stations";
const PALERT_REALTIME_URL = "https://palert.earth.sinica.edu.tw/realtime";
const PALERT_DATABASE_URL = "https://palert.earth.sinica.edu.tw/database";
const PALERT_TERMS_URL = "https://palert.earth.sinica.edu.tw/help";
const CACHE_PATH = process.env.PALERT_CACHE_PATH ?? path.join(ROOT, ".runtime", "palert-stations.json");
const CACHE_TTL_MS = Number(process.env.PALERT_CACHE_TTL_MS ?? 10 * 60 * 1000);
const REALTIME_CACHE_TTL_MS = Number(process.env.PALERT_REALTIME_CACHE_TTL_MS ?? 700);
const REQUEST_TIMEOUT_MS = Number(process.env.PALERT_TIMEOUT_MS ?? 20_000);
const STATION_QUERY = "query ($staFilter: staList_filter_choices) { stationList(staFilter: $staFilter) { staInfos timestamp version } }";
const REALTIME_PGA_QUERY = "query ($recordTime: Float, $type: Int, $token: String) { realtimePGA(recordTime: $recordTime, type: $type, token: $token) { dataVals timestamp } }";
const EVENT_LIST_QUERY = "query ($date: [Date!], $depth: [Float!], $ml: [Float!], $dateTime: DateTime, $needHaspga: Boolean!) { eventList(QueryEvent: { depth: $depth, date: $date, ml: $ml, dateTime: $dateTime }, needHaspga: $needHaspga) { DateUTC Depth Latitude Longitude ML hasPGA @include(if: $needHaspga) } }";
const EVENT_STATIONS_QUERY = "query ($staCode: String, $event: DateTime) { PGAList(event: $event, staCode: $staCode) { az event dist staCode pga pgv } }";
const EVENT_FILE_QUERY = "query ($event: DateTime, $fileType: eventFile_choices) { eventFiles(fileType: $fileType, event: $event) { data name } }";
const EVENT_FILE_TYPES = new Map([
  ["station-list", { upstream: "staList", contentType: "text/plain; charset=utf-8" }],
  ["contour", { upstream: "contour", contentType: "image/png" }],
  ["polar", { upstream: "polar", contentType: "image/png" }],
  ["azimuth-scatter", { upstream: "scatter1", contentType: "image/jpeg" }],
  ["animation-1x", { upstream: "gif1", contentType: "image/gif" }],
  ["animation-2x", { upstream: "gif2", contentType: "image/gif" }],
  ["animation-3x", { upstream: "gif3", contentType: "image/gif" }],
  ["distance-scatter", { upstream: "scatter2", contentType: "image/jpeg" }],
  ["pga-plot", { upstream: "pgaPlot", contentType: "image/jpeg" }],
]);

let cachedSnapshot = null;
let cacheLoaded = false;
let refreshPromise = null;
let realtimeSnapshot = null;
let realtimeRefreshPromise = null;
let eventListSnapshot = null;
const eventStationCache = new Map();
const eventFileCache = new Map();

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizePalertStationList(payload) {
  const stationList = payload?.data?.stationList ?? payload?.stationList ?? payload;
  const rows = Array.isArray(stationList?.staInfos) ? stationList.staInfos : [];
  const stations = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const stationCode = String(row.station ?? "").trim();
    const latitude = finite(row.lat);
    const longitude = finite(row.lon);
    if (!stationCode || latitude === null || latitude < -90 || latitude > 90 || longitude === null || longitude < -180 || longitude > 180) return [];
    return [{
      id: `palert:${stationCode}`,
      stationCode,
      network: String(row.network ?? "TW").trim() || "TW",
      locationCode: String(row.location ?? "--").trim() || "--",
      stationName: String(row.locname ?? stationCode).trim() || stationCode,
      area: String(row.area ?? "").trim(),
      latitude,
      longitude,
      elevationM: finite(row.elev),
      floor: finite(row.floor),
      serial: finite(row.serial),
      startAt: String(row.start_at ?? "").trim() || null,
    }];
  });
  const unique = new Map();
  for (const station of stations) {
    if (!unique.has(station.id)) unique.set(station.id, station);
  }
  return {
    timestamp: String(stationList?.timestamp ?? "").trim() || null,
    version: String(stationList?.version ?? "").trim() || null,
    stations: [...unique.values()],
  };
}

export function normalizePalertRealtime(payload) {
  const frame = payload?.data?.realtimePGA ?? payload?.realtimePGA ?? payload;
  const rawValues = frame?.dataVals && typeof frame.dataVals === "object" ? frame.dataVals : {};
  const dataVals = {};
  for (const [stationCode, rawValue] of Object.entries(rawValues)) {
    const pgaGal = finite(rawValue);
    if (!stationCode || pgaGal === null || pgaGal < 0) continue;
    dataVals[String(stationCode)] = pgaGal;
  }
  return {
    timestamp: String(frame?.timestamp ?? "").trim() || null,
    dataVals,
  };
}

export function normalizePalertEvents(payload) {
  const rows = payload?.data?.eventList ?? payload?.eventList ?? payload;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const date = String(row?.DateUTC ?? "").trim();
    const latitude = finite(row?.Latitude);
    const longitude = finite(row?.Longitude);
    const depthKm = finite(row?.Depth);
    const magnitude = finite(row?.ML);
    if (!date || !Number.isFinite(Date.parse(`${date}Z`)) || latitude === null || longitude === null || magnitude === null) return [];
    return [{
      id: date.replace(/[^0-9]/g, "").slice(0, 14),
      date,
      latitude,
      longitude,
      depthKm,
      magnitude,
      hasPga: Boolean(row?.hasPGA),
      sourceUrl: `${PALERT_DATABASE_URL}/download/${date.replace(/[^0-9]/g, "").slice(0, 14)}`,
    }];
  }).sort((left, right) => Date.parse(`${right.date}Z`) - Date.parse(`${left.date}Z`));
}

export function normalizePalertEventStations(payload) {
  const rows = payload?.data?.PGAList ?? payload?.PGAList ?? payload;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const stationCode = String(row?.staCode ?? "").trim();
    const pgaGal = finite(row?.pga);
    const pgvCms = finite(row?.pgv);
    const azimuth = finite(row?.az);
    const distanceKm = finite(row?.dist);
    if (!stationCode) return [];
    return [{ stationCode, pgaGal, pgvCms, azimuth, distanceKm }];
  });
}

function normalizeEvent(value) {
  const event = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(event) || !Number.isFinite(Date.parse(`${event}Z`))) {
    throw new Error("P-Alert 事件时间格式无效");
  }
  return event;
}

async function postGraphql(query, variables, referer, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(PALERT_GRAPHQL_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://palert.earth.sinica.edu.tw",
        Referer: referer,
        "User-Agent": "Mozilla/5.0 (compatible; ecmwf-pBoard/1.0)",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.errors?.length) throw new Error(String(payload.errors[0]?.message ?? "P-Alert GraphQL 查询失败"));
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const payload = JSON.parse(await readFile(CACHE_PATH, "utf8"));
    const normalized = normalizePalertStationList({ stationList: {
      staInfos: payload?.stations?.map((station) => ({
        station: station.stationCode,
        network: station.network,
        location: station.locationCode,
        locname: station.stationName,
        area: station.area,
        lat: station.latitude,
        lon: station.longitude,
        elev: station.elevationM,
        floor: station.floor,
        serial: station.serial,
        start_at: station.startAt,
      })),
      timestamp: payload?.upstreamTimestamp,
      version: payload?.version,
    } });
    if (!normalized.stations.length) return;
    cachedSnapshot = {
      fetchedAt: String(payload.fetchedAt ?? new Date(0).toISOString()),
      upstreamTimestamp: normalized.timestamp,
      version: normalized.version,
      stations: normalized.stations,
    };
  } catch {
    // A missing local snapshot is normal on first launch.
  }
}

async function persist(snapshot) {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const temporaryPath = `${CACHE_PATH}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify({ version: snapshot.version, ...snapshot }), "utf8");
  await rename(temporaryPath, CACHE_PATH);
}

async function refresh(fetchImpl, now) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(PALERT_GRAPHQL_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://palert.earth.sinica.edu.tw",
        Referer: PALERT_STATIONS_URL,
        "User-Agent": "Mozilla/5.0 (compatible; ecmwf-pBoard/1.0)",
      },
      body: JSON.stringify({ query: STATION_QUERY, variables: { staFilter: "onlineAll" } }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const normalized = normalizePalertStationList(await response.json());
    if (!normalized.stations.length) throw new Error("官方接口未返回站点");
    cachedSnapshot = {
      fetchedAt: new Date(now).toISOString(),
      upstreamTimestamp: normalized.timestamp,
      version: normalized.version,
      stations: normalized.stations,
    };
    await persist(cachedSnapshot).catch(() => undefined);
    return cachedSnapshot;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshRealtime(fetchImpl, now) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(PALERT_GRAPHQL_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://palert.earth.sinica.edu.tw",
        Referer: PALERT_REALTIME_URL,
        "User-Agent": "Mozilla/5.0 (compatible; ecmwf-pBoard/1.0)",
      },
      body: JSON.stringify({
        query: REALTIME_PGA_QUERY,
        variables: { recordTime: 0, type: 0, token: "" },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const normalized = normalizePalertRealtime(await response.json());
    if (!normalized.timestamp || !Object.keys(normalized.dataVals).length) throw new Error("官方接口未返回实时 PGA 帧");
    realtimeSnapshot = {
      fetchedAt: new Date(now).toISOString(),
      dataTime: normalized.timestamp,
      latencyMs: Math.max(0, Date.now() - startedAt),
      dataVals: normalized.dataVals,
    };
    return realtimeSnapshot;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPalertSnapshot(options = {}) {
  await loadCache();
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const ageMs = cachedSnapshot ? now - Date.parse(cachedSnapshot.fetchedAt) : Number.POSITIVE_INFINITY;
  let error = null;
  let refreshed = false;
  if (ageMs > CACHE_TTL_MS && !refreshPromise) {
    refreshPromise = refresh(fetchImpl, now).then((snapshot) => {
      refreshed = true;
      return snapshot;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  if (refreshPromise) {
    try {
      await refreshPromise;
      refreshed = true;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }
  const available = Boolean(cachedSnapshot?.stations.length);
  const finalAgeMs = available ? now - Date.parse(cachedSnapshot.fetchedAt) : Number.POSITIVE_INFINITY;
  return {
    provider: "中央研究院地球科学研究所 P-Alert",
    sourceUrl: PALERT_STATIONS_URL,
    termsUrl: PALERT_TERMS_URL,
    fetchedAt: cachedSnapshot?.fetchedAt ?? new Date(now).toISOString(),
    upstreamTimestamp: cachedSnapshot?.upstreamTimestamp ?? null,
    version: cachedSnapshot?.version ?? null,
    state: refreshed || finalAgeMs <= CACHE_TTL_MS ? "online" : available ? "stale" : "error",
    cache: refreshed ? "MISS" : available ? "HIT" : "EMPTY",
    stations: cachedSnapshot?.stations ?? [],
    error,
  };
}

export async function getPalertRealtime(options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const ageMs = realtimeSnapshot ? now - Date.parse(realtimeSnapshot.fetchedAt) : Number.POSITIVE_INFINITY;
  let error = null;
  let refreshed = false;
  if (ageMs > REALTIME_CACHE_TTL_MS && !realtimeRefreshPromise) {
    realtimeRefreshPromise = refreshRealtime(fetchImpl, now).then((snapshot) => {
      refreshed = true;
      return snapshot;
    }).finally(() => {
      realtimeRefreshPromise = null;
    });
  }
  if (realtimeRefreshPromise) {
    try {
      await realtimeRefreshPromise;
      refreshed = true;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }
  const available = Boolean(realtimeSnapshot?.dataTime && Object.keys(realtimeSnapshot.dataVals).length);
  const finalAgeMs = available ? now - Date.parse(realtimeSnapshot.fetchedAt) : Number.POSITIVE_INFINITY;
  return {
    provider: "中央研究院地球科学研究所 P-Alert",
    sourceUrl: PALERT_REALTIME_URL,
    termsUrl: PALERT_TERMS_URL,
    fetchedAt: realtimeSnapshot?.fetchedAt ?? new Date(now).toISOString(),
    dataTime: realtimeSnapshot?.dataTime ?? null,
    latencyMs: realtimeSnapshot?.latencyMs ?? null,
    state: refreshed || finalAgeMs <= 5_000 ? "online" : available ? "stale" : "error",
    cache: refreshed ? "MISS" : available ? "HIT" : "EMPTY",
    stationCount: realtimeSnapshot ? Object.keys(realtimeSnapshot.dataVals).length : 0,
    dataVals: realtimeSnapshot?.dataVals ?? {},
    error,
  };
}

export async function getPalertEvents(options = {}) {
  const now = options.now ?? Date.now();
  const days = Math.max(7, Math.min(365, Number(options.days ?? 120) || 120));
  const cacheKey = `${days}`;
  if (eventListSnapshot?.cacheKey === cacheKey && now - eventListSnapshot.fetchedAtMs < 5 * 60 * 1000) {
    return { ...eventListSnapshot.payload, cache: "HIT" };
  }
  const end = new Date(now);
  const start = new Date(now - days * 24 * 60 * 60 * 1000);
  const dateOnly = (value) => value.toISOString().slice(0, 10);
  const payload = await postGraphql(EVENT_LIST_QUERY, {
    date: [dateOnly(start), dateOnly(end)],
    needHaspga: true,
  }, PALERT_DATABASE_URL, options.fetchImpl);
  const events = normalizePalertEvents(payload);
  const result = {
    provider: "中央研究院地球科学研究所 P-Alert",
    sourceUrl: PALERT_DATABASE_URL,
    fetchedAt: new Date(now).toISOString(),
    days,
    events,
  };
  eventListSnapshot = { cacheKey, fetchedAtMs: now, payload: result };
  return { ...result, cache: "MISS" };
}

export async function getPalertEventStations(options = {}) {
  const event = normalizeEvent(options.event);
  const now = options.now ?? Date.now();
  const cached = eventStationCache.get(event);
  if (cached && now - cached.fetchedAtMs < 30 * 60 * 1000) return { ...cached.payload, cache: "HIT" };
  const eventId = event.replace(/[^0-9]/g, "");
  const payload = await postGraphql(EVENT_STATIONS_QUERY, { event, staCode: null }, `${PALERT_DATABASE_URL}/download/${eventId}`, options.fetchImpl);
  const stations = normalizePalertEventStations(payload);
  if (!stations.length) throw new Error("P-Alert 官方事件未返回测站表");
  const result = {
    provider: "中央研究院地球科学研究所 P-Alert",
    sourceUrl: `${PALERT_DATABASE_URL}/download/${eventId}`,
    fetchedAt: new Date(now).toISOString(),
    event,
    stationCount: stations.length,
    stations,
  };
  eventStationCache.set(event, { fetchedAtMs: now, payload: result });
  if (eventStationCache.size > 12) eventStationCache.delete(eventStationCache.keys().next().value);
  return { ...result, cache: "MISS" };
}

export async function getPalertEventFile(options = {}) {
  const event = normalizeEvent(options.event);
  const type = String(options.type ?? "");
  const definition = EVENT_FILE_TYPES.get(type);
  if (!definition) throw new Error("不支持的 P-Alert 事件产品");
  const cacheKey = `${event}:${type}`;
  const now = options.now ?? Date.now();
  const cached = eventFileCache.get(cacheKey);
  if (cached && now - cached.fetchedAtMs < 5 * 60 * 1000) return { ...cached.payload, cache: "HIT" };
  const eventId = event.replace(/[^0-9]/g, "");
  const payload = await postGraphql(EVENT_FILE_QUERY, { event, fileType: definition.upstream }, `${PALERT_DATABASE_URL}/download/${eventId}`, options.fetchImpl);
  const file = payload?.data?.eventFiles?.[0];
  const encoded = String(file?.data ?? "").trim();
  if (!encoded) throw new Error("P-Alert 官方事件产品暂无资料");
  const result = {
    provider: "中央研究院地球科学研究所 P-Alert",
    sourceUrl: `${PALERT_DATABASE_URL}/download/${eventId}`,
    fetchedAt: new Date(now).toISOString(),
    event,
    type,
    filename: String(file?.name ?? `${type}.bin`).replace(/[^a-zA-Z0-9._-]/g, "_"),
    contentType: definition.contentType,
    data: Buffer.from(encoded, "base64"),
  };
  eventFileCache.set(cacheKey, { fetchedAtMs: now, payload: result });
  while (eventFileCache.size > 2) eventFileCache.delete(eventFileCache.keys().next().value);
  return { ...result, cache: "MISS" };
}
