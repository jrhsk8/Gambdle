// ─── BET INTAKE (pure) ───────────────────────────────────────────────────────
// The per-game bet-cap, all-in, and guard/label math, lifted out of the onclick handlers
// so it can be unit-tested directly. Everything here is PURE: values in, values out — it
// never reads or writes S, touches the DOM, plays sound, or calls saveState()/render().
// Two adapters drive it: the in-page handlers in ui.js (addChip/clearBet/allIn/maxBet)
// and the ladder.js cap helper (ladMaxStake, composed into ladderMode()), plus the unit
// tests in bet-intake.test.js and bet-guard.test.js.
// This is the one place that answers "how is a bet capped, is it biddable, and what does
// the on-screen cap label say?" — so the cap rule and its displayed label can't drift.
//
//   ladderMaxStake(chips)            → the Ladder's raw 25%-of-stack cap
//   maxFor(game, chips, mods)        → the most a player may stake on `game`
//   addToBet(current, delta, max)    → current + a chip's value, clamped into [0, max]
//   clearedBet()                     → 0
//   allInAmount(game, chips, mods)   → the all-in stake (the cap, today)
//   betGuard(game, chips, mods)      → {max, canBet, allIn, label} — the cap plus whether
//                                       a bet can be placed at all, plus the display label
// ─────────────────────────────────────────────────────────────────────────────

// The Ladder caps a staked entry at 25% of the stack, floored at 25 chips and never
// above the whole stack (so a tiny stack can still ante the 25 minimum, all-in).
function ladderMaxStake(chips){ return Math.min(chips, Math.max(25, Math.floor(chips * 0.25))); }

// The most a player may stake on `game`, given `chips` and the active modifiers.
// `game` is the screen key ('bj' | 'uth' | 'poker' | 'roulette' | 'ladder').
// `mods` carries any modifier inputs the cap depends on (passed in, never read from
// globals): `ladderFree` = the locked free-entry stake on a ladder_free day, if any.
//   · UTH caps at ⌊chips·2/3⌋ so the player always keeps enough for a 1× raise.
//   · The Ladder caps at its 25% rule, or the locked free-entry stake on free days.
//   · Every other game lets the player stake the whole stack.
function maxFor(game, chips, mods = {}){
  if (game === 'ladder') return mods.ladderFree || ladderMaxStake(chips);
  if (game === 'uth')    return Math.floor(chips * 2 / 3);
  return chips;
}

// Add a chip's value to the current stake, clamped into [0, max] so a bet can never
// exceed the cap (or, defensively, drop below zero).
function addToBet(current, delta, max){ return Math.max(0, Math.min(current + delta, max)); }

// Clearing the bet always returns to zero.
function clearedBet(){ return 0; }

// All-in stakes the cap. Kept as its own function (rather than an alias of maxFor) so a
// future game or Modifier can make all-in diverge from the per-chip cap without touching
// addToBet's clamp.
function allInAmount(game, chips, mods = {}){ return maxFor(game, chips, mods); }

// The one place that answers every question a bet-entry screen asks about its cap: what's
// the max, can a bet be placed at all right now, what's the all-in stake, and what does the
// on-screen "max" label say. `mods.minChips` (if any) is the modifier's minimum-stake floor
// (e.g. high_stakes' min_chips) — below it, a bet is never valid even if `max` is positive,
// same rule isChipBusted() (core.js) applies at the whole-game level.
// The label is the exact markup ladder.js's bet-phase readout hand-built before this seam
// existed ("Max bet: <b>&lt;number&gt;</b>") — kept byte-identical (incl. the <b> wrapper
// around just the number) so no layout test shifts and a caller can drop it straight into a
// template. Built with the JS-builtin toLocaleString() (not ui.js's fmt(), which is the same
// thing) so bet.js stays pure and dependency-free of ui.js.
function betGuard(game, chips, mods = {}){
  const max = maxFor(game, chips, mods);
  const minChips = mods.minChips || 0;
  return {
    max,
    canBet: max > 0 && max >= minChips,
    allIn: allInAmount(game, chips, mods),
    label: `Max bet: <b>${max.toLocaleString()}</b>`,
  };
}
