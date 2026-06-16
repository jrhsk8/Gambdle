// ─── REPLAY ENGINE (pure, dual-mode) ──────────────────────────────────────────
// Integrity Phase 2's deep module: the ONE place that answers "what should this Run
// score?". It rebuilds the daily Deal from the seed, replays the recorded Transcript
// through the v1.43 pure resolvers (resolveBJHand/Split, resolveUTH, resolveRoulette,
// resolveLadder) + spinFromRandom, re-derives every chip delta under the real rules, and
// validates the legality of each event. The browser calls it and so does the submit-score
// Edge Function, so client and server agree byte-for-byte (see .claude/LEADERBOARD-INTEGRITY.md
// and PRD-integrity-phase-2.md).
//
// PURE: no DOM, no S, no sound, no credit/debit side effects on game state. Inputs in,
// authoritative totals out. The file loads as a plain browser global (script tag, current
// load order) AND as a Deno ESM import via the guarded shim at the bottom — no build step.
//
// replayRun(seed, modifiers, transcript, opts) → { chips, g1Net, g2Net, rNet, ladNet }
//   seed       — the RNG seed (what mkRng/buildDeal consume; the server resolves overrides first)
//   modifiers  — the day's RESOLVED modifier preset object (Player's Choice already applied), or
//                null/{} for a vanilla day. Read via a key→value accessor, exactly like getMod.
//   transcript — S.tx: the flat append-only event log (see txLog / LEADERBOARD-INTEGRITY.md §2)
//   opts.deal       — a pre-built Deal (defaults to buildDeal(seed)); tests pass a clean clone of
//                     DEAL so the test-seed overrides line up.
//   opts.spinWords  — { 0:[w,w,w,w], 1:[…] }: the crypto words the `spin` Edge Function stored,
//                     keyed by idx (0 = main spin, 1 = re-spin). Required for roulette spins.
//
// Determinism gotchas pinned here (any drift = a replay mismatch): identical RNG draw order
// (buildDeal is frozen), same Math.round in credit/debit, same modifier-application order, the
// bj_first_ace shoe swap, a player blackjack STILL draws the dealer to 17+ (consumes the shoe),
// the deck-tail consumers (Time Travel via the recorded street, Triple Threat's 3rd hole card,
// uth_three_hole), and the Ladder run (free crash = +0, cash-out keeps the full pot, ties lose).

// An illegal or forged event aborts the whole Run — the server rejects it. `.replayReason` carries
// a short machine code (e.g. 'bj_overbet') for logging; the message is human-readable.
function _replayFail(reason){
  const e = new Error('replay rejected: ' + reason);
  e.replayReason = reason;
  throw e;
}

// Modifier accessor over a resolved preset object, mirroring getMod's "missing key → null".
function _engMod(modifiers){
  return key => (modifiers && modifiers[key] !== undefined ? modifiers[key] : null);
}

// Running-balance win multiplier, mirroring winMult(): all_in_or_skip always doubles wins;
// comeback doubles them only while the stack is under 1000. `chips` is the live balance at the
// moment of resolution (after the stake was debited), exactly as the in-page winMult() reads S.chips.
function _engWinMult(mod, chips){
  if(mod('all_in_or_skip')) return 2;
  if(mod('comeback') && chips < 1000) return 2;
  return 1;
}

// Chip accountant mirroring credit()/debit(): Math.round on every delta, debit floors at 0.
// Tracks the LIVE balance (used only for winMult + legality); the returned score is recomputed
// from the per-slot net sums, matching recalcChips() exactly.
function _engAcct(){
  return {
    chips: START_CHIPS,
    credit(n){ this.chips += Math.round(n); },
    debit(n){ this.chips = Math.max(0, this.chips - Math.round(n)); },
  };
}

// ─── BLACKJACK ────────────────────────────────────────────────────────────────
// Stake debited at deal; on a win/blackjack the shell returns stake+profit, on a push the stake,
// on a loss nothing — exactly bjResolve's credits, derived from the pure resolver's result.
function _engBJCredit(acct, result, bet, delta){
  if(result === 'blackjack' || result === 'win') acct.credit(bet + delta);
  else if(result === 'push') acct.credit(bet);
}

