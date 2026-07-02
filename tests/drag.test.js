// ─── Window vs dialog drag routing ──────────────────────────────────────────────────────────────
// _dragMousedown decides what a title-bar mousedown drags: a blue-bar DIALOG drags itself, and the
// main window is locked while any .info-modal dialog is open. Called directly with a synthetic
// event so the desktop-only registration guard in initWindowDrag() doesn't matter here.

describe('_dragMousedown — dialogs drag themselves; main window locks while one is open', () => {
  // Build a title bar, optionally nested in an .info-modal > .info-box, and append to the document.
  function makeBar(inModal) {
    const wrap = document.createElement('div');
    wrap.innerHTML = inModal
      ? `<div class="info-modal"><div class="info-box"><div class="title-bar"><span class="tb-title">x</span></div></div></div>`
      : `<div class="title-bar"><span class="tb-title">x</span></div>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  function md(target) { _dragMousedown({ target, clientX: 10, clientY: 10, preventDefault() {} }); }
  function reset() {
    try { document.dispatchEvent(new MouseEvent('mouseup')); } catch (e) {}  // fire once-listeners → clear drag state
    document.querySelectorAll('.info-modal').forEach(el => el.remove());      // no stray dialogs between cases
  }

  it('grabbing a dialog bar starts a DIALOG drag, not a window drag', () => {
    reset();
    const wrap = makeBar(true);
    try {
      md(wrap.querySelector('.title-bar'));
      assert(_dlgDrag !== null, 'dialog drag started');
      assert(_winDragStart === null, 'main window drag did NOT start');
    } finally { reset(); wrap.remove(); }
  });

  it('dragging a dialog moves its .info-box (transform), leaving the main .app untouched', () => {
    reset();
    const wrap = makeBar(true);
    const app = document.createElement('div'); app.className = 'app'; document.body.appendChild(app);
    try {
      md(wrap.querySelector('.title-bar'));
      _dlgMousemove({ clientX: 40, clientY: 30 });          // dragged +30,+20 from the 10,10 start
      const box = wrap.querySelector('.info-box');
      assert(/translate\(\s*30px/.test(box.style.transform), `dialog moved: ${box.style.transform}`);
      assertEqual(app.style.transform, '', 'main window was not transformed');
    } finally { reset(); wrap.remove(); app.remove(); }
  });

  it('grabbing the main window bar while a dialog is open does NOT drag the window', () => {
    reset();
    const modal = makeBar(true);          // a dialog is open
    const main = makeBar(false);          // a main-window title bar, outside the modal
    try {
      md(main.querySelector('.title-bar'));
      assert(_winDragStart === null, 'window stays locked while a dialog is open');
    } finally { reset(); modal.remove(); main.remove(); }
  });

  it('grabbing the main window bar with no dialog open starts a window drag', () => {
    reset();
    const main = makeBar(false);
    try {
      md(main.querySelector('.title-bar'));
      assert(_winDragStart !== null, 'window drag started');
    } finally { reset(); main.remove(); }
  });

  it('a mousedown on a title-bar button (.tb-btn) never starts a drag', () => {
    reset();
    const main = makeBar(false);
    const tb = main.querySelector('.title-bar');
    tb.insertAdjacentHTML('beforeend', `<span class="tb-btn close">x</span>`);
    try {
      md(tb.querySelector('.tb-btn'));
      assert(_winDragStart === null && _dlgDrag === null, 'a button mousedown does not drag');
    } finally { reset(); main.remove(); }
  });

  // A desktop FLOAT (.info-modal.float-win) is non-blocking, so unlike a mobile modal it must NOT
  // lock the main window: the player can still drag the game while instructions float over it.
  it('grabbing the main window bar while a FLOAT is open still drags the window', () => {
    reset();
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="info-modal float-win"><div class="info-box"><div class="title-bar"></div></div></div>`;
    document.body.appendChild(wrap);
    const main = makeBar(false);
    try {
      md(main.querySelector('.title-bar'));
      assert(_winDragStart !== null, 'window drags freely under a non-blocking float');
    } finally { reset(); wrap.remove(); main.remove(); }
  });

  it('a mousedown inside a float focuses it (active) and greys the other floats', () => {
    reset();
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="win-a" class="info-modal float-win"><div class="info-box"><div class="title-bar"></div></div></div>
      <div id="win-b" class="info-modal float-win"><div class="info-box"><div class="title-bar"></div></div></div>`;
    document.body.appendChild(wrap);
    try {
      md(document.querySelector('#win-a .title-bar'));
      assert(!document.querySelector('#win-a .info-box').classList.contains('win-inactive'), 'clicked float is active');
      assert(document.querySelector('#win-b .info-box').classList.contains('win-inactive'), 'other float greyed');
    } finally { reset(); wrap.remove(); }
  });

  it('a mousedown on the game (no float) greys all floats', () => {
    reset();
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div id="win-a" class="info-modal float-win"><div class="info-box"><div class="title-bar"></div></div></div>`;
    document.body.appendChild(wrap);
    const game = document.createElement('div'); game.className = 'app'; document.body.appendChild(game);
    try {
      md(game);
      assert(document.querySelector('#win-a .info-box').classList.contains('win-inactive'), 'clicking the game greys floats');
    } finally { reset(); wrap.remove(); game.remove(); }
  });
});

