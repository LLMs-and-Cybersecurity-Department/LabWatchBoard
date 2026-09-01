export type SeismicShindoSoundCue = "shindo0" | "shindo1" | "shindo2" | "shindo3" | "shindo4" | "shindo5" | "shindo6";

export const SEISMIC_SOUND_LIBRARY = {
  "general-countdown": { url: "/sound/general/countdown.wav", label: "S 波 60 秒倒计时开始", family: "general" },
  "general-ews": { url: "/sound/general/ews.mp3", label: "实时预警入口", family: "general" },
  "general-intense": { url: "/sound/general/intense.wav", label: "强震提示", family: "general" },
  "general-0s": { url: "/sound/general/0s.mp3", label: "S 波倒计时 0 秒", family: "replay" },
  "general-1s": { url: "/sound/general/1s.mp3", label: "S 波倒计时 1 秒", family: "replay" },
  "general-2s": { url: "/sound/general/2s.mp3", label: "S 波倒计时 2 秒", family: "replay" },
  "general-3s": { url: "/sound/general/3s.mp3", label: "S 波倒计时 3 秒", family: "replay" },
  "general-4s": { url: "/sound/general/4s.mp3", label: "S 波倒计时 4 秒", family: "replay" },
  "general-5s": { url: "/sound/general/5s.mp3", label: "S 波倒计时 5 秒", family: "replay" },
  "general-6s": { url: "/sound/general/6s.mp3", label: "S 波倒计时 6 秒", family: "replay" },
  "general-7s": { url: "/sound/general/7s.mp3", label: "S 波倒计时 7 秒", family: "replay" },
  "general-8s": { url: "/sound/general/8s.mp3", label: "S 波倒计时 8 秒", family: "replay" },
  "general-9s": { url: "/sound/general/9s.mp3", label: "S 波倒计时 9 秒", family: "replay" },
  "general-10s": { url: "/sound/general/10s.mp3", label: "S 波倒计时 10 秒", family: "replay" },
  "general-20s": { url: "/sound/general/20s.mp3", label: "S 波倒计时 20 秒", family: "replay" },
  "general-30s": { url: "/sound/general/30s.mp3", label: "S 波倒计时 30 秒", family: "replay" },
  "general-40s": { url: "/sound/general/40s.mp3", label: "S 波倒计时 40 秒", family: "replay" },
  "general-50s": { url: "/sound/general/50s.mp3", label: "S 波倒计时 50 秒", family: "replay" },
  "general-60s": { url: "/sound/general/60s.mp3", label: "S 波倒计时 60 秒", family: "replay" },
  "srev-cancel": { url: "/sound/srev/cancel.mp3", label: "预警解除", family: "eew" },
  "srev-caution": { url: "/sound/srev/shindo0.mp3", label: "接收 / 检知提示（震度 0）", family: "eew" },
  "srev-detail": { url: "/sound/srev/detail.mp3", label: "预警详情", family: "eew" },
  "srev-final": { url: "/sound/srev/final.mp3", label: "最终报文", family: "eew" },
  "srev-hypocenter": { url: "/sound/srev/hypocenter.mp3", label: "震源定位", family: "eew" },
  "srev-issue": { url: "/sound/srev/issue.mp3", label: "预警首报 / 回放预警提示", family: "eew" },
  "srev-prompt": { url: "/sound/srev/prompt.mp3", label: "震源待定 / 查找震源", family: "replay" },
  "srev-update": { url: "/sound/srev/update.mp3", label: "预警更新", family: "eew" },
  "srev-warn": { url: "/sound/srev/warn.mp3", label: "强预警", family: "eew" },
  "srev-shindo0": { url: "/sound/srev/shindo0.mp3", label: "震度 0", family: "shindo" },
  "srev-shindo1": { url: "/sound/srev/shindo1.mp3", label: "震度 1", family: "shindo" },
  "srev-shindo2": { url: "/sound/srev/shindo2.mp3", label: "震度 2", family: "shindo" },
  "srev-shindo3": { url: "/sound/srev/shindo3.mp3", label: "震度 3", family: "shindo" },
  "srev-shindo4": { url: "/sound/srev/shindo4.mp3", label: "震度 4", family: "shindo" },
  "srev-shindo5": { url: "/sound/srev/shindo5.mp3", label: "震度 5", family: "shindo" },
  "srev-shindo6": { url: "/sound/srev/shindo6.mp3", label: "震度 6+", family: "shindo" },
  "srev-tsunami1-cancel": { url: "/sound/srev/tsunami1cancel.mp3", label: "海啸注意报解除", family: "tsunami" },
  "srev-tsunami1-issue": { url: "/sound/srev/tsunami1issue.mp3", label: "海啸注意报发布", family: "tsunami" },
  "srev-tsunami1-switch": { url: "/sound/srev/tsunami1switch.mp3", label: "海啸注意报等级变更", family: "tsunami" },
  "srev-tsunami1-update": { url: "/sound/srev/tsunami1update.mp3", label: "海啸注意报更新", family: "tsunami" },
  "srev-tsunami2-cancel": { url: "/sound/srev/tsunami2cancel.mp3", label: "海啸警报解除", family: "tsunami" },
  "srev-tsunami2-issue": { url: "/sound/srev/tsunami2issue.mp3", label: "海啸警报发布", family: "tsunami" },
  "srev-tsunami2-switch": { url: "/sound/srev/tsunami2switch.mp3", label: "海啸警报等级变更", family: "tsunami" },
  "srev-tsunami2-update": { url: "/sound/srev/tsunami2update.mp3", label: "海啸警报更新", family: "tsunami" },
  "srev-tsunami-warning": { url: "/sound/general/ews.mp3", label: "津波警报", family: "tsunami" },
  "srev-tsunami3-cancel": { url: "/sound/srev/tsunami3cancel.mp3", label: "大海啸警报解除", family: "tsunami" },
  "srev-tsunami3-issue": { url: "/sound/srev/tsunami3issue.mp3", label: "大海啸警报发布", family: "tsunami" },
  "srev-tsunami3-update": { url: "/sound/srev/tsunami3update.mp3", label: "大海啸警报更新", family: "tsunami" },
} as const;