// Replays one Blackjack hand starting at tx[i] (a 'deal' or 'skip'). Returns the cursor past it.
function _replayBJHand(tx, i, deal, mod, acct, addNet, st){
  const dealEv = tx[i];
  if(dealEv.a === 'skip'){ addNet('bj', 0); st.hand++; return i + 1; }
  if(dealEv.a !== 'deal') _replayFail('bj_no_deal');
  const bet0 = dealEv.bet | 0;
  if(bet0 <= 0) _replayFail('bj_bad_bet');
  if(bet0 > acct.chips) _replayFail('bj_overbet');
  acct.debit(bet0);

  const shoe = deal.bjShoe;
  // bj_first_ace: if the next card isn't an Ace, swap the nearest later Ace into its slot (mutates
  // this Deal copy in place, exactly like bjDeal mutates DEAL.bjShoe).
  if(mod('bj_first_ace') && shoe[st.idx] && shoe[st.idx].r !== 'A'){
    const ai = shoe.findIndex((c, k) => k > st.idx && c.r === 'A');
    if(ai !== -1){ const t = shoe[st.idx]; shoe[st.idx] = shoe[ai]; shoe[ai] = t; }
  }
  const player = [shoe[st.idx++], shoe[st.idx++]];
  const dealer = [shoe[st.idx++], shoe[st.idx++]];

  // Gather this hand's action events (consecutive bj events that aren't a new deal/skip).
  let j = i + 1;
  const actions = [];
  while(j < tx.length && tx[j].g === 'bj' && tx[j].a !== 'deal' && tx[j].a !== 'skip'){ actions.push(tx[j]); j++; }

  const stand17 = mod('bj_dealer_stand') || 17;
  const bjMult = mod('bj_payout') || 1.5;
  const pBJ = isBJ(player), dBJ0 = isBJ(dealer);

  // Naturals end the hand before the player can act.
  if(dBJ0 || pBJ){
    if(actions.length) _replayFail('bj_act_after_natural');
    // Dealer blackjack settles on the two up-cards (no draw). A player blackjack with a non-BJ
    // dealer STILL draws the dealer to 17+ (bjResolve does), consuming the shoe — pin that here.
    if(!dBJ0){ let dv = hVal(dealer); while(dv < stand17){ dealer.push(shoe[st.idx++]); dv = hVal(dealer); } }
    const wm = _engWinMult(mod, acct.chips);
    const res = resolveBJHand({ pv: hVal(player), pBJ, dv: hVal(dealer), dBJ: isBJ(dealer), bet: bet0, wm, bjMult, ddm: 1 });
    _engBJCredit(acct, res.result, bet0, res.delta);
    addNet('bj', res.delta); st.hand++;
    return j;
  }

  if(actions.some(ev => ev.a === 'split')){
    return _replayBJSplit(tx, j, deal, mod, acct, addNet, st, { player, dealer, bet0, actions, stand17 });
  }

  // Straight (no-split) play. Once the hand has definitively ended (a stand, a double, or a hit that
  // reached 21+/busted), any further player event is a no-op the replay SKIPS rather than rejects:
  // the outcome is already fixed and no extra card is owed, so honest scores are unchanged. Some
  // clients log an action the same frame an auto-advancing hand ends (e.g. a stand recorded just as a
  // hit busts the hand), and rejecting those would punish a legitimate result. Skipping (not touching
  // `shoe`/`st.idx`) keeps the deck aligned for later games, and a trailing event can't inflate a
  // score, so this never weakens the check. (The split path stays strict · no honest run has hit it.)
  let bet = bet0, doubled = false, ended = false;
  for(const ev of actions){
    if(ended) continue;
    if(ev.a === 'hit'){ player.push(shoe[st.idx++]); if(hVal(player) >= 21) ended = true; }
    else if(ev.a === 'double'){ if(acct.chips < bet) _replayFail('bj_double_nofund'); acct.debit(bet); bet *= 2; doubled = true; player.push(shoe[st.idx++]); ended = true; }
    else if(ev.a === 'stand'){ ended = true; }
    else _replayFail('bj_bad_action');
  }
  let dv = hVal(dealer);
  while(dv < stand17){ dealer.push(shoe[st.idx++]); dv = hVal(dealer); }
  const wm = _engWinMult(mod, acct.chips);
  const ddm = (mod('bj_double_bonus') && doubled) ? 2 : 1;
  const res = resolveBJHand({ pv: hVal(player), pBJ: false, dv, dBJ: isBJ(dealer), bet, wm, bjMult, ddm });
  _engBJCredit(acct, res.result, bet, res.delta);
  addNet('bj', res.delta); st.hand++;
  return j;
}

