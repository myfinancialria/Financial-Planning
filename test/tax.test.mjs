/* Hand-computed assertions for the tax engine. Run: node test/tax.test.mjs */
import { computeTax, slabTax, hraExemption, houseProperty, advanceTaxSchedule,
         compareRegimes, presumptive } from "../assets/js/calc/tax.js";
import { NEW_REGIME_SLABS } from "../assets/js/rules/tax-rules.js";

let pass = 0, fail = 0;
const eq = (name, got, want, tol = 1) => {
  const ok = Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got ${got}  want ${want}`); }
};
const base = (o = {}) => ({ regime:"new", residency:"resident", age:35, isSalaried:true,
  salaryGross:0, housePropertyIncome:0, businessIncome:0, otherIncome:0,
  capitalGains:{}, chapterVIA:0, ...o });

console.log("\n— slab arithmetic —");
eq("slab tax on 15,00,000 (new)", slabTax(1500000, NEW_REGIME_SLABS).tax, 105000);
eq("slab tax on 24,00,000 (new)", slabTax(2400000, NEW_REGIME_SLABS).tax, 300000);
// 20000+40000+60000+80000+100000 = 300000

console.log("\n— new regime, rebate and marginal relief —");
eq("salary 12,75,000 → nil (rebate 60k)", computeTax(base({salaryGross:1275000})).totalTax, 0);
eq("salary 12,85,000 (TI 12.10L) → marginal relief",
   computeTax(base({salaryGross:1285000})).totalTax, 10400);
// TI 12,10,000: slab tax 61,500; excess over 12L = 10,000; relief holds tax to 10,000; +4% = 10,400
eq("salary 13,45,588 (TI 12,70,588) → relief boundary ≈ 70,588+cess",
   computeTax(base({salaryGross:1345588})).totalTax, 73411, 30);
eq("salary 15,75,000 (TI 15L)", computeTax(base({salaryGross:1575000})).totalTax, 109200);
eq("salary 25,75,000 (TI 25L)", computeTax(base({salaryGross:2575000})).totalTax, 343200);
// 300000 + 100000*30% = 330000; +4% = 343200

console.log("\n— old regime —");
eq("old, TI 5,00,000 → nil (rebate 12,500)",
   computeTax(base({regime:"old", salaryGross:550000})).totalTax, 0);
eq("old, TI 10,00,000 → 1,17,000",
   computeTax(base({regime:"old", salaryGross:1050000})).totalTax, 117000);
// 12,500 + 1,00,000 = 1,12,500; +4% = 1,17,000
eq("old, senior 65, TI 10,00,000 → 1,14,400",
   computeTax(base({regime:"old", age:65, salaryGross:1050000})).totalTax, 114400);
// exemption 3L: 2L@5%=10,000 + 5L@20%=1,00,000 = 1,10,000; +4% = 1,14,400

console.log("\n— surcharge and its marginal relief —");
const s60 = computeTax(base({regime:"old", salaryGross:6050000}));
eq("old, TI 60L → surcharge 10%", s60.surcharge, 161250);
eq("old, TI 60L → total tax", s60.totalTax, 1844700);
const s50p = computeTax(base({regime:"old", salaryGross:5050001}));
eq("old, TI 50,00,001 → marginal relief caps tax+surcharge at 13,12,501",
   s50p.taxAfterRebate + s50p.surcharge, 1312501, 2);
const s2cr = computeTax(base({regime:"new", salaryGross:30075000}));
eq("new, TI 3cr → surcharge capped at 25%", Math.round(s2cr.surchargeRate * 100), 25);

console.log("\n— capital gains —");
const cg1 = computeTax(base({salaryGross:0, isSalaried:false, capitalGains:{equityLTCG:600000}}));
eq("resident, only 6L equity LTCG → 9,750", cg1.totalTax, 9750);
// 6,00,000 − 1,25,000 exempt = 4,75,000; 4,00,000 basic exemption set against it;
// 75,000 @ 12.5% = 9,375; +4% cess = 9,750
eq("  ...exemption actually applied", cg1.exemptionAdjustment, 400000);

const cg2 = computeTax(base({residency:"nri", salaryGross:0, isSalaried:false,
                             capitalGains:{equityLTCG:600000}}));
eq("NRI, only 6L equity LTCG → 61,750 (no exemption set-off, no rebate)", cg2.totalTax, 61750);
// 4,75,000 @ 12.5% = 59,375; +4% = 61,750

const cg3 = computeTax(base({salaryGross:1575000, capitalGains:{equitySTCG:200000, equityLTCG:325000}}));
// slab 15L → 1,05,000 ; STCG 2L@20% = 40,000 ; LTCG (3.25L−1.25L)=2L@12.5% = 25,000
eq("mixed: slab + STCG + LTCG", cg3.totalTax, Math.round((105000+40000+25000)*1.04));
eq("  ...s.112A exemption used", cg3.capitalGains.s112A.exemptionUsed, 125000);

const vda = computeTax(base({salaryGross:1575000, capitalGains:{vda:500000}}));
eq("VDA flat 30%", vda.specialTax.vda, 150000);
const vdaOnly = computeTax(base({isSalaried:false, capitalGains:{vda:300000}}));
eq("VDA gets no basic-exemption set-off", vdaOnly.totalTax, Math.round(300000*0.30*1.04));

console.log("\n— NRI —");
eq("NRI, TI 12,00,000 → no 87A rebate",
   computeTax(base({residency:"nri", salaryGross:1275000})).totalTax, 62400);
eq("NRI aged 65 gets no senior exemption (old regime)",
   computeTax(base({regime:"old", residency:"nri", age:65, salaryGross:1050000})).totalTax, 117000);

console.log("\n— deductions cannot touch special-rate income —");
const d1 = computeTax(base({regime:"old", isSalaried:false, businessIncome:100000,
                            capitalGains:{equitySTCG:1000000}, chapterVIA:150000}));
eq("Ch VI-A restricted to slab income", d1.chapterVIA, 100000);

console.log("\n— house property —");
const hpNew = houseProperty([{type:"self", interest:300000}], "new");
eq("new regime: self-occupied interest disallowed", hpNew.incomeForGTI, 0);
const hpOld = houseProperty([{type:"self", interest:300000}], "old");
eq("old regime: capped at 2,00,000", hpOld.incomeForGTI, -200000);
const hpLet = houseProperty([{type:"letout", annualRent:600000, municipalTax:20000, interest:400000}], "new");
eq("let-out: NAV 5.8L − 30% − 4L interest", hpLet.incomeForGTI, Math.round(580000-174000-400000));
const hpBigLoss = houseProperty([{type:"letout", annualRent:200000, interest:800000}], "old");
eq("old regime: set-off capped at 2L", hpBigLoss.incomeForGTI, -200000);
eq("  ...balance carried forward", hpBigLoss.carriedForward, 460000);
// NAV 2L − 30% std ded 60k − 8L interest = −6.6L loss; 2L set off, 4.6L carried

console.log("\n— HRA —");
const h = hraExemption({basic:600000, da:0, hra:300000, rentPaid:360000, metro:true});
eq("HRA exemption = least of 3", h.exempt, 300000);
// actual 3L | 50% of 6L = 3L | rent 3.6L − 60,000 = 3L
const h2 = hraExemption({basic:600000, da:0, hra:300000, rentPaid:180000, metro:true});
eq("HRA when rent is low", h2.exempt, 120000);

console.log("\n— advance tax —");
const adv = advanceTaxSchedule(200000, 50000);
eq("first instalment 15% of net", adv.rows[0].instalment, 22500);
eq("last instalment closes the balance", adv.rows[3].cumulative, 150000);

console.log("\n— presumptive —");
eq("44ADA at 50%", presumptive({scheme:"44ADA", turnover:5000000}).deemedProfit, 2500000);
eq("44AD digital 6%", presumptive({scheme:"44AD", turnover:5000000, digitalShare:1}).deemedProfit, 300000);
eq("44AD all cash 8%", presumptive({scheme:"44AD", turnover:5000000, digitalShare:0}).deemedProfit, 400000);

console.log("\n— regime comparison —");
const cmp = compareRegimes(base({salaryGross:1575000}), 200000, 0);
console.log(`  old ${cmp.old.totalTax} vs new ${cmp.new.totalTax} → better: ${cmp.better}, saving ${cmp.saving}`);
eq("new regime wins at 15.75L with only 2L of deductions", cmp.better === "new" ? 1 : 0, 1);
const cmp2 = compareRegimes(base({salaryGross:1575000}), 600000, 0);
console.log(`  with 6L deductions: old ${cmp2.old.totalTax} vs new ${cmp2.new.totalTax} → ${cmp2.better}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
