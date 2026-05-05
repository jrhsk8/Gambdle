# Gambdle — Project Context

## What this is
A daily game that is themed around a persistent chip count through multiple rounds of casino themed gambling games.

## What Claude should do with this file
Update information as needed. Keep the file 200 lines or under.

## What Claude is working on


## Tech stack
Single-file app — all HTML, CSS, and JS in `index.html`. No build process, no npm, no modules. Only external dependency is Google Fonts (CDN).

## File structure
`index.html` should have most if not all of the operative code.
Sound effects: `allin.mp3`, `bigwin.mp3`, `card1-3.mp3`, `mediumbet.mp3`, `shuffle.mp3`, `smallbet.mp3`

## Game order & flow
There are three games by default. each day. First is blackjack, then ultimate texas holdem, then roulette.
Screen names in state: `'intro'` → `'bj'` → `'poker'` → `'roulette'` → `'results'`
Game 2 always uses screen key `'poker'` internally regardless of which game is active.
If chips drop below 10 between hands, game jumps to results early.

## Game 2 config
Near top of `<script>`: `const GAME2 = 'uth';` — swap to `'poker'` to run 5 Card Poker instead.
This one line controls the intro screen, BJ next-button text, results, and share text.

## Daily seed / RNG
This ensures everyone gets the same card shuffle each day.
Seed is `YYYYMMDD` integer. `mkRng(seed)` produces a deterministic PRNG.
`getDayNum()` = days since May 5 2026 (day #1), shown in UI and share text.
All decks/spins generated once in `genGame()` and stored in global `G`:
`G.bjShoe`, `G.pokerDecks[3]`, `G.uthDeck`, `G.rSpin`
UTH deck deals 9 cards per hand at offset `hand * 9`: [0-1] player hole, [2-3] dealer hole, [4-8] community.

## Chips & scoring
Start: `const START = 1000`. All state lives in global `S`; chip count at `S.chips`.
`S.uthAnte` stores the **total** bet (ante + blind combined); each equals `uthAnte/2`. Chip selector uses even-only denoms `[10,50,100,500,1000]` to keep halves as integers. Raise amounts are `(uthAnte/2) * mult`.

## Audio
Custom mp3s provided for relevant sounds.
Helpers: `sndCard()`, `sndChip(d)`, `sndShuffle(cb)`, `sndBigWin()`, `sndSpin(dur)`.

## Visual style / design rules
Casino themed. Should evoke playing at a real table, without being too dark or moody.
Palette: felt greens (`--felt`), gold family (`--gold`, `--gold2`, `--gold-deep`, `--gold-leaf`), `--cream`.
Fonts: Space Grotesk (UI), DM Serif Display (numbers/logo), JetBrains Mono (chip values).
Cards: `.card.lg` (80×114), `.card.md` (68×96), `.card.sm` (56×78). Red suits use `--red`.
Use `_noAnim=true` before `render()` to suppress panel fade-in mid-hand.

## Dev override / testing
This section allows for seeding specific cards in each game to allow testing of specific scenarios.
Set `DEV_OVERRIDE` to an object with `bjShoe: [card(...), ...]` and/or `rSpin: 0-36`.
`card(rank, suit)` helper — suit chars: `s h d c`. No UTH override implemented yet.

## Deployment
Deployed via github pages: `https://jrhsk8.github.io/Gambdle/` — push to `main` to deploy.

## Known quirks / gotchas
`rankPoker()` uses "Jacks or Better" threshold (video poker rule). UTH dealer qualification uses `handScore().cat >= 1` (any pair) — these are separate systems.
`G.rSpin` (the result number) vs `rSpin()` (the button action) — same name, different things.
`curBetRef()` returns `'uthAnte'` on the poker screen when `GAME2==='uth'`.

## Future ideas / backlog
blackjack window should not flash / re render when the player is done taking actions. only after going to results
final player card is incorrectly animated when dealing dealer blackjack cards
uth should not let you bet an amount that would prevent you from covering the total cost of the hand. ie you should never be in a force fold situation because you don't have the chips to cover