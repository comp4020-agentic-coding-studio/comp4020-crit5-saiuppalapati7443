// Pure Marble Crash rules. No DOM, no canvas, no timers, no RNG — every
// layout is fixed data, and the caller drives the clock, so the exact same
// step sequence always produces the exact same state (testable in isolation).

export const TOTAL_STAGES = 3;

// How long a hit's invulnerability/grace window lasts. Long enough that a
// cluster of two obstacles close together can't take a second heart before
// the player has had a chance to react to the first.
export const GRACE_MS = 1200;

// A gold gate boosts forward speed for this long, at this multiplier —
// enough to punch through the next hazard in the same lane without steering.
export const BOOST_MS = 3000;
export const BOOST_MULT = 1.8;

// Normalized x/second the marble crosses the track at when steering — a full
// hard-left-to-hard-right sweep takes under a second, so a late dodge is
// still usually recoverable.
export const STEER_SPEED = 2.4;

// Lane centers in normalized track space [-1, 1], and how close the marble's
// x has to be to a lane center to count as "in" it for hit-testing.
export const LANES = [-0.62, 0, 0.62] as const;
export const LANE_HALF_WIDTH = 0.35;

export type Lane = -1 | 0 | 1;

export interface Obstacle {
  id: string;
  lane: Lane;
  // Forward distance at which the obstacle sits.
  distance: number;
  // Distance-space thickness of the hit band.
  depth: number;
  hit: boolean;
}

export interface Gate {
  id: string;
  lane: Lane;
  distance: number;
  depth: number;
  used: boolean;
}

export interface GameState {
  stage: number;
  distance: number;
  finishDistance: number;
  x: number;
  baseSpeed: number;
  hearts: number;
  isInvulnerable: boolean;
  invulnerableUntil: number;
  boostUntil: number;
  elapsed: number;
  obstacles: Obstacle[];
  gates: Gate[];
  isWon: boolean;
  isLost: boolean;
  justHit: boolean;
  justCleared: boolean;
  justBoosted: boolean;
}

export interface Input {
  steer: -1 | 0 | 1;
}

function laneX(lane: Lane): number {
  return LANES[lane + 1];
}

// Each stage's hazards and gates, hand-placed rather than randomized so a
// run is fair and reproducible. The first obstacle of stage 1 sits ~7s out
// at base speed — far enough ahead to react to on first sight, with nothing
// else in the way of that first read.
interface StageLayout {
  finishDistance: number;
  baseSpeed: number;
  obstacles: Array<{ id: string; lane: Lane; distance: number; depth: number }>;
  gates: Array<{ id: string; lane: Lane; distance: number; depth: number }>;
}

const STAGE_LAYOUTS: Record<number, StageLayout> = {
  1: {
    finishDistance: 9000,
    baseSpeed: 200,
    obstacles: [
      { id: "s1-o1", lane: 0, distance: 1400, depth: 60 },
      { id: "s1-o2", lane: 1, distance: 2600, depth: 60 },
      { id: "s1-o3", lane: -1, distance: 2900, depth: 60 },
      { id: "s1-o4", lane: 0, distance: 4600, depth: 60 },
      { id: "s1-o5", lane: 1, distance: 5900, depth: 60 },
      { id: "s1-o6", lane: -1, distance: 7400, depth: 60 },
      { id: "s1-o7", lane: 0, distance: 8300, depth: 60 },
    ],
    gates: [
      { id: "s1-g1", lane: -1, distance: 3800, depth: 80 },
      { id: "s1-g2", lane: 1, distance: 6700, depth: 80 },
    ],
  },
  2: {
    finishDistance: 11000,
    baseSpeed: 230,
    obstacles: [
      { id: "s2-o1", lane: 1, distance: 1300, depth: 60 },
      { id: "s2-o2", lane: -1, distance: 2400, depth: 60 },
      { id: "s2-o3", lane: 0, distance: 3300, depth: 60 },
      { id: "s2-o4", lane: 1, distance: 4900, depth: 60 },
      { id: "s2-o5", lane: -1, distance: 5200, depth: 60 },
      { id: "s2-o6", lane: 0, distance: 6800, depth: 60 },
      { id: "s2-o7", lane: 1, distance: 8200, depth: 60 },
      { id: "s2-o8", lane: -1, distance: 8500, depth: 60 },
      { id: "s2-o9", lane: 0, distance: 10000, depth: 60 },
    ],
    gates: [
      { id: "s2-g1", lane: 0, distance: 2900, depth: 80 },
      { id: "s2-g2", lane: -1, distance: 6300, depth: 80 },
      { id: "s2-g3", lane: 1, distance: 9500, depth: 80 },
    ],
  },
  3: {
    finishDistance: 13000,
    baseSpeed: 260,
    obstacles: [
      { id: "s3-o1", lane: -1, distance: 1300, depth: 60 },
      { id: "s3-o2", lane: 1, distance: 2200, depth: 60 },
      { id: "s3-o3", lane: 0, distance: 2500, depth: 60 },
      { id: "s3-o4", lane: -1, distance: 4000, depth: 60 },
      { id: "s3-o5", lane: 0, distance: 4300, depth: 60 },
      { id: "s3-o6", lane: 1, distance: 5800, depth: 60 },
      { id: "s3-o7", lane: -1, distance: 7500, depth: 60 },
      { id: "s3-o8", lane: 0, distance: 7800, depth: 60 },
      { id: "s3-o9", lane: 1, distance: 9600, depth: 60 },
      { id: "s3-o10", lane: 0, distance: 11200, depth: 60 },
      { id: "s3-o11", lane: -1, distance: 12200, depth: 60 },
    ],
    gates: [
      { id: "s3-g1", lane: 0, distance: 3300, depth: 80 },
      { id: "s3-g2", lane: 1, distance: 6900, depth: 80 },
      { id: "s3-g3", lane: -1, distance: 10700, depth: 80 },
    ],
  },
};

