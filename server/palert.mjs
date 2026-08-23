import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PALERT_GRAPHQL_URL = "https://palert.earth.sinica.edu.tw/graphql/";
const PALERT_STATIONS_URL = "https://palert.earth.sinica.edu.tw/stations";
const PALERT_REALTIME_URL = "https://palert.earth.sinica.edu.tw/realtime";
const PALERT_TERMS_URL = "https://palert.earth.sinica.edu.tw/help";
const CACHE_PATH = process.env.PALERT_CACHE_PATH ?? path.join(ROOT, ".runtime", "palert-stations.json");
const CACHE_TTL_MS = Number(process.env.PALERT_CACHE_TTL_MS ?? 10 * 60 * 1000);
const REALTIME_CACHE_TTL_MS = Number(process.env.PALERT_REALTIME_CACHE_TTL_MS ?? 700);
const REQUEST_TIMEOUT_MS = Number(process.env.PALERT_TIMEOUT_MS ?? 20_000);
const STATION_QUERY = "query ($staFilter: staList_filter_choices) { stationList(staFilter: $staFilter) { staInfos timestamp version } }";
const REALTIME_PGA_QUERY = "query ($recordTime: Float, $type: Int, $token: String) { realtimePGA(recordTime: $recordTime, type: $type, token: $token) { dataVals timestamp } }";

let cachedSnapshot = null;
let cacheLoaded = false;
let refreshPromise = null;
let realtimeSnapshot = null;
let realtimeRefreshPromise = null;

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
