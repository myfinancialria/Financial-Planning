/* ============================================================================
   calc/plan.js — net worth, cash flow, ratios, goals, insurance need,
   asset allocation and the composite financial-health score.
   ========================================================================== */

import { BENCHMARKS, ALLOCATION_GUIDE, ASSUMPTIONS, INSURANCE_RULES } from "../rules/tax-rules.js";
import { futureValue, sipFutureValue, sipRequired, presentValue, emi,
         retirementCorpus, blendedReturn } from "./finance.js";

const pos = (n) => Math.max(0, Number(n) || 0);
const num = (n) => Number(n) || 0;
const R0 = (n) => Math.round(Number(n) || 0);
const sum = (arr, f) => arr.reduce((s, x) => s + pos(f(x)), 0);

/* --------------------------------------------------------------- taxonomy */

export const ASSET_CLASSES = {
  cash:        { label:"Cash & bank",            group:"cash",   liquid:1,   risk:0 },
  fd:          { label:"Fixed & recurring deposits", group:"debt", liquid:0.9, risk:1 },
  epf:         { label:"EPF / VPF",              group:"debt",   liquid:0.1, risk:1 },
  ppf:         { label:"PPF",                    group:"debt",   liquid:0.1, risk:1 },
  nps:         { label:"NPS",                    group:"mixed",  liquid:0,   risk:3 },
  smallSavings:{ label:"Small savings (NSC, SCSS, SSY, KVP)", group:"debt", liquid:0.3, risk:1 },
  debtMf:      { label:"Debt mutual funds",      group:"debt",   liquid:0.95,risk:2 },
  bonds:       { label:"Bonds & NCDs",           group:"debt",   liquid:0.6, risk:2 },
  equityMf:    { label:"Equity mutual funds",    group:"equity", liquid:0.9, risk:4 },
  hybridMf:    { label:"Hybrid mutual funds",    group:"mixed",  liquid:0.9, risk:3 },
  stocks:      { label:"Direct equity",          group:"equity", liquid:0.95,risk:5 },
  intl:        { label:"International equity",   group:"equity", liquid:0.8, risk:4 },
  esop:        { label:"ESOP / RSU",             group:"equity", liquid:0.2, risk:5 },
  gold:        { label:"Gold — physical, SGB, ETF", group:"gold", liquid:0.7, risk:3 },
  realEstate:  { label:"Real estate — investment", group:"realEstate", liquid:0.05, risk:3 },
  homeSelf:    { label:"Home — self-occupied",   group:"realEstate", liquid:0,  risk:3, excludeFromInvestable:true },
  business:    { label:"Business / unlisted equity", group:"equity", liquid:0.05, risk:5 },
  vda:         { label:"Crypto & digital assets",group:"equity", liquid:0.8, risk:5 },
  insuranceCv: { label:"Insurance cash value (ULIP, endowment)", group:"mixed", liquid:0.2, risk:2 },
  other:       { label:"Other assets",           group:"other",  liquid:0.3, risk:3 },
};

export const LIABILITY_TYPES = {
  home:     { label:"Home loan",        good:true,  deductible:true,  typicalRate:8.5 },
  lap:      { label:"Loan against property", good:false, deductible:false, typicalRate:10.5 },
  car:      { label:"Car / vehicle loan",good:false, deductible:false, typicalRate:9.5 },
  personal: { label:"Personal loan",     good:false, deductible:false, typicalRate:14 },
  education:{ label:"Education loan",    good:true,  deductible:true,  typicalRate:10 },
  creditCard:{label:"Credit card revolve",good:false,deductible:false, typicalRate:42 },
  gold:     { label:"Gold loan",         good:false, deductible:false, typicalRate:11 },
  business: { label:"Business loan",     good:true,  deductible:true,  typicalRate:12 },
  bnpl:     { label:"Buy-now-pay-later", good:false, deductible:false, typicalRate:24 },
  informal: { label:"Family / informal borrowing", good:false, deductible:false, typicalRate:0 },
  other:    { label:"Other borrowing",   good:false, deductible:false, typicalRate:12 },
};

