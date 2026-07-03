// ─── UI Lab dev server ────────────────────────────────────────────────────────
// A zero-dependency static file server (Node built-ins only — http, fs, path) rooted at the repo,
// plus a live-reload channel: it watches styles.css and src/** (and the lab/ + fixtures), and pushes
// a browser refresh over Server-Sent Events whenever one changes. A tiny reload-listener <script> is
// injected into every served HTML page, so the loop is edit → glance with no manual refresh.
//
// Start it with:  npm run lab    (then open the URL it prints)
// No third-party packages — preserves the repo's no-build-step / no-runtime-dependency constraint.
// Serves on-demand only; it is never launched by `npm test`. See PRD-ui-tweak-pipeline.md.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.LAB_PORT) || 5180;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json',
};

// Reload-listener injected into served HTML: reconnecting EventSource that reloads on any message.
const RELOAD_SNIPPET =
  '\n<script>(function(){try{var s=new EventSource("/__livereload");' +
  's.onmessage=function(){location.reload();};}catch(e){}})();</script>\n';

const sseClients = new Set();
function broadcastReload() { for (const res of sseClients) { try { res.write('data: reload\n\n'); } catch (e) {} } }

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/__livereload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Redirect the bare root to the shell's real path so relative ../src + frame.html URLs resolve
  // the same way they do when the lab is opened directly via file:// (under /lab/).
  if (urlPath === '/' || urlPath === '/lab' || urlPath === '/lab/') {
    res.writeHead(302, { Location: '/lab/index.html' });
    res.end(); return;
  }
  const rel = urlPath;
  const filePath = path.normalize(path.join(ROOT, rel));
  // Refuse anything that escapes the repo root (path traversal).
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 · ' + rel); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    if (ext === '.html') {
      let html = data.toString('utf8');
      html = html.includes('</body>') ? html.replace('</body>', RELOAD_SNIPPET + '</body>') : html + RELOAD_SNIPPET;
      data = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// Debounced watch: editors often fire several change events per save.
let _debounce = null;
function onChange() { clearTimeout(_debounce); _debounce = setTimeout(broadcastReload, 80); }
function watch(target) {
  try { fs.watch(target, { recursive: true }, onChange); }
  catch (e) { /* missing path / platform without recursive watch — non-fatal */ }
}
try { fs.watch(path.join(ROOT, 'src', 'styles.css'), onChange); } catch (e) {}
watch(path.join(ROOT, 'src'));
watch(path.join(ROOT, 'lab'));
watch(path.join(ROOT, 'tests', 'harness', 'screen-fixtures.js'));
watch(path.join(ROOT, 'tests', 'harness', 'balance-roles.js'));
watch(path.join(ROOT, 'tests', 'harness', 'balance-metrics.js'));
watch(path.join(ROOT, 'tests', 'harness', 'layout-measure.js'));

server.listen(PORT, () => {
  console.log(`\n  ♣  Gambdle UI Lab  →  http://localhost:${PORT}/\n`);
  console.log('     Pick a Screen / Size / Modifier in the toolbar; edit styles.css or src/** and the');
  console.log('     preview live-reloads. Ctrl+C to stop.\n');
});

module.exports = { server, PORT, broadcastReload };
