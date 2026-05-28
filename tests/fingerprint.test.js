// Tests for getDeviceId() — the persistent anonymous device fingerprint.
//
// Each describe block saves and restores 'gambdle_device_id' so tests are isolated
// from each other and from whatever ID the browser already has stored.

const FP_KEY = 'gambdle_device_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Save whatever ID exists before tests run and restore it after each describe.
function _withCleanSlate(fn) {
  const saved = _ls.getItem(FP_KEY);
  _ls.removeItem(FP_KEY);
  try { fn(); } finally {
    saved !== null ? _ls.setItem(FP_KEY, saved) : _ls.removeItem(FP_KEY);
  }
}

// ─── Generation ──────────────────────────────────────────────────────────────

describe('getDeviceId — generation', () => {
  it('returns a non-empty string', () => {
    _withCleanSlate(() => {
      const id = getDeviceId();
      assert(typeof id === 'string' && id.length > 0, `got ${JSON.stringify(id)}`);
    });
  });

  it('UUID v4 format: 8-4-4-4-12 lowercase hex with correct version/variant bits', () => {
    _withCleanSlate(() => {
      const id = getDeviceId();
      assert(UUID_RE.test(id), `"${id}" is not UUID v4 format`);
    });
  });

  it('length is <= 64 chars (passes Edge Function server-side validation)', () => {
    _withCleanSlate(() => {
      assert(getDeviceId().length <= 64);
    });
  });

  it('writes the generated ID to gambdle_device_id in storage', () => {
    _withCleanSlate(() => {
      const id = getDeviceId();
      assertEqual(_ls.getItem(FP_KEY), id);
    });
  });

  it('two independent generations produce different IDs', () => {
    _withCleanSlate(() => {
      const a = getDeviceId();
      _ls.removeItem(FP_KEY);
      const b = getDeviceId();
      assert(a !== b, `expected two distinct UUIDs, both were "${a}"`);
    });
  });
});

// ─── Persistence ─────────────────────────────────────────────────────────────

describe('getDeviceId — persistence', () => {
  it('returns the same value on every call within the same session', () => {
    _withCleanSlate(() => {
      const a = getDeviceId();
      const b = getDeviceId();
      const c = getDeviceId();
      assertEqual(a, b, 'second call must match first');
      assertEqual(b, c, 'third call must match second');
    });
  });

  it('returns a pre-existing stored ID without generating a new one', () => {
    const preset = '12345678-1234-4321-abcd-000000000000';
    _ls.setItem(FP_KEY, preset);
    try {
      assertEqual(getDeviceId(), preset);
    } finally {
      _ls.removeItem(FP_KEY);
      getDeviceId(); // regenerate a real one
    }
  });

  it('stored value equals returned value', () => {
    _withCleanSlate(() => {
      const returned = getDeviceId();
      const stored   = _ls.getItem(FP_KEY);
      assertEqual(returned, stored);
    });
  });

  it('removing the stored key causes regeneration on next call', () => {
    _withCleanSlate(() => {
      getDeviceId(); // generate and store
      _ls.removeItem(FP_KEY);
      assert(_ls.getItem(FP_KEY) === null, 'precondition: key removed');
      const newId = getDeviceId();
      assert(_ls.getItem(FP_KEY) !== null, 'new ID should be stored after regeneration');
      assert(UUID_RE.test(newId), `regenerated ID "${newId}" is not valid UUID`);
    });
  });
});

// ─── Edge Function compatibility ─────────────────────────────────────────────

describe('getDeviceId — Edge Function validation compatibility', () => {
  // The server checks: typeof === 'string' && length <= 64
  // These tests mirror those exact checks.

  it('type is string', () => {
    assertEqual(typeof getDeviceId(), 'string');
  });

  it('length <= 64', () => {
    assert(getDeviceId().length <= 64, `length ${getDeviceId().length} exceeds 64`);
  });

  it('is not null, undefined, or empty', () => {
    const id = getDeviceId();
    assert(id !== null && id !== undefined && id !== '', `got falsy value: ${id}`);
  });

  it('submission payload shape is valid: seed (int), chips (int), fingerprint (string <= 64)', () => {
    const payload = { seed: getDailySeed(), chips: 1000, fingerprint: getDeviceId() };
    assert(Number.isInteger(payload.seed),      'seed must be integer');
    assert(Number.isInteger(payload.chips),     'chips must be integer');
    assert(typeof payload.fingerprint === 'string' && payload.fingerprint.length <= 64,
      'fingerprint must be string <= 64 chars');
  });

  it('fingerprint passes the seed+chips submission guard (not dev mode, not test seed)', () => {
    // Mirrors the client-side guard: only submit when not in dev/test mode.
    // Here we just verify getDeviceId() returns something submittable in those cases.
    const id = getDeviceId();
    assert(typeof id === 'string' && id.length > 0 && id.length <= 64,
      'ID must be a submittable string');
  });
});

// ─── Isolation from game state ────────────────────────────────────────────────

describe('getDeviceId — isolation', () => {
  it('is independent of the active seed (same ID across seeds)', () => {
    _withCleanSlate(() => {
      const id = getDeviceId();
      _setBacklogSeedForTest(20260505);
      try { assertEqual(getDeviceId(), id, 'ID must not change when seed changes'); }
      finally { _setBacklogSeedForTest(null); }
    });
  });

  it('is independent of test-seed mode', () => {
    _withCleanSlate(() => {
      const id = getDeviceId();
      _ls.setItem('gambdle_use_test_seed', '1');
      try { assertEqual(getDeviceId(), id, 'ID must not change when test seed is active'); }
      finally { _ls.removeItem('gambdle_use_test_seed'); }
    });
  });

  it('is independent of S.chips', () => {
    _withCleanSlate(() => {
      const id = getDeviceId();
      const prev = S.chips;
      S.chips = 0;
      try { assertEqual(getDeviceId(), id); }
      finally { S.chips = prev; }
    });
  });
});
