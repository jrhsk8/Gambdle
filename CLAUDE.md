# Gambdle — AI Context

## Active Work
- make the blue header xp bar rounded like in winxp
- adjust the buttons on the blue header xp bar to look more like xp
- blue header and xp toolbar look ~1-2px wider than playfield, they should align
- results screen graph and day number text should be in gold like the copy and share button below
- make window draggable like a real xp window, the square button of minimize, square, x buttons snaps window back to original spot.
        draggable window should be desktop only
- rewrite tutorial text to make pages digestible to beginners, not appear to be written by AI, and as helpful as possible without overloading information.

---

## File Structure
| File | Purpose |
|------|---------|
| `index.html` | Shell only — links CSS, JS, fonts |
| `styles.css` | All CSS |
| `modifiers.js` | Daily modifier config (separate so it's easy to edit) |
| `core.js` | State, RNG/seeding, constants, card utils, save/load, Supabase config |
| `ui.js` | UI helpers, card/chip HTML, audio, sharing, menus, preferences |
| `bj.js` | Blackjack game logic |
| `uth.js` | UTH & 5-card poker hand evaluation + game logic |
| `roulette.js` | Roulette constants, board, spin logic |
| `game.js` | App shell: screen renderers (intro, results), leaderboard, dev tools, `render()`, boot |

No build steps. Pure vanilla JS/CSS/HTML. Load order: `modifiers.js` → `core.js` → `ui.js` → `bj.js` → `uth.js` → `roulette.js` → `game.js`.

---

## System & Stack
- **Flow**: Intro → Game 1 (3 hands) → Game 2 (3 hands) → Roulette (1 spin) → Results
- **Games**: `GAME1`/`GAME2` constants in `core.js` control which game is in each slot (defaults: `'bj'`/`'uth'`). Each game has its own screen key (`'bj'`, `'uth'`, `'poker'`). `NEXT_SCREEN = { [GAME1]: GAME2, [GAME2]: 'roulette' }` drives navigation. `GAME_META` is the single source of truth for icon, name, short label, and desc per game.
- **State**: Global `S` persists to `localStorage` (`gambdle_state_YYYYMMDD`)
- **RNG**: SplitMix32 PRNG seeded by `getDailySeed()` (YYYYMMDD int) — same hands for everyone daily. Roulette uses `Math.random()` at spin time, stored in `S.rSpin`.
- **Chips**: Start 1000. Busted if `S.chips < 10` between hands.
- **Day numbering**: Day 1 = May 5, 2026. `getDayNum()` computes from `START_DATE_UTC`.

---

## Fonts & Visuals
- `--btn-f`: VT323 — **main UI font** (body, buttons, labels, values, chips, all game text)
- `--display`: Tahoma — **card ranks** (`.ct-r`)
- `--f`: Tahoma — **card suits** (`.ct-s`, `.cbody .csuit`)

**Theme**: Felt green (`--felt`), Gold (`--gold`, `--gold-hi`, `--gold-lo`), Cream (`--cream`), XP-style window chrome.

**Key CSS custom properties**:
- `--raised`: `inset 1.5px 1.5px 0 var(--highlight), inset -2px -2px 0 var(--shadow)` — used on `.act-btn`, `.hdot`, `.r2to1`, `.rout`, `.irow`, `.ptable`
- `--raised-sm`: 1px variant — used on `.tb-btn`, `.mod-badge`, `.readout`, `.share-box`, `.chip-badge`, `.game-manifest`

**Key CSS classes**:
- `.game-manifest` — merged tile container; used for intro game list and results stats block
- `.gm-sep` — 1px `var(--ink)` horizontal rule between rows inside `.game-manifest`
- `.hand-fan` — overlapping card fan (`flex-wrap:nowrap; .card+.card { margin-left:-28px }`)
- Body unlock classes (set by `applyPrefs()`): `cardback-gold`, `cardback-orange`, `cardback-whale`, `felt-maroon`, `deck-emoji`

**Audio**: `sndCard(delay_ms)`, `sndChip(d)`, `sndShuffle(cb)`, `sndBigWin()`, `sndSpin(dur)`

---

## Rendering
- `render()` replaces all of `#app` innerHTML — causes a flash if used mid-hand
- `_noAnim=true` before `render()` suppresses the panel slide-in animation
- For mid-hand changes, use **surgical DOM updates** instead of `render()`:
  - **BJ hit** (`pv < 21`): `insertAdjacentHTML` on `#bj-player-hand` / `#bj-active-hand`, update `#bj-player-val` / `#bj-active-val`. Falls back to `render()` if IDs missing.
  - **Poker hold toggle**: mutate `.card` transform/shadow and `.hold-tag` text directly via `#pk-hw-{i}`
  - **Roulette bet UI**: `patchBetUI()` updates Spin button, chip buttons, Place Bet count surgically after chip/pick changes
- Pattern: stable IDs on changing elements → mutate directly → `saveState()` (not `render()`)

---

## Key Constants & Helpers

### Constants
- `ANIM_NONE = 99` — sentinel for `S.bjAnimFrom` / `S.bjDealerAnimFrom` to suppress deal animation
- `GAME_META` — `{bj, uth, poker}` → `{icon, name, short, desc}` — single source of truth for game metadata
- `GAME1_OPTIONS` / `GAME2_OPTIONS` — options arrays for the dev game picker; each slot filters out the other slot's current selection to prevent duplicates
- `CHIP_TIERS` — `{min, emoji, label}` — Whale 2500+, High Roller 1500+, Apprentice 1000+, Survivor 1+, Bozo 0
- `R_GROUP_INFO` (`roulette.js`) — maps `r_force_group` value (e.g. `'1_12'`) to `{nums: Set, bannedIdx}` — `bannedIdx` is the R_BETS index for the redundant outside bet to lock out

### Utility functions
- `getMod(key)` → active modifier value; checks `S.forcedMod` → `DAILY_MODIFIERS[seed]` → `CYCLE_ORDER` cycle
- `gameHistory(g)` / `gameNet(g)` → game-agnostic history array / net delta, keyed by screen name (`'bj'`, `'uth'`, `'poker'`)
- `winMult()` → returns 2 if `all_in_or_skip` or `comeback` modifier active, else 1
- `gameDots(history, hand, phase, count=3)` → progress dot pills; `count=2` triggers roulette mode (Last Spin + Results dots)
- `cardHTML(c, sz, ex, dl, anim)` → card HTML; `ex`=extra inline style, `dl`=delay secs, `anim=false` skips animation
- `chipSel(maxC, curBet, denoms, extraBtn='')` → chip row + bet-row HTML; `extraBtn` inserts a button left of Clear/All In
- `hValDisplay(cs)` → "8 / 18" for soft BJ hands (ace still counted as 11), plain number otherwise
- `applyPrefs()` → applies `four_color`, `mute`, card-back, felt, and deck body classes; silently skips if unlock pref not set
- `PICKER_ITEMS` — `{deck, cardback, felt}` → `{pref, options[{val, label, lock?, hint?}]}` — drives cosmetic picker submenus

### BJ helpers
- `bjDealerHTML()` — dealer section for BJ play phase (revealed vs hidden)
- `bjActionBtns(bust, done21, can2, canSplit)` — Hit/Stand/Double/Split buttons
- `resetBJHand()` — resets to `bet` phase
- BJ peek modifier: `peekBtnHTML()` + `doPeek()` — one-use, sets `S.peekUsed=true`

### UTH helpers
- `resetUTHHand()` — resets to `bet` phase
- `bestOf7(cards)` → `{cards, score, cat}` — best 5 from 7; `cards` preserves object references for identity-based highlight matching
- `uthBlindDelta(cat, blind)` — blind payout calc (paytable + boost modifier)
- `handScore()` — weighted 1e12 scoring used for UTH hand comparison
- `rankPoker()` — Jacks-or-better threshold check used for 5-card poker payouts

### Roulette helpers
- `_resolveRoulette()` — resolves all bets, mutates `S.chips`, sets `S.rResult`, transitions to `'result'` phase
- `rFinish()` — called after wheel animation; if `r_respin` modifier and not yet re-spun, sets phase to `'respin'`; otherwise calls `_resolveRoulette()`
- `rKeepSpin()` / `rDoRespin()` — respin screen actions; `rDoRespin()` sets `S.rReSpun=true` then calls `rSpin()`

---

## Game-Specific Details

### Blackjack
- Dealer reveal: `bjRevealDealer()` auto-steps dealer cards at 800ms intervals
- Split state: `S.bjSplitHands[]`, `S.bjSplitBets[]`, `S.bjSplitResults[]`, `S.bjSplitDone[]`, `S.bjSplitActive`, `S.bjSplitDoubled[]`
- Split result display: `.hand-fan`; `nowrap` for ≤3 hands, `flex-wrap` 2-per-row for 4 hands
- `S.bjAnimFrom` / `S.bjDealerAnimFrom` — index of first new card to animate. Set to `ANIM_NONE` to suppress.

### Ultimate Texas Hold'em
- `S.uthAnte` = total bet (Ante + Blind, each is `uthAnte/2`)
- Phases: `bet` → `preflop` → `flop` → `turn` → `reveal` → `result`
- `'reveal'` animates dealer cards, auto-transitions to `'result'` after 2300ms with `_noAnim=true`
- Highlight: `hlCards = new Set(pb.cards)`, identity-based match using object references (not value equality)

### Roulette
- Phases: `bet` → `spinning` → [`respin` if `r_respin` modifier] → `result`
- `S.rReSpun` — set `true` after player uses respin; `rFinish()` resolves immediately on second call
- Default max bets: 5 (`getMod('r_max_bets') || 5`); `maxBets===1` → single-bet mode
- R_BETS: indices 0–36 = numbers, 37–39 = column 2:1, 40–42 = dozens, 43–48 = outside bets

### Results Screen
- Scores + stats in one `.game-manifest` tile; game rows at full-opacity `.gm-sep`, then `opacity:0.35` separator before stats
- **`#lb-stat` is a wrapper div** (separator + `.lb-row`), not the row itself. Leaderboard hides the whole wrapper with `display:none`; updates text via `el.querySelector('.lb-row').innerHTML`

---

## Unlockable Cosmetics
Triggered by new personal-best chip score (checked in `saveState()`). `applyPrefs()` checks the unlock pref before applying the body class — locked active selections silently fall back.

| Threshold | Unlock pref key | Active pref | Body class | Description |
|-----------|----------------|-------------|------------|-------------|
| 1500+ | `orange_back_unlocked` | `cardback=orange` | `cardback-orange` | Orange card back |
| 2500+ | `maroon_felt_unlocked` | `felt=maroon` | `felt-maroon` | Maroon table felt |
| 3500+ | `deck_emoji_unlocked` | `deck=emoji` | `deck-emoji` | Emoji deck |
| 5000+ | `whale_back_unlocked` | `cardback=whale` | `cardback-whale` | Whale card back |
| 10000+ | `golden_back_unlocked` | `cardback=gold` | `cardback-gold` | Golden card back |

**Emoji deck** — CSS-only: `visibility:hidden` on suit/rank elements, `::after` shows emoji. Suits: spades=💧, hearts=🔥, diamonds=💨, clubs=🌱. Ranks: A=🅰️, 2–9=keycap emojis, 10=🔟, J=🤡, Q=👸, K=🤴. Toggling `body.deck-emoji` updates all cards without `render()`.

---

## Daily Modifiers (`modifiers.js`)
- `PRESET_MODIFIERS` — named modifier objects `{type, title, desc, ...modifier keys}`
- `CYCLE_ORDER` — 22-day rotation, strictly alternates roulette / non-roulette; Day 1 = May 5, 2026
- `DAILY_MODIFIERS` — date-specific overrides (YYYYMMDD keys); take priority over cycle
- Validation guard at file bottom throws on unknown `CYCLE_ORDER` keys
- `r_force_group` — forces spin to land in a number group; banned outside-bet index locked on board
- `r_respin: true` — after spin, shows respin screen with Keep / Re-spin buttons; player gets one free re-spin
- Dev override: `devApplyMod(k)` sets `S.forcedMod` directly and re-renders; `gambdle_forced_mod` localStorage key is also checked on `loadState()` (for cross-reload) and cleared

---

## Dev Mode
- `?dev=true` in URL → `body.dev-mode` + dev UI tools; **also blocks leaderboard score submission**
- Dev menu game picker: each slot shows all games except the one currently selected in the other slot
- `ENABLE_CARD_SEEDING = false` in `core.js` → set `true` to activate `CARD_SEED_OVERRIDE` (manual BJ shoe, UTH hands, roulette spin)
- **Test Seed** — dev checkbox; uses `TEST_CARD_OVERRIDE` in `core.js`. State key becomes `gambdle_test_state`. Reset required to apply.
- `devToggleUnlocks()` — toggles all unlock prefs; clears active cosmetic pref if it becomes locked

---

## Supabase Leaderboard
- Project: `kxbteesmfozqzoxzktzv` · `https://kxbteesmfozqzoxzktzv.supabase.co`
- `scores` table + `get_percentile` RPC
- `submitAndFetchLeaderboard()` — called on results screen; submits `{seed, chips}` once per day per device (guard: `gambdle_submitted_SEED` in localStorage); skipped in dev mode

---

## Known Quirks
- `S.rSpin` (stored result int, `null` until first spin) vs `rSpin()` (function that triggers the spin) — different things
- UTH fold only available at turn phase; both fold and showdown transition through `'reveal'` before `'result'`
