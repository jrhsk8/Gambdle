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

// ─── Teardown ─────────────────────────────────────────────────────────────────
_bjSavedSeedFlag === null
  ? _ls.removeItem('gambdle_use_test_seed')
  : _ls.setItem('gambdle_use_test_seed', _bjSavedSeedFlag);
_bjRestoreS();
