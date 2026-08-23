import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { getModelChart, ModelChartError } from "./server/modelChart.mjs";
import {
  EarthquakeDataError,
  EarthquakeMechanismError,
  EarthquakeShakeMapError,
  EarthquakeUsgsProductError,
  getEarthquakeDyfi,
  getEarthquakeMechanism,
  getEarthquakePager,
  getEarthquakeShakeMap,
  getEarthquakeSnapshot,
} from "./server/earthquake.mjs";
import { getNiedProducts, NiedProductsError } from "./server/niedProducts.mjs";
import {
  getNiedRealtime,
  getNiedStations,
  getOceanStations,
  SeismicDataError,
} from "./server/seismic.mjs";
import { getKmaPewsSnapshot } from "./server/kmaPews.mjs";
import { getCencIntensitySnapshot, startCencIntensityMonitor } from "./server/cencIntensity.mjs";
import { getEewRelaySnapshot } from "./server/eewRelay.mjs";
import { getExternalWarningSnapshot } from "./server/externalWarnings.mjs";
import { getJmaTsunamiHistorySnapshot, getJmaTsunamiSnapshot } from "./server/jmaTsunami.mjs";
import { getJshisFault, getJshisLocation, JshisError } from "./server/jshis.mjs";
import { getPalertRealtime, getPalertSnapshot } from "./server/palert.mjs";
import { getSnetIntensitySnapshot, startSnetIntensityMonitor } from "./server/snet.mjs";
import { FdsnDataError, getFdsnWaveform, getGlobalStationSnapshot } from "./server/fdsn.mjs";
import { CameraRelayError, resolveYoutubeCamera } from "./server/camera.mjs";
import { AnimationFrameProxyError, resolveAnimationFrameSource } from "./server/animationFrame.mjs";
import { fetchProxyResource, ProxyResponseCache } from "./server/upstreamProxy.mjs";
import { CencProductError, getCencProductSnapshot, getCencResource } from "./server/cencProducts.mjs";
import { CwaOfficialError, getCwaCatalogueSnapshot, getCwaOfficialSnapshot, getCwaProductSnapshot, getCwaTsunamiSnapshot } from "./server/cwaOfficial.mjs";

const ROOT = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4175);
const ECMWF_API_BASE = process.env.ECMWF_API_BASE ?? "https://charts.ecmwf.int/opencharts-api/v1";
const OPEN_METEO_API_BASE = process.env.OPEN_METEO_API_BASE ?? "https://api.open-meteo.com/v1";
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 25_000);
const BASIC_USER = process.env.DASHBOARD_USER ?? "";
const BASIC_PASSWORD = process.env.DASHBOARD_PASSWORD ?? "";
const FORECAST_MODELS = new Set(["ecmwf", "gfs", "dwd-icon", "cma", "jma"]);
const proxyCache = new ProxyResponseCache({ maxEntries: 360, maxBytes: 128 * 1024 * 1024 });

if (!existsSync(path.join(DIST, "index.html"))) {
  throw new Error("dist/index.html 不存在，请先运行 pnpm build");
}

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".mp3", "audio/mpeg"],
  [".txt", "text/plain; charset=utf-8"],
]);

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self' data:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "));
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", 'geolocation=(self), autoplay=(self "https://www.youtube-nocookie.com"), fullscreen=(self "https://www.youtube-nocookie.com")');
}

