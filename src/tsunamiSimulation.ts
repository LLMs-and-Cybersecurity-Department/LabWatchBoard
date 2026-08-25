import type { JmaTsunamiArea, JmaTsunamiSnapshot, LiveEew } from "./seismic";

export type TsunamiCountry = "JP" | "CN" | "TW" | "KR";
export type TsunamiLevel = 0 | 1 | 2 | 3;
export type TsunamiBasin = "pacific" | "japan-sea" | "east-china-sea" | "yellow-sea" | "taiwan-east" | "south-china-sea" | "inner-bay";

export type TsunamiSource = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  reportCount: number;
  reportIntervalSeconds: number;
};

export type TsunamiScenario = {
  id: string;
  place: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depthKm: number;
  originTime: string;
  reportDelaySeconds: number;
  conservativeBias: number;
  countries: TsunamiCountry[];
  multiSource: boolean;
  sources: TsunamiSource[];
};

export type TsunamiImpact = {
  id: string;
  country: TsunamiCountry;
  name: string;
  latitude: number;
  longitude: number;
  basin: TsunamiBasin;
  distanceKm: number;
  arrivalSeconds: number;
  arrivalTime: string;
  heightM: number;
  level: Exclude<TsunamiLevel, 0>;
};

export type TsunamiSimulationResult = {
  scenario: TsunamiScenario;
  sourceBasin: TsunamiBasin;
  issuedAt: string;
  impacts: TsunamiImpact[];
  maximumLevel: TsunamiLevel;
  maximumHeightM: number;
  lastArrivalSeconds: number;
  model: "KESHI-LITE-1";
  disclaimer: string;
};

export type TsunamiSimulationSourceTiming = TsunamiSource & {
  order: number;
  originOffsetSeconds: number;
  originTime: string;
};

type CoastalZone = Omit<TsunamiImpact, "distanceKm" | "arrivalSeconds" | "arrivalTime" | "heightM" | "level"> & {
  amplification: number;
};

const EARTH_RADIUS_KM = 6371;
const GRAVITY = 9.80665;
const DISCLAIMER = "浏览器轻量演示估算，不是官方预报，不可用于避难决策";
const CONNECTED_BASINS = new Set([
  "pacific:taiwan-east", "taiwan-east:pacific", "taiwan-east:east-china-sea", "east-china-sea:taiwan-east",
  "east-china-sea:south-china-sea", "south-china-sea:east-china-sea", "yellow-sea:east-china-sea", "east-china-sea:yellow-sea",
  "japan-sea:yellow-sea", "yellow-sea:japan-sea", "pacific:east-china-sea", "east-china-sea:pacific",
]);

const Z = (country: TsunamiCountry, name: string, latitude: number, longitude: number, basin: TsunamiBasin, amplification = 1): CoastalZone => ({
  id: `${country}:${name}`,
  country,
  name,
  latitude,
  longitude,
  basin,
  amplification,
});

