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
- **Dev Mode**: `?dev=true` in URL enables UI tools and re-enables vertical scroll (`body.dev-mode`). `ENABLE_CARD_SEEDING` for manual shoes.
- **Card Animations**: `cardHTML(c, sz, ex, dl, anim)` — `ex` is extra inline style (used for glow effects), `dl` is delay in seconds, `anim=false` skips the `adeal` class. Dealer reveals use 0.55–0.65s between cards for drama.
- **UTH Hand Highlight**: On showdown result, `hlCards = new Set(pb.cards or db2.cards)`, `hl(c)` returns gold or red `box-shadow` style if card is in the winning 5-card hand.

## Visuals & Assets
- **Theme**: Felt green (`--felt`), Gold family (`--gold`, `--gold-leaf`), Cream (`--cream`).
- **Fonts**: Space Grotesk (UI), DM Serif Display (Numbers), JetBrains Mono (Chips).
- **Audio**: `sndCard`, `sndChip`, `sndShuffle`, `sndBigWin`, `sndSpin`.
- **Animations**: Use `_noAnim=true` before `render()` to suppress panel fade-in mid-hand.

## Known Quirks
- `GAME2` always uses screen key `'poker'` internally.
- `curBetRef()` returns `'uthAnte'` for UTH on the poker screen.
- `rankPoker()` (Video Poker) vs `handScore()` (UTH) use different internal thresholds.
- `G.rSpin` (pre-gen result) vs `rSpin()` (the UI function).
- UTH fold can only happen at the turn phase (all 5 community cards visible). Fold result screen reveals dealer cards with animation.
- BJ split hands use `S.bjSplitHands`, `S.bjSplitResults`, `S.bjSplitBets`, `S.bjSplitDone`, `S.bjSplitActive`. Split result net = sum of `S.bjSplitResults[i].delta`.
- `.panel` has no `min-width` on mobile (removed); desktop media query (`min-width:1024px`) sets `min-width:764px`.

## Key Helpers (AI reference)
- `gameDots(history, hand, phase)` — renders progress dots for any game; `bjDots/pkDots/uthDots` are wrappers.
- `bjDealerHTML()` — dealer section HTML for BJ play phase (handles revealed vs hidden).
- `bjActionBtns(bust, done21, can2, canSplit)` — BJ Hit/Stand/Double/Split buttons (shared by split and non-split).
- `buildShareText()` — generates full share string; used by both results preview and `doShare()`.
- `col(delta)` — returns CSS color var for win/loss/push. `sign(delta)` — formats with +/− prefix.

## Working Context
- **Current**: UI polish and mobile fixes complete. No active task.
- **Completed**: Persistent state, Daily seed PRNG, Split logic, Roulette canvas wheel, History chart, Scoring tiers, Dev tools, `modifiers.js` preset system, Desktop UI scaling, BJ payout fixes, Roulette mobile UX, Progress UI polish, Code reorganization, `gameDots()` refactor, BJ helper extraction, share text consolidation, UTH card highlighting, result screen standardization, mobile width fix.

## Ideas to add
- More preset modifiers (e.g., Deuces Wild).
- "Lowball" poker modifier.
- UTH scenario seeding.

## Changelog
- Removed `min-width:584px` from `.panel` — fixes mobile overflow; desktop override unchanged.
- All result screens standardized to "You Win!" / "You Lose!" / "Push" in `col(delta)` color.
- BJ result: `.hand-val` shown below dealer and player cards (same styling as play phase).
- BJ split result: overall You Win/Lose header + net delta; `.hand-val` on each split hand and dealer; gold-tinted left border separates hands visually.
- Extracted `bjDealerHTML()` and `bjActionBtns()` — eliminated ~140 lines of BJ split/non-split duplication.
- UTH showdown: community cards now between dealer and player; winning 5-card hand highlighted with gold/red glow.
- UTH fold result now shows dealer cards (slow reveal), community, and player hole cards.
- Dealer card reveal delays increased to 0.55–0.65s between cards for dramatic effect.
- Refactored `bjDots`/`pkDots`/`uthDots` into `gameDots(history, hand, phase)`; dots always show hand number.
- Consolidated share text into `buildShareText()`; result tier emoji: 🐋/💎/🏆/😢/🤡.
- Dev mode re-enables vertical scrollbar via `body.dev-mode` class.
- Added `modifiers.js` with preset system and daily-scheduled rules.
- Fixed BJ payouts (3:2 naturals), Roulette mobile UX, `min_chips` modifier enforcement.
- Desktop UI scaling and scrollbar suppression via `@media (min-width:1024px)`.