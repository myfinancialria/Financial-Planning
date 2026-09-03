import { emi, amortise, sipFutureValue, sipRequired, futureValue, tenureFor,
         retirementCorpus, xirr, cagr, prepaymentAnalysis } from "../assets/js/calc/finance.js";
let pass=0, fail=0;
const eq=(n,g,w,t=1)=>{const ok=Math.abs(g-w)<=t; ok?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n}\n       got ${g} want ${w}`));};

console.log("\n— EMI —");
eq("50L @ 8.5% for 240m", Math.round(emi(5000000, 8.5, 240)), 43391, 3);
eq("10L @ 12% for 60m",   Math.round(emi(1000000, 12, 60)), 22244, 3);
eq("zero-rate loan", emi(120000, 0, 12), 10000);

console.log("\n— amortisation —");
const a = amortise(5000000, 8.5, 240);
eq("months taken", a.monthsTaken, 240);
eq("total paid ≈ EMI × months", a.totalPaid, Math.round(emi(5000000,8.5,240))*240, 500);
eq("interest ≈ total − principal", a.totalInterest, a.totalPaid - 5000000, 2);

console.log("\n— tenure —");
eq("tenure to clear 10L @12% paying 22,244", tenureFor(1000000, 12, 22244), 60, 1);
eq("payment below interest → never clears", tenureFor(1000000, 12, 5000), null, 0);

console.log("\n— SIP —");
// 10,000/month, 12% p.a. EFFECTIVE, 10 years. Monthly rate = 1.12^(1/12)−1 = 0.948879%
// FV = 10000 × (1.12^10 − 1)/0.00948879 = 22,19,300
eq("SIP 10k, 12% eff, 10y", Math.round(sipFutureValue(10000, 12, 10)), 2219300, 5);
eq("SIP FV agrees with lump-sum FV convention",
   Math.round(sipFutureValue(1, 12, 1) * 100) / 100, Math.round(((Math.pow(1.12,1/12)) ** 12 - 1)/(Math.pow(1.12,1/12)-1)*100)/100, 0.01);
eq("SIP required round-trips", Math.round(sipFutureValue(Math.round(sipRequired(10000000, 12, 15)), 12, 15)), 10000000, 200);
eq("step-up SIP exceeds level SIP",
   sipFutureValue(10000, 12, 10, 10) > sipFutureValue(10000, 12, 10) ? 1 : 0, 1);
eq("existing corpus reduces required SIP",
   sipRequired(10000000, 12, 15, 1000000) < sipRequired(10000000, 12, 15) ? 1 : 0, 1);

console.log("\n— future value —");
eq("1L at 12% for 10y", Math.round(futureValue(100000, 12, 10)), 310585, 2);

console.log("\n— retirement —");
const rc = retirementCorpus({currentAge:35, retirementAge:60, lifeExpectancy:85,
  monthlyExpenseToday:60000, inflationPct:6, postRetReturnPct:7.5,
  existingCorpus:2000000, monthlySip:25000, preRetReturnPct:12});
eq("years to retire", rc.yearsToRetire, 25);
eq("first-year expense inflates 25y at 6%", rc.firstYearExpense, Math.round(60000*12*Math.pow(1.06,25)), 2);
console.log(`       corpus needed ${rc.corpusRequired.toLocaleString('en-IN')}, projected ${rc.projectedCorpus.toLocaleString('en-IN')}, funded ${rc.fundedPct.toFixed(0)}%`);
eq("corpus required is positive and large", rc.corpusRequired > rc.firstYearExpense*15 ? 1:0, 1);

console.log("\n— XIRR / CAGR —");
eq("XIRR of a clean 10% year", xirr([{date:"2025-01-01",amount:-100000},{date:"2026-01-01",amount:110000}]), 10, 0.2);
eq("CAGR 1L→2L over 5y", cagr(100000,200000,5), 14.87, 0.05);

console.log("\n— prepayment —");
const pp = prepaymentAnalysis({outstanding:4000000, rate:8.5, monthsRemaining:180}, 10000, 0, 12);
console.log(`       interest saved ${pp.interestSaved.toLocaleString('en-IN')}, ${pp.monthsSaved} months earlier, verdict: ${pp.verdict}`);
eq("prepaying saves interest", pp.interestSaved > 0 ? 1:0, 1);
eq("prepaying shortens the loan", pp.monthsSaved > 0 ? 1:0, 1);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