const JAPAN_ZONES: CoastalZone[] = [
  Z("JP", "オホーツク海沿岸", 44.520116, 143.566378, "japan-sea", 0.8),
  Z("JP", "北海道太平洋沿岸東部", 44.157744, 146.460406, "pacific", 1.2),
  Z("JP", "北海道太平洋沿岸中部", 42.268630, 142.979315, "pacific", 1.15),
  Z("JP", "北海道太平洋沿岸西部", 42.107914, 140.850541, "pacific", 1.05),
  Z("JP", "北海道日本海沿岸北部", 44.385756, 141.306377, "japan-sea"),
  Z("JP", "北海道日本海沿岸南部", 42.331699, 139.982081, "japan-sea"),
  Z("JP", "青森県太平洋沿岸", 41.045918, 141.376223, "pacific", 1.15),
  Z("JP", "陸奥湾", 41.044997, 140.938790, "inner-bay", 0.75),
  Z("JP", "青森県日本海沿岸", 40.997359, 140.309968, "japan-sea"),
  Z("JP", "岩手県", 39.485925, 141.891399, "pacific", 1.5),
  Z("JP", "宮城県", 38.486639, 141.409197, "pacific", 1.55),
  Z("JP", "秋田県", 39.838317, 139.902079, "japan-sea"),
  Z("JP", "山形県", 38.849665, 139.694509, "japan-sea"),
  Z("JP", "福島県", 37.311550, 140.977492, "pacific", 1.3),
  Z("JP", "茨城県", 36.378490, 140.674592, "pacific", 1.2),
  Z("JP", "新潟県上中下越", 37.714965, 138.761225, "japan-sea"),
  Z("JP", "佐渡", 38.045855, 138.379410, "japan-sea", 1.15),
  Z("JP", "富山県", 36.843867, 137.245086, "japan-sea", 0.85),
  Z("JP", "石川県能登", 37.208493, 136.966723, "japan-sea", 1.25),
  Z("JP", "石川県加賀", 36.506116, 136.479127, "japan-sea"),
  Z("JP", "福井県", 35.708270, 135.863656, "japan-sea"),
  Z("JP", "千葉県九十九里・外房", 35.260502, 140.321357, "pacific", 1.3),
  Z("JP", "千葉県内房", 35.067103, 139.829621, "inner-bay", 0.9),
  Z("JP", "東京湾内湾", 35.508518, 139.822980, "inner-bay", 0.7),
  Z("JP", "相模湾・三浦半島", 35.221400, 139.473880, "pacific", 1.25),
  Z("JP", "伊豆諸島", 33.832661, 139.514558, "pacific", 1.35),
  Z("JP", "静岡県", 34.849792, 138.683515, "pacific", 1.4),
  Z("JP", "愛知県外海", 34.614076, 137.210468, "pacific", 1.35),
  Z("JP", "伊勢・三河湾", 34.837901, 136.928679, "inner-bay", 0.85),
  Z("JP", "三重県南部", 34.241325, 136.579796, "pacific", 1.45),
  Z("JP", "和歌山県", 33.798119, 135.416900, "pacific", 1.45),
  Z("JP", "大阪府", 34.528244, 135.356957, "inner-bay", 0.75),
  Z("JP", "京都府", 35.609963, 135.242817, "japan-sea"),
  Z("JP", "兵庫県北部", 35.652215, 134.660625, "japan-sea"),
  Z("JP", "兵庫県瀬戸内海沿岸", 34.677392, 134.864166, "inner-bay", 0.7),
  Z("JP", "淡路島南部", 34.255656, 134.788440, "inner-bay", 0.95),
  Z("JP", "鳥取県", 35.526642, 133.784804, "japan-sea"),
  Z("JP", "島根県出雲・石見", 35.247343, 132.574889, "japan-sea"),
  Z("JP", "隠岐", 36.157087, 133.158196, "japan-sea", 1.1),
  Z("JP", "岡山県", 34.540367, 133.895190, "inner-bay", 0.65),
  Z("JP", "広島県", 34.271440, 132.790413, "inner-bay", 0.65),
  Z("JP", "香川県", 34.370493, 133.972844, "inner-bay", 0.7),
  Z("JP", "徳島県", 33.924473, 134.578561, "pacific", 1.35),
  Z("JP", "愛媛県瀬戸内海沿岸", 33.990486, 132.870149, "inner-bay", 0.65),
  Z("JP", "愛媛県宇和海沿岸", 33.192885, 132.417701, "pacific", 1.2),
  Z("JP", "高知県", 33.131262, 133.249122, "pacific", 1.55),
  Z("JP", "山口県日本海沿岸", 34.370966, 131.140012, "japan-sea"),
  Z("JP", "山口県瀬戸内海沿岸", 33.946254, 131.880363, "inner-bay", 0.65),
  Z("JP", "福岡県日本海沿岸", 33.752302, 130.430124, "japan-sea"),
  Z("JP", "福岡県瀬戸内海沿岸", 33.802975, 131.024013, "inner-bay", 0.65),
  Z("JP", "佐賀県北部", 33.474117, 129.867271, "japan-sea"),
  Z("JP", "長崎県西方", 32.985626, 129.387682, "east-china-sea", 1.05),
  Z("JP", "壱岐・対馬", 34.269085, 129.399747, "japan-sea", 1.15),
  Z("JP", "大分県瀬戸内海沿岸", 33.496222, 131.593716, "inner-bay", 0.65),
  Z("JP", "大分県豊後水道沿岸", 32.971282, 131.944740, "pacific", 1.15),
  Z("JP", "熊本県天草灘沿岸", 32.323803, 130.058955, "east-china-sea", 0.9),
  Z("JP", "有明・八代海", 32.610028, 130.382264, "inner-bay", 0.65),
  Z("JP", "宮崎県", 32.030383, 131.540952, "pacific", 1.4),
  Z("JP", "鹿児島県東部", 31.228178, 130.966484, "pacific", 1.3),
  Z("JP", "鹿児島県西部", 31.666198, 130.293631, "east-china-sea", 0.95),
  Z("JP", "種子島・屋久島地方", 30.538615, 130.626496, "pacific", 1.4),
  Z("JP", "奄美群島・トカラ列島", 28.350392, 129.335302, "pacific", 1.4),
  Z("JP", "沖縄本島地方", 26.491023, 127.781330, "east-china-sea", 1.25),
  Z("JP", "宮古島・八重山地方", 24.497851, 124.298957, "east-china-sea", 1.35),
  Z("JP", "大東島地方", 25.625014, 131.250308, "pacific", 1.4),
  Z("JP", "小笠原諸島", 26.387154, 142.367019, "pacific", 1.45),
];

