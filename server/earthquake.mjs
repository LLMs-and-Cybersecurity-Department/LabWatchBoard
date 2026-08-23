import { XMLParser } from "fast-xml-parser";
import { csvParseRows } from "d3-dsv";
import { load as loadHtml } from "cheerio";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const USGS_API = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const SHAKEALERT_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/shakealert.geojson";
const JMA_FEEDS = [
  "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml",
  "https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml",
];
const CENC_CATALOGUE = "https://www.ceic.ac.cn/data/data.json";
const CENC_MECHANISM_PAGE = "https://data.earthquake.cn/datashare/report.shtml?PAGEID=earthquake_dzzyjz";
const CENC_MECHANISM_URLS = [
  { catalogueType: "review", url: `${CENC_MECHANISM_PAGE}&cmtype=review&report1_PAGESIZE=200` },
  { catalogueType: "auto", url: `${CENC_MECHANISM_PAGE}&cmtype=auto&report1_PAGESIZE=200` },
];
const CWA_CATALOGUE = "https://scweb.cwa.gov.tw/zh-tw/earthquake/data/";
const CWA_OPEN_DATA_API = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/";
const CWA_OPEN_DATASETS = ["E-A0015-001", "E-A0016-001"];
const CWA_BROWSER_USER_AGENT = "Mozilla/5.0 (compatible; ecmwf-pBoard/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const EMSC_API = "https://www.seismicportal.eu/fdsnws/event/1/query";
const EMSC_MT_API = "https://www.seismicportal.eu/mtws/api/search";
const GFZ_API = "https://geofon.gfz.de/fdsnws/event/1/query";
const GEONET_API = "https://api.geonet.org.nz/quake";
const BMKG_FEEDS = [
  "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
  "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json",
];
const CACHE_TTL_MS = Number(process.env.EARTHQUAKE_CACHE_TTL_MS ?? 45_000);
const REQUEST_TIMEOUT_MS = Number(process.env.EARTHQUAKE_TIMEOUT_MS ?? 16_000);
const UPSTREAM_RETRY_COUNT = Math.max(0, Math.min(4, Number(process.env.EARTHQUAKE_RETRY_COUNT ?? 2) || 0));
const UPSTREAM_RETRY_BASE_MS = Math.max(50, Number(process.env.EARTHQUAKE_RETRY_BASE_MS ?? 250) || 250);
const UPSTREAM_RETRY_MAX_MS = Math.max(UPSTREAM_RETRY_BASE_MS, Number(process.env.EARTHQUAKE_RETRY_MAX_MS ?? 2_000) || 2_000);
const MAX_EVENTS = Number(process.env.EARTHQUAKE_MAX_EVENTS ?? 4_000);
const MECHANISM_CACHE_TTL_MS = Number(process.env.MECHANISM_CACHE_TTL_MS ?? 60 * 60 * 1000);
const SHAKEMAP_CACHE_TTL_MS = Number(process.env.SHAKEMAP_CACHE_TTL_MS ?? 30 * 60 * 1000);
const USGS_IMPACT_CACHE_TTL_MS = Number(process.env.USGS_IMPACT_CACHE_TTL_MS ?? 30 * 60 * 1000);
const SHAKEALERT_CACHE_TTL_MS = Number(process.env.SHAKEALERT_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
const SOURCE_SNAPSHOT_PATH = process.env.EARTHQUAKE_SOURCE_SNAPSHOT_PATH ?? path.join(ROOT, ".runtime", "earthquake-source-snapshots.json");
const SOURCE_SNAPSHOT_MAX_ENTRIES = Math.max(9, Math.min(180, Number(process.env.EARTHQUAKE_SOURCE_SNAPSHOT_MAX_ENTRIES ?? 45) || 45));
const SOURCE_SNAPSHOT_MAX_AGE_MS = Math.max(24 * 60 * 60 * 1000, Number(process.env.EARTHQUAKE_SOURCE_SNAPSHOT_MAX_AGE_MS ?? 30 * 24 * 60 * 60 * 1000) || 0);

const RANGE_HOURS = new Map([
  ["24h", 24],
  ["7d", 24 * 7],
  ["30d", 24 * 30],
  ["90d", 24 * 90],
]);

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function upstreamRetryDelayMs(attempt) {
  return Math.min(UPSTREAM_RETRY_MAX_MS, UPSTREAM_RETRY_BASE_MS * (2 ** attempt));
}

function isRetryableTransportError(error) {
  return error instanceof TypeError || error?.name === "AbortError" || error?.name === "TimeoutError";
}

async function waitForUpstreamRetry(attempt) {
  await new Promise((resolve) => setTimeout(resolve, upstreamRetryDelayMs(attempt)));
}

const SOURCE_META = {
  usgs: {
    id: "usgs",
    label: "USGS",
    organization: "美国地质调查局",
    url: "https://earthquake.usgs.gov/earthquakes/",
    coverage: "全球 FDSN 实时地震目录",
  },
  shakealert: {
    id: "shakealert",
    label: "ShakeAlert",
    organization: "USGS ShakeAlert 地震预警系统",
    url: "https://earthquake.usgs.gov/data/shakealert/",
    coverage: "美国西海岸 ShakeAlert 事后性能报告",
  },
  jma: {
    id: "jma",
    label: "JMA",
    organization: "日本气象厅",
    url: "https://www.data.jma.go.jp/eqev/data/index.html",
    coverage: "官方高频与数日长期地震 XML 电文",
  },
  cenc: {
    id: "cenc",
    label: "CENC",
    organization: "中国地震台网中心",
    url: "https://www.ceic.ac.cn/",
    coverage: "中国地震台网公开地震目录",
  },
  cwa: {
    id: "cwa",
    label: "CWA",
    organization: "台湾中央气象署",
    url: CWA_CATALOGUE,
    coverage: "台湾显著有感与小区域有感地震官方 API",
  },
  emsc: {
    id: "emsc",
    label: "EMSC",
    organization: "欧洲地中海地震中心",
    url: "https://www.seismicportal.eu/",
    coverage: "全球 EMSC-RTS 实时目录",
  },
  gfz: {
    id: "gfz",
    label: "GFZ",
    organization: "德国地球科学研究中心 GEOFON",
    url: "https://geofon.gfz.de/eqinfo/",
    coverage: "全球 GEOFON 官方地震目录",
  },
  geonet: {
    id: "geonet",
    label: "GeoNet",
    organization: "新西兰 GeoNet",
    url: "https://www.geonet.org.nz/earthquake",
    coverage: "新西兰区域官方地震与计算烈度目录",
  },
  bmkg: {
    id: "bmkg",
    label: "BMKG",
    organization: "印度尼西亚气象、气候和地球物理局",
    url: "https://data.bmkg.go.id/gempabumi/",
    coverage: "印度尼西亚 M5+ 与有感地震公开数据",
  },
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

const snapshotCache = new Map();
const sourceSnapshotCache = new Map();
const mechanismCache = new Map();
let cencMechanismCatalogueCache = null;
const shakeMapCache = new Map();
const pagerCache = new Map();
const dyfiCache = new Map();
const shakeAlertReportCache = new Map();
const sourceSnapshotPersistenceStates = new Map();
const sourceSnapshotPersistenceWrites = new Map();
const sourceSnapshotRefreshes = new Map();

export class EarthquakeDataError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "EarthquakeDataError";
    this.statusCode = statusCode;
  }
}

export class EarthquakeMechanismError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "EarthquakeMechanismError";
    this.statusCode = statusCode;
  }
}

export class EarthquakeShakeMapError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "EarthquakeShakeMapError";
    this.statusCode = statusCode;
  }
}

export class EarthquakeUsgsProductError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "EarthquakeUsgsProductError";
    this.statusCode = statusCode;
  }
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function finiteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value["#text"] === undefined ? null : String(value["#text"]);
  return String(value);
}

function magnitudeType(value, fallback = "M") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeDepth(value) {
  const depth = finiteNumber(value);
  return depth === null ? null : Math.max(0, depth);
}

function persistedString(value, maxLength, fallback = "") {
  const text = String(value ?? "").trim().slice(0, maxLength);
  return text || fallback;
}

function persistedUrl(value, fallback = null) {
  const text = persistedString(value, 2_000);
  return /^https?:\/\//i.test(text) ? text : fallback;
}

function persistedShakeAlertReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= 200_000 ? JSON.parse(serialized) : undefined;
  } catch {
    return undefined;
  }
}

function persistedAffectedAreas(value) {
  if (!Array.isArray(value)) return undefined;
  const areas = value.slice(0, 240).flatMap((area) => {
    if (!area || typeof area !== "object" || Array.isArray(area)) return [];
    const name = persistedString(area.name, 160);
    const intensity = persistedString(area.intensity, 24);
    const rank = finiteNumber(area.rank);
    if (!name || !intensity || rank === null || rank < 0 || rank > 7) return [];
    return [{ name, intensity, rank, warning: Boolean(area.warning) }];
  });
  return areas.length ? areas : undefined;
}

function normalizePersistedEarthquakeEvent(value, expectedSource) {
  if (!value || typeof value !== "object" || value.source !== expectedSource) return null;
  const id = persistedString(value.id, 240);
  const sourceEventId = persistedString(value.sourceEventId, 200);
  const time = isoTime(value.time);
  const latitude = finiteNumber(value.latitude);
  const longitude = finiteNumber(value.longitude);
  const magnitude = finiteNumber(value.magnitude);
  if (
    !id
    || !sourceEventId
    || !time
    || latitude === null
    || latitude < -90
    || latitude > 90
    || longitude === null
    || longitude < -180
    || longitude > 180
    || magnitude === null
    || magnitude < -5
    || magnitude > 12
  ) return null;
  const updatedAt = value.updatedAt === null || value.updatedAt === undefined ? null : isoTime(value.updatedAt);
  if (value.updatedAt && !updatedAt) return null;
  const intensityScale = new Set(["MMI", "JMA", "CWA"]).has(value.intensityScale) ? value.intensityScale : null;
  const event = {
    id,
    source: expectedSource,
    sourceEventId,
    time,
    updatedAt,
    latitude,
    longitude,
    depthKm: normalizeDepth(value.depthKm),
    magnitude,
    magnitudeType: persistedString(value.magnitudeType, 24, "M"),
    place: persistedString(value.place, 500, "未知震中"),
    status: persistedString(value.status, 240, "机构报告"),
    intensity: value.intensity === null || value.intensity === undefined ? null : persistedString(value.intensity, 80),
    intensityValue: finiteNumber(value.intensityValue),
    intensityScale,
    reportedIntensity: value.reportedIntensity === null || value.reportedIntensity === undefined ? null : persistedString(value.reportedIntensity, 120),
    felt: finiteNumber(value.felt),
    tsunami: Boolean(value.tsunami),
    alert: value.alert === null || value.alert === undefined ? null : persistedString(value.alert, 80),
    significance: finiteNumber(value.significance),
    agency: persistedString(value.agency, 160, SOURCE_META[expectedSource].organization),
    url: persistedUrl(value.url, SOURCE_META[expectedSource].url),
    detailUrl: persistedUrl(value.detailUrl),
    mechanismAvailable: Boolean(value.mechanismAvailable),
    shakeMapAvailable: Boolean(value.shakeMapAvailable),
    pagerAvailable: Boolean(value.pagerAvailable),
    dyfiAvailable: Boolean(value.dyfiAvailable),
    note: value.note === null || value.note === undefined ? null : persistedString(value.note, 1_000),
  };
  const affectedAreas = persistedAffectedAreas(value.affectedAreas);
  if (affectedAreas) event.affectedAreas = affectedAreas;
  const shakeAlertReport = expectedSource === "shakealert" ? persistedShakeAlertReport(value.shakeAlertReport) : undefined;
  return shakeAlertReport ? { ...event, shakeAlertReport } : event;
}

