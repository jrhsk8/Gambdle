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

// The running-balance win multiplier (winMultFor) and every per-game credit-from-result mapping
// (bjAward/bjAwardSplit, uthAward, rouletteAward, ladderAward) are shared with the live games — they
// live in the game files, return a pure settlement Ledger, and are applied here over the headless
// accountant via applyLedger (core.js). Pinning them in one place is the whole point: live and replay
// build the identical ledger, so they can no longer drift.

// Headless Accountant adapter mirroring credit()/debit(): Math.round on every delta, debit floors at
// 0. Tracks the LIVE balance (used only for winMult + legality); the returned score is recomputed
// from the per-slot net sums, matching recalcChips() exactly.
/** @returns {Accountant} */
function _engAcct(){
  return {
    chips: START_CHIPS,
    credit(n){ this.chips += Math.round(n); },
    debit(n){ this.chips = Math.max(0, this.chips - Math.round(n)); },
  };
}

// ─── BLACKJACK ────────────────────────────────────────────────────────────────
// Soft Landing replay twin of _bjSafeHitSwap (bj.js): on a hand's first hit (length 2) swap the next
// shoe card for the nearest later card that keeps the total ≤21, if it would otherwise bust.
function _replaySafeHitSwap(shoe, idx, hand, mod, segEnd){
  if(!mod('bj_safe_hit') || hand.length !== 2) return;
  if(hVal(hand.concat(shoe[idx])) <= 21) return;
  const end = segEnd == null ? shoe.length : segEnd;   // stay inside this hand's segment (hands are independent)
  const si = shoe.findIndex((c, k) => k > idx && k < end && hVal(hand.concat(c)) <= 21);
  if(si !== -1){ const t = shoe[idx]; shoe[idx] = shoe[si]; shoe[si] = t; }
}

// Shared: the bj_first_ace deal swap — if the next shoe card isn't an Ace, swap the nearest later
// Ace into its slot (mutates the Deal copy in place, exactly like bjDeal mutates DEAL.bjShoe). Pure
// given (shoe, idx, mod); the dev-only future-seed checker (seedcheck.js) calls the same helper so
// the two can never deal a hand differently.
function bjFirstAceSwap(shoe, idx, mod, segEnd){
  if(!mod('bj_first_ace') || !shoe[idx] || shoe[idx].r === 'A') return;
  const end = segEnd == null ? shoe.length : segEnd;   // stay inside this hand's segment (hands are independent)
  const ai = shoe.findIndex((c, k) => k > idx && k < end && c.r === 'A');
  if(ai !== -1){ const t = shoe[idx]; shoe[idx] = shoe[ai]; shoe[ai] = t; }
}

