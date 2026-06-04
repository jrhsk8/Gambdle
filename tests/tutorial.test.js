// ─── Tutorial tips ─────────────────────────────────────────────────────────────
// Covers _maybeTip's dedup, off-switch, one-at-a-time, and first-tip note behaviour,
// plus content integrity of the editable src/tutorial.js. The unit harness has no
// #xp-balloon, so we create a mock one for the duration of each test.

const _tutKeys = ['modifier', 'bj_hands', 'uth_bet', 'uth_raise', 'uth_turn', 'uth_qualify'];

function _clearTutState() {
  _tutKeys.forEach(id => _ls.removeItem('gambdle_tip_' + id + '_seen'));
  _ls.removeItem('gambdle_tutorial_intro_seen');
  _ls.removeItem('gambdle_pref_tutorial_off');
  _ls.removeItem('gambdle_dev_test_tutorial');
  setPref('tutorial_off', false);
}

// Runs fn(balloon) with a fresh mock #xp-balloon and clean tutorial state, then cleans up.
function withBalloon(fn) {
  _clearTutState();
  let bal = document.getElementById('xp-balloon');
  const created = !bal;
  if (created) { bal = document.createElement('div'); bal.id = 'xp-balloon'; document.body.appendChild(bal); }
  try { fn(bal); }
  finally {
    if (created) bal.remove(); else { bal.className = ''; bal.innerHTML = ''; }
    _clearTutState();
  }
}

describe('tutorial content — src/tutorial.js', () => {
  it('every ordered id maps to a tip with a non-empty title and body', () => {
    TUTORIAL_ORDER.forEach(id => {
      const t = TUTORIAL_TIPS[id];
      assert(t, `missing tip for id "${id}"`);
      assert(typeof t.title === 'string' && t.title.length > 0, `${id} has a title`);
      assert(typeof t.body === 'string' && t.body.length > 0, `${id} has a body`);
    });
  });

  it('TUTORIAL_ORDER and TUTORIAL_TIPS describe exactly the same ids', () => {
    assertEqual(
      TUTORIAL_ORDER.slice().sort().join(','),
      Object.keys(TUTORIAL_TIPS).sort().join(','),
      'order list and tip keys must match'
    );
  });
});

describe('_maybeTip — dedup, off-switch, one-at-a-time, first note', () => {
  it('shows a tip once and marks it seen, then no-ops', () => {
    withBalloon(bal => {
      assertEqual(_maybeTip('bj_hands'), true, 'first call shows the tip');
      assert(bal.classList.contains('xpb-visible'), 'balloon becomes visible');
      assert(_tipSeen('bj_hands'), 'tip is marked seen');
      bal.className = ''; bal.innerHTML = '';          // simulate dismissal
      assertEqual(_maybeTip('bj_hands'), false, 'second call is a no-op');
    });
  });

  it('shows nothing when tutorials are turned off', () => {
    withBalloon(bal => {
      setPref('tutorial_off', true);
      assertEqual(_maybeTip('uth_bet'), false, 'off → no tip');
      assert(!bal.classList.contains('xpb-visible'), 'balloon stays hidden');
      assert(!_tipSeen('uth_bet'), 'a suppressed tip is not consumed');
    });
  });

  it('only shows one tip at a time (a second waits while a balloon is up)', () => {
    withBalloon(() => {
      assertEqual(_maybeTip('modifier'), true, 'first tip shows');
      assertEqual(_maybeTip('bj_hands'), false, 'second tip is skipped while one is visible');
      assert(!_tipSeen('bj_hands'), 'the skipped tip is NOT marked seen (so it can show later)');
    });
  });

  it('appends the off-switch note to the very first tip only', () => {
    withBalloon(bal => {
      _maybeTip('modifier');
      assert(bal.innerHTML.includes('turn them off'), 'first-ever tip carries the off-switch note');
      bal.className = ''; bal.innerHTML = '';
      _maybeTip('bj_hands');
      assert(!bal.innerHTML.includes('turn them off'), 'subsequent tips omit the note');
    });
  });
});

