// PRESET_MODIFIERS shape tests removed — the validation guard at the bottom of
// src/modifiers.js already throws on unrecognized keys, and the data-driven
// "getMod — known modifier keys read correctly" describe at the bottom of this
// file catches any value drift.

// ─── CYCLE_ORDER integrity ────────────────────────────────────────────────────

describe('CYCLE_ORDER', () => {
  it('every key exists in PRESET_MODIFIERS', () => {
    for (const k of CYCLE_ORDER) {
      assert(k in PRESET_MODIFIERS, `CYCLE_ORDER key "${k}" not found in PRESET_MODIFIERS`);
    }
  });

  it('no duplicate keys', () => {
    const seen = new Set();
    for (const k of CYCLE_ORDER) {
      assert(!seen.has(k), `CYCLE_ORDER has duplicate key "${k}"`);
      seen.add(k);
    }
  });

  it('has at least one entry of each game type', () => {
    const types = new Set(CYCLE_ORDER.map(k => PRESET_MODIFIERS[k].type));
    assert(types.has('bj'), 'CYCLE_ORDER should include a bj modifier');
    assert(types.has('uth'), 'CYCLE_ORDER should include a uth modifier');
    assert(types.has('roulette'), 'CYCLE_ORDER should include a roulette modifier');
  });
});

// ─── DAILY_MODIFIERS integrity ────────────────────────────────────────────────

describe('DAILY_MODIFIERS', () => {
  it('string values reference valid PRESET_MODIFIERS keys', () => {
    for (const [date, val] of Object.entries(DAILY_MODIFIERS)) {
      if (typeof val === 'string') {
        assert(val in PRESET_MODIFIERS, `DAILY_MODIFIERS[${date}] = "${val}" not in PRESET_MODIFIERS`);
      }
    }
  });

  it('date keys are valid YYYYMMDD integers', () => {
    for (const date of Object.keys(DAILY_MODIFIERS)) {
      const n = parseInt(date, 10);
      assert(String(n) === date, `key "${date}" is not a plain integer`);
      const year = Math.floor(n / 10000);
      const month = Math.floor((n % 10000) / 100);
      const day = n % 100;
      assert(year >= 2026, `${date}: year ${year} is before 2026`);
      assert(month >= 1 && month <= 12, `${date}: invalid month ${month}`);
      assert(day >= 1 && day <= 31, `${date}: invalid day ${day}`);
    }
  });
});

// ─── Modifier behavior: gameplay effects of active modifiers ────────────────

// Helper: run fn with S.forcedMod set, then restore original values
function withMod(mod, chipOverride, fn) {
  const savedMod = S.forcedMod;
  const savedChips = S.chips;
  S.forcedMod = mod;
  if (chipOverride !== undefined) S.chips = chipOverride;
  try { fn(); } finally {
    S.forcedMod = savedMod;
    S.chips = savedChips;
  }
}

// ─── getMod() priority and lookup ────────────────────────────────────────────

describe('getMod — override mechanisms', () => {
  // Per-preset key/value coverage lives in the data-driven describe at the bottom
  // of this file. These tests verify the three override forms (string, object,
  // empty object) the test suite relies on for state isolation.

  it('forcedMod string: returns value for matching key', () => {
    withMod('double_pay', undefined, () => {
      assertEqual(getMod('bj_payout'), 3.0);
    });
  });

  it('forcedMod object: reads arbitrary inline key/value', () => {
    withMod({ bj_payout: 5.0 }, undefined, () => {
      assertEqual(getMod('bj_payout'), 5.0);
    });
  });

  it('empty object forcedMod neutralizes all keys (used to clear daily modifier)', () => {
    withMod({}, undefined, () => {
      assertEqual(getMod('bj_payout'), null);
      assertEqual(getMod('uth_blind_boost'), null);
      assertEqual(getMod('comeback'), null);
    });
  });
});

// ─── winMult() ───────────────────────────────────────────────────────────────

