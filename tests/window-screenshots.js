// Generates review screenshots of the game at a range of window sizes, in Chromium.
// Companion to tests/screenshots.js (which is iPhone/WebKit-only). Use this to eyeball
// desktop layout and the large-display zoom steps (2560×1440 → 1.25×, 3840×2160 → 1.8×;
// see the large-display block in styles.css).
//
// Run:   npm run screenshots:windows
//        node tests/window-screenshots.js                 # every screen × every size
//        node tests/window-screenshots.js 2560            # only sizes whose label matches "2560"
//        node tests/window-screenshots.js uth             # all sizes, only screens matching "uth"
//        node tests/window-screenshots.js 3840 uth-flop   # 3840-wide size, only the uth-flop screen
// Args are matched against size labels and screen names automatically, so order
// doesn't matter and you never need to pass an empty placeholder (PowerShell drops
// empty-string args, which made positional filters fragile).
//
// Writes screenshots/windows/<size>__<screen>.png  (the screenshots/ folder is git-ignored).
// First time: npx playwright install chromium  (npm install already pulls Chromium in).
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/../index.html';
const OUT = __dirname + '/../screenshots/windows';

// Window sizes to capture. Mobile uses the phone shell; everything ≥1024 uses the
// desktop chrome; the last two exercise the large-display zoom steps.
const SIZES = [
  { label: '0360x780-mobile', w:  360, h:  780, mobile: true },
  { label: '0375x812-mobile', w:  375, h:  812, mobile: true },
  { label: '0393x852-mobile', w:  393, h:  852, mobile: true },
  { label: '1024x1080',       w: 1024, h: 1080 },
  { label: '1280x800',        w: 1280, h:  800 },
  { label: '1440x900',        w: 1440, h:  900 },
  { label: '1920x1080',       w: 1920, h: 1080 },
  { label: '2560x1440-z1.25', w: 2560, h: 1440 },
  { label: '3840x2160-z1.8',  w: 3840, h: 2160 },
];

// One fixture per screen — sets S to a representative state. Uses the page's own
// card()/bestOf7(). Mirrors the fixtures in screenshots.js so the two stay in sync.
const SCREENS = {
  'intro':           () => { S.screen='intro'; S.chips=1000; },
  'choice':          () => { S.forcedMod='players_choice'; S.screen='choice'; S.pcPick=null; S.chips=1000; },
  'bj-bet':          () => { S.screen='bj'; S.bjPhase='bet'; S.chips=1000; S.bjBet=50; S.bjHand=0; S.bjHistory=[]; },
  'bj-play':         () => { S.screen='bj'; S.bjPhase='play'; S.chips=950; S.bjBet=50; S.bjHand=0; S.bjHistory=[]; S.bjPlayer=[card('A','s'),card('10','h')]; S.bjDealer=[card('Q','c'),card('7','s')]; S.bjDealerReveal=false; S.bjSplit=false; },
  'bj-result':       () => { S.screen='bj'; S.bjPhase='result'; S.chips=900; S.bjBet=50; S.bjHand=1; S.bjSplit=false; S.bjDealerReveal=true; S.bjPlayer=[card('K','s'),card('9','h')]; S.bjDealer=[card('10','d'),card('8','c'),card('3','s')]; S.bjResult={result:'win',delta:50}; S.bjHistory=[{bet:50,result:'win',delta:50,player:[...S.bjPlayer],dealer:[...S.bjDealer]}]; },
  // Last hand of 3 → the inter-game advance button ("Round 2: Hold'em →"), the longest single-button label.
  'bj-result-last':  () => { S.screen='bj'; S.bjPhase='result'; S.chips=900; S.bjBet=50; S.bjHand=3; S.bjSplit=false; S.bjDealerReveal=true; S.bjPlayer=[card('K','s'),card('9','h')]; S.bjDealer=[card('10','d'),card('8','c'),card('3','s')]; S.bjResult={result:'win',delta:50}; S.bjHistory=[{bet:50,result:'win',delta:50,player:[...S.bjPlayer],dealer:[...S.bjDealer]}]; },
  'uth-bet':         () => { S.screen='uth'; S.uthPhase='bet'; S.chips=1000; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; },
  'uth-flop':        () => { S.screen='uth'; S.uthPhase='flop'; S.chips=1100; S.uthAnte=100; S.uthHand=0; S.uthHistory=[]; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('8','h'),card('6','s'),card('Q','h'),card('5','d'),card('A','d')]; S.uthRevealComm=3; S.uthRaised=false; },
  'uth-showdown':    () => { S.screen='uth'; S.uthPhase='result'; S.chips=1100; S.uthHand=1; S.uthHole=[card('A','s'),card('K','d')]; S.uthDealer=[card('2','c'),card('7','h')]; S.uthComm=[card('A','h'),card('K','s'),card('Q','h'),card('5','d'),card('3','c')]; const pb=bestOf7([...S.uthHole,...S.uthComm]),db=bestOf7([...S.uthDealer,...S.uthComm]); S.uthHistory=[{ante:50,blind:50,play:100,playMult:1,result:'win',delta:200,anteDelta:50,blindDelta:0,playDelta:100,playerBest:pb,dealerBest:db,dealerQualifies:true}]; },
  'roulette-bet':    () => { S.screen='roulette'; S.rPhase='bet'; S.chips=450; S.rBet=50; S.rPick=17; S.rBets=[{pick:45,bet:50}]; },
  'roulette-bet-max':() => { S.screen='roulette'; S.rPhase='bet'; S.chips=750; S.rBet=0; S.rPick=null; S.rBets=[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50},{pick:2,bet:50},{pick:31,bet:50}]; },
  // setTimeout(0) defers drawStaticWheel until after the harness's render() creates the canvas, so the
  // wheel face appears (it's normally painted by rSpin, not render).
  'roulette-spinning':() => { S.screen='roulette'; S.rPhase='spinning'; S.chips=0; S.rSpin=17; S.rBets=[{pick:45,bet:50},{pick:17,bet:50},{pick:40,bet:50},{pick:2,bet:50},{pick:31,bet:50}]; setTimeout(()=>drawStaticWheel(),0); },
  'roulette-result': () => { S.screen='roulette'; S.rPhase='result'; S.chips=900; S.rSpin=17; S.rResult={delta:350,bets:[{pick:17,won:true,delta:350,pay:35,bet:10}]}; },
  'results':         () => { S.screen='results'; S.chips=1450; S.bjHand=3; S.uthHand=3; S.bjHistory=[{delta:200},{delta:-50},{delta:100}]; S.uthHistory=[{delta:150},{delta:-100},{delta:0}]; S.rResult={delta:150,bets:[{pick:17,won:true,delta:150,pay:35,bet:10}]}; },
  'ladder-bet-free': () => { S.forcedMod='ladder_day'; S.screen='ladder'; S.ladPhase='bet'; S.ladBet=0; S.ladFree=false; S.ladIdx=0; S.ladRung=0; S.ladResult=null; S.chips=1000; },
  'ladder-climb':    () => { S.forcedMod='ladder_day'; S.screen='ladder'; S.ladPhase='climb'; S.ladBet=250; S.ladFree=true; S.ladIdx=3; S.ladRung=3; S.ladResult=null; S.chips=1000; },
  'ladder-crash':    () => { S.forcedMod='ladder_day'; S.screen='ladder'; S.ladPhase='done'; S.ladBet=250; S.ladFree=true; S.ladIdx=4; S.ladRung=3; S.ladResult={delta:0,rung:3,outcome:'crash',free:true}; S.chips=1000; },
  'ladder-cash':     () => { S.forcedMod='ladder_day'; S.screen='ladder'; S.ladPhase='done'; S.ladBet=250; S.ladFree=true; S.ladIdx=4; S.ladRung=4; S.ladResult={delta:1250,rung:4,outcome:'cash',free:true}; S.chips=2250; },
};