async function loadSourceSnapshotPersistence(cachePath, now) {
  let statePromise = sourceSnapshotPersistenceStates.get(cachePath);
  if (!statePromise) {
    statePromise = readFile(cachePath, "utf8")
      .then((text) => JSON.parse(text))
      .then((payload) => {
        const entries = new Map();
        if (payload?.version !== 1 || !Array.isArray(payload.entries)) return entries;
        for (const entry of payload.entries) {
          const key = persistedString(entry?.key, 200);
          const source = persistedString(entry?.source, 24);
          const fetchedAtMs = Date.parse(String(entry?.fetchedAt ?? ""));
          if (!key || !SOURCE_META[source] || !key.endsWith(`:${source}`) || !Number.isFinite(fetchedAtMs) || now - fetchedAtMs > SOURCE_SNAPSHOT_MAX_AGE_MS || !Array.isArray(entry.events)) continue;
          const events = entry.events.slice(0, MAX_EVENTS).map((event) => normalizePersistedEarthquakeEvent(event, source));
          if (events.some((event) => event === null)) continue;
          entries.set(key, { key, source, fetchedAt: new Date(fetchedAtMs).toISOString(), events });
        }
        return entries;
      })
      .catch(() => new Map());
    sourceSnapshotPersistenceStates.set(cachePath, statePromise);
  }
  return statePromise;
}

async function persistSourceSnapshots(cachePath, cacheKey, freshSources, now) {
  if (!freshSources.length) return;
  const entries = await loadSourceSnapshotPersistence(cachePath, now);
  for (const source of freshSources) {
    const key = `${cacheKey}:${source.id}`;
    const events = source.events.map((event) => normalizePersistedEarthquakeEvent(event, source.id));
    if (events.some((event) => event === null)) continue;
    entries.set(key, { key, source: source.id, fetchedAt: new Date(now).toISOString(), events });
  }
  const retained = [...entries.values()]
    .filter((entry) => now - Date.parse(entry.fetchedAt) <= SOURCE_SNAPSHOT_MAX_AGE_MS)
    .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))
    .slice(0, SOURCE_SNAPSHOT_MAX_ENTRIES);
  entries.clear();
  retained.forEach((entry) => entries.set(entry.key, entry));

  const previous = sourceSnapshotPersistenceWrites.get(cachePath) ?? Promise.resolve();
  const writeTask = previous.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: [...entries.values()] }));
    await rename(temporaryPath, cachePath);
  });
  sourceSnapshotPersistenceWrites.set(cachePath, writeTask);
  try {
    await writeTask;
  } finally {
    if (sourceSnapshotPersistenceWrites.get(cachePath) === writeTask) sourceSnapshotPersistenceWrites.delete(cachePath);
  }
}

function plainHtmlText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function taipeiCalendarYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric" }).format(date));
}