const RETURN_BY_GROUP = {
  cash: ASSUMPTIONS.returnCash, debt: ASSUMPTIONS.returnDebt, equity: ASSUMPTIONS.returnEquity,
  gold: ASSUMPTIONS.returnGold, realEstate: ASSUMPTIONS.returnRealEstate,
  mixed: (ASSUMPTIONS.returnEquity + ASSUMPTIONS.returnDebt) / 2, other: ASSUMPTIONS.returnDebt,
};

/* -------------------------------------------------------------- net worth */

export function netWorth(assets = [], liabilities = []) {
  const byClass = {}, byGroup = {}, byOwner = {};
  let total = 0, liquid = 0, investable = 0;

  for (const a of assets) {
    const v = pos(a.value);
    const meta = ASSET_CLASSES[a.assetClass] || ASSET_CLASSES.other;
    total += v;
    liquid += v * meta.liquid;
    if (!meta.excludeFromInvestable) investable += v;
    byClass[a.assetClass] = (byClass[a.assetClass] || 0) + v;
    byGroup[meta.group] = (byGroup[meta.group] || 0) + v;
    const owner = a.owner || "self";
    byOwner[owner] = (byOwner[owner] || 0) + v;
  }

  let debt = 0, monthlyEmi = 0, badDebt = 0, deductibleInterestAnnual = 0;
  const liabRows = [];
  for (const l of liabilities) {
    const o = pos(l.outstanding);
    const meta = LIABILITY_TYPES[l.type] || LIABILITY_TYPES.other;
    debt += o;
    monthlyEmi += pos(l.emi);
    if (!meta.good) badDebt += o;
    const annualInterest = o * num(l.rate) / 100;
    if (meta.deductible) deductibleInterestAnnual += annualInterest;
    liabRows.push({ ...l, label: meta.label, good: meta.good,
      annualInterest: R0(annualInterest), deductible: meta.deductible });
  }

  const expectedReturn = blendedReturn(
    assets.map((a) => ({ value: a.value,
      assetClass: (ASSET_CLASSES[a.assetClass] || ASSET_CLASSES.other).group })),
    RETURN_BY_GROUP);

  return {
    totalAssets: R0(total), totalLiabilities: R0(debt), netWorth: R0(total - debt),
    liquidAssets: R0(liquid), investableAssets: R0(investable),
    badDebt: R0(badDebt), monthlyEmi: R0(monthlyEmi),
    deductibleInterestAnnual: R0(deductibleInterestAnnual),
    byClass, byGroup, byOwner, liabRows,
    blendedExpectedReturn: +expectedReturn.toFixed(2),
    debtToAssets: total > 0 ? debt / total : 0,
    solvency: total > 0 ? (total - debt) / total : 0,
  };
}

/* -------------------------------------------------------------- cash flow */

export function cashflow({ monthlyIncome, monthlyExpenses, monthlyEmi, monthlyTax,
                           monthlyInsurance, monthlyInvestments }) {
  const inc = pos(monthlyIncome);
  const out = pos(monthlyExpenses) + pos(monthlyEmi) + pos(monthlyTax) + pos(monthlyInsurance);
  const surplus = inc - out - pos(monthlyInvestments);
  return {
    income: R0(inc),
    tax: R0(monthlyTax), expenses: R0(monthlyExpenses), emi: R0(monthlyEmi),
    insurance: R0(monthlyInsurance), investments: R0(monthlyInvestments),
    committed: R0(out), surplus: R0(surplus),
    savingsRate: inc > 0 ? (pos(monthlyInvestments) + Math.max(0, surplus)) / inc : 0,
    waterfall: [
      { label:"Take-home income", value: R0(inc), kind:"start" },
      { label:"Income tax",       value: -R0(monthlyTax),        kind:"out" },
      { label:"Loan EMIs",        value: -R0(monthlyEmi),        kind:"out" },
      { label:"Insurance premium",value: -R0(monthlyInsurance),  kind:"out" },
      { label:"Living expenses",  value: -R0(monthlyExpenses),   kind:"out" },
      { label:"Investments",      value: -R0(monthlyInvestments),kind:"out" },
      { label:"Unallocated",      value: R0(surplus),            kind:"end" },
    ],
  };
}

