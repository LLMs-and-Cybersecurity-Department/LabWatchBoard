import { describe, expect, it } from "vitest";

import {
  FAN_INTERFACES,
  createDefaultFanSettings,
  normalizeFanTyphoons,
  updateFanInterfaceSetting,
} from "./fanData";

describe("FAN data integration", () => {
  it("catalogues every documented data, map and visualization interface", () => {
    expect(FAN_INTERFACES.map((item) => item.id)).toEqual([
      "cenc-ws",
      "aqi",
      "cloud",
      "ip",
      "ntp",
      "radar",
      "rain-forecast",
      "station-all",
      "station-history",
      "tile-map",
      "typhoon",
      "wind-field",
      "wsdi",
    ]);
  });

  it("keeps per-interface choices while the FAN master switch is off", () => {
    const initial = createDefaultFanSettings();
    const withoutTyphoon = updateFanInterfaceSetting(initial, "typhoon", false);
    expect(withoutTyphoon.enabled).toBe(true);
    expect(withoutTyphoon.interfaces.typhoon).toBe(false);
    expect(withoutTyphoon.interfaces.aqi).toBe(true);
  });

  it("normalizes active typhoon tracks and forecast coordinates", () => {
    const typhoons = normalizeFanTyphoons([{
      tfid: "202618",
      name: "沙德尔",
      enname: "SAUDEL",
      isactive: "1",
      points: [{
        time: "2026-08-28 20:00:00",
        lng: "136.2",
        lat: "23.5",
        power: "12",
        pressure: "970",
        forecast: [{ tm: "中国", forecastpoints: [{ time: "2026-08-29 08:00:00", lng: "134.1", lat: "25.2" }] }],
      }],
    }]);

    expect(typhoons).toHaveLength(1);
    expect(typhoons[0]).toMatchObject({ id: "202618", name: "沙德尔", active: true });
    expect(typhoons[0].track[0]).toMatchObject({ longitude: 136.2, latitude: 23.5, power: 12, pressure: 970 });
    expect(typhoons[0].forecasts[0].points[0]).toMatchObject({ longitude: 134.1, latitude: 25.2 });
  });
});
