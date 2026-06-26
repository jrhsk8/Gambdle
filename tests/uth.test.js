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

  // 8-card hands occur under uth_three_hole (Triple Threat): 3 hole + 5 community.
  it('8 cards (Triple Threat): finds quads scattered across all 8 positions', () => {
    const cards = h([['K','s'],['2','h'],['K','h'],['3','d'],['K','d'],['4','c'],['A','s'],['K','c']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 7, 'should find four Kings among 8 cards');
  });

  it('8 cards: best hand uses the 8th card when it completes a flush', () => {
    const cards = h([['2','s'],['7','s'],['9','s'],['J','s'],['3','h'],['8','d'],['Q','c'],['A','s']]);
    const r = bestOf7(cards);
    assertEqual(r.cat, 5, 'should find the Ace-high spade flush');
    assert(r.cards.some(c => c.r === 'A' && c.s === '♠'), 'flush should include the A♠ (8th card)');
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

// ─── UTH game flow: uthFold / uthRaise / uthResolve ─────────────────────────
// These exercise the state machine and chip math, not just hand evaluation.

const _uthSnap = JSON.stringify({...S, pkHeld:[...S.pkHeld]});
const _uthRestore = () => { const r=JSON.parse(_uthSnap); r.pkHeld=new Set(r.pkHeld); Object.assign(S,r); };

function withUth(overrides, fn) {
  Object.assign(S, overrides);
  try { fn(); } finally { _uthRestore(); }
}

describe('uthFold — records loss and advances state', () => {
  it('sets uthFolded and increments hand counter', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', uthAnte:200, uthRaise:0,
      uthHand:0, uthHistory:[], chips:800, forcedMod:{},
    }, () => {
      uthFold();
      assertEqual(S.uthFolded, true);
      assertEqual(S.uthHand, 1, 'uthHand should increment');
      assertEqual(S.uthPhase, 'reveal', 'phase should transition to reveal');
    });
  });

  it('history entry records ante×2 loss with -ante on each of ante/blind deltas', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', uthAnte:200, uthRaise:0,
      uthHand:0, uthHistory:[], chips:800, forcedMod:{},
    }, () => {
      uthFold();
      const h = S.uthHistory[0];
      assertEqual(h.slot, 'uth', 'canonical slot');
      assertEqual(h.result, 'fold');
      assertEqual(h.ante, 100, 'ante half of uthAnte');
      assertEqual(h.blind, 100, 'blind half of uthAnte');
      assertEqual(h.anteDelta, -100);
      assertEqual(h.blindDelta, -100);
      assertEqual(h.playDelta, 0);
      assertEqual(h.delta, -200, 'total fold loss = -(ante+blind)');
    });
  });
});

describe('uthRaise — deducts play bet and advances street', () => {
  it('preflop 4× raise deducts 4×(ante/2) and moves to flop', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', uthAnte:200, uthRaise:0, uthRaiseMult:0,
      uthRaised:false, chips:1000, forcedMod:{},
      uthHole:[card('K','s'),card('K','h')],
      uthDealer:[card('7','d'),card('2','c')],
      uthComm:[card('3','s'),card('4','d'),card('5','c'),card('6','h'),card('8','d')],
    }, () => {
      uthPlaceRaise(4); // 4× ante/2 = 4×100 = 400
      assertEqual(S.uthRaise, 400, 'play bet should equal 4×(ante/2)');
      assertEqual(S.uthRaiseMult, 4);
      assertEqual(S.uthRaised, true);
      assertEqual(S.chips, 600, '1000 - 400 = 600');
      assertEqual(S.uthPhase, 'flop', 'should advance to flop');
    });
  });

  it('rejects raise when chips insufficient', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', uthAnte:200, uthRaise:0,
      uthRaised:false, chips:50, forcedMod:{},
    }, () => {
      uthPlaceRaise(4); // would cost 400, only 50 available
      assertEqual(S.uthRaise, 0, 'play should stay 0');
      assertEqual(S.chips, 50, 'chips unchanged');
      assertEqual(S.uthRaised, false);
    });
  });
});