describe('winMult', () => {
  it('returns 1 with no modifier', () => {
    withMod({}, undefined, () => {
      assertEqual(winMult(), 1);
    });
  });

  it('all_in_or_skip: always returns 2 regardless of chip count', () => {
    withMod('all_in_or_skip', 2000, () => assertEqual(winMult(), 2, 'above 1000'));
    withMod('all_in_or_skip', 1000, () => assertEqual(winMult(), 2, 'at 1000'));
    withMod('all_in_or_skip', 1,    () => assertEqual(winMult(), 2, 'at 1 chip'));
  });

  it('comeback: returns 2 when chips are strictly below 1000', () => {
    withMod('comeback', 999,  () => assertEqual(winMult(), 2, '999 chips'));
    withMod('comeback', 1,    () => assertEqual(winMult(), 2, '1 chip'));
  });

  it('comeback: returns 1 when chips are at or above 1000', () => {
    withMod('comeback', 1000, () => assertEqual(winMult(), 1, 'exactly 1000'));
    withMod('comeback', 1001, () => assertEqual(winMult(), 1, '1001 chips'));
    withMod('comeback', 2500, () => assertEqual(winMult(), 1, 'high roller'));
  });

  it('other modifiers do not affect winMult', () => {
    withMod('double_pay', undefined, () => assertEqual(winMult(), 1, 'double_pay'));
    withMod('r_hot_numbers', undefined, () => assertEqual(winMult(), 1, 'r_hot_numbers'));
    withMod('uth_blind_boost', undefined, () => assertEqual(winMult(), 1, 'uth_blind_boost'));
  });
});

// ─── uthBlindDelta with modifiers ────────────────────────────────────────────

describe('uthBlindDelta — uth_blind_boost', () => {
  it('uth_blind_boost doubles every payout tier', () => {
    withMod('uth_blind_boost', undefined, () => {
      assertEqual(uthBlindDelta(9, 100), 100000, 'Royal Flush 500x × 2');
      assertEqual(uthBlindDelta(8, 100), 10000,  'Straight Flush 50x × 2');
      assertEqual(uthBlindDelta(7, 100), 2000,   'Quads 10x × 2');
      assertEqual(uthBlindDelta(6, 100), 600,    'Full House 3x × 2');
      assertEqual(uthBlindDelta(5, 100), 300,    'Flush 1.5x × 2');
      assertEqual(uthBlindDelta(4, 100), 200,    'Straight 1x × 2');
    });
  });

  it('uth_blind_boost does not pay below Straight', () => {
    withMod('uth_blind_boost', undefined, () => {
      assertEqual(uthBlindDelta(3, 100), 0, 'trips still nothing');
      assertEqual(uthBlindDelta(0, 100), 0, 'high card still nothing');
    });
  });
});

describe('uthBlindDelta — uth_blind_extended', () => {
  it('pays on Three of a Kind (1x blind)', () => {
    withMod('uth_blind_extended', undefined, () => {
      assertEqual(uthBlindDelta(3, 100), 100);
      assertEqual(uthBlindDelta(3, 50),  50);
    });
  });

  it('pays on Two Pair (0.5x blind, ceiled)', () => {
    withMod('uth_blind_extended', undefined, () => {
      assertEqual(uthBlindDelta(2, 100), 50);
      assertEqual(uthBlindDelta(2, 51),  Math.ceil(51 * 0.5), 'odd blind rounds up');
    });
  });

  it('still pays nothing on One Pair or High Card', () => {
    withMod('uth_blind_extended', undefined, () => {
      assertEqual(uthBlindDelta(1, 100), 0, 'one pair');
      assertEqual(uthBlindDelta(0, 100), 0, 'high card');
    });
  });

  it('higher tiers still pay normal amounts', () => {
    withMod('uth_blind_extended', undefined, () => {
      assertEqual(uthBlindDelta(4, 100), 100,  'straight still 1x');
      assertEqual(uthBlindDelta(6, 100), 300,  'full house still 3x');
      assertEqual(uthBlindDelta(9, 100), 50000,'royal flush still 500x');
    });
  });
});

