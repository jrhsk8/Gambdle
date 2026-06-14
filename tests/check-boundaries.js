// ─── Module boundary check ────────────────────────────────────────────────────
// The src/ files are plain <script> globals (no bundler), so nothing technically
// stops one file from reaching into another's internals. This check makes the
// boundaries real: MANIFEST below declares each file's public API, and anything
// a file declares at top level that is NOT in its export list is file-private.
// The check fails when:
//   • a src file references another file's private identifier
//   • two files declare the same top-level identifier (silent global clobber)
//   • a manifest entry drifts (export no longer declared, or a file is missing)
//
// Tests are exempt on purpose — they poke seams like _doReload and _forceMobile.
// To publish a new cross-file function, add it to its file's export list here.
// Runs first in `npm test` (tests/run.js); standalone: node tests/check-boundaries.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

// Public API per file. Generated from actual cross-file usage at the time of the
// module split (v1.28) and maintained by hand since.
const MANIFEST = {
  'audio.js': ['_safePlay', 'playMp3', 'sndBigWin', 'sndCard', 'sndChip', 'sndShuffle'],
  'bj.js': ['_bjResumeAfterRefresh', 'bjSplit', 'peekBtnHTML', 'peekRevealed', 'resetBJHand', 'screenBJ'],
  'core.js': [
    'ANIM_NONE', 'BORROW_AMOUNT', 'DEAL', 'DEV_OVERRIDE', 'GAME1', 'GAME1_OPTIONS', 'GAME2',
    'GAME2_OPTIONS', 'GAME_META', 'GAME_VERSION', 'NEXT_SCREEN', 'RED_S', 'S', 'START_CHIPS',
    'START_DATE_UTC', 'SUPABASE_ANON_KEY', 'SUPABASE_HEADERS', 'SUPABASE_URL', '_PHOENIX_OFFSET_MS',
    '_backlogSeed', '_canShowBorrow', '_effectiveBorrowAmount', '_lbTopPct', '_ls', '_nextDailySeed',
    '_testActive', 'buildDeck', 'card', 'computeStreak', 'credit', 'debit', 'gameNet',
    'getActiveSeed', 'getDailySeed', 'getDayNum', 'getDeviceId', 'getMod', 'getNetTier',
    'getRngSeed', 'getStateKey', 'getTier', 'hVal', 'hValDisplay', 'isBJ', 'isChipBusted',
    'loadState', 'mkRng',
    'pendingPlayersChoice', 'profileStats', 'recalcChips', 'saveState', 'shuffle', 'txLog',
    'UNLOCKS', 'winMult',
  ],
  'dev.js': [
    '_doReload', '_drawLayoutDebug', 'devApplyMod', 'devLadder', 'devReset', 'devSetGame', 'devSpin',
    'devToggleLayoutDebug', 'devToggleUnlocks', 'fetchDevStats', 'screenDevStats', 'toggleTestSeed',
  ],
  'flow.js': [
    '_nextHand', '_noAnim', '_resultPanel', '_skipHand', '_submitBorrow', 'advanceTo', 'goTo',
    'render', 'resultAdvanceBtn', 'startGame', 'updateChipDisplay',
  ],
  'game.js': [],
  'gametext.js': [
    'ABOUT_GAMBDLE', 'INFO_SECTIONS', 'POPUP_ENABLED', 'POPUP_MESSAGES', 'STATUS_HINT',
    'TUTORIAL_OFF_NOTE', 'TUTORIAL_TIPS', 'WHATS_NEW', 'buildShareText',
  ],
  'icons.js': ['icon'],
  'ladder.js': [
    'LADDER_MULTS', 'ladCall', 'ladCallCorrect', 'ladCashOut', 'ladMaxStake', 'ladPotAt',
    'ladRankVal', 'ladStakeCommit', 'resetLadderRun', 'screenLadder',
  ],
  'menus.js': ['applyPrefs', 'closeDropdowns', 'getPref', 'setPref', 'toggleMenu', 'togglePref'],
  'modifiers.js': ['CYCLE_ORDER', 'DAILY_MODIFIERS', 'DAILY_SEED_OVERRIDES', 'PRESET_MODIFIERS'],
  'roulette.js': ['_resolveSpinNumber', '_rouletteAudio', 'rSpin', 'screenRoulette', 'startWheelAnim'],
  'screens.js': [
    'fetchScoreDistribution', 'screenBorrow', 'screenChoice', 'screenIntro', 'screenResults',
    'submitAndFetchLeaderboard',
  ],
  'ui.js': [
    '_refreshShareBox', 'aiosRow', 'allIn', 'cardHTML', 'chipSel', 'col', 'doShare', 'fmt', 'fmtK',
    'gameDots', 'hdr', 'maxBet', 'modBannerHTML', 'nextBtn', 'patchBetUI', 'renderCards',
    'runningTotalRow', 'sign', 'toast',
  ],
  'uth.js': [
    'UTH_CARD_INTERVAL_MS', 'resetUTHHand', 'screenPoker', 'screenUTH', 'uthPayTableHTML',
    'uthPayTableHead',
  ],
  'windows.js': [
    '_isMobile', '_openInfoModal', '_openWindow', '_reapplyDragPos', '_recenterBtnHTML',
    '_runTutorial', '_testTutorial', '_updateBalloonPosition', 'devToggleTestTutorial',
    'initWindowDrag', 'showAbout', 'showInfo', 'showPopup', 'showProfile', 'snapWindowToOrigin',
    'toggleTutorial',
  ],
};

