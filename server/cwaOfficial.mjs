import { parseCwaOpenDataPayload } from "./earthquake.mjs";

const CWA_REST_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/";
const CWA_REPORT_DATASETS = ["E-A0015-001", "E-A0016-001"];
const REPORT_CACHE_TTL_MS = Math.max(1_000, Number(process.env.CWA_REPORT_CACHE_TTL_MS ?? 3_000) || 3_000);
const REQUEST_TIMEOUT_MS = Math.max(1_000, Number(process.env.CWA_REQUEST_TIMEOUT_MS ?? 12_000) || 12_000);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const RANGE_HOURS = new Map([
  ["24h", 24],
  ["7d", 24 * 7],
  ["30d", 24 * 30],
  ["90d", 24 * 90],
]);

let reportCache = null;
let reportRefresh = null;

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
}
