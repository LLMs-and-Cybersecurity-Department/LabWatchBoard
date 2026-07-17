import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LocateFixed,
  Maximize2,
  Minimize2,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  checkJapanCameraAvailability,
  findPlayableJapanCamera,
  isJapanCameraEvent,
  isJapanCameraAvailabilityUsable,
  materializeJapanCameraRelay,
  rankJapanCameras,
  resolveJapanCameraRelay,
} from "./japanCameras";
import type { LiveEew } from "./seismic";

type SeismicCameraRelayProps = {
  event: LiveEew | null;
  replayMode: boolean;
  replayTimestamp: number | null;
};

type CameraProbeState = {
  cameraId: string;
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  videoId: string | null;
  message: string;
  historical: boolean;
  archiveStartTime: string | null;
  seekSeconds: number | null;
};

function emptyProbe(cameraId = "", status: CameraProbeState["status"] = "idle", message = ""): CameraProbeState {
  return { cameraId, status, videoId: null, message, historical: false, archiveStartTime: null, seekSeconds: null };
}

function relayModeLabel(mode: ReturnType<typeof resolveJapanCameraRelay>["temporalMode"]) {
  if (mode === "historical") return "历史录像";
  if (mode === "current-live-fallback") return "回放旁路";
  return "LIVE";
}

function relayModeDescription(mode: ReturnType<typeof resolveJapanCameraRelay>["temporalMode"]) {
  if (mode === "historical") return "官方归档 · 已定位事件时刻";
  if (mode === "current-live-fallback") return "当前直播 · 非该历史事件录像";
  return "官方当前画面";
}

