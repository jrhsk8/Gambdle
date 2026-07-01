/**
 * GAMBDLE RUN MODIFIERS CONFIGURATION
 *
 * HOW IT WORKS:
 * - Every day automatically gets a modifier via CYCLE_ORDER (cycling by day number).
 * - To override a specific date, add an entry to DAILY_MODIFIERS (YYYYMMDD key).
 *   Use a PRESET_MODIFIERS key string, or a full object for a one-off rule.
 * - Dev override: devApplyMod() stores to localStorage, reloads; cleared on load.
 *
 * AVAILABLE MODIFIER KEYS:
 * - bj_payout: 2.0          BJ payout multiplier (default 1.5)
 * - bj_dealer_stand: 15     Dealer stands on this value instead of 17
 * - bj_double_bonus: true   Successful double-downs pay 2× profit
 * - bj_first_ace: true      Player's first card each BJ hand is always an Ace
 * - bj_wild_split: true     Any two cards can be split (max 4 hands); split wins pay 2×
 * - bj_two_hands: true      BJ: dealt two starting hands each hand; pick one to play (naturals auto-pick). Fresh deck per hand
 * - bj_safe_hit: true       BJ: your first hit each hand (and each split hand) can't bust; swaps in the nearest safe card
 * - min_chips: 50           Minimum chip requirement
 * - chip_div: 100           Show chips at 1/100 scale (a 10-chip stack that scores ×100); display-only,
 *                           the internal balance/score/leaderboard stay full-scale. Pair with min_chips: 100.
 * - peek: 3                 Number of free dealer hole-card peeks per day (one per hand)
 * - comeback: true          Below starting chips (1000)? Wins pay 2×
 * - uth_blind_boost: 2.0    Blind bonus payouts multiplier
 * - uth_blind_extended: true Blind pays on two pair and three of a kind
 * - uth_double_play: true   Raising pays 2:1 instead of 1:1
 * - uth_hard_qualify: true  Dealer needs two pair or better to qualify
 * - uth_pocket_aces: true   Player hole cards are AA every round (fresh deck each hand)
 * - uth_river_monster: true Hold'em: the river card is dealt face-up before the bet
 * - uth_time_travel: true   Hold'em: once/day, re-deal the flop or the turn+river
 * - uth_three_hole: true    Hold'em: player gets a 3rd hole card; best 5 of 8 plays (dealer keeps 2)
 * - uth_sixth_card: true    Hold'em: a private 6th community card (only you use it) flips with the river; best 5 of 8 plays
 * - uth_suited_conn: true   Hold'em: your hole cards are forced to a suited connector (lower card 7+), varying per hand
 * - all_in_or_skip: true    Each hand/spin: go all in or skip. Wins pay 2×
 * - r_double_ball: true     Two balls spin; a bet wins if either ball lands on it
 * - r_payout_mult: 2.0      All roulette wins pay this multiple
 * - r_number_pay: 50        Straight number bets pay this (default 35)
 * - r_hot_number: 16        The straight-up pocket that gets the hot-pocket boost (0 = Hot Zero, 16 = Sweet Sixteen)
 * - r_hot_boost: 10         Likelihood multiplier for r_hot_number vs a fair wheel — 10 ⇒ it lands 10× its normal 1/37 (≈27%)
 * - r_color_double: true    Red and Black bets pay 2:1
 * - r_color_boost: 66       Player's single Red/Black bet wins this % of the time (dynamic to whichever
 *                           color they pick); a non-color bet spins fair. Pair with r_max_bets: 1.
 * - r_max_bets: 3           Max roulette bets per spin (default 6)
 * - r_respin: true          After spin, choose to keep the result or re-spin once
 * - ladder_free: 250        The Ladder bonus round after roulette; free house-money entry of
 *                           this many chips (crash costs nothing, cash out keeps the full pot)
 * - choices: [k1,k2,k3]     Player's Choice: offer these 3 preset keys; the player picks one
 *                           before the run and it becomes the active modifier for the day.
 */

