import { Building2, ExternalLink, Loader2, ShieldCheck, Waves, X } from "lucide-react";
import { memo, type CSSProperties, useEffect, useState } from "react";

import {
  fetchNiedProducts,
  formatEarthquakeTime,
  formatMagnitudeType,
  type EarthquakeEvent,
  type EarthquakeTimeZone,
  type FnetMechanismProduct,
  type NiedOfficialProductLink,
  type NiedProductsSnapshot,
} from "./earthquake";

type NiedProductsDialogProps = {
  event: EarthquakeEvent;
  timeZone: EarthquakeTimeZone;
  onClose: () => void;
};

function number(value: number | null, digits = 1) {
  return value === null ? "--" : value.toFixed(digits);
}

function moment(value: number | null) {
  return value === null ? "--" : value.toExponential(2).replace("e+", " × 10^");
}

function solutionMethodLabel(method: FnetMechanismProduct["solutionMethod"]) {
  if (method === "automatic") return "自动机制解";
  if (method === "reviewed") return "人工复核解";
  return "目录机制解";
}

function OfficialLinkCard({ product, accent }: { product: NiedOfficialProductLink; accent: string }) {
  return (
    <article className="nied-official-card" style={{ "--nied-accent": accent } as CSSProperties}>
      <header>
        <span>{product.id === "aqua-cmt" ? "AQUA-CMT" : "HI-NET"}</span>
        <ShieldCheck size={15} />
      </header>
      <h3>{product.title}</h3>
      <p>{product.note}</p>
      <a href={product.officialUrl} target="_blank" rel="noreferrer">
        一键打开 NIED 官方页
        <ExternalLink size={14} />
      </a>
    </article>
  );
}

const FnetProductPanel = memo(function FnetProductPanel({
  product,
  timeZone,
}: {
  product: FnetMechanismProduct;
  timeZone: EarthquakeTimeZone;
}) {
  return (
    <article className="nied-fnet-card">
      <header>
        <div>
          <span>F-NET · NIED CMT SOLUTION</span>
          <h3>防灾科研 F-net {solutionMethodLabel(product.solutionMethod)}</h3>
        </div>
        <em className={product.solutionMethod === "automatic" ? "automatic" : ""}>{solutionMethodLabel(product.solutionMethod)}</em>
      </header>

      <div className="nied-fnet-readout">
        <dl>
          <div><dt>发震时间</dt><dd>{formatEarthquakeTime(product.originTime, timeZone, true)} {timeZone === "UTC" ? "UTC" : "UTC+8"}</dd></div>
          <div><dt>F-net 震中</dt><dd>{product.region}</dd></div>
          <div><dt>坐标</dt><dd>{product.latitude.toFixed(2)}°N / {product.longitude.toFixed(2)}°E</dd></div>
          <div><dt>JMA / 拟合深度</dt><dd>{number(product.jmaDepthKm, 0)} / {number(product.fittedDepthKm, 0)} km</dd></div>
          <div><dt>Mj / Mw</dt><dd>{number(product.jmaMagnitude)} / {number(product.momentMagnitude)}</dd></div>
          <div><dt>标量地震矩</dt><dd>{moment(product.scalarMomentNm)} Nm</dd></div>
          <div><dt>方差缩减</dt><dd>{number(product.varianceReduction, 2)}%</dd></div>
          <div><dt>使用台站</dt><dd>{number(product.stationCount, 0)} 站{product.stations.length ? ` · ${product.stations.join(" / ")}` : ""}</dd></div>
        </dl>
        <table>
          <thead><tr><th>节点面</th><th>走向</th><th>倾角</th><th>滑动角</th></tr></thead>
          <tbody>
            {product.nodalPlanes.map((plane, index) => (
              <tr key={`np-${index + 1}`}>
                <td>NP{index + 1}</td>
                <td>{plane.strike.toFixed(0)}°</td>
                <td>{plane.dip.toFixed(0)}°</td>
                <td>{plane.rake.toFixed(0)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(product.seismicityImageUrl || product.mechanismImageUrl) && (
        <div className="nied-fnet-figures">
          {product.seismicityImageUrl && (
            <figure>
              <img src={product.seismicityImageUrl} alt="NIED F-net 官方周边地震活动图" loading="lazy" referrerPolicy="no-referrer" />
              <figcaption>F-net 官方周边地震活动图</figcaption>
            </figure>
          )}
          {product.mechanismImageUrl && (
            <figure className="mechanism">
              <img src={product.mechanismImageUrl} alt="NIED F-net 官方机制解与波形拟合图" loading="lazy" referrerPolicy="no-referrer" />
              <figcaption>F-net 官方机制解、观测与合成波形拟合</figcaption>
            </figure>
          )}
        </div>
      )}

      <footer>
        <span>匹配差：{product.match.timeDifferenceSeconds} 秒 · {product.match.distanceKm.toFixed(1)} km</span>
        <a href={product.officialUrl} target="_blank" rel="noreferrer">打开 F-net 官方记录<ExternalLink size={14} /></a>
      </footer>
    </article>
  );
});

export function NiedProductsDialog({ event, timeZone, onClose }: NiedProductsDialogProps) {
  const [snapshot, setSnapshot] = useState<NiedProductsSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    fetchNiedProducts(event, controller.signal).then(setSnapshot).catch((requestError) => {
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
      <section className="nied-dialog" role="dialog" aria-modal="true" aria-labelledby="nied-products-title">
        <header>
          <div>
            <span>NIED PRODUCT CENTER</span>
            <h2 id="nied-products-title">日本震源与矩张量一键详情</h2>
          </div>
          <button title="关闭 NIED 详情" aria-label="关闭 NIED 详情" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="nied-event-line">
          <Building2 size={16} />
          <strong>{event.place}</strong>
          <span>{formatMagnitudeType(event.magnitudeType)} {event.magnitude.toFixed(1)} · {formatEarthquakeTime(event.time, timeZone, true)} · {event.latitude.toFixed(2)}, {event.longitude.toFixed(2)}</span>
        </div>

        {!snapshot && !error && <div className="nied-loading"><Loader2 size={26} /><strong>正在匹配 F-net 官方机制解</strong><span>仅在打开详情时查询，不随全球目录轮询。</span></div>}
        {error && <div className="error-banner">NIED 详情读取失败：{error}</div>}
        {snapshot && (
          <div className="nied-products-content">
            {snapshot.fnet.product
              ? <FnetProductPanel product={snapshot.fnet.product} timeZone={timeZone} />
              : <article className="nied-fnet-empty"><Waves size={24} /><strong>F-net 暂无匹配机制解</strong><span>{snapshot.fnet.message}</span><a href="https://www.fnet.bosai.go.jp/event/search.php?LANG=en" target="_blank" rel="noreferrer">打开 F-net 官方检索<ExternalLink size={14} /></a></article>}
            <div className="nied-official-links">
              <OfficialLinkCard product={snapshot.aquaCmt} accent="#52d3ff" />
              <OfficialLinkCard product={snapshot.hypocenter} accent="#f6b554" />
            </div>
            <p className="nied-rights-note"><ShieldCheck size={14} />F-net 数据按官方使用说明注明来源；Hi-net 内容仅链接官方页面，不在应用内复制或缓存震源信息与图件。</p>
          </div>
        )}
      </section>
    </div>
  );
}
