// ─── Tutorial tip balloon — device fit ──────────────────────────────────────────
// The tip balloon is position:fixed, anchored to the window's bottom-right, capped at
// min(300px, 100vw - 24px). It must sit fully on-screen and never cause horizontal
// scroll, on every viewport the layout suite cycles through (mobile floor 360×780 up
// to 4K). Loaded after layout.test.js so it can reuse its _ltSnap / _ltRestore globals.

describe('layout — tutorial tip balloon', () => {
  // Renders a real screen, then shows the balloon with the longest real tip body
  // (worst case for width/height). Returns the balloon element.
  function showBalloon(overrides) {
    const base = JSON.parse(_ltSnap); base.pkHeld = new Set(base.pkHeld);
    Object.assign(S, base, overrides);
    render();
    const body = (typeof TUTORIAL_TIPS !== 'undefined' && TUTORIAL_TIPS.uth_raise)
      ? TUTORIAL_TIPS.uth_raise.body
      : 'A fairly long tutorial sentence that should wrap across a few lines on small screens.';
    _renderBalloon('You Only Raise Once', body);
    return document.getElementById('xp-balloon');
  }

  it('sits fully on-screen with no horizontal scroll', () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const bal = showBalloon({ screen: 'intro' });
    try {
      assert(bal && bal.classList.contains('xpb-visible'), 'balloon is visible');
      const r = bal.getBoundingClientRect();
      assert(r.width > 0 && r.height > 0, `balloon has size (${Math.round(r.width)}×${Math.round(r.height)})`);
      assert(r.left   >= -0.5,     `left edge on-screen (left=${Math.round(r.left)})`);
      assert(r.top    >= -0.5,     `top edge on-screen (top=${Math.round(r.top)})`);
      assert(r.right  <= vw + 0.5, `right edge within viewport (right=${Math.round(r.right)}, vw=${vw})`);
      assert(r.bottom <= vh + 0.5, `bottom within viewport (bottom=${Math.round(r.bottom)}, vh=${vh})`);
      assert(document.documentElement.scrollWidth <= vw + 0.5,
        `balloon adds no horizontal scroll (scrollWidth=${document.documentElement.scrollWidth}, vw=${vw})`);
    } finally { dismissPopup(); _ltRestore(); }
  });

  it('respects the width cap min(300, 100vw-24) and is not collapsed', () => {
    const vw = window.innerWidth;
    const bal = showBalloon({ screen: 'bj', bjPhase: 'bet', chips: 1000 });
    try {
      const r = bal.getBoundingClientRect();
      const cap = Math.min(300, vw - 24);
      assert(r.width <= cap + 1, `width ${Math.round(r.width)} within cap ${cap} (vw=${vw})`);
      assert(r.width >= Math.min(180, cap), `width ${Math.round(r.width)} not collapsed`);
    } finally { dismissPopup(); _ltRestore(); }
  });

  it('the dismiss (✕) button is on-screen and tappable-sized', () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    showBalloon({ screen: 'intro' });
    try {
      const x = document.querySelector('#xp-balloon .xpb-close');
      assert(x, 'close button exists');
      const r = x.getBoundingClientRect();
      assert(r.right <= vw + 0.5 && r.left >= -0.5, 'close button is within the viewport horizontally');
      assert(r.bottom <= vh + 0.5 && r.top >= -0.5, 'close button is within the viewport vertically');
      assert(r.width >= 14 && r.height >= 14, `close button is large enough to tap (${Math.round(r.width)}×${Math.round(r.height)})`);
    } finally { dismissPopup(); _ltRestore(); }
  });
});
