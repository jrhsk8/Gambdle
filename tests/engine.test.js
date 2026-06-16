// ─── Replay Engine tests ──────────────────────────────────────────────────────
// The engine (src/engine.js) recomputes a Run's score from the seed + Transcript. The
// strongest check is EQUIVALENCE: drive the REAL game functions (which consume the deck and
// record history exactly as a player would), then assert replayRun() lands on the same chips as
// recalcChips() — without predicting any outcome. That makes the engine's independent deck
// reconstruction the thing under test. Targeted unit tests then pin the subtle paths (a player
// blackjack still drawing the dealer, Double Ball, the Ladder outcomes) and the legality rejections.

// ─── Setup ──────────────────────────────────────────────────────────────────
const _engSavedSeedFlag = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1'); // deterministic TEST_CARD_OVERRIDE deal (getRngSeed()===1)

// bjDeal/uthDeal flip to the 'play' phase inside the sndShuffle callback, which the real audio defers
// (setTimeout / audio 'ended'). Drive it synchronously so the deal completes in-line; restored below.
const _engRealShuffle = sndShuffle;
sndShuffle = cb => { if(cb) cb(); };

function _clone(x){ return JSON.parse(JSON.stringify(x)); }
function _freshDeal(){ return genDeal(); }            // pristine DEAL (test overrides applied, no play mutation)
function _restoreDEAL(){ Object.assign(DEAL, genDeal()); } // first_ace mutates DEAL in place — reset between tests

function _resetRun(){
  _restoreDEAL();
  S.screen='intro'; S.chips=START_CHIPS; S.tx=[];
  S.bjHand=0; S.bjPhase='bet'; S.bjBet=0; S.bjPlayer=[]; S.bjDealer=[]; S.bjResult=null; S.bjHistory=[]; S.bjIdx=0;
  S.bjSplit=false; S.bjSplitHands=[]; S.bjSplitActive=0; S.bjSplitBets=[]; S.bjSplitResults=[]; S.bjSplitDone=[];
  S.bjDoubled=false; S.bjSplitDoubled=[]; S.bjActed=false; S.bjDealerReveal=false; S.bjCelebrating=false;
  S.uthHand=0; S.uthPhase='bet'; S.uthAnte=0; S.uthPlay=0; S.uthPlayMult=0; S.uthRaised=false; S.uthFolded=false;
  S.uthHole=[]; S.uthDealer=[]; S.uthComm=[]; S.uthRevealComm=0; S.uthPrevRevealComm=0; S.uthHistory=[];
  S.uthRedealPtr=27; S.timeTravelUsed=false;
  S.ladPhase='bet'; S.ladBet=0; S.ladFree=false; S.ladIdx=0; S.ladRung=0; S.ladResult=null;
  S.rPhase='bet'; S.rBets=[]; S.rBet=0; S.rPick=null; S.rResult=null; S.rSpin=null; S.rSpin2=null; S.rReSpun=false; S.rUnverified=false;
  S.borrowUsed=false; S.borrowAmount=0; S.borrowReturnScreen=null; S.pcPick=null; S.forcedMod=null; S.peeksUsed=0; S.peekAt=null;
  _bjResolving=false;
}

// Resolved modifier object the way getMod sees it: forcedMod can be a preset key or {} for none.
function _modsFor(modKey){ S.forcedMod = modKey; return _activeMod() || {}; }

// ─── Drive helpers (real game functions, resolution forced synchronously) ──────
// BJ: deal + a list of 'hit'|'stand'|'double', then settle via bjResolve(true) (it draws the
// dealer itself, exactly like the timer path does). Naturals skip the action loop.
function _driveBJ(bet, actions){
  S.bjBet=bet; S.bjPhase='bet';
  bjDeal();
  if(!isBJ(S.bjPlayer) && !isBJ(S.bjDealer)){
    for(const a of (actions||[])){
      _bjResolving=false;
      if(a==='hit'){ bjHit(); if(hVal(S.bjPlayer)>=21) break; }
      else if(a==='stand'){ bjStand(); break; }
      else if(a==='double'){ bjDouble(); break; }
    }
  }
  _bjResolving=false;
  bjResolve(true);
}

