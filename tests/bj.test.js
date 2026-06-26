// ─── Stubs for UI/audio not available outside the main app ───────────────────
if (typeof render            === 'undefined') window.render            = () => {};
if (typeof updateChipDisplay === 'undefined') window.updateChipDisplay = () => {};
if (typeof sndBigWin         === 'undefined') window.sndBigWin         = () => {};
if (typeof sndCard           === 'undefined') window.sndCard           = () => {};
if (typeof sndShuffle        === 'undefined') window.sndShuffle        = cb => { if (cb) cb(); };

// ─── Setup ────────────────────────────────────────────────────────────────────
const _bjSavedSeedFlag = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const _bjCleanJson = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
function _bjRestoreS() {
  const r = JSON.parse(_bjCleanJson);
  r.pkHeld = new Set(r.pkHeld);
  Object.assign(S, r);
}

// Configures S for a no-split hand, calls bjResolve(true), runs fn(), then restores.
// chips should be post-bet-deduction (i.e. original chips minus the bet already taken).
// dealer cards must total >= 17 so bjResolve doesn't try to draw from the shoe.
function withBJ({ player, dealer, bet, chips, forcedMod = {}, doubled = false }, fn) {
  S.forcedMod    = forcedMod;
  S.bjPlayer     = player.map(([r, s]) => card(r, s));
  S.bjDealer     = dealer.map(([r, s]) => card(r, s));
  S.bjBet        = bet;
  S.chips        = chips;
  S.bjSplit      = false;
  S.bjSplitHands = [];
  S.bjDoubled    = doubled;
  S.bjHistory    = [];
  S.bjPhase      = 'play';
  S.bjHand       = 0;
  try {
    bjResolve(true); // dealerDrawn=true: skip animation path, dealer already at 17+
    fn();
  } finally {
    _bjRestoreS();
  }
}

// ─── Normal outcomes ──────────────────────────────────────────────────────────

describe('bjResolve — win', () => {
  it('player wins: chips += bet×2', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 1100); // 900 + stake 100 + profit 100
    });
  });

  it('win with winMult=2 (all_in_or_skip): chips = start + stake + profit×2', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900, forcedMod: 'all_in_or_skip' }, () => {
      assertEqual(S.chips, 1200);
    });
  });

  it('dealer bust: player wins', () => {
    withBJ({ player: [['8','s'],['9','h']], dealer: [['K','d'],['Q','c'],['5','s']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 1100);
      assertEqual(S.bjHistory[0].result, 'win');
    });
  });
});

describe('bjResolve — lose & bust', () => {
  it('dealer wins: chips unchanged (bet already deducted)', () => {
    withBJ({ player: [['8','s'],['9','h']], dealer: [['K','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 900);
      assertEqual(S.bjHistory[0].result, 'lose');
      assertEqual(S.bjHistory[0].delta, -100);
    });
  });

  it('player busts: chips unchanged, result=bust', () => {
    withBJ({ player: [['K','s'],['Q','h'],['5','d']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 900);
      assertEqual(S.bjHistory[0].result, 'bust');
      assertEqual(S.bjHistory[0].delta, -100);
    });
  });
});

describe('bjResolve — push', () => {
  it('equal totals: stake returned, delta=0', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['9','d'],['K','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 1000);
      assertEqual(S.bjHistory[0].result, 'push');
      assertEqual(S.bjHistory[0].delta, 0);
    });
  });
});

describe('bjResolve — blackjack', () => {
  it('player BJ pays 1.5×: delta = floor(bet×1.5)', () => {
    withBJ({ player: [['A','s'],['K','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 1150); // 900 + 100 stake + 150 profit
      assertEqual(S.bjHistory[0].result, 'blackjack');
      assertEqual(S.bjHistory[0].delta, 150);
    });
  });

  it('floor applied on odd bet: bet=101, floor(101×1.5)=151', () => {
    withBJ({ player: [['A','s'],['K','h']], dealer: [['7','d'],['J','c']], bet: 101, chips: 899 }, () => {
      assertEqual(S.bjHistory[0].delta, Math.floor(101 * 1.5));
    });
  });

  it('double_pay modifier (bj_payout=3.0): delta = floor(bet×3)', () => {
    withBJ({ player: [['A','s'],['K','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900, forcedMod: 'double_pay' }, () => {
      assertEqual(S.bjHistory[0].delta, Math.floor(100 * 3.0));
    });
  });

  it('player BJ + dealer BJ: push', () => {
    withBJ({ player: [['A','s'],['K','h']], dealer: [['A','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 1000);
      assertEqual(S.bjHistory[0].result, 'push');
    });
  });

  it('BJ with winMult=2: delta still uses bjMult floor, winMult stacks', () => {
    withBJ({ player: [['A','s'],['K','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900, forcedMod: 'all_in_or_skip' }, () => {
      // delta = floor(100 * 1.5 * 2) = floor(300) = 300
      assertEqual(S.bjHistory[0].delta, 300);
      assertEqual(S.chips, 1300); // 900 + 100 + 300
    });
  });
});

describe('bjResolve — double-down bonus', () => {
  it('bj_double_bonus: doubled win pays 2× profit', () => {
    // bet already doubled to 200, chips already deducted
    withBJ({ player: [['K','s'],['J','h']], dealer: [['9','d'],['8','c']], bet: 200, chips: 800, forcedMod: 'bj_double_bonus', doubled: true }, () => {
      // ddm=2: delta = 200*1*2=400, chips = 800+200+400=1400
      assertEqual(S.bjHistory[0].delta, 400);
      assertEqual(S.chips, 1400);
    });
  });

  it('bj_double_bonus: only applies on doubled hands', () => {
    withBJ({ player: [['K','s'],['J','h']], dealer: [['9','d'],['8','c']], bet: 100, chips: 900, forcedMod: 'bj_double_bonus', doubled: false }, () => {
      assertEqual(S.bjHistory[0].delta, 100); // ddm=1, normal win
    });
  });
});

describe('bjResolve — history record', () => {
  it('history entry has bet, result, delta, player, dealer arrays', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['7','d'],['J','c']], bet: 150, chips: 850 }, () => {
      const h = S.bjHistory[0];
      assertEqual(h.slot, 'bj', 'canonical slot');
      assertEqual(h.bet, 150);
      assertEqual(typeof h.result, 'string');
      assertEqual(typeof h.delta, 'number');
      assert(Array.isArray(h.player), 'player array');
      assert(Array.isArray(h.dealer), 'dealer array');
    });
  });

  it('bjHand increments after resolve', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.bjHand, 1);
    });
  });

  it('bjPhase set to result after resolve', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.bjPhase, 'result');
    });
  });
});