function parseCwaCatalogueYear(html, now = Date.now()) {
  const source = String(html ?? "");
  const yearMatch = source.match(/(?:value|searchMonth\s*=)\s*[=:]?\s*['\"]?(\d{4})年/i);
  return Number(yearMatch?.[1] ?? taipeiCalendarYear(now));
}

export function parseCwaCatalogueHtml(html, now = Date.now()) {
  const source = String(html ?? "");
  const year = parseCwaCatalogueYear(source, now);
  const events = [];
  const rowPattern = /<tr\b[^>]*onclick=["'][^"']*SetLonLat\(\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*\)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of source.matchAll(rowPattern)) {
    const longitude = finiteNumber(match[1]);
    const latitude = finiteNumber(match[2]);
    const cells = [...match[3].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => plainHtmlText(cell[1]));
    if (longitude === null || latitude === null || cells.length < 5) continue;
    const eventNumber = cells[0].replace(/\s+/g, "");
    const timeMatch = cells[1].match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    const magnitude = finiteNumber(cells[2]);
    const depthKm = normalizeDepth(cells[3]);
    if (!eventNumber || !timeMatch || magnitude === null) continue;
    const [, month, day, hour, minute] = timeMatch;
    const time = isoTime(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`);
    if (!time) continue;
    const sourceEventId = `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}${hour.padStart(2, "0")}${minute}:${eventNumber}`;
    events.push({
      id: `cwa:${sourceEventId}`,
      source: "cwa",
      sourceEventId,
      time,
      updatedAt: null,
      latitude,
      longitude,
      depthKm,
      magnitude,
      magnitudeType: "ML",
      place: cells[4] || "台湾附近",
      status: "CWA 显著有感地震",
      intensity: null,
      intensityValue: null,
      intensityScale: null,
      reportedIntensity: null,
      felt: null,
      tsunami: false,
      alert: null,
      significance: null,
      agency: "CWA",
      url: CWA_CATALOGUE,
      detailUrl: null,
      mechanismAvailable: false,
      shakeMapAvailable: false,
      pagerAvailable: false,
      dyfiAvailable: false,
      note: "中央气象署当前年度显著有感地震表",
    });
  }
  return events.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

function cwaIntensityRank(value) {
  const intensity = String(value ?? "").trim().replace(/\s+/g, "").replace(/級$/, "");
  const ranks = new Map([
    ["0", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4],
    ["5弱", 5], ["5-", 5], ["5強", 5.5], ["5+", 5.5],
    ["6弱", 6], ["6-", 6], ["6強", 6.5], ["6+", 6.5], ["7", 7],
  ]);
  return ranks.get(intensity) ?? null;
}

function cwaEventId(item, time, datasetId) {
  const webId = String(item?.Web ?? "").match(/\/details\/([^/?#]+)/i)?.[1];
  if (webId) return webId;
  const compactTime = String(time).replace(/\D/g, "").slice(0, 14);
  return `${datasetId}:${compactTime}:${String(item?.EarthquakeNo ?? "report")}`;
}

export function normalizeCwaOpenDataEarthquake(item, datasetId = "E-A0015-001") {
  const info = item?.EarthquakeInfo;
  const epicenter = info?.Epicenter;
  const magnitudeInfo = info?.EarthquakeMagnitude;
  const time = isoTime(info?.OriginTime);
  const latitude = finiteNumber(epicenter?.EpicenterLatitude);
  const longitude = finiteNumber(epicenter?.EpicenterLongitude);
  const magnitude = finiteNumber(magnitudeInfo?.MagnitudeValue);
  if (!time || latitude === null || longitude === null || magnitude === null) return null;

  const affectedAreaIndex = new Map();
  const affectedAreas = [];
  for (const area of asArray(item?.Intensity?.ShakingArea)) {
    const areaDescription = String(area?.AreaDesc ?? "").trim();
    const name = String(area?.CountyName ?? areaDescription).trim();
    const intensity = String(area?.AreaIntensity ?? "").trim();
    const rank = cwaIntensityRank(intensity);
    if (!name || !intensity || rank === null || /^最大震度/.test(areaDescription) || /[、,，]/.test(name)) continue;
    const value = { name, intensity, rank, warning: false };
    const previousIndex = affectedAreaIndex.get(name);
    if (previousIndex === undefined) {
      affectedAreaIndex.set(name, affectedAreas.length);
      affectedAreas.push(value);
    } else if (affectedAreas[previousIndex].rank < rank) {
      affectedAreas[previousIndex] = value;
    }
  }
  affectedAreas.sort((left, right) => right.rank - left.rank);
  const maximumArea = affectedAreas[0] ?? null;
  const sourceEventId = cwaEventId(item, time, datasetId);
  const officialUrl = persistedUrl(item?.Web, CWA_CATALOGUE);
  const reportImageUrl = persistedUrl(item?.ReportImageURI ?? item?.ShakemapImageURI);
  const note = [item?.ReportContent, item?.ReportRemark]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("；") || null;
  const datasetLabel = datasetId === "E-A0016-001" ? "小区域有感地震" : "显著有感地震";

  const event = {
    id: `cwa:${sourceEventId}`,
    source: "cwa",
    sourceEventId,
    time,
    updatedAt: isoTime(item?.IssueTime),
    latitude,
    longitude,
    depthKm: normalizeDepth(info?.FocalDepth),
    magnitude,
    magnitudeType: String(magnitudeInfo?.MagnitudeType ?? "").includes("芮氏") ? "ML" : "M",
    place: String(epicenter?.Location ?? "台湾附近").trim() || "台湾附近",
    status: `CWA ${datasetLabel}`,
    intensity: maximumArea?.intensity ?? null,
    intensityValue: maximumArea?.rank ?? null,
    intensityScale: maximumArea ? "CWA" : null,
    reportedIntensity: maximumArea?.intensity ?? null,
    felt: null,
    tsunami: false,
    alert: null,
    significance: null,
    agency: String(info?.Source ?? "CWA").trim() || "CWA",
    url: officialUrl,
    detailUrl: reportImageUrl,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note,
  };
  if (affectedAreas.length) event.affectedAreas = affectedAreas;
  return event;
}

export function parseCwaOpenDataPayload(payload, datasetId) {
  if (String(payload?.success ?? "").toLowerCase() !== "true") {
    throw new Error(`CWA ${datasetId} API 返回失败状态`);
  }
  return asArray(payload?.records?.Earthquake)
    .map((item) => normalizeCwaOpenDataEarthquake(item, datasetId))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
}

export function normalizeUsgsFeature(feature) {
  const properties = feature?.properties ?? {};
  const coordinates = feature?.geometry?.coordinates ?? [];
  const longitude = finiteNumber(coordinates[0]);
  const latitude = finiteNumber(coordinates[1]);
  const magnitude = finiteNumber(properties.mag);
  const time = isoTime(properties.time);
  if (longitude === null || latitude === null || magnitude === null || !time) return null;
  const mmi = finiteNumber(properties.mmi);
  const cdi = finiteNumber(properties.cdi);
  return {
    id: `usgs:${feature.id}`,
    source: "usgs",
    sourceEventId: String(feature.id),
    time,
    updatedAt: isoTime(properties.updated),
    latitude,
    longitude,
    depthKm: normalizeDepth(coordinates[2]),
    magnitude,
    magnitudeType: magnitudeType(properties.magType),
    place: properties.place || "未命名震中",
    status: properties.status || "实时目录",
    intensity: mmi === null ? null : String(mmi),
    intensityValue: mmi,
    intensityScale: mmi === null ? null : "MMI",
    reportedIntensity: cdi === null ? null : String(cdi),
    felt: finiteNumber(properties.felt),
    tsunami: Number(properties.tsunami) === 1,
    alert: properties.alert || null,
    significance: finiteNumber(properties.sig),
    agency: properties.net ? String(properties.net).toUpperCase() : "USGS",
    url: properties.url || SOURCE_META.usgs.url,
    detailUrl: properties.detail || null,
    mechanismAvailable: /,(?:moment-tensor|focal-mechanism),/.test(String(properties.types ?? "")),
    shakeMapAvailable: /,shakemap,/.test(String(properties.types ?? "")),
    pagerAvailable: /,losspager,/.test(String(properties.types ?? "")),
    dyfiAvailable: /,dyfi,/.test(String(properties.types ?? "")),
    note: null,
  };
}

function shakeAlertTime(value) {
  if (typeof value !== "string") return isoTime(value);
  return isoTime(value.trim().replace(" ", "T"));
}

function shakeAlertIssuedAt(announcement) {
  const match = String(announcement ?? "").match(/issued at\s+(.+?)\s+UTC/i);
  return match ? shakeAlertTime(`${match[1]}Z`) : null;
}

function alertCollection(summary, id) {
  return asArray(summary?.alerts).find((collection) => collection?.id === id) ?? null;
}

function alertMagnitude(collection) {
  return finiteNumber(collection?.properties?.magnitude);
}

function maximumShakeAlertMmi(summary) {
  const values = asArray(summary?.alerts).flatMap((collection) => asArray(collection?.features).flatMap((feature) => {
    const match = String(feature?.properties?.name ?? "").match(/MMI\s*([0-9.]+)/i);
    return match ? [Number(match[1])] : [];
  }));
  values.push(...asArray(summary?.cities?.features).flatMap((feature) => {
    const value = finiteNumber(feature?.properties?.mmi);
    return value === null ? [] : [value];
  }));
  return values.length ? Math.max(...values) : null;
}

export function normalizeShakeAlertFeature(feature, detail = null, summary = null) {
  const properties = feature?.properties ?? {};
  const coordinates = feature?.geometry?.coordinates ?? [];
  const products = detail?.properties?.products ?? {};
  const product = preferredProduct(asArray(products["shake-alert"]));
  const summaryProperties = summary?.properties ?? {};
  const epicenterCoordinates = summaryProperties?.epicenter?.coordinates ?? [];
  const longitude = finiteNumber(epicenterCoordinates[0] ?? product?.properties?.longitude ?? coordinates[0]);
  const latitude = finiteNumber(epicenterCoordinates[1] ?? product?.properties?.latitude ?? coordinates[1]);
  const initial = alertCollection(summary, "initialAlertCollection");
  const peak = alertCollection(summary, "maxMAlertCollection");
  const final = alertCollection(summary, "finalAlertCollection");
  const summaryMagnitude = finiteNumber(summaryProperties.magnitude);
  const catalogueMagnitude = finiteNumber(properties.mag);
  const finalMagnitude = alertMagnitude(final);
  const peakMagnitude = alertMagnitude(peak);
  const initialMagnitude = alertMagnitude(initial);
  const magnitude = finalMagnitude ?? peakMagnitude ?? summaryMagnitude ?? catalogueMagnitude;
  const time = shakeAlertTime(summaryProperties.time ?? product?.properties?.eventtime ?? properties.time);
  if (longitude === null || latitude === null || magnitude === null || !time) return null;

  const eventPageUrl = properties.url
    ? `${String(properties.url).replace(/\/$/, "")}/shake-alert`
    : `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(String(feature?.id ?? ""))}/shake-alert`;
  const summaryJsonUrl = product?.contents?.["summary.json"]?.url ?? null;
  const summaryPdfUrl = product?.contents?.["summary.pdf"]?.url ?? null;
  const productId = String(product?.code ?? summaryProperties.id ?? feature?.id ?? "unknown");
  const maximumMmi = maximumShakeAlertMmi(summary);
  const announcement = String(summaryProperties.announcement ?? "").trim() || null;
  const weaReport = String(summaryProperties.wea_report ?? "").trim() || null;
  const cities = asArray(summary?.cities?.features).flatMap((city) => {
    const name = String(city?.properties?.name ?? city?.id ?? "").trim();
    const mmi = finiteNumber(city?.properties?.mmi);
    const warningSeconds = finiteNumber(city?.properties?.warning_time);
    const distanceKm = finiteNumber(city?.properties?.citydist);
    if (!name) return [];
    return [{ name, mmi, warningSeconds, distanceKm }];
  }).slice(0, 12);

  return {
    id: `shakealert:${productId}`,
    source: "shakealert",
    sourceEventId: productId,
    time,
    updatedAt: isoTime(product?.updateTime ?? properties.updated),
    latitude,
    longitude,
    depthKm: normalizeDepth(summaryProperties.depth ?? coordinates[2]),
    magnitude,
    magnitudeType: magnitudeType(properties.magType, "M"),
    place: summaryProperties.title || properties.place || "美国西海岸",
    status: product ? `性能报告 · ${String(product.properties?.["review-status"] ?? product.status ?? "已发布")}` : "性能报告",
    intensity: maximumMmi === null ? null : String(maximumMmi),
    intensityValue: maximumMmi,
    intensityScale: maximumMmi === null ? null : "MMI",
    reportedIntensity: null,
    felt: finiteNumber(properties.felt),
    tsunami: Number(properties.tsunami) === 1,
    alert: properties.alert || null,
    significance: finiteNumber(properties.sig),
    agency: "USGS ShakeAlert / EW",
    url: eventPageUrl,
    detailUrl: summaryJsonUrl,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: "ShakeAlert 公开产品是震后性能报告，不是可用于保护动作的秒级实时预警流。",
    shakeAlertReport: {
      productId,
      reviewStatus: String(product?.properties?.["review-status"] ?? product?.status ?? "unknown"),
      announcement,
      issuedAt: shakeAlertIssuedAt(announcement),
      weaReport,
      initialSeconds: finiteNumber(initial?.properties?.elapsed),
      peakSeconds: finiteNumber(peak?.properties?.elapsed),
      finalSeconds: finiteNumber(final?.properties?.elapsed),
      initialMagnitude,
      peakMagnitude,
      finalMagnitude,
      stationsWithin10Km: finiteNumber(summaryProperties.num_stations_10km),
      stationsWithin100Km: finiteNumber(summaryProperties.num_stations_100km),
      stationsFinal: finiteNumber(final?.properties?.num_stations),
      maximumMmi,
      cities,
      summaryJsonUrl,
      summaryPdfUrl,
    },
  };
}

export function normalizeEmscFeature(feature) {
  const properties = feature?.properties ?? {};
  const longitude = finiteNumber(properties.lon ?? feature?.geometry?.coordinates?.[0]);
  const latitude = finiteNumber(properties.lat ?? feature?.geometry?.coordinates?.[1]);
  const magnitude = finiteNumber(properties.mag);
  const time = isoTime(properties.time);
  const eventId = String(feature?.id ?? properties.unid ?? properties.source_id ?? "unknown");
  if (longitude === null || latitude === null || magnitude === null || !time) return null;
  const queryUrl = new URL(EMSC_API);
  queryUrl.search = new URLSearchParams({ format: "json", eventid: eventId }).toString();
  return {
    id: `emsc:${eventId}`,
    source: "emsc",
    sourceEventId: eventId,
    time,
    updatedAt: isoTime(properties.lastupdate),
    latitude,
    longitude,
    depthKm: normalizeDepth(properties.depth),
    magnitude,
    magnitudeType: magnitudeType(properties.magtype),
    place: properties.flynn_region || "未命名震中",
    status: "EMSC-RTS",
    intensity: null,
    intensityValue: null,
    intensityScale: null,
    reportedIntensity: null,
    felt: null,
    tsunami: false,
    alert: null,
    significance: null,
    agency: properties.auth || "EMSC",
    url: queryUrl.toString(),
    detailUrl: null,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: properties.evtype && properties.evtype !== "ke" ? `事件类型：${properties.evtype}` : null,
  };
}

export function normalizeGfzRow(row) {
  const [eventId, rawTime, rawLatitude, rawLongitude, rawDepth, rawMagnitude, rawPlace] = row ?? [];
  const latitude = finiteNumber(rawLatitude);
  const longitude = finiteNumber(rawLongitude);
  const magnitude = finiteNumber(rawMagnitude);
  const time = isoTime(rawTime);
  if (!eventId || latitude === null || longitude === null || magnitude === null || !time) return null;
  return {
    id: `gfz:${eventId}`,
    source: "gfz",
    sourceEventId: String(eventId),
    time,
    updatedAt: null,
    latitude,
    longitude,
    depthKm: normalizeDepth(rawDepth),
    magnitude,
    magnitudeType: "M",
    place: String(rawPlace || "未命名震中"),
    status: "GEOFON 官方目录",
    intensity: null,
    intensityValue: null,
    intensityScale: null,
    reportedIntensity: null,
    felt: null,
    tsunami: false,
    alert: null,
    significance: null,
    agency: "GFZ",
    url: `https://geofon.gfz.de/eqinfo/event.php?id=${encodeURIComponent(String(eventId))}`,
    detailUrl: null,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: "GEOFON CSV 目录未附带震级制式与烈度字段。",
  };
}

export function normalizeGeonetFeature(feature) {
  const properties = feature?.properties ?? {};
  const coordinates = feature?.geometry?.coordinates ?? [];
  const eventId = String(properties.publicID ?? feature?.id ?? "").trim();
  const latitude = finiteNumber(coordinates[1]);
  const longitude = finiteNumber(coordinates[0]);
  const magnitude = finiteNumber(properties.magnitude);
  const time = isoTime(properties.time);
  if (!eventId || latitude === null || longitude === null || magnitude === null || !time) return null;
  const mmi = finiteNumber(properties.mmi ?? properties.MMI);
  return {
    id: `geonet:${eventId}`,
    source: "geonet",
    sourceEventId: eventId,
    time,
    updatedAt: isoTime(properties.modificationTime),
    latitude,
    longitude,
    depthKm: normalizeDepth(properties.depth ?? coordinates[2]),
    magnitude,
    magnitudeType: magnitudeType(properties.magnitudeType, "M"),
    place: properties.locality || "新西兰附近",
    status: properties.quality || "GeoNet 官方目录",
    intensity: mmi === null ? null : String(mmi),
    intensityValue: mmi,
    intensityScale: mmi === null ? null : "MMI",
    reportedIntensity: null,
    felt: null,
    tsunami: false,
    alert: null,
    significance: null,
    agency: "GeoNet",
    url: `https://www.geonet.org.nz/earthquake/${encodeURIComponent(eventId)}`,
    detailUrl: `${GEONET_API}/${encodeURIComponent(eventId)}`,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: "MMI 为 GeoNet 对新西兰区域最近地点的计算烈度。",
  };
}

export function normalizeBmkgEvent(item) {
  const coordinates = String(item?.Coordinates ?? "").split(",").map((value) => finiteNumber(value));
  const latitude = coordinates[0] ?? null;
  const longitude = coordinates[1] ?? null;
  const magnitude = finiteNumber(item?.Magnitude);
  const time = isoTime(item?.DateTime);
  if (latitude === null || longitude === null || magnitude === null || !time) return null;
  const eventKey = `${time}:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  const potential = String(item?.Potensi ?? "").trim();
  const felt = String(item?.Dirasakan ?? "").trim() || null;
  return {
    id: `bmkg:${eventKey}`,
    source: "bmkg",
    sourceEventId: eventKey,
    time,
    updatedAt: null,
    latitude,
    longitude,
    depthKm: normalizeDepth(String(item?.Kedalaman ?? "").match(/-?\d+(?:\.\d+)?/)?.[0]),
    magnitude,
    magnitudeType: "M",
    place: item?.Wilayah || "印度尼西亚附近",
    status: felt ? "BMKG 有感地震" : "BMKG M5+ 目录",
    intensity: null,
    intensityValue: null,
    intensityScale: null,
    reportedIntensity: felt,
    felt: null,
    tsunami: Boolean(potential) && !/tidak/i.test(potential),
    alert: null,
    significance: null,
    agency: "BMKG",
    url: SOURCE_META.bmkg.url,
    detailUrl: item?.Shakemap ? `https://static.bmkg.go.id/${String(item.Shakemap).replace(/^\/+/, "")}` : null,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: [potential, felt ? `有感地区：${felt}` : ""].filter(Boolean).join("；") || null,
  };
}

