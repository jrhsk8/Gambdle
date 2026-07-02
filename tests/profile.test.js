// ─── Player Profile tests ─────────────────────────────────────────────────────
// Data layer: profileStats() + the UNLOCKS catalog (core.js). Window layer tests
// (showProfile) live further down in this file and are added in a later task.
// profileStats reads gambdle_history / gambdle_highscore from _ls, so every test
// swaps them in via withProfileData() and restores afterwards.

// Returns the YYYYMMDD seed for n days before today (Phoenix "today" via getDailySeed).
function _pfSeedDaysAgo(n) {
  const t = getDailySeed();
  const y = Math.floor(t / 10000), m = Math.floor((t % 10000) / 100) - 1, d = t % 100;
  const dt = new Date(Date.UTC(y, m, d) - n * 86400000);
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
}

// Runs fn with gambdle_history set to `hist` (object → JSON, string → raw, null → removed)
// and gambdle_highscore set to `high` (null → removed); restores both afterwards.
function withProfileData(hist, high, fn) {
  const savedH = _ls.getItem('gambdle_history');
  const savedHi = _ls.getItem('gambdle_highscore');
  try {
    if (hist === null) _ls.removeItem('gambdle_history');
    else _ls.setItem('gambdle_history', typeof hist === 'string' ? hist : JSON.stringify(hist));
    if (high === null) _ls.removeItem('gambdle_highscore');
    else _ls.setItem('gambdle_highscore', String(high));
    fn();
  } finally {
    savedH !== null ? _ls.setItem('gambdle_history', savedH) : _ls.removeItem('gambdle_history');
    savedHi !== null ? _ls.setItem('gambdle_highscore', savedHi) : _ls.removeItem('gambdle_highscore');
  }
}

describe('profileStats — empty and corrupt history', () => {
  it('new player: all zeros, 28-cell all-miss calendar', () => {
    withProfileData(null, null, () => {
      const p = profileStats();
      assertEqual(p.daysPlayed, 0); assertEqual(p.streak, 0); assertEqual(p.longest, 0);
      assertEqual(p.best, 0); assertEqual(p.avg, 0); assertEqual(p.net, 0); assertEqual(p.busts, 0);
      assertEqual(p.calendar.length, 28, '28 cells');
      assert(p.calendar.every(c => c === 'miss'), 'all cells are miss');
    });
  });

  it('corrupt history JSON degrades to the new-player shape (never throws)', () => {
    withProfileData('{not json', null, () => {
      const p = profileStats();
      assertEqual(p.daysPlayed, 0);
      assert(p.calendar.every(c => c === 'miss'), 'all cells are miss');
    });
  });

  it('non-numeric score values are silently ignored', () => {
    const hist = {}; hist[_pfSeedDaysAgo(0)] = 'foo';
    withProfileData(hist, null, () => {
      const p = profileStats();
      assertEqual(p.daysPlayed, 0, 'non-numeric entry not counted');
      assertEqual(p.calendar[27], 'miss', 'not in calendar');
    });
  });
});

describe('profileStats — aggregates', () => {
  it('daysPlayed, avg (busts included), lifetime net, busts', () => {
    const hist = {};
    hist[_pfSeedDaysAgo(0)] = 2000;  // +1000
    hist[_pfSeedDaysAgo(1)] = 0;     // -1000, bust
    hist[_pfSeedDaysAgo(2)] = 500;   // -500
    withProfileData(hist, null, () => {
      const p = profileStats();
      assertEqual(p.daysPlayed, 3);
      assertEqual(p.avg, Math.round(2500 / 3), 'avg includes the bust day');
      assertEqual(p.net, -500, 'sum of (score - 1000)');
      assertEqual(p.busts, 1);
    });
  });

  it('best is the max of history and gambdle_highscore', () => {
    const hist = {}; hist[_pfSeedDaysAgo(0)] = 2000;
    withProfileData(hist, 4250, () => assertEqual(profileStats().best, 4250, 'highscore wins'));
    withProfileData(hist, 100, () => assertEqual(profileStats().best, 2000, 'history wins'));
  });
});

describe('profileStats — streaks', () => {
  it('current streak counts back from today', () => {
    const hist = {}; hist[_pfSeedDaysAgo(0)] = 1500; hist[_pfSeedDaysAgo(1)] = 1500;
    withProfileData(hist, null, () => assertEqual(profileStats().streak, 2));
  });

  it("an unfinished today doesn't break yesterday's streak", () => {
    const hist = {}; hist[_pfSeedDaysAgo(1)] = 1500; hist[_pfSeedDaysAgo(2)] = 1500;
    withProfileData(hist, null, () => assertEqual(profileStats().streak, 2, 'streak alive until today is missed'));
  });

  it('a gap resets the current streak but longest remembers the old run', () => {
    const hist = {};
    hist[_pfSeedDaysAgo(0)] = 1500;                                  // current run: 1
    hist[_pfSeedDaysAgo(3)] = 1500; hist[_pfSeedDaysAgo(4)] = 1500; hist[_pfSeedDaysAgo(5)] = 1500; // old run: 3
    withProfileData(hist, null, () => {
      const p = profileStats();
      assertEqual(p.streak, 1, 'gap broke the run');
      assertEqual(p.longest, 3, 'longest is the historical 3-day run');
    });
  });
});

