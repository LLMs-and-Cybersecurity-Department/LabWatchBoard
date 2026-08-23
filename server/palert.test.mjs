import { describe, expect, it } from "vitest";

import {
  normalizePalertEvents,
  normalizePalertEventStations,
  normalizePalertRealtime,
  normalizePalertStationList,
} from "./palert.mjs";

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

  it("normalizes database events and measured PGA/PGV rows", () => {
    expect(normalizePalertEvents({ data: { eventList: [{
      DateUTC: "2026-07-26T12:36:17",
      Depth: 95.7,
      Latitude: 24.9117,
      Longitude: 121.802,
      ML: 5.6,
      hasPGA: true,
    }] } })).toEqual([expect.objectContaining({
      id: "20260726123617",
      magnitude: 5.6,
      hasPga: true,
    })]);

    expect(normalizePalertEventStations({ data: { PGAList: [{
      staCode: "W49A",
      pga: 12.33,
      pgv: 0.35995,
      az: 270.37,
      dist: 42.88,
    }] } })).toEqual([{
      stationCode: "W49A",
      pgaGal: 12.33,
      pgvCms: 0.35995,
      azimuth: 270.37,
      distanceKm: 42.88,
    }]);
  });
});