describe('uthBlindDelta — boost + extended combined', () => {
  it('boost applies on top of extended tiers', () => {
    withMod({ uth_blind_boost: 2.0, uth_blind_extended: true }, undefined, () => {
      assertEqual(uthBlindDelta(3, 100), 200, 'trips: 1x × 2 boost = 200');
      assertEqual(uthBlindDelta(2, 100), 100, 'two pair: 0.5x × 2 boost = 100');
      assertEqual(uthBlindDelta(4, 100), 200, 'straight: 1x × 2 boost = 200');
    });
  });
});

// ─── bj_wild_split ───────────────────────────────────────────────────────────

// Full state snapshot at describe-load time; restored after every bjResolve test.
const _wsSnap = JSON.stringify({...S, pkHeld:[...S.pkHeld]});
const _wsRestore = () => { const r=JSON.parse(_wsSnap); r.pkHeld=new Set(r.pkHeld); Object.assign(S,r); };

function withSplitMod(mod, overrides, fn) {
  const savedMod = S.forcedMod;
  S.forcedMod = mod;
  Object.assign(S, overrides);
  try { fn(); } finally { _wsRestore(); S.forcedMod = savedMod; }
}

// A two-card hand pair + dealer bust setup used in multiple tests.
const _splitSetup = {
  screen:'bj', bjPhase:'play',
  bjSplit:true, bjSplitActive:0,
  bjSplitHands:[[card('7','s'),card('5','h')],[card('8','d'),card('6','c')]],
  bjSplitBets:[100,100], bjSplitResults:[], bjSplitDone:[true,true],
  bjSplitDoubled:[false,false], bjSplitAnimFrom:[0,0],
  bjDealer:[card('K','s'),card('Q','h'),card('3','d')], // 23 = dealer bust, won't draw
  bjIdx:10, bjHand:0, bjHistory:[], bjResult:null,
  bjBet:200, bjPlayer:[], bjDealerReveal:true, bjDealerAnimFrom:0, bjCelebrating:false,
  chips:1000,
};

describe('bjResolve — bj_wild_split doubles split win profit', () => {
  it('each winning split hand pays 2× profit (dealer bust scenario)', () => {
    withSplitMod('bj_wild_split', _splitSetup, () => {
      bjResolve(true);
      // Each win: delta = bet(100) * wm(1) * ddm(1) * spm(2) = 200. Two hands = 400.
      assertEqual(S.bjResult.delta, 400, 'two winning splits of 100 should pay 400 with 2× modifier');
    });
  });

  it('without modifier, same split wins pay standard 1× profit', () => {
    withSplitMod({}, _splitSetup, () => {
      bjResolve(true);
      assertEqual(S.bjResult.delta, 200, 'without modifier, two wins of 100 = 200 total');
    });
  });

  it('split losses are not affected by bj_wild_split', () => {
    withSplitMod('bj_wild_split', {
      ..._splitSetup,
      bjSplitHands:[[card('7','s'),card('5','h')],[card('8','d'),card('3','c')]], // 12, 11
      bjDealer:[card('K','s'),card('8','h')], // 18, stands
    }, () => {
      bjResolve(true);
      assertEqual(S.bjResult.delta, -200, 'two losing splits of 100 = -200 regardless of modifier');
    });
  });

  it('getMod bj_wild_split returns true', () => {
    withMod('bj_wild_split', undefined, () => {
      assertEqual(getMod('bj_wild_split'), true);
    });
  });
});

// ─── Modifier key coverage ────────────────────────────────────────────────────

