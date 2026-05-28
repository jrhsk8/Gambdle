// ─── PRESET_MODIFIERS integrity ──────────────────────────────────────────────

describe('PRESET_MODIFIERS', () => {
  it('every entry has type, title, and desc', () => {
    for (const [k, mod] of Object.entries(PRESET_MODIFIERS)) {
      assert(typeof mod.type === 'string' && mod.type.length > 0, `${k}: missing type`);
      assert(typeof mod.title === 'string' && mod.title.length > 0, `${k}: missing title`);
      assert(typeof mod.desc === 'string' && mod.desc.length > 0, `${k}: missing desc`);
    }
  });

  it('type values are only bj/uth/roulette/cross', () => {
    const validTypes = new Set(['bj', 'uth', 'roulette', 'cross']);
    for (const [k, mod] of Object.entries(PRESET_MODIFIERS)) {
      assert(validTypes.has(mod.type), `${k}: unexpected type "${mod.type}"`);
    }
  });

  it('numeric modifier values are positive numbers', () => {
    const numericKeys = ['bj_payout','bj_dealer_stand','min_chips','uth_blind_boost','r_payout_mult','r_number_pay','r_zero_boost','r_max_bets'];
    for (const [k, mod] of Object.entries(PRESET_MODIFIERS)) {
      for (const mk of numericKeys) {
        if (mk in mod) {
          assert(typeof mod[mk] === 'number' && mod[mk] > 0, `${k}.${mk} = ${mod[mk]} should be a positive number`);
        }
      }
    }
  });

  it('boolean modifier values are actually booleans', () => {
    const boolKeys = ['bj_double_bonus','bj_first_ace','peek','comeback','all_in_or_skip','uth_blind_extended','uth_double_play','uth_hard_qualify','uth_pocket_aces','r_color_double','r_respin'];
    for (const [k, mod] of Object.entries(PRESET_MODIFIERS)) {
      for (const bk of boolKeys) {
        if (bk in mod) {
          assert(mod[bk] === true, `${k}.${bk} should be true, got ${mod[bk]}`);
        }
      }
    }
  });
});

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
