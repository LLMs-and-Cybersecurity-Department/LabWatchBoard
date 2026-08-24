import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import * as XLSX from "xlsx";
import { ProxyAgent } from "undici";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_ENDPOINTS = ["wss://ws.fanstudio.tech/all"];
const DEFAULT_OFFICIAL_URL = "https://data.earthquake.cn/datashare/report.shtml?PAGEID=ground_motion_list";
const NSTI_HTTP_PROXY_URL = String(process.env.NSTI_HTTP_PROXY_URL ?? process.env.CENC_HTTP_PROXY_URL ?? "").trim();
const CENC_WEBSOCKET_PROXY_URL = String(process.env.CENC_WEBSOCKET_PROXY_URL ?? process.env.CENC_HTTP_PROXY_URL ?? process.env.NSTI_HTTP_PROXY_URL ?? "").trim();
const FANSTUDIO_APP_ID = String(process.env.FANSTUDIO_APP_ID ?? process.env.CENC_FANSTUDIO_APP_ID ?? "").trim();
const FANSTUDIO_API_KEY = String(process.env.FANSTUDIO_API_KEY ?? process.env.CENC_FANSTUDIO_API_KEY ?? "").trim();
const DEFAULT_CACHE_PATH = process.env.CENC_INTENSITY_CACHE_PATH ?? path.join(ROOT, ".runtime", "cenc-intensity.json");
const CONNECT_TIMEOUT_MS = 8_000;
const RESPONSE_TIMEOUT_MS = 12_000;
const OFFICIAL_TIMEOUT_MS = 75_000;
const FAN_LIST_INTERVAL_MS = 15_000;
const OFFICIAL_INTERVAL_MS = 5 * 60_000;
const OFFICIAL_LOOKBACK_DAYS = 30;
const MAX_OFFICIAL_EXPORT_BYTES = 5 * 1024 * 1024;
const MAX_DETAIL_CACHE = 24;
const MAX_LIST_REPORTS = 48;

let nstiProxyAgent = null;
let nstiProxyConfigError = null;
if (NSTI_HTTP_PROXY_URL) {
  try {
    const proxyUrl = new URL(NSTI_HTTP_PROXY_URL);
    if (!/^https?:$/.test(proxyUrl.protocol)) throw new Error("NSTI_HTTP_PROXY_URL 只支持 HTTP/HTTPS 代理；SOCKS5 请先提供 HTTP 转发端口");
    nstiProxyAgent = new ProxyAgent(proxyUrl.toString());
  } catch (error) {
    nstiProxyConfigError = error instanceof Error ? error.message : String(error);
  }
}

function nstiFetchOptions(options) {
  if (nstiProxyConfigError) throw new Error(nstiProxyConfigError);
  return nstiProxyAgent ? { ...options, dispatcher: nstiProxyAgent } : options;
}

function nstiEgressMode() {
  if (nstiProxyConfigError) return "config-error";
  return nstiProxyAgent ? "http-proxy" : "direct";
}

