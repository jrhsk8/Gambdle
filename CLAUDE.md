# Gambdle — AI Context

## What is Claude Working On
_Updated each session with active tasks and their status._

- Nothing active — last session: 4 roulette daily modifiers added (`r_double_all`, `r_hot_numbers`, `r_hot_zero`, `r_color_double`); boosted bets glow on the bet screen.

---

## System & Stack
- **App**: Single-file daily casino (Vanilla HTML/CSS/JS + `modifiers.js`). No build steps.
- **RNG**: Seeded PRNG (`YYYYMMDD`) for BJ/poker/UTH — deterministic (same hands for everyone daily). Roulette uses `Math.random()` per-player at spin time.
- **Flow**: Intro → BJ (3 hands) → G2 (3 hands) → Roulette (1 spin) → Results.
- **State**: Global `S` persists to `localStorage` (key: `gambdle_state_[seed]`).
- **Config**: `GAME2 = 'uth' | 'poker'` toggles Game 2 logic/screens. Currently `'uth'`.

## Technical Specifications
- **Chips**: Start: 1000 (`S.chips`). Busted if < 10 between hands.
- **RNG Data**: `G` object holds pre-generated data: `bjShoe`, `pokerDecks`, `uthDeck`, `rSpinOverride`. `G.rSpinOverride` is `null` in production; set to 0–36 via `CARD_SEED_OVERRIDE.rSpin` when `ENABLE_CARD_SEEDING = true`.
- **Roulette RNG**: `S.rSpin` (0–36) is generated at click time via `G.rSpinOverride ?? Math.floor(Math.random()*37)` and persisted in `S` for page-refresh consistency.
- **UTH Logic**: `S.uthAnte` is total bet (Ante+Blind 50:50). Raises use multipliers on base units.
- **Eval**: `rankPoker()` (Jacks+) vs `handScore()` (UTH weighted 1e12 scoring). `bestOf7()` returns `{cards, score, cat}` — `cards` preserves object references from `S.uthHole`/`S.uthDealer`/`S.uthComm`, enabling identity-based card highlighting via `Set`.
- **Dev Mode**: `?dev=true` in URL adds `body.dev-mode` and enables UI tools. `ENABLE_CARD_SEEDING = false` in `index.html` — set to `true` to enable `CARD_SEED_OVERRIDE` (manual BJ shoe + roulette spin override via `rSpin: null|0–36`). The block costs nothing at runtime when disabled.
- **Card Animations**: `cardHTML(c, sz, ex, dl, anim)` — `ex` is extra inline style (used for glow effects), `dl` is delay in seconds, `anim=false` skips the `adeal` class. BJ dealer reveals use `*0.75–0.85s` between cards. UTH dealer reveal uses `i*0.9+0.1s`.
- **UTH Hand Highlight**: On showdown result, `hlCards = new Set(pb.cards or db2.cards)`, `hl(c)` returns gold or red `box-shadow` style if card is in the winning 5-card hand.
- **UTH Reveal Phase**: After showdown or fold, `uthPhase='reveal'` renders dealer cards animating with no result text. Auto-transitions to `'result'` via `setTimeout(2300ms)` using `_noAnim=true`.
- **Score Tiers**: `CHIP_TIERS` array + `getTier(chips)` centralises thresholds. Tiers: 🐋 Whale (2500+), 💎 High Roller (1500+), 🎓 Apprentice (1000+), 😢 Survivor (1+), 🤡 Bozo (0). Used by both `buildShareText()` and `screenResults()`.
- **Daily Modifiers**: Defined in `modifiers.js`. `PRESET_MODIFIERS` has named rules (`double_pay`, `high_stakes`, `peek`). `DAILY_MODIFIERS[seed]` maps dates to preset keys. `getMod(key)` checks `S.forcedMod` first, then `DAILY_MODIFIERS[seed]`. Dev override: `devApplyMod()` stores to localStorage, reloads; cleared on load.
- **Peek Modifier**: When `getMod('peek')` is active and `S.peekUsed` is false, `peekBtnHTML()` renders a one-use button. `doPeek()` sets `S.peekUsed=true`, reveals dealer hole card with glow. Shows "👁 Peeked" indicator in dealer section thereafter.

## Visuals & Assets
- **Theme**: Felt green (`--felt`), Gold family (`--gold`, `--gold-leaf`), Cream (`--cream`).
- **Fonts**: Space Grotesk (UI), DM Serif Display (Numbers), JetBrains Mono (Chips).
- **Audio**: `sndCard`, `sndChip`, `sndShuffle`, `sndBigWin`, `sndSpin`.
- **Animations**: Use `_noAnim=true` before `render()` to suppress panel fade-in mid-hand.
- **Scroll**: Desktop (`min-width: 1024px`) always has `overflow-y: auto`. `overflow-x: hidden` on both.

## Surgical DOM Updates (flash prevention)
Full `render()` replaces all of `#app` innerHTML, causing a visible flash. For mid-hand updates where only a small region changes, use targeted DOM mutations instead:

