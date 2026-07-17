import { ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fetchEarthquakeMechanism, type EarthquakeEvent, type EarthquakeMechanism } from "./earthquake";
import { Beachball } from "./vendor/usgs-beachball/beachball";
import { Tensor } from "./vendor/usgs-beachball/tensor";

type FocalMechanismDialogProps = {
  event: EarthquakeEvent;
  onClose: () => void;
};

function property(properties: Record<string, string>, key: string) {
  const value = properties[key];
  return value && value !== "undefined" ? value : "--";
}

export function FocalMechanismDialog({ event, onClose }: FocalMechanismDialogProps) {
  const [mechanism, setMechanism] = useState<EarthquakeMechanism | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const providerLabel = event.source === "emsc" ? "EMSC 收录产品" : "USGS 官方产品";

  useEffect(() => {
    const controller = new AbortController();
    setMechanism(null);
    setError("");
    fetchEarthquakeMechanism(event, controller.signal).then(setMechanism).catch((requestError) => {
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

  useEffect(() => {
    if (!mechanism || !canvasRef.current) return;
    const tensor = Tensor.fromProduct({ type: mechanism.type, properties: mechanism.properties });
    if (!tensor) {
      setError("官方产品缺少可绘制的张量或节点面参数");
      return;
    }
    Beachball.render(tensor, canvasRef.current, {
      size: 246,
      bgColor: "#ffffff",
      fillColor: "#111719",
      lineColor: "#111719",
      lineWidth: 1.15,
      labelAxes: false,
      labelPlanes: true,
      labelPlanesFont: "12px Arial",
      plotAxes: true,
      plotPlanes: true,
    });
  }, [mechanism]);

  return (
    <div className="mechanism-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <section className="mechanism-dialog" role="dialog" aria-modal="true" aria-labelledby="mechanism-title">
        <header>
          <div><span>{providerLabel}</span><h2 id="mechanism-title">地震机制解</h2></div>
          <button title="关闭机制解" aria-label="关闭机制解" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{event.place}</strong><span>{event.magnitudeType} {event.magnitude.toFixed(1)} · {event.sourceEventId}</span></div>
        {!mechanism && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>正在读取 {providerLabel}</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {mechanism && (
          <div className="mechanism-content">
            <div className="mechanism-beachball"><canvas ref={canvasRef} width="246" height="246" aria-label={`${providerLabel}地震机制解沙滩球`} /><small>压缩象限为深色 · {mechanism.source === "emsc" ? "EMSC 收录" : "USGS"} / {mechanism.productSource}</small></div>
            <div className="mechanism-properties">
              <dl>
                <div><dt>产品类型</dt><dd>{mechanism.type === "moment-tensor" ? "矩张量" : "震源机制"}</dd></div>
                <div><dt>审核状态</dt><dd>{mechanism.reviewStatus}</dd></div>
                <div><dt>标量地震矩</dt><dd>{property(mechanism.properties, "scalar-moment")}</dd></div>
                <div><dt>双力偶比例</dt><dd>{property(mechanism.properties, "percent-double-couple")}</dd></div>
              </dl>
              <table>
                <thead><tr><th>节点面</th><th>走向</th><th>倾角</th><th>滑动角</th></tr></thead>
                <tbody>
                  <tr><td>NP1</td><td>{property(mechanism.properties, "nodal-plane-1-strike")}°</td><td>{property(mechanism.properties, "nodal-plane-1-dip")}°</td><td>{property(mechanism.properties, "nodal-plane-1-rake")}°</td></tr>
                  <tr><td>NP2</td><td>{property(mechanism.properties, "nodal-plane-2-strike")}°</td><td>{property(mechanism.properties, "nodal-plane-2-dip")}°</td><td>{property(mechanism.properties, "nodal-plane-2-rake")}°</td></tr>
                </tbody>
              </table>
              <a href={mechanism.officialUrl} target="_blank" rel="noreferrer">打开 {mechanism.source === "emsc" ? "EMSC 官方矩张量记录" : "USGS 官方产品页"}<ExternalLink size={14} /></a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