describe('profileStats — calendar classification', () => {
  it('profit at exactly 1000, loss at 999, bust at 0, miss when absent; today is the last cell', () => {
    const hist = {};
    hist[_pfSeedDaysAgo(0)] = 1000;  // profit (broke even counts as profit)
    hist[_pfSeedDaysAgo(1)] = 999;   // loss
    hist[_pfSeedDaysAgo(2)] = 0;     // bust
    withProfileData(hist, null, () => {
      const c = profileStats().calendar;
      assertEqual(c.length, 28);
      assertEqual(c[27], 'profit', 'today is last (oldest first)');
      assertEqual(c[26], 'loss');
      assertEqual(c[25], 'bust');
      assertEqual(c[24], 'miss');
    });
  });

  it('days older than 28 days do not appear', () => {
    const hist = {}; hist[_pfSeedDaysAgo(30)] = 5000;
    withProfileData(hist, null, () => {
      const p = profileStats();
      assert(p.calendar.every(c => c === 'miss'), 'out-of-window day not in calendar');
      assertEqual(p.daysPlayed, 1, 'still counted in aggregates');
    });
  });

  it('calendar window boundary: 27 days ago appears at index 0, 28 days ago does not', () => {
    const hist = {};
    hist[_pfSeedDaysAgo(27)] = 2000; // oldest cell in the window
    hist[_pfSeedDaysAgo(28)] = 2000; // just outside the window
    withProfileData(hist, null, () => {
      const c = profileStats().calendar;
      assertEqual(c[0], 'profit', 'oldest included day at index 0');
      assertEqual(c.filter(x => x !== 'miss').length, 1, 'only one entry in the window');
    });
  });
});

describe('UNLOCKS — catalog integrity', () => {
  it('has 6 entries with ascending thresholds and complete fields', () => {
    assertEqual(UNLOCKS.length, 6);
    for (let i = 0; i < UNLOCKS.length; i++) {
      const u = UNLOCKS[i];
      assert(u.prefKey.endsWith('_unlocked'), `${u.prefKey} is an *_unlocked pref`);
      assert(typeof u.icon === 'string' && u.icon.length > 0, 'icon present');
      assert(typeof u.label === 'string' && u.label.length > 0, 'label present');
      assert(Number.isFinite(u.threshold) && u.threshold > 0, 'threshold positive');
      if (i > 0) assert(u.threshold > UNLOCKS[i-1].threshold, 'thresholds ascend');
    }
  });

  it('matches the picker thresholds (single source of truth)', () => {
    const t = Object.fromEntries(UNLOCKS.map(u => [u.prefKey, u.threshold]));
    assertEqual(t.orange_back_unlocked, 1500);
    assertEqual(t.green_theme_unlocked, 2000);
    assertEqual(t.maroon_felt_unlocked, 2500);
    assertEqual(t.deck_emoji_unlocked, 3500);
    assertEqual(t.whale_back_unlocked, 5000);
    assertEqual(t.golden_back_unlocked, 10000);
  });
});

// ─── getNetTier: the lifetime-net title ladder ───────────────────────────────
// Separate from the daily CHIP_TIERS: lifetime net compounds across days and can
// go negative, so the breakpoints are an order of magnitude larger and no title
// is shared with the daily ladder.

describe('getNetTier — lifetime net tier ladder', () => {
  const t = n => getNetTier(n).label;

  it('maps every breakpoint on both sides', () => {
    assertEqual(t(-999999), 'Down the Hole');
    assertEqual(t(-5000), 'Down the Hole');
    assertEqual(t(-4999), 'In the Red');
    assertEqual(t(-1), 'In the Red');
    assertEqual(t(0), 'Novice');
    assertEqual(t(2499), 'Novice');
    assertEqual(t(2500), 'Grinder');
    assertEqual(t(9999), 'Grinder');
    assertEqual(t(10000), 'Card Shark');
    assertEqual(t(24999), 'Card Shark');
    assertEqual(t(25000), 'Pit Boss');
    assertEqual(t(49999), 'Pit Boss');
    assertEqual(t(50000), 'The House');
    assertEqual(t(99999), 'The House');
    assertEqual(t(100000), 'Mogul');
    assertEqual(t(249999), 'Mogul');
    assertEqual(t(250000), 'House Legend');
  });

  it('every entry has an emoji and a label, none reused from the daily CHIP_TIERS', () => {
    const daily = new Set(CHIP_TIERS.map(x => x.label));
    assertEqual(NET_TIERS.length, 9, 'nine tiers');
    for (const tier of NET_TIERS) {
      assert(tier.emoji && tier.label, 'emoji + label present');
      assert(!daily.has(tier.label), `"${tier.label}" must not reuse a daily tier name`);
    }
  });

  it('non-finite input falls back to the bottom tier instead of throwing', () => {
    assertEqual(t(NaN), 'Down the Hole');
  });
});