// Replays one Blackjack hand starting at tx[i] (a 'deal' or 'skip'). Returns the cursor past it.
function _replayBJHand(tx, i, deal, mod, acct, addNet, st, seed){
  const dealEv = tx[i];
  if(dealEv.a === 'skip'){ addNet('bj', 0); st.hand++; return i + 1; }
  if(dealEv.a !== 'deal') _replayFail('bj_no_deal');
  const bet0 = dealEv.bet | 0;
  if(bet0 <= 0) _replayFail('bj_bad_bet');
  if(bet0 > maxFor('bj', acct.chips)) _replayFail('bj_overbet');
  acct.debit(bet0);

  // Card source + cursor: the shared shoe at st.idx by default, or a fresh isolated deck under Double
  // Vision (bj_two_hands) — which never touches deal.bjShoe / st.idx, mirroring bjDeal's per-hand deck.
  // draw() is the single sequential accessor both paths use (twin of bj.js _bjDraw).
  const Rbj = bjRulesFor(mod); // shared BJ rule bundle (same builder the live game calls via bjRules())
  const twoHands = Rbj.twoHands;
  let shoe = deal.bjShoe;
  if(twoHands){
    shoe = shuffle(buildDeck(), mkRng(seed + (st.hand + 1) * 97));
  } else {
    // Each hand draws from its own fixed segment of the shoe, so a split/hit in one hand never shifts
    // another's cards (BJ hands are independent). Reset the cursor to this hand's segment start.
    // (Pre-cutover seeds return null → keep the old continuous cursor + unbounded swap; see bjSegStart.)
    const seg = bjSegStart(shoe.length, st.hand, seed);
    if(seg !== null) st.idx = seg;
    bjFirstAceSwap(shoe, st.idx, mod, bjSegStart(shoe.length, st.hand + 1, seed)); // Ace into the next slot, within-segment
  }
  const cur = { i: 0 };                                   // local cursor, used only under twoHands
  const draw = twoHands ? (() => shoe[cur.i++]) : (() => shoe[st.idx++]);

  let player, dealer, j;
  if(twoHands){
    // Deal two candidate hands + dealer from the fresh deck, then keep one per the recorded 'pick'.
    const A = [draw(), draw()], B = [draw(), draw()];
    dealer = [draw(), draw()];
    const nat = isBJ(A) ? 0 : isBJ(B) ? 1 : -1;
    const ev1 = tx[i + 1];
    const hasPick = !!(ev1 && ev1.g === 'bj' && ev1.a === 'pick');
    if(nat !== -1){
      // A candidate natural is auto-kept live (no pick logged); a stray pick is forged.
      if(hasPick) _replayFail('bj_pick_on_natural');
      player = nat === 0 ? A : B; j = i + 1;
    } else {
      if(!hasPick) _replayFail('bj_no_pick');
      if(ev1.s !== 0 && ev1.s !== 1) _replayFail('bj_bad_pick');
      player = ev1.s === 0 ? A : B; j = i + 2;            // consume the deal + the pick
    }
  } else {
    player = [draw(), draw()];
    dealer = [draw(), draw()];
    j = i + 1;
  }

  // Gather this hand's action events (consecutive bj events that aren't a new deal/skip). A 'pick'
  // here is illegal — it's only valid as the single consumed event above (mod on, no natural).
  const actions = [];
  while(j < tx.length && tx[j].g === 'bj' && tx[j].a !== 'deal' && tx[j].a !== 'skip'){
    if(tx[j].a === 'pick') _replayFail('bj_bad_pick');
    actions.push(tx[j]); j++;
  }

  const stand17 = Rbj.standAt;
  const bjMult = Rbj.payout;
  const pBJ = isBJ(player), dBJ0 = isBJ(dealer);

  // Naturals end the hand before the player can act.
  if(dBJ0 || pBJ){
    if(actions.length) _replayFail('bj_act_after_natural');
    // Dealer blackjack settles on the two up-cards (no draw). A player blackjack with a non-BJ
    // dealer STILL draws the dealer to 17+ (bjResolve does), consuming the shoe — pin that here.
    if(!dBJ0){ let dv = hVal(dealer); while(dv < stand17){ dealer.push(draw()); dv = hVal(dealer); } }
    const wm = winMultFor(mod, acct.chips);
    const res = resolveBJHand({ pv: hVal(player), pBJ, dv: hVal(dealer), dBJ: isBJ(dealer), bet: bet0, wm, bjMult, ddm: 1 });
    applyLedger(acct, bjAward(res.result, bet0, res.delta));
    addNet('bj', res.delta); st.hand++;
    return j;
  }

  if(actions.some(ev => ev.a === 'split')){
    return _replayBJSplit(tx, j, deal, mod, acct, addNet, st, { player, dealer, bet0, actions, stand17 }, shoe, draw);
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
    if(ev.a === 'hit'){ _replaySafeHitSwap(shoe, st.idx, player, mod, bjSegStart(shoe.length, st.hand + 1, seed)); player.push(draw()); if(hVal(player) >= 21) ended = true; }
    else if(ev.a === 'double'){ if(acct.chips < bet) _replayFail('bj_double_nofund'); acct.debit(bet); bet *= 2; doubled = true; player.push(draw()); ended = true; }
    else if(ev.a === 'stand'){ ended = true; }
    else _replayFail('bj_bad_action');
  }
  let dv = hVal(dealer);
  while(dv < stand17){ dealer.push(draw()); dv = hVal(dealer); }
  const wm = winMultFor(mod, acct.chips);
  const ddm = (Rbj.doubleBonus && doubled) ? 2 : 1;
  const res = resolveBJHand({ pv: hVal(player), pBJ: false, dv, dBJ: isBJ(dealer), bet, wm, bjMult, ddm });
  applyLedger(acct, bjAward(res.result, bet, res.delta));
  addNet('bj', res.delta); st.hand++;
  return j;
}