export function normalizeCencEvent(item) {
  const longitude = finiteNumber(item?.longitude);
  const latitude = finiteNumber(item?.latitude);
  const magnitude = finiteNumber(item?.magnitude);
  const timeText = String(item?.time ?? "").trim().replace(" ", "T");
  const time = isoTime(`${timeText}+08:00`);
  if (longitude === null || latitude === null || magnitude === null || !time) return null;
  return {
    id: `cenc:${item.id}`,
    source: "cenc",
    sourceEventId: String(item.id),
    time,
    updatedAt: null,
    latitude,
    longitude,
    depthKm: normalizeDepth(item.depth),
    magnitude,
    magnitudeType: "M",
    place: item.location || "未命名震中",
    status: "公开目录",
    intensity: null,
    intensityValue: null,
    intensityScale: null,
    reportedIntensity: null,
    felt: null,
    tsunami: false,
    alert: null,
    significance: null,
    agency: "CENC",
    url: SOURCE_META.cenc.url,
    detailUrl: null,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: "公开目录未附带震级制式与烈度字段",
  };
}

export function parseJmaCoordinate(value) {
  const coordinate = textValue(value);
  if (!coordinate) return null;
  const match = coordinate.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\//);
  if (!match) return null;
  const latitude = finiteNumber(match[1]);
  const longitude = finiteNumber(match[2]);
  const depthMetres = finiteNumber(match[3]);
  if (latitude === null || longitude === null) return null;
  return {
    latitude,
    longitude,
    depthKm: depthMetres === null ? null : Math.abs(depthMetres) / 1000,
  };
}

function jmaIntensityRank(value) {
  const ranks = new Map([
    ["0", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4],
    ["5-", 5], ["5弱", 5], ["5+", 5.5], ["5強", 5.5],
    ["6-", 6], ["6弱", 6], ["6+", 6.5], ["6強", 6.5], ["7", 7],
  ]);
  return ranks.get(String(value ?? "")) ?? null;
}

export function normalizeJmaDocument(xml, sourceUrl) {
  const report = xmlParser.parse(xml)?.Report;
  const earthquake = asArray(report?.Body?.Earthquake)[0];
  const coordinateValue = earthquake?.Hypocenter?.Area?.Coordinate;
  const coordinate = parseJmaCoordinate(coordinateValue);
  const magnitudeNode = earthquake?.Magnitude;
  const magnitude = finiteNumber(textValue(magnitudeNode));
  const time = isoTime(earthquake?.OriginTime ?? report?.Head?.TargetDateTime);
  if (!coordinate || magnitude === null || !time) return null;
  const eventId = String(report?.Head?.EventID ?? sourceUrl.split("/").pop() ?? time);
  const observation = report?.Body?.Intensity?.Observation;
  const maxIntensity = textValue(observation?.MaxInt);
  const affectedAreas = [];
  const affectedAreaIndex = new Map();
  for (const prefecture of asArray(observation?.Pref)) {
    for (const area of asArray(prefecture?.Area)) {
      const name = textValue(area?.Name);
      const intensity = textValue(area?.MaxInt);
      const rank = jmaIntensityRank(intensity);
      if (!name || !intensity || rank === null) continue;
      const previousIndex = affectedAreaIndex.get(name);
      const value = { name, intensity, rank, warning: false };
      if (previousIndex === undefined) {
        affectedAreaIndex.set(name, affectedAreas.length);
        affectedAreas.push(value);
      } else if (affectedAreas[previousIndex].rank < rank) {
        affectedAreas[previousIndex] = value;
      }
    }
  }
  const forecastComment = textValue(report?.Body?.Comments?.ForecastComment?.Text);
  const event = {
    id: `jma:${eventId}`,
    source: "jma",
    sourceEventId: eventId,
    time,
    updatedAt: isoTime(report?.Control?.DateTime ?? report?.Head?.ReportDateTime),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    depthKm: coordinate.depthKm,
    magnitude,
    magnitudeType: magnitudeType(magnitudeNode?.["@type"], "Mj"),
    place: textValue(earthquake?.Hypocenter?.Area?.Name) || "日本附近",
    status: textValue(report?.Head?.InfoType) || textValue(report?.Control?.Status) || "发布",
    intensity: maxIntensity,
    intensityValue: jmaIntensityRank(maxIntensity),
    intensityScale: maxIntensity === null ? null : "JMA",
    reportedIntensity: null,
    felt: null,
    tsunami: forecastComment ? !forecastComment.includes("津波の心配はありません") : false,
    alert: null,
    significance: null,
    agency: textValue(report?.Control?.PublishingOffice) || "JMA",
    url: sourceUrl,
    detailUrl: null,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: forecastComment,
  };
  if (affectedAreas.length) event.affectedAreas = affectedAreas;
  return event;
}

function preferredProduct(products) {
  return products
    .filter((product) => product && product.status !== "DELETE")
    .sort((a, b) => (Number(b.preferredWeight) - Number(a.preferredWeight)) || (Number(b.updateTime) - Number(a.updateTime)))[0] ?? null;
}

function firstProductUpdateTime(products) {
  const timestamps = products
    .filter((product) => product && product.status !== "DELETE")
    .map((product) => Number(product.updateTime))
    .filter(Number.isFinite);
  return timestamps.length ? Math.min(...timestamps) : null;
}

function scientificValue(value, exponent) {
  const coefficient = finiteNumber(value);
  const power = finiteNumber(exponent);
  return coefficient === null || power === null ? null : `${coefficient}e${power}`;
}

export function normalizeEmscMomentTensor(product, eventId) {
  if (!product || String(product.ev_unid ?? "") !== eventId) return null;
  const tensorExponent = finiteNumber(product.mt_tensor_exp);
  const tensor = {
    "tensor-mpp": scientificValue(product.mt_mpp, tensorExponent),
    "tensor-mrp": scientificValue(product.mt_mrp, tensorExponent),
    "tensor-mrr": scientificValue(product.mt_mrr, tensorExponent),
    "tensor-mrt": scientificValue(product.mt_mrt, tensorExponent),
    "tensor-mtp": scientificValue(product.mt_mtp, tensorExponent),
    "tensor-mtt": scientificValue(product.mt_mtt, tensorExponent),
  };
  if (Object.values(tensor).some((value) => value === null)) return null;

  const properties = {
    ...tensor,
    "nodal-plane-1-strike": String(product.mt_strike_1 ?? ""),
    "nodal-plane-1-dip": String(product.mt_dip_1 ?? ""),
    "nodal-plane-1-rake": String(product.mt_rake_1 ?? ""),
    "nodal-plane-2-strike": String(product.mt_strike_2 ?? ""),
    "nodal-plane-2-dip": String(product.mt_dip_2 ?? ""),
    "nodal-plane-2-rake": String(product.mt_rake_2 ?? ""),
    "scalar-moment": scientificValue(product.mt_m0, product.mt_m0_exp) ?? "",
    "percent-double-couple": String(product.mt_per_dc ?? ""),
    "derived-depth": String(product.mt_depth ?? ""),
    "derived-magnitude": String(product.mt_mw ?? product.ev_mag_value ?? ""),
    "derived-magnitude-type": "Mw",
  };
  const productId = String(product.mt_id ?? eventId);
  return {
    source: "emsc",
    eventId,
    type: "moment-tensor",
    productSource: String(product.mt_source_catalog ?? "EMSC").toUpperCase(),
    reviewStatus: product.mt_preferred ? "preferred" : "collected",
    updateTime: isoTime(product.mt_centroid_time ?? product.ev_event_time),
    properties,
    officialUrl: `${EMSC_MT_API}?${new URLSearchParams({ format: "json", eventid: eventId, preferredOnly: "true" })}`,
    documentationUrl: "https://www.emsc-csem.org/Files/epos/specifications/Specs_MT-WS.pdf",
    productId,
    cache: "MISS",
  };
}

function cencMechanismId(product) {
  return [
    product.catalogueType,
    product.originTime,
    product.latitude.toFixed(2),
    product.longitude.toFixed(2),
  ].join(":");
}

