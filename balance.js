// Pure beam-tilt rule. No DOM, no timers, no rendering — testable in isolation.

export const DEFAULT_CONFIG = {
  // Half the beam's length in px, pivot to each end.
  beamHalfLength: 280,
  // Converts net torque (mass-units × px) into degrees of tilt. Tuned so a
  // single worst-case weight (max mass, near the beam's end) tilts the beam
  // a few degrees, not straight to the loss threshold — the player needs
  // several landings to build up real danger, not just bad luck on the first.
  sensitivity: 0.0012,
  // The beam can never visually rotate past this, however lopsided the load.
  maxTiltDegrees: 55,
  // Exceed this and the run ends.
  lossThresholdDegrees: 20,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// weights: { position: number, mass: number }[]
// position is signed px from the beam's center — left negative, right positive.
export function computeTiltDegrees(weights, config = DEFAULT_CONFIG) {
  const netTorque = weights.reduce((sum, w) => sum + w.position * w.mass, 0);
  return clamp(netTorque * config.sensitivity, -config.maxTiltDegrees, config.maxTiltDegrees);
}

export function isTipped(tiltDegrees, thresholdDegrees = DEFAULT_CONFIG.lossThresholdDegrees) {
  return Math.abs(tiltDegrees) > thresholdDegrees;
}

export function evaluateBeam(weights, config = DEFAULT_CONFIG) {
  const tiltDegrees = computeTiltDegrees(weights, config);
  return { tiltDegrees, tipped: isTipped(tiltDegrees, config.lossThresholdDegrees) };
}
