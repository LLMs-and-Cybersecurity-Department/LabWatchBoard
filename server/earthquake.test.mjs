import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  clearEarthquakeCache,
  getEarthquakeDyfi,
  getEarthquakeSnapshot,
  getEarthquakeMechanism,
  getEarthquakePager,
  getEarthquakeShakeMap,
  findCencMechanism,
  mergeJmaFeedLinks,
  normalizeCencMechanism,
  normalizeCencEvent,
  normalizeBmkgEvent,
  normalizeCwaOpenDataEarthquake,
  normalizeEmscFeature,
  normalizeGeonetFeature,
  normalizeGfzRow,
  normalizeJmaDocument,
  normalizeShakeAlertFeature,
  normalizeUsgsFeature,
  parseEarthquakeQuery,
  parseCencMechanismHtml,
  parseCwaCatalogueHtml,
  parseCwaOpenDataPayload,
  parseJmaCoordinate,
  parseJmaFeedLinks,
} from "./earthquake.mjs";

const CENC_MECHANISM_HTML = `
<table class="cls-data-table"><tbody>
  <tr class="cls-data-tr-head-list"><td>发震时刻</td></tr>
  <tr class="cls-data-tr-even">
    <td class="cls-data-td-listform">2026-07-18 13:47:19</td>
    <td class="cls-data-td-listform">38.71</td>
    <td class="cls-data-td-listform">75.07</td>
    <td class="cls-data-td-listform">10</td>
    <td class="cls-data-td-listform">4.3</td>
    <td class="cls-data-td-listform">4.3</td>
    <td class="cls-data-td-listform">7</td>
    <td class="cls-data-td-listform">293</td>
    <td class="cls-data-td-listform">80</td>
    <td class="cls-data-td-listform">-113</td>
    <td class="cls-data-td-listform">180</td>
    <td class="cls-data-td-listform">25</td>
    <td class="cls-data-td-listform">-25</td>
  </tr>
</tbody></table>`;

