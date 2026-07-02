// ─── REVEAL / SETTLE SCHEDULER ───────────────────────────────────────────────
// Shared scheduler for staggered reveal animations (card swaps, sounds, dealer reveals) used by
// every game, so each one doesn't hand-roll its own setTimeout chain, finish guard, and refresh-resume
// math. Touches no DOM, no game state, no rng · a caller declares WHAT happens WHEN (a list of
// {at, do} steps plus an onFinish); this handles the stagger, firing onFinish exactly once (even if
// triggered twice), an optional absolute ceiling backstop, and resuming after a refresh (skip steps
// already shown, fire the rest from an elapsed offset). Step bodies themselves (card swaps, sounds,
// render calls) stay in the game files; only the timing/finish/resume logic lives here.
//
// spec: {
//   steps:    [{ at:<ms>, do:<fn> }],   // fired in `at` order from sequence start; each `do` runs once
//   onFinish: <fn>,                      // fired EXACTLY once (at finishAt, or via the ceiling / handle.finish())
//   finishAt: <ms>,                      // undefined → end of the last step · null → no time-based finish
//                                        //   (event-driven only, e.g. roulette's audio/RAF) · number → that time
//   ceilingMs:<ms>,                      // optional absolute backstop that also triggers onFinish once
//   from:     <ms>,                      // resume offset: steps with at < from are skipped, the rest fire at (at - from)
//   signal:   <fn()=>bool>,              // optional "still valid?" guard, re-checked before each step + the finish;
//                                        //   false aborts that step / the finish silently (covers stale post-nav timers)
// }
// returns { cancel(), finish() }:
//   cancel(): clears every pending timer plus the ceiling and blocks any later finish.
//   finish(): triggers onFinish early, once (roulette calls this when audio/RAF completes).
function runReveal(spec){
  const from = spec.from || 0;
  const steps = (spec.steps || []).slice().sort((a, b) => a.at - b.at);
  const maxAt = steps.length ? steps[steps.length - 1].at : 0;
  const finishAt = spec.finishAt === undefined ? maxAt : spec.finishAt; // null = no auto-finish timer
  const ok = () => !spec.signal || spec.signal();
  const ids = [];
  let done = false, ceilingId = null;
  function finish(){
    if (done) return;
    done = true;
    if (ceilingId != null) runReveal._clear(ceilingId);
    if (ok() && spec.onFinish) spec.onFinish();
  }
  for (const st of steps) {
    if (st.at < from) continue;                              // already shown before the resume point
    ids.push(runReveal._timer(() => { if (!done && ok()) st.do(); }, st.at - from));
  }
  if (finishAt !== null) ids.push(runReveal._timer(finish, Math.max(0, finishAt - from)));
  if (spec.ceilingMs != null) ceilingId = runReveal._timer(finish, Math.max(0, spec.ceilingMs - from));
  return {
    cancel(){ done = true; ids.forEach(runReveal._clear); if (ceilingId != null) runReveal._clear(ceilingId); },
    finish,
  };
}
// Overridable in unit tests with a fake clock (mirrors how the suite already swaps setTimeout).
runReveal._timer = (fn, ms) => setTimeout(fn, ms);
runReveal._clear = (id) => clearTimeout(id);