describe('uthResolve — chip math', () => {
  // Setup helper: dealer has pair (qualifies under default rules), player varies.
  const _baseUth = (forcedMod = {}) => ({
    screen:'uth', uthPhase:'turn', uthAnte:200, uthRaise:0, uthRaiseMult:0,
    uthHand:0, uthHistory:[], forcedMod,
    uthDealer:[card('7','d'),card('2','c')],
    uthComm:  [card('7','h'),card('3','s'),card('9','c'),card('J','d'),card('4','h')], // dealer pairs 7s
  });

  it('player win + dealer qualifies: chip math correct', () => {
    withUth({
      ..._baseUth(),
      uthHole:[card('K','s'),card('K','h')], // pair of Kings beats pair of 7s
      uthRaise:100,
      chips:500, // after pre-deductions
    }, () => {
      uthResolve();
      // win: play returns 200 (100 + 100), ante returns 200 (100 + 100), blind returns 100 + 0 (one pair pays nothing)
      // chips: 500 + 200 + 200 + 100 = 1000
      assertEqual(S.chips, 1000);
      const h = S.uthHistory[0];
      assertEqual(h.slot, 'uth', 'canonical slot');
      assertEqual(h.result, 'win');
      assertEqual(h.dealerQualifies, true);
      assertEqual(h.playDelta, 100);
      assertEqual(h.anteDelta, 100);
      assertEqual(h.blindDelta, 0, 'one pair pays no blind bonus');
    });
  });

  it('player loses: chips unchanged (pre-deducted bets lost)', () => {
    withUth({
      ..._baseUth(),
      uthHole:[card('2','s'),card('3','h')], // garbage vs pair of 7s
      uthRaise:100,
      chips:500,
    }, () => {
      uthResolve();
      assertEqual(S.chips, 500, 'lose returns nothing');
      const h = S.uthHistory[0];
      assertEqual(h.result, 'lose');
      assertEqual(h.playDelta, -100);
      assertEqual(h.anteDelta, -100);
      assertEqual(h.blindDelta, -100);
      assertEqual(h.delta, -300);
    });
  });

  it('push: all stakes returned', () => {
    withUth({
      ..._baseUth(),
      // both make exactly the same hand. simplest setup: player & dealer hole = same ranks.
      uthHole:[card('7','s'),card('2','h')], // makes pair of 7s using community
      uthDealer:[card('7','d'),card('2','c')], // same hand (community pairs both)
      uthComm:[card('K','h'),card('3','s'),card('9','c'),card('J','d'),card('4','h')],
      uthRaise:100,
      chips:500,
    }, () => {
      uthResolve();
      // push: chips += ante (100) + ante (100) + play (100) = 800
      assertEqual(S.chips, 800);
      const h = S.uthHistory[0];
      assertEqual(h.result, 'push');
      assertEqual(h.delta, 0);
    });
  });

  it('win but dealer does not qualify: ante stake returned, no ante bonus', () => {
    withUth({
      ..._baseUth(),
      uthHole:[card('A','s'),card('K','h')], // high card vs dealer high card
      uthDealer:[card('Q','d'),card('2','c')],
      uthComm:[card('3','s'),card('4','d'),card('5','c'),card('9','d'),card('J','h')], // no pair anywhere
      uthRaise:100,
      chips:500,
    }, () => {
      uthResolve();
      // win + no qualify: play returns 200, ante just returns stake (100), blind returns 100 + 0
      // chips: 500 + 200 + 100 + 100 = 900
      assertEqual(S.chips, 900);
      const h = S.uthHistory[0];
      assertEqual(h.result, 'win');
      assertEqual(h.dealerQualifies, false);
      assertEqual(h.anteDelta, 0, 'no ante bonus when dealer does not qualify');
    });
  });
});

// ─── Odd-bet split: ante = ceil(uthAnte/2), blind = floor(uthAnte/2) ────────
// Ensures whole-chip totals when player bets odd amounts (e.g. 25-chip).

