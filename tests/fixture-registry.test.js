// ─── Fixture registry smoke tests ─────────────────────────────────────────────
// Guards tests/harness/screen-fixtures.js: every entry in SCREEN_FIXTURES, driven through
// renderFixture(), must render without throwing and land on a valid screen (a .panel).
// A broken or renamed fixture is caught here immediately, before it breaks the lab,
// the screenshot scripts, or the layout tests that all read from this same registry.
// Companion to render-smoke.test.js (raw screen*() coverage): this proves the registry
// entries that feed the whole UI-tweak pipeline are all live.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _frSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');
_ls.removeItem('gambdle_forced_mod');

const _frKey  = getStateKey();
const _frSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _frRestore = () => {
  const r = JSON.parse(_frSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

describe('fixture registry — every Fixture renders a valid Screen', () => {
  it('SCREEN_FIXTURES + renderFixture are loaded', () => {
    assert(typeof SCREEN_FIXTURES === 'object' && SCREEN_FIXTURES, 'SCREEN_FIXTURES global missing');
    assert(typeof renderFixture === 'function', 'renderFixture global missing');
    assert(Object.keys(SCREEN_FIXTURES).length >= 20, 'expected the union of both screenshot sets + split worst-cases');
  });

  // First renderFixture() call snapshots the current (clean) S as its reset baseline.
  const prev = _ls.getItem(_frKey);
  try {
    for (const name of Object.keys(SCREEN_FIXTURES)) {
      it(`${name} renders without throwing → .panel`, () => {
        let threw = null;
        try { renderFixture(name, { defaultMod: {} }); } catch (e) { threw = e; }
        assert(threw === null, `renderFixture('${name}') threw: ${threw && threw.message}`);
        assert(document.querySelector('.window') !== null, `${name}: no .window rendered`);
        assert(document.querySelector('.panel') !== null, `${name}: no .panel rendered`);
      });
    }
  } finally {
    prev !== null ? _ls.setItem(_frKey, prev) : _ls.removeItem(_frKey);
    _frRestore();
  }

  it('renderFixture throws on an unknown Fixture name', () => {
    let threw = null;
    try { renderFixture('does-not-exist'); } catch (e) { threw = e; }
    assert(threw !== null, 'expected renderFixture to throw on an unknown name');
    _frRestore();
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
_frSavedSeed !== null
  ? _ls.setItem('gambdle_use_test_seed', _frSavedSeed)
  : _ls.removeItem('gambdle_use_test_seed');
_frRestore();