// Replays a split hand. `j` is the cursor at the first action; init carries the dealt cards + the
// already-collected action list (which begins with the first 'split'). Mirrors the bjSplit /
// bjAdvanceSplit / bjCheckSplitHand deck-consumption state machine, driven by the recorded actions.
// `shoe` + `draw` are threaded from _replayBJHand so a Double Vision split draws from the same fresh
// per-hand deck (twoHands ⇒ draw() advances a local cursor, not st.idx). _replaySafeHitSwap still reads
// st.idx, which is correct: safe_hit and two_hands never co-occur, so under two_hands it's a no-op.
// Shared headless split stepper — an adapter over bj.js's split state machine (splitInit/splitResplit/
// splitAdvance/splitCanAct/splitIsActionable), used by BOTH the replay engine (decisions read from the
// transcript) and the dev-only future-seed checker (decisions from a basic-strategy table), so their
// split draw order can never diverge FROM EACH OTHER OR FROM LIVE PLAY — bj.js's bjSplit/bjAdvanceSplit/
// bjCheckSplitHand call the exact same machine functions. This function only adds: the deck draw/acct
// plumbing the machine doesn't own, and turning "what should happen" into "ask nextAction, then do it".
//   pair       — the opening matched pair [c0, c1]
//   dealer     — the dealer's 2 up-cards (mutated: drawn to stand17)
//   draw       — sequential card accessor (advances the caller's shoe/segment cursor)
//   acct       — chip ledger {chips, debit}; the checker passes an unbounded stub (no real staking)
//   beforeHit  — called with the active hand before each hit (Soft Landing swap); default no-op
//   nextAction — (activeHand, {canResplit, canDouble, active}) → 'hit'|'stand'|'double'|'split', or null
//                to stop (transcript exhausted; resolve the hands as they stand)
//   fail       — illegal-state reporter (engine: _replayFail; default throws)
// Returns { hands, bets, doubled, dealer } for the caller to settle (award vs count).
function bjSplitStep({ pair, dealer, bet0, mod, stand17, draw, acct, nextAction, beforeHit, fail }){
  const _fail = fail || _replayFail;
  const _beforeHit = beforeHit || (() => {});
  if(acct.chips < bet0) _fail('bj_split_nofund');
  acct.debit(bet0);
  let { hands, bets, doubled, done } = splitInit(pair, bet0, draw);
  let active = 0;

  // Advance to the next sub-hand that needs a player action, dealing a waiting sub-hand its 2nd card
  // (splitAdvance doesn't draw — that's this caller's job, same division as bjAdvanceSplit) and
  // auto-resolving any sub-hand already at 21+ (splitIsActionable — mirrors bjCheckSplitHand).
  const settleToActionable = () => {
    while(true){
      if(hands[active].length === 1) hands[active].push(draw());
      if(splitIsActionable(hands[active])) return false;   // player must act
      const adv = splitAdvance(done, active);
      done = adv.done; active = adv.active;
      if(adv.allDone) return true;                          // all sub-hands done → resolve
    }
  };
  const advance = () => {
    const adv = splitAdvance(done, active);
    done = adv.done; active = adv.active;
    if(adv.allDone) return true;
    return settleToActionable();
  };

  let allDone = settleToActionable();
  while(!allDone){
    const hand = hands[active];
    const ctx = { ...splitCanAct(hands, bets, active, acct.chips, mod('bj_wild_split')), active };
    const a = nextAction(hand, ctx);
    if(a == null) break;                            // transcript exhausted — resolve the hands as they stand
    if(a === 'split'){
      if(hands.length >= 4) _fail('bj_resplit_max');
      const bet = bets[active];
      if(acct.chips < bet) _fail('bj_resplit_nofund');
      acct.debit(bet);
      ({ hands, bets, doubled, done } = splitResplit(hands, bets, doubled, done, active, draw));
      allDone = settleToActionable();
    } else if(a === 'hit'){
      _beforeHit(hands[active]);
      hands[active].push(draw());
      if(!splitIsActionable(hands[active])) allDone = advance();
    } else if(a === 'double'){
      if(acct.chips < bets[active]) _fail('bj_split_double_nofund');
      acct.debit(bets[active]); bets[active] *= 2; doubled[active] = true;
      hands[active].push(draw());
      allDone = advance();
    } else if(a === 'stand'){
      allDone = advance();
    } else _fail('bj_bad_action');
  }

  // Dealer draws once after all sub-hands (resolveBJSplitHand, called by the caller, has no BJ branch).
  let dv = hVal(dealer);
  while(dv < stand17){ dealer.push(draw()); dv = hVal(dealer); }
  return { hands, bets, doubled, dealer };
}