const PRESET_MODIFIERS = {
  // Blackjack
  double_pay:      { type: 'bj',      title: "Blackjack Bonus",      desc: "Blackjacks pay 3:1 instead of 3:2",              bj_payout: 3.0,                              devNote: '' },
  easy_dealer:     { type: 'bj',      title: "Easy Dealer",          desc: "Blackjack: Dealer stands on 15 instead of 17",   bj_dealer_stand: 15,                         devNote: '' },
  bj_double_bonus: { type: 'bj',      title: "Quadruple Down",       desc: "Blackjack: Successful double downs pay 2x profit", bj_double_bonus: true,                     devNote: '' },
  high_stakes:     { type: 'bj',      title: "High Stakes",          desc: "Blackjack: Minimum chips requirement is 100",     min_chips: 100,                              devNote: '' },
  bj_first_ace:    { type: 'bj',      title: "Ace Up Your Sleeve",   desc: "Blackjack: Your first card each hand is always an Ace", bj_first_ace: true,                  devNote: 'Yall were losing way too much so I had to throw you a bone' },
  bj_wild_split:   { type: 'bj',      title: "Big Splitter",          desc: "Blackjack: Split any two cards. Split wins pay double.", bj_wild_split: true,                 devNote: 'Someone should do the math on how often you should split here. It\'s a very interesting problem' },
  bj_two_hands:    { type: 'bj',      title: "Double Vision",        desc: "Blackjack: Dealt two hands each round. Pick one to play.", bj_two_hands: true,                devNote: 'You see both starting hands and the dealer upcard, then keep one. A natural blackjack is picked for you.' },
  bj_safe_hit:     { type: 'bj',      title: "Soft Landing",         desc: "Blackjack: Your first hit each hand won't bust you.",   bj_safe_hit: true,                    devNote: 'If your first hit would bust, you draw the nearest card that keeps you at 21 or under. Doubles are not protected.' },
  // UTH
  uth_blind_boost:    { type: 'uth',  title: "Big Blind",            desc: "Hold'em: Blind payouts are doubled",              uth_blind_boost: 2.0,                        devNote: '' },
  uth_blind_extended: { type: 'uth',  title: "Loose Blind",          desc: "Hold'em: Blind pays on two pair and up",          uth_blind_extended: true,                    devNote: '' },
  uth_double_play:    { type: 'uth',  title: "Raise the Roof",       desc: "Hold'em: Raises pay double",                     uth_double_play: true,                       devNote: '' },
  uth_hard_qualify:   { type: 'uth',  title: "Tough Table",          desc: "Hold'em: Dealer needs two pair or better to win", uth_hard_qualify: true,                      devNote: '' },
  uth_pocket_aces:    { type: 'uth',  title: "Pocket Aces",          desc: "Hold'em: Your hole cards are Aces every round",   uth_pocket_aces: true,                       devNote: 'Yall were losing way too much so I had to throw you a bone' },
  uth_river_monster:  { type: 'uth',  title: "River Monster",        desc: "Hold'em: River card revealed immediately after you bet", uth_river_monster: true,              devNote: '' },
  uth_time_travel:    { type: 'uth',  title: "Time Travel",          desc: "Hold'em: Re-deal the flop or turn+river once today", uth_time_travel: true,                    devNote: '' },
  uth_three_hole:     { type: 'uth',  title: "Triple Threat",        desc: "Hold'em: You get 3 hole cards instead of 2",      uth_three_hole: true,                        devNote: 'Your best 5 of 8 cards play. The dealer still only gets 2.' },
  uth_sixth_card:     { type: 'uth',  title: "Sixth Sense",          desc: "Hold'em: Get a 6th card only you can use", uth_sixth_card: true,  devNote: 'Your best 5 of 8 cards play. You bet the hand blind to it, then it flips face up with the river.' },
  uth_suited_conn:    { type: 'uth',  title: "Suited Up",            desc: "Hold'em: Your hole cards are always suited connectors, 7 or higher", uth_suited_conn: true,              devNote: 'Each hand gets a different suited connector (lower card 7+), the same sequence for everyone.' },
  // Cross-game
  peek:            { type: 'cross',   title: "Dealer Peek",          desc: "Blackjack & Hold'em: 3 total peeks at a dealer card",  peek: 3,                                     devNote: '' },
  comeback:        { type: 'cross',   title: "Comeback",             desc: "Wins pay 2x if you are below 1000 chips",         comeback: true,                              devNote: '' },
  all_in_or_skip:  { type: 'cross',   title: "Martingale",           desc: "All wins are doubled. You can only go all in.",   all_in_or_skip: true,                        devNote: '' },
  ladder_day:      { type: 'cross',   title: "The Ladder",           desc: "Bonus game after roulette with a free entry", ladder_free: 250, devNote: 'Hi-lo streak climb, shared sequence for everyone. Crash costs nothing, cash out keeps the full pot.' },
  pocket_change:   { type: 'cross',   title: "Pocket Change",        desc: "Play with just 10 chips. Your final score is multiplied by 100.", chip_div: 100, min_chips: 100, devNote: 'Your chips wear the grey 10-chip look but each is worth 1. Internal balance/score/integrity all stay full-scale, so only the readouts shrink.' },
  // Player's Choice — before the run, the player picks ONE of the three `choices` to be the day's
  // modifier. Each variant below is just a different trio (any 3 non-choice preset keys); the
  // load-time guard at the bottom of this file enforces exactly 3 valid keys per variant. Slot the
  // variants into CYCLE_ORDER (spaced out) to offer different trios on different days. Two flavours:
  // mixed (one mod from each game) and single-game (all three options affect the same game).
  players_choice:        { type: 'choice', title: "Player's Choice",   desc: "Pick one of three modifiers to play today",               choices: ['bj_first_ace', 'uth_pocket_aces', 'r_hot_zero'],         devNote: 'Same three options for everyone.' },
  players_choice_payout: { type: 'choice', title: "Big Spender",       desc: "Pick one of three payout boosts to play today",           choices: ['double_pay', 'uth_double_play', 'r_double_all'],         devNote: '' },
  players_choice_wild:   { type: 'choice', title: "Wild Card",         desc: "Pick one of three high-variance modifiers to play today", choices: ['bj_wild_split', 'uth_three_hole', 'r_double_ball'],      devNote: '' },
  players_choice_bj:     { type: 'choice', title: "House Rules",       desc: "Blackjack: pick one of three blackjack modifiers today",  choices: ['bj_first_ace', 'easy_dealer', 'bj_wild_split'],          devNote: '' },
  players_choice_uth:    { type: 'choice', title: "Hold'em Pick",      desc: "Hold'em: pick one of three Hold'em modifiers today",      choices: ['uth_pocket_aces', 'uth_double_play', 'uth_time_travel'], devNote: '' },
  players_choice_roul:   { type: 'choice', title: "Croupier's Choice", desc: "Roulette: pick one of three roulette modifiers today",    choices: ['r_hot_zero', 'r_color_lock', 'r_double_ball'],           devNote: '' },
  // Roulette
  r_double_all:   { type: 'roulette', title: "Double Payout",        desc: "Roulette: All wins are doubled. One bet max.",    r_payout_mult: 2.0, r_max_bets: 1,          devNote: '' },
  r_double_ball:  { type: 'roulette', title: "Double Ball",          desc: "Roulette: Two balls spin. Win if either lands on your bet.", r_double_ball: true,             devNote: '' },
  r_hot_numbers:  { type: 'roulette', title: "Hot Numbers",          desc: "Roulette: Straight number bets pay 50:1",         r_number_pay: 50,                            devNote: '' },
  r_hot_zero:     { type: 'roulette', title: "Hot Zero",             desc: "Roulette: Zero is 10x more likely to hit",        r_hot_number: 0, r_hot_boost: 10,            devNote: 'Raises the chance of your number hitting from 2.7% to exactly 27%' },
  r_sweet_sixteen:{ type: 'roulette', title: "Sweet Sixteen",        desc: "Roulette: 16 is 10x more likely to hit",          r_hot_number: 16, r_hot_boost: 10,           devNote: 'Raises the chance of your number hitting from 2.7% to exactly 27%' },
  r_color_double: { type: 'roulette', title: "Color Bonus",          desc: "Roulette: Red/Black pay double. One bet max.", r_color_double: true, r_max_bets: 1,  devNote: '' },
  r_color_lock:   { type: 'roulette', title: "Wait, how?",           desc: "Roulette: Red/Black each win 2/3 of the time. One bet max.", r_color_boost: 66, r_max_bets: 1, devNote: 'Pick a color and it wins 66% instead of the usual 48.6%. Bet a number or anything else and the wheel plays fair.' },
  r_multi_bet:    { type: 'roulette', title: "Multi Bet",            desc: "Roulette: Place up to 10 bets",                   r_max_bets: 10,                              devNote: '' },
  r_respin:       { type: 'roulette', title: "Second Chance",        desc: "Roulette: One free re-spin",                      r_respin: true,                              devNote: '' },
  r_group_1_12:   { type: 'roulette', title: "Dozen I",              desc: "Roulette: Winning number will be from 1-12.",     r_force_group: '1_12',  r_max_bets: 3,      devNote: '' },
  r_group_13_24:  { type: 'roulette', title: "Dozen II",             desc: "Roulette: Winning number will be from 13-24.",    r_force_group: '13_24', r_max_bets: 3,      devNote: '' },
  r_group_25_36:  { type: 'roulette', title: "Dozen III",            desc: "Roulette: Winning number will be from 25-36.",    r_force_group: '25_36', r_max_bets: 3,      devNote: '' },
  r_group_1_18:   { type: 'roulette', title: "Low Numbers",          desc: "Roulette: Winning number will be from 1-18.",     r_force_group: '1_18',  r_max_bets: 3,      devNote: '' },
  r_group_19_36:  { type: 'roulette', title: "High Numbers",         desc: "Roulette: Winning number will be from 19-36.",    r_force_group: '19_36', r_max_bets: 3,      devNote: '' },
  r_group_even:   { type: 'roulette', title: "Even Money",           desc: "Roulette: Winning number will be even.",          r_force_group: 'even',  r_max_bets: 3,      devNote: '' },
  r_group_odd:    { type: 'roulette', title: "Odd One Out",          desc: "Roulette: Winning number will be odd.",           r_force_group: 'odd',   r_max_bets: 3,      devNote: '' },
  r_group_red:    { type: 'roulette', title: "Seeing Red",           desc: "Roulette: Winning number will be red.",           r_force_group: 'red',   r_max_bets: 3,      devNote: '' },
  r_group_black:  { type: 'roulette', title: "In the Black",         desc: "Roulette: Winning number will be black.",         r_force_group: 'black', r_max_bets: 3,      devNote: '' },
};

