import { blankClient } from "../assets/js/store.js";
import { computeAll } from "../assets/js/model.js";

const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
let fail = 0;
const chk = (name, cond, extra="") => { console.log(`  ${cond?"ok  ":"FAIL"} ${name}${extra?"  — "+extra:""}`); if(!cond) fail++; };

/* ---------------- Resident: salaried, 38, Bengaluru, one child ---------- */
const c = blankClient("Resident salaried");
Object.assign(c.profile, { dob:"1988-04-12", cityTier:"metro", employerType:"private",
  residency:"resident", riskProfile:"balanced", pan:"ABCDE1234F",
  dependants:[{name:"Spouse",relationship:"spouse",age:36},{name:"Child",relationship:"child",age:6},
              {name:"Mother",relationship:"parent",age:66}] });
Object.assign(c.income.salary, { basic:1440000, hra:720000, special:600000, bonus:240000,
  employerNps:144000, professionalTax:2400 });
c.income.rentPaid = 45000; c.income.metroCity = true; c.income.receivesHra = true;
Object.assign(c.income.other, { savingsInterest:18000, fdInterest:60000, dividend:40000 });
Object.assign(c.income.capitalGains, { equityLTCG:210000, equitySTCG:0 });
c.income.unrealisedEquityGain = 800000;
Object.assign(c.deductions, { s80C:150000, s80CCD1B:50000, s80D:46000, s24b:200000 });
c.expenses = { rent:45000, maintenance:6000, utilities:7000, internet:2000, help:9000,
  groceries:22000, dining:9000, transport:9000, personal:4000,
  schoolFees:18000, childcare:5000, medical:2500, parents:10000,
  shopping:9000, subscriptions:2000, entertainment:4000, travelMonthly:5000,
  vacations:250000, festivals:80000, propertyTax:40000, repairs:60000 };
c.assets = [
  { id:"a1", name:"Savings & sweep", assetClass:"cash", value:900000, emergency:true, nominee:"Spouse" },
  { id:"a2", name:"Bank FDs", assetClass:"fd", value:600000, emergency:true, nominee:"Spouse" },
  { id:"a3", name:"Equity mutual funds", assetClass:"equityMf", value:4200000, nominee:"Spouse" },
  { id:"a4", name:"Direct equity", assetClass:"stocks", value:1400000, nominee:"" },
  { id:"a5", name:"EPF", assetClass:"epf", value:2800000, nominee:"Spouse" },
  { id:"a6", name:"PPF", assetClass:"ppf", value:1500000, nominee:"Spouse" },
  { id:"a7", name:"NPS Tier-I", assetClass:"nps", value:900000, nominee:"Spouse" },
  { id:"a8", name:"Gold & SGB", assetClass:"gold", value:1100000, nominee:"" },
  { id:"a9", name:"Home, self-occupied", assetClass:"homeSelf", value:15000000 },
];
c.liabilities = [
  { id:"l1", name:"Home loan", type:"home", outstanding:6800000, rate:8.6, emi:62000, monthsRemaining:186 },
  { id:"l2", name:"Car loan", type:"car", outstanding:620000, rate:9.4, emi:17500, monthsRemaining:40 },
  { id:"l3", name:"Credit card revolve", type:"creditCard", outstanding:180000, rate:42, emi:12000, monthsRemaining:18 },
];
c.goals = [
  { id:"g1", name:"Retirement", kind:"retirement", targetYear:2048, presentCost:60000000, earmarked:5200000, monthlySip:45000, stepUp:8 },
  { id:"g2", name:"Child's education", kind:"education", targetYear:2038, presentCost:5000000, earmarked:800000, monthlySip:15000 },
  { id:"g3", name:"Car replacement", kind:"vehicle", targetYear:2028, presentCost:1800000, earmarked:200000, monthlySip:5000 },
];
c.insurance = [
  { id:"i1", category:"life", policyType:"term", insurer:"—", sumAssured:15000000, annualPremium:26000, nominee:"Spouse" },
  { id:"i2", category:"life", policyType:"endowment", insurer:"—", sumAssured:1000000, annualPremium:60000, nominee:"Spouse" },
  { id:"i3", category:"health", policyType:"floater", sumAssured:1000000, annualPremium:32000, nominee:"Spouse" },
  { id:"i4", category:"health", policyType:"corporate", sumAssured:500000, annualPremium:0, corporate:true, nominee:"Spouse" },
];
c.estate = { hasWill:false, successionLaw:"hindu", lastReviewed:"" };

const m = computeAll(c);
console.log("\n=== RESIDENT SALARIED ===");
console.log(`  gross income ${inr(m.grossAnnualIncome)} · take-home ${inr(m.monthlyTakeHome)}/mo`);
console.log(`  tax: old ${inr(m.tax.old.totalTax)} | new ${inr(m.tax.new.totalTax)} → ${m.tax.better} (marginal ${m.tax.marginalRate}%)`);
console.log(`  net worth ${inr(m.nw.netWorth)} · assets ${inr(m.nw.totalAssets)} · debt ${inr(m.nw.totalLiabilities)}`);
console.log(`  expenses ${inr(m.exp.monthly)}/mo · EMI ${inr(m.nw.monthlyEmi)} · surplus ${inr(m.cashflow.surplus)}`);
console.log(`  health score ${m.health.score}/100 (${m.health.grade})`);
console.log(`  HRA exempt ${inr(m.salary.hra.exempt)} · Ch VI-A old ${inr(m.deductions.chVIAOld)} / new ${inr(m.deductions.chVIANew)}`);
console.log(`  emergency fund ${inr(m.emergencyFund)} → ${(m.ratioList.find(r=>r.id==="emergencyMonths").value).toFixed(1)} months`);
console.log(`  goals: needs ${inr(m.goals.totalRequiredSip)}/mo, running ${inr(m.goals.totalCurrentSip)}/mo`);
console.log(`  life cover gap ${inr(m.lifeCover.gap)} · health gap ${inr(m.healthCover.gap)}`);
console.log(`\n  findings (${m.findings.length}):`);
m.findings.slice(0,8).forEach(f=>console.log(`    [${f.sev.toUpperCase()}] ${f.area}: ${f.title}`));
console.log(`\n  tax playbook:`);
m.playbook.forEach(p=>console.log(`    ${inr(p.saving).padStart(12)} — ${p.title}`));