function createWebSocketProxyAgent(proxyUrl) {
  if (!proxyUrl) return { agent: null, error: null };
  try {
    const parsed = new URL(proxyUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error("CENC_WEBSOCKET_PROXY_URL 只支持 HTTP/HTTPS 或 mixed 代理端口");
    }
    return { agent: new HttpsProxyAgent(parsed), error: null };
  } catch (error) {
    return { agent: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function textContent(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reportKey(row) {
  return `${row.originTime}|${row.latitude}|${row.longitude}|${row.magnitude}|${row.place}`;
}

function reportIdentifier(row) {
  if (row.eventId) return `NEDC-${row.eventId.replace(/[^0-9A-Za-z_.-]/g, "").slice(0, 48)}`;
  const timestamp = row.originTime.replace(/\D/g, "").slice(0, 14);
  return `NEDC-${timestamp}-${row.latitude.toFixed(2)}-${row.longitude.toFixed(2)}`;
}

function parseVisibleRow(cells) {
  if (cells.length < 13) return null;
  const latitude = number(cells[1]);
  const longitude = number(cells[2]);
  const magnitude = number(cells[4]);
  const intensity = number(cells[9]);
  if (!cells[0] || latitude === null || longitude === null || magnitude === null || intensity === null) return null;
  return {
    eventId: null,
    originTime: cells[0],
    latitude,
    longitude,
    depthKm: number(cells[3]),
    magnitude,
    place: cells[5],
    networkCode: cells[6],
    stationCode: cells[7],
    stationName: cells[7],
    stationLatitude: null,
    stationLongitude: null,
    distanceKm: number(cells[8]),
    intensity,
    site: cells[10],
    pgaGal: number(cells[11]),
    pgvCms: number(cells[12]),
  };
}

function parseExportRow(cells) {
  if (cells.length < 17) return null;
  const latitude = number(cells[2]);
  const longitude = number(cells[3]);
  const magnitude = number(cells[6]);
  const intensity = number(cells[13]);
  if (!cells[1] || latitude === null || longitude === null || magnitude === null || intensity === null) return null;
  return {
    eventId: textContent(cells[0]) || null,
    originTime: textContent(cells[1]),
    latitude,
    longitude,
    depthKm: number(cells[4]),
    magnitude,
    place: textContent(cells[5]),
    networkCode: textContent(cells[7]),
    stationCode: textContent(cells[8]),
    stationName: textContent(cells[9]) || textContent(cells[8]),
    stationLatitude: number(cells[10]),
    stationLongitude: number(cells[11]),
    distanceKm: number(cells[12]),
    intensity,
    pgaGal: number(cells[14]),
    pgvCms: number(cells[15]),
    site: textContent(cells[16]),
  };
}

function buildOfficialGroundMotionResult(rows, fetchedAt) {
  if (!rows.length) throw new Error("国家地震科学数据中心公开页没有返回强震动记录");

  const groups = new Map();
  for (const row of rows) {
    const key = reportKey(row);
    if (!groups.has(key)) groups.set(key, { event: row, stations: [] });
    groups.get(key).stations.push(row);
  }
  const reports = [...groups.values()].sort((a, b) => b.event.originTime.localeCompare(a.event.originTime));
  const detailEnvelopes = new Map();
  const list = reports.map(({ event, stations }) => {
    const id = reportIdentifier(event);
    const summary = {
      id,
      uniEventId: id,
      oriTime: event.originTime,
      locName: event.place,
      epiLat: event.latitude,
      epiLon: event.longitude,
      magnitude: event.magnitude,
      focDepth: event.depthKm,
      gmtCreate: event.originTime,
      stationCount: stations.length,
      maxIntensity: Math.max(...stations.map((station) => station.intensity)),
    };
    detailEnvelopes.set(id, {
      type: "cencirdetail_response",
      Data: {
        ...summary,
        instrument_intensity_json: [],
        station_metrics_json: stations.map((station) => {
          const metric = {
            stID: station.stationCode,
            stName: station.stationName || station.stationCode,
            NetCode: station.networkCode,
            INT: station.intensity,
            PGA: station.pgaGal,
            PGV: station.pgvCms,
            Dist: station.distanceKm,
            Site: station.site,
          };
          if (station.stationLatitude !== null && station.stationLongitude !== null) {
            metric.stla = station.stationLatitude;
            metric.stlo = station.stationLongitude;
          }
          return metric;
        }).sort((a, b) => b.INT - a.INT),
        contour_geojson: null,
      },
    });
    return summary;
  });
  return {
    fetchedAt,
    listEnvelope: { type: "cencirlist_response", Data: list },
    detailEnvelopes,
  };
}

export function parseOfficialGroundMotionHtml(html, fetchedAt = Date.now()) {
  const table = String(html).match(/<table[^>]*class=["'][^"']*cls-data-table[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((match) => {
    const cells = [...match[1].matchAll(/<td\b[^>]*class=["'][^"']*cls-data-td-listform[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => textContent(cell[1]));
    const row = parseVisibleRow(cells);
    return row ? [row] : [];
  });
  return buildOfficialGroundMotionResult(rows, fetchedAt);
}

export function parseOfficialGroundMotionWorkbook(buffer, fetchedAt = Date.now()) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("国家地震科学数据中心导出文件没有工作表");
  const cells = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const header = Array.isArray(cells[0]) ? cells[0].map((value) => textContent(value)) : [];
  if (!header.includes("台站纬度") || !header.includes("台站经度")) {
    throw new Error("国家地震科学数据中心导出文件缺少台站坐标列");
  }
  const rows = cells.slice(1).flatMap((values) => {
    const row = parseExportRow(Array.isArray(values) ? values : []);
    return row ? [row] : [];
  });
  return buildOfficialGroundMotionResult(rows, fetchedAt);
}

function listRowFingerprint(row) {
  const time = String(row?.oriTime ?? row?.originTime ?? row?.gmtCreate ?? "").replace(/\D/g, "").slice(0, 12);
  const latitude = number(row?.epiLat ?? row?.latitude);
  const longitude = number(row?.epiLon ?? row?.longitude);
  if (!time || latitude === null || longitude === null) return `id:${String(row?.id ?? row?.uniEventId ?? "")}`;
  return `${time}:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
}

export function mergeCencListEnvelopes(currentEnvelope, incomingEnvelope, { preferIncoming = true } = {}) {
  const current = Array.isArray(currentEnvelope?.Data) ? currentEnvelope.Data : [];
  const incoming = Array.isArray(incomingEnvelope?.Data) ? incomingEnvelope.Data : [];
  const merged = new Map();
  for (const row of current) merged.set(listRowFingerprint(row), row);
  for (const row of incoming) {
    const key = listRowFingerprint(row);
    const existing = merged.get(key);
    merged.set(key, preferIncoming
      ? { ...existing, ...row }
      : { ...row, ...existing });
  }
  const rows = [...merged.values()]
    .sort((a, b) => String(b.oriTime ?? b.gmtCreate ?? "").localeCompare(String(a.oriTime ?? a.gmtCreate ?? "")))
    .slice(0, MAX_LIST_REPORTS);
  return { type: "cencirlist_response", Data: rows };
}

function chinaDate(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function officialQueryUrl(baseUrl, now) {
  const url = new URL(baseUrl);
  const end = now + 24 * 60 * 60 * 1000;
  const begin = now - OFFICIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  url.searchParams.set("DISPLAY_TYPE", "1");
  url.searchParams.set("PAGEID", "ground_motion_list");
  url.searchParams.set("begtime", chinaDate(begin));
  url.searchParams.set("endtime", chinaDate(end));
  url.searchParams.set("minM", "4");
  url.searchParams.set("maxM", "10");
  return url;
}

function officialExportParams(html, queryUrl) {
  const encoded = String(html).match(/<span[^>]+id=["']ground_motion_list_url_id["'][^>]+value=["']([^"']+)["']/i)?.[1];
  const source = encoded ? new URL(textContent(encoded), queryUrl) : new URL(queryUrl);
  source.searchParams.set("DISPLAY_TYPE", "3");
  source.searchParams.set("COMPONENTIDS", "report1");
  source.searchParams.set("INCLUDE_APPLICATIONIDS", "report1");
  return source.searchParams;
}

function responseCookie(response) {
  const raw = typeof response.headers?.getSetCookie === "function"
    ? response.headers.getSetCookie().join("; ")
    : response.headers?.get?.("set-cookie") ?? "";
  return raw.match(/JSESSIONID=[^;,]+/)?.[0] ?? "";
}

function reportId(envelope) {
  const value = envelope?.Data && typeof envelope.Data === "object" ? envelope.Data : envelope;
  return value?.id === undefined || value?.id === null ? null : String(value.id);
}

function firstListId(envelope) {
  const rows = Array.isArray(envelope?.Data) ? envelope.Data : [];
  const id = rows[0]?.id;
  return id === undefined || id === null ? null : String(id);
}

function reportTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const chinaTime = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/);
  const parsed = chinaTime
    ? Date.parse(`${chinaTime[1]}-${chinaTime[2].padStart(2, "0")}-${chinaTime[3].padStart(2, "0")}T${chinaTime[4].padStart(2, "0")}:${chinaTime[5]}:${chinaTime[6] ?? "00"}+08:00`)
    : Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function newestReportTimestamp(envelope) {
  const rows = Array.isArray(envelope?.Data) ? envelope.Data : [];
  const timestamps = rows
    .map((row) => reportTimestamp(row?.oriTime ?? row?.originTime ?? row?.gmtCreate))
    .filter((value) => value !== null);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function validEnvelope(value, type) {
  return value && typeof value === "object" && value.type === type;
}

function stationLocationKeys(row) {
  const code = String(row?.stID ?? "").trim();
  const network = String(row?.NetCode ?? row?.networkCode ?? "").trim();
  return code ? [network ? `${network}:${code}` : "", code].filter(Boolean) : [];
}

function coordinateStationRows(envelope) {
  const data = envelope?.Data;
  if (!data || typeof data !== "object") return [];
  const rows = [
    ...(Array.isArray(data.instrument_intensity_json) ? data.instrument_intensity_json : []),
    ...(Array.isArray(data.station_metrics_json) ? data.station_metrics_json : []),
  ];
  return rows.filter((row) => row && typeof row === "object" && number(row.stla) !== null && number(row.stlo) !== null);
}

export function mergeOfficialDetailEnvelope(officialEnvelope, existingEnvelope = null, stationLocations = new Map()) {
  const official = officialEnvelope?.Data;
  if (!official || typeof official !== "object") return officialEnvelope;
  const locations = new Map(stationLocations);
  for (const row of coordinateStationRows(existingEnvelope)) {
    for (const key of stationLocationKeys(row)) locations.set(key, row);
  }
  const stationMetrics = (Array.isArray(official.station_metrics_json) ? official.station_metrics_json : []).map((metric) => {
    const location = stationLocationKeys(metric).map((key) => locations.get(key)).find(Boolean);
    return location ? { ...location, ...metric, stla: location.stla, stlo: location.stlo } : metric;
  });
  const previousData = existingEnvelope?.Data && typeof existingEnvelope.Data === "object" ? existingEnvelope.Data : {};
  const previousInstrumentRows = Array.isArray(previousData.instrument_intensity_json)
    ? previousData.instrument_intensity_json
    : [];
  return {
    ...officialEnvelope,
    Data: {
      ...previousData,
      ...official,
      station_metrics_json: stationMetrics,
      instrument_intensity_json: previousInstrumentRows.length ? previousInstrumentRows : official.instrument_intensity_json,
      contour_geojson: official.contour_geojson ?? previousData.contour_geojson ?? null,
    },
  };
}

export class CencIntensityBridge {
  constructor({
    WebSocketImpl = WebSocket,
    fetchImpl = globalThis.fetch,
    endpoints = DEFAULT_ENDPOINTS,
    officialUrl = DEFAULT_OFFICIAL_URL,
    cachePath = DEFAULT_CACHE_PATH,
    persist = true,
    now = () => Date.now(),
    webSocketProxyUrl = CENC_WEBSOCKET_PROXY_URL,
    fanstudioAppId = FANSTUDIO_APP_ID,
    fanstudioApiKey = FANSTUDIO_API_KEY,
  } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.fetchImpl = fetchImpl;
    this.endpoints = endpoints;
    this.officialUrl = officialUrl;
    this.cachePath = cachePath;
    this.persistEnabled = persist;
    this.now = now;
    this.webSocketProxyUrl = String(webSocketProxyUrl ?? "").trim();
    const proxy = createWebSocketProxyAgent(this.webSocketProxyUrl);
    this.webSocketProxyAgent = proxy.agent;
    this.webSocketProxyConfigError = proxy.error;
    this.fanstudioAppId = String(fanstudioAppId ?? "").trim();
    this.fanstudioApiKey = String(fanstudioApiKey ?? "").trim();
    this.credentialsConfigured = Boolean(this.fanstudioAppId && this.fanstudioApiKey);
    this.credentialsIncomplete = Boolean(this.fanstudioAppId || this.fanstudioApiKey) && !this.credentialsConfigured;
    this.authRequired = false;
    this.authState = this.credentialsConfigured ? "pending" : "not-configured";
    this.state = "connecting";
    this.endpointIndex = 0;
    this.retry = 0;
    this.lastError = null;
    this.lastGoodAt = 0;
    this.lastLatencyMs = null;
    this.lastOfficialAt = 0;
    this.lastFanAt = 0;
    this.activeProvider = null;
    this.lastListQueryAt = 0;
    this.listEnvelope = null;
    this.details = new Map();
    this.stationLocations = new Map();
    this.requestedId = null;
    this.detailRequestedAt = new Map();
    this.socket = null;
    this.started = false;
    this.stopped = false;
    this.startPromise = null;
    this.connectTimer = null;
    this.responseTimer = null;
    this.listTimer = null;
    this.officialTimer = null;
    this.officialRefreshPromise = null;
    this.retryTimer = null;
    this.persistPromise = Promise.resolve();
    this.officialEgressMode = nstiEgressMode();
  }

  hasData() {
    return Boolean(this.listEnvelope || this.details.size);
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      await this.loadCache();
      this.started = true;
      this.stopped = false;
      if (this.fetchImpl && this.officialUrl) {
        void this.refreshOfficial();
        this.officialTimer = setInterval(() => void this.refreshOfficial(), OFFICIAL_INTERVAL_MS);
      }
      if (this.WebSocketImpl && this.endpoints.length) {
        if (this.webSocketProxyConfigError) {
          this.lastError = this.webSocketProxyConfigError;
          this.state = this.hasData() ? "stale" : "error";
        } else {
          this.connect();
        }
      } else if (!this.hasData()) {
        this.state = "error";
        this.lastError ||= "当前 Node.js 环境没有可用的 CENC 数据连接方式";
      }
    })();
    return this.startPromise;
  }

  officialHealthy() {
    return this.lastOfficialAt > 0 && this.now() - this.lastOfficialAt <= OFFICIAL_INTERVAL_MS + OFFICIAL_TIMEOUT_MS;
  }

  async refreshOfficial() {
    if (this.officialRefreshPromise) return this.officialRefreshPromise;
    this.officialRefreshPromise = this.refreshOfficialNow();
    try {
      return await this.officialRefreshPromise;
    } finally {
      this.officialRefreshPromise = null;
    }
  }

  async refreshOfficialNow() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OFFICIAL_TIMEOUT_MS);
    const started = this.now();
    try {
      const queryUrl = officialQueryUrl(this.officialUrl, this.now());
      const response = await this.fetchImpl(queryUrl, nstiFetchOptions({
        signal: controller.signal,
        headers: { Accept: "text/html", "User-Agent": "ecmwf-pBoard/1.0 CENC ground-motion relay" },
      }));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      let parsed = parseOfficialGroundMotionHtml(html, this.now());
      try {
        const exportResponse = await this.fetchImpl(new URL("/datashare/report.shtml", queryUrl), nstiFetchOptions({
          method: "POST",
          body: officialExportParams(html, queryUrl),
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.ms-excel, application/octet-stream",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Cookie: responseCookie(response),
            "User-Agent": "ecmwf-pBoard/1.0 CENC ground-motion relay",
          },
        }));
        if (!exportResponse.ok) throw new Error(`HTTP ${exportResponse.status}`);
        const advertisedBytes = Number(exportResponse.headers?.get?.("content-length"));
        if (Number.isFinite(advertisedBytes) && advertisedBytes > MAX_OFFICIAL_EXPORT_BYTES) {
          throw new Error(`坐标导出超过 ${MAX_OFFICIAL_EXPORT_BYTES} 字节安全上限`);
        }
        const exportBuffer = await exportResponse.arrayBuffer();
        if (exportBuffer.byteLength > MAX_OFFICIAL_EXPORT_BYTES) {
          throw new Error(`坐标导出超过 ${MAX_OFFICIAL_EXPORT_BYTES} 字节安全上限`);
        }
        parsed = parseOfficialGroundMotionWorkbook(exportBuffer, this.now());
      } catch (error) {
        this.lastError = `CENC 官方坐标导出暂不可用，已保留公开列表：${error instanceof Error ? error.message : String(error)}`;
      }
      this.listEnvelope = mergeCencListEnvelopes(this.listEnvelope, parsed.listEnvelope, { preferIncoming: false });
      for (const [id, envelope] of parsed.detailEnvelopes) {
        const merged = mergeOfficialDetailEnvelope(envelope, this.details.get(id), this.stationLocations);
        this.rememberStationLocations(merged);
        this.details.delete(id);
        this.details.set(id, merged);
      }
      for (const [id, envelope] of this.details) {
        this.details.set(id, mergeOfficialDetailEnvelope(envelope, envelope, this.stationLocations));
      }
      while (this.details.size > MAX_DETAIL_CACHE) this.details.delete(this.details.keys().next().value);
      this.lastLatencyMs = Math.max(0, this.now() - started);
      this.lastOfficialAt = this.now();
      this.lastGoodAt = this.lastOfficialAt;
      if (this.now() - this.lastFanAt > FAN_LIST_INTERVAL_MS + RESPONSE_TIMEOUT_MS) this.activeProvider = "NEDC";
      this.state = this.authRequired && this.lastFanAt === 0 ? "stale" : "online";
      if (!this.authRequired && [...parsed.detailEnvelopes.values()].some((envelope) => coordinateStationRows(envelope).length)) this.lastError = null;
      const selectedId = this.requestedId || firstListId(this.listEnvelope);
      if (selectedId) this.requestedId = selectedId;
      this.queuePersist();
    } catch (error) {
      this.lastError = `国家地震科学数据中心强震动页不可用：${error instanceof Error ? error.message : String(error)}`;
      if (!this.officialHealthy() && this.lastFanAt === 0) this.state = this.hasData() ? "stale" : "error";
    } finally {
      clearTimeout(timer);
    }
  }

  async loadCache() {
    if (!this.persistEnabled) return;
    try {
      const payload = JSON.parse(await readFile(this.cachePath, "utf8"));
      if (validEnvelope(payload?.listEnvelope, "cencirlist_response")) this.listEnvelope = payload.listEnvelope;
      for (const [id, envelope] of Array.isArray(payload?.details) ? payload.details : []) {
        if (validEnvelope(envelope, "cencirdetail_response") && reportId(envelope) === String(id)) {
          this.details.set(String(id), envelope);
          this.rememberStationLocations(envelope);
        }
      }
      for (const row of Array.isArray(payload?.stationLocations) ? payload.stationLocations : []) {
        if (!row || typeof row !== "object" || number(row.stla) === null || number(row.stlo) === null) continue;
        for (const key of stationLocationKeys(row)) this.stationLocations.set(key, row);
      }
      this.lastGoodAt = Number(payload?.lastGoodAt) || 0;
      if (this.hasData()) this.state = "stale";
    } catch {
      // A missing or invalid snapshot is a normal first start.
    }
  }

  queuePersist() {
    if (!this.persistEnabled || !this.hasData()) return;
    const payload = {
      version: 1,
      updatedAt: new Date(this.now()).toISOString(),
      lastGoodAt: this.lastGoodAt,
      listEnvelope: this.listEnvelope,
      details: [...this.details.entries()],
      stationLocations: [...new Set(this.stationLocations.values())],
    };
    this.persistPromise = this.persistPromise.then(async () => {
      await mkdir(path.dirname(this.cachePath), { recursive: true });
      const temporaryPath = `${this.cachePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(payload), "utf8");
      await rename(temporaryPath, this.cachePath);
    }).catch(() => undefined);
  }

  clearConnectionTimers() {
    clearTimeout(this.connectTimer);
    clearTimeout(this.responseTimer);
    clearInterval(this.listTimer);
    this.connectTimer = null;
    this.responseTimer = null;
    this.listTimer = null;
  }

  rememberStationLocations(envelope) {
    for (const row of coordinateStationRows(envelope)) {
      for (const key of stationLocationKeys(row)) this.stationLocations.set(key, row);
    }
  }

  send(payload) {
    if (this.socket?.readyState !== (this.WebSocketImpl.OPEN ?? 1)) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  queryList() {
    if (!this.send({ type: "cencirlist" })) return;
    this.lastListQueryAt = this.now();
    clearTimeout(this.responseTimer);
    this.responseTimer = setTimeout(() => {
      this.lastError = "CENC 烈度列表在 12 秒内没有返回业务数据";
      this.socket?.close();
    }, RESPONSE_TIMEOUT_MS);
  }

  authenticate() {
    if (!this.credentialsConfigured) return false;
    this.authState = "pending";
    return this.send({ type: "auth", appId: this.fanstudioAppId, key: this.fanstudioApiKey });
  }

  startBusinessPolling() {
    this.queryList();
    if (this.requestedId) this.queryDetail(this.requestedId, true);
    clearInterval(this.listTimer);
    this.listTimer = setInterval(() => this.queryList(), FAN_LIST_INTERVAL_MS);
  }

  queryDetail(id, force = false) {
    if (!id) return;
    this.requestedId = String(id);
    const requestedAt = this.detailRequestedAt.get(this.requestedId) ?? 0;
    const minimumInterval = this.details.has(this.requestedId) ? FAN_LIST_INTERVAL_MS : RESPONSE_TIMEOUT_MS;
    if (!force && this.now() - requestedAt < minimumInterval) return;
    if (!this.send({ type: "cencirdetail", id: this.requestedId })) return;
    this.detailRequestedAt.set(this.requestedId, this.now());
  }

  acceptMessage(event) {
    let envelope;
    try {
      envelope = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (["auth_success", "auth_ok", "authenticated"].includes(envelope?.type)) {
      this.authRequired = false;
      this.authState = "authenticated";
      this.lastError = null;
      this.startBusinessPolling();
      return;
    }
    if (envelope?.type === "auth_required") {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
      clearInterval(this.listTimer);
      this.listTimer = null;
      this.authRequired = true;
      this.authState = this.credentialsConfigured ? "failed" : "not-configured";
      this.lastError = this.credentialsConfigured
        ? "FAN Studio 已要求 CENC 烈度鉴权，但当前 appId/key 未通过，请检查服务端配置"
        : "FAN Studio 新 CENC 实时源在线，但需要 API Key：请配置 FANSTUDIO_APP_ID 与 FANSTUDIO_API_KEY";
      this.state = this.hasData() ? "stale" : "error";
      return;
    }
    if (envelope?.type === "auth_fail") {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
      clearInterval(this.listTimer);
      this.listTimer = null;
      this.authRequired = true;
      this.authState = "failed";
      this.lastError = `FAN Studio CENC 烈度鉴权失败：${String(envelope.message ?? "appId/key 无效")}`;
      this.state = this.hasData() ? "stale" : "error";
      return;
    }
    if (validEnvelope(envelope, "cencirlist_response")) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
      this.listEnvelope = mergeCencListEnvelopes(this.listEnvelope, envelope);
      this.lastLatencyMs = this.lastListQueryAt ? Math.max(0, this.now() - this.lastListQueryAt) : null;
      this.markOnline();
      const selectedId = this.requestedId || firstListId(envelope);
      if (selectedId) this.queryDetail(selectedId, true);
      this.queuePersist();
      return;
    }
    if (validEnvelope(envelope, "cencirdetail_response")) {
      const id = reportId(envelope);
      if (!id) return;
      envelope = mergeOfficialDetailEnvelope(envelope, this.details.get(id), this.stationLocations);
      this.rememberStationLocations(envelope);
      this.details.delete(id);
      this.details.set(id, envelope);
      while (this.details.size > MAX_DETAIL_CACHE) this.details.delete(this.details.keys().next().value);
      this.markOnline();
      this.queuePersist();
    }
  }

  markOnline() {
    this.state = "online";
    this.lastError = null;
    this.authRequired = false;
    if (this.credentialsConfigured) this.authState = "authenticated";
    this.lastGoodAt = this.now();
    this.lastFanAt = this.lastGoodAt;
    this.activeProvider = "FAN";
    this.retry = 0;
  }

  connect() {
    if (this.stopped || !this.started) return;
    this.clearConnectionTimers();
    this.state = this.officialHealthy() ? "online" : this.hasData() ? "stale" : this.lastError ? "error" : "connecting";
    const endpoint = this.endpoints[this.endpointIndex];
    const socket = new this.WebSocketImpl(endpoint, this.webSocketProxyAgent ? { agent: this.webSocketProxyAgent } : undefined);
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      this.lastError = "CENC 烈度中继连接超时";
      socket.close();
    }, CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (this.credentialsIncomplete) {
        this.authRequired = true;
        this.authState = "failed";
        this.lastError = "FAN Studio CENC 烈度鉴权配置不完整：appId 与 key 必须同时配置";
        this.state = this.hasData() ? "stale" : "error";
      } else if (!this.authenticate()) {
        this.queryList();
      }
    };
    socket.onmessage = (event) => this.acceptMessage(event);
    socket.onerror = () => {
      this.lastError = "CENC 烈度中继连接失败";
      // A transport error is followed by `close` in both browser and Node
      // WebSocket implementations. Calling close synchronously from Undici's
      // error callback can dispatch the same error recursively and terminate
      // the entire dashboard process.
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.clearConnectionTimers();
      this.socket = null;
      if (this.stopped) return;
      this.state = this.officialHealthy() ? "online" : this.hasData() ? "stale" : "error";
      this.lastError ||= "CENC 烈度中继已断开";
      this.endpointIndex = (this.endpointIndex + 1) % this.endpoints.length;
      const delay = Math.min(20_000, 900 * 2 ** this.retry);
      this.retry += 1;
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  async snapshot(id = null) {
    await this.start();
    if (id) this.queryDetail(String(id));
    const selectedId = id ? String(id) : this.requestedId || firstListId(this.listEnvelope);
    const detailEnvelope = selectedId ? this.details.get(selectedId) ?? null : this.details.values().next().value ?? null;
    const liveThroughOfficial = this.officialHealthy();
    const realtimeHealthy = !this.authRequired && this.lastFanAt > 0 && this.now() - this.lastFanAt <= FAN_LIST_INTERVAL_MS + RESPONSE_TIMEOUT_MS;
    const authenticationBlocking = this.authRequired && !realtimeHealthy;
    const effectiveState = authenticationBlocking
      ? this.hasData() ? "stale" : "error"
      : this.state === "online" && !liveThroughOfficial && this.now() - this.lastGoodAt > FAN_LIST_INTERVAL_MS + RESPONSE_TIMEOUT_MS
      ? "stale"
      : this.state;
    const provider = realtimeHealthy
      ? "FAN CENC-IR 后端中继"
      : authenticationBlocking
        ? "FAN CENC-IR 实时中继（待 API Key）+ 国家地震科学数据中心延迟页"
      : "国家地震科学数据中心强震动参数";
    const latestReportAt = newestReportTimestamp(this.listEnvelope);
    return {
      provider,
      fetchedAt: new Date(this.now()).toISOString(),
      state: effectiveState,
      endpoint: provider.startsWith("FAN") ? this.endpoints[this.endpointIndex] : this.officialUrl,
      officialEgressMode: this.officialEgressMode,
      webSocketEgressMode: this.webSocketProxyConfigError ? "config-error" : this.webSocketProxyAgent ? "http-proxy" : "direct",
      authRequired: this.authRequired,
      authState: this.authState,
      credentialsConfigured: this.credentialsConfigured,
      latestReportAt: latestReportAt === null ? null : new Date(latestReportAt).toISOString(),
      latestReportAgeMs: latestReportAt === null ? null : Math.max(0, this.now() - latestReportAt),
      latencyMs: this.lastLatencyMs,
      lastGoodAt: this.lastGoodAt || null,
      cache: effectiveState === "online" ? "LIVE" : this.hasData() ? "PERSISTED" : "EMPTY",
      error: effectiveState === "online" ? null : this.lastError,
      listEnvelope: this.listEnvelope,
      detailEnvelope,
    };
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.officialTimer);
    this.clearConnectionTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

const cencBridge = new CencIntensityBridge();

export function startCencIntensityMonitor() {
  void cencBridge.start();
  return () => cencBridge.stop();
}

export function getCencIntensitySnapshot({ id = null } = {}) {
  return cencBridge.snapshot(id);
}
