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
// x has to be to a lane center to count as "in" it for hit-testing. Kept
// under half the lane spacing (0.31) so a lane's hit zone never bleeds into
// its neighbor's — otherwise a marble sitting between two lanes could be hit
// by either one, which reads as a collision with nothing on screen.
export const LANES = [-0.62, 0, 0.62] as const;
export const LANE_HALF_WIDTH = 0.24;

// Player-controlled slider bounds (see src/main.ts) — this scales how fast
// the roller hazards sweep, not the player's own forward speed, which stays
// a fixed constant. Clamped here too so a bad input value can't send a
// roller's motion negative or absurdly fast.
export const ROLLER_SPEED_MULT_MIN = 0.5;
export const ROLLER_SPEED_MULT_MAX = 2.5;

// Distance-equivalent units/second a roller sweeps through its period at the
// slider's default (1x) multiplier.
export const ROLLER_BASE_RATE = 260;

// How close the marble's x has to be to a roller's current sweep position to
// count as a hit — sized to roughly match the two circles' drawn radii
// actually touching on screen, not a much larger invisible hitbox.
export const ROLLER_HIT_RADIUS = 0.1;

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

// A hazard that is itself a marble, sweeping side to side while the player
// is within its distance band — a second kind of "more marbles" hardness,
// distinct from the static barrier obstacles. `distance`/`depth` work exactly
// like an Obstacle's (a center point and a band width around it), which is
// what keeps its drawn screen position and its hit-tested window in sync —
// a wide, decoupled band previously let it register hits while still far up
// the screen, nowhere near the marble.
export interface Roller {
  id: string;
  distance: number;
  depth: number;
  // Roller-clock units (see ROLLER_BASE_RATE) to complete one full
  // left-right-left sweep. Independent of the player's own forward speed.
  period: number;
  amplitude: number;
  resolved: boolean;
  // Roller-clock value captured the moment this roller enters its distance
  // band, so its sweep always starts at center (phase 0) rather than
  // wherever the shared clock happens to be. Null until activated.
  activatedAt: number | null;
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
  rollers: Roller[];
  // Shared clock that drives roller sweep motion, advanced each step by
  // ROLLER_BASE_RATE * rollerSpeedMultiplier * dt — independent of the
  // player's own forward `distance`, so the slider can speed hazards up
  // without changing how fast the marble itself rolls.
  rollerProgress: number;
  isWon: boolean;
  isLost: boolean;
  justHit: boolean;
  justCleared: boolean;
  justBoosted: boolean;
}

export interface Input {
  steer: -1 | 0 | 1;
  // Live multiplier on roller sweep speed from the on-screen slider. Does
  // not affect the player marble's own forward speed, which is a constant.
  rollerSpeedMultiplier: number;
}

function laneX(lane: Lane): number {
  return LANES[lane + 1];
}

// A roller's x position is a pure function of the shared roller clock (see
// GameState.rollerProgress) and its own activation point — not of wall-clock
// time and not of the player's forward distance — so it's exactly
// reproducible and identical between the engine's hit-test and the
// renderer's drawing of it. Before activation (activatedAt is null) this
// reports the center, since the roller hasn't started sweeping yet.
export function rollerXAt(roller: Roller, rollerProgress: number): number {
  const anchor = roller.activatedAt ?? rollerProgress;
  const phase = (rollerProgress - anchor) / roller.period;
  return roller.amplitude * Math.sin(2 * Math.PI * phase);
}

// Each stage's hazards, gates and rollers, hand-placed rather than
// randomized so a run is fair and reproducible. The first obstacle of stage
// 1 sits ~7s out at base speed — far enough ahead to react to on first
// sight, with nothing else in the way of that first read.
interface StageLayout {
  finishDistance: number;
  baseSpeed: number;
  obstacles: Array<{ id: string; lane: Lane; distance: number; depth: number }>;
  gates: Array<{ id: string; lane: Lane; distance: number; depth: number }>;
  rollers: Array<{ id: string; distance: number; depth: number; period: number; amplitude: number }>;
}