/* ----------------------------------------------------------------- ratios */

function verdict(value, bench) {
  const { good, ok, dir } = bench;
  if (dir === "higher") {
    if (value >= good) return "strong";
    if (value >= ok) return "adequate";
    return "weak";
  }
  if (value <= good) return "strong";
  if (value <= ok) return "adequate";
  return "weak";
}

export function ratios({ monthlyIncome, monthlyExpenses, monthlyEmi, monthlyInvestments,
                         nw, lifeCover, annualIncome, emergencyFund }) {
  const inc = pos(monthlyIncome);
  const essentialMonthly = pos(monthlyExpenses) + pos(monthlyEmi);
  const list = [
    { id:"savingsRate", label:"Savings & investment rate",
      value: inc > 0 ? (pos(monthlyInvestments) + Math.max(0, inc - pos(monthlyExpenses) - pos(monthlyEmi) - pos(monthlyInvestments))) / inc : 0,
      fmt:"pct", bench:BENCHMARKS.savingsRate,
      why:"What share of income is being converted into future capital. The one ratio that compounds." },
    { id:"expenseToIncome", label:"Expense to income",
      value: inc > 0 ? pos(monthlyExpenses) / inc : 0, fmt:"pct", bench:BENCHMARKS.expenseToIncome,
      why:"Living costs as a share of take-home pay, before EMIs. Above 60% leaves no room to absorb a shock." },
    { id:"emiToIncome", label:"EMI to income",
      value: inc > 0 ? pos(monthlyEmi) / inc : 0, fmt:"pct", bench:BENCHMARKS.emiToIncome,
      why:"Lenders stop lending past roughly 50%. Comfort sits well below 30%." },
    { id:"emergencyMonths", label:"Emergency fund cover",
      value: essentialMonthly > 0 ? pos(emergencyFund) / essentialMonthly : 0,
      fmt:"months", bench:BENCHMARKS.emergencyMonths,
      why:"Months of essential outgo — living costs plus EMIs — that liquid money can carry with no income at all." },
    { id:"lifeCoverToIncome", label:"Life cover to annual income",
      value: pos(annualIncome) > 0 ? pos(lifeCover) / pos(annualIncome) : 0,
      fmt:"x", bench:BENCHMARKS.lifeCoverToIncome,
      why:"A multiple of ten to twelve replaces the income stream a family loses; liabilities sit on top of that." },
    { id:"solvency", label:"Solvency (net worth ÷ assets)",
      value: nw.solvency, fmt:"pct", bench:BENCHMARKS.solvency,
      why:"How much of what you own is genuinely yours rather than the lender's." },
    { id:"liquidity", label:"Liquidity (liquid ÷ total assets)",
      value: nw.totalAssets > 0 ? nw.liquidAssets / nw.totalAssets : 0,
      fmt:"pct", bench:BENCHMARKS.liquidity,
      why:"Wealth locked in property and provident funds cannot meet an emergency." },
    { id:"debtToAssets", label:"Debt to assets",
      value: nw.debtToAssets, fmt:"pct", bench:BENCHMARKS.debtToAssets,
      why:"Leverage on the whole balance sheet." },
  ];
  return list.map((r) => ({ ...r, verdict: verdict(r.value, r.bench) }));
}

/* ------------------------------------------------------------------ goals */

const INFLATION_BY_GOAL = {
  retirement: ASSUMPTIONS.inflationGeneral,
  education:  ASSUMPTIONS.inflationEducation,
  medical:    ASSUMPTIONS.inflationMedical,
  home:       ASSUMPTIONS.inflationGeneral + 1,
  wedding:    ASSUMPTIONS.inflationLifestyle,
  travel:     ASSUMPTIONS.inflationLifestyle,
  vehicle:    ASSUMPTIONS.inflationGeneral,
  emergency:  ASSUMPTIONS.inflationGeneral,
  legacy:     ASSUMPTIONS.inflationGeneral,
  other:      ASSUMPTIONS.inflationGeneral,
};

