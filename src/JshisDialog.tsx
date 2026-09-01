import { AlertTriangle, ExternalLink, Layers3, Loader2, MapPin, Mountain, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchJshisFault,
  fetchJshisLocation,
  type JshisFaultShape,
  type JshisLocationSnapshot,
} from "./jshis";

type JshisTab = "hazard" | "site" | "landslide" | "faults";

type JshisDialogProps = {
  latitude: number;
  longitude: number;
  label: string;
  onLoaded: (snapshot: JshisLocationSnapshot) => void;
  onFaultLoaded: (fault: JshisFaultShape) => void;
  onClose: () => void;
};

function percent(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function number(value: number | null, digits = 1) {
  return value === null ? "--" : value.toFixed(digits);
}

export function JshisDialog({ latitude, longitude, label, onLoaded, onFaultLoaded, onClose }: JshisDialogProps) {
  const [snapshot, setSnapshot] = useState<JshisLocationSnapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<JshisTab>("hazard");
  const [faultLoadingCode, setFaultLoadingCode] = useState("");
  const [selectedFault, setSelectedFault] = useState<JshisFaultShape | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    fetchJshisLocation(latitude, longitude, controller.signal)
      .then((result) => {
        setSnapshot(result);
        onLoaded(result);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : String(requestError));
      });
    return () => controller.abort();
  }, [latitude, longitude, onLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const loadFault = async (code: string) => {
    setFaultLoadingCode(code);
    setError("");
    try {
      const result = await fetchJshisFault(code);
      setSelectedFault(result);
      onFaultLoaded(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setFaultLoadingCode("");
    }
  };

  const hazard = snapshot?.hazard;
  const site = snapshot?.site;
  const landslide = snapshot?.landslide;

  return (
    <div className="mechanism-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="mechanism-dialog jshis-dialog" role="dialog" aria-modal="true" aria-labelledby="jshis-dialog-title">
        <header>
          <div><span>防災科研 J-SHIS 官方 API</span><h2 id="jshis-dialog-title">位置地震风险与地质产品</h2></div>
          <button title="关闭 J-SHIS" aria-label="关闭 J-SHIS" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mechanism-event-line"><strong>{label}</strong><span>{latitude.toFixed(4)}, {longitude.toFixed(4)}</span></div>
        <nav className="jshis-tabs" aria-label="J-SHIS 产品">
          <button className={tab === "hazard" ? "active" : ""} onClick={() => setTab("hazard")}>概率地震动</button>
          <button className={tab === "site" ? "active" : ""} onClick={() => setTab("site")}>浅层地盘</button>
          <button className={tab === "landslide" ? "active" : ""} onClick={() => setTab("landslide")}>滑坡地形</button>
          <button className={tab === "faults" ? "active" : ""} onClick={() => setTab("faults")}>影响断层</button>
        </nav>
        {!snapshot && !error && <div className="mechanism-loading"><Loader2 size={24} /><span>正在并行读取四组 J-SHIS 官方端点</span></div>}
        {error && <div className="error-banner">{error}</div>}
        {snapshot && (
          <div className="jshis-content">
            {snapshot.partial && <div className="jshis-partial"><AlertTriangle size={14} />部分官方端点暂不可用：{snapshot.errors.map((item) => item.product).join("、")}</div>}
            {tab === "hazard" && (hazard ? <>
              <header><Layers3 size={15} /><div><strong>概率地震动预测地图网格</strong><span>2024 年版 · 平均模型 · 全地震活动</span></div><b>{hazard.meshcode}</b></header>
              <div className="jshis-metric-grid">
                <article><span>30 年内震度 5弱+</span><strong>{percent(hazard.probabilities.shindo5Lower)}</strong></article>
                <article><span>30 年内震度 5强+</span><strong>{percent(hazard.probabilities.shindo5Upper)}</strong></article>
                <article><span>30 年内震度 6弱+</span><strong>{percent(hazard.probabilities.shindo6Lower)}</strong></article>
                <article><span>30 年内震度 6强+</span><strong>{percent(hazard.probabilities.shindo6Upper)}</strong></article>
                <article><span>3% 概率对应 IJMA</span><strong>{number(hazard.scenarioIntensity.probability3Percent)}</strong></article>
                <article><span>6% 概率对应 IJMA</span><strong>{number(hazard.scenarioIntensity.probability6Percent)}</strong></article>
              </div>
              <p>该网格表示长期概率地震动危险度，不是实时预警或本次地震的观测震度。打开图层后以网格轮廓叠加。</p>
            </> : <div className="jshis-empty">概率地震动端点本次未返回数据。</div>)}
            {tab === "site" && (site ? <>
              <header><Mountain size={15} /><div><strong>浅层地盘模型</strong><span>V4 · 约 250 m 网格</span></div><b>{site.meshcode}</b></header>
              <div className="jshis-site-summary">
                <strong>{site.geomorphology ?? "未提供微地形分类"}</strong>
                <dl>
                  <div><dt>Vs30</dt><dd>{number(site.vs30Mps)} m/s</dd></div>
                  <div><dt>工程基岩 S 波速度</dt><dd>{number(site.engineeringBedrockVsMps)} m/s</dd></div>
                  <div><dt>地盘放大率 ARV</dt><dd>{number(site.amplification, 2)}</dd></div>
                  <div><dt>微地形代码</dt><dd>{site.geomorphologyCode ?? "--"}</dd></div>
                </dl>
              </div>
              <p>浅层地盘端点独立于概率危险度；Vs30 和放大率用于描述场地响应条件。</p>
            </> : <div className="jshis-empty">浅层地盘端点本次未返回数据。</div>)}
            {tab === "landslide" && (landslide ? <>
              <header><MapPin size={15} /><div><strong>地震诱发滑坡地形判定</strong><span>位置包含关系端点</span></div><b className={landslide.intersects ? "danger" : "ok"}>{landslide.intersects ? "落入目标地形" : "未落入"}</b></header>
              <div className="jshis-landslide-result">
                <strong>{landslide.intersects ? "该位置落在 J-SHIS 滑坡地形数据范围内" : "该网格未报告滑坡地形包含关系"}</strong>
                <span>滑落崖 {landslide.scarps.length} · 移动物体多边形 {landslide.movingMasses.length} · 网格 {landslide.meshcode || "--"}</span>
              </div>
              <a href={landslide.officialMapUrl} target="_blank" rel="noreferrer">在 J-SHIS 官方地图查看滑坡图层<ExternalLink size={13} /></a>
            </> : <div className="jshis-empty">滑坡地形端点本次未返回数据。</div>)}
            {tab === "faults" && <>
              <header><AlertTriangle size={15} /><div><strong>当前位置的影响断层排序</strong><span>按 J-SHIS 官方 score 排序，最多显示 24 项</span></div><b>{snapshot.faults.length}</b></header>
              <div className="jshis-fault-list">
                {snapshot.faults.map((fault) => <article key={fault.code} className={selectedFault?.code === fault.code ? "active" : ""}>
                  <span className="jshis-fault-rank">#{fault.rank ?? "--"}</span>
                  <div><strong>{fault.name}</strong><small>{fault.code} · M {fault.magnitude ?? "--"} · 预期 IJMA {number(fault.expectedIjma)}</small></div>
                  <div><span>发生概率 {percent(fault.occurrenceProbability)}</span><span>贡献评分 {number(fault.score, 3)}</span></div>
                  <button disabled={Boolean(faultLoadingCode)} onClick={() => void loadFault(fault.code)}>
                    {faultLoadingCode === fault.code ? <Loader2 size={13} /> : <Layers3 size={13} />}
                    {faultLoadingCode === fault.code ? "下载大型点云…" : selectedFault?.code === fault.code ? "已叠加" : "叠加断层面"}
                  </button>
                </article>)}
                {!snapshot.faults.length && <div className="jshis-empty">该位置没有返回可排序的断层模型。</div>}
              </div>
              {selectedFault && <div className="jshis-selected-fault"><strong>{selectedFault.name ?? selectedFault.code}</strong><span>{selectedFault.features.features.length} 个官方几何要素 · {selectedFault.rendering?.strategy === "webgl" ? `WebGL ${selectedFault.rendering.renderCoordinateCount.toLocaleString("zh-CN")} 点` : "GeoJSON 渲染"}{selectedFault.rendering?.simplified ? `（由 ${selectedFault.rendering.sourceCoordinateCount.toLocaleString("zh-CN")} 点安全抽样）` : ""} · 30 年概率 {percent(selectedFault.probability30Years)} · {selectedFault.model ?? "未注明"} 模型</span></div>}
            </>}
          </div>
        )}
        {snapshot && <footer className="jshis-footer"><p>J-SHIS 数据用于防灾科研参考；概率危险度、场地条件、滑坡包含关系和断层模型来自四类不同官方端点。</p><a href={snapshot.officialMapUrl} target="_blank" rel="noreferrer">打开 J-SHIS 官方地图<ExternalLink size={13} /></a><a href={snapshot.documentationUrl} target="_blank" rel="noreferrer">API 文档<ExternalLink size={13} /></a></footer>}
      </section>
    </div>
  );
}
