// ─── CONTENTS ──────────────────────────────────────────────────────────────
//   Standalone poker hand evaluator: rankPoker · cardNum · handScore · bestOf7
// ─────────────────────────────────────────────────────────────────────────
//
// The one evaluator used by every poker-family game in the codebase: UTH's showdown
// (uth.js bestOf7 call), 5 Card Poker's payout (poker.js rankPoker call), and the
// server-side replay Engine (engine.js bestOf7 call, via the bundle below). It has its
// own module because it is used well outside UTH.
//
// Must stay pure: no reads of S, no DOM, no rng()/getMod() calls, no globals beyond the
// plain function/card-shape inputs below. This file is concatenated verbatim into the
// server replay bundle (tests/harness/build-engine-bundle.js derives its file list from index.html
// and does not exclude this file, so it ships as part of the Node/Deno replay closure).
// Anything impure here would desync live scoring from replayed scoring, or crash the
// headless bundle outright.

// Standard video poker hand evaluator (Jacks or Better threshold). Used by UTH's bestOf7
// here and by 5 Card Poker in poker.js.
function rankPoker(cs){
  const rs=cs.map(c=>c.r),ss=cs.map(c=>c.s),vs=cs.map(c=>cardNum(c.r));
  const rc={};for(const r of rs)rc[r]=(rc[r]||0)+1;
  const cts=Object.values(rc).sort((a,b)=>b-a);
  const flush=new Set(ss).size===1;
  const sv=[...vs].sort((a,b)=>a-b);
  const str8=(sv[4]-sv[0]===4&&new Set(sv).size===5)||sv.join(',')===`2,3,4,5,14`;
  if(flush&&str8)return sv[0]>=10?{n:'Royal Flush',p:800}:{n:'Straight Flush',p:50};
  if(cts[0]===4)return{n:'Four of a Kind',p:25};
  if(cts[0]===3&&cts[1]===2)return{n:'Full House',p:9};
  if(flush)return{n:'Flush',p:6};
  if(str8)return{n:'Straight',p:4};
  if(cts[0]===3)return{n:'Three of a Kind',p:3};
  if(cts[0]===2&&cts[1]===2)return{n:'Two Pair',p:2};
  if(cts[0]===2){const pr=Object.entries(rc).find(([,c])=>c===2)?.[0];if(['A','K','Q','J'].includes(pr))return{n:'Jacks or Better',p:1};}
  return{n:'High Card',p:0};
}

// Numeric rank value for UTH hand comparison (Ace is always 14 here, unlike BJ where it flexes).
function cardNum(r){return({'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14})[r];}

// Scores a 5-card hand as (category * 1e12 + rank tiebreakers), so category always beats kickers.
function handScore(cs){
  const ns=cs.map(c=>cardNum(c.r)),ss=cs.map(c=>c.s);
  const rc={};for(const n of ns)rc[n]=(rc[n]||0)+1;
  const grp=Object.entries(rc).map(([n,c])=>[+n,c]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const cts=grp.map(g=>g[1]);
  const flush=new Set(ss).size===1;
  const sv=[...ns].sort((a,b)=>a-b);
  const wheel=sv.join(',')===`2,3,4,5,14`;
  const str8=(sv[4]-sv[0]===4&&new Set(sv).size===5)||wheel;
  const sh=wheel?5:sv[4];
  let cat;
  if(flush&&str8&&sh===14)cat=9;
  else if(flush&&str8)cat=8;
  else if(cts[0]===4)cat=7;
  else if(cts[0]===3&&cts[1]===2)cat=6;
  else if(flush)cat=5;
  else if(str8)cat=4;
  else if(cts[0]===3)cat=3;
  else if(cts[0]===2&&cts[1]===2)cat=2;
  else if(cts[0]===2)cat=1;
  else cat=0;

  let ranks;
  if(cat>=8)ranks=[sh];
  else if(cat===7||cat===6)ranks=[grp[0][0],grp[1][0]];
  else if(cat===5)ranks=[...sv].reverse();
  else if(cat===4)ranks=[sh];
  else if(cat===3)ranks=[grp[0][0],...grp.slice(1).map(g=>g[0])];
  else if(cat===2)ranks=[grp[0][0],grp[1][0],grp[2]?.[0]||0];
  else ranks=[grp[0][0],...grp.slice(1).map(g=>g[0])];

  let score=cat*1e12;
  ranks.forEach((r,i)=>{score+=r*Math.pow(100,4-Math.min(i,4));});
  return{cat,score};
}

// Checks every five-card combination and returns the best. Despite the name it takes any
// hand size of 5 or more: 7 cards normally (21 combos), 8 under Triple Threat's third hole
// card (56 combos).
function bestOf7(cards){
  let best=null,bs=-1,bc=0;
  const n=cards.length;
  for(let a=0;a<n-4;a++)for(let b=a+1;b<n-3;b++)for(let c=b+1;c<n-2;c++)for(let d=c+1;d<n-1;d++)for(let e=d+1;e<n;e++){
    const five=[cards[a],cards[b],cards[c],cards[d],cards[e]];
    const{cat,score}=handScore(five);
    if(score>bs){bs=score;bc=cat;best=five;}
  }
  return{cards:best,score:bs,cat:bc,rank:rankPoker(best)};
}
