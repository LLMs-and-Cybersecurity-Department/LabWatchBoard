import { describe, expect, it } from "vitest";

import { normalizePalertRealtime, normalizePalertStationList } from "./palert.mjs";

describe("P-Alert official station directory", () => {
  it("normalizes and deduplicates official GraphQL station rows", () => {
    const result = normalizePalertStationList({
      data: {
        stationList: {
          timestamp: "2026-04-10T11:10:45Z",
          version: "681ca8f9",
          staInfos: [
            { station: "D001", network: "TW", location: "--", serial: 1524, area: "Hualien", locname: "東華人社院", lon: 121.542278, lat: 23.894972, elev: 41, floor: 2, start_at: "2020-11-03" },
            { station: "D001", network: "TW", lon: 121.542278, lat: 23.894972 },
            { station: "BROKEN", lon: null, lat: null },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      timestamp: "2026-04-10T11:10:45Z",
      version: "681ca8f9",
      stations: [expect.objectContaining({
        id: "palert:D001",
        stationName: "東華人社院",
        latitude: 23.894972,
        longitude: 121.542278,
      })],
    });
  });

  it("normalizes the official one-second realtime PGA frame", () => {
    const result = normalizePalertRealtime({
      data: {
        realtimePGA: {
          timestamp: "2026-08-23T17:41:02Z",
          dataVals: { W091: 0.120786, H014: 1.497949, BROKEN: "-" },
        },
      },
    });

    expect(result).toEqual({
      timestamp: "2026-08-23T17:41:02Z",
      dataVals: { W091: 0.120786, H014: 1.497949 },
    });
  });
});
