// ─── Seed Checker (dev-only future-day scanner) ─────────────────────────────────
// Covers the from-scratch logic most likely to harbour bugs: the basic-strategy table, the
// soft/hard total, and the loss-counting integration with the shared engine deal helpers
// (uthHandCards) + pure resolvers (bestOf7, resolveBJHand). Crafted decks pin exact counts.
const _scC = (r, s) => ({ r, s });

describe('Seed Checker — basic strategy table (_scStratAction)', () => {
  it('hard 16 vs 10 → hit',              () => assertEqual(_scStratAction(16, false, 10), 'H'));
  it('hard 16 vs 6 → stand',             () => assertEqual(_scStratAction(16, false, 6),  'S'));
  it('hard 12 vs 3 → hit',               () => assertEqual(_scStratAction(12, false, 3),  'H'));
  it('hard 12 vs 4 → stand',             () => assertEqual(_scStratAction(12, false, 4),  'S'));
  it('hard 11 vs 10 → double-else-hit',  () => assertEqual(_scStratAction(11, false, 10), 'Dh'));
  it('hard 11 vs A → hit',               () => assertEqual(_scStratAction(11, false, 11), 'H'));
  it('hard 10 vs 9 → double-else-hit',   () => assertEqual(_scStratAction(10, false, 9),  'Dh'));
  it('hard 10 vs 10 → hit',              () => assertEqual(_scStratAction(10, false, 10), 'H'));
  it('hard 9 vs 2 → hit',                () => assertEqual(_scStratAction(9,  false, 2),  'H'));
  it('hard 9 vs 3 → double-else-hit',    () => assertEqual(_scStratAction(9,  false, 3),  'Dh'));
  it('hard 17 → stand',                  () => assertEqual(_scStratAction(17, false, 11), 'S'));
  it('hard 8 → hit',                     () => assertEqual(_scStratAction(8,  false, 6),  'H'));
  it('soft 18 vs 9 → hit',               () => assertEqual(_scStratAction(18, true,  9),  'H'));
  it('soft 18 vs 4 → double-else-stand', () => assertEqual(_scStratAction(18, true,  4),  'Ds'));
  it('soft 18 vs 2 → stand',             () => assertEqual(_scStratAction(18, true,  2),  'S'));
  it('soft 19 → stand',                  () => assertEqual(_scStratAction(19, true,  6),  'S'));
  it('soft 13 vs 5 → double-else-hit',   () => assertEqual(_scStratAction(13, true,  5),  'Dh'));
  it('soft 13 vs 4 → hit',               () => assertEqual(_scStratAction(13, true,  4),  'H'));
});

describe('Seed Checker — hand total (_scHandTotal)', () => {
  it('A,6 = soft 17',   () => { const t = _scHandTotal([_scC('A','♠'), _scC('6','♦')]); assertEqual(t.total, 17); assertEqual(t.soft, true); });
  it('A,6,10 = hard 17',() => { const t = _scHandTotal([_scC('A','♠'), _scC('6','♦'), _scC('10','♣')]); assertEqual(t.total, 17); assertEqual(t.soft, false); });
  it('A,A = soft 12',   () => { const t = _scHandTotal([_scC('A','♠'), _scC('A','♦')]); assertEqual(t.total, 12); assertEqual(t.soft, true); });
  it('10,6 = hard 16',  () => { const t = _scHandTotal([_scC('10','♠'), _scC('6','♦')]); assertEqual(t.total, 16); assertEqual(t.soft, false); });
});

describe('Seed Checker — decision-affected detection (_scDecisionAffected)', () => {
  it('vanilla day not flagged',        () => assertEqual(_scDecisionAffected(null), false));
  it('payout mod not flagged',         () => assertEqual(_scDecisionAffected({ bj_payout: 3 }), false));
  it('Double Vision flagged',          () => assertEqual(_scDecisionAffected({ bj_two_hands: true }), true));
  it('Time Travel flagged',            () => assertEqual(_scDecisionAffected({ uth_time_travel: true }), true));
  it('All-in-or-skip flagged',         () => assertEqual(_scDecisionAffected({ all_in_or_skip: true }), true));
  it("Player's Choice container flagged",() => assertEqual(_scDecisionAffected({ choices: ['a','b','c'] }), true));
});

describe('Seed Checker — UTH forced-loss count (_scUthLosses)', () => {
  const vanilla = () => null;
  // Player junk + dealer pocket Kings sharing a King in the community → dealer trips beat player every
  // hand. uthHandCards (vanilla): hole dk[0,1], dealer dk[2,3], comm dk[4..8] per 9-card block.
  const lose = [
    _scC('2','♣'), _scC('5','♦'), _scC('K','♠'), _scC('K','♥'),
    _scC('K','♦'), _scC('9','♣'), _scC('4','♠'), _scC('7','♥'), _scC('3','♣'),
  ];
  const win = [ // hole/dealer swapped: player pocket Kings → trips, dealer junk
    _scC('K','♠'), _scC('K','♥'), _scC('2','♣'), _scC('5','♦'),
    _scC('K','♦'), _scC('9','♣'), _scC('4','♠'), _scC('7','♥'), _scC('3','♣'),
  ];
  it('all 3 hands lost at showdown → 3', () => assertEqual(_scUthLosses({ uthDeck: [...lose, ...lose, ...lose] }, vanilla, 0), 3));
  it('all 3 hands won → 0',              () => assertEqual(_scUthLosses({ uthDeck: [...win,  ...win,  ...win ] }, vanilla, 0), 0));
});

