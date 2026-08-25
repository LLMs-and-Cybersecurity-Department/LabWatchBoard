const JSHIS_API_BASE = "https://www.j-shis.bosai.go.jp/map/api";
const JSHIS_MAP_BASE = "https://www.j-shis.bosai.go.jp/map/";
const JSHIS_DOCS_URL = "https://www.j-shis.bosai.go.jp/en/api-list";
const REQUEST_TIMEOUT_MS = Number(process.env.JSHIS_TIMEOUT_MS ?? 20_000);
// Large trench models (for example AN Nankai) are multi-megabyte official
// point clouds and the J-SHIS server commonly needs more than 90 seconds.
// Keep this on-demand endpoint independent from the fast location products.
const FAULT_REQUEST_TIMEOUT_MS = Number(process.env.JSHIS_FAULT_TIMEOUT_MS ?? 240_000);
const LOCATION_CACHE_TTL_MS = Number(process.env.JSHIS_LOCATION_CACHE_TTL_MS ?? 60 * 60 * 1000);
const FAULT_CACHE_TTL_MS = Number(process.env.JSHIS_FAULT_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000);
const MAX_FAULTS = 24;
const MAX_FAULT_COORDINATES = Number(process.env.JSHIS_MAX_FAULT_COORDINATES ?? 120_000);

const locationCache = new Map();
const faultCache = new Map();

export class JshisError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "JshisError";
    this.statusCode = statusCode;
  }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedString(value, maxLength = 300) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function parseJshisPosition(searchParams) {
  const latitude = finite(searchParams.get("latitude"));
  const longitude = finite(searchParams.get("longitude"));
  if (latitude === null || longitude === null) {
    throw new JshisError("latitude 与 longitude 必须是有限数值", 400);
  }
  if (latitude < 20 || latitude > 47 || longitude < 122 || longitude > 154) {
    throw new JshisError("该坐标不在 J-SHIS 官方 API 支持的日本周边范围内", 400);
  }
  return { latitude, longitude };
}

function successfulFeatureCollection(payload) {
  return payload?.status === "Success"
    && payload?.type === "FeatureCollection"
    && Array.isArray(payload.features)
    && payload.features.length > 0;
}

export function normalizeJshisHazard(payload) {
  if (!successfulFeatureCollection(payload)) throw new Error("概率地震动网格未返回有效要素");
  const feature = payload.features[0];
  const properties = feature?.properties ?? {};
  return {
    meshcode: boundedString(properties.meshcode ?? payload?.metaData?.meshcode, 32),
    feature: {
      type: "Feature",
      geometry: feature.geometry,
      properties: { meshcode: boundedString(properties.meshcode ?? payload?.metaData?.meshcode, 32) },
    },
    probabilities: {
      shindo5Lower: finite(properties.T30_I45_PS),
      shindo5Upper: finite(properties.T30_I50_PS),
      shindo6Lower: finite(properties.T30_I55_PS),
      shindo6Upper: finite(properties.T30_I60_PS),
    },
    scenarioIntensity: {
      probability3Percent: finite(properties.T30_P03_SI),
      probability6Percent: finite(properties.T30_P06_SI),
    },
  };
}

export function normalizeJshisSite(payload) {
  if (!successfulFeatureCollection(payload)) throw new Error("浅层地盘网格未返回有效要素");
  const feature = payload.features[0];
  const properties = feature?.properties ?? {};
  return {
    meshcode: boundedString(properties.meshcode ?? payload?.metaData?.meshcode, 32),
    feature: {
      type: "Feature",
      geometry: feature.geometry,
      properties: { meshcode: boundedString(properties.meshcode ?? payload?.metaData?.meshcode, 32) },
    },
    geomorphology: boundedString(properties.JNAME, 160) || null,
    geomorphologyCode: boundedString(properties.JCODE, 32) || null,
    vs30Mps: finite(properties.AVS),
    engineeringBedrockVsMps: finite(properties.AVS_EB),
    amplification: finite(properties.ARV),
    vs30Reference: boundedString(properties.AVS_REF, 32) || null,
  };
}

function boundedGeometryList(value) {
  return Array.isArray(value) ? value.slice(0, 80) : [];
}

export function normalizeJshisLandslide(payload) {
  if (payload?.status !== "Success") throw new Error("滑坡地形接口未返回成功状态");
  const metadata = payload.metaData ?? {};
  return {
    meshcode: boundedString(metadata.meshcode, 32),
    intersects: Boolean(Number(payload.isContaining)),
    officialMapUrl: boundedString(metadata.url, 2_000) || JSHIS_MAP_BASE,
    scarps: boundedGeometryList(metadata.scarps),
    movingMasses: boundedGeometryList(metadata.movingmass_polygons),
  };
}

