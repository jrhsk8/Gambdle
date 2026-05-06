# Gambdle — AI Context

## System & Stack
- **App**: Single-file daily casino (Vanilla HTML/CSS/JS). No build steps.
- **RNG**: Seeded PRNG (`YYYYMMDD`) for deterministic daily runs.
- **Flow**: Intro → BJ (3 hands) → G2 (3 hands) → Roulette (1 spin) → Results.
- **State**: Global `S` persists to `localStorage` (key: `gambdle_state_[seed]`).
- **Config**: `GAME2 = 'uth' | 'poker'` toggles Game 2 logic/screens.

## Technical Specifications
- **Chips**: Start: 1000 (`S.chips`). Busted if < 10 between hands.
- **RNG Data**: `G` object holds pre-generated runs: `bjShoe`, `pokerDecks`, `uthDeck`, `rSpin`.
- **UTH Logic**: `S.uthAnte` is total bet (Ante+Blind 50:50). Raises use multipliers on base units.
- **Eval**: `rankPoker()` (Jacks+) vs `handScore()` (UTH weighted 1e12 scoring). `bestOf7()` returns `{cards, score, cat}` — `cards` preserves object references from `S.uthHole`/`S.uthDealer`/`S.uthComm`, enabling identity-based card highlighting via `Set`.
- **Dev Mode**: `?dev=true` in URL enables UI tools and re-enables vertical scroll (`body.dev-mode`). `ENABLE_CARD_SEEDING` for manual shoes — `CARD_SEED_OVERRIDE` is defined inside the `if(ENABLE_CARD_SEEDING)` block in `genGame()` so it costs nothing at runtime when disabled.
- **Card Animations**: `cardHTML(c, sz, ex, dl, anim)` — `ex` is extra inline style (used for glow effects), `dl` is delay in seconds, `anim=false` skips the `adeal` class. BJ dealer reveals use `*0.75–0.85s` between cards. UTH dealer reveal uses `i*0.9+0.1s`.
- **UTH Hand Highlight**: On showdown result, `hlCards = new Set(pb.cards or db2.cards)`, `hl(c)` returns gold or red `box-shadow` style if card is in the winning 5-card hand.
- **UTH Reveal Phase**: After showdown or fold, `uthPhase='reveal'` renders dealer cards animating with no result text. Auto-transitions to `'result'` via `setTimeout(2300ms)` using `_noAnim=true`.
- **Score Tiers**: `CHIP_TIERS` array + `getTier(chips)` centralises thresholds (2500/1500/1000/1/0). Used by both `buildShareText()` and `screenResults()`. Tier at 1000 chips = 🎓 Apprentice.

## Visuals & Assets
- **Theme**: Felt green (`--felt`), Gold family (`--gold`, `--gold-leaf`), Cream (`--cream`).
- **Fonts**: Space Grotesk (UI), DM Serif Display (Numbers), JetBrains Mono (Chips).
- **Audio**: `sndCard`, `sndChip`, `sndShuffle`, `sndBigWin`, `sndSpin`.
- **Animations**: Use `_noAnim=true` before `render()` to suppress panel fade-in mid-hand.

## Surgical DOM Updates (flash prevention)
Full `render()` replaces all of `#app` innerHTML, causing a visible flash. For mid-hand updates where only a small region changes, use targeted DOM mutations instead:

- **BJ hit (normal, pv < 21)**: `insertAdjacentHTML('beforeend', cardHTML(...))` onto `#bj-player-hand` or `#bj-active-hand`; update `#bj-player-val` / `#bj-active-val` textContent. Falls back to `render()` if IDs not found.
- **BJ play panel layout**: `display:flex;flex-direction:column` on `.panel`; card area has `flex:1`; buttons+irow wrapped in `margin-top:auto` div so buttons pin to panel bottom.
- **Poker hold toggle**: update `transform` + `boxShadow` on `.card` inside `#pk-hw-{i}` (CSS transition already present); update `.hold-tag` text/color; update `.pk-hold-status` text. No render needed.
- **UTH community reveals** (not yet done): candidate for surgical update — update community card section + action buttons by ID, skip full render.

