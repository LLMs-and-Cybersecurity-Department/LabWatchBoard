import { parseCwaOpenDataPayload } from "./earthquake.mjs";

const CWA_REST_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/";
const CWA_REPORT_DATASETS = ["E-A0015-001", "E-A0016-001"];
const CWA_TSUNAMI_DATASET = "E-A0014-001";
const CWA_ANNUAL_CATALOGUE_DATASET = "E-A0073-001";
const REPORT_CACHE_TTL_MS = Math.max(1_000, Number(process.env.CWA_REPORT_CACHE_TTL_MS ?? 3_000) || 3_000);
const TSUNAMI_CACHE_TTL_MS = Math.max(5_000, Number(process.env.CWA_TSUNAMI_CACHE_TTL_MS ?? 15_000) || 15_000);
const REQUEST_TIMEOUT_MS = Math.max(1_000, Number(process.env.CWA_REQUEST_TIMEOUT_MS ?? 12_000) || 12_000);
const PRODUCT_CACHE_TTL_MS = Math.max(60_000, Number(process.env.CWA_PRODUCT_CACHE_TTL_MS ?? 10 * 60_000) || 10 * 60_000);
const CATALOGUE_CACHE_TTL_MS = Math.max(10 * 60_000, Number(process.env.CWA_CATALOGUE_CACHE_TTL_MS ?? 60 * 60_000) || 60 * 60_000);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const CWA_FILE_BASE = "https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/";
const CWA_PRODUCT_DATASETS = ["E-A0015-003", "E-A0015-004", "E-A0015-005"];

const RANGE_HOURS = new Map([
  ["24h", 24],
  ["7d", 24 * 7],
  ["30d", 24 * 30],
  ["90d", 24 * 90],
]);

let reportCache = null;
let reportRefresh = null;
let tsunamiCache = null;
let tsunamiRefresh = null;
let annualCatalogueCache = null;
const productCache = new Map();
const fileDatasetCache = new Map();

export class CwaOfficialError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "CwaOfficialError";
    this.statusCode = statusCode;
  }
}

function parseQuery(searchParams, now) {
  const range = String(searchParams.get("range") ?? "24h");
  if (!RANGE_HOURS.has(range)) throw new CwaOfficialError("CWA 查询时间范围无效", 400);
  const minimumMagnitude = Number(searchParams.get("min_magnitude") ?? 0);
  if (!Number.isFinite(minimumMagnitude) || minimumMagnitude < 0 || minimumMagnitude > 9) {
    throw new CwaOfficialError("CWA 最低震级必须在 0 到 9 之间", 400);
  }
  return {
    range,
    minimumMagnitude,
    startTime: now - RANGE_HOURS.get(range) * 60 * 60 * 1_000,
    endTime: now,
  };
}