describe('_eligibleTips — which tip fires on which screen/phase', () => {
  function atState(o, fn) {
    const snap = { screen: S.screen, bjPhase: S.bjPhase, uthPhase: S.uthPhase, uthRaised: S.uthRaised };
    Object.assign(S, o);
    try { fn(); } finally { Object.assign(S, snap); }
  }

  it('intro → modifier tip', () => atState({ screen: 'intro' }, () => assertDeepEqual(_eligibleTips(), ['modifier'])));
  it('Blackjack bet → bj_hands', () => atState({ screen: 'bj', bjPhase: 'bet' }, () => assertDeepEqual(_eligibleTips(), ['bj_hands'])));
  it("Hold'em bet → uth_bet", () => atState({ screen: 'uth', uthPhase: 'bet' }, () => assertDeepEqual(_eligibleTips(), ['uth_bet'])));
  it("Hold'em pre-flop → uth_raise", () => atState({ screen: 'uth', uthPhase: 'preflop' }, () => assertDeepEqual(_eligibleTips(), ['uth_raise'])));
  it("Hold'em reveal → uth_qualify", () => atState({ screen: 'uth', uthPhase: 'reveal' }, () => assertDeepEqual(_eligibleTips(), ['uth_qualify'])));
  it("Hold'em result → uth_qualify", () => atState({ screen: 'uth', uthPhase: 'result' }, () => assertDeepEqual(_eligibleTips(), ['uth_qualify'])));
  it("Hold'em river, not raised → uth_turn", () => atState({ screen: 'uth', uthPhase: 'turn', uthRaised: false }, () => assertDeepEqual(_eligibleTips(), ['uth_turn'])));

  it('no tip fires on non-trigger states', () => {
    atState({ screen: 'bj', bjPhase: 'play' }, () => assertDeepEqual(_eligibleTips(), [], 'bj play'));
    atState({ screen: 'uth', uthPhase: 'flop' }, () => assertDeepEqual(_eligibleTips(), [], 'uth flop'));
    atState({ screen: 'uth', uthPhase: 'turn', uthRaised: true }, () => assertDeepEqual(_eligibleTips(), [], 'uth turn after raising'));
    atState({ screen: 'roulette' }, () => assertDeepEqual(_eligibleTips(), [], 'roulette'));
    atState({ screen: 'results' }, () => assertDeepEqual(_eligibleTips(), [], 'results'));
    atState({ screen: 'devstats' }, () => assertDeepEqual(_eligibleTips(), [], 'devstats'));
  });

  it('every id it can return has a matching tip', () => {
    ['modifier', 'bj_hands', 'uth_bet', 'uth_raise', 'uth_turn', 'uth_qualify'].forEach(id =>
      assert(TUTORIAL_TIPS[id], `TUTORIAL_TIPS is missing ${id}`));
  });
});

describe('toggleTutorial — the Help-menu off-switch', () => {
  // toggleTutorial() also fires a toast + closes any dropdown; provide a #toast so it can't throw.
  function withToast(fn) {
    let t = document.getElementById('toast');
    const created = !t;
    if (created) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    const prev = getPref('tutorial_off');
    try { fn(); } finally { setPref('tutorial_off', prev); if (created) t.remove(); }
  }

  it('flips tips off, then back on, and persists each time', () => {
    withToast(() => {
      setPref('tutorial_off', false);
      toggleTutorial();
      assertEqual(getPref('tutorial_off'), true, 'first toggle turns tips off');
      toggleTutorial();
      assertEqual(getPref('tutorial_off'), false, 'second toggle turns them back on');
    });
  });

  it('while off, no tip shows even on a trigger screen', () => {
    withToast(() => {
      setPref('tutorial_off', true);
      assertEqual(_maybeTip('modifier'), false, 'off suppresses the tip');
      assert(!_tipSeen('modifier'), 'a suppressed tip is not consumed, so it can show again once re-enabled');
    });
  });
});

