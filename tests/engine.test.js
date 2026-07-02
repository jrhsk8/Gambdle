// ─── Replay Engine tests ──────────────────────────────────────────────────────
// The engine (src/engine.js) recomputes a Run's score from the seed and transcript. The
// strongest check is equivalence: drive the real game functions (which consume the deck and
// record history exactly as a player would), then assert replayRun() lands on the same chips
// as recalcChips(), without predicting any outcome. That way the thing under test is the
// engine's independent deck reconstruction. Targeted unit tests then pin down the subtle paths
// (a player blackjack that still draws the dealer, Double Ball, the Ladder outcomes) and the
// legality rejections.

// ─── Setup ──────────────────────────────────────────────────────────────────
const _engSavedSeedFlag = _ls.getItem('gambdle_use_test_seed');
_ls.setItem('gambdle_use_test_seed', '1'); // deterministic TEST_CARD_OVERRIDE deal (getRngSeed()===1)

// bjDeal/uthDeal flip to the 'play' phase inside the sndShuffle callback, which the real audio defers
// (setTimeout / audio 'ended'). Drive it synchronously so the deal completes in-line; restored below.
const _engRealShuffle = sndShuffle;
sndShuffle = cb => { if(cb) cb(); };

function _clone(x){ return JSON.parse(JSON.stringify(x)); }
function _freshDeal(){ return genDeal(); }            // pristine DEAL (test overrides applied, no play mutation)
function _restoreDEAL(){ Object.assign(DEAL, genDeal()); } // bj_first_ace mutates DEAL in place; reset between tests

function _resetRun(){
  _restoreDEAL();
  S.screen='intro'; S.chips=START_CHIPS; S.tx=[];
  S.bjHand=0; S.bjPhase='bet'; S.bjBet=0; S.bjPlayer=[]; S.bjDealer=[]; S.bjResult=null; S.bjHistory=[]; S.bjIdx=0;
  S.bjDeck2=null; S.bjDeck2Idx=0; S.bjCandidates=null; // Double Vision: clear the fresh per-hand deck between runs
  S.bjSplit=false; S.bjSplitHands=[]; S.bjSplitActive=0; S.bjSplitBets=[]; S.bjSplitResults=[]; S.bjSplitDone=[];
  S.bjDoubled=false; S.bjSplitDoubled=[]; S.bjActed=false; S.bjDealerReveal=false; S.bjCelebrating=false;
  S.uthHand=0; S.uthPhase='bet'; S.uthAnte=0; S.uthRaise=0; S.uthRaiseMult=0; S.uthRaised=false; S.uthFolded=false;
  S.uthHole=[]; S.uthDealer=[]; S.uthComm=[]; S.uthPrivate=null; S.uthRevealComm=0; S.uthPrevRevealComm=0; S.uthHistory=[];
  S.uthRedealPtr=27; S.timeTravelUsed=false;
  S.ladPhase='bet'; S.ladBet=0; S.ladFree=false; S.ladIdx=0; S.ladRung=0; S.ladResult=null;
  S.rPhase='bet'; S.rBets=[]; S.rBet=0; S.rPick=null; S.rResult=null; S.rSpin=null; S.rSpin2=null; S.rReSpun=false; S.rSpinAcq=null; S.rUnverified=false;
  S.borrowUsed=false; S.borrowAmount=0; S.borrowReturnScreen=null; S.pcPick=null; S.forcedMod=null; S.peeksUsed=0; S.peekAt=null;
  _bjResolving=false;
}

// Resolved modifier object the way getMod sees it: forcedMod can be a preset key or {} for none.
function _modsFor(modKey){ S.forcedMod = modKey; return _activeMod() || {}; }