describe('UTH odd-bet handling — ante=ceil, blind=floor', () => {
  it('25-chip ante: uthFold splits 13+12, history reflects whole chips', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', uthAnte:25, uthRaise:0,
      uthHand:0, uthHistory:[], chips:1000, forcedMod:{},
    }, () => {
      uthFold();
      const h = S.uthHistory[0];
      assertEqual(h.ante, 13, 'ante portion is ceil(25/2)');
      assertEqual(h.blind, 12, 'blind portion is floor(25/2)');
      assertEqual(h.anteDelta, -13);
      assertEqual(h.blindDelta, -12);
      assertEqual(h.delta, -25, 'total fold loss equals uthAnte');
    });
  });

  it('25-chip ante: 4× raise costs 4×13 = 52 (whole chips)', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', uthAnte:25, uthRaise:0, uthRaiseMult:0,
      uthRaised:false, chips:1000, forcedMod:{},
      uthHole:[card('K','s'),card('K','h')],
      uthDealer:[card('7','d'),card('2','c')],
      uthComm:[card('3','s'),card('4','d'),card('5','c'),card('6','h'),card('8','d')],
    }, () => {
      uthPlaceRaise(4);
      assertEqual(S.uthRaise, 52, 'play bet = 4 × ante portion (13)');
      assertEqual(S.chips, 948, '1000 - 52 = 948 (no partial chips)');
    });
  });
});

// ─── Idempotency: a UTH hand settles exactly once ───────────────────────────
// Regression for the "win counted twice" class of bug — a double-tap on the resolving action,
// or a stray call, must not credit the payouts / push the loss a second time.
describe('uthResolve / uthFold — settle exactly once', () => {
  it('a duplicate uthResolve does not re-credit or double the history', () => {
    withUth({
      screen:'uth', uthPhase:'turn', uthAnte:200, uthRaise:100, uthRaiseMult:0,
      uthHand:0, uthHistory:[], chips:500, forcedMod:{},
      uthHole:[card('K','s'),card('K','h')],          // pair of Kings beats dealer's pair of 7s
      uthDealer:[card('7','d'),card('2','c')],
      uthComm:[card('7','h'),card('3','s'),card('9','c'),card('J','d'),card('4','h')],
    }, () => {
      uthResolve();
      assertEqual(S.chips, 1000);
      assertEqual(S.uthHistory.length, 1);
      assertEqual(S.uthHand, 1);
      uthResolve();                                    // simulate a duplicate/late settle
      assertEqual(S.chips, 1000, 'chips unchanged by the second resolve');
      assertEqual(S.uthHistory.length, 1, 'no duplicate history entry');
      assertEqual(S.uthHand, 1, 'hand counter not advanced twice');
    });
  });

  it('a duplicate uthFold does not push the loss or advance the hand twice', () => {
    withUth({
      screen:'uth', uthPhase:'turn', uthAnte:200, uthRaise:0,
      uthHand:0, uthHistory:[], chips:800, forcedMod:{},
    }, () => {
      uthFold();
      assertEqual(S.uthHistory.length, 1);
      assertEqual(S.uthHand, 1);
      uthFold();                                       // simulate a duplicate tap
      assertEqual(S.uthHistory.length, 1, 'no duplicate fold entry');
      assertEqual(S.uthHand, 1, 'hand counter not advanced twice');
    });
  });
});

