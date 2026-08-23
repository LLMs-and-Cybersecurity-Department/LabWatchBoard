import { describe, expect, it } from "vitest";

import {
  eewSoundAssetForTransition,
  eewSoundCueKey,
  eewSoundEventKey,
  isNewerEewSoundReport,
  isRegionalEewSoundSource,
  replayEewReportOffsetSeconds,
  replayEewSoundAssetForTransition,
  replaySecondSoundAsset,
  replaySoundMilestone,
  sWaveCountdownMilestone,
  SEISMIC_SOUND_LIBRARY,
  tsunamiSoundAssetForTransition,
} from "./seismicAudio";

describe("seismic sound cue mapping", () => {
  it("maps initial, receive-only, update, final and cancel EEW reports", () => {
    expect(eewSoundAssetForTransition({ serial: 1, warning: false, final: false, cancelled: false, magnitude: 4.2 }, null, 5)).toBe("srev-caution");
    expect(eewSoundAssetForTransition({ serial: 1, warning: false, final: false, cancelled: false, magnitude: 5.8 }, null, 5)).toBe("general-ews");
    expect(eewSoundAssetForTransition({ serial: 2, warning: false, final: false, cancelled: false, magnitude: 5.8 }, { serial: 1, warning: false, final: false, cancelled: false, magnitude: 5.8 }, 5)).toBe("srev-update");
    expect(eewSoundAssetForTransition({ serial: 3, warning: false, final: true, cancelled: false, magnitude: 5.8 }, { serial: 2, warning: false, final: false, cancelled: false, magnitude: 5.8 }, 5)).toBe("srev-final");
    expect(eewSoundAssetForTransition({ serial: 4, warning: false, final: true, cancelled: true, magnitude: 5.8 }, { serial: 3, warning: false, final: true, cancelled: false, magnitude: 5.8 }, 5)).toBe("srev-cancel");
  });

  it("uses shindo0 for receive-only alerts and update for an affected-area change", () => {
    expect(SEISMIC_SOUND_LIBRARY["srev-caution"].url).toBe("/sound/srev/shindo0.mp3");
    const previous = { serial: 2, warning: false, final: false, cancelled: false, magnitude: 5.2, affectedAreas: [{ name: "A", rank: 3 }] };
    const next = { ...previous, affectedAreas: [{ name: "A", rank: 3 }, { name: "B", rank: 2 }] };
    expect(isNewerEewSoundReport({ ...next, source: "JMA", id: "evt", announcedAt: "2026-08-23T00:00:02Z" }, { ...previous, source: "JMA", id: "evt", announcedAt: "2026-08-23T00:00:02Z" })).toBe(true);
    expect(eewSoundAssetForTransition(next, previous, 4)).toBe("srev-update");
    expect(eewSoundCueKey({ ...next, source: "JMA", id: "evt" }, "srev-update"))
      .not.toBe(eewSoundCueKey({ ...previous, source: "JMA", id: "evt" }, "srev-update"));
  });

  it("maps replay reports to their historical issue, prompt, update and detail cues", () => {
    const issue = { serial: 1, warning: false, final: false, cancelled: false, magnitude: 5.2, hypocenterKnown: true };
    const update = { ...issue, serial: 2 };
    const prompt = { ...issue, hypocenterKnown: false };
    const scalePrompt = { ...prompt, observedIntensity: true };
    const detail = { ...update, observedIntensity: true, affectedAreas: [{ name: "熊本県", rank: 4 }] };
    expect(replayEewSoundAssetForTransition(issue, null)).toBe("srev-issue");
    expect(replayEewSoundAssetForTransition(prompt, null)).toBe("srev-prompt");
    expect(replayEewSoundAssetForTransition(scalePrompt, update)).toBeNull();
    expect(replayEewSoundAssetForTransition(update, issue)).toBe("srev-update");
    expect(replayEewSoundAssetForTransition(detail, update)).toBe("srev-detail");
    expect(replayEewReportOffsetSeconds({ originTime: "2026-08-23T00:00:00Z", announcedAt: "2026-08-23T00:00:08Z" })).toBe(8);
  });

  it("selects tsunami issue, update, switch and cancel files by level", () => {
    expect(tsunamiSoundAssetForTransition(1, false, null)).toBe("srev-tsunami1-issue");
    expect(tsunamiSoundAssetForTransition(2, false, null)).toBe("srev-tsunami-warning");
    expect(tsunamiSoundAssetForTransition(2, false, { level: 1, cancelled: false })).toBe("srev-tsunami-warning");
    expect(tsunamiSoundAssetForTransition(2, false, { level: 3, cancelled: false })).toBe("srev-tsunami2-switch");
    expect(tsunamiSoundAssetForTransition(2, false, { level: 2, cancelled: false })).toBe("srev-tsunami2-update");
    expect(tsunamiSoundAssetForTransition(2, true, { level: 2, cancelled: false })).toBe("srev-tsunami2-cancel");
  });

  it("deduplicates a JMA intensity report series into one detail cue", () => {
    const base = {
      source: "JMA",
      id: "JMA-INT:20260820T010203",
      originTime: "2026-08-20T01:02:03+09:00",
      announcedAt: "2026-08-20T01:02:04+09:00",
      warning: false,
      final: false,
      cancelled: false,
      magnitude: null,
      observedIntensity: true,
      relay: "FAN",
    } as const;
    const prompt = { ...base, serial: 1 };
    const destination = { ...base, serial: 2, announcedAt: "2026-08-20T01:02:06+09:00" };
    const detail = { ...base, serial: 3, final: true, announcedAt: "2026-08-20T01:02:08+09:00" };
    expect(eewSoundAssetForTransition(prompt, null, 5)).toBe("srev-detail");
    expect(eewSoundAssetForTransition(destination, prompt, 5)).toBeNull();
    expect(eewSoundAssetForTransition(detail, destination, 5)).toBeNull();
    expect(eewSoundEventKey(prompt)).toBe(eewSoundEventKey(detail));
    expect(eewSoundCueKey(prompt, "srev-detail")).toBe(eewSoundCueKey(detail, "srev-detail"));
    expect(isNewerEewSoundReport(prompt, detail)).toBe(false);
  });

  it("limits live EEW audio to regional relays", () => {
    expect(isRegionalEewSoundSource({ source: "JMA", relay: "FAN" })).toBe(true);
    expect(isRegionalEewSoundSource({ source: "CWA", relay: "Wolfx" })).toBe(true);
    expect(isRegionalEewSoundSource({ source: "USGS", relay: "Authorized" })).toBe(false);
    expect(isRegionalEewSoundSource({ source: "JMA", relay: "Catalogue" })).toBe(false);
  });

  it("throttles replay time cues at high speed and never points to a missing asset", () => {
    expect(replaySoundMilestone(0, 8, 1)).toBe(8);
    expect(replaySoundMilestone(8, 32, 60)).toBe(30);
    expect(replaySecondSoundAsset(11)).toBeNull();
    expect(replaySecondSoundAsset(20)).toBe("general-20s");
    expect(replaySecondSoundAsset(0)).toBe("general-0s");
    for (const asset of ["general-countdown", "general-ews", "general-intense", "srev-prompt", "srev-hypocenter"] as const) {
      expect(SEISMIC_SOUND_LIBRARY[asset].url).toMatch(/^\/sound\//);
    }
  });

  it("announces remaining S-wave arrival milestones instead of elapsed replay time", () => {
    expect(sWaveCountdownMilestone(61, 59.5)).toBe(60);
    expect(sWaveCountdownMilestone(10.5, 9.5)).toBe(10);
    expect(sWaveCountdownMilestone(60, 30)).toBe(30);
    expect(sWaveCountdownMilestone(5, 5.5)).toBeNull();
    expect(sWaveCountdownMilestone(65, 64)).toBeNull();
    expect(sWaveCountdownMilestone(1, -0.1)).toBe(0);
  });
});
