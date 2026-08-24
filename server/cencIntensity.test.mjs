import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  CencIntensityBridge,
  mergeCencListEnvelopes,
  mergeOfficialDetailEnvelope,
  parseOfficialGroundMotionHtml,
  parseOfficialGroundMotionWorkbook,
} from "./cencIntensity.mjs";

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(value) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  send(value) {
    this.sent.push(value);
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

describe("CENC intensity backend bridge", () => {
  it("waits for business data, requests detail, and keeps last real data after disconnect", async () => {
    FakeWebSocket.instances = [];
    let now = 1_000;
    const bridge = new CencIntensityBridge({
      WebSocketImpl: FakeWebSocket,
      endpoints: ["wss://example.test/cenc-ir"],
      fetchImpl: null,
      persist: false,
      now: () => now,
    });

    await bridge.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(socket.sent.map(JSON.parse)).toContainEqual({ type: "cencirlist" });

    now = 1_125;
    socket.message({
      type: "cencirlist_response",
      Data: [{ id: 42, locName: "测试震中", epiLat: 30, epiLon: 105 }],
    });
    expect(socket.sent.map(JSON.parse)).toContainEqual({ type: "cencirdetail", id: "42" });

    now = 1_180;
    socket.message({
      type: "cencirdetail_response",
      Data: { id: 42, locName: "测试震中", epiLat: 30, epiLon: 105, instrument_intensity_json: [] },
    });
    expect(await bridge.snapshot("42")).toMatchObject({
      state: "online",
      latencyMs: 125,
      cache: "LIVE",
      detailEnvelope: { type: "cencirdetail_response", Data: { id: 42 } },
    });

    socket.close();
    expect(await bridge.snapshot("42")).toMatchObject({ state: "stale", cache: "PERSISTED" });
    bridge.stop();
  });

  it("authenticates the new /all endpoint before requesting CENC intensity data", async () => {
    FakeWebSocket.instances = [];
    const bridge = new CencIntensityBridge({
      WebSocketImpl: FakeWebSocket,
      endpoints: ["wss://ws.fanstudio.tech/all"],
      webSocketProxyUrl: "http://127.0.0.1:7893",
      fanstudioAppId: "test-app",
      fanstudioApiKey: "test-key",
      fetchImpl: null,
      persist: false,
    });

    await bridge.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(socket.options?.agent).toBeTruthy();
    expect(socket.sent.map(JSON.parse)).toEqual([{ type: "auth", appId: "test-app", key: "test-key" }]);

    socket.message({ type: "auth_success", message: "ok" });
    expect(socket.sent.map(JSON.parse)).toContainEqual({ type: "cencirlist" });
    expect(await bridge.snapshot()).toMatchObject({
      authRequired: false,
      authState: "authenticated",
      credentialsConfigured: true,
      webSocketEgressMode: "http-proxy",
    });
    bridge.stop();
  });

  it("reports the live source authentication blocker instead of presenting old data as live", async () => {
    FakeWebSocket.instances = [];
    const bridge = new CencIntensityBridge({
      WebSocketImpl: FakeWebSocket,
      endpoints: ["wss://ws.fanstudio.tech/all"],
      webSocketProxyUrl: "",
      fetchImpl: null,
      persist: false,
    });

    await bridge.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ type: "cencirlist_response", Data: [{ id: 7, oriTime: "2026-08-08 11:45:27", epiLat: 30, epiLon: 105 }] });
    socket.message({ type: "auth_required", message: "API key required" });

    expect(await bridge.snapshot()).toMatchObject({
      state: "stale",
      cache: "PERSISTED",
      authRequired: true,
      authState: "not-configured",
      credentialsConfigured: false,
      latestReportAt: "2026-08-08T03:45:27.000Z",
      provider: expect.stringContaining("待 API Key"),
      error: expect.stringContaining("FANSTUDIO_APP_ID"),
    });
    bridge.stop();
  });

  it("parses official CENC ground-motion rows into event and station metrics", () => {
    const html = `
      <table class="cls-data-table"><tbody>
        <tr class="cls-data-tr-head-list"><td>发震时间</td></tr>
        <tr class="cls-data-tr-even">
          <td class="cls-data-td-listform">2026-07-11 23:40:53.0</td><td class="cls-data-td-listform">41.74</td>
          <td class="cls-data-td-listform">81.20</td><td class="cls-data-td-listform">10.0</td><td class="cls-data-td-listform">4.2</td>
          <td class="cls-data-td-listform">新疆阿克苏地区拜城县</td><td class="cls-data-td-listform">XJ</td><td class="cls-data-td-listform">N002B</td>
          <td class="cls-data-td-listform">8</td><td class="cls-data-td-listform">3.5</td><td class="cls-data-td-listform">地表</td>
          <td class="cls-data-td-listform">13.70</td><td class="cls-data-td-listform">0.60</td>
        </tr>
        <tr class="cls-data-tr-even">
          <td class="cls-data-td-listform">2026-07-11 23:40:53.0</td><td class="cls-data-td-listform">41.74</td>
          <td class="cls-data-td-listform">81.20</td><td class="cls-data-td-listform">10.0</td><td class="cls-data-td-listform">4.2</td>
          <td class="cls-data-td-listform">新疆阿克苏地区拜城县</td><td class="cls-data-td-listform">XJ</td><td class="cls-data-td-listform">N0023</td>
          <td class="cls-data-td-listform">9</td><td class="cls-data-td-listform">3.8</td><td class="cls-data-td-listform">地表</td>
          <td class="cls-data-td-listform">14.80</td><td class="cls-data-td-listform">0.90</td>
        </tr>
      </tbody></table>`;

    const parsed = parseOfficialGroundMotionHtml(html, 1234);

    expect(parsed.listEnvelope.Data).toHaveLength(1);
    expect(parsed.listEnvelope.Data[0]).toMatchObject({ locName: "新疆阿克苏地区拜城县", epiLat: 41.74, epiLon: 81.2 });
    expect(parsed.detailEnvelopes.values().next().value.Data.station_metrics_json).toEqual([
      expect.objectContaining({ stID: "N0023", INT: 3.8, PGA: 14.8, PGV: 0.9 }),
      expect.objectContaining({ stID: "N002B", INT: 3.5, PGA: 13.7, PGV: 0.6 }),
    ]);
  });

  it("keeps known real station coordinates when the official public table omits them", () => {
    const official = {
      type: "cencirdetail_response",
      Data: {
        id: "NEDC-1",
        station_metrics_json: [{ stID: "N0023", NetCode: "XJ", INT: 3.8, PGA: 14.8 }],
        instrument_intensity_json: [],
      },
    };
    const locations = new Map([["XJ:N0023", { stID: "N0023", NetCode: "XJ", stName: "真实测站", stla: 41.81, stlo: 81.12 }]]);

    expect(mergeOfficialDetailEnvelope(official, null, locations).Data.station_metrics_json[0]).toMatchObject({
      stID: "N0023",
      INT: 3.8,
      PGA: 14.8,
      stla: 41.81,
      stlo: 81.12,
      stName: "真实测站",
    });
  });

  it("reads the official 24-column workbook including public station coordinates", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "事件编号", "发震时间", "震中纬度", "震中经度", "震源深度", "发震地点", "震级", "台网代码",
        "台站编码", "台站名称", "台站纬度", "台站经度", "震中距", "仪器烈度", "总峰值加速度PGA",
        "总峰值速度PGV", "场地标签", "参考Vs30", "东西分量PGA", "南北分量PGA", "竖向分量PGA",
        "东西分量PGV", "南北分量PGV", "竖向分量PGV",
      ],
      [
        "20260711234053.00", "2026-07-11 23:40:53.0", 41.74, 81.2, 10, "新疆阿克苏地区拜城县", 4.2,
        "XJ", "N0023", "拜城测站", 41.72, 81.31, 9, 3.8, 14.8, 0.9, "地表", 361.07,
        12.46, 14.82, 13.14, 0.87, 0.59, 0.27,
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "强震动参数数据集");
    const parsed = parseOfficialGroundMotionWorkbook(XLSX.write(workbook, { type: "array", bookType: "xls" }), 1234);
    const metric = parsed.detailEnvelopes.values().next().value.Data.station_metrics_json[0];

    expect(parsed.listEnvelope.Data[0]).toMatchObject({ stationCount: 1, maxIntensity: 3.8 });
    expect(metric).toMatchObject({
      stID: "N0023",
      stName: "拜城测站",
      NetCode: "XJ",
      stla: 41.72,
      stlo: 81.31,
      INT: 3.8,
    });
  });

  it("merges FAN and official lists without letting the slower official page erase live reports", () => {
    const official = {
      type: "cencirlist_response",
      Data: [{ id: "NEDC-1", oriTime: "2026-07-11 23:40:53.0", epiLat: 41.74, epiLon: 81.2, stationCount: 9 }],
    };
    const fan = {
      type: "cencirlist_response",
      Data: [
        { id: "fan-1", oriTime: "2026-07-11 23:40:53.0", epiLat: 41.74, epiLon: 81.2, locName: "新疆阿克苏地区拜城县" },
        { id: "fan-2", oriTime: "2026-07-18 02:10:00", epiLat: 31, epiLon: 103, locName: "新速报" },
      ],
    };

    expect(mergeCencListEnvelopes(official, fan).Data).toEqual([
      expect.objectContaining({ id: "fan-2" }),
      expect.objectContaining({ id: "fan-1", stationCount: 9 }),
    ]);
  });
});
