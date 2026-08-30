// Pure beam-tilt rule. No DOM, no timers, no rendering — testable in isolation.
// Filled in during the "core mechanic" stage.

export const DEFAULT_CONFIG = {
  beamHalfLength: 280,
  sensitivity: 0.012,
  maxTiltDegrees: 45,
  lossThresholdDegrees: 20,
};
