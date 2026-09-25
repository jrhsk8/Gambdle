// ─── History restore (streak backup) ────────────────────────────────────────────
// Covers restoreHistory() / _mergeHistory() in flow.js and saveState()'s history write in core.js.
// The streak is computed only from localStorage gambdle_history; restoreHistory refills missing days
// from the server's record of this device's submitted scores. Uses the same synchronous fetch-spy
// technique as start-tracking.test.js: an async function runs synchronously up to its first await.

describe('_mergeHistory — fills only missing days', () => {
  const today = 20260925;
  it('adds server days the local copy lacks', () => {
    const r = _mergeHistory({ 20260924: 2325 }, [{ seed: 20260922, chips: 1200 }, { seed: 20260923, chips: 250 }], today);
    assertEqual(r.added, 2);
    assertDeepEqual(r.hist, { 20260922: 1200, 20260923: 250, 20260924: 2325 });
  });
  it('never overwrites a local entry', () => {
    const r = _mergeHistory({ 20260924: 999 }, [{ seed: 20260924, chips: 2325 }], today);
    assertEqual(r.added, 0);
    assertEqual(r.hist[20260924], 999);
  });
  it('ignores future days and junk rows', () => {
    const r = _mergeHistory({}, [{ seed: 20260926, chips: 5 }, { seed: 'x', chips: 5 }, { seed: 20260901, chips: null }, null], today);
    assertEqual(r.added, 0);
  });
  it('best is the max over the merged history', () => {
    const r = _mergeHistory({ 20260924: 2325 }, [{ seed: 20260709, chips: 13800 }], today);
    assertEqual(r.best, 13800);
  });
  it('empty in, empty out', () => {
    const r = _mergeHistory({}, [], today);
    assertEqual(r.added, 0); assertEqual(r.best, 0);
  });
  it('restored days rebuild the streak', () => {
    const r = _mergeHistory({ 20260923: 250, 20260924: 2325 }, [20260920, 20260921, 20260922].map(s => ({ seed: s, chips: 1 })), today);
    const saved = _ls.getItem('gambdle_history');
    try {
      _ls.setItem('gambdle_history', JSON.stringify(r.hist));
      assertEqual(computeStreak(20260924).current, 5);
    } finally { saved === null ? _ls.removeItem('gambdle_history') : _ls.setItem('gambdle_history', saved); }
  });
});

// Runs fn with the test seed off, the given sync key state, and fetch captured.
function _hrLive(fn, { synced = null } = {}) {
  const savedSeed = _ls.getItem('gambdle_use_test_seed');
  const savedSync = _ls.getItem('gambdle_history_synced');
  const orig = window.fetch;
  const calls = [];
  _ls.removeItem('gambdle_use_test_seed');
  synced === null ? _ls.removeItem('gambdle_history_synced') : _ls.setItem('gambdle_history_synced', synced);
  window.fetch = (url, opts) => { calls.push({ url, opts }); return new Promise(() => {}); }; // never resolves: nothing is written
  try { fn(calls); } finally {
    window.fetch = orig;
    savedSeed !== null ? _ls.setItem('gambdle_use_test_seed', savedSeed) : _ls.removeItem('gambdle_use_test_seed');
    savedSync !== null ? _ls.setItem('gambdle_history_synced', savedSync) : _ls.removeItem('gambdle_history_synced');
  }
}

describe('restoreHistory — request + guards', () => {
  it('posts this device ID to get_device_history', () => {
    _hrLive(calls => {
      restoreHistory();
      if (DEV_OVERRIDE) { assertEqual(calls.length, 0, 'skipped in dev mode'); return; }
      assertEqual(calls.length, 1);
      assert(calls[0].url.includes('/rest/v1/rpc/get_device_history'), calls[0].url);
      assertEqual(JSON.parse(calls[0].opts.body).p_fingerprint, getDeviceId());
    });
  });
  it('runs at most once per day', () => {
    _hrLive(calls => { restoreHistory(); assertEqual(calls.length, 0); }, { synced: String(getDailySeed()) });
  });
  it('skipped while the test seed is active', () => {
    const saved = _ls.getItem('gambdle_use_test_seed');
    const orig = window.fetch; const calls = [];
    _ls.setItem('gambdle_use_test_seed', '1');
    window.fetch = (url) => { calls.push(url); return new Promise(() => {}); };
    try { restoreHistory(); assertEqual(calls.length, 0); } finally {
      window.fetch = orig;
      saved !== null ? _ls.setItem('gambdle_use_test_seed', saved) : _ls.removeItem('gambdle_use_test_seed');
    }
  });
});

describe('saveState — a failed history write keeps the old history', () => {
  it('storage-full on gambdle_history does not replace it with a one-day copy', () => {
    const keys = ['gambdle_history', 'gambdle_highscore', 'gambdle_use_test_seed'];
    const saved = Object.fromEntries(keys.map(k => [k, _ls.getItem(k)]));
    const savedScreen = S.screen, savedChips = S.chips, savedBacklog = _backlogSeed;
    const proto = Object.getPrototypeOf(_ls), origSet = proto.setItem;
    const long = { 20260920: 1, 20260921: 1, 20260922: 1, 20260923: 1, 20260924: 1 };
    let stateKey = null, savedState = null;
    try {
      _ls.setItem('gambdle_history', JSON.stringify(long));
      _ls.setItem('gambdle_highscore', '999999');
      _ls.removeItem('gambdle_use_test_seed');
      _setBacklogSeedForTest(null);
      stateKey = getStateKey(); savedState = _ls.getItem(stateKey); // saveState also writes the day's save
      S.screen = 'results'; S.chips = 0;
      // Simulate a full disk: any history write longer than a one-day copy fails.
      proto.setItem = function (k, v) { if (k === 'gambdle_history' && String(v).length > 20) throw new Error('QuotaExceededError'); return origSet.call(this, k, v); };
      if (!DEV_OVERRIDE) saveState();
      proto.setItem = origSet;
      assertDeepEqual(JSON.parse(_ls.getItem('gambdle_history')), long, 'history untouched');
    } finally {
      proto.setItem = origSet;
      S.screen = savedScreen; S.chips = savedChips; _setBacklogSeedForTest(savedBacklog);
      if (stateKey) savedState === null ? _ls.removeItem(stateKey) : _ls.setItem(stateKey, savedState);
      for (const k of keys) saved[k] === null ? _ls.removeItem(k) : _ls.setItem(k, saved[k]);
    }
  });
});