/**
 * Daily cycling order — modifiers rotate through this list by slot index (day-1 mod length).
 * Two rhythm rules hold (enforced by the alternation tests in modifiers.test.js):
 *   1. No two roulette days are ever adjacent. There are 17 roulette entries vs 21 non-roulette,
 *      so roulette stays fully separated.
 *   2. Any two adjacent non-roulette days are DIFFERENT gameplay types (bj / uth / cross / choice).
 * The six Player's Choice variants (type 'choice') are interleaved, each placed right after a
 * roulette day; because they share the 'choice' type, rule 2 keeps any two of them from ever
 * landing back to back. With 21 non-roulette vs 17 roulette entries a strict 1:1 roulette
 * alternation is impossible, so a few adjacent non-roulette pairs exist by necessity (exactly
 * 21 - 17 = 4) — expected, not a regression.
 * The Jun 17-24 single-game showcase (Days 44-51) is pinned in DAILY_MODIFIERS, so CYCLE_ORDER
 * edits only affect Day 52 (Jun 25) onward — no past archive shifts.
 */
const CYCLE_ORDER = [
  'r_hot_numbers',         // 1  — roulette
  'uth_river_monster',     // 2  — uth
  'r_group_1_12',          // 3  — roulette
  'bj_double_bonus',       // 4  — bj
  'r_double_ball',         // 5  — roulette
  'players_choice_bj',     // 6  — choice (House Rules — all-blackjack trio)
  'r_group_13_24',         // 7  — roulette
  'players_choice_roul',   // 8  — choice (Croupier's Choice — all-roulette trio) ┐ non-roulette pair (choice→cross)
  'ladder_day',            // 9  — cross (The Ladder bonus round)                 ┘
  'r_color_double',        // 10 — roulette
  'uth_three_hole',        // 11 — uth
  'r_group_25_36',         // 12 — roulette
  'bj_first_ace',          // 13 — bj
  'r_sweet_sixteen',       // 14 — roulette
  'players_choice_uth',    // 15 — choice (Hold'em Pick — all-Hold'em trio)
  'r_group_1_18',          // 16 — roulette
  'uth_sixth_card',        // 17 — uth (Sixth Sense)                              ┐ non-roulette pair (uth→bj)
  'bj_two_hands',          // 18 — bj  (Double Vision)                            ┘
  'r_group_even',          // 19 — roulette (Even Money)
  'pocket_change',         // 20 — cross (Pocket Change)
  'r_double_all',          // 21 — roulette
  'uth_time_travel',       // 22 — uth
  'r_group_19_36',         // 23 — roulette
  'easy_dealer',           // 24 — bj
  'r_group_red',           // 25 — roulette (Seeing Red)
  'players_choice',        // 26 — choice (mixed trio — one mod from each game)   ┐ non-roulette pair (choice→cross)
  'peek',                  // 27 — cross (Dealer Peek)                            ┘
  'r_hot_zero',            // 28 — roulette
  'uth_pocket_aces',       // 29 — uth
  'r_group_odd',           // 30 — roulette (Odd One Out)
  'bj_wild_split',         // 31 — bj
  'r_respin',              // 32 — roulette
  'players_choice_payout', // 33 — choice (Big Spender — payout trio, one mod from each game)
  'r_group_black',         // 34 — roulette (In the Black)
  'uth_suited_conn',       // 35 — uth (Suited Up)                                ┐ non-roulette pair (uth→bj)
  'bj_safe_hit',           // 36 — bj  (Soft Landing)                             ┘
  'r_color_lock',          // 37 — roulette
  'players_choice_wild',   // 38 — choice (Wild Card — high-variance trio, one mod from each game)
];

