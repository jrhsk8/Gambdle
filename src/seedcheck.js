// ─── FUTURE-SEED CHECKER (dev-only) ─────────────────────────────────────────────
// A dev page (?dev=true → Developer ▸ Seed Checker) that scans the next 30 calendar days and flags
// seeds that would force players to lose — the brutal days worth remapping via DAILY_SEED_OVERRIDES
// before they go live. It answers two questions per day, both PURE functions of the seed + that day's
// modifier (no DOM, no S, no network):
//
//   • UTH guaranteed losses (the must-have): for each of the 3 Hold'em hands, the cards are locked
//     at uthDeck[9N..] (or a per-hand fresh deck under pocket-aces / suited-conn), and a showdown
//     loss is truly unwinnable — UTH has no bluffing and the blind bonus only pays on a WIN, so a
//     losing board forfeits ante+blind+play no matter how the player bets or folds. We count the
//     hands where the player's best 5 LOSES the showdown. No strategy model needed.
//
//   • BJ losses under basic strategy (best-effort): a BJ loss is never "guaranteed" (a different
//     decision could change it). Each hand draws from its OWN segment of the shoe (independent), and
//     we play it out off a standard S17 basic-strategy table incl. DAS pair-splits + resplit, via the
//     shared bjSplitStep (engine.js). We count hands that net a loss (a split hand: sub-hands net < 0).
//
// Roulette is excluded: its outcome comes from server-fetched spin words, not the daily seed, so a
// future day's wheel is not predictable. Magnitudes/EV are out of scope — this is a loss TALLY.
//
// CORRECTNESS: the deal MUST match live/replay exactly or the verdicts silently rot. We reuse the
// engine's shared deal twins (uthHandCards, bjFirstAceSwap, _replaySafeHitSwap), the shared rule
// bundles (bjRulesFor/uthRulesFor — so a modifier's scalar/flag reads can't drift from bj.js/uth.js),
// and the same pure resolvers (bestOf7, resolveUTH, resolveBJHand/resolveBJSplitHand) the game and
// server use — one source of truth, no duplication. The only genuinely checker-private logic is the
// basic-strategy DECISION TABLE below (_scStratAction/_scPairAction/_scAction): the game has no bot,
// so there is no shared "what would the player do" policy to route through.
// Three modifiers undermine the "forced" claim because the player can change the outcome by a choice
// (uth_time_travel re-deals, bj_two_hands picks one of two hands, all_in_or_skip can skip a hand) —
// those days, plus Player's Choice days, are computed at their no-action baseline and FLAGGED.

const _SC_DAYS = 30;                  // horizon: scan today → +29 days
let _scSort = 'total';                // active sort column (date | mod | uth | bj | total)

// Modifiers whose presence lets the player dodge an otherwise-forced loss by a decision; on these
// days the tally is a no-action baseline, not a guarantee, so the row is flagged.
const _SC_FORK_KEYS = ['uth_time_travel', 'bj_two_hands', 'all_in_or_skip'];

// ─── Date / seed math (mirrors getDailySeed / getDayNum, core.js) ──────────────
function _scSeedToDate(seed){
  const y = Math.floor(seed / 10000), m = Math.floor((seed % 10000) / 100) - 1, d = seed % 100;
  return new Date(Date.UTC(y, m, d));
}
function _scDateToSeed(dt){
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
}
function _scAddDays(seed, n){
  const dt = _scSeedToDate(seed); dt.setUTCDate(dt.getUTCDate() + n); return _scDateToSeed(dt);
}
function _scDayNumOf(seed){
  return Math.floor((_scSeedToDate(seed).getTime() - START_DATE_UTC) / 86400000) + 1;
}
const _SC_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _SC_WD  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function _scFmtDate(seed){
  const dt = _scSeedToDate(seed);
  return `${_SC_MON[dt.getUTCMonth()]} ${String(dt.getUTCDate()).padStart(2, '0')} · ${_SC_WD[dt.getUTCDay()]}`;
}