describe('Test Tutorial dev mode — always re-show', () => {
  function withForce(on, fn) {
    const prev = _ls.getItem('gambdle_dev_test_tutorial');
    _ls.setItem('gambdle_dev_test_tutorial', on ? '1' : '');
    try { fn(); }
    finally { prev === null ? _ls.removeItem('gambdle_dev_test_tutorial') : _ls.setItem('gambdle_dev_test_tutorial', prev); }
  }

  it('_testTutorial reflects the dev flag', () => {
    withForce(true,  () => assert(_testTutorial(), 'on'));
    withForce(false, () => assert(!_testTutorial(), 'off'));
  });

  it('re-shows an already-seen tip and never marks tips seen', () => {
    withBalloon(bal => {
      _ls.setItem('gambdle_tip_bj_hands_seen', '1'); // pretend already seen
      withForce(true, () => assertEqual(_maybeTip('bj_hands'), true, 'force shows a seen tip again'));
      bal.className = ''; bal.innerHTML = '';
      _ls.removeItem('gambdle_tip_uth_bet_seen');
      withForce(true, () => _maybeTip('uth_bet'));
      assert(!_tipSeen('uth_bet'), 'force mode does not persist a tip as seen');
    });
  });

  it('overrides the Tips-off setting', () => {
    withBalloon(() => {
      setPref('tutorial_off', true);
      withForce(true, () => assertEqual(_maybeTip('modifier'), true, 'force beats the off switch'));
    });
  });

  it('devToggleTestTutorial flips the persisted flag on then off', () => {
    let t = document.getElementById('toast');
    const created = !t;
    if (created) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    const prev = _ls.getItem('gambdle_dev_test_tutorial');
    try {
      _ls.setItem('gambdle_dev_test_tutorial', '');
      devToggleTestTutorial();
      assert(_testTutorial(), 'first toggle turns it on');
      devToggleTestTutorial();
      assert(!_testTutorial(), 'second toggle turns it off');
    } finally {
      prev === null ? _ls.removeItem('gambdle_dev_test_tutorial') : _ls.setItem('gambdle_dev_test_tutorial', prev);
      if (created) t.remove();
    }
  });
});

// ─── _popupOutsideClick — clicking back into an unfocused window keeps the tip up ───────────────
// Regression: the tip balloon is dismissed by any outside pointerdown, but the click that brings an
// unfocused window back into focus shouldn't count. The refocus click can land either before focus
// is restored (document not focused yet) or just after the focus event, so both are guarded.
describe('_popupOutsideClick — refocus click does not dismiss the tip', () => {
  // Show the balloon, stub the focus state, fire an outside pointerdown; returns whether it dismissed.
  function clickOutside({ hasFocus, refocusAgoMs }) {
    let dismissed;
    withBalloon(bal => {
      bal.classList.add('xpb-visible');
      const origHasFocus = document.hasFocus, origRefocus = _refocusAt;
      document.hasFocus = () => hasFocus;
      _refocusAt = Date.now() - refocusAgoMs;
      try {
        _popupOutsideClick({ target: document.body });   // body is outside the balloon
        dismissed = !bal.classList.contains('xpb-visible');
      } finally {
        document.hasFocus = origHasFocus;
        _refocusAt = origRefocus;
      }
    });
    return dismissed;
  }

  it('keeps the tip up when the click arrives before focus is restored (document not focused)', () => {
    assertEqual(clickOutside({ hasFocus: false, refocusAgoMs: 10000 }), false);
  });
  it('keeps the tip up when the click lands right after the refocus (within 300ms)', () => {
    assertEqual(clickOutside({ hasFocus: true, refocusAgoMs: 50 }), false);
  });
  it('still dismisses on a normal outside click while focused, well after any refocus', () => {
    assertEqual(clickOutside({ hasFocus: true, refocusAgoMs: 10000 }), true);
  });
});