// Replays a split hand. `j` is the cursor at the first action; init carries the dealt cards + the
// already-collected action list (which begins with the first 'split'). Mirrors the bjSplit /
// bjAdvanceSplit / bjCheckSplitHand deck-consumption state machine, driven by the recorded actions.
function _replayBJSplit(tx, j, deal, mod, acct, addNet, st, init){
  const shoe = deal.bjShoe;
  const { player, dealer, bet0, actions, stand17 } = init;
  // First split: stake a second hand, deal one card to sub-hand 0, sub-hand 1 waits for its 2nd card.
  if(acct.chips < bet0) _replayFail('bj_split_nofund');
  acct.debit(bet0);
  const hands = [[player[0], shoe[st.idx++]], [player[1]]];
  const bets = [bet0, bet0];
  const doubled = [false, false];
  const done = [false, false];
  let active = 0;

  // Advance to the next sub-hand that needs a player action, dealing a waiting sub-hand its 2nd
  // card and auto-resolving any sub-hand that's already 21+ (bjCheckSplitHand auto-advances those).
  const settleToActionable = () => {
    while(true){
      if(hands[active].length === 1) hands[active].push(shoe[st.idx++]);
      if(hVal(hands[active]) < 21) return false;   // player must act
      done[active] = true;
      const next = done.indexOf(false);
      if(next === -1) return true;                  // all sub-hands done → resolve
      active = next;
    }
  };
  const advance = () => {
    done[active] = true;
    const next = done.indexOf(false);
    if(next === -1) return true;
    active = next;
    return settleToActionable();
  };

  let allDone = settleToActionable();

  // The first action is the initial 'split' itself; consume it, then drive the rest.
  for(let k = 0; k < actions.length; k++){
    const ev = actions[k];
    if(k === 0){ if(ev.a !== 'split') _replayFail('bj_split_order'); continue; }
    if(allDone) _replayFail('bj_act_after_end');
    if(ev.a === 'split'){
      // Re-split the active sub-hand into two (max 4 hands total).
      if(hands.length >= 4) _replayFail('bj_resplit_max');
      const bet = bets[active];
      if(acct.chips < bet) _replayFail('bj_resplit_nofund');
      acct.debit(bet);
      const [c0, c1] = hands[active];
      hands.splice(active, 1, [c0, shoe[st.idx++]], [c1]);
      bets.splice(active, 1, bet, bet);
      doubled.splice(active, 1, false, false);
      done.splice(active, 1, false, false);
      allDone = settleToActionable();
    } else if(ev.a === 'hit'){
      hands[active].push(shoe[st.idx++]);
      if(hVal(hands[active]) >= 21) allDone = advance();
    } else if(ev.a === 'double'){
      if(acct.chips < bets[active]) _replayFail('bj_split_double_nofund');
      acct.debit(bets[active]); bets[active] *= 2; doubled[active] = true;
      hands[active].push(shoe[st.idx++]);
      allDone = advance();
    } else if(ev.a === 'stand'){
      allDone = advance();
    } else _replayFail('bj_bad_action');
  }

  // Resolve: draw the dealer once, settle every sub-hand (resolveBJSplitHand has no blackjack branch).
  let dv = hVal(dealer);
  while(dv < stand17){ dealer.push(shoe[st.idx++]); dv = hVal(dealer); }
  const dvFinal = hVal(dealer);
  const wm = _engWinMult(mod, acct.chips);
  const spm = mod('bj_wild_split') ? 2 : 1;
  let total = 0;
  for(let h = 0; h < hands.length; h++){
    const bet = bets[h];
    const ddm = (mod('bj_double_bonus') && doubled[h]) ? 2 : 1;
    const res = resolveBJSplitHand({ pv: hVal(hands[h]), dv: dvFinal, bet, wm, ddm, spm });
    if(res.result === 'win') acct.credit(bet + res.delta);
    else if(res.result === 'push') acct.credit(bet);
    total += res.delta;
  }
  addNet('bj', total); st.hand++;
  return j;
}

