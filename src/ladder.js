// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   THE LADDER LOGIC: LADDER_MULTS · ladRankVal/ladCallCorrect (ties lose) ·
//     ladPotAt pot math · ladStakeCommit / ladCall / ladCashOut / _ladSettle ·
//     resetLadderRun
//   THE LADDER RENDER: screenLadder (fixed zones), zone helpers, surgical
//     mid-run updates
// ───────────────────────────────────────────────────────────────────────────

// ─── THE LADDER LOGIC ─────────────────────────────────────────
// Hi-lo streak climb. One shared seeded 8-card sequence per day
// (DEAL.ladderCards: 1 face-up start + up to 7 calls). Each correct call
// climbs a rung of the fixed multiplier ladder; a wrong call OR A TIE crashes
// the run. Cash out any time from rung 1. On ladder_free mod days the entry
// is house money: crash costs nothing, cash out keeps the full pot.

const LADDER_MULTS = [1.5, 2.2, 3.2, 5, 8, 13, 21];

// Rank order for hi-lo: RANKS is already ordered 2..A, so the index is the value (A high).
function ladRankVal(r){ return RANKS.indexOf(r); }

// True when the call wins. Equal ranks lose regardless of direction (ties lose).
function ladCallCorrect(cur, next, dir){
  const c = ladRankVal(cur.r), n = ladRankVal(next.r);
  if (n === c) return false;
  return dir === 'hi' ? n > c : n < c;
}

// Pot after `rung` correct calls. Always rounded from the original stake so
// multipliers never compound rounding error.
function ladPotAt(stake, rung){ return rung === 0 ? stake : Math.round(stake * LADDER_MULTS[rung - 1]); }

// Max standalone stake: 25% of stack (min 25, never above the stack itself).
// The rule lives in the pure bet-intake core (bet.js); this just feeds it the live stack.
function ladMaxStake(){ return ladderMaxStake(S.chips); }

// Commits the stake and starts the climb. On ladder_free mod days the entry is
// locked to the mod value (house money — S.ladFree). Standalone stakes must be
// within [25, ladMaxStake()].
function ladStakeCommit(){
  if (S.ladPhase !== 'bet') return;
  const free = getMod('ladder_free');
  if (free) { S.ladBet = free; S.ladFree = true; }
  if (!S.ladFree && (S.ladBet < 25 || S.ladBet > ladMaxStake())) return;
  txLog({g:'lad', a:'stake', v:S.ladBet});
  S.ladPhase = 'climb'; S.ladIdx = 0; S.ladRung = 0;
  saveState();
  _ladAfterAction('chips');
}

// One higher/lower call against the next card in the shared sequence.
function ladCall(dir){
  if (S.ladPhase !== 'climb') return;
  const cur = DEAL.ladderCards[S.ladIdx], next = DEAL.ladderCards[S.ladIdx + 1];
  txLog({g:'lad', a:dir});
  if (ladCallCorrect(cur, next, dir)) {
    S.ladRung++; S.ladIdx++;
    if (S.ladRung >= LADDER_MULTS.length) { _ladSettle('top'); return; }
    saveState();
    _ladAfterAction('card');
  } else {
    S.ladIdx++; // advance so the killer card is the one on display
    _ladSettle('crash');
  }
}

function ladCashOut(){
  if (S.ladPhase !== 'climb' || S.ladRung < 1) return;
  txLog({g:'lad', a:'cash'});
  _ladSettle('cash');
}

// Pure Ladder Resolver: the chip outcome of a settled run. (outcome, bet, rung, free) → {delta,
// result}. No S, no DOM, no credit. Free entry: a crash costs nothing and a non-crash keeps the full
// pot; a staked run risks the bet (crash loses it, cash-out/top nets pot − bet).
function resolveLadder(outcome, bet, rung, free){
  const pot = ladPotAt(bet, rung);
  const delta = outcome === 'crash' ? (free ? 0 : -bet)
                                    : (free ? pot : pot - bet);
  return { delta, result: outcome };
}

// Credit-from-result for the settled Ladder run — the ONE mapping shared by the live settle
// (_ladSettle) and the replay Engine. A positive delta credits the net, a negative delta debits it.
// `acct` is an Accountant (liveAcct live, the Engine's _engAcct in replay).
/** @param {Accountant} acct */
function ladderAward(acct, delta){ if(delta>0) acct.credit(delta,'ladder'); else if(delta<0) acct.debit(-delta,'ladder'); }

