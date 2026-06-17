# Gambdle

A daily casino game where everyone plays the same seeded hands. Start with 1,000 chips, grind through blackjack, Ultimate Hold'em, and roulette, and see where you land on the leaderboard.

**[gambdle.net](https://gambdle.net)**

---

## How it works

1. **Blackjack:** 3 hands
2. **Ultimate Texas Hold'em:** 3 hands
3. **Roulette:** One spin

Your final chip count is your score. A new game resets every day at midnight Arizona time (MST, UTC-7, no DST). Everyone plays the same seeded hands on the same day, so results are directly comparable.

## Daily modifiers

Every day has a **modifier,** a rule twist that applies to the whole run. Examples: blackjacks pay 3:1, the dealer stands on 15, blind payouts are doubled, or a free bonus round of The Ladder after roulette. The mod rotates on a fixed cycle (`CYCLE_ORDER`, currently 27 days), with date-specific overrides available in `src/modifiers.js`.

The current modifier is shown before you start and applies to all three games (some mods are game-specific, some are cross-game).

## Leaderboard & sharing

Scores are submitted to a global leaderboard automatically when you finish. The results screen shows your percentile rank and total player count for that day. After you finish, you can copy a spoiler-free share card to post your result.

Submission happens once per day per device and is skipped in dev mode and with the test seed active.

## Cosmetic unlocks

Unlocks trigger automatically when you set a new personal best chip count:

| Score threshold | Unlock |
|----------------|--------|
| 1,500+ | Orange card back |
| 2,000+ | Green table theme |
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
modifiers.js → core.js → gametext.js → audio.js → ui.js → windows.js → menus.js
→ dev.js → screens.js → flow.js → bj.js → uth.js → poker.js → roulette.js → ladder.js → game.js
```

## File structure

| File | Purpose |
|------|---------|
| `index.html` | Shell — links CSS, JS, fonts |
| `styles.css` | All styles |
| `src/modifiers.js` | Daily modifier definitions, schedule, and seed overrides |
| `src/core.js` | State, RNG/seeding, constants, card utilities, save/load |
| `src/gametext.js` | All editable player-facing copy: tutorial tips, Help/About, What's New, status hints, share text |
| `src/audio.js` | Sound playback (defensive helpers, effects, Web Audio spin synth) |
| `src/ui.js` | Shared HTML helpers, chip selector + bet UI, share box, toast |
| `src/windows.js` | XP window chrome: dragging, floating window manager, notification balloon + tutorial runtime |
| `src/menus.js` | Menu bar dropdowns + submenus, archive picker, preferences, feedback dialog |
| `src/bj.js` | Blackjack logic and screen rendering |
| `src/uth.js` | Ultimate Texas Hold'em logic and screen rendering (also owns the shared `rankPoker` evaluator) |
| `src/poker.js` | 5 Card Poker (partially built) logic and screen rendering |
| `src/roulette.js` | Roulette board, wheel animation, bet resolution |
| `src/ladder.js` | The Ladder (hi-lo streak-climb game; also the `ladder_day` free bonus round) |
| `src/dev.js` | Dev menu actions, Dev Stats screen, layout-debug overlay |
| `src/screens.js` | Intro/borrow/choice/results screens, leaderboard submit/fetch, score charts |
| `src/flow.js` | `render()`, status bar, navigation, shared hand-flow helpers |
| `src/game.js` | Boot: state restore, first render, refresh-resume |
| `supabase/functions/` | Edge Functions: `spin` (server-drawn roulette randomness), `submit-score` (sole leaderboard writer), shared helpers in `_shared/` |
| `supabase/*.sql` | `integrity.sql` (schema + write lockdown), `dev_stats.sql` (dev-stats RPCs) |
| `tests/` | Playwright harness: unit suites, responsive layout, WebKit/iOS layout, screenshots |
| `assets/og-image.png` | Social preview image (1200×630) |
| `assets/og-image.html` | Source template for regenerating the OG image |

---

## Architecture

### State

All game state lives in a single global object `S`, persisted to `localStorage` under the key `gambdle_state_YYYYMMDD`. The key changes daily, so each day starts fresh automatically. Private browsing falls back to `sessionStorage`.

### Daily seed & RNG

`getDailySeed()` returns today's date as a `YYYYMMDD` integer in Phoenix time. This integer seeds a SplitMix32 PRNG used to shuffle cards, so every player gets the same deal on the same day.

`getRngSeed()` wraps `getDailySeed()` and checks `DAILY_SEED_OVERRIDES` (in `modifiers.js`) before returning, allowing a specific date's card draws to be swapped out without changing its modifier or save slot.

Roulette is the exception: the winning pocket isn't part of the daily seed. The randomness is server-drawn — the `spin` Edge Function returns 4 crypto-random words, stored per device-day so a refresh re-fetches the same words and nobody can re-roll — and the client maps them to the pocket(s) through the pure `spinFromRandom(words)` in `roulette.js` (which also applies the day's distribution modifiers). Dev/test/archive runs draw locally; a server failure also falls back locally and flags the run. The result is stored in `S.rSpin` so it survives a refresh mid-spin.

Day 1 is May 5, 2026. `getDayNum()` derives the current day number from that anchor.

### Rendering

`render()` replaces the entire `#app` innerHTML and re-runs the current screen function. It's fine for screen transitions but causes a visible flash if called mid-hand.

For mid-hand updates, the code uses **surgical DOM mutations:** inserting a card element directly, updating a value span in place, etc. The pattern is: give changing elements stable IDs, mutate them directly, call `saveState()`. This is how BJ hits, poker hold-toggles, and roulette bet changes work.

`_noAnim = true` before a `render()` call skips the panel slide-in animation, used when transitioning between phases within the same hand.

### Game slots

`GAME1` and `GAME2` in `core.js` control which game occupies each slot. They default to `'bj'` and `'uth'`, and can be swapped via the dev menu. `NEXT_SCREEN` maps each game to what follows it; roulette is always last.

---

## Daily modifiers

Edit `src/modifiers.js` to change the modifier schedule. Four things live there:

**`PRESET_MODIFIERS`** — a named object for each modifier, with a `type`, `title`, `desc`, and any number of modifier keys (e.g. `bj_payout: 2.0`, `r_max_bets: 10`). Available keys are documented at the top of the file.

**`CYCLE_ORDER`:** The rotating daily schedule — an array of preset keys cycled by day number (index 0 = Day 1, May 5 2026; currently 27 entries).

**`DAILY_MODIFIERS`:** A `{ YYYYMMDD: 'preset_key' }` map for date-specific modifier overrides. These take priority over the cycle. Past days should be frozen here so future edits to `CYCLE_ORDER` don't alter archives.

**`DAILY_SEED_OVERRIDES`:**  A `{ YYYYMMDD: YYYYMMDD }` map for swapping a day's RNG seed. Only the card draw sequence changes; the mod and save slot are unaffected. Useful for replacing a day's hands before it goes live.

---

## Design

**Fonts**
- VT323: Main UI font (body, buttons, labels, chip values)
- Tahoma: Card ranks and suits

**Theme:**  XP-style window chrome over a felt-green play area. Key CSS variables: `--felt`, `--gold` / `--gold-hi` / `--gold-lo`, `--cream`, `--ink`, `--shadow`, `--highlight`.

**Bevel system:** Two CSS custom properties handle all raised/pressed effects:
- `--raised`:  1.5px inset bevel (action buttons, progress dots, roulette cells)
- `--raised-sm`: 1px variant (title bar buttons, chip badge, info tiles)
