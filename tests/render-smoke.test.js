// ─── Render smoke tests ───────────────────────────────────────────────────────
// Verifies that every game screen and phase renders without throwing and
// produces the expected DOM landmarks. A failure here means a player would
// get a blank/stuck screen in production.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _rsSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');
_ls.removeItem('gambdle_forced_mod');

const _rsKey  = getStateKey(); // 'gambdle_test_state'
const _rsSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _rsRestore = () => {
  const r = JSON.parse(_rsSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

// Merge clean state with overrides, call render(), assert on innerHTML, restore.
function withRender(overrides, fn) {
  const prev = _ls.getItem(_rsKey);
  const base = JSON.parse(_rsSnap); base.pkHeld = new Set(base.pkHeld);
  Object.assign(S, base, overrides);
  try {
    render();
    fn(document.getElementById('app').innerHTML);
  } finally {
    prev !== null ? _ls.setItem(_rsKey, prev) : _ls.removeItem(_rsKey);
    _rsRestore();
  }
}

// ─── Card / state fixtures ────────────────────────────────────────────────────
const _c   = (r, s) => card(r, s);
const _h   = (...specs) => specs.map(([r, s]) => card(r, s));

// BJ hands
const _bjWinPlayer  = _h(['K','s'],['9','h']);          // 19
const _bjWinDealer  = _h(['7','d'],['J','c']);           // 17
const _bjBustPlayer = _h(['K','s'],['Q','h'],['5','d']); // 25
const _bjBJPlayer   = _h(['A','s'],['K','d']);           // BJ
const _bjPushP      = _h(['9','s'],['8','h']);           // 17
const _bjPushD      = _h(['10','d'],['7','c']);          // 17

// UTH cards
const _uthComm  = _h(['K','s'],['Q','c'],['J','s'],['J','d'],['8','h']);
const _uthHoleP = _h(['A','s'],['A','c']);  // Pocket Aces
const _uthHoleD = _h(['2','d'],['7','h']);

// bestOf7 results (computed once; used in UTH result history entries)
const _uthPB = bestOf7([..._uthHoleP, ..._uthComm]); // Two Pair (AA JJ) — wins
const _uthDB = bestOf7([..._uthHoleD, ..._uthComm]); // One Pair  (JJ)   — loses

// A single resolved UTH win entry
const _uthWinEntry = {
  ante:50, blind:50, play:200, playMult:4,
  result:'win', delta:350, anteDelta:50, blindDelta:150, playDelta:200,
  playerBest:_uthPB, dealerBest:_uthDB, dealerQualifies:true,
};
const _uthLoseEntry = { ..._uthWinEntry, result:'lose', delta:-300, anteDelta:-50, blindDelta:-50, playDelta:-200, playerBest:_uthDB, dealerBest:_uthPB };
const _uthPushEntry = { ..._uthWinEntry, result:'push', delta:0,    anteDelta:0,   blindDelta:0,   playDelta:0,   playerBest:_uthPB, dealerBest:_uthPB };
const _uthFoldEntry = {
  ante:50, blind:50, play:0, playMult:0,
  result:'fold', delta:-100, anteDelta:-50, blindDelta:-50, playDelta:0,
  playerBest:null, dealerBest:null, dealerQualifies:false,
};

// Poker hand
const _pkCards = _h(['A','s'],['A','d'],['K','s'],['Q','c'],['J','h']);
const _pkHist  = [{ bet:100, result:'Two Pair', pts:2, delta:200 }];

// Roulette
const _rBetBlack  = { pick:46, bet:50 };
const _rResBlack  = { delta:-50, bets:[{ pick:46, won:false, delta:-50, pay:1, bet:50 }] };
const _rResWin    = { delta:50,  bets:[{ pick:46, won:true,  delta:50,  pay:1, bet:50 }] };
const _rResBJHist = [{ bet:100, result:'win', delta:100, player:[], dealer:[] }]; // for results screen

// ─── Intro ────────────────────────────────────────────────────────────────────

describe('render — intro screen', () => {
  it('renders without throwing and shows the start button', () => {
    withRender({ screen:'intro' }, html => {
      assert(html.includes('btn-gold'), 'start button present');
      assert(html.includes('Gambdle'),  'logo text present');
    });
  });
});

// ─── Blackjack — bet phase ────────────────────────────────────────────────────

describe('render — BJ bet phase', () => {
  it('normal: chip selector and deal button present', () => {
    withRender({ screen:'bj', bjPhase:'bet', chips:1000, bjBet:0 }, html => {
      assert(html.includes('chbtn'),   'chip buttons present');
      assert(html.includes('Deal'),    'deal button present');
    });
  });

  it('all_in_or_skip: shows all-in and skip buttons', () => {
    withRender({ screen:'bj', bjPhase:'bet', chips:500, bjBet:0, forcedMod:'all_in_or_skip' }, html => {
      assert(html.includes('All In'),    'all-in button present');
      assert(html.includes('Skip Hand'), 'skip button present');
    });
  });
});

// ─── Blackjack — play phase ───────────────────────────────────────────────────

describe('render — BJ play phase', () => {
  it('normal: dealer and player hand sections + action buttons', () => {
    withRender({
      screen:'bj', bjPhase:'play', chips:900,
      bjBet:100, bjHand:0, bjHistory:[],
      bjPlayer:_bjWinPlayer, bjDealer:_bjWinDealer,
    }, html => {
      assert(html.includes('act-btn'),     'action buttons present');
      assert(html.includes('Dealer'),      'dealer section present');
      assert(html.includes('Your Hand'),   'player section present');
    });
  });

  it('blackjack celebration: shows Blackjack! banner', () => {
    withRender({
      screen:'bj', bjPhase:'play', chips:850,
      bjBet:150, bjHand:0, bjHistory:[],
      bjPlayer:_bjBJPlayer, bjDealer:_bjWinDealer,
      bjCelebrating:true,
    }, html => {
      assert(html.includes('Blackjack!'), 'celebration banner present');
    });
  });

  it('dealer reveal: dealer hand fully shown', () => {
    withRender({
      screen:'bj', bjPhase:'play', chips:900,
      bjBet:100, bjHand:0, bjHistory:[],
      bjPlayer:_bjWinPlayer, bjDealer:_bjWinDealer,
      bjDealerReveal:true,
    }, html => {
      assert(html.includes('Dealer'), 'dealer section present');
    });
  });

  it('split: shows active hand and sidebar with other hands', () => {
    withRender({
      screen:'bj', bjPhase:'play', chips:700,
      bjBet:100, bjHand:0, bjHistory:[],
      bjPlayer:[], bjDealer:_bjWinDealer,
      bjSplit:true, bjSplitActive:0,
      bjSplitHands:[_bjWinPlayer, _bjWinPlayer],
      bjSplitBets:[100,100], bjSplitDone:[false,false],
      bjSplitDoubled:[false,false], bjSplitAnimFrom:[0,0],
    }, html => {
      assert(html.includes('bj-split-active'), 'active split hand present');
    });
  });
});

// ─── Blackjack — result phase ─────────────────────────────────────────────────

describe('render — BJ result phase', () => {
  it('win: shows You Win!', () => {
    withRender({
      screen:'bj', bjPhase:'result', chips:1100, bjHand:1,
      bjBet:100, bjPlayer:_bjWinPlayer, bjDealer:_bjWinDealer,
      bjResult:{ result:'win', delta:100 },
      bjHistory:[{ bet:100, result:'win', delta:100, player:[], dealer:[] }],
    }, html => {
      assert(html.includes('You Win!'), 'win headline present');
    });
  });

  it('lose: shows You Lose!', () => {
    withRender({
      screen:'bj', bjPhase:'result', chips:900, bjHand:1,
      bjBet:100, bjPlayer:_bjBustPlayer, bjDealer:_bjWinDealer,
      bjResult:{ result:'bust', delta:-100 },
      bjHistory:[{ bet:100, result:'bust', delta:-100, player:[], dealer:[] }],
    }, html => {
      assert(html.includes('You Bust!') || html.includes('You Lose!'), 'loss headline present');
    });
  });

  it('push: shows Push', () => {
    withRender({
      screen:'bj', bjPhase:'result', chips:1000, bjHand:1,
      bjBet:100, bjPlayer:_bjPushP, bjDealer:_bjPushD,
      bjResult:{ result:'push', delta:0 },
      bjHistory:[{ bet:100, result:'push', delta:0, player:[], dealer:[] }],
    }, html => {
      assert(html.includes('Push'), 'push headline present');
    });
  });

  it('blackjack: shows Blackjack headline', () => {
    withRender({
      screen:'bj', bjPhase:'result', chips:1150, bjHand:1,
      bjBet:100, bjPlayer:_bjBJPlayer, bjDealer:_bjWinDealer,
      bjResult:{ result:'blackjack', delta:150 },
      bjHistory:[{ bet:100, result:'blackjack', delta:150, player:[], dealer:[] }],
    }, html => {
      assert(html.includes('Blackjack'), 'BJ headline present');
    });
  });

  it('split result: shows per-hand breakdown table', () => {
    withRender({
      screen:'bj', bjPhase:'result', chips:1050, bjHand:1,
      bjBet:200, bjPlayer:[], bjDealer:_bjWinDealer, bjDealerAnimFrom:0,
      bjSplit:true,
      bjSplitHands:[_bjWinPlayer, _bjBustPlayer],
      bjSplitBets:[100,100],
      bjSplitResults:[{ result:'win', delta:100, bet:100 },{ result:'bust', delta:-100, bet:100 }],
      bjResult:{ result:'split', delta:0 },
      bjHistory:[{ bet:200, result:'split', delta:0, player:[], dealer:[] }],
    }, html => {
      assert(html.includes('bj-sr-hands'), 'split result breakdown present');
    });
  });
});

// ─── UTH — bet phase ──────────────────────────────────────────────────────────

describe('render — UTH bet phase', () => {
  it('normal: blind paytable and chip selector present', () => {
    withRender({ screen:'uth', uthPhase:'bet', chips:1000, uthAnte:0 }, html => {
      assert(html.includes('ptable'),       'blind paytable present');
      assert(html.includes('Ante'),         'ante label present');
    });
  });

  it('all_in_or_skip: shows all-in and skip buttons', () => {
    withRender({ screen:'uth', uthPhase:'bet', chips:500, uthAnte:0, forcedMod:'all_in_or_skip' }, html => {
      assert(html.includes('All In'),    'all-in button present');
      assert(html.includes('Skip Hand'), 'skip button present');
    });
  });
});

// ─── UTH — play phases ────────────────────────────────────────────────────────

describe('render — UTH play phases', () => {
  const _baseUTH = {
    screen:'uth', chips:800, uthAnte:100, uthPlay:0, uthPlayMult:0,
    uthHole:_uthHoleP, uthDealer:_uthHoleD, uthComm:_uthComm,
    uthRaised:false, uthRevealComm:0, uthPrevRevealComm:0, uthHand:0, uthHistory:[],
  };

  it('preflop: raise 4×/3× and check buttons present', () => {
    withRender({ ..._baseUTH, uthPhase:'preflop' }, html => {
      assert(html.includes('Raise 4'), 'raise 4× present');
      assert(html.includes('Check'),   'check button present');
    });
  });

  it('flop: 3 community cards revealed, raise 2× present', () => {
    withRender({ ..._baseUTH, uthPhase:'flop', uthRevealComm:3 }, html => {
      assert(html.includes('Raise 2'), 'raise 2× present');
      assert(html.includes('Community'), 'community cards label present');
    });
  });

  it('turn: 5 community cards revealed, fold option present', () => {
    withRender({ ..._baseUTH, uthPhase:'turn', uthRevealComm:5 }, html => {
      assert(html.includes('Fold'),    'fold button present');
      assert(html.includes('Raise 1'), 'raise 1× present');
    });
  });

  it('flop after raise: shows advance button instead of raise/check', () => {
    withRender({ ..._baseUTH, uthPhase:'flop', uthRevealComm:3, uthRaised:true, uthPlay:200, uthPlayMult:4 }, html => {
      assert(html.includes('Turn') || html.includes('River'), 'advance button present');
    });
  });

  it('reveal: dealer cards and community cards visible', () => {
    withRender({
      ..._baseUTH, uthPhase:'reveal',
      uthRevealComm:5, uthHand:1, uthPlay:200, uthPlayMult:4,
      uthHistory:[_uthWinEntry],
    }, html => {
      assert(html.includes('Dealer'), 'dealer section present');
    });
  });
});

// ─── UTH — result phase ───────────────────────────────────────────────────────

describe('render — UTH result phase', () => {
  const _baseUTHResult = {
    screen:'uth', uthPhase:'result', chips:1000, uthAnte:100,
    uthHole:_uthHoleP, uthDealer:_uthHoleD, uthComm:_uthComm,
    uthRevealComm:5, uthHand:1,
  };

  it('win: shows You Win! and per-bet breakdown', () => {
    withRender({ ..._baseUTHResult, uthHistory:[_uthWinEntry] }, html => {
      assert(html.includes('You Win!'),   'win headline present');
      assert(html.includes('Ante'),       'ante row present');
    });
  });

  it('lose: shows You Lose!', () => {
    withRender({ ..._baseUTHResult, chips:700, uthHistory:[_uthLoseEntry] }, html => {
      assert(html.includes('You Lose!'), 'lose headline present');
    });
  });

  it('push: shows Push', () => {
    withRender({ ..._baseUTHResult, uthHistory:[_uthPushEntry] }, html => {
      assert(html.includes('Push'), 'push headline present');
    });
  });

  it('fold: shows You Folded', () => {
    withRender({
      ..._baseUTHResult,
      uthHistory:[_uthFoldEntry],
      uthHole:_uthHoleP, uthDealer:_uthHoleD, uthComm:_uthComm,
    }, html => {
      assert(html.includes('Folded') || html.includes('fold'), 'fold headline present');
    });
  });
});

// ─── 5-Card Poker ─────────────────────────────────────────────────────────────

describe('render — poker phases', () => {
  it('bet: paytable present', () => {
    withRender({ screen:'poker', pkPhase:'bet', chips:1000, pkBet:0 }, html => {
      assert(html.includes('Royal Flush'), 'paytable present');
    });
  });

  it('hold: five cards with hold/replace tags', () => {
    withRender({ screen:'poker', pkPhase:'hold', chips:900, pkBet:100, pkCards:_pkCards, pkHeld:new Set() }, html => {
      assert(html.includes('hold-wrap'), 'hold wrappers present');
      assert(html.includes('HOLD') || html.includes('REPLACE'), 'hold tags present');
    });
  });

  it('draw: shows drawing replacements state', () => {
    withRender({
      screen:'poker', pkPhase:'draw', chips:900, pkBet:100,
      pkCards:_pkCards, pkFinal:_pkCards,
      pkHeld:new Set([0,1]), pkRevealStep:1,
    }, html => {
      assert(html.includes('Drawing') || html.includes('draw'), 'draw state present');
    });
  });

  it('result: shows hand name and chip delta', () => {
    withRender({
      screen:'poker', pkPhase:'result', chips:1200, pkBet:100,
      pkHand:1, pkHistory:_pkHist, pkFinal:_pkCards,
    }, html => {
      assert(html.includes('result-hl') || html.includes('result-sub'), 'result panel present');
    });
  });
});

// ─── Roulette — bet phase ─────────────────────────────────────────────────────

describe('render — roulette bet phase', () => {
  it('normal: board and spin button present', () => {
    withRender({ screen:'roulette', rPhase:'bet', chips:500, rBet:0, rBets:[], rPick:null }, html => {
      assert(html.includes('rboard'),     'roulette board present');
      assert(html.includes('Final Spin'), 'spin button present');
    });
  });

  it('all_in_or_skip: shows board with all-in/skip buttons', () => {
    withRender({ screen:'roulette', rPhase:'bet', chips:500, rBet:0, rBets:[], rPick:null, forcedMod:'all_in_or_skip' }, html => {
      assert(html.includes('rboard'), 'board present');
      assert(html.includes('Skip'),   'skip button present');
    });
  });

  it('r_force_group modifier: blocks out-of-group + guaranteed-win tiles, no win/lose highlighting', () => {
    withRender({ screen:'roulette', rPhase:'bet', chips:500, rBet:0, rBets:[], rPick:null, forcedMod:'r_group_1_12' }, html => {
      assert(html.includes('rboard'),    'board present');
      assert(html.includes('r-blocked'), 'out-of-group / guaranteed tiles are blocked');
      assert(!html.includes('r-group-win') && !html.includes('r-group-lose') && !html.includes('r-group-partial'),
        'win/lose/partial highlighting removed');
    });
  });

  it('bet placed: chip amount shown on board tile', () => {
    withRender({ screen:'roulette', rPhase:'bet', chips:450, rBet:0, rBets:[_rBetBlack], rPick:null }, html => {
      assert(html.includes('r-chip-placed'), 'placed chip token present');
    });
  });
});

// ─── Roulette — post-bet phases ───────────────────────────────────────────────

describe('render — roulette spinning / result phases', () => {
  it('spinning: canvas wheel element present', () => {
    withRender({
      screen:'roulette', rPhase:'spinning',
      chips:450, rSpin:36, rBets:[_rBetBlack],
    }, html => {
      assert(html.includes('rwheel'), 'wheel canvas present');
    });
  });

  it('spinning: shows the read-only Your Bets box (each tile listed, no remove buttons)', () => {
    withRender({
      screen:'roulette', rPhase:'spinning', chips:0, rSpin:17,
      rBets:[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50},{pick:2,bet:50},{pick:31,bet:50}],
    }, html => {
      assert(html.includes('Your Bets 5/'), 'shows the bets-tracker title with count');
      // Each bet's tile name is listed so nothing is forgotten mid-spin.
      assert(html.includes('Red'),  'lists Red (pick 45)');
      assert(html.includes('#17'),  'lists #17 (pick 17)');
      assert(html.includes('1-12'), 'lists 1-12 (pick 40)');
      // Read-only during the spin: no × remove buttons.
      assert(!html.includes('rRemoveBet'), 'no remove buttons while the wheel is spinning');
    });
  });

  it('spinning: a single bet is listed in the Your Bets box', () => {
    withRender({
      screen:'roulette', rPhase:'spinning', chips:450, rSpin:36, rBets:[{pick:46,bet:50}],
    }, html => {
      assert(html.includes('Your Bets 1/'), 'shows the bets-tracker title');
      assert(html.includes('Black'),         'shows the pick label (idx 46 = Black)');
    });
  });

  it('respin: shows keep / re-spin choice', () => {
    withRender({
      screen:'roulette', rPhase:'respin',
      chips:450, rSpin:36, rBets:[_rBetBlack], forcedMod:'r_respin',
    }, html => {
      assert(html.includes('Re-spin') || html.includes('Keep'), 'respin options present');
    });
  });

  it('result — lose: shows You Lose! and final chip total', () => {
    withRender({
      screen:'roulette', rPhase:'result',
      chips:450, rSpin:36, rBets:[], rResult:_rResBlack,
    }, html => {
      assert(html.includes('You Lose!'),        'lose headline present');
      assert(html.includes('Final chip total'), 'chip total row present');
    });
  });

  it('result — win: shows You Win!', () => {
    withRender({
      screen:'roulette', rPhase:'result',
      chips:550, rSpin:46, rBets:[], rResult:_rResWin,
    }, html => {
      assert(html.includes('You Win!'), 'win headline present');
    });
  });

  it('result — skip (all_in_or_skip): shows Spin Skipped', () => {
    withRender({
      screen:'roulette', rPhase:'result',
      chips:500, rSpin:null, rBets:[], rResult:{ delta:0, skipped:true },
    }, html => {
      assert(html.includes('Skipped') || html.includes('Skip'), 'skip state present');
    });
  });
});

// ─── Final results screen ─────────────────────────────────────────────────────

describe('render — final results screen', () => {
  const _rsBase = {
    screen:'results', chips:1200,
    bjHistory:[ { bet:100, result:'win',  delta:200, player:[], dealer:[] },
                { bet:100, result:'push', delta:0,   player:[], dealer:[] },
                { bet:100, result:'lose', delta:-100, player:[], dealer:[] } ],
    uthHistory:[ _uthWinEntry, _uthPushEntry, _uthLoseEntry ],
    rResult:_rResBlack,
    bjHand:3, uthHand:3,
  };

  it('renders final chip count and game breakdown', () => {
    withRender(_rsBase, html => {
      assert(html.includes('big-chips'),   'chip count element present');
      assert(html.includes('Blackjack'),   'BJ row present');
      assert(html.includes('Roulette'),    'roulette row present');
    });
  });

  it('renders with chips at 0 (bust): no crash', () => {
    withRender({
      ..._rsBase, chips:0,
      bjHistory:  [{ bet:1000, result:'bust', delta:-1000, player:[], dealer:[] }],
      uthHistory: [],
      rResult:    { delta:0, skipped:true },
    }, html => {
      assert(html.includes('big-chips'), 'chip count element present at 0');
    });
  });

  it('renders with chips above 2500 (whale tier): no crash', () => {
    withRender({
      ..._rsBase, chips:3000,
      bjHistory:  [{ bet:100, result:'win', delta:2000, player:[], dealer:[] }],
    }, html => {
      assert(html.includes('big-chips'), 'chip count element present');
    });
  });

  it('chip total row present with correct value', () => {
    withRender(_rsBase, html => {
      assert(html.includes('all-time high') || html.includes('1,200'), 'chip value rendered');
    });
  });
});

// ─── Dev stats screen ─────────────────────────────────────────────────────────

describe('render — dev stats screen', () => {
  it('renders the stats container without throwing', () => {
    withRender({ screen:'devstats' }, html => {
      assert(html.includes('devstats-body'), 'stats body element present');
    });
  });
});

// ─── The Ladder screens ───────────────────────────────────────────────────────

describe('render — The Ladder screens', () => {
  it('bet phase (free entry day) shows the strip and free-entry button', () => {
    withRender({ screen:'ladder', ladPhase:'bet', ladBet:0, ladFree:false, ladResult:null,
                 forcedMod:{ ladder_free:250, title:'The Ladder', desc:'x' } }, html => {
      assert(html.includes('lad-strip'), 'ladder strip present');
      assert(html.includes('Free Entry'), 'free entry button present');
    });
  });
  it('bet phase (standalone) shows chip selector and Climb button', () => {
    withRender({ screen:'ladder', ladPhase:'bet', ladBet:0, ladFree:false, ladResult:null,
                 chips:1000, forcedMod:{} }, html => {
      assert(html.includes('chip-row'), 'chip selector present');
      assert(html.includes('Climb'), 'climb button present');
    });
  });
  it('climb phase shows Higher/Lower and Cash Out', () => {
    withRender({ screen:'ladder', ladPhase:'climb', ladBet:100, ladFree:false,
                 ladIdx:3, ladRung:3, ladResult:null, forcedMod:{} }, html => {
      assert(html.includes('Higher'), 'higher call present');
      assert(html.includes('Lower'), 'lower call present');
      assert(html.includes('Cash Out'), 'cash out present');
    });
  });
  it('done phase (crash) renders the crash result', () => {
    withRender({ screen:'ladder', ladPhase:'done', ladBet:250, ladFree:true,
                 ladIdx:4, ladRung:3, ladResult:{delta:0,rung:3,outcome:'crash',free:true},
                 forcedMod:{ ladder_free:250, title:'The Ladder', desc:'x' } }, html => {
      assert(html.includes('CRASHED'), 'crash headline present');
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_ls.removeItem(_rsKey);
_rsSavedSeed === null ? _ls.removeItem('gambdle_use_test_seed') : _ls.setItem('gambdle_use_test_seed', _rsSavedSeed);
_rsRestore();