export function createInitialState(stage = 1, hearts = 3, elapsed = 0): GameState {
  const layout = STAGE_LAYOUTS[stage];
  return {
    stage,
    distance: 0,
    finishDistance: layout.finishDistance,
    x: 0,
    baseSpeed: layout.baseSpeed,
    hearts,
    isInvulnerable: false,
    invulnerableUntil: 0,
    boostUntil: 0,
    elapsed,
    obstacles: layout.obstacles.map((o) => ({ ...o, hit: false })),
    gates: layout.gates.map((g) => ({ ...g, used: false })),
    isWon: false,
    isLost: false,
    justHit: false,
    justCleared: false,
    justBoosted: false,
  };
}

export function resetGame(): GameState {
  return createInitialState(1);
}

// Decrements a heart and opens the grace window — unless one is already
// open, in which case a hit is a no-op. That guard lives here, not in the
// caller, so nothing that reaches this function can ever double-deduct
// within the same grace window.
export function handleCollision(state: GameState): GameState {
  if (state.isInvulnerable) return state;
  const hearts = state.hearts - 1;
  return {
    ...state,
    hearts,
    isInvulnerable: true,
    invulnerableUntil: state.elapsed + GRACE_MS,
    justHit: true,
    isLost: hearts <= 0,
  };
}

// Reaching the finish line wins the run on the final stage, or advances to
// the next stage (hearts carried over) otherwise.
export function checkWin(state: GameState): GameState {
  if (state.distance < state.finishDistance) return state;
  if (state.stage >= TOTAL_STAGES) {
    return { ...state, isWon: true };
  }
  return createInitialState(state.stage + 1, state.hearts, state.elapsed);
}

function isBoosted(state: GameState): boolean {
  return state.elapsed < state.boostUntil;
}

function isInvulnerableNow(state: GameState): boolean {
  return state.elapsed < state.invulnerableUntil;
}

function inLane(x: number, lane: Lane): boolean {
  return Math.abs(x - laneX(lane)) <= LANE_HALF_WIDTH;
}

function crossed(prevDistance: number, nextDistance: number, objDistance: number, depth: number): boolean {
  const start = objDistance - depth / 2;
  const end = objDistance + depth / 2;
  return nextDistance >= start && prevDistance <= end;
}

export function stepGame(state: GameState, input: Input, dtMs: number): GameState {
  if (state.isWon || state.isLost) return state;

  const dt = dtMs / 1000;
  const elapsed = state.elapsed + dtMs;

  let x = state.x + input.steer * STEER_SPEED * dt;
  x = Math.max(-1, Math.min(1, x));

  const boosted = state.elapsed < state.boostUntil;
  const speed = boosted ? state.baseSpeed * BOOST_MULT : state.baseSpeed;
  const prevDistance = state.distance;
  const distance = state.distance + speed * dt;

  let next: GameState = {
    ...state,
    elapsed,
    x,
    distance,
    isInvulnerable: isInvulnerableNow({ ...state, elapsed }),
    justHit: false,
    justCleared: false,
    justBoosted: false,
  };

  const gates = next.gates.map((gate) => {
    if (gate.used) return gate;
    if (!inLane(x, gate.lane)) return gate;
    if (!crossed(prevDistance, distance, gate.distance, gate.depth)) return gate;
    next.boostUntil = elapsed + BOOST_MS;
    next.justBoosted = true;
    return { ...gate, used: true };
  });
  next = { ...next, gates };

  const activeBoost = isBoosted(next);
  const obstacles = next.obstacles.map((obstacle) => {
    if (obstacle.hit) return obstacle;
    if (!inLane(x, obstacle.lane)) return obstacle;
    if (!crossed(prevDistance, distance, obstacle.distance, obstacle.depth)) return obstacle;
    if (next.isInvulnerable || activeBoost) {
      next.justCleared = true;
      return { ...obstacle, hit: true };
    }
    next = handleCollision(next);
    return { ...obstacle, hit: true };
  });
  next = { ...next, obstacles };

  return checkWin(next);
}
