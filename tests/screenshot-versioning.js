// Shared screenshot versioning + retention, used by tests/screenshots.js (WebKit/iOS) and
// tests/window-screenshots.js (Chromium windows). Review screenshots are written under
//   screenshots/<GAME_VERSION>/<engine>/...
// so every render is tagged with the game version it captured. Re-running an engine for the
// current version refreshes ONLY that engine's folder (stale/renamed shots don't pile up),
// and version folders that are more than KEEP_VERSIONS_BACK versions behind the current
// GAME_VERSION are pruned, so a few recent versions stay around for comparison without old
// ones accumulating forever. (screenshots/ is git-ignored; these are throwaway review artifacts.)
const fs = require('fs');
const path = require('path');

// A version folder is deleted only when it is MORE than this many game-versions older than the
// current GAME_VERSION. e.g. at v1.38 with 3: v1.35–v1.38 are kept, v1.34 and older are pruned.
const KEEP_VERSIONS_BACK = 3;

const ROOT = path.join(__dirname, '..', 'screenshots');

// Single source of truth for the version (src/core.js), read without importing the browser
// bundle so these Node scripts stay decoupled from the page globals.
function gameVersion() {
  const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
  const m = core.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('Could not find GAME_VERSION in src/core.js');
  return m[1];
}

// 'v1.38' -> 1038. Releases bump the minor by 1 each time, so this key is monotonic and the
// difference between two keys is the number of versions between them. null = not a version dir.
function versionKey(v) {
  const m = String(v).match(/^v(\d+)\.(\d+)$/);
  return m ? Number(m[1]) * 1000 + Number(m[2]) : null;
}

// Remove version folders more than KEEP_VERSIONS_BACK versions older than `current`.
function pruneOldVersions(current) {
  const curKey = versionKey(current);
  if (curKey == null || !fs.existsSync(ROOT)) return;
  for (const name of fs.readdirSync(ROOT)) {
    const key = versionKey(name);
    if (key == null) continue;                                  // not a vX.Y folder, leave it alone
    if (!fs.statSync(path.join(ROOT, name)).isDirectory()) continue;
    if (curKey - key > KEEP_VERSIONS_BACK) {
      fs.rmSync(path.join(ROOT, name), { recursive: true, force: true });
      console.log(`pruned ${name} screenshots (>${KEEP_VERSIONS_BACK} versions behind ${current})`);
    }
  }
}

// Resolve and freshly empty one engine's output dir for the current version
// (screenshots/<version>/<engine>), then prune stale versions. Wiping only the engine's own
// subfolder lets the WebKit and Chromium passes coexist under the same version folder.
function versionedOutDir(engine) {
  const version = gameVersion();
  const out = path.join(ROOT, version, engine);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  pruneOldVersions(version);
  return out;
}

module.exports = { versionedOutDir };
