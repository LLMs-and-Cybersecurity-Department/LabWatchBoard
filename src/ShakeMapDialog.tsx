import { ExternalLink, Loader2, Map as MapIcon, X } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchEarthquakeShakeMap, type EarthquakeEvent, type EarthquakeShakeMap } from "./earthquake";

type ShakeMapDialogProps = {
  event: EarthquakeEvent;
  onClose: () => void;
};

export function ShakeMapDialog({ event, onClose }: ShakeMapDialogProps) {
  const [shakeMap, setShakeMap] = useState<EarthquakeShakeMap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setShakeMap(null);
    setError("");
    fetchEarthquakeShakeMap(event, controller.signal).then(setShakeMap).catch((requestError) => {
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
      <section className="mechanism-dialog shakemap-dialog" role="dialog" aria-modal="true" aria-labelledby="shakemap-title">
        <header>
          <div><span>USGS 官方产品</span><h2 id="shakemap-title">ShakeMap 烈度图</h2></div>
          <button title="关闭 ShakeMap" aria-label="关闭 ShakeMap" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{event.place}</strong><span>{event.magnitudeType} {event.magnitude.toFixed(1)} · {event.sourceEventId}</span></div>
        {!shakeMap && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>正在读取 USGS ShakeMap 官方产品</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {shakeMap && <div className="shakemap-dialog-content">
          <div className="shakemap-product-summary">
            <span><MapIcon size={15} />MMI 等值线 {shakeMap.contours.features.length} 组</span>
            <span>最大 MMI <strong>{shakeMap.maxMmi.toFixed(1)}</strong></span>
            <span>审核状态 <strong>{shakeMap.reviewStatus}</strong></span>
            {shakeMap.version && <span>版本 <strong>{shakeMap.version}</strong></span>}
          </div>
          {shakeMap.intensityImageUrl
            ? <a className="shakemap-official-image" href={shakeMap.intensityImageUrl} target="_blank" rel="noreferrer"><img src={shakeMap.intensityImageUrl} alt={`${event.place} USGS ShakeMap 官方烈度图`} /></a>
            : <div className="shakemap-image-unavailable">该产品提供官方等值线，但未提供 intensity.jpg 预览图。</div>}
          <div className="shakemap-dialog-footer">
            <p>图像和 MMI 等值线均直接来自该事件的 USGS ShakeMap 产品；产品可能随机构复核更新。</p>
            <a href={shakeMap.officialUrl} target="_blank" rel="noreferrer">打开 USGS ShakeMap 产品页<ExternalLink size={14} /></a>
          </div>
        </div>}
      </section>
    </div>
  );
}
