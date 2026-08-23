export type ReplayProductStage = "official" | "waiting-products" | "contours" | "cities" | "radius";

export const REPLAY_OFFICIAL_HOLD_MS = 5_000;
export const REPLAY_PRODUCT_STEP_MS = 2_000;
export const REPLAY_PRODUCT_HOLD_MS = 5_000;

export function initialReplayProductStage(options: {
  hasOfficialImpact: boolean;
  productsLoading: boolean;
  hasProducts: boolean;
}): ReplayProductStage | null {
  if (options.hasOfficialImpact) return "official";
  if (options.productsLoading) return "waiting-products";
  return options.hasProducts ? "contours" : null;
}

export function nextReplayProductStage(
  stage: ReplayProductStage,
  options: { productsLoading: boolean; hasProducts: boolean },
): ReplayProductStage | null {
  if (stage === "official" || stage === "waiting-products") {
    if (options.productsLoading) return "waiting-products";
    return options.hasProducts ? "contours" : null;
  }
  if (stage === "contours") return "cities";
  if (stage === "cities") return "radius";
  return null;
}

export function replayProductStageDelayMs(stage: ReplayProductStage) {
  if (stage === "official") return REPLAY_OFFICIAL_HOLD_MS;
  if (stage === "contours" || stage === "cities") return REPLAY_PRODUCT_STEP_MS;
  if (stage === "radius") return REPLAY_PRODUCT_HOLD_MS;
  return null;
}

export function replayProductStageVisibility(stage: ReplayProductStage | null) {
  return {
    officialImpact: stage === "official",
    shakeMapContours: stage === "contours" || stage === "cities" || stage === "radius",
    pagerCities: stage === "cities" || stage === "radius",
    populationExposure: stage === "cities" || stage === "radius",
    impactRadius: stage === "radius",
  };
}
