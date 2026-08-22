import { Activity, Download, ExternalLink, Layers3, Loader2, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { EarthquakeEvent } from "./earthquake";

type MotionComponents = {
  unit: string;
  eastWest: number | null;
  northSouth: number | null;
  vertical: number | null;
  intensityScaleValue: number | null;
};

type CwaProductStation = {
  id: string;
  name: string;
  countyName: string;
  latitude: number;
  longitude: number;
  intensity: string;
  rank: number;
  status: string;
  backAzimuth: number | null;
  epicenterDistanceKm: number | null;
  pga: MotionComponents | null;
  pgv: MotionComponents | null;
  waveImageUrl: string | null;
};

type CwaTownIntensity = {
  countyName: string;
  townName: string;
  townCode: string;
  latitude: number;
  longitude: number;
  intensity: string;
  rank: number;
};

type CwaProductSnapshot = {
  source: "cwa";
  fetchedAt: string;
  cache: "HIT" | "MISS";
  report: {
    eventId: string;
    datasetId: "E-A0015-001" | "E-A0016-001";
    earthquakeNo: string;
    reportType: string;
    reportColor: string;
    reportContent: string;
    reportRemark: string;
    issuedAt: string;
    validUntil: string | null;
    originTime: string;
    officialUrl: string | null;
    reportImageUrl: string | null;
    shakeMapImageUrl: string | null;
    affectedAreas: Array<{ name: string; intensity: string; rank: number }>;
    stations: CwaProductStation[];
  };
  assets: {
    reportImageUrl: string | null;
    shakeMapImageUrl: string | null;
    isoseismalImageUrl: string | null;
    strongMotionArchiveUrl: string | null;
  };
  townIntensities: CwaTownIntensity[];
};

export type CwaIntensityPoint = {
  id: string;
  name: string;
  areaName: string;
  latitude: number;
  longitude: number;
  intensity: string;
  rank: number;
  kind: "station" | "town";
  pga: MotionComponents | null;
  pgv: MotionComponents | null;
  epicenterDistanceKm: number | null;
};

export type CwaIntensityLayer = {
  eventId: string;
  title: string;
  kind: "station" | "town";
  points: CwaIntensityPoint[];
};

type CwaProductsDialogProps = {
  event: EarthquakeEvent;
  onClose: () => void;
  onShowLayer: (layer: CwaIntensityLayer) => void;
};

function datasetForEvent(event: EarthquakeEvent) {
  return event.status.includes("小区域") ? "E-A0016-001" : "E-A0015-001";
}

async function fetchCwaProducts(event: EarthquakeEvent, signal: AbortSignal) {
  const query = new URLSearchParams({
    event_id: event.sourceEventId,
    dataset_id: datasetForEvent(event),
  });
  const response = await fetch(`/api/cwa-products?${query}`, { signal, headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null) as CwaProductSnapshot | { error?: string; detail?: string } | null;
  if (!response.ok || !payload || !("report" in payload)) {
    const errorPayload = payload && !("report" in payload) ? payload : null;
    throw new Error(errorPayload?.detail || errorPayload?.error || `CWA 产品接口返回 ${response.status}`);
  }
  return payload;
}

function motionSummary(value: MotionComponents | null) {
  if (!value) return "--";
  const components = [value.eastWest, value.northSouth, value.vertical].filter((item): item is number => item !== null);
  return components.length ? `${Math.max(...components).toFixed(2)} ${value.unit}` : "--";
}

function stationLayer(event: EarthquakeEvent, stations: CwaProductStation[]): CwaIntensityLayer {
  return {
    eventId: event.id,
    title: `${event.place} · CWA 官方测站震度`,
    kind: "station",
    points: stations.map((station) => ({
      id: station.id,
      name: station.name,
      areaName: station.countyName,
      latitude: station.latitude,
      longitude: station.longitude,
      intensity: station.intensity,
      rank: station.rank,
      kind: "station",
      pga: station.pga,
      pgv: station.pgv,
      epicenterDistanceKm: station.epicenterDistanceKm,
    })),
  };
}

function townLayer(event: EarthquakeEvent, towns: CwaTownIntensity[]): CwaIntensityLayer {
  return {
    eventId: event.id,
    title: `${event.place} · CWA 官方乡镇震度`,
    kind: "town",
    points: towns.map((town) => ({
      id: town.townCode || `${town.countyName}:${town.townName}`,
      name: town.townName,
      areaName: town.countyName,
      latitude: town.latitude,
      longitude: town.longitude,
      intensity: town.intensity,
      rank: town.rank,
      kind: "town",
      pga: null,
      pgv: null,
      epicenterDistanceKm: null,
    })),
  };
}

export function CwaProductsDialog({ event, onClose, onShowLayer }: CwaProductsDialogProps) {
  const [snapshot, setSnapshot] = useState<CwaProductSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    fetchCwaProducts(event, controller.signal)
      .then(setSnapshot)
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : String(requestError));
      });
    return () => controller.abort();
  }, [event]);

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => keyboardEvent.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const images = useMemo(() => {
    if (!snapshot) return [];
    return [
      { label: "官方地震报告图", url: snapshot.assets.reportImageUrl },
      { label: "官方 Shakemap", url: snapshot.assets.shakeMapImageUrl },
      { label: "官方等震度图", url: snapshot.assets.isoseismalImageUrl },
    ].filter((item): item is { label: string; url: string } => Boolean(item.url))
      .filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);
  }, [snapshot]);

  return (
    <div className="mechanism-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <section className="mechanism-dialog cwa-product-dialog" role="dialog" aria-modal="true" aria-labelledby="cwa-product-title">
        <header>
          <div><span>CWA 中央气象署 · 进阶会员接口</span><h2 id="cwa-product-title">官方震度与强震产品</h2></div>
          <button title="关闭 CWA 产品" aria-label="关闭 CWA 产品" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{event.place}</strong><span>{event.magnitudeType} {event.magnitude.toFixed(1)} · {event.sourceEventId}</span></div>
        {!snapshot && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>按需读取 CWA 官方详细报告与产品</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {snapshot && <div className="cwa-product-content">
          <div className="cwa-product-summary">
            <div><strong>{snapshot.report.reportType}</strong><span>{snapshot.report.reportColor || "官方报告"}</span></div>
            <p>{snapshot.report.reportContent || event.note || "中央气象署官方地震报告"}</p>
            {snapshot.report.reportRemark && <small>{snapshot.report.reportRemark}</small>}
          </div>

          <section className="cwa-product-metrics" aria-label="CWA 官方产品统计">
            <article><span>县市震度</span><strong>{snapshot.report.affectedAreas.length}</strong></article>
            <article><span>实测震度站</span><strong>{snapshot.report.stations.length}</strong></article>
            <article><span>乡镇震度点</span><strong>{snapshot.townIntensities.length}</strong></article>
            <article><span>资料集</span><strong>{snapshot.report.datasetId.replace("E-A00", "")}</strong></article>
          </section>

          <section className="cwa-product-layer-actions">
            <strong><Layers3 size={14} />应用内显示官方图层</strong>
            <button disabled={!snapshot.report.stations.length} onClick={() => onShowLayer(stationLayer(event, snapshot.report.stations))}><MapPin size={14} />测站震度 · {snapshot.report.stations.length} 点</button>
            <button disabled={!snapshot.townIntensities.length} onClick={() => onShowLayer(townLayer(event, snapshot.townIntensities))}><MapPin size={14} />乡镇震度 · {snapshot.townIntensities.length} 点（仅最新显著报告）</button>
          </section>

          {snapshot.report.affectedAreas.length > 0 && <section className="cwa-affected-areas"><strong>官方县市最大震度</strong><div>{snapshot.report.affectedAreas.map((area) => <span key={area.name} data-rank={Math.floor(area.rank)}>{area.name}<b>{area.intensity}</b></span>)}</div></section>}

          {images.length > 0 && <section className="cwa-product-images">{images.map((image) => <a key={image.url} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.label} loading="lazy" /><span>{image.label}<ExternalLink size={11} /></span></a>)}</section>}

          {snapshot.assets.strongMotionArchiveUrl && <a className="cwa-wave-archive" href={snapshot.assets.strongMotionArchiveUrl} target="_blank" rel="noreferrer"><Download size={15} /><span><strong>下载官方强地动波形包</strong><small>E-A0015-004 ZIP · 仅与当前最新显著报告匹配时显示</small></span></a>}

          <section className="cwa-station-table">
            <header><Activity size={14} /><strong>官方实测震度站</strong><span>震度 · PGA · PGV · 震中距</span></header>
            <div className="cwa-station-table-head"><span>测站</span><span>震度</span><span>PGA</span><span>PGV</span><span>距离</span><span>波形</span></div>
            {snapshot.report.stations.map((station) => <div className="cwa-station-row" key={station.id}>
              <span><strong>{station.name}</strong><small>{station.countyName} · {station.id}</small></span>
              <b>{station.intensity}</b>
              <span>{motionSummary(station.pga)}</span>
              <span>{motionSummary(station.pgv)}</span>
              <span>{station.epicenterDistanceKm === null ? "--" : `${station.epicenterDistanceKm.toFixed(1)} km`}</span>
              <span>{station.waveImageUrl ? <a href={station.waveImageUrl} target="_blank" rel="noreferrer" title={`${station.name} 官方波形图`}><Activity size={13} /></a> : "--"}</span>
            </div>)}
          </section>

          <footer className="cwa-product-footer"><span>服务端按需缓存 · {snapshot.cache} · {new Date(snapshot.fetchedAt).toLocaleString("zh-CN")}</span>{snapshot.report.officialUrl && <a href={snapshot.report.officialUrl} target="_blank" rel="noreferrer">打开 CWA 官方记录<ExternalLink size={12} /></a>}</footer>
        </div>}
      </section>
    </div>
  );
}