chk("tax computed for both regimes", m.tax.old.totalTax>0 && m.tax.new.totalTax>0);
chk("HRA exemption is the least of three", m.salary.hra.exempt===Math.min(720000, 720000, 540000-144000), inr(m.salary.hra.exempt));
chk("credit-card debt flagged high", m.findings.some(f=>f.sev==="high"&&f.area==="Debt"));
chk("no will flagged", m.findings.some(f=>f.title.includes("No will")));
chk("endowment policy flagged", m.findings.some(f=>f.title.includes("investment-linked")));
chk("nomination gaps counted", m.estate.nominationGaps===2, `${m.estate.nominationGaps} gaps`);
chk("playbook has entries", m.playbook.length>0);
chk("health score in range", m.health.score>=0 && m.health.score<=100, `${m.health.score}`);
chk("three-plan sequencing present", m.threePlan.plan1.total===5);
chk("compliance checklist runs", m.compliance.total===9, `${m.compliance.done}/${m.compliance.total} done`);

/* ---------------- NRI: Dubai, property + NRO interest ------------------- */
const nri = blankClient("NRI Dubai");
Object.assign(nri.profile, { dob:"1985-09-02", residency:"nri", cityTier:"metro",
  citizenship:"indian", countryOfResidence:"United Arab Emirates", dtaaAvailable:true,
  daysInIndia:{cy:45,py1:40,py2:38,py3:50,py4:42,nrYearsOf10:10,last7y:280},
  dependants:[{name:"Spouse",relationship:"spouse",age:38},{name:"Child",relationship:"child",age:9}] });
Object.assign(nri.income.other, { nreInterest:450000, nroInterest:320000, dividend:150000 });
nri.income.houseProperties = [{ name:"Mumbai flat, let out", type:"letout", annualRent:960000, municipalTax:30000, interest:0 }];
Object.assign(nri.income.capitalGains, { equityLTCG:700000 });
nri.assets = [
  { id:"n1", name:"NRE savings", assetClass:"cash", value:3000000, accountType:"nre", emergency:true, nominee:"Spouse" },
  { id:"n2", name:"NRO savings", assetClass:"cash", value:2500000, accountType:"nro", nominee:"" },
  { id:"n3", name:"PPF, opened while resident", assetClass:"smallSavings", value:1800000, nominee:"Spouse" },
  { id:"n4", name:"Indian equity MF", assetClass:"equityMf", value:6000000, nominee:"Spouse" },
  { id:"n5", name:"Mumbai flat", assetClass:"realEstate", value:22000000, nominee:"" },
];
nri.liabilities = [];
nri.goals = [{ id:"ng1", name:"Return to India", kind:"other", targetYear:2033, presentCost:15000000, earmarked:3000000, monthlySip:80000 }];
nri.insurance = [{ id:"ni1", category:"life", policyType:"term", sumAssured:20000000, annualPremium:40000, nominee:"Spouse" }];
nri.estate = { hasWill:true, indianWill:false, foreignWill:true, lastReviewed:"2020-01-01", successionLaw:"hindu" };
nri.expenses = { groceries:0 };

const mn = computeAll(nri);
console.log("\n=== NRI ===");
console.log(`  residency test → ${mn.residencyTest.status} (${mn.residencyTest.label})`);
console.log(`  gross Indian income ${inr(mn.grossAnnualIncome)} · exempt NRE interest ${inr(mn.exemptInterest)}`);
console.log(`  tax: old ${inr(mn.tax.old.totalTax)} | new ${inr(mn.tax.new.totalTax)} → ${mn.tax.better}`);
console.log(`  rebate note: ${mn.tax.chosen.rebateNote}`);
console.log(`\n  findings (${mn.findings.length}):`);
mn.findings.slice(0,8).forEach(f=>console.log(`    [${f.sev.toUpperCase()}] ${f.area}: ${f.title}`));
console.log(`\n  NRI playbook:`);
mn.playbook.forEach(p=>console.log(`    ${(p.saving?inr(p.saving):"timing").padStart(12)} — ${p.title}`));

chk("NRI correctly classified", mn.residencyTest.status==="nri");
chk("NRE interest excluded from taxable income", mn.exemptInterest===450000);
chk("no 87A rebate for NRI", mn.tax.chosen.rebate===0 && /resident/.test(mn.tax.chosen.rebateNote));
chk("no basic-exemption set-off against CG", mn.tax.chosen.exemptionAdjustment===0);
chk("small-savings holding flagged", mn.findings.some(f=>f.title.includes("Small-savings")));
chk("s.197 property warning present", mn.findings.some(f=>f.title.includes("s.197")));
chk("foreign-will-only flagged", mn.findings.some(f=>f.title.includes("foreign will")));
chk("DTAA lever in playbook", mn.playbook.some(p=>p.id==="dtaa"));
chk("NRE/NRO designation lever present", mn.playbook.some(p=>p.id==="nre"));

console.log(`\n${fail? fail+" FAILURES":"all model checks passed"}\n`);
process.exit(fail?1:0);
