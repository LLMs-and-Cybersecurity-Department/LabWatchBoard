import { describe, expect, it } from "vitest";

import {
  buildDepthHistogram,
  buildMagnitudeHistogram,
  buildSourceHistogram,
  buildTimelineData,
  earthquakeBurstExpansion,
  filterShakeMapContours,
  filterEarthquakeEvents,
  formatMagnitudeType,
  isMechanismQueryable,
  isNiedQueryable,
  isShakeMapQueryable,
  mergeEarthquakeEventHistory,
  normalizeEarthquakeRefreshSeconds,
  shakeMapContourLevel,
  summarizeEarthquakeSourceAvailability,
  type EarthquakeShakeMap,
  type EarthquakeEvent,
  type EarthquakeSourceStatus,
} from "./earthquake";

const event = (overrides: Partial<EarthquakeEvent>): EarthquakeEvent => ({
  id: "usgs:1",
  source: "usgs",
  sourceEventId: "1",
  time: "2026-07-10T12:00:00.000Z",
  updatedAt: null,
  latitude: 31,
  longitude: 121,
  depthKm: 10,
  magnitude: 4.2,
  magnitudeType: "mb",
  place: "测试震中",
  status: "reviewed",
  intensity: null,
  intensityValue: null,
  intensityScale: null,
  reportedIntensity: null,
  felt: null,
  tsunami: false,
  alert: null,
  significance: null,
  agency: "USGS",
  url: "https://example.com",
  detailUrl: null,
  mechanismAvailable: false,
  shakeMapAvailable: false,
  note: null,
  ...overrides,
  pagerAvailable: overrides.pagerAvailable ?? false,
  dyfiAvailable: overrides.dyfiAvailable ?? false,
});