const CHINA_ZONES: CoastalZone[] = [
  Z("CN", "丹东市", 39.95, 124.35, "yellow-sea"), Z("CN", "大连市", 38.91, 121.61, "yellow-sea", 1.15),
  Z("CN", "营口市", 40.67, 122.24, "yellow-sea"), Z("CN", "盘锦市", 41.12, 122.07, "yellow-sea", 0.85),
  Z("CN", "锦州市", 41.09, 121.13, "yellow-sea"), Z("CN", "葫芦岛市", 40.71, 120.84, "yellow-sea"),
  Z("CN", "秦皇岛市", 39.93, 119.60, "yellow-sea"), Z("CN", "唐山市", 39.63, 118.18, "yellow-sea"),
  Z("CN", "天津市", 39.08, 117.20, "yellow-sea", 0.8), Z("CN", "沧州市", 38.30, 116.84, "yellow-sea"),
  Z("CN", "滨州市", 37.38, 117.97, "yellow-sea"), Z("CN", "东营市", 37.43, 118.67, "yellow-sea"),
  Z("CN", "潍坊市", 36.71, 119.16, "yellow-sea"), Z("CN", "烟台市", 37.46, 121.45, "yellow-sea", 1.1),
  Z("CN", "威海市", 37.51, 122.12, "yellow-sea", 1.15), Z("CN", "青岛市", 36.07, 120.38, "yellow-sea", 1.15),
  Z("CN", "日照市", 35.42, 119.53, "yellow-sea"), Z("CN", "连云港市", 34.60, 119.22, "yellow-sea"),
  Z("CN", "盐城市", 33.35, 120.16, "yellow-sea"), Z("CN", "南通市", 32.06, 120.86, "east-china-sea"),
  Z("CN", "上海市", 31.23, 121.47, "east-china-sea", 0.9), Z("CN", "嘉兴市", 30.75, 120.75, "east-china-sea", 0.9),
  Z("CN", "宁波市", 29.87, 121.55, "east-china-sea", 1.1), Z("CN", "舟山市", 30.00, 122.20, "east-china-sea", 1.2),
  Z("CN", "台州市", 28.66, 121.42, "east-china-sea", 1.1), Z("CN", "温州市", 27.99, 120.70, "east-china-sea", 1.1),
  Z("CN", "宁德市", 26.66, 119.55, "east-china-sea", 1.1), Z("CN", "福州市", 26.07, 119.30, "east-china-sea"),
  Z("CN", "莆田市", 25.45, 119.01, "east-china-sea"), Z("CN", "泉州市", 24.87, 118.68, "east-china-sea"),
  Z("CN", "厦门市", 24.48, 118.09, "east-china-sea", 1.05), Z("CN", "漳州市", 24.51, 117.65, "east-china-sea"),
  Z("CN", "潮州市", 23.66, 116.62, "south-china-sea"), Z("CN", "汕头市", 23.35, 116.68, "south-china-sea", 1.1),
  Z("CN", "揭阳市", 23.55, 116.37, "south-china-sea"), Z("CN", "汕尾市", 22.79, 115.38, "south-china-sea", 1.1),
  Z("CN", "惠州市", 23.11, 114.42, "south-china-sea"), Z("CN", "深圳市", 22.54, 114.06, "south-china-sea"),
  Z("CN", "东莞市", 23.02, 113.75, "south-china-sea", 0.8), Z("CN", "广州市", 23.13, 113.26, "south-china-sea", 0.75),
  Z("CN", "中山市", 22.52, 113.39, "south-china-sea", 0.85), Z("CN", "珠海市", 22.27, 113.58, "south-china-sea"),
  Z("CN", "江门市", 22.58, 113.08, "south-china-sea"), Z("CN", "阳江市", 21.86, 111.98, "south-china-sea"),
  Z("CN", "茂名市", 21.66, 110.92, "south-china-sea"), Z("CN", "湛江市", 21.27, 110.36, "south-china-sea", 1.1),
  Z("CN", "北海市", 21.48, 109.12, "south-china-sea"), Z("CN", "钦州市", 21.98, 108.65, "south-china-sea"),
  Z("CN", "防城港市", 21.69, 108.35, "south-china-sea"), Z("CN", "海口市", 20.04, 110.20, "south-china-sea"),
  Z("CN", "三亚市", 18.25, 109.51, "south-china-sea", 1.1),
];

