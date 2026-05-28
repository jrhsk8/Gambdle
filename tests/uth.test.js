// ─── cardNum ─────────────────────────────────────────────────────────────────

describe('cardNum', () => {
  it('numeric ranks 2-10', () => {
    for (let n = 2; n <= 10; n++) assertEqual(cardNum(String(n)), n, `rank ${n}`);
  });

  it('J=11, Q=12, K=13, A=14', () => {
    assertEqual(cardNum('J'), 11);
    assertEqual(cardNum('Q'), 12);
    assertEqual(cardNum('K'), 13);
    assertEqual(cardNum('A'), 14);
  });

  it('Ace is 14 (high), unlike cVal where Ace is 11', () => {
    assert(cardNum('A') !== cVal('A'), 'cardNum and cVal treat Ace differently');
    assertEqual(cardNum('A'), 14);
  });
});

// ─── rankPoker ───────────────────────────────────────────────────────────────

describe('rankPoker', () => {
  // Cards use the card() helper from core.js: card('A','s') → {r:'A', s:'♠'}
  const h = specs => specs.map(([r, s]) => card(r, s));

  it('Royal Flush', () => {
    const r = rankPoker(h([['A','s'],['K','s'],['Q','s'],['J','s'],['10','s']]));
    assertEqual(r.n, 'Royal Flush');
    assertEqual(r.p, 800);
  });

  it('Straight Flush', () => {
    const r = rankPoker(h([['9','s'],['8','s'],['7','s'],['6','s'],['5','s']]));
    assertEqual(r.n, 'Straight Flush');
    assertEqual(r.p, 50);
  });

  it('Four of a Kind', () => {
    const r = rankPoker(h([['A','s'],['A','h'],['A','d'],['A','c'],['K','s']]));
    assertEqual(r.n, 'Four of a Kind');
    assertEqual(r.p, 25);
  });

  it('Full House', () => {
    const r = rankPoker(h([['K','s'],['K','h'],['K','d'],['Q','s'],['Q','h']]));
    assertEqual(r.n, 'Full House');
    assertEqual(r.p, 9);
  });

  it('Flush', () => {
    const r = rankPoker(h([['A','s'],['9','s'],['7','s'],['4','s'],['2','s']]));
    assertEqual(r.n, 'Flush');
    assertEqual(r.p, 6);
  });

  it('Straight', () => {
    const r = rankPoker(h([['10','s'],['9','h'],['8','d'],['7','c'],['6','s']]));
    assertEqual(r.n, 'Straight');
    assertEqual(r.p, 4);
  });

  it('Broadway straight (A-K-Q-J-10)', () => {
    // same suits as Royal Flush test but mixed suits
    const r = rankPoker(h([['A','s'],['K','h'],['Q','d'],['J','c'],['10','s']]));
    assertEqual(r.n, 'Straight');
    assertEqual(r.p, 4);
  });

  it('Three of a Kind', () => {
    const r = rankPoker(h([['7','s'],['7','h'],['7','d'],['A','s'],['K','h']]));
    assertEqual(r.n, 'Three of a Kind');
    assertEqual(r.p, 3);
  });

  it('Two Pair', () => {
    const r = rankPoker(h([['K','s'],['K','h'],['Q','s'],['Q','h'],['A','s']]));
    assertEqual(r.n, 'Two Pair');
    assertEqual(r.p, 2);
  });

  it('Jacks or Better (Jacks)', () => {
    const r = rankPoker(h([['J','s'],['J','h'],['2','d'],['4','c'],['6','s']]));
    assertEqual(r.n, 'Jacks or Better');
    assertEqual(r.p, 1);
  });

  it('Jacks or Better (Queens)', () => {
    const r = rankPoker(h([['Q','s'],['Q','h'],['2','d'],['4','c'],['6','s']]));
    assertEqual(r.n, 'Jacks or Better');
    assertEqual(r.p, 1);
  });

  it('Jacks or Better (Aces)', () => {
    const r = rankPoker(h([['A','s'],['A','h'],['2','d'],['4','c'],['6','s']]));
    assertEqual(r.n, 'Jacks or Better');
    assertEqual(r.p, 1);
  });

  it('pair of Tens is High Card (below Jacks threshold)', () => {
    const r = rankPoker(h([['10','s'],['10','h'],['2','d'],['4','c'],['6','s']]));
    assertEqual(r.n, 'High Card');
    assertEqual(r.p, 0);
  });

  it('High Card', () => {
    const r = rankPoker(h([['A','s'],['K','h'],['9','d'],['6','c'],['2','s']]));
    assertEqual(r.n, 'High Card');
    assertEqual(r.p, 0);
  });

  it('flush beats straight (not same hand)', () => {
    const flush = rankPoker(h([['A','s'],['9','s'],['7','s'],['4','s'],['2','s']]));
    const straight = rankPoker(h([['10','s'],['9','h'],['8','d'],['7','c'],['6','s']]));
    assert(flush.p > straight.p, 'flush payout > straight payout');
  });
});

