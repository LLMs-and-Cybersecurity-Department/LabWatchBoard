import { Building2, ExternalLink, Loader2, MapPinned, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  fetchEarthquakePager,
  type EarthquakeEvent,
  type EarthquakePager,
  type EarthquakePagerAlert,
} from "./earthquake";

type UsgsPagerDialogProps = {
  event: EarthquakeEvent;
  initialPager?: EarthquakePager | null;
  onLoaded?: (pager: EarthquakePager) => void;
  onClose: () => void;
};

const GRAPH_LABELS: Array<[keyof EarthquakePager["images"], string]> = [
  ["populationExposure", "Estimated Population Exposure to Earthquake Shaking"],
  ["fatalities", "Estimated Fatalities"],
  ["economicLosses", "Estimated Economic Losses"],
];

function compactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function AlertProbability({ alert, label }: { alert: EarthquakePagerAlert | null; label: string }) {
  if (!alert) return null;
  return <section className="pager-probability-card">
    <header><strong>{label}</strong><span className={`pager-alert-level level-${alert.level}`}>{alert.level.toUpperCase()}</span></header>
    <div className="pager-probability-bins">
      {alert.bins.map((bin, index) => <div key={`${bin.minimum}:${bin.maximum}:${index}`}>
        <span>{bin.minimum}–{bin.maximum} {alert.units}</span>
        <div><i className={`level-${bin.color}`} style={{ width: `${Math.max(1, bin.probability * 100)}%` }} /></div>
        <strong>{(bin.probability * 100).toFixed(1)}%</strong>
      </div>)}
    </div>
  </section>;
}

export function UsgsPagerDialog({ event, initialPager = null, onLoaded, onClose }: UsgsPagerDialogProps) {
  const matchingInitial = initialPager?.eventId === event.sourceEventId ? initialPager : null;
  const [pager, setPager] = useState<EarthquakePager | null>(matchingInitial);
  const [error, setError] = useState("");

  useEffect(() => {
    if (matchingInitial) {
      setPager(matchingInitial);
      setError("");
      return;
    }
    const controller = new AbortController();
    setPager(null);
    setError("");
    fetchEarthquakePager(event, controller.signal).then((result) => {
      setPager(result);
      onLoaded?.(result);
    }).catch((requestError) => {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    });
    return () => controller.abort();
  }, [event, matchingInitial, onLoaded]);

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => keyboardEvent.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const strongestCities = useMemo(() => pager?.allCities.slice(0, 16) ?? [], [pager]);

  return (
    <div className="mechanism-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <section className="mechanism-dialog pager-dialog" role="dialog" aria-modal="true" aria-labelledby="pager-title">
        <header>
          <div><span>USGS 官方影响产品</span><h2 id="pager-title">PAGER 人员与经济影响</h2></div>
          <button title="关闭 PAGER" aria-label="关闭 PAGER" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{event.place}</strong><span>{event.magnitudeType} {event.magnitude.toFixed(1)} · {event.sourceEventId}</span></div>
        {!pager && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>正在读取 USGS PAGER 官方产品</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {pager && <div className="pager-dialog-content">
          <div className="pager-product-summary">
            <span className={`pager-alert-level level-${pager.alertLevel}`}>{pager.alertLevel.toUpperCase()} ALERT</span>
            <span><Users size={14} />人口暴露 <strong>{compactNumber(pager.populationExposure.totalPopulation)}</strong></span>
            <span><MapPinned size={14} />Show all cities <strong>{pager.allCities.length}</strong></span>
            <span>最大 MMI <strong>{pager.maxMmi?.toFixed(1) ?? "--"}</strong></span>
            <span>审核 <strong>{pager.reviewStatus}</strong></span>
          </div>

          <section className="pager-three-graphs" aria-label="PAGER 三项官方估算图">
            {GRAPH_LABELS.map(([key, label]) => <article key={key}>
              <h3>{label}</h3>
              {pager.images[key]
                ? <a href={pager.images[key] ?? undefined} target="_blank" rel="noreferrer"><img src={pager.images[key] ?? undefined} alt={`${event.place} ${label}`} /></a>
                : <div className="pager-image-unavailable">本版产品未提供此图</div>}
            </article>)}
          </section>

          <section className="pager-exposure-section">
            <header><div><Users size={16} /><strong>Population Exposure</strong></div><span>按 MMI 分级人数</span></header>
            <div className="pager-exposure-grid">
              {pager.populationExposure.groups.map((group) => <div key={group.label} className={`mmi-${group.maximumMmi}`}>
                <span>MMI {group.label}</span><strong>{compactNumber(group.population)}</strong><small>人</small>
              </div>)}
            </div>
          </section>

          <div className="pager-probability-grid">
            <AlertProbability alert={pager.alerts.fatality} label="Estimated Fatalities Probability" />
            <AlertProbability alert={pager.alerts.economic} label="Estimated Economic Loss Probability" />
          </div>

          {pager.comments && <section className="pager-structure-summary">
            <header><Building2 size={16} /><strong>Structure Information Summary</strong></header>
            {pager.comments.impact.map((text, index) => <p key={`impact:${index}`}>{text}</p>)}
            {pager.comments.structure && <p><b>建筑结构：</b>{pager.comments.structure}</p>}
            {pager.comments.historical && <p><b>历史影响：</b>{pager.comments.historical}</p>}
            {pager.comments.secondaryHazards && <p><b>次生灾害：</b>{pager.comments.secondaryHazards}</p>}
          </section>}

          <section className="pager-cities-section">
            <header>
              <div><MapPinned size={16} /><strong>Show all cities</strong></div>
              <span>完整 {pager.allCities.length} 城市；地图与表格均不按 USGS `on_map` 子集过滤</span>
            </header>
            <div className="pager-cities-highlight">
              {strongestCities.map((city) => <span key={city.id}><i className={`mmi-${Math.max(1, Math.min(10, Math.round(city.mmi)))}`}>{city.mmi.toFixed(1)}</i>{city.name}</span>)}
            </div>
            <div className="pager-cities-table-wrap">
              <table>
                <thead><tr><th>城市</th><th>MMI</th><th>人口</th><th>坐标</th><th>官方默认图</th></tr></thead>
                <tbody>{pager.allCities.map((city) => <tr key={city.id}>
                  <td>{city.capital && <b>★ </b>}{city.name}</td>
                  <td><span className={`pager-city-mmi mmi-${Math.max(1, Math.min(10, Math.round(city.mmi)))}`}>{city.mmi.toFixed(1)}</span></td>
                  <td>{city.population.toLocaleString("zh-CN")}</td>
                  <td>{city.latitude.toFixed(3)}, {city.longitude.toFixed(3)}</td>
                  <td>{city.onOfficialMap ? "是" : "否（仍显示）"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>

          <div className="pager-dialog-footer">
            <p>全部估算、图片与城市数据直接来自该事件的 USGS PAGER 产品，自动产品可能随复核更新。</p>
            <div>
              {pager.onePagerPdfUrl && <a href={pager.onePagerPdfUrl} target="_blank" rel="noreferrer">OnePAGER PDF<ExternalLink size={14} /></a>}
              <a href={pager.officialUrl} target="_blank" rel="noreferrer">打开 USGS PAGER<ExternalLink size={14} /></a>
            </div>
          </div>
        </div>}
      </section>
    </div>
  );
}