export function parseCencMechanismHtml(html, catalogueType = "auto") {
  const normalizedType = catalogueType === "review" ? "review" : "auto";
  const $ = loadHtml(String(html ?? ""));
  const products = [];
  $("table.cls-data-table tr").each((_index, row) => {
    const cells = $(row).find("td.cls-data-td-listform").map((_cellIndex, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    if (cells.length !== 13) return;
    const originTime = isoTime(`${cells[0].replace(" ", "T")}+08:00`);
    const [
      latitude,
      longitude,
      depthKm,
      quickMagnitude,
      momentMagnitude,
      centroidDepthKm,
      strike1,
      dip1,
      rake1,
      strike2,
      dip2,
      rake2,
    ] = cells.slice(1).map(finiteNumber);
    if (!originTime || [
      latitude,
      longitude,
      depthKm,
      quickMagnitude,
      momentMagnitude,
      centroidDepthKm,
      strike1,
      dip1,
      rake1,
      strike2,
      dip2,
      rake2,
    ].some((value) => value === null)) return;
    const product = {
      catalogueType: normalizedType,
      originTime,
      latitude,
      longitude,
      depthKm,
      quickMagnitude,
      momentMagnitude,
      centroidDepthKm,
      strike1,
      dip1,
      rake1,
      strike2,
      dip2,
      rake2,
    };
    products.push({ ...product, id: cencMechanismId(product) });
  });
  return products;
}

function cencDistanceKm(first, second) {
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export function findCencMechanism(products, event) {
  const eventTime = Date.parse(String(event?.time ?? ""));
  const latitude = finiteNumber(event?.latitude);
  const longitude = finiteNumber(event?.longitude);
  const magnitude = finiteNumber(event?.magnitude);
  if (!Number.isFinite(eventTime) || latitude === null || longitude === null) return null;
  return products
    .map((product) => {
      const timeDeltaSeconds = Math.abs(Date.parse(product.originTime) - eventTime) / 1_000;
      const distanceKm = cencDistanceKm({ latitude, longitude }, product);
      const magnitudeDelta = magnitude === null ? 0 : Math.abs(product.quickMagnitude - magnitude);
      return {
        product,
        timeDeltaSeconds,
        distanceKm,
        score: timeDeltaSeconds * 5 + distanceKm + magnitudeDelta * 25 - (product.catalogueType === "review" ? 0.5 : 0),
      };
    })
    .filter((candidate) => candidate.timeDeltaSeconds <= 5 * 60 && candidate.distanceKm <= 400)
    .sort((first, second) => first.score - second.score)[0]?.product ?? null;
}

export function normalizeCencMechanism(product, eventId) {
  if (!product) return null;
  const review = product.catalogueType === "review";
  return {
    source: "cenc",
    eventId,
    type: "focal-mechanism",
    productSource: review ? "CENC REVIEW" : "CENC AUTO",
    reviewStatus: review ? "人工复核" : "自动产出",
    updateTime: null,
    properties: {
      "nodal-plane-1-strike": String(product.strike1),
      "nodal-plane-1-dip": String(product.dip1),
      "nodal-plane-1-rake": String(product.rake1),
      "nodal-plane-2-strike": String(product.strike2),
      "nodal-plane-2-dip": String(product.dip2),
      "nodal-plane-2-rake": String(product.rake2),
      "derived-depth": String(product.centroidDepthKm),
      "derived-magnitude": String(product.momentMagnitude),
      "derived-magnitude-type": "Mw",
      "event-depth": String(product.depthKm),
      "event-magnitude": String(product.quickMagnitude),
      "catalogue-type": product.catalogueType,
    },
    officialUrl: `${CENC_MECHANISM_PAGE}&cmtype=${product.catalogueType}`,
    documentationUrl: CENC_MECHANISM_PAGE,
    productId: product.id,
    cache: "MISS",
  };
}

async function getCencMechanismCatalogue(options = {}) {
  const now = options.now ?? Date.now();
  if (cencMechanismCatalogueCache?.expiresAt > now) return cencMechanismCatalogueCache.products;
  const fetchImpl = options.fetchImpl ?? fetch;
  const settled = await Promise.allSettled(CENC_MECHANISM_URLS.map(async ({ catalogueType, url }) => {
    const html = await fetchWithTimeout(url, fetchImpl, "text", {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
      "User-Agent": CWA_BROWSER_USER_AGENT,
    });
    return parseCencMechanismHtml(html, catalogueType);
  }));
  const products = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!products.length) throw new EarthquakeMechanismError("CENC 自动产出与人工复核机制解目录当前均不可用");
  const deduplicated = [...new Map(products.map((product) => [product.id, product])).values()];
  cencMechanismCatalogueCache = {
    products: deduplicated,
    expiresAt: now + Math.min(MECHANISM_CACHE_TTL_MS, 30 * 60 * 1_000),
  };
  return deduplicated;
}

export async function getEarthquakeMechanism(searchParams, options = {}) {
  const source = String(searchParams.get("source") ?? "").toLowerCase();
  const eventId = String(searchParams.get("event_id") ?? "").trim();
  if (!new Set(["usgs", "emsc", "cenc"]).has(source)) throw new EarthquakeMechanismError("当前支持 USGS、EMSC 与 CENC 官方机制解查询", 400);
  if (!/^[a-z0-9_.-]{3,80}$/i.test(eventId)) throw new EarthquakeMechanismError("地震事件编号无效", 400);

  const now = options.now ?? Date.now();
  const cacheKey = `${source}:${eventId}`;
  const cached = mechanismCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { ...cached.value, cache: "HIT" };

  const fetchImpl = options.fetchImpl ?? fetch;
  if (source === "cenc") {
    const time = isoTime(searchParams.get("time"));
    const latitude = finiteNumber(searchParams.get("latitude"));
    const longitude = finiteNumber(searchParams.get("longitude"));
    const magnitude = finiteNumber(searchParams.get("magnitude"));
    if (!time || latitude === null || longitude === null) {
      throw new EarthquakeMechanismError("CENC 机制解匹配需要有效的发震时间与震中坐标", 400);
    }
    const products = await getCencMechanismCatalogue({ ...options, fetchImpl, now });
    const product = findCencMechanism(products, { time, latitude, longitude, magnitude });
    const value = normalizeCencMechanism(product, eventId);
    if (!value) throw new EarthquakeMechanismError("该 CENC 事件尚无匹配的自动或人工复核机制解", 404);
    mechanismCache.set(cacheKey, { value, expiresAt: now + MECHANISM_CACHE_TTL_MS });
    return value;
  }
  if (source === "emsc") {
    const url = new URL(EMSC_MT_API);
    url.search = new URLSearchParams({
      format: "json",
      eventid: eventId,
      preferredOnly: "true",
      limit: "10",
    }).toString();
    let detail;
    try {
      detail = await fetchWithTimeout(url, fetchImpl, "json");
    } catch (error) {
      throw new EarthquakeMechanismError(`EMSC 机制解请求失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const product = asArray(detail)
      .filter((item) => item && String(item.ev_unid ?? "") === eventId)
      .sort((a, b) => Number(Boolean(b.mt_preferred)) - Number(Boolean(a.mt_preferred)))[0] ?? null;
    const value = normalizeEmscMomentTensor(product, eventId);
    if (!value) throw new EarthquakeMechanismError("该 EMSC 事件尚无收录的矩张量产品", 404);
    mechanismCache.set(cacheKey, { value, expiresAt: now + MECHANISM_CACHE_TTL_MS });
    return value;
  }

  const url = new URL(USGS_API);
  url.search = new URLSearchParams({ format: "geojson", eventid: eventId }).toString();
  let detail;
  try {
    detail = await fetchWithTimeout(url, fetchImpl, "json");
  } catch (error) {
    throw new EarthquakeMechanismError(`USGS 机制解请求失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const products = detail?.properties?.products ?? {};
  const momentTensor = preferredProduct(asArray(products["moment-tensor"]));
  const focalMechanism = preferredProduct(asArray(products["focal-mechanism"]));
  const product = momentTensor ?? focalMechanism;
  if (!product) throw new EarthquakeMechanismError("该事件尚无官方机制解产品", 404);

  const type = momentTensor ? "moment-tensor" : "focal-mechanism";
  const properties = Object.fromEntries(Object.entries(product.properties ?? {}).map(([key, value]) => [key, String(value)]));
  const value = {
    source: "usgs",
    eventId,
    type,
    productSource: String(product.source ?? properties["beachball-source"] ?? "USGS").toUpperCase(),
    reviewStatus: properties["review-status"] ?? properties["evaluation-status"] ?? "unknown",
    updateTime: isoTime(product.updateTime),
    properties,
    officialUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(eventId)}/${type}`,
    documentationUrl: "https://earthquake.usgs.gov/data/comcat/",
    cache: "MISS",
  };
  mechanismCache.set(cacheKey, { value, expiresAt: now + MECHANISM_CACHE_TTL_MS });
  return value;
}

function usgsProductContentUrl(product, names) {
  for (const name of names) {
    const rawUrl = product?.contents?.[name]?.url;
    if (!rawUrl) continue;
    try {
      const url = new URL(String(rawUrl));
      if (url.protocol === "https:" && url.hostname === "earthquake.usgs.gov") return url.toString();
    } catch {
      // Ignore malformed or non-USGS product content URLs.
    }
  }
  return null;
}

function usgsProductContentUrlBySuffix(product, suffixes) {
  const normalizedSuffixes = suffixes.map((suffix) => String(suffix).toLowerCase());
  for (const suffix of normalizedSuffixes) {
    for (const [name, content] of Object.entries(product?.contents ?? {})) {
      const normalizedName = String(name).toLowerCase();
      if (normalizedName !== suffix && !normalizedName.endsWith(`/${suffix}`) && !normalizedName.endsWith(suffix)) continue;
      const rawUrl = content?.url;
      if (!rawUrl) continue;
      try {
        const url = new URL(String(rawUrl));
        if (url.protocol === "https:" && url.hostname === "earthquake.usgs.gov") return url.toString();
      } catch {
        // Ignore malformed or non-USGS product content URLs.
      }
    }
  }
  return null;
}

function normalizePagerAlert(value, expectedType) {
  if (!value || typeof value !== "object" || value.type !== expectedType) return null;
  const level = new Set(["green", "yellow", "orange", "red"]).has(String(value.level).toLowerCase())
    ? String(value.level).toLowerCase()
    : "unknown";
  const bins = asArray(value.bins).slice(0, 16).flatMap((bin) => {
    const probability = finiteNumber(bin?.probability);
    const minimum = persistedString(bin?.min, 40);
    const maximum = persistedString(bin?.max, 40);
    if (probability === null || !minimum || !maximum) return [];
    const rawColor = String(bin?.color ?? "").toLowerCase();
    return [{
      color: new Set(["green", "yellow", "orange", "red"]).has(rawColor) ? rawColor : "unknown",
      minimum,
      maximum,
      probability: Math.max(0, Math.min(1, probability)),
    }];
  });
  return {
    type: expectedType,
    units: persistedString(value.units, 40, expectedType === "economic" ? "USD" : "fatalities"),
    level,
    estimatedValue: finiteNumber(value.gvalue),
    summary: Boolean(value.summary),
    bins,
  };
}

const PAGER_EXPOSURE_GROUPS = [
  { label: "I", minimum: 1, maximum: 1 },
  { label: "II–III", minimum: 2, maximum: 3 },
  { label: "IV", minimum: 4, maximum: 4 },
  { label: "V", minimum: 5, maximum: 5 },
  { label: "VI", minimum: 6, maximum: 6 },
  { label: "VII", minimum: 7, maximum: 7 },
  { label: "VIII", minimum: 8, maximum: 8 },
  { label: "IX", minimum: 9, maximum: 9 },
  { label: "X", minimum: 10, maximum: 10 },
];

function pagerExposureByMmi(value) {
  const mmi = asArray(value?.mmi).map(finiteNumber);
  const exposure = asArray(value?.aggregated_exposure).map(finiteNumber);
  return new Map(mmi.flatMap((rank, index) => rank === null ? [] : [[Math.round(rank), Math.max(0, exposure[index] ?? 0)]]));
}

export function normalizePagerPopulationExposure(value) {
  const population = value?.population_exposure;
  if (!population || typeof population !== "object") return null;
  const byMmi = pagerExposureByMmi(population);
  const groups = PAGER_EXPOSURE_GROUPS.map((group) => ({
    label: group.label,
    minimumMmi: group.minimum,
    maximumMmi: group.maximum,
    population: Math.round(Array.from(
      { length: group.maximum - group.minimum + 1 },
      (_, index) => byMmi.get(group.minimum + index) ?? 0,
    ).reduce((sum, current) => sum + current, 0)),
  }));
  const countries = asArray(population.country_exposures).slice(0, 260).flatMap((country) => {
    const countryCode = persistedString(country?.country_code, 3).toUpperCase();
    if (!/^[A-Z]{2,3}$/.test(countryCode)) return [];
    const values = asArray(country?.exposure).slice(0, 10).map((item) => Math.max(0, Math.round(finiteNumber(item) ?? 0)));
    return [{ countryCode, population: values.reduce((sum, current) => sum + current, 0), byMmi: values }];
  });
  return {
    groups,
    maximumBorderMmi: finiteNumber(population.maximum_border_mmi),
    totalPopulation: groups.reduce((sum, group) => sum + group.population, 0),
    countries,
  };
}

export function normalizePagerCities(value) {
  return asArray(value?.all_cities).slice(0, 20_000).flatMap((city, index) => {
    const latitude = finiteNumber(city?.lat);
    const longitude = finiteNumber(city?.lon);
    const mmi = finiteNumber(city?.mmi);
    if (latitude === null || longitude === null || mmi === null
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
      || mmi < 0 || mmi > 12) return [];
    const name = persistedString(city?.name, 160, `City ${index + 1}`);
    return [{
      id: `${latitude.toFixed(5)}:${longitude.toFixed(5)}:${index}`,
      name,
      latitude,
      longitude,
      population: Math.max(0, Math.round(finiteNumber(city?.pop) ?? 0)),
      mmi,
      capital: Boolean(city?.iscap),
      onOfficialMap: Number(city?.on_map) === 1,
    }];
  }).sort((a, b) => b.mmi - a.mmi || b.population - a.population || a.name.localeCompare(b.name));
}

function normalizePagerComments(value) {
  if (!value || typeof value !== "object") return null;
  const normalized = {
    impact: [persistedString(value.impact1, 4_000), persistedString(value.impact2, 4_000)].filter(Boolean),
    structure: persistedString(value.struct_comment, 8_000) || null,
    historical: persistedString(value.historical_comment, 8_000) || null,
    secondaryHazards: persistedString(value.secondary_comment, 8_000) || null,
  };
  return normalized.impact.length || normalized.structure || normalized.historical || normalized.secondaryHazards
    ? normalized
    : null;
}

async function fetchUsgsEventDetail(eventId, fetchImpl, productLabel) {
  const detailUrl = new URL(USGS_API);
  detailUrl.search = new URLSearchParams({ format: "geojson", eventid: eventId }).toString();
  try {
    return await fetchWithTimeout(detailUrl, fetchImpl, "json");
  } catch (error) {
    throw new EarthquakeUsgsProductError(`${productLabel} 事件查询失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchOptionalUsgsJson(url, fetchImpl) {
  if (!url) return null;
  try {
    return await fetchWithTimeout(url, fetchImpl, "json");
  } catch {
    return null;
  }
}

export async function getEarthquakePager(searchParams, options = {}) {
  const eventId = String(searchParams.get("event_id") ?? "").trim();
  if (!/^[a-z0-9_.-]{3,80}$/i.test(eventId)) throw new EarthquakeUsgsProductError("USGS 地震事件编号无效", 400);

  const now = options.now ?? Date.now();
  const cached = pagerCache.get(eventId);
  if (cached && cached.expiresAt > now) return { ...cached.value, cache: "HIT" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const detail = await fetchUsgsEventDetail(eventId, fetchImpl, "USGS PAGER");
  const products = asArray(detail?.properties?.products?.losspager);
  const product = preferredProduct(products);
  if (!product) throw new EarthquakeUsgsProductError("该 USGS 事件尚无 PAGER 损失估算产品", 404);

  const alertsUrl = usgsProductContentUrl(product, ["json/alerts.json", "alerts.json"]);
  const exposuresUrl = usgsProductContentUrl(product, ["json/exposures.json", "exposures.json"]);
  const citiesUrl = usgsProductContentUrl(product, ["json/cities.json", "cities.json"]);
  const commentsUrl = usgsProductContentUrl(product, ["json/comments.json", "comments.json"]);
  if (!alertsUrl || !exposuresUrl || !citiesUrl) {
    throw new EarthquakeUsgsProductError("该 PAGER 产品缺少官方损失、人口暴露或全部城市数据", 404);
  }

  const [alertsRaw, exposuresRaw, citiesRaw, commentsRaw] = await Promise.all([
    fetchOptionalUsgsJson(alertsUrl, fetchImpl),
    fetchOptionalUsgsJson(exposuresUrl, fetchImpl),
    fetchOptionalUsgsJson(citiesUrl, fetchImpl),
    fetchOptionalUsgsJson(commentsUrl, fetchImpl),
  ]);
  const populationExposure = normalizePagerPopulationExposure(exposuresRaw);
  const allCities = normalizePagerCities(citiesRaw);
  if (!alertsRaw || !populationExposure || !allCities.length) {
    throw new EarthquakeUsgsProductError("USGS PAGER 官方数据内容无效或暂不可用", 502);
  }

  const properties = Object.fromEntries(Object.entries(product.properties ?? {}).map(([key, value]) => [key, String(value)]));
  const value = {
    source: "usgs",
    eventId,
    productSource: String(product.source ?? "USGS").toUpperCase(),
    reviewStatus: properties["review-status"] ?? properties["evaluation-status"] ?? "unknown",
    issuedAt: isoTime(firstProductUpdateTime(products) ?? product.updateTime),
    updateTime: isoTime(product.updateTime),
    alertLevel: properties.alertlevel ?? "unknown",
    maxMmi: finiteNumber(properties.maxmmi),
    event: {
      place: persistedString(detail?.properties?.place, 500, eventId),
      magnitude: finiteNumber(detail?.properties?.mag),
      time: isoTime(detail?.properties?.time),
      latitude: finiteNumber(detail?.geometry?.coordinates?.[1]),
      longitude: finiteNumber(detail?.geometry?.coordinates?.[0]),
    },
    officialUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(eventId)}/pager`,
    onePagerPdfUrl: usgsProductContentUrl(product, ["onepager.pdf"]),
    images: {
      populationExposure: usgsProductContentUrl(product, ["exposure.png"]),
      fatalities: usgsProductContentUrl(product, ["alertfatal.png"]),
      economicLosses: usgsProductContentUrl(product, ["alertecon.png"]),
    },
    alerts: {
      fatality: normalizePagerAlert(alertsRaw.fatality, "fatality"),
      economic: normalizePagerAlert(alertsRaw.economic, "economic"),
    },
    populationExposure,
    allCities,
    citySource: persistedString(citiesRaw?.city_source, 2_000) || null,
    comments: normalizePagerComments(commentsRaw),
    cache: "MISS",
  };
  pagerCache.set(eventId, { value, expiresAt: now + USGS_IMPACT_CACHE_TTL_MS });
  return value;
}

export async function getEarthquakeDyfi(searchParams, options = {}) {
  const eventId = String(searchParams.get("event_id") ?? "").trim();
  if (!/^[a-z0-9_.-]{3,80}$/i.test(eventId)) throw new EarthquakeUsgsProductError("USGS 地震事件编号无效", 400);

  const now = options.now ?? Date.now();
  const cached = dyfiCache.get(eventId);
  if (cached && cached.expiresAt > now) return { ...cached.value, cache: "HIT" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const detail = await fetchUsgsEventDetail(eventId, fetchImpl, "USGS DYFI");
  const product = preferredProduct(asArray(detail?.properties?.products?.dyfi));
  if (!product) throw new EarthquakeUsgsProductError("该 USGS 事件尚无 Did You Feel It? 产品", 404);
  const properties = Object.fromEntries(Object.entries(product.properties ?? {}).map(([key, value]) => [key, String(value)]));
  const images = {
    communityIntensity: usgsProductContentUrlBySuffix(product, ["_ciim.jpg"]),
    geocodedIntensity: usgsProductContentUrlBySuffix(product, ["_ciim_geo.jpg"]),
    intensityDistance: usgsProductContentUrlBySuffix(product, ["_plot_atten.jpg"]),
    responseTime: usgsProductContentUrlBySuffix(product, ["_plot_numresp.jpg"]),
  };
  if (!Object.values(images).some(Boolean)) throw new EarthquakeUsgsProductError("该 DYFI 产品未提供可显示的官方图片", 404);

  const value = {
    source: "usgs",
    eventId,
    productSource: String(product.source ?? "USGS").toUpperCase(),
    reviewStatus: properties["review-status"] ?? properties["evaluation-status"] ?? "collected",
    updateTime: isoTime(product.updateTime),
    maxMmi: finiteNumber(properties.maxmmi),
    responses: finiteNumber(properties["num-responses"] ?? properties.numResp),
    officialUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(eventId)}/dyfi`,
    images,
    geoJsonUrl: usgsProductContentUrl(product, ["dyfi_zip.geojson", "dyfi_geo_1km.geojson", "dyfi_geo_10km.geojson"]),
    cache: "MISS",
  };
  dyfiCache.set(eventId, { value, expiresAt: now + USGS_IMPACT_CACHE_TTL_MS });
  return value;
}

function normalizeShakeMapLine(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100_000) return null;
  const coordinates = value.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return [];
    const longitude = finiteNumber(coordinate[0]);
    const latitude = finiteNumber(coordinate[1]);
    if (longitude === null || latitude === null || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return [];
    return [[longitude, latitude]];
  });
  return coordinates.length >= 2 ? coordinates : null;
}

function normalizeShakeMapContours(value) {
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) return null;
  const features = value.features.slice(0, 128).flatMap((feature, index) => {
    const geometry = feature?.geometry;
    if (!geometry || !new Set(["LineString", "MultiLineString"]).has(geometry.type)) return [];
    const lines = geometry.type === "LineString"
      ? [normalizeShakeMapLine(geometry.coordinates)]
      : asArray(geometry.coordinates).slice(0, 2_000).map(normalizeShakeMapLine);
    const validLines = lines.filter(Boolean);
    if (!validLines.length) return [];
    const intensity = finiteNumber(feature?.properties?.value);
    if (intensity === null || intensity < 0 || intensity > 12) return [];
    const rawColor = String(feature?.properties?.color ?? "").trim();
    const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#38bdf8";
    const weight = Math.max(1, Math.min(6, finiteNumber(feature?.properties?.weight) ?? 2));
    return [{
      type: "Feature",
      id: String(feature?.id ?? `mmi-${intensity}-${index}`),
      properties: {
        value: intensity,
        units: "mmi",
        color,
        weight,
      },
      geometry: geometry.type === "LineString"
        ? { type: "LineString", coordinates: validLines[0] }
        : { type: "MultiLineString", coordinates: validLines },
    }];
  });
  return features.length ? { type: "FeatureCollection", features } : null;
}

export async function getEarthquakeShakeMap(searchParams, options = {}) {
  const eventId = String(searchParams.get("event_id") ?? "").trim();
  if (!/^[a-z0-9_.-]{3,80}$/i.test(eventId)) throw new EarthquakeShakeMapError("USGS 地震事件编号无效", 400);

  const now = options.now ?? Date.now();
  const cached = shakeMapCache.get(eventId);
  if (cached && cached.expiresAt > now) return { ...cached.value, cache: "HIT" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const detailUrl = new URL(USGS_API);
  detailUrl.search = new URLSearchParams({ format: "geojson", eventid: eventId }).toString();
  let detail;
  try {
    detail = await fetchWithTimeout(detailUrl, fetchImpl, "json");
  } catch (error) {
    throw new EarthquakeShakeMapError(`USGS ShakeMap 事件查询失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const products = asArray(detail?.properties?.products?.shakemap);
  const product = preferredProduct(products);
  if (!product) throw new EarthquakeShakeMapError("该 USGS 事件尚无 ShakeMap 产品", 404);
  const contourUrl = usgsProductContentUrl(product, ["download/cont_mi.json", "download/cont_mmi.json"]);
  if (!contourUrl) throw new EarthquakeShakeMapError("该 ShakeMap 产品未提供官方 MMI 等值线", 404);

  let rawContours;
  try {
    rawContours = await fetchWithTimeout(contourUrl, fetchImpl, "json");
  } catch (error) {
    throw new EarthquakeShakeMapError(`USGS ShakeMap 等值线请求失败：${error instanceof Error ? error.message : String(error)}`);
  }
  const contours = normalizeShakeMapContours(rawContours);
  if (!contours) throw new EarthquakeShakeMapError("USGS ShakeMap 等值线内容无效", 502);

  const properties = Object.fromEntries(Object.entries(product.properties ?? {}).map(([key, value]) => [key, String(value)]));
  const contourMaximum = Math.max(...contours.features.map((feature) => feature.properties.value));
  const declaredMaximum = finiteNumber(properties.maxmmi);
  const value = {
    source: "usgs",
    eventId,
    productSource: String(product.source ?? "USGS").toUpperCase(),
    reviewStatus: properties["review-status"] ?? properties["evaluation-status"] ?? "unknown",
    issuedAt: isoTime(firstProductUpdateTime(products) ?? product.updateTime),
    updateTime: isoTime(product.updateTime),
    version: properties.version ?? null,
    maxMmi: declaredMaximum ?? contourMaximum,
    officialUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(eventId)}/shakemap`,
    intensityImageUrl: usgsProductContentUrl(product, ["download/intensity.jpg", "download/intensity.png"]),
    intensityOverlayUrl: usgsProductContentUrl(product, ["download/intensity_overlay.png"]),
    contours,
    cache: "MISS",
  };
  shakeMapCache.set(eventId, { value, expiresAt: now + SHAKEMAP_CACHE_TTL_MS });
  return value;
}

export function parseJmaFeedLinks(xml, limit = 96) {
  const feed = xmlParser.parse(xml)?.feed;
  const links = [];
  for (const entry of asArray(feed?.entry)) {
    const title = textValue(entry?.title) || "";
    if (!/震源|遠地地震/.test(title)) continue;
    const linkCandidates = asArray(entry?.link);
    const link = linkCandidates.find((item) => item?.["@type"] === "application/xml") ?? linkCandidates[0];
    const href = link?.["@href"] ?? textValue(entry?.id);
    if (href && String(href).startsWith("https://www.data.jma.go.jp/")) links.push(String(href));
  }
  return Array.from(new Set(links)).slice(0, Math.max(1, limit));
}

export function mergeJmaFeedLinks(feeds, limit = 96) {
  const links = feeds.flatMap((feed) => parseJmaFeedLinks(feed, limit));
  return Array.from(new Set(links)).slice(0, Math.max(1, limit));
}

async function fetchWithTimeout(url, fetchImpl, responseType, headers = {}) {
  for (let attempt = 0; attempt <= UPSTREAM_RETRY_COUNT; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: responseType === "json" ? "application/json" : "application/xml,text/xml;q=0.9,*/*;q=0.5",
          "User-Agent": "ecmwf-pBoard/1.0 earthquake-dashboard",
          ...headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (!isRetryableTransportError(error) || attempt >= UPSTREAM_RETRY_COUNT) throw error;
      await waitForUpstreamRetry(attempt);
      continue;
    }
    if (response.ok) {
      try {
        return await (responseType === "json" ? response.json() : response.text());
      } catch (error) {
        if (!isRetryableTransportError(error) || attempt >= UPSTREAM_RETRY_COUNT) throw error;
        await waitForUpstreamRetry(attempt);
        continue;
      }
    }

    const message = `${response.status} ${response.statusText || "上游请求失败"}`;
    if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt >= UPSTREAM_RETRY_COUNT) throw new Error(message);
    await waitForUpstreamRetry(attempt);
  }
  throw new Error("上游请求重试耗尽");
}

async function fetchUsgs({ startTime, endTime, minMagnitude }, fetchImpl) {
  const url = new URL(USGS_API);
  url.search = new URLSearchParams({
    format: "geojson",
    starttime: startTime,
    endtime: endTime,
    minmagnitude: String(minMagnitude),
    orderby: "time",
    limit: "2000",
  }).toString();
  const data = await fetchWithTimeout(url, fetchImpl, "json");
  return asArray(data?.features).map(normalizeUsgsFeature).filter(Boolean);
}

async function fetchShakeAlert(query, fetchImpl) {
  let data;
  if (query.range === "30d" || query.range === "90d") {
    const url = new URL(USGS_API);
    url.search = new URLSearchParams({
      format: "geojson",
      starttime: query.startTime,
      endtime: query.endTime,
      minmagnitude: String(query.minMagnitude),
      producttype: "shake-alert",
      orderby: "time",
      limit: "500",
    }).toString();
    data = await fetchWithTimeout(url, fetchImpl, "json");
  } else {
    data = await fetchWithTimeout(SHAKEALERT_FEED, fetchImpl, "json");
  }

  const start = Date.parse(query.startTime);
  const end = Date.parse(query.endTime);
  const features = asArray(data?.features)
    .filter((feature) => {
      const time = finiteNumber(feature?.properties?.time);
      const magnitude = finiteNumber(feature?.properties?.mag);
      return time !== null && time >= start && time <= end && magnitude !== null && magnitude >= query.minMagnitude;
    })
    .slice(0, 160);

  const reports = await Promise.all(features.map(async (feature) => {
    const cacheKey = String(feature?.id ?? feature?.properties?.code ?? "");
    const revision = String(feature?.properties?.updated ?? feature?.properties?.time ?? "");
    const cached = cacheKey ? shakeAlertReportCache.get(cacheKey) : null;
    if (cached && cached.revision === revision && cached.expiresAt > Date.now()) return cached.event;

    let detail = null;
    let summary = null;
    try {
      const detailUrl = feature?.properties?.detail;
      if (detailUrl) detail = await fetchWithTimeout(detailUrl, fetchImpl, "json");
      const product = preferredProduct(asArray(detail?.properties?.products?.["shake-alert"]));
      const summaryUrl = product?.contents?.["summary.json"]?.url;
      if (summaryUrl) summary = await fetchWithTimeout(summaryUrl, fetchImpl, "json");
    } catch {
      // Keep the official feed event even if its optional performance attachments are delayed.
    }
    const event = normalizeShakeAlertFeature(feature, detail, summary);
    if (cacheKey && event?.shakeAlertReport) {
      shakeAlertReportCache.set(cacheKey, {
        revision,
        event,
        expiresAt: Date.now() + SHAKEALERT_CACHE_TTL_MS,
      });
    }
    return event;
  }));
  return reports.filter(Boolean);
}

async function fetchEmsc({ startTime, endTime, minMagnitude }, fetchImpl) {
  const url = new URL(EMSC_API);
  url.search = new URLSearchParams({
    format: "json",
    starttime: startTime,
    endtime: endTime,
    minmag: String(minMagnitude),
    orderby: "time",
    limit: "1000",
  }).toString();
  const data = await fetchWithTimeout(url, fetchImpl, "json");
  return asArray(data?.features).map(normalizeEmscFeature).filter(Boolean);
}

async function fetchGfz({ startTime, endTime, minMagnitude }, fetchImpl) {
  const url = new URL(GFZ_API);
  url.search = new URLSearchParams({
    format: "csv",
    starttime: startTime,
    endtime: endTime,
    minmagnitude: String(minMagnitude),
    orderby: "time",
    limit: "1000",
  }).toString();
  const text = await fetchWithTimeout(url, fetchImpl, "text", { Accept: "text/plain,*/*;q=0.5" });
  return csvParseRows(text).map(normalizeGfzRow).filter(Boolean);
}

async function fetchGeonet({ startTime, endTime, minMagnitude }, fetchImpl) {
  const url = new URL(GEONET_API);
  url.search = new URLSearchParams({ MMI: "-1" }).toString();
  const data = await fetchWithTimeout(url, fetchImpl, "json", {
    Accept: "application/vnd.geo+json;version=2",
  });
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  return asArray(data?.features)
    .map(normalizeGeonetFeature)
    .filter((event) => event && Date.parse(event.time) >= start && Date.parse(event.time) <= end && event.magnitude >= minMagnitude);
}

async function fetchBmkg({ startTime, endTime, minMagnitude }, fetchImpl) {
  const settled = await Promise.allSettled(BMKG_FEEDS.map((url) => fetchWithTimeout(url, fetchImpl, "json")));
  const payloads = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!payloads.length) throw new Error("BMKG M5+ 与有感目录均不可用");
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const byId = new Map();
  for (const payload of payloads) {
    for (const event of asArray(payload?.Infogempa?.gempa).map(normalizeBmkgEvent).filter(Boolean)) {
      if (Date.parse(event.time) < start || Date.parse(event.time) > end || event.magnitude < minMagnitude) continue;
      const previous = byId.get(event.id);
      if (!previous || (!previous.reportedIntensity && event.reportedIntensity)) byId.set(event.id, event);
    }
  }
  return [...byId.values()];
}

async function fetchCenc({ startTime, minMagnitude }, fetchImpl) {
  const data = await fetchWithTimeout(CENC_CATALOGUE, fetchImpl, "json");
  const start = new Date(startTime).getTime();
  const events = asArray(data)
    .map(normalizeCencEvent)
    .filter((event) => event && new Date(event.time).getTime() >= start && event.magnitude >= minMagnitude)
    .slice(0, 1000);
  try {
    const products = await getCencMechanismCatalogue({ fetchImpl });
    return events.map((event) => ({
      ...event,
      mechanismAvailable: Boolean(findCencMechanism(products, event)),
    }));
  } catch {
    return events;
  }
}

async function fetchCwaCatalogue({ startTime, endTime, minMagnitude }, fetchImpl) {
  const html = await fetchWithTimeout(CWA_CATALOGUE, fetchImpl, "text", {
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    "User-Agent": CWA_BROWSER_USER_AGENT,
  });
  const catalogueYear = parseCwaCatalogueYear(html, endTime);
  const expectedYear = taipeiCalendarYear(endTime);
  if (catalogueYear !== expectedYear) throw new Error(`CWA 返回过期目录：${catalogueYear}年（预期 ${expectedYear}年）`);
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  return parseCwaCatalogueHtml(html, end)
    .filter((event) => Date.parse(event.time) >= start && Date.parse(event.time) <= end && event.magnitude >= minMagnitude);
}

async function fetchCwa(query, fetchImpl, env = process.env) {
  const token = String(env?.CWA_API_TOKEN ?? "").trim();
  if (!token) return fetchCwaCatalogue(query, fetchImpl);

  const settled = await Promise.allSettled(CWA_OPEN_DATASETS.map(async (datasetId) => {
    const url = new URL(datasetId, CWA_OPEN_DATA_API);
    url.searchParams.set("format", "JSON");
    const payload = await fetchWithTimeout(url, fetchImpl, "json", {
      Authorization: token,
      Accept: "application/json",
    });
    return parseCwaOpenDataPayload(payload, datasetId);
  }));
  const successful = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!successful.length && settled.every((result) => result.status === "rejected")) {
    throw new Error("CWA 显著有感与小区域有感 API 均不可用");
  }

  const start = Date.parse(query.startTime);
  const end = Date.parse(query.endTime);
  const byId = new Map();
  for (const event of successful) {
    if (Date.parse(event.time) < start || Date.parse(event.time) > end || event.magnitude < query.minMagnitude) continue;
    const previous = byId.get(event.id);
    if (!previous || (event.affectedAreas?.length ?? 0) > (previous.affectedAreas?.length ?? 0)) byId.set(event.id, event);
  }
  return [...byId.values()].sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
}

async function fetchJma({ startTime, minMagnitude }, fetchImpl) {
  const feedResults = await Promise.allSettled(JMA_FEEDS.map((url) => fetchWithTimeout(url, fetchImpl, "text")));
  const feeds = feedResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!feeds.length) {
    const errors = feedResults.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
    throw new Error(`JMA 高频与长期流均不可用${errors.length ? `：${errors.join("；")}` : ""}`);
  }
  const links = mergeJmaFeedLinks(feeds);
  const documents = await Promise.allSettled(links.map((url) => fetchWithTimeout(url, fetchImpl, "text").then((xml) => normalizeJmaDocument(xml, url))));
  const start = new Date(startTime).getTime();
  const byId = new Map();
  for (const result of documents) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const event = result.value;
    if (new Date(event.time).getTime() < start || event.magnitude < minMagnitude) continue;
    const previous = byId.get(event.sourceEventId);
    if (!previous || (event.intensityValue ?? -1) > (previous.intensityValue ?? -1)) byId.set(event.sourceEventId, event);
  }
  return [...byId.values()];
}

