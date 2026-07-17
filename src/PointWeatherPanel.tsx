import { BellRing, Check, Database, Loader2, Table2, Thermometer, Trash2, Waves, Wind } from "lucide-react";
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PROVIDERS, type ProviderId } from "./providers";
import type { PointForecast } from "./pointForecast";
import type { Station } from "./types";
import type { WeatherAlertEvent } from "./weatherAlerts";

type ForecastCollection = Partial<Record<ProviderId, PointForecast>>;
type ForecastErrors = Partial<Record<ProviderId, string>>;
type PanelTab = "meteogram" | "comparison" | "alerts";

type ForecastEntry = {
  id: ProviderId;
  label: string;
  forecast: PointForecast;
};

type ForecastSummary = {
  historyTemperatureMean: number | null;
  historyTemperatureRange: [number, number] | null;
  historyWindMean: number | null;
  historyGustMax: number | null;
  forecastTemperatureRange: [number, number] | null;
  forecastWindMean: number | null;
  forecastGustMax: number | null;
  forecastPrecipitation: number | null;
  forecastEnd: string;
};

type PointWeatherPanelProps = {
  station: Station;
  forecasts: ForecastCollection;
  errors: ForecastErrors;
  loading: boolean;
  selectedProvider: ProviderId;
  alertHistory: WeatherAlertEvent[];
  onClearAlertHistory: () => void;
};

const MODEL_COLORS: Record<ProviderId, string> = {
  ecmwf: "#60a5fa",
  gfs: "#e879f9",
  icon: "#22d3ee",
  cma: "#facc15",
  jma: "#4ade80",
};

