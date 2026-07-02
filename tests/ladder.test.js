// ─── The Ladder tests ────────────────────────────────────────────────────────
// Covers: seeded sequence, rank/tie comparison, pot math, the run state machine
// (stake → climb → cash/crash/top), routing, and share-text lines.

describe('Ladder — seeded sequence', () => {
  it('DEAL.ladderCards has 8 card objects from the shared deck', () => {
    assertEqual(DEAL.ladderCards.length, 8);
    DEAL.ladderCards.forEach(c => {
      assert(RANKS.includes(c.r), `rank ${c.r} valid`);
      assert(SUITS.includes(c.s), `suit ${c.s} valid`);
    });
  });
});

describe('Ladder — rank compare', () => {
  it('A is high, 2 is low', () => {
    assert(ladRankVal('A') > ladRankVal('K'), 'A beats K');
    assert(ladRankVal('2') < ladRankVal('3'), '2 under 3');
  });
  it('correct directional calls', () => {
    assertEqual(ladCallCorrect({r:'5',s:'♠'}, {r:'9',s:'♥'}, 'hi'), true);
    assertEqual(ladCallCorrect({r:'5',s:'♠'}, {r:'9',s:'♥'}, 'lo'), false);
    assertEqual(ladCallCorrect({r:'K',s:'♦'}, {r:'2',s:'♣'}, 'lo'), true);
  });
  it('tie loses regardless of call', () => {
    assertEqual(ladCallCorrect({r:'J',s:'♠'}, {r:'J',s:'♥'}, 'hi'), false);
    assertEqual(ladCallCorrect({r:'J',s:'♠'}, {r:'J',s:'♥'}, 'lo'), false);
  });
});

describe('Ladder — pot math', () => {
  it('rounds from the original stake, not compounding', () => {
    assertEqual(ladPotAt(250, 0), 250);   // before first rung
    assertEqual(ladPotAt(250, 1), 375);   // ×1.5
    assertEqual(ladPotAt(250, 2), 550);   // ×2.2
    assertEqual(ladPotAt(250, 3), 800);   // ×3.2
    assertEqual(ladPotAt(250, 7), 5250);  // ×21 top
  });
  it('odd stakes round to whole chips', () => {
    assertEqual(ladPotAt(25, 2), 55);     // 25×2.2
    assertEqual(ladPotAt(35, 1), 53);     // 35×1.5 = 52.5 → 53
  });
});

// ─── State-machine harness ───────────────────────────────────────────────────
// Thin adapter over the shared tests/game-harness.js withGame(): same call signature as
// before (Object.assign the Ladder slice + chips/tx/forcedMod/screen, run fn(), restore).
// The old hand-rolled version snapshotted only a fixed KEYS list; withGame snapshots the
// FULL S instead, which is a strict superset (see game-harness.js for the contract), so
// nothing that used to be restored here is lost. It also always resets S.tx to [] before
// applying overrides, matching the old behavior (each Ladder test starts with a clean tx).
registerGameBuilder('ladder', overrides => {
  S.tx = [];
  Object.assign(S, overrides);
});
function withLad(overrides, fn){
  withGame('ladder', overrides, fn);
}
function withLadCards(cards, fn){
  const p=DEAL.ladderCards; DEAL.ladderCards=cards;
  try{fn();}finally{DEAL.ladderCards=p;}
}
const _lc=(r)=>({r,s:'♠'});
const _lcSeq=['5','9','J','3','8','8','2','K'].map(_lc); // hi,hi,lo,hi correct; idx4→5 ties (8,8)

describe('Ladder — stake', () => {
  it('standalone stake moves to climb and logs', () => {
    withLad({ladPhase:'bet',ladBet:100,ladFree:false,chips:1000,forcedMod:{},screen:null}, () => {
      ladStakeCommit();
      assertEqual(S.ladPhase,'climb');
      assertEqual(S.ladRung,0);
      assertDeepEqual(S.tx[S.tx.length-1],{g:'lad',a:'stake',v:100});
    });
  });
  it('free entry locks the stake to the mod value', () => {
    withLad({ladPhase:'bet',ladBet:0,ladFree:false,chips:0,forcedMod:{ladder_free:250},screen:null}, () => {
      ladStakeCommit();
      assertEqual(S.ladPhase,'climb');
      assertEqual(S.ladBet,250);
      assertEqual(S.ladFree,true);
    });
  });
  it('standalone rejects a stake above the 25% cap', () => {
    withLad({ladPhase:'bet',ladBet:500,ladFree:false,chips:1000,forcedMod:{},screen:null}, () => {
      ladStakeCommit();
      assertEqual(S.ladPhase,'bet','stake above cap stays in bet phase');
    });
  });
});