/** Recommended equity weight for a goal, from its horizon. */
export function horizonAllocation(years) {
  for (const b of ALLOCATION_GUIDE.byHorizon) if (years <= b.maxYears) return b;
  return ALLOCATION_GUIDE.byHorizon[ALLOCATION_GUIDE.byHorizon.length - 1];
}

export function analyseGoals(goals = [], opts = {}) {
  const thisYear = opts.currentYear || new Date().getFullYear();
  const rows = goals.map((g) => {
    const years = Math.max(0, num(g.targetYear) - thisYear);
    const inflation = g.inflation != null && g.inflation !== ""
      ? num(g.inflation) : (INFLATION_BY_GOAL[g.kind] ?? ASSUMPTIONS.inflationGeneral);
    const horizon = horizonAllocation(years);
    const ret = g.expectedReturn != null && g.expectedReturn !== ""
      ? num(g.expectedReturn)
      : horizon.equity * ASSUMPTIONS.returnEquity + (1 - horizon.equity) * ASSUMPTIONS.returnDebt;

    const futureCost = R0(futureValue(g.presentCost, inflation, years));
    const fromExisting = R0(futureValue(g.earmarked, ret, years));
    const fromSip = R0(sipFutureValue(g.monthlySip, ret, years, g.stepUp));
    const projected = fromExisting + fromSip;
    const gap = Math.max(0, futureCost - projected);
    const required = R0(sipRequired(futureCost, ret, years, g.earmarked, g.stepUp));

    return {
      ...g, years, inflation, expectedReturn: +ret.toFixed(2),
      recommendedEquity: horizon.equity, horizonNote: horizon.note,
      futureCost, fromExisting, fromSip, projected, gap,
      requiredSip: required,
      sipShortfall: Math.max(0, required - pos(g.monthlySip)),
      fundedPct: futureCost > 0 ? Math.min(100, (projected / futureCost) * 100) : 100,
      status: futureCost === 0 ? "n/a"
            : projected >= futureCost ? "on track"
            : projected >= futureCost * 0.75 ? "close"
            : projected >= futureCost * 0.4 ? "behind" : "critical",
      feasibleWithoutEquity: years <= 2,
    };
  }).sort((a, b) => a.years - b.years);

  return {
    rows,
    totalFutureCost: R0(sum(rows, (r) => r.futureCost)),
    totalProjected: R0(sum(rows, (r) => r.projected)),
    totalGap: R0(sum(rows, (r) => r.gap)),
    totalCurrentSip: R0(sum(rows, (r) => r.monthlySip)),
    totalRequiredSip: R0(sum(rows, (r) => r.requiredSip)),
    totalShortfallSip: R0(sum(rows, (r) => r.sipShortfall)),
  };
}

/* -------------------------------------------------------------- insurance */

/**
 * Life cover need, computed both ways, because the two disagree often enough
 * to be worth showing side by side.
 *  - Human Life Value: capitalise the income the family loses.
 *  - Needs analysis: what the money actually has to do — clear debt, fund
 *    goals, and replace living expenses for the years the family needs them.
 */