// ─── Standard basic strategy (S17, no split, no surrender) ──────────────────────
// Returns 'H' (hit), 'S' (stand), 'Dh' (double else hit), 'Ds' (double else stand). Dealer upcard
// `up` is the card value (A = 11). Approximate on easy_dealer (S15) days by design — BJ is best-
// effort, not a guarantee. Pairs are intentionally NOT split (v1 scope): they play by their total.
function _scStratAction(total, soft, up){
  if(soft){
    if(total >= 19) return 'S';                                   // soft 19,20,21
    if(total === 18) return (up >= 9 || up === 11) ? 'H' : (up >= 3 && up <= 6) ? 'Ds' : 'S';
    if(total === 17) return (up >= 3 && up <= 6) ? 'Dh' : 'H';
    if(total >= 15)  return (up >= 4 && up <= 6) ? 'Dh' : 'H';    // soft 15,16
    return (up >= 5 && up <= 6) ? 'Dh' : 'H';                     // soft 13,14
  }
  if(total >= 17) return 'S';
  if(total >= 13) return (up >= 2 && up <= 6) ? 'S' : 'H';        // 13-16
  if(total === 12) return (up >= 4 && up <= 6) ? 'S' : 'H';
  if(total === 11) return (up <= 10) ? 'Dh' : 'H';               // double vs 2-10, hit vs A
  if(total === 10) return (up <= 9) ? 'Dh' : 'H';               // double vs 2-9
  if(total === 9)  return (up >= 3 && up <= 6) ? 'Dh' : 'H';
  return 'H';                                                     // <= 8
}

