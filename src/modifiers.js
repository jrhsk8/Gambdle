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
 * - min_chips: 50           Minimum chip requirement
 * - peek: true              One free peek at dealer hole card
 * - comeback: true          Below starting chips (1000)? Wins pay 2×
 * - uth_blind_boost: 2.0    Blind bonus payouts multiplier
 * - uth_blind_extended: true Blind pays on two pair and three of a kind
 * - uth_double_play: true   Raising pays 2:1 instead of 1:1
 * - uth_hard_qualify: true  Dealer needs two pair or better to qualify
 * - all_in_or_skip: true    Each hand/spin: go all in or skip. Wins pay 2×
 * - r_payout_mult: 2.0      All roulette wins pay this multiple
 * - r_number_pay: 50        Straight number bets pay this (default 35)
 * - r_zero_boost: 10        Zero is this many times more likely to hit
 * - r_color_double: true    Red and Black bets pay 2:1
 * - r_max_bets: 3           Max roulette bets per spin (default 5)
 * - r_respin: true          After spin, choose to keep the result or re-spin once
 */

const PRESET_MODIFIERS = {
  // Blackjack
  double_pay:      { type: 'bj',      title: "Blackjack Bonus",      desc: "Blackjacks pay 3:1 instead of 3:2",              bj_payout: 3.0,                              devNote: '' },
  easy_dealer:     { type: 'bj',      title: "Easy Dealer",          desc: "Blackjack: Dealer stands on 15 instead of 17",   bj_dealer_stand: 15,                         devNote: '' },
  bj_double_bonus: { type: 'bj',      title: "Quadruple Down",       desc: "Blackjack: Successful double downs pay 2x profit", bj_double_bonus: true,                     devNote: '' },
  high_stakes:     { type: 'bj',      title: "High Stakes",          desc: "Blackjack: Minimum chips requirement is 100",     min_chips: 100,                              devNote: '' },
  // UTH
  uth_blind_boost:    { type: 'uth',  title: "Big Blind",            desc: "Hold'em: Blind payouts are doubled",              uth_blind_boost: 2.0,                        devNote: '' },
  uth_blind_extended: { type: 'uth',  title: "Loose Blind",          desc: "Hold'em: Blind pays on two pair and up",          uth_blind_extended: true,                    devNote: '' },
  uth_double_play:    { type: 'uth',  title: "Raise the Roof",       desc: "Hold'em: Raises pay double",                     uth_double_play: true,                       devNote: '' },
  uth_hard_qualify:   { type: 'uth',  title: "Tough Table",          desc: "Hold'em: Dealer needs two pair or better to win", uth_hard_qualify: true,                      devNote: '' },
  // Cross-game
  peek:            { type: 'cross',   title: "Dealer Peek",          desc: "One-time peek at any dealer card",                peek: true,                                  devNote: '' },
  comeback:        { type: 'cross',   title: "Comeback",             desc: "Wins pay 2x if you are below 1000 chips",         comeback: true,                              devNote: '' },
  all_in_or_skip:  { type: 'cross',   title: "Martingale",           desc: "All wins are doubled. You can only go all in.",   all_in_or_skip: true,                        devNote: '' },
  // Roulette
  r_double_all:   { type: 'roulette', title: "Double Payout",        desc: "Roulette: All wins are doubled. One bet max.",    r_payout_mult: 2.0, r_max_bets: 1,          devNote: '' },
  r_hot_numbers:  { type: 'roulette', title: "Hot Numbers",          desc: "Roulette: Straight number bets pay 50:1",         r_number_pay: 50,                            devNote: '' },
  r_hot_zero:     { type: 'roulette', title: "Hot Zero",             desc: "Roulette: Zero is 10x more likely to hit",        r_zero_boost: 10,                            devNote: '' },
  r_color_double: { type: 'roulette', title: "Color Bonus",          desc: "Roulette: Red/Black bets pay double. One bet max.", r_color_double: true, r_max_bets: 1,  devNote: '' },
  r_multi_bet:    { type: 'roulette', title: "Multi Bet",            desc: "Roulette: Place up to 10 bets",                   r_max_bets: 10,                              devNote: '' },
  r_respin:       { type: 'roulette', title: "Second Chance",        desc: "Roulette: One free re-spin",                      r_respin: true,                              devNote: '' },
  r_group_1_12:   { type: 'roulette', title: "Dozen I",              desc: "Roulette: Winning number will be from 1-12.",     r_force_group: '1_12',  r_max_bets: 3,      devNote: '' },
  r_group_13_24:  { type: 'roulette', title: "Dozen II",             desc: "Roulette: Winning number will be from 13-24.",    r_force_group: '13_24', r_max_bets: 3,      devNote: '' },
  r_group_25_36:  { type: 'roulette', title: "Dozen III",            desc: "Roulette: Winning number will be from 25-36.",    r_force_group: '25_36', r_max_bets: 3,      devNote: '' },
  r_group_1_18:   { type: 'roulette', title: "Low Numbers",          desc: "Roulette: Winning number will be from 1-18.",     r_force_group: '1_18',  r_max_bets: 3,      devNote: '' },
  r_group_19_36:  { type: 'roulette', title: "High Numbers",         desc: "Roulette: Winning number will be from 19-36.",    r_force_group: '19_36', r_max_bets: 3,      devNote: '' },
};

/**
 * Daily cycling order — modifiers rotate through this list by day number.
 * Day 1 (May 5, 2026) = index 0. Repeats every N days where N = array length.
 * Edit this list to change the rotation.
 */
const CYCLE_ORDER = [
  'r_hot_numbers',      // Day 1  — roulette
  'double_pay',         // Day 2  — bj
  'r_color_double',     // Day 3  — roulette
  'uth_blind_boost',    // Day 4  — uth
  'r_multi_bet',        // Day 5  — roulette
  'comeback',           // Day 6  — cross
  'r_double_all',       // Day 7  — roulette
  'easy_dealer',        // Day 8  — bj
  'r_hot_zero',         // Day 9  — roulette
  'uth_hard_qualify',   // Day 10 — uth
  'r_group_1_12',       // Day 11 — roulette
  'peek',               // Day 12 — cross
  'r_group_13_24',      // Day 13 — roulette
  'bj_double_bonus',    // Day 14 — bj
  'r_group_25_36',      // Day 15 — roulette
  'uth_blind_extended', // Day 16 — uth
  'r_group_1_18',       // Day 17 — roulette
  'high_stakes',        // Day 18 — bj
  'r_group_19_36',      // Day 19 — roulette
  'uth_double_play',    // Day 20 — uth
  'r_respin',           // Day 21 — roulette
  'all_in_or_skip',     // Day 22 — cross
];

/**
 * Date-specific overrides (YYYYMMDD). These take priority over CYCLE_ORDER.
 * Use a preset key string or a full modifier object for one-off rules.
 */
const DAILY_MODIFIERS = {
  // Add overrides here as needed, e.g.:
  // 20260704: 'all_in_or_skip',
  20260524: 'bj_double_bonus',
  20260526: 'r_group_1_12',
  20260527: 'easy_dealer',
};

// Validate CYCLE_ORDER entries at load time
CYCLE_ORDER.forEach(k => {
  if (!PRESET_MODIFIERS[k]) throw new Error(`modifiers.js: unknown key in CYCLE_ORDER: "${k}"`);
});