// ─── bjResolve — idempotency (a hand settles exactly once) ───────────────────
// Regression for the "win counted twice" class of bug: bjResolve is fired from timers and the
// refresh-resume path, so a stray/duplicate call must not re-credit or push a second history entry.
describe('bjResolve — settles a hand exactly once', () => {
  it('a duplicate bjResolve does not re-credit, double history, or re-advance the hand', () => {
    withBJ({ player: [['K','s'],['9','h']], dealer: [['7','d'],['J','c']], bet: 100, chips: 900 }, () => {
      assertEqual(S.chips, 1100);            // first resolve credited the win
      assertEqual(S.bjHistory.length, 1);
      assertEqual(S.bjHand, 1);
      bjResolve(true);                       // simulate a duplicate/late settle
      assertEqual(S.chips, 1100, 'chips unchanged by the second resolve');
      assertEqual(S.bjHistory.length, 1, 'no duplicate history entry');
      assertEqual(S.bjHand, 1, 'hand counter not advanced twice');
    });
  });

  it('a duplicate split resolve does not re-credit either', () => {
    withSplit({
      hands:  [[['K','s'],['9','h']], [['Q','d'],['8','c']]],
      bets:   [100, 100],
      dealer: [['7','d'],['J','c']],
      chips:  800,
    }, () => {
      assertEqual(S.chips, 1200);
      assertEqual(S.bjHistory.length, 1);
      bjResolve(true);
      assertEqual(S.chips, 1200, 'split chips unchanged by the second resolve');
      assertEqual(S.bjHistory.length, 1, 'no duplicate split history entry');
    });
  });
});

// ─── bjResolve — split outcomes ──────────────────────────────────────────────
// The split branch in bjResolve aggregates per-hand results into S.bjResult.delta.
// chips are pre-deducted (one bet per hand); each winning/push hand returns its stake.

// Per-hand outcome semantics (from bj.js):
//   win:  delta = +bet (×modifiers); chips += bet + delta
//   push: delta =  0;               chips += bet  (stake returned)
//   bust: delta = -bet              (stake lost)
//   lose: delta = -bet              (stake lost)
function withSplit({ hands, bets, dealer, doubled, chips, forcedMod = {} }, fn) {
  S.forcedMod        = forcedMod;
  S.bjSplit          = true;
  S.bjSplitHands     = hands.map(h => h.map(([r,s]) => card(r,s)));
  S.bjSplitBets      = bets.slice();
  S.bjSplitResults   = [];
  S.bjSplitDone      = hands.map(() => true);
  S.bjSplitDoubled   = doubled || hands.map(() => false);
  S.bjSplitAnimFrom  = hands.map(() => 0);
  S.bjDealer         = dealer.map(([r,s]) => card(r,s));
  S.bjBet            = 0;
  S.chips            = chips;
  S.bjHistory        = [];
  S.bjPhase          = 'play';
  S.bjHand           = 0;
  try {
    bjResolve(true);
    fn();
  } finally { _bjRestoreS(); }
}

describe('bjResolve — split: both hands win', () => {
  it('two winning hands return both stakes + profit', () => {
    withSplit({
      hands:  [[['K','s'],['9','h']], [['Q','d'],['8','c']]], // 19, 18
      bets:   [100, 100],
      dealer: [['7','d'],['J','c']], // 17
      chips:  800, // 1000 - 200 in bets
    }, () => {
      // each wins: stake 100 + profit 100. Total: 800 + 200 + 200 = 1200.
      assertEqual(S.chips, 1200);
      assertEqual(S.bjResult.delta, 200);
      assertEqual(S.bjSplitResults[0].result, 'win');
      assertEqual(S.bjSplitResults[1].result, 'win');
    });
  });
});