// ─── recenterWindow: the [] button glides a dragged window back to center ─────
// Per-window version of snapWindowToOrigin: zero the box's own _winOffset and animate it back to
// translate(0,0). No-op when that window hasn't been moved. Takes the [] button; finds its .info-box.
describe('recenterWindow: [] recenters a dragged window', () => {
  function makeModal() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="info-modal float-win"><div class="info-box"><div class="title-bar">` +
      `<span class="tb-btn" onclick="recenterWindow(this)">□</span></div></div></div>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  const clean = wrap => { document.querySelectorAll('.info-modal').forEach(el => el.remove()); if (wrap) wrap.remove(); };

  it('resets the box _winOffset and animates it back to translate(0,0)', () => {
    const wrap = makeModal();
    try {
      const box = wrap.querySelector('.info-box');
      box._winOffset = { x: 30, y: 20 };
      box.style.transform = 'translate(30px,20px)';
      recenterWindow(wrap.querySelector('.tb-btn'));
      assertEqual(box._winOffset.x, 0, '_winOffset.x cleared');
      assertEqual(box._winOffset.y, 0, '_winOffset.y cleared');
      assert(/translate\(\s*0/.test(box.style.transform), `box recentered: ${box.style.transform}`);
      assert(/transform/.test(box.style.transition), `animated: ${box.style.transition}`);
    } finally { clean(wrap); }
  });

  it('is a no-op when the window is already centered (leaves the transform untouched)', () => {
    const wrap = makeModal();
    try {
      const box = wrap.querySelector('.info-box');
      box._winOffset = { x: 0, y: 0 };
      box.style.transition = '';
      recenterWindow(wrap.querySelector('.tb-btn'));
      assertEqual(box.style.transition, '', 'no animation kicked off');
    } finally { clean(wrap); }
  });

  it('does nothing (and does not throw) when the button has no .info-box ancestor', () => {
    const stray = document.createElement('span'); stray.className = 'tb-btn'; document.body.appendChild(stray);
    try { recenterWindow(stray); assert(true, 'returned without error'); }
    finally { stray.remove(); }
  });
});

// ─── _infoOverlayClick: mobile blocking modal, outside tap closes (with refocus guard) ─────
// Desktop floats deactivate via the document focus handler (covered above), so _infoOverlayClick
// is mobile-only: an outside tap on the dark overlay closes it, except the tap that re-focuses an
// unfocused tab (the _refocusAt / document.hasFocus guard). Only a click that both starts
// (_downOnSelf) and ends on the overlay counts as outside.
describe('_infoOverlayClick: mobile outside-tap close with refocus guard', () => {
  function makeOverlay() {
    const el = document.createElement('div');
    el.className = 'info-modal';
    el.innerHTML = `<div class="info-box"><div class="title-bar"></div></div>`;
    document.body.appendChild(el);
    return el;
  }
  // Fire a click with focus state stubbed; restores stubs after.
  function fire(el, target, { hasFocus = true, refocusAgoMs = 10000 } = {}) {
    const oF = document.hasFocus, oR = _refocusAt;
    document.hasFocus = () => hasFocus; _refocusAt = Date.now() - refocusAgoMs;
    try { _infoOverlayClick(el, { target }); }
    finally { document.hasFocus = oF; _refocusAt = oR; }
  }

  it('an outside tap closes the modal (focused, well after any refocus)', () => {
    const el = makeOverlay(); el._downOnSelf = true;
    fire(el, el, { hasFocus: true, refocusAgoMs: 10000 });
    const closed = !document.body.contains(el);
    el.remove();
    assert(closed, 'modal closed on outside tap');
  });

  it('the refocus tap (unfocused, or within 300ms) does NOT close', () => {
    for (const guard of [{ hasFocus: false, refocusAgoMs: 10000 }, { hasFocus: true, refocusAgoMs: 50 }]) {
      const el = makeOverlay(); el._downOnSelf = true;
      fire(el, el, guard);
      const stillOpen = document.body.contains(el);
      el.remove();
      assert(stillOpen, `stays open (${JSON.stringify(guard)})`);
    }
  });

  it('a click that did not start on the overlay (inside the box) does NOT close', () => {
    const el = makeOverlay(); el._downOnSelf = false;
    fire(el, el.querySelector('.info-box'), { hasFocus: true, refocusAgoMs: 10000 });
    const stillOpen = document.body.contains(el);
    el.remove();
    assert(stillOpen, 'inside click leaves the modal open');
  });
});