const CHART = {
  width: 1040,
  height: 374,
  left: 54,
  right: 18,
  temperatureTop: 43,
  temperatureHeight: 112,
  windTop: 203,
  windHeight: 112,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

const alertTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

const SOUND_LABELS: Record<WeatherAlertEvent["sound"], string> = {
  double: "双音 + 语音",
  beep: "蜂鸣",
  voice: "中文语音",
  silent: "静音记录",
};

function parseUtc(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  return Date.parse(normalized);
}

function finite(values: Array<number | null>) {
  return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

function average(values: Array<number | null>) {
  const numbers = finite(values);
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null;
}

function maximum(values: Array<number | null>) {
  const numbers = finite(values);
  return numbers.length ? Math.max(...numbers) : null;
}

function range(values: Array<number | null>): [number, number] | null {
  const numbers = finite(values);
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : null;
}

function sum(values: Array<number | null>) {
  const numbers = finite(values);
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
}

function valuesInWindow(forecast: PointForecast, values: Array<number | null>, start: number, end: number) {
  return values.filter((_, index) => {
    const time = parseUtc(forecast.series.time[index] ?? "");
    return Number.isFinite(time) && time >= start && time < end;
  });
}

function summarizeForecast(forecast: PointForecast): ForecastSummary {
  const currentTime = parseUtc(forecast.forecastTime);
  const historyStart = currentTime - 48 * HOUR_MS;
  const forecastEnd = currentTime + 24 * HOUR_MS;
  const historicalTemperature = valuesInWindow(
    forecast,
    forecast.series.temperatureC,
    historyStart,
    currentTime,
  );
  const historicalWind = valuesInWindow(forecast, forecast.series.windSpeedMs, historyStart, currentTime);
  const historicalGust = valuesInWindow(forecast, forecast.series.windGustMs, historyStart, currentTime);
  const futureTemperature = valuesInWindow(
    forecast,
    forecast.series.temperatureC,
    currentTime,
    forecastEnd,
  );
  const futureWind = valuesInWindow(forecast, forecast.series.windSpeedMs, currentTime, forecastEnd);
  const futureGust = valuesInWindow(forecast, forecast.series.windGustMs, currentTime, forecastEnd);
  const futurePrecipitation = valuesInWindow(
    forecast,
    forecast.series.precipitationMm,
    currentTime,
    forecastEnd,
  );

  return {
    historyTemperatureMean: average(historicalTemperature),
    historyTemperatureRange: range(historicalTemperature),
    historyWindMean: average(historicalWind),
    historyGustMax: maximum(historicalGust),
    forecastTemperatureRange: range(futureTemperature),
    forecastWindMean: average(futureWind),
    forecastGustMax: maximum(futureGust),
    forecastPrecipitation: sum(futurePrecipitation),
    forecastEnd: forecast.series.time[forecast.series.time.length - 1] ?? forecast.forecastTime,
  };
}

function formatMetric(value: number | null, unit: string, digits = 1) {
  return value === null ? "--" : `${value.toFixed(digits)} ${unit}`;
}

function formatRange(value: [number, number] | null, unit: string) {
  return value ? `${value[0].toFixed(1)}–${value[1].toFixed(1)} ${unit}` : "--";
}

function chartExtent(values: number[], fallback: [number, number], includeZero = false): [number, number] {
  if (!values.length) return fallback;
  let minimum = Math.min(...values);
  let maximumValue = Math.max(...values);
  if (includeZero) minimum = Math.min(0, minimum);
  const span = Math.max(maximumValue - minimum, includeZero ? 2 : 4);
  const padding = span * 0.12;
  minimum = includeZero ? Math.max(0, minimum - padding) : minimum - padding;
  maximumValue += padding;
  return [minimum, maximumValue];
}

function axisTicks([minimum, maximumValue]: [number, number], count = 3) {
  return Array.from({ length: count + 1 }, (_, index) => minimum + ((maximumValue - minimum) * index) / count);
}

function linePath(
  times: string[],
  values: Array<number | null>,
  scaleX: (value: number) => number,
  scaleY: (value: number) => number,
) {
  let path = "";
  let drawing = false;
  for (let index = 0; index < times.length; index += 1) {
    const value = values[index];
    const time = parseUtc(times[index]);
    if (value === null || !Number.isFinite(value) || !Number.isFinite(time)) {
      drawing = false;
      continue;
    }
    const command = drawing ? "L" : "M";
    path += `${command}${scaleX(time).toFixed(1)},${scaleY(value).toFixed(1)}`;
    drawing = true;
  }
  return path;
}

function nearestIndex(times: string[], target: number) {
  if (!times.length) return -1;
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (parseUtc(times[middle]) < target) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return 0;
  const previous = parseUtc(times[low - 1]);
  const current = parseUtc(times[low]);
  return Math.abs(previous - target) <= Math.abs(current - target) ? low - 1 : low;
}

function MeteogramChart({
  entries,
  visibleModels,
  selectedProvider,
}: {
  entries: ForecastEntry[];
  visibleModels: ProviderId[];
  selectedProvider: ProviderId;
}) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const visibleEntries = entries.filter((entry) => visibleModels.includes(entry.id));
  const allTimes = entries.flatMap((entry) => entry.forecast.series.time.map(parseUtc)).filter(Number.isFinite);
  const minimumTime = allTimes.length ? Math.min(...allTimes) : Date.now() - 48 * HOUR_MS;
  const maximumTime = allTimes.length ? Math.max(...allTimes) : Date.now() + 10 * DAY_MS;
  const selectedEntry =
    visibleEntries.find((entry) => entry.id === selectedProvider) ?? visibleEntries[0] ?? entries[0];
  const currentTime = selectedEntry ? parseUtc(selectedEntry.forecast.forecastTime) : Date.now();
  const focusTime = hoverTime ?? currentTime;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const scaleX = (value: number) =>
    CHART.left + ((value - minimumTime) / Math.max(maximumTime - minimumTime, 1)) * plotWidth;

  const temperatures = visibleEntries.flatMap((entry) => finite(entry.forecast.series.temperatureC));
  const winds = visibleEntries.flatMap((entry) => finite(entry.forecast.series.windSpeedMs));
  const gusts = selectedEntry ? finite(selectedEntry.forecast.series.windGustMs) : [];
  const temperatureExtent = chartExtent(temperatures, [-10, 35]);
  const windExtent = chartExtent([...winds, ...gusts], [0, 20], true);
  const scaleTemperature = (value: number) =>
    CHART.temperatureTop +
    CHART.temperatureHeight -
    ((value - temperatureExtent[0]) / Math.max(temperatureExtent[1] - temperatureExtent[0], 1)) *
      CHART.temperatureHeight;
  const scaleWind = (value: number) =>
    CHART.windTop +
    CHART.windHeight -
    ((value - windExtent[0]) / Math.max(windExtent[1] - windExtent[0], 1)) * CHART.windHeight;
  const dayTicks: number[] = [];
  for (let value = Math.ceil(minimumTime / DAY_MS) * DAY_MS; value <= maximumTime; value += DAY_MS) {
    dayTicks.push(value);
  }

  const focusedReadouts = visibleEntries.map((entry) => {
    const index = nearestIndex(entry.forecast.series.time, focusTime);
    return {
      ...entry,
      temperature: index >= 0 ? entry.forecast.series.temperatureC[index] : null,
      wind: index >= 0 ? entry.forecast.series.windSpeedMs[index] : null,
      gust: index >= 0 ? entry.forecast.series.windGustMs[index] : null,
    };
  });

  const handlePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewBoxX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * CHART.width;
    const ratio = Math.max(0, Math.min(1, (viewBoxX - CHART.left) / plotWidth));
    setHoverTime(minimumTime + ratio * (maximumTime - minimumTime));
  };

  const focusStage =
    focusTime < currentTime - HOUR_MS / 2
      ? "模式回溯"
      : focusTime > currentTime + HOUR_MS / 2
        ? "模式预测"
        : "当前";

  return (
    <div className="meteogram-view">
      <div className="meteogram-chart-shell">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label="各机构过去 48 小时与未来 10 天温度和风速 Meteogram"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHoverTime(null)}
        >
          <defs>
            <clipPath id="point-meteogram-clip">
              <rect
                x={CHART.left}
                y={CHART.temperatureTop}
                width={plotWidth}
                height={CHART.windTop + CHART.windHeight - CHART.temperatureTop}
              />
            </clipPath>
          </defs>
          <rect x={CHART.left} y={28} width={plotWidth} height={310} className="meteogram-plot-bg" />
          <rect
            x={CHART.left}
            y={28}
            width={Math.max(0, scaleX(currentTime) - CHART.left)}
            height={310}
            className="meteogram-history-band"
          />
          <text x={CHART.left + 8} y={42} className="meteogram-stage-label">过去 48h · 模式回溯</text>
          <text x={Math.min(scaleX(currentTime) + 10, CHART.width - 145)} y={42} className="meteogram-stage-label forecast">未来 10 天 · 模式预测</text>

          {dayTicks.map((value) => (
            <g key={value}>
              <line x1={scaleX(value)} y1={28} x2={scaleX(value)} y2={338} className="meteogram-day-grid" />
              <text x={scaleX(value)} y={358} textAnchor="middle" className="meteogram-axis-text">
                {dayFormatter.format(value)}
              </text>
            </g>
          ))}

          {axisTicks(temperatureExtent).map((value) => (
            <g key={`temperature-${value}`}>
              <line
                x1={CHART.left}
                y1={scaleTemperature(value)}
                x2={CHART.width - CHART.right}
                y2={scaleTemperature(value)}
                className="meteogram-value-grid"
              />
              <text x={CHART.left - 8} y={scaleTemperature(value) + 4} textAnchor="end" className="meteogram-axis-text">
                {value.toFixed(0)}°
              </text>
            </g>
          ))}
          {axisTicks(windExtent).map((value) => (
            <g key={`wind-${value}`}>
              <line
                x1={CHART.left}
                y1={scaleWind(value)}
                x2={CHART.width - CHART.right}
                y2={scaleWind(value)}
                className="meteogram-value-grid"
              />
              <text x={CHART.left - 8} y={scaleWind(value) + 4} textAnchor="end" className="meteogram-axis-text">
                {value.toFixed(0)}
              </text>
            </g>
          ))}

          <text x={CHART.left} y={CHART.temperatureTop - 8} className="meteogram-track-label">2 m 温度 (°C)</text>
          <text x={CHART.left} y={CHART.windTop - 12} className="meteogram-track-label">10 m 风速 / 阵风 (m/s)</text>

          <g clipPath="url(#point-meteogram-clip)">
            {visibleEntries.map((entry) => (
              <path
                key={`${entry.id}-temperature`}
                d={linePath(
                  entry.forecast.series.time,
                  entry.forecast.series.temperatureC,
                  scaleX,
                  scaleTemperature,
                )}
                fill="none"
                stroke={MODEL_COLORS[entry.id]}
                strokeWidth={entry.id === selectedProvider ? 2.8 : 1.7}
                opacity={entry.id === selectedProvider ? 1 : 0.8}
                vectorEffect="non-scaling-stroke"
              >
                <title>{entry.label} 2 米温度</title>
              </path>
            ))}
            {visibleEntries.map((entry) => (
              <path
                key={`${entry.id}-wind`}
                d={linePath(entry.forecast.series.time, entry.forecast.series.windSpeedMs, scaleX, scaleWind)}
                fill="none"
                stroke={MODEL_COLORS[entry.id]}
                strokeWidth={entry.id === selectedProvider ? 2.8 : 1.7}
                opacity={entry.id === selectedProvider ? 1 : 0.8}
                vectorEffect="non-scaling-stroke"
              >
                <title>{entry.label} 10 米平均风速</title>
              </path>
            ))}
            {selectedEntry && (
              <path
                d={linePath(
                  selectedEntry.forecast.series.time,
                  selectedEntry.forecast.series.windGustMs,
                  scaleX,
                  scaleWind,
                )}
                fill="none"
                stroke={MODEL_COLORS[selectedEntry.id]}
                strokeWidth={1.6}
                strokeDasharray="6 5"
                opacity={0.72}
                vectorEffect="non-scaling-stroke"
              >
                <title>{selectedEntry.label} 阵风</title>
              </path>
            )}
          </g>

          <line
            x1={scaleX(currentTime)}
            y1={28}
            x2={scaleX(currentTime)}
            y2={338}
            className="meteogram-now-line"
          />
          <text x={scaleX(currentTime)} y={22} textAnchor="middle" className="meteogram-now-label">当前</text>
          <line
            x1={scaleX(focusTime)}
            y1={28}
            x2={scaleX(focusTime)}
            y2={338}
            className={hoverTime === null ? "meteogram-focus-line current" : "meteogram-focus-line"}
          />
        </svg>
      </div>

      <div className="meteogram-readout-heading">
        <strong>{focusStage} · {timeFormatter.format(focusTime)} UTC</strong>
        <span>实线为平均风，虚线为当前接口阵风</span>
      </div>
      <div className="meteogram-readouts">
        {focusedReadouts.map((entry) => (
          <article className={entry.id === selectedProvider ? "selected" : ""} key={entry.id}>
            <header>
              <i style={{ backgroundColor: MODEL_COLORS[entry.id] }} />
              <strong>{entry.label}</strong>
            </header>
            <dl>
              <div><dt><Thermometer size={13} /> 温度</dt><dd>{formatMetric(entry.temperature, "°C")}</dd></div>
              <div><dt><Wind size={13} /> 风</dt><dd>{formatMetric(entry.wind, "m/s")}</dd></div>
              <div><dt>阵风</dt><dd>{formatMetric(entry.gust, "m/s")}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function ForecastComparison({
  forecasts,
  errors,
  selectedProvider,
}: {
  forecasts: ForecastCollection;
  errors: ForecastErrors;
  selectedProvider: ProviderId;
}) {
  const summaries = useMemo(
    () =>
      Object.fromEntries(
        PROVIDERS.flatMap((provider) => {
          const forecast = forecasts[provider.id];
          return forecast ? [[provider.id, summarizeForecast(forecast)]] : [];
        }),
      ) as Partial<Record<ProviderId, ForecastSummary>>,
    [forecasts],
  );

  const cell = (providerId: ProviderId, value: string) => {
    if (forecasts[providerId]) return value;
    return errors[providerId] ? "加载失败" : "加载中";
  };

  return (
    <div className="forecast-comparison" role="tabpanel" id="point-weather-comparison">
      <div className="forecast-comparison-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">时段 / 要素</th>
              {PROVIDERS.map((provider) => (
                <th
                  scope="col"
                  key={provider.id}
                  className={provider.id === selectedProvider ? "selected-provider" : ""}
                  title={errors[provider.id]}
                >
                  <i style={{ backgroundColor: MODEL_COLORS[provider.id] }} />
                  {provider.shortLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="comparison-period"><th colSpan={PROVIDERS.length + 1}>模式回溯 · 过去 48 小时</th></tr>
            <tr>
              <th scope="row">平均气温</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(summaries[id]?.historyTemperatureMean ?? null, "°C"))}</td>)}
            </tr>
            <tr>
              <th scope="row">温度范围</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatRange(summaries[id]?.historyTemperatureRange ?? null, "°C"))}</td>)}
            </tr>
            <tr>
              <th scope="row">平均风速</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(summaries[id]?.historyWindMean ?? null, "m/s"))}</td>)}
            </tr>
            <tr>
              <th scope="row">最大阵风</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(summaries[id]?.historyGustMax ?? null, "m/s"))}</td>)}
            </tr>

            <tr className="comparison-period"><th colSpan={PROVIDERS.length + 1}>当前 · 最近模式时次</th></tr>
            <tr>
              <th scope="row">温度</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(forecasts[id]?.current.temperatureC ?? null, "°C"))}</td>)}
            </tr>
            <tr>
              <th scope="row">平均风 / 阵风</th>
              {PROVIDERS.map(({ id }) => (
                <td key={id}>{cell(id, forecasts[id] ? `${formatMetric(forecasts[id]!.current.windSpeedMs, "m/s")} / ${formatMetric(forecasts[id]!.current.windGustMs, "m/s")}` : "")}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">天气</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, forecasts[id]?.current.weatherText ?? "")}</td>)}
            </tr>

            <tr className="comparison-period"><th colSpan={PROVIDERS.length + 1}>预测 · 未来 24 小时</th></tr>
            <tr>
              <th scope="row">温度范围</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatRange(summaries[id]?.forecastTemperatureRange ?? null, "°C"))}</td>)}
            </tr>
            <tr>
              <th scope="row">平均风速</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(summaries[id]?.forecastWindMean ?? null, "m/s"))}</td>)}
            </tr>
            <tr>
              <th scope="row">最大阵风</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(summaries[id]?.forecastGustMax ?? null, "m/s"))}</td>)}
            </tr>
            <tr>
              <th scope="row">累计降水</th>
              {PROVIDERS.map(({ id }) => <td key={id}>{cell(id, formatMetric(summaries[id]?.forecastPrecipitation ?? null, "mm"))}</td>)}
            </tr>
            <tr>
              <th scope="row">预报覆盖至</th>
              {PROVIDERS.map(({ id }) => (
                <td key={id}>{cell(id, summaries[id] ? `${timeFormatter.format(parseUtc(summaries[id]!.forecastEnd))} UTC` : "")}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeatherAlertHistory({
  events,
  onClear,
}: {
  events: WeatherAlertEvent[];
  onClear: () => void;
}) {
  return (
    <div className="weather-alert-history" role="tabpanel" id="point-weather-alerts">
      <div className="weather-alert-history-toolbar">
        <div>
          <strong>气象阈值触发记录</strong>
          <span>最近 30 天 · 最多保留 200 条 · 自动触发跨刷新去重</span>
        </div>
        <button
          aria-label="清空气象预警历史"
          title="清空气象预警历史"
          disabled={!events.length}
          onClick={onClear}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {events.length ? (
        <div className="weather-alert-history-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">触发时间</th>
                <th scope="col">机构 / 点位</th>
                <th scope="col">风险与触发值</th>
                <th scope="col">方式</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const warning = event.risks.some((risk) => risk.level === "warning");
                return (
                  <tr key={event.id} className={warning ? "warning" : "watch"}>
                    <td>
                      <strong>{alertTimeFormatter.format(event.triggeredAt)}</strong>
                      <span>UTC+8</span>
                    </td>
                    <td>
                      <strong>{event.providerLabel} · {event.station.name || "当前点位"}</strong>
                      <span>{event.station.lat.toFixed(4)}, {event.station.lon.toFixed(4)}</span>
                    </td>
                    <td>
                      <div className="weather-alert-risk-summary">
                        {event.risks.map((risk) => (
                          <div key={`${event.id}-${risk.id}`}>
                            <b className={risk.level}>{risk.level === "warning" ? "警告" : "关注"}</b>
                            <strong>{risk.title}</strong>
                            <span>{risk.detail}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong>{event.source === "automatic" ? "自动触发" : "手动播报"}</strong>
                      <span>{SOUND_LABELS[event.sound]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="weather-alert-history-empty">
          <BellRing size={23} />
          <strong>尚无气象预警记录</strong>
          <span>开启超阈值自动播报，或在告警抽屉中执行手动播报后，事件会显示在这里。</span>
        </div>
      )}
    </div>
  );
}

export function PointWeatherPanel({
  station,
  forecasts,
  errors,
  loading,
  selectedProvider,
  alertHistory,
  onClearAlertHistory,
}: PointWeatherPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("meteogram");
  const [visibleModels, setVisibleModels] = useState<ProviderId[]>(() => PROVIDERS.map((provider) => provider.id));
  const entries = PROVIDERS.flatMap((provider) => {
    const forecast = forecasts[provider.id];
    return forecast ? [{ id: provider.id, label: provider.shortLabel, forecast }] : [];
  });
  const loadedCount = entries.length;
  const errorCount = Object.keys(errors).length;

  const toggleModel = (providerId: ProviderId) => {
    setVisibleModels((current) => {
      if (!current.includes(providerId)) return [...current, providerId];
      return current.length > 1 ? current.filter((id) => id !== providerId) : current;
    });
  };

  return (
    <section className="point-weather-panel" aria-label="点击点位 Meteogram 与多机构预报">
      <header className="point-weather-header">
        <div className="point-weather-title">
          <Waves size={18} />
          <div>
            <span>点击点位</span>
            <strong>{station.name || "当前点位"} · 多模式 Meteogram</strong>
            <small>{station.lat.toFixed(4)}, {station.lon.toFixed(4)} · UTC</small>
          </div>
        </div>
        <div className="point-weather-load-state" aria-live="polite">
          {loading && <Loader2 size={14} />}
          <span>{loadedCount}/{PROVIDERS.length} 机构</span>
          {errorCount > 0 && <b>{errorCount} 个失败</b>}
        </div>
        <div className="point-weather-tabs" role="tablist" aria-label="点位图表视图">
          <button
            className={activeTab === "meteogram" ? "active" : ""}
            role="tab"
            aria-selected={activeTab === "meteogram"}
            aria-controls="point-weather-meteogram"
            onClick={() => setActiveTab("meteogram")}
          >
            <Waves size={15} />
            Meteogram
          </button>
          <button
            className={activeTab === "comparison" ? "active" : ""}
            role="tab"
            aria-selected={activeTab === "comparison"}
            aria-controls="point-weather-comparison"
            onClick={() => setActiveTab("comparison")}
          >
            <Table2 size={15} />
            温度与风对比
          </button>
          <button
            className={activeTab === "alerts" ? "active" : ""}
            role="tab"
            aria-selected={activeTab === "alerts"}
            aria-controls="point-weather-alerts"
            onClick={() => setActiveTab("alerts")}
          >
            <BellRing size={15} />
            预警历史
            {alertHistory.length > 0 && <b className="point-weather-tab-count">{alertHistory.length}</b>}
          </button>
        </div>
      </header>

      {activeTab === "meteogram" && (
        <div className="point-weather-body" role="tabpanel" id="point-weather-meteogram">
          <div className="model-toggle-row" aria-label="显示机构">
            {PROVIDERS.map((provider) => {
              const active = visibleModels.includes(provider.id);
              const available = Boolean(forecasts[provider.id]);
              return (
                <button
                  key={provider.id}
                  className={`${active ? "active" : ""}${provider.id === selectedProvider ? " selected-provider" : ""}`}
                  aria-pressed={active}
                  disabled={!available}
                  title={errors[provider.id] ?? `${active ? "隐藏" : "显示"} ${provider.shortLabel}`}
                  onClick={() => toggleModel(provider.id)}
                >
                  <i style={{ backgroundColor: MODEL_COLORS[provider.id] }} />
                  {provider.shortLabel}
                  {active && available && <Check size={12} />}
                </button>
              );
            })}
            <span className="meteoblue-style-badge">Meteoblue 风格</span>
          </div>

          {entries.length ? (
            <MeteogramChart
              entries={entries}
              visibleModels={visibleModels}
              selectedProvider={selectedProvider}
            />
          ) : (
            <div className="point-weather-empty">
              {loading ? <Loader2 size={22} /> : <Database size={22} />}
              <strong>{loading ? "正在加载多机构点位序列" : "多机构点位数据暂不可用"}</strong>
              <span>ECMWF、GFS、ICON、CMA 与 JMA 将在到达后逐个显示。</span>
            </div>
          )}
        </div>
      )}

      {activeTab === "comparison" && (
        <ForecastComparison forecasts={forecasts} errors={errors} selectedProvider={selectedProvider} />
      )}

      {activeTab === "alerts" && (
        <WeatherAlertHistory events={alertHistory} onClear={onClearAlertHistory} />
      )}

      <footer className="point-weather-source">
        <Database size={13} />
        {activeTab === "alerts" ? (
          <span>预警历史仅存储在当前浏览器；风险值来自当前选中机构的点位模式预报与气象图层。</span>
        ) : (
          <span>
            数值模式网格数据：{" "}
            {entries.map((entry, index) => (
              <span key={entry.id}>
                {index > 0 && " · "}
                <a href={entry.forecast.sourceUrl} target="_blank" rel="noreferrer">{entry.label}</a>
              </span>
            ))}
            {entries.length === 0 && "等待数据"}
            {" "}· 经 Open-Meteo 统一逐小时输出
          </span>
        )}
      </footer>
    </section>
  );
}
