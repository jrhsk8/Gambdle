// ─── CONTENTS (grep the banner/function name; line numbers drift) ──────────
//   THE LADDER LOGIC: LADDER_MULTS · ladRankVal/ladCallCorrect (ties lose) ·
//     ladPotAt pot math · ladStakeCommit / ladCall / ladCashOut / _ladSettle ·
//     resetLadderRun
//   THE LADDER RENDER: screenLadder (fixed zones), zone helpers, surgical
//     mid-run updates
// ───────────────────────────────────────────────────────────────────────────

// ─── THE LADDER LOGIC ─────────────────────────────────────────
// Hi-lo streak climb. One shared seeded 8-card sequence per day
// (the active Ladder sequence: 1 face-up start + up to 7 calls, see _ladCards()).
// Each correct call climbs a rung of the fixed multiplier ladder; a wrong call OR
// A TIE crashes the run. Cash out any time from rung 1. On ladder_free mod days the
// entry is house money: crash costs nothing, cash out keeps the full pot.

const LADDER_MULTS = [1.5, 2.2, 3.2, 5, 8, 13, 21];

// The one seam onto the day's shared 8-card sequence (DEAL.ladderCards is drawn LAST
// in the seeded sequence — see core.js genDeal — so nothing here may change how/when
// it's drawn). Trivial today; exists so logic/render call one name instead of reaching
// into DEAL directly (finding #38).
function _ladCards(){ return DEAL.ladderCards; }

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

// ─── LADDER FREE-ENTRY POLICY (finding #6) ─────────────────────
// The ONE place that answers every question the free-entry rule raises elsewhere.
// Two different things both get asked "is this free?" and must not be conflated:
//   · getMod('ladder_free') — TODAY's Modifier: is the *day* running a free bonus round?
//     Read directly by call sites that need to know before a Round exists yet (routing,
//     the roulette advance prompt) — those aren't asking about "this run", there is no
//     run yet. ladderMode() itself reads it too, to answer the 'bet'-phase questions.
//   · S.ladFree — the ACTIVE Round's entry mode, latched by ladStakeCommit() the moment
//     a run starts, and read for the rest of that run's life (climb/settle/share). This
//     is what ladderMode() reports as `.free` once a run exists.
// Every call site below used to re-derive "free ⇒ locked stake / crash costs nothing /
// keep the full pot" by hand; now they all ask this one object instead.
function ladderMode(){
  const modFree = getMod('ladder_free');
  // Before commit, "is this run free" is a preview of today's mod; after commit it's the
  // latched S.ladFree (a run keeps its entry mode even if the mod check changes later).
  const free = S.ladPhase === 'bet' ? !!modFree : S.ladFree;
  // The generic bet-guard shape (bet.js), asked for the Ladder specifically: on a free day the
  // "cap" the guard reports isn't meaningful (the stake is locked, not chosen), so the bet-phase
  // readout label instead composes its own "FREE <stake>" wording (see _LAD_PHASE.bet.readout);
  // guard.label is used only on a standalone day, so it and betGuard's generic "Max bet: N"
  // wording can't drift apart.
  const guard = betGuard('ladder', S.chips, {});
  return {
    free,
    // The stake this run is (or will be) playing for.
    stake: free ? (S.ladPhase === 'bet' ? modFree : S.ladBet) : S.ladBet,
    // Cap/lock on the bet-phase stake control: free days lock to the mod value; standalone
    // days cap at the 25%-of-stack rule.
    maxStake: free ? modFree : guard.max,
    // The bet-phase cap label (standalone days only) — see the comment on `guard` above.
    label: guard.label,
    // Free entry locks the stake (no chip picker); standalone lets the player choose.
    canEditBet: !free,
    // Chip delta once a run of this mode settles: crash costs nothing on a free run,
    // loses the stake on a standalone one. (Non-crash outcomes still need the rung's pot,
    // computed by ladPotAt — this only covers crash, the one outcome free/standalone diverge on.)
    crashDelta: free ? 0 : -S.ladBet,
    // Today's bonus-round detour gate (flow.js routing / the roulette advance prompt): does
    // TODAY run a free bonus round at all, independent of whether a Round has started.
    detourToday: !!modFree,
  };
}

