// Freshness GATE for the engine bundle (supabase/functions/_shared/engine-bundle.mjs), the
// concatenation of src/*.js that submit-score imports to replay runs server-side. Extracted out
// of build-engine-bundle.js so the same check can run from three places: `npm test`
// (tests/run.js), a standalone pre-deploy CLI (`node tests/verify-bundle.js`, see below), and
// anywhere else that wants a yes/no without also wanting to rebuild.
//
// WHY this exists as its own gate: on 2026-06-22, submit-score was deployed with a bundle that was
// 5 days stale against src/ — the client and server engines disagreed, and that mismatch alone
// produced mass false rejections (players flagged as cheating for legitimate runs) plus a
// replay_diff over-credit bug. `npm test` already caught staleness, but nothing stopped a deploy
// from happening WITHOUT running the tests first. verifyBundleFresh() is the one function both
// paths call, so "did anyone check?" has a single answer.
//
// Usage:
//   const { verifyBundleFresh } = require('./verify-bundle');   // from other Node scripts
//   node tests/verify-bundle.js                                  // standalone: prints + exits 1 if stale

const fs = require('fs');
const path = require('path');
const { ROOT, OUT, FILES, build, fileSections, extractEmbeddedSource } = require('./build-engine-bundle');

// Compares a fresh build against the committed bundle. Returns:
//   { fresh: true,  staleFiles: [],      message: null }
//   { fresh: false, staleFiles: [...],   message: '<actionable string>' }
// MISSING is treated as fresh, not stale: the bundle lives under the git-ignored supabase/ tree,
// so a fresh clone simply hasn't generated it yet. build-engine-bundle.js's own `write()` (called
// via `npm test` -> tests/run.js) creates it on first run; this function just writes it too so a
// bare call to verifyBundleFresh() is enough to bootstrap a clean checkout.
function verifyBundleFresh() {
  const outPath = path.join(ROOT, OUT);
  const freshSrc = build();

  let current = null;
  try { current = fs.readFileSync(outPath, 'utf8'); } catch { /* missing: first run */ }

  if (current === null) {
    fs.writeFileSync(outPath, freshSrc, 'utf8');
    return { fresh: true, staleFiles: [], message: null };
  }
  if (current === freshSrc) return { fresh: true, staleFiles: [], message: null };

  // Bundle differs from a fresh build: name which bundled src file(s) actually changed, by diffing
  // the per-file sections embedded in the OLD (on-disk) bundle against the CURRENT file contents.
  // This is best-effort naming for a human fixing the problem, not the pass/fail signal itself
  // (that's `current === freshSrc` above) — if the embedded source can't be decoded (e.g. someone
  // hand-edited the bundle), staleFiles comes back empty and the message still fires.
  const embedded = extractEmbeddedSource(current);
  const oldSections = embedded === null ? {} : fileSections(embedded);
  const staleFiles = FILES.filter(rel => {
    const nowSrc = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return oldSections[rel] !== nowSrc;
  });

  const relOut = OUT.replace(/\\/g, '/');
  const staleNote = staleFiles.length ? ` (changed: ${staleFiles.map(f => f.replace(/\\/g, '/')).join(', ')})` : '';
  return {
    fresh: false,
    staleFiles,
    message: `Engine bundle stale — regenerate: node tests/build-engine-bundle.js${staleNote}`,
  };
}

module.exports = { verifyBundleFresh };

// Standalone pre-deploy check: run this before any `supabase functions deploy submit-score` so the
// 2026-06-22 incident class (stale bundle reaches prod) can't repeat. Exits nonzero on staleness so
// it composes with a deploy script or a manual `&&` chain.
if (require.main === module) {
  const result = verifyBundleFresh();
  if (result.fresh) {
    console.log(`ENGINE BUNDLE: ✅ fresh (${OUT.replace(/\\/g, '/')})`);
    process.exit(0);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}