// ─── Window layer: showProfile() ──────────────────────────────────────────────
// Mirrors floating-windows.test.js: desktop float by default, keyed id, focus-not-
// duplicate on re-open. _forceMobile is the windows.js viewport test hook.

describe('showProfile — window structure', () => {
  function clean() { document.querySelectorAll('.info-modal').forEach(m => m.remove()); _forceMobile = null; }

  it('opens a keyed floating window with all four content blocks', () => {
    clean();
    try {
      showProfile();
      const el = document.getElementById('win-profile');
      assert(el, 'window created with id win-profile');
      assert(el.classList.contains('float-win'), 'desktop float');
      assert(el.querySelector('.pf-tier'), 'tier line present');
      assertEqual(el.querySelectorAll('.pf-stat').length, 6, 'six stat cells');
      assertEqual(el.querySelectorAll('.pf-cal i').length, 28, '28 calendar cells');
      assertEqual(el.querySelectorAll('.pf-badge').length, 6, 'six unlock badges');
    } finally { clean(); }
  });

  it('re-opening focuses the existing window instead of duplicating', () => {
    clean();
    try {
      showProfile(); showProfile();
      assertEqual(document.querySelectorAll('.info-modal').length, 1, 'exactly one window');
    } finally { clean(); }
  });

  it('the title grades lifetime net: a brand-new player is a Novice', () => {
    clean();
    try {
      withProfileData(null, null, () => {
        showProfile();
        const tier = document.querySelector('#win-profile .pf-tier');
        assert(tier.textContent.includes('Novice'), 'zero lifetime net shows Novice');
        assert(tier.textContent.includes('0 days played'), 'day count still shown');
      });
    } finally { clean(); }
  });

  it('a losing lifetime net shows a losing tier', () => {
    clean();
    try {
      const hist = {}; hist[_pfSeedDaysAgo(0)] = 0; // one bust day: net -1,000
      withProfileData(hist, null, () => {
        showProfile();
        assert(document.querySelector('#win-profile .pf-tier').textContent.includes('In the Red'),
          'negative net shows In the Red');
      });
    } finally { clean(); }
  });

  it('the × button closes the window', () => {
    clean();
    try {
      showProfile();
      closeWindow(document.querySelector('#win-profile .tb-btn.close'));
      assert(!document.getElementById('win-profile'), 'window removed');
    } finally { clean(); }
  });

  it('locked unlocks show a 🔒 hint with the threshold; unlocked show their icon', () => {
    clean();
    const saved = getPref('orange_back_unlocked');
    try {
      setPref('orange_back_unlocked', false);
      showProfile();
      let badge = [...document.querySelectorAll('#win-profile .pf-badge')].find(b => b.textContent.includes('Orange Back'));
      assert(badge.classList.contains('pf-locked'), 'locked badge dimmed');
      assert(badge.textContent.includes('1,500+'), 'locked badge shows its threshold');
      clean();
      setPref('orange_back_unlocked', true);
      showProfile();
      badge = [...document.querySelectorAll('#win-profile .pf-badge')].find(b => b.textContent.includes('Orange Back'));
      assert(!badge.classList.contains('pf-locked'), 'unlocked badge not dimmed');
      assert(badge.textContent.includes('🟠'), 'unlocked badge shows its icon');
    } finally { setPref('orange_back_unlocked', saved ?? false); clean(); }
  });

  it('contains no em dashes (player-facing copy rule)', () => {
    clean();
    try {
      showProfile();
      assert(!document.getElementById('win-profile').textContent.includes('—'), 'no em dash anywhere in the window');
    } finally { clean(); }
  });

  it('a brand-new player sees 0 (not +0) for Lifetime Net', () => {
    clean();
    try {
      withProfileData(null, null, () => {
        showProfile();
        const net = [...document.querySelectorAll('#win-profile .pf-stat')].find(s => s.textContent.includes('Lifetime Net'));
        assert(net, 'Lifetime Net cell present');
        assert(!net.textContent.includes('+0'), 'zero net shows without a plus sign');
      });
    } finally { clean(); }
  });

  it('mobile: opens as a single blocking modal', () => {
    clean();
    try {
      _forceMobile = true;
      showProfile();
      const el = document.getElementById('win-profile');
      assert(el && !el.classList.contains('float-win'), 'blocking modal on mobile');
    } finally { clean(); }
  });
});