// ─── handScore ───────────────────────────────────────────────────────────────

describe('handScore', () => {
  const h = specs => specs.map(([r, s]) => card(r, s));

  it('Royal Flush cat=9', () => {
    assertEqual(handScore(h([['A','s'],['K','s'],['Q','s'],['J','s'],['10','s']])).cat, 9);
  });

  it('Straight Flush cat=8', () => {
    assertEqual(handScore(h([['9','s'],['8','s'],['7','s'],['6','s'],['5','s']])).cat, 8);
  });

  it('Four of a Kind cat=7', () => {
    assertEqual(handScore(h([['A','s'],['A','h'],['A','d'],['A','c'],['K','s']])).cat, 7);
  });

  it('Full House cat=6', () => {
    assertEqual(handScore(h([['K','s'],['K','h'],['K','d'],['Q','s'],['Q','h']])).cat, 6);
  });

  it('Flush cat=5', () => {
    assertEqual(handScore(h([['A','s'],['9','s'],['7','s'],['4','s'],['2','s']])).cat, 5);
  });

  it('Straight cat=4', () => {
    assertEqual(handScore(h([['10','s'],['9','h'],['8','d'],['7','c'],['6','s']])).cat, 4);
  });

  it('Wheel straight A-2-3-4-5 cat=4 (UTH uses cardNum so A=14 for detection)', () => {
    assertEqual(handScore(h([['A','s'],['2','h'],['3','d'],['4','c'],['5','s']])).cat, 4);
  });

  it('Three of a Kind cat=3', () => {
    assertEqual(handScore(h([['7','s'],['7','h'],['7','d'],['A','s'],['K','h']])).cat, 3);
  });

  it('Two Pair cat=2', () => {
    assertEqual(handScore(h([['K','s'],['K','h'],['Q','s'],['Q','h'],['A','s']])).cat, 2);
  });

  it('One Pair cat=1', () => {
    assertEqual(handScore(h([['A','s'],['A','h'],['2','d'],['4','c'],['6','s']])).cat, 1);
  });

  it('High Card cat=0', () => {
    // A-K-Q-J-9: no flush, no straight (gap at 10)
    assertEqual(handScore(h([['A','s'],['K','h'],['Q','d'],['J','c'],['9','s']])).cat, 0);
  });

  it('category order: higher cat always produces higher score', () => {
    const hands = [
      h([['A','s'],['K','h'],['Q','d'],['J','c'],['9','s']]),        // cat 0: high card
      h([['A','s'],['A','h'],['2','d'],['4','c'],['6','s']]),         // cat 1: pair
      h([['K','s'],['K','h'],['Q','s'],['Q','h'],['A','s']]),         // cat 2: two pair
      h([['7','s'],['7','h'],['7','d'],['A','s'],['K','h']]),         // cat 3: trips
      h([['10','s'],['9','h'],['8','d'],['7','c'],['6','s']]),        // cat 4: straight
      h([['A','s'],['9','s'],['7','s'],['4','s'],['2','s']]),         // cat 5: flush
      h([['K','s'],['K','h'],['K','d'],['Q','s'],['Q','h']]),         // cat 6: full house
      h([['A','s'],['A','h'],['A','d'],['A','c'],['K','s']]),         // cat 7: quads
      h([['9','s'],['8','s'],['7','s'],['6','s'],['5','s']]),         // cat 8: SF
      h([['A','s'],['K','s'],['Q','s'],['J','s'],['10','s']]),        // cat 9: RF
    ];
    const scores = hands.map(hd => handScore(hd));
    for (let i = 1; i < scores.length; i++) {
      assert(
        scores[i].score > scores[i-1].score,
        `cat ${scores[i].cat} (score ${scores[i].score}) should beat cat ${scores[i-1].cat} (score ${scores[i-1].score})`
      );
    }
  });

  it('tiebreaker: AA beats KK', () => {
    const aa = handScore(h([['A','s'],['A','h'],['2','d'],['4','c'],['6','s']]));
    const kk = handScore(h([['K','s'],['K','h'],['2','d'],['4','c'],['6','s']]));
    assert(aa.score > kk.score, 'AA should outscore KK');
  });

  it('tiebreaker: same pair, higher kicker wins', () => {
    const hiKicker = handScore(h([['A','s'],['A','h'],['K','d'],['4','c'],['6','s']]));
    const loKicker = handScore(h([['A','s'],['A','h'],['2','d'],['4','c'],['6','s']]));
    assert(hiKicker.score > loKicker.score, 'AA-K kicker beats AA-2 kicker');
  });
});