describe('bjResolve — split: split-then-bust aggregation', () => {
  it('one win + one bust = stake returned only on the win', () => {
    withSplit({
      hands:  [[['K','s'],['9','h']], [['K','d'],['Q','c'],['5','h']]], // 19, BUST
      bets:   [100, 100],
      dealer: [['7','d'],['J','c']], // 17
      chips:  800, // 1000 - 200 in bets
    }, () => {
      // win: stake 100 + profit 100 returned. bust: nothing returned.
      // Final: 800 + 100 + 100 = 1000.
      assertEqual(S.chips, 1000);
      assertEqual(S.bjResult.delta, 0); // +100 win, -100 bust = 0 net
      assertEqual(S.bjSplitResults[0].result, 'win');
      assertEqual(S.bjSplitResults[1].result, 'bust');
    });
  });
});

describe('bjResolve — split: all hands bust', () => {
  it('all-bust returns nothing, net delta is -sum(bets)', () => {
    withSplit({
      hands:  [
        [['K','s'],['Q','h'],['5','d']],  // BUST
        [['K','d'],['J','c'],['4','h']],  // BUST
      ],
      bets:   [100, 100],
      dealer: [['7','d'],['J','c']], // 17 (irrelevant, players already bust)
      chips:  800, // 1000 - 200 in bets
    }, () => {
      assertEqual(S.chips, 800, 'chips unchanged — both stakes lost');
      assertEqual(S.bjResult.delta, -200);
      assert(S.bjSplitResults.every(r => r.result === 'bust'));
    });
  });
});

describe('bjResolve — split: mixed win/lose/push', () => {
  it('aggregates per-hand chip flow correctly', () => {
    withSplit({
      hands:  [
        [['K','s'],['9','h']], // 19 → win vs dealer 17
        [['7','s'],['9','h']], // 16 → lose vs dealer 17
        [['10','d'],['7','c']], // 17 → push vs dealer 17
      ],
      bets:   [100, 100, 100],
      dealer: [['7','d'],['J','c']], // 17
      chips:  700, // 1000 - 300 in bets
    }, () => {
      // win: +stake +profit = 200 returned. lose: 0 returned. push: stake 100 returned.
      // Final: 700 + 200 + 0 + 100 = 1000. Net delta: +100 -100 +0 = 0.
      assertEqual(S.chips, 1000);
      assertEqual(S.bjResult.delta, 0);
      assertEqual(S.bjSplitResults[0].result, 'win');
      assertEqual(S.bjSplitResults[1].result, 'lose');
      assertEqual(S.bjSplitResults[2].result, 'push');
    });
  });
});

describe('bjResolve — split: dealer busts means all non-bust players win', () => {
  it('dealer 22 → both players (15, 19) win without comparison', () => {
    withSplit({
      hands:  [[['7','s'],['8','h']], [['10','d'],['9','c']]], // 15, 19
      bets:   [100, 100],
      dealer: [['K','s'],['Q','h'],['5','d']], // 25 BUST
      chips:  800,
    }, () => {
      // Both win even though 15 < 17. dv > 21 short-circuits comparison.
      assertEqual(S.chips, 1200);
      assertEqual(S.bjResult.delta, 200);
      assertEqual(S.bjSplitResults[0].result, 'win');
      assertEqual(S.bjSplitResults[1].result, 'win');
    });
  });
});

describe('bjResolve — split: 4-way mixed outcomes', () => {
  it('four hands with win/bust/win/lose nets correctly', () => {
    withSplit({
      hands:  [
        [['K','s'],['9','h']],            // 19 win
        [['K','d'],['Q','c'],['5','h']],  // BUST
        [['10','s'],['9','d']],           // 19 win
        [['7','c'],['8','d']],            // 15 lose
      ],
      bets:   [100, 100, 100, 100],
      dealer: [['7','d'],['J','c']], // 17
      chips:  600, // 1000 - 400 in bets
    }, () => {
      // win: +200, bust: 0, win: +200, lose: 0 returned. Net delta: +100 -100 +100 -100 = 0.
      assertEqual(S.chips, 1000);
      assertEqual(S.bjResult.delta, 0);
      assertEqual(S.bjSplitResults.filter(r => r.result === 'win').length, 2);
      assertEqual(S.bjSplitResults.filter(r => r.result === 'bust').length, 1);
      assertEqual(S.bjSplitResults.filter(r => r.result === 'lose').length, 1);
    });
  });
});

describe('bjResolve — split: history records aggregated delta', () => {
  it('bjHistory entry stores summed bet and total delta', () => {
    withSplit({
      hands:  [[['K','s'],['9','h']], [['Q','d'],['8','c']]],
      bets:   [100, 100],
      dealer: [['7','d'],['J','c']],
      chips:  800,
    }, () => {
      assertEqual(S.bjHistory.length, 1);
      assertEqual(S.bjHistory[0].slot, 'bj', 'canonical slot');
      assertEqual(S.bjHistory[0].bet, 200, 'history bet should be sum of split bets');
      assertEqual(S.bjHistory[0].result, 'split');
      assertEqual(S.bjHistory[0].delta, 200);
    });
  });
});

