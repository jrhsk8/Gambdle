/**
 * GAMBDLE RUN MODIFIERS CONFIGURATION
 * 
 * This file contains the daily rules for the casino from May 2026 to Dec 2026.
 * 
 * HOW TO USE:
 * 1. Find the date key (YYYYMMDD).
 * 2. Reference a key from PRESET_MODIFIERS (e.g., 20260506: "double_pay").
 * 3. Alternatively, provide a full object for one-off rules.
 * 
 * AVAILABLE KEYS:
 * - title: "Short name shown in the badge"
 * - desc: "Detailed description of the rule"
 * - bj_payout: 2.0 (Sets Blackjack payout to 2:1 instead of 3:2)
 * - min_chips: 50 (Minimum chip requirement for specific days)
 */

const PRESET_MODIFIERS = {
  double_pay:    { title: "Blackjacks Pay 2:1", desc: "Blackjacks pay 2:1", bj_payout: 2.0 },
  high_stakes:   { title: "High Stakes", desc: "Minimum chips requirement is 100", min_chips: 100 },
  peek:          { title: "Dealer Peek", desc: "One free peek at a dealer card", peek: true },
  // UTH modifiers
  uth_blind_boost:    { title: "Big Blind", desc: "All blind bonus payouts are doubled", uth_blind_boost: 2.0 },
  uth_blind_extended: { title: "Loose Blind", desc: "Blind bonus pays on two pair and three of a kind", uth_blind_extended: true },
  uth_double_play:    { title: "Raise Pays", desc: "Winning play bets pay 2:1 instead of 1:1", uth_double_play: true },
  uth_hard_qualify:   { title: "Tough Table", desc: "Dealer needs two pair or better to qualify", uth_hard_qualify: true },
  // Cross-game modifiers
  all_in_or_skip: { title: "All In or Skip", desc: "Each hand/spin: go all in or skip it. Wins pay 2×", all_in_or_skip: true },
  // Roulette modifiers
  r_double_all:  { title: "Double Payout", desc: "All roulette wins pay double today", r_payout_mult: 2.0, r_max_bets: 1 },
  r_hot_numbers: { title: "Hot Numbers", desc: "Straight number roulette bets pay 50:1 today", r_number_pay: 50 },
  r_hot_zero:    { title: "Hot Zero", desc: "Zero is 10× more likely to hit today", r_zero_boost: 10 },
  r_color_double:{ title: "Color Bonus", desc: "Red and Black bets pay 2:1 today", r_color_double: true, r_max_bets: 1 },
  r_multi_bet:   { title: "Multi Bet", desc: "Place up to 10 roulette bets today", r_max_bets: 10 },
};

