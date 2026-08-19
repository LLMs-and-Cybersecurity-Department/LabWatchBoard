import { ExternalLink, Layers3, Loader2, Map as MapIcon, X } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchCencProducts, type CencProductLayer, type CencProductSnapshot } from "./cencProducts";
import type { EarthquakeEvent } from "./earthquake";

type CencProductsDialogProps = {
  event: EarthquakeEvent;
  onClose: () => void;
  onShowLayer?: (layer: CencProductLayer) => void;
};

export function CencProductsDialog({ event, onClose, onShowLayer }: CencProductsDialogProps) {
  const [snapshot, setSnapshot] = useState<CencProductSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    fetchCencProducts({ eventId: event.sourceEventId, time: event.time, signal: controller.signal })
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

  const product = snapshot?.product;
  const restricted = snapshot?.state === "restricted";
  return (
    <div className="mechanism-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <section className="mechanism-dialog cenc-product-dialog" role="dialog" aria-modal="true" aria-labelledby="cenc-product-title">
        <header>
          <div><span>CENC 中国地震台网中心</span><h2 id="cenc-product-title">官方地震专题产品</h2></div>
          <button title="关闭 CENC 产品" aria-label="关闭 CENC 产品" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{event.place}</strong><span>{event.magnitudeType} {event.magnitude.toFixed(1)} · {event.sourceEventId}</span></div>
        {!snapshot && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>正在从服务端读取 CENC 产品页</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {snapshot && <div className="cenc-product-content">
          <div className={`cenc-product-state ${snapshot.state}`}><strong>{snapshot.state === "online" ? "已读取官方页面" : snapshot.state === "stale" ? "显示缓存页面" : snapshot.state === "restricted" ? "CENC 出口受限" : "CENC 页面暂不可用"}</strong><span>{snapshot.egressMode === "http-proxy" ? "本机 7893 HTTP 代理" : snapshot.egressMode === "configured-relay" ? "服务端配置出口" : "服务端直连"}{snapshot.latencyMs === null ? "" : ` · ${snapshot.latencyMs} ms`}</span></div>
          {restricted && <p className="seismic-source-error">当前出口收到 CENC 的访问限制（HTTP 403/451）。请在服务端配置你有权限使用的中国 HTTPS 转发服务；应用不会绕过验证码，也不会把错误页当成实时产品。</p>}
          {snapshot.error && !restricted && <p className="seismic-source-error">{snapshot.error}</p>}
          {product && <>
            <h3>{product.title}</h3>
            {product.summary && <p className="cenc-product-summary">{product.summary}</p>}
            {product.sections && product.sections.length > 0 && <div className="cenc-product-sections">{product.sections.slice(0, 8).map((section) => <article key={`${section.title}:${section.text}`}><strong>{section.title}</strong><p>{section.text}</p></article>)}</div>}
            {product.layers.length > 0 && <div className="cenc-product-layers"><strong><Layers3 size={14} />可显示图层</strong>{product.layers.map((layer, index) => <button key={`${layer.title}:${index}`} disabled={!layer.data} onClick={() => layer.data && onShowLayer?.(layer)}><MapIcon size={14} />{layer.title}{layer.data ? ` · ${layer.data.features.length} 要素` : " · 页面未提供可解析 GeoJSON"}</button>)}</div>}
            {product.images.length > 0 && <div className="cenc-product-images">{product.images.slice(0, 8).map((image) => <a key={image.url} href={image.url} target="_blank" rel="noreferrer"><img src={image.proxyUrl ?? image.url} alt={image.label} loading="lazy" /><span>{image.label}</span></a>)}</div>}
            {product.links.length > 0 && <div className="cenc-product-links">{product.links.slice(0, 16).map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={12} /></a>)}</div>}
            <details><summary>页面文字摘要</summary><p>{product.text || "页面没有可提取文字。"}</p></details>
          </>}
          <footer className="cenc-product-footer"><span>读取时间 {new Date(snapshot.fetchedAt).toLocaleString("zh-CN")}</span><a href={snapshot.officialUrl} target="_blank" rel="noreferrer">打开 CENC 官方专题页<ExternalLink size={12} /></a></footer>
        </div>}
      </section>
    </div>
  );
}