// Commits the stake and starts the climb. On ladder_free mod days the entry is
// locked to the mod value (house money — S.ladFree). Standalone stakes must be
// within [25, ladMaxStake()].
function ladStakeCommit(){
  if (S.ladPhase !== 'bet') return;
  const mode = ladderMode();
  if (mode.free) { S.ladBet = mode.stake; S.ladFree = true; }
  if (!S.ladFree && (S.ladBet < 25 || S.ladBet > ladMaxStake())) return;
  tx('lad', 'stake', {v:S.ladBet});
  mutate(s => { s.ladPhase = 'climb'; s.ladIdx = 0; s.ladRung = 0; }); // mutate-then-save seam (C6)
  _ladAfterAction('chips');
}

// One higher/lower call against the next card in the shared sequence.
function ladCall(dir){
  if (S.ladPhase !== 'climb') return;
  const cards = _ladCards();
  const cur = cards[S.ladIdx], next = cards[S.ladIdx + 1];
  tx('lad', dir);
  if (ladCallCorrect(cur, next, dir)) {
    mutate(s => { s.ladRung++; s.ladIdx++; }); // mutate-then-save seam (C6)
    if (S.ladRung >= LADDER_MULTS.length) { _ladSettle('top'); return; } // _ladSettle saves again (last write wins)
    _ladAfterAction('card');
  } else {
    S.ladIdx++; // advance so the killer card is the one on display
    _ladSettle('crash');
  }
}