// ─── ULTIMATE TEXAS HOLD'EM ─────────────────────────────────────────────────────
// Replays one UTH hand starting at tx[i] (a 'deal' or 'skip'). Returns the cursor past it.
function _replayUTHHand(tx, i, deal, mod, acct, addNet, st, seed){
  const dealEv = tx[i];
  if(dealEv.a === 'skip'){ addNet('uth', 0); st.hand++; return i + 1; }
  if(dealEv.a !== 'deal') _replayFail('uth_no_deal');
  const ante = dealEv.ante | 0;
  if(ante <= 0) _replayFail('uth_bad_ante');
  if(ante > acct.chips) _replayFail('uth_overbet');
  acct.debit(ante);

  // Deal hole / dealer / community, mirroring uthDeal (incl. uth_pocket_aces and uth_three_hole).
  let hole, dealer, comm;
  if(mod('uth_pocket_aces')){
    const hr = mkRng(seed + (st.hand + 1) * 97);
    const d = shuffle(buildDeck(), hr);
    const aces = [], rest = [];
    for(const c of d) (c.r === 'A' && aces.length < 2 ? aces : rest).push(c);
    hole = aces; dealer = [rest[0], rest[1]]; comm = rest.slice(2, 7);
  } else {
    const dk = deal.uthDeck, off = st.hand * 9;
    hole = [dk[off], dk[off + 1]];
    if(mod('uth_three_hole')) hole.push(dk[27 + st.hand]); // Triple Threat's 3rd hole card from the tail
    dealer = [dk[off + 2], dk[off + 3]];
    comm = [dk[off + 4], dk[off + 5], dk[off + 6], dk[off + 7], dk[off + 8]];
  }
  const antePortion = Math.ceil(ante / 2), blindPortion = Math.floor(ante / 2);

  let play = 0, raised = false;
  let j = i + 1;
  while(j < tx.length && tx[j].g === 'uth' && tx[j].a !== 'deal' && tx[j].a !== 'skip'){
    const ev = tx[j];
    if(ev.a === 'fold'){
      // Fold forfeits ante + blind (stake stays debited); play is never committed before a fold.
      addNet('uth', -(antePortion + blindPortion)); st.hand++;
      return j + 1;
    } else if(ev.a === 'timetravel'){
      // Re-deal the recorded street's community cards from the deck tail (uthRedealPtr). The street
      // comes from ev.st — robust regardless of whether the player had already raised.
      if(st.ttUsed) _replayFail('uth_tt_twice');
      if(ev.st !== 'flop' && ev.st !== 'turn') _replayFail('uth_tt_phase');
      st.ttUsed = true;
      let ptr = st.redealPtr;
      if(ev.st === 'flop'){ comm[0] = deal.uthDeck[ptr++]; comm[1] = deal.uthDeck[ptr++]; comm[2] = deal.uthDeck[ptr++]; }
      else { comm[3] = deal.uthDeck[ptr++]; comm[4] = deal.uthDeck[ptr++]; }
      st.redealPtr = ptr;
    } else if(ev.a === 'raise'){
      if(raised) _replayFail('uth_double_raise');
      const mult = ev.mult | 0;
      const bet = antePortion * mult;
      if(acct.chips < bet) _replayFail('uth_raise_nofund');
      acct.debit(bet); play = bet; raised = true;
      // A raise commits to showdown; the street advances are auto (uthNextStreet, unlogged).
    } else if(ev.a === 'check'){
      // No chip or deck effect — the community reveal is the only consequence.
    } else _replayFail('uth_bad_action');
    j++;
  }

  // Showdown: best 5 of the 7 (8 under Triple Threat) for each side, then the pure settlement.
  const pb = bestOf7([...hole, ...comm]);
  const db = bestOf7([...dealer, ...comm]);
  const wm = _engWinMult(mod, acct.chips);
  const res = resolveUTH(pb, db, antePortion, blindPortion, play, {
    wm, doublePlay: !!mod('uth_double_play'), hardQualify: !!mod('uth_hard_qualify'),
    blindExtended: mod('uth_blind_extended'), blindBoost: mod('uth_blind_boost') || 1,
  });
  if(res.result === 'win'){
    acct.credit(play + res.playDelta);
    if(res.dealerQualifies) acct.credit(antePortion + res.anteDelta); else acct.credit(antePortion);
    acct.credit(blindPortion + res.blindDelta);
  } else if(res.result === 'push'){
    acct.credit(antePortion + blindPortion + play);
  }
  addNet('uth', res.delta); st.hand++;
  return j;
}

