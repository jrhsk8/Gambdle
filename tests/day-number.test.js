// ─── Seed-to-day-number formula ───────────────────────────────────────────────
// Mirrors core.js getActiveDayNum / getDayNum logic, tested in isolation.

const _START_DATE_UTC = Date.UTC(2026, 4, 5); // May 5 2026

function _seedToDayNum(seed) {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100) - 1;
  const d = seed % 100;
  return Math.floor((Date.UTC(y, m, d) - _START_DATE_UTC) / 86400000) + 1;
}

describe('seedToDayNum — known values', () => {
  it('May 5 2026 (20260505) is Day 1', () => {
    assertEqual(_seedToDayNum(20260505), 1);
  });

  it('May 6 2026 (20260506) is Day 2', () => {
    assertEqual(_seedToDayNum(20260506), 2);
  });

  it('May 28 2026 (20260528) is Day 24', () => {
    assertEqual(_seedToDayNum(20260528), 24);
  });

  it('May 29 2026 (20260529) is Day 25', () => {
    assertEqual(_seedToDayNum(20260529), 25);
  });

  it('June 4 2026 (20260604) is Day 31', () => {
    assertEqual(_seedToDayNum(20260604), 31);
  });

  it('consecutive days increment by 1', () => {
    for (let d = 5; d < 30; d++) {
      const seed1 = 20260500 + d;
      const seed2 = 20260500 + d + 1;
      assertEqual(_seedToDayNum(seed2) - _seedToDayNum(seed1), 1, `day ${d} → ${d+1}`);
    }
  });

  it('always returns a positive integer for seeds >= 20260505', () => {
    const seeds = [20260505, 20260506, 20260528, 20260604, 20270101];
    for (const s of seeds) {
      const n = _seedToDayNum(s);
      assert(Number.isInteger(n) && n >= 1, `seed ${s} → day ${n}`);
    }
  });
});

// ─── CYCLE_ORDER wrap ─────────────────────────────────────────────────────────

describe('CYCLE_ORDER cycle wrap', () => {
  it('has exactly 27 entries', () => {
    assertEqual(CYCLE_ORDER.length, 27);
  });

  it('Day 1 maps to cycle index 0; Day 28 is the first wrap back to index 0', () => {
    assertEqual((_seedToDayNum(20260505) - 1) % CYCLE_ORDER.length, 0,  'Day 1 → index 0');
    assertEqual((_seedToDayNum(20260531) - 1) % CYCLE_ORDER.length, 26, 'Day 27 → index 26 (last slot)');
    assertEqual((_seedToDayNum(20260601) - 1) % CYCLE_ORDER.length, 0,  'Day 28 → index 0 (first wrap)');
  });

  it('Day 24 maps to cycle index 23', () => {
    assertEqual((_seedToDayNum(20260528) - 1) % CYCLE_ORDER.length, 23);
  });

  it('Day 2 maps to cycle index 1', () => {
    assertEqual((_seedToDayNum(20260506) - 1) % CYCLE_ORDER.length, 1);
  });

  it('cycle index is always in [0, length-1] for any positive day number', () => {
    for (let dayNum = 1; dayNum <= 200; dayNum++) {
      const idx = (dayNum - 1) % CYCLE_ORDER.length;
      assert(idx >= 0 && idx <= CYCLE_ORDER.length - 1, `dayNum ${dayNum} → idx ${idx}`);
    }
  });

  it('all cycle slots are visited before wrapping', () => {
    const visited = new Set();
    for (let dayNum = 1; dayNum <= CYCLE_ORDER.length; dayNum++) {
      visited.add((dayNum - 1) % CYCLE_ORDER.length);
    }
    assertEqual(visited.size, CYCLE_ORDER.length, 'all indices visited in the first full cycle');
  });
});

// ─── getActiveDayNum() runtime ────────────────────────────────────────────────

describe('getActiveDayNum — runtime', () => {
  it('returns a positive integer', () => {
    const n = getActiveDayNum();
    assert(Number.isInteger(n) && n >= 1, `getActiveDayNum() = ${n}`);
  });

  it('matches seedToDayNum applied to getActiveSeed()', () => {
    assertEqual(getActiveDayNum(), _seedToDayNum(getActiveSeed()));
  });

  it('cycle index derived from getActiveDayNum is valid', () => {
    const idx = (getActiveDayNum() - 1) % CYCLE_ORDER.length;
    assert(idx >= 0 && idx < CYCLE_ORDER.length, `cycle idx ${idx} out of range`);
    assert(typeof CYCLE_ORDER[idx] === 'string', 'cycle entry is a string key');
    assert(CYCLE_ORDER[idx] in PRESET_MODIFIERS, `cycle key "${CYCLE_ORDER[idx]}" exists`);
  });
});

// ─── DAILY_MODIFIERS override in getMod ───────────────────────────────────────

describe('getMod — DAILY_MODIFIERS override', () => {
  it('explicit DAILY_MODIFIERS entry overrides cycle for that seed', () => {
    const curSeed = getActiveSeed();
    const savedEntry = DAILY_MODIFIERS[curSeed];
    const savedForced = S.forcedMod;
    S.forcedMod = null;
    DAILY_MODIFIERS[curSeed] = 'double_pay';
    try {
      assertEqual(getMod('bj_payout'), 3.0, 'double_pay.bj_payout');
      assertEqual(getMod('r_payout_mult'), null, 'unrelated key absent');
    } finally {
      if (savedEntry !== undefined) DAILY_MODIFIERS[curSeed] = savedEntry;
      else delete DAILY_MODIFIERS[curSeed];
      S.forcedMod = savedForced;
    }
  });

  it('S.forcedMod takes priority over DAILY_MODIFIERS', () => {
    const curSeed = getActiveSeed();
    const savedEntry = DAILY_MODIFIERS[curSeed];
    DAILY_MODIFIERS[curSeed] = 'double_pay'; // bj_payout=3.0
    S.forcedMod = { bj_payout: 5.0 };        // should win
    try {
      assertEqual(getMod('bj_payout'), 5.0, 'forcedMod wins over DAILY_MODIFIERS');
    } finally {
      if (savedEntry !== undefined) DAILY_MODIFIERS[curSeed] = savedEntry;
      else delete DAILY_MODIFIERS[curSeed];
      S.forcedMod = null;
    }
  });

  it('removing DAILY_MODIFIERS entry falls back to cycle', () => {
    const curSeed = getActiveSeed();
    const savedEntry = DAILY_MODIFIERS[curSeed];
    const savedForced = S.forcedMod;
    delete DAILY_MODIFIERS[curSeed]; // remove override
    S.forcedMod = null;
    try {
      const cycleKey = CYCLE_ORDER[(getActiveDayNum() - 1) % CYCLE_ORDER.length];
      const expected = PRESET_MODIFIERS[cycleKey].bj_payout ?? null;
      assertEqual(getMod('bj_payout'), expected !== undefined ? expected : null);
    } finally {
      if (savedEntry !== undefined) DAILY_MODIFIERS[curSeed] = savedEntry;
      S.forcedMod = savedForced;
    }
  });
});
