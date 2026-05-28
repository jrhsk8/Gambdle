# Gambdle

A daily casino game where everyone plays the same seeded hands. Start with 1,000 chips, grind through Blackjack, Texas Hold'em, and a Roulette spin — then see where you land on the leaderboard.

**[gambdle.net](https://gambdle.net)**

---

## How it works

Each run plays out in three rounds, in order:

1. **Game 1** — 3 hands of Blackjack
2. **Game 2** — 3 hands of Ultimate Texas Hold'em
3. **Roulette** — one spin to close out

Your final chip count is your score. A new game resets every day at midnight Arizona time (MST, UTC-7, no DST). Everyone plays the same seeded hands on the same day, so results are directly comparable.

## Daily modifiers

Every day has a **modifier** — a rule twist that applies to the whole run. Examples: blackjacks pay 3:1, the dealer stands on 15, blind payouts are doubled, or you can only go all-in. The mod rotates on a 24-day cycle, with date-specific overrides available in `src/modifiers.js`.

The current modifier is shown before you start and applies to all three games (some mods are game-specific, some are cross-game).

## Leaderboard & sharing

Scores are submitted to a global leaderboard automatically when you finish. The results screen shows your percentile rank and total player count for that day. After you finish, you can copy a spoiler-free share card to post your result.

Submission happens once per day per device and is skipped in dev mode and with the test seed active.

## Cosmetic unlocks

Unlocks trigger automatically when you set a new personal-best chip count:

| Score threshold | Unlock |
|----------------|--------|
| 1,500+ | Orange card back |
| 2,500+ | Maroon table felt |
| 3,500+ | Emoji deck |
| 5,000+ | Whale card back |
| 10,000+ | Golden card back |

## Archive

Past days are accessible from the file menu. You can replay any previous day and see your score for it. Archive runs don't submit to the leaderboard.

---

## Running locally

No build step. Open `index.html` directly in a browser, or serve it with any static file server:

```
npx serve .
```

Script load order matters and is already wired in `index.html`:

```
modifiers.js → core.js → ui.js → bj.js → uth.js → roulette.js → game.js
```

## File structure

| File | Purpose |
|------|---------|
| `index.html` | Shell — links CSS, JS, fonts |
| `styles.css` | All styles |
| `src/modifiers.js` | Daily modifier definitions, schedule, and seed overrides |
| `src/core.js` | State, RNG/seeding, constants, card utilities, save/load |
| `src/ui.js` | Shared HTML helpers, chip selector, audio, menus, preferences |
| `src/bj.js` | Blackjack logic and screen rendering |
| `src/uth.js` | Ultimate Texas Hold'em + 5-card poker logic and screen rendering |
| `src/roulette.js` | Roulette board, wheel animation, bet resolution |
| `src/game.js` | App shell: intro/results screens, leaderboard, score distribution, `render()`, boot |
| `assets/og-image.png` | Social preview image (1200×630) |
| `assets/og-image.html` | Source template for regenerating the OG image |

---

## Architecture

### State

All game state lives in a single global object `S`, persisted to `localStorage` under the key `gambdle_state_YYYYMMDD`. The key changes daily, so each day starts fresh automatically. Private browsing falls back to `sessionStorage`.

### Daily seed & RNG

`getDailySeed()` returns today's date as a `YYYYMMDD` integer in Phoenix time. This integer seeds a SplitMix32 PRNG used to shuffle cards — so every player gets the same deal on the same day.

`getRngSeed()` wraps `getDailySeed()` and checks `DAILY_SEED_OVERRIDES` (in `modifiers.js`) before returning — allowing a specific date's card draws to be swapped out without changing its modifier or save slot.

Roulette is the exception: the wheel uses `Math.random()` at spin time (stored in `S.rSpin` so it survives a refresh mid-spin).

Day 1 is May 5, 2026. `getDayNum()` derives the current day number from that anchor.

### Rendering

`render()` replaces the entire `#app` innerHTML and re-runs the current screen function. It's fine for screen transitions but causes a visible flash if called mid-hand.

For mid-hand updates, the code uses **surgical DOM mutations** — inserting a card element directly, updating a value span in place, etc. The pattern is: give changing elements stable IDs, mutate them directly, call `saveState()`. This is how BJ hits, poker hold-toggles, and roulette bet changes work.

`_noAnim = true` before a `render()` call skips the panel slide-in animation, used when transitioning between phases within the same hand.

### Game slots

`GAME1` and `GAME2` in `core.js` control which game occupies each slot. They default to `'bj'` and `'uth'`, and can be swapped via the dev menu. `NEXT_SCREEN` maps each game to what follows it; roulette is always last.

---

## Daily modifiers

Edit `src/modifiers.js` to change the modifier schedule. Four things live there:

**`PRESET_MODIFIERS`** — a named object for each modifier, with a `type`, `title`, `desc`, and any number of modifier keys (e.g. `bj_payout: 2.0`, `r_max_bets: 10`). Available keys are documented at the top of the file.

**`CYCLE_ORDER`** — the 24-day rotation array. Index 0 = Day 1 (May 5, 2026). A validation guard at the bottom of the file throws if any key is unrecognized.

**`DAILY_MODIFIERS`** — a `{ YYYYMMDD: 'preset_key' }` map for date-specific modifier overrides. These take priority over the cycle. Past days should be frozen here so future edits to `CYCLE_ORDER` don't alter archives.

**`DAILY_SEED_OVERRIDES`** — a `{ YYYYMMDD: YYYYMMDD }` map for swapping a day's RNG seed. Only the card draw sequence changes; the mod and save slot are unaffected. Useful for replacing a day's hands before it goes live.

---

## Design

**Fonts**
- VT323 — main UI font (body, buttons, labels, chip values)
- Tahoma — card ranks and suits

**Theme** — XP-style window chrome over a felt-green play area. Key CSS variables: `--felt`, `--gold` / `--gold-hi` / `--gold-lo`, `--cream`, `--ink`, `--shadow`, `--highlight`.

**Bevel system** — two CSS custom properties handle all raised/pressed effects:
- `--raised` — 1.5px inset bevel (action buttons, progress dots, roulette cells)
- `--raised-sm` — 1px variant (title bar buttons, chip badge, info tiles)