// ─── 5 CARD POKER (out of scope — stub) ─────────────────────────────────────────
// Poker isn't live, so it has no replay path yet (PRD: stubbed slot only). Consume its events so a
// dev-only transcript doesn't derail the walk; it contributes 0 to the score.
function _replayPokerHand(tx, i, addNet, st){
  let j = i + 1;
  while(j < tx.length && tx[j].g === 'pk' && tx[j].a !== 'deal' && tx[j].a !== 'skip') j++;
  addNet('pk', 0); st.hand++;
  return j;
}

// ─── ROULETTE ───────────────────────────────────────────────────────────────────
// Replays the single roulette round (consumes all leading 'r' events). Returns the cursor past them.
function _replayRoulette(tx, i, deal, mod, acct, addNet, spinWords){
  let j = i;
  const spins = [];
  let skipped = false;
  while(j < tx.length && tx[j].g === 'r'){
    const ev = tx[j];
    if(ev.a === 'skip') skipped = true;
    else if(ev.a === 'spin') spins.push(ev);
    // 'keep' just commits to the main spin — the last spin in the list is already idx 0.
    j++;
  }
  if(skipped){ addNet('r', 0); return j; }
  if(spins.length > 2) _replayFail('r_too_many_spins');
  const spinEv = spins[spins.length - 1]; // the re-spin (if any) is the one that counts
  if(!spinEv){ addNet('r', 0); return j; }

  const idx = spinEv.respin === true ? 1 : 0;
  const words = spinWords[idx];
  if(!Array.isArray(words) || words.length < 4) _replayFail('r_no_words');

  const bets = (spinEv.bets || []).map(([pick, bet]) => ({ pick, bet }));
  const stake = bets.reduce((s, b) => s + b.bet, 0);
  if(stake > acct.chips) _replayFail('r_overbet');
  acct.debit(stake);

  const sp = spinFromRandom(words, spinModsFor(mod, bets, deal.rSpinOverride));
  const em = evalBetModsFor(mod, sp.n2);
  const wm = _engWinMult(mod, acct.chips);
  const { delta } = resolveRoulette(bets, sp.n, { ...em, wm });
  acct.credit(stake + delta);
  addNet('r', delta);
  return j;
}

// ─── THE LADDER ─────────────────────────────────────────────────────────────────
// Replays the ladder run (consumes all leading 'lad' events). No stake debit — _ladSettle applies
// the net delta at the end (free crash = +0, cash-out keeps the full pot, ties lose).
function _replayLadder(tx, i, deal, mod, acct, addNet){
  let j = i;
  const stakeEv = tx[j];
  if(!stakeEv || stakeEv.a !== 'stake') _replayFail('lad_no_stake');
  const free = mod('ladder_free');
  let bet, ladFree = false;
  if(free){ bet = free; ladFree = true; }
  else { bet = stakeEv.v | 0; if(bet < 25 || bet > ladderMaxStake(acct.chips)) _replayFail('lad_bad_stake'); }
  j++;

  let ladIdx = 0, ladRung = 0, outcome = null;
  while(j < tx.length && tx[j].g === 'lad'){
    const ev = tx[j];
    if(ev.a === 'hi' || ev.a === 'lo'){
      const cur = deal.ladderCards[ladIdx], next = deal.ladderCards[ladIdx + 1];
      if(ladCallCorrect(cur, next, ev.a)){
        ladRung++; ladIdx++;
        if(ladRung >= LADDER_MULTS.length){ outcome = 'top'; j++; break; }
      } else { ladIdx++; outcome = 'crash'; j++; break; }
    } else if(ev.a === 'cash'){
      if(ladRung < 1) _replayFail('lad_cash_norung');
      outcome = 'cash'; j++; break;
    } else _replayFail('lad_bad_action');
    j++;
  }
  if(!outcome){ return j; } // abandoned run (never reached in a submitted Run) — nothing to settle
  const { delta } = resolveLadder(outcome, bet, ladRung, ladFree);
  if(delta > 0) acct.credit(delta); else if(delta < 0) acct.debit(-delta);
  addNet('lad', delta);
  return j;
}

