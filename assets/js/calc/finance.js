/* ============================================================================
   calc/finance.js — time value of money, loans, and retirement mathematics
   All rates are entered as PERCENTAGES (12 means 12% a year) and converted
   internally. Monthly compounding is used wherever a SIP or an EMI is involved,
   because that is how the instrument actually behaves.
   ========================================================================== */

const pos = (n) => Math.max(0, Number(n) || 0);
const R0 = (n) => Math.round(Number(n) || 0);
const num = (n) => Number(n) || 0;

/* Convention, stated once because it changes the answers:
   INVESTMENTS use the EFFECTIVE rate — "12% a year" compounds to exactly 12% in
   twelve months, so a SIP and a lump sum growing at 12% inside the same goal
   agree with each other. LOANS use the nominal rate / 12, because that is
   literally how an Indian lender computes an EMI. The two differ on purpose. */
export const monthlyRate = (annualPct) => Math.pow(1 + num(annualPct) / 100, 1 / 12) - 1;
export const realRate = (nominalPct, inflationPct) =>
  ((1 + num(nominalPct) / 100) / (1 + num(inflationPct) / 100) - 1) * 100;

/** Future value of a present sum. */
export const futureValue = (pv, annualPct, years) =>
  pos(pv) * Math.pow(1 + num(annualPct) / 100, pos(years));

/** Present value of a future sum. */
export const presentValue = (fv, annualPct, years) =>
  pos(fv) / Math.pow(1 + num(annualPct) / 100, pos(years));

/** Future value of a monthly SIP, contributions at the end of each month. */
export function sipFutureValue(monthly, annualPct, years, stepUpPct = 0) {
  const i = monthlyRate(annualPct);
  const n = Math.round(pos(years) * 12);
  if (n === 0) return 0;
  if (!stepUpPct) {
    if (i === 0) return pos(monthly) * n;
    return pos(monthly) * ((Math.pow(1 + i, n) - 1) / i);
  }
  // Annual step-up: the instalment rises once every twelve months.
  let fv = 0, amt = pos(monthly);
  for (let m = 1; m <= n; m++) {
    fv = (fv + amt) * (1 + i);
    if (m % 12 === 0) amt *= 1 + num(stepUpPct) / 100;
  }
  return fv;
}

/** Monthly SIP needed to reach a target. */
export function sipRequired(target, annualPct, years, existingCorpus = 0, stepUpPct = 0) {
  const gap = pos(target) - futureValue(existingCorpus, annualPct, years);
  if (gap <= 0) return 0;
  if (!stepUpPct) {
    const i = monthlyRate(annualPct);
    const n = Math.round(pos(years) * 12);
    if (n === 0) return gap;
    if (i === 0) return gap / n;
    return gap / ((Math.pow(1 + i, n) - 1) / i);
  }
  const unit = sipFutureValue(1, annualPct, years, stepUpPct);
  return unit > 0 ? gap / unit : gap;
}

/** Lump sum needed today to reach a target. */
export const lumpSumRequired = (target, annualPct, years, existingCorpus = 0) =>
  pos(presentValue(pos(target) - futureValue(existingCorpus, annualPct, years), annualPct, years));

/** Blended expected return of a portfolio, weighted by value. */
export function blendedReturn(holdings, returnsByClass) {
  let total = 0, weighted = 0;
  for (const h of holdings) {
    const v = pos(h.value);
    total += v;
    weighted += v * num(returnsByClass[h.assetClass] ?? 0);
  }
  return total > 0 ? weighted / total : 0;
}

/* ------------------------------------------------------------------ loans */

