// Throwaway: tight, high-DPI close-ups of individual cards (default + four-color) so suit proportions
// are clearly visible. Writes to screenshots/cards2/. Delete after review.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';
const OUT = path.join(__dirname, '..', 'screenshots', 'cards2');

const GAL = () => {
  const suits = ['s','h','d','c'];
  const rowFor = (sz, extraCls='') => `<div class="hand ${extraCls}" style="justify-content:flex-start;gap:10px;margin:4px 0">` +
    suits.map(s => cardHTML(card('A',s), sz, '', 0, false)).join('') +
    cardHTML(card('10','d'), sz, '', 0, false) + cardHTML(card('K','s'), sz, '', 0, false) + `</div>`;
  const lbl = t => `<div style="color:#fff;font:700 12px sans-serif;margin:8px 0 2px">${t}</div>`;
  document.getElementById('app').innerHTML = `<div id="gal" style="display:inline-block;padding:10px;background:#2a6b3f">
    ${lbl('LG')}${rowFor('lg')}
    ${lbl('MD')}${rowFor('md')}
    ${lbl('SM')}${rowFor('sm')}
    ${lbl('SM split-aside (corner suits hidden)')}<div class="bj-split-aside">${rowFor('sm')}</div>
  </div>`;
};

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  await page.setViewportSize({ width: 760, height: 700 });
  await page.goto(BASE + '?dev=true');
  await page.waitForFunction(() => typeof card === 'function', { timeout: 10000 });
  for (const deck of ['default', 'four-color']) {
    await page.evaluate((d) => { document.body.classList.toggle('four-color', d === 'four-color'); }, deck);
    await page.evaluate('(' + GAL.toString() + ')()');
    await page.waitForTimeout(150);
    const el = await page.$('#gal');
    await el.screenshot({ path: path.join(OUT, `cards-${deck}.png`) });
  }
  await browser.close();
  console.log('wrote to', OUT);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