export function SeismicCameraRelay({ event, replayMode, replayTimestamp }: SeismicCameraRelayProps) {
  const relevant = Boolean(event && !event.cancelled && isJapanCameraEvent(event));
  const ranked = useMemo(
    () => event && relevant ? rankJapanCameras(event) : [],
    [event?.latitude, event?.longitude, relevant],
  );
  const eventKey = event ? `${event.source}:${event.id}:${event.originTime}` : "";
  const sessionKey = eventKey ? `${replayMode ? "replay" : "live"}:${eventKey}` : "";
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [dismissedSessionKey, setDismissedSessionKey] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [frameLoading, setFrameLoading] = useState(true);
  const [manualSelection, setManualSelection] = useState(false);
  const [autoSkipped, setAutoSkipped] = useState(0);
  const [probe, setProbe] = useState<CameraProbeState>(() => emptyProbe());
  const nearestCameraId = ranked[0]?.camera.id ?? "";

  useEffect(() => {
    if (!sessionKey || !ranked.length) return;
    setSelectedCameraId(ranked[0].camera.id);
    setDismissedSessionKey("");
    setCollapsed(false);
    setManualSelection(false);
    setAutoSkipped(0);
    setProbe(emptyProbe());
  }, [nearestCameraId, sessionKey]);

  const selectedIndex = Math.max(0, ranked.findIndex(({ camera }) => camera.id === selectedCameraId));
  const selected = ranked[selectedIndex] ?? ranked[0] ?? null;
  const relay = selected
    ? resolveJapanCameraRelay(selected.camera, replayMode ? replayTimestamp : null)
    : null;
  const playableRelay = relay && probe.status === "ready" && probe.videoId
    ? materializeJapanCameraRelay(relay, probe.videoId, {
      historical: probe.historical,
      archiveStartTime: probe.archiveStartTime,
      seekSeconds: probe.seekSeconds,
    })
    : null;

  useEffect(() => {
    if (!sessionKey || !ranked.length || manualSelection) return;
    const controller = new AbortController();
    const replayAt = replayMode ? replayTimestamp : null;
    setProbe(emptyProbe(ranked[0].camera.id, "loading", replayMode ? "正在并行查找覆盖事件时刻的官方录像" : "正在并行检查附近官方镜头"));

    void findPlayableJapanCamera(ranked, {
      replayTimestamp: replayAt,
      signal: controller.signal,
      batchSize: 6,
    }).then((candidate) => {
        if (controller.signal.aborted) return;
        if (candidate) {
          const { availability } = candidate;
          const historical = candidate.relay.temporalMode === "historical" || availability.historical;
          setSelectedCameraId(candidate.ranked.camera.id);
          setAutoSkipped(candidate.index);
          setProbe({
            cameraId: candidate.ranked.camera.id,
            status: "ready",
            videoId: availability.videoId,
            message: "",
            historical,
            archiveStartTime: availability.archiveStartTime ?? candidate.relay.archiveStartTime,
            seekSeconds: availability.seekSeconds,
          });
          return;
        }
        setSelectedCameraId(ranked[0].camera.id);
        setAutoSkipped(Math.max(0, ranked.length - 1));
        setProbe(emptyProbe(ranked[0].camera.id, "unavailable", "附近目录中暂时没有可嵌入的直播或匹配历史录像"));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setProbe(emptyProbe(ranked[0].camera.id, "error", error instanceof Error ? error.message : "摄像头可用性检查失败"));
      });

    return () => controller.abort();
  }, [manualSelection, ranked, replayMode, replayTimestamp, sessionKey]);

  useEffect(() => {
    if (!sessionKey || !selected || !relay || !manualSelection) return;
    const controller = new AbortController();
    const cameraId = selected.camera.id;
    setProbe(emptyProbe(cameraId, "loading", replayMode ? "正在查找覆盖事件时刻的官方录像" : "正在检查官方镜头可用性"));
    void checkJapanCameraAvailability(relay.stream, controller.signal, replayMode ? replayTimestamp : null)
      .then((availability) => {
        if (controller.signal.aborted) return;
        const historical = relay.temporalMode === "historical" || availability.historical;
        if (isJapanCameraAvailabilityUsable(relay, availability) && availability.videoId) {
          setProbe({
            cameraId,
            status: "ready",
            videoId: availability.videoId,
            message: "",
            historical,
            archiveStartTime: availability.archiveStartTime ?? relay.archiveStartTime,
            seekSeconds: availability.seekSeconds,
          });
          return;
        }
        const message = availability.available && !historical && !availability.isLiveNow
          ? "该镜头直播当前未开始或已经结束"
          : availability.reason ?? "该镜头当前不可嵌入";
        setProbe(emptyProbe(cameraId, "unavailable", message));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setProbe(emptyProbe(cameraId, "error", error instanceof Error ? error.message : "摄像头可用性检查失败"));
      });
    return () => controller.abort();
  }, [manualSelection, relay?.stream.id, relay?.stream.kind, relay?.temporalMode, replayMode, replayTimestamp, selected?.camera.id, sessionKey]);

  useEffect(() => {
    if (playableRelay?.embedUrl) setFrameLoading(true);
  }, [playableRelay?.embedUrl]);

  if (!relevant || !selected || !relay || dismissedSessionKey === sessionKey) return null;
  const displayRelay = playableRelay ?? relay;

  const selectCamera = (index: number, manual = true) => {
    const normalized = (index + ranked.length) % ranked.length;
    setManualSelection(manual);
    setAutoSkipped(0);
    setProbe(emptyProbe());
    setSelectedCameraId(ranked[normalized].camera.id);
  };

  return (
    <aside
      className={`seismic-camera-relay ${collapsed ? "is-collapsed" : ""}`}
      data-camera-id={selected.camera.id}
      data-temporal-mode={displayRelay.temporalMode}
      data-camera-probe-status={probe.status}
      aria-label="日本地震附近监控摄像头中继"
    >
      <header>
        <div className="seismic-camera-title">
          <Video size={15} />
          <span><strong>{selected.camera.name}</strong><small>{selected.camera.area} · 约 {selected.distanceKm.toFixed(0)} km</small></span>
        </div>
        <div className="seismic-camera-window-actions">
          <b className={displayRelay.temporalMode}>{relayModeLabel(displayRelay.temporalMode)}</b>
          <button title={collapsed ? "展开摄像头" : "折叠摄像头"} aria-label={collapsed ? "展开摄像头" : "折叠摄像头"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <Maximize2 size={13} /> : <Minimize2 size={13} />}</button>
          <button title="本事件隐藏摄像头" aria-label="本事件隐藏摄像头" onClick={() => setDismissedSessionKey(sessionKey)}><X size={14} /></button>
        </div>
      </header>
      {!collapsed && <>
        <div className="seismic-camera-frame">
          {probe.status !== "ready" && <div className={`seismic-camera-frame-status ${probe.status}`} aria-live="polite"><Video size={20} /><span>{probe.status === "loading" || probe.status === "idle" ? "正在查找可播放的官方镜头" : probe.message}</span>{probe.status === "unavailable" && manualSelection ? <small>可切换其他镜头或打开机构原页</small> : null}</div>}
          {playableRelay && <>
            {frameLoading && <div className="seismic-camera-frame-loading"><Video size={20} /><span>正在连接官方视频</span></div>}
            <iframe
              key={playableRelay.embedUrl}
              src={playableRelay.embedUrl}
              title={`${selected.camera.provider} ${selected.camera.name}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              onLoad={() => setFrameLoading(false)}
            />
          </>}
        </div>
        <div className={`seismic-camera-temporal-note ${displayRelay.temporalMode}`}>
          <span>{relayModeDescription(displayRelay.temporalMode)}</span>
          <small>{event?.place}{autoSkipped > 0 ? ` · 已跳过 ${autoSkipped} 个不可播放镜头` : ""}</small>
        </div>
        <nav aria-label="摄像头切换">
          <button title="上一个附近镜头" aria-label="上一个附近镜头" onClick={() => selectCamera(selectedIndex - 1)}><ChevronLeft size={14} /></button>
          <button title="恢复最近可用镜头" aria-label="恢复最近可用镜头" onClick={() => selectCamera(0, false)}><LocateFixed size={14} /></button>
          <span>{selectedIndex + 1} / {ranked.length}</span>
          <button title="下一个附近镜头" aria-label="下一个附近镜头" onClick={() => selectCamera(selectedIndex + 1)}><ChevronRight size={14} /></button>
          <a href={selected.camera.officialPageUrl} target="_blank" rel="noreferrer">机构原页<ExternalLink size={11} /></a>
          <a href={playableRelay?.watchUrl ?? relay.watchUrl} target="_blank" rel="noreferrer" title="在 YouTube 打开"><Video size={12} /></a>
        </nav>
      </>}
    </aside>
  );
}