function sendJson(response, status, payload) {
  setSecurityHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function authorized(request) {
  if (!BASIC_USER && !BASIC_PASSWORD) return true;
  const expected = `Basic ${Buffer.from(`${BASIC_USER}:${BASIC_PASSWORD}`).toString("base64")}`;
  return request.headers.authorization === expected;
}

async function readBody(request, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("请求体超过 2 MB 限制");
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyRequest(request, response, targetUrl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? PROXY_TIMEOUT_MS);
  const abort = () => controller.abort();
  request.once("aborted", abort);
  try {
    const method = request.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
    const result = await fetchProxyResource(targetUrl, {
      method,
      body,
      signal: controller.signal,
      headers: {
        Accept: request.headers.accept ?? "application/json",
        "Content-Type": request.headers["content-type"] ?? "application/json",
        "User-Agent": "ecmwf-pBoard/1.0",
      },
      cache: proxyCache,
      cacheKey: `${options.cacheNamespace ?? "proxy"}:${targetUrl}`,
      cacheTtlMs: options.cacheTtlMs ?? 0,
      staleTtlMs: options.staleTtlMs ?? 0,
      retries: method === "GET" || method === "HEAD" ? options.retries ?? 1 : 0,
      retryDelayMs: options.retryDelayMs ?? 250,
      attemptTimeoutMs: options.attemptTimeoutMs,
    });
    setSecurityHeaders(response);
    response.statusCode = result.status;
    for (const [header, value] of Object.entries(result.headers)) {
      response.setHeader(header, value);
    }
    if (options.clientCacheControl) response.setHeader("Cache-Control", options.clientCacheControl);
    response.setHeader("X-Upstream-Service", new URL(targetUrl).hostname);
    response.setHeader("X-Proxy-Cache", result.cache);
    response.setHeader("X-Proxy-Cache-Age", String(result.ageSeconds));
    if (result.stale) {
      response.setHeader("Warning", '110 - "Response is stale"');
      if (result.upstreamStatus) response.setHeader("X-Upstream-Status", String(result.upstreamStatus));
    }
    response.setHeader("Content-Length", String(result.body.length));
    response.end(method === "HEAD" ? undefined : result.body);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, error?.name === "AbortError" ? 504 : 502, {
        error: "上游气象接口暂不可用",
        detail: error instanceof Error ? error.message : String(error),
      });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    clearTimeout(timer);
    request.removeListener("aborted", abort);
  }
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(DIST, relative);
  return resolved.startsWith(`${DIST}${path.sep}`) || resolved === DIST ? resolved : null;
}