// Distance-band width a roller is engageable for. Kept modest relative to
// VIEW_DISTANCE so it's only near the marble on screen while it's actually
// hit-testable (see the Roller doc comment above).
const ROLLER_DEPTH = 550;

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
    rollers: [
      { id: "s1-r1", distance: 2000, depth: ROLLER_DEPTH, period: 700, amplitude: 0.62 },
      { id: "s1-r2", distance: 4000, depth: ROLLER_DEPTH, period: 650, amplitude: 0.62 },
      { id: "s1-r3", distance: 6000, depth: ROLLER_DEPTH, period: 620, amplitude: 0.62 },
      { id: "s1-r4", distance: 8000, depth: ROLLER_DEPTH, period: 600, amplitude: 0.62 },
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
    rollers: [
      { id: "s2-r1", distance: 1800, depth: ROLLER_DEPTH, period: 680, amplitude: 0.62 },
      { id: "s2-r2", distance: 3800, depth: ROLLER_DEPTH, period: 640, amplitude: 0.62 },
      { id: "s2-r3", distance: 5800, depth: ROLLER_DEPTH, period: 600, amplitude: 0.62 },
      { id: "s2-r4", distance: 7800, depth: ROLLER_DEPTH, period: 570, amplitude: 0.62 },
      { id: "s2-r5", distance: 9800, depth: ROLLER_DEPTH, period: 540, amplitude: 0.62 },
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
    rollers: [
      { id: "s3-r1", distance: 1500, depth: ROLLER_DEPTH, period: 650, amplitude: 0.62 },
      { id: "s3-r2", distance: 3500, depth: ROLLER_DEPTH, period: 610, amplitude: 0.62 },
      { id: "s3-r3", distance: 5500, depth: ROLLER_DEPTH, period: 580, amplitude: 0.62 },
      { id: "s3-r4", distance: 7500, depth: ROLLER_DEPTH, period: 550, amplitude: 0.62 },
      { id: "s3-r5", distance: 9500, depth: ROLLER_DEPTH, period: 520, amplitude: 0.62 },
      { id: "s3-r6", distance: 11500, depth: ROLLER_DEPTH, period: 500, amplitude: 0.62 },
    ],
  },
};

// Beyond the three hand-authored stages the run continues endlessly —
// there's no finish to reach, only a heart count that can hit zero. Each
// further stage is still deterministic (a pure function of the stage
// number, no RNG) so it stays fair and reproducible, just denser and
// faster than the last.
const MAX_BASE_SPEED = 420;
const MAX_OBSTACLES_PER_STAGE = 18;
const MIN_OBSTACLE_SPACING = 480;
const MAX_ROLLERS_PER_STAGE = 14;
const MIN_ROLLER_SPACING = 1400;
const MIN_ROLLER_PERIOD = 450;

function generateStageLayout(stage: number): StageLayout {
  const tier = stage - TOTAL_STAGES;
  const finishDistance = 13000 + tier * 2400;
  const baseSpeed = Math.min(MAX_BASE_SPEED, 260 + tier * 18);
  const obstacleCount = Math.min(MAX_OBSTACLES_PER_STAGE, 11 + tier);
  const spacing = Math.max(MIN_OBSTACLE_SPACING, 900 - tier * 25);

  const obstacles: StageLayout["obstacles"] = [];
  for (let i = 0; i < obstacleCount; i++) {
    const distance = 1200 + i * spacing;
    const lane = (((i * 2 + tier) % 3) - 1) as Lane;
    obstacles.push({ id: `s${stage}-o${i}`, lane, distance, depth: 60 });
  }

  const gateCount = 3;
  const gates: StageLayout["gates"] = [];
  for (let i = 0; i < gateCount; i++) {
    const distance = Math.round((finishDistance / (gateCount + 1)) * (i + 1));
    const lane = (((i + tier) % 3) - 1) as Lane;
    gates.push({ id: `s${stage}-g${i}`, lane, distance, depth: 80 });
  }

  // Rollers spread across (almost) the whole stage at a steady spacing, so
  // the run is a continuous run of moving hazards rather than a couple of
  // isolated pockets — spacing tightens (and period shortens) with tier for
  // more of them, swinging faster, the further an endless run goes.
  const rollerSpacing = Math.max(MIN_ROLLER_SPACING, 2000 - tier * 40);
  const rollerCount = Math.min(MAX_ROLLERS_PER_STAGE, Math.floor(finishDistance / rollerSpacing) - 1);
  const rollers: StageLayout["rollers"] = [];
  const period = Math.max(MIN_ROLLER_PERIOD, 650 - tier * 10);
  for (let i = 0; i < rollerCount; i++) {
    const distance = rollerSpacing * (i + 1);
    rollers.push({ id: `s${stage}-r${i}`, distance, depth: ROLLER_DEPTH, period, amplitude: 0.62 });
  }

  return { finishDistance, baseSpeed, obstacles, gates, rollers };
}

