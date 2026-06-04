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
});

// ─── recenterDialog — the □ button glides a dragged popup back to center ─────────────────────────
// Mirrors snapWindowToOrigin for the blue-bar dialogs: zero out _dlgOffset and animate the open
// .info-box back to translate(0,0). No-op when the popup hasn't been moved.
describe('recenterDialog — □ recenters a dragged popup', () => {
  function makeModal() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="info-modal"><div class="info-box"><div class="title-bar"></div></div></div>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  function clean(wrap) {
    document.querySelectorAll('.info-modal').forEach(el => el.remove());
    if (wrap) wrap.remove();
    _dlgOffset = { x: 0, y: 0 };
  }

  it('resets _dlgOffset and animates the box back to translate(0,0)', () => {
    const wrap = makeModal();
    try {
      const box = wrap.querySelector('.info-box');
      _dlgOffset = { x: 30, y: 20 };
      box.style.transform = 'translate(30px,20px)';
      recenterDialog();
      assertEqual(_dlgOffset.x, 0, '_dlgOffset.x cleared');
      assertEqual(_dlgOffset.y, 0, '_dlgOffset.y cleared');
      assert(/translate\(\s*0/.test(box.style.transform), `box recentered: ${box.style.transform}`);
      assert(/transform/.test(box.style.transition), `animated: ${box.style.transition}`);
    } finally { clean(wrap); }
  });

  it('is a no-op when the popup is already centered (leaves the box transform untouched)', () => {
    const wrap = makeModal();
    try {
      const box = wrap.querySelector('.info-box');
      _dlgOffset = { x: 0, y: 0 };
      box.style.transform = 'translate(0px,0px)';
      box.style.transition = '';
      recenterDialog();
      assertEqual(box.style.transition, '', 'no animation kicked off');
    } finally { clean(wrap); }
  });

  it('does nothing (and does not throw) when no popup is open', () => {
    clean();
    recenterDialog();   // no .info-modal in the DOM
    assert(true, 'returned without error');
  });
});

// ─── _openInfoModal overlay close — refocus click leaves the popup up ────────────────────────────
// The dark overlay still closes on a deliberate outside click, but the click that brings an
// unfocused tab back into focus must not — reusing the _refocusAt / document.hasFocus guard.
// On desktop an outside click DEACTIVATES the popup (greys its title bar via .win-inactive) and never
// closes it — only × does; clicking back inside reactivates it. On mobile an outside tap still closes,
// keeping the _refocusAt / document.hasFocus guard so the click that re-focuses the tab doesn't dismiss it.
describe('_infoOverlayClick — desktop deactivates (no close); mobile taps close', () => {
  function open() {
    document.getElementById('info-modal')?.remove();
    _openInfoModal('T', 'body');
    return document.getElementById('info-modal');
  }
  const box = el => el.querySelector('.info-box');
  // Run an outside (or inside) click with focus stubbed; restores stubs after.
  function fire(el, target, mobile, { hasFocus = true, refocusAgoMs = 10000 } = {}) {
    const oF = document.hasFocus, oR = _refocusAt;
    document.hasFocus = () => hasFocus; _refocusAt = Date.now() - refocusAgoMs;
    try { _infoOverlayClick(el, { target }, mobile); }
    finally { document.hasFocus = oF; _refocusAt = oR; }
  }

  it('desktop: an outside click greys the popup (win-inactive) and never closes it', () => {
    const el = open(); el._downOnSelf = true;
    fire(el, el, false);
    try {
      assert(box(el).classList.contains('win-inactive'), 'title bar deactivated');
      assert(document.getElementById('info-modal'), 'popup stays open');
    } finally { el.remove(); }
  });

  it('desktop: clicking back inside the popup reactivates it (removes win-inactive)', () => {
    const el = open(); box(el).classList.add('win-inactive'); el._downOnSelf = false;
    fire(el, box(el), false);
    try {
      assert(!box(el).classList.contains('win-inactive'), 'reactivated');
      assert(document.getElementById('info-modal'), 'still open');
    } finally { el.remove(); }
  });

  it('mobile: an outside tap closes the popup (focused, well after any refocus)', () => {
    const el = open(); el._downOnSelf = true;
    fire(el, el, true, { hasFocus: true, refocusAgoMs: 10000 });
    const closed = !document.getElementById('info-modal');
    el.remove();
    assert(closed, 'popup closed on mobile');
  });

  it('mobile: the refocus tap (unfocused, or within 300ms) does NOT close', () => {
    for (const guard of [{ hasFocus: false, refocusAgoMs: 10000 }, { hasFocus: true, refocusAgoMs: 50 }]) {
      const el = open(); el._downOnSelf = true;
      fire(el, el, true, guard);
      const open_ = !!document.getElementById('info-modal');
      el.remove();
      assert(open_, `stays open (${JSON.stringify(guard)})`);
    }
  });

  it('mobile: never greys the popup (close-or-nothing, no inactive state)', () => {
    const el = open(); el._downOnSelf = true;
    fire(el, el, true, { hasFocus: false, refocusAgoMs: 0 });   // guarded → no close
    try { assert(!box(el).classList.contains('win-inactive'), 'no inactive styling on mobile'); }
    finally { el.remove(); }
  });
});