describe("earthquake source normalization", () => {
  it("normalizes USGS GeoJSON while preserving magnitude type and MMI", () => {
    const event = normalizeUsgsFeature({
      id: "us-test",
      geometry: { coordinates: [121.5, 31.2, 12] },
      properties: {
        mag: 5.4,
        magType: "mww",
        time: Date.UTC(2026, 6, 10, 2),
        updated: Date.UTC(2026, 6, 10, 2, 1),
        place: "测试震中",
        mmi: 4.2,
        cdi: 3.1,
        tsunami: 1,
        status: "reviewed",
        types: ",dyfi,losspager,moment-tensor,origin,phase-data,shakemap,",
      },
    });
    expect(event).toMatchObject({
      id: "usgs:us-test",
      magnitude: 5.4,
      magnitudeType: "mww",
      depthKm: 12,
      intensityScale: "MMI",
      intensityValue: 4.2,
      tsunami: true,
      mechanismAvailable: true,
      shakeMapAvailable: true,
      pagerAvailable: true,
      dyfiAvailable: true,
    });

    const withoutIntensity = normalizeUsgsFeature({
      id: "us-no-intensity",
      geometry: { coordinates: [128.7, -2.8, 10] },
      properties: {
        mag: 4.9,
        magType: "mb",
        time: Date.UTC(2026, 6, 10, 2),
        place: "无烈度数据",
        mmi: null,
        cdi: null,
      },
    });
    expect(withoutIntensity).toMatchObject({
      intensity: null,
      intensityScale: null,
      intensityValue: null,
      reportedIntensity: null,
    });
  });

  it("normalizes a ShakeAlert performance report without merging it into USGS", () => {
    const feature = {
      id: "ci-test",
      geometry: { coordinates: [-116.2, 33.8, 8] },
      properties: {
        mag: 4.9,
        magType: "mw",
        time: Date.UTC(2026, 0, 20, 1, 56, 14),
        updated: Date.UTC(2026, 0, 20, 2),
        place: "20 km NNE of Indio, CA",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/ci-test",
      },
    };
    const detail = {
      properties: {
        products: {
          "shake-alert": [{
            code: "ew1768874180",
            source: "ew",
            status: "CONFIRMED",
            updateTime: Date.UTC(2026, 0, 20, 2),
            preferredWeight: 6,
            properties: { "review-status": "reviewed", eventtime: "2026-01-20T01:56:13Z" },
            contents: {
              "summary.json": { url: "https://example.test/summary.json" },
              "summary.pdf": { url: "https://example.test/summary.pdf" },
            },
          }],
        },
      },
    };
    const summary = {
      properties: {
        id: "ew1768874180",
        time: "2026-01-20 01:56:13.714000Z",
        epicenter: { coordinates: [-116.153, 33.8453] },
        depth: 16.779,
        magnitude: 4.9,
        num_stations_10km: 2,
        num_stations_100km: 78,
        announcement: "Reviewed: ShakeAlert Message issued at 2026-01-20 01:56:20.3 UTC.",
        wea_report: "This alert was distributed over the WEA system.",
      },
      cities: { features: [{ id: "Indio", properties: { name: "Indio", citydist: 15, warning_time: 0, mmi: 4 } }] },
      alerts: [
        { id: "initialAlertCollection", properties: { elapsed: 6.5, magnitude: 5.6, num_stations: 4 }, features: [] },
        { id: "maxMAlertCollection", properties: { elapsed: 6.5, magnitude: 5.6, num_stations: 4 }, features: [{ properties: { name: "MMI 6.5" } }] },
        { id: "finalAlertCollection", properties: { elapsed: 15.6, magnitude: 5.1, num_stations: 39 }, features: [] },
      ],
    };

    expect(normalizeShakeAlertFeature(feature, detail, summary)).toMatchObject({
      id: "shakealert:ew1768874180",
      source: "shakealert",
      sourceEventId: "ew1768874180",
      time: "2026-01-20T01:56:13.714Z",
      latitude: 33.8453,
      longitude: -116.153,
      magnitude: 5.1,
      intensityScale: "MMI",
      intensityValue: 6.5,
      agency: "USGS ShakeAlert / EW",
      shakeAlertReport: {
        issuedAt: "2026-01-20T01:56:20.300Z",
        initialSeconds: 6.5,
        peakMagnitude: 5.6,
        finalSeconds: 15.6,
        stationsWithin100Km: 78,
        stationsFinal: 39,
        maximumMmi: 6.5,
        cities: [{ name: "Indio", mmi: 4, warningSeconds: 0, distanceKm: 15 }],
      },
    });
  });

  it("normalizes EMSC and CENC time/depth conventions", () => {
    const emsc = normalizeEmscFeature({
      id: "2026-test",
      geometry: { coordinates: [130, 30, -40] },
      properties: { time: "2026-07-10T01:02:03Z", lon: 130, lat: 30, depth: 40, mag: 4.8, magtype: "mb" },
    });
    const cenc = normalizeCencEvent({
      id: "CD.test",
      time: "2026-07-10 09:00:00",
      longitude: 104.7,
      latitude: 28.5,
      depth: 8,
      magnitude: 4,
      location: "四川测试区",
    });
    expect(emsc).toMatchObject({ depthKm: 40, magnitudeType: "mb" });
    expect(cenc).toMatchObject({ time: "2026-07-10T01:00:00.000Z", magnitudeType: "M", agency: "CENC" });
  });

  it("normalizes GFZ, GeoNet and BMKG official catalogue formats", () => {
    const gfz = normalizeGfzRow([
      "gfz2026nnvw",
      "2026-07-12T13:46:35.15Z",
      "1.013",
      "121.368",
      "10",
      "5.27",
      "Minahassa Peninsula, Sulawesi",
    ]);
    const geonet = normalizeGeonetFeature({
      properties: {
        publicID: "2026p123456",
        time: "2026-07-12T12:15:00.000Z",
        magnitude: 4.2,
        magnitudeType: "M",
        depth: 18.4,
        locality: "20 km north-east of Wellington",
        mmi: 3,
        quality: "best",
      },
      geometry: { coordinates: [174.9, -41.1, 18.4] },
    });
    const bmkg = normalizeBmkgEvent({
      DateTime: "2026-07-12T10:20:30+00:00",
      Coordinates: "-7.20,106.80",
      Magnitude: "5.2",
      Kedalaman: "10 km",
      Wilayah: "82 km BaratDaya BAYAH-BANTEN",
      Potensi: "Tidak berpotensi tsunami",
      Dirasakan: "III Pelabuhan Ratu",
    });

    expect(gfz).toMatchObject({ source: "gfz", sourceEventId: "gfz2026nnvw", magnitude: 5.27, agency: "GFZ" });
    expect(geonet).toMatchObject({ source: "geonet", sourceEventId: "2026p123456", intensityScale: "MMI", intensityValue: 3 });
    expect(bmkg).toMatchObject({ source: "bmkg", latitude: -7.2, longitude: 106.8, depthKm: 10, tsunami: false, reportedIntensity: "III Pelabuhan Ratu" });
  });

  it("parses the official CWA significant-earthquake table", () => {
    const html = `
      <input id="Search" value="2026年7月">
      <table><tbody>
        <tr onclick="SetLonLat(121.4462, 23.881)">
          <td>049</td><td>07/08 23:47</td><td>4.3</td><td>20.5</td><td>花蓮縣秀林鄉</td>
        </tr>
        <tr onclick="SetLonLat(121.4805, 23.6435)">
          <td>048</td><td>07/02 07:06</td><td>4.0</td><td>5.0</td><td>花蓮縣豐濱鄉</td>
        </tr>
      </tbody></table>`;
    const events = parseCwaCatalogueHtml(html, Date.UTC(2026, 6, 13));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: "cwa:202607082347:049",
      source: "cwa",
      sourceEventId: "202607082347:049",
      time: "2026-07-08T15:47:00.000Z",
      latitude: 23.881,
      longitude: 121.4462,
      depthKm: 20.5,
      magnitude: 4.3,
      magnitudeType: "ML",
      place: "花蓮縣秀林鄉",
      agency: "CWA",
    });
  });

  it("normalizes CWA Open Data reports with county intensity areas", () => {
    const payload = {
      success: "true",
      records: {
        Earthquake: [{
          EarthquakeNo: 115000,
          ReportType: "地震報告",
          ReportContent: "宜蘭縣南澳鄉發生規模3.6有感地震。",
          ReportRemark: "中央氣象署地震觀測網即時地震資料。",
          Web: "https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026081900101836",
          ReportImageURI: "https://scweb.cwa.gov.tw/webdata/OLDEQ/report.png",
          IssueTime: "2026-08-19T00:13:34+08:00",
          EarthquakeInfo: {
            OriginTime: "2026-08-19T00:10:18+08:00",
            Source: "中央氣象署",
            FocalDepth: 6.3,
            Epicenter: {
              Location: "宜蘭縣南澳鄉",
              EpicenterLatitude: 24.34,
              EpicenterLongitude: 121.76,
            },
            EarthquakeMagnitude: { MagnitudeType: "芮氏規模", MagnitudeValue: 3.6 },
          },
          Intensity: {
            ShakingArea: [
              { AreaDesc: "花蓮縣地區", CountyName: "花蓮縣", AreaIntensity: "3級" },
              { AreaDesc: "宜蘭縣地區", CountyName: "宜蘭縣", AreaIntensity: "3級" },
              { AreaDesc: "南投縣地區", CountyName: "南投縣", AreaIntensity: "1級" },
              { AreaDesc: "最大震度3級地區", CountyName: "花蓮縣、宜蘭縣", AreaIntensity: "3級" },
            ],
          },
        }],
      },
    };

    const events = parseCwaOpenDataPayload(payload, "E-A0016-001");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "cwa:2026081900101836",
      sourceEventId: "2026081900101836",
      time: "2026-08-18T16:10:18.000Z",
      updatedAt: "2026-08-18T16:13:34.000Z",
      latitude: 24.34,
      longitude: 121.76,
      depthKm: 6.3,
      magnitude: 3.6,
      magnitudeType: "ML",
      status: "CWA 小区域有感地震",
      intensity: "3級",
      intensityValue: 3,
      intensityScale: "CWA",
      affectedAreas: [
        { name: "花蓮縣", intensity: "3級", rank: 3, warning: false },
        { name: "宜蘭縣", intensity: "3級", rank: 3, warning: false },
        { name: "南投縣", intensity: "1級", rank: 1, warning: false },
      ],
    });
    expect(normalizeCwaOpenDataEarthquake({}, "E-A0015-001")).toBeNull();
    expect(() => parseCwaOpenDataPayload({ success: "false" }, "E-A0015-001")).toThrow("API 返回失败状态");
  });

  it("uses the server-only CWA token for both official Open Data datasets", async () => {
    clearEarthquakeCache();
    const requests = [];
    const fetchImpl = async (input, options) => {
      const url = String(input);
      requests.push({ url, authorization: options.headers.Authorization });
      const earthquakes = url.includes("E-A0016-001") ? [{
        EarthquakeNo: 115000,
        Web: "https://scweb.cwa.gov.tw/zh-tw/earthquake/details/api-test",
        IssueTime: "2026-08-19T00:13:34+08:00",
        EarthquakeInfo: {
          OriginTime: "2026-08-19T00:10:18+08:00",
          Source: "中央氣象署",
          FocalDepth: 6.3,
          Epicenter: { Location: "宜蘭縣南澳鄉", EpicenterLatitude: 24.34, EpicenterLongitude: 121.76 },
          EarthquakeMagnitude: { MagnitudeType: "芮氏規模", MagnitudeValue: 3.6 },
        },
        Intensity: { ShakingArea: [{ AreaDesc: "宜蘭縣地區", CountyName: "宜蘭縣", AreaIntensity: "3級" }] },
      }] : [];
      return new Response(JSON.stringify({ success: "true", records: { Earthquake: earthquakes } }), { status: 200 });
    };

    const snapshot = await getEarthquakeSnapshot(
      new URLSearchParams({ range: "24h", min_magnitude: "0", sources: "cwa", force: "1" }),
      {
        now: Date.UTC(2026, 7, 18, 17),
        fetchImpl,
        env: { CWA_API_TOKEN: "server-only-test-token" },
      },
    );

    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.authorization === "server-only-test-token")).toBe(true);
    expect(requests.every((request) => !request.url.includes("server-only-test-token"))).toBe(true);
    expect(snapshot.sources).toContainEqual(expect.objectContaining({ id: "cwa", status: "ok", count: 1 }));
    expect(snapshot.events).toContainEqual(expect.objectContaining({
      id: "cwa:api-test",
      affectedAreas: [{ name: "宜蘭縣", intensity: "3級", rank: 3, warning: false }],
    }));
  });

  it("parses JMA hypocenter, Mj and seismic intensity", () => {
    const xml = `<?xml version="1.0"?><Report xmlns:jmx_eb="urn:test">
      <Control><DateTime>2026-07-10T01:03:00Z</DateTime><PublishingOffice>気象庁</PublishingOffice></Control>
      <Head><EventID>20260710100000</EventID><InfoType>発表</InfoType></Head>
      <Body><Earthquake><OriginTime>2026-07-10T10:00:00+09:00</OriginTime><Hypocenter><Area><Name>関東地方</Name><jmx_eb:Coordinate>+35.5+139.7-20000/</jmx_eb:Coordinate></Area></Hypocenter><jmx_eb:Magnitude type="Mj">5.1</jmx_eb:Magnitude></Earthquake><Intensity><Observation><MaxInt>5-</MaxInt><Pref><Name>千葉県</Name><Area><Name>千葉県北東部</Name><MaxInt>5-</MaxInt></Area><Area><Name>千葉県北西部</Name><MaxInt>4</MaxInt></Area></Pref></Observation></Intensity><Comments><ForecastComment><Text>津波の心配はありません。</Text></ForecastComment></Comments></Body>
    </Report>`;
    expect(parseJmaCoordinate("+35.5+139.7-20000/")).toEqual({ latitude: 35.5, longitude: 139.7, depthKm: 20 });
    expect(normalizeJmaDocument(xml, "https://www.data.jma.go.jp/test.xml")).toMatchObject({
      source: "jma",
      magnitude: 5.1,
      magnitudeType: "Mj",
      depthKm: 20,
      intensity: "5-",
      intensityValue: 5,
      tsunami: false,
      affectedAreas: [
        { name: "千葉県北東部", intensity: "5-", rank: 5, warning: false },
        { name: "千葉県北西部", intensity: "4", rank: 4, warning: false },
      ],
    });
  });

  it("keeps only official JMA earthquake XML links", () => {
    const feed = `<feed><entry><title>震源・震度に関する情報</title><link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/a.xml"/></entry><entry><title>降灰予報</title><link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/b.xml"/></entry><entry><title>震源情報</title><link href="https://example.com/c.xml"/></entry></feed>`;
    expect(parseJmaFeedLinks(feed)).toEqual(["https://www.data.jma.go.jp/developer/xml/data/a.xml"]);
  });

  it("merges the JMA high-frequency and long-term feeds without duplicate reports", () => {
    const highFrequency = `<feed><entry><title>降灰予報（定時）</title><link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/ash.xml"/></entry><entry><title>震源に関する情報</title><link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/latest.xml"/></entry></feed>`;
    const longTerm = `<feed><entry><title>震源に関する情報</title><link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/latest.xml"/></entry><entry><title>震源・震度に関する情報</title><link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/older.xml"/></entry></feed>`;

    expect(mergeJmaFeedLinks([highFrequency, longTerm])).toEqual([
      "https://www.data.jma.go.jp/developer/xml/data/latest.xml",
      "https://www.data.jma.go.jp/developer/xml/data/older.xml",
    ]);
  });

  it("bounds query parameters and derives an exact UTC window", () => {
    const params = new URLSearchParams({ range: "30d", min_magnitude: "12" });
    expect(parseEarthquakeQuery(params, Date.UTC(2026, 6, 11))).toMatchObject({
      range: "30d",
      minMagnitude: 9,
      startTime: "2026-06-11T00:00:00.000Z",
      endTime: "2026-07-11T00:00:00.000Z",
    });
    expect(parseEarthquakeQuery(new URLSearchParams({ range: "90d", min_magnitude: "4" }), Date.UTC(2026, 6, 11))).toMatchObject({
      range: "90d",
      minMagnitude: 4,
      startTime: "2026-04-12T00:00:00.000Z",
    });
    expect(parseEarthquakeQuery(
      new URLSearchParams({ range: "24h", min_magnitude: "0", sources: "jma,cwa,jma,unknown" }),
      Date.UTC(2026, 6, 11),
    )).toMatchObject({
      minMagnitude: 0,
      sources: ["jma", "cwa"],
    });
  });

  it("retains the last successful institution snapshot when one source temporarily fails", async () => {
    clearEarthquakeCache();
    let failUsgs = false;
    const eventTime = Date.UTC(2026, 6, 13, 3, 30);
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.includes("earthquake.usgs.gov/fdsnws/event")) {
        if (failUsgs) throw new TypeError("fetch failed");
        return new Response(JSON.stringify({
          features: [{
            id: "us-retained",
            geometry: { coordinates: [-118.9, 34.8, 9] },
            properties: {
              mag: 4.6,
              magType: "mw",
              time: eventTime,
              updated: eventTime + 10_000,
              place: "USGS retained event",
            },
          }],
        }), { status: 200 });
      }
      if (url.includes("shakealert.geojson")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.jma.go.jp/developer/xml/feed")) return new Response("<feed></feed>", { status: 200 });
      if (url.includes("ceic.ac.cn")) return new Response("[]", { status: 200 });
      if (url.includes("scweb.cwa.gov.tw")) return new Response('<input value="2026年7月"><table></table>', { status: 200 });
      if (url.includes("seismicportal.eu")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("geofon.gfz.de")) return new Response("", { status: 200 });
      if (url.includes("api.geonet.org.nz")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.bmkg.go.id")) return new Response(JSON.stringify({ Infogempa: { gempa: [] } }), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };
    const params = new URLSearchParams({ range: "24h", min_magnitude: "4", force: "1" });
    const first = await getEarthquakeSnapshot(params, { now: Date.UTC(2026, 6, 13, 4), fetchImpl });
    expect(first.sources.find((source) => source.id === "usgs")).toMatchObject({ status: "ok", count: 1 });

    failUsgs = true;
    const second = await getEarthquakeSnapshot(params, { now: Date.UTC(2026, 6, 13, 4, 1), fetchImpl });
    expect(second.events).toContainEqual(expect.objectContaining({ id: "usgs:us-retained" }));
    expect(second.sources.find((source) => source.id === "usgs")).toMatchObject({
      status: "stale",
      count: 1,
      error: "fetch failed",
    });
    expect(second.partial).toBe(true);
    expect(second.stale).toBe(false);
  });

  it("returns an expired aggregate immediately while refreshing its institutions in the background", async () => {
    clearEarthquakeCache();
    let releaseRefresh;
    const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
    const emptyFetch = async (input) => {
      const url = String(input);
      if (url.includes("earthquake.usgs.gov/fdsnws/event") || url.includes("shakealert.geojson") || url.includes("seismicportal.eu") || url.includes("api.geonet.org.nz")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.jma.go.jp/developer/xml/feed")) return new Response("<feed></feed>", { status: 200 });
      if (url.includes("ceic.ac.cn")) return new Response("[]", { status: 200 });
      if (url.includes("scweb.cwa.gov.tw")) return new Response('<input value="2026年7月"><table></table>', { status: 200 });
      if (url.includes("geofon.gfz.de")) return new Response("", { status: 200 });
      if (url.includes("data.bmkg.go.id")) return new Response(JSON.stringify({ Infogempa: { gempa: [] } }), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };
    const liveParams = new URLSearchParams({ range: "24h", min_magnitude: "4", force: "1" });
    const now = Date.UTC(2026, 6, 15, 2);

    try {
      await getEarthquakeSnapshot(liveParams, { now, fetchImpl: emptyFetch });
      const staleParams = new URLSearchParams({ range: "24h", min_magnitude: "4" });
      const slowFetch = async (...args) => {
        await refreshGate;
        return emptyFetch(...args);
      };
      const result = await Promise.race([
        getEarthquakeSnapshot(staleParams, { now: now + 60_000, fetchImpl: slowFetch }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("stale snapshot was blocked by refresh")), 100)),
      ]);

      expect(result).toMatchObject({ cache: "STALE", stale: true, partial: false });
    } finally {
      releaseRefresh();
      await new Promise((resolve) => setTimeout(resolve, 20));
      clearEarthquakeCache();
    }
  });

  it("restores institution snapshots from disk when every source is offline after restart", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ecmwf-pboard-earthquakes-"));
    const cachePath = path.join(directory, "earthquake-source-snapshots.json");
    const eventTime = Date.UTC(2026, 6, 15, 1, 30);
    const onlineFetch = async (input) => {
      const url = String(input);
      if (url.includes("earthquake.usgs.gov/fdsnws/event")) return new Response(JSON.stringify({
        features: [{
          id: "us-persisted",
          geometry: { coordinates: [-118.9, 34.8, 9] },
          properties: { mag: 4.8, magType: "mw", time: eventTime, updated: eventTime + 10_000, place: "Persisted USGS event" },
        }],
      }), { status: 200 });
      if (url.includes("shakealert.geojson")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.jma.go.jp/developer/xml/feed")) return new Response("<feed></feed>", { status: 200 });
      if (url.includes("ceic.ac.cn")) return new Response("[]", { status: 200 });
      if (url.includes("scweb.cwa.gov.tw")) return new Response('<input value="2026年7月"><table></table>', { status: 200 });
      if (url.includes("seismicportal.eu")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("geofon.gfz.de")) return new Response("", { status: 200 });
      if (url.includes("api.geonet.org.nz")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.bmkg.go.id")) return new Response(JSON.stringify({ Infogempa: { gempa: [] } }), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };
    const params = new URLSearchParams({ range: "24h", min_magnitude: "4", force: "1" });

    try {
      const live = await getEarthquakeSnapshot(params, { now: Date.UTC(2026, 6, 15, 2), cachePath, fetchImpl: onlineFetch });
      expect(live).toMatchObject({ cache: "MISS", partial: false });
      expect(live.events).toContainEqual(expect.objectContaining({ id: "usgs:us-persisted" }));

      clearEarthquakeCache();
      const restored = await getEarthquakeSnapshot(params, {
        now: Date.UTC(2026, 6, 15, 2, 1),
        cachePath,
        fetchImpl: async () => { throw new Error("offline"); },
      });

      expect(restored).toMatchObject({ cache: "PERSISTED", stale: true, partial: true });
      expect(restored.events).toContainEqual(expect.objectContaining({ id: "usgs:us-persisted" }));
      expect(restored.sources).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "usgs", status: "stale", count: 1, error: "offline" }),
        expect.objectContaining({ id: "jma", status: "stale", count: 0, error: expect.stringContaining("offline") }),
      ]));
    } finally {
      clearEarthquakeCache();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retries a transient upstream HTTP failure during a cold start", async () => {
    clearEarthquakeCache();
    let cwaAttempts = 0;
    const eventTime = Date.UTC(2026, 6, 13, 4, 30);
    const fetchImpl = async (input, options) => {
      const url = String(input);
      if (url.includes("earthquake.usgs.gov/fdsnws/event")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("shakealert.geojson")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.jma.go.jp/developer/xml/feed")) return new Response("<feed></feed>", { status: 200 });
      if (url.includes("ceic.ac.cn")) return new Response("[]", { status: 200 });
      if (url.includes("scweb.cwa.gov.tw")) {
        expect(options.headers["User-Agent"]).toContain("Mozilla/5.0");
        expect(options.headers["User-Agent"]).toContain("ecmwf-pBoard/1.0");
        expect(options.headers["Accept-Language"]).toContain("zh-TW");
        cwaAttempts += 1;
        if (cwaAttempts === 1) return new Response("temporary unavailable", { status: 503, statusText: "Service Unavailable" });
        return new Response(`
          <input id="Search" value="2026年7月">
          <table><tbody><tr onclick="SetLonLat(121.4462, 23.881)">
            <td>049</td><td>07/13 12:30</td><td>4.3</td><td>20.5</td><td>花蓮縣秀林鄉</td>
          </tr></tbody></table>
        `, { status: 200 });
      }
      if (url.includes("seismicportal.eu")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("geofon.gfz.de")) return new Response("", { status: 200 });
      if (url.includes("api.geonet.org.nz")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.bmkg.go.id")) return new Response(JSON.stringify({ Infogempa: { gempa: [] } }), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };

    const snapshot = await getEarthquakeSnapshot(
      new URLSearchParams({ range: "24h", min_magnitude: "4", force: "1" }),
      { now: eventTime, fetchImpl },
    );

    expect(cwaAttempts).toBe(2);
    expect(snapshot.sources.find((source) => source.id === "cwa")).toMatchObject({ status: "ok", count: 1, error: null });
    expect(snapshot.events).toContainEqual(expect.objectContaining({ id: "cwa:202607131230:049" }));
  });

  it("rejects an outdated CWA catalogue instead of reporting a successful empty source", async () => {
    clearEarthquakeCache();
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.includes("earthquake.usgs.gov/fdsnws/event")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("shakealert.geojson")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.jma.go.jp/developer/xml/feed")) return new Response("<feed></feed>", { status: 200 });
      if (url.includes("ceic.ac.cn")) return new Response("[]", { status: 200 });
      if (url.includes("scweb.cwa.gov.tw")) return new Response(`
        <input id="Search" value="2023年6月">
        <table><tbody><tr onclick="SetLonLat(121.4462, 23.881)">
          <td>049</td><td>07/08 23:47</td><td>4.3</td><td>20.5</td><td>花蓮縣秀林鄉</td>
        </tr></tbody></table>
      `, { status: 200 });
      if (url.includes("seismicportal.eu")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("geofon.gfz.de")) return new Response("", { status: 200 });
      if (url.includes("api.geonet.org.nz")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (url.includes("data.bmkg.go.id")) return new Response(JSON.stringify({ Infogempa: { gempa: [] } }), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };

    const snapshot = await getEarthquakeSnapshot(
      new URLSearchParams({ range: "7d", min_magnitude: "4", force: "1" }),
      { now: Date.UTC(2026, 6, 14, 10), fetchImpl },
    );

    expect(snapshot.sources.find((source) => source.id === "cwa")).toMatchObject({
      status: "error",
      count: 0,
      error: expect.stringContaining("过期目录"),
    });
    expect(snapshot.partial).toBe(true);
  });

  it("returns the preferred official USGS mechanism product", async () => {
    clearEarthquakeCache();
    const result = await getEarthquakeMechanism(
      new URLSearchParams({ source: "usgs", event_id: "us-test" }),
      {
        now: Date.UTC(2026, 6, 11),
        fetchImpl: async () => new Response(JSON.stringify({
          properties: {
            products: {
              "moment-tensor": [
                {
                  source: "us",
                  preferredWeight: 5,
                  updateTime: Date.UTC(2026, 6, 10, 4),
                  status: "UPDATE",
                  properties: {
                    "review-status": "reviewed",
                    "nodal-plane-1-strike": "12",
                    "nodal-plane-1-dip": "34",
                    "nodal-plane-1-rake": "56",
                    "tensor-mrr": "1.2E+17",
                  },
                },
              ],
            },
          },
        }), { status: 200, headers: { "content-type": "application/json" } }),
      },
    );
    expect(result).toMatchObject({
      source: "usgs",
      eventId: "us-test",
      type: "moment-tensor",
      productSource: "US",
      reviewStatus: "reviewed",
      cache: "MISS",
      properties: {
        "nodal-plane-1-strike": "12",
        "tensor-mrr": "1.2E+17",
      },
    });
  });

  it("parses, matches and returns an official CENC focal mechanism only for the corresponding event", async () => {
    const products = parseCencMechanismHtml(CENC_MECHANISM_HTML, "auto");
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      originTime: "2026-07-18T05:47:19.000Z",
      latitude: 38.71,
      longitude: 75.07,
      momentMagnitude: 4.3,
      strike1: 293,
      rake2: -25,
    });
    const matched = findCencMechanism(products, {
      time: "2026-07-18T05:47:30.000Z",
      latitude: 38.72,
      longitude: 75.06,
      magnitude: 4.3,
    });
    expect(normalizeCencMechanism(matched, "cenc-test")).toMatchObject({
      source: "cenc",
      eventId: "cenc-test",
      type: "focal-mechanism",
      productSource: "CENC AUTO",
      reviewStatus: "自动产出",
      properties: {
        "nodal-plane-1-strike": "293",
        "nodal-plane-1-dip": "80",
        "nodal-plane-1-rake": "-113",
        "nodal-plane-2-strike": "180",
        "nodal-plane-2-dip": "25",
        "nodal-plane-2-rake": "-25",
        "derived-magnitude": "4.3",
      },
    });
    expect(findCencMechanism(products, {
      time: "2026-07-18T07:47:19.000Z",
      latitude: 38.71,
      longitude: 75.07,
      magnitude: 4.3,
    })).toBeNull();

    clearEarthquakeCache();
    const result = await getEarthquakeMechanism(
      new URLSearchParams({
        source: "cenc",
        event_id: "cenc-test",
        time: "2026-07-18T05:47:19.000Z",
        latitude: "38.71",
        longitude: "75.07",
        magnitude: "4.3",
      }),
      {
        now: Date.UTC(2026, 6, 18, 6),
        fetchImpl: async () => new Response(CENC_MECHANISM_HTML, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      },
    );
    expect(result).toMatchObject({
      source: "cenc",
      productSource: "CENC REVIEW",
      reviewStatus: "人工复核",
      properties: { "nodal-plane-1-strike": "293" },
    });
  });

  it("returns official USGS ShakeMap contours and product links", async () => {
    clearEarthquakeCache();
    let requestCount = 0;
    const result = await getEarthquakeShakeMap(
      new URLSearchParams({ event_id: "us-shakemap" }),
      {
        now: Date.UTC(2026, 6, 18),
        fetchImpl: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return new Response(JSON.stringify({
              properties: {
                products: {
                  shakemap: [{
                    source: "us",
                    status: "UPDATE",
                    preferredWeight: 1,
                    updateTime: Date.UTC(2026, 6, 18, 0, 2),
                    properties: { version: "1" },
                    contents: {},
                  }, {
                    source: "us",
                    status: "UPDATE",
                    preferredWeight: 8,
                    updateTime: Date.UTC(2026, 6, 18, 1),
                    properties: { "review-status": "reviewed", version: "2", maxmmi: "7.1" },
                    contents: {
                      "download/cont_mi.json": { url: "https://earthquake.usgs.gov/product/shakemap/us-shakemap/us/1/download/cont_mi.json" },
                      "download/intensity.jpg": { url: "https://earthquake.usgs.gov/product/shakemap/us-shakemap/us/1/download/intensity.jpg" },
                      "download/intensity_overlay.png": { url: "https://earthquake.usgs.gov/product/shakemap/us-shakemap/us/1/download/intensity_overlay.png" },
                    },
                  }],
                },
              },
            }), { status: 200 });
          }
          return new Response(JSON.stringify({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: { value: 6, units: "mmi", color: "#ffcc00", weight: 3 },
              geometry: { type: "MultiLineString", coordinates: [[[-101.2, 16.1], [-100.7, 16.5], [-100.2, 16.8]]] },
            }],
          }), { status: 200 });
        },
      },
    );

    expect(requestCount).toBe(2);
    expect(result).toMatchObject({
      source: "usgs",
      eventId: "us-shakemap",
      productSource: "US",
      reviewStatus: "reviewed",
      issuedAt: "2026-07-18T00:02:00.000Z",
      version: "2",
      maxMmi: 7.1,
      cache: "MISS",
      intensityImageUrl: expect.stringContaining("/intensity.jpg"),
    });
    expect(result.contours.features).toHaveLength(1);
    expect(result.contours.features[0].properties).toMatchObject({ value: 6, color: "#ffcc00", weight: 3 });
  });

  it("does not invent ShakeMap data when the official product is absent", async () => {
    clearEarthquakeCache();
    await expect(getEarthquakeShakeMap(
      new URLSearchParams({ event_id: "us-no-shakemap" }),
      {
        fetchImpl: async () => new Response(JSON.stringify({ properties: { products: {} } }), { status: 200 }),
      },
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns PAGER impact products, grouped population exposure, and every official city", async () => {
    clearEarthquakeCache();
    const productBase = "https://earthquake.usgs.gov/product/losspager/us-pager/us/1";
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.includes("query?")) {
        return new Response(JSON.stringify({
          geometry: { coordinates: [-92.95, 14.6, 18] },
          properties: {
            place: "Test PAGER earthquake",
            mag: 7.3,
            time: Date.UTC(2026, 6, 18),
            products: {
              losspager: [{
                source: "us",
                preferredWeight: 1,
                updateTime: Date.UTC(2026, 6, 18, 0, 3),
                properties: { alertlevel: "green" },
                contents: {},
              }, {
                source: "us",
                preferredWeight: 9,
                updateTime: Date.UTC(2026, 6, 18, 1),
                properties: { alertlevel: "yellow", maxmmi: "7", "review-status": "automatic" },
                contents: {
                  "json/alerts.json": { url: `${productBase}/json/alerts.json` },
                  "json/exposures.json": { url: `${productBase}/json/exposures.json` },
                  "json/cities.json": { url: `${productBase}/json/cities.json` },
                  "json/comments.json": { url: `${productBase}/json/comments.json` },
                  "exposure.png": { url: `${productBase}/exposure.png` },
                  "alertfatal.png": { url: `${productBase}/alertfatal.png` },
                  "alertecon.png": { url: `${productBase}/alertecon.png` },
                  "onepager.pdf": { url: `${productBase}/onepager.pdf` },
                },
              }],
            },
          },
        }), { status: 200 });
      }
      if (url.endsWith("/json/alerts.json")) return new Response(JSON.stringify({
        fatality: { type: "fatality", units: "fatalities", level: "yellow", bins: [{ color: "yellow", min: "1", max: "10", probability: 0.4 }] },
        economic: { type: "economic", units: "USD", level: "orange", bins: [{ color: "orange", min: "100", max: "1000", probability: 0.3 }] },
      }), { status: 200 });
      if (url.endsWith("/json/exposures.json")) return new Response(JSON.stringify({
        population_exposure: {
          mmi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          aggregated_exposure: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
          maximum_border_mmi: 4.5,
          country_exposures: [{ country_code: "MX", exposure: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],
        },
      }), { status: 200 });
      if (url.endsWith("/json/cities.json")) return new Response(JSON.stringify({
        city_source: "official test source",
        all_cities: [
          { name: "Official map city", lat: 14.8, lon: -92.7, pop: 10_000, mmi: 6.2, on_map: 1 },
          { name: "Show all city", lat: 16.2, lon: -94.1, pop: 20_000, mmi: 4.1, on_map: 0 },
        ],
      }), { status: 200 });
      if (url.endsWith("/json/comments.json")) return new Response(JSON.stringify({
        struct_comment: "Mixed vulnerable and resistant construction.",
      }), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await getEarthquakePager(
      new URLSearchParams({ event_id: "us-pager" }),
      { now: Date.UTC(2026, 6, 18, 2), fetchImpl },
    );

    expect(result).toMatchObject({
      source: "usgs",
      eventId: "us-pager",
      issuedAt: "2026-07-18T00:03:00.000Z",
      alertLevel: "yellow",
      maxMmi: 7,
      cache: "MISS",
      images: {
        populationExposure: expect.stringContaining("/exposure.png"),
        fatalities: expect.stringContaining("/alertfatal.png"),
        economicLosses: expect.stringContaining("/alertecon.png"),
      },
      comments: { structure: "Mixed vulnerable and resistant construction." },
    });
    expect(result.populationExposure.groups.find((group) => group.label === "II–III")).toMatchObject({ population: 50 });
    expect(result.allCities).toHaveLength(2);
    expect(result.allCities.find((city) => city.name === "Show all city")).toMatchObject({ onOfficialMap: false, mmi: 4.1 });
  });

  it("returns DYFI official maps and charts only when the product exists", async () => {
    clearEarthquakeCache();
    const result = await getEarthquakeDyfi(
      new URLSearchParams({ event_id: "us-dyfi" }),
      {
        now: Date.UTC(2026, 6, 18),
        fetchImpl: async () => new Response(JSON.stringify({
          properties: {
            products: {
              dyfi: [{
                source: "us",
                preferredWeight: 5,
                updateTime: Date.UTC(2026, 6, 18, 1),
                properties: { maxmmi: "5.4", "num-responses": "283" },
                contents: {
                  "us-dyfi_ciim.jpg": { url: "https://earthquake.usgs.gov/product/dyfi/us-dyfi/us/1/us-dyfi_ciim.jpg" },
                  "us-dyfi_ciim_geo.jpg": { url: "https://earthquake.usgs.gov/product/dyfi/us-dyfi/us/1/us-dyfi_ciim_geo.jpg" },
                  "us-dyfi_plot_atten.jpg": { url: "https://earthquake.usgs.gov/product/dyfi/us-dyfi/us/1/us-dyfi_plot_atten.jpg" },
                  "us-dyfi_plot_numresp.jpg": { url: "https://earthquake.usgs.gov/product/dyfi/us-dyfi/us/1/us-dyfi_plot_numresp.jpg" },
                  "dyfi_zip.geojson": { url: "https://earthquake.usgs.gov/product/dyfi/us-dyfi/us/1/dyfi_zip.geojson" },
                },
              }],
            },
          },
        }), { status: 200 }),
      },
    );
    expect(result).toMatchObject({
      source: "usgs",
      eventId: "us-dyfi",
      maxMmi: 5.4,
      responses: 283,
      images: {
        communityIntensity: expect.stringContaining("_ciim.jpg"),
        geocodedIntensity: expect.stringContaining("_ciim_geo.jpg"),
        intensityDistance: expect.stringContaining("_plot_atten.jpg"),
        responseTime: expect.stringContaining("_plot_numresp.jpg"),
      },
    });

    clearEarthquakeCache();
    await expect(getEarthquakeDyfi(
      new URLSearchParams({ event_id: "us-no-dyfi" }),
      { fetchImpl: async () => new Response(JSON.stringify({ properties: { products: {} } }), { status: 200 }) },
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it("retries a transient network failure before requesting a mechanism fails", async () => {
    clearEarthquakeCache();
    let attempts = 0;
    const result = await getEarthquakeMechanism(
      new URLSearchParams({ source: "usgs", event_id: "us-network-retry" }),
      {
        now: Date.UTC(2026, 6, 13),
        fetchImpl: async () => {
          attempts += 1;
          if (attempts === 1) throw new TypeError("fetch failed");
          return new Response(JSON.stringify({
            properties: {
              products: {
                "focal-mechanism": [{
                  source: "us",
                  preferredWeight: 1,
                  updateTime: Date.UTC(2026, 6, 13, 1),
                  properties: { "review-status": "reviewed" },
                }],
              },
            },
          }), { status: 200 });
        },
      },
    );

    expect(attempts).toBe(2);
    expect(result).toMatchObject({ source: "usgs", eventId: "us-network-retry", type: "focal-mechanism" });
  });

  it("retries when an upstream response body is interrupted", async () => {
    clearEarthquakeCache();
    let attempts = 0;
    const result = await getEarthquakeMechanism(
      new URLSearchParams({ source: "usgs", event_id: "us-body-retry" }),
      {
        now: Date.UTC(2026, 6, 13),
        fetchImpl: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              ok: true,
              json: async () => { throw new TypeError("terminated"); },
            };
          }
          return new Response(JSON.stringify({
            properties: {
              products: {
                "focal-mechanism": [{
                  source: "us",
                  preferredWeight: 1,
                  updateTime: Date.UTC(2026, 6, 13, 1),
                  properties: { "review-status": "reviewed" },
                }],
              },
            },
          }), { status: 200 });
        },
      },
    );

    expect(attempts).toBe(2);
    expect(result).toMatchObject({ eventId: "us-body-retry", type: "focal-mechanism" });
  });

  it("does not retry a permanent upstream client error", async () => {
    clearEarthquakeCache();
    let attempts = 0;
    await expect(getEarthquakeMechanism(
      new URLSearchParams({ source: "usgs", event_id: "us-not-found" }),
      {
        now: Date.UTC(2026, 6, 13),
        fetchImpl: async () => {
          attempts += 1;
          return new Response("not found", { status: 404, statusText: "Not Found" });
        },
      },
    )).rejects.toThrow("404 Not Found");

    expect(attempts).toBe(1);
  });

  it("returns an EMSC collected moment tensor for an EMSC event", async () => {
    clearEarthquakeCache();
    const result = await getEarthquakeMechanism(
      new URLSearchParams({ source: "emsc", event_id: "20260711_0000152" }),
      {
        now: Date.UTC(2026, 6, 11),
        fetchImpl: async () => new Response(JSON.stringify([{
          ev_unid: "20260711_0000152",
          mt_id: 47160,
          mt_source_catalog: "GCMT",
          mt_preferred: true,
          mt_tensor_exp: 18,
          mt_m0: 5.76,
          mt_m0_exp: 18,
          mt_mw: 6.4,
          mt_depth: 33,
          mt_mrr: -0.4,
          mt_mtt: -1.95,
          mt_mpp: 2.35,
          mt_mrt: -4.14,
          mt_mrp: -1.52,
          mt_mtp: 3,
          mt_strike_1: 163,
          mt_dip_1: 40,
          mt_rake_1: -176,
          mt_strike_2: 70,
          mt_dip_2: 88,
          mt_rake_2: -50,
          mt_per_dc: 92.37,
          mt_centroid_time: "2026-07-11 10:26:48.2 UTC",
        }]), { status: 200, headers: { "content-type": "application/json" } }),
      },
    );
    expect(result).toMatchObject({
      source: "emsc",
      eventId: "20260711_0000152",
      type: "moment-tensor",
      productSource: "GCMT",
      reviewStatus: "preferred",
      cache: "MISS",
      properties: {
        "tensor-mrr": "-0.4e18",
        "tensor-mtp": "3e18",
        "nodal-plane-1-strike": "163",
        "nodal-plane-2-rake": "-50",
        "scalar-moment": "5.76e18",
        "percent-double-couple": "92.37",
      },
    });
  });
});
