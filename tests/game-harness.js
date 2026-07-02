// ─── Shared game-state test harness ──────────────────────────────────────────
// ONE snapshot/restore implementation, reused by every per-game harness (withBJ,
// withSplit, withUth, withMod, withSplitMod, withLad) so state isolation between
// tests is a single audited code path instead of four hand-rolled ones.
//
// Snapshot/restore contract:
//   - Every call takes a FULL JSON snapshot of S at call time (not file-load time)
//     and restores it in `finally`. This is a strict superset of every narrower
//     key-list snapshot the old harnesses used (withLad's KEYS list, withMod's
//     forcedMod/chips pair, ...): restoring everything can never under-restore
//     and leak state into the next test. S is a plain data object; the one
//     exception is `pkHeld` (a Set), round-tripped through an array.
//   - A game builder (registered below) may declare EXTRA non-S things to save
//     and restore around the snapshot — e.g. Ladder's `DEAL.ladderCards` pin, or
//     the backlog-seed pin (next point). Extras run outside the S snapshot so
//     they restore even if the builder or fn() throws before S is touched.
//
// Frozen-day modifier rule (KNOWN FLAKE — see .claude/TESTING.md):
//   getMod()/_activeMod() resolve today's modifier via getActiveSeed(), which
//   reads the REAL calendar date unless a backlog seed is pinned. Passing
//   forcedMod:{} sidesteps this for most tests (resolveDayMod's `forcedMod ||
//   ...` short-circuits on the truthy {} before the date is ever read), which is
//   why the old harnesses got away without pinning. But any test that wants
//   getMod() to see a *specific real* daily modifier (or wants forcedMod left
//   unset/null and still needs a deterministic day) must pin the calendar day
//   instead of relying on forcedMod:null. withGame centralizes that: pass
//   `frozenDay: <YYYYMMDD>` in overrides and it calls _setBacklogSeedForTest()
//   before fn() and clears it (back to null) in finally, every time, so no
//   caller can forget the reset half.
'use strict';

// Registry of per-game state builders. Each entry maps a gameKey to a function
// (overrides) => void that assigns S fields (and returns nothing) — the same
// shape as the old per-file harness bodies. Keeping this a registry (rather than
// a switch) means a new game only needs one addition here, not a new harness file.
const GAME_BUILDERS = {};

// Registers how to set up S for `gameKey`. `build(overrides)` should Object.assign
// onto S (or set fields directly) — whatever the old withX did before calling fn().
function registerGameBuilder(gameKey, build) {
  GAME_BUILDERS[gameKey] = build;
}

// Snapshots S (+ pkHeld Set handling), runs build(overrides) then fn(), restores
// S in `finally` regardless of outcome. `overrides.frozenDay`, if present, pins
// getActiveSeed()/getMod() to that YYYYMMDD for the duration of fn() (see the
// frozen-day rule above) and is stripped before being handed to the builder so
// per-game builders never need to know about it.
function withGame(gameKey, overrides, fn) {
  const build = GAME_BUILDERS[gameKey];
  if (!build) throw new Error(`withGame: no builder registered for "${gameKey}"`);

  const { frozenDay, ...rest } = overrides || {};

  const snapJson = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
  function restoreS() {
    const r = JSON.parse(snapJson);
    r.pkHeld = new Set(r.pkHeld);
    Object.assign(S, r);
  }

  const pinDay = frozenDay !== undefined;
  if (pinDay) _setBacklogSeedForTest(frozenDay);
  try {
    build(rest);
    fn();
  } finally {
    restoreS();
    if (pinDay) _setBacklogSeedForTest(null);
  }
}