describe('Seed Checker — pair-split table (_scPairAction)', () => {
  it('AA always split',      () => assertEqual(_scPairAction('A', 6), 'P'));
  it('88 always split',      () => assertEqual(_scPairAction('8', 10), 'P'));
  it('TT never split',       () => assertEqual(_scPairAction('10', 6), null));
  it('55 never split',       () => assertEqual(_scPairAction('5', 6), null));
  it('99 split vs 9',        () => assertEqual(_scPairAction('9', 9), 'P'));
  it('99 stand vs 7',        () => assertEqual(_scPairAction('9', 7), null));
  it('99 stand vs 10',       () => assertEqual(_scPairAction('9', 10), null));
  it('22 split vs 7',        () => assertEqual(_scPairAction('2', 7), 'P'));
  it('22 no split vs 8',     () => assertEqual(_scPairAction('2', 8), null));
  it('44 split vs 5',        () => assertEqual(_scPairAction('4', 5), 'P'));
  it('44 no split vs 4',     () => assertEqual(_scPairAction('4', 4), null));
  it('66 split vs 6',        () => assertEqual(_scPairAction('6', 6), 'P'));
  it('66 no split vs 7',     () => assertEqual(_scPairAction('6', 7), null));
});

describe('Seed Checker — per-hand segment gate (bjSegStart)', () => {
  it('pre-cutover seed → null (continuous shoe)', () => assertEqual(bjSegStart(36, 1, 20260619), null));
  it('cutover seed → per-hand offset',           () => assertEqual(bjSegStart(36, 1, 20260620), 12));
  it('hand 0 always starts at 0 post-cutover',   () => assertEqual(bjSegStart(36, 0, 20260620), 0));
});

describe('Seed Checker — BJ basic-strategy loss count (_scBjLosses)', () => {
  const vanilla = () => null;
  const SEGSEED = 20260620; // ≥ BJ_SEGMENT_CUTOVER → per-hand segments (the behavior these shoes assume)
  // Each hand draws from its own segment (bjSegStart = hand × ⌊len/3⌋). Use 12-card blocks → 36-card
  // shoe → SEG = 12, so hand N's segment start lands exactly on block N. First 4 cards of a block are
  // player[0], player[1], dealer[0], dealer[1]; the rest is filler.
  const F = _scC('2','♣');
  const block = (...cards) => { const b = Array(12).fill(F); cards.forEach((c, i) => b[i] = c); return b; };
  it('player stands 17 vs dealer 18 → 3 losses', () => {
    const blk = block(_scC('10','♠'), _scC('7','♦'), _scC('10','♥'), _scC('8','♣')); // P=17 stand, D=18
    assertEqual(_scBjLosses({ bjShoe: [...blk, ...blk, ...blk] }, vanilla, SEGSEED), 3);
  });
  it('player 20 vs dealer 18 → 0 losses', () => {
    const blk = block(_scC('10','♠'), _scC('10','♦'), _scC('10','♥'), _scC('8','♣')); // pair-T plays as 20, no split
    assertEqual(_scBjLosses({ bjShoe: [...blk, ...blk, ...blk] }, vanilla, SEGSEED), 0);
  });
  it('split 8s, both sub-hands lose → counts as 1 loss', () => {
    // hand 0: 8,8 → split. sub0 = 8+10=18 stand; sub1 = 8+9=17 stand; dealer 10,9=19 → both lose.
    // Draw order in segment: idx0,1 player(8,8); idx2,3 dealer(10,9); idx4 sub0's 2nd card (10);
    // idx5 sub1's 2nd card (9). hands 1+2 are player blackjacks (wins → not losses).
    const split = block(_scC('8','♠'), _scC('8','♦'), _scC('10','♥'), _scC('9','♣'), _scC('10','♦'), _scC('9','♠'));
    const bjWin = block(_scC('A','♠'), _scC('10','♣'), _scC('10','♦'), _scC('7','♣')); // player BJ vs dealer 17
    assertEqual(_scBjLosses({ bjShoe: [...split, ...bjWin, ...bjWin] }, vanilla, SEGSEED), 1);
  });
});

describe('Seed Checker — scanSeedDays', () => {
  it('returns N rows',      () => assertEqual(scanSeedDays(20260701, 5).length, 5));
  it('is deterministic',    () => assertDeepEqual(scanSeedDays(20260701, 7), scanSeedDays(20260701, 7)));
  it('counts within [0,3]', () => {
    for (const r of scanSeedDays(20260701, 30)) {
      assert(r.uth.lo >= 0 && r.uth.hi <= 3 && r.uth.lo <= r.uth.hi, `UTH range ${r.uth.lo}-${r.uth.hi}`);
      assert(r.bj.lo  >= 0 && r.bj.hi  <= 3 && r.bj.lo  <= r.bj.hi,  `BJ range ${r.bj.lo}-${r.bj.hi}`);
    }
  });
  it('row carries date + dayNum + mod title', () => {
    const r = scanSeedDays(20260701, 1)[0];
    assert(typeof r.date === 'string' && r.date.length > 0, 'date string');
    assert(Number.isInteger(r.dayNum), 'dayNum int');
    assert(typeof r.modTitle === 'string', 'mod title string');
  });
});
