// Builds the dual-mode engine bundle the `submit-score` Edge Function imports to replay runs
// server-side (integrity Phase 2 · PRD-integrity-phase-2.md, Thread A).
//
// WHY a concatenation and not a normal import: the pure replay engine (engine.js) depends on a
// closure of pure functions (the four resolvers, buildDeal, spinFromRandom, card helpers,
// constants, the modifier tables) that live as plain browser globals across seven src files,
// loaded by index.html as classic <script> tags sharing ONE global scope. There is no build step
// and these files are not ES modules, so they can't be `import`ed. Concatenating them in the same
// order index.html loads them reproduces that single global scope byte-for-byte; running the result
// in a sloppy-mode `new Function` wrapper matches classic-script semantics exactly (no strict-mode
// surprises across ~3.8k lines of game code). A tiny stub preamble supplies the handful of browser
// globals the files touch at load time (document.title, the _ls storage probe, window.location),
// all of which resolve to the correct PRODUCTION defaults under the stubs.
//
// The output is committed AND guarded: tests/harness/run.js calls verifyBundleFresh() (tests/harness/verify-bundle.js)
// before launching the browser, so a stale bundle (someone edited a src file without regenerating)
// fails `npm test`. The same check also runs standalone before a Supabase deploy: see verify-bundle.js.
// Regenerate with:  node tests/harness/build-engine-bundle.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OUT = path.join('supabase', 'functions', '_shared', 'engine-bundle.mjs');

// Every src/*.js file that is NOT part of the replay closure, with the reason it's safe to drop.
// FILES is DERIVED from index.html (see fileList() below): whatever index.html loads that
// isn't in this exclude set is assumed to belong in the bundle, in index.html's order. Adding a new
// src file therefore requires an explicit decision here (include by default, or list why not) rather
// than a silent omission.
const EXCLUDE = {
  'icons.js': 'DOM-only icon() glyphs; stubbed to a no-op in STUB below, never read by replay',
  'net.js': 'Supabase fetch adapter; server replay never calls out to the network',
  'record.js': 'DOM-facing history/transcript bookkeeping (mkOutcome, txLog); replay reads raw tx events, not this layer',
  'dom-ids.js': 'DOM element id lookup table; no DOM exists server-side',
  'gametext.js': 'player-facing copy strings; irrelevant to outcome math',
  'audio.js': 'sound playback; no-op server-side',
  'reveal.js': 'client-side reveal/animation scheduler; server replay has no UI to animate',
  'ui.js': 'DOM render + widget glue',
  'windows.js': 'DOM window-chrome glue',
  'menus.js': 'DOM menu glue',
  'dev.js': 'dev-only tools (?dev=true pages); never shipped to the replay path',
  'screens.js': 'per-screen DOM render functions',
  'flow.js': 'render()/goTo() navigation + DOM-driven game loop; replay drives outcomes directly, not through screens',
  'poker.js': '5-Card Poker is not on the leaderboard and not replayed server-side (engine.js stubs its events to a 0 net)',
  'seedcheck.js': 'dev-only future-seed scanner tool, not part of any player run',
  'game.js': 'app bootstrap (DOMContentLoaded, initial render); nothing here runs headless',
};

// Reads index.html's own <script src="src/X.js"> tags so the bundle's file list can never drift
// from what actually ships to players. The 2026-06-22 incident (submit-score deployed against a
// 5-day-stale bundle) was a freshness gap, but a hand-maintained FILES list is a second, quieter
// drift vector: a file could be renamed/added/reordered in index.html and the bundle would keep
// building from the old list without any error. Order is preserved as-is; EXCLUDE above trims it
// down to the pure replay closure (modifier tables, core helpers, deal, the four game resolvers,
// then engine.js itself, which references all of the above. That dependency order is why order
// matters at all: anything out of place risks a temporal-dead-zone or a "not defined" at load).
function fileList() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const re = /<script\s+src="src\/([^"]+\.js)"><\/script>/g;
  const all = [];
  let m;
  while ((m = re.exec(html))) all.push(m[1]);
  if (!all.length) throw new Error('build-engine-bundle: found no <script src="src/*.js"> tags in index.html');
  return all.filter(f => !EXCLUDE[f]);
}

const FILES = fileList().map(f => path.join('src', f));

// Browser globals the bundled files read at LOAD time (every one verified).
// Stubbed so top-level statements run to their production defaults: no ?dev, no test seed,
// no persisted backlog/dev-game overrides. None of these stubs is touched by the pure replay path.
const STUB = [
  "var localStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} };",
  "var sessionStorage = localStorage;",
  "var document = { title: '', body: { classList: { add: function(){}, remove: function(){} } } };",
  "var window = { location: { search: '' }, localStorage: localStorage };",
  "var navigator = { userAgent: '' };",
  // icon() lives in the un-bundled icons.js; GAME_META calls it at load purely for display metadata
  // (never read by the replay path). Stub to a no-op so GAME_META builds.
  "var icon = function(){ return ''; };",
].join('\n');

// After the concatenation runs, hand the engine entry points up to the module wrapper via globalThis.
const CAPTURE =
  "globalThis.__GAMBDLE_ENGINE = { replayRun: replayRun, auditOutcome: auditOutcome, " +
  "replayDayMods: replayDayMods, replayRngSeed: replayRngSeed, buildDeal: buildDeal, " +
  "replayConfigHorizon: replayConfigHorizon };";

