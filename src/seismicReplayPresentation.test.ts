import { describe, expect, it } from "vitest";

import {
  initialReplayProductStage,
  nextReplayProductStage,
  replayProductStageDelayMs,
  replayProductStageVisibility,
  replayProductPresentationOffsetSeconds,
} from "./seismicReplayPresentation";

describe("replay official product presentation", () => {
  it("holds official impact for five seconds before the USGS sequence", () => {
    expect(initialReplayProductStage({
      hasOfficialImpact: true,
      productsLoading: false,
      hasProducts: true,
    })).toBe("official");
    expect(replayProductStageDelayMs("official")).toBe(5_000);
    expect(nextReplayProductStage("official", { productsLoading: false, hasProducts: true })).toBe("contours");
  });

  it("adds contours, cities, and radius at two-second intervals, then holds all products for five seconds", () => {
    expect(replayProductStageDelayMs("contours")).toBe(2_000);
    expect(nextReplayProductStage("contours", { productsLoading: false, hasProducts: true })).toBe("cities");
    expect(replayProductStageDelayMs("cities")).toBe(2_000);
    expect(nextReplayProductStage("cities", { productsLoading: false, hasProducts: true })).toBe("radius");
    expect(replayProductStageDelayMs("radius")).toBe(5_000);
    expect(nextReplayProductStage("radius", { productsLoading: false, hasProducts: true })).toBeNull();
  });

  it("keeps population exposure open for the final seven seconds", () => {
    expect(replayProductStageVisibility("contours").populationExposure).toBe(false);
    expect(replayProductStageVisibility("cities").populationExposure).toBe(true);
    expect(replayProductStageVisibility("radius").populationExposure).toBe(true);
    expect((replayProductStageDelayMs("cities") ?? 0) + (replayProductStageDelayMs("radius") ?? 0)).toBe(7_000);
  });

  it("waits for confirmed products without skipping an available layer", () => {
    expect(initialReplayProductStage({
      hasOfficialImpact: false,
      productsLoading: true,
      hasProducts: false,
    })).toBe("waiting-products");
    expect(nextReplayProductStage("waiting-products", { productsLoading: false, hasProducts: true })).toBe("contours");
    expect(nextReplayProductStage("waiting-products", { productsLoading: false, hasProducts: false })).toBeNull();
  });

  it("preserves prompt product timing but compresses products published after the wave window", () => {
    const origin = "2026-08-23T13:44:53.514Z";
    expect(replayProductPresentationOffsetSeconds(origin, "2026-08-23T13:45:13.514Z")).toBe(20);
    expect(replayProductPresentationOffsetSeconds(origin, "2026-08-23T15:48:05.958Z")).toBe(60);
    expect(replayProductPresentationOffsetSeconds(origin, null)).toBeNull();
  });
});
