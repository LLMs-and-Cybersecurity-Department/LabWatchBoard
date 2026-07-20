import { ExternalLink, Loader2, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchEarthquakeDyfi, type EarthquakeDyfi, type EarthquakeEvent } from "./earthquake";

type UsgsDyfiDialogProps = {
  event: EarthquakeEvent;
  onClose: () => void;
};

const DYFI_IMAGES: Array<[keyof EarthquakeDyfi["images"], string]> = [
  ["communityIntensity", "Community Internet Intensity Map"],
  ["geocodedIntensity", "Geocoded Community Intensity Map"],
  ["intensityDistance", "Intensity vs. Distance"],
  ["responseTime", "Responses vs. Time"],
];

export function UsgsDyfiDialog({ event, onClose }: UsgsDyfiDialogProps) {
  const [dyfi, setDyfi] = useState<EarthquakeDyfi | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setDyfi(null);
    setError("");
    fetchEarthquakeDyfi(event, controller.signal).then(setDyfi).catch((requestError) => {
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

  return (
    <div className="mechanism-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <section className="mechanism-dialog dyfi-dialog" role="dialog" aria-modal="true" aria-labelledby="dyfi-title">
        <header>
          <div><span>USGS 官方公众感受产品</span><h2 id="dyfi-title">Did You Feel It?</h2></div>
          <button title="关闭 DYFI" aria-label="关闭 DYFI" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{event.place}</strong><span>{event.magnitudeType} {event.magnitude.toFixed(1)} · {event.sourceEventId}</span></div>
        {!dyfi && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>正在读取 USGS DYFI 官方图片与图表</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {dyfi && <div className="dyfi-dialog-content">
          <div className="dyfi-product-summary">
            <span><MessageCircle size={15} />公众报告 <strong>{dyfi.responses?.toLocaleString("zh-CN") ?? "--"}</strong></span>
            <span>最大 CDI/MMI <strong>{dyfi.maxMmi?.toFixed(1) ?? "--"}</strong></span>
            <span>状态 <strong>{dyfi.reviewStatus}</strong></span>
          </div>
          <section className="dyfi-image-grid">
            {DYFI_IMAGES.map(([key, label]) => {
              const url = dyfi.images[key];
              return <article key={key}><h3>{label}</h3>{url
                ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${event.place} ${label}`} /></a>
                : <div className="pager-image-unavailable">本版产品未提供此图</div>}</article>;
            })}
          </section>
          <div className="pager-dialog-footer">
            <p>图像和统计均来自该事件的 USGS Did You Feel It? 产品，不与仪器烈度混为一谈。</p>
            <a href={dyfi.officialUrl} target="_blank" rel="noreferrer">打开 USGS DYFI<ExternalLink size={14} /></a>
          </div>
        </div>}
      </section>
    </div>
  );
}