// BJ split: split the opening pair, then play each sub-hand. `plan` is an array of arrays — one
// list of 'hit'|'stand'|'double' per sub-hand, in order. Advance/resolution are stepped by hand.
function _driveBJSplit(bet, plan){
  S.bjBet=bet; S.bjPhase='bet';
  bjDeal();
  _bjResolving=false; bjSplit(); // sub-hand 0 gets its 2nd card, sub-hand 1 waits
  let pi=0;
  // Play sub-hands in active order; advance() deals the next sub-hand its 2nd card.
  while(S.bjPhase==='play'){
    const acts = plan[pi] || ['stand'];
    let ended=false;
    for(const a of acts){
      _bjResolving=false;
      if(a==='hit'){ bjHit(); if(hVal(S.bjSplitHands[S.bjSplitActive])>=21){ ended=true; break; } }
      else if(a==='double'){ bjDouble(); ended=true; break; }
      else if(a==='stand'){ bjStand(); ended=true; break; }
    }
    pi++;
    _bjResolving=false;
    const prevActive=S.bjSplitActive;
    bjAdvanceSplit(); // mark current done, move on (deals 2nd card / resolves when all done)
    if(S.bjSplitActive===prevActive && S.bjPhase==='play'){ /* same hand still acting — shouldn't happen */ break; }
    if(S.bjSplitDone.every(d=>d)){ break; }
  }
  _bjResolving=false;
  if(S.bjPhase==='play') bjResolve(true);
}

// UTH: deal + a list of street actions. Resolution is synchronous inside uthResolve (the timer only
// flips the reveal phase). Actions: {a:'check'} | {a:'raise',mult} | {a:'fold'} | {a:'timetravel',st}.
function _driveUTH(ante, actions){
  S.uthAnte=ante; S.uthPhase='bet';
  uthDeal();
  for(const a of (actions||[])){
    if(S.uthPhase==='reveal'||S.uthPhase==='result') break;
    if(a.a==='check') uthCheck();
    else if(a.a==='raise') uthRaise(a.mult);
    else if(a.a==='fold') uthFold();
    else if(a.a==='timetravel') doTimeTravel();
  }
  // A raise commits to showdown; the player advances the remaining streets via uthNextStreet
  // (NOT logged to the transcript — the engine infers the showdown from the raise alone).
  let guard=0;
  while(S.uthRaised && S.uthPhase!=='reveal' && S.uthPhase!=='result' && guard++<5) uthNextStreet();
}

// Roulette: place bets (debit like the board does), map the words exactly as rSpin would, log the
// spin event, and settle. Returns the spinWords map for the engine.
function _driveRoulette(betsPairs, words, respin){
  const bets = betsPairs.map(([pick,bet])=>({pick,bet}));
  S.rBets = bets;
  bets.forEach(b=>debit(b.bet,'r-place'));
  const sp = spinFromRandom(words, spinMods());
  S.rSpin = sp.n; S.rSpin2 = sp.n2;
  txLog({g:'r',a:'spin',bets:betsPairs,respin:!!respin});
  _resolveRoulette();
}

function _driveLadder(stake, calls, cashAfter){
  S.screen='intro'; // keep _ladAfterAction from touching the DOM
  S.ladPhase='bet'; S.ladBet=stake;
  ladStakeCommit();
  for(const c of (calls||[])){ if(S.ladPhase!=='climb') break; ladCall(c); }
  if(cashAfter && S.ladPhase==='climb') ladCashOut();
}

// Run replayRun against the just-driven Run and return { expected, out }.
function _replayOf(mods, spinWords){
  return { expected: recalcChips(), out: replayRun(getRngSeed(), mods, S.tx, { deal: _freshDeal(), spinWords: spinWords||{} }) };
}