export function lifeCoverNeed({ annualIncome, age, retirementAge = 60, dependants = [],
                                annualExpensesFamily, totalDebt, goalsFutureShortfall,
                                existingCover, existingLiquidAssets,
                                inflationPct = ASSUMPTIONS.inflationGeneral,
                                discountPct = ASSUMPTIONS.returnDebt }) {
  const workingYears = Math.max(0, num(retirementAge) - num(age));

  // HLV: present value of income to retirement, net of the earner's own consumption.
  const ownConsumption = 0.25;
  const netIncome = pos(annualIncome) * (1 - ownConsumption);
  const r = num(discountPct) / 100, g = num(inflationPct) / 100;
  let hlv;
  if (Math.abs(r - g) < 1e-9) hlv = netIncome * workingYears;
  else hlv = netIncome * (1 - Math.pow((1 + g) / (1 + r), workingYears)) / (r - g);

  // Needs approach.
  const youngestDependantYears = dependants.length
    ? Math.max(...dependants.map((d) => Math.max(0, 25 - num(d.age))))
    : 0;
  const supportYears = Math.max(youngestDependantYears, workingYears > 0 ? Math.min(workingYears, 20) : 10);
  const expenseNeed = (() => {
    const e = pos(annualExpensesFamily) * 0.75; // survivors' costs fall somewhat
    if (Math.abs(r - g) < 1e-9) return e * supportYears;
    return e * (1 - Math.pow((1 + g) / (1 + r), supportYears)) / (r - g);
  })();
  const needs = expenseNeed + pos(totalDebt) + pos(goalsFutureShortfall);

  // The needs figure is the recommendation. Human Life Value is carried as a
  // cross-check, not as the number: it capitalises gross earning power and
  // routinely lands 30-50% above what the money actually has to do, which is
  // why it is the figure insurers quote.
  const recommended = needs;
  const offset = pos(existingLiquidAssets);
  const netNeed = Math.max(0, recommended - offset);
  const gap = Math.max(0, netNeed - pos(existingCover));

  return {
    hlv: R0(hlv), needsBased: R0(needs),
    hlvDivergence: needs > 0 ? +(hlv / needs).toFixed(2) : 0,
    breakdown: { expenseReplacement: R0(expenseNeed), debtClearance: R0(pos(totalDebt)),
                 goalFunding: R0(pos(goalsFutureShortfall)) },
    supportYears, workingYears,
    recommended: R0(recommended),
    lessLiquidAssets: R0(offset),
    netRequirement: R0(netNeed),
    existingCover: R0(pos(existingCover)),
    gap: R0(gap),
    coverageRatio: netNeed > 0 ? pos(existingCover) / netNeed : 1,
    incomeMultiple: pos(annualIncome) > 0 ? +(netNeed / pos(annualIncome)).toFixed(1) : 0,
    basis: "Needs analysis — what the money must actually do. Human Life Value is shown alongside as a cross-check.",
    note: dependants.length === 0
      ? "No dependants recorded. Life cover protects other people's income, not your own — with nobody financially dependent on you, cover beyond outstanding debt has no job to do."
      : "",
  };
}

export function healthCoverNeed({ cityTier = "metro", familySize = 1, existingCover = 0,
                                  existingCorporateCover = 0, hasSenior = false }) {
  const guide = INSURANCE_RULES.healthCoverGuide[cityTier] || INSURANCE_RULES.healthCoverGuide.metro;
  const [lo, hi] = guide.individual;
  const base = familySize > 1 ? lo * guide.floaterMultiplier : lo;
  const stretch = familySize > 1 ? hi * guide.floaterMultiplier : hi;
  const recommended = base;
  const own = pos(existingCover);
  return {
    recommendedFloor: R0(recommended), recommendedCeiling: R0(stretch),
    existingOwn: R0(own), corporate: R0(pos(existingCorporateCover)),
    totalCover: R0(own + pos(existingCorporateCover)),
    gap: R0(Math.max(0, recommended - own)),
    corporateWarning: pos(existingCorporateCover) > 0 && own === 0
      ? "Cover is entirely employer-provided. It ends the day employment does — typically at the worst possible moment, and at an age when a fresh policy costs more and carries new waiting periods."
      : "",
    seniorNote: hasSenior
      ? "A parent aged 60 or above is usually better covered by a separate senior-citizen policy than by being added to the family floater. Adding them re-prices the whole floater on the eldest member's age, and one hospitalisation then exhausts the cover for everybody."
      : "",
    structureTip: recommended > 1000000
      ? "A base policy of ₹5–10 lakh with a super top-up above it usually costs materially less than a single large policy for the same total cover."
      : "",
  };
}

/* --------------------------------------------------------- asset allocation */

