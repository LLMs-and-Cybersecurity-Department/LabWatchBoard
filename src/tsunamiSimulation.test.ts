import { describe, expect, it } from "vitest";

import {
  estimateTsunamiHeightM,
  inferTsunamiSourceBasin,
  simulateEastAsiaTsunami,
  simulationReportTimeline,
  simulationToJmaSnapshot,
  tsunamiHaversineKm,
  tsunamiImpactStatus,
  tsunamiMeanLongitude,
  tsunamiTravelSeconds,
  type TsunamiScenario,
} from "./tsunamiSimulation";

function scenario(overrides: Partial<TsunamiScenario> = {}): TsunamiScenario {
  const base: TsunamiScenario = {
    id: "test-nankai",
    place: "南海海槽",
    latitude: 32.8,
    longitude: 135.2,
    magnitude: 8.5,
    depthKm: 15,
    originTime: "2026-08-24T00:00:00.000Z",
    reportDelaySeconds: 180,
    conservativeBias: 60,
    countries: ["JP", "CN", "TW", "KR"],
    multiSource: false,
    sources: [{ id: "source-1", name: "南海海槽", latitude: 32.8, longitude: 135.2, reportCount: 3, reportIntervalSeconds: 10 }],
  };
  const merged = { ...base, ...overrides };
  if (!overrides.sources && (overrides.latitude !== undefined || overrides.longitude !== undefined)) {
    merged.sources = [{ ...base.sources[0], latitude: merged.latitude, longitude: merged.longitude }];
  }
  return merged;
}

describe("lightweight East Asia tsunami simulation", () => {
  it("keeps distance and travel time monotonic", () => {
    const near = tsunamiHaversineKm(32.8, 135.2, 33.8, 135.4);
    const far = tsunamiHaversineKm(32.8, 135.2, 39.5, 141.9);
    expect(far).toBeGreaterThan(near);
    expect(tsunamiTravelSeconds(far)).toBeGreaterThan(tsunamiTravelSeconds(near));
  });

  it("keeps a multi-source camera center near the antimeridian", () => {
    expect(Math.abs(tsunamiMeanLongitude([179, -179]))).toBeGreaterThan(179);
  });

  it("classifies Nankai on the Pacific side and Japan Sea sources separately", () => {
    expect(inferTsunamiSourceBasin(32.8, 135.2)).toBe("pacific");
    expect(inferTsunamiSourceBasin(38.2, 137.7)).toBe("japan-sea");
  });

  it("increases height for larger and shallower events", () => {
    const distanceKm = 180;
    const moderate = estimateTsunamiHeightM({ magnitude: 7.2, depthKm: 40, conservativeBias: 50 }, distanceKm, 1, 1);
    const strong = estimateTsunamiHeightM({ magnitude: 8.5, depthKm: 15, conservativeBias: 50 }, distanceKm, 1, 1);
    const deep = estimateTsunamiHeightM({ magnitude: 8.5, depthKm: 140, conservativeBias: 50 }, distanceKm, 1, 1);
    expect(strong).toBeGreaterThan(moderate);
    expect(strong).toBeGreaterThan(deep);
  });

  it("produces ordered Japan and East Asia coastal impacts for a shallow M8.5 Nankai scenario", () => {
    const result = simulateEastAsiaTsunami(scenario());
    expect(result.maximumLevel).toBeGreaterThanOrEqual(2);
    expect(result.impacts.some((impact) => impact.country === "JP")).toBe(true);
    expect(result.impacts.some((impact) => impact.country === "CN" || impact.country === "TW" || impact.country === "KR")).toBe(true);
    expect(result.impacts.every((impact) => impact.arrivalSeconds > 0 && impact.heightM >= 0.2)).toBe(true);
  });

  it("does not invent a tsunami for a deep moderate event", () => {
    const result = simulateEastAsiaTsunami(scenario({ magnitude: 6, depthKm: 220 }));
    expect(result.maximumLevel).toBe(0);
    expect(result.impacts).toHaveLength(0);
  });

  it("respects selected countries and report timing", () => {
    const result = simulateEastAsiaTsunami(scenario({ countries: ["TW"], latitude: 23.6, longitude: 122.3, magnitude: 8 }));
    expect(result.impacts.length).toBeGreaterThan(0);
    expect(result.impacts.every((impact) => impact.country === "TW")).toBe(true);
    expect(simulationToJmaSnapshot(result, 179)).toBeNull();
    const snapshot = simulationToJmaSnapshot(result, 180);
    expect(snapshot?.active).toBe(true);
    expect(snapshot?.areas).toHaveLength(0);
  });

  it("advances a coast from forecast to arrived and observing", () => {
    const result = simulateEastAsiaTsunami(scenario({ countries: ["JP"] }));
    const impact = result.impacts[0];
    expect(impact).toBeDefined();
    expect(tsunamiImpactStatus(impact, 0).kind).toMatch(/forecast|imminent/);
    expect(tsunamiImpactStatus(impact, impact.arrivalSeconds).kind).toBe("arrived");
    expect(tsunamiImpactStatus(impact, impact.arrivalSeconds + 16 * 60).kind).toBe("observing");
  });

  it("orders multi-source origins and expands each source into its requested reports", () => {
    const result = simulateEastAsiaTsunami(scenario({
      multiSource: true,
      sources: [
        { id: "a", name: "A", latitude: 32.8, longitude: 135.2, reportCount: 2, reportIntervalSeconds: 8 },
        { id: "b", name: "B", latitude: 33.1, longitude: 136.1, reportCount: 3, reportIntervalSeconds: 12 },
      ],
    }));
    const reports = simulationReportTimeline(result);
    expect(reports).toHaveLength(5);
    expect(reports.map((report) => report.serial)).toEqual([1, 2, 3, 4, 5]);
    expect(reports[2].place).toBe("B");
    expect(Date.parse(reports[0].announcedAt)).toBe(Date.parse(result.scenario.originTime));
    expect(Date.parse(reports[2].announcedAt) - Date.parse(result.scenario.originTime)).toBe(16 * 1000);
  });
});