const DAILY_MODIFIERS = {
  // --- MAY 2026 ---
  20260505: {}, // Day 1
  20260506: {},
  20260507: {},
  20260508: "peek",
  20260509: "double_pay",
  20260510: "high_stakes",
  20260511: "r_hot_numbers",   20260512: {},
  20260513: "uth_blind_boost",  20260514: {},
  20260515: "r_color_double",   20260516: {},
  20260517: "uth_hard_qualify", 20260518: {},
  20260519: "double_pay",       20260520: {},
  20260521: "r_hot_zero",       20260522: {},
  20260523: "uth_double_play",  20260524: {},
  20260525: "r_double_all",     20260526: {},
  20260527: "peek",             20260528: {},
  20260529: "uth_blind_extended", 20260530: {},
  20260531: "r_hot_numbers",

  // --- JUNE 2026 ---
  20260601: "uth_hard_qualify", 20260602: {},
  20260603: "r_hot_zero",       20260604: {},
  20260605: "uth_blind_boost",  20260606: {},
  20260607: "double_pay",       20260608: {},
  20260609: "r_color_double",   20260610: {},
  20260611: "uth_blind_extended", 20260612: {},
  20260613: "r_double_all",     20260614: {},
  20260615: "peek",             20260616: {},
  20260617: "uth_double_play",  20260618: {},
  20260619: "r_hot_numbers",    20260620: {},
  20260621: "uth_blind_boost",  20260622: {},
  20260623: "r_hot_zero",       20260624: {},
  20260625: "uth_hard_qualify", 20260626: {},
  20260627: "double_pay",       20260628: {},
  20260629: "r_color_double",   20260630: {},

  // --- JULY 2026 ---
  20260701: "double_pay",       20260702: {},
  20260703: {},                 20260704: "r_double_all",
  20260705: {},                 20260706: "uth_blind_boost",
  20260707: {},                 20260708: "all_in_or_skip",
  20260709: "peek",             20260710: {},
  20260711: "r_hot_numbers",    20260712: {},
  20260713: "high_stakes",      20260714: {},
  20260715: "r_multi_bet",      20260716: "uth_double_play",
  20260717: {},                 20260718: {},
  20260719: "r_color_double",   20260720: {},
  20260721: "uth_hard_qualify", 20260722: {},
  20260723: "all_in_or_skip",   20260724: "double_pay",
  20260725: {},                 20260726: "uth_blind_extended",
  20260727: {},                 20260728: "r_hot_zero",
  20260729: "r_multi_bet",      20260730: "peek",
  20260731: {},

  // --- AUGUST 2026 ---
  20260801: "r_double_all",     20260802: {},
  20260803: "all_in_or_skip",   20260804: "uth_blind_boost",
  20260805: {},                 20260806: "double_pay",
  20260807: {},                 20260808: {},
  20260809: "r_hot_numbers",    20260810: {},
  20260811: "uth_hard_qualify", 20260812: {},
  20260813: "r_multi_bet",      20260814: "r_color_double",
  20260815: {},                 20260816: "peek",
  20260817: {},                 20260818: {},
  20260819: "uth_double_play",  20260820: {},
  20260821: "r_hot_zero",       20260822: {},
  20260823: "high_stakes",      20260824: "all_in_or_skip",
  20260825: {},                 20260826: "uth_blind_extended",
  20260827: {},                 20260828: "r_multi_bet",
  20260829: "double_pay",       20260830: {},
  20260831: {},

  // --- SEPTEMBER 2026 ---
  20260901: "r_color_double",   20260902: {},
  20260903: {},                 20260904: "uth_blind_boost",
  20260905: {},                 20260906: "r_hot_zero",
  20260907: {},                 20260908: {},
  20260909: "peek",             20260910: {},
  20260911: "uth_blind_extended", 20260912: {},
  20260913: {},                 20260914: "double_pay",
  20260915: {},                 20260916: "r_double_all",
  20260917: {},                 20260918: {},
  20260919: "uth_hard_qualify", 20260920: {},
  20260921: "high_stakes",      20260922: {},
  20260923: {},                 20260924: "r_hot_numbers",
  20260925: {},                 20260926: "uth_double_play",
  20260927: {},                 20260928: {},
  20260929: "r_color_double",   20260930: {},

  // --- OCTOBER 2026 ---
  20261001: "uth_blind_boost",  20261002: {},
  20261003: {},                 20261004: "r_double_all",
  20261005: {},                 20261006: "double_pay",
  20261007: {},                 20261008: {},
  20261009: "r_hot_zero",       20261010: {},
  20261011: "uth_hard_qualify", 20261012: {},
  20261013: {},                 20261014: "peek",
  20261015: {},                 20261016: "r_hot_numbers",
  20261017: {},                 20261018: {},
  20261019: "uth_blind_extended", 20261020: {},
  20261021: "r_color_double",   20261022: {},
  20261023: {},                 20261024: "high_stakes",
  20261025: {},                 20261026: "uth_double_play",
  20261027: {},                 20261028: {},
  20261029: "r_double_all",     20261030: {},
  20261031: "r_hot_zero",

  // --- NOVEMBER 2026 ---
  20261101: "double_pay",       20261102: {},
  20261103: {},                 20261104: "uth_blind_boost",
  20261105: {},                 20261106: "r_color_double",
  20261107: {},                 20261108: {},
  20261109: "peek",             20261110: {},
  20261111: "r_double_all",     20261112: {},
  20261113: {},                 20261114: "uth_blind_extended",
  20261115: {},                 20261116: "high_stakes",
  20261117: {},                 20261118: {},
  20261119: "r_hot_numbers",    20261120: {},
  20261121: "uth_hard_qualify", 20261122: {},
  20261123: {},                 20261124: "double_pay",
  20261125: {},                 20261126: "uth_double_play",
  20261127: {},                 20261128: "r_hot_zero",
  20261129: {},                 20261130: "peek",

  // --- DECEMBER 2026 ---
  20261201: "r_color_double",   20261202: {},
  20261203: {},                 20261204: "uth_blind_boost",
  20261205: {},                 20261206: "double_pay",
  20261207: {},                 20261208: {},
  20261209: "r_double_all",     20261210: {},
  20261211: "peek",             20261212: {},
  20261213: {},                 20261214: "uth_blind_extended",
  20261215: {},                 20261216: "r_hot_numbers",
  20261217: {},                 20261218: {},
  20261219: "high_stakes",      20261220: {},
  20261221: "uth_double_play",  20261222: {},
  20261223: {},                 20261224: "double_pay",
  20261225: "r_double_all",     20261226: {},
  20261227: {},                 20261228: "uth_hard_qualify",
  20261229: {},                 20261230: "peek",
  20261231: "r_hot_zero",
};