export function allocationAnalysis(assets = [], riskProfile = "balanced") {
  const target = ALLOCATION_GUIDE.byRisk[riskProfile] || ALLOCATION_GUIDE.byRisk.balanced;
  const groups = { equity:0, debt:0, gold:0, cash:0, realEstate:0, mixed:0, other:0 };
  let investable = 0, reserve = 0;
  for (const a of assets) {
    const meta = ASSET_CLASSES[a.assetClass] || ASSET_CLASSES.other;
    if (meta.excludeFromInvestable) continue;
    // The emergency fund is a reserve held against a shock, not capital being
    // allocated to a goal. Rebalancing it would defeat its only purpose, so it
    // sits outside the target mix entirely.
    if (a.emergency) { reserve += pos(a.value); continue; }
    groups[meta.group] = (groups[meta.group] || 0) + pos(a.value);
    investable += pos(a.value);
  }
  // A hybrid sleeve is split 50:50 for the purpose of measuring drift.
  const eq = groups.equity + groups.mixed * 0.5;
  const dt = groups.debt + groups.mixed * 0.5;

  const actual = investable > 0
    ? { equity:eq/investable, debt:dt/investable, gold:groups.gold/investable,
        cash:groups.cash/investable, realEstate:groups.realEstate/investable,
        other:groups.other/investable }
    : { equity:0, debt:0, gold:0, cash:0, realEstate:0, other:0 };

  const rows = ["equity","debt","gold","cash"].map((k) => ({
    key:k, target: target[k], actual: actual[k] || 0,
    drift: (actual[k] || 0) - target[k],
    rupeeDrift: R0(((actual[k] || 0) - target[k]) * investable),
  }));

  // Concentration: the single largest holding as a share of investable assets.
  const largest = assets
    .filter((a) => !(ASSET_CLASSES[a.assetClass] || {}).excludeFromInvestable && !a.emergency)
    .sort((a, b) => pos(b.value) - pos(a.value))[0];

  return {
    investable: R0(investable), reserve: R0(reserve), target, actual, rows,
    reserveNote: reserve > 0
      ? `₹${R0(reserve).toLocaleString("en-IN")} marked as emergency money is held outside this mix. A reserve exists to be spent at the worst possible moment; rebalancing it would defeat the point.`
      : "",
    realEstateShare: actual.realEstate || 0,
    maxDrift: Math.max(...rows.map((r) => Math.abs(r.drift))),
    needsRebalance: rows.some((r) => Math.abs(r.drift) > 0.10),
    largestHolding: largest ? { name: largest.name, value: R0(largest.value),
      share: investable > 0 ? pos(largest.value)/investable : 0 } : null,
  };
}

/* ---------------------------------------------------------- health score */

/** 0–100, weighted across the six things that actually determine resilience. */
export function healthScore({ ratioList, lifeCover, healthCover, goalsSummary, hasWill, nominationGaps }) {
  const find = (id) => ratioList.find((r) => r.id === id) || { value: 0, bench: {} };
  const band = (v, b) => {
    const { good, ok, poor, dir } = b;
    if (dir === "higher") {
      if (v >= good) return 1; if (v >= ok) return 0.7; if (v >= poor) return 0.4; return v > 0 ? 0.15 : 0;
    }
    if (v <= good) return 1; if (v <= ok) return 0.7; if (v <= poor) return 0.4; return 0.15;
  };

  const parts = [
    { id:"protection", label:"Protection", weight:25, score:
      (Math.min(1, lifeCover.coverageRatio) * 0.6 +
       (healthCover.gap === 0 ? 1 : Math.min(1, healthCover.existingOwn / Math.max(1, healthCover.recommendedFloor))) * 0.4) },
    { id:"liquidity", label:"Emergency buffer", weight:20,
      score: band(find("emergencyMonths").value, BENCHMARKS.emergencyMonths) },
    { id:"savings", label:"Savings rate", weight:20,
      score: band(find("savingsRate").value, BENCHMARKS.savingsRate) },
    { id:"debt", label:"Debt load", weight:15,
      score: band(find("emiToIncome").value, BENCHMARKS.emiToIncome) },
    { id:"goals", label:"Goal funding", weight:15, score:
      goalsSummary.totalFutureCost > 0
        ? Math.min(1, goalsSummary.totalProjected / goalsSummary.totalFutureCost) : 0.5 },
    { id:"estate", label:"Estate & nomination", weight:5,
      score: (hasWill ? 0.6 : 0) + (nominationGaps === 0 ? 0.4 : Math.max(0, 0.4 - nominationGaps * 0.1)) },
  ];

  const total = parts.reduce((s, p) => s + p.score * p.weight, 0);
  const score = Math.round(Math.max(0, Math.min(100, total)));
  return {
    score, parts: parts.map((p) => ({ ...p, points: +(p.score * p.weight).toFixed(1) })),
    grade: score >= 80 ? "Strong" : score >= 60 ? "Adequate" : score >= 40 ? "Fragile" : "At risk",
    verdict: score >= 80 ? "The plan can absorb a shock and is funding its goals."
           : score >= 60 ? "Sound foundations, with identified gaps that are worth closing this year."
           : score >= 40 ? "The structure holds only while nothing goes wrong. Protection and buffer come first."
           : "A single adverse event would be financially destabilising. Work through Plan 1 before anything else.",
  };
}

