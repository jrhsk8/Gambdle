// ─── BET INTAKE (pure) ───────────────────────────────────────────────────────
// The per-game bet-cap and all-in math, lifted out of the onclick handlers so it
// can be unit-tested directly. Everything here is PURE: values in, values out — it
// never reads or writes S, touches the DOM, plays sound, or calls saveState()/render().
// Two adapters drive it: the in-page handlers in ui.js (addChip/clearBet/allIn/maxBet)
// and the ladder.js cap helper (ladMaxStake), plus the unit tests in bet-intake.test.js.
// This is the one place that answers "how is a bet capped?".
//
//   ladderMaxStake(chips)            → the Ladder's raw 25%-of-stack cap
//   maxFor(game, chips, mods)        → the most a player may stake on `game`
//   addToBet(current, delta, max)    → current + a chip's value, clamped into [0, max]
//   clearedBet()                     → 0
//   allInAmount(game, chips, mods)   → the all-in stake (the cap, today)
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
