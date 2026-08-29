import {
  Activity,
  CloudRain,
  Database,
  ExternalLink,
  Gauge,
  Globe2,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Search,
  Server,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  FAN_INTERFACES,
  fanProxyUrl,
  fetchFanInterface,
  isFanInterfaceEnabled,
  normalizeFanTyphoons,
  setFanDataEnabled,
  setFanInterfaceEnabled,
  useFanDataSettings,
  type FanInterfaceDefinition,
  type FanInterfaceId,
} from "./fanData";

const IMAGE_INTERFACES = new Set<FanInterfaceId>(["cloud", "radar"]);
const EXTERNAL_INTERFACES = new Set<FanInterfaceId>(["cenc-ws", "tile-map", "wsdi"]);
const FAN_WEATHER_INTERFACES = FAN_INTERFACES.filter((item) => item.category !== "seismic");
const STATION_TYPES = [
  ["temperature", "温度"],
  ["pressure", "气压"],
  ["windspeed", "风速"],
  ["maxwindspeed24h", "24 小时最大风速"],
  ["humidity", "湿度"],
  ["visibility", "能见度"],
  ["rain", "降水"],
] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} 项` : "对象";
  return String(value);
}

function rowsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload.filter(isRecord).slice(0, 80);
  if (isRecord(payload) && Array.isArray(payload.data)) return payload.data.filter(isRecord).slice(0, 80);
  if (isRecord(payload)) return [payload];
  return [];
}

function payloadCount(payload: unknown) {
  if (Array.isArray(payload)) return payload.length;
  if (isRecord(payload) && Array.isArray(payload.features)) return payload.features.length;
  if (isRecord(payload) && Array.isArray(payload.data)) return payload.data.length;
  return payload ? 1 : 0;
}

function categoryLabel(category: FanInterfaceDefinition["category"]) {
  return {
    seismic: "地震",
    weather: "气象",
    tool: "工具",
    map: "地图",
    visualization: "可视化",
  }[category];
}

function interfaceIcon(category: FanInterfaceDefinition["category"]) {
  if (category === "seismic") return <Activity size={16} />;
  if (category === "weather") return <CloudRain size={16} />;
  if (category === "map") return <MapIcon size={16} />;
  if (category === "visualization") return <Globe2 size={16} />;
  return <Server size={16} />;
}

export function FanWeatherDashboard() {
  const settings = useFanDataSettings();
  const [selectedId, setSelectedId] = useState<FanInterfaceId>("aqi");
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [stationType, setStationType] = useState("temperature");
  const [rainTime, setRainTime] = useState("24");
  const [historyStation, setHistoryStation] = useState("56288");
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ipAddress, setIpAddress] = useState("");
  const [queryVersion, setQueryVersion] = useState(0);

  const selected = FAN_INTERFACES.find((item) => item.id === selectedId) ?? FAN_INTERFACES[0];
  const selectedEnabled = isFanInterfaceEnabled(settings, selected.id);
  const searchParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedId === "station-all") params.set("type", stationType);
    if (selectedId === "rain-forecast") params.set("time", rainTime);
    if (selectedId === "station-history") {
      params.set("id", historyStation);
      params.set("date", historyDate);
    }
    if (selectedId === "ip" && ipAddress.trim()) params.set("ip", ipAddress.trim());
    return params;
  }, [historyDate, historyStation, ipAddress, rainTime, selectedId, stationType]);

  useEffect(() => {
    if (!selectedEnabled || !selected.proxy || IMAGE_INTERFACES.has(selected.id)) {
      setPayload(null);
      setError("");
      setLoading(false);
      return;
    }
    if (selected.id === "station-history" && (!/^\d{4,8}$/.test(historyStation) || !/^\d{4}-\d{2}-\d{2}$/.test(historyDate))) {
      setPayload(null);
      setError("请输入 4–8 位气象站号和有效日期。");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchFanInterface<unknown>(selected.id, searchParams, controller.signal)
      .then((next) => setPayload(next))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [historyDate, historyStation, queryVersion, reloadNonce, searchParams, selected, selectedEnabled]);

  const typhoons = useMemo(() => selectedId === "typhoon" ? normalizeFanTyphoons(payload) : [], [payload, selectedId]);
  const rows = useMemo(() => rowsFromPayload(payload), [payload]);
  const columns = useMemo(() => {
    const keys = rows[0] ? Object.keys(rows[0]) : [];
    return keys.filter((key) => !["points", "geometry", "forecast"].includes(key)).slice(0, 8);
  }, [rows]);

  const submitQuery = () => setQueryVersion((value) => value + 1);

  return <>
    <aside className="sidebar fan-weather-sidebar" aria-label="FAN 数据接口">
      <header>
        <div><Database size={18} /><strong>FAN 数据接口</strong></div>
        <label className="fan-master-switch"><input type="checkbox" checked={settings.enabled} onChange={(event) => setFanDataEnabled(event.target.checked)} /><span>{settings.enabled ? "总开关已开启" : "总开关已关闭"}</span></label>
      </header>
      <nav aria-label="FAN 接口子菜单">
        {FAN_WEATHER_INTERFACES.map((item) => <div className={`fan-interface-row${selectedId === item.id ? " active" : ""}`} key={item.id}>
          <button onClick={() => setSelectedId(item.id)}>{interfaceIcon(item.category)}<span><strong>{item.label}</strong><small>{categoryLabel(item.category)}</small></span></button>
          <input aria-label={`${item.label}开关`} type="checkbox" checked={settings.interfaces[item.id]} onChange={(event) => setFanInterfaceEnabled(item.id, event.target.checked)} />
        </div>)}
      </nav>
      <footer>接口数据按需加载；关闭子开关后不会发出该接口请求。</footer>
    </aside>

    <main className="workspace fan-weather-workspace">
      <header className="fan-weather-heading">
        <div><span>{interfaceIcon(selected.category)}</span><div><h2>{selected.label}</h2><p>{selected.description}</p></div></div>
        <div><span className={`fan-source-state ${selectedEnabled ? "online" : "off"}`}><i />{selectedEnabled ? "已启用" : "已停用"}</span>{selected.proxy && !IMAGE_INTERFACES.has(selected.id) ? <button onClick={() => setReloadNonce((value) => value + 1)} disabled={!selectedEnabled || loading}><RefreshCw className={loading ? "spin" : ""} size={15} />刷新</button> : null}</div>
      </header>

      {!settings.enabled ? <section className="fan-empty-state"><Database size={30} /><h3>FAN 数据总开关已关闭</h3><p>可在左侧或实时地震设置中重新开启，接口选择会保留。</p></section>
        : !settings.interfaces[selected.id] ? <section className="fan-empty-state"><Gauge size={30} /><h3>{selected.label}已关闭</h3><p>打开该接口的子开关后才会请求数据。</p></section>
          : <section className="fan-weather-content">
            {selectedId === "station-all" ? <div className="fan-query-bar"><label>观测要素<select value={stationType} onChange={(event) => setStationType(event.target.value)}>{STATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div> : null}
            {selectedId === "rain-forecast" ? <div className="fan-query-bar"><label>预报时效<select value={rainTime} onChange={(event) => setRainTime(event.target.value)}><option value="24">未来 24 小时</option><option value="48">未来 48 小时</option><option value="72">未来 72 小时</option></select></label></div> : null}
            {selectedId === "station-history" ? <div className="fan-query-bar"><label>站号<input value={historyStation} inputMode="numeric" onChange={(event) => setHistoryStation(event.target.value)} /></label><label>日期<input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></label><button onClick={submitQuery}><Search size={14} />查询</button></div> : null}
            {selectedId === "ip" ? <div className="fan-query-bar"><label>IP 地址（留空查询当前出口）<input value={ipAddress} placeholder="例如 203.0.113.1" onChange={(event) => setIpAddress(event.target.value)} /></label><button onClick={submitQuery}><Search size={14} />查询</button></div> : null}

            {IMAGE_INTERFACES.has(selectedId) ? <figure className="fan-image-product"><img src={fanProxyUrl(selectedId)} alt={selected.label} /><figcaption>图片由 FAN 官方接口按需加载；显示异常时可稍后重试。</figcaption></figure> : null}
            {EXTERNAL_INTERFACES.has(selectedId) ? <article className="fan-external-product"><Globe2 size={34} /><h3>{selected.label}</h3><p>{selected.id === "cenc-ws" ? "该 WebSocket 由 LabWatch 本机服务端使用授权信息连接，不向浏览器或发布包暴露密钥。实时烈度结果进入地震看板。" : "此服务由 FAN 官方页面提供，点击后在新窗口打开。"}</p><a href={selected.endpoint} target="_blank" rel="noreferrer">打开官方入口<ExternalLink size={14} /></a></article> : null}

            {loading ? <div className="fan-loading"><Loader2 className="spin" size={24} />正在读取 {selected.label}</div> : null}
            {error ? <div className="fan-data-error">{error}</div> : null}
            {!loading && !error && selectedId === "typhoon" ? <div className="fan-typhoon-grid">{typhoons.length ? typhoons.map((typhoon) => {
              const latest = typhoon.track.length ? typhoon.track[typhoon.track.length - 1] : undefined;
              return <article key={typhoon.id} className={typhoon.active ? "active" : ""}><header><Wind size={18} /><div><strong>{typhoon.name} {typhoon.englishName}</strong><small>{typhoon.id}</small></div><b>{typhoon.active ? "活动" : "历史"}</b></header><dl><div><dt>当前位置</dt><dd>{latest ? `${latest.latitude.toFixed(1)}°N ${latest.longitude.toFixed(1)}°E` : "--"}</dd></div><div><dt>中心气压</dt><dd>{latest?.pressure ?? "--"} hPa</dd></div><div><dt>路径点</dt><dd>{typhoon.track.length}</dd></div><div><dt>预报机构</dt><dd>{typhoon.forecasts.length}</dd></div></dl></article>;
            }) : <div className="fan-empty-state compact">当前资料中没有有效台风路径。</div>}</div> : null}
            {!loading && !error && payload && selectedId === "rain-forecast" && isRecord(payload) ? <article className="fan-summary-card"><CloudRain size={22} /><div><strong>{compactValue(payloadCount(payload))} 个降水区域</strong><span>资料时次 {compactValue(isRecord(payload.properties) ? payload.properties.time : "")}</span></div></article> : null}
            {!loading && !error && payload && !IMAGE_INTERFACES.has(selectedId) && !EXTERNAL_INTERFACES.has(selectedId) && selectedId !== "typhoon" ? <>
              <div className="fan-data-summary"><strong>{payloadCount(payload).toLocaleString()} 条资料</strong><span>界面最多渲染 80 行，避免大数据接口阻塞动画。</span></div>
              {rows.length ? <div className="fan-data-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.Id ?? row.id ?? row.station_id ?? index)}>{columns.map((column) => <td key={column}>{compactValue(row[column])}</td>)}</tr>)}</tbody></table></div> : <pre className="fan-json-preview">{JSON.stringify(payload, null, 2).slice(0, 12_000)}</pre>}
            </> : null}
          </section>}
    </main>
  </>;
}
