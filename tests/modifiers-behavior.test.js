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

describe('getMod — forced mod overrides', () => {
  it('forcedMod string: returns value for matching key', () => {
    withMod('double_pay', undefined, () => {
      assertEqual(getMod('bj_payout'), 3.0);
    });
  });

  it('forcedMod string: returns null for key not in that modifier', () => {
    withMod('double_pay', undefined, () => {
      assertEqual(getMod('r_payout_mult'), null, 'roulette key absent from double_pay');
      assertEqual(getMod('uth_blind_boost'), null, 'uth key absent from double_pay');
    });
  });

  it('forcedMod object: reads arbitrary inline key/value', () => {
    withMod({ bj_payout: 5.0 }, undefined, () => {
      assertEqual(getMod('bj_payout'), 5.0);
    });
  });

  it('forcedMod object: returns null for absent key', () => {
    withMod({ bj_payout: 5.0 }, undefined, () => {
      assertEqual(getMod('r_payout_mult'), null);
    });
  });

  it('empty object forcedMod: all keys return null (used to neutralize modifiers)', () => {
    withMod({}, undefined, () => {
      assertEqual(getMod('bj_payout'), null);
      assertEqual(getMod('uth_blind_boost'), null);
      assertEqual(getMod('comeback'), null);
      assertEqual(getMod('all_in_or_skip'), null);
    });
  });

  it('null forcedMod: falls through to DAILY_MODIFIERS / CYCLE_ORDER', () => {
    withMod(null, undefined, () => {
      // The active modifier is determined by date — we can't assert a specific value,
      // but getMod must return something (null or a valid modifier value).
      const result = getMod('bj_payout');
      assert(result === null || typeof result === 'number', 'getMod returns null or number');
    });
  });

  it('each PRESET_MODIFIERS key exposes its own values via getMod', () => {
    withMod('r_double_all', undefined, () => {
      assertEqual(getMod('r_payout_mult'), 2.0);
      assertEqual(getMod('r_max_bets'), 1);
    });
    withMod('r_hot_numbers', undefined, () => {
      assertEqual(getMod('r_number_pay'), 50);
    });
    withMod('peek', undefined, () => {
      assertEqual(getMod('peek'), true);
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

// ─── Modifier key coverage ────────────────────────────────────────────────────

describe('getMod — known modifier keys read correctly', () => {
  const cases = [
    ['easy_dealer',        'bj_dealer_stand',    15],
    ['bj_double_bonus',    'bj_double_bonus',    true],
    ['bj_first_ace',       'bj_first_ace',       true],
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
