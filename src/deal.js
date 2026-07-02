// ─── THE DEAL ────────────────────────────────────────────────────────────────
// The day's shared, pre-drawn cards (CONTEXT.md: the "Deal"). buildDeal(seed) is the exact,
// order-critical construction the replay engine also calls (engine.js:423); genDeal() layers the
// test/seed overrides on top, and DEAL is built once at page load. Depends on core.js: mkRng,
// buildDeck, shuffle, card, getRngSeed, _testActive. Loads right after core.js, and is bundled
// into the Edge Function replay engine (tests/harness/build-engine-bundle.js). Public: buildDeal, DEAL.
// ─────────────────────────────────────────────────────────────────────────────
// Manual overrides for deck seeding (independent of the ?dev=true flag).
const ENABLE_CARD_SEEDING = false; // set to true to enable the overrides below

// ─── TEST & SEEDING ────────────────────────────────────────────
// Hardcoded test scenarios applied when the dev "Test Seed" checkbox is active.
const TEST_CARD_OVERRIDE = {
  bjShoe: [
    card('8','s'), card('8','h'), card('6','d'), card('7','c'),
    card('8','d'),
    card('J','h'),
    card('8','c'),
    card('7','s'),
    card('4','h'),
    card('5','d'),
    card('6','h'),
    card('3','c'),
    card('10','s'),
    card('K','d'),
  ],
  uthHands: [
    { hole:   [card('A','s'), card('A','c')],
      dealer: [card('2','d'), card('7','h')],
      comm:   [card('K','s'), card('Q','c'), card('J','s'), card('J','d'), card('8','h')] },
    { hole:   [card('7','c'), card('2','c')],
      dealer: [card('A','h'), card('K','h')],
      comm:   [card('A','d'), card('K','d'), card('K','c'), card('Q','s'), card('J','h')] },
    { hole:   [card('9','d'), card('8','d')],
      dealer: [card('2','h'), card('5','c')],
      comm:   [card('7','d'), card('6','d'), card('5','d'), card('Q','h'), card('3','c')] },
  ],
  rSpin: 0,
};

// Splices override cards to the front of the shoe, preserving remaining cards in order.
function _applyBjShoeOverride(shoe, cards) {
  if (!cards || !cards.length) return shoe;
  const pool = [...shoe];
  for (const oc of cards) {
    const i = pool.findIndex(c => c.r === oc.r && c.s === oc.s);
    if (i !== -1) pool.splice(i, 1);
  }
  return [...cards, ...pool];
}

// Places override hands at their fixed offsets in the UTH deck (9 cards per hand).
function _applyUthDeckOverride(deck, hands) {
  if (!hands || !hands.length) return deck;
  const placed = new Map();
  const pool = [...deck];
  for (let h = 0; h < 3; h++) {
    const spec = hands[h];
    if (!spec) continue;
    const off = h * 9;
    const slots = [
      ...(spec.hole   || []).slice(0, 2),
      ...(spec.dealer || []).slice(0, 2),
      ...(spec.comm   || []).slice(0, 5),
    ];
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      placed.set(off + i, slots[i]);
      const pi = pool.findIndex(c => c.r === slots[i].r && c.s === slots[i].s);
      if (pi !== -1) pool.splice(pi, 1);
    }
  }
  const newDeck = [];
  let pi = 0;
  for (let i = 0; i < 52; i++) newDeck.push(placed.has(i) ? placed.get(i) : pool[pi++]);
  return newDeck;
}

// Two extra decks for the BJ shoe, shuffled by a PRNG seeded independently of the main
// draw sequence, so the base 104 cards and every poker/UTH draw stay byte-identical while
// the shoe gains a tail it can fall back on. Deterministic per seed (identical for everyone
// on a given day). Only ever consumed if a player draws past the base 104 (aggressive
// wild-split play); without it, a draw past the end is undefined and would crash.
function _extendBjShoe(seed){
  const rng2=mkRng((seed^0x9e3779b9)>>>0);
  return shuffle(buildDeck(),rng2).concat(shuffle(buildDeck(),rng2));
}

