// ─── Desktop floating windows ────────────────────────────────────────────────────────────────────
// On desktop, info dialogs (Help sections, About, the ✨ modifier popup, Send Feedback) are
// non-blocking floating windows: multiple open at once, one instance per type (re-opening focuses
// the existing one), and the game stays interactive underneath. On mobile (≤480px) each stays a
// single blocking modal. Tests run at the harness's desktop viewport; the mobile case uses the
// _forceMobile test hook.

describe('floating windows — multiple, non-blocking, one per type (desktop)', () => {
  function clean() { document.querySelectorAll('.info-modal').forEach(m => m.remove()); _forceMobile = null; }

  it('showInfo opens a keyed, non-blocking float window', () => {
    clean();
    try {
      showInfo('bj');
      const el = document.getElementById('win-help-bj');
      assert(el, 'window created with a keyed id');
      assert(el.classList.contains('float-win'), 'desktop window is a non-blocking float');
      assert(el.querySelector('.info-box'), 'has an info-box');
    } finally { clean(); }
  });

  it('re-opening the same type focuses the existing window (no duplicate)', () => {
    clean();
    try {
      showInfo('bj'); showInfo('bj');
      assertEqual(document.querySelectorAll('.info-modal').length, 1, 'still exactly one window');
    } finally { clean(); }
  });

  it('different window types coexist', () => {
    clean();
    try {
      showInfo('bj'); showInfo('uth');
      assert(document.getElementById('win-help-bj'), 'bj window present');
      assert(document.getElementById('win-help-uth'), 'uth window present');
      assertEqual(document.querySelectorAll('.info-modal.float-win').length, 2, 'two floats open at once');
    } finally { clean(); }
  });

  it('closeWindow removes only its own window', () => {
    clean();
    try {
      showInfo('bj'); showInfo('uth');
      closeWindow(document.querySelector('#win-help-bj .tb-btn.close'));
      assert(!document.getElementById('win-help-bj'), 'bj closed');
      assert(document.getElementById('win-help-uth'), 'uth still open');
    } finally { clean(); }
  });

  it('focusWindow activates one window and greys the rest', () => {
    clean();
    try {
      showInfo('bj'); showInfo('uth');
      const bj = document.querySelector('#win-help-bj .info-box');
      const uth = document.querySelector('#win-help-uth .info-box');
      focusWindow(bj);
      assert(!bj.classList.contains('win-inactive'), 'focused window is active');
      assert(uth.classList.contains('win-inactive'), 'the other window is greyed');
      focusWindow(uth);
      assert(!uth.classList.contains('win-inactive'), 'newly focused window is active');
      assert(bj.classList.contains('win-inactive'), 'previously focused window is greyed');
    } finally { clean(); }
  });

  it('blurAllWindows greys every floating window', () => {
    clean();
    try {
      showInfo('bj'); showInfo('uth');
      blurAllWindows();
      assert(document.querySelector('#win-help-bj .info-box').classList.contains('win-inactive'), 'bj greyed');
      assert(document.querySelector('#win-help-uth .info-box').classList.contains('win-inactive'), 'uth greyed');
    } finally { clean(); }
  });

  it('About and the modifier popup get their own keyed windows', () => {
    clean();
    try {
      showAbout();
      assert(document.getElementById('win-about'), 'about window present');
      showModifierPopup(Object.keys(PRESET_MODIFIERS)[0]);
      assert(document.getElementById('win-modifier'), 'modifier window present');
    } finally { clean(); }
  });

  it('showActiveModInfo opens the modifier window for today\'s live modifier (banner click)', () => {
    clean();
    const savedForced = S.forcedMod, savedPick = S.pcPick;
    try {
      const key = Object.keys(PRESET_MODIFIERS)[0];
      S.forcedMod = key; S.pcPick = null;        // pin a known active modifier
      showActiveModInfo();
      const el = document.getElementById('win-modifier');
      assert(el, 'modifier window present');
      assert(el.textContent.includes(PRESET_MODIFIERS[key].title), 'shows the live modifier title');
    } finally { S.forcedMod = savedForced; S.pcPick = savedPick; clean(); }
  });

  it('the modifier banner markup wires its click to showActiveModInfo', () => {
    const savedForced = S.forcedMod, savedScreen = S.screen;
    try {
      S.forcedMod = Object.keys(PRESET_MODIFIERS)[0]; S.screen = 'intro';
      assert(/onclick="showActiveModInfo\(\)"/.test(modBannerHTML()), 'banner carries the click handler');
    } finally { S.forcedMod = savedForced; S.screen = savedScreen; }
  });

  it('Send Feedback opens a floating window containing its form', () => {
    clean();
    try {
      showFeedbackDialog();
      assert(document.getElementById('win-feedback'), 'feedback window present');
      assert(document.getElementById('feedback-txt'), 'feedback textarea present');
    } finally { clean(); }
  });

  it('mobile: a single blocking modal (not a float), replacing any prior dialog', () => {
    clean();
    try {
      _forceMobile = true;
      showInfo('bj');
      const el = document.getElementById('win-help-bj');
      assert(el && !el.classList.contains('float-win'), 'mobile dialog is a blocking modal, not a float');
      showInfo('uth');
      assertEqual(document.querySelectorAll('.info-modal').length, 1, 'mobile keeps a single modal');
      assert(document.getElementById('win-help-uth'), 'the newest dialog replaces the old one');
    } finally { clean(); }
  });
});