// Replays a split hand from the transcript. `init.actions` is the pre-collected consecutive bj action
// list, beginning with the initial 'split'. Drives the shared bjSplitStep with a transcript-reading
// callback (still strict — forged/extra actions abort the Run), then settles each sub-hand.
function _replayBJSplit(tx, j, deal, mod, acct, addNet, st, init, shoe, draw){
  const { player, dealer, bet0, actions, stand17 } = init;
  const Rbj = bjRulesFor(mod); // shared BJ rule bundle (same builder bjResolve's split path uses)
  if(!actions.length || actions[0].a !== 'split') _replayFail('bj_split_order');
  let k = 1;                                         // actions[0] is the initial split (already decided)
  const { hands, bets, doubled, dealer: dlr } = bjSplitStep({
    pair: player, dealer, bet0, mod, stand17, draw, acct,
    beforeHit: (hand) => _replaySafeHitSwap(shoe, st.idx, hand, mod, bjSegStart(shoe.length, st.hand + 1, seed)),
    nextAction: () => (k < actions.length ? actions[k++].a : null),
    fail: _replayFail,
  });
  if(k < actions.length) _replayFail('bj_act_after_end'); // extra actions after the hand ended → forged

  const dvFinal = hVal(dlr);
  const wm = winMultFor(mod, acct.chips);
  const spm = Rbj.wildSplit ? 2 : 1;
  let total = 0;
  for(let h = 0; h < hands.length; h++){
    const bet = bets[h];
    const ddm = (Rbj.doubleBonus && doubled[h]) ? 2 : 1;
    const res = resolveBJSplitHand({ pv: hVal(hands[h]), dv: dvFinal, bet, wm, ddm, spm });
    applyLedger(acct, bjAwardSplit(res.result, bet, res.delta));
    total += res.delta;
  }
  addNet('bj', total); st.hand++;
  return j;
}

// ─── ULTIMATE TEXAS HOLD'EM ─────────────────────────────────────────────────────
// Replays one UTH hand starting at tx[i] (a 'deal' or 'skip'). Returns the cursor past it.
// Shared: the per-hand UTH card layout (hole / dealer / community / private), mirroring uthDeal incl.
// the per-hand fresh-deck mods (uth_pocket_aces, uth_suited_conn) and the deck-tail mods
// (uth_three_hole, uth_sixth_card). Pure: (deal, mod, hand, seed) → { hole, dealer, comm, priv }.
// Used by the replay path AND the dev-only future-seed checker (seedcheck.js) so neither can deal a
// UTH hand differently. `comm` is a fresh array the caller may mutate (Time Travel re-deals it).
function uthHandCards(deal, mod, hand, seed){
  const R = uthRulesFor(mod); // shared UTH rule bundle (same builder live uthDeal calls via uthRules())
  if(R.pocketAces){
    const d = shuffle(buildDeck(), mkRng(seed + (hand + 1) * 97));
    const aces = [], rest = [];
    for(const c of d) (c.r === 'A' && aces.length < 2 ? aces : rest).push(c);
    return { hole: aces, dealer: [rest[0], rest[1]], comm: rest.slice(2, 7), priv: [] };
  }
  if(R.suitedConn){
    // Suited Up: shared deal twin of uthDeal — same per-hand seed feeds suitedConnectorDeal (core.js).
    const { hole, dealer, comm } = suitedConnectorDeal(mkRng(seed + (hand + 1) * 97));
    return { hole, dealer, comm, priv: [] };
  }
  const dk = deal.uthDeck, off = hand * 9;
  const hole = [dk[off], dk[off + 1]];
  let priv = [];
  if(R.threeHole) hole.push(dk[27 + hand]); // Triple Threat's 3rd hole card from the tail
  if(R.sixthCard) priv = [dk[27 + hand]];   // Sixth Sense's private community card (player pool only)
  return {
    hole,
    dealer: [dk[off + 2], dk[off + 3]],
    comm: [dk[off + 4], dk[off + 5], dk[off + 6], dk[off + 7], dk[off + 8]],
    priv,
  };
}

