# Gambdle

A daily casino game. Everyone plays the same hands — Blackjack, Texas Hold'em, and Roulette — seeded from the current date so your cards match your friends'. Your final chip count is your score. A new game resets every day at midnight Arizona time.

**[gambdle.net](https://gambdle.net)**

---

## How it works

You start with 1,000 chips and play through three rounds in order:

1. **Game 1** — 3 hands of Blackjack (default) or 5-Card Poker
2. **Game 2** — 3 hands of Ultimate Texas Hold'em (default) or Blackjack/Poker
3. **Roulette** — one spin to close out the run

Every day has a **modifier** — a rule that shakes up the game for everyone, like doubled payouts, a dealer advantage, or a free re-spin. The modifier rotates on a 22-day cycle, with date-specific overrides available in `src/modifiers.js`.

Scores are submitted to a global leaderboard. Finishing with a new personal best unlocks cosmetic rewards (card backs, felt colors, emoji deck).

---

## Running locally

No build step. Open `index.html` directly in a browser.

Script load order matters and is already wired in `index.html`:

```
modifiers.js → core.js → ui.js → bj.js → uth.js → roulette.js → game.js
```

---

## File structure

| File | Purpose |
|------|---------|
| `index.html` | Shell — links CSS, JS, fonts |
| `styles.css` | All styles |
| `src/modifiers.js` | Daily modifier definitions and schedule |
| `src/core.js` | State, RNG/seeding, constants, card utilities, save/load |
| `src/ui.js` | Shared HTML helpers, chip selector, audio, menus, preferences |
| `src/bj.js` | Blackjack logic and screen rendering |
| `src/uth.js` | Ultimate Texas Hold'em + 5-card poker logic and screen rendering |
| `src/roulette.js` | Roulette board, wheel animation, bet resolution |
| `src/game.js` | App shell: intro/results screens, leaderboard, `render()`, boot |
| `assets/og-image.png` | Social preview image (1200×630) |
| `assets/og-image.html` | Source template for regenerating the OG image |

---

## Architecture

### State

All game state lives in a single global object `S`, persisted to `localStorage` under the key `gambdle_state_YYYYMMDD`. The key changes daily, so each day starts fresh automatically. Private browsing falls back to `sessionStorage`.

### Daily seed & RNG

`getDailySeed()` returns today's date as a `YYYYMMDD` integer, computed in Phoenix time (MST, UTC-7, no DST). This integer seeds a SplitMix32 PRNG used to shuffle cards — so every player gets the same deal on the same day.

Roulette is the exception: the wheel uses `Math.random()` at spin time (stored in `S.rSpin` so it survives a refresh mid-spin).

Day 1 is May 5, 2026. `getDayNum()` derives the current day number from that anchor.

### Rendering

`render()` replaces the entire `#app` innerHTML and re-runs the current screen function. It's fine for screen transitions but causes a visible flash if called mid-hand.

For mid-hand updates, the code uses **surgical DOM mutations** instead — inserting a card element directly, updating a value span in place, etc. The pattern is: give changing elements stable IDs, mutate them directly, call `saveState()`. This is how BJ hits, poker hold-toggles, and roulette bet changes work.

`_noAnim = true` before a `render()` call skips the panel slide-in animation, used when transitioning between phases within the same hand.

### Game slots

`GAME1` and `GAME2` in `core.js` control which game occupies each slot. They default to `'bj'` and `'uth'`, and can be swapped via the dev menu. `NEXT_SCREEN` maps each game to what follows it; roulette is always last.

---

## Daily modifiers

Edit `src/modifiers.js` to change the modifier schedule. Three things live there:

**`PRESET_MODIFIERS`** — a named object for each modifier, with a `type`, `title`, `desc`, and any number of modifier keys (e.g. `bj_payout: 2.0`, `r_max_bets: 10`).

**`CYCLE_ORDER`** — the 22-day rotation array. Index 0 = Day 1 (May 5, 2026). The array strictly alternates roulette and non-roulette modifiers. A validation guard at the bottom of the file throws if any key is unrecognized.

**`DAILY_MODIFIERS`** — a `{ YYYYMMDD: 'preset_key' }` map for date-specific overrides. These take priority over the cycle.

Available modifier keys are documented at the top of `modifiers.js`.

---

## Unlockable cosmetics

Unlocks trigger automatically when a player sets a new personal-best chip count. `applyPrefs()` applies the active selection as a body class; locked selections silently fall back to default.

| Score threshold | Unlock |
|----------------|--------|
| 1,500+ | Orange card back |
| 2,500+ | Maroon table felt |
| 3,500+ | Emoji deck |
| 5,000+ | Whale card back |
| 10,000+ | Golden card back |

The emoji deck is CSS-only — suit and rank elements get `visibility:hidden` and `::after` pseudo-elements render the emoji. Toggling `body.deck-emoji` updates all cards on screen without a re-render.

---

## Dev mode

Add `?dev=true` to the URL to enable the developer overlay. Dev mode:

- Shows a **Developer** menu in the menu bar with shortcuts to jump to any screen, add chips, reset the run, and force a modifier
- **Blocks leaderboard submission** so test runs don't pollute the scores
- Enables a **Test Seed** checkbox that swaps to a fixed card override defined in `core.js` (`TEST_CARD_OVERRIDE`), useful for testing specific hands consistently
- Includes a game-slot picker for swapping Blackjack / Hold'em / Poker into either slot

To test specific cards without the test seed UI, set `ENABLE_CARD_SEEDING = true` in `core.js` and fill in `CARD_SEED_OVERRIDE`.

---

## Design

**Fonts**
- VT323 — main UI font (body, buttons, labels, chip values)
- Tahoma — card ranks and suits

**Theme** — XP-style window chrome over a felt-green play area. Key CSS variables: `--felt`, `--gold` / `--gold-hi` / `--gold-lo`, `--cream`, `--ink`, `--shadow`, `--highlight`.

**Bevel system** — two CSS custom properties handle all the raised/pressed effects:
- `--raised` — 1.5px inset bevel (action buttons, progress dots, roulette cells)
- `--raised-sm` — 1px variant (title bar buttons, chip badge, info tiles)

---

## Leaderboard

Scores are submitted to a Supabase backend once per day per device (guarded by a `gambdle_submitted_YYYYMMDD` key in localStorage). The `get_percentile` RPC returns the player's rank and total count for the day, displayed on the results screen.

Dev mode and the test seed both skip submission.
