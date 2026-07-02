// ─── Devices / client-profile tests ───────────────────────────────────────────
// Covers three parts of the Devices feature:
//   1. _parseUA: userAgent string to coarse browser/os tokens (pure, order-sensitive)
//   2. _vpBucket: viewport width to ordered distribution bucket (pure)
//   3. _submitClient: load beacon, dedup/skip guards + fetch payload (mirrors start-tracking.test.js)
// _withBacklogSeed is a shared global from dev.test.js (loaded earlier in test.html).

// ─── _parseUA: browser ─────────────────────────────────────────────────────────
describe('_parseUA — browser classification', () => {
  const B = ua => _parseUA(ua).browser;
  it('iPhone Safari → safari', () => assertEqual(B('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'safari'));
  it('Android Chrome → chrome', () => assertEqual(B('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Mobile Safari/537.36'), 'chrome'));
  it('Windows Edge → edge (matched before chrome)', () => assertEqual(B('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36 Edg/118.0'), 'edge'));
  it('Firefox → firefox', () => assertEqual(B('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0'), 'firefox'));
  it('iOS Chrome (CriOS) → chrome', () => assertEqual(B('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/118.0 Mobile/15E148 Safari/604.1'), 'chrome'));
  it('Samsung Internet → samsung (matched before chrome)', () => assertEqual(B('Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 SamsungBrowser/22.0 Chrome/111.0 Mobile Safari/537.36'), 'samsung'));
  it('empty UA → other', () => assertEqual(B(''), 'other'));
});

// ─── _parseUA: OS ──────────────────────────────────────────────────────────────
describe('_parseUA — OS classification', () => {
  const O = ua => _parseUA(ua).os;
  it('iPhone → ios', () => assertEqual(O('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'), 'ios'));
  it('iPad → ios', () => assertEqual(O('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Safari/604.1'), 'ios'));
  it('Android → android', () => assertEqual(O('Mozilla/5.0 (Linux; Android 13) Chrome/118.0'), 'android'));
  it('Windows → windows', () => assertEqual(O('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0'), 'windows'));
  it('macOS → macos', () => assertEqual(O('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15'), 'macos'));
  it('empty UA → other', () => assertEqual(O(''), 'other'));
});

// ─── _vpBucket ───────────────────────────────────────────────────────────────────
describe('_vpBucket — viewport width bucketing', () => {
  it('320 → <360',            () => assertEqual(_vpBucket(320), '<360'));
  it('359 → <360 (edge)',     () => assertEqual(_vpBucket(359), '<360'));
  it('360 → 360-413 (edge)',  () => assertEqual(_vpBucket(360), '360-413'));
  it('413 → 360-413',         () => assertEqual(_vpBucket(413), '360-413'));
  it('414 → 414-767 (edge)',  () => assertEqual(_vpBucket(414), '414-767'));
  it('767 → 414-767',         () => assertEqual(_vpBucket(767), '414-767'));
  it('768 → 768-1023 (edge)', () => assertEqual(_vpBucket(768), '768-1023'));
  it('1023 → 768-1023',       () => assertEqual(_vpBucket(1023), '768-1023'));
  it('1024 → 1024+ (edge)',   () => assertEqual(_vpBucket(1024), '1024+'));
  it('2560 → 1024+',          () => assertEqual(_vpBucket(2560), '1024+'));
  it('non-numeric → <360 (coerces to 0)', () => assertEqual(_vpBucket('x'), '<360'));
});

// ─── _submitClient: guards + payload ─────────────────────────────────────────────
// Mirrors start-tracking.test.js: fire-and-forget POST, deduped per device/day, skipped in
// test/backlog modes. The test seed is set for the whole file (so _testActive() is true) and
// removed inside dvLiveMode for the happy-path / dedup cases.
const _dvSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const dvClientKey = () => `gambdle_client_${getActiveSeed()}`;

function dvFetchSpy(fn) {
  const orig = window.fetch;
  const calls = [];
  window.fetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true }); };
  try { fn(calls); } finally { window.fetch = orig; }
}

function dvLiveMode(fn) {
  const savedSeed = _ls.getItem('gambdle_use_test_seed');
  const savedKey  = _ls.getItem(dvClientKey());
  _ls.removeItem('gambdle_use_test_seed');
  _ls.removeItem(dvClientKey());
  try { fn(); } finally {
    savedSeed !== null ? _ls.setItem('gambdle_use_test_seed', savedSeed) : _ls.removeItem('gambdle_use_test_seed');
    savedKey  !== null ? _ls.setItem(dvClientKey(), savedKey)  : _ls.removeItem(dvClientKey());
  }
}

describe('_submitClient — skips when test seed is active', () => {
  it('does not call fetch', () => {
    dvFetchSpy(calls => { _submitClient(); assertEqual(calls.length, 0, 'no fetch in test mode'); });
  });
});

describe('_submitClient — skips when the client key already exists', () => {
  it('does not call fetch', () => {
    dvLiveMode(() => {
      _ls.setItem(dvClientKey(), '1');
      dvFetchSpy(calls => { _submitClient(); assertEqual(calls.length, 0, 'no fetch when already recorded'); });
    });
  });
});

describe('_submitClient — skips in backlog mode', () => {
  it('does not call fetch when _backlogSeed is set', () => {
    dvLiveMode(() => {
      _withBacklogSeed(20261231, () => {
        dvFetchSpy(calls => { _submitClient(); assertEqual(calls.length, 0, 'no fetch in backlog mode'); });
      });
    });
  });
});

describe('_submitClient — fetch payload when all guards pass', () => {
  it('POSTs exactly once to /clients', () => {
    dvLiveMode(() => {
      dvFetchSpy(calls => {
        _submitClient();
        assertEqual(calls.length, 1, 'exactly one fetch');
        assertEqual(calls[0].opts.method, 'POST', 'uses POST');
        assert(calls[0].url.includes('/rest/v1/clients'), `URL should target /clients, got: ${calls[0].url}`);
      });
    });
  });

  it('uses Prefer: return=minimal (plain insert, no upsert)', () => {
    dvLiveMode(() => {
      dvFetchSpy(calls => {
        _submitClient();
        const prefer = calls[0].opts.headers['Prefer'];
        assert(prefer?.includes('return=minimal'), `Prefer should request return=minimal, got: ${prefer}`);
        // Upsert is intentionally not used: it would require anon SELECT, exposing the raw ua.
        assert(!prefer?.includes('merge-duplicates'), `Prefer must not request an upsert, got: ${prefer}`);
      });
    });
  });

  it('body carries seed, fingerprint, viewport, and parsed tokens', () => {
    dvLiveMode(() => {
      dvFetchSpy(calls => {
        _submitClient();
        const body = JSON.parse(calls[0].opts.body);
        assertEqual(body.seed, getActiveSeed(), 'body.seed matches active seed');
        assert(typeof body.fingerprint === 'string' && body.fingerprint.length > 0, 'non-empty fingerprint');
        assert(Number.isFinite(body.w) && Number.isFinite(body.h), 'w/h are numbers');
        assert(typeof body.browser === 'string' && typeof body.os === 'string', 'browser/os tokens present');
        assert(body.ua === undefined || body.ua.length <= 180, 'raw ua (if present) is truncated to <=180');
      });
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_dvSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _dvSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