// ─── bestOf7 ─────────────────────────────────────────────────────────────────

describe('bestOf7', () => {
  const h = specs => specs.map(([r, s]) => card(r, s));

  it('finds Royal Flush from 7 cards', () => {
    // Royal flush in spades + 2 irrelevant cards
    const cards = h([['A','s'],['K','s'],['Q','s'],['J','s'],['10','s'],['2','h'],['3','d']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 9);
    assertEqual(r.rank.n, 'Royal Flush');
  });

  it('finds four-of-a-kind even when kings are at non-consecutive positions', () => {
    // K at positions 0, 2, 4, 6 — first 5 cards are only trips
    const cards = h([['K','s'],['2','h'],['K','h'],['3','d'],['K','d'],['4','c'],['K','c']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 7, 'should find four Kings');
  });

  it('prefers Straight Flush over plain Flush', () => {
    // 5 spades in sequence + 2 off-suit high cards
    const cards = h([['9','s'],['8','s'],['7','s'],['6','s'],['5','s'],['A','h'],['K','d']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 8, 'should find Straight Flush');
  });

  it('returns best 5 cards, not just any 5', () => {
    // Has a Full House hidden: 3 Aces + 2 Kings, plus 2 junk cards
    const cards = h([['A','s'],['A','h'],['A','d'],['K','s'],['K','h'],['2','d'],['3','c']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 6, 'should find Full House (Aces full of Kings)');
  });

  it('wheel straight (A-2-3-4-5) is found', () => {
    const cards = h([['A','s'],['2','h'],['3','d'],['4','c'],['5','s'],['9','h'],['10','d']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 4, 'should find wheel straight');
  });

  it('score is always > 0 for any 7 distinct cards', () => {
    // A random non-trivial 7-card hand
    const cards = h([['2','s'],['5','h'],['9','d'],['J','c'],['3','s'],['8','h'],['K','d']]);
    const r = bestOf7(cards);
    assert(r.score >= 0, 'score is non-negative');
    assert(r.cards.length === 5, 'result has exactly 5 cards');
  });
});

// ─── uthBlindDelta ────────────────────────────────────────────────────────────

describe('uthBlindDelta', () => {
  // Neutralize daily modifier so we test base paytable only
  const savedMod = S.forcedMod;
  S.forcedMod = {};

  it('Royal Flush (cat 9) pays 500x blind', () => {
    assertEqual(uthBlindDelta(9, 100), 50000);
  });

  it('Straight Flush (cat 8) pays 50x blind', () => {
    assertEqual(uthBlindDelta(8, 100), 5000);
  });

  it('Four of a Kind (cat 7) pays 10x blind', () => {
    assertEqual(uthBlindDelta(7, 100), 1000);
  });

  it('Full House (cat 6) pays 3x blind', () => {
    assertEqual(uthBlindDelta(6, 100), 300);
  });

  it('Flush (cat 5) pays 1.5x blind (rounded up)', () => {
    assertEqual(uthBlindDelta(5, 100), 150);
    assertEqual(uthBlindDelta(5, 50), 75);
    // Odd blind: Math.ceil(50 * 1.5 * 1) = Math.ceil(75) = 75 — but test with odd
    assertEqual(uthBlindDelta(5, 51), Math.ceil(51 * 1.5));
  });

  it('Straight (cat 4) pays 1x blind', () => {
    assertEqual(uthBlindDelta(4, 100), 100);
  });

  it('Three of a Kind (cat 3) pays nothing without extended modifier', () => {
    assertEqual(uthBlindDelta(3, 100), 0);
  });

  it('Two Pair (cat 2) pays nothing without extended modifier', () => {
    assertEqual(uthBlindDelta(2, 100), 0);
  });

  it('One Pair (cat 1) pays nothing', () => {
    assertEqual(uthBlindDelta(1, 100), 0);
  });

  it('High Card (cat 0) pays nothing', () => {
    assertEqual(uthBlindDelta(0, 100), 0);
  });

  // Restore modifier
  S.forcedMod = savedMod;
});
