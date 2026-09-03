/* ============================================================================
   model.js — the single place a client record becomes a computed picture.
   Every view reads from the object this returns; nothing recomputes locally.
   ========================================================================== */

import { ageFrom, monthlyExpenseTotal, determineResidency } from "./store.js";
import { computeTax, compareRegimes, hraExemption, houseProperty, section80GG,
         advanceTaxSchedule, presumptive, marginalRateAt } from "./calc/tax.js";
import { netWorth, cashflow, ratios, analyseGoals, lifeCoverNeed, healthCoverNeed,
         allocationAnalysis, healthScore, threePlans, ASSET_CLASSES } from "./calc/plan.js";
import { findings, taxPlaybook, actionPlan, complianceChecklist, feeCheck,
         scoreRiskProfile } from "./calc/ria.js";
import { ASSUMPTIONS } from "./rules/tax-rules.js";

const n = (v) => Number(v) || 0;
const pos = (v) => Math.max(0, n(v));
const R0 = (v) => Math.round(n(v));

export function computeAll(c) {
  if (!c) return null;
  const A = { ...ASSUMPTIONS, ...(c.assumptions || {}) };
  const age = ageFrom(c.profile.dob) ?? 35;
  const residency = c.profile.residency || "resident";
  const isNri = residency === "nri";
  const s = c.income.salary || {};

  /* --- salary and exemptions ------------------------------------------- */
  const salaryComponents = pos(s.basic) + pos(s.da) + pos(s.hra) + pos(s.lta)
    + pos(s.special) + pos(s.bonus) + pos(s.perquisites);
  const employerNps = pos(s.employerNps);
  const hra = hraExemption({ basic: s.basic, da: s.da, hra: s.hra,
    rentPaid: n(c.income.rentPaid) * 12, metro: !!c.income.metroCity });
  const isSalaried = salaryComponents > 0;

  // Old regime: HRA and professional tax come out; new regime: neither does.
  const salaryGrossOld = pos(salaryComponents + employerNps - hra.exempt - pos(s.professionalTax));
  const salaryGrossNew = pos(salaryComponents + employerNps);

  /* --- house property --------------------------------------------------- */
  const hpOld = houseProperty(c.income.houseProperties || [], "old");
  const hpNew = houseProperty(c.income.houseProperties || [], "new");

  /* --- business --------------------------------------------------------- */
  const b = c.income.business || {};
  const pres = b.scheme && b.scheme !== "none"
    ? presumptive({ scheme: b.scheme, turnover: b.turnover,
        digitalShare: n(b.digitalShare) / 100, actualProfit: n(b.netProfit) })
    : null;
  const businessIncome = pres ? pres.deemedProfit : pos(b.netProfit);

  /* --- other sources ---------------------------------------------------- */
  const o = c.income.other || {};
  // NRE and FCNR interest is exempt u/s 10(4)(ii) while non-resident.
  const exemptInterest = isNri ? pos(o.nreInterest) : 0;
  const otherIncome = pos(o.savingsInterest) + pos(o.fdInterest) + pos(o.dividend)
    + pos(o.otherIncome) + pos(o.nroInterest) + (isNri ? 0 : pos(o.nreInterest));
  const depositInterest = pos(o.savingsInterest) + pos(o.fdInterest) + pos(o.nroInterest);

  /* --- Chapter VI-A ------------------------------------------------------ */
  const d = c.deductions || {};
  const npsCapPct = residency === "resident" && c.profile.employerType === "government" ? 0.14 : 0.10;
  const basicDa = pos(s.basic) + pos(s.da);
  const npsOld = Math.min(employerNps, basicDa * npsCapPct);
  const npsNew = Math.min(employerNps, basicDa * 0.14);

  const gg = section80GG({ rentPaid: n(c.income.rentPaid) * 12,
    totalIncomeBeforeThis: salaryGrossOld + businessIncome + otherIncome,
    receivesHra: !!c.income.receivesHra });
  const s80GG = c.income.receivesHra ? 0 : Math.min(n(d.s80GG) || gg.deduction, gg.deduction);

  const chVIAOld = Math.min(150000, pos(d.s80C)) + Math.min(50000, pos(d.s80CCD1B))
    + pos(d.s80D) + pos(d.s80DD) + pos(d.s80DDB) + pos(d.s80E) + Math.min(150000, pos(d.s80EEB))
    + pos(d.s80G) + s80GG + pos(d.s80TTA) + pos(d.s80U) + npsOld;
  const chVIANew = npsNew;

  /* --- tax, both regimes ------------------------------------------------- */
  const cgIn = c.income.capitalGains || {};
  const commonTax = {
    residency, age, isSalaried,
    businessIncome, otherIncome, dividendIncome: pos(o.dividend),
    familyPension: pos(o.familyPension),
    capitalGains: cgIn,
  };
  const oldIn = { ...commonTax, salaryGross: salaryGrossOld,
    housePropertyIncome: hpOld.incomeForGTI, chapterVIA: chVIAOld };
  const newIn = { ...commonTax, salaryGross: salaryGrossNew,
    housePropertyIncome: hpNew.incomeForGTI, chapterVIA: chVIANew };

  const taxOld = computeTax({ ...oldIn, regime: "old" });
  const taxNew = computeTax({ ...newIn, regime: "new" });
  const better = taxOld.totalTax <= taxNew.totalTax ? "old" : "new";
  const chosenRegime = c.settings?.regime && c.settings.regime !== "auto" ? c.settings.regime : better;
  const taxResult = chosenRegime === "old" ? taxOld : taxNew;

  const comparison = {
    old: taxOld, new: taxNew, better,
    saving: Math.abs(taxOld.totalTax - taxNew.totalTax),
    breakEvenExtraDeduction: better === "new"
      ? breakEven(oldIn, chVIAOld, taxNew.totalTax) : 0,
  };
  const advance = advanceTaxSchedule(taxResult.totalTax, pos(c.income.tdsAlready) + pos(c.income.advanceTaxPaid));

  /* --- balance sheet ----------------------------------------------------- */
  const nw = netWorth(c.assets || [], c.liabilities || []);
  const emergencyFund = (c.assets || [])
    .filter((a) => a.emergency || ["cash", "fd"].includes(a.assetClass))
    .reduce((t, a) => t + pos(a.value), 0);

  /* --- cash flow --------------------------------------------------------- */
  const exp = monthlyExpenseTotal(c.expenses || {});
  const annualInsurancePremium = (c.insurance || []).reduce((t, p) => t + pos(p.annualPremium), 0);
  const monthlySipTotal = (c.goals || []).reduce((t, g) => t + pos(g.monthlySip), 0);
  const grossAnnualIncome = salaryComponents + businessIncome + otherIncome + exemptInterest
    + Math.max(0, hpOld.grossIncome);
  const monthlyTakeHome = Math.max(0, (grossAnnualIncome - taxResult.totalTax) / 12);
  const cf = cashflow({
    monthlyIncome: monthlyTakeHome,
    monthlyExpenses: exp.monthly,
    monthlyEmi: nw.monthlyEmi,
    monthlyTax: 0, // already netted out of take-home
    monthlyInsurance: annualInsurancePremium / 12,
    monthlyInvestments: monthlySipTotal,
  });

  /* --- protection -------------------------------------------------------- */
  const lifePolicies = (c.insurance || []).filter((p) => p.category === "life");
  const healthPolicies = (c.insurance || []).filter((p) => p.category === "health");
  const existingLifeCover = lifePolicies.reduce((t, p) => t + pos(p.sumAssured), 0);
  const ownHealth = healthPolicies.filter((p) => !p.corporate).reduce((t, p) => t + pos(p.sumAssured), 0);
  const corpHealth = healthPolicies.filter((p) => p.corporate).reduce((t, p) => t + pos(p.sumAssured), 0);

  const goals = analyseGoals(c.goals || []);
  const dependants = c.profile.dependants || [];
  const lifeCover = lifeCoverNeed({
    annualIncome: grossAnnualIncome, age, retirementAge: A.retirementAge,
    dependants, annualExpensesFamily: exp.monthly * 12,
    totalDebt: nw.totalLiabilities,
    // Only goals that survive the earner's death, discounted back to today's
    // rupees. Retirement is excluded: the deceased's own retirement need ends,
    // and the survivors' living costs are already in the expense replacement.
    goalsFutureShortfall: goals.rows
      .filter((g) => ["education", "home", "wedding"].includes(g.kind))
      .reduce((t, g) => t + g.gap / Math.pow(1 + A.returnDebt / 100, g.years), 0),
    existingCover: existingLifeCover, existingLiquidAssets: nw.liquidAssets,
    inflationPct: A.inflationGeneral, discountPct: A.returnDebt,
  });
  const healthCover = healthCoverNeed({
    cityTier: c.profile.cityTier || "metro",
    familySize: 1 + dependants.length,
    existingCover: ownHealth, existingCorporateCover: corpHealth,
    hasSenior: dependants.some((x) => n(x.age) >= 60) || age >= 60,
  });

  /* --- risk, allocation, ratios ------------------------------------------ */
  const risk = scoreRiskProfile(c.profile.riskAnswers || {});
  const riskProfile = c.profile.riskProfile || risk?.category || "balanced";
  const allocation = allocationAnalysis(c.assets || [], riskProfile);
  const ratioList = ratios({
    monthlyIncome: monthlyTakeHome, monthlyExpenses: exp.monthly,
    monthlyEmi: nw.monthlyEmi, monthlyInvestments: monthlySipTotal,
    nw, lifeCover: existingLifeCover, annualIncome: grossAnnualIncome, emergencyFund,
  });

  /* --- estate ------------------------------------------------------------ */
  const nominatable = (c.assets || []).filter((a) =>
    !["homeSelf", "realEstate", "other"].includes(a.assetClass));
  const nominationGaps = nominatable.filter((a) => !a.nominee || !String(a.nominee).trim()).length
    + (c.insurance || []).filter((p) => !p.nominee || !String(p.nominee).trim()).length;
  const estate = {
    ...c.estate, nominationGaps,
    nominatableCount: nominatable.length + (c.insurance || []).length,
    lastReviewedYears: c.estate?.lastReviewed
      ? new Date().getFullYear() - new Date(c.estate.lastReviewed).getFullYear() : 99,
  };

  const health = healthScore({ ratioList, lifeCover, healthCover, goalsSummary: goals,
    hasWill: !!c.estate?.hasWill, nominationGaps });
  const threePlan = threePlans({ ratioList, lifeCover, healthCover, goalsSummary: goals, nw,
    hasWill: !!c.estate?.hasWill });

  /* --- analysis ---------------------------------------------------------- */
  const ctx = {
    profile: { ...c.profile, age, residency, riskProfile,
      dependants, employerType: c.profile.employerType },
    nw, ratioList, lifeCover, healthCover, goals, allocation,
    cashflowData: cf, emergencyFund, assets: c.assets || [], liabilities: c.liabilities || [],
    insurancePolicies: c.insurance || [], estate, threePlan,
    salary: { ...s, hra: s.hra }, rentPaid: n(c.income.rentPaid) * 12, hraExempt: hra.exempt,
    depositInterest, nroInterest: pos(o.nroInterest),
    nroBalanceFromForeign: (c.assets || [])
      .filter((a) => a.assetClass === "cash" && a.accountType === "nro")
      .reduce((t, a) => t + pos(a.value), 0),
    indianPropertyValue: (c.assets || [])
      .filter((a) => ["realEstate", "homeSelf"].includes(a.assetClass))
      .reduce((t, a) => t + pos(a.value), 0),
    unrealisedEquityGain: pos(c.income.unrealisedEquityGain),
    unrealisedEquityLoss: pos(c.income.unrealisedEquityLoss),
    deductionsUsed: { s80C: d.s80C, s80CCD1B: d.s80CCD1B, s80D: d.s80D,
                      s24b: d.s24b, employerNps },
    tax: { result: taxResult, chosenRegime, comparison },
    riskProfileScore: risk?.score ?? null,
    suitabilityConsistent: !allocation.needsRebalance,
    feeArrangement: feeCheck({ mode: c.profile.feeMode, annualFee: c.profile.annualFee,
      aua: c.profile.aua || nw.investableAssets }),
  };

  const findingsList = findings(ctx);
  const playbook = taxPlaybook(ctx);
  // The same levers priced under the regime NOT in use, so the adviser can show
  // the client what electing the other way would open up or close off.
  const altRegime = chosenRegime === "new" ? "old" : "new";
  const chosenIds = new Set(playbook.map((p) => p.id));
  const playbookAlt = taxPlaybook({ ...ctx,
    tax: { result: altRegime === "old" ? taxOld : taxNew, chosenRegime: altRegime, comparison } })
    .filter((p) => !chosenIds.has(p.id));
  const actions = actionPlan(ctx, findingsList, playbook);
  const compliance = complianceChecklist(ctx);
  const residencyTest = determineResidency({ ...c.profile,
    indianIncomeForResidence: grossAnnualIncome });

  const marginal = marginalRateAt(taxResult.totalIncome, chosenRegime, age, residency);

  return {
    client: c, age, residency, isNri, assumptions: A,
    salary: { components: salaryComponents, employerNps, hra, basicDa,
              grossOld: salaryGrossOld, grossNew: salaryGrossNew, isSalaried },
    housePropertyOld: hpOld, housePropertyNew: hpNew,
    business: pres, businessIncome,
    otherIncome, exemptInterest, depositInterest,
    grossAnnualIncome, monthlyTakeHome,
    deductions: { chVIAOld, chVIANew, npsOld, npsNew, s80GG, gg },
    tax: { old: taxOld, new: taxNew, chosen: taxResult, chosenRegime, better,
           comparison, advance, marginalRate: marginal },
    nw, exp, cashflow: cf, emergencyFund, annualInsurancePremium, monthlySipTotal,
    goals, lifeCover, healthCover, existingLifeCover, ownHealth, corpHealth,
    allocation, ratioList, risk, riskProfile, estate, health, threePlan,
    findings: findingsList, playbook, playbookAlt, altRegime, actions, compliance,
    residencyTest, ctx,
  };
}