/** Level EMI for a reducing-balance loan. */
export function emi(principal, annualPct, months) {
  const P = pos(principal), n = Math.round(pos(months));
  const i = num(annualPct) / 1200; // banks quote a nominal annual rate / 12
  if (n === 0) return 0;
  if (i === 0) return P / n;
  return (P * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

/** Months needed to clear a balance at a given EMI. Returns null if the EMI never clears it. */
export function tenureFor(principal, annualPct, payment) {
  const P = pos(principal), i = num(annualPct) / 1200, A = pos(payment);
  if (A <= 0) return null;
  if (i === 0) return Math.ceil(P / A);
  if (A <= P * i) return null; // payment does not even cover the interest
  return Math.ceil(Math.log(A / (A - P * i)) / Math.log(1 + i));
}

/**
 * Amortisation schedule, month by month, with optional extra payments.
 * `extraMonthly` is added to every instalment; `lumpSums` is [{month, amount}].
 */
export function amortise(principal, annualPct, months, { extraMonthly = 0, lumpSums = [] } = {}) {
  let bal = pos(principal);
  const i = num(annualPct) / 1200;
  const scheduled = emi(principal, annualPct, months);
  const lumpByMonth = new Map(lumpSums.map((l) => [Math.round(l.month), pos(l.amount)]));
  const rows = [];
  let totalInterest = 0, m = 0;
  const cap = Math.round(pos(months)) + 600;

  while (bal > 0.5 && m < cap) {
    m++;
    const interest = bal * i;
    let principalPaid = scheduled + pos(extraMonthly) - interest;
    const lump = lumpByMonth.get(m) || 0;
    principalPaid += lump;
    if (principalPaid > bal) principalPaid = bal;
    bal -= principalPaid;
    totalInterest += interest;
    rows.push({ month: m, opening: R0(bal + principalPaid), interest: R0(interest),
                principal: R0(principalPaid), extra: R0(lump), closing: R0(bal) });
  }
  return {
    emi: R0(scheduled),
    monthsTaken: m,
    totalInterest: R0(totalInterest),
    totalPaid: R0(totalInterest + pos(principal)),
    rows,
    yearly: aggregateYearly(rows),
  };
}

function aggregateYearly(rows) {
  const out = [];
  for (let y = 0; y * 12 < rows.length; y++) {
    const slice = rows.slice(y * 12, y * 12 + 12);
    if (!slice.length) break;
    out.push({
      year: y + 1,
      interest: R0(slice.reduce((s, r) => s + r.interest, 0)),
      principal: R0(slice.reduce((s, r) => s + r.principal, 0)),
      closing: slice[slice.length - 1].closing,
    });
  }
  return out;
}

/** What a prepayment is worth, against the alternative of investing the same money. */
export function prepaymentAnalysis(loan, extraMonthly, lumpSum, investmentReturnPct) {
  const monthsLeft = Math.round(pos(loan.monthsRemaining));
  const baseline = amortise(loan.outstanding, loan.rate, monthsLeft);
  const withPrepay = amortise(loan.outstanding, loan.rate, monthsLeft, {
    extraMonthly, lumpSums: lumpSum ? [{ month: 1, amount: lumpSum }] : [],
  });
  const interestSaved = baseline.totalInterest - withPrepay.totalInterest;
  const monthsSaved = baseline.monthsTaken - withPrepay.monthsTaken;

  // Opposite side of the trade: the same money invested for the same period.
  const investedValue = sipFutureValue(extraMonthly, investmentReturnPct, baseline.monthsTaken / 12)
    + futureValue(lumpSum, investmentReturnPct, baseline.monthsTaken / 12);
  const prepayValue = pos(interestSaved)
    + sipFutureValue(withPrepay.emi + pos(extraMonthly), investmentReturnPct,
                     Math.max(0, monthsSaved) / 12);

  return {
    baseline, withPrepay,
    interestSaved: R0(interestSaved),
    monthsSaved,
    yearsSaved: +(monthsSaved / 12).toFixed(1),
    investedValue: R0(investedValue),
    prepayValue: R0(prepayValue),
    verdict: prepayValue > investedValue ? "prepay" : "invest",
    margin: R0(Math.abs(prepayValue - investedValue)),
    caveat: "Compares only the arithmetic. It does not price the certainty of a guaranteed return " +
            "against an uncertain one, the loss of liquidity, or the tax deduction on the interest " +
            "if the old regime is in use.",
  };
}

/** Effective post-tax cost of a loan, allowing for any deduction on its interest. */
export function effectiveLoanCost(ratePct, deductibleInterest, totalInterest, marginalRatePct) {
  if (!totalInterest) return num(ratePct);
  const shielded = Math.min(pos(deductibleInterest), pos(totalInterest)) / pos(totalInterest);
  return num(ratePct) * (1 - shielded * (num(marginalRatePct) / 100));
}

/* ------------------------------------------------------------- retirement */

/**
 * Corpus needed at retirement to fund an inflating expense stream that must
 * last to a given age, discounted at the post-retirement return.
 */
export function retirementCorpus({
  currentAge, retirementAge, lifeExpectancy,
  monthlyExpenseToday, inflationPct, postRetReturnPct,
  existingCorpus = 0, monthlySip = 0, preRetReturnPct = 12, stepUpPct = 0,
  otherIncomeAtRetirementMonthly = 0,
}) {
  const yearsToRetire = Math.max(0, num(retirementAge) - num(currentAge));
  const yearsInRetirement = Math.max(1, num(lifeExpectancy) - num(retirementAge));
  const firstYearExpense = pos(monthlyExpenseToday) * 12 * Math.pow(1 + num(inflationPct) / 100, yearsToRetire);
  const netFirstYear = Math.max(0, firstYearExpense - pos(otherIncomeAtRetirementMonthly) * 12
    * Math.pow(1 + num(inflationPct) / 100, yearsToRetire));

  // Present value at retirement of a growing annuity, payments at year start.
  const r = num(postRetReturnPct) / 100, g = num(inflationPct) / 100, n = yearsInRetirement;
  let corpus;
  if (Math.abs(r - g) < 1e-9) corpus = netFirstYear * n;
  else corpus = netFirstYear * (1 - Math.pow((1 + g) / (1 + r), n)) / (r - g);

  const projectedExisting = futureValue(existingCorpus, preRetReturnPct, yearsToRetire);
  const projectedSip = sipFutureValue(monthlySip, preRetReturnPct, yearsToRetire, stepUpPct);
  const projected = projectedExisting + projectedSip;
  const gap = Math.max(0, corpus - projected);

  return {
    yearsToRetire, yearsInRetirement,
    firstYearExpense: R0(firstYearExpense),
    netFirstYearExpense: R0(netFirstYear),
    corpusRequired: R0(corpus),
    projectedCorpus: R0(projected),
    fromExisting: R0(projectedExisting),
    fromSip: R0(projectedSip),
    gap: R0(gap),
    fundedPct: corpus > 0 ? Math.min(100, (projected / corpus) * 100) : 100,
    additionalSipNeeded: R0(sipRequired(corpus, preRetReturnPct, yearsToRetire,
                                        existingCorpus, stepUpPct) - pos(monthlySip)),
    realReturnInRetirement: +realRate(postRetReturnPct, inflationPct).toFixed(2),
    swrCheck: corpus > 0 ? +((netFirstYear / corpus) * 100).toFixed(2) : 0,
  };
}

/** How long a corpus lasts under a given withdrawal and inflation path. */
export function corpusLongevity(corpus, annualWithdrawal, returnPct, inflationPct, maxYears = 60) {
  let bal = pos(corpus), w = pos(annualWithdrawal);
  const path = [];
  for (let y = 1; y <= maxYears; y++) {
    bal = (bal - w) * (1 + num(returnPct) / 100);
    path.push({ year: y, balance: R0(Math.max(0, bal)), withdrawal: R0(w) });
    if (bal <= 0) return { yearsLasted: y, exhausted: true, path };
    w *= 1 + num(inflationPct) / 100;
  }
  return { yearsLasted: maxYears, exhausted: false, path };
}

/* ------------------------------------------------------------------ XIRR */

export function xirr(cashflows) {
  if (cashflows.length < 2) return null;
  const t0 = new Date(cashflows[0].date).getTime();
  const yrs = (d) => (new Date(d).getTime() - t0) / (365.25 * 24 * 3600 * 1000);
  const f = (r) => cashflows.reduce((s, c) => s + c.amount / Math.pow(1 + r, yrs(c.date)), 0);
  let lo = -0.9999, hi = 10;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return +(((lo + hi) / 2) * 100).toFixed(2);
}

export function cagr(begin, end, years) {
  if (pos(begin) === 0 || pos(years) === 0) return 0;
  return +((Math.pow(pos(end) / pos(begin), 1 / pos(years)) - 1) * 100).toFixed(2);
}