(async () => {
  // Match each arg against size labels and screen names; order-independent.
  const args = process.argv.slice(2).filter(Boolean);
  const sizeArgs   = args.filter(a => SIZES.some(s => s.label.includes(a)));
  const screenArgs = args.filter(a => Object.keys(SCREENS).some(n => n.includes(a)));
  const bad = args.filter(a => !sizeArgs.includes(a) && !screenArgs.includes(a));
  if (bad.length) {
    console.error(`Unknown filter(s): ${bad.join(', ')}.\n` +
      `Sizes: ${SIZES.map(s => s.label).join(', ')}\nScreens: ${Object.keys(SCREENS).join(', ')}`);
    process.exit(1);
  }
  const sizes   = sizeArgs.length   ? SIZES.filter(s => sizeArgs.some(a => s.label.includes(a)))
                                    : SIZES;
  const screens = Object.entries(SCREENS).filter(([name]) =>
    !screenArgs.length || screenArgs.some(a => name.includes(a)));

  // Wipe the output dir each run so it only ever holds the current set (stale/renamed
  // shots otherwise pile up). Only the windows/ subfolder — leave the WebKit shots alone.
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const json = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  let count = 0;

  for (const size of sizes) {
    const ctx = await browser.newContext({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1,
      isMobile: !!size.mobile, hasTouch: !!size.mobile,
    });
    const page = await ctx.newPage();
    // Stub Supabase so the leaderboard / distribution chart resolve offline.
    await page.route('**/functions/v1/**', json({}));
    await page.route('**/rest/v1/**', json([]));
    await page.route('**/rpc/get_score_distribution', json([3,5,8,12,9,4,2].map((count, bucket) => ({ bucket, count }))));
    await page.route('**/rpc/get_percentile', json([{ top_pct: 28, total: 142 }]));
    await page.goto(BASE);
    await page.evaluate(() => { window.__SNAP = JSON.stringify({ ...S, pkHeld: [...S.pkHeld] }); });

    for (const [name, fn] of screens) {
      await page.evaluate((src) => {
        Object.assign(S, JSON.parse(window.__SNAP)); S.pkHeld = new Set();
        S.forcedMod = 'easy_dealer';
        (new Function(src))();
        render();
      }, '(' + fn.toString() + ')()');
      await page.waitForTimeout(name === 'results' ? 900 : 1500); // settle deal anim / async chart
      await page.screenshot({ path: `${OUT}/${size.label}__${name}.png` });
      count++;
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`wrote ${count} screenshots to screenshots/windows/`);
})().catch(e => { console.error(e); process.exit(1); });