export type SeismicSoundAssetId = keyof typeof SEISMIC_SOUND_LIBRARY;

export const NIED_SOUND_ASSETS: Record<SeismicShindoSoundCue, SeismicSoundAssetId> = {
  shindo0: "srev-shindo0",
  shindo1: "srev-shindo1",
  shindo2: "srev-shindo2",
  shindo3: "srev-shindo3",
  shindo4: "srev-shindo4",
  shindo5: "srev-shindo5",
  shindo6: "srev-shindo6",
};

export type EewSoundState = {
  serial: number;
  warning: boolean;
  final: boolean;
  cancelled: boolean;
  magnitude: number | null;
  observedIntensity?: boolean;
  hypocenterKnown?: boolean;
  affectedAreas?: Array<{ name?: string; rank?: number; intensity?: string }>;
  relay?: string;
};

/**
 * 实时预警音效只对应东亚四个区域转发源。
 * 全球目录、全球预警适配器和历史目录不能触发区域播报音效。
 */
export const REGIONAL_EEW_SOUND_SOURCES = ["JMA", "KMA", "CENC", "CWA"] as const;

export type EewSoundReportIdentity = EewSoundState & {
  source: string;
  id: string;
  originTime?: string;
  announcedAt?: string;
};

const REGIONAL_EEW_SOUND_SOURCE_SET = new Set<string>(REGIONAL_EEW_SOUND_SOURCES);

export function isRegionalEewSoundSource(event: Pick<EewSoundReportIdentity, "source" | "relay">) {
  return event.relay !== "Catalogue" && REGIONAL_EEW_SOUND_SOURCE_SET.has(String(event.source));
}

function parseSoundTime(value: unknown) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function affectedAreaSoundSignature(event: Pick<EewSoundState, "affectedAreas">) {
  return (event.affectedAreas ?? [])
    .map((area) => `${String(area.name ?? "").trim()}:${Number(area.rank) || 0}:${String(area.intensity ?? "").trim()}`)
    .sort()
    .join("|");
}

/**
 * Reports in one polling response contain ScalePrompt, Destination and
 * DetailScale together. Keep a physical-event key independent of report
 * serial, while preserving JMA intensity reports as their own report family.
 */