// ─── Equivalence: Blackjack ───────────────────────────────────────────────────
describe('engine — BJ equivalence', () => {
  it('three stand hands replay to the same chips', () => {
    _resetRun(); const mods=_modsFor({});
    _driveBJ(100,['stand']); _driveBJ(100,['stand']); _driveBJ(100,['stand']);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'replay chips == recalcChips');
    assertEqual(out.g1Net, gameNet('bj'), 'g1Net == bj net');
  });

  it('hits and a double replay identically (deck consumption)', () => {
    _resetRun(); const mods=_modsFor({});
    _driveBJ(100,['hit','stand']); _driveBJ(100,['double']); _driveBJ(100,['hit','hit','stand']);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });

  it('bj_payout (double_pay) modifier replays identically', () => {
    _resetRun(); const mods=_modsFor('double_pay');
    _driveBJ(100,['stand']); _driveBJ(120,['hit','stand']); _driveBJ(80,['stand']);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });

  it('bj_first_ace replays the in-place shoe swap identically', () => {
    _resetRun(); const mods=_modsFor('bj_first_ace');
    _driveBJ(100,['stand']); _driveBJ(100,['stand']); _driveBJ(100,['stand']);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });

  it('a split hand replays identically', () => {
    _resetRun(); const mods=_modsFor({});
    // TEST_CARD_OVERRIDE hand 0 deals the player a pair of 8s — split, stand both sub-hands.
    _driveBJSplit(100, [['stand'],['stand']]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'split replay chips');
  });
});

// ─── Equivalence: UTH ─────────────────────────────────────────────────────────
describe('engine — UTH equivalence', () => {
  it('check/raise/fold across three hands replays identically', () => {
    _resetRun(); const mods=_modsFor({});
    _driveUTH(100,[{a:'check'},{a:'check'},{a:'raise',mult:1}]); // check to turn, then play 1×
    _driveUTH(100,[{a:'raise',mult:3}]);                          // preflop 3× → showdown
    _driveUTH(100,[{a:'fold'}]);                                  // fold preflop
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
    assertEqual(out.g2Net, gameNet('uth'), 'g2Net == uth net');
  });

  it('preflop 4× raise replays identically', () => {
    _resetRun(); const mods=_modsFor({});
    _driveUTH(100,[{a:'raise',mult:4}]); _driveUTH(100,[{a:'check'},{a:'fold'}]); _driveUTH(100,[{a:'raise',mult:3}]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });

  it('uth_three_hole (Triple Threat) tail card replays identically', () => {
    _resetRun(); const mods=_modsFor('uth_three_hole');
    _driveUTH(100,[{a:'raise',mult:3}]); _driveUTH(100,[{a:'check'},{a:'raise',mult:2}]); _driveUTH(100,[{a:'fold'}]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });

  it('Time Travel (uth_time_travel) re-deal replays identically', () => {
    _resetRun(); const mods=_modsFor('uth_time_travel');
    // Check to the flop, re-deal the flop, then play through.
    _driveUTH(100,[{a:'check'},{a:'timetravel',st:'flop'},{a:'check'},{a:'raise',mult:1}]);
    _driveUTH(100,[{a:'raise',mult:3}]); _driveUTH(100,[{a:'fold'}]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });
});

// ─── Equivalence: full mixed run + comeback winMult ───────────────────────────
describe('engine — full run equivalence', () => {
  it('BJ + UTH + roulette replays to recalcChips', () => {
    _resetRun(); const mods=_modsFor({});
    _driveBJ(100,['stand']); _driveBJ(150,['hit','stand']); _driveBJ(100,['stand']);
    _driveUTH(100,[{a:'check'},{a:'raise',mult:2}]); _driveUTH(100,[{a:'raise',mult:3}]); _driveUTH(100,[{a:'fold'}]);
    const words=[5,7,11,13];
    _driveRoulette([[0,50],[45,50]], words); // bet number 0 (wins on the override spin) + Red (loses on 0)
    const {expected,out}=_replayOf(mods, {0:words});
    assertEqual(out.chips, expected, 'full run chips');
    assertEqual(out.rNet, S.rResult.delta, 'rNet == roulette delta');
  });

  it('comeback winMult (chips < 1000 at resolve) replays identically', () => {
    _resetRun(); const mods=_modsFor('comeback');
    _driveBJ(200,['stand']); _driveBJ(200,['stand']); _driveBJ(200,['stand']);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected);
  });
});

// ─── Equivalence: The Ladder ──────────────────────────────────────────────────
describe('engine — Ladder equivalence', () => {
  it('a staked climb + cash-out replays identically', () => {
    _resetRun(); const mods=_modsFor({});
    _driveLadder(100, ['hi','hi','hi','hi'], true); // crash or cash; either way deltas must match
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'ladder chips');
    assertEqual(out.ladNet, S.ladResult.delta, 'ladNet == ladder delta');
  });

  it('a free-entry (ladder_free) run replays identically', () => {
    _resetRun(); const mods=_modsFor('ladder_day');
    _driveLadder(0, ['lo','lo','lo'], true);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'free ladder chips');
  });
});