export function parseEarthquakeQuery(searchParams, now = Date.now()) {
  const range = RANGE_HOURS.has(searchParams.get("range")) ? searchParams.get("range") : "7d";
  const minMagnitudeInput = finiteNumber(searchParams.get("min_magnitude"));
  const minMagnitude = Math.min(9, Math.max(0, minMagnitudeInput ?? 2.5));
  const requestedSources = String(searchParams.get("sources") ?? "")
    .split(",")
    .map((source) => source.trim().toLowerCase())
    .filter((source) => Object.hasOwn(SOURCE_META, source));
  const sources = requestedSources.length ? [...new Set(requestedSources)] : Object.keys(SOURCE_META);
  const end = new Date(now);
  const start = new Date(now - RANGE_HOURS.get(range) * 60 * 60 * 1000);
  return {
    range,
    minMagnitude,
    sources,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    force: searchParams.get("force") === "1",
  };
}

function sourceStatus(id, status, count, latencyMs, error = null) {
  return { ...SOURCE_META[id], status, count, latencyMs, error };
}

function filterSnapshotEvents(snapshot, query) {
  if (!snapshot) return [];
  const start = Date.parse(query.startTime);
  const end = Date.parse(query.endTime);
  return snapshot.events.filter((event) => {
    const time = Date.parse(event.time);
    return time >= start && time <= end && event.magnitude >= query.minMagnitude;
  });
}