// ─── Pure UTH resolver (PRD integrity Phase 2 · Candidate 02) ─────────────────
// The three-way ante/blind/play settlement tested through its interface — synthetic bestOf7 results
// {cat, score} in, the per-leg deltas + result out. No S, no DOM, no credit.
describe('resolveUTH — three-way settlement (pure)', () => {
  const baseMods = { wm: 1, doublePlay: false, hardQualify: false, blindExtended: false, blindBoost: 1 };
  it('a win pays play, ante (dealer qualifies), and the blind by category', () => {
    const r = resolveUTH({ cat: 4, score: 6000 }, { cat: 4, score: 5000 }, 100, 100, 100, baseMods);
    assertEqual(r.result, 'win');
    assertEqual(r.dealerQualifies, true);
    assertEqual(r.anteDelta, 100);
    assertEqual(r.playDelta, 100);
    assertEqual(r.blindDelta, uthBlindDelta(4, 100, { extended: false, boost: 1 }));
    assertEqual(r.delta, r.anteDelta + r.blindDelta + r.playDelta);
  });
  it('a win where the dealer does not qualify pushes the ante', () => {
    const r = resolveUTH({ cat: 4, score: 6000 }, { cat: 0, score: 200 }, 100, 100, 100, baseMods);
    assertEqual(r.result, 'win');
    assertEqual(r.dealerQualifies, false);
    assertEqual(r.anteDelta, 0, 'ante pushes when the dealer does not qualify');
  });
  it('a tie pushes all three legs to zero', () => {
    const r = resolveUTH({ cat: 4, score: 5000 }, { cat: 4, score: 5000 }, 100, 100, 100, baseMods);
    assertEqual(r.result, 'push'); assertEqual(r.delta, 0);
  });
  it('a loss forfeits ante, blind, and play', () => {
    const r = resolveUTH({ cat: 1, score: 1000 }, { cat: 4, score: 5000 }, 100, 100, 50, baseMods);
    assertEqual(r.result, 'lose');
    assertEqual(r.anteDelta, -100); assertEqual(r.blindDelta, -100); assertEqual(r.playDelta, -50);
    assertEqual(r.delta, -250);
  });
  it('hard qualify needs at least two pair (cat>=2)', () => {
    const r = resolveUTH({ cat: 4, score: 6000 }, { cat: 1, score: 900 }, 100, 100, 100, { ...baseMods, hardQualify: true });
    assertEqual(r.dealerQualifies, false);
  });
  it('the win multiplier scales every winning leg', () => {
    const r = resolveUTH({ cat: 4, score: 6000 }, { cat: 4, score: 5000 }, 100, 100, 100, { ...baseMods, wm: 2 });
    assertEqual(r.anteDelta, 200);
    assertEqual(r.playDelta, 200);
    assertEqual(r.blindDelta, uthBlindDelta(4, 100, { extended: false, boost: 1 }) * 2);
  });
});

// The credit mapping as pure data (Candidate 5): uthAward returns the ordered ledger applyLedger
// replays. Order (play, ante, blind) and the ante-push variant are load-bearing — assert them directly.
describe('uthAward — settlement ledger, order play→ante→blind (pure)', () => {
  it('a win emits three credits; the ante pushes when the dealer does not qualify', () => {
    const res = { result: 'win', playDelta: 100, anteDelta: 0, blindDelta: 0, dealerQualifies: false };
    assertDeepEqual(uthAward(res, 100, 100, 100), [
      { op: 'credit', n: 200, reason: 'uth-play' },
      { op: 'credit', n: 100, reason: 'uth-ante-push' },
      { op: 'credit', n: 100, reason: 'uth-blind' },
    ]);
  });
  it('a win credits ante + profit when the dealer qualifies', () => {
    const res = { result: 'win', playDelta: 0, anteDelta: 100, blindDelta: 0, dealerQualifies: true };
    const led = uthAward(res, 100, 100, 0);
    assertEqual(led[1].reason, 'uth-ante');
    assertEqual(led[1].n, 200);
  });
  it('a push returns all three stakes as one credit; a loss credits nothing', () => {
    assertDeepEqual(uthAward({ result: 'push' }, 100, 100, 100), [{ op: 'credit', n: 300, reason: 'uth-push' }]);
    assertDeepEqual(uthAward({ result: 'lose' }, 100, 100, 100), []);
  });
});

// ─── Idempotency: pkDraw settles exactly once ───────────────────────────────
// pkDraw credits chips + pushes history; a duplicate call (only reachable from the 'hold' phase)
// must short-circuit. Verified via the phase guard so this needs no poker deck setup.
describe('pkDraw — guarded against a duplicate draw', () => {
  it('pkDraw does nothing when not in the hold phase', () => {
    withUth({
      screen:'poker', pkPhase:'draw', pkBet:100, pkHand:0, pkHistory:[], chips:900,
    }, () => {
      pkDraw();
      assertEqual(S.chips, 900, 'chips untouched by a draw outside the hold phase');
      assertEqual(S.pkHistory.length, 0, 'no history entry from a guarded draw');
    });
  });
});