// The pristine daily deal for an explicit RNG seed: the canonical card layout before any
// test/seed overrides. genDeal() layers overrides on the base 104 then re-assembles; the
// server's replay engine rebuilds from this same construction so client and server agree
// card-for-card (see .claude/LEADERBOARD-INTEGRITY.md). PURE: (seed) -> fresh arrays, no S/DOM.
// The RNG draw order matters and must not change: bjShoe shuffle, then the 3 poker decks, then
// the uthDeck, then the ladder cards. _extendBjShoe seeds its own independent rng, so the
// no-run-dry tail is appended without shifting the shared sequence (do not reorder these lines).
// Per-hand BJ segment start. Each of the 3 BJ hands draws from its own fixed slice of the shoe, so a
// split/hit/double in one hand never shifts another hand's cards (BJ hands are independent, like the
// per-hand UTH slices), which also lets the future-seed checker evaluate each hand in isolation. Hand 0
// still starts at index 0. The shoe (base 104 + 2-deck tail = 208) is far larger than 3 times a hand's
// worst case (split-to-4 + dealer, about 30), so segments never overflow.
//
// ┌─ DEPLOY GATE, added 2026-06-19 ───────────────────────────────────────────────────────────────────┐
// │ Per-hand segments apply only for RNG seeds from BJ_SEGMENT_CUTOVER onward; earlier seeds return     │
// │ null and every caller falls back to the old continuous shoe (no per-hand cursor reset, unbounded    │
// │ First-Ace / Soft-Landing swaps). This let the change ship mid-day without rejecting in-flight runs:  │
// │ a run dealt on the old continuous client still replays identically on the new server for any         │
// │ pre-cutover day (client/server cards match, avoiding the 2026-06-16 incident). Days already          │
// │ started stayed continuous; only the next Phoenix day onward went segmented.                          │
// │ Once old clients have cycled past the cutover and no pre-cutover day can resubmit (backlog never      │
// │ submits), this can be simplified: delete the cutover check and the constant, drop the `seed` param,   │
// │ and make the `if (seg !== null)` guards in bj.js / engine.js / seedcheck.js reset unconditionally.     │
// └──────────────────────────────────────────────────────────────────────────────────────────────────┘
// Pure: (shoeLen, hand, seed) -> start idx, or null when the seed predates the cutover (continuous shoe).
const BJ_SEGMENT_CUTOVER = 20260620; // first Phoenix day (YYYYMMDD) dealt in per-hand segments
function bjSegStart(shoeLen, hand, seed){
  if(seed < BJ_SEGMENT_CUTOVER) return null;        // pre-cutover stays continuous (see note above)
  return hand * Math.floor(shoeLen / 3);
}

function buildDeal(seed){
  const rng=mkRng(seed);
  const shoe=[];for(let i=0;i<2;i++)shoe.push(...buildDeck());
  const bjShoe=shuffle(shoe,rng).concat(_extendBjShoe(seed)); // base 104 + no-run-dry tail
  // One fresh 52-card deck per Poker hand (so each hand's drawn 5 cards come from a pristine shoe);
  // each shuffle advances the shared RNG sequence, keeping byte-alignment with server replay.
  const pokerDecks=Array.from({length:3},()=>shuffle(buildDeck(),rng));
  const uthDeck=shuffle(buildDeck(),rng);
  // The Ladder: one shared 8-card hi-lo sequence (1 first reveal + up to 7 called cards).
  // MUST be the last rng consumer (no call after this): the draw order has to match replay exactly.
  const ladderCards=shuffle(buildDeck(),rng).slice(0,8);
  return{bjShoe,pokerDecks,uthDeck,ladderCards,rSpinOverride:null};
}

// Pre-generates all cards and spin data for the daily run: buildDeal() plus the test/seed
// overrides. Overrides only ever touch the base 104 (the no-run-dry tail is split off and
// re-appended), so they keep the appended decks pristine and the layout deterministic per day.
function genDeal(){
  const seed=getRngSeed();
  const deal=buildDeal(seed);
  let bjShoe=deal.bjShoe.slice(0,104);          // base 104, overrides apply here only
  const tail=deal.bjShoe.slice(104);            // no-run-dry tail, re-appended after overrides
  let uthDeck=deal.uthDeck;
  const pokerDecks=deal.pokerDecks, ladderCards=deal.ladderCards;
  let rSpinOverride=null;

  if(_testActive()){
    const ov=TEST_CARD_OVERRIDE;
    bjShoe = _applyBjShoeOverride(bjShoe, ov.bjShoe);
    uthDeck = _applyUthDeckOverride(uthDeck, ov.uthHands);
    if(ov.rSpin!=null)rSpinOverride=ov.rSpin;
  }

  if(ENABLE_CARD_SEEDING){
    const CARD_SEED_OVERRIDE = {
      bjShoe: [
        card('A','s'), card('J','s'), card('K','d'), card('5','c'),
        card('J','s'), card('A','d'), card('2','d'), card('9','c'),
        card('10','s'), card('10','h'), card('Q','d'), card('2','c'),
      ],
      uthHands: [
        { hole:   [card('A','s'), card('K','s')],
          dealer: [card('2','h'), card('7','d')],
          comm:   [card('Q','s'), card('J','s'), card('10','s'), card('3','c'), card('6','d')] },
        null,
        null,
      ],
      rSpin: null,
    };
    bjShoe = _applyBjShoeOverride(bjShoe, CARD_SEED_OVERRIDE.bjShoe);
    uthDeck = _applyUthDeckOverride(uthDeck, CARD_SEED_OVERRIDE.uthHands);
    if(CARD_SEED_OVERRIDE.rSpin != null) rSpinOverride=CARD_SEED_OVERRIDE.rSpin;
  }

  // Re-append the no-run-dry tail AFTER any test/seed overrides, so overrides only ever touch
  // the base 104 and the appended decks stay pristine.
  bjShoe=bjShoe.concat(tail);
  return{bjShoe,pokerDecks,uthDeck,ladderCards,rSpinOverride};
}
// DEAL is generated once at page load: the same cards for everyone on the same calendar day.
const DEAL=genDeal();