// Ends the run: applies the chip delta and records ladResult for recalcChips,
// the results screen, and the share text. Free entry: crash costs nothing,
// cash out keeps the full pot.
function _ladSettle(outcome){
  const { delta } = resolveLadder(outcome, S.ladBet, S.ladRung, S.ladFree);
  ladderAward(liveAcct(), delta);
  S.ladResult = mkOutcome('lad', delta, outcome, { rung: S.ladRung, free: S.ladFree });
  S.ladPhase = 'done';
  saveState();
  // Cash out is a money event (chips); crash/top reveal a card (card sound).
  _ladAfterAction(outcome === 'cash' ? 'chips' : 'card');
}

// Post-action repaint: surgical zone updates when the screen is live, full
// render as fallback. Guarded so logic-only unit tests (no DOM screen) skip it.
// `snd`: 'chips' for stake/cash-out money events, 'card' when a card after the first
// is revealed (climb / crash / top) — delayed so it lands like a dealt card.
function _ladAfterAction(snd){
  if (typeof document === 'undefined' || S.screen !== 'ladder' || typeof render !== 'function') return;
  if (snd === 'card' && typeof sndCard === 'function') sndCard(120);
  else if (snd === 'chips' && typeof sndChip === 'function') sndChip();
  // Surgical repaint of the six zones (no full render mid-run — no flash, fixed layout); patchZones
  // rebuilds from S via render() if any zone is missing.
  const zones = { [DOM.ladHead]:_ladHeadHTML, [DOM.ladStrip]:_ladStripHTML, [DOM.ladRead]:_ladReadoutHTML,
                  [DOM.ladCards]:_ladCardsHTML, [DOM.ladMsg]:_ladMsgHTML, [DOM.ladAct]:_ladActionsHTML };
  if (patchZones(zones, { noAnim: true })) updateChipDisplay();
}

function resetLadderRun(){
  S.ladPhase = 'bet'; S.ladBet = 0; S.ladFree = false;
  S.ladIdx = 0; S.ladRung = 0; S.ladResult = null;
}

// ─── THE LADDER RENDER ────────────────────────────────────────
// Fixed skeleton: six zones with stable ids and constant min-heights so nothing
// moves between phases — only zone contents swap (see styles.css .lad-*).

GAMES.ladder.screen = screenLadder; // register into the Game registry (defined just below; core.js loads first)
function screenLadder(){
  const free = getMod('ladder_free');
  // Free-entry days lock the displayed stake to the house's entry.
  if (free && S.ladPhase === 'bet') { S.ladBet = free; }
  return `${hdr('The Ladder')}
  <div class="panel" style="text-align:center">
    <div id="${DOM.ladHead}" class="lad-head">${_ladHeadHTML()}</div>
    <div id="${DOM.ladStrip}" class="lad-strip">${_ladStripHTML()}</div>
    <div id="${DOM.ladRead}" class="lad-read">${_ladReadoutHTML()}</div>
    <div id="${DOM.ladCards}" class="lad-cards">${_ladCardsHTML()}</div>
    <div id="${DOM.ladMsg}" class="lad-msg">${_ladMsgHTML()}</div>
    <div id="${DOM.ladAct}" class="lad-act">${_ladActionsHTML()}</div>
  </div>`;
}

function _ladHeadHTML(){
  if (S.ladPhase === 'done' && S.ladResult) {
    return { crash: `<span class="lad-hl lad-hl-bad">${icon('x-circle',{fill:true})} CRASHED!</span>`,
             cash:  `<span class="lad-hl lad-hl-good">${icon('coins',{fill:true})} CASHED OUT!</span>`,
             top:   `<span class="lad-hl lad-hl-good">${icon('crown',{fill:true})} TOP OF THE LADDER!</span>` }[S.ladResult.result];
  }
  return `<span class="lad-hl">THE LADDER</span>`;
}

function _ladStripHTML(){
  const crashed = S.ladResult?.result === 'crash';
  return LADDER_MULTS.map((m, i) => {
    const rung = i + 1;
    let cls = 'lad-rung';
    if (rung <= S.ladRung) cls += ' done';
    else if (crashed && rung === S.ladRung + 1) cls += ' crash';
    else if (S.ladPhase !== 'done' && rung === S.ladRung + 1) cls += ' next';
    const label = (crashed && rung === S.ladRung + 1) ? '✕' : `×${m}`;
    return `<span class="${cls}">${label}</span>`;
  }).join('');
}

