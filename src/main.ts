import {
  createInitialState,
  resetGame,
  stepGame,
  LANES,
  LANE_HALF_WIDTH,
  GRACE_MS,
  type GameState,
} from "./engine/marble.ts";

const stage = document.getElementById("stage") as HTMLDivElement;
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const progressFill = document.getElementById("progress-fill") as HTMLDivElement;
const heartEls = Array.from(document.querySelectorAll("#hearts .heart"));

// How far ahead (in distance units) the top of the screen looks — small
// enough that the marble's own base speed still reads as "rolling", large
// enough that the first hazard is visible from the very first frame instead
// of popping in, which is what gives it "ample reaction time" for free.
const VIEW_DISTANCE = 3000;

let width = 0;
let height = 0;
let baseY = 0;
let horizontalScale = 0;

function resize(): void {
  const rect = stage.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  baseY = height * 0.78;
  horizontalScale = width * 0.36;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function trackX(x: number): number {
  return width / 2 + x * horizontalScale;
}

function laneCenterX(lane: -1 | 0 | 1): number {
  return trackX(LANES[lane + 1]);
}

const laneWidthPx = () => horizontalScale * LANE_HALF_WIDTH * 1.5;

let state: GameState = createInitialState(1);
let keySteer: -1 | 0 | 1 = 0;
let pointerSteer: -1 | 0 | 1 = 0;
let pointerActive = false;
let lastTime = 0;

function currentSteer(): -1 | 0 | 1 {
  return pointerActive ? pointerSteer : keySteer;
}

function flash(kind: "flash-hit" | "flash-boost"): void {
  stage.classList.remove("flash-hit", "flash-boost");
  void stage.offsetWidth;
  stage.classList.add(kind);
}

function stagePointFromEvent(e: PointerEvent): { x: number } {
  const rect = stage.getBoundingClientRect();
  return { x: e.clientX - rect.left };
}

function steerFromPoint(x: number): -1 | 0 | 1 {
  return x < width / 2 ? -1 : 1;
}

stage.addEventListener("pointerdown", (e) => {
  if (state.isLost || state.isWon) {
    state = resetGame();
    stage.classList.remove("gameover", "won", "flash-hit", "flash-boost");
    return;
  }
  pointerActive = true;
  pointerSteer = steerFromPoint(stagePointFromEvent(e).x);
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener("pointermove", (e) => {
  if (!pointerActive) return;
  pointerSteer = steerFromPoint(stagePointFromEvent(e).x);
});

function endPointer(): void {
  pointerActive = false;
  pointerSteer = 0;
}

stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

window.addEventListener("keydown", (e) => {
  if (state.isLost || state.isWon) {
    state = resetGame();
    stage.classList.remove("gameover", "won", "flash-hit", "flash-boost");
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keySteer = -1;
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keySteer = 1;
});

window.addEventListener("keyup", (e) => {
  if (
    (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") && keySteer === -1
  ) {
    keySteer = 0;
  } else if (
    (e.key === "ArrowRight" || e.key === "d" || e.key === "D") && keySteer === 1
  ) {
    keySteer = 0;
  }
});

function drawLanes(): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  for (const laneX of LANES) {
    const left = trackX(laneX) - laneWidthPx() / 2;
    const right = trackX(laneX) + laneWidthPx() / 2;
    for (const edge of [left, right]) {
      ctx.beginPath();
      ctx.moveTo(edge, 0);
      ctx.lineTo(edge, height);
      ctx.stroke();
    }
  }
}

function distanceToY(objDistance: number): number {
  return baseY - (objDistance - state.distance) * (baseY / VIEW_DISTANCE);
}

function drawObstacles(): void {
  for (const obstacle of state.obstacles) {
    if (obstacle.hit) continue;
    const y = distanceToY(obstacle.distance);
    if (y < -40 || y > height + 40) continue;
    const x = laneCenterX(obstacle.lane);
    const w = laneWidthPx();
    const h = 16;
    ctx.fillStyle = "#e0546b";
    ctx.shadowColor = "rgba(224, 84, 107, 0.6)";
    ctx.shadowBlur = 12;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.shadowBlur = 0;
  }
}

function drawGates(now: number): void {
  for (const gate of state.gates) {
    if (gate.used) continue;
    const y = distanceToY(gate.distance);
    if (y < -40 || y > height + 40) continue;
    const x = laneCenterX(gate.lane);
    const w = laneWidthPx();
    const pulse = 0.2 * Math.sin(now / 200);
    ctx.strokeStyle = "#ffd76a";
    ctx.lineWidth = 6 + pulse * 4;
    ctx.shadowColor = "rgba(255, 215, 106, 0.85)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawMarble(now: number): void {
  const x = trackX(state.x);
  const boosted = state.elapsed < state.boostUntil;
  const invulnerable = state.elapsed < state.invulnerableUntil;
  // Blink during the grace window rather than just holding a static tint —
  // an unmoving color change read as "the game is paused" in early
  // playtesting, a blink reads as "I'm briefly safe."
  if (invulnerable && Math.floor(now / 100) % 2 === 0) return;

  const radius = 14;
  const gradient = ctx.createRadialGradient(x - 4, baseY - 4, 1, x, baseY, radius);
  if (boosted) {
    gradient.addColorStop(0, "#fff6d8");
    gradient.addColorStop(1, "#ffd76a");
  } else {
    gradient.addColorStop(0, "#ffe9b0");
    gradient.addColorStop(1, "#d98a2b");
  }
  ctx.fillStyle = gradient;
  ctx.shadowColor = boosted ? "rgba(255, 215, 106, 0.9)" : "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = boosted ? 20 : 0;
  ctx.beginPath();
  ctx.arc(x, baseY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function updateHud(): void {
  const pct = Math.min(100, (state.distance / state.finishDistance) * 100);
  progressFill.style.width = `${pct}%`;
  heartEls.forEach((el, i) => {
    el.classList.toggle("lit", i < state.hearts);
  });
}

function frame(now: number): void {
  resize();
  ctx.clearRect(0, 0, width, height);

  const dt = lastTime === 0 ? 16 : Math.min(now - lastTime, 50);
  lastTime = now;

  if (!state.isWon && !state.isLost) {
    state = stepGame(state, { steer: currentSteer() }, dt);
    if (state.justHit) flash("flash-hit");
    if (state.justBoosted) flash("flash-boost");
    if (state.isLost) stage.classList.add("gameover");
    if (state.isWon) stage.classList.add("won");
  }

  drawLanes();
  drawObstacles();
  drawGates(now);
  drawMarble(now);
  updateHud();

  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
