export const DEFAULT_REPLAY_PRE_ROLL_SECONDS = 5;

export function normalizeReplayPreRollSeconds(value: unknown) {
  return Math.max(1, Math.min(10, Math.round(Number(value) || DEFAULT_REPLAY_PRE_ROLL_SECONDS)));
}

export function formatReplayClock(seconds: number, precise = true) {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const sign = safeSeconds < 0 ? "−" : "+";
  return `T${sign}${Math.abs(safeSeconds).toFixed(precise ? 2 : 0)} s`;
}

function smoothStep(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Replay camera radius in kilometres.
 *
 * The pre-roll is a static 50 km establishing shot. During the first six
 * seismic seconds the view eases into 30 km, then expands around the fixed
 * hypocentre only when the P-wave surface radius needs more room.
 */
export function replayMovieCameraRadiusKm(
  elapsedSeconds: number,
  depthKm: number | null | undefined,
  pVelocityKmPerSecond = 6,
) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 50;
  const elapsed = Math.max(0, elapsedSeconds);
  if (elapsed <= 6) return 50 - 20 * smoothStep(elapsed / 6);

  const depth = Math.max(0, Number(depthKm ?? 10));
  const travelled = elapsed * Math.max(0.1, Number(pVelocityKmPerSecond) || 6);
  const surfaceRadius = Math.sqrt(Math.max(0, travelled * travelled - depth * depth));
  return Math.max(30, surfaceRadius * 1.16);
}

