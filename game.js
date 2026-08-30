import { DEFAULT_CONFIG, computeTiltDegrees, isTipped } from "./balance.js";

const config = DEFAULT_CONFIG;
const DEG2RAD = Math.PI / 180;

const stage = document.getElementById("stage");
const beamEl = document.getElementById("beam");
const pivotEl = document.getElementById("pivot");
const scoreEl = document.getElementById("score");

const START_INTERVAL_MS = 2200;
const MIN_INTERVAL_MS = 700;
const INTERVAL_SHRINK_PER_SEC = 18;
const FALL_SPEED_START = 34;
const FALL_ACCEL = 22;
const FALL_SPEED_MAX = 150;
const GRAVITY = 480;
const SLIDE_ACCEL = 420;
const TILT_SMOOTHING_RATE = 8;

let landedWeights = [];
let fallingWeights = [];
let fallOffWeights = [];
let score = 0;
let gameOver = false;
let displayTilt = 0;
let draggingWeight = null;
let dragOrigin = null;
let spawnTimeoutId = null;
let gameStartTime = performance.now();
let lastFrameTime = performance.now();

let centerX = 0;
let centerY = 0;

function updateStageMetrics() {
  const rect = stage.getBoundingClientRect();
  centerX = rect.width / 2;
  centerY = rect.height / 2;
  return rect;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function radiusForMass(mass) {
  return 10 + mass * 1.1;
}

function spawnWeight() {
  const mass = randomRange(6, 16);
  const radius = radiusForMass(mass);
  const margin = radius + 20;
  const x = randomRange(centerX - config.beamHalfLength * 0.85, centerX + config.beamHalfLength * 0.85);
  const el = document.createElement("div");
  el.className = "weight weight--falling";
  el.style.width = el.style.height = `${radius * 2}px`;
  stage.appendChild(el);
  fallingWeights.push({ mass, radius, x, y: -radius, vy: FALL_SPEED_START, el });
}

function scheduleSpawn() {
  const elapsed = (performance.now() - gameStartTime) / 1000;
  const interval = Math.max(MIN_INTERVAL_MS, START_INTERVAL_MS - elapsed * INTERVAL_SHRINK_PER_SEC);
  spawnTimeoutId = setTimeout(() => {
    if (gameOver) return;
    spawnWeight();
    scheduleSpawn();
  }, interval);
}

// The opening screen needs a weight already falling toward the beam — the
// only thing that has to teach the player what to do — so spawn one right
// away instead of waiting out the first interval.
function startSpawning() {
  spawnWeight();
  scheduleSpawn();
}

function landWeight(fw, angleRad) {
  const localX = clamp(
    (fw.x - centerX) / Math.cos(angleRad),
    -(config.beamHalfLength - fw.radius),
    config.beamHalfLength - fw.radius,
  );
  fw.el.classList.remove("weight--falling");
  fw.el.style.top = "50%";
  fw.el.style.left = "50%";
  beamEl.appendChild(fw.el);
  const weight = { mass: fw.mass, radius: fw.radius, localX, el: fw.el };
  fw.el._weightRef = weight;
  landedWeights.push(weight);
  score += 1;
  scoreEl.textContent = String(score);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function triggerGameOver() {
  if (gameOver) return;
  gameOver = true;
  clearTimeout(spawnTimeoutId);
  draggingWeight = null;
  dragOrigin = null;
  stage.classList.remove("stage--flash");
  void stage.offsetWidth;
  stage.classList.add("stage--flash");
}

function sendWeightFlying(weight, angleRad) {
  const screenX = centerX + weight.localX * Math.cos(angleRad);
  const screenY = centerY + weight.localX * Math.sin(angleRad);
  const dir = weight.slideDir;
  weight.el.remove();
  const el = document.createElement("div");
  el.className = "weight weight--falling";
  el.style.width = el.style.height = `${weight.radius * 2}px`;
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY}px`;
  stage.appendChild(el);
  fallOffWeights.push({
    x: screenX,
    y: screenY,
    vx: dir * Math.cos(angleRad) * 160 + randomRange(-30, 30),
    vy: dir * Math.sin(angleRad) * 160,
    el,
  });
}

function resetGame() {
  for (const w of landedWeights) w.el.remove();
  for (const w of fallingWeights) w.el.remove();
  for (const w of fallOffWeights) w.el.remove();
  landedWeights = [];
  fallingWeights = [];
  fallOffWeights = [];
  score = 0;
  scoreEl.textContent = "0";
  gameOver = false;
  displayTilt = 0;
  beamEl.style.transform = "rotate(0deg)";
  stage.classList.remove("stage--flash");
  beamEl.classList.remove("resettable");
  pivotEl.classList.remove("resettable");
  gameStartTime = performance.now();
  startSpawning();
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  updateStageMetrics();

  const angleRad = displayTilt * DEG2RAD;
  const cosA = Math.cos(angleRad);

  for (let i = fallingWeights.length - 1; i >= 0; i--) {
    const fw = fallingWeights[i];
    fw.vy = Math.min(FALL_SPEED_MAX, fw.vy + FALL_ACCEL * dt);
    fw.y += fw.vy * dt;
    const surfaceY = centerY + (fw.x - centerX) * Math.tan(angleRad);
    const withinSpan = Math.abs(fw.x - centerX) <= config.beamHalfLength * cosA - fw.radius * 0.3;
    if (withinSpan && fw.y >= surfaceY) {
      fallingWeights.splice(i, 1);
      landWeight(fw, angleRad);
    } else if (fw.y > centerY * 2 + 100) {
      fw.el.remove();
      fallingWeights.splice(i, 1);
    } else {
      fw.el.style.left = `${fw.x}px`;
      fw.el.style.top = `${fw.y}px`;
    }
  }

  const target = computeTiltDegrees(
    landedWeights.map((w) => ({ position: w.localX, mass: w.mass })),
    config,
  );
  displayTilt += (target - displayTilt) * (1 - Math.exp(-TILT_SMOOTHING_RATE * dt));
  beamEl.style.transform = `rotate(${displayTilt}deg)`;

  if (!gameOver && isTipped(target, config.lossThresholdDegrees)) {
    triggerGameOver();
  }

  if (gameOver) {
    for (let i = landedWeights.length - 1; i >= 0; i--) {
      const w = landedWeights[i];
      if (w.slideDir === undefined) {
        w.slideDir = w.localX !== 0 ? Math.sign(w.localX) : Math.sign(displayTilt) || 1;
        w.slideSpeed = 40;
      }
      w.slideSpeed += SLIDE_ACCEL * dt;
      w.localX += w.slideDir * w.slideSpeed * dt;
      if (Math.abs(w.localX) > config.beamHalfLength + w.radius) {
        landedWeights.splice(i, 1);
        sendWeightFlying(w, angleRad);
      } else {
        w.el.style.transform = `translate(-50%, -50%) translateX(${w.localX}px)`;
      }
    }
  } else {
    for (const w of landedWeights) {
      if (w === draggingWeight) continue;
      w.el.style.transform = `translate(-50%, -50%) translateX(${w.localX}px)`;
    }
  }

  for (let i = fallOffWeights.length - 1; i >= 0; i--) {
    const w = fallOffWeights[i];
    w.vy += GRAVITY * dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    if (w.y > centerY * 2 + 150) {
      w.el.remove();
      fallOffWeights.splice(i, 1);
    } else {
      w.el.style.left = `${w.x}px`;
      w.el.style.top = `${w.y}px`;
    }
  }

  if (gameOver && landedWeights.length === 0 && fallOffWeights.length === 0) {
    beamEl.classList.add("resettable");
    pivotEl.classList.add("resettable");
  }

  requestAnimationFrame(frame);
}

beamEl.addEventListener("pointerdown", (e) => {
  if (gameOver) return;
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target._weightRef) return;
  draggingWeight = target._weightRef;
  dragOrigin = stage.getBoundingClientRect();
  target.setPointerCapture(e.pointerId);
});

window.addEventListener("pointermove", (e) => {
  if (!draggingWeight || !dragOrigin || gameOver) return;
  const angleRad = displayTilt * DEG2RAD;
  const dx = e.clientX - (dragOrigin.left + centerX);
  const dy = e.clientY - (dragOrigin.top + centerY);
  const localX = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
  draggingWeight.localX = clamp(
    localX,
    -(config.beamHalfLength - draggingWeight.radius),
    config.beamHalfLength - draggingWeight.radius,
  );
  draggingWeight.el.style.transform = `translate(-50%, -50%) translateX(${draggingWeight.localX}px)`;
});

function endDrag() {
  draggingWeight = null;
  dragOrigin = null;
}

window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

stage.addEventListener("click", () => {
  if (gameOver && beamEl.classList.contains("resettable")) {
    resetGame();
  }
});

updateStageMetrics();
startSpawning();
requestAnimationFrame((now) => {
  lastFrameTime = now;
  requestAnimationFrame(frame);
});