// ─── _bjResumeAfterRefresh — recover a hand interrupted by a page refresh ────────
// Regression for "stuck mid-hand after a refresh": after the player Stands or Doubles there is a
// short delay before the dealer's turn begins. If the page reloads in that window the timer is gone,
// so resume must restart the dealer's turn (reveal, or advance to the next split hand). A stand
// leaves the cards unchanged — indistinguishable from "still deciding" — so the intent is persisted
// in S.bjActed. These assert the resume *fires* (schedules a timer) exactly when it should; without
// the fix the stand/double cases schedule nothing and the hand strands in 'play'.
describe('_bjResumeAfterRefresh — resumes a stood/doubled hand lost to a refresh', () => {
  const H = (r, s) => card(r, s);
  // Run _bjResumeAfterRefresh against a crafted play-phase state with setTimeout captured (not run).
  // Returns how many timers it scheduled (1 = a resume was kicked off, 0 = left to the player).
  function resumeTimers(state) {
    const origST = window.setTimeout;
    const timers = [];
    window.setTimeout = (f, d) => { timers.push({ f, d: d || 0 }); return timers.length; };
    try {
      Object.assign(S, {
        screen: 'bj', bjPhase: 'play', forcedMod: {},
        bjSplit: false, bjDealerReveal: false, bjCelebrating: false, bjActed: false,
        bjPlayer: [], bjDealer: [H('9','d'), H('7','c')], bjIdx: 0,
        bjSplitHands: [], bjSplitDone: [], bjSplitActive: 0,
      }, state);
      _bjResumeAfterRefresh();
      return timers.length;
    } finally {
      window.setTimeout = origST;
      resetBJHand();   // clears the _bjResolving lock the resume may have set
      _bjRestoreS();   // back to the clean baseline
    }
  }

  it('non-split: a stand under 21 (bjActed) resumes the dealer reveal', () => {
    assertEqual(resumeTimers({ bjActed: true, bjPlayer: [H('K','s'), H('9','h')] }), 1);
  });
  it('non-split: a double under 21 (bjActed, 3 cards) resumes the dealer reveal', () => {
    assertEqual(resumeTimers({ bjActed: true, bjDoubled: true, bjBet: 200, bjPlayer: [H('5','s'), H('4','h'), H('9','d')] }), 1);
  });
  it('non-split: bust resumes even without bjActed (the cards are self-evident)', () => {
    assertEqual(resumeTimers({ bjActed: false, bjPlayer: [H('K','s'), H('Q','h'), H('5','d')] }), 1);
  });
  it('non-split: a still-deciding hand (no bjActed, under 21) does NOT resume', () => {
    assertEqual(resumeTimers({ bjActed: false, bjPlayer: [H('K','s'), H('5','h')] }), 0);
  });
  it('split: a stand on the active sub-hand (bjActed) resumes the advance', () => {
    assertEqual(resumeTimers({ bjSplit: true, bjActed: true, bjSplitActive: 0,
      bjSplitHands: [[H('K','s'), H('9','h')], [H('8','h')]], bjSplitDone: [false, false] }), 1);
  });
  it('split: a still-deciding active sub-hand does NOT resume', () => {
    assertEqual(resumeTimers({ bjSplit: true, bjActed: false, bjSplitActive: 0,
      bjSplitHands: [[H('K','s'), H('5','h')], [H('8','h')]], bjSplitDone: [false, false] }), 0);
  });
});

// bjStand / bjDouble must persist the "acted" intent so the above resume can fire after a refresh.
describe('bjStand / bjDouble — persist bjActed for refresh recovery', () => {
  it('bjStand sets S.bjActed', () => {
    _bjRestoreS();
    Object.assign(S, { screen:'bj', bjPhase:'play', bjSplit:false, bjPlayer:[card('K','s'),card('9','h')], bjDealer:[card('9','d'),card('7','c')], bjBet:100, chips:900, bjIdx:0 });
    _bjResolving = false;
    const origST = window.setTimeout; window.setTimeout = () => 0; // swallow the reveal timer
    try { bjStand(); assert(S.bjActed, 'bjStand should set bjActed'); }
    finally { window.setTimeout = origST; resetBJHand(); _bjRestoreS(); }
  });
});