function breakEven(oldIn, currentDeduction, targetTax) {
  let lo = currentDeduction, hi = currentDeduction + 3000000;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    const t = computeTax({ ...oldIn, regime: "old", chapterVIA: mid }).totalTax;
    if (t > targetTax) lo = mid; else hi = mid;
  }
  return R0(hi - currentDeduction);
}

/** Net-worth projection used by the dashboard chart. */
export function projectNetWorth(m, years = 20) {
  const xs = [], assets = [], liabilities = [], net = [];
  const y0 = new Date().getFullYear();
  let a = m.nw.totalAssets, l = m.nw.totalLiabilities;
  const annualSaving = Math.max(0, m.cashflow.investments * 12 + Math.max(0, m.cashflow.surplus) * 12);
  const r = (m.nw.blendedExpectedReturn || 8) / 100;
  const principalPerYear = m.nw.monthlyEmi * 12 * 0.55; // indicative principal share

  for (let i = 0; i <= years; i++) {
    xs.push(y0 + i);
    assets.push(Math.round(a));
    liabilities.push(Math.round(l));
    net.push(Math.round(a - l));
    a = a * (1 + r) + annualSaving;
    l = Math.max(0, l - principalPerYear);
  }
  return { xs, series: [
    { label: "Assets", values: assets },
    { label: "Liabilities", values: liabilities },
    { label: "Net worth", values: net },
  ]};
}
