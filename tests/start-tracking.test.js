// ─── Start tracking tests ─────────────────────────────────────────────────────
// Tests for _submitStart() deduplication guards and fetch payload, and that
// startGame() correctly navigates and delegates to _submitStart().
//
// Key technique: async functions run synchronously up to their first `await`,
// so `fetch()` is called synchronously before `_submitStart()` suspends.
// A synchronous fetch mock captures the call without needing async test support.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _stSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const _stSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _stRestore = () => {
  const r = JSON.parse(_stSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

// Returns the per-day dedup key for the current active seed.
const _startKey = () => `gambdle_started_${getActiveSeed()}`;

// Runs fn() with the test seed removed (simulates a real player session) and
// the started key cleared, then restores both regardless of outcome.
function withLiveMode(fn) {
  const savedSeed = _ls.getItem('gambdle_use_test_seed');
  const savedKey  = _ls.getItem(_startKey());
  _ls.removeItem('gambdle_use_test_seed');
  _ls.removeItem(_startKey());
  try { fn(); } finally {
    savedSeed !== null ? _ls.setItem('gambdle_use_test_seed', savedSeed) : _ls.removeItem('gambdle_use_test_seed');
    savedKey  !== null ? _ls.setItem(_startKey(), savedKey)  : _ls.removeItem(_startKey());
  }
}

// Replaces window.fetch with a spy, runs fn(spy), then restores the original.
function withFetchSpy(fn) {
  const orig = window.fetch;
  const calls = [];
  window.fetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true }); };
  try { fn(calls); } finally { window.fetch = orig; }
}

// ─── Guard: test seed active ──────────────────────────────────────────────────

describe('_submitStart — skips when test seed is active', () => {
  it('does not call fetch', () => {
    // Test seed is active (set in setup above), so _testActive() === true.
    withFetchSpy(calls => {
      _submitStart();
      assertEqual(calls.length, 0, 'fetch must not be called in test mode');
    });
  });

  it('does not write the started key to localStorage', () => {
    const before = _ls.getItem(_startKey());
    withFetchSpy(() => { _submitStart(); });
    assertEqual(_ls.getItem(_startKey()), before, 'localStorage key must be unchanged');
  });
});

// ─── Guard: already started ───────────────────────────────────────────────────

describe('_submitStart — skips when already-started key exists', () => {
  it('does not call fetch', () => {
    withLiveMode(() => {
      _ls.setItem(_startKey(), '1'); // simulate a previous start this session
      withFetchSpy(calls => {
        _submitStart();
        assertEqual(calls.length, 0, 'fetch must not be called when key already set');
      });
      _ls.removeItem(_startKey());
    });
  });
});

// ─── Guard: backlog / archive mode ────────────────────────────────────────────

describe('_submitStart — skips in backlog mode', () => {
  it('does not call fetch when _backlogSeed is set', () => {
    withLiveMode(() => {
      _withBacklogSeed(20261231, () => {
        withFetchSpy(calls => {
          _submitStart();
          assertEqual(calls.length, 0, 'fetch must not be called in backlog mode');
        });
      });
    });
  });
});

// ─── Happy path: correct fetch call ──────────────────────────────────────────