async function fetchJson(url, token, fetchImpl) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Authorization: token,
          Accept: "application/json",
          "User-Agent": "ecmwf-pBoard/1.0",
        },
      });
      if (!response.ok) {
        const error = new CwaOfficialError(`CWA ${url.pathname.split("/").pop()} 返回 HTTP ${response.status}`, response.status);
        if (!RETRYABLE_STATUSES.has(response.status) || attempt > 0) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      const retryable = error?.name === "AbortError" || error instanceof TypeError || RETRYABLE_STATUSES.has(error?.statusCode);
      if (!retryable || attempt > 0) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw lastError ?? new CwaOfficialError("CWA 官方报告请求失败");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function officialUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function validUntilFromTsunami(value) {
  const candidate = typeof value === "string"
    ? value
    : value?.EndTime ?? value?.endTime ?? value?.ValidTime ?? null;
  const timestamp = Date.parse(String(candidate ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function tsunamiSeverity(reportColor, content, active) {
  if (!active) return "clear";
  const text = `${reportColor} ${content}`;
  if (/紅|红/.test(text)) return "warning";
  if (/橙|海嘯警報|海啸警报/.test(text)) return "warning";
  if (/黃|黄|注意/.test(text)) return "advisory";
  return "information";
}

export function normalizeCwaTsunamiReport(item, now = Date.now()) {
  const issuedAtTimestamp = Date.parse(String(item?.IssueTime ?? ""));
  if (!Number.isFinite(issuedAtTimestamp)) return null;
  const content = String(item?.ReportContent ?? "").trim();
  const reportColor = String(item?.ReportColor ?? "").trim();
  const validUntil = validUntilFromTsunami(item?.ValidTime);
  const validUntilTimestamp = Date.parse(String(validUntil ?? ""));
  const clearMessage = /解除|取消|無海嘯威脅|无海啸威胁|不致|未達|未达|沒有|没有|不會|不会/.test(content);
  const explicitThreat = /海嘯(?:警報|警告|威脅)|海啸(?:警报|警告|威胁)/.test(content);
  const active = explicitThreat && !clearMessage && Number.isFinite(validUntilTimestamp) && validUntilTimestamp > now;
  const info = item?.EarthquakeInfo;
  const originTimeTimestamp = Date.parse(String(info?.OriginTime ?? ""));
  return {
    id: `${String(item?.TsunamiNo ?? "unknown")}:${String(item?.ReportNo ?? issuedAtTimestamp)}`,
    tsunamiNo: String(item?.TsunamiNo ?? "").trim(),
    reportNo: String(item?.ReportNo ?? "").trim(),
    reportType: String(item?.ReportType ?? "海嘯消息").trim(),
    reportColor,
    reportContent: content,
    issuedAt: new Date(issuedAtTimestamp).toISOString(),
    validUntil,
    officialUrl: officialUrl(item?.Web),
    active,
    cancelled: clearMessage,
    severity: tsunamiSeverity(reportColor, content, active),
    earthquake: Number.isFinite(originTimeTimestamp) ? {
      originTime: new Date(originTimeTimestamp).toISOString(),
      source: String(info?.Source ?? "").trim(),
      location: String(info?.Epicenter?.Location ?? "").trim(),
      latitude: finiteNumber(info?.Epicenter?.EpicenterLatitude),
      longitude: finiteNumber(info?.Epicenter?.EpicenterLongitude),
      depthKm: finiteNumber(info?.FocalDepth),
      magnitude: finiteNumber(info?.EarthquakeMagnitude?.MagnitudeValue),
    } : null,
  };
}

function cwaIntensityRank(value) {
  const intensity = String(value ?? "").trim().replace(/\s+/g, "").replace(/級$/, "");
  return new Map([
    ["0", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4],
    ["5弱", 5], ["5-", 5], ["5強", 5.5], ["5+", 5.5],
    ["6弱", 6], ["6-", 6], ["6強", 6.5], ["6+", 6.5], ["7", 7],
  ]).get(intensity) ?? null;
}

function eventIdFromReport(item) {
  return String(item?.Web ?? "").match(/\/details\/([^/?#]+)/i)?.[1] ?? null;
}

function componentValues(value) {
  if (!value || typeof value !== "object") return null;
  return {
    unit: String(value.unit ?? "").trim(),
    eastWest: finiteNumber(value.EWComponent),
    northSouth: finiteNumber(value.NSComponent),
    vertical: finiteNumber(value.VComponent),
    intensityScaleValue: finiteNumber(value.IntScaleValue),
  };
}

export function normalizeCwaProductReport(item, datasetId) {
  const eventId = eventIdFromReport(item);
  const info = item?.EarthquakeInfo;
  const originTime = new Date(info?.OriginTime ?? "");
  if (!eventId || Number.isNaN(originTime.getTime())) return null;

  const affectedAreas = [];
  const stations = [];
  const seenStations = new Set();
  for (const area of asArray(item?.Intensity?.ShakingArea)) {
    const countyName = String(area?.CountyName ?? "").trim();
    const intensity = String(area?.AreaIntensity ?? "").trim();
    const rank = cwaIntensityRank(intensity);
    if (countyName && rank !== null && !/[、,，]/.test(countyName)) {
      affectedAreas.push({ name: countyName, intensity, rank });
    }
    for (const station of asArray(area?.EqStation)) {
      const id = String(station?.StationID ?? "").trim();
      const latitude = finiteNumber(station?.StationLatitude);
      const longitude = finiteNumber(station?.StationLongitude);
      const stationIntensity = String(station?.SeismicIntensity ?? "").trim();
      const stationRank = cwaIntensityRank(stationIntensity);
      if (!id || latitude === null || longitude === null || stationRank === null || seenStations.has(id)) continue;
      seenStations.add(id);
      stations.push({
        id,
        name: String(station?.StationName ?? id).trim() || id,
        countyName,
        latitude,
        longitude,
        intensity: stationIntensity,
        rank: stationRank,
        status: String(station?.InfoStatus ?? "").trim(),
        backAzimuth: finiteNumber(station?.BackAzimuth),
        epicenterDistanceKm: finiteNumber(station?.EpicenterDistance),
        pga: componentValues(station?.pga),
        pgv: componentValues(station?.pgv),
        waveImageUrl: officialUrl(station?.WaveImageURI),
      });
    }
  }
  affectedAreas.sort((left, right) => right.rank - left.rank || left.name.localeCompare(right.name, "zh-Hant"));
  stations.sort((left, right) => right.rank - left.rank || (left.epicenterDistanceKm ?? Number.POSITIVE_INFINITY) - (right.epicenterDistanceKm ?? Number.POSITIVE_INFINITY));

  return {
    eventId,
    datasetId,
    earthquakeNo: String(item?.EarthquakeNo ?? "").trim(),
    reportType: String(item?.ReportType ?? "地震報告").trim(),
    reportColor: String(item?.ReportColor ?? "").trim(),
    reportContent: String(item?.ReportContent ?? "").trim(),
    reportRemark: String(item?.ReportRemark ?? "").trim(),
    issuedAt: new Date(item?.IssueTime ?? originTime).toISOString(),
    validUntil: Number.isNaN(new Date(item?.ValidTime ?? "").getTime()) ? null : new Date(item.ValidTime).toISOString(),
    originTime: originTime.toISOString(),
    officialUrl: officialUrl(item?.Web),
    reportImageUrl: officialUrl(item?.ReportImageURI),
    shakeMapImageUrl: officialUrl(item?.ShakemapImageURI),
    affectedAreas,
    stations,
  };
}

async function fetchFileDataset(datasetId, token, fetchImpl, now, cacheTtlMs = PRODUCT_CACHE_TTL_MS) {
  const cached = fileDatasetCache.get(datasetId);
  if (cached?.expiresAt > now) return { payload: cached.payload, cache: "HIT" };
  const url = new URL(datasetId, CWA_FILE_BASE);
  url.searchParams.set("downloadType", "WEB");
  url.searchParams.set("format", "JSON");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Authorization: token,
        Accept: "application/json",
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
        "User-Agent": "ecmwf-pBoard/1.0",
      },
    });
    if (response.status === 304 && cached) {
      cached.expiresAt = now + cacheTtlMs;
      return { payload: cached.payload, cache: "REVALIDATED" };
    }
    if (!response.ok) throw new CwaOfficialError(`CWA ${datasetId} 文件 API 返回 HTTP ${response.status}`, response.status);
    const payload = await response.json();
    fileDatasetCache.set(datasetId, {
      payload,
      etag: response.headers.get("etag"),
      expiresAt: now + cacheTtlMs,
    });
    return { payload, cache: "MISS" };
  } finally {
    clearTimeout(timer);
  }
}

function resourceFromFilePayload(payload) {
  const resource = payload?.cwaopendata?.Dataset?.Resource;
  return asArray(resource).map((item) => ({
    description: String(item?.ResourceDesc ?? "").trim(),
    mimeType: String(item?.MimeType ?? "").trim(),
    url: officialUrl(item?.ProductURL),
  })).find((item) => item.url) ?? null;
}

function townIntensitiesFromFilePayload(payload, originTime) {
  const earthquake = payload?.cwaopendata?.Earthquake;
  const productTime = Date.parse(String(earthquake?.OriginTime ?? ""));
  if (!Number.isFinite(productTime) || Math.abs(productTime - Date.parse(originTime)) > 5_000) return [];
  return asArray(earthquake?.Intensity?.County).flatMap((county) => asArray(county?.Town).flatMap((town) => {
    const latitude = finiteNumber(town?.StationLatitude);
    const longitude = finiteNumber(town?.StationLongitude);
    const intensity = String(town?.StationIntensity ?? "").trim();
    const rank = cwaIntensityRank(intensity);
    if (latitude === null || longitude === null || rank === null) return [];
    return [{
      countyName: String(county?.CountyName ?? "").trim(),
      townName: String(town?.TownName ?? "").trim(),
      townCode: String(town?.TownCode ?? "").trim(),
      latitude,
      longitude,
      intensity,
      rank,
    }];
  }));
}

function productMatchesEvent(resource, eventId) {
  return Boolean(resource?.url && resource.description.includes(eventId));
}

function normalizeCwaCatalogueEvent(item, issueTime) {
  const originTimestamp = Date.parse(String(item?.OriginTime ?? ""));
  const latitude = finiteNumber(item?.EpicenterLatitude);
  const longitude = finiteNumber(item?.EpicenterLongitude);
  const magnitude = finiteNumber(item?.LocalMagnitude);
  if (!Number.isFinite(originTimestamp) || latitude === null || longitude === null || magnitude === null) return null;
  const originTime = new Date(originTimestamp).toISOString();
  const sourceEventId = `catalogue:${originTime.replace(/\D/g, "").slice(0, 14)}:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  const depthKm = finiteNumber(item?.FocalDepth);
  const stationCount = finiteNumber(item?.StationNumber);
  const phaseCount = finiteNumber(item?.PhaseNumber);
  const quality = String(item?.Quality ?? "").trim();
  const reviewStatus = String(item?.ReviewStatus ?? "").trim();
  return {
    id: `cwa:${sourceEventId}`,
    source: "cwa",
    sourceEventId,
    time: originTime,
    updatedAt: issueTime,
    latitude,
    longitude,
    depthKm,
    magnitude,
    magnitudeType: "ML",
    place: `台湾地区 ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    status: `CWA 年度地震目录${reviewStatus ? ` · ${reviewStatus}` : ""}`,
    intensity: null,
    intensityValue: null,
    intensityScale: null,
    reportedIntensity: null,
    felt: null,
    tsunami: false,
    alert: null,
    significance: null,
    agency: "中央气象署",
    url: "https://scweb.cwa.gov.tw/zh-tw/earthquake/data/",
    detailUrl: null,
    mechanismAvailable: false,
    shakeMapAvailable: false,
    pagerAvailable: false,
    dyfiAvailable: false,
    note: `年度目录${quality ? ` · 品质 ${quality}` : ""}${stationCount === null ? "" : ` · ${stationCount} 站`}${phaseCount === null ? "" : ` · ${phaseCount} 相位`}`,
  };
}

function normalizeCwaAnnualCatalogue(payload) {
  const dataset = payload?.cwaopendata?.Dataset;
  const catalog = dataset?.Catalog;
  const issueTimestamp = Date.parse(String(dataset?.DatasetInfo?.IssueTime ?? ""));
  const issueTime = Number.isFinite(issueTimestamp) ? new Date(issueTimestamp).toISOString() : null;
  const events = asArray(catalog?.EarthquakeInfo)
    .map((item) => normalizeCwaCatalogueEvent(item, issueTime))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
  return {
    issueTime,
    startTime: String(catalog?.CatalogInfo?.StartTime ?? "").trim() || null,
    endTime: String(catalog?.CatalogInfo?.EndTime ?? "").trim() || null,
    declaredCount: finiteNumber(catalog?.CatalogInfo?.RecordNumber),
    events,
  };
}

async function getAnnualCatalogue(token, options) {
  const now = options.now ?? Date.now();
  if (annualCatalogueCache?.expiresAt > now) return { value: annualCatalogueCache, cache: "HIT", stale: false };
  try {
    const file = await fetchFileDataset(CWA_ANNUAL_CATALOGUE_DATASET, token, options.fetchImpl ?? fetch, now, CATALOGUE_CACHE_TTL_MS);
    const normalized = normalizeCwaAnnualCatalogue(file.payload);
    annualCatalogueCache = { ...normalized, expiresAt: now + CATALOGUE_CACHE_TTL_MS };
    return { value: annualCatalogueCache, cache: file.cache, stale: false };
  } catch (error) {
    if (annualCatalogueCache) return { value: annualCatalogueCache, cache: "STALE", stale: true, error };
    throw error;
  }
}

export async function getCwaCatalogueSnapshot(searchParams, options = {}) {
  const now = options.now ?? Date.now();
  const query = parseQuery(searchParams, now);
  const token = String((options.env ?? process.env)?.CWA_API_TOKEN ?? "").trim();
  if (!token) throw new CwaOfficialError("服务端尚未配置 CWA_API_TOKEN", 503);
  const result = await getAnnualCatalogue(token, options);
  const events = result.value.events.filter((event) => {
    const eventTime = Date.parse(event.time);
    return eventTime >= query.startTime && eventTime <= query.endTime && event.magnitude >= query.minimumMagnitude;
  });
  return {
    generatedAt: new Date(now).toISOString(),
    configured: true,
    membershipProfile: "advanced",
    datasetId: CWA_ANNUAL_CATALOGUE_DATASET,
    cacheTtlMs: CATALOGUE_CACHE_TTL_MS,
    stale: result.stale,
    cache: result.cache,
    issueTime: result.value.issueTime,
    coverage: { startTime: result.value.startTime, endTime: result.value.endTime },
    declaredCount: result.value.declaredCount,
    events,
    error: result.error instanceof Error ? result.error.message : null,
  };
}

export async function getCwaProductSnapshot(searchParams, options = {}) {
  const eventId = String(searchParams.get("event_id") ?? "").trim();
  const datasetId = String(searchParams.get("dataset_id") ?? "").trim();
  if (!/^[a-z0-9._:-]{3,80}$/i.test(eventId)) throw new CwaOfficialError("CWA 地震事件编号无效", 400);
  if (!CWA_REPORT_DATASETS.includes(datasetId)) throw new CwaOfficialError("CWA 报告资料集无效", 400);
  const token = String((options.env ?? process.env)?.CWA_API_TOKEN ?? "").trim();
  if (!token) throw new CwaOfficialError("服务端尚未配置 CWA_API_TOKEN", 503);
  const now = options.now ?? Date.now();
  const cacheKey = `${datasetId}:${eventId}`;
  const cached = productCache.get(cacheKey);
  if (cached?.expiresAt > now) return { ...cached.value, cache: "HIT" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const reportUrl = new URL(datasetId, CWA_REST_BASE);
  reportUrl.searchParams.set("format", "JSON");
  reportUrl.searchParams.set("limit", "1000");
  const reportPayload = await fetchJson(reportUrl, token, fetchImpl);
  const item = asArray(reportPayload?.records?.Earthquake).find((candidate) => eventIdFromReport(candidate) === eventId);
  const report = normalizeCwaProductReport(item, datasetId);
  if (!report) throw new CwaOfficialError("CWA 官方 API 未找到该事件的详细报告", 404);

  let isoseismalImageUrl = null;
  let strongMotionArchiveUrl = null;
  let townIntensities = [];
  let fileCaches = [];
  if (datasetId === "E-A0015-001") {
    const files = await Promise.allSettled(CWA_PRODUCT_DATASETS.map((id) => fetchFileDataset(id, token, fetchImpl, now)));
    fileCaches = files.flatMap((result) => result.status === "fulfilled" ? [result.value.cache] : []);
    const isoseismal = files[0]?.status === "fulfilled" ? resourceFromFilePayload(files[0].value.payload) : null;
    const strongMotion = files[1]?.status === "fulfilled" ? resourceFromFilePayload(files[1].value.payload) : null;
    if (productMatchesEvent(isoseismal, eventId)) isoseismalImageUrl = isoseismal.url;
    if (productMatchesEvent(strongMotion, eventId)) strongMotionArchiveUrl = strongMotion.url;
    if (files[2]?.status === "fulfilled") townIntensities = townIntensitiesFromFilePayload(files[2].value.payload, report.originTime);
  }

  const value = {
    source: "cwa",
    fetchedAt: new Date(now).toISOString(),
    report,
    assets: {
      reportImageUrl: report.reportImageUrl,
      shakeMapImageUrl: report.shakeMapImageUrl,
      isoseismalImageUrl,
      strongMotionArchiveUrl,
    },
    townIntensities,
    fileCaches,
    cache: "MISS",
  };
  productCache.set(cacheKey, { value, expiresAt: now + PRODUCT_CACHE_TTL_MS });
  return value;
}

async function refreshReports(token, fetchImpl, now) {
  const settled = await Promise.allSettled(CWA_REPORT_DATASETS.map(async (datasetId) => {
    const url = new URL(datasetId, CWA_REST_BASE);
    url.searchParams.set("format", "JSON");
    url.searchParams.set("limit", "1000");
    const started = Date.now();
    const payload = await fetchJson(url, token, fetchImpl);
    return {
      datasetId,
      events: parseCwaOpenDataPayload(payload, datasetId),
      latencyMs: Date.now() - started,
    };
  }));

  const datasets = settled.map((result, index) => result.status === "fulfilled"
    ? {
        id: result.value.datasetId,
        status: "ok",
        count: result.value.events.length,
        latencyMs: result.value.latencyMs,
        error: null,
      }
    : {
        id: CWA_REPORT_DATASETS[index],
        status: "error",
        count: 0,
        latencyMs: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
  const successful = settled.flatMap((result) => result.status === "fulfilled" ? result.value.events : []);
  if (!successful.length && settled.every((result) => result.status === "rejected")) {
    throw new CwaOfficialError("CWA 显著有感与小区域有感官方 API 均不可用");
  }

  const events = [...new Map(successful.map((event) => [event.id, event])).values()]
    .sort((left, right) => Date.parse(right.updatedAt ?? right.time) - Date.parse(left.updatedAt ?? left.time));
  reportCache = {
    fetchedAt: now,
    expiresAt: now + REPORT_CACHE_TTL_MS,
    events,
    datasets,
  };
  return reportCache;
}

async function getReports(token, options) {
  const now = options.now ?? Date.now();
  if (reportCache && reportCache.expiresAt > now) return { value: reportCache, cache: "HIT", stale: false };
  if (!reportRefresh) {
    reportRefresh = refreshReports(token, options.fetchImpl ?? fetch, now)
      .finally(() => {
        reportRefresh = null;
      });
  }
  try {
    return { value: await reportRefresh, cache: "MISS", stale: false };
  } catch (error) {
    if (reportCache) return { value: reportCache, cache: "STALE", stale: true, error };
    throw error;
  }
}

async function refreshTsunami(token, fetchImpl, now) {
  const url = new URL(CWA_TSUNAMI_DATASET, CWA_REST_BASE);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("limit", "100");
  const started = Date.now();
  const payload = await fetchJson(url, token, fetchImpl);
  const reports = asArray(payload?.records?.Tsunami)
    .map((item) => normalizeCwaTsunamiReport(item, now))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt));

  const latestByEpisode = new Map();
  for (const report of reports) {
    const episodeKey = report.tsunamiNo || report.id;
    if (!latestByEpisode.has(episodeKey)) latestByEpisode.set(episodeKey, report);
  }
  const activeReport = [...latestByEpisode.values()]
    .filter((report) => report.active)
    .sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt))[0] ?? null;
  tsunamiCache = {
    fetchedAt: now,
    expiresAt: now + TSUNAMI_CACHE_TTL_MS,
    latencyMs: Date.now() - started,
    reports,
    latestReport: reports[0] ?? null,
    activeReport,
  };
  return tsunamiCache;
}

async function getTsunami(token, options) {
  const now = options.now ?? Date.now();
  if (tsunamiCache && tsunamiCache.expiresAt > now) return { value: tsunamiCache, cache: "HIT", stale: false };
  if (!tsunamiRefresh) {
    tsunamiRefresh = refreshTsunami(token, options.fetchImpl ?? fetch, now)
      .finally(() => {
        tsunamiRefresh = null;
      });
  }
  try {
    return { value: await tsunamiRefresh, cache: "MISS", stale: false };
  } catch (error) {
    if (tsunamiCache) return { value: tsunamiCache, cache: "STALE", stale: true, error };
    throw error;
  }
}

export async function getCwaTsunamiSnapshot(options = {}) {
  const now = options.now ?? Date.now();
  const token = String((options.env ?? process.env)?.CWA_API_TOKEN ?? "").trim();
  if (!token) throw new CwaOfficialError("服务端尚未配置 CWA_API_TOKEN", 503);
  const result = await getTsunami(token, options);
  return {
    generatedAt: new Date(now).toISOString(),
    configured: true,
    membershipProfile: "advanced",
    datasetId: CWA_TSUNAMI_DATASET,
    cacheTtlMs: TSUNAMI_CACHE_TTL_MS,
    recommendedPollMs: 30_000,
    stale: result.stale,
    cache: result.cache,
    latencyMs: result.value.latencyMs,
    activeReport: result.value.activeReport,
    latestReport: result.value.latestReport,
    reports: result.value.reports,
    error: result.error instanceof Error ? result.error.message : null,
  };
}

export async function getCwaOfficialSnapshot(searchParams, options = {}) {
  const now = options.now ?? Date.now();
  const query = parseQuery(searchParams, now);
  const token = String((options.env ?? process.env)?.CWA_API_TOKEN ?? "").trim();
  if (!token) throw new CwaOfficialError("服务端尚未配置 CWA_API_TOKEN", 503);

  const result = await getReports(token, options);
  const events = result.value.events.filter((event) => {
    const eventTime = Date.parse(event.time);
    return eventTime >= query.startTime && eventTime <= query.endTime && event.magnitude >= query.minimumMagnitude;
  });
  return {
    generatedAt: new Date(now).toISOString(),
    configured: true,
    membershipProfile: "advanced",
    cacheTtlMs: REPORT_CACHE_TTL_MS,
    recommendedMinimumPollMs: 1_000,
    stale: result.stale,
    cache: result.cache,
    events,
    datasets: result.value.datasets,
    error: result.error instanceof Error ? result.error.message : null,
  };
}

export function clearCwaOfficialCache() {
  reportCache = null;
  reportRefresh = null;
  tsunamiCache = null;
  tsunamiRefresh = null;
  annualCatalogueCache = null;
  productCache.clear();
  fileDatasetCache.clear();
}
