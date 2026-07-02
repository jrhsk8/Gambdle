// ─── THE RECORD ──────────────────────────────────────────────────────────────
// The canonical settled-round record plus the Run Transcript: the one shape that integrity
// Phase-2 replay reads. Write via mkOutcome / tx (a thin wrapper over txLog), read via
// settledOutcomes / recalcChips, and validate against the shape tables (ROUND_DETAIL_KEYS,
// TX_SHAPE), which catch typos in strict mode. Depends on core.js: S, START_CHIPS, GAME1/GAME2,
// DEV_OVERRIDE. Loads right after core.js. Public: mkOutcome, gameHistory, gameNet, recalcChips,
// tx, txLog, _normalizeRounds (called by core.loadState).
// ─────────────────────────────────────────────────────────────────────────────
// ─── CANONICAL SETTLED-ROUND RECORD ─────────────────────────────────────────
// Every game records the outcome of a settled round in ONE shape via mkOutcome, so the score basis
// (recalcChips) and the integrity Phase-2 server replay read a single record format instead of
// three (the per-game history arrays, the rResult singleton, the ladResult singleton). The shape is
// {slot, delta, result}: `delta` is the signed net chips (the only field score derivation reads),
// and `detail` carries each game's display payload (cards, bets, rung, ...). Only the record shape
// is shared; each game still keeps its own phase guard and credit math (the stake is debited at
// deal and the guards key off per-game phase, so settlement is genuinely game-specific). slot is a
// game slot ('bj'/'uth'/'pk') or 'r' (roulette) / 'lad' (the ladder).
// Allowed detail keys per slot. A key not listed here is almost certainly a mistyped field
// (e.g. `antDelta` for `anteDelta`) that would silently corrupt the record and only surface later
// as a Phase-2 replay mismatch. ('pk' = 5 Card Poker, still recorded though not yet on the board.)
const ROUND_DETAIL_KEYS = {
  bj:  ['bet', 'player', 'dealer'],
  uth: ['ante', 'blind', 'play', 'playMult', 'anteDelta', 'blindDelta', 'playDelta', 'playerBest', 'dealerBest', 'dealerQualifies'],
  pk:  ['bet', 'pts'],
  r:   ['bets', 'skipped'],
  lad: ['rung', 'free'],
};
// Validate the record shape only in dev (?dev=true) and under the test harness. An unexpected
// production shape must never crash a live run mid-game, but a typo should blow up loudly the
// moment it's written, not days later as a server-replay mismatch. See integrity Phase 2.
const _strictRounds = () => !!DEV_OVERRIDE || !!(typeof window !== 'undefined' && window.__GAMBDLE_TEST__);
function _validateRound(slot, detail){
  const allowed = ROUND_DETAIL_KEYS[slot];
  if(!allowed) throw new Error(`mkOutcome: unknown slot '${slot}'`);
  for(const k of Object.keys(detail)) if(!allowed.includes(k))
    throw new Error(`mkOutcome: '${slot}' detail has unexpected key '${k}'. Typo? Expected one of: ${allowed.join(', ')}`);
}
function mkOutcome(slot, delta, result, detail = {}){
  if(_strictRounds()){
    // `delta` (the only field score derivation reads) and `result` are essential: a non-finite
    // delta or a missing result would silently corrupt the score or the replay.
    if(!Number.isFinite(delta)) throw new Error(`mkOutcome: '${slot}' delta must be a finite number, got ${delta}`);
    if(result == null) throw new Error(`mkOutcome: '${slot}' missing result`);
    _validateRound(slot, detail);
  }
  return { slot, delta, result, ...detail };
}

// Game-agnostic history and net helpers, used by the results screen and share text. The per-game
// history field lives on the GAMES registry entry (historyKey); games without one (roulette/ladder
// record a singleton, not a per-hand history) yield [] so callers always get an array.
function gameHistory(g){ return S[GAMES[g]?.historyKey] || []; }
// Non-finite deltas (undefined, NaN) are skipped rather than poisoning the whole sum.
function gameNet(g){ return gameHistory(g).reduce((a,h)=>a+(Number.isFinite(h.delta)?h.delta:0),0); }
// Every settled round of this run, in canonical form: the two played game slots' histories plus the
// roulette and ladder records (singletons: each runs once). The single list recalcChips and a
// future server replay iterate, with no per-game special-casing.
function settledOutcomes(){ return [...gameHistory(GAME1), ...gameHistory(GAME2), ...(S.rResult ? [S.rResult] : []), ...(S.ladResult ? [S.ladResult] : [])]; }
// Recomputes the run's chip total from recorded history, so a stale or edited save can't inflate a
// score. Borrowed chips count as part of the effective starting stack. Returns NaN if history is
// corrupt; callers fall back to the saved value. The single place loadState and advanceTo get this from.
// Credit only the borrow actually taken: borrowChips() sets S.borrowAmount (>= BORROW_AMOUNT);
// declineBorrow() also sets borrowUsed (to gate the re-prompt and the ladder detour) but takes no
// loan, leaving borrowAmount 0. So a declined "Accept defeat" must add 0, not fall back to
// BORROW_AMOUNT: otherwise giving up hands out a free 50 that the Transcript never records, and the
// server replay (which only sees logged borrows) would disagree with the client.
function recalcChips(){ return START_CHIPS + (S.borrowUsed ? S.borrowAmount : 0) + settledOutcomes().reduce((a,r)=>a+(Number.isFinite(r.delta)?r.delta:0),0); }
// Upgrades pre-v1.42 settled records to the canonical {slot,result,...} shape on load. Score is
// unaffected (delta was always present and is what recalcChips reads); this keeps the result-screen
// readers, which now use the unified `result` field (ladder's old `outcome`), working for a run
// saved mid-result before this version shipped. Safe to call more than once.
function _normalizeRounds(){
  [['bj', S.bjHistory], ['uth', S.uthHistory], ['pk', S.pkHistory]].forEach(([g, arr]) => {
    if (Array.isArray(arr)) arr.forEach(r => { if (r && r.slot == null) r.slot = g; });
  });
  const r = S.rResult;
  if (r && r.slot == null) { r.slot = 'r'; if (r.result == null) r.result = r.skipped ? 'skipped' : r.delta > 0 ? 'win' : r.delta < 0 ? 'lose' : 'push'; }
  const l = S.ladResult;
  if (l && l.slot == null) { l.slot = 'lad'; if (l.result == null) l.result = l.outcome; }
}