// ─── River Monster (uth_river_monster): the river card dealt face-up ─────────
// ─── Suited Up (uth_suited_conn): forced per-hand suited connector via a fresh deck ──────────
describe('uth_suited_conn — Suited Up', () => {
  const ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const ri = r => ORDER.indexOf(r);
  const key = c => c.r + c.s;

  it('suitedConnectorDeal forces a suited connector: same suit, consecutive ranks, lower card 7+', () => {
    for (let s = 1; s <= 50; s++) {
      const { hole } = suitedConnectorDeal(mkRng(20260620 + s));
      assertEqual(hole.length, 2, 'two hole cards');
      assertEqual(hole[0].s, hole[1].s, `suited (seed ${s})`);
      assertEqual(ri(hole[1].r) - ri(hole[0].r), 1, `consecutive ranks (seed ${s}): ${hole[0].r}-${hole[1].r}`);
      assert(ri(hole[0].r) >= ri('7'), `lower card 7+ (seed ${s}): ${hole[0].r}`);
    }
  });

  it('deals 2 dealer + 5 community cards, none duplicating a hole card', () => {
    const { hole, dealer, comm } = suitedConnectorDeal(mkRng(12345));
    assertEqual(dealer.length, 2, '2 dealer cards');
    assertEqual(comm.length, 5, '5 community cards');
    assertEqual(new Set([...hole, ...dealer, ...comm].map(key)).size, 9, 'all 9 cards distinct');
  });

  it('is deterministic in its RNG so the live deal and engine replay match', () => {
    assertEqual(JSON.stringify(suitedConnectorDeal(mkRng(98765))),
                JSON.stringify(suitedConnectorDeal(mkRng(98765))), 'same seed → identical deal');
  });

  it('all seven connector lows (7..K) are reachable across seeds', () => {
    const lows = new Set();
    for (let s = 0; s < 300; s++) lows.add(suitedConnectorDeal(mkRng(s)).hole[0].r);
    for (const lo of ['7','8','9','10','J','Q','K']) assert(lows.has(lo), `${lo}-connector reachable`);
  });

  it('uthDeal sets a suited-connector hole when the mod is active', () => {
    withUth({ screen:'uth', uthPhase:'bet', uthAnte:100, uthHand:0, uthHistory:[], chips:800, forcedMod:'uth_suited_conn' }, () => {
      uthDeal();
      const [a, b] = S.uthHole;
      assertEqual(a.s, b.s, 'hole is suited');
      assertEqual(ri(b.r) - ri(a.r), 1, `hole is a connector: ${a.r}-${b.r}`);
      assert(ri(a.r) >= ri('7'), `lower card 7+: ${a.r}`);
      assertEqual(S.uthComm.length, 5, '5 community cards dealt');
    });
  });
});

describe('uth_river_monster — River Monster', () => {
  const _baseDeal = (forcedMod) => ({
    screen:'uth', uthPhase:'bet', uthAnte:100, uthHand:0, uthHistory:[],
    chips:800, forcedMod,
  });

  it('uthDeal keeps the count-based reveal at 0 (river is shown via override, not the count)', () => {
    withUth(_baseDeal('uth_river_monster'), () => {
      uthDeal();
      assertEqual(S.uthRevealComm, 0, 'flop/turn still reveal normally from the left');
      assertEqual(S.uthPrevRevealComm, 0);
    });
  });

  it('_uthCommShown: river (index 4) is face-up before any street; flop/turn cards are not', () => {
    withUth({ forcedMod:'uth_river_monster', uthRevealComm:0, uthPrevRevealComm:0 }, () => {
      assertEqual(_uthCommShown(4), true, 'river is shown pre-flop');
      for (let i = 0; i < 4; i++) assertEqual(_uthCommShown(i), false, `card ${i} still hidden`);
    });
  });

  it('_uthCommShown: without the modifier nothing is shown until the count advances', () => {
    withUth({ forcedMod:{}, uthRevealComm:0, uthPrevRevealComm:0 }, () => {
      for (let i = 0; i < 5; i++) assertEqual(_uthCommShown(i), false, `card ${i} hidden`);
    });
  });

  it('the preflop render shows the river face-up and the other four face-down', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', forcedMod:'uth_river_monster', uthHand:0, uthHistory:[], chips:800,
      uthHole:[card('K','s'),card('K','h')], uthDealer:[card('7','d'),card('2','c')],
      uthComm:[card('3','s'),card('4','d'),card('5','c'),card('6','h'),card('9','d')],
      uthRevealComm:0, uthPrevRevealComm:0, uthRaised:false,
    }, () => {
      render();
      const comm = document.getElementById('uth-community-hand');
      assert(comm, 'community hand rendered');
      const backs = comm.querySelectorAll('.back, [class*="back"]').length;
      assert(comm.innerHTML.includes('9') , 'the river rank (9) is face-up in the community row');
      assert(backs >= 4, `four flop/turn cards stay face-down (found ${backs} backs)`);
    });
  });
});