export function eewSoundEventKey(event: Pick<EewSoundReportIdentity, "source" | "id" | "originTime" | "announcedAt">) {
  const rawId = String(event.id ?? "").trim();
  const family = /-INT:/i.test(rawId) ? "intensity" : "warning";
  const reportId = rawId.replace(/^[^:]+:/, "");
  const originTime = parseSoundTime(event.originTime);
  const announcedTime = parseSoundTime(event.announcedAt);
  // normalize real origin timestamps so an upstream formatting change does
  // not create a new audio event; malformed/fallback timestamps use the id.
  const hasStableOrigin = originTime !== null
    && (family === "intensity" || announcedTime === null || Math.abs(originTime - announcedTime) > 1_000);
  const identity = hasStableOrigin
    ? new Date(originTime).toISOString()
    : reportId || "unknown";
  return `${String(event.source)}:${family}:${identity}`;
}

/**
 * A final report and a JMA intensity detail are one-shot cues per physical
 * event. Other report sounds remain serial-scoped so a genuine update can be
 * announced once, but the same polling snapshot cannot replay it.
 */
export function eewSoundCueKey(
  event: EewSoundReportIdentity,
  assetId: SeismicSoundAssetId,
) {
  const eventKey = eewSoundEventKey(event);
  if (assetId === "srev-detail" || assetId === "srev-final") return `${eventKey}:${assetId}`;
  if (assetId === "srev-update") {
    return `${eventKey}:${assetId}:${Math.max(0, Math.round(Number(event.serial) || 0))}:${affectedAreaSoundSignature(event)}`;
  }
  return `${eventKey}:${assetId}:${Math.max(0, Math.round(Number(event.serial) || 0))}`;
}

/**
 * Polling endpoints may return the same report history in newest-first order.
 * Never let an older report overwrite the newest one kept for audio state.
 */
export function isNewerEewSoundReport(next: EewSoundReportIdentity, previous: EewSoundReportIdentity | null) {
  if (!previous) return true;
  if (next.cancelled !== previous.cancelled) return Boolean(next.cancelled);
  if (next.serial !== previous.serial) return next.serial > previous.serial;
  if (next.final !== previous.final || next.warning !== previous.warning) return true;
  if (next.hypocenterKnown !== previous.hypocenterKnown) return true;
  if (affectedAreaSoundSignature(next) !== affectedAreaSoundSignature(previous)) return true;
  const nextAnnounced = parseSoundTime(next.announcedAt);
  const previousAnnounced = parseSoundTime(previous.announcedAt);
  return nextAnnounced !== null && (previousAnnounced === null || nextAnnounced > previousAnnounced);
}

export function eewSoundAssetForTransition(
  next: EewSoundState,
  previous: EewSoundState | null,
  autoLocateMagnitude: number,
): SeismicSoundAssetId | null {
  if (next.cancelled && !previous?.cancelled) return "srev-cancel";
  // JMA 震度速報 is a short report series. The detail cue is emitted only
  // when the physical event first enters the stream; Destination/DetailScale
  // updates do not become update/final sounds.
  if (next.observedIntensity) {
    if (!previous || !previous.observedIntensity) return "srev-detail";
    return null;
  }
  if (!previous) {
    const magnitude = Number(next.magnitude);
    if (Number.isFinite(magnitude) && magnitude < Math.max(1, Number(autoLocateMagnitude) || 1)) {
      return "srev-caution";
    }
    if (next.hypocenterKnown === false) return "srev-prompt";
    return "srev-issue";
  }
  if (next.warning && !previous.warning) return "srev-warn";
  if (next.final && !previous.final) return "srev-final";
  if (next.serial > previous.serial || affectedAreaSoundSignature(next) !== affectedAreaSoundSignature(previous)) {
    return "srev-update";
  }
  return null;
}

export function eewSoundAssetsForTransition(
  next: EewSoundState,
  previous: EewSoundState | null,
  autoLocateMagnitude: number,
) {
  const primary = eewSoundAssetForTransition(next, previous, autoLocateMagnitude);
  const sounds: SeismicSoundAssetId[] = primary ? [primary] : [];
  if (next.warning && !previous?.warning && primary !== "srev-caution" && primary !== "srev-warn") {
    sounds.push("srev-warn");
  }
  return sounds;
}

/**
 * Replay report sounds follow their historical report state instead of the
 * current auto-location magnitude threshold. The first located report is the
 * issue cue; ScalePrompt-style reports with no hypocenter use prompt.
 */