describe('getMod — known modifier keys read correctly', () => {
  const cases = [
    ['easy_dealer',        'bj_dealer_stand',    15],
    ['bj_double_bonus',    'bj_double_bonus',    true],
    ['bj_first_ace',       'bj_first_ace',       true],
    ['bj_wild_split',      'bj_wild_split',      true],
    ['high_stakes',        'min_chips',          100],
    ['uth_hard_qualify',   'uth_hard_qualify',   true],
    ['uth_double_play',    'uth_double_play',    true],
    ['uth_pocket_aces',    'uth_pocket_aces',    true],
    ['r_hot_zero',         'r_zero_boost',       10],
    ['r_respin',           'r_respin',           true],
    ['r_multi_bet',        'r_max_bets',         10],
    ['r_double_all',       'r_payout_mult',      2.0],
  ];

  for (const [preset, key, expected] of cases) {
    it(`${preset} → ${key} = ${JSON.stringify(expected)}`, () => {
      withMod(preset, undefined, () => {
        assertEqual(getMod(key), expected);
      });
    });
  }
});

// ─── Modifier behavioral tests ────────────────────────────────────────────────
// These exercise the gameplay effect, not just getMod() lookup.

// uth_pocket_aces — uthDeal must produce a hole hand of two Aces.
describe('uth_pocket_aces — hole cards are Aces', () => {
  const _paSnap = JSON.stringify({...S, pkHeld:[...S.pkHeld]});
  const _paRestore = () => { const r=JSON.parse(_paSnap); r.pkHeld=new Set(r.pkHeld); Object.assign(S,r); };

  it('uthDeal with modifier deals two Aces to player', () => {
    S.forcedMod = 'uth_pocket_aces';
    Object.assign(S, { screen:'uth', uthPhase:'bet', uthAnte:100, uthHand:0, chips:1000 });
    try {
      uthDeal();
      assertEqual(S.uthHole.length, 2, 'should deal exactly 2 hole cards');
      assertEqual(S.uthHole[0].r, 'A', 'first hole card should be Ace');
      assertEqual(S.uthHole[1].r, 'A', 'second hole card should be Ace');
    } finally { _paRestore(); }
  });

  it('without modifier, uthDeal uses the daily deck (not guaranteed Aces)', () => {
    S.forcedMod = {};
    Object.assign(S, { screen:'uth', uthPhase:'bet', uthAnte:100, uthHand:0, chips:1000 });
    try {
      uthDeal();
      assertEqual(S.uthHole.length, 2);
      // We can't assert NOT Aces (could happen by chance) — just assert we used the daily deck path.
      assert(S.uthHole[0] === DEAL.uthDeck[0], 'should use DEAL.uthDeck[0] as first hole card');
      assert(S.uthHole[1] === DEAL.uthDeck[1], 'should use DEAL.uthDeck[1] as second hole card');
    } finally { _paRestore(); }
  });
});

// uth_hard_qualify — dealer needs Two Pair (cat ≥ 2) instead of Pair (cat ≥ 1) to qualify.
describe('uth_hard_qualify — dealer qualification threshold', () => {
  const _hqSnap = JSON.stringify({...S, pkHeld:[...S.pkHeld]});
  const _hqRestore = () => { const r=JSON.parse(_hqSnap); r.pkHeld=new Set(r.pkHeld); Object.assign(S,r); };

  // Dealer hand: pair of 7s. Player loses with high card so we record dealerQualifies.
  // Without mod: pair (cat 1) qualifies. With mod: pair does NOT qualify (cat 2 needed).
  // Use community cards that give dealer a pair and player a stronger hand.
  function _runQualifyHand(mod) {
    S.forcedMod = mod;
    Object.assign(S, {
      screen:'uth', uthPhase:'turn', uthAnte:100, uthPlay:0, uthPlayMult:0,
      uthHole:  [card('K','s'), card('K','h')],         // pair of Kings (player wins)
      uthDealer:[card('7','d'), card('2','c')],         // dealer base
      uthComm:  [card('7','h'), card('3','s'), card('9','c'), card('J','d'), card('4','h')], // dealer pairs 7s
      chips:1000, uthHand:0, uthHistory:[],
    });
    uthResolve();
  }

  it('without modifier: dealer pair of 7s qualifies (cat=1 ≥ 1)', () => {
    try {
      _runQualifyHand({});
      const hist = S.uthHistory[0];
      assert(hist.dealerQualifies === true, `dealer should qualify; got ${hist.dealerQualifies}`);
    } finally { _hqRestore(); }
  });

  it('with uth_hard_qualify: dealer pair does NOT qualify (cat=1 < 2)', () => {
    try {
      _runQualifyHand('uth_hard_qualify');
      const hist = S.uthHistory[0];
      assert(hist.dealerQualifies === false, `dealer should not qualify; got ${hist.dealerQualifies}`);
    } finally { _hqRestore(); }
  });
});