// ─── Sixth Sense (uth_sixth_card): a private 6th community card the player alone uses ──────
describe('uth_sixth_card — Sixth Sense', () => {
  it('uthDeal sets the private card from the deck tail (27 + hand), leaving hole/community at 2/5', () => {
    withUth({ screen:'uth', uthPhase:'bet', uthAnte:100, uthHand:0, uthHistory:[], chips:800, forcedMod:'uth_sixth_card' }, () => {
      uthDeal();
      assert(S.uthPrivate, 'private card dealt');
      assertEqual(S.uthPrivate.r, DEAL.uthDeck[27].r, 'private rank from tail index 27');
      assertEqual(S.uthPrivate.s, DEAL.uthDeck[27].s, 'private suit from tail index 27');
      assertEqual(S.uthHole.length, 2, 'hole stays 2');
      assertEqual(S.uthComm.length, 5, 'community stays 5');
    });
  });

  it('_uthPrivateShown: hidden through preflop/flop, shown from the turn (revealComm 5)', () => {
    withUth({ forcedMod:'uth_sixth_card', uthRevealComm:0 }, () => assertEqual(_uthPrivateShown(), false, 'hidden preflop'));
    withUth({ forcedMod:'uth_sixth_card', uthRevealComm:3 }, () => assertEqual(_uthPrivateShown(), false, 'hidden on the flop'));
    withUth({ forcedMod:'uth_sixth_card', uthRevealComm:5 }, () => assertEqual(_uthPrivateShown(), true, 'shown from the turn'));
  });

  it('eval: the private card joins the player pool (royal flush) but not the dealer pool', () => {
    // Hole A♠K♠ + community Q♠J♠… is only a high card; the private 10♠ completes a royal flush, flipping
    // a loss (vs the dealer's pair of Queens) into a win. The dealer's best is keyed off the 7-card pool.
    withUth({
      screen:'uth', uthPhase:'turn', uthAnte:100, uthRaise:0, uthRaiseMult:0, uthRaised:false,
      uthHand:0, uthHistory:[], chips:700, forcedMod:'uth_sixth_card',
      uthHole:[card('A','s'),card('K','s')], uthDealer:[card('Q','h'),card('9','c')],
      uthComm:[card('Q','s'),card('J','s'),card('5','d'),card('7','c'),card('2','h')],
      uthPrivate:card('10','s'), uthRevealComm:5, uthPrevRevealComm:5,
    }, () => {
      uthResolve();
      const h = S.uthHistory[S.uthHistory.length - 1];
      assertEqual(h.playerBest.cat, 9, 'private 10♠ completes the royal flush');
      assertEqual(h.dealerBest.cat, 1, 'dealer best (pair of Queens) is unaffected by the private card');
      assertEqual(h.result, 'win', 'the upgraded hand wins');
    });
  });

  it('preflop render: the private card sits in the community row face-down with a YOU tag', () => {
    withUth({
      screen:'uth', uthPhase:'preflop', forcedMod:'uth_sixth_card', uthHand:0, uthHistory:[], chips:800,
      uthHole:[card('K','s'),card('K','h')], uthDealer:[card('7','d'),card('2','c')],
      uthComm:[card('3','s'),card('4','d'),card('5','c'),card('6','h'),card('9','d')],
      uthPrivate:card('A','s'), uthRevealComm:0, uthPrevRevealComm:0, uthRaised:false,
    }, () => {
      render();
      const comm = document.getElementById('uth-community-hand');
      assert(comm && comm.classList.contains('sixth-sense'), 'community row flagged for the 6th card');
      const slot = comm.querySelector('#uth-priv-slot');
      assert(slot, 'private slot present');
      assert(slot.innerHTML.includes('YOU'), 'tagged YOU');
      assert(slot.querySelector('.back'), 'face-down before the turn');
    });
  });

  it('turn render: the private card flips face-up (no longer a back) for the final bet', () => {
    withUth({
      screen:'uth', uthPhase:'turn', forcedMod:'uth_sixth_card', uthHand:0, uthHistory:[], chips:800,
      uthHole:[card('K','s'),card('K','h')], uthDealer:[card('7','d'),card('2','c')],
      uthComm:[card('3','s'),card('4','d'),card('5','c'),card('6','h'),card('9','d')],
      uthPrivate:card('A','s'), uthRevealComm:5, uthPrevRevealComm:5, uthRaised:false,
    }, () => {
      render();
      const slot = document.getElementById('uth-priv-slot');
      assert(slot && !slot.querySelector('.back'), 'face-up at the turn');
      assert(slot.innerHTML.includes('YOU'), 'still tagged YOU');
    });
  });
});