// ─── RUN TRANSCRIPT ────────────────────────────────────────────────────────
// Append-only log of every replay-relevant player decision: bets and moves in each game,
// the borrow, the Player's Choice pick, Time Travel re-deals, and the locked roulette bets.
// Persisted with the run state and sent with the leaderboard submission, where it's stored
// for auditing and, in integrity Phase 2, replayed server-side to recompute the score
// (see .claude/LEADERBOARD-INTEGRITY.md). Dealer peeks are NOT logged (no chip/card effect).
// Persistence rides the caller's existing saveState()/render() flow.
// Call sites use tx(g, a, extra) (below, wraps TX_SHAPE), not txLog directly: tx fills g/a/h so the
// game files just pass the fields that vary per action.
//
// Allowed transcript events per game (and 'sys'), each mapped to the fields its server replay
// reads. This is what catches typos in the Transcript, the same way ROUND_DETAIL_KEYS does for
// settled rounds. A decision written with the wrong `g`/`a`, or missing a field the engine needs
// (a 'uth' deal with no `ante`, `bett` for `bet`), would otherwise pass silently and only surface
// later as a Phase-2 replay mismatch. Listed fields must be present (!== undefined); `g` and `a`
// are always required, `h` is added automatically (see _TX_HAND_KEY below).
const TX_SHAPE = {
  bj:  { skip:[], deal:['bet'], pick:['s'], hit:[], stand:[], double:[], split:[] },
  uth: { skip:[], deal:['ante'], timetravel:['st'], raise:['mult'], check:[], fold:[] },
  pk:  { skip:[], deal:['bet'], draw:['held'] },
  lad: { stake:['v'], hi:[], lo:[], cash:[] },
  r:   { skip:[], spin:['bets'], keep:[] },
  sys: { borrow:['amt'], pick:['mod'] },
};
function _validateTx(e){
  if(!e || typeof e !== 'object') throw new Error(`txLog: event must be an object, got ${e}`);
  const actions = TX_SHAPE[e.g];
  if(!actions) throw new Error(`txLog: unknown game '${e.g}'`);
  const required = actions[e.a];
  if(!required) throw new Error(`txLog: unknown '${e.g}' action '${e.a}'. Expected one of: ${Object.keys(actions).join(', ')}`);
  for(const k of required) if(e[k] === undefined) throw new Error(`txLog: '${e.g}' ${e.a} missing required field '${k}'`);
}
// Validated at write time in strict mode (dev/test) only: an unexpected production shape must
// never crash a live run, but a typo blows up loudly the moment it's written, not days later.
function txLog(e){
  if(_strictRounds()) _validateTx(e);
  if(Array.isArray(S.tx)) S.tx.push(e);
}

// The S field each per-hand game reads its current hand index from. This is tx()'s only piece of
// per-game knowledge beyond TX_SHAPE itself. Ladder/roulette/sys have no hand counter (a run/spin/
// system event isn't "hand N"), so they're absent here and tx() omits `h` for them.
const _TX_HAND_KEY = { bj:'bjHand', uth:'uthHand', pk:'pkHand' };
// The one place every transcript write goes through: fills `g`/`a` (plus `h` when this game tracks
// a hand), merges in the action's own fields, and hands the assembled event to txLog for
// validation. Call sites shrink to just the fields that vary (e.g. tx('bj','deal',{bet:S.bjBet}))
// instead of writing out {g,a,h,...} every time, and the mapping from an action to its required
// fields still lives in one place: TX_SHAPE.
function tx(g, a, extra){
  const e = { g, a };
  const hk = _TX_HAND_KEY[g];
  if(hk) e.h = S[hk];
  if(extra) Object.assign(e, extra);
  txLog(e);
}
