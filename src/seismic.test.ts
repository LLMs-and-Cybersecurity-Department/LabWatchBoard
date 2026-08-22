import { describe, expect, it } from "vitest";

import {
  advanceMovieCameraQueue,
  buildGlobalImpactContours,
  buildNiedDetectionGridCells,
  buildStationNeighborMap,
  buildInstitutionHistoryReports,
  calculateJmaShindo,
  calculateLocalIntensity,
  cencIntensityColor,
  collapseEewHistoryEvents,
  constrainHypocenterEstimate,
  estimateGroundMotion,
  eewReportKey,
  haversineKm,
  inferHypocenter,
  intensityRomanLabel,
  institutionReportToLiveEew,
  enrichLiveEewWithOfficialAreas,
  jmaShindoColor,
  jmaShindoLabel,
  jmaShindoRank,
  jmaTsunamiReplayDurationSeconds,
  jmaTsunamiLineStyle,
  jmaTsunamiSnapshotAt,
  estimateLocalIntensity,
  mergeEewHistory,
  matchOfficialHypocenter,
  matchJmaTsunamiReplayEpisode,
  meetsEewMagnitudeThreshold,
  niedCharToLevel,
  niedGridColor,
  niedLevelLabel,
  niedSoundCueForRise,
  niedSoundIndex,
  niedStationDisplayColor,
  isLiveEewActive,
  isReplayPropagationActive,
  shouldDisplayLiveWavefront,
  normalizeFanEewEnvelope,
  normalizeCencIntensityDetail,
  normalizeCencIntensityList,
  normalizeWolfxEew,
  parseKmaTimestamp,
  prepareReplayStationResponse,
  replayNiedSoundIndex,
  selectAutoLocatedGlobalEvent,
  selectAutoLocatedGlobalEvents,
  mmiIntensityColor,
  simulateJmaRegionImpact,
  simulatePreparedReplayStationResponse,
  simulateReplayStationResponse,
  seismicWaveArrivalSeconds,
  filterEewHistoryEventsBySource,
  geodesicCircleCoordinates,
  updateKmaPewsDetection,
  updateNiedShakeDetection,
  usesShindoScaleForLocation,
  waveRadiusKm,
  type KmaStation,
  type JmaTsunamiSnapshot,
  type LiveEew,
  type SeismicStation,
  type TriggerObservation,
} from "./seismic";