/**
 * Date-specific overrides (YYYYMMDD). These take priority over CYCLE_ORDER.
 * Use a preset key string or a full modifier object for one-off rules.
 */
const DAILY_MODIFIERS = {
  // ── Historical days (frozen so future CYCLE_ORDER edits don't alter archives) ──
  20260505: 'r_hot_numbers',      // Day 1
  20260506: 'double_pay',         // Day 2
  20260507: 'r_color_double',     // Day 3
  20260508: 'uth_blind_boost',    // Day 4
  20260509: 'r_multi_bet',        // Day 5
  20260510: 'comeback',           // Day 6
  20260511: 'r_double_all',       // Day 7
  20260512: 'easy_dealer',        // Day 8
  20260513: 'r_hot_zero',         // Day 9
  20260514: 'uth_hard_qualify',   // Day 10
  20260515: 'r_group_1_12',       // Day 11
  20260516: 'peek',               // Day 12
  20260517: 'r_group_13_24',      // Day 13
  20260518: 'bj_double_bonus',    // Day 14
  20260519: 'r_group_25_36',      // Day 15
  20260520: 'uth_blind_extended', // Day 16
  20260521: 'r_group_1_18',       // Day 17
  20260522: 'high_stakes',        // Day 18
  20260523: 'r_group_19_36',      // Day 19
  20260524: 'bj_double_bonus',    // Day 20 
  20260525: 'r_respin',           // Day 21
  20260526: 'r_group_1_12',       // Day 22 
  20260527: 'easy_dealer',        // Day 23 
  20260528: 'uth_pocket_aces',    // Day 24
  20260529: 'bj_first_ace',       // Day 25
  20260530: 'r_hot_zero',         // Day 26
  20260531: 'bj_wild_split',      // Day 27
  20260601: 'peek',               // Day 28
  20260602: 'r_double_ball',      // Day 29
  20260603: 'uth_time_travel',    // Day 30
  20260604: 'r_sweet_sixteen',    // Day 31 (overridden for the Sweet Sixteen launch)
  20260605: 'uth_river_monster',  // Day 32
  // Days 33-37 frozen at their pre-Ladder cycle values: appending ladder_day grew the
  // rotation 26 → 27, which would otherwise re-map these unpinned past days in archives.
  20260606: 'r_double_all',        // Day 33
  20260607: 'easy_dealer',         // Day 34
  20260608: 'r_hot_zero',          // Day 35
  20260609: 'uth_time_travel',     // Day 36
  20260610: 'r_group_1_12',        // Day 37
  20260611: 'players_choice',      // Day 38 — launch of Player's Choice (same trio every day)
  20260612: 'uth_three_hole',      // Day 39 — launch of Triple Threat (3 hole cards)
  20260613: 'r_color_lock',        // Day 40 — launch of Loaded Colors (chosen color wins 66%)
  20260614: 'ladder_day',          // Day 41 — launch of The Ladder (free 250 hi-lo climb after roulette)
  20260615: 'r_group_25_36',       // Day 42 — frozen at its pre-reorder cycle value before the v1.51 CYCLE_ORDER reshuffle
  20260616: 'r_double_ball',       // Day 43
  // ── Jun 17-24 single-game showcase (Days 44-51): the 4 roulette force-groups + 4 new single-game
  //    mods, interleaved roulette / new so no two roulette days touch. Pocket Change is unpinned and
  //    now debuts via the cycle (Day 52+). ⚠ Redeploy the engine bundle before each new mod's day.
  20260617: 'uth_sixth_card',        // Day 44 — Sixth Sense (UTH: private 6th community card)
  20260618: 'r_group_even',          // Day 45 —
  20260619: 'bj_safe_hit',         // Day 45 — Soft Landing (BJ: first hit can't bust)
  20260620: 'r_group_odd',         // Day 46 — Odd One Out (roulette force-group)
  20260621: 'uth_suited_conn',     // Day 47 — Suited Up (UTH: forced suited connectors)
  20260622: 'r_group_red',         // Day 48 — Seeing Red (roulette force-group)
  20260623: 'bj_two_hands',        // Day 49 — Double Vision (BJ: pick one of two hands)
  20260624: 'r_group_black',       // Day 50 — In the Black (roulette force-group)
  20260701: 'r_respin',            // Day 58 — Second Chance (swapped in for the cycled Pocket Change)
};