// ─── Targeted: a player blackjack still draws the dealer (deck consumption) ────
describe('engine — player blackjack draws the dealer', () => {
  const C = (r,s) => ({r,s:{s:'♠',h:'♥',d:'♦',c:'♣'}[s]});
  it('consumes the dealer draw, scoring blackjack and shifting the next hand', () => {
    // Crafted shoe: hand 0 = player A,K (blackjack) vs dealer 9,7 (=16, must draw). The draw card is
    // a 5 (→21, stand). Hand 1's cards therefore start AFTER that drawn card.
    const deal = { bjShoe:[C('A','s'),C('K','d'),C('9','h'),C('7','c'),C('5','s'),
                           C('10','d'),C('6','h'),C('Q','c'),C('2','s'),C('8','d')],
                   pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    const tx = [ {g:'bj',a:'deal',h:0,bet:100},
                 {g:'bj',a:'deal',h:1,bet:100}, {g:'bj',a:'stand',h:1,s:0} ];
    const out = replayRun(1, {}, tx, { deal: _clone(deal) });
    // Hand 0: blackjack pays 3:2 → +150. The dealer drew the 5 (index 4), so hand 1 = player 10,6
    // vs dealer Q,2 (=12, draws the 8 → 20). Player 16 stands, loses → -100. Net +50.
    assertEqual(out.chips, START_CHIPS + 150 - 100, 'BJ draw consumes a card, hand 1 follows it');
  });
});

// ─── Targeted: roulette spin modifiers ────────────────────────────────────────
describe('engine — roulette spin mapping', () => {
  it('Double Ball pays when either pocket hits', () => {
    // No override → words map through. r_double_ball gives a second distinct pocket.
    const deal = { bjShoe:[], pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    const words = [3, 9, 1, 0]; // n = 3%37 = 3; n2 = (3+1+(1%36))%37 = 5
    const mods = { r_double_ball: true };
    const tx = [ {g:'r',a:'spin',bets:[[5,100]],respin:false} ]; // bet on pocket 5 — wins via the 2nd ball
    const out = replayRun(1, mods, tx, { deal: _clone(deal), spinWords:{0:words} });
    assertEqual(out.rNet, 100*35, 'second ball (pocket 5) wins the straight-up bet');
  });

  it('a re-spin (idx 1) is the spin that counts', () => {
    const deal = { bjShoe:[], pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    const main = [17,0,0,0];   // n = 17
    const respun = [4,0,0,0];  // n = 4
    const tx = [ {g:'r',a:'spin',bets:[[4,100]],respin:false},
                 {g:'r',a:'spin',bets:[[4,100]],respin:true} ];
    const out = replayRun(1, {}, tx, { deal: _clone(deal), spinWords:{0:main, 1:respun} });
    assertEqual(out.rNet, 100*35, 're-spin (n=4) is honored, not the main spin (n=17)');
  });
});

// ─── Legality rejection ───────────────────────────────────────────────────────
describe('engine — legality rejection', () => {
  function rejects(reason, fn){
    let threw=null;
    try { fn(); } catch(e){ threw=e; }
    assert(threw, 'expected a rejection');
    assertEqual(threw.replayReason, reason, 'rejection reason');
  }
  const emptyDeal = () => ({ bjShoe:[{r:'5',s:'♠'},{r:'6',s:'♠'},{r:'10',s:'♦'},{r:'7',s:'♣'},{r:'9',s:'♥'},{r:'8',s:'♦'}],
                             pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null });
  it('rejects betting more than the stack holds', () => {
    rejects('bj_overbet', () => replayRun(1, {}, [{g:'bj',a:'deal',h:0,bet:5000}], { deal: emptyDeal() }));
  });
  it('rejects acting after a natural', () => {
    const deal = { bjShoe:[{r:'A',s:'♠'},{r:'K',s:'♦'},{r:'2',s:'♥'},{r:'7',s:'♣'},{r:'9',s:'♠'}],
                   pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    rejects('bj_act_after_natural', () => replayRun(1, {}, [{g:'bj',a:'deal',h:0,bet:100},{g:'bj',a:'hit',h:0,s:0}], { deal }));
  });
  it('rejects a second borrow', () => {
    rejects('double_borrow', () => replayRun(1, {}, [{g:'sys',a:'borrow',amt:50},{g:'sys',a:'borrow',amt:50}], {}));
  });
  it('rejects a roulette spin with no stored words', () => {
    rejects('r_no_words', () => replayRun(1, {}, [{g:'r',a:'spin',bets:[[5,100]],respin:false}], { deal: emptyDeal() }));
  });
  it('rejects a ladder cash-out before any rung is climbed', () => {
    const deal = { bjShoe:[], pokerDecks:[], uthDeck:[], ladderCards:[{r:'5',s:'♠'},{r:'9',s:'♦'}], rSpinOverride:null };
    rejects('lad_cash_norung', () => replayRun(1, {}, [{g:'lad',a:'stake',v:100},{g:'lad',a:'cash'}], { deal }));
  });
});

// ─── auditRound ───────────────────────────────────────────────────────────────
describe('engine — auditRound', () => {
  it('recomputes each recorded round to its stored delta', () => {
    _resetRun(); const mods=_modsFor({});
    _driveBJ(100,['stand']); _driveBJ(120,['hit','stand']);
    _driveUTH(100,[{a:'check'},{a:'raise',mult:2}]);
    const deal=_freshDeal();
    for(const r of S.bjHistory) if(r.result!=='split') assertEqual(auditRound(r, deal, mods), r.delta, 'bj round audits to its delta');
    for(const r of S.uthHistory) assertEqual(auditRound(r, deal, mods), r.delta, 'uth round audits to its delta');
  });
});

// ─── buildDeal ────────────────────────────────────────────────────────────────
describe('engine — buildDeal', () => {
  it('produces the documented Deal shape with the extended BJ shoe', () => {
    const d = buildDeal(1);
    assert(Array.isArray(d.bjShoe) && d.bjShoe.length === 104 + 104, 'bjShoe = base 104 + tail 104');
    assertEqual(d.pokerDecks.length, 3, '3 poker decks');
    assertEqual(d.uthDeck.length, 52, 'uth deck 52');
    assertEqual(d.ladderCards.length, 8, 'ladder 8 cards');
    assertEqual(d.rSpinOverride, null, 'no spin override (pristine)');
  });
  it('is deterministic for a seed and re-derivable card-for-card', () => {
    assertDeepEqual(buildDeal(12345), buildDeal(12345), 'same seed → identical deal');
    assert(JSON.stringify(buildDeal(1)) !== JSON.stringify(buildDeal(2)), 'different seeds differ');
  });
});

// Restore the real shuffle, the test-seed flag, and a clean DEAL for the suites that follow.
sndShuffle = _engRealShuffle;
_restoreDEAL();
if (_engSavedSeedFlag === null) _ls.removeItem('gambdle_use_test_seed');
else _ls.setItem('gambdle_use_test_seed', _engSavedSeedFlag);
