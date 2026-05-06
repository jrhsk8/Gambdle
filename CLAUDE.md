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
- **Eval**: `rankPoker()` (Jacks+) vs `handScore()` (UTH weighted 1e12 scoring).
- **Dev Mode**: `?dev=true` in URL enables UI tools. `ENABLE_CARD_SEEDING` for manual shoes.

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

## Working Context
- **Current**: Refactoring + UI polish pass.
- **Completed**: Persistent state, Daily seed PRNG, Split logic, Roulette canvas wheel, History chart, Scoring tiers, Dev tools, `modifiers.js` preset system, Desktop UI scaling, BJ payout fixes, Roulette mobile UX, Progress UI polish, Code reorganization, `gameDots()` refactor, share text consolidation.

## Ideas to add
- More preset modifiers (e.g., Deuces Wild).
- "Lowball" poker modifier.
- UTH scenario seeding.

## Changelog
- Refactored `bjDots`/`pkDots`/`uthDots` into single `gameDots(history, hand, phase)` helper.
- Dots now always show hand number; current hand highlighted gold on bet screen.
- Consolidated share text into `buildShareText()` used by both results preview and `doShare()`.
- Result tier emoji in share text: 🐋 (2500+), 💎 (1500+), 🏆 (1000+), 😢 (>0), 🤡 (bust).
- UTH result screen: "You Win!" / result label moved to top of panel above cards.
- Dev mode (`?dev=true`) re-enables vertical scrollbar on desktop via `body.dev-mode` class.
- Fixed syntax error (duplicate template literal in BJ split rendering, line ~839).
- Added `modifiers.js` with preset system and daily-scheduled rules (title/desc support).
- Fixed Blackjack payouts (3:2 for naturals) and standardized "Blackjack!" celebration logic.
- Improved Roulette table accessibility on mobile via horizontal scrolling and larger tiles.
- Implemented desktop-specific UI scaling, fixed-size game panel, and scrollbar suppression.
- Added "Force Modifier" buttons to Dev Tools for testing specific rules.
- Rearranged `index.html` structure to put Game Config, Dev Mode, and Card Seeding at the top.
- Fixed `forcedMod` priority in `loadState` to ensure dev tool modifier overrides saved state.
- Improved "Daily Rule" visibility with glowing animations and dynamic positioning.