Pattern: add stable IDs to the elements that change, mutate them directly, call `saveState()` instead of `render()`. Always include a fallback to `_noAnim=true;render()` if IDs are missing.

## Known Quirks
- `GAME2` always uses screen key `'poker'` internally.
- `curBetRef()` uses a `BET_REF` lookup object for `bj`/`roulette` screens; falls back to `GAME2` check for the shared `poker` screen.
- `rankPoker()` (Video Poker) vs `handScore()` (UTH) use different internal thresholds.
- `G.rSpin` (pre-gen result) vs `rSpin()` (the UI function).
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

## Working Context
- **Current**: No active task.
- **Completed**: Persistent state, Daily seed PRNG, Split logic, Roulette canvas wheel, History chart, Scoring tiers, Dev tools, `modifiers.js` preset system, Desktop UI scaling, BJ payout fixes, Roulette mobile UX, Progress UI polish, Code reorganization, `gameDots()` refactor (wrappers removed), BJ helper extraction, share text consolidation, UTH card highlighting, result screen standardization, mobile width fix, `CHIP_TIERS`/`getTier()` centralisation, UTH `'reveal'` phase, `bjHit()` unification, `curBetRef()` lookup refactor, `CARD_SEED_OVERRIDE` runtime-gated.

## Ideas to add
- More preset modifiers (e.g., Deuces Wild).
- "Lowball" poker modifier.
- UTH scenario seeding.

## Changelog
- UTH dealer reveal is now a dedicated `'reveal'` phase before the result screen; dealer cards animate at `i*0.9+0.1s`, auto-transitions after 2.3s. Result screens show dealer cards static.
- BJ dealer reveal delays bumped to `*0.75–0.85s` per card across play, split, and result screens.
- `CHIP_TIERS` array + `getTier()` centralise score tier thresholds; tier emoji now consistent between share text and results screen. 1000-chip tier = 🎓 Apprentice.
- `bjDots`/`pkDots`/`uthDots` wrappers removed; `gameDots()` called directly at all 12 call sites.
- `bjHit()` unified: split and non-split paths merged into single code path; branch points are hand reference and next-step callback only.
- `curBetRef()` replaced nested ternary with `BET_REF` lookup object; poker screen still uses `GAME2` check.
- `CARD_SEED_OVERRIDE` moved inside `if(ENABLE_CARD_SEEDING)` in `genGame()` — no runtime cost when disabled.
- Removed `min-width:584px` from `.panel` — fixes mobile overflow; desktop override unchanged.
- All result screens standardized to "You Win!" / "You Lose!" / "Push" in `col(delta)` color.
- BJ result: `.hand-val` shown below dealer and player cards (same styling as play phase).
- BJ split result: overall You Win/Lose header + net delta; `.hand-val` on each split hand and dealer; gold-tinted left border separates hands visually.
- Extracted `bjDealerHTML()` and `bjActionBtns()` — eliminated ~140 lines of BJ split/non-split duplication.
- UTH showdown: community cards now between dealer and player; winning 5-card hand highlighted with gold/red glow.
- Refactored `bjDots`/`pkDots`/`uthDots` into `gameDots(history, hand, phase)`; dots always show hand number.
- Consolidated share text into `buildShareText()`; result tier emoji driven by `CHIP_TIERS`.
- Dev mode re-enables vertical scrollbar via `body.dev-mode` class.
- Added `modifiers.js` with preset system and daily-scheduled rules.
- Fixed BJ payouts (3:2 naturals), Roulette mobile UX, `min_chips` modifier enforcement.
- Desktop UI scaling and scrollbar suppression via `@media (min-width:1024px)`.
