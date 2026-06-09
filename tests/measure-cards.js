const { chromium } = require('playwright');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  await p.goto(BASE + '?dev=true');
  await p.waitForFunction(() => typeof card === 'function');
  const data = await p.evaluate(() => {
    const out = {};
    function glyphBox(sym, px) {
      const span = document.createElement('span');
      span.style.cssText = `font-family:Tahoma,'Segoe UI',sans-serif;font-size:${px}px;position:absolute;left:-9999px;line-height:1`;
      span.textContent = sym + '︎';
      document.body.appendChild(span);
      const r = document.createRange(); r.selectNodeContents(span);
      const bb = r.getBoundingClientRect();
      span.remove();
      return { w: +bb.width.toFixed(1), h: +bb.height.toFixed(1) };
    }
    out.glyphs = {};
    for (const s of ['♠', '♥', '♦', '♣']) out.glyphs[s] = glyphBox(s, 54);
    document.getElementById('app').innerHTML = `<div class="hand">${cardHTML(card('10','d'),'lg','',0,false)}${cardHTML(card('A','s'),'lg','',0,false)}</div>`;
    out.corners = [...document.querySelectorAll('.card')].map(cd => {
      const cb = cd.getBoundingClientRect();
      const cbr = cd.querySelector('.cbr').getBoundingClientRect();
      return {
        rank: cd.querySelector('.ct-r').dataset.r,
        overflowRight: +(cbr.right - cb.right).toFixed(1),
        overflowBottom: +(cbr.bottom - cb.bottom).toFixed(1),
        cbrLeftInset: +(cbr.left - cb.left).toFixed(1),
        cbrWidth: +cbr.width.toFixed(1),
      };
    });
    return out;
  });
  console.log(JSON.stringify(data, null, 2));
  await b.close();
})();