// ─── Casino dealer peek — a dealer blackjack ends the hand before the player can act ──────────────
// A dealer sitting on a natural blackjack is revealed immediately after the deal: the player never
// gets to hit/double/split into a sure loss, and pays out as a push (matching blackjack) or a loss
// of just the original bet. A dealer BJ always shows an Ace or a 10, so this is exactly the casino
// peek. (bjResolve already settles correctly once play is locked to two cards; these lock in the
// deal-time peek, the refresh recovery, and the settlement.)
describe('bjDeal — dealer peek for blackjack', () => {
  const C = (r, s) => card(r, s);
  // Deal a rigged hand with audio + timers stubbed so the sndShuffle callback runs synchronously and
  // no real timer fires. Returns the post-deal flags. player/dealer are arrays of [rank, suit].
  function deal(player, dealer) {
    const origST = window.setTimeout, origShuffle = window.sndShuffle, origShoe = DEAL.bjShoe.slice(0, 4);
    window.setTimeout = () => 0;                  // swallow the peek / celebrate timers
    window.sndShuffle = cb => { if (cb) cb(); };  // run the deal callback synchronously
    DEAL.bjShoe.splice(0, 4, C(...player[0]), C(...player[1]), C(...dealer[0]), C(...dealer[1]));
    Object.assign(S, { screen:'bj', forcedMod:{}, bjPhase:'bet', bjBet:100, chips:1000, bjIdx:0, bjHistory:[], bjHand:0, bjSplit:false });
    _bjResolving = false; S.bjCelebrating = false;
    try {
      bjDeal();
      return { resolving: _bjResolving, celebrating: S.bjCelebrating, phase: S.bjPhase };
    } finally {
      window.setTimeout = origST; window.sndShuffle = origShuffle;
      DEAL.bjShoe.splice(0, 4, ...origShoe); resetBJHand(); _bjRestoreS();
    }
  }

  it('a dealer blackjack locks the player out immediately', () => {
    const r = deal([['K','s'],['9','h']], [['A','d'],['10','c']]); // dealer BJ, player 19
    assert(r.resolving,    'player is locked during the peek (cannot hit/double/split)');
    assert(!r.celebrating, 'no player celebration when the dealer has blackjack');
  });
  it('no dealer blackjack leaves the player free to act', () => {
    const r = deal([['K','s'],['9','h']], [['7','d'],['9','c']]); // dealer 16, player 19
    assert(!r.resolving,   'player can act');
    assert(!r.celebrating, 'no celebration');
  });
  it('player blackjack with no dealer blackjack celebrates the win', () => {
    const r = deal([['A','s'],['K','h']], [['7','d'],['9','c']]); // player BJ, dealer 16
    assert(r.celebrating, 'player blackjack celebrates');
  });
  it('a dealer blackjack takes priority over the player blackjack (push via the peek, no celebration)', () => {
    const r = deal([['A','s'],['K','h']], [['A','d'],['Q','c']]); // both blackjack
    assert(r.resolving,    'the peek path runs');
    assert(!r.celebrating, 'no celebration — settled as a push by the dealer reveal');
  });
});

// ─── Soft Landing (bj_safe_hit) — first hit never busts ─────────────────────────
// The live swap (_bjSafeHitSwap, bj.js) reorders the shoe in place at S.bjIdx so a hand's first hit
// can't bust; the engine twin (_replaySafeHitSwap, engine.js) mirrors it from the stored shoe. No
// extra draw, so the deck stays aligned and the server replay matches byte-for-byte.
describe('Soft Landing — _bjSafeHitSwap (live)', () => {
  const C = (r, s) => card(r, s);
  const hand = (...cs) => cs.map(([r, s]) => C(r, s));
  // Run fn with a controlled shoe positioned at S.bjIdx = base; restore the real shoe + idx after.
  // The live swap now bounds its search to this hand's segment (⌊len/3⌋ for hand 0), so pad the shoe
  // to 3× the provided cards — the segment then spans exactly the cards under test (fillers sit past it).
  function withShoe(cards, base, fn) {
    const origShoe = DEAL.bjShoe, origIdx = S.bjIdx, origHand = S.bjHand;
    const built = cards.map(([r, s]) => C(r, s));
    while (built.length < cards.length * 3) built.push(C('K', 's'));
    DEAL.bjShoe = built;
    S.bjIdx = base; S.bjHand = 0;
    try { return fn(); } finally { DEAL.bjShoe = origShoe; S.bjIdx = origIdx; S.bjHand = origHand; }
  }
  it('swaps a busting first-hit card for the nearest safe one (hard 16)', () => {
    withShoe([['6','d'],['3','c'],['9','s']], 0, () => {
      _bjSafeHitSwap(hand(['10','s'],['6','h']));            // 16; the 6 would bust (22)
      assertEqual(DEAL.bjShoe[0].r, '3', 'nearest non-busting card moved into the draw slot');
      assert(hVal([C('10','s'),C('6','h'),DEAL.bjShoe[0]]) <= 21, 'first hit stays ≤21');
    });
  });
  it('leaves an already-safe first-hit card untouched', () => {
    withShoe([['3','c'],['6','d']], 0, () => {
      _bjSafeHitSwap(hand(['10','s'],['6','h']));            // 16 + 3 = 19, already safe
      assertEqual(DEAL.bjShoe[0].r, '3', 'no swap when the natural draw is safe');
    });
  });
  it('skips past multiple busting cards to the nearest safe one', () => {
    withShoe([['K','d'],['Q','c'],['2','s']], 0, () => {
      _bjSafeHitSwap(hand(['10','s'],['6','h']));            // K, Q bust; 2 is first safe
      assertEqual(DEAL.bjShoe[0].r, '2');
    });
  });
  it('counts an Ace as 1 to stay safe at hard 20', () => {
    withShoe([['5','d'],['A','c']], 0, () => {
      _bjSafeHitSwap(hand(['10','s'],['10','h']));           // 20; only an Ace (=1 → 21) is safe
      assertEqual(DEAL.bjShoe[0].r, 'A');
      assertEqual(hVal([C('10','s'),C('10','h'),DEAL.bjShoe[0]]), 21);
    });
  });
  it('swaps at S.bjIdx, not index 0', () => {
    withShoe([['2','s'],['7','h'],['6','d'],['4','c']], 2, () => {
      _bjSafeHitSwap(hand(['10','s'],['6','h']));            // idx 2 = 6 busts; idx 3 = 4 safe
      assertEqual(DEAL.bjShoe[2].r, '4', 'swap happens at the current draw position');
      assertEqual(DEAL.bjShoe[0].r, '2', 'earlier cards untouched');
    });
  });
});