describe('Ladder — climb and settle', () => {
  it('correct call climbs a rung', () => {
    withLadCards(_lcSeq, () => withLad({ladPhase:'climb',ladBet:100,ladFree:false,ladIdx:0,ladRung:0,chips:1000,forcedMod:{},screen:null}, () => {
      ladCall('hi'); // 5 → 9
      assertEqual(S.ladRung,1);
      assertEqual(S.ladIdx,1);
      assertEqual(S.ladPhase,'climb');
    }));
  });
  it('wrong call crashes: standalone loses the stake', () => {
    withLadCards(_lcSeq, () => withLad({ladPhase:'climb',ladBet:100,ladFree:false,ladIdx:0,ladRung:0,chips:1000,forcedMod:{},screen:null}, () => {
      ladCall('lo'); // 5 → 9 is higher
      assertEqual(S.ladPhase,'done');
      assertEqual(S.ladResult.result,'crash');
      assertEqual(S.ladResult.delta,-100);
      assertEqual(S.chips,900);
    }));
  });
  it('tie crashes even on a correct-direction call', () => {
    withLadCards(_lcSeq, () => withLad({ladPhase:'climb',ladBet:100,ladFree:true,ladIdx:4,ladRung:4,chips:1000,forcedMod:{ladder_free:250},screen:null}, () => {
      ladCall('hi'); // 8 → 8 ties
      assertEqual(S.ladResult.result,'crash');
      assertEqual(S.ladResult.delta,0,'free entry crash costs nothing');
      assertEqual(S.chips,1000);
      assertEqual(S.ladResult.rung,4,'records rungs climbed');
    }));
  });
  it('cash out: standalone credits pot minus stake', () => {
    withLad({ladPhase:'climb',ladBet:100,ladFree:false,ladIdx:3,ladRung:3,chips:1000,forcedMod:{},screen:null}, () => {
      ladCashOut(); // pot = 100×3.2 = 320
      assertEqual(S.ladResult.result,'cash');
      assertEqual(S.ladResult.delta,220);
      assertEqual(S.chips,1220);
    });
  });
  it('cash out: free entry credits the full pot', () => {
    withLad({ladPhase:'climb',ladBet:250,ladFree:true,ladIdx:3,ladRung:3,chips:1000,forcedMod:{ladder_free:250},screen:null}, () => {
      ladCashOut(); // pot = 250×3.2 = 800
      assertEqual(S.ladResult.delta,800);
      assertEqual(S.chips,1800);
    });
  });
  it('cannot cash out before the first rung', () => {
    withLad({ladPhase:'climb',ladBet:100,ladFree:false,ladIdx:0,ladRung:0,chips:1000,forcedMod:{},screen:null}, () => {
      ladCashOut();
      assertEqual(S.ladPhase,'climb','still climbing');
      assertEqual(S.ladResult,null);
    });
  });
  it('reaching rung 7 auto-cashes as top', () => {
    const seq=['2','3','4','5','6','7','8','9'].map(_lc); // hi correct 7 times
    withLadCards(seq, () => withLad({ladPhase:'climb',ladBet:250,ladFree:true,ladIdx:6,ladRung:6,chips:0,forcedMod:{ladder_free:250},screen:null}, () => {
      ladCall('hi'); // 8 → 9, rung 7 = top
      assertEqual(S.ladResult.result,'top');
      assertEqual(S.ladResult.rung,7);
      assertEqual(S.ladResult.delta,5250);
      assertEqual(S.chips,5250);
    }));
  });
  it('every action logs to the transcript', () => {
    withLadCards(_lcSeq, () => withLad({ladPhase:'climb',ladBet:100,ladFree:false,ladIdx:0,ladRung:0,chips:1000,forcedMod:{},screen:null}, () => {
      ladCall('hi'); ladCashOut();
      assertDeepEqual(S.tx,[{g:'lad',a:'hi'},{g:'lad',a:'cash'}]);
    }));
  });
});

describe('Ladder — share text', () => {
  it('cash out: chips bare, rung in parentheses', () => {
    withLad({ladResult:{delta:1250,rung:4,result:'cash',free:true}}, () => {
      assert(buildShareText().includes('🪜 The Ladder +1,250 (Rung 4)'), buildShareText());
    });
  });
  it('top of the ladder gets the Top! tag', () => {
    withLad({ladResult:{delta:5250,rung:7,result:'top',free:true}}, () => {
      assert(buildShareText().includes('🪜 The Ladder +5,250 (Rung 7 · Top!)'), buildShareText());
    });
  });
  it('free-entry crash: no chip number, owns the drama', () => {
    withLad({ladResult:{delta:0,rung:3,result:'crash',free:true}}, () => {
      const line = buildShareText().split('\n').find(l => l.includes('🪜'));
      assertEqual(line, '🪜 The Ladder · Crashed (Rung 4)', 'exact line, no +0');
    });
  });
  it('real-bet crash shows the loss', () => {
    withLad({ladResult:{delta:-100,rung:3,result:'crash',free:false}}, () => {
      assert(buildShareText().includes('🪜 The Ladder -100 · Crashed (Rung 4)'), buildShareText());
    });
  });
  it('no ladder line when the run was not played', () => {
    withLad({ladResult:null}, () => {
      assert(!buildShareText().includes('🪜'), 'no ladder line');
    });
  });
});