function ladCashOut(){
  if (S.ladPhase !== 'climb' || S.ladRung < 1) return;
  tx('lad', 'cash');
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

// Settlement Ledger for the settled Ladder run — the ONE credit mapping shared by the live settle
// (_ladSettle) and the replay Engine. PURE: a positive delta credits the net, a negative delta debits
// it, zero is a no-op (applied via applyLedger). This is the only game whose ledger can carry a debit.
// Built via mkCredit/mkDebit (core.js) — a validated {op,n,reason} factory — so a typo'd reason throws
// in strict mode; -delta is always >=0 here since it's only taken on the delta<0 branch.
function ladderAward(delta){ return delta>0 ? [mkCredit(delta, 'ladder')] : delta<0 ? [mkDebit(-delta, 'ladder')] : []; }

// Ends the run: applies the chip delta and records ladResult for recalcChips,
// the results screen, and the share text. Free entry: crash costs nothing,
// cash out keeps the full pot.
function _ladSettle(outcome){
  const free = ladderMode().free; // the Round's latched entry mode (S.ladFree), asked through the policy
  const { delta } = resolveLadder(outcome, S.ladBet, S.ladRung, free);
  applyLedger(liveAcct(), ladderAward(delta)); // credits/debits S.chips (no save); the mutate below persists it
  mutate(s => { // mutate-then-save seam (C6)
    s.ladResult = mkOutcome('lad', delta, outcome, { rung: s.ladRung, free });
    s.ladPhase = 'done';
  });
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

// `reason` — see the reset(reason) contract in core.js. Only ever called with 'dev-jump' today (the
// dev Jump submenu and devLadder()): Ladder is a single run per day, so the normal Round flow never
// needs to reset it (its one real entry point, the ladder_day free-bonus detour, always finds S
// already at its fresh-day defaults — see the contract comment). Accepted but unbranched.
function resetLadderRun(reason){
  S.ladPhase = 'bet'; S.ladBet = 0; S.ladFree = false;
  S.ladIdx = 0; S.ladRung = 0; S.ladResult = null;
}

// ─── THE LADDER RENDER ────────────────────────────────────────
// Fixed skeleton: six zones with stable ids and constant min-heights so nothing
// moves between phases — only zone contents swap (see styles.css .lad-*).

GAMES.ladder.screen = screenLadder; // register into the Game registry (defined just below; core.js loads first)
// No GAMES.ladder.rulesFor: the Ladder has no per-game rule bundle to register — it reads
// getMod('ladder_free') straight (ladderMode(), above) and that key is `cross`-attributed in
// MODIFIER_SCHEMA (a cross-game key, not ladder-owned), not a scalar/flag set worth a builder.
function screenLadder(){
  const mode = ladderMode();
  // Free-entry days lock the displayed stake to the house's entry.
  if (mode.free && S.ladPhase === 'bet') { S.ladBet = mode.stake; }
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

// ─── PHASE → RENDERER TABLE (finding #22) ──────────────────────
// Each zone used to re-branch on S.ladPhase independently (six copies of the same
// 'bet'/'climb'/'done' switch). Instead the phase tree lives once, here: one row per
// phase, one column per zone. Zone builders (below) become a one-line lookup that
// throws loud on a phase with no entry — a blank zone would otherwise render silently
// and only surface as a layout-test diff days later.
const _LAD_PHASE = {
  bet: {
    head: () => `<span class="lad-hl">THE LADDER</span>`,
    strip: () => _ladStripCells(null),
    readout: (mode) => {
      const box = _ladBox;
      return mode.free
        ? box(`Stack: <b>${fmt(S.chips)}</b>`, `Entry: <b class="lad-gold">FREE ${fmt(mode.stake)}</b>`)
        : box(`Stack: <b>${fmt(S.chips)}</b>`, mode.label); // mode.label = betGuard's "Max bet: <b>N</b>"
    },
    cards: () => _ladCardPair(_ladCards(), S.ladIdx, false),
    msg: () => `Higher or lower? Cash out any time. <b class="lad-bad">Ties lose.</b>`,
    actions: (mode) => {
      if (mode.free) {
        return `<div class="lad-chips-locked">${chipSel(mode.stake, mode.stake)}</div>
        <button id="${DOM.dealBtn}" class="btn-gold lad-btn-big" onclick="ladStakeCommit()">Free Entry · ${fmt(mode.stake)} →</button>`;
      }
      const valid = S.ladBet >= 25 && S.ladBet <= mode.maxStake;
      return `${chipSel(maxBet(), S.ladBet)}
      <button id="${DOM.dealBtn}" class="btn-gold lad-btn-big" onclick="ladStakeCommit()" ${valid?'':'disabled'}>Climb →</button>`;
    },
  },
  climb: {
    head: () => `<span class="lad-hl">THE LADDER</span>`,
    strip: () => _ladStripCells(null),
    readout: () => {
      const next = ladPotAt(S.ladBet, S.ladRung + 1);
      return _ladBox(`Pot: <b>${fmt(ladPotAt(S.ladBet, S.ladRung))}</b>`, `Next rung: <b>${fmt(next)}</b>`);
    },
    cards: () => _ladCardPair(_ladCards(), S.ladIdx, false),
    msg: () => `Rung ${S.ladRung + 1} of ${LADDER_MULTS.length + 1} · <b class="lad-bad">Ties lose.</b>`,
    actions: () => {
      const pot = ladPotAt(S.ladBet, S.ladRung);
      return `<div class="lad-call-row">
        <button class="btn-gold lad-call" onclick="ladCall('hi')">▲ Higher</button>
        <button class="btn-gold lad-call" onclick="ladCall('lo')">▼ Lower</button>
      </div>
      <button class="btn-gold lad-btn-big" onclick="ladCashOut()" ${S.ladRung<1?'disabled':''}>Cash Out · ${fmt(pot)}</button>`;
    },
  },
  done: {
    head: () => ({ crash: `<span class="lad-hl lad-hl-bad">${icon('x-circle',{fill:true})} CRASHED!</span>`,
                    cash:  `<span class="lad-hl lad-hl-good">${icon('coins',{fill:true})} CASHED OUT!</span>`,
                    top:   `<span class="lad-hl lad-hl-good">${icon('crown',{fill:true})} TOP OF THE LADDER!</span>` }[S.ladResult.result]),
    strip: () => _ladStripCells(S.ladResult.result === 'crash'),
    readout: () => {
      const r = S.ladResult, box = _ladBox;
      if (r.result === 'crash') {
        return r.free ? box(`Free entry`, `<b>+0 chips</b>`)
                      : box(`Bet lost`, `<b class="lad-bad">${sign(r.delta)} chips</b>`);
      }
      return box(`Pot: <b>${fmt(ladPotAt(S.ladBet, r.rung))}</b>`, `<b class="lad-good">${sign(r.delta)} chips</b>`);
    },
    cards: () => _ladCardPair(_ladCards(), S.ladIdx, S.ladResult.result === 'crash'),
    msg: () => {
      const r = S.ladResult;
      if (r.result === 'crash') {
        const cards = _ladCards(), a = cards[S.ladIdx - 1], b = cards[S.ladIdx];
        const why = a && b && a.r === b.r ? `${a.r} matched ${b.r}. Ties lose.` : `Wrong call.`;
        return `${why} Crashed on rung ${r.rung + 1}.`;
      }
      if (r.result === 'top') return `All ${LADDER_MULTS.length} rungs. ×${LADDER_MULTS[LADDER_MULTS.length-1]} your bet.`;
      return `You climbed ${r.rung} rung${r.rung===1?'':'s'} for ${LADDER_MULTS[r.rung-1]}x profit.`;
    },
    actions: (mode) => {
      // Advance target: mod-day bonus always goes to results; a slotted game follows NEXT_SCREEN.
      const nxt = NEXT_SCREEN['ladder'];
      const target = (!mode.free && nxt) ? nxt : 'results';
      const label = target === 'results' ? 'See Final Results →'
                  : target === 'roulette' ? 'Final Round: Roulette →'
                  : `Round 2: ${GAME_META[target].short} →`;
      return `<div class="lad-call-row">
        <button class="btn-gold lad-call" disabled>▲ Higher</button>
        <button class="btn-gold lad-call" disabled>▼ Lower</button>
      </div>
      ${nextBtn(`advanceTo('${target}')`, label)}`;
    },
  },
};

// Looks up today's phase row, failing loud (rather than rendering blank) if S.ladPhase
// is ever something the table doesn't cover — a silent blank zone is a worse bug than a throw.
function _ladPhaseRow(){
  const row = _LAD_PHASE[S.ladPhase];
  if (!row) throw new Error(`ladder: no renderer for phase "${S.ladPhase}"`);
  return row;
}

// Shared readout-box shape: two side-by-side fixed-size boxes so nothing shifts between
// phases. Content is wrapped in a span so it wraps cleanly (label over value) and the
// space after the colon isn't collapsed by the flex box.
function _ladBox(a, b){ return `<div class="lad-read-box"><span>${a}</span></div><div class="lad-read-box"><span>${b}</span></div>`; }

// Rung strip cells, shared by every phase: `crashed` is null pre-settle (nothing can be
// marked crashed yet), else the settled run's crash/not-crash flag.
function _ladStripCells(crashed){
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

// The two-card display, shared by every phase: pre-crash it's (current, face-down back);
// after a crash ladIdx sits on the killer card, so show the pair that ended the run.
function _ladCardPair(cards, idx, crashed){
  const cur = crashed ? cards[idx - 1] : cards[idx];
  const right = crashed ? cardHTML(cards[idx], 'md', '', 0, false) : cardHTML('back', 'md');
  return cardHTML(cur, 'md', '', 0, false) + right;
}

function _ladHeadHTML(){ return _ladPhaseRow().head(ladderMode()); }
function _ladStripHTML(){ return _ladPhaseRow().strip(ladderMode()); }
function _ladReadoutHTML(){ return _ladPhaseRow().readout(ladderMode()); }
function _ladCardsHTML(){ return _ladPhaseRow().cards(ladderMode()); }
function _ladMsgHTML(){ return _ladPhaseRow().msg(ladderMode()); }
function _ladActionsHTML(){ return _ladPhaseRow().actions(ladderMode()); }

