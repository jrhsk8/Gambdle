// Guards against accidental extra rng() calls shifting subsequent card draws.
// See CLAUDE.md: "any extra rng() call shifts all subsequent draws."
//
// The genDeal() sequence is: bjShoe → 3 pokerDecks → uthDeck.
// Each shuffle() consumes (deck.length - 1) rng calls via Fisher-Yates.

function _buildShoe() {
  const shoe = [];
  for (let i = 0; i < 2; i++) shoe.push(...buildDeck());
  return shoe;
}

function _runGenSequence(seed) {
  const rng = mkRng(seed);
  const bj   = shuffle(_buildShoe(), rng);
  const pk   = [0, 1, 2].map(() => shuffle(buildDeck(), rng));
  const uth  = shuffle(buildDeck(), rng);
  return { bj, pk, uth };
}

// ─── Sequence reproducibility ─────────────────────────────────────────────────

describe('RNG sequence — reproducibility', () => {
  it('same seed produces identical BJ shoe on two runs', () => {
    const a = _runGenSequence(20260101);
    const b = _runGenSequence(20260101);
    assertDeepEqual(a.bj.map(c => c.r + c.s), b.bj.map(c => c.r + c.s));
  });

  it('same seed produces identical UTH deck on two runs', () => {
    const a = _runGenSequence(20260101);
    const b = _runGenSequence(20260101);
    assertDeepEqual(a.uth.map(c => c.r + c.s), b.uth.map(c => c.r + c.s));
  });

  it('same seed produces identical poker decks on two runs', () => {
    const a = _runGenSequence(20260101);
    const b = _runGenSequence(20260101);
    for (let i = 0; i < 3; i++) {
      assertDeepEqual(a.pk[i].map(c => c.r + c.s), b.pk[i].map(c => c.r + c.s), `poker deck ${i}`);
    }
  });

  it('different seeds produce different BJ shoes', () => {
    const a = _runGenSequence(20260101);
    const b = _runGenSequence(20260102);
    const first10a = a.bj.slice(0, 10).map(c => c.r + c.s).join(',');
    const first10b = b.bj.slice(0, 10).map(c => c.r + c.s).join(',');
    assert(first10a !== first10b, 'different seeds produce different shoes');
  });
});

// ─── Cross-deck coupling ───────────────────────────────────────────────────────

describe('RNG sequence — cross-deck coupling', () => {
  it('UTH deck differs from BJ shoe (drawn at different RNG positions)', () => {
    const { bj, uth } = _runGenSequence(20260505);
    // Both are 52-card shuffles of a single deck; compare first 52 of bj vs uth
    const bjFirst52 = bj.slice(0, 52).map(c => c.r + c.s).join(',');
    const uthCards  = uth.map(c => c.r + c.s).join(',');
    assert(bjFirst52 !== uthCards, 'UTH deck is in a different RNG phase than BJ shoe');
  });

  it('extra rng() call before UTH shifts all UTH draws', () => {
    const seed = 20260101;
    const shoe = _buildShoe();

    // Normal sequence
    const rng1 = mkRng(seed);
    shuffle([...shoe], rng1);
    [0, 1, 2].forEach(() => shuffle(buildDeck(), rng1));
    const uth1 = shuffle(buildDeck(), rng1);

    // Same sequence but one extra rng() call injected before UTH shuffle
    const rng2 = mkRng(seed);
    shuffle([...shoe], rng2);
    [0, 1, 2].forEach(() => shuffle(buildDeck(), rng2));
    rng2(); // simulates an accidental extra call
    const uth2 = shuffle(buildDeck(), rng2);

    assert(
      uth1.map(c => c.r + c.s).join(',') !== uth2.map(c => c.r + c.s).join(','),
      'extra rng() call before UTH shuffle changes the UTH deck'
    );
  });

  it('extra rng() call inside BJ phase shifts all subsequent decks', () => {
    const seed = 20260202;
    const shoe = _buildShoe();

    // Normal sequence
    const rng1 = mkRng(seed);
    shuffle([...shoe], rng1);
    [0, 1, 2].forEach(() => shuffle(buildDeck(), rng1));
    const uth1 = shuffle(buildDeck(), rng1);

    // Extra call injected during BJ shoe phase
    const rng2 = mkRng(seed);
    rng2(); // one extra call before BJ shoe shuffle
    shuffle([...shoe], rng2);
    [0, 1, 2].forEach(() => shuffle(buildDeck(), rng2));
    const uth2 = shuffle(buildDeck(), rng2);

    assert(
      uth1.map(c => c.r + c.s).join(',') !== uth2.map(c => c.r + c.s).join(','),
      'extra rng() during BJ phase cascades to shift UTH deck'
    );
  });
});

// ─── Deck integrity after sequencing ─────────────────────────────────────────

describe('RNG sequence — deck integrity', () => {
  it('BJ shoe has 104 cards (2 full decks)', () => {
    const { bj } = _runGenSequence(20260505);
    assertEqual(bj.length, 104);
  });

  it('BJ shoe contains every card twice', () => {
    const { bj } = _runGenSequence(20260505);
    const counts = {};
    for (const c of bj) {
      const k = c.r + c.s;
      counts[k] = (counts[k] || 0) + 1;
    }
    for (const [k, v] of Object.entries(counts)) {
      assertEqual(v, 2, `${k} appears ${v} times, expected 2`);
    }
  });

  it('UTH deck has 52 unique cards', () => {
    const { uth } = _runGenSequence(20260505);
    assertEqual(uth.length, 52);
    const seen = new Set(uth.map(c => c.r + c.s));
    assertEqual(seen.size, 52, 'all 52 cards unique');
  });

  it('each poker deck has 52 unique cards', () => {
    const { pk } = _runGenSequence(20260505);
    for (let i = 0; i < 3; i++) {
      assertEqual(pk[i].length, 52, `poker deck ${i} length`);
      const seen = new Set(pk[i].map(c => c.r + c.s));
      assertEqual(seen.size, 52, `poker deck ${i} unique`);
    }
  });
});

// ─── DEAL consistency (boot-time genDeal) ─────────────────────────────────────

describe('DEAL (genDeal at boot) — RNG phase separation', () => {
  it('DEAL.bjShoe and DEAL.uthDeck differ position-for-position (drawn at different RNG phases)', () => {
    // They can share individual cards (since both are built from the same 52-card universe),
    // but as a sequence they should differ. Checking the first 10 positions.
    const bj10  = DEAL.bjShoe.slice(0, 10).map(c => c.r + c.s).join(',');
    const uth10 = DEAL.uthDeck.slice(0, 10).map(c => c.r + c.s).join(',');
    assert(bj10 !== uth10, 'BJ shoe and UTH deck differ in first 10 positions');
  });
});
