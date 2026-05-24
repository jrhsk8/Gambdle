# Gambdle — AI Context

## Active Work
_Update this section at the start of each session._

- Nothing active.

---

## Changelog
- **Refactored into modules**: `game.js` (~2572 lines) split into `core.js`, `ui.js`, `bj.js`, `uth.js`, `roulette.js`, and a slimmed `game.js` (app shell + screen renderers only). Load order: `modifiers.js` → `core.js` → `ui.js` → `bj.js` → `uth.js` → `roulette.js` → `game.js`.
- **Second Chance modifier** (`r_respin`): after wheel stops, player chooses Keep or Re-spin once. New roulette phase `'respin'`; `_resolveRoulette()` extracted from `rFinish()`; state key `S.rReSpun`.
- **Merged intro/results tiles**: 3 separate game-row boxes on intro → single `.game-manifest` tile with `.gm-sep` dividers. Results: 5 separate score/stat boxes → one `.game-manifest` tile with dimmed separator between scores and stats.
- **Unlockable cosmetics expanded**: Maroon felt (2500+ PB), Emoji deck (3500+ PB). Card back thresholds updated: Orange 1500+, Whale 5000+, Golden 10000+. Deck ► and Felt ► submenus added under File > Preferences.
- **22-day cycle**: Strictly alternates roulette / non-roulette every day. Non-roulette slots rotate BJ → UTH → Cross.
- **Split result layout**: Cards use `.hand-fan` overlapping fan. Results: `nowrap` for ≤3 hands, `flex-wrap` 2-per-row for 4 hands.
- **Submenu positioning**: `_positionSubmenu()` always flies out to the right of trigger, flips left only if near screen edge.

---