export function replayEewSoundAssetForTransition(
  next: EewSoundState,
  previous: EewSoundState | null,
): SeismicSoundAssetId | null {
  if (next.cancelled && !previous?.cancelled) return "srev-cancel";
  if (next.observedIntensity) {
    const hasOfficialAreas = Boolean(next.affectedAreas?.length);
    const previousHasOfficialAreas = Boolean(previous?.observedIntensity && previous.affectedAreas?.length);
    if (hasOfficialAreas && !previousHasOfficialAreas) return "srev-detail";
    return null;
  }
  if (next.hypocenterKnown === false) {
    if (!previous || previous.hypocenterKnown !== false) return "srev-prompt";
    if (next.serial > previous.serial || affectedAreaSoundSignature(next) !== affectedAreaSoundSignature(previous)) {
      return "srev-update";
    }
    return null;
  }
  if (!previous || previous.observedIntensity || previous.hypocenterKnown === false) return "srev-issue";
  if (next.warning && !previous.warning) return "srev-warn";
  if (next.final && !previous.final) return "srev-final";
  if (next.serial > previous.serial || affectedAreaSoundSignature(next) !== affectedAreaSoundSignature(previous)) {
    return "srev-update";
  }
  return null;
}

export function replayEewReportOffsetSeconds(report: { originTime?: string; announcedAt?: string }) {
  const origin = parseSoundTime(report.originTime);
  const announced = parseSoundTime(report.announcedAt);
  if (origin === null || announced === null) return null;
  return Math.max(0, (announced - origin) / 1000);
}

export function tsunamiSoundAssetForTransition(
  level: number,
  cancelled: boolean,
  previous: { level: number; cancelled: boolean } | null,
): SeismicSoundAssetId | null {
  const nextLevel = Math.max(1, Math.min(3, Math.round(Number(level) || 1)));
  if (cancelled) {
    if (previous?.cancelled) return null;
    const cancelLevel = Math.max(1, Math.min(3, Math.round(Number(previous?.level) || nextLevel)));
    return `srev-tsunami${cancelLevel}-cancel` as SeismicSoundAssetId;
  }
  if (nextLevel === 2 && (!previous || previous.cancelled || previous.level < 2)) {
    return "srev-tsunami-warning";
  }
  if (!previous || previous.cancelled) return `srev-tsunami${nextLevel}-issue` as SeismicSoundAssetId;
  if (previous.level !== nextLevel) {
    if (nextLevel === 1) return "srev-tsunami1-switch";
    return `srev-tsunami${nextLevel}-switch` as SeismicSoundAssetId;
  }
  return `srev-tsunami${nextLevel}-update` as SeismicSoundAssetId;
}

const REPLAY_SOUND_MILESTONES = {
  fine: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60],
  medium: [5, 10, 20, 30, 40, 50, 60],
  fast: [10, 20, 30, 40, 50, 60],
} as const;

export function replaySoundMilestone(previousSeconds: number, currentSeconds: number, speed: number) {
  if (!Number.isFinite(currentSeconds) || currentSeconds <= previousSeconds) return null;
  const milestones = speed >= 60
    ? REPLAY_SOUND_MILESTONES.fast
    : speed >= 10
      ? REPLAY_SOUND_MILESTONES.medium
      : REPLAY_SOUND_MILESTONES.fine;
  const crossed = milestones.filter((milestone) => milestone > previousSeconds && milestone <= currentSeconds);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function replaySecondSoundAsset(seconds: number): SeismicSoundAssetId | null {
  const rounded = Math.max(0, Math.min(60, Math.round(seconds)));
  const supported = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60]);
  if (!supported.has(rounded)) return null;
  return `general-${rounded}s` as SeismicSoundAssetId;
}

const S_WAVE_COUNTDOWN_MILESTONES = [60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const;

export function sWaveCountdownMilestone(previousRemainingSeconds: number, currentRemainingSeconds: number) {
  if (!Number.isFinite(previousRemainingSeconds) || !Number.isFinite(currentRemainingSeconds)) return null;
  if (currentRemainingSeconds >= previousRemainingSeconds || previousRemainingSeconds <= 0 || currentRemainingSeconds > 60) return null;
  const crossed = S_WAVE_COUNTDOWN_MILESTONES.filter(
    (milestone) => milestone < previousRemainingSeconds && milestone >= currentRemainingSeconds,
  );
  return crossed.length ? crossed[crossed.length - 1] : null;
}