describe('Ladder — modifier config', () => {
  it('ladder_day preset fields', () => {
    const p = PRESET_MODIFIERS.ladder_day;
    assert(!!p, 'preset exists');
    assertEqual(p.type, 'cross');
    assertEqual(p.ladder_free, 250);
    assertEqual(p.title, 'The Ladder');
    assert(!p.desc.includes('—'), 'no em dashes in player-facing desc');
    assert(!p.title.includes('—'), 'no em dashes in title');
  });
  it('scheduled in the cycle and pinned for launch', () => {
    assert(CYCLE_ORDER.includes('ladder_day'), 'in the rotation');
    assertEqual(DAILY_MODIFIERS[20260614], 'ladder_day', 'launch pin on June 14');
    assertEqual(DAILY_MODIFIERS[20260613], 'r_color_lock', 'Loaded Colors launches the day before');
  });
});

describe('Ladder — routing', () => {
  // rResult set ⇒ roulette is done and the borrow window is closed (_canShowBorrow false).
  it('advanceTo(results) detours to the free ladder once roulette is done', () => {
    withLad({forcedMod:{ladder_free:250},ladPhase:'bet',ladResult:null,chips:1000,rResult:{delta:0},screen:'roulette'}, () => {
      advanceTo('results');
      assertEqual(S.screen,'ladder');
    });
  });
  it('no detour once the run is played', () => {
    withLad({forcedMod:{ladder_free:250},ladPhase:'done',ladResult:{delta:0,rung:1,result:'crash',free:true},chips:1000,rResult:{delta:0},screen:'roulette'}, () => {
      advanceTo('results');
      assertEqual(S.screen,'results');
    });
  });
  it('no detour on normal days', () => {
    withLad({forcedMod:{},ladResult:null,chips:1000,rResult:{delta:0},screen:'roulette'}, () => {
      advanceTo('results');
      assertEqual(S.screen,'results');
    });
  });
  it('busted player still reaches the free ladder', () => {
    withLad({forcedMod:{ladder_free:250},ladPhase:'bet',ladResult:null,chips:0,borrowUsed:true,rResult:{delta:-50},screen:'roulette'}, () => {
      advanceTo('results');
      assertEqual(S.screen,'ladder');
    });
  });
  it('no detour while the borrow offer is still open', () => {
    withLad({forcedMod:{ladder_free:250},ladPhase:'bet',ladResult:null,chips:1500,borrowUsed:false,rResult:null,screen:'bj'}, () => {
      advanceTo('results');
      assertEqual(S.screen,'results');
    });
  });
});

describe('Ladder — roulette advance prompt', () => {
  it('prompts the climb on an unplayed ladder day', () => {
    withLad({forcedMod:{ladder_free:250},ladResult:null}, () => {
      assertEqual(_rNextLabel(), 'Bonus Round: The Ladder →');
    });
  });
  it('says final results once the ladder is played', () => {
    withLad({forcedMod:{ladder_free:250},ladResult:{delta:0,rung:1,result:'crash',free:true}}, () => {
      assertEqual(_rNextLabel(), 'See Final Results →');
    });
  });
  it('says final results on a normal day', () => {
    withLad({forcedMod:{},ladResult:null}, () => {
      assertEqual(_rNextLabel(), 'See Final Results →');
    });
  });
});

// ─── Pure Ladder resolver (PRD integrity Phase 2 · Candidate 02) ──────────────
// The settled-run chip outcome tested through its interface — (outcome, bet, rung, free) → {delta,
// result}. No S, no DOM, no credit. Expected pots come from the pure ladPotAt so the test tracks the
// real multiplier table.
describe('resolveLadder — settled-run chip outcome (pure)', () => {
  it('a staked crash loses the bet; a free crash costs nothing', () => {
    assertEqual(resolveLadder('crash', 250, 3, false).delta, -250);
    assertEqual(resolveLadder('crash', 250, 3, true).delta, 0);
  });
  it('a staked cash-out nets pot − bet; a free cash-out keeps the whole pot', () => {
    const pot = ladPotAt(250, 3);
    assertEqual(resolveLadder('cash', 250, 3, false).delta, pot - 250);
    assertEqual(resolveLadder('cash', 250, 3, true).delta, pot);
  });
  it('reaching the top settles like a cash-out', () => {
    const pot = ladPotAt(250, 5);
    assertEqual(resolveLadder('top', 250, 5, false).delta, pot - 250);
    assertEqual(resolveLadder('top', 250, 5, true).delta, pot);
  });
  it('carries the outcome through as result', () => {
    assertEqual(resolveLadder('cash', 250, 2, false).result, 'cash');
  });
});

// The credit mapping as pure data (Candidate 5): ladderAward is the only ledger that can carry a
// debit (a staked crash). Zero is a no-op (a free-entry crash).
describe('ladderAward — settlement ledger (pure)', () => {
  it('positive delta credits, negative delta debits, zero is a no-op', () => {
    assertDeepEqual(ladderAward(500), [{ op: 'credit', n: 500, reason: 'ladder' }]);
    assertDeepEqual(ladderAward(-250), [{ op: 'debit', n: 250, reason: 'ladder' }]);
    assertDeepEqual(ladderAward(0), []);
  });
});