const TAIWAN_ZONES: CoastalZone[] = [
  Z("TW", "基隆市", 25.13, 121.74, "taiwan-east", 1.1), Z("TW", "新北市", 25.02, 121.47, "taiwan-east", 1.1),
  Z("TW", "宜蘭縣", 24.70, 121.74, "taiwan-east", 1.35), Z("TW", "花蓮縣", 23.75, 121.57, "taiwan-east", 1.5),
  Z("TW", "台東縣", 22.76, 121.15, "taiwan-east", 1.45), Z("TW", "屏東縣", 22.55, 120.55, "south-china-sea", 1.25),
  Z("TW", "高雄市", 22.63, 120.30, "south-china-sea"), Z("TW", "台南市", 23.00, 120.20, "south-china-sea"),
  Z("TW", "嘉義縣", 23.45, 120.26, "east-china-sea", 0.9), Z("TW", "雲林縣", 23.71, 120.43, "east-china-sea", 0.9),
  Z("TW", "彰化縣", 24.07, 120.54, "east-china-sea", 0.9), Z("TW", "台中市", 24.15, 120.67, "east-china-sea"),
  Z("TW", "苗栗縣", 24.56, 120.82, "east-china-sea"), Z("TW", "新竹市", 24.80, 120.97, "east-china-sea"),
  Z("TW", "新竹縣", 24.84, 121.02, "east-china-sea"), Z("TW", "桃園市", 24.99, 121.30, "east-china-sea"),
  Z("TW", "澎湖縣", 23.57, 119.58, "east-china-sea", 1.05), Z("TW", "金門縣", 24.44, 118.32, "east-china-sea", 0.8),
  Z("TW", "連江縣", 26.16, 119.95, "east-china-sea", 0.9),
];