function stageLayoutFor(stage: number): StageLayout {
  return STAGE_LAYOUTS[stage] ?? generateStageLayout(stage);
}

// `distanceOffset` stitches a new stage onto the end of the run in progress
// rather than starting the track over at 0 — every hazard/gate/finish-line
// distance from the stage's own (0-based) layout is shifted forward by it.
// Passing the run's current distance as the offset on every stage change is
// what keeps the run one continuous track (and one continuously-climbing
// score) instead of visibly restarting each time a stage is cleared.
export function createInitialState(stage = 1, hearts = 3, elapsed = 0, distanceOffset = 0): GameState {
  const layout = stageLayoutFor(stage);
  return {
    stage,
    distance: distanceOffset,
    finishDistance: distanceOffset + layout.finishDistance,
    x: 0,
    baseSpeed: layout.baseSpeed,
    hearts,
    isInvulnerable: false,
    invulnerableUntil: 0,
    boostUntil: 0,
    elapsed,
    obstacles: layout.obstacles.map((o) => ({ ...o, distance: o.distance + distanceOffset, hit: false })),
    gates: layout.gates.map((g) => ({ ...g, distance: g.distance + distanceOffset, used: false })),
    rollers: layout.rollers.map((r) => ({
      ...r,
      distance: r.distance + distanceOffset,
      resolved: false,
      activatedAt: null,
    })),
    rollerProgress: 0,
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
// the next stage (hearts carried over) otherwise. Kept as its own pure rule
// — and exercised directly by spec/marble.test.ts — even though the shipped
// game is endless and drives progress through `advanceStage` instead, which
// never sets `isWon` and keeps generating harder stages instead of stopping.
export function checkWin(state: GameState): GameState {
  if (state.distance < state.finishDistance) return state;
  if (state.stage >= TOTAL_STAGES) {
    return { ...state, isWon: true };
  }
  return createInitialState(state.stage + 1, state.hearts, state.elapsed, state.distance);
}

// The endless-mode equivalent of checkWin: once the current stage's finish
// distance is reached, always continue into the next (harder) stage —
// there's no final stage and no way to "win" a run, only to keep going
// until hearts run out. The next stage's layout is offset by the current
// distance, not reset to 0, so the track and the score keep climbing in one
// continuous run across every stage boundary.
function advanceStage(state: GameState): GameState {
  if (state.distance < state.finishDistance) return state;
  return createInitialState(state.stage + 1, state.hearts, state.elapsed, state.distance);
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

  const rollerSpeedMultiplier = Math.max(
    ROLLER_SPEED_MULT_MIN,
    Math.min(ROLLER_SPEED_MULT_MAX, input.rollerSpeedMultiplier),
  );
  const rollerProgress = state.rollerProgress + ROLLER_BASE_RATE * rollerSpeedMultiplier * dt;

  let next: GameState = {
    ...state,
    elapsed,
    x,
    distance,
    rollerProgress,
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

  const rollers = next.rollers.map((roller) => {
    if (roller.resolved) return roller;
    const bandStart = roller.distance - roller.depth / 2;
    const bandEnd = roller.distance + roller.depth / 2;
    if (distance > bandEnd) return { ...roller, resolved: true };
    if (distance < bandStart) return roller;
    const activated: Roller = { ...roller, activatedAt: roller.activatedAt ?? rollerProgress };
    const rollerX = rollerXAt(activated, rollerProgress);
    if (Math.abs(x - rollerX) > ROLLER_HIT_RADIUS) return activated;
    if (next.isInvulnerable || activeBoost) {
      next.justCleared = true;
      return activated;
    }
    next = handleCollision(next);
    return activated;
  });
  next = { ...next, rollers };

  return advanceStage(next);
}
