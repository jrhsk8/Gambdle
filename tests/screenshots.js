// Generates iPhone review screenshots in WebKit (Safari's real engine).
// Each screen is rendered at iPhone 15 (393×852) with realistic Safari chrome reserved
// (Dynamic Island/status bar ~59px top, floating toolbar ~55px bottom) drawn as faint
// labeled bands, so you can confirm content clears the chrome.
// Run: npm run screenshots   →   writes screenshots/*.png  (the folder is git-ignored)
// First time: npx playwright install webkit
const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';
const OUT = __dirname + '/../screenshots';
const SA_T = 59, SA_B = 55;

// Each fixture sets S for a screen, using the page's own card()/bestOf7().
const FIXTURES = {
  '01-intro':            () => { S.screen='intro'; S.chips=1000; },
  '02-bj-bet':           () => { S.screen='bj'; S.bjPhase='bet'; S.chips=1000; S.bjBet=50; S.bjHand=0; S.bjHistory=[]; },
  '03-bj-play':          () => { S.screen='bj'; S.bjPhase='play'; S.chips=950; S.bjBet=50; S.bjHand=0; S.bjHistory=[]; S.bjPlayer=[card('A','s'),card('10','h'),card('3','d')]; S.bjDealer=[card('Q','c'),card('7','s')]; S.bjDealerReveal=false; S.bjSplit=false; },
  '04-bj-result':        () => { S.screen='bj'; S.bjPhase='result'; S.chips=900; S.bjBet=50; S.bjHand=1; S.bjSplit=false; S.bjDealerReveal=true; S.bjPlayer=[card('K','s'),card('9','h')]; S.bjDealer=[card('10','d'),card('8','c'),card('3','s')]; S.bjResult={result:'win',delta:50}; S.bjHistory=[{bet:50,result:'win',delta:50,player:[...S.bjPlayer],dealer:[...S.bjDealer]}]; },
  '05-bj-split-result':  () => { S.screen='bj'; S.bjPhase='result'; S.chips=1050; S.bjBet=50; S.bjHand=1; S.bjSplit=true; S.bjDealerReveal=true; S.bjSplitHands=[[card('8','s'),card('K','h')],[card('8','h'),card('9','d')],[card('8','d'),card('Q','c')],[card('8','c'),card('J','s')]]; S.bjSplitResults=[{result:'win',delta:50,bet:50},{result:'lose',delta:-50,bet:50},{result:'push',delta:0,bet:50},{result:'win',delta:50,bet:50}]; S.bjSplitBets=[50,50,50,50]; S.bjDealer=[card('10','d'),card('9','c')]; S.bjResult={result:'split',delta:50}; S.bjHistory=[{bet:200,result:'split',delta:50,player:S.bjSplitHands.map(h=>[...h]),dealer:[...S.bjDealer]}]; },
  '06-uth-bet':          () => { S.screen='uth'; S.uthPhase='bet'; S.chips=1000; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; },
  '07-uth-preflop':      () => { S.screen='uth'; S.uthPhase='preflop'; S.chips=1200; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('8','h'),card('6','s'),card('Q','h'),card('5','d'),card('A','d')]; S.uthRevealComm=0; S.uthRaised=false; },
  '08-uth-flop':         () => { S.screen='uth'; S.uthPhase='flop'; S.chips=1100; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('8','h'),card('6','s'),card('Q','h'),card('5','d'),card('A','d')]; S.uthRevealComm=3; S.uthRaised=false; },
  '09-uth-turn':         () => { S.screen='uth'; S.uthPhase='turn'; S.chips=1100; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('8','h'),card('6','s'),card('Q','h'),card('5','d'),card('A','d')]; S.uthRevealComm=5; S.uthRaised=false; },
  '10-uth-showdown':     () => { S.screen='uth'; S.uthPhase='result'; S.chips=1100; S.uthHand=1; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('A','h'),card('K','s'),card('Q','h'),card('5','d'),card('3','c')]; const pb=bestOf7([...S.uthHole,...S.uthComm]),db=bestOf7([...S.uthDealer,...S.uthComm]); S.uthHistory=[{ante:50,blind:50,play:100,playMult:1,result:'win',delta:200,anteDelta:50,blindDelta:0,playDelta:100,playerBest:pb,dealerBest:db,dealerQualifies:true}]; },
  '11-uth-fold':         () => { S.screen='uth'; S.uthPhase='result'; S.chips=900; S.uthHand=1; S.uthHole=[card('7','h'),card('2','c')]; S.uthDealer=[card('A','c'),card('K','h')]; S.uthComm=[card('A','d'),card('K','d'),card('Q','s'),card('5','d'),card('3','c')]; S.uthHistory=[{ante:50,blind:50,play:0,playMult:0,result:'fold',delta:-100,anteDelta:-50,blindDelta:-50,playDelta:0,playerBest:null,dealerBest:null,dealerQualifies:false}]; },
  '12-roulette-bet':     () => { S.screen='roulette'; S.rPhase='bet'; S.chips=450; S.rBet=50; S.rPick=17; S.rBets=[{pick:45,bet:50}]; },
  '13-roulette-bet-max': () => { S.screen='roulette'; S.rPhase='bet'; S.chips=750; S.rBet=0; S.rPick=null; S.rBets=[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50},{pick:2,bet:50},{pick:31,bet:50}]; },
  '14-roulette-result':  () => { S.screen='roulette'; S.rPhase='result'; S.chips=900; S.rSpin=17; S.rResult={delta:350,bets:[{pick:17,won:true,delta:350,pay:35,bet:10}]}; },
  '15-results':          () => { S.screen='results'; S.chips=1450; S.bjHand=3; S.uthHand=3; S.bjHistory=[{delta:200},{delta:-50},{delta:100}]; S.uthHistory=[{delta:150},{delta:-100},{delta:0}]; S.rResult={delta:150,bets:[{pick:17,won:true,delta:150,pay:35,bet:10}]}; },
  '16-borrow':           () => { S.screen='borrow'; S.chips=0; S.borrowReturnScreen='uth'; },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await webkit.launch();
  const json = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Generic routes first, specific RPC mocks last — Playwright uses the LAST matching
  // route, so the score-distribution / percentile mocks must win over **/rest/v1/**.
  await page.route('**/functions/v1/**', json({}));
  await page.route('**/rest/v1/**', json([]));
  await page.route('**/rpc/get_score_distribution', json([3, 5, 8, 12, 9, 4, 2].map((count, bucket) => ({ bucket, count }))));
  await page.route('**/rpc/get_percentile', json([{ top_pct: 28, total: 142 }]));
  await page.goto(BASE);
  await page.evaluate(({ t, b }) => {
    window.__SNAP = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] });
    document.documentElement.style.setProperty('--sa-t', t + 'px');
    document.documentElement.style.setProperty('--sa-b', b + 'px');
  }, { t: SA_T, b: SA_B });

  for (const [name, fn] of Object.entries(FIXTURES)) {
    await page.evaluate((src) => {
      Object.assign(S, JSON.parse(window.__SNAP)); S.pkHeld = new Set();
      S.forcedMod = 'easy_dealer';
      (new Function(src))();
      render();
    }, '(' + fn.toString() + ')()');
    await page.waitForTimeout(name === '15-results' ? 900 : 1500); // settle deal animation / async chart
    // Faint labeled bands marking the iOS chrome zones content must stay clear of.
    await page.evaluate(({ t, b }) => {
      document.querySelectorAll('.__chrome').forEach(e => e.remove());
      const band = (css, label) => { const d = document.createElement('div'); d.className = '__chrome'; d.style.cssText = 'position:fixed;left:0;right:0;z-index:99999;pointer-events:none;background:rgba(220,40,40,.22);color:#fff;font:600 10px sans-serif;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 2px #000;' + css; d.textContent = label; document.body.appendChild(d); };
      band(`top:0;height:${t}px`, 'Dynamic Island / status bar');
      band(`bottom:0;height:${b}px`, 'Safari toolbar / home indicator');
    }, { t: SA_T, b: SA_B });
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await browser.close();
  console.log('wrote', Object.keys(FIXTURES).length, 'screenshots to screenshots/');
})().catch(e => { console.error(e); process.exit(1); });
