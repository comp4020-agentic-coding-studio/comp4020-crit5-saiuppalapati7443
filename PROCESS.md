# Process overview

A reading-guide to how the work came together --- a map to your process, not an
essay about it. Markers read this file and follow its citations; they don't
trawl the repo for evidence you didn't point at, so if a moment mattered, cite
it.

## What I built

**Marble Crash**: a 3-lane runner where a marble rolls forward on its own and
the only thing the player does is steer it left or right, dodging red hazard
bars and riding gold gates through three short stages to a finish line. The
idea was to push the "no tutorial" constraint as far as it goes --- the game
has to teach its own controls by what the player sees in the first two
seconds, not by telling them anything.

## The moments that mattered

1. **The rules had to exist independently of the canvas before anything else
   was built.** `src/engine/marble.ts` is pure functions over a plain state
   object --- no DOM, no `Date.now()`, no `Math.random()` (hazard/gate layouts
   are fixed per-stage data, not rolled), so a run is reproducible and the
   three required rules (`handleCollision` deducting a heart and opening
   invulnerability, a second hit inside that window being a no-op, and
   `checkWin` firing at `distance >= finishDistance`) are testable without a
   browser at all. `spec/marble.test.ts` asserts exactly those three;
   `spec/invariants.test.ts` was left untouched, per its own header, since
   it's the always-on check and this week's contracts belong in their own
   file.
   [`ea995b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-saiuppalapati7443/commit/ea995b6)

2. **A "no tutorial" game still needs its first hazard to be readable, not
   just present.** The obvious approach --- spawn the first obstacle just off
   the top edge --- gives almost no reaction time on a small screen. Instead
   the camera's view distance (3000 units) is set wider than the first
   obstacle's placement (1400 units), so it's already on screen and visibly
   creeping closer from the very first frame the game renders, before the
   player has touched anything. That's the affordance doing the "here's what
   you dodge" job a tutorial would otherwise have to do in text.
   [`a358cb2`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-saiuppalapati7443/commit/a358cb2)

3. **A concrete change from playtesting the collision rule, not just the
   feel.** I don't have a real device to hand-test on in this environment, so
   I playtested the rule the way the engine is meant to be exercised: scripted
   runs against `stepGame`. Two obstacles placed a fair distance apart in the
   same lane (100 distance-units, ~0.5s apart at base speed) should read as
   one mistake, not two. With a short 400ms grace window, the simulation
   showed the second obstacle still cost a heart it shouldn't have --- an
   unfair double-hit off a single steering error. Widening the grace window
   to 1200ms (`GRACE_MS` in `src/engine/marble.ts`) and confirming the same
   scripted cluster now costs exactly one heart is what fixed it; that
   scenario is effectively what `spec/marble.test.ts`'s second case checks in
   miniature.
   [`ea995b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-saiuppalapati7443/commit/ea995b6)

4. **Beatability had to be checked, not assumed.** Rather than eyeball the
   three stages' hazard/gate placement, I drove the pure engine with a
   scripted "always dodge the nearest same-lane hazard within reach" bot for
   the full three stages. It finished stage 3 with all 3 hearts intact in
   126 simulated seconds --- inside the 2--3 minute target the brief sets ---
   picking up every gold gate along the way. That's the check that the level
   data in `STAGE_LAYOUTS` is fair and finishable before a human ever touches
   it, and it's why the timing constants (`baseSpeed`, `finishDistance`)
   landed where they did rather than being tuned by feel alone.
   [`ea995b6...a358cb2`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-saiuppalapati7443/compare/ea995b6...a358cb2)

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file.