describe("earthquake dashboard data helpers", () => {
  it("allows official mechanism lookup only for confirmed USGS/CENC products and EMSC catalogue events", () => {
    expect(isMechanismQueryable(event({ mechanismAvailable: true }))).toBe(true);
    expect(isMechanismQueryable(event({ source: "emsc", mechanismAvailable: false }))).toBe(true);
    expect(isMechanismQueryable(event({ source: "cenc", mechanismAvailable: true }))).toBe(true);
    expect(isMechanismQueryable(event({ source: "cenc", mechanismAvailable: false }))).toBe(false);
    expect(isMechanismQueryable(event({ source: "jma", mechanismAvailable: false }))).toBe(false);
  });

  it("allows ShakeMap lookup only for confirmed USGS products", () => {
    expect(isShakeMapQueryable(event({ source: "usgs", shakeMapAvailable: true }))).toBe(true);
    expect(isShakeMapQueryable(event({ source: "usgs", shakeMapAvailable: false }))).toBe(false);
    expect(isShakeMapQueryable(event({ source: "jma", shakeMapAvailable: true }))).toBe(false);
  });

  it("filters official ShakeMap contours by independently selected MMI grades", () => {
    const shakeMap = {
      source: "usgs",
      eventId: "us7000test",
      productSource: "us",
      reviewStatus: "reviewed",
      issuedAt: "2026-07-18T00:00:00.000Z",
      updateTime: "2026-07-18T00:00:00.000Z",
      version: "1",
      maxMmi: 8.4,
      officialUrl: "https://earthquake.usgs.gov/",
      intensityImageUrl: null,
      intensityOverlayUrl: null,
      contours: {
        type: "FeatureCollection",
        features: [2, 4.4, 6.6, 9.8].map((value) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
          properties: { value, units: "mmi", color: "#fff", weight: 2 },
        })),
      },
      cache: "MISS",
    } satisfies EarthquakeShakeMap;

    expect(shakeMapContourLevel(1.1)).toBe(2);
    expect(shakeMapContourLevel(10.8)).toBe(10);
    expect(filterShakeMapContours(shakeMap, [2, 7]).features.map((feature) => feature.properties.value)).toEqual([2, 6.6]);
  });

  it("offers NIED lookup only inside the published F-net Japan-region coverage", () => {
    expect(isNiedQueryable(event({
      time: "2026-07-17T19:45:00.000Z",
      latitude: 35.7,
      longitude: 141.1,
    }))).toBe(true);
    expect(isNiedQueryable(event({
      time: "2026-07-17T19:45:00.000Z",
      latitude: 31.2,
      longitude: 103.8,
    }))).toBe(false);
  });

  it("normalizes common magnitude labels without changing their scales", () => {
    expect(["mw", "mb", "ml", "ms", "mi", "mj", "md", "m"].map(formatMagnitudeType)).toEqual([
      "Mw", "mb", "ML", "Ms", "Mi", "Mj", "Md", "M",
    ]);
  });

  it("filters by source, magnitude type and search text", () => {
    const events = [event({}), event({ id: "jma:2", source: "jma", agency: "JMA", magnitudeType: "Mj", place: "関東地方" })];
    expect(filterEarthquakeEvents(events, { sources: ["jma"], magnitudeType: "Mj", search: "関東" })).toHaveLength(1);
    expect(filterEarthquakeEvents(events, { sources: ["usgs"], magnitudeType: "Mw", search: "" })).toHaveLength(0);
  });

  it("filters institution reports by half-open magnitude class and selected agencies", () => {
    const events = [
      event({ id: "usgs:m4", magnitude: 4.9 }),
      event({ id: "jma:m5", source: "jma", magnitude: 5 }),
      event({ id: "cwa:m6", source: "cwa", magnitude: 6.8 }),
      event({ id: "usgs:m7", magnitude: 7.1 }),
    ];

    expect(filterEarthquakeEvents(events, {
      sources: ["usgs", "jma"],
      magnitudeType: "",
      search: "",
      minimumMagnitude: 5,
      maximumMagnitude: 7,
    })).toEqual([events[1]]);
    expect(filterEarthquakeEvents(events, {
      sources: ["usgs"],
      magnitudeType: "",
      search: "",
      minimumMagnitude: 7,
      maximumMagnitude: null,
    })).toEqual([events[3]]);
  });

  it("keeps ShakeAlert as a separate institution report source", () => {
    const events = [
      event({ id: "usgs:ci-test", source: "usgs", sourceEventId: "ci-test" }),
      event({ id: "shakealert:ew-test", source: "shakealert", sourceEventId: "ew-test", agency: "USGS ShakeAlert / EW" }),
    ];
    expect(filterEarthquakeEvents(events, { sources: ["shakealert"], magnitudeType: "", search: "EW-TEST" })).toEqual([events[1]]);
    expect(buildSourceHistogram(events).find((item) => item.source === "shakealert")?.count).toBe(1);
  });

  it("builds stable timeline, magnitude and depth bins", () => {
    const events = [
      event({ time: "2026-07-10T23:00:00.000Z", magnitude: 1.5, depthKm: 12 }),
      event({ id: "2", time: "2026-07-10T20:00:00.000Z", magnitude: 5.3, depthKm: 100 }),
      event({ id: "3", time: "2026-07-10T01:00:00.000Z", magnitude: 7.1, depthKm: 400 }),
    ];
    const timeline = buildTimelineData(events, "24h", "2026-07-11T00:00:00.000Z", "UTC");
    expect(timeline).toHaveLength(12);
    expect(timeline.reduce((sum, item) => sum + item.count, 0)).toBe(3);
    expect(buildMagnitudeHistogram(events).map((item) => item.count)).toEqual([1, 0, 0, 0, 1, 0, 1]);
    expect(buildDepthHistogram(events).map((item) => item.count)).toEqual([1, 0, 1, 1]);
    expect(buildTimelineData(events, "90d", "2026-07-11T00:00:00.000Z", "UTC")).toHaveLength(30);
  });

  it("scales the update burst monotonically with magnitude and animation progress", () => {
    expect(earthquakeBurstExpansion(7, 1)).toBeGreaterThan(earthquakeBurstExpansion(4, 1));
    expect(earthquakeBurstExpansion(7, 0.75)).toBeGreaterThan(earthquakeBurstExpansion(7, 0.25));
    expect(earthquakeBurstExpansion(7, -1)).toBe(0);
    expect(earthquakeBurstExpansion(7, 2)).toBe(earthquakeBurstExpansion(7, 1));
  });

  it("clamps the global feed refresh interval to one through sixty seconds", () => {
    expect(normalizeEarthquakeRefreshSeconds(0)).toBe(1);
    expect(normalizeEarthquakeRefreshSeconds(12.6)).toBe(13);
    expect(normalizeEarthquakeRefreshSeconds(100)).toBe(60);
    expect(normalizeEarthquakeRefreshSeconds("invalid")).toBe(60);
  });

  it("distinguishes live institution sources from retained cache", () => {
    const source = (status: EarthquakeSourceStatus["status"]): EarthquakeSourceStatus => ({
      id: "usgs",
      label: "USGS",
      organization: "USGS",
      url: "https://example.com",
      coverage: "global",
      status,
      count: 1,
      latencyMs: 12,
      error: status === "ok" ? null : "offline",
    });

    expect(summarizeEarthquakeSourceAvailability([source("ok"), source("ok")])).toEqual({
      onlineCount: 2,
      availableCount: 2,
      state: "online",
    });
    expect(summarizeEarthquakeSourceAvailability([source("stale"), source("error")])).toEqual({
      onlineCount: 0,
      availableCount: 1,
      state: "stale",
    });
    expect(summarizeEarthquakeSourceAvailability([source("error")]).state).toBe("error");
  });

  it("retains reports from temporarily missing institutions across catalogue polls", () => {
    const now = Date.UTC(2026, 6, 13);
    const cwa = event({ id: "cwa:1", source: "cwa", sourceEventId: "1", time: "2026-07-08T15:47:00.000Z", agency: "CWA" });
    const previousUsGs = event({ id: "usgs:1", updatedAt: "2026-07-12T23:00:00.000Z" });
    const updatedUsGs = event({ id: "usgs:1", updatedAt: "2026-07-12T23:30:00.000Z", magnitude: 4.4 });
    const merged = mergeEarthquakeEventHistory([cwa, previousUsGs], [updatedUsGs], now);

    expect(merged.find((report) => report.id === cwa.id)).toEqual(cwa);
    expect(merged.find((report) => report.id === updatedUsGs.id)?.magnitude).toBe(4.4);
    expect(merged.filter((report) => report.id === updatedUsGs.id)).toHaveLength(1);
  });

  it("keeps a confirmed mechanism flag when a later catalogue poll omits product types", () => {
    const now = Date.UTC(2026, 6, 13);
    const previous = event({ id: "usgs:mechanism", sourceEventId: "mechanism", mechanismAvailable: true });
    const incoming = event({ id: "usgs:mechanism", sourceEventId: "mechanism", mechanismAvailable: false, updatedAt: "2026-07-12T23:30:00.000Z" });

    expect(mergeEarthquakeEventHistory([previous], [incoming], now)[0].mechanismAvailable).toBe(true);
  });

  it("keeps a confirmed ShakeMap flag when a later catalogue poll omits product types", () => {
    const now = Date.UTC(2026, 6, 13);
    const previous = event({ id: "usgs:shakemap", sourceEventId: "shakemap", shakeMapAvailable: true });
    const incoming = event({ id: "usgs:shakemap", sourceEventId: "shakemap", shakeMapAvailable: false, updatedAt: "2026-07-12T23:30:00.000Z" });

    expect(mergeEarthquakeEventHistory([previous], [incoming], now)[0].shakeMapAvailable).toBe(true);
  });
});
