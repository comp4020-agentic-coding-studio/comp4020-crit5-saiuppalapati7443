// This week's spec, turned into tests: the three core Marble Crash rules,
// exercised directly against the pure engine (no DOM, no build step needed).
import { describe, expect, it } from "vitest";
import { createInitialState, handleCollision, checkWin, TOTAL_STAGES } from "../src/engine/marble.ts";

describe("handleCollision", () => {
  it("decrements hearts and opens the invulnerability window", () => {
    const state = createInitialState(1);
    expect(state.isInvulnerable).toBe(false);

    const hit = handleCollision(state);

    expect(hit.hearts).toBe(state.hearts - 1);
    expect(hit.isInvulnerable).toBe(true);
  });

  it("does not deduct a second heart while already invulnerable", () => {
    const state = createInitialState(1);
    const firstHit = handleCollision(state);
    expect(firstHit.isInvulnerable).toBe(true);

    const secondHit = handleCollision(firstHit);

    expect(secondHit.hearts).toBe(firstHit.hearts);
  });
});

describe("checkWin", () => {
  it("transitions to isWon once distance reaches the final stage's finish line", () => {
    const state = { ...createInitialState(TOTAL_STAGES), distance: 0 };
    const atFinish = { ...state, distance: state.finishDistance };

    const result = checkWin(atFinish);

    expect(result.isWon).toBe(true);
  });
});