// peek — doPeek lifecycle: one-time use, S.peekUsed tracks usage.
describe('peek — doPeek lifecycle', () => {
  const _pkSnap = JSON.stringify({...S, pkHeld:[...S.pkHeld]});
  const _pkRestore = () => { const r=JSON.parse(_pkSnap); r.pkHeld=new Set(r.pkHeld); Object.assign(S,r); };

  it('S.peekUsed flips true after doPeek()', () => {
    S.forcedMod = 'peek';
    Object.assign(S, { screen:'bj', peekUsed:false, bjDealer:[card('7','d'), card('K','c')] });
    try {
      assertEqual(S.peekUsed, false, 'starts unused');
      doPeek();
      assertEqual(S.peekUsed, true, 'flips to true after doPeek()');
    } finally { _pkRestore(); }
  });

  it('peekBtnHTML returns empty after S.peekUsed=true', () => {
    S.forcedMod = 'peek';
    Object.assign(S, { peekUsed:true });
    try {
      assertEqual(peekBtnHTML(), '', 'should return empty after peek used');
    } finally { _pkRestore(); }
  });

  it('peekBtnHTML returns empty without the peek modifier', () => {
    S.forcedMod = {};
    Object.assign(S, { peekUsed:false });
    try {
      assertEqual(peekBtnHTML(), '', 'should return empty without modifier');
    } finally { _pkRestore(); }
  });
});