function buildPersistedEarthquakeSnapshot(query, cacheKey, persistedSnapshots, definitions, now) {
  const retained = definitions.map(([id]) => {
    const snapshot = persistedSnapshots.get(`${cacheKey}:${id}`);
    return { id, snapshot, events: filterSnapshotEvents(snapshot, query) };
  });
  if (!retained.some((item) => item.snapshot)) return null;

  const allEvents = retained.flatMap((item) => item.events).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const events = allEvents.slice(0, MAX_EVENTS);
  return {
    generatedAt: new Date(now).toISOString(),
    window: {
      range: query.range,
      startTime: query.startTime,
      endTime: query.endTime,
      minMagnitude: query.minMagnitude,
    },
    stale: true,
    partial: true,
    truncated: events.length < allEvents.length,
    events,
    sources: retained.map((item) => sourceStatus(
      item.id,
      item.snapshot ? "stale" : "error",
      item.events.length,
      0,
      item.snapshot ? "已恢复本地历史，正在后台刷新" : "暂无本地历史，正在后台刷新",
    )),
    cache: "PERSISTED",
  };
}

function refreshEarthquakesInBackground(searchParams, options, refreshKey) {
  if (sourceSnapshotRefreshes.has(refreshKey)) return;
  const refreshParams = new URLSearchParams(searchParams);
  refreshParams.set("force", "1");
  const task = getEarthquakeSnapshot(refreshParams, { ...options, preferPersisted: false })
    .catch(() => undefined)
    .finally(() => {
      if (sourceSnapshotRefreshes.get(refreshKey) === task) sourceSnapshotRefreshes.delete(refreshKey);
    });
  sourceSnapshotRefreshes.set(refreshKey, task);
}