// Deliberate cross-file uses of a private identifier. Keep empty if possible;
// prefer exporting (add to MANIFEST) or renaming over allowlisting.
// Format: 'using-file.js -> name'
const ALLOW = new Set([]);

function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*/gm, '')
    .replace(/([^:"'`\\])\/\/[^\n]*/g, '$1'); // trailing // comments ("://" in URLs survives)
}

function topLevelDecls(src) {
  const names = new Set();
  for (const line of src.split(/\r?\n/)) {
    let m = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (m) names.add(m[1]);
    m = line.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (m) names.add(m[1]);
  }
  return names;
}

function check() {
  const problems = [];
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();

  // Manifest coverage both ways.
  for (const f of files) if (!(f in MANIFEST)) problems.push(`${f}: new src file — add it to MANIFEST in tests/check-boundaries.js`);
  for (const f of Object.keys(MANIFEST)) if (!files.includes(f)) problems.push(`MANIFEST lists ${f} but src/${f} does not exist`);

  const decls = {}, stripped = {};
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    decls[f] = topLevelDecls(src);
    stripped[f] = stripComments(src);
  }

  // Manifest exports must actually be declared in their file.
  for (const [f, names] of Object.entries(MANIFEST)) {
    if (!decls[f]) continue;
    for (const n of names) if (!decls[f].has(n)) problems.push(`${f}: manifest exports "${n}" but it is not declared there`);
  }

  // No top-level identifier may be declared in two files (later script silently clobbers earlier).
  const owner = {};
  for (const f of files) for (const n of decls[f]) {
    if (owner[n]) problems.push(`"${n}" is declared at top level in both ${owner[n]} and ${f}`);
    else owner[n] = f;
  }

  // Side effect: regenerate the symbol index (.claude/SYMBOLS.md) so "where is X
  // defined?" is a one-line lookup instead of a grep across src/. Best-effort —
  // never fails the suite.
  try {
    const lines = [];
    for (const f of files) {
      const exported = new Set(MANIFEST[f] || []);
      for (const n of [...decls[f]].sort()) {
        lines.push(`${n} · ${f} · ${exported.has(n) ? 'public' : 'private'}`);
      }
    }
    lines.sort((a, b) => a.localeCompare(b));
    fs.writeFileSync(path.join(__dirname, '..', '.claude', 'SYMBOLS.md'),
      '# Symbol index (generated by tests/check-boundaries.js on every `npm test` — do not edit)\n\n' +
      'Every top-level identifier in src/, alphabetical: `name · file · public|private`.\n' +
      'public = in the boundary MANIFEST (usable cross-file); private = file-internal.\n\n' +
      lines.join('\n') + '\n');
  } catch (e) { /* .claude/ missing or unwritable — skip */ }

  // No file may reference another file's private (non-exported) identifier.
  for (const f of files) {
    const exported = new Set(MANIFEST[f] || []);
    for (const n of decls[f]) {
      if (exported.has(n)) continue;
      const re = new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b');
      for (const g of files) {
        if (g === f || ALLOW.has(`${g} -> ${n}`)) continue;
        if (re.test(stripped[g])) problems.push(`${g} uses "${n}", which is private to ${f} (export it in the MANIFEST or keep it internal)`);
      }
    }
  }

  return problems;
}

module.exports = { check };

if (require.main === module) {
  const problems = check();
  if (problems.length) {
    console.error(`❌ MODULE BOUNDARIES: ${problems.length} violation(s)`);
    for (const p of problems) console.error('  • ' + p);
    process.exit(1);
  }
  console.log('✅ MODULE BOUNDARIES: clean');
}
