import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCwaOfficialCache, getCwaOfficialSnapshot } from "./cwaOfficial.mjs";

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
});