describe('_submitStart — fetch payload when all guards pass', () => {
  it('makes exactly one POST request', () => {
    withLiveMode(() => {
      withFetchSpy(calls => {
        _submitStart();
        assertEqual(calls.length, 1, 'exactly one fetch call expected');
        assertEqual(calls[0].opts.method, 'POST', 'uses POST method');
      });
    });
  });

  it('targets the /starts endpoint', () => {
    withLiveMode(() => {
      withFetchSpy(calls => {
        _submitStart();
        assert(calls[0].url.includes('/starts'), `URL should include /starts, got: ${calls[0].url}`);
      });
    });
  });

  it('sends the active seed in the body', () => {
    withLiveMode(() => {
      withFetchSpy(calls => {
        _submitStart();
        const body = JSON.parse(calls[0].opts.body);
        assertEqual(body.seed, getActiveSeed(), 'body.seed must match getActiveSeed()');
      });
    });
  });

  it('sends a non-empty fingerprint string in the body', () => {
    withLiveMode(() => {
      withFetchSpy(calls => {
        _submitStart();
        const body = JSON.parse(calls[0].opts.body);
        assert(typeof body.fingerprint === 'string', 'body.fingerprint must be a string');
        assert(body.fingerprint.length > 0, 'body.fingerprint must be non-empty');
      });
    });
  });

  it('includes Prefer: return=minimal header', () => {
    withLiveMode(() => {
      withFetchSpy(calls => {
        _submitStart();
        const prefer = calls[0].opts.headers['Prefer'];
        assert(prefer?.includes('return=minimal'), `Prefer header should contain return=minimal, got: ${prefer}`);
      });
    });
  });

  it('does not call fetch a second time when called again (key set on first ok response)', () => {
    // After a successful submit the key is set asynchronously.
    // But if we manually set the key (simulating the async completion), a second
    // call must be a no-op — this verifies the dedup contract end-to-end.
    withLiveMode(() => {
      withFetchSpy(calls => {
        _submitStart();
        // Simulate the async setItem that runs after fetch resolves
        _ls.setItem(_startKey(), '1');
        _submitStart(); // second call — key is now set
        assertEqual(calls.length, 1, 'second call should be skipped by dedup key');
      });
      _ls.removeItem(_startKey()); // cleanup
    });
  });
});

// ─── startGame() ─────────────────────────────────────────────────────────────

describe('startGame — navigation', () => {
  // Pin a plain (non-choice) modifier: on a real Player's Choice day startGame correctly
  // routes to the picker screen instead of GAME1, which is covered by choice.test.js.
  it('sets S.screen to GAME1', () => {
    const prevKey = _ls.getItem(_stSnap); // unused, just for safety
    try {
      S.forcedMod = {};
      startGame();
      assertEqual(S.screen, GAME1, `screen should be ${GAME1} after startGame`);
    } finally {
      _stRestore();
    }
  });

  it('sets bjPhase to bet', () => {
    try {
      S.forcedMod = {};
      startGame();
      assertEqual(S.bjPhase, 'bet', 'bjPhase should be bet after startGame');
    } finally {
      _stRestore();
    }
  });

  it('does not write a started key in test mode', () => {
    const before = _ls.getItem(_startKey());
    try {
      S.forcedMod = {};
      startGame();
      assertEqual(_ls.getItem(_startKey()), before, 'no started key should be written in test mode');
    } finally {
      _stRestore();
    }
  });
});

// ─── Borrow tracking: _submitBorrow() ────────────────────────────────────────
// Mirrors _submitStart: fire-and-forget POST, deduped per device/day, skipped in
// test/backlog modes. Fires only when the loan is actually taken (borrowChips).
const _borrowKey = () => `gambdle_borrowed_${getActiveSeed()}`;

function withLiveBorrow(fn) {
  const savedSeed = _ls.getItem('gambdle_use_test_seed');
  const savedKey  = _ls.getItem(_borrowKey());
  _ls.removeItem('gambdle_use_test_seed');
  _ls.removeItem(_borrowKey());
  try { fn(); } finally {
    savedSeed !== null ? _ls.setItem('gambdle_use_test_seed', savedSeed) : _ls.removeItem('gambdle_use_test_seed');
    savedKey  !== null ? _ls.setItem(_borrowKey(), savedKey)  : _ls.removeItem(_borrowKey());
  }
}

