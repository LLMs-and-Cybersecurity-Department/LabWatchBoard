import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStationRecordingCsv,
  downloadStationRecordingCsv,
  stationRecordingFilename,
} from "./stationRecording";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("station recording CSV", () => {
  it("exports station scroll and complete decoded waveform rows in one CSV", () => {
    const csv = buildStationRecordingCsv({
      stationSamples: [{
        timestamp: Date.parse("2026-08-24T00:00:00.000Z"),
        stationId: "palert:H014",
        network: "TW",
        stationCode: "H014",
        value: 0.12786,
        unit: "gal",
        label: "PGA 0.127860 gal",
      }],
      waveformSamples: [{
        timestamp: Date.parse("2026-08-24T00:00:00.010Z"),
        stationId: "fdsn:JP.TEST",
        network: "JP",
        stationCode: "TEST",
        channel: "BHZ",
        sampleRate: 100,
        value: -1234,
        unit: "count",
      }],
    });

    expect(csv).toContain("station_scroll,2026-08-24T00:00:00.000Z");
    expect(csv).toContain("palert:H014,TW,H014,,,0.12786,gal,PGA 0.127860 gal");
    expect(csv).toContain("raw_waveform,2026-08-24T00:00:00.010Z");
    expect(csv).toContain("fdsn:JP.TEST,JP,TEST,BHZ,100,-1234,count,miniSEED decoded sample");
  });

  it("quotes labels and sanitizes the download filename", () => {
    const csv = buildStationRecordingCsv({
      stationSamples: [{
        timestamp: 0,
        stationId: "station",
        network: "N,1",
        stationCode: "A/2",
        value: 1,
        unit: "MMI",
        label: "value, \"quoted\"",
      }],
      waveformSamples: [],
    });

    expect(csv).toContain('"N,1",A/2,,,1,MMI,"value, ""quoted"""');
    expect(stationRecordingFilename("N,1", "A/2", 0)).toBe("seismic-N-1-A-2-1970-01-01T00-00-00-000Z.csv");
  });

  it("starts a browser CSV download and releases the object URL", () => {
    vi.useFakeTimers();
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:station-recording");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let appended = false;
    const anchor = {
      href: "",
      download: "",
      hidden: false,
      click: vi.fn(() => expect(appended).toBe(true)),
      remove: vi.fn(() => { appended = false; }),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { append: vi.fn(() => { appended = true; }) },
    });
    vi.stubGlobal("window", { setTimeout });

    downloadStationRecordingCsv("station.csv", "record_type,value\r\nstation_scroll,1\r\n");

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe("station.csv");
    expect(anchor.href).toBe("blob:station-recording");
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(appended).toBe(false);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:station-recording");
  });
});