const KOREA_ZONES: CoastalZone[] = [
  Z("KR", "강원특별자치도", 37.82, 128.16, "japan-sea", 1.15), Z("KR", "경상북도", 36.25, 128.89, "japan-sea", 1.15),
  Z("KR", "울산광역시", 35.54, 129.31, "japan-sea", 1.1), Z("KR", "부산광역시", 35.18, 129.08, "japan-sea", 1.15),
  Z("KR", "경상남도", 35.24, 128.69, "east-china-sea"), Z("KR", "전라남도", 34.82, 126.46, "yellow-sea"),
  Z("KR", "광주광역시", 35.16, 126.85, "yellow-sea", 0.75), Z("KR", "전라북도", 35.72, 127.15, "yellow-sea"),
  Z("KR", "충청남도", 36.66, 126.67, "yellow-sea"), Z("KR", "인천광역시", 37.46, 126.71, "yellow-sea", 0.9),
  Z("KR", "경기도", 37.41, 127.52, "yellow-sea", 0.75), Z("KR", "제주특별자치도", 33.49, 126.50, "east-china-sea", 1.2),
];

export const TSUNAMI_COASTAL_ZONES = [...JAPAN_ZONES, ...CHINA_ZONES, ...TAIWAN_ZONES, ...KOREA_ZONES] as const;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function tsunamiHaversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const dLatitude = toRadians(latitudeB - latitudeA);
  const dLongitude = toRadians(longitudeB - longitudeA);
  const a = Math.sin(dLatitude / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function tsunamiMeanLongitude(longitudes: number[]) {
  if (!longitudes.length) return 0;
  const x = longitudes.reduce((sum, longitude) => sum + Math.cos(toRadians(longitude)), 0);
  const y = longitudes.reduce((sum, longitude) => sum + Math.sin(toRadians(longitude)), 0);
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return longitudes[0];
  const mean = Math.atan2(y, x) * 180 / Math.PI;
  return ((mean + 540) % 360) - 180;
}

export function tsunamiTravelSeconds(distanceKm: number, effectiveOceanDepthM = 4000) {
  const openOceanSpeedMs = Math.sqrt(GRAVITY * Math.max(500, effectiveOceanDepthM));
  return Math.max(0, distanceKm) * 1000 / openOceanSpeedMs * 1.18;
}

export function inferTsunamiSourceBasin(latitude: number, longitude: number): TsunamiBasin {
  if (latitude >= 20 && latitude <= 27.5 && longitude >= 121 && longitude <= 125.5) return "taiwan-east";
  if (latitude >= 34.3 && latitude <= 46 && longitude <= 139.2 && longitude >= 128) return "japan-sea";
  if ((latitude >= 27 && latitude <= 43 && longitude >= 132)
    || (latitude >= 20 && latitude < 34.3 && longitude >= 125.5)) return "pacific";
  if (latitude >= 21 && latitude <= 34 && longitude >= 119 && longitude < 139) return "east-china-sea";
  if (latitude >= 17 && latitude <= 26 && longitude < 121) return "south-china-sea";
  if (latitude >= 33 && latitude <= 42 && longitude < 128) return "yellow-sea";
  return longitude >= 132 ? "pacific" : "east-china-sea";
}

function normalizedScenarioSources(scenario: TsunamiScenario): TsunamiSource[] {
  const configured = scenario.sources?.length ? scenario.sources : [{
    id: `${scenario.id}:source-1`,
    name: scenario.place,
    latitude: scenario.latitude,
    longitude: scenario.longitude,
    reportCount: 1,
    reportIntervalSeconds: 10,
  }];
  return configured.slice(0, scenario.multiSource ? 10 : 1).map((source, index) => ({
    ...source,
    id: source.id || `${scenario.id}:source-${index + 1}`,
    name: source.name.trim() || `震源 ${index + 1}`,
    reportCount: Math.max(1, Math.min(99, Math.round(source.reportCount || 1))),
    reportIntervalSeconds: Math.max(1, Math.min(600, Math.round(source.reportIntervalSeconds || 10))),
  }));
}

export function tsunamiSimulationSourceTimings(scenario: TsunamiScenario): TsunamiSimulationSourceTiming[] {
  const originMs = Number.isFinite(Date.parse(scenario.originTime)) ? Date.parse(scenario.originTime) : Date.now();
  let originOffsetSeconds = 0;
  return normalizedScenarioSources(scenario).map((source, index) => {
    const timing = {
      ...source,
      order: index + 1,
      originOffsetSeconds,
      originTime: new Date(originMs + originOffsetSeconds * 1000).toISOString(),
    };
    originOffsetSeconds += Math.max(1, source.reportCount) * Math.max(1, source.reportIntervalSeconds);
    return timing;
  });
}

function basinTransmission(source: TsunamiBasin, target: TsunamiBasin) {
  if (source === target) return 1;
  if (target === "inner-bay") return source === "pacific" || source === "japan-sea" ? 0.34 : 0.22;
  if (CONNECTED_BASINS.has(`${source}:${target}`)) return 0.62;
  if ((source === "japan-sea" && target === "pacific") || (source === "pacific" && target === "japan-sea")) return 0.08;
  return 0.24;
}

export function estimateTsunamiHeightM(scenario: Pick<TsunamiScenario, "magnitude" | "depthKm" | "conservativeBias">, distanceKm: number, transmission: number, amplification = 1) {
  if (scenario.magnitude < 6.2 || scenario.depthKm > 180) return 0;
  const sourceHeight = 0.34 * 10 ** (0.52 * (scenario.magnitude - 6.5));
  const depthAttenuation = Math.exp(-Math.max(0, scenario.depthKm) / 85);
  const distanceAttenuation = 1 / (1 + (Math.max(20, distanceKm) / 280) ** 1.25);
  const biasFactor = 0.82 + clamp(scenario.conservativeBias, 0, 100) * 0.006;
  return clamp(sourceHeight * depthAttenuation * distanceAttenuation * transmission * amplification * biasFactor, 0, 30);
}

export function tsunamiLevelForHeight(heightM: number): TsunamiLevel {
  if (heightM >= 3) return 3;
  if (heightM >= 1) return 2;
  if (heightM >= 0.2) return 1;
  return 0;
}

export function simulateEastAsiaTsunami(scenario: TsunamiScenario): TsunamiSimulationResult {
  const sources = tsunamiSimulationSourceTimings(scenario);
  const sourceProfiles = sources.map((source) => ({
    ...source,
    basin: inferTsunamiSourceBasin(source.latitude, source.longitude),
  }));
  const primarySource = sources[0] ?? {
    latitude: scenario.latitude,
    longitude: scenario.longitude,
    originOffsetSeconds: 0,
  };
  const sourceBasin = inferTsunamiSourceBasin(primarySource.latitude, primarySource.longitude);
  const countrySet = new Set(scenario.countries);
  const originMs = Date.parse(scenario.originTime);
  const safeOriginMs = Number.isFinite(originMs) ? originMs : Date.now();
  const impacts = TSUNAMI_COASTAL_ZONES.flatMap<TsunamiImpact>((zone) => {
    if (!countrySet.has(zone.country)) return [];
    const sourceContributions = sourceProfiles.map((source) => {
      const distanceKm = tsunamiHaversineKm(source.latitude, source.longitude, zone.latitude, zone.longitude);
      const heightM = estimateTsunamiHeightM(scenario, distanceKm, basinTransmission(source.basin, zone.basin), zone.amplification);
      const arrivalSeconds = source.originOffsetSeconds + Math.round(tsunamiTravelSeconds(Math.max(15, distanceKm)));
      return { distanceKm, heightM, arrivalSeconds };
    });
    const distanceKm = Math.min(...sourceContributions.map((source) => source.distanceKm));
    // Root-sum-square keeps multiple rupture patches additive without letting
    // ten nearby points scale the result linearly into an implausible spike.
    const heightM = Math.sqrt(sourceContributions.reduce((sum, source) => sum + source.heightM ** 2, 0));
    const level = tsunamiLevelForHeight(heightM);
    if (level === 0) return [];
    const arrivalSeconds = Math.min(...sourceContributions.filter((source) => source.heightM >= 0.05).map((source) => source.arrivalSeconds));
    return [{
      id: zone.id,
      country: zone.country,
      name: zone.name,
      latitude: zone.latitude,
      longitude: zone.longitude,
      basin: zone.basin,
      distanceKm,
      arrivalSeconds,
      arrivalTime: new Date(safeOriginMs + arrivalSeconds * 1000).toISOString(),
      heightM: Math.round(heightM * 10) / 10,
      level: level as Exclude<TsunamiLevel, 0>,
    }];
  }).sort((left, right) => right.level - left.level || left.arrivalSeconds - right.arrivalSeconds);
  const maximumLevel = impacts.reduce<TsunamiLevel>((value, impact) => Math.max(value, impact.level) as TsunamiLevel, 0);
  return {
    scenario,
    sourceBasin,
    issuedAt: new Date(safeOriginMs + clamp(scenario.reportDelaySeconds, 0, 600) * 1000).toISOString(),
    impacts,
    maximumLevel,
    maximumHeightM: impacts.reduce((value, impact) => Math.max(value, impact.heightM), 0),
    lastArrivalSeconds: impacts.reduce((value, impact) => Math.max(value, impact.arrivalSeconds), 0),
    model: "KESHI-LITE-1",
    disclaimer: DISCLAIMER,
  };
}

export function tsunamiImpactStatus(impact: TsunamiImpact, elapsedSeconds: number) {
  const remainingSeconds = impact.arrivalSeconds - Math.max(0, elapsedSeconds);
  if (remainingSeconds <= -15 * 60) return { kind: "observing" as const, label: "观测中", remainingSeconds };
  if (remainingSeconds <= 0) return { kind: "arrived" as const, label: "预计已到达", remainingSeconds };
  if (remainingSeconds <= 10 * 60) return { kind: "imminent" as const, label: "即将到达", remainingSeconds };
  return { kind: "forecast" as const, label: "预计到达", remainingSeconds };
}

export function tsunamiHeightLabel(heightM: number) {
  if (heightM >= 10) return "10m以上";
  if (heightM >= 5) return "5m";
  if (heightM >= 3) return "3m";
  if (heightM >= 1) return "1m";
  return `${Math.max(0.2, Math.round(heightM * 10) / 10).toFixed(1)}m`;
}

export function tsunamiTitle(level: TsunamiLevel) {
  if (level === 3) return "大海啸警报";
  if (level === 2) return "海啸警报";
  if (level === 1) return "海啸注意报";
  return "无海啸警报";
}

export function simulationToLiveEew(result: TsunamiSimulationResult): LiveEew {
  const { scenario } = result;
  const source = tsunamiSimulationSourceTimings(scenario)[0];
  return {
    id: `simulation:${scenario.id}`,
    source: "JMA",
    title: "SIMULATION 地震 / 海啸模拟",
    serial: 1,
    announcedAt: source?.originTime ?? scenario.originTime,
    originTime: source?.originTime ?? scenario.originTime,
    place: source?.name ?? scenario.place,
    latitude: source?.latitude ?? scenario.latitude,
    longitude: source?.longitude ?? scenario.longitude,
    depthKm: scenario.depthKm,
    magnitude: scenario.magnitude,
    maxIntensity: "模拟",
    final: false,
    warning: scenario.magnitude >= 6,
    cancelled: false,
    assumption: true,
    relay: "Authorized",
    hypocenterKnown: true,
  };
}

export function simulationReportTimeline(result: TsunamiSimulationResult): LiveEew[] {
  const { scenario } = result;
  const parsedOriginMs = Date.parse(scenario.originTime);
  const originMs = Number.isFinite(parsedOriginMs) ? parsedOriginMs : Date.now();
  const sources = tsunamiSimulationSourceTimings(scenario);
  let serial = 0;
  return sources.flatMap((source) => Array.from({ length: source.reportCount }, (_, reportIndex) => {
    serial += 1;
    const announcedOffset = source.originOffsetSeconds
      + reportIndex * source.reportIntervalSeconds;
    return {
      id: `simulation:${scenario.id}`,
      source: "JMA",
      title: `SIMULATION 第 ${serial} 报`,
      serial,
      announcedAt: new Date(originMs + announcedOffset * 1000).toISOString(),
      // Keep one event origin for replay report offsets; individual rupture
      // origin times are carried by simulationWaveEventsAt for P/S circles.
      originTime: scenario.originTime,
      place: source.name,
      latitude: source.latitude,
      longitude: source.longitude,
      depthKm: scenario.depthKm,
      magnitude: scenario.magnitude,
      maxIntensity: "模拟",
      final: reportIndex === source.reportCount - 1 && source.order === sources.length,
      warning: scenario.magnitude >= 6,
      cancelled: false,
      assumption: true,
      relay: "Authorized",
      hypocenterKnown: true,
    } satisfies LiveEew;
  }));
}

export function simulationWaveEventsAt(result: TsunamiSimulationResult, elapsedSeconds: number): LiveEew[] {
  const base = simulationToLiveEew(result);
  return tsunamiSimulationSourceTimings(result.scenario).flatMap((source) => (
    elapsedSeconds >= source.originOffsetSeconds && elapsedSeconds <= source.originOffsetSeconds + 300
      ? [{
        ...base,
        id: `${base.id}:source-${source.order}`,
        serial: source.order,
        title: `SIMULATION 震源 ${source.order}`,
        originTime: source.originTime,
        place: source.name,
        latitude: source.latitude,
        longitude: source.longitude,
      }]
      : []
  ));
}

export function simulationToJmaSnapshot(result: TsunamiSimulationResult, elapsedSeconds: number): JmaTsunamiSnapshot | null {
  const reportOffset = Math.max(0, (Date.parse(result.issuedAt) - Date.parse(result.scenario.originTime)) / 1000);
  if (elapsedSeconds < reportOffset || result.maximumLevel === 0) return null;
  const areas: JmaTsunamiArea[] = result.impacts.filter((impact) => impact.country === "JP").map((impact) => ({
    name: impact.name,
    grade: impact.level === 3 ? "MajorWarning" : impact.level === 2 ? "Warning" : "Watch",
    level: impact.level,
    immediate: impact.arrivalSeconds <= elapsedSeconds + 10 * 60,
    arrivalTime: impact.arrivalTime,
    arrivalCondition: elapsedSeconds >= impact.arrivalSeconds ? "模拟预计已到达" : null,
    maxHeightM: impact.heightM,
    maxHeightDescription: tsunamiHeightLabel(impact.heightM),
  }));
  const state = result.maximumLevel === 3 ? "major-warning" : result.maximumLevel === 2 ? "warning" : "advisory";
  return {
    provider: "P2P地震信息 / 气象厅",
    source: "JMA",
    sourceState: "online",
    sourceUrl: "simulation://keshi-lite-1",
    relayUrl: "simulation://local",
    fetchedAt: new Date().toISOString(),
    issuedAt: result.issuedAt,
    reportId: result.scenario.id,
    reportType: "Simulation",
    cancelled: false,
    active: true,
    level: result.maximumLevel,
    state,
    title: `SIMULATION · ${tsunamiTitle(result.maximumLevel)}`,
    stale: false,
    cache: "LIVE",
    areas,
  };
}