// ─── Time Travel (uth_time_travel): once-per-day street re-deal ──────────────
describe('uth_time_travel — Time Travel re-deal', () => {
  const _flopState = (over = {}) => ({
    screen:'uth', uthPhase:'flop', uthAnte:100, uthHand:0, uthHistory:[], chips:800,
    forcedMod:'uth_time_travel', timeTravelUsed:false, uthRedealPtr:27,
    uthHole:[card('K','s'),card('K','h')], uthDealer:[card('7','d'),card('2','c')],
    uthComm:[card('3','s'),card('4','d'),card('5','c'),card('6','h'),card('8','d')],
    uthRevealComm:3, uthPrevRevealComm:3, ...over,
  });
  const _id = c => c.r + c.s;

  it('flop re-deal swaps the 3 flop cards for deck-tail cards and marks the day used', () => {
    withUth(_flopState(), () => {
      const expected = [DEAL.uthDeck[27], DEAL.uthDeck[28], DEAL.uthDeck[29]].map(_id);
      doTimeTravel();
      assertEqual(S.timeTravelUsed, true, 'daily re-deal consumed');
      assertEqual(S.uthRedealPtr, 30, 'tail pointer advances by 3');
      for (let i = 0; i < 3; i++) assertEqual(_id(S.uthComm[i]), expected[i], `flop card ${i} replaced`);
      assertEqual(_id(S.uthComm[3]), _id(card('6','h')), 'turn card untouched');
      assertEqual(_id(S.uthComm[4]), _id(card('8','d')), 'river card untouched');
    });
  });

  it('turn re-deal swaps only cards 3 and 4', () => {
    withUth(_flopState({ uthPhase:'turn', uthRevealComm:5, uthPrevRevealComm:5 }), () => {
      const expected = [DEAL.uthDeck[27], DEAL.uthDeck[28]].map(_id);
      doTimeTravel();
      assertEqual(S.uthRedealPtr, 29, 'tail pointer advances by 2');
      assertEqual(_id(S.uthComm[0]), _id(card('3','s')), 'flop untouched');
      assertEqual(_id(S.uthComm[3]), expected[0], 'turn card replaced');
      assertEqual(_id(S.uthComm[4]), expected[1], 'river card replaced');
    });
  });

  it('is a no-op once already used', () => {
    withUth(_flopState({ timeTravelUsed:true }), () => {
      const before = S.uthComm.map(_id).join();
      doTimeTravel();
      assertEqual(S.uthComm.map(_id).join(), before, 'used → board unchanged');
    });
  });

  it('is a no-op without the modifier', () => {
    withUth(_flopState({ forcedMod:{} }), () => {
      const before = S.uthComm.map(_id).join();
      doTimeTravel();
      assertEqual(S.uthComm.map(_id).join(), before, 'no modifier → board unchanged');
      assertEqual(S.timeTravelUsed, false);
    });
  });

  it('tail cards (27+) never overlap any hand\'s dealt cards, so a re-deal cannot duplicate one', () => {
    const dealt = new Set(DEAL.uthDeck.slice(0, 27).map(_id)); // hands 0-2 use indices 0..26
    for (let p = 27; p < 32; p++) {
      assert(!dealt.has(_id(DEAL.uthDeck[p])), `tail card at ${p} is not in any hand`);
    }
  });
});