// Standard DAS (double-after-split allowed, as this game does) pair-split table → 'P' (split) or null
// (play the pair by its total). `up` is the dealer upcard value (A = 11). Only true rank-pairs split;
// on wild_split days non-pairs still aren't split (the 2× payout applies via spm at settlement).
function _scPairAction(rank, up){
  if(rank === 'A' || rank === '8') return 'P';                              // always
  if(rank === '5' || rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return null; // never (10 / 20)
  if(rank === '9') return (up <= 9 && up !== 7) ? 'P' : null;               // 2-6, 8, 9
  if(rank === '7') return (up >= 2 && up <= 7) ? 'P' : null;
  if(rank === '6') return (up >= 2 && up <= 6) ? 'P' : null;
  if(rank === '4') return (up >= 5 && up <= 6) ? 'P' : null;
  if(rank === '2' || rank === '3') return (up >= 2 && up <= 7) ? 'P' : null;
  return null;
}

// Resolve a non-pair hand's basic-strategy call into a concrete move ('hit'|'stand'|'double'), applying
// the double-else-hit / double-else-stand fallback when doubling isn't available.
function _scAction(hand, up, canDouble){
  const { total, soft } = hValSoft(hand);      // shared with core.js's hVal (no private re-derivation)
  let a = _scStratAction(total, soft, up);
  if(a === 'Dh') a = canDouble ? 'D' : 'H';
  else if(a === 'Ds') a = canDouble ? 'D' : 'S';
  return a === 'D' ? 'double' : a === 'H' ? 'hit' : 'stand';
}

// ─── Per-day compute ────────────────────────────────────────────────────────────
function _scModAccessor(modObj){
  return key => (modObj && modObj[key] !== undefined ? modObj[key] : null);
}

// Count of the 3 UTH hands the player LOSES at showdown (truly unwinnable). Pure; no betting walk
// needed — the verdict is just the best-5 comparison, exactly what resolveUTH keys off (cmp < 0).
function _scUthLosses(deal, mod, seed){
  const R = uthRulesFor(mod);   // shared UTH rule bundle; resolveUTH only reads the qualify/boost keys
  let n = 0;
  for(let hand = 0; hand < 3; hand++){
    const { hole, dealer, comm, priv } = uthHandCards(deal, mod, hand, seed);
    const pb = bestOf7([...hole, ...comm, ...priv]);
    const db = bestOf7([...dealer, ...comm]);
    // Nominal 1-chip stakes: resolveUTH's result category ('win'/'push'/'lose') is decided purely by
    // the pb/db score comparison, independent of stake size — routing through it (instead of a private
    // `pb.score < db.score`) means the live win/lose rule can't drift from what the checker counts.
    const res = resolveUTH(pb, db, 1, 1, 1, { wm: 1, ...R });
    if(res.result === 'lose') n++;
  }
  return n;
}

// Count of the 3 BJ hands that net a loss under basic strategy. Each hand draws from its OWN fixed
// segment of the shoe (bjSegStart), so hands are independent — but within a hand the player still
// hits / doubles / splits in sequence, so we play each out under a standard table. Mirrors the live
// deal, the shared bjSplitStep, the dealer draw, and resolve exactly. Splits/doubles assume sufficient
// chips (nominal — no balance tracking, consistent with a count). A split hand is one loss if its
// sub-hands net < 0.
function _scBjLosses(deal, mod, seed){
  const Rbj = bjRulesFor(mod);         // shared BJ rule bundle (same builder bjRules()/_replayBJHand use)
  const twoHands = Rbj.twoHands;
  const stand17 = Rbj.standAt;
  const bjMult = Rbj.payout;
  const spm = Rbj.wildSplit ? 2 : 1;
  const contCursor = { idx: 0 };       // continuous cursor — used pre-cutover, when segments are gated off
  let losses = 0;

  for(let hand = 0; hand < 3; hand++){
    let shoe, segEnd, cursor;
    if(twoHands){
      shoe = shuffle(buildDeck(), mkRng(seed + (hand + 1) * 97));   // Double Vision: fresh per-hand deck
      cursor = { idx: 0 }; segEnd = shoe.length;
    } else {
      shoe = deal.bjShoe;
      const seg = bjSegStart(shoe.length, hand, seed);              // this hand's segment; null pre-cutover
      if(seg !== null) contCursor.idx = seg;                        // segmented: reset per hand; else accumulate
      cursor = contCursor;
      segEnd = bjSegStart(shoe.length, hand + 1, seed);             // null → unbounded (swap helpers default)
      bjFirstAceSwap(shoe, cursor.idx, mod, segEnd);
    }
    const draw = () => shoe[cursor.idx++];

    let player, dealer;
    if(twoHands){
      const A = [draw(), draw()], B = [draw(), draw()];
      dealer = [draw(), draw()];
      player = isBJ(A) ? A : isBJ(B) ? B : (hVal(A) >= hVal(B) ? A : B); // keep a natural, else higher total
    } else {
      player = [draw(), draw()];
      dealer = [draw(), draw()];
    }
    const up = cVal(dealer[0].r);   // shared card-value primitive (core.js) — same upcard value hVal uses

    const pBJ = isBJ(player), dBJ = isBJ(dealer);
    if(pBJ || dBJ){
      // Naturals end the hand before the player acts (casino peek). A player BJ vs a non-BJ dealer
      // STILL draws the dealer to 17+, consuming its segment — pin that to match the live game.
      if(!dBJ){ while(hVal(dealer) < stand17) dealer.push(draw()); }
      const res = resolveBJHand({ pv: hVal(player), pBJ, dv: hVal(dealer), dBJ: isBJ(dealer), bet: 1, wm: 1, bjMult, ddm: 1 });
      if(res.delta < 0) losses++;
      continue;
    }

    // Basic strategy splits this opening pair → play it through the shared split stepper.
    if(player[0].r === player[1].r && _scPairAction(player[0].r, up) === 'P'){
      const { hands, bets, doubled, dealer: dlr } = bjSplitStep({
        pair: player, dealer, bet0: 1, mod, stand17, draw,
        acct: { chips: Infinity, debit(){} },                        // nominal: splits/doubles always afforded
        beforeHit: (h) => _replaySafeHitSwap(shoe, cursor.idx, h, mod, segEnd),
        nextAction: (h, ctx) =>
          (ctx.canResplit && h[0].r === h[1].r && _scPairAction(h[0].r, up) === 'P')
            ? 'split' : _scAction(h, up, ctx.canDouble),
        fail: (r) => { throw new Error('seedcheck split: ' + r); },
      });
      const dvFinal = hVal(dlr);
      let net = 0;
      for(let h = 0; h < hands.length; h++){
        const ddm = (Rbj.doubleBonus && doubled[h]) ? 2 : 1;
        net += resolveBJSplitHand({ pv: hVal(hands[h]), dv: dvFinal, bet: bets[h], wm: 1, ddm, spm }).delta;
      }
      if(net < 0) losses++;
      continue;
    }

    // Straight (no-split) play.
    let bet = 1, doubled = false;
    while(true){
      const a = _scAction(player, up, player.length === 2);
      if(a === 'double'){ player.push(draw()); doubled = true; bet = 2; break; } // no safe-hit on double (mirrors engine)
      if(a === 'hit'){
        _replaySafeHitSwap(shoe, cursor.idx, player, mod, segEnd);  // Soft Landing: first hit can't bust (no-op off-mod)
        player.push(draw());
        if(hVal(player) >= 21) break;
        continue;
      }
      break; // stand
    }
    while(hVal(dealer) < stand17) dealer.push(draw());
    const ddm = (Rbj.doubleBonus && doubled) ? 2 : 1;
    const res = resolveBJHand({ pv: hVal(player), pBJ: false, dv: hVal(dealer), dBJ: isBJ(dealer), bet, wm: 1, bjMult, ddm });
    if(res.delta < 0) losses++;
  }
  return losses;
}

// Evaluate one resolved modifier preset (or null for a vanilla day) against a seed → { uth, bj }.
function _scEvalMod(seed, modObj){
  const mod = _scModAccessor(modObj);
  const rngSeed = replayRngSeed(seed);   // DAILY_SEED_OVERRIDES applied, exactly like getRngSeed
  const deal = buildDeal(rngSeed);       // pure; fresh per call (BJ swaps mutate the shoe in place)
  return { uth: _scUthLosses(deal, mod, rngSeed), bj: _scBjLosses(deal, mod, rngSeed) };
}

function _scDecisionAffected(baseMod){
  if(!baseMod) return false;
  if(baseMod.choices) return true;                              // Player's Choice: mod itself is picked
  return _SC_FORK_KEYS.some(k => baseMod[k] !== undefined);
}

// Scan `n` calendar days from `startSeed`. Pure. Each row: { seed, dayNum, date, modTitle, choice,
// decisionAffected, uth:{lo,hi}, bj:{lo,hi}, variants? }. On Player's Choice days every pick is
// evaluated and the cell shows the lo–hi range across them.
function scanSeedDays(startSeed, n){
  const rows = [];
  for(let k = 0; k < n; k++){
    const seed = _scAddDays(startSeed, k);
    const dayNum = _scDayNumOf(seed);
    const baseMod = resolveDayMod(seed, dayNum, null);          // preset object, or null (vanilla)
    const choice = !!(baseMod && baseMod.choices);
    let uth, bj, variants = null;

    if(choice){
      variants = baseMod.choices.map(key => {
        const r = _scEvalMod(seed, PRESET_MODIFIERS[key]);
        return { key, title: (PRESET_MODIFIERS[key] || {}).title || key, uth: r.uth, bj: r.bj };
      });
      uth = { lo: Math.min(...variants.map(v => v.uth)), hi: Math.max(...variants.map(v => v.uth)) };
      bj  = { lo: Math.min(...variants.map(v => v.bj)),  hi: Math.max(...variants.map(v => v.bj)) };
    } else {
      const r = _scEvalMod(seed, baseMod);
      uth = { lo: r.uth, hi: r.uth };
      bj  = { lo: r.bj,  hi: r.bj };
    }

    rows.push({
      seed, dayNum,
      date: _scFmtDate(seed),
      modTitle: baseMod ? (baseMod.title || '·') : 'None',
      override: replayRngSeed(seed) !== seed,                   // borrows another day's deck
      choice,
      decisionAffected: _scDecisionAffected(baseMod),
      uth, bj, variants,
    });
  }
  return rows;
}

// ─── Rendering ──────────────────────────────────────────────────────────────────
let _scSortDir = -1;                                            // 1 = ascending, -1 = descending
function _scTotal(r){ return r.uth.hi + r.bj.hi; }              // combined forced/likely losses, 0-6

// Sortable factors. Each compares ascending; _scSortDir flips it. Numeric keys use the worst-case
// (hi) end of a range so Player's Choice days rank by their most-brutal pick.
const _SC_CMP = {
  date:  (x, y) => x.seed - y.seed,
  mod:   (x, y) => x.modTitle.localeCompare(y.modTitle),
  uth:   (x, y) => x.uth.hi - y.uth.hi,
  bj:    (x, y) => x.bj.hi - y.bj.hi,
  total: (x, y) => _scTotal(x) - _scTotal(y),
  flag:  (x, y) => (x.decisionAffected ? 1 : 0) - (y.decisionAffected ? 1 : 0),
};
function _scSortRows(rows){
  const cmp = _SC_CMP[_scSort] || _SC_CMP.total;
  // Tiebreak worst-first then soonest-day so equal primary keys still read sensibly.
  return [...rows].sort((x, y) =>
    _scSortDir * cmp(x, y) || (_scTotal(y) - _scTotal(x)) || (x.seed - y.seed));
}
function _scCountColor(hi){
  return hi >= 3 ? '#e0564b' : hi === 2 ? '#e0a13a' : hi === 1 ? 'var(--gold-hi)' : 'var(--shadow)';
}
function _scTotalColor(t){
  return t >= 5 ? '#e0564b' : t >= 3 ? '#e0a13a' : t >= 1 ? 'var(--gold-hi)' : 'var(--shadow)';
}

// A loss count rendered as "n / 3" so the cell explains its own scale; ranges (Player's Choice) show
// "lo–hi / 3". Colored by the worst-case end.
function _scCell(c){
  const txt = c.lo === c.hi ? `${c.hi}` : `${c.lo}–${c.hi}`;
  return `<span style="color:${_scCountColor(c.hi)};font-weight:bold">${txt}</span><span style="color:var(--shadow);font-size:.85em"> /3</span>`;
}
// Inline severity-color key: the numbers 0-3 shown in the exact colors the table uses.
function _scColorKey(){
  return [0, 1, 2, 3].map(n =>
    `<b style="color:${_scCountColor(n)}">${n}</b>`).join('<span style="color:var(--shadow)"> · </span>');
}

function screenSeedCheck(){
  const start = getDailySeed();
  const rows = _scSortRows(scanSeedDays(start, _SC_DAYS));
  const arrow = key => _scSort === key ? (_scSortDir < 0 ? ' ▾' : ' ▴') : '';
  const th = (label, sub, key, align) =>
    `<th onclick="scSort('${key}')" title="tap to sort by ${label}" style="cursor:pointer;text-align:${align};padding:5px 6px;white-space:nowrap;border-bottom:2px solid var(--shadow);line-height:1.1">
       <span style="color:var(--gold-hi);font-weight:bold">${label}${arrow(key)}</span>${sub ? `<br><span style="color:var(--shadow);font-size:.82em;font-weight:normal">${sub}</span>` : ''}</th>`;

  const body = rows.map((r, i) => {
    const tot = _scTotal(r);
    const flag = r.decisionAffected ? `<span title="a player choice can change the result; the baseline is shown" style="color:#e0a13a"> ⚑</span>` : '';
    const ovr = r.override ? `<span title="this day borrows another day's deck (DAILY_SEED_OVERRIDES)" style="color:var(--shadow)"> ↺</span>` : '';
    const modCell = r.choice
      ? `<span title="${r.variants.map(v => `${v.title}: UTH ${v.uth}/3, BJ ${v.bj}/3`).join(' · ')}">${r.modTitle}</span>`
      : r.modTitle;
    const zebra = i % 2 ? 'background:rgba(0,0,0,0.14)' : '';
    return `<tr style="${zebra}">
      <td style="padding:4px 4px 4px 6px;white-space:nowrap;color:var(--cream);border-left:4px solid ${_scTotalColor(tot)}">${r.date}<span style="color:var(--shadow)"> #${r.dayNum}</span></td>
      <td style="padding:4px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0">${modCell}${flag}${ovr}</td>
      <td style="padding:4px 6px;text-align:center">${_scCell(r.uth)}</td>
      <td style="padding:4px 6px;text-align:center">${_scCell(r.bj)}</td>
      <td style="padding:4px 6px;text-align:center"><span style="color:${_scTotalColor(tot)};font-weight:bold">${tot}</span><span style="color:var(--shadow);font-size:.85em"> /6</span></td>
    </tr>`;
  }).join('');

  return `${hdr('Seed Checker')}
  <div class="panel">
    <div style="font-family:var(--btn-f);font-size:1.5rem;color:var(--gold-hi);text-align:center">Future Seed Checker</div>
    <div style="font-size:0.76rem;color:var(--cream);text-align:center;margin:3px 0 7px;line-height:1.4">
      For each of the next ${_SC_DAYS} days, how many hands a player is <b>forced to lose</b> (out of 3 per game).<br>
      <span style="color:var(--shadow)">lower is safer</span> &nbsp; ${_scColorKey()} &nbsp; <span style="color:#e0564b">brutal</span>
    </div>
    <div style="font-size:0.66rem;color:var(--cream);background:rgba(0,0,0,0.2);border:1px solid var(--shadow);border-radius:4px;padding:6px 9px;margin-bottom:8px;line-height:1.55">
      <b style="color:var(--gold-hi)">UTH</b> Hold'em: losses guaranteed at showdown &nbsp;·&nbsp;
      <b style="color:var(--gold-hi)">BJ</b> Blackjack: losses under basic strategy &nbsp;·&nbsp;
      <b style="color:var(--gold-hi)">Σ</b> both games combined<br>
      <span style="color:#e0a13a">⚑</span> a player choice can change it (baseline shown) &nbsp;·&nbsp;
      <span style="color:var(--shadow)">↺</span> deck borrowed from another day &nbsp;·&nbsp;
      Roulette is excluded (its spin is not set by the seed). Tap a column to sort, tap again to flip.
    </div>
    <div style="overflow-x:hidden;overflow-y:auto;max-height:48vh;border:1px solid var(--shadow);border-radius:4px">
      <table style="width:100%;border-collapse:collapse;font-size:0.74rem;table-layout:fixed">
        <colgroup><col style="width:28%"><col style="width:35%"><col style="width:13%"><col style="width:12%"><col style="width:12%"></colgroup>
        <thead><tr style="position:sticky;top:0;background:var(--felt-dark)">
          ${th('Date', '', 'date', 'left')}
          ${th('Modifier', '', 'mod', 'left')}
          ${th('UTH', 'lost', 'uth', 'center')}
          ${th('BJ', 'lost', 'bj', 'center')}
          ${th('Σ', 'of 6', 'total', 'center')}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div style="font-size:0.64rem;color:var(--shadow);text-align:center;margin-top:6px">Remap brutal seeds via DAILY_SEED_OVERRIDES.</div>
    <button class="btn-gold" onclick="goTo('intro')" style="margin-top:6px">← Close</button>
  </div>`;
}

// scSort + direction are file-private (called only from this page's own onclick handlers). Re-clicking
// the active column flips direction; a fresh column starts descending for loss/Σ, ascending for date/mod.
function scSort(key){
  if(_scSort === key) _scSortDir = -_scSortDir;
  else { _scSort = key; _scSortDir = (key === 'date' || key === 'mod') ? 1 : -1; }
  render();
}
