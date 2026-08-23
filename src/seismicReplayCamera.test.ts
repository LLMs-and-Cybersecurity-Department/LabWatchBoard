import { describe, expect, it } from "vitest";

import {
  formatReplayClock,
  normalizeReplayPreRollSeconds,
  replayMovieCameraRadiusKm,
} from "./seismicReplayCamera";

describe("replay movie camera", () => {
  it("normalizes a one-to-ten second recording pre-roll", () => {
    expect(normalizeReplayPreRollSeconds(-1)).toBe(1);
    expect(normalizeReplayPreRollSeconds(4.6)).toBe(5);
    expect(normalizeReplayPreRollSeconds(99)).toBe(10);
  });

  it("formats the origin boundary without an ambiguous T+ negative value", () => {
    expect(formatReplayClock(-5)).toBe("T−5.00 s");
    expect(formatReplayClock(0)).toBe("T+0.00 s");
  });

  it("uses an S-shaped 50-to-30 km opening and then follows the P wave", () => {
    expect(replayMovieCameraRadiusKm(-5, 10)).toBe(50);
    expect(replayMovieCameraRadiusKm(0, 10)).toBe(50);
    expect(replayMovieCameraRadiusKm(3, 10)).toBeCloseTo(40, 5);
    expect(replayMovieCameraRadiusKm(6, 10)).toBeCloseTo(30, 5);
    expect(replayMovieCameraRadiusKm(30, 10)).toBeGreaterThan(190);
  });
});
