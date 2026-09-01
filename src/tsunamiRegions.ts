import type { FeatureCollection, Geometry } from "geojson";
import { feature as topojsonFeature } from "topojson-client";

import chinaPrefectureGeoJsonUrl from "cn-atlas/prefectures.json?url";
import taiwanCountyTopologyUrl from "taiwan-atlas/counties-10t.json?url";
import { normalizeImpactRegionName } from "./impactRegions";
import type { TsunamiImpact } from "./tsunamiSimulation";

export type DetailedTsunamiRegionProperties = {
  code: string;
  name: string;
  country: "CN" | "TW" | "KR";
  simulated: true;
  level?: number;
  heightM?: number;
};

export type DetailedTsunamiRegionCollection = FeatureCollection<Geometry, DetailedTsunamiRegionProperties>;

type GenericFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>;
type GenericTopology = { objects?: Record<string, unknown> };

async function fetchJson<T>(url: string, label: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${label} ${response.status}`);
  return response.json() as Promise<T>;
}
function matchImpact(name: string, impacts: TsunamiImpact[]) {
  const target = normalizeImpactRegionName(name);
  return impacts.find((impact) => {
    const candidate = normalizeImpactRegionName(impact.name);
    return candidate === target || (candidate.length > 1 && target.length > 1 && (candidate.startsWith(target) || target.startsWith(candidate)));
  });
}

function normalizeChina(collection: GenericFeatureCollection, impacts: TsunamiImpact[]): DetailedTsunamiRegionCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      const name = String(feature.properties?.地名 ?? feature.properties?.name ?? "");
      const impact = matchImpact(name, impacts);
      if (!impact) return [];
      return [{
        ...feature,
        properties: {
          code: String(feature.properties?.区划码 ?? feature.properties?.id ?? `CN-${name}`),
          name,
          country: "CN" as const,
          simulated: true as const,
          level: impact.level,
          heightM: impact.heightM,
        },
      }];
    }),
  };
}

function normalizeTaiwan(topology: GenericTopology, impacts: TsunamiImpact[]): DetailedTsunamiRegionCollection {
  const object = topology.objects?.counties;
  if (!object) throw new Error("台湾县市边界格式无效");
  const collection = topojsonFeature(topology as never, object as never) as GenericFeatureCollection;
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      const name = String(feature.properties?.COUNTYNAME ?? "");
      const impact = matchImpact(name, impacts);
      if (!impact) return [];
      return [{
        ...feature,
        properties: {
          code: `TW-${String(feature.properties?.COUNTYCODE ?? feature.properties?.COUNTYID ?? name)}`,
          name,
          country: "TW" as const,
          simulated: true as const,
          level: impact.level,
          heightM: impact.heightM,
        },
      }];
    }),
  };
}

function normalizeKorea(topology: GenericTopology, impacts: TsunamiImpact[]): DetailedTsunamiRegionCollection {
  const object = topology.objects?.region;
  if (!object) throw new Error("韩国行政区边界格式无效");
  const collection = topojsonFeature(topology as never, object as never) as GenericFeatureCollection;
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      const name = String(feature.properties?.name ?? "");
      const impact = matchImpact(name, impacts);
      if (!impact) return [];
      return [{
        ...feature,
        properties: {
          code: `KR-${name}`,
          name,
          country: "KR" as const,
          simulated: true as const,
          level: impact.level,
          heightM: impact.heightM,
        },
      }];
    }),
  };
}

export async function loadDetailedTsunamiRegions(impacts: TsunamiImpact[], signal?: AbortSignal): Promise<DetailedTsunamiRegionCollection> {
  const byCountry = new Map([
    ["CN", impacts.filter((impact) => impact.country === "CN")],
    ["TW", impacts.filter((impact) => impact.country === "TW")],
    ["KR", impacts.filter((impact) => impact.country === "KR")],
  ] as const);
  const tasks: Array<Promise<DetailedTsunamiRegionCollection>> = [];
  if (byCountry.get("CN")?.length) {
    tasks.push(fetchJson<GenericFeatureCollection>(chinaPrefectureGeoJsonUrl, "中国沿海地级市边界", signal).then((data) => normalizeChina(data, byCountry.get("CN") ?? [])));
  }
  if (byCountry.get("TW")?.length) {
    tasks.push(fetchJson<GenericTopology>(taiwanCountyTopologyUrl, "台湾沿海县市边界", signal).then((data) => normalizeTaiwan(data, byCountry.get("TW") ?? [])));
  }
  if (byCountry.get("KR")?.length) {
    tasks.push(fetchJson<GenericTopology>("/data/kr.eew.topo.json", "韩国沿海行政区边界", signal).then((data) => normalizeKorea(data, byCountry.get("KR") ?? [])));
  }
  const collections = await Promise.all(tasks);
  return { type: "FeatureCollection", features: collections.flatMap((collection) => collection.features) };
}