describe('_submitBorrow — dedup guards and payload', () => {
  it('skips fetch when the test seed is active', () => {
    withFetchSpy(calls => { _submitBorrow(); assertEqual(calls.length, 0, 'no fetch in test mode'); });
  });

  it('skips fetch when the borrowed key already exists', () => {
    withLiveBorrow(() => {
      _ls.setItem(_borrowKey(), '1');
      withFetchSpy(calls => { _submitBorrow(); assertEqual(calls.length, 0, 'no fetch when already recorded'); });
    });
  });

  it('skips fetch in backlog mode', () => {
    withLiveBorrow(() => {
      _withBacklogSeed(20261231, () => {
        withFetchSpy(calls => { _submitBorrow(); assertEqual(calls.length, 0, 'no fetch in backlog mode'); });
      });
    });
  });

  it('POSTs once to /borrows with seed + fingerprint when guards pass', () => {
    withLiveBorrow(() => {
      withFetchSpy(calls => {
        _submitBorrow();
        assertEqual(calls.length, 1, 'exactly one fetch');
        assertEqual(calls[0].opts.method, 'POST', 'uses POST');
        assert(calls[0].url.includes('/borrows'), `URL should include /borrows, got: ${calls[0].url}`);
        const body = JSON.parse(calls[0].opts.body);
        assertEqual(body.seed, getActiveSeed(), 'body.seed matches active seed');
        assert(typeof body.fingerprint === 'string' && body.fingerprint.length > 0, 'non-empty fingerprint');
      });
    });
  });

  it('does not fire a second time once the borrowed key is set', () => {
    withLiveBorrow(() => {
      withFetchSpy(calls => {
        _submitBorrow();
        _ls.setItem(_borrowKey(), '1'); // simulate the async setItem after a 200
        _submitBorrow();
        assertEqual(calls.length, 1, 'second call deduped');
      });
    });
  });
});

// ─── Progress beacon: _submitProgress() ──────────────────────────────────────
// Mirrors _submitStart/_submitBorrow: fire-and-forget POST, deduped per device/day/STAGE, skipped
// in test/backlog modes. Fires on entry to UTH and Roulette (here tested with stage 'uth').
const _progKey = (stage) => `gambdle_progress_${getActiveSeed()}_${stage}`;

function withLiveProg(fn) {
  const savedSeed = _ls.getItem('gambdle_use_test_seed');
  const savedKey  = _ls.getItem(_progKey('uth'));
  _ls.removeItem('gambdle_use_test_seed');
  _ls.removeItem(_progKey('uth'));
  try { fn(); } finally {
    savedSeed !== null ? _ls.setItem('gambdle_use_test_seed', savedSeed) : _ls.removeItem('gambdle_use_test_seed');
    savedKey  !== null ? _ls.setItem(_progKey('uth'), savedKey)  : _ls.removeItem(_progKey('uth'));
  }
}

describe('_submitProgress — dedup guards and payload', () => {
  it('skips fetch when the test seed is active', () => {
    withFetchSpy(calls => { _submitProgress('uth'); assertEqual(calls.length, 0, 'no fetch in test mode'); });
  });

  it('skips fetch when the progress key already exists', () => {
    withLiveProg(() => {
      _ls.setItem(_progKey('uth'), '1');
      withFetchSpy(calls => { _submitProgress('uth'); assertEqual(calls.length, 0, 'no fetch when already recorded'); });
    });
  });

  it('skips fetch in backlog mode', () => {
    withLiveProg(() => {
      _withBacklogSeed(20261231, () => {
        withFetchSpy(calls => { _submitProgress('uth'); assertEqual(calls.length, 0, 'no fetch in backlog mode'); });
      });
    });
  });

  it('POSTs once to /progress with seed + fingerprint + stage when guards pass', () => {
    withLiveProg(() => {
      withFetchSpy(calls => {
        _submitProgress('uth');
        assertEqual(calls.length, 1, 'exactly one fetch');
        assertEqual(calls[0].opts.method, 'POST', 'uses POST');
        assert(calls[0].url.includes('/progress'), `URL should include /progress, got: ${calls[0].url}`);
        const body = JSON.parse(calls[0].opts.body);
        assertEqual(body.seed, getActiveSeed(), 'body.seed matches active seed');
        assertEqual(body.stage, 'uth', 'body.stage is uth');
        assert(typeof body.fingerprint === 'string' && body.fingerprint.length > 0, 'non-empty fingerprint');
      });
    });
  });

  it('does not fire a second time once the progress key is set', () => {
    withLiveProg(() => {
      withFetchSpy(calls => {
        _submitProgress('uth');
        _ls.setItem(_progKey('uth'), '1'); // simulate the async setItem after a 200
        _submitProgress('uth');
        assertEqual(calls.length, 1, 'second call deduped');
      });
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_stSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _stSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_stRestore();