function _replayUTHHand(tx, i, deal, mod, acct, addNet, st, seed){
  const dealEv = tx[i];
  if(dealEv.a === 'skip'){ addNet('uth', 0); st.hand++; return i + 1; }
  if(dealEv.a !== 'deal') _replayFail('uth_no_deal');
  const ante = dealEv.ante | 0;
  if(ante <= 0) _replayFail('uth_bad_ante');
  // Enforce the SAME cap the live bet UI applies — maxFor('uth') = ⌊chips·2/3⌋ — not merely "fits the
  // stack". Without this, a forged ante between ⌊2/3⌋ and the full stack would replay as legal.
  if(ante > maxFor('uth', acct.chips)) _replayFail('uth_overbet');
  acct.debit(ante);

  // Deal hole / dealer / community via the shared deal twin (also used by seedcheck.js). `comm` is
  // mutated in place by Time Travel below, so keep these as mutable bindings.
  let { hole, dealer, comm, priv } = uthHandCards(deal, mod, st.hand, seed);
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

  // Showdown: best 5 of the 7 (8 under Triple Threat / Sixth Sense) for the player, 7 for the dealer.
  const pb = bestOf7([...hole, ...comm, ...priv]);
  const db = bestOf7([...dealer, ...comm]);
  const wm = winMultFor(mod, acct.chips);
  const Ruth = uthRulesFor(mod); // shared UTH rule bundle (same builder live uthResolve uses)
  const res = resolveUTH(pb, db, antePortion, blindPortion, play, {
    wm, doublePlay: Ruth.doublePlay, hardQualify: Ruth.hardQualify,
    blindExtended: Ruth.blindExtended, blindBoost: Ruth.blindBoost,
  });
  applyLedger(acct, uthAward(res, antePortion, blindPortion, play));
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
  if(stake > maxFor('roulette', acct.chips)) _replayFail('r_overbet');
  acct.debit(stake);

  const sp = spinFromRandom(words, spinModsFor(mod, bets, deal.rSpinOverride));
  const em = evalBetModsFor(mod, sp.n2, winMultFor(mod, acct.chips)); // one builder call, not a spread + append
  const { delta } = resolveRoulette(bets, sp.n, em);
  applyLedger(acct, rouletteAward(stake, delta));
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
  else { bet = stakeEv.v | 0; if(bet < 25 || bet > maxFor('ladder', acct.chips)) _replayFail('lad_bad_stake'); }
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
  applyLedger(acct, ladderAward(delta));
  addNet('lad', delta);
  return j;
}

