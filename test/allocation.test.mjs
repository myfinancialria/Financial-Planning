import { equityCeilingFor, targetMix, buildGoalPlan, consolidate, glidePath,
         nextGlideStep, bandFor, rebalancePlan, portfolioTarget } from "../assets/js/calc/allocation.js";
import { CATEGORIES } from "../assets/js/rules/fund-categories.js";

let pass=0, fail=0;
const eq=(n,g,w,t=0.001)=>{const ok=Math.abs(g-w)<=t; ok?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n}\n       got ${g} want ${w}`));};
const ok=(n,c,extra="")=>{c?(pass++,console.log(`  ok   ${n}${extra?"  — "+extra:""}`)):(fail++,console.log(`  FAIL ${n}${extra?"  — "+extra:""}`));};

console.log("\n— the equity ceiling is monotonic and bounded —");
eq("nothing inside a year", equityCeilingFor(1), 0);
eq("caps at 80%", equityCeilingFor(40), 0.80);
let mono = true, prev = -1;
for (let y=0; y<=40; y+=0.25){ const v=equityCeilingFor(y); if(v<prev-1e-9) mono=false; prev=v; }
ok("never decreases as the horizon lengthens", mono);
ok("3-year goal stays under a third equity", equityCeilingFor(3) <= 0.15, (equityCeilingFor(3)*100).toFixed(0)+"%");

console.log("\n— horizon binds, profile modulates —");
const aggShort = targetMix({years:1.5, riskProfile:"aggressive", priority:"must"});
ok("an aggressive investor still cannot load equity into an 18-month goal",
   aggShort.equity <= equityCeilingFor(1.5)+1e-9, (aggShort.equity*100).toFixed(1)+"%");
const consLong = targetMix({years:25, riskProfile:"conservative", priority:"should"});
ok("a conservative investor still holds equity over 25 years",
   consLong.equity > 0.15, (consLong.equity*100).toFixed(0)+"%");
ok("bound-by is reported", aggShort.boundBy === "horizon", aggShort.boundBy);

console.log("\n— every mix sums to exactly 1 —");
let mixOk = true;
for (const y of [0.5,1,2,3,5,8,12,20,30])
  for (const r of ["conservative","moderate","balanced","growth","aggressive"])
    for (const p of ["must","should","nice"]) {
      const m = targetMix({years:y, riskProfile:r, priority:p});
      if (Math.abs(m.equity+m.debt+m.gold-1) > 1e-6) mixOk = false;
      if (m.equity < -1e-9 || m.debt < -1e-9 || m.gold < -1e-9) mixOk = false;
      if (m.equity > m.ceiling + 1e-9) mixOk = false;
    }
ok("135 combinations: sum to 1, never negative, never above the ceiling", mixOk);
eq("no gold inside three years", targetMix({years:2, riskProfile:"balanced"}).gold, 0);

console.log("\n— the priority tilt fades with horizon —");
const shortMust = targetMix({years:3, riskProfile:"balanced", priority:"must"});
const longMust  = targetMix({years:22, riskProfile:"balanced", priority:"must"});
ok("a 3-year must-happen goal is tilted conservative", Math.abs(shortMust.priorityTilt) > 0.05,
   shortMust.priorityTilt.toFixed(3));
eq("a 22-year goal gets no tilt at all", longMust.priorityTilt, 0);

console.log("\n— consolidation preserves the asset mix —");
for (const sip of [2000, 5000, 12000, 30000, 90000, 250000]) {
  const p = buildGoalPlan({id:"g", name:"T", years:12, priority:"should", requiredSip:sip, earmarked:0},
                          {riskProfile:"balanced"});
  const sum = p.rows.reduce((s,r)=>s+r.weight,0);
  const byGroup = k => p.rows.filter(r=>r.group===k).reduce((s,r)=>s+r.weight,0);
  const droppedGold = p.consolidation.droppedGroups.some(d=>d.group==="gold");
  const mixHeld = Math.abs(byGroup("equity")-p.mix.equity) < 1e-3
    && (droppedGold ? true : Math.abs(byGroup("gold")-p.mix.gold) < 1e-3);
  ok(`₹${sip.toLocaleString("en-IN")}/mo → ${p.rows.length} schemes, weights sum ${sum.toFixed(4)}`,
     Math.abs(sum-1) < 1e-3 && mixHeld,
     droppedGold ? "gold folded into debt, reported" : "all groups kept");
}

console.log("\n— consolidation never merges across asset groups —");
let noCross = true;
for (const sip of [1000, 4000, 9000, 25000, 60000, 200000])
  for (const y of [2, 6, 12, 25]) {
    const p = buildGoalPlan({id:"g",name:"T",years:y,priority:"should",requiredSip:sip,earmarked:0},{riskProfile:"growth"});
    if (p.consolidation.merged.some(x=>!x.sameGroup)) noCross = false;
  }
ok("24 combinations, no cross-group merge", noCross);

console.log("\n— tiny contributions get the single-scheme route —");
const tiny = buildGoalPlan({id:"g",name:"T",years:12,priority:"should",requiredSip:1500,earmarked:0},{riskProfile:"balanced"});
ok("flagged for a single hybrid scheme", tiny.consolidation.preferSingleScheme);
ok("and the alternative is a real category", !!CATEGORIES[tiny.simpleAlternative.catId],
   tiny.simpleAlternative.name);
ok("with a warning that says so", tiny.warnings.some(w=>w.includes("too small to spread")));

console.log("\n— short goals never get small cap or long gilts —");
const shortPlan = buildGoalPlan({id:"g",name:"Car",years:2,priority:"must",requiredSip:40000,earmarked:0},{riskProfile:"aggressive"});
ok("no small cap in a 2-year goal", !shortPlan.rows.some(r=>r.catId==="smallCap"));
ok("no gilt in a 2-year goal", !shortPlan.rows.some(r=>r.catId==="gilt"));
ok("debt sleeve is short-dated", shortPlan.rows.filter(r=>r.group==="debt")
   .every(r=>["liquid","ultraShortToShort","shortTerm","overnight"].includes(r.catId)));

console.log("\n— the glide path only ever de-risks —");
const gp = glidePath({years:20, priority:"should"}, {riskProfile:"growth"});
let glideMono = true;
for (let i=1;i<gp.length;i++) if (gp[i].equity > gp[i-1].equity + 1e-9) glideMono = false;
ok("equity never rises as the date approaches", glideMono);
eq("ends at zero equity on the goal date", gp[gp.length-1].equity, 0);
const step = nextGlideStep({years:20, priority:"should"}, {riskProfile:"growth"});
ok("a next step is identified and dated", step && step.year > new Date().getFullYear(),
   step ? `${step.year}: ${(step.from*100).toFixed(0)}% → ${(step.to*100).toFixed(0)}%` : "none");

console.log("\n— the 5/25 band —");
eq("5 points binds on a 60% target", bandFor(0.60), 0.05);
eq("25% relative binds on an 8% target", bandFor(0.08), 0.02);
eq("floored at 1 point", bandFor(0.02), 0.01);

console.log("\n— rebalancing —");
const rb = rebalancePlan({
  actual:{equity:0.70, debt:0.24, gold:0.06}, target:{equity:0.60, debt:0.32, gold:0.08},
  investable:10000000, monthlyContribution:50000, lastRebalanced:"2024-01-01",
  equityExemptionHeadroom:125000, unrealisedEquityGainShare:0.30, marginalRate:31.2,
  insideRetiral:2000000 });
ok("equity breach detected", rb.breaches.some(b=>b.key==="equity"));
eq("amount to move", rb.correctionNeeded, 1000000, 1);
ok("ladder puts a zero-tax step first", rb.ladder[0].taxCost === 0, rb.ladder[0].action);
ok("selling is last", rb.ladder[rb.ladder.length-1].action.includes("Sell"));
ok("review flagged overdue", rb.nextReview.overdue, rb.nextReview.label);
// 10L sold × 30% gain = 3L gain; 1.25L exempt; 1.75L @ 12.5% = 21,875
eq("tax on selling is computed correctly", rb.tax.taxIfSoldLongTerm, 21875, 1);
eq("short-term alternative is 20% of the whole gain", rb.tax.taxIfSoldShortTerm, 60000, 1);
eq("months to fix by contribution alone", rb.monthsByContribution, 20);

const calm = rebalancePlan({ actual:{equity:0.61, debt:0.31, gold:0.08},
  target:{equity:0.60, debt:0.32, gold:0.08}, investable:10000000,
  monthlyContribution:50000, lastRebalanced:new Date().toISOString().slice(0,10) });
ok("no action when everything is inside its band", !calm.needsAction);
ok("and no review is due", !calm.reviewDue);

console.log("\n— portfolio target is goal-weighted —");
const plans = [
  buildGoalPlan({id:"a",name:"Near",years:2,priority:"must",requiredSip:10000,earmarked:500000},{riskProfile:"balanced"}),
  buildGoalPlan({id:"b",name:"Far",years:25,priority:"should",requiredSip:10000,earmarked:500000},{riskProfile:"balanced"}),
];
const pt = portfolioTarget(plans, "balanced");
ok("blend sits between the two goals' equity weights",
   pt.equity > plans[0].mix.equity && pt.equity < plans[1].mix.equity,
   `${(plans[0].mix.equity*100).toFixed(0)}% < ${(pt.equity*100).toFixed(0)}% < ${(plans[1].mix.equity*100).toFixed(0)}%`);
eq("and sums to 1", pt.equity+pt.debt+pt.gold, 1, 0.002);
ok("falls back to the risk profile with no goals", portfolioTarget([], "growth").derivedFrom === "risk profile");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