export function normalizeJshisFaultSearch(payload) {
  if (payload?.status !== "Success" || !Array.isArray(payload.Fault)) {
    throw new Error("断层影响排序接口未返回有效结果");
  }
  return payload.Fault
    .flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const code = boundedString(row.ltecode, 48);
      const name = boundedString(row.ltename, 240);
      if (!code || !name) return [];
      return [{
        rank: finite(row.rank),
        code,
        name,
        earthquakeCode: boundedString(row.eqcode, 64) || null,
        group: boundedString(row.eqgroup, 16) || null,
        category: finite(row.eqcategory),
        magnitude: boundedString(row.magnitude, 80) || null,
        occurrenceProbability: finite(row.probability),
        score: finite(row.score),
        expectedIjma: finite(row.ijma),
        exceedance: {
          shindo5Lower: finite(row.i45_ps),
          shindo5Upper: finite(row.i50_ps),
          shindo6Lower: finite(row.i55_ps),
          shindo6Upper: finite(row.i60_ps),
        },
        patternCount: Array.isArray(row.Pattern) ? row.Pattern.length : 0,
      }];
    })
    .sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY))
    .slice(0, MAX_FAULTS);
}

function coordinateCount(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) return 1;
  return value.reduce((sum, child) => sum + coordinateCount(child), 0);
}

function validPosition(value) {
  if (!Array.isArray(value) || value.length < 2) return false;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= -180
    && longitude <= 180
    && latitude >= -90
    && latitude <= 90;
}

function evenlySample(values, limit) {
  if (values.length <= limit) return values;
  if (limit <= 1) return values.slice(0, Math.max(0, limit));
  const sampled = [];
  const last = values.length - 1;
  for (let index = 0; index < limit; index += 1) {
    sampled.push(values[Math.round(index * last / (limit - 1))]);
  }
  return sampled;
}

function sanitizeFaultFeature(feature, remainingCoordinates) {
  if (!feature || feature.type !== "Feature" || !feature.geometry || remainingCoordinates <= 0) return null;
  const geometry = feature.geometry;
  if (geometry.type === "Point") {
    if (!validPosition(geometry.coordinates)) return null;
    return { feature, coordinateCount: 1, sourceCoordinateCount: 1, simplified: false };
  }
  if (geometry.type === "MultiPoint") {
    const positions = Array.isArray(geometry.coordinates) ? geometry.coordinates.filter(validPosition) : [];
    if (!positions.length) return null;
    const sampled = evenlySample(positions, remainingCoordinates);
    return {
      feature: { ...feature, geometry: { ...geometry, coordinates: sampled } },
      coordinateCount: sampled.length,
      sourceCoordinateCount: positions.length,
      simplified: sampled.length < positions.length,
    };
  }
  const count = coordinateCount(geometry.coordinates);
  if (!count || count > remainingCoordinates) return null;
  return { feature, coordinateCount: count, sourceCoordinateCount: count, simplified: false };
}

export function normalizeJshisFaultShape(payload) {
  if (!successfulFeatureCollection(payload)) throw new Error("断层形状接口未返回有效要素");
  const model = payload.seisact_model ?? {};
  const sourceFeatures = payload.features.slice(0, 80);
  const features = [];
  const sourceCoordinateCount = sourceFeatures.reduce(
    (sum, feature) => sum + coordinateCount(feature?.geometry?.coordinates),
    0,
  );
  let renderCoordinateCount = 0;
  let simplified = false;
  for (const feature of sourceFeatures) {
    const normalized = sanitizeFaultFeature(feature, MAX_FAULT_COORDINATES - renderCoordinateCount);
    if (!normalized) {
      simplified = true;
      continue;
    }
    features.push(normalized.feature);
    renderCoordinateCount += normalized.coordinateCount;
    simplified ||= normalized.simplified;
    if (renderCoordinateCount >= MAX_FAULT_COORDINATES) break;
  }
  if (!features.length) throw new Error("断层形状接口没有可安全渲染的几何要素");
  return {
    code: boundedString(model.ltecode ?? payload?.metaData?.ltecode, 48),
    name: boundedString(model.ltename, 240) || null,
    magnitude: boundedString(model.magu ?? model.magl, 80) || null,
    probability30Years: finite(model.t30p),
    probability50Years: finite(model.t50p),
    model: boundedString(model.proc, 48) || null,
    features: {
      type: "FeatureCollection",
      features,
    },
    rendering: {
      strategy: features.some((feature) => ["Point", "MultiPoint"].includes(feature.geometry?.type)) ? "webgl" : "geojson",
      sourceCoordinateCount,
      renderCoordinateCount,
      simplified,
    },
  };
}