// ─── Drive helpers (real game functions, resolution forced synchronously) ──────
// BJ: deal + a list of 'hit'|'stand'|'double', then settle via bjResolve(true) (it draws the
// dealer itself, exactly like the timer path does). Naturals skip the action loop.
function _driveBJ(bet, actions, pick=0){
  S.bjBet=bet; S.bjPhase='bet';
  bjDeal();
  if(S.bjPhase==='pick'){ _bjResolving=false; bjPickHand(pick); } // Double Vision: keep a candidate hand
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

// BJ split: split the opening pair, then play each sub-hand. `plan` is an array of arrays: one
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
    if(S.bjSplitActive===prevActive && S.bjPhase==='play'){ break; } // same hand still acting, shouldn't happen
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
    else if(a.a==='raise') uthPlaceRaise(a.mult);
    else if(a.a==='fold') uthFold();
    else if(a.a==='timetravel') doTimeTravel();
  }
  // A raise commits to showdown; the player advances the remaining streets via uthNextStreet.
  // That step is not logged to the transcript: the engine infers the showdown from the raise alone.
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
describe('engine: BJ equivalence', () => {
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
    // TEST_CARD_OVERRIDE hand 0 deals the player a pair of 8s: split, stand both sub-hands.
    _driveBJSplit(100, [['stand'],['stand']]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'split replay chips');
  });

  it('a split hand WITH a hit replays identically (regression: seed not passed into _replayBJSplit)', () => {
    // 2026-07-01: every split+hit transcript threw ReferenceError in replay because
    // _replayBJSplit's beforeHit read `seed` without it being passed in, and no equivalence
    // test hit a split sub-hand, so the suite stayed green. This test covers that case.
    _resetRun(); const mods=_modsFor({});
    _driveBJSplit(100, [['hit','stand'],['stand']]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'split+hit replay chips');
  });

  it('skips a stray action recorded the beat a natural settles (regression: 2026-06-26 race)', () => {
    // Old clients could log a tap landing as the natural auto-settled; the engine used to hard-reject
    // (bj_act_after_natural). Skipping mirrors the ended-hand convention: the natural's settle is the
    // outcome either way, and a run where the action really did something still surfaces as a chip
    // mismatch. Player A,K = natural; dealer 9,7 draws the 5 to 21; natural still wins 3:2.
    const deal = { bjShoe: [{r:'A',s:'♠'},{r:'K',s:'♥'},{r:'9',s:'♦'},{r:'7',s:'♣'},{r:'5',s:'♥'}],
                   pokerDecks: [], uthDeck: [], ladderCards: [], rSpinOverride: null };
    const out = replayRun(1, {}, [
      {g:'bj',a:'deal',h:0,bet:100}, {g:'bj',a:'stand',h:0,s:0},
    ], { deal });
    assertEqual(out.chips, 1150, 'natural pays 3:2 despite the stray stand');
  });

  it('bj_two_hands (Double Vision) fresh-deck deal + pick replays identically', () => {
    _resetRun(); const mods=_modsFor('bj_two_hands');
    // Each hand deals two candidate hands from a fresh per-hand deck (the shared shoe is untouched);
    // keep one, then play. Pick different candidates across the hands and exercise hit/stand/double.
    _driveBJ(100, ['stand'], 0);
    _driveBJ(100, ['hit','stand'], 1);
    _driveBJ(100, ['double'], 0);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'Double Vision replay chips == recalcChips');
    assertEqual(out.g1Net, gameNet('bj'), 'g1Net == bj net');
  });
});

