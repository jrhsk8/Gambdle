// Throwaway: audit card/suit rendering. Renders (a) a card gallery isolating lg/md/sm cards of every
// suit + the tiny split variants, and (b) real card-heavy game screens, in BOTH Chromium and WebKit,
// across the binding viewports. Writes to screenshots/cards/. Delete after review.
const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';
const OUT = path.join(__dirname, '..', 'screenshots', 'cards');

const GALLERY = () => {
  const ranks = ['A','K','Q','J','10','9','7','2'];
  const suits = ['s','h','d','c'];
  const row = (sz, extraCls='') => `<div class="hand ${extraCls}" style="justify-content:flex-start;flex-wrap:wrap;gap:6px;margin:6px 0">` +
    ranks.flatMap(r => suits.map(s => cardHTML(card(r,s), sz, '', 0, false))).join('') + `</div>`;
  const lbl = t => `<div style="color:#fff;font:700 13px sans-serif;margin:10px 0 2px">${t}</div>`;
  document.getElementById('app').innerHTML = `<div style="padding:12px;background:#2a6b3f;min-height:100vh">
    ${lbl('LARGE (.lg)')}${row('lg')}
    ${lbl('MEDIUM (.md)')}${row('md')}
    ${lbl('SMALL (.sm)')}${row('sm')}
    ${lbl('SPLIT-ASIDE tiny (sm, corner suits hidden)')}<div class="bj-split-aside">${row('sm')}</div>
    ${lbl('SPLIT-RESULT dealer (sm)')}<div class="bj-sr-dealer">${row('sm')}</div>
  </div>`;
};

const SCREENS = {
  'bj-play':    () => { S.screen='bj'; S.bjPhase='play'; S.chips=950; S.bjBet=50; S.bjHand=0; S.bjHistory=[]; S.bjPlayer=[card('A','s'),card('10','h'),card('3','d')]; S.bjDealer=[card('Q','c'),card('7','s')]; S.bjDealerReveal=false; S.bjSplit=false; },
  'bj-result':  () => { S.screen='bj'; S.bjPhase='result'; S.chips=900; S.bjBet=50; S.bjHand=1; S.bjSplit=false; S.bjDealerReveal=true; S.bjPlayer=[card('K','s'),card('9','h')]; S.bjDealer=[card('10','d'),card('8','c'),card('3','s')]; S.bjResult={result:'win',delta:50}; S.bjHistory=[{bet:50,result:'win',delta:50,player:[...S.bjPlayer],dealer:[...S.bjDealer]}]; },
  'bj-split4':  () => { S.screen='bj'; S.bjPhase='result'; S.chips=1050; S.bjBet=50; S.bjHand=1; S.bjSplit=true; S.bjDealerReveal=true; S.bjSplitHands=[[card('8','s'),card('K','h')],[card('8','h'),card('9','d')],[card('8','d'),card('Q','c')],[card('8','c'),card('J','s')]]; S.bjSplitResults=[{result:'win',delta:50,bet:50},{result:'lose',delta:-50,bet:50},{result:'push',delta:0,bet:50},{result:'win',delta:50,bet:50}]; S.bjSplitBets=[50,50,50,50]; S.bjDealer=[card('10','d'),card('9','c')]; S.bjResult={result:'split',delta:50}; S.bjHistory=[{bet:200,result:'split',delta:50,player:S.bjSplitHands.map(h=>[...h]),dealer:[...S.bjDealer]}]; },
  'uth-turn':   () => { S.screen='uth'; S.uthPhase='turn'; S.chips=1100; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('8','h'),card('6','s'),card('Q','h'),card('5','d'),card('A','d')]; S.uthRevealComm=5; S.uthRaised=false; },
  'uth-showdown': () => { S.screen='uth'; S.uthPhase='result'; S.chips=1100; S.uthHand=1; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('A','h'),card('K','s'),card('Q','h'),card('5','d'),card('3','c')]; const pb=bestOf7([...S.uthHole,...S.uthComm]),db=bestOf7([...S.uthDealer,...S.uthComm]); S.uthHistory=[{ante:50,blind:50,play:100,playMult:1,result:'win',delta:200,anteDelta:50,blindDelta:0,playDelta:100,playerBest:pb,dealerBest:db,dealerQualifies:true}]; },
};

async function run(engine, name) {
  const browser = await engine.launch();
  const page = await browser.newPage();
  await page.goto(BASE + '?dev=true');
  await page.waitForFunction(() => typeof render === 'function' && typeof card === 'function', { timeout: 10000 });

  // Gallery — default, four-color, emoji decks — at one desktop + one mobile size.
  for (const [w, h] of [[1280, 800], [393, 852]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const deck of ['default', 'four-color', 'emoji']) {
      await page.evaluate((d) => {
        document.body.classList.remove('four-color', 'deck-emoji');
        if (d === 'four-color') document.body.classList.add('four-color');
        if (d === 'emoji') document.body.classList.add('deck-emoji');
      }, deck);
      await page.evaluate('(' + GALLERY.toString() + ')()');
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `${name}-gallery-${deck}-${w}x${h}.png`), fullPage: true });
    }
    await page.evaluate(() => document.body.classList.remove('four-color', 'deck-emoji'));
  }

  // Real screens at the binding sizes.
  const sizes = [[1280, 800], [1024, 1080], [360, 780], [393, 852]];
  for (const [key, fn] of Object.entries(SCREENS)) {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate((src) => { S.forcedMod = 'easy_dealer'; (new Function(src))(); _noAnim = true; render(); }, '(' + fn.toString() + ')()');
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, `${name}-${key}-${w}x${h}.png`) });
    }
  }
  await browser.close();
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await run(chromium, 'chromium');
  await run(webkit, 'webkit');
  console.log('wrote card shots to', OUT);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