async function serveStatic(request, response, pathname) {
  let filePath = safeStaticPath(pathname);
  if (!filePath) {
    sendJson(response, 400, { error: "非法路径" });
    return;
  }

  let fileStat = await stat(filePath).catch(() => null);
  if (fileStat?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    fileStat = await stat(filePath).catch(() => null);
  }
  if (!fileStat?.isFile()) {
    filePath = path.join(DIST, "index.html");
    fileStat = await stat(filePath);
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES.get(extension) ?? "application/octet-stream";
  const isImmutableAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  const isCatalogue = filePath.includes(`${path.sep}data${path.sep}ecmwf${path.sep}`);
  const canCompress = /^(text\/|application\/(javascript|json|manifest\+json))/.test(contentType) && fileStat.size > 1024;
  const acceptsGzip = String(request.headers["accept-encoding"] ?? "").includes("gzip");

  setSecurityHeaders(response);
  response.setHeader("Content-Type", contentType);
  response.setHeader(
    "Cache-Control",
    isImmutableAsset ? "public, max-age=31536000, immutable" : isCatalogue ? "public, max-age=3600" : "no-cache",
  );
  if (request.method === "HEAD") {
    response.setHeader("Content-Length", String(fileStat.size));
    response.end();
    return;
  }
  if (canCompress && acceptsGzip) {
    const compressed = gzipSync(await readFile(filePath), { level: 6 });
    response.setHeader("Content-Encoding", "gzip");
    response.setHeader("Vary", "Accept-Encoding");
    response.setHeader("Content-Length", String(compressed.length));
    response.end(compressed);
    return;
  }
  response.setHeader("Content-Length", String(fileStat.size));
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
    if (requestUrl.pathname === "/healthz") {
      sendJson(response, 200, { status: "ok", service: "ecmwf-pboard", proxyCache: proxyCache.stats() });
      return;
    }
    if (!authorized(request)) {
      setSecurityHeaders(response);
      response.writeHead(401, { "WWW-Authenticate": "Basic realm=ecmwf-pBoard", "Cache-Control": "no-store" });
      response.end("需要身份验证");
      return;
    }
    if (requestUrl.pathname === "/api/animation-frame") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "动画图帧代理仅支持 GET/HEAD" });
        return;
      }
      try {
        const source = resolveAnimationFrameSource(requestUrl.searchParams.get("url"));
        await proxyRequest(request, response, source, {
          cacheNamespace: "ecmwf-frame",
          cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
          staleTtlMs: 30 * 24 * 60 * 60 * 1000,
          retries: 2,
          attemptTimeoutMs: 12_000,
          timeoutMs: 45_000,
          clientCacheControl: "public, max-age=21600, stale-if-error=2592000",
        });
      } catch (error) {
        const status = error instanceof AnimationFrameProxyError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "动画图帧代理失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/model-chart") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "模式图表接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getModelChart(requestUrl.searchParams);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=21600, stale-while-revalidate=86400",
          "Content-Length": String(Buffer.byteLength(result.svg)),
          "X-Model-Name": result.model,
          "X-Model-Run": result.run,
          "X-Model-Valid-Time": result.validTime,
          "X-Model-Chart-Cache": result.cache,
          "X-Model-Chart-Quality": result.quality,
          "X-Model-Grid": `${result.gridColumns}x${result.gridRows}`,
          "X-Upstream-Service": "single-runs-api.open-meteo.com",
        });
        response.end(request.method === "HEAD" ? undefined : result.svg);
      } catch (error) {
        const status = error instanceof ModelChartError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "模式图表生成失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/earthquakes") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "地震聚合接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getEarthquakeSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-Earthquake-Cache": String(result.cache),
          "X-Earthquake-Sources": String(result.sources.filter((source) => source.status === "ok").length),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof EarthquakeDataError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "地震速报聚合失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/cwa-earthquakes") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "CWA 官方地震报告接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getCwaOfficialSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-CWA-Cache": String(result.cache),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof CwaOfficialError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "CWA 官方地震报告读取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/cwa-products") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "CWA 官方地震产品接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getCwaProductSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-CWA-Product-Cache": String(result.cache),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof CwaOfficialError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "CWA 官方地震产品读取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/cwa-tsunami") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "CWA 官方海啸资讯接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getCwaTsunamiSnapshot();
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-CWA-Tsunami-Cache": String(result.cache),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof CwaOfficialError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "CWA 官方海啸资讯读取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/cwa-catalogue") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "CWA 年度地震目录接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getCwaCatalogueSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-CWA-Catalogue-Cache": String(result.cache),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof CwaOfficialError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "CWA 年度地震目录读取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/earthquake-mechanism") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "机制解接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getEarthquakeMechanism(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-Mechanism-Source": result.productSource,
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof EarthquakeMechanismError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "官方机制解获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/earthquake-shakemap") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "ShakeMap 接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getEarthquakeShakeMap(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900, stale-while-revalidate=1800",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-ShakeMap-Source": result.productSource,
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof EarthquakeShakeMapError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "USGS ShakeMap 获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/earthquake-pager") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "USGS PAGER 接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getEarthquakePager(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900, stale-while-revalidate=1800",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-PAGER-Source": result.productSource,
          "X-PAGER-Cities": String(result.allCities.length),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof EarthquakeUsgsProductError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "USGS PAGER 获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/earthquake-dyfi") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "USGS DYFI 接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getEarthquakeDyfi(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900, stale-while-revalidate=1800",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-DYFI-Source": result.productSource,
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof EarthquakeUsgsProductError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "USGS Did You Feel It? 获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/nied-products") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "NIED 产品接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getNiedProducts(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-NIED-Fnet-Status": String(result.fnet?.status ?? "unknown"),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof NiedProductsError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "NIED 产品查询失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/jshis/location" || requestUrl.pathname === "/api/seismic/jshis/fault") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "J-SHIS 接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = requestUrl.pathname.endsWith("/fault")
          ? await getJshisFault(requestUrl.searchParams)
          : await getJshisLocation(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-JSHIS-Cache": String(result.cache),
          "X-JSHIS-Partial": String(Boolean(result.partial)),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof JshisError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "J-SHIS 官方数据获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/fdsn/stations") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "FDSN 测站接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getGlobalStationSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-FDSN-Station-Cache": String(result.cache),
          "X-FDSN-Station-Count": String(result.returnedCount),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof FdsnDataError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "FDSN 全球测站获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/fdsn/waveform") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "FDSN 波形接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getFdsnWaveform(requestUrl.searchParams);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": result.contentType,
          "Cache-Control": "no-store",
          "Content-Length": String(result.buffer.length),
          "X-FDSN-Cache": String(result.cache),
          "X-FDSN-Provider": result.provider.id,
          "X-FDSN-Provider-Label": encodeURIComponent(result.provider.label),
          "X-FDSN-Network": result.network,
          "X-FDSN-Station": result.station,
          "X-FDSN-Location": result.location || "--",
          "X-FDSN-Channels": result.channels.join(","),
          "X-FDSN-Sensor": encodeURIComponent(result.sensor),
          "X-FDSN-Sample-Rate": String(result.sampleRate),
          "X-FDSN-Scale-Units": encodeURIComponent(result.scaleUnits),
          "X-FDSN-Window-Start": result.startTime,
          "X-FDSN-Window-End": result.endTime,
          "X-FDSN-Latency-Ms": String(result.latencyMs),
        });
        response.end(request.method === "HEAD" ? undefined : result.buffer);
      } catch (error) {
        const status = error instanceof FdsnDataError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "FDSN 原始波形获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/camera/resolve") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "摄像头解析接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await resolveYoutubeCamera(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-Camera-Relay-Cache": result.cache,
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof CameraRelayError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "官方摄像头可用性检查失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/wni-cameras") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "WNI 摄像头目录接口仅支持 GET/HEAD" });
        return;
      }
      await proxyRequest(
        request,
        response,
        "https://weathernews.jp/onebox/livecam/api/livecam/geojson",
        {
          cacheNamespace: "wni-livecam",
          cacheTtlMs: 15 * 60 * 1000,
          staleTtlMs: 7 * 24 * 60 * 60 * 1000,
          retries: 2,
          attemptTimeoutMs: 15_000,
          timeoutMs: 40_000,
          clientCacheControl: "private, max-age=600, stale-if-error=604800",
        },
      );
      return;
    }
    if (requestUrl.pathname === "/api/seismic/cenc-products") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "CENC 产品接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getCencProductSnapshot(requestUrl.searchParams);
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(result.state === "restricted" ? 424 : 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-CENC-Product-State": result.state,
          "X-CENC-Product-Cache": String(result.cache),
          "X-CENC-Egress": String(result.egressMode ?? "direct"),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof CencProductError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "CENC 产品获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/seismic/cenc-resource") {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "CENC 资源接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const result = await getCencResource(requestUrl.searchParams.get("url"));
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": result.contentType,
          "Cache-Control": "private, max-age=300",
          "Content-Length": String(result.buffer.length),
          "X-CENC-Egress": String(result.egressMode),
        });
        response.end(request.method === "HEAD" ? undefined : result.buffer);
      } catch (error) {
        const status = error instanceof CencProductError ? error.statusCode : 500;
        sendJson(response, status, {
          error: "CENC 资源获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname.startsWith("/api/seismic/")) {
      if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
        sendJson(response, 405, { error: "地震台网接口仅支持 GET/HEAD" });
        return;
      }
      try {
        const loader = requestUrl.pathname === "/api/seismic/nied/stations"
          ? getNiedStations
          : requestUrl.pathname === "/api/seismic/nied/realtime"
            ? getNiedRealtime
            : requestUrl.pathname === "/api/seismic/kma-pews"
              ? getKmaPewsSnapshot
              : requestUrl.pathname === "/api/seismic/eew"
                ? getEewRelaySnapshot
                : requestUrl.pathname === "/api/seismic/external-warnings"
                  ? getExternalWarningSnapshot
                : requestUrl.pathname === "/api/seismic/jma-tsunami"
                  ? getJmaTsunamiSnapshot
                  : requestUrl.pathname === "/api/seismic/jma-tsunami-history"
                    ? getJmaTsunamiHistorySnapshot
                  : requestUrl.pathname === "/api/seismic/cenc-intensity"
                    ? () => getCencIntensitySnapshot({ id: requestUrl.searchParams.get("id") })
                  : requestUrl.pathname === "/api/seismic/palert"
                    ? getPalertSnapshot
                    : requestUrl.pathname === "/api/seismic/palert/realtime"
                      ? getPalertRealtime
                    : requestUrl.pathname === "/api/seismic/ocean-stations"
                      ? getOceanStations
                      : requestUrl.pathname === "/api/seismic/snet-intensity"
                        ? getSnetIntensitySnapshot
                        : null;
        if (!loader) {
          sendJson(response, 404, { error: "未知地震台网接口" });
          return;
        }
        const result = await loader();
        const body = JSON.stringify(result);
        setSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": String(Buffer.byteLength(body)),
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        const status = error instanceof SeismicDataError
          ? error.statusCode
          : requestUrl.pathname === "/api/seismic/snet-intensity"
            ? 502
            : 500;
        sendJson(response, status, {
          error: "地震台网数据获取失败",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (requestUrl.pathname.startsWith("/api/ecmwf/")) {
      const upstreamPath = requestUrl.pathname.replace(/^\/api\/ecmwf/, "");
      await proxyRequest(request, response, `${ECMWF_API_BASE}${upstreamPath}${requestUrl.search}`, {
        cacheNamespace: "ecmwf-api",
        cacheTtlMs: 2 * 60 * 1000,
        staleTtlMs: 24 * 60 * 60 * 1000,
        retries: 2,
        clientCacheControl: request.method === "GET" ? "private, max-age=60, stale-if-error=86400" : "no-store",
      });
      return;
    }
    if (requestUrl.pathname.startsWith("/api/forecast/")) {
      const model = requestUrl.pathname.replace(/^\/api\/forecast\//, "").split("/")[0];
      if (!FORECAST_MODELS.has(model)) {
        sendJson(response, 400, { error: "不支持的点位预报模型" });
        return;
      }
      await proxyRequest(request, response, `${OPEN_METEO_API_BASE}/${model}${requestUrl.search}`, {
        cacheNamespace: "point-forecast",
        cacheTtlMs: 5 * 60 * 1000,
        staleTtlMs: 60 * 60 * 1000,
        retries: 1,
        clientCacheControl: "private, max-age=120, stale-if-error=3600",
      });
      return;
    }
    if (!new Set(["GET", "HEAD"]).has(request.method ?? "GET")) {
      sendJson(response, 405, { error: "该路径不支持此请求方法" });
      return;
    }
    await serveStatic(request, response, requestUrl.pathname);
  } catch (error) {
    sendJson(response, 500, { error: "服务器内部错误", detail: error instanceof Error ? error.message : String(error) });
  }
});

const stopSnetMonitor = startSnetIntensityMonitor();
const stopCencMonitor = startCencIntensityMonitor();

export const serverReady = new Promise((resolve, reject) => {
  const handleError = (error) => reject(error);
  server.once("error", handleError);
  server.listen(PORT, HOST, () => {
    server.removeListener("error", handleError);
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : PORT;
    const url = `http://${HOST}:${actualPort}`;
    console.log(`ECMWF pBoard production server: ${url}`);
    resolve({ host: HOST, port: actualPort, url });
  });
});

let stopping = false;

export async function stopProductionServer() {
  if (stopping) return;
  stopping = true;
  stopSnetMonitor();
  stopCencMonitor();
  await new Promise((resolve) => server.close(resolve));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await stopProductionServer();
    process.exit(0);
  });
}