## File Structure
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 22 | Shell only — links CSS, JS, fonts |
| `styles.css` | ~814 | All CSS |
| `modifiers.js` | 102 | Daily modifier config (separate so it's easy to edit) |
| `core.js` | ~231 | State, RNG/seeding, constants, card utils, save/load, Supabase config |
| `ui.js` | ~471 | UI helpers, card/chip HTML, audio, sharing, menus, preferences |
| `bj.js` | ~454 | Blackjack game logic |
| `uth.js` | ~625 | UTH & poker hand evaluation + game logic |
| `roulette.js` | ~501 | Roulette constants, board, spin logic |
| `game.js` | ~265 | App shell: screen renderers (intro, results), leaderboard, dev tools, `render()`, boot |

No build steps. Pure vanilla JS/CSS/HTML. Load order in `index.html`: `modifiers.js` → `core.js` → `ui.js` → `bj.js` → `uth.js` → `roulette.js` → `game.js`.

---

## System & Stack
- **Flow**: Intro → BJ (3 hands) → UTH (3 hands) → Roulette (1 spin) → Results
- **State**: Global `S` persists to `localStorage` (`gambdle_state_YYYYMMDD`)
- **RNG**: SplitMix32 PRNG seeded by `getDailySeed()` (YYYYMMDD int) for BJ/UTH — same hands for everyone daily. Roulette uses `Math.random()` at spin time, stored in `S.rSpin`.
- **Config**: `GAME2 = 'uth'` in `core.js` toggles Game 2 (`'uth'` | `'poker'`). Screen key is always `'poker'` internally.
- **Chips**: Start 1000. Busted if `S.chips < 10` between hands.
- **Day numbering**: Day 1 = May 5, 2026. `getDayNum()` computes from `START_DATE_UTC`.

---

## Fonts & Visuals
- `--btn-f`: VT323 — **main UI font** (body, buttons, labels, values, chips, hand counts, all game text)
- `--display`: Space Grotesk — **decorative only** (`.logo`, `.ct-r` card ranks)
- `--f`: Courier New — **card suits only** (`.ct-s`, `.cbody .csuit`)

**Theme**: Felt green (`--felt`), Gold (`--gold`, `--gold-hi`, `--gold-lo`), Cream (`--cream`), XP-style window chrome.

**Key CSS custom properties** (in `:root`):
- `--raised`: `inset 1.5px 1.5px 0 var(--highlight), inset -2px -2px 0 var(--shadow)` — used on `.act-btn`, `.hdot`, `.r2to1`, `.rout`, `.irow`, `.ptable`
- `--raised-sm`: 1px variant — used on `.tb-btn`, `.tb-icon`, `.mod-badge`, `.readout`, `.share-box`, `.chip-badge`, `.game-manifest`

**Key CSS classes**:
- `.game-manifest` — merged tile container (border + `--raised-sm` + panel bg); used for intro game list and results stats block
- `.gm-row` — inner row inside `.game-manifest` (grid `32px 1fr`, padding `8px 12px`); mobile: `22px 1fr`, `6px 10px`
- `.gm-sep` — 1px `var(--ink)` horizontal rule between `.gm-row` items
- `.hand-fan` — overlapping card fan (`flex-wrap:nowrap; .card+.card { margin-left:-28px }`)
- `.chip-badge` — chip counter in menu bar right
- `.card.back::before` — uses `--btn-f` (VT323); sizes 3.2/2.7/2.1rem for lg/md/sm
- Body unlock classes (set by `applyPrefs()`): `cardback-gold`, `cardback-orange`, `cardback-whale`, `felt-maroon`, `deck-emoji`

**Audio**: `sndCard(delay_ms)`, `sndChip()`, `sndShuffle(cb)`, `sndBigWin()`, `sndSpin()`

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
- `ANIM_NONE = 99` (`core.js`) — sentinel for `S.bjAnimFrom` / `S.bjDealerAnimFrom` to suppress deal animation
- `START_DATE_UTC` (`core.js`) — May 5, 2026 UTC, used for day numbering
- `GAME2 = 'uth'` (`core.js`) — selects Game 2 variant
- `CHIP_TIERS` (`core.js`) — `{min, emoji, label}` — Whale 2500+, High Roller 1500+, Apprentice 1000+, Survivor 1+, Bozo 0
- `R_GROUP_INFO` (`roulette.js`) — maps `r_force_group` value (e.g. `'1_12'`) to `{nums: Set, bannedIdx}` — `bannedIdx` is the R_BETS index for the redundant outside bet to lock out

### Utility functions
- `getDailySeed()` → YYYYMMDD int (RNG seed, localStorage key, modifier lookup)
- `getDayNum()` → day count since May 5, 2026
- `getMod(key)` → active modifier value; checks `S.forcedMod` → `DAILY_MODIFIERS[seed]` → `CYCLE_ORDER` cycle
- `col(n)` → `#1fa845` (win), `#e03535` (loss), `#cabd9a` (push)
- `sign(n)` → +/− prefix; `fmt(n)` → `toLocaleString()`
- `getTier(chips)` → `{min, emoji, label}` from `CHIP_TIERS`
- `gameDots(history, hand, phase)` → progress dot pills; called directly everywhere
- `cardHTML(c, sz, ex, dl, anim)` → card HTML; `ex`=extra inline style, `dl`=delay secs, `anim=false` skips animation
- `hValDisplay(cs)` → "8 / 18" for soft BJ hands
- `buildShareText()` → share string (`(+N)` / `(-N)` format, no emoji circles)
- `chipSel(maxC, curBet, denoms, extraBtn='')` → chip row + bet-row HTML; `extraBtn` inserts a button left of Clear/All In
- `toast(msg)` → 2200ms in-game notification
- `getPref(k)` / `setPref(k, v)` / `getPrefs()` → persistent prefs in `gambdle_prefs` localStorage key
- `applyPrefs()` → applies `four_color`, `mute`, card-back, felt, and deck body classes; silently skips if unlock pref not set
- `toggleMenu(which, trigger)` → WinXP-style dropdown for `'file'`, `'help'`, `'dev'`
- `showPrefsSubmenu(trigger)` → Preferences submenu: Four Color, Mute, Deck ►, Card Back ►, Felt ►
- `_showPickerSub(pickerKey, trigger)` → generic picker submenu driven by `PICKER_ITEMS` config (`'deck'` / `'cardback'` / `'felt'`); locked options shown as disabled with hint
- `setPick(pickerKey, val)` → sets pref, applies, refreshes the picker submenu in-place
- `PICKER_ITEMS` — config object mapping picker key → `{pref, options[]}` with optional `lock` (unlock pref key) and `hint` (lock label)
- `_positionSubmenu(sub, trigger)` — appends sub to body, positions right of trigger, flips left if overflows
- `togglePref(k)` → closes `.dd-sub2` first, then toggles pref and re-applies

### BJ helpers
- `bjDealerHTML()` — dealer section for BJ play phase (revealed vs hidden)
- `bjActionBtns(bust, done21, can2, canSplit)` — Hit/Stand/Double/Split buttons
- `resetBJHand()` — resets to `bet` phase; called by `bjSkip()` and `bjNext()`
- `winMult()` — returns 2 if `all_in_or_skip` or `comeback` modifier active, else 1

### UTH helpers
- `resetUTHHand()` — resets to `bet` phase
- `bestOf7(cards)` → `{cards, score, cat}` — best 5 from 7; `cards` preserves object references for identity-based highlighting
- `uthBlindDelta(cat, blind)` — blind payout calc (paytable + boost modifier)

### Roulette helpers
- `_resolveRoulette()` — resolves all bets, mutates `S.chips`, sets `S.rResult`, transitions to `'result'` phase
- `rFinish()` — called after wheel animation; if `getMod('r_respin') && !S.rReSpun`, sets phase to `'respin'` and renders; otherwise calls `_resolveRoulette()`
- `rKeepSpin()` — calls `_resolveRoulette()` directly (bypasses respin check)
- `rDoRespin()` — sets `S.rReSpun=true`, calls `rSpin()` (second `rFinish()` call goes straight to resolve)

---

## Game-Specific Details

### Blackjack
- Dealer reveal: `bjRevealDealer()` auto-steps dealer cards at 800ms intervals
- Split state: `S.bjSplitHands[]`, `S.bjSplitBets[]`, `S.bjSplitResults[]`, `S.bjSplitDone[]`, `S.bjSplitActive`, `S.bjSplitDoubled[]`
- Split result display: cards use `.hand-fan`; layout `nowrap` for ≤3 hands, `flex-wrap` 2-per-row for 4 hands
- `S.bjAnimFrom` / `S.bjDealerAnimFrom` — which card index is the first new one. Set to `ANIM_NONE` to suppress.
- BJ peek modifier: `peekBtnHTML()` + `doPeek()` — one-use, sets `S.peekUsed=true`

### Ultimate Texas Hold'em
- `S.uthAnte` = total bet (Ante + Blind, split 50:50 as `uthAnte/2` each)
- Phases: `bet` → `preflop` → `flop` → `turn` → `reveal` → `result`
- `'reveal'` animates dealer cards, auto-transitions to `'result'` after 2300ms with `_noAnim=true`
- Hand eval: `handScore()` (weighted 1e12 scoring) vs `rankPoker()` (Jacks+ threshold for video poker)
- Highlight: `hlCards = new Set(pb.cards)`, identity-based card match using object references

### Roulette
- Phases: `bet` → `spinning` → [`respin` if `r_respin` modifier] → `result`
- `S.rReSpun` — `false` initially; set `true` after player uses their re-spin so `rFinish()` resolves on second call
- Default max bets: 5 (`getMod('r_max_bets') || 5`); `maxBets===1` → single-bet mode
- Multi-bet: `rAddBet()` deducts chips and pushes to `S.rBets[]`; `rRemoveBet(i)` refunds; `rAllIn()` all-in on current pick
- R_BETS: indices 0–36 = numbers, 37–39 = column 2:1, 40–42 = dozens, 43–48 = outside bets
- `evalBet(idx, result)` → win/loss for a bet given the spin result

### Results Screen
- Big chip count: 5rem VT323, gold
- Scores + stats in a single `.game-manifest` tile: BJ / UTH / Roulette rows separated by full-opacity `.gm-sep`, then `opacity:0.35` separator, then All-time high row, then `#lb-stat`
- **`#lb-stat` is a wrapper div**, not the row itself. Contains `.gm-sep` + `.lb-row`. Leaderboard hides the whole wrapper with `display:none`; updates text via `el.querySelector('.lb-row').innerHTML`
- Leaderboard: hidden when `total < 1`; "Rank N of N players" when `total < 5`; "Top/Bottom X%" otherwise
- Chart: past 7 days performance bars; value label above bar, day number below

---

## Unlockable Cosmetics
Triggered by new personal-best chip score (checked in `saveState()`). Stored as prefs. `applyPrefs()` checks the unlock pref before applying the body class — locked active selections silently fall back.

| Threshold | Unlock pref key | Active pref | Body class | Description |
|-----------|----------------|-------------|------------|-------------|
| 1500+ | `orange_back_unlocked` | `cardback=orange` | `cardback-orange` | Orange card back |
| 2500+ | `maroon_felt_unlocked` | `felt=maroon` | `felt-maroon` | Maroon table felt |
| 3500+ | `deck_emoji_unlocked` | `deck=emoji` | `deck-emoji` | Emoji deck |
| 5000+ | `whale_back_unlocked` | `cardback=whale` | `cardback-whale` | Whale card back |
| 10000+ | `golden_back_unlocked` | `cardback=gold` | `cardback-gold` | Golden card back |

**Emoji deck** — CSS-only: `visibility:hidden` on `.ct-s`/`.csuit`/`.ct-r[data-r]`, `::after` shows emoji. Suits: spades=💧, hearts=🔥, diamonds=💨, clubs=🌱. Ranks: A=🅰️, 2–9=keycap emojis, 10=🔟, J=🤡, Q=👸, K=🤴. Toggling `body.deck-emoji` updates all cards instantly without `render()`.

---

## Daily Modifiers (`modifiers.js`)
- `PRESET_MODIFIERS` — named modifier objects `{type, title, desc, ...modifier keys}`
- `CYCLE_ORDER` — 22-day rotation, strictly alternates roulette / non-roulette; Day 1 = May 5, 2026
- `DAILY_MODIFIERS` — date-specific overrides (YYYYMMDD keys); take priority over cycle
- Validation guard at file bottom throws on unknown `CYCLE_ORDER` keys
- Dev override: `devApplyMod(k)` sets `S.forcedMod` directly and re-renders; `gambdle_forced_mod` localStorage key is also checked on `loadState()` (for cross-reload scenarios) and cleared
- `r_force_group` — forces spin to land in a number group; banned outside-bet index locked on board
- `r_respin: true` — after spin, shows respin screen with Keep / Re-spin buttons; player gets one free re-spin

---

## Dev Mode
- `?dev=true` in URL → `body.dev-mode` + dev UI tools; **also blocks leaderboard score submission**
- `ENABLE_CARD_SEEDING = false` in `core.js` → set `true` to activate `CARD_SEED_OVERRIDE` (manual BJ shoe, UTH hands, roulette spin override)
- **Test Seed** — dev checkbox; sets `gambdle_use_test_seed` in localStorage; uses `TEST_CARD_OVERRIDE` in `core.js` with hardcoded hands/spin. Reset required to apply. State key becomes `gambdle_test_state`.
- `devApplyMod(k)` — sets `S.forcedMod`, saves state, re-renders (no page reload)
- `devToggleUnlocks()` — toggles all unlock prefs (orange back, maroon felt, emoji deck, whale back, golden back); clears active cosmetic pref if it becomes locked

---

## Supabase Leaderboard
- Project: `kxbteesmfozqzoxzktzv` · `https://kxbteesmfozqzoxzktzv.supabase.co`
- `scores` table + `get_percentile` RPC
- `submitAndFetchLeaderboard()` — called from `render()` on results screen; submits `{seed, chips}` once per day per device (guard: `gambdle_submitted_SEED` in localStorage); skipped entirely in dev mode

---

## Known Quirks
- `GAME2` always uses screen key `'poker'` internally regardless of value
- `curBetRef()` uses `BET_REF` lookup for `bj`/`roulette`; falls back to `GAME2` check for `poker` screen
- `S.rSpin` (stored result int, `null` until first spin) vs `rSpin()` (function that triggers the spin) — different things
- UTH fold only available at turn phase; both fold and showdown go through `'reveal'` before `'result'`
- `.panel` flex layout: card area has `flex:1`; action buttons + irow pinned to bottom via `margin-top:auto`
- `#lb-stat` is a **wrapper div** (separator + row), not the row itself — don't target it expecting a flex label/value row

---

## Ideas
- **Incognito replay detection** — not reliably possible via JS alone; would need server-side RPC check at boot