// ─── COMPOSE ──────────────────────────────────────────────────────────────────
function replayRun(seed, modifiers, transcript, opts = {}){
  const mod = _engMod(modifiers);
  const deal = opts.deal || buildDeal(seed);
  const spinWords = opts.spinWords || {};
  const tx = Array.isArray(transcript) ? transcript : [];

  const acct = _engAcct();
  const net = { bj: 0, uth: 0, pk: 0, r: 0, lad: 0 };
  const addNet = (slot, delta) => { net[slot] += delta; };
  let borrowed = false, borrowAmount = 0, picked = false;

  const bjSt = { idx: 0, hand: 0 };
  const uthSt = { hand: 0, redealPtr: 27, ttUsed: false };
  const pkSt = { hand: 0 };

  let i = 0;
  while(i < tx.length){
    const e = tx[i] || {};
    const g = e.g;
    if(g === 'sys'){
      if(e.a === 'borrow'){
        if(borrowed) _replayFail('double_borrow');
        borrowed = true; borrowAmount = e.amt | 0;
        acct.chips = borrowAmount; // borrowChips() does S.chips = amt (the busted stack was ~0)
      } else if(e.a === 'pick'){
        if(picked) _replayFail('double_pick');
        picked = true; // `modifiers` is already pick-resolved by the caller; nothing to apply
      }
      i++; continue;
    }
    if(g === 'bj') i = _replayBJHand(tx, i, deal, mod, acct, addNet, bjSt);
    else if(g === 'uth') i = _replayUTHHand(tx, i, deal, mod, acct, addNet, uthSt, seed);
    else if(g === 'pk') i = _replayPokerHand(tx, i, addNet, pkSt);
    else if(g === 'r') i = _replayRoulette(tx, i, deal, mod, acct, addNet, spinWords);
    else if(g === 'lad') i = _replayLadder(tx, i, deal, mod, acct, addNet);
    else i++; // unknown event — skip
  }

  // Authoritative score, recomputed exactly like recalcChips(): START + borrow + every round's net.
  const chips = START_CHIPS + (borrowed ? (borrowAmount || BORROW_AMOUNT) : 0)
    + net.bj + net.uth + net.pk + net.r + net.lad;
  const slotNet = k => k === 'bj' ? net.bj : k === 'uth' ? net.uth : k === 'poker' ? net.pk : k === 'ladder' ? net.lad : 0;
  return { chips, g1Net: slotNet(GAME1), g2Net: slotNet(GAME2), rNet: net.r, ladNet: net.lad };
}

// ─── AUDIT ONE ROUND ────────────────────────────────────────────────────────────
// Recomputes a single settled round's delta from its OWN recorded shape + the day's mods, so a
// stored record is a verified contract: a tampered delta no longer matches its cards/bets. Covers
// the slots whose record carries enough to recompute (bj non-split, uth, r); split bj and ladder
// don't record per-sub-hand bets / the stake, so full re-derivation there is replayRun's job.
// `mods` is the resolved preset; pass mods.wm to override the win multiplier (e.g. under comeback).
function auditRound(record, deal, mods = {}){
  const mod = _engMod(mods);
  const wm = (mods.wm != null) ? mods.wm : _engWinMult(mod, Infinity);
  if(record.slot === 'bj'){
    if(record.result === 'split') return record.delta; // per-sub-hand bets not recorded — see note above
    const player = record.player || [], dealer = record.dealer || [];
    const res = resolveBJHand({
      pv: hVal(player), pBJ: isBJ(player), dv: hVal(dealer), dBJ: isBJ(dealer),
      bet: record.bet | 0, wm, bjMult: mod('bj_payout') || 1.5, ddm: 1,
    });
    return res.delta;
  }
  if(record.slot === 'uth'){
    if(record.result === 'fold') return -((record.ante | 0) + (record.blind | 0));
    if(!record.playerBest || !record.dealerBest) return record.delta;
    const res = resolveUTH(record.playerBest, record.dealerBest, record.ante | 0, record.blind | 0, record.play | 0, {
      wm, doublePlay: !!mod('uth_double_play'), hardQualify: !!mod('uth_hard_qualify'),
      blindExtended: mod('uth_blind_extended'), blindBoost: mod('uth_blind_boost') || 1,
    });
    return res.delta;
  }
  if(record.slot === 'r'){
    if(record.skipped) return 0;
    const bets = record.bets || [];
    let delta = bets.reduce((s, b) => s + (Number.isFinite(b.delta) ? b.delta : 0), 0);
    if(wm > 1 && delta > 0) delta *= wm;
    return delta;
  }
  return record.delta; // pk / lad — no independent re-derivation; trust the recorded delta
}

