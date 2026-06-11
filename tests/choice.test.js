// ─── Player's Choice modifier tests ───────────────────────────────────────────
// Verifies the picker routing, getMod resolution through the committed pick, the
// pickModifier guard, and that the shipped players_choice preset is well-formed.

// ─── Setup ────────────────────────────────────────────────────────────────────
const _pcSavedSeed = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1');

const _pcSnap = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
const _pcRestore = () => {
  const r = JSON.parse(_pcSnap); r.pkHeld = new Set(r.pkHeld); Object.assign(S, r);
};

function withPcState(overrides, fn) {
  Object.assign(S, overrides);
  try { fn(); } finally { _pcRestore(); }
}

// ─── pendingPlayersChoice ─────────────────────────────────────────────────────

describe('pendingPlayersChoice — detection', () => {
  it('returns the 3 offered presets on a choice day with no pick yet', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null }, () => {
      const c = pendingPlayersChoice();
      const offered = PRESET_MODIFIERS.players_choice.choices; // derive, don't hardcode the trio
      assert(Array.isArray(c) && c.length === 3, 'should offer exactly 3 choices');
      assertEqual(c[0].key, offered[0], 'first choice key carried through');
      assert(!!c[0].title, 'each choice carries its preset fields (title)');
    });
  });

  it('returns null once a pick is committed', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: 'double_pay' }, () => {
      assertEqual(pendingPlayersChoice(), null, 'no pending pick after commit');
    });
  });

  it('returns null on a normal (non-choice) day', () => {
    withPcState({ forcedMod: 'double_pay', pcPick: null }, () => {
      assertEqual(pendingPlayersChoice(), null, 'normal modifier is not a choice');
    });
  });
});

// ─── getMod resolution through the pick ───────────────────────────────────────

describe('getMod — resolves through the committed Player\'s Choice pick', () => {
  it('before picking: title is "Player\'s Choice" and game keys are inert', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null }, () => {
      assertEqual(getMod('title'), "Player's Choice", 'banner reads Player\'s Choice pre-pick');
      assertEqual(getMod('bj_payout'), null, 'no game rule applies until a pick is made');
    });
  });

  it('after picking: every getMod reads from the chosen preset', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: 'double_pay' }, () => {
      assertEqual(getMod('title'), 'Blackjack Bonus', 'title comes from the picked mod');
      assertEqual(getMod('bj_payout'), 3.0, 'picked mod\'s rule key resolves');
    });
  });
});

// ─── pickModifier ─────────────────────────────────────────────────────────────

describe('pickModifier — commit guard and routing', () => {
  it('commits an offered key and routes into Blackjack', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null, screen: 'choice' }, () => {
      pickModifier('r_hot_zero');
      assertEqual(S.pcPick, 'r_hot_zero', 'pick is recorded');
      assertEqual(S.screen, GAME1, 'routes into the first game');
    });
  });

  it('ignores a key that is not currently offered', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null, screen: 'choice' }, () => {
      pickModifier('easy_dealer'); // valid preset, but not in the offered trio
      assertEqual(S.pcPick, null, 'unoffered key is rejected');
      assertEqual(S.screen, 'choice', 'still on the picker');
    });
  });
});

// ─── startGame routing ────────────────────────────────────────────────────────

describe('startGame — diverts to the picker on a choice day', () => {
  it('choice day with no pick → picker screen', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null, screen: 'intro' }, () => {
      startGame();
      assertEqual(S.screen, 'choice', 'lands on the picker before any game');
    });
  });

  it('normal day → straight into Blackjack', () => {
    withPcState({ forcedMod: 'easy_dealer', pcPick: null, screen: 'intro' }, () => {
      startGame();
      assertEqual(S.screen, GAME1, 'no picker on a normal day');
    });
  });
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('screenChoice / modBanner — rendering', () => {
  it('renders the three option buttons without throwing', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null, screen: 'choice' }, () => {
      let html = '';
      let err = null;
      try { html = screenChoice(); } catch (e) { err = e; }
      assert(!err, 'screenChoice should not throw: ' + err);
      assert(html.includes('pc-grid') && (html.match(/pc-option/g) || []).length === 3, 'renders 3 option buttons');
      assert(html.includes(PRESET_MODIFIERS[PRESET_MODIFIERS.players_choice.choices[0]].title), 'shows an offered modifier title');
    });
  });

  it('suppresses the modifier banner on the picker screen', () => {
    withPcState({ forcedMod: 'players_choice', pcPick: null, screen: 'choice' }, () => {
      assertEqual(modBannerHTML(), '', 'no banner stacked above the picker');
    });
  });
});

// ─── Preset integrity ─────────────────────────────────────────────────────────

describe('players_choice preset — well-formed', () => {
  it('offers exactly 3 valid, non-choice modifier keys', () => {
    const choices = PRESET_MODIFIERS.players_choice.choices;
    assertEqual(choices.length, 3, 'exactly three options');
    choices.forEach(k => {
      assert(!!PRESET_MODIFIERS[k], `offered key "${k}" exists`);
      assert(!PRESET_MODIFIERS[k].choices, `offered key "${k}" is not itself a Player's Choice`);
    });
  });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
if (_pcSavedSeed === null) _ls.removeItem('gambdle_use_test_seed');
else _ls.setItem('gambdle_use_test_seed', _pcSavedSeed);
