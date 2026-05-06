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

## Working Context: Add additional detail to this section so as to resume work if interrupted.
- **Current**: Refactoring `CLAUDE.md` for token efficiency.
- **Completed**: Persistent state, Daily seed PRNG, Split logic, Roulette canvas wheel, History chart, Scoring tiers, Dev tools.
- **Backlog**: "Lowball" poker modifier, date-specific daily rules, UTH scenario seeding.

## Changelog
- Added `localStorage` daily run persistence and lockout.
- Implemented 7-day history CSS bar chart and tiers (Whale to Bozo).
- Separated manual card seeding from `?dev=true` flag.
- Added comprehensive code documentation/readability comments.