/* ------------------------------------ the three-plan sequencing framework */

export function threePlans({ ratioList, lifeCover, healthCover, goalsSummary, nw, hasWill }) {
  const find = (id) => (ratioList.find((r) => r.id === id) || {}).value || 0;
  const plan1 = [
    { item:"Emergency fund of at least six months of essential outgo",
      done: find("emergencyMonths") >= 6, detail:`${find("emergencyMonths").toFixed(1)} months held` },
    { item:"Health cover independent of the employer",
      done: healthCover.existingOwn >= healthCover.recommendedFloor,
      detail: healthCover.gap ? `₹${healthCover.gap.toLocaleString("en-IN")} short of the floor` : "Adequate" },
    { item:"Term life cover matched to dependants and debt",
      done: lifeCover.gap === 0, detail: lifeCover.gap ? `₹${lifeCover.gap.toLocaleString("en-IN")} short` : "Adequate" },
    { item:"No high-cost debt outstanding",
      done: nw.badDebt === 0, detail: nw.badDebt ? `₹${nw.badDebt.toLocaleString("en-IN")} in non-productive debt` : "Clear" },
    { item:"EMI outgo within 30% of income",
      done: find("emiToIncome") <= 0.30, detail:`${(find("emiToIncome")*100).toFixed(0)}% of income` },
  ];
  const plan2 = [
    { item:"Every goal written down with a date and a rupee figure",
      done: goalsSummary.rows.length > 0, detail:`${goalsSummary.rows.length} goals recorded` },
    { item:"Retirement funded on current contributions",
      done: (goalsSummary.rows.find((g) => g.kind === "retirement") || {}).status === "on track",
      detail:(goalsSummary.rows.find((g) => g.kind === "retirement") || {}).status || "no retirement goal set" },
    { item:"No goal in the critical band",
      done: !goalsSummary.rows.some((g) => g.status === "critical"),
      detail:`${goalsSummary.rows.filter((g) => g.status === "critical").length} critical` },
    { item:"Contributions cover the required run rate",
      done: goalsSummary.totalShortfallSip === 0,
      detail: goalsSummary.totalShortfallSip
        ? `₹${goalsSummary.totalShortfallSip.toLocaleString("en-IN")} a month short` : "Covered" },
    { item:"A valid will exists", done: !!hasWill, detail: hasWill ? "Recorded" : "Not recorded" },
  ];
  const p1done = plan1.filter((x) => x.done).length;
  const p2done = plan2.filter((x) => x.done).length;
  return {
    plan1: { label:"Plan 1 — Today's safety", items:plan1, done:p1done, total:plan1.length,
             complete: p1done === plan1.length },
    plan2: { label:"Plan 2 — Future goals", items:plan2, done:p2done, total:plan2.length,
             complete: p2done === plan2.length,
             gated: p1done < plan1.length },
    plan3: { label:"Plan 3 — Lifestyle goals",
             gated: p1done < plan1.length || p2done < plan2.length,
             note:"Lifestyle spending is planned once safety and goals are funded — not before. " +
                  "Keep total lifestyle outgo within 75% of income so the first two plans stay funded." },
  };
}

export { sum };
