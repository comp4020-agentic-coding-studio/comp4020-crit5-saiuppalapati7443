# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough was refusing to let "no tutorial" become an excuse for an
untested game. Once the rules lived as pure functions (`src/engine/marble.ts`)
with no DOM or clock inside them, I could playtest the parts a browser
playtest usually covers by feel --- is the grace window long enough, is a
stage actually finishable in time --- by scripting a bot against the engine
directly. That's how the 1.2s invulnerability window and the three stages'
hazard timing got their real numbers: a short grace window measurably let a
single steering mistake near a hazard cluster cost two hearts instead of one,
and a scripted "always dodge" run through all three stages confirmed the
level was clearable inside the 2--3 minute target before I ever needed to
click through it myself. Directing an agent to build affordance-only UI is
easy to nod along to; directing it to prove the rules underneath are fair
took writing the check.

**What did this work change about who I want to be as a software developer?**

It sharpened a preference I already had but hadn't applied consistently: push
every rule that can be stated as a pure function out of the rendering layer,
because that's the only layer you can actually interrogate without a browser
in the loop. I want to be the kind of developer who treats "I can't easily
click-test this" as a reason to write a rule-level check, not a reason to
ship it unverified and hope. That instinct is what turned a vague fairness
worry into a specific, cited number.