// One marker per bundled file so a stale-check can blame the SPECIFIC file that changed, not just
// report "the bundle differs somehow." Matched back out by fileSections() below.
const MARKER = rel => '// ===== ' + rel.replace(/\\/g, '/') + ' =====';

function buildSource() {
  const parts = [STUB, ''];
  for (const rel of FILES) {
    parts.push(MARKER(rel));
    parts.push(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    parts.push('');
  }
  parts.push(CAPTURE);
  return parts.join('\n');
}

// Splits a previously-built concatenation back into { relPath: srcText } by its MARKER comments,
// so a stale-file diff can name the offending file instead of just failing the whole bundle.
// Used by verify-bundle.js; kept here because it must stay in lockstep with MARKER/buildSource.
// buildSource() joins [MARKER, fileContent, ''] with '\n', which leaves a "\n\n" separator (one
// blank line) between a file's content and the next MARKER (or CAPTURE, for the last file) that
// is NOT part of the original file on disk. Strip exactly that separator, no more, so a file
// whose own content happens to end in blank lines still compares correctly.
function fileSections(concatenated) {
  const SEP = '\n\n';
  const out = {};
  for (let i = 0; i < FILES.length; i++) {
    const rel = FILES[i];
    const start = concatenated.indexOf(MARKER(rel));
    if (start === -1) { out[rel] = null; continue; }
    const bodyStart = start + MARKER(rel).length + 1; // +1 for the newline after the marker
    const nextRel = FILES[i + 1];
    const end = nextRel ? concatenated.indexOf(MARKER(nextRel), bodyStart) : concatenated.indexOf(CAPTURE, bodyStart);
    let body = concatenated.slice(bodyStart, end === -1 ? undefined : end);
    if (body.endsWith(SEP)) body = body.slice(0, -SEP.length);
    out[rel] = body;
  }
  return out;
}

function build() {
  const src = buildSource();
  // JSON.stringify safely encodes the whole concatenation (backticks, ${}, quotes, newlines) into a
  // single string literal the sloppy-mode Function wrapper compiles at module load. globalThis works
  // identically in Node (ESM) and Deno; `new Function` + eval are permitted in both runtimes.
  return [
    '// AUTO-GENERATED by tests/harness/build-engine-bundle.js — DO NOT EDIT BY HAND.',
    '// Dual-mode replay engine for the submit-score Edge Function: a sloppy-mode concatenation of the',
    '// pure-logic src/*.js files (see EXCLUDE in build-engine-bundle.js for what is left out and why),',
    '// with browser globals stubbed, re-exported as ESM. Loads in both Node (local test) and Deno',
    '// (Supabase). Regenerate after editing any bundled src file: `node tests/harness/build-engine-bundle.js`',
    '// (npm test fails if stale).',
    'const __ENGINE_SRC = ' + JSON.stringify(src) + ';',
    '// Compile LAZILY on first call (not at import): the sloppy-mode Function wrapper is the only',
    '// exotic step, so deferring it means even a hostile runtime that rejected `new Function` would',
    '// throw inside the caller\'s try/catch — never at module load, so importing this can never 500',
    '// the Edge Function. globalThis.__GAMBDLE_ENGINE is built once and reused.',
    'let __E = null;',
    'function __engine(){ if(!__E){ new Function(__ENGINE_SRC)(); __E = globalThis.__GAMBDLE_ENGINE; } return __E; }',
    'export const replayRun = (...a) => __engine().replayRun(...a);',
    'export const auditOutcome = (...a) => __engine().auditOutcome(...a);',
    'export const replayDayMods = (...a) => __engine().replayDayMods(...a);',
    'export const replayRngSeed = (...a) => __engine().replayRngSeed(...a);',
    'export const replayConfigHorizon = (...a) => __engine().replayConfigHorizon(...a);',
    'export const buildDeal = (...a) => __engine().buildDeal(...a);',
    '',
  ].join('\n');
}

// Reverses build()'s wrapping to recover the plain concatenation (pre-JSON.stringify) from a
// previously-written .mjs file, so a stale-check can hand it to fileSections() and blame the
// specific bundled file that changed. build() always emits __ENGINE_SRC as the sole statement on
// its own line, so a line-based split is exact (no regex over the giant escaped literal needed).
function extractEmbeddedSource(wrapped) {
  const marker = 'const __ENGINE_SRC = ';
  const lines = wrapped.split('\n');
  const line = lines.find(l => l.startsWith(marker));
  if (!line) return null;
  const literal = line.slice(marker.length, line.length - 1); // strip trailing ';'
  try { return JSON.parse(literal); } catch { return null; }
}

function write() {
  const outPath = path.join(ROOT, OUT);
  fs.writeFileSync(outPath, build(), 'utf8');
  const bytes = fs.statSync(outPath).size;
  console.log(`engine bundle written: ${OUT.replace(/\\/g, '/')} (${(bytes / 1024).toFixed(0)} KB)`);
}

// The freshness GATE (does the on-disk bundle still match a fresh build?) lives in
// tests/harness/verify-bundle.js: it's used from three places (npm test, a standalone pre-deploy CLI
// check, and here) and needs to be reusable without pulling in the whole build step. This module
// only exports what verify-bundle.js needs to do that comparison: the builder, the per-file section
// splitter, the output path, and the resolved file list (for naming which file went stale).
module.exports = { ROOT, OUT, FILES, build, fileSections, extractEmbeddedSource };

if (require.main === module) write();