describe('Soft Landing — _replaySafeHitSwap (engine twin) gate + first-hit guard', () => {
  const C = (r, s) => card(r, s);
  const modOn = k => k === 'bj_safe_hit';
  const modOff = () => null;
  it('on + first hit (length 2): swaps the busting card', () => {
    const shoe = [C('6','d'), C('3','c')];
    _replaySafeHitSwap(shoe, 0, [C('10','s'), C('6','h')], modOn);
    assertEqual(shoe[0].r, '3', 'mod on + length 2 → swap');
  });
  it('mod off: no swap', () => {
    const shoe = [C('6','d'), C('3','c')];
    _replaySafeHitSwap(shoe, 0, [C('10','s'), C('6','h')], modOff);
    assertEqual(shoe[0].r, '6', 'mod off → untouched');
  });
  it('later hit (hand length > 2): not protected', () => {
    const shoe = [C('6','d'), C('3','c')];
    _replaySafeHitSwap(shoe, 0, [C('7','s'), C('2','h'), C('7','d')], modOn); // 16, length 3
    assertEqual(shoe[0].r, '6', 'only the first hit is protected');
  });
});

// ─── Double Vision (bj_two_hands) — two candidate hands, pick one ───────────────
// The whole hand is dealt from a fresh per-hand deck (S.bjDeck2) routed through _bjDraw, so the
// shared seeded shoe is untouched. The player keeps one of two candidate hands; a natural is auto-kept.
describe('Double Vision — _bjDraw routing', () => {
  const C = (r, s) => card(r, s);
  it('draws from bjDeck2 (advancing bjDeck2Idx) when set, else the shared shoe at bjIdx', () => {
    try {
      S.bjDeck2 = [C('A','s'), C('K','d')]; S.bjDeck2Idx = 0;
      assertEqual(_bjDraw().r, 'A'); assertEqual(_bjDraw().r, 'K');
      assertEqual(S.bjDeck2Idx, 2, 'fresh-deck cursor advanced');
      S.bjDeck2 = null; S.bjIdx = 0;
      const top = DEAL.bjShoe[0];
      assertEqual(_bjDraw(), top, 'falls back to the shared shoe'); assertEqual(S.bjIdx, 1);
    } finally { _bjRestoreS(); }
  });
});

describe('Double Vision — bjDeal + bjPickHand', () => {
  const C = (r, s) => card(r, s);
  // Deal under the mod with a rigged fresh deck (shuffle stubbed) and timers/audio swallowed.
  function dealTwo(deck) {
    const origST = window.setTimeout, origShuffle = window.sndShuffle, origShuf = window.shuffle;
    window.setTimeout = () => 0;
    window.sndShuffle = cb => { if (cb) cb(); };
    window.shuffle = () => deck.map(([r, s]) => C(r, s));
    Object.assign(S, { screen:'bj', forcedMod:'bj_two_hands', bjPhase:'bet', bjBet:100, chips:1000, bjIdx:0, bjHistory:[], bjHand:0, bjSplit:false, tx:[] });
    _bjResolving = false; S.bjCelebrating = false;
    try {
      bjDeal();
      return { phase:S.bjPhase, candidates:S.bjCandidates, dealer:[...S.bjDealer], deck2Idx:S.bjDeck2Idx, bjIdx:S.bjIdx, player:[...S.bjPlayer], celebrating:S.bjCelebrating, tx:[...S.tx], shoeTop:DEAL.bjShoe[0] };
    } finally {
      window.setTimeout = origST; window.sndShuffle = origShuffle; window.shuffle = origShuf;
      resetBJHand(); _bjRestoreS();
    }
  }

  it('deals two candidate hands + dealer from the fresh deck, leaving the shared shoe untouched', () => {
    const shoeTopBefore = DEAL.bjShoe[0];
    // A=5,6 (11) · B=9,7 (16) · dealer=10,8 (18) — no naturals → the pick phase.
    const r = dealTwo([['5','s'],['6','d'],['9','h'],['7','c'],['10','d'],['8','s'],['2','h'],['3','c']]);
    assertEqual(r.phase, 'pick', 'no natural → pick phase');
    assertEqual(r.candidates.length, 2, 'two candidate hands');
    assertEqual(r.candidates[0].length, 2); assertEqual(r.candidates[1].length, 2);
    assertEqual(hVal(r.candidates[0]), 11); assertEqual(hVal(r.candidates[1]), 16);
    assertEqual(r.dealer.length, 2);
    assertEqual(r.deck2Idx, 6, 'six cards drawn from the fresh deck (2+2 candidates + 2 dealer)');
    assertEqual(r.bjIdx, 0, 'shared shoe cursor never moved');
    assertEqual(r.shoeTop, shoeTopBefore, 'shared shoe untouched');
  });

  it('auto-keeps a candidate natural (no pick event) and plays it out', () => {
    // A=A,K (blackjack) · B=9,7 · dealer=9,7 (not a natural) → auto-pick A, celebrate.
    const r = dealTwo([['A','s'],['K','d'],['9','h'],['7','c'],['9','d'],['7','s']]);
    assertEqual(r.phase, 'play', 'natural skips the pick phase');
    assert(isBJ(r.player), 'the natural candidate was kept');
    assert(r.celebrating, 'player blackjack celebrates');
    assert(!r.tx.some(e => e.a === 'pick'), 'no pick decision is logged for an auto-kept natural');
  });

  it('bjPickHand commits the chosen candidate, logs the pick, and advances to play', () => {
    const origST = window.setTimeout; window.setTimeout = () => 0;
    Object.assign(S, { screen:'bj', forcedMod:'bj_two_hands', bjPhase:'pick', bjBet:100, chips:900, bjHand:0, bjHistory:[], bjSplit:false, tx:[],
      bjCandidates:[[C('5','s'),C('6','d')],[C('9','h'),C('7','c')]], bjDealer:[C('10','d'),C('8','s')], bjDeck2:[C('2','s')], bjDeck2Idx:0 });
    _bjResolving = false;
    try {
      bjPickHand(1);
      assertEqual(S.bjPhase, 'play', 'advances to play');
      assertEqual(hVal(S.bjPlayer), 16, 'kept candidate B (9,7)');
      assertEqual(S.bjCandidates, null, 'candidates cleared');
      const pick = S.tx.find(e => e.a === 'pick');
      assert(pick && pick.g === 'bj' && pick.s === 1, 'pick event logged with s=1');
    } finally { window.setTimeout = origST; resetBJHand(); _bjRestoreS(); }
  });

  it('bjPickHand ignores an out-of-range index and a non-pick phase', () => {
    Object.assign(S, { bjPhase:'pick', bjCandidates:[[C('5','s'),C('6','d')],[C('9','h'),C('7','c')]], tx:[] });
    try {
      bjPickHand(2); // invalid index
      assertEqual(S.bjPhase, 'pick', 'invalid index is a no-op');
      assert(!S.tx.some(e => e.a === 'pick'), 'nothing logged');
    } finally { _bjRestoreS(); }
  });
});