// peek — reveal scoping. The peek is one-time per day, but the revealed hole card
// must only show on the exact game + hand where it was used. Regression tests for:
//   (a) peeking reveals the dealer on every later hand of every game,
//   (b) peeking on BJ hand 2 also reveals the hole card on BJ hand 3,
// plus other edge cases (cross-game leak, no-op guards, persistence, label scoping).
describe('peek — reveal is scoped to the exact game + hand', () => {
  const _snap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
  const _restore = () => { const r = JSON.parse(_snap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r); };
  // Put S into a peek-active state: modifier on, peek already used on the given game+hand.
  const _peekedOn = (game, hand) => {
    S.forcedMod = 'peek';
    Object.assign(S, { peekUsed: true, peekAt: { game, hand } });
    if (game === 'bj') { S.screen = 'bj'; S.bjHand = hand; }
    else if (game === 'uth') { S.screen = 'uth'; S.uthHand = hand; }
  };

  it('doPeek records the game + hand it was used on (BJ hand index 1)', () => {
    Object.assign(S, { screen: 'bj', bjHand: 1, peekUsed: false, peekAt: null,
      bjDealer: [card('7', 'd'), card('K', 'c')] });
    S.forcedMod = 'peek';
    try {
      doPeek();
      assertEqual(S.peekUsed, true, 'peekUsed flips true');
      assert(S.peekAt && S.peekAt.game === 'bj' && S.peekAt.hand === 1,
        `peekAt should be {bj,1}, got ${JSON.stringify(S.peekAt)}`);
    } finally { _restore(); }
  });

  it('peekRevealed() is true on the peeked hand', () => {
    _peekedOn('bj', 1);
    try { assertEqual(peekRevealed(), true, 'should reveal on the hand peek was used'); }
    finally { _restore(); }
  });

  // Bug (b): peeking on BJ hand 2 (index 1) must NOT reveal on BJ hand 3 (index 2).
  it('does NOT reveal on a later BJ hand (peek hand 2 → hand 3 stays hidden)', () => {
    _peekedOn('bj', 1);
    try {
      S.bjHand = 2; // advanced to next hand, same game
      assertEqual(peekRevealed(), false, 'later hand must not show the peeked card');
    } finally { _restore(); }
  });

  it('does NOT reveal on an earlier BJ hand either', () => {
    _peekedOn('bj', 1);
    try {
      S.bjHand = 0;
      assertEqual(peekRevealed(), false, 'a different hand index must not reveal');
    } finally { _restore(); }
  });

  // Bug (a): peeking in BJ must not bleed into UTH (or any other game) that day.
  it('does NOT reveal in UTH after peeking in BJ (no cross-game leak)', () => {
    _peekedOn('bj', 0);
    try {
      Object.assign(S, { screen: 'uth', uthHand: 0 });
      assertEqual(peekRevealed(), false, 'UTH must not inherit a BJ peek');
    } finally { _restore(); }
  });

  it('does NOT reveal in BJ after peeking in UTH', () => {
    _peekedOn('uth', 0);
    try {
      Object.assign(S, { screen: 'bj', bjHand: 0 });
      assertEqual(peekRevealed(), false, 'BJ must not inherit a UTH peek');
    } finally { _restore(); }
  });

  it('reveals on the matching UTH hand only', () => {
    _peekedOn('uth', 0);
    try {
      assertEqual(peekRevealed(), true, 'reveals on UTH hand it was used');
      S.uthHand = 1;
      assertEqual(peekRevealed(), false, 'later UTH hand stays hidden');
    } finally { _restore(); }
  });

  it('peekRevealed() is false before any peek (button shown, card hidden)', () => {
    S.forcedMod = 'peek';
    Object.assign(S, { screen: 'bj', bjHand: 0, peekUsed: false, peekAt: null });
    try {
      assertEqual(peekRevealed(), false, 'unused peek must not reveal');
      assert(peekBtnHTML() !== '', 'peek button should be offered while unused');
    } finally { _restore(); }
  });

  it('peekRevealed() is false without the peek modifier even if peekAt is set', () => {
    S.forcedMod = {}; // no peek key
    Object.assign(S, { screen: 'bj', bjHand: 1, peekUsed: true, peekAt: { game: 'bj', hand: 1 } });
    try { assertEqual(peekRevealed(), false, 'no modifier → never reveal'); }
    finally { _restore(); }
  });

  it('peek button disappears on every later hand (one peek per day)', () => {
    _peekedOn('bj', 1);
    try {
      S.bjHand = 2;
      assertEqual(peekBtnHTML(), '', 'no second peek offered on a later hand');
      Object.assign(S, { screen: 'uth', uthHand: 0 });
      assertEqual(peekBtnHTML(), '', 'no second peek offered in the other game');
    } finally { _restore(); }
  });

  it('doPeek is a no-op without the peek modifier (cannot set peekAt)', () => {
    S.forcedMod = {};
    Object.assign(S, { screen: 'bj', bjHand: 0, peekUsed: false, peekAt: null });
    try {
      doPeek();
      assertEqual(S.peekUsed, false, 'peekUsed stays false without modifier');
      assertEqual(S.peekAt, null, 'peekAt stays null without modifier');
    } finally { _restore(); }
  });

  it('doPeek is a no-op once used — does not relocate the reveal to a new hand', () => {
    _peekedOn('bj', 1);
    try {
      S.bjHand = 2;
      doPeek(); // second call on a different hand
      assert(S.peekAt.game === 'bj' && S.peekAt.hand === 1,
        `peekAt must stay pinned to {bj,1}, got ${JSON.stringify(S.peekAt)}`);
    } finally { _restore(); }
  });

  it('peekAt survives a state save round-trip', () => {
    _peekedOn('bj', 1);
    try {
      const round = JSON.parse(JSON.stringify({ ...S, pkHeld: [...S.pkHeld] }));
      assert(round.peekAt && round.peekAt.game === 'bj' && round.peekAt.hand === 1,
        'peekAt must serialize so the reveal survives a refresh');
    } finally { _restore(); }
  });

  // Render-level checks against bjDealerHTML (face-down card carries the "back" class).
  it('bjDealerHTML shows the hole card + Peeked label only on the peeked hand', () => {
    _peekedOn('bj', 1);
    Object.assign(S, { bjDealer: [card('7', 'd'), card('K', 'c')], bjDealerReveal: false });
    try {
      const onHand = bjDealerHTML();
      assert(onHand.includes('Peeked'), 'peeked hand shows the Peeked label');
      assert(!onHand.includes('lg back'), 'peeked hand shows the real second card, not a face-down back');

      S.bjHand = 2; // next hand
      const laterHand = bjDealerHTML();
      assert(!laterHand.includes('Peeked'), 'later hand has no Peeked label');
      assert(laterHand.includes('lg back'), 'later hand keeps the second card face down');
    } finally { _restore(); }
  });
});