describe("seismic client calculations", () => {
  it("matches the kanameishi JMA and China intensity equations", () => {
    const event = {
      latitude: 35.45,
      longitude: 139.65,
      depthKm: 20,
      magnitude: 5.6,
    };
    const tokyo = { latitude: 35.681, longitude: 139.767, arv: 1.4 };

    expect(calculateJmaShindo(event, tokyo)).toBeCloseTo(3.765633284755329, 10);
    expect(calculateLocalIntensity(event, tokyo)).toBeCloseTo(5.726231056770003, 10);
    expect(jmaShindoRank(calculateJmaShindo(event, tokyo))).toBe(4);
  });

  it("uses Roman labels for intensity and numeric labels for JMA shindo", () => {
    expect(intensityRomanLabel(1)).toBe("I");
    expect(intensityRomanLabel(8.2)).toBe("VIII");
    expect(intensityRomanLabel(10.4)).toBe("\u2265X");
    expect(jmaShindoLabel(5)).toBe("5-");
    expect(jmaShindoLabel(5.5)).toBe("5+");
    expect(jmaShindoLabel(6)).toBe("6-");
    expect(jmaShindoColor(5.5)).toBe("#ff4f00");
    expect(mmiIntensityColor(8)).toBe("#ff4f00");
  });

  it("ends live wavefronts at final/detail reports and at the 300 second cutoff", () => {
    const originTime = Date.parse("2026-08-23T00:00:00.000Z");
    const report: LiveEew = {
      id: "JMA:test-wavefront",
      source: "JMA",
      title: "緊急地震速報",
      serial: 1,
      announcedAt: new Date(originTime + 5_000).toISOString(),
      originTime: new Date(originTime).toISOString(),
      place: "测试震中",
      latitude: 35,
      longitude: 135,
      depthKm: 10,
      magnitude: 5.5,
      maxIntensity: "4",
      final: false,
      warning: true,
      cancelled: false,
      assumption: false,
      relay: "Wolfx",
    };

    expect(shouldDisplayLiveWavefront(report, originTime + 299_999)).toBe(true);
    expect(shouldDisplayLiveWavefront(report, originTime + 300_000)).toBe(false);
    expect(shouldDisplayLiveWavefront({ ...report, final: true }, originTime + 20_000)).toBe(false);
    expect(shouldDisplayLiveWavefront({ ...report, observedIntensity: true }, originTime + 20_000)).toBe(false);
    expect(shouldDisplayLiveWavefront({ ...report, cancelled: true }, originTime + 20_000)).toBe(false);
    expect(shouldDisplayLiveWavefront({ ...report, final: true, relay: "Catalogue" }, originTime + 20_000, false)).toBe(true);
  });

  it("closes replay propagation when the visible clock reaches 300 seconds", () => {
    expect(isReplayPropagationActive(0)).toBe(false);
    expect(isReplayPropagationActive(0.01)).toBe(true);
    expect(isReplayPropagationActive(299.994)).toBe(true);
    expect(isReplayPropagationActive(299.996)).toBe(false);
    expect(isReplayPropagationActive(300)).toBe(false);
    expect(isReplayPropagationActive(Number.NaN)).toBe(false);
  });

  it("uses shindo only for events in Japan and Taiwan", () => {
    expect(usesShindoScaleForLocation({ latitude: 35.68, longitude: 139.77 })).toBe(true);
    expect(usesShindoScaleForLocation({ latitude: 23.72, longitude: 121.62 })).toBe(true);
    expect(usesShindoScaleForLocation({ latitude: 4.6, longitude: -74.1 })).toBe(false);
    expect(usesShindoScaleForLocation({ latitude: 37.5, longitude: 127.0 })).toBe(false);
  });

  it("uses the official JMA tsunami map colors and stronger warning strokes", () => {
    expect(jmaTsunamiLineStyle(1)).toMatchObject({ color: "#ffff00", weight: 5 });
    expect(jmaTsunamiLineStyle(2)).toMatchObject({ color: "#ff0000", weight: 6 });
    expect(jmaTsunamiLineStyle(3)).toMatchObject({ color: "#ff00ff", weight: 7 });
  });

  it("matches JMA tsunami history to an earthquake and replays through cancellation", () => {
    const report = (
      id: string,
      issuedAt: string,
      level: 0 | 1 | 2 | 3,
      cancelled = false,
    ): JmaTsunamiSnapshot => ({
      provider: "P2P地震信息 / 气象厅",
      source: "JMA",
      sourceState: "online",
      sourceUrl: "https://example.test/jma",
      relayUrl: "https://example.test/p2p",
      fetchedAt: issuedAt,
      issuedAt,
      reportId: id,
      reportType: "Focus",
      cancelled,
      active: level > 0,
      level,
      state: level === 3 ? "major-warning" : level === 2 ? "warning" : level === 1 ? "advisory" : "clear",
      title: cancelled ? "当前无海啸警报或注意报" : "海啸警报发布中",
      stale: false,
      cache: "LIVE",
      areas: level > 0 ? [{
        name: "岩手県",
        grade: level === 3 ? "MajorWarning" : level === 2 ? "Warning" : "Watch",
        level: level as 1 | 2 | 3,
        immediate: false,
        arrivalTime: null,
        arrivalCondition: null,
        maxHeightM: null,
        maxHeightDescription: null,
      }] : [],
    });
    const originTime = "2026-07-17T17:00:00.000Z";
    const episode = matchJmaTsunamiReplayEpisode(originTime, [
      report("cancel", "2026-07-17T18:00:00.000Z", 0, true),
      report("warning", "2026-07-17T17:10:00.000Z", 2),
    ]);

    expect(episode?.reports.map((item) => item.reportId)).toEqual(["warning", "cancel"]);
    expect(jmaTsunamiSnapshotAt(episode, 599)).toBeNull();
    expect(jmaTsunamiSnapshotAt(episode, 600)?.reportId).toBe("warning");
    expect(jmaTsunamiSnapshotAt(episode, 3_600)?.cancelled).toBe(true);
    expect(jmaTsunamiReplayDurationSeconds(originTime, episode)).toBe(3_660);
  });

  it("only uses the extended tsunami match window for events flagged by a catalogue", () => {
    const delayed = {
      provider: "P2P地震信息 / 气象厅",
      source: "JMA",
      sourceState: "online",
      sourceUrl: "",
      relayUrl: "",
      fetchedAt: "2026-07-17T20:00:00.000Z",
      issuedAt: "2026-07-17T20:00:00.000Z",
      reportId: "delayed",
      reportType: null,
      cancelled: false,
      active: true,
      level: 1,
      state: "advisory",
      title: "海啸注意报发布中",
      stale: false,
      cache: "LIVE",
      areas: [],
    } satisfies JmaTsunamiSnapshot;
    const originTime = "2026-07-17T17:00:00.000Z";

    expect(matchJmaTsunamiReplayEpisode(originTime, [delayed])).toBeNull();
    expect(matchJmaTsunamiReplayEpisode(originTime, [delayed], true)?.reports).toHaveLength(1);
  });

  it("keeps local JMA regions forecast-visible and marks S-wave arrival", () => {
    const event = {
      latitude: 35.45,
      longitude: 139.65,
      depthKm: 20,
      magnitude: 5.6,
    };
    const sites = [[35.681, 139.767, 1.4]] as const;
    const before = simulateJmaRegionImpact(event, [...sites], 1);
    const after = simulateJmaRegionImpact(event, [...sites], 30);

    expect(before).not.toBeNull();
    expect(before!.rank).toBe(4);
    expect(before!.currentRank).toBe(0);
    expect(before!.arrived).toBe(false);
    expect(after!.arrived).toBe(true);
    expect(after!.currentRank).toBe(4);
    expect(after!.firstSArrivalSeconds).toBeGreaterThan(9);
  });

  it("builds global impact contours and advances only the S-wave reached area", () => {
    const taiwanEvent = {
      latitude: 23.72,
      longitude: 121.62,
      depthKm: 18,
      magnitude: 4.5,
    };
    const before = buildGlobalImpactContours(taiwanEvent, 0, "shindo");
    const after = buildGlobalImpactContours(taiwanEvent, 90, "shindo");

    expect(before.length).toBeGreaterThanOrEqual(2);
    expect(before.every((contour) => contour.scale === "shindo" && !contour.arrived && contour.currentRadiusKm === 0)).toBe(true);
    expect(before.map((contour) => contour.radiusKm)).toEqual([...before.map((contour) => contour.radiusKm)].sort((a, b) => b - a));
    expect(after.every((contour) => contour.arrived && contour.currentRadiusKm > 0)).toBe(true);

    const intensity = buildGlobalImpactContours({ ...taiwanEvent, magnitude: 6.8 }, null, "intensity");
    expect(intensity.length).toBeGreaterThan(before.length);
    expect(intensity.every((contour) => contour.scale === "intensity" && contour.currentRadiusKm === contour.radiusKm)).toBe(true);
  });

  it("creates closed geodesic contour polygons without a dateline jump", () => {
    const center = { latitude: 23.72, longitude: 179.8 };
    const coordinates = geodesicCircleCoordinates(center, 120, 48);
    expect(coordinates).toHaveLength(49);
    expect(coordinates[coordinates.length - 1]).toEqual(coordinates[0]);
    expect(haversineKm(center, { latitude: coordinates[0][1], longitude: coordinates[0][0] })).toBeCloseTo(120, 1);
    expect(Math.max(...coordinates.slice(1).map((coordinate, index) => Math.abs(coordinate[0] - coordinates[index][0])))).toBeLessThan(10);
  });

  it("decodes NIED compact intensity characters", () => {
    expect(niedCharToLevel("d")).toBe(0);
    expect(niedCharToLevel("t")).toBe(16);
    expect(niedLevelLabel(niedCharToLevel("t"))).toBe("5-");
    expect(niedLevelLabel(niedCharToLevel("x"))).toBe("7");
  });

  it("builds independent one-degree NIED detection cells with severity colors", () => {
    const stations: SeismicStation[] = [
      [33.2, 130.2],
      [33.4, 130.4],
      [33.3, 131.3],
      [34.3, 131.4],
    ].map(([latitude, longitude], index) => ({
      id: `nied:${index}`,
      index,
      latitude,
      longitude,
      network: "NIED",
      stationCode: `T${index}`,
      stationName: `测试站 ${index}`,
      prefecture: "测试",
      metadataMatched: true,
    }));
    const cells = buildNiedDetectionGridCells(
      stations,
      stations.map((station) => station.id),
      { "nied:0": 1, "nied:1": 1, "nied:2": 2, "nied:3": 4 },
      { latitude: 0.2, longitude: 0.2 },
    );

    expect(cells).toHaveLength(3);
    expect(cells.map((cell) => cell.color).sort()).toEqual(["green", "red", "yellow"]);
    expect(cells.every((cell) => cell.bounds[1][0] - cell.bounds[0][0] === 1)).toBe(true);
    expect(cells.every((cell) => cell.bounds[1][1] - cell.bounds[0][1] === 1)).toBe(true);
    expect(niedGridColor(1)).toBe("green");
    expect(niedGridColor(2)).toBe("yellow");
    expect(niedGridColor(4)).toBe("red");
  });

  it("changes active NIED stations from the raw blue scale to visible JMA colors", () => {
    expect(niedStationDisplayColor(0, null)).toBe("#0003cf");
    expect(niedStationDisplayColor(0, 0)).toBe("#31f049");
    expect(niedStationDisplayColor(10, 2)).toBe("#38bdf8");
    expect(niedStationDisplayColor(14, 4)).toBe("#facc15");
  });

  it("plays SREV NIED audio only when the maximum intensity rises", () => {
    expect(niedSoundIndex(-1)).toBe(-1);
    expect(niedSoundIndex(7)).toBe(0);
    expect(niedSoundIndex(10)).toBe(2);
    expect(niedSoundIndex(14)).toBe(4);
    expect(niedSoundCueForRise(-1, 0, true)).toBe("shindo0");
    expect(niedSoundCueForRise(2, 2, true)).toBeNull();
    expect(niedSoundCueForRise(4, 2, true)).toBeNull();
    expect(niedSoundCueForRise(2, 4, true)).toBe("shindo4");
    expect(niedSoundCueForRise(6, 7, true)).toBe("shindo6");
    expect(niedSoundCueForRise(-1, 2, false)).toBeNull();
    expect(replayNiedSoundIndex(null)).toBe(-1);
    expect(replayNiedSoundIndex({ activeStationIds: [], maxRank: 4 })).toBe(-1);
    expect(replayNiedSoundIndex({ activeStationIds: ["nied:1"], maxRank: 0.75 })).toBe(0);
    expect(replayNiedSoundIndex({ activeStationIds: ["nied:1"], maxRank: 4.9 })).toBe(4);
    expect(replayNiedSoundIndex({ activeStationIds: ["nied:1"], maxRank: 7.8 })).toBe(7);
  });

  it("normalizes a relayed JMA EEW without hiding relay provenance", () => {
    const event = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20260710012200",
      Serial: 6,
      AnnouncedTime: "2026/07/10 01:22:52",
      OriginTime: "2026/07/10 01:21:43",
      Hypocenter: "宫古岛西北近海",
      Latitude: 25.5,
      Longitude: 125,
      Magunitude: 4.4,
      Depth: 100,
      MaxIntensity: "2",
      isFinal: true,
    });
    expect(event).toMatchObject({ id: "JMA:20260710012200", source: "JMA", serial: 6, magnitude: 4.4, relay: "Wolfx", final: true });
    expect(event?.originTime).toBe("2026-07-09T16:21:43.000Z");
  });

  it("retains JMA official affected regions from the relayed warning", () => {
    const event = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20240808164303",
      Serial: 4,
      AnnouncedTime: "2026/07/12 10:42:10",
      OriginTime: "2026/07/12 10:42:00",
      Hypocenter: "日向滩",
      Latitude: 31.8,
      Longitude: 131.7,
      Magunitude: 7.2,
      Depth: 20,
      MaxIntensity: "6强",
      WarnArea: [
        { Chiiki: "宫崎县南部平原", Shindo1: "6弱", Type: "警报" },
        { Chiiki: "鹿儿岛县大隅", Shindo1: "5强", Type: "警报" },
      ],
      isWarn: true,
    });

    expect(event?.affectedAreas).toEqual([
      { name: "宫崎县南部平原", intensity: "6弱", rank: 6, warning: true },
      { name: "鹿儿岛县大隅", intensity: "5强", rank: 5.5, warning: true },
    ]);
  });

  it("retains distinct warning reports while deduplicating relay repeats", () => {
    const report = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20260710012200",
      Serial: 5,
      AnnouncedTime: "2026/07/10 01:22:40",
      OriginTime: "2026/07/10 01:21:43",
      Hypocenter: "宫古岛西北近海",
      Latitude: 25.5,
      Longitude: 125,
    })!;
    const finalReport = { ...report, serial: 6, announcedAt: "2026-07-09T16:22:52.000Z", final: true };
    const history = mergeEewHistory(mergeEewHistory([], report), finalReport);
    expect(history).toHaveLength(2);
    expect(history.map((item) => item.serial)).toEqual([6, 5]);
    expect(mergeEewHistory(history, finalReport)).toHaveLength(2);
    expect(eewReportKey(finalReport)).toContain(":6:");
  });

  it("collapses every report and relay copy for one earthquake into one history event", () => {
    const report = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20260712013907",
      Serial: 1,
      AnnouncedTime: "2026/07/12 10:39:15",
      OriginTime: "2026/07/12 10:39:07",
      Hypocenter: "钏路地方",
      Latitude: 43.282,
      Longitude: 144.51,
      Magunitude: 4.0,
      Depth: 100,
    })!;
    const finalReport = {
      ...report,
      serial: 4,
      announcedAt: "2026-07-12T01:40:12.000Z",
      magnitude: 4.2,
      final: true,
    };
    const relayCopy = {
      ...finalReport,
      id: "JMA:fan-202607120139",
      relay: "FAN" as const,
      announcedAt: "2026-07-12T01:40:13.000Z",
    };

    const events = collapseEewHistoryEvents([report, finalReport, relayCopy]);

    expect(events).toHaveLength(1);
    expect(events[0].latestReport.serial).toBe(4);
    expect(events[0].reportCount).toBe(2);
    expect(events[0].reports.map((item) => item.serial)).toEqual([4, 1]);
  });

  it("attaches only a nearby same-source official hypocenter to the history event", () => {
    const report = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20260712013907",
      Serial: 3,
      AnnouncedTime: "2026/07/12 10:40:00",
      OriginTime: "2026/07/12 10:39:07",
      Hypocenter: "钏路地方",
      Latitude: 43.282,
      Longitude: 144.51,
      Magunitude: 4.2,
      Depth: 102,
    })!;
    const official = {
      id: "jma:20260712013907",
      source: "jma",
      sourceEventId: "20260712013907",
      time: "2026-07-12T01:39:08.000Z",
      updatedAt: "2026-07-12T01:43:00.000Z",
      latitude: 43.29,
      longitude: 144.5,
      depthKm: 103,
      magnitude: 4.2,
      magnitudeType: "Mj",
      place: "钏路地方",
      status: "发布",
      agency: "気象庁",
      url: "https://www.data.jma.go.jp/example.xml",
    };
    const unrelated = {
      ...official,
      id: "jma:other",
      sourceEventId: "other",
      time: "2026-07-12T03:39:08.000Z",
      latitude: 35,
      longitude: 139,
    };

    expect(matchOfficialHypocenter(report, [unrelated])).toBeNull();
    expect(matchOfficialHypocenter(report, [unrelated, official])?.id).toBe(official.id);
    expect(collapseEewHistoryEvents([report], [official])[0].officialHypocenter?.depthKm).toBe(103);
  });

  it("expires live warning markers while retaining their history reports", () => {
    const report = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20260712010000",
      Serial: 3,
      AnnouncedTime: "2026/07/12 01:01:00",
      OriginTime: "2026/07/12 01:00:30",
      Hypocenter: "测试震中",
      Latitude: 35.5,
      Longitude: 139.5,
      Magunitude: 4.2,
      isWarn: false,
    })!;
    const announcedAt = Date.parse(report.announcedAt);

    expect(isLiveEewActive(report, announcedAt + 4 * 60_000)).toBe(true);
    expect(isLiveEewActive(report, announcedAt + 4.2 * 60_000 + 1)).toBe(false);
    expect(isLiveEewActive({ ...report, warning: true }, announcedAt + 5 * 60_000)).toBe(true);
    expect(isLiveEewActive({ ...report, warning: true }, announcedAt + 6 * 60_000 + 1)).toBe(false);
    expect(isLiveEewActive({ ...report, cancelled: true }, announcedAt + 19_999)).toBe(true);
    expect(isLiveEewActive({ ...report, cancelled: true }, announcedAt + 20_001)).toBe(false);
  });

  it("auto-locates only the newest active global catalogue event above the chosen magnitude", () => {
    const now = Date.parse("2026-07-18T02:30:00.000Z");
    const event = (id: string, magnitude: number, originOffsetMinutes: number, overrides = {}) => ({
      id,
      source: "USGS" as const,
      title: "机构地震报告",
      serial: 1,
      announcedAt: new Date(now + originOffsetMinutes * 60_000 + 20_000).toISOString(),
      originTime: new Date(now + originOffsetMinutes * 60_000).toISOString(),
      place: id,
      latitude: 10,
      longitude: 120,
      depthKm: 20,
      magnitude,
      maxIntensity: "未提供",
      final: true,
      warning: false,
      cancelled: false,
      assumption: false,
      relay: "Catalogue" as const,
      ...overrides,
    });
    const events = [
      event("older-large", 6.2, -2),
      event("newest-qualified", 5.4, -1),
      event("newest-below-threshold", 4.9, -0.5),
      event("expired", 7.1, -20),
      event("cancelled", 7.5, -0.25, { cancelled: true }),
      event("regional-relay", 8, -0.1, { relay: "Wolfx" as const }),
    ];

    expect(selectAutoLocatedGlobalEvent(events, 5, now)?.id).toBe("newest-qualified");
    expect(selectAutoLocatedGlobalEvent(events, 6, now)?.id).toBe("older-large");
    expect(selectAutoLocatedGlobalEvent(events, 7, now)).toBeNull();
    expect(selectAutoLocatedGlobalEvents([
      ...events,
      event("authorized-global", 6.7, -0.2, { relay: "Authorized" as const, source: "GLOBALQUAKE" as const }),
      event("authorized-global", 6.7, -0.2, {
        relay: "Authorized" as const,
        source: "GLOBALQUAKE" as const,
        serial: 2,
        announcedAt: new Date(now - 1_000).toISOString(),
      }),
    ], 5, now).map((item) => `${item.id}:${item.serial}`)).toEqual([
      "authorized-global:2",
      "newest-qualified:1",
      "older-large:1",
    ]);
  });

  it("keeps receive and auto-locate magnitude gates independently usable from M1 through M9", () => {
    expect(meetsEewMagnitudeThreshold({ magnitude: 1 }, 1)).toBe(true);
    expect(meetsEewMagnitudeThreshold({ magnitude: 3.6 }, 4)).toBe(false);
    expect(meetsEewMagnitudeThreshold({ magnitude: 9 }, 9)).toBe(true);
    expect(meetsEewMagnitudeThreshold({ magnitude: null }, 1)).toBe(false);
    expect(meetsEewMagnitudeThreshold({ magnitude: null, observedIntensity: true }, 9)).toBe(true);
  });

  it("keeps JMA ScalePrompt areas visible before the hypocenter is known", () => {
    const report = normalizeWolfxEew({
      type: "jma_intensity",
      EventID: "2026/08/19 23:50:28",
      Serial: 1,
      AnnouncedTime: "2026/08/19 23:51:10",
      OriginTime: "2026/08/19 23:50:28",
      Hypocenter: "震源待定",
      Latitude: null,
      Longitude: null,
      Magunitude: null,
      Depth: null,
      MaxIntensity: "3",
      isFinal: false,
      isCancel: false,
      WarnArea: [{ Chiiki: "北海道", Shindo1: "3", Type: "观测", warning: false }],
      observedIntensity: true,
    });
    expect(report).toMatchObject({ observedIntensity: true, hypocenterKnown: false, place: "震源待定" });
    expect(report?.affectedAreas).toEqual([{ name: "北海道", intensity: "3", rank: 3, warning: false }]);
    const now = Date.parse("2026-08-19T14:51:10.000Z");
    expect(isLiveEewActive(report!, now)).toBe(true);
    expect(isLiveEewActive(report!, now + 20 * 60_000)).toBe(true);
    expect(isLiveEewActive(report!, now + 30 * 60_000 + 1)).toBe(false);
  });

  it("preempts the movie camera for new earthquakes and resumes round-robin after five seconds", () => {
    const now = Date.parse("2026-07-19T12:00:00.000Z");
    const event = (id: string, announcedOffset: number) => ({
      id,
      source: "GLOBALQUAKE" as const,
      title: "Authorized warning",
      serial: 1,
      announcedAt: new Date(now + announcedOffset).toISOString(),
      originTime: new Date(now + announcedOffset - 1_000).toISOString(),
      place: id,
      latitude: 10,
      longitude: 120,
      depthKm: 10,
      magnitude: 6,
      maxIntensity: "MMI VI",
      final: false,
      warning: true,
      cancelled: false,
      assumption: false,
      relay: "Authorized" as const,
    });
    const first = event("first", 0);
    const second = event("second", 1_000);
    const third = event("third", 2_000);
    let state = advanceMovieCameraQueue([first], { currentKey: null, enteredAt: 0, knownKeys: [] }, now);
    expect(state.currentKey).toContain("first:");

    state = advanceMovieCameraQueue([second, first], state, now + 1_000);
    expect(state.currentKey).toContain("second:");
    state = advanceMovieCameraQueue([second, first], state, now + 5_999);
    expect(state.currentKey).toContain("second:");
    state = advanceMovieCameraQueue([second, first], state, now + 6_000);
    expect(state.currentKey).toContain("first:");

    state = advanceMovieCameraQueue([third, second, first], state, now + 6_100);
    expect(state.currentKey).toContain("third:");
    expect(state.knownKeys).toHaveLength(3);
    state = advanceMovieCameraQueue([second, first], state, now + 6_200);
    expect(state.currentKey).toContain("second:");
    expect(state.knownKeys).toHaveLength(2);
  });

  it("normalizes FAN current snapshots and subsequent warning updates", () => {
    const initial = normalizeFanEewEnvelope({
      type: "initial_all",
      jma: { Data: { id: "jma-1", updates: 3, shockTime: "2026-07-12 01:00:00", createTime: "2026-07-12 01:00:45", latitude: 35, longitude: 139, magnitude: 4.8, depth: 20, placeName: "关东", epiIntensity: "4", infoTypeName: "予報", final: true, cancel: false } },
      "cwa-eew": { Data: { id: "cwa-1", updates: 2, shockTime: "2026-07-12 00:55:00", createTime: "2026-07-12 00:55:20", latitude: 23.8, longitude: 121.4, magnitude: 5.1, depth: 12, placeName: "花莲", maxIntensity: "5弱" } },
      cea: { Data: { eventId: "cea-1", updates: 1, shockTime: "2026-07-12 00:50:00", updateTime: "2026-07-12 00:50:15", latitude: 30.1, longitude: 103.2, magnitude: 4.2, depth: 10, placeName: "四川", epiIntensity: 5.3 } },
      "kma-eew": { Data: { id: "kma-1", updates: 4, shockTime: "2026-07-12 00:45:00", createTime: "2026-07-12 00:45:30", latitude: 36.2, longitude: 128.2, magnitude: 4.0, depth: 8, placeName: "韩国中部", epiIntensity: 5 } },
    });

    expect(initial).toHaveLength(4);
    expect(initial.map((event) => event.source)).toEqual(["JMA", "CWA", "CENC", "KMA"]);
    expect(initial.every((event) => event.relay === "FAN")).toBe(true);

    const update = normalizeFanEewEnvelope({
      type: "update",
      source: "cea",
      Data: { eventId: "cea-1", updates: 2, shockTime: "2026-07-12 00:50:00", updateTime: "2026-07-12 00:50:25", latitude: 30.2, longitude: 103.3, magnitude: 4.4, depth: 9, placeName: "四川", epiIntensity: 5.7 },
    });
    expect(update).toHaveLength(1);
    expect(update[0]).toMatchObject({ source: "CENC", serial: 2, relay: "FAN", magnitude: 4.4 });
  });

  it("converts every supported institution report into a catalogue-backed live event", () => {
    const report = institutionReportToLiveEew({
      id: "usgs:global-test",
      source: "usgs",
      sourceEventId: "global-test",
      time: "2026-07-13T00:39:00.000Z",
      updatedAt: "2026-07-13T00:40:00.000Z",
      latitude: -20.2,
      longitude: -175.1,
      depthKm: 18,
      magnitude: 6.1,
      magnitudeType: "mww",
      place: "汤加群岛",
      status: "reviewed",
      agency: "USGS",
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/global-test",
      intensity: "5.2",
      intensityScale: "MMI",
    });

    expect(report).toMatchObject({
      id: "USGS:global-test",
      source: "USGS",
      title: "机构地震报告",
      relay: "Catalogue",
      announcedAt: "2026-07-13T00:40:00.000Z",
      originTime: "2026-07-13T00:39:00.000Z",
      maxIntensity: "MMI 5.2",
      final: true,
      warning: false,
    });
  });

  it("enriches a matching live JMA event with official observed intensity areas", () => {
    const live = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "20260710100000",
      Serial: 4,
      AnnouncedTime: "2026/07/10 10:01:00",
      OriginTime: "2026/07/10 10:00:00",
      Latitude: 35.5,
      Longitude: 139.7,
      Magunitude: 5.1,
      WarnArea: [],
    })!;
    const enriched = enrichLiveEewWithOfficialAreas(live, [{
      id: "jma:20260710100000",
      source: "jma",
      sourceEventId: "20260710100000",
      time: "2026-07-10T01:00:00.000Z",
      updatedAt: "2026-07-10T01:03:00.000Z",
      latitude: 35.5,
      longitude: 139.7,
      depthKm: 20,
      magnitude: 5.1,
      magnitudeType: "Mj",
      place: "関東地方",
      status: "発表",
      agency: "JMA",
      url: "https://www.data.jma.go.jp/test.xml",
      affectedAreas: [{ name: "千葉県北東部", intensity: "5-", rank: 5, warning: false }],
    }]);

    expect(enriched?.affectedAreas).toEqual([
      { name: "千葉県北東部", intensity: "5-", rank: 5, warning: false },
    ]);
  });

  it("does not reactivate an old catalogue earthquake when an institution revises it", () => {
    const now = Date.UTC(2026, 6, 15, 2, 0, 0);
    const revised = institutionReportToLiveEew({
      id: "usgs:late-revision",
      source: "usgs",
      sourceEventId: "late-revision",
      time: new Date(now - 2 * 60 * 60_000).toISOString(),
      updatedAt: new Date(now - 20_000).toISOString(),
      latitude: 51.2,
      longitude: -178.4,
      depthKm: 25,
      magnitude: 7.1,
      magnitudeType: "mww",
      place: "阿留申群岛",
      status: "reviewed",
      agency: "USGS",
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/late-revision",
    })!;

    expect(isLiveEewActive(revised, now)).toBe(false);
    expect(isLiveEewActive({
      ...revised,
      id: "USGS:recent-origin",
      originTime: new Date(now - 60_000).toISOString(),
    }, now)).toBe(true);
  });

  it("keeps ShakeAlert catalogue records labelled as post-event performance reports", () => {
    const report = institutionReportToLiveEew({
      id: "shakealert:ew-test",
      source: "shakealert",
      sourceEventId: "ew-test",
      time: "2026-07-13T00:39:00.000Z",
      updatedAt: null,
      latitude: 34.1,
      longitude: -118.2,
      depthKm: 10,
      magnitude: 5.2,
      magnitudeType: "mw",
      place: "加利福尼亚州",
      status: "CONFIRMED",
      agency: "USGS ShakeAlert / EW",
      url: "https://earthquake.usgs.gov/data/shakealert/",
    });

    expect(report).toMatchObject({ source: "SHAKEALERT", title: "ShakeAlert 事后性能报告", warning: false });
  });

  it("filters warning history by institution without changing event grouping", () => {
    const jma = normalizeWolfxEew({
      type: "jma_eew",
      EventID: "jma-filter",
      Serial: 1,
      AnnouncedTime: "2026/07/13 09:00:10",
      OriginTime: "2026/07/13 09:00:00",
      Latitude: 35,
      Longitude: 139,
    })!;
    const usgs = institutionReportToLiveEew({
      id: "usgs:filter-test",
      source: "usgs",
      sourceEventId: "filter-test",
      time: "2026-07-13T00:00:00.000Z",
      updatedAt: null,
      latitude: 0,
      longitude: -20,
      depthKm: 10,
      magnitude: 5,
      magnitudeType: "mb",
      place: "大西洋",
      status: "reviewed",
      agency: "USGS",
      url: "https://earthquake.usgs.gov/",
    })!;
    const events = collapseEewHistoryEvents([jma, usgs]);

    expect(filterEewHistoryEventsBySource(events, "ALL")).toHaveLength(2);
    expect(filterEewHistoryEventsBySource(events, "USGS").map((event) => event.latestReport.source)).toEqual(["USGS"]);
    expect(filterEewHistoryEventsBySource(events, "CWA")).toEqual([]);
  });

  it("keeps low-volume institutions in history independently of busy global sources", () => {
    const now = Date.UTC(2026, 6, 13, 0);
    const records = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `usgs:busy-${index}`,
        source: "usgs",
        sourceEventId: `busy-${index}`,
        time: new Date(now - index * 60_000).toISOString(),
        updatedAt: null,
        latitude: 10 + index,
        longitude: -120,
        depthKm: 10,
        magnitude: 4.5,
        magnitudeType: "mb",
        place: `USGS ${index}`,
        status: "reviewed",
        agency: "USGS",
        url: "https://earthquake.usgs.gov/",
      })),
      {
        id: "cwa:hualien",
        source: "cwa",
        sourceEventId: "hualien",
        time: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: null,
        latitude: 23.88,
        longitude: 121.45,
        depthKm: 20,
        magnitude: 4.3,
        magnitudeType: "ML",
        place: "花莲",
        status: "CWA 显著有感地震",
        agency: "CWA",
        url: "https://scweb.cwa.gov.tw/",
      },
      {
        id: "jma:old",
        source: "jma",
        sourceEventId: "old",
        time: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: null,
        latitude: 35,
        longitude: 139,
        depthKm: 20,
        magnitude: 5,
        magnitudeType: "Mj",
        place: "过期记录",
        status: "final",
        agency: "JMA",
        url: "https://www.jma.go.jp/",
      },
    ];

    const history = buildInstitutionHistoryReports(records, now, 7 * 24 * 60 * 60 * 1000, 3);
    expect(history.filter((event) => event.source === "USGS")).toHaveLength(3);
    expect(history.find((event) => event.source === "CWA")?.place).toBe("花莲");
    expect(history.some((event) => event.source === "JMA")).toBe(false);
  });

  it("recovers a synthetic source with deterministic P-wave travel times", () => {
    const source = { latitude: 35.45, longitude: 139.65 };
    const originTime = Date.UTC(2026, 6, 11, 4);
    const stations = [
      { stationId: "a", latitude: 35.0, longitude: 139.0 },
      { stationId: "b", latitude: 35.1, longitude: 140.2 },
      { stationId: "c", latitude: 35.9, longitude: 139.1 },
      { stationId: "d", latitude: 35.8, longitude: 140.1 },
      { stationId: "e", latitude: 35.4, longitude: 138.8 },
    ];
    const observations: TriggerObservation[] = stations.map((station) => ({
      ...station,
      triggeredAt: originTime + Math.hypot(haversineKm(source, station), 20) / 6 * 1000,
    }));
    const estimate = inferHypocenter(observations);
    expect(estimate).not.toBeNull();
    expect(estimate!.latitude).toBeCloseTo(source.latitude, 1);
    expect(estimate!.longitude).toBeCloseTo(source.longitude, 1);
    expect(estimate!.residualMs).toBeLessThan(250);
    expect(estimate!.stationCount).toBe(5);
  });

  it("does not follow a one-sided P-wave front away from the source", () => {
    const source = { latitude: 35, longitude: 139 };
    const depthKm = 20;
    const originTime = Date.UTC(2026, 6, 12, 2, 42);
    const stations = [
      [35.5, 141.5],
      [34.5, 141.2],
      [35.8, 142.0],
      [34.2, 142.4],
      [36.0, 141.7],
      [34.8, 140.8],
      [35.2, 143.0],
    ];
    const observations: TriggerObservation[] = stations.map(([latitude, longitude], index) => ({
      stationId: `east-${index}`,
      latitude,
      longitude,
      triggeredAt: originTime + Math.hypot(haversineKm(source, { latitude, longitude }), depthKm) / 6 * 1000,
    }));

    const estimate = inferHypocenter(observations);
    expect(estimate).not.toBeNull();
    expect(haversineKm(estimate!, source)).toBeLessThan(10);
  });

  it("enforces the 10 km display boundary when an official source is available", () => {
    const estimate = {
      latitude: 41,
      longitude: 145,
      depthKm: 20,
      originTime: Date.UTC(2026, 6, 12, 2, 42),
      residualMs: 800,
      confidence: 60,
      stationCount: 8,
      method: "P 波走时确定性网格反演" as const,
    };
    const reference = { latitude: 35, longitude: 139 };
    const constrained = constrainHypocenterEstimate(estimate, reference, 10);

    expect(haversineKm(constrained, reference)).toBeLessThanOrEqual(10.05);
    expect(constrained.unconstrainedDistanceKm).toBeGreaterThan(500);
  });

  it("animates replay stations only after wave arrival and exposes deterministic triggers", () => {
    const originTime = "2026-07-11T04:00:00.000Z";
    const event = {
      latitude: 35.45,
      longitude: 139.65,
      depthKm: 20,
      magnitude: 5.6,
      originTime,
    };
    const stations: SeismicStation[] = [
      [35.0, 139.0],
      [35.1, 140.2],
      [35.9, 139.1],
      [35.8, 140.1],
      [35.4, 138.8],
    ].map(([latitude, longitude], index) => ({
      id: `nied:${index}`,
      index,
      latitude,
      longitude,
      network: "NIED",
      stationCode: `T${index}`,
      stationName: `回放站 ${index}`,
      prefecture: "测试",
      metadataMatched: true,
    }));

    const beforeArrival = simulateReplayStationResponse(event, stations, 1);
    expect(beforeArrival.activeStationIds).toEqual([]);
    expect(beforeArrival.arrivedStationIds).toEqual([]);
    expect(beforeArrival.observations).toEqual([]);

    const afterArrival = simulateReplayStationResponse(event, stations, 30);
    expect(afterArrival.activeStationIds.length).toBeGreaterThanOrEqual(4);
    expect(afterArrival.arrivedStationIds).toHaveLength(5);
    expect(afterArrival.sArrivedStationIds.length).toBeGreaterThanOrEqual(4);
    expect(afterArrival.observations).toHaveLength(5);
    expect(Math.max(...Object.values(afterArrival.ranks))).toBeGreaterThan(0.5);
    expect(afterArrival.observations[0].triggeredAt).toBeGreaterThan(Date.parse(originTime));

    const estimate = inferHypocenter(afterArrival.observations);
    expect(estimate).not.toBeNull();
    expect(estimate!.latitude).toBeCloseTo(event.latitude, 1);
    expect(estimate!.longitude).toBeCloseTo(event.longitude, 1);

    const lateResponse = simulateReplayStationResponse(event, stations, 180);
    expect(lateResponse.arrivedStationIds).toEqual(afterArrival.arrivedStationIds);
    for (const station of stations) {
      expect(lateResponse.ranks[station.id]).toBeGreaterThanOrEqual(afterArrival.ranks[station.id]);
    }
  });

  it("reuses prepared station propagation geometry without changing replay results", () => {
    const event = {
      latitude: 38.32,
      longitude: 142.37,
      depthKm: 24,
      magnitude: 7.2,
      originTime: "2026-07-11T05:00:00.000Z",
    };
    const stations = Array.from({ length: 120 }, (_, index) => ({
      id: `prepared:${index}`,
      latitude: 32 + index % 12 * 0.7,
      longitude: 136 + Math.floor(index / 12) * 0.9,
    }));
    const prepared = prepareReplayStationResponse(event, stations, "intensity");

    expect(prepared.stations).toHaveLength(stations.length);
    expect(prepared.stations.map((station) => station.pArrivalSeconds)).toEqual(
      [...prepared.stations].map((station) => station.pArrivalSeconds).sort((a, b) => a - b),
    );
    expect(Object.keys(simulatePreparedReplayStationResponse(prepared, 0).ranks)).toHaveLength(0);
    for (const elapsed of [0, 12.5, 45, 180]) {
      expect(simulatePreparedReplayStationResponse(prepared, elapsed)).toEqual(
        simulateReplayStationResponse(event, stations, elapsed, "intensity"),
      );
    }
  });

  it("animates S-net station intensity after the local P and S arrivals", () => {
    const event = {
      latitude: 35.2,
      longitude: 141.2,
      depthKm: 20,
      magnitude: 6.3,
      originTime: "2026-07-12T02:42:00.000Z",
    };
    const stations = [
      { id: "ocean:N.S1N10", latitude: 35.0925, longitude: 141.2021 },
      { id: "ocean:N.S5N10", latitude: 40.8, longitude: 145.0 },
    ];

    const response = simulateReplayStationResponse(event, stations, 20);
    expect(response.ranks["ocean:N.S1N10"]).toBeGreaterThanOrEqual(1);
    expect(response.ranks["ocean:N.S5N10"] ?? 0).toBe(0);
    expect(response.activeStationIds).toContain("ocean:N.S1N10");
    expect(estimateLocalIntensity(event, stations[0])).toBeGreaterThan(estimateLocalIntensity(event, stations[1]));
  });

  it("activates global FDSN and CWA stations during a Taiwan replay", () => {
    const event = {
      latitude: 23.72,
      longitude: 121.62,
      depthKm: 18,
      magnitude: 6.8,
      originTime: "2026-07-13T01:00:00.000Z",
    };
    const globalStations = [
      { id: "fdsn:IU.TATO", latitude: 24.9735, longitude: 121.4971 },
      { id: "fdsn:TW.HWA", latitude: 23.9769, longitude: 121.6044 },
    ];
    const cwaStations = [
      { id: "fdsn:CWASN.HWA", latitude: 23.9769, longitude: 121.6044 },
      { id: "fdsn:CWASN.TWD", latitude: 23.753, longitude: 121.602 },
    ];

    expect(simulateReplayStationResponse(event, cwaStations, 1, "shindo").activeStationIds).toEqual([]);

    const globalResponse = simulateReplayStationResponse(event, globalStations, 45, "intensity");
    const cwaResponse = simulateReplayStationResponse(event, cwaStations, 45, "shindo");
    expect(globalResponse.activeStationIds).toContain("fdsn:TW.HWA");
    expect(globalResponse.maxRank).toBeGreaterThan(0.5);
    expect(cwaResponse.activeStationIds).toEqual(expect.arrayContaining(["fdsn:CWASN.HWA", "fdsn:CWASN.TWD"]));
    expect(cwaResponse.maxRank).toBeGreaterThanOrEqual(1);
  });

  it("activates global stations for an event outside East Asia", () => {
    const event = {
      latitude: 34.05,
      longitude: -118.25,
      depthKm: 12,
      magnitude: 7.1,
      originTime: "2026-07-13T03:00:00.000Z",
    };
    const stations = [
      { id: "fdsn:CI.PASC", latitude: 34.1714, longitude: -118.1852 },
      { id: "fdsn:CI.USC", latitude: 34.0192, longitude: -118.2863 },
      { id: "fdsn:GE.WLF", latitude: 49.6647, longitude: 6.1526 },
    ];

    expect(simulateReplayStationResponse(event, stations, 1, "intensity").activeStationIds).toEqual([]);

    const response = simulateReplayStationResponse(event, stations, 60, "intensity");
    expect(response.activeStationIds).toEqual(expect.arrayContaining(["fdsn:CI.PASC", "fdsn:CI.USC"]));
    expect(response.activeStationIds).not.toContain("fdsn:GE.WLF");
    expect(response.maxRank).toBeGreaterThanOrEqual(3);
    expect(buildGlobalImpactContours(event, 60, "intensity").some((contour) => contour.arrived)).toBe(true);
  });

  it("keeps simulated propagation and estimated motion bounded", () => {
    expect(waveRadiusKm(1_000, 6, 11_000)).toBe(60);
    expect(seismicWaveArrivalSeconds(
      { latitude: 31.2304, longitude: 121.4737, depthKm: 35 },
      { latitude: 31.2304, longitude: 121.4737 },
      3.5,
    )).toBe(10);
    expect(seismicWaveArrivalSeconds(
      { latitude: 31.2304, longitude: 121.4737, depthKm: 10 },
      { latitude: 31.2304, longitude: 121.4737 },
      0,
    )).toBe(Number.POSITIVE_INFINITY);
    expect(estimateGroundMotion(0)).toEqual({ pgaGal: 0, pgvCms: 0 });
    expect(estimateGroundMotion(7).pgaGal).toBeLessThanOrEqual(2500);
  });

  it("activates a clustered NIED rise but ignores an isolated station", () => {
    const stations: SeismicStation[] = Array.from({ length: 5 }, (_, index) => ({
      id: `nied:${index}`,
      index,
      latitude: 35 + index * 0.03,
      longitude: 139 + index * 0.03,
      network: "NIED",
      stationCode: `T${index}`,
      stationName: `测试站 ${index}`,
      prefecture: "东京",
      metadataMatched: true,
    }));
    const neighbors = buildStationNeighborMap(stations);
    const initial = updateNiedShakeDetection(undefined, stations, "ddddd", 1_000, neighbors);
    const isolated = updateNiedShakeDetection(initial.state, stations, "ldddd", 2_000, neighbors);
    expect(isolated.status.detected).toBe(false);
    const micro = updateNiedShakeDetection(initial.state, stations, "kkkkk", 2_000, neighbors);
    expect(micro.observations).toHaveLength(0);
    const clustered = updateNiedShakeDetection(initial.state, stations, "lllll", 2_000, neighbors);
    expect(clustered.status.detected).toBe(true);
    expect(clustered.status.activeStationIds.length).toBeGreaterThanOrEqual(4);
    expect(clustered.observations).toHaveLength(5);
  });

  it("uses the KMA-PEWS 60 second baseline before neighbor activation", () => {
    const stations: KmaStation[] = Array.from({ length: 5 }, (_, index) => ({
      id: `kma:${index}`,
      index,
      latitude: 37 + index * 0.02,
      longitude: 127 + index * 0.02,
      network: "KMA",
      stationCode: `KMA-${index}`,
      stationName: `韩国测站 ${index}`,
      prefecture: "",
      metadataMatched: false,
    }));
    const neighbors = buildStationNeighborMap(stations, 30, 64);
    let state;
    for (let second = 0; second < 50; second += 1) {
      state = updateKmaPewsDetection(state, stations, [0, 0, 0, 0, 0], 1_000 + second * 1_000, neighbors).state;
    }
    const detected = updateKmaPewsDetection(state, stations, [2, 2, 2, 2, 2], 51_000, neighbors);
    expect(detected.status.detected).toBe(true);
    expect(detected.status.currentMaxLabel).toBe("MMI 2.0");
  });

  it("normalizes FAN CENC intensity reports and measured station details", () => {
    const list = normalizeCencIntensityList({ Data: [{ id: 20260709074413, uniEventId: "CC1", oriTime: "2026-07-09 07:44:13", locName: "四川宜宾市高县", epiLon: "104.68", epiLat: "28.51", magnitude: "4.8" }] });
    expect(list[0]).toMatchObject({ id: "20260709074413", place: "四川宜宾市高县", magnitude: 4.8, latitude: 28.51 });
    const detail = normalizeCencIntensityDetail({ Data: {
      ...list[0],
      id: 20260709074413,
      oriTime: "2026-07-09 07:44:13",
      locName: "四川宜宾市高县",
      epiLon: "104.68",
      epiLat: "28.51",
      focDepth: "6.0",
      instrument_intensity_json: [{ stID: "Q2501", stName: "高县站", stla: 28.54, stlo: 104.69, INT: 8.1, PGA: 735.9, PGV: 20.9, IPGA: 9.3, IPGV: 8.1, Dist: 2.42, Province: "四川", City: "宜宾市", County: "高县", Town: "复兴镇", Site: "SOIL" }],
    } });
    expect(detail?.stations[0]).toMatchObject({ stationCode: "Q2501", intensity: 8.1, pgaGal: 735.9, address: "四川宜宾市高县复兴镇" });
    expect(cencIntensityColor(8.1)).toBe("#ff4f00");
    expect(parseKmaTimestamp("2026-07-11 13:00:00")).toBe(Date.parse("2026-07-11T13:00:00+09:00"));
  });
});