export async function getEarthquakeSnapshot(searchParams, options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = parseEarthquakeQuery(searchParams, now);
  const cacheKey = `${query.range}:${query.minMagnitude}:${query.sources.join(",")}`;
  const cachePath = options.cachePath ?? SOURCE_SNAPSHOT_PATH;
  const persistenceEnabled = options.persist ?? (Boolean(options.cachePath) || !options.fetchImpl);
  const cached = snapshotCache.get(cacheKey);
  if (!query.force && cached) {
    if (cached.expiresAt > now) return { ...cached.value, cache: "HIT" };
    refreshEarthquakesInBackground(searchParams, options, `${cachePath}:${cacheKey}`);
    return { ...cached.value, cache: "STALE", stale: true };
  }
  const persistedSnapshots = persistenceEnabled ? await loadSourceSnapshotPersistence(cachePath, now) : new Map();

  const definitions = [
    ["usgs", fetchUsgs],
    ["shakealert", fetchShakeAlert],
    ["jma", fetchJma],
    ["cenc", fetchCenc],
    ["cwa", (currentQuery, currentFetch) => fetchCwa(currentQuery, currentFetch, options.env ?? process.env)],
    ["emsc", fetchEmsc],
    ["gfz", fetchGfz],
    ["geonet", fetchGeonet],
    ["bmkg", fetchBmkg],
  ].filter(([id]) => query.sources.includes(id));
  if (!query.force && !cached && persistenceEnabled && options.preferPersisted !== false) {
    const persistedValue = buildPersistedEarthquakeSnapshot(query, cacheKey, persistedSnapshots, definitions, now);
    if (persistedValue) {
      snapshotCache.set(cacheKey, { value: persistedValue, expiresAt: now + CACHE_TTL_MS });
      refreshEarthquakesInBackground(searchParams, options, `${cachePath}:${cacheKey}`);
      return persistedValue;
    }
  }
  const settled = await Promise.all(definitions.map(async ([id, loader]) => {
    const started = Date.now();
    const sourceCacheKey = `${cacheKey}:${id}`;
    try {
      const events = await loader(query, fetchImpl);
      sourceSnapshotCache.set(sourceCacheKey, { events, fetchedAt: now });
      return { id, events, latencyMs: Date.now() - started, error: null, retained: false };
    } catch (error) {
      const memorySnapshot = sourceSnapshotCache.get(sourceCacheKey);
      const persistedSnapshot = persistedSnapshots.get(sourceCacheKey);
      const retainedSnapshot = memorySnapshot ?? persistedSnapshot;
      const retainedEvents = filterSnapshotEvents(retainedSnapshot, query);
      return {
        id,
        events: retainedEvents,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
        retained: Boolean(retainedSnapshot),
        retainedFromDisk: !memorySnapshot && Boolean(persistedSnapshot),
      };
    }
  }));

  const successful = settled.filter((item) => !item.error);
  const retained = settled.filter((item) => item.error && item.retained);
  if (!successful.length && !retained.length) {
    if (cached) return { ...cached.value, cache: "STALE", stale: true };
    throw new EarthquakeDataError("全部地震数据源均暂时不可用");
  }

  if (persistenceEnabled && successful.length) {
    await persistSourceSnapshots(cachePath, cacheKey, successful, now).catch(() => undefined);
  }

  const allEvents = settled.flatMap((item) => item.events).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const events = allEvents.slice(0, MAX_EVENTS);
  const value = {
    generatedAt: new Date(now).toISOString(),
    window: {
      range: query.range,
      startTime: query.startTime,
      endTime: query.endTime,
      minMagnitude: query.minMagnitude,
    },
    stale: successful.length === 0,
    partial: successful.length !== definitions.length,
    truncated: events.length < allEvents.length,
    events,
    sources: settled.map((item) => sourceStatus(
      item.id,
      item.error ? item.retained ? "stale" : "error" : "ok",
      item.events.length,
      item.latencyMs,
      item.error,
    )),
    cache: successful.length === 0
      ? retained.some((item) => item.retainedFromDisk) ? "PERSISTED" : "STALE"
      : "MISS",
  };
  const completedAt = options.now === undefined ? Date.now() : now;
  snapshotCache.set(cacheKey, { value, expiresAt: completedAt + CACHE_TTL_MS });
  return value;
}

export function clearEarthquakeCache() {
  snapshotCache.clear();
  sourceSnapshotCache.clear();
  mechanismCache.clear();
  cencMechanismCatalogueCache = null;
  shakeMapCache.clear();
  pagerCache.clear();
  dyfiCache.clear();
  shakeAlertReportCache.clear();
  sourceSnapshotPersistenceStates.clear();
  sourceSnapshotPersistenceWrites.clear();
  sourceSnapshotRefreshes.clear();
}