async function fetchOfficialJson(url, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, application/geo+json",
        "User-Agent": "ecmwf-pBoard/1.0 (J-SHIS official API client)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function locationUrls(latitude, longitude) {
  const position = `${longitude},${latitude}`;
  const encodedPosition = encodeURIComponent(position);
  return {
    hazard: `${JSHIS_API_BASE}/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson?position=${encodedPosition}&epsg=4326`,
    site: `${JSHIS_API_BASE}/sstrct/V4/meshinfo.geojson?position=${encodedPosition}&epsg=4326&lang=en`,
    landslide: `${JSHIS_API_BASE}/landslide/isContaining.json?position=${encodedPosition}&epsg=4326&lang=en`,
    faults: `${JSHIS_API_BASE}/fltsearch?position=${encodedPosition}&epsg=4326&mode=C&version=Y2024&case=AVR&period=P_T30&format=json&lang=en`,
  };
}

async function settleProduct(key, url, normalize, fetchImpl) {
  try {
    return { key, value: normalize(await fetchOfficialJson(url, fetchImpl)), error: null };
  } catch (error) {
    return { key, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getJshisLocation(searchParams, options = {}) {
  const { latitude, longitude } = parseJshisPosition(searchParams);
  const now = options.now ?? Date.now();
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = locationCache.get(cacheKey);
  if (cached && now - cached.savedAt < LOCATION_CACHE_TTL_MS) return { ...cached.payload, cache: "HIT" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const urls = locationUrls(latitude, longitude);
  const settled = await Promise.all([
    settleProduct("hazard", urls.hazard, normalizeJshisHazard, fetchImpl),
    settleProduct("site", urls.site, normalizeJshisSite, fetchImpl),
    settleProduct("landslide", urls.landslide, normalizeJshisLandslide, fetchImpl),
    settleProduct("faults", urls.faults, normalizeJshisFaultSearch, fetchImpl),
  ]);
  const products = Object.fromEntries(settled.map((entry) => [entry.key, entry.value]));
  const errors = settled.filter((entry) => entry.error).map((entry) => ({
    product: entry.key,
    detail: entry.error,
  }));
  if (errors.length === settled.length) {
    if (errors.every((entry) => entry.detail === "HTTP 404")) {
      throw new JshisError("该位置没有 J-SHIS 陆地区域数据覆盖，请选择日本陆地震中或陆地测站", 404);
    }
    throw new JshisError(`J-SHIS 官方接口全部不可用：${errors.map((entry) => entry.detail).join("；")}`, 502);
  }
  const payload = {
    source: "J-SHIS",
    fetchedAt: new Date(now).toISOString(),
    latitude,
    longitude,
    officialMapUrl: `${JSHIS_MAP_BASE}?center=${longitude},${latitude}&zoom=12&lang=en`,
    documentationUrl: JSHIS_DOCS_URL,
    hazard: products.hazard,
    site: products.site,
    landslide: products.landslide,
    faults: products.faults ?? [],
    partial: errors.length > 0,
    errors,
    cache: "MISS",
  };
  locationCache.set(cacheKey, { savedAt: now, payload });
  return payload;
}

export async function getJshisFault(searchParams, options = {}) {
  const code = boundedString(searchParams.get("code"), 48);
  if (!/^[A-Za-z0-9_-]{2,48}$/.test(code)) throw new JshisError("断层 code 格式无效", 400);
  const now = options.now ?? Date.now();
  const cached = faultCache.get(code);
  if (cached && now - cached.savedAt < FAULT_CACHE_TTL_MS) return { ...cached.payload, cache: "HIT" };
  const url = `${JSHIS_API_BASE}/pshm/Y2024/AVR/${encodeURIComponent(code)}/fltinfo.geojson?epsg=4326&lang=en`;
  try {
    const normalized = normalizeJshisFaultShape(await fetchOfficialJson(
      url,
      options.fetchImpl ?? fetch,
      options.timeoutMs ?? FAULT_REQUEST_TIMEOUT_MS,
    ));
    const payload = {
      source: "J-SHIS",
      fetchedAt: new Date(now).toISOString(),
      officialMapUrl: JSHIS_MAP_BASE,
      documentationUrl: "https://www.j-shis.bosai.go.jp/en/api-pshm-fltinfo",
      ...normalized,
      cache: "MISS",
    };
    faultCache.set(code, { savedAt: now, payload });
    return payload;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const timeoutDetail = error instanceof Error && error.name === "AbortError"
      ? `大型断层点云下载超过 ${Math.round((options.timeoutMs ?? FAULT_REQUEST_TIMEOUT_MS) / 1000)} 秒，请稍后重试`
      : detail;
    throw new JshisError(`J-SHIS 断层形状获取失败：${timeoutDetail}`, 502);
  }
}

export function clearJshisCache() {
  locationCache.clear();
  faultCache.clear();
}