// ─── DAY RESOLUTION (server replay) ───────────────────────────────────────────────
// The browser resolves "today's modifier preset" via _activeMod()/getMod (core.js), which read
// S and today's date. The server replays an explicit past seed, so it needs that resolution
// parameterized by the submitted seed + the recorded Player's Choice pick. Mirrors _activeMod +
// getMod exactly: S.forcedMod is dev-only (never set server-side); a DAILY_MODIFIERS[seed] entry
// wins over the CYCLE_ORDER day rotation; a Player's Choice preset is replaced by the committed
// pick. Returns the resolved preset object (the shape replayRun's `modifiers` expects), or null
// on a vanilla day.
function replayDayMods(calSeed, pcPick){
  const y = Math.floor(calSeed / 10000), m = Math.floor((calSeed % 10000) / 100) - 1, d = calSeed % 100;
  const dayNum = Math.floor((Date.UTC(y, m, d) - START_DATE_UTC) / 86400000) + 1;
  const cycled = CYCLE_ORDER[((dayNum - 1) % CYCLE_ORDER.length + CYCLE_ORDER.length) % CYCLE_ORDER.length];
  const ref = DAILY_MODIFIERS[calSeed] || cycled;
  if(!ref) return null;
  let mod = typeof ref === 'string' ? PRESET_MODIFIERS[ref] : ref;
  if(mod && mod.choices && pcPick) mod = PRESET_MODIFIERS[pcPick] || mod;
  return mod || null;
}

// The RNG seed for a calendar seed: DAILY_SEED_OVERRIDES swaps the card draws for some days (mods
// and save slots are unaffected), exactly like getRngSeed() does in live play. buildDeal consumes
// this, so the server must resolve it before calling replayRun.
function replayRngSeed(calSeed){
  return DAILY_SEED_OVERRIDES[calSeed] || calSeed;
}

// The furthest calendar-seed (YYYYMMDD) the deployed day-config actually covers · the max key across
// DAILY_MODIFIERS and DAILY_SEED_OVERRIDES. Both tables are BAKED into the engine bundle at build
// time, so a day whose modifier or seed-override was added/edited AFTER the last deploy is NOT
// represented here, and the server would replay it against stale config (the 2026-06-16 seed-override
// incident · every honest run that day looked like an overbet). submit-score uses this as a hard
// ENFORCE horizon: it only treats the replay as authoritative for seed <= horizon, leaving any day
// beyond the deployed config in shadow (flag-only). So a forgotten redeploy degrades to "that day
// isn't enforced yet", never "that day rejects everyone". DAILY_MODIFIERS already carries one entry
// per day, so the horizon tracks the last day the operator configured · keep it populated ahead of
// today and redeploy after editing daily config (see .claude/NEW-MODIFIER.md).
function replayConfigHorizon(){
  let h = 0;
  for(const k in DAILY_MODIFIERS){ const s = +k; if(s > h) h = s; }
  for(const k in DAILY_SEED_OVERRIDES){ const s = +k; if(s > h) h = s; }
  return h;
}

// ─── DUAL-MODE EXPORT ───────────────────────────────────────────────────────────
// In the browser these are plain globals (script tag). Under a module loader (the Deno Edge
// Function) expose them without a build step. The server bootstrap provides the pure dependencies
// (resolvers, buildDeal, card helpers, constants) on globalThis before importing this file.
if(typeof module !== 'undefined' && module.exports){
  module.exports = { replayRun, auditRound, replayDayMods, replayRngSeed, replayConfigHorizon };
}
