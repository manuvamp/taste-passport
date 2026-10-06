import type { TasteState } from "@/lib/types";

/**
 * Test helpers. The engine mutates TasteState in place; here we build a fresh
 * state without touching the persistence layer.
 */
export function newTasteStateForTest(sessionId: string): TasteState {
  return {
    sessionId,
    signals: [],
    shownCardIds: [],
    domainWeights: {},
    tagVector: {},
    explorationLevel: 1,
    confidence: 0,
    profileVersion: 0,
    lastUpdated: new Date().toISOString(),
  };
}

export { applyInteraction } from "@/lib/taste/engine";
export { computeConfidence } from "@/lib/taste/engine";
export { batchTargets } from "@/lib/taste/engine";
export { nextBatch } from "@/lib/taste/engine";
export { buildProfile } from "@/lib/taste/engine";
export { deriveArchetype } from "@/lib/taste/engine";