// r_multi_bet — max concurrent roulette bets is raised from default (5) to r_max_bets (10).
describe('r_multi_bet — concurrent bet cap', () => {
  it('without modifier, default max is 5', () => {
    S.forcedMod = {};
    try { assertEqual(getMod('r_max_bets') || 5, 5); } finally { S.forcedMod = {}; }
  });
  it('with r_multi_bet, max is 10', () => {
    S.forcedMod = 'r_multi_bet';
    try { assertEqual(getMod('r_max_bets'), 10); } finally { S.forcedMod = {}; }
  });
});

// r_force_group — R_GROUP_INFO membership and boundary integrity.
// Each group must contain its boundary numbers and the union of all dozens/halves must cover 1..36.
describe('r_force_group — group boundary integrity', () => {
  it('1_12 contains 1 and 12 (both boundaries)', () => {
    assert(R_GROUP_INFO['1_12'].nums.has(1),  '1 should be in 1_12');
    assert(R_GROUP_INFO['1_12'].nums.has(12), '12 should be in 1_12');
    assert(!R_GROUP_INFO['1_12'].nums.has(13),'13 should NOT be in 1_12');
    assertEqual(R_GROUP_INFO['1_12'].nums.size, 12);
  });
  it('13_24 contains 13 and 24, excludes 12 and 25', () => {
    assert(R_GROUP_INFO['13_24'].nums.has(13));
    assert(R_GROUP_INFO['13_24'].nums.has(24));
    assert(!R_GROUP_INFO['13_24'].nums.has(12));
    assert(!R_GROUP_INFO['13_24'].nums.has(25));
    assertEqual(R_GROUP_INFO['13_24'].nums.size, 12);
  });
  it('25_36 contains 25 and 36, excludes 24', () => {
    assert(R_GROUP_INFO['25_36'].nums.has(25));
    assert(R_GROUP_INFO['25_36'].nums.has(36));
    assert(!R_GROUP_INFO['25_36'].nums.has(24));
    assertEqual(R_GROUP_INFO['25_36'].nums.size, 12);
  });
  it('1_18 contains 1 and 18, excludes 19 and 0', () => {
    assert(R_GROUP_INFO['1_18'].nums.has(1));
    assert(R_GROUP_INFO['1_18'].nums.has(18));
    assert(!R_GROUP_INFO['1_18'].nums.has(19));
    assert(!R_GROUP_INFO['1_18'].nums.has(0));
    assertEqual(R_GROUP_INFO['1_18'].nums.size, 18);
  });
  it('19_36 contains 19 and 36, excludes 18 and 0', () => {
    assert(R_GROUP_INFO['19_36'].nums.has(19));
    assert(R_GROUP_INFO['19_36'].nums.has(36));
    assert(!R_GROUP_INFO['19_36'].nums.has(18));
    assert(!R_GROUP_INFO['19_36'].nums.has(0));
    assertEqual(R_GROUP_INFO['19_36'].nums.size, 18);
  });
  it('every group has a bannedIdx in valid R_BETS range', () => {
    for (const [name, g] of Object.entries(R_GROUP_INFO)) {
      assert(typeof g.bannedIdx === 'number' && g.bannedIdx >= 37 && g.bannedIdx <= 48,
        `${name} bannedIdx ${g.bannedIdx} should be 37..48`);
    }
  });
});
