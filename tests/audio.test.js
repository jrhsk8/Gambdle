// ─── sndShuffle: the deal callback must ALWAYS fire (no "dealing" hang) ──────────────────
// Regression for the reported "game gets stuck after the first hand" / "got a result and got
// stuck" bugs. Every deal (bjDeal/uthDeal/pkDeal) locks phase to 'dealing' and only advances when
// sndShuffle's callback fires. If the shuffle audio's play() RESOLVES but never emits 'ended'/
// 'error' (tab backgrounded mid-clip, a stalled/suspended element, iOS's per-session audio-element
// limit), the callback used to never run, leaving the game stuck on the dealing screen with a
// disabled Deal button. A bounded timeout backstop guarantees the callback fires regardless.
//
// These tests stub window.Audio + window.setTimeout so they stay synchronous: setTimeout calls are
// captured (not run) and fired manually, so each code path is exercised in isolation.

describe('sndShuffle — deal callback always fires', () => {
  // play: factory returning the object a.play() yields (must have .catch). muted: getPref('mute').
  function run({ muted = false, play } = {}, body) {
    const origAudio = window.Audio, origST = window.setTimeout, origGetPref = window.getPref;
    const timers = [];
    let audio = null;
    window.setTimeout = (f, d) => { timers.push({ f, d: d || 0 }); return timers.length; };
    window.getPref = k => (k === 'mute' ? muted : origGetPref(k));
    window.Audio = function () {
      audio = { onended: null, onerror: null, pause() {}, load() {},
                play: play || (() => ({ catch() {} })) };
      return audio;
    };
    try { return body({ timers, getAudio: () => audio }); }
    finally { window.Audio = origAudio; window.setTimeout = origST; window.getPref = origGetPref; }
  }

  it('fires via the timeout backstop when audio starts but never ends/errors', () => {
    let fired = false;
    run({ play: () => ({ catch() {} }) }, ({ timers }) => {  // play() resolves; .catch never invoked
      sndShuffle(() => { fired = true; });
      assert(!fired, 'callback must not fire synchronously');
      const backstop = timers.find(t => t.d >= 1000);
      assert(backstop, 'a bounded backstop timer must be scheduled even when play() resolves');
      backstop.f();
    });
    assert(fired, 'callback MUST fire via the backstop even if ended/error never fire');
  });

  it('fires when the audio ends normally', () => {
    let fired = false;
    run({ play: () => ({ catch() {} }) }, ({ getAudio }) => {
      sndShuffle(() => { fired = true; });
      getAudio().onended();   // simulate the clip finishing
    });
    assert(fired, 'callback fires on normal end');
  });

  it('fires via the 800ms fallback when play() is blocked (autoplay rejection)', () => {
    let fired = false;
    run({ play: () => ({ catch(h) { h(new Error('blocked')); } }) }, ({ timers }) => {
      sndShuffle(() => { fired = true; });
      const fb = timers.find(t => t.d === 800);
      assert(fb, 'reject fallback timer (800ms) scheduled');
      fb.f();
    });
    assert(fired, 'callback fires after a play() rejection');
  });

  it('fires only once even if multiple triggers race', () => {
    let count = 0;
    run({ play: () => ({ catch(h) { h(new Error('blocked')); } }) }, ({ timers, getAudio }) => {
      sndShuffle(() => { count++; });
      getAudio().onended();              // end event
      timers.forEach(t => t.f());        // + backstop + reject fallback all fire
    });
    assertEqual(count, 1, 'callback is idempotent — settles the deal exactly once');
  });

  it('fires immediately when muted (no audio element constructed)', () => {
    let fired = false;
    run({ muted: true, play: () => { throw new Error('Audio should not play when muted'); } }, ({ timers }) => {
      sndShuffle(() => { fired = true; });
      const t0 = timers.find(t => t.d === 0);
      assert(t0, 'muted path schedules a 0ms callback');
      t0.f();
    });
    assert(fired, 'muted path fires the callback');
  });

  it('does not throw when called with no callback', () => {
    run({ play: () => ({ catch() {} }) }, () => { sndShuffle(); });
    assert(true, 'no-callback form is a safe no-op');
  });

  // Regression for the blackjack softlock reports (Days 33-35): a privacy/tracking-protection
  // tool or older browser can make HTMLAudioElement.play() return undefined (NOT a Promise).
  // `a.play().catch(...)` then throws "Cannot read properties of undefined (reading 'catch')"
  // synchronously, aborting the setTimeout chain that drives the deal and stranding the game.
  it('does not throw and still fires the callback when play() returns undefined', () => {
    let fired = false, threw = false;
    run({ play: () => undefined }, ({ timers }) => {       // play() returns undefined, not a Promise
      try { sndShuffle(() => { fired = true; }); }
      catch (e) { threw = true; }
      assert(!threw, 'sndShuffle must not throw when play() returns undefined');
      const fb = timers.find(t => t.d > 0 && t.d <= 2000);
      assert(fb, 'a fallback/backstop timer must still be scheduled');
      timers.forEach(t => t.f());
    });
    assert(fired, 'callback MUST fire even when play() returns undefined');
  });

  it('does not throw when play() itself throws synchronously', () => {
    let fired = false, threw = false;
    run({ play: () => { throw new Error('blocked media API'); } }, ({ timers }) => {
      try { sndShuffle(() => { fired = true; }); }
      catch (e) { threw = true; }
      assert(!threw, 'sndShuffle must not throw when play() throws');
      timers.forEach(t => t.f());
    });
    assert(fired, 'callback MUST fire even when play() throws');
  });
});

// ─── playMp3 · must never throw into the timer chains that drive game flow ────────────────
// sndCard/sndBigWin/sndChip/sndAdvance all route through playMp3, and they fire from inside the
// setTimeout chains for the dealer reveal, the blackjack celebration, and the next-hand advance.
// If playMp3 throws, that chain dies and the hand softlocks with no way to advance.
describe('playMp3 — never throws regardless of play() return', () => {
  function run({ muted = false, play } = {}, body) {
    const origAudio = window.Audio, origST = window.setTimeout, origGetPref = window.getPref;
    window.setTimeout = (f, d) => 0; // swallow the deferred (ms>0) re-call; we test the immediate path
    window.getPref = k => (k === 'mute' ? muted : origGetPref(k));
    window.Audio = function () { return { play: play || (() => ({ catch() {} })) }; };
    try { return body(); }
    finally { window.Audio = origAudio; window.setTimeout = origST; window.getPref = origGetPref; }
  }
  it('does not throw when play() returns undefined', () => {
    let threw = false;
    run({ play: () => undefined }, () => { try { playMp3('x.mp3'); } catch (e) { threw = true; } });
    assert(!threw, 'playMp3 must not throw when play() returns undefined');
  });
  it('does not throw when play() throws synchronously', () => {
    let threw = false;
    run({ play: () => { throw new Error('blocked'); } }, () => { try { playMp3('x.mp3'); } catch (e) { threw = true; } });
    assert(!threw, 'playMp3 must not throw when play() throws');
  });
  it('swallows a normal play() promise rejection', () => {
    let threw = false;
    run({ play: () => ({ catch(h) { h(new Error('autoplay blocked')); } }) },
        () => { try { playMp3('x.mp3'); } catch (e) { threw = true; } });
    assert(!threw, 'a rejected play() promise is handled');
  });
});