describe('bjResolve — dealer blackjack outcome', () => {
  it('player loses only the original bet to a dealer blackjack (no extra from doubling/splitting)', () => {
    withBJ({ player:[['K','s'],['9','h']], dealer:[['A','d'],['10','c']], bet:100, chips:900 }, () => {
      assertEqual(S.bjResult.result, 'lose', 'non-blackjack hand loses to the dealer blackjack');
      assertEqual(S.bjResult.delta, -100, 'only the original bet is lost');
    });
  });
  it('a matching player blackjack pushes against the dealer blackjack', () => {
    withBJ({ player:[['A','s'],['K','h']], dealer:[['A','d'],['Q','c']], bet:100, chips:900 }, () => {
      assertEqual(S.bjResult.result, 'push');
      assertEqual(S.bjResult.delta, 0);
    });
  });
});

describe('bjDeal peek — supporting guards', () => {
  it('_bjResumeAfterRefresh resumes the reveal if a refresh lands during the dealer-blackjack peek', () => {
    const origST = window.setTimeout; const timers = [];
    window.setTimeout = (f, d) => { timers.push({ f, d }); return timers.length; };
    Object.assign(S, { screen:'bj', bjPhase:'play', forcedMod:{}, bjSplit:false, bjDealerReveal:false,
      bjCelebrating:false, bjActed:false, bjPlayer:[card('K','s'),card('5','h')], bjDealer:[card('A','d'),card('10','c')], bjIdx:0 });
    try { _bjResumeAfterRefresh(); assertEqual(timers.length, 1, 'a dealer blackjack resumes the reveal even before the player acts'); }
    finally { window.setTimeout = origST; resetBJHand(); _bjRestoreS(); }
  });
  it('bjSplit is a no-op while resolving (so a split cannot sneak in during the peek)', () => {
    Object.assign(S, { screen:'bj', bjPhase:'play', bjSplit:false, bjPlayer:[card('8','s'),card('8','h')],
      bjDealer:[card('A','d'),card('10','c')], bjBet:100, chips:900, bjIdx:0 });
    _bjResolving = true;
    try { bjSplit(); assert(!S.bjSplit, 'split is blocked while the hand is resolving'); }
    finally { _bjResolving = false; resetBJHand(); _bjRestoreS(); }
  });
  it('the result screen names a dealer-blackjack loss', () => {
    Object.assign(S, { screen:'bj', bjPhase:'result', forcedMod:{}, bjSplit:false, bjDealerReveal:true,
      bjPlayer:[card('K','s'),card('9','h')], bjDealer:[card('A','d'),card('10','c')],
      bjResult:{result:'lose',delta:-100}, bjHand:1, bjHistory:[{bet:100,result:'lose',delta:-100,player:[],dealer:[]}] });
    try { assert(screenBJ().includes('Dealer Blackjack'), 'headline names the dealer blackjack'); }
    finally { _bjRestoreS(); }
  });
});

