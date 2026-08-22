import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCwaOfficialCache, getCwaOfficialSnapshot, getCwaProductSnapshot } from "./cwaOfficial.mjs";

function report(originTime, webId, magnitude = 4.2) {
  return {
    EarthquakeNo: 115001,
    Web: `https://scweb.cwa.gov.tw/zh-tw/earthquake/details/${webId}`,
    IssueTime: originTime,
    EarthquakeInfo: {
      OriginTime: originTime,
      Source: "中央氣象署",
      FocalDepth: 8.5,
      Epicenter: { Location: "花蓮縣近海", EpicenterLatitude: 23.8, EpicenterLongitude: 121.7 },
      EarthquakeMagnitude: { MagnitudeType: "芮氏規模", MagnitudeValue: magnitude },
    },
    Intensity: {
      ShakingArea: [{ AreaDesc: "花蓮縣地區", CountyName: "花蓮縣", AreaIntensity: "3級" }],
    },
  };
}

afterEach(() => {
  clearCwaOfficialCache();
  vi.restoreAllMocks();
});

describe("CWA dedicated official report snapshot", () => {
  it("keeps the advanced-member token server-side and shares the three-second cache", async () => {
    const requests = [];
    const fetchImpl = vi.fn(async (input, options) => {
      requests.push({ url: String(input), authorization: options.headers.Authorization });
      const isSmall = String(input).includes("E-A0016-001");
      return new Response(JSON.stringify({
        success: "true",
        records: { Earthquake: isSmall ? [report("2026-08-23T08:00:00+08:00", "small-event", 3.1)] : [report("2026-08-23T09:00:00+08:00", "major-event", 5.2)] },
      }), { status: 200 });
    });
    const params = new URLSearchParams({ range: "24h", min_magnitude: "1" });
    const options = {
      now: Date.parse("2026-08-23T10:00:00+08:00"),
      fetchImpl,
      env: { CWA_API_TOKEN: "server-only-token" },
    };

    const first = await getCwaOfficialSnapshot(params, options);
    const second = await getCwaOfficialSnapshot(params, { ...options, now: options.now + 1_000 });

    expect(first).toMatchObject({ configured: true, membershipProfile: "advanced", cache: "MISS", stale: false });
    expect(first.events.map((event) => event.id)).toEqual(["cwa:major-event", "cwa:small-event"]);
    expect(second.cache).toBe("HIT");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requests.every((request) => request.authorization === "server-only-token")).toBe(true);
    expect(requests.every((request) => !request.url.includes("server-only-token"))).toBe(true);
  });

  it("deduplicates simultaneous refreshes and keeps the last good response when CWA fails", async () => {
    let fail = false;
    const fetchImpl = vi.fn(async (input) => {
      if (fail) return new Response("unavailable", { status: 503 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({
        success: "true",
        records: { Earthquake: String(input).includes("E-A0015-001") ? [report("2026-08-23T09:00:00+08:00", "cached-event")] : [] },
      }), { status: 200 });
    });
    const params = new URLSearchParams({ range: "24h", min_magnitude: "0" });
    const options = {
      now: Date.parse("2026-08-23T10:00:00+08:00"),
      fetchImpl,
      env: { CWA_API_TOKEN: "token" },
    };

    const [left, right] = await Promise.all([
      getCwaOfficialSnapshot(params, options),
      getCwaOfficialSnapshot(params, options),
    ]);
    expect(left.events).toHaveLength(1);
    expect(right.events).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fail = true;
    const stale = await getCwaOfficialSnapshot(params, { ...options, now: options.now + 4_000 });
    expect(stale).toMatchObject({ cache: "STALE", stale: true });
    expect(stale.events).toEqual([expect.objectContaining({ id: "cwa:cached-event" })]);
  });

  it("rejects missing credentials and invalid magnitude filters", async () => {
    await expect(getCwaOfficialSnapshot(new URLSearchParams(), { env: {} }))
      .rejects.toMatchObject({ statusCode: 503 });
    await expect(getCwaOfficialSnapshot(new URLSearchParams({ min_magnitude: "10" }), { env: { CWA_API_TOKEN: "token" } }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("loads official station intensities and matching file products only on demand", async () => {
    const item = {
      ...report("2026-08-23T09:00:00+08:00", "2026056", 5.2),
      ReportColor: "橙色",
      ReportContent: "宜蘭外海發生有感地震。",
      ReportImageURI: "https://scweb.cwa.gov.tw/report.png",
      ShakemapImageURI: "https://scweb.cwa.gov.tw/shakemap.png",
      Intensity: {
        ShakingArea: [{
          AreaDesc: "宜蘭縣地區",
          CountyName: "宜蘭縣",
          AreaIntensity: "4級",
          EqStation: [{
            StationID: "ENA",
            StationName: "南澳",
            StationLatitude: 24.426,
            StationLongitude: 121.749,
            SeismicIntensity: "4級",
            EpicenterDistance: 24.3,
            BackAzimuth: 92.64,
            InfoStatus: "observe",
            pga: { unit: "gal", EWComponent: 18.76, NSComponent: 19.36, VComponent: 5.26, IntScaleValue: 12.94 },
            pgv: { unit: "kine", EWComponent: 0.35, NSComponent: 0.34, VComponent: 0.1, IntScaleValue: 0.4 },
            WaveImageURI: "https://scweb.cwa.gov.tw/wave.gif",
          }],
        }],
      },
    };
    const requests = [];
    const fetchImpl = vi.fn(async (input, options) => {
      const url = String(input);
      requests.push({ url, authorization: options.headers.Authorization });
      if (url.includes("E-A0015-001")) {
        return new Response(JSON.stringify({ success: "true", records: { Earthquake: [item] } }), { status: 200 });
      }
      if (url.includes("E-A0015-003")) {
        return new Response(JSON.stringify({ cwaopendata: { Dataset: { Resource: { ResourceDesc: "2026056等震度圖", MimeType: "image/png", ProductURL: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/isoseismal.png" } } } }), { status: 200, headers: { ETag: '"iso"' } });
      }
      if (url.includes("E-A0015-004")) {
        return new Response(JSON.stringify({ cwaopendata: { Dataset: { Resource: { ResourceDesc: "2026056波形", MimeType: "zip", ProductURL: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/wave.zip" } } } }), { status: 200, headers: { ETag: '"wave"' } });
      }
      if (url.includes("E-A0015-005")) {
        return new Response(JSON.stringify({ cwaopendata: { Earthquake: {
          OriginTime: "2026-08-23T09:00:00+08:00",
          Intensity: { County: [{ CountyName: "宜蘭縣", Town: [{ TownName: "南澳鄉", TownCode: "1000209", StationLatitude: "24.42", StationLongitude: "121.75", StationIntensity: "4級" }] }] },
        } } }), { status: 200, headers: { ETag: '"town"' } });
      }
      return new Response("missing", { status: 404 });
    });
    const params = new URLSearchParams({ event_id: "2026056", dataset_id: "E-A0015-001" });
    const options = { now: Date.parse("2026-08-23T10:00:00+08:00"), fetchImpl, env: { CWA_API_TOKEN: "private-token" } };

    const snapshot = await getCwaProductSnapshot(params, options);
    const cached = await getCwaProductSnapshot(params, { ...options, now: options.now + 5_000 });

    expect(snapshot).toMatchObject({
      cache: "MISS",
      report: {
        eventId: "2026056",
        affectedAreas: [{ name: "宜蘭縣", intensity: "4級", rank: 4 }],
        stations: [{
          id: "ENA",
          name: "南澳",
          intensity: "4級",
          rank: 4,
          pga: { unit: "gal", eastWest: 18.76, northSouth: 19.36, vertical: 5.26, intensityScaleValue: 12.94 },
        }],
      },
      assets: {
        isoseismalImageUrl: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/isoseismal.png",
        strongMotionArchiveUrl: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/wave.zip",
      },
      townIntensities: [{ countyName: "宜蘭縣", townName: "南澳鄉", townCode: "1000209", latitude: 24.42, longitude: 121.75, intensity: "4級", rank: 4 }],
    });
    expect(cached.cache).toBe("HIT");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(requests.every((request) => request.authorization === "private-token")).toBe(true);
    expect(requests.every((request) => !request.url.includes("private-token"))).toBe(true);
  });
});
