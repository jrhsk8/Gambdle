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

// ─── Teardown ─────────────────────────────────────────────────────────────────
_bjSavedSeedFlag === null
  ? _ls.removeItem('gambdle_use_test_seed')
  : _ls.setItem('gambdle_use_test_seed', _bjSavedSeedFlag);
_bjRestoreS();
