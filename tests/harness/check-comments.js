// ─── Comment format check ─────────────────────────────────────────────────────
// Enforces the mechanical rules of .claude/COMMENTS.md over src/, tests/,
// supabase/functions/, and styles.css:
//   • JS/TS uses // only: no /* */ or /** */ block comments
//   • no em dash (U+2014) inside any comment (the ─ divider glyph U+2500 is fine)
//   • no todo/fixme/hack-style markers in comments (uppercase forms; see MARKER_RE)
//   • every src/*.js file opens with a // header comment
// Content rules (tone, banned refactor history, etc.) are judgment calls the
// checker can't see; those live in COMMENTS.md only.
// Runs in `npm test` (tests/harness/run.js); standalone: node tests/harness/check-comments.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const EM_DASH = '—';
const MARKER_RE = /\b(TODO|FIXME|XXX|HACK)\b/;

// Blank out string literals so a '/*' or '//' inside a string ("**/rest/v1/**",
// indexOf('/*'), URLs) can't look like a comment. Crude single-line pass; a
// template literal spanning lines is not handled, which at worst hides a
// violation inside one, never invents one.
function stripStrings(line) {
  return line
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\\n]|\\.)*`/g, '``');
}

// Check one JS/TS file. `needHeader` adds the src-only opening-header rule.
function checkJs(rel, text, needHeader, problems) {
  const lines = text.split('\n');
  if (needHeader) {
    const first = lines.find(l => l.trim() !== '');
    if (!first || !first.trim().startsWith('//'))
      problems.push(`${rel}: must open with a // header comment (see .claude/COMMENTS.md)`);
  }
  lines.forEach((raw, i) => {
    const line = stripStrings(raw);
    const slash = line.indexOf('//');
    const code = slash === -1 ? line : line.slice(0, slash);
    const comment = slash === -1 ? '' : line.slice(slash + 2);
    if (code.includes('/*'))
      problems.push(`${rel}:${i + 1}: block comment (/* */) — use // (COMMENTS.md)`);
    if (comment.includes(EM_DASH))
      problems.push(`${rel}:${i + 1}: em dash in comment — use a middot, colon, or two sentences`);
    if (MARKER_RE.test(comment))
      problems.push(`${rel}:${i + 1}: ${comment.match(MARKER_RE)[1]} marker — track work in .claude docs or issues, not comments`);
  });
}

// styles.css: comments are /* */ spans; only the em-dash and marker rules apply.
function checkCss(rel, text, problems) {
  const lineOf = idx => text.slice(0, idx).split('\n').length;
  let at = 0;
  while (true) {
    const open = text.indexOf('/*', at);
    if (open === -1) break;
    const close = text.indexOf('*/', open + 2);
    const body = text.slice(open + 2, close === -1 ? text.length : close);
    if (body.includes(EM_DASH))
      problems.push(`${rel}:${lineOf(open)}: em dash in comment — use a middot, colon, or two sentences`);
    if (MARKER_RE.test(body))
      problems.push(`${rel}:${lineOf(open)}: ${body.match(MARKER_RE)[1]} marker — track work in .claude docs or issues, not comments`);
    if (close === -1) break;
    at = close + 2;
  }
}

function listFiles(dir, ext) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { recursive: true })
    .filter(f => f.endsWith(ext))
    .map(f => path.join(dir, String(f)));
}

function check() {
  const problems = [];
  const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const rel of listFiles('src', '.js')) checkJs(rel, read(rel), true, problems);
  for (const rel of listFiles('tests', '.js')) checkJs(rel, read(rel), false, problems);
  // engine-bundle.mjs is generated (build-engine-bundle.js) and inherits src comments; skip it.
  for (const rel of listFiles(path.join('supabase', 'functions'), '.ts'))
    checkJs(rel, read(rel), false, problems);
  checkCss('src/styles.css', read(path.join('src', 'styles.css')), problems);
  return problems;
}

module.exports = { check };

if (require.main === module) {
  const problems = check();
  if (problems.length) {
    console.error(`❌ COMMENT FORMAT: ${problems.length} violation(s)`);
    for (const p of problems) console.error('  • ' + p);
    process.exit(1);
  }
  console.log('COMMENT FORMAT: ✅ clean');
}
