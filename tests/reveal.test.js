// ─── reveal.js — runReveal scheduler (fake-clock unit tests) ──────────────────
// The timing / idempotency / resume logic that used to be buried inside DOM + audio callbacks (and was
// therefore untestable) is now exercised directly with a virtual clock — no DOM, no real timers. This
// is the testability win of Candidate 3.
(function () {
  // Minimal virtual clock: schedule by absolute due time; advance() fires due timers in time order.
  function makeClock() {
    let now = 0, seq = 1;
    const q = new Map();
    return {
      now: () => now,
      pending: () => q.size,
      timer: (fn, ms) => { const id = seq++; q.set(id, { at: now + Math.max(0, ms), fn }); return id; },
      clear: (id) => { q.delete(id); },
      advance(ms) {
        const target = now + ms;
        for (;;) {
          let next = null;
          for (const [id, t] of q) if (t.at <= target && (next === null || t.at < q.get(next).at)) next = id;
          if (next === null) break;
          const t = q.get(next); q.delete(next); now = t.at; t.fn();
        }
        now = target;
      },
    };
  }
  // Run fn(clock) with runReveal's timer seam swapped for the virtual clock; restored afterwards.
  function withClock(fn) {
    const realT = runReveal._timer, realC = runReveal._clear;
    const clock = makeClock();
    runReveal._timer = clock.timer; runReveal._clear = clock.clear;
    try { fn(clock); } finally { runReveal._timer = realT; runReveal._clear = realC; }
  }

  describe('runReveal — staggered steps', () => {
    it('fires steps in `at` order at their virtual times, then finishes', () => withClock(clock => {
      const log = [];
      runReveal({
        steps: [
          { at: 300, do: () => log.push('a@' + clock.now()) },
          { at: 100, do: () => log.push('b@' + clock.now()) },
          { at: 300, do: () => log.push('c@' + clock.now()) },
        ], finishAt: 300, onFinish: () => log.push('fin@' + clock.now()),
      });
      clock.advance(50);  assertEqual(log.length, 0, 'nothing before 100ms');
      clock.advance(60);  assertDeepEqual(log, ['b@100'], 'b fires at 100');
      clock.advance(300); assertDeepEqual(log, ['b@100', 'a@300', 'c@300', 'fin@300'], 'a,c then finish at 300');
    }));
  });

  describe('runReveal — single-fire finish', () => {
    it('onFinish fires exactly once at finishAt', () => withClock(clock => {
      let n = 0;
      runReveal({ steps: [], finishAt: 200, onFinish: () => n++ });
      clock.advance(500);
      assertEqual(n, 1, 'finished exactly once');
    }));
    it('handle.finish() early-finishes once and the scheduled finish cannot double-fire', () => withClock(clock => {
      let n = 0;
      const h = runReveal({ steps: [], finishAt: 1000, onFinish: () => n++ });
      h.finish(); h.finish();          // manual + a double call
      assertEqual(n, 1, 'manual finish ran once');
      clock.advance(2000);
      assertEqual(n, 1, 'scheduled finish did not double-fire');
    }));
  });

  describe('runReveal — ceiling backstop', () => {
    it('the ceiling fires onFinish when nothing else did (roulette stall case)', () => withClock(clock => {
      let n = 0;
      runReveal({ steps: [], finishAt: null, ceilingMs: 500, onFinish: () => n++ });
      clock.advance(499); assertEqual(n, 0, 'not before the ceiling');
      clock.advance(2);   assertEqual(n, 1, 'ceiling fired the finish');
    }));
    it('the ceiling does nothing once a normal finish already ran', () => withClock(clock => {
      let n = 0;
      runReveal({ steps: [], finishAt: 100, ceilingMs: 500, onFinish: () => n++ });
      clock.advance(1000);
      assertEqual(n, 1, 'finished once; ceiling suppressed');
    }));
  });

  describe('runReveal — resume (from offset)', () => {
    it('skips steps before `from` and fires the rest at (at - from)', () => withClock(clock => {
      const log = [];
      runReveal({
        from: 250, finishAt: 500, steps: [
          { at: 100, do: () => log.push('early') },           // already shown → skipped
          { at: 300, do: () => log.push('mid@' + clock.now()) },
        ], onFinish: () => log.push('fin@' + clock.now()),
      });
      clock.advance(1000);
      assertDeepEqual(log, ['mid@50', 'fin@250'], 'early skipped; mid at 300-250; finish at 500-250');
    }));
  });

  describe('runReveal — signal guard', () => {
    it('a false signal aborts each remaining step and the finish silently', () => withClock(clock => {
      let steps = 0, fin = 0, valid = true;
      runReveal({ signal: () => valid, finishAt: 200, steps: [{ at: 100, do: () => steps++ }], onFinish: () => fin++ });
      valid = false;                  // e.g. the player navigated away mid-reveal
      clock.advance(500);
      assertEqual(steps, 0, 'step body aborted'); assertEqual(fin, 0, 'finish aborted');
    }));
  });

  describe('runReveal — cancel', () => {
    it('cancel clears pending steps + ceiling and blocks a later finish', () => withClock(clock => {
      let steps = 0, fin = 0;
      const h = runReveal({ finishAt: 300, ceilingMs: 1000, steps: [{ at: 100, do: () => steps++ }], onFinish: () => fin++ });
      clock.advance(50);
      h.cancel();
      clock.advance(2000);
      assertEqual(steps, 0, 'pending step cleared'); assertEqual(fin, 0, 'finish blocked');
      assertEqual(clock.pending(), 0, 'no timers left scheduled');
    }));
  });
})();
