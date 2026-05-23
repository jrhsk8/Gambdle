# Gambdle — AI Context

## Active Work
_Update this section at the start of each session._

- Nothing active.

---

## File Structure
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 17 | Shell only — links CSS, JS, fonts |
| `styles.css` | ~637 | All CSS |
| `game.js` | ~2149 | All game logic and rendering |
| `modifiers.js` | ~88 | Daily modifier config (separate so it's easy to edit) |

No build steps. Pure vanilla JS/CSS/HTML.

---

## System & Stack
- **Flow**: Intro → BJ (3 hands) → UTH (3 hands) → Roulette (1 spin) → Results
- **State**: Global `S` persists to `localStorage` (`gambdle_state_YYYYMMDD`)
- **RNG**: SplitMix32 PRNG seeded by `getDailySeed()` (YYYYMMDD int) for BJ/UTH/Poker — same hands for everyone daily. Roulette uses `Math.random()` at spin time, stored in `S.rSpin`.
- **Config**: `GAME2 = 'uth'` in `game.js` toggles Game 2 (`'uth'` | `'poker'`). Screen key is always `'poker'` internally.
- **Chips**: Start 1000. Busted if `S.chips < 10` between hands.
- **Day numbering**: Day 1 = May 5, 2026. `getDayNum()` computes from `START_DATE_UTC`.

---

## Fonts & Visuals
- `--btn-f`: VT323 — **main UI font** (body, buttons, labels, values, chips, hand counts, all game text)
- `--display`: Space Grotesk — **decorative only** (`.logo`, `.ct-r` card ranks, `.card.back::before` G)
- `--f`: Courier New — **card suits only** (`.ct-s`, `.cbody .csuit`)

**Theme**: Felt green (`--felt`), Gold (`--gold`, `--gold-hi`, `--gold-lo`), Cream (`--cream`), XP-style window chrome.

**Key CSS custom properties** (in `:root` in `styles.css`):
- `--raised`: the repeating `inset 1.5px 1.5px 0 var(--highlight), inset -2px -2px 0 var(--shadow)` box-shadow — used on `.act-btn`, `.hdot`, `.r2to1`, `.rout`, `.irow`, `.rnd-row`, `.ptable`, `.score-row`
- `--raised-sm`: the 1px variant — used on `.tb-btn`, `.tb-icon`, `.mod-badge`, `.readout`, `.share-box`

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

### Constants (`game.js`)
- `ANIM_NONE = 99` — sentinel assigned to `S.bjAnimFrom` / `S.bjDealerAnimFrom` to suppress animation on a hand
- `START_DATE_UTC` — May 5, 2026 UTC, used for day numbering
- `GAME2 = 'uth'` — selects Game 2 variant
- `CHIP_TIERS` — array of `{min, emoji, label}` — Whale 2500+, High Roller 1500+, Apprentice 1000+, Survivor 1+, Bozo 0

### Utility functions
- `getDailySeed()` → YYYYMMDD int (RNG seed, localStorage key, modifier lookup)
- `getDayNum()` → day count since May 5, 2026
- `getMod(key)` → active modifier value; checks `S.forcedMod` → `DAILY_MODIFIERS[seed]` → `CYCLE_ORDER` cycle
- `col(n)` → hardcoded hex: `#9be07a` (win), `#e03535` (loss), `#cabd9a` (push)
- `sign(n)` → formats with +/− prefix
- `fmt(n)` → `toLocaleString()`
- `getTier(chips)` → `{min, emoji, label}` from `CHIP_TIERS`
- `gameDots(history, hand, phase)` → progress dot pills; called directly everywhere (no per-game wrappers)
- `cardHTML(c, sz, ex, dl, anim)` → card HTML; `ex`=extra inline style, `dl`=delay secs, `anim=false` skips deal animation
- `hValDisplay(cs)` → shows "8 / 18" for soft BJ hands; used in play and surgical DOM updates
- `buildShareText()` → share string (no emoji circles — they were removed)
- `chipSel(maxC, curBet, denoms, extraBtn='')` → chip row + bet-row HTML; `extraBtn` inserts a button left of Clear/All In (used by roulette multi-bet for Place Bet)

### BJ helpers
- `bjDealerHTML()` — dealer section for BJ play phase (revealed vs hidden)
- `bjActionBtns(bust, done21, can2, canSplit)` — Hit/Stand/Double/Split buttons (shared by split and non-split paths)
- `resetBJHand()` — resets all BJ hand state to `bet` phase; called by `bjSkip()` and `bjNext()`
- `winMult()` — returns 2 if `all_in_or_skip` or `comeback` modifier active, else 1

### UTH helpers
- `resetUTHHand()` — resets all UTH hand state to `bet` phase; called by `uthSkip()` and `uthNext()`
- `bestOf7(cards)` → `{cards, score, cat}` — best 5 from 7; `cards` preserves object references for identity-based highlighting
- `uthBlindDelta(cat, blind)` — blind payout calc (paytable + boost modifier)

---

## Game-Specific Details

### Blackjack
- BJ dealer reveal: `bjRevealDealer()` → `uthPhase='reveal'` equivalent; auto-steps dealer cards at 800ms intervals
- Split state: `S.bjSplitHands[]`, `S.bjSplitBets[]`, `S.bjSplitResults[]`, `S.bjSplitDone[]`, `S.bjSplitActive`, `S.bjSplitDoubled[]`
- `S.bjAnimFrom` / `S.bjDealerAnimFrom` track which cards are new (animate). Set to `ANIM_NONE` to suppress.
- BJ peek modifier: `peekBtnHTML()` + `doPeek()` — one-use, sets `S.peekUsed=true`

### Ultimate Texas Hold'em
- `S.uthAnte` = total bet (Ante + Blind, split 50:50 as `uthAnte/2` each)
- Phases: `bet` → `preflop` → `flop` → `turn` → `reveal` → `result`
- `'reveal'` phase animates dealer cards, auto-transitions to `'result'` after 2300ms with `_noAnim=true`
- Hand eval: `handScore()` (weighted 1e12 scoring) vs `rankPoker()` (Jacks+ threshold for video poker)
- Highlight: `hlCards = new Set(pb.cards)`, identity-based card match using object references

### Roulette
- Default max bets: 5 (`getMod('r_max_bets') || 5`)
- `if(maxBets===1)` → single-bet mode (pick + stake + spin directly)
- Multi-bet mode: `rAddBet()` deducts chips and pushes to `S.rBets[]`; `rRemoveBet(i)` refunds; `rAllIn()` all-in on current pick
- `rSpin()` auto-adds single pending bet in default single-bet mode for backward compat
- `rFinish()` processes all bets → `S.rResult.bets[]` array of `{pick, bet, won, delta, pay}`
- R_BETS: indices 0–36 = numbers, 37–39 = column 2:1, 40–42 = dozens, 43–48 = outside bets
- `evalBet(idx, result)` → win/loss for a bet given the spin result
- Board: no selection chip preview (removed); placed bets show gold chip with amount

### Results Screen
- Big chip count: 6rem VT323, gold
- Score rows show net delta per game (no emoji circles)
- Share text: no emoji circles, just `(+N)` / `(-N)` per game
- Leaderboard (`#lb-stat`): dark ink color; shows "Top X% · N players" or "Bottom X% · N players"
- Status bar shows "Game complete · new game at midnight daily." on results screen
- Chart: past 7 days performance bars

---

## Daily Modifiers (`modifiers.js`)
- `PRESET_MODIFIERS` — named modifier objects
- `CYCLE_ORDER` — rotation list; Day 1 = May 5, 2026; repeats every N days
- `DAILY_MODIFIERS` — date-specific overrides (YYYYMMDD keys)
- Validation guard at file bottom: throws if `CYCLE_ORDER` contains an unknown key
- Dev override: `devApplyMod()` stores to localStorage, reloads; cleared on next load

---

## Dev Mode
- `?dev=true` in URL → `body.dev-mode` + dev UI tools
- `ENABLE_CARD_SEEDING = false` in `game.js` → set `true` to activate `CARD_SEED_OVERRIDE` (manual BJ shoe, UTH hands at `h*9` offset, roulette spin `rSpin: null|0–36`)
- `G.rSpinOverride` is the dev seed value (null in production)

---

## Supabase Leaderboard
- Project: `kxbteesmfozqzoxzktzv` · `https://kxbteesmfozqzoxzktzv.supabase.co`
- `scores` table + `get_percentile` RPC
- `submitAndFetchLeaderboard()` — called from `render()` on results screen; submits `{seed, chips}` once per day per device (guard: `gambdle_submitted_SEED` in localStorage); hides if < 5 players

---

## Known Quirks
- `GAME2` always uses screen key `'poker'` internally regardless of value
- `curBetRef()` uses `BET_REF` lookup object for `bj`/`roulette`; falls back to `GAME2` check for `poker` screen
- `S.rSpin` (stored result) vs `rSpin()` (UI function that triggers spin) — different things
- UTH fold only available at turn phase; both fold and showdown go through `'reveal'` before `'result'`
- The `.panel` flex layout: card area has `flex:1`; action buttons + irow wrapped in `margin-top:auto` div to pin to bottom

---

## Ideas
- hand 1 hand 2 etc gives away uth result before result is actually revealed
- **WinXP-style dropdown menu** from 'File' and 'Help' menu bar items — break tutorial into sections there
- **Incognito replay detection** — not reliably possible via JS alone; would need server-side RPC check at boot