/**
 * RNG seed overrides by date — maps a calendar date (YYYYMMDD) to a different seed.
 * Only the card draw sequence changes; mods and save slots are unaffected.
 * Add an entry here to swap tomorrow's cards before it goes live.
 *
 * Example: 20260528: 20260601  → May 28 uses June 1st's card draws
 */
const DAILY_SEED_OVERRIDES = {
  // 20260528: 20260601,
  20260609: 20260103,
  20260614: 20260104,
  20260615: 20250422,
  20260616: 20250425,
  20260617: 20250426,
  // 2026-07-01 seed-check sweep: these 7 days scored 4+/6 combined guaranteed losses (UTH showdown +
  // BJ basic-strategy) under their assigned mod; remapped to 2019 decks that score 0-1/6 instead.
  20260708: 20190111, // was 6/6 (Dealer Peek)
  20260709: 20190114, // was 4/6 (Hot Zero)
  20260714: 20190126, // was 4/6 (Big Spender)
  20260715: 20190215, // was 4/6 (In the Black)
  20260718: 20190218, // was 4/6 (Wait, how?)
  20260721: 20190222, // was 4/6 (River Monster)
  20260722: 20190224, // was 4/6 (Dozen I)
};

// Validate CYCLE_ORDER entries at load time
CYCLE_ORDER.forEach(k => {
  if (!PRESET_MODIFIERS[k]) throw new Error(`modifiers.js: unknown key in CYCLE_ORDER: "${k}"`);
});

// Validate Player's Choice presets: `choices` must list exactly 3 valid, non-choice preset keys
// (no nesting a Player's Choice inside another). Catches config typos at load instead of mid-run.
Object.entries(PRESET_MODIFIERS).forEach(([name, mod]) => {
  if (!mod.choices) return;
  if (!Array.isArray(mod.choices) || mod.choices.length !== 3)
    throw new Error(`modifiers.js: "${name}" must offer exactly 3 choices`);
  mod.choices.forEach(k => {
    const c = PRESET_MODIFIERS[k];
    if (!c) throw new Error(`modifiers.js: "${name}" offers unknown modifier "${k}"`);
    if (c.choices) throw new Error(`modifiers.js: "${name}" choice "${k}" cannot itself be a Player's Choice`);
  });
});