// ─── Equivalence: UTH ─────────────────────────────────────────────────────────
describe('engine — UTH equivalence', () => {
  it('check/raise/fold across three hands replays identically', () => {
    _resetRun(); const mods=_modsFor({});
    _driveUTH(100,[{a:'check'},{a:'check'},{a:'raise',mult:1}]); // check to turn, then play 1x
    _driveUTH(100,[{a:'raise',mult:3}]);                          // preflop 3x, straight to showdown
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

  it('uth_sixth_card (Sixth Sense) private tail card replays identically', () => {
    _resetRun(); const mods=_modsFor('uth_sixth_card');
    // The private 6th community card (deck tail 27+) joins the PLAYER pool only; the dealer is unchanged.
    // Flop raise is 2x; the street graph rejects the impossible 1x this test used to sneak past the UI.
    _driveUTH(100,[{a:'raise',mult:3}]); _driveUTH(100,[{a:'check'},{a:'raise',mult:2}]); _driveUTH(100,[{a:'fold'}]);
    const {expected,out}=_replayOf(mods);
    assertEqual(out.chips, expected, 'Sixth Sense replay chips == recalcChips');
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
describe('engine: player blackjack draws the dealer (within its own segment)', () => {
  const C = (r,s) => ({r,s:{s:'♠',h:'♥',d:'♦',c:'♣'}[s]});
  it('scores blackjack and draws the dealer without shifting the independent next hand', () => {
    // 30-card shoe, segment size = floor(30/3) = 10, so hand 0 draws from [0,10) and hand 1 from
    // [10,20), independent of each other.
    // Hand 0: player A,K (blackjack) vs dealer 9,7 (=16, must draw idx4 = 5 → 21). That dealer draw is
    // consumed INSIDE hand 0's segment and does NOT reach hand 1. Hand 1 (segment start idx10): player
    // 10,6 vs dealer Q,2 (=12, draws idx14 = 8 → 20).
    const shoe = Array(30).fill(C('2','s'));
    [C('A','s'),C('K','d'),C('9','h'),C('7','c'),C('5','s')].forEach((c,i) => shoe[i] = c);      // hand 0
    [C('10','d'),C('6','h'),C('Q','c'),C('2','s'),C('8','d')].forEach((c,i) => shoe[10 + i] = c); // hand 1
    const deal = { bjShoe: shoe, pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    const tx = [ {g:'bj',a:'deal',h:0,bet:100},
                 {g:'bj',a:'deal',h:1,bet:100}, {g:'bj',a:'stand',h:1,s:0} ];
    const out = replayRun(20260620, {}, tx, { deal: _clone(deal) }); // seed at/after cutover: per-hand segments
    // Hand 0: blackjack +150 (the dealer draw never changes a blackjack win). Hand 1: player 16 stands
    // vs dealer 20 → -100. Net +50.
    assertEqual(out.chips, START_CHIPS + 150 - 100, 'blackjack +150; independent hand 1 loses 100');
  });
});

// ─── Targeted: roulette spin modifiers ────────────────────────────────────────
describe('engine: roulette spin mapping', () => {
  it('Double Ball pays when either pocket hits', () => {
    // No override, so words map straight through. r_double_ball gives a second distinct pocket.
    const deal = { bjShoe:[], pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    const words = [3, 9, 1, 0]; // n = 3%37 = 3; n2 = (3+1+(1%36))%37 = 5
    const mods = { r_double_ball: true };
    const tx = [ {g:'r',a:'spin',bets:[[5,100]],respin:false} ]; // bet on pocket 5, wins via the 2nd ball
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
describe('engine: legality rejection', () => {
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
  it('skips (not rejects) an action recorded after a natural: the settle stands', () => {
    // Was a hard bj_act_after_natural rejection; relaxed 2026-07-01 to the ended-hand skip
    // convention (see _replayBJHand) after 12 honest celebration-race flags on 2026-06-26.
    // The stray hit draws nothing and moves nothing: the natural still pays 3:2.
    const deal = { bjShoe:[{r:'A',s:'♠'},{r:'K',s:'♦'},{r:'2',s:'♥'},{r:'7',s:'♣'},{r:'9',s:'♠'}],
                   pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null };
    const out = replayRun(1, {}, [{g:'bj',a:'deal',h:0,bet:100},{g:'bj',a:'hit',h:0,s:0}], { deal });
    assertEqual(out.chips, 1150, 'natural settle unchanged by the stray hit');
  });
  it('rejects a second borrow', () => {
    rejects('double_borrow', () => replayRun(1, {}, [{g:'sys',a:'borrow',amt:50},{g:'sys',a:'borrow',amt:50}], {}));
  });
  it('rejects a forged Double-Vision pick on a non-mod day', () => {
    // A 'pick' event is only legal under bj_two_hands; on an ordinary hand it's an illegal action.
    rejects('bj_bad_pick', () => replayRun(1, {}, [{g:'bj',a:'deal',h:0,bet:100},{g:'bj',a:'pick',h:0,s:0}], { deal: emptyDeal() }));
  });
  it('tolerates a trailing no-op action after a bust (skips it, consumes no shoe card)', () => {
    // player 10,10 = 20; hits a 10 -> 30 bust; dealer 5,6 draws K -> 21. A trailing 'stand' logged the
    // same frame the bust auto-advanced must be ignored, not rejected, and must not shift the deck.
    const mk = () => ({ bjShoe:[{r:'10',s:'♦'},{r:'10',s:'♠'},{r:'5',s:'♣'},{r:'6',s:'♥'},{r:'10',s:'♥'},{r:'K',s:'♦'}],
                        pokerDecks:[], uthDeck:[], ladderCards:[], rSpinOverride:null });
    const base = [{g:'bj',a:'deal',h:0,bet:100},{g:'bj',a:'hit',h:0,s:0}];
    const noTrailing = replayRun(1, {}, base, { deal: mk() });
    const withTrailing = replayRun(1, {}, [...base, {g:'bj',a:'stand',h:0,s:0}], { deal: mk() });
    assertEqual(withTrailing.chips, noTrailing.chips, 'trailing action is a no-op for the score');
  });
  it('rejects a roulette spin with no stored words', () => {
    rejects('r_no_words', () => replayRun(1, {}, [{g:'r',a:'spin',bets:[[5,100]],respin:false}], { deal: emptyDeal() }));
  });
  it('rejects a ladder cash-out before any rung is climbed', () => {
    const deal = { bjShoe:[], pokerDecks:[], uthDeck:[], ladderCards:[{r:'5',s:'♠'},{r:'9',s:'♦'}], rSpinOverride:null };
    rejects('lad_cash_norung', () => replayRun(1, {}, [{g:'lad',a:'stake',v:100},{g:'lad',a:'cash'}], { deal }));
  });
  it('rejects a UTH ante above the floor(2/3) cap even when it fits the stack', () => {
    // START_CHIPS=1000, so maxFor('uth',1000)=666. An ante of 700 fits the stack but exceeds the cap
    // the live bet UI enforces, so the Engine must reject it (it would otherwise replay as legal).
    rejects('uth_overbet', () => replayRun(1, {}, [{g:'uth',a:'deal',h:0,ante:700}], { deal: emptyDeal() }));
  });
  it('rejects a UTH raise whose mult is illegal for the street the engine derives', () => {
    // UTH_STREET_GRAPH (uth.js) only ever offers 2x on the flop (preflop is 4x/3x, turn is 1x), so a
    // 1x flop raise is a mult the live buttons could never produce. Allowing it would let a player
    // submit a lower-variance raise than the game actually offers. The engine derives the street
    // from its own event walk (one check means flop), never from the transcript's `st` claim, so a
    // forged `st` can't make an illegal mult look legal.
    rejects('uth_bad_mult', () => replayRun(1, {}, [
      {g:'uth',a:'deal',h:0,ante:100}, {g:'uth',a:'check',h:0,st:'preflop'},
      {g:'uth',a:'raise',h:0,mult:1,st:'flop'},
    ], { deal: emptyDeal() }));
    // And the forged-st variant: claiming st:'turn' (where 1x IS legal) must not launder a 1x raise
    // that actually happened on the flop (only one check consumed, so the engine says flop).
    rejects('uth_bad_mult', () => replayRun(1, {}, [
      {g:'uth',a:'deal',h:0,ante:100}, {g:'uth',a:'check',h:0,st:'preflop'},
      {g:'uth',a:'raise',h:0,mult:1,st:'turn'},
    ], { deal: emptyDeal() }));
  });
  it('accepts the legal mult for the same street', () => {
    // Sanity check that uth_bad_mult isn't over-firing: 2x on the flop is legal and must replay
    // through to showdown (a real 52-card deck, so bestOf7 has real hands to evaluate).
    const deal = { bjShoe:[], pokerDecks:[], uthDeck: shuffle(buildDeck(), mkRng(1)), ladderCards:[], rSpinOverride:null };
    const out = replayRun(1, {}, [
      {g:'uth',a:'deal',h:0,ante:100}, {g:'uth',a:'check',h:0,st:'preflop'},
      {g:'uth',a:'raise',h:0,mult:2,st:'flop'},
    ], { deal });
    assert(Number.isFinite(out.chips), 'a legal flop raise mult replays without rejection');
  });
});

// ─── auditOutcome ───────────────────────────────────────────────────────────────
describe('engine: auditOutcome', () => {
  it('recomputes each recorded round to its stored delta', () => {
    _resetRun(); const mods=_modsFor({});
    _driveBJ(100,['stand']); _driveBJ(120,['hit','stand']);
    _driveUTH(100,[{a:'check'},{a:'raise',mult:2}]);
    const deal=_freshDeal();
    for(const r of S.bjHistory) if(r.result!=='split') assertEqual(auditOutcome(r, deal, mods), r.delta, 'bj round audits to its delta');
    for(const r of S.uthHistory) assertEqual(auditOutcome(r, deal, mods), r.delta, 'uth round audits to its delta');
  });
});

// ─── buildDeal ────────────────────────────────────────────────────────────────
describe('engine: buildDeal', () => {
  it('produces the documented Deal shape with the extended BJ shoe', () => {
    const d = buildDeal(1);
    assert(Array.isArray(d.bjShoe) && d.bjShoe.length === 104 + 104, 'bjShoe = base 104 + tail 104');
    assertEqual(d.pokerDecks.length, 3, '3 poker decks');
    assertEqual(d.uthDeck.length, 52, 'uth deck 52');
    assertEqual(d.ladderCards.length, 8, 'ladder 8 cards');
    assertEqual(d.rSpinOverride, null, 'no spin override (pristine)');
  });
  it('is deterministic for a seed and re-derivable card-for-card', () => {
    assertDeepEqual(buildDeal(12345), buildDeal(12345), 'same seed produces an identical deal');
    assert(JSON.stringify(buildDeal(1)) !== JSON.stringify(buildDeal(2)), 'different seeds differ');
  });
});

// ─── config horizon (enforce gate) ──────────────────────────────────────────────
// submit-score only treats the replay as authoritative for seed <= replayConfigHorizon(), so a day
// whose DAILY_* config isn't in the deployed bundle can never mass-reject honest players.
describe('engine: config horizon', () => {
  it('returns the max calendar-seed across both day-config tables', () => {
    const keys = [...Object.keys(DAILY_MODIFIERS), ...Object.keys(DAILY_SEED_OVERRIDES)].map(Number);
    assertEqual(replayConfigHorizon(), Math.max(...keys), 'horizon = furthest configured day');
  });
  it('looks like a YYYYMMDD seed at or beyond launch', () => {
    const h = replayConfigHorizon();
    assert(Number.isInteger(h) && h >= 20260505, 'horizon is a calendar seed >= day 1');
    assert(DAILY_MODIFIERS[h] !== undefined || DAILY_SEED_OVERRIDES[h] !== undefined,
      'the horizon day actually has a config entry');
  });
});

// Restore the real shuffle, the test-seed flag, and a clean DEAL for the suites that follow.
sndShuffle = _engRealShuffle;
_restoreDEAL();
if (_engSavedSeedFlag === null) _ls.removeItem('gambdle_use_test_seed');
else _ls.setItem('gambdle_use_test_seed', _engSavedSeedFlag);