// ─── Pure BJ resolvers (PRD integrity Phase 2 · Candidate 02) ─────────────────
// The payout × modifier ladder tested through its interface — no S, no DOM. `delta` is signed net
// profit (stake debited at deal), so a win returns bet+delta to the player back in bjResolve.
describe('resolveBJHand — the payout ladder (pure)', () => {
  const base = { wm: 1, bjMult: 1.5, ddm: 1 };
  it('natural blackjack pays floor(bet*bjMult*wm)', () => {
    assertDeepEqual(resolveBJHand({ pv: 21, pBJ: true, dv: 20, dBJ: false, bet: 100, ...base }), { result: 'blackjack', delta: 150 });
  });
  it('blackjack pay floors an odd half-chip', () => {
    assertDeepEqual(resolveBJHand({ pv: 21, pBJ: true, dv: 18, dBJ: false, bet: 25, ...base }), { result: 'blackjack', delta: 37 });
  });
  it('player and dealer blackjack push to zero', () => {
    assertDeepEqual(resolveBJHand({ pv: 21, pBJ: true, dv: 21, dBJ: true, bet: 100, ...base }), { result: 'push', delta: 0 });
  });
  it('player bust loses the bet regardless of dealer', () => {
    assertDeepEqual(resolveBJHand({ pv: 23, pBJ: false, dv: 18, dBJ: false, bet: 100, ...base }), { result: 'bust', delta: -100 });
  });
  it('beating the dealer wins bet*wm*ddm', () => {
    assertDeepEqual(resolveBJHand({ pv: 20, pBJ: false, dv: 18, dBJ: false, bet: 100, wm: 2, bjMult: 1.5, ddm: 2 }), { result: 'win', delta: 400 });
  });
  it('equal totals push; a lower total loses', () => {
    assertDeepEqual(resolveBJHand({ pv: 19, pBJ: false, dv: 19, dBJ: false, bet: 100, ...base }), { result: 'push', delta: 0 });
    assertDeepEqual(resolveBJHand({ pv: 17, pBJ: false, dv: 19, dBJ: false, bet: 100, ...base }), { result: 'lose', delta: -100 });
  });
  it('a dealer bust wins even on a low player total', () => {
    assertDeepEqual(resolveBJHand({ pv: 12, pBJ: false, dv: 24, dBJ: false, bet: 100, ...base }), { result: 'win', delta: 100 });
  });
});
describe('resolveBJSplitHand — no blackjack branch, wild-split mult (pure)', () => {
  it('a split 21 is an ordinary win, not a blackjack', () => {
    assertDeepEqual(resolveBJSplitHand({ pv: 21, dv: 19, bet: 100, wm: 1, ddm: 1, spm: 1 }), { result: 'win', delta: 100 });
  });
  it('wild split doubles the winning profit', () => {
    assertDeepEqual(resolveBJSplitHand({ pv: 20, dv: 18, bet: 100, wm: 1, ddm: 1, spm: 2 }), { result: 'win', delta: 200 });
  });
  it('bust loses the sub-hand bet; equal totals push', () => {
    assertDeepEqual(resolveBJSplitHand({ pv: 25, dv: 18, bet: 100, wm: 1, ddm: 1, spm: 2 }), { result: 'bust', delta: -100 });
    assertDeepEqual(resolveBJSplitHand({ pv: 18, dv: 18, bet: 100, wm: 1, ddm: 1, spm: 1 }), { result: 'push', delta: 0 });
  });
});
// The credit mapping as pure data (Candidate 5): each *Award returns the {op,n,reason} ledger that
// applyLedger replays, live and in replay. Asserting the ledger directly is the seam's test surface.
describe('bjAward / bjAwardSplit — settlement ledger (pure)', () => {
  it('win and blackjack credit stake + profit in one entry', () => {
    assertDeepEqual(bjAward('win', 100, 100), [{ op: 'credit', n: 200, reason: 'bj-win' }]);
    assertDeepEqual(bjAward('blackjack', 100, 150), [{ op: 'credit', n: 250, reason: 'bj-blackjack' }]);
  });
  it('push returns the stake; bust/lose credit nothing', () => {
    assertDeepEqual(bjAward('push', 100, 0), [{ op: 'credit', n: 100, reason: 'bj-push' }]);
    assertDeepEqual(bjAward('bust', 100, -100), []);
    assertDeepEqual(bjAward('lose', 100, -100), []);
  });
  it('split has win/push only (no blackjack branch)', () => {
    assertDeepEqual(bjAwardSplit('win', 50, 50), [{ op: 'credit', n: 100, reason: 'bj-split-win' }]);
    assertDeepEqual(bjAwardSplit('push', 50, 0), [{ op: 'credit', n: 50, reason: 'bj-split-push' }]);
    assertDeepEqual(bjAwardSplit('bust', 50, -50), []);
  });
});
// Candidate 2: bjRulesFor maps a mod accessor → the day's BJ rule bundle. ONE source for the scalars
// live (bjRules → getMod) and in replay (engine → _engMod), so the ||1.5/||17 defaults can't drift.
describe('bjRulesFor — declarative BJ rule bundle (pure)', () => {
  it('a vanilla day returns the defaults', () => {
    assertDeepEqual(bjRulesFor(() => null),
      { payout: 1.5, standAt: 17, doubleBonus: false, wildSplit: false, twoHands: false });
  });
  it('preset values override defaults; flags coerce to booleans', () => {
    const mod = k => ({ bj_payout: 3, bj_dealer_stand: 15, bj_double_bonus: 1, bj_wild_split: 1, bj_two_hands: 1 }[k] ?? null);
    assertDeepEqual(bjRulesFor(mod),
      { payout: 3, standAt: 15, doubleBonus: true, wildSplit: true, twoHands: true });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_bjSavedSeedFlag === null
  ? _ls.removeItem('gambdle_use_test_seed')
  : _ls.setItem('gambdle_use_test_seed', _bjSavedSeedFlag);
_bjRestoreS();