function _ladReadoutHTML(){
  const pot = ladPotAt(S.ladBet, S.ladRung);
  // Every phase shows two side-by-side boxes (fixed equal size so they never shift
   // between phases). Content is wrapped in a span so it wraps cleanly (label over
   // value) and the space after the colon isn't collapsed by the flex box.
  const box = (a, b) => `<div class="lad-read-box"><span>${a}</span></div><div class="lad-read-box"><span>${b}</span></div>`;
  if (S.ladPhase === 'bet') {
    return S.ladFree || getMod('ladder_free')
      ? box(`Stack: <b>${fmt(S.chips)}</b>`, `Entry: <b class="lad-gold">FREE ${fmt(getMod('ladder_free')||S.ladBet)}</b>`)
      : box(`Stack: <b>${fmt(S.chips)}</b>`, `Max bet: <b>${fmt(ladMaxStake())}</b>`);
  }
  if (S.ladPhase === 'climb') {
    const next = ladPotAt(S.ladBet, S.ladRung + 1);
    return box(`Pot: <b>${fmt(pot)}</b>`, `Next rung: <b>${fmt(next)}</b>`);
  }
  const r = S.ladResult;
  if (r.result === 'crash') {
    return r.free ? box(`Free entry`, `<b>+0 chips</b>`)
                  : box(`Bet lost`, `<b class="lad-bad">${sign(r.delta)} chips</b>`);
  }
  return box(`Pot: <b>${fmt(ladPotAt(S.ladBet, r.rung))}</b>`, `<b class="lad-good">${sign(r.delta)} chips</b>`);
}

function _ladCardsHTML(){
  const cards = DEAL.ladderCards;
  const crashed = S.ladResult?.result === 'crash';
  // After a crash ladIdx sits on the killer card; show the pair that ended it.
  const cur = crashed ? cards[S.ladIdx - 1] : cards[S.ladIdx];
  const right = crashed ? cardHTML(cards[S.ladIdx], 'md', '', 0, false)
                        : cardHTML('back', 'md');
  return cardHTML(cur, 'md', '', 0, false) + right;
}

function _ladMsgHTML(){
  if (S.ladPhase === 'bet')  return `Higher or lower? Cash out any time. <b class="lad-bad">Ties lose.</b>`;
  if (S.ladPhase === 'climb') return `Rung ${S.ladRung + 1} of ${LADDER_MULTS.length + 1} · <b class="lad-bad">Ties lose.</b>`;
  const r = S.ladResult;
  if (r.result === 'crash') {
    const a = DEAL.ladderCards[S.ladIdx - 1], b = DEAL.ladderCards[S.ladIdx];
    const why = a && b && a.r === b.r ? `${a.r} matched ${b.r}. Ties lose.` : `Wrong call.`;
    return `${why} Crashed on rung ${r.rung + 1}.`;
  }
  if (r.result === 'top') return `All ${LADDER_MULTS.length} rungs. ×${LADDER_MULTS[LADDER_MULTS.length-1]} your bet.`;
  return `You climbed ${r.rung} rung${r.rung===1?'':'s'} for ${LADDER_MULTS[r.rung-1]}x profit.`;
}

function _ladActionsHTML(){
  if (S.ladPhase === 'bet') {
    const free = getMod('ladder_free');
    if (free) {
      return `<div class="lad-chips-locked">${chipSel(free, free)}</div>
      <button id="${DOM.dealBtn}" class="btn-gold lad-btn-big" onclick="ladStakeCommit()">Free Entry · ${fmt(free)} →</button>`;
    }
    const valid = S.ladBet >= 25 && S.ladBet <= ladMaxStake();
    return `${chipSel(maxBet(), S.ladBet)}
    <button id="${DOM.dealBtn}" class="btn-gold lad-btn-big" onclick="ladStakeCommit()" ${valid?'':'disabled'}>Climb →</button>`;
  }
  if (S.ladPhase === 'climb') {
    const pot = ladPotAt(S.ladBet, S.ladRung);
    return `<div class="lad-call-row">
      <button class="btn-gold lad-call" onclick="ladCall('hi')">▲ Higher</button>
      <button class="btn-gold lad-call" onclick="ladCall('lo')">▼ Lower</button>
    </div>
    <button class="btn-gold lad-btn-big" onclick="ladCashOut()" ${S.ladRung<1?'disabled':''}>Cash Out · ${fmt(pot)}</button>`;
  }
  // done: advance. Mod-day bonus always goes to results; a slotted game follows NEXT_SCREEN.
  const nxt = NEXT_SCREEN['ladder'];
  const target = (!S.ladFree && nxt) ? nxt : 'results';
  const label = target === 'results' ? 'See Final Results →'
              : target === 'roulette' ? 'Final Round: Roulette →'
              : `Round 2: ${GAME_META[target].short} →`;
  return `<div class="lad-call-row">
    <button class="btn-gold lad-call" disabled>▲ Higher</button>
    <button class="btn-gold lad-call" disabled>▼ Lower</button>
  </div>
  ${nextBtn(`advanceTo('${target}')`, label)}`;
}