- **BJ hit (normal, pv < 21)**: `insertAdjacentHTML('beforeend', cardHTML(...))` onto `#bj-player-hand` or `#bj-active-hand`; update `#bj-player-val` / `#bj-active-val` textContent. Falls back to `render()` if IDs not found.
- **BJ play panel layout**: `display:flex;flex-direction:column` on `.panel`; card area has `flex:1`; buttons+irow wrapped in `margin-top:auto` div so buttons pin to panel bottom.
- **Poker hold toggle**: update `transform` + `boxShadow` on `.card` inside `#pk-hw-{i}` (CSS transition already present); update `.hold-tag` text/color; update `.pk-hold-status` text. No render needed.
- **UTH community reveals** (not yet done): candidate for surgical update — update community card section + action buttons by ID, skip full render.

Pattern: add stable IDs to the elements that change, mutate them directly, call `saveState()` instead of `render()`. Always include a fallback to `_noAnim=true;render()` if IDs are missing.

## Known Quirks
- `GAME2` always uses screen key `'poker'` internally regardless of value.
- `curBetRef()` uses a `BET_REF` lookup object for `bj`/`roulette` screens; falls back to `GAME2` check for the shared `poker` screen.
- `rankPoker()` (Video Poker) vs `handScore()` (UTH) use different internal thresholds.
- `S.rSpin` (stored result, set at spin time) vs `rSpin()` (the UI function that triggers the spin). `G.rSpinOverride` is the dev seed value (usually `null`).
- UTH fold can only happen at the turn phase (all 5 community cards visible). Both fold and showdown go through `'reveal'` phase before `'result'`.
- BJ split hands use `S.bjSplitHands`, `S.bjSplitResults`, `S.bjSplitBets`, `S.bjSplitDone`, `S.bjSplitActive`. Split result net = sum of `S.bjSplitResults[i].delta`.
- `.panel` has no `min-width` on mobile (removed); desktop media query (`min-width:1024px`) sets `min-width:764px`.

## Key Helpers (AI reference)
- `gameDots(history, hand, phase)` — renders progress dots for any game; called directly at all call sites (no wrapper functions).
- `getTier(chips)` — returns matching entry from `CHIP_TIERS` `{min, emoji, label}`; used by results screen and share text.
- `bjDealerHTML()` — dealer section HTML for BJ play phase (handles revealed vs hidden).
- `bjActionBtns(bust, done21, can2, canSplit)` — BJ Hit/Stand/Double/Split buttons (shared by split and non-split).
- `buildShareText()` — generates full share string; used by both results preview and `doShare()`.
- `col(delta)` — returns CSS color var for win/loss/push. `sign(delta)` — formats with +/− prefix.
- `getMod(key)` — returns the active modifier object for a key, checking `S.forcedMod` before `DAILY_MODIFIERS[seed]`.
- `getDailySeed()` — returns today as YYYYMMDD integer (e.g. `20260509`). Used for RNG seed, localStorage keys, and modifier lookups.

## Supabase Leaderboard
- Project ref: `kxbteesmfozqzoxzktzv` · URL: `https://kxbteesmfozqzoxzktzv.supabase.co`
- `scores` table, RLS policies, and `get_percentile` RPC are live.
- `submitAndFetchLeaderboard()` — async, called from `render()` when `S.screen === 'results'`.
- Submits `{seed, chips}` once per day per device (localStorage guard: `gambdle_submitted_SEED`).
- Fetches percentile via RPC; updates `#lb-stat` div in results screen.
- Hides itself if fewer than 5 players exist for the day.
- Display: "Top 23% · 142 players" in gold-leaf color.

## Ideas to add
- UTH scenario seeding (via `CARD_SEED_OVERRIDE` extension).
- More `PRESET_MODIFIERS` entries and populated `DAILY_MODIFIERS` dates.

## Changelog
- **Roulette RNG**: Now per-player (`Math.random()` at spin time), stored in `S.rSpin`. Other games unchanged (still seeded PRNG). `G.rSpinOverride` enables dev seeding via `CARD_SEED_OVERRIDE.rSpin`.
- **Desktop scroll**: `overflow-y: auto` always on desktop; removed `dev-mode` scroll override (no longer needed).
- **Supabase leaderboard**: `submitAndFetchLeaderboard()` wired into results screen; `#lb-stat` placeholder in `screenResults()`; MCP configured, SQL live.
- **Double-tap zoom prevention**: `button { touch-action: manipulation; }` added globally.
- **BJ split result**: hands now stack vertically with gold top-border divider (was side-by-side with left-border).
- **UTH dealer reveal**: dedicated `'reveal'` phase before result screen; dealer cards animate at `i*0.9+0.1s`, auto-transitions after 2.3s. Result screens show dealer cards static.
- **BJ dealer reveal**: delays bumped to `*0.75–0.85s` per card across play, split, and result screens.
- **`CHIP_TIERS` + `getTier()`**: centralise score tier thresholds; tier emoji consistent between share text and results screen.
- **`gameDots()` unified**: `bjDots`/`pkDots`/`uthDots` wrappers removed; called directly at all call sites.
- **`bjHit()` unified**: split and non-split paths merged; branch points are hand reference and next-step callback only.
- **`curBetRef()` refactor**: replaced nested ternary with `BET_REF` lookup object.