// ─── COMPOSE ──────────────────────────────────────────────────────────────────
// Replay dispatch reads the SAME Game registry the live Run uses: each game's entry carries its
// per-hand replay handler, adapted here to the bespoke argument list each one needs. Adding a game
// is then one registry entry instead of an extra branch in the loop below, so live and replay can't
// drift on which handler a game maps to. `_byTxKey` reverses txKey (the Transcript tag) back to the
// registry key — the Transcript stores 'pk'/'r'/'lad' but the registry keys are 'poker'/'roulette'/
// 'ladder'. Handler arg-lists differ, so each adapter picks what it needs from the per-Run context.
GAMES.bj.replay       = (i, c) => _replayBJHand(c.tx, i, c.deal, c.mod, c.acct, c.addNet, c.bjSt, c.seed);
GAMES.uth.replay      = (i, c) => _replayUTHHand(c.tx, i, c.deal, c.mod, c.acct, c.addNet, c.uthSt, c.seed);
GAMES.poker.replay    = (i, c) => _replayPokerHand(c.tx, i, c.addNet, c.pkSt);
GAMES.roulette.replay = (i, c) => _replayRoulette(c.tx, i, c.deal, c.mod, c.acct, c.addNet, c.spinWords);
GAMES.ladder.replay   = (i, c) => _replayLadder(c.tx, i, c.deal, c.mod, c.acct, c.addNet);
const _byTxKey = {};
for(const _gk in GAMES){ if(GAMES[_gk].txKey) _byTxKey[GAMES[_gk].txKey] = _gk; }

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

  // Per-Run context handed to each registry replay handler (each picks the args it needs).
  const _ctx = { tx, deal, mod, acct, addNet, seed, spinWords, bjSt, uthSt, pkSt };

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
    const entry = GAMES[_byTxKey[g]];
    if(entry && entry.replay) i = entry.replay(i, _ctx);
    else i++; // unknown event — skip
  }

  // Authoritative score, recomputed exactly like recalcChips(): START + borrow + every round's net.
  const chips = START_CHIPS + (borrowed ? (borrowAmount || BORROW_AMOUNT) : 0)
    + net.bj + net.uth + net.pk + net.r + net.lad;
  const slotNet = k => net[GAMES[k]?.txKey] ?? 0;
  return { chips, g1Net: slotNet(GAME1), g2Net: slotNet(GAME2), rNet: net.r, ladNet: net.lad };
}

// ─── AUDIT ONE ROUND ────────────────────────────────────────────────────────────
// Recomputes a single settled round's delta from its OWN recorded shape + the day's mods, so a
// stored record is a verified contract: a tampered delta no longer matches its cards/bets. Covers
// the slots whose record carries enough to recompute (bj non-split, uth, r); split bj and ladder
// don't record per-sub-hand bets / the stake, so full re-derivation there is replayRun's job.
// `mods` is the resolved preset; pass mods.wm to override the win multiplier (e.g. under comeback).
function auditOutcome(record, deal, mods = {}){
  const mod = _engMod(mods);
  const wm = (mods.wm != null) ? mods.wm : winMultFor(mod, Infinity);
  if(record.slot === 'bj'){
    if(record.result === 'split') return record.delta; // per-sub-hand bets not recorded — see note above
    const player = record.player || [], dealer = record.dealer || [];
    const Rbj = bjRulesFor(mod);
    const res = resolveBJHand({
      pv: hVal(player), pBJ: isBJ(player), dv: hVal(dealer), dBJ: isBJ(dealer),
      bet: record.bet | 0, wm, bjMult: Rbj.payout, ddm: 1,
    });
    return res.delta;
  }
  if(record.slot === 'uth'){
    if(record.result === 'fold') return -((record.ante | 0) + (record.blind | 0));
    if(!record.playerBest || !record.dealerBest) return record.delta;
    const Ruth = uthRulesFor(mod);
    const res = resolveUTH(record.playerBest, record.dealerBest, record.ante | 0, record.blind | 0, record.play | 0, {
      wm, doublePlay: Ruth.doublePlay, hardQualify: Ruth.hardQualify,
      blindExtended: Ruth.blindExtended, blindBoost: Ruth.blindBoost,
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
  // The precedence + cycle composition lives in resolveDayMod (core.js), shared with the live
  // _activeMod so the two paths can't drift; replay never has a forced mod. Player's Choice is applied
  // here, exactly as getMod does live.
  return applyPlayersChoice(resolveDayMod(calSeed, dayNum, null), pcPick);
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
  module.exports = { replayRun, auditOutcome, replayDayMods, replayRngSeed, replayConfigHorizon };
}
