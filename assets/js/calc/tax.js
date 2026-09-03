/* ============================================================================
   calc/tax.js — Indian income-tax engine, tax year 2026-27
   ----------------------------------------------------------------------------
   Handles: both regimes, all five heads, special-rate capital gains, VDA,
   the resident-only basic-exemption adjustment, s.87A rebate with marginal
   relief, surcharge with the 15% cap on capital-gain and dividend components,
   surcharge marginal relief, and the 4% cess.

   Every result carries a `trace` — an ordered list of the steps taken — so an
   adviser can show a client exactly how the number was reached and defend it.
   ========================================================================== */

import {
  NEW_REGIME_SLABS, OLD_REGIME_SLABS, SURCHARGE_BANDS, SURCHARGE_CAP,
  SPECIAL_RATE_SURCHARGE_CAP, REBATE, SALARY, CESS,
} from "../rules/tax-rules.js";

const R = (n) => Math.round((Number(n) || 0) * 100) / 100;
const R0 = (n) => Math.round(Number(n) || 0);
const pos = (n) => Math.max(0, Number(n) || 0);

/* ------------------------------------------------------------------ slabs */

export function slabsFor(regime, age, residency) {
  if (regime === "new") return NEW_REGIME_SLABS;
  // The higher old-regime basic exemption for seniors is available to
  // RESIDENT senior citizens only. A non-resident of any age gets ₹2.5 lakh.
  if (residency === "nri") return OLD_REGIME_SLABS.general;
  if (age >= 80) return OLD_REGIME_SLABS.superSenior;
  if (age >= 60) return OLD_REGIME_SLABS.senior;
  return OLD_REGIME_SLABS.general;
}

export function basicExemption(regime, age, residency) {
  return slabsFor(regime, age, residency)[0].upto;
}

export function slabTax(income, slabs) {
  let remaining = pos(income), lower = 0, tax = 0;
  const rows = [];
  for (const s of slabs) {
    const upper = s.upto === null ? Infinity : s.upto;
    const width = upper - lower;
    const inBand = Math.min(remaining, width);
    if (inBand > 0) {
      const t = inBand * s.rate;
      tax += t;
      rows.push({
        from: lower,
        to: s.upto === null ? null : upper,
        rate: s.rate,
        amount: R0(inBand),
        tax: R(t),
      });
      remaining -= inBand;
    }
    lower = upper;
    if (remaining <= 0) break;
  }
  return { tax: R(tax), rows };
}

/* --------------------------------------------------------- salary helpers */

/** HRA exemption, s.10(13A) — least of the three tests. Old regime only. */
export function hraExemption({ basic = 0, da = 0, hra = 0, rentPaid = 0, metro = false }) {
  const salary = pos(basic) + pos(da);
  const tests = [
    { label: "Actual HRA received", value: pos(hra) },
    { label: metro ? "50% of basic + DA (metro)" : "40% of basic + DA (non-metro)",
      value: salary * (metro ? 0.5 : 0.4) },
    { label: "Rent paid less 10% of basic + DA", value: pos(pos(rentPaid) - salary * 0.1) },
  ];
  const exempt = Math.min(...tests.map((t) => t.value));
  return { exempt: R(exempt), taxableHra: R(pos(pos(hra) - exempt)), tests };
}

/** s.80GG — rent paid where no HRA is received. Old regime only. */
export function section80GG({ rentPaid = 0, totalIncomeBeforeThis = 0, receivesHra = false }) {
  if (receivesHra) return { deduction: 0, blocked: "Not available — HRA is received." };
  const tests = [
    { label: "₹5,000 a month", value: 60000 },
    { label: "25% of total income", value: pos(totalIncomeBeforeThis) * 0.25 },
    { label: "Rent paid less 10% of total income", value: pos(pos(rentPaid) - pos(totalIncomeBeforeThis) * 0.1) },
  ];
  return { deduction: R(Math.min(...tests.map((t) => t.value))), tests };
}

/* --------------------------------------------------- house property head */

/**
 * Income from house property, s.22-24.
 * Standard deduction of 30% of net annual value; interest is separate.
 * New regime: interest on a self-occupied property is not deductible at all,
 * and a loss under this head cannot be set off against any other head.
 * Old regime: self-occupied interest capped at ₹2,00,000, and the net loss
 * set off against other heads is capped at ₹2,00,000 (s.71(3A)).
 */
export function houseProperty(properties = [], regime = "new") {
  let total = 0;
  const rows = [];
  for (const p of properties) {
    const letOut = p.type === "letout";
    const rent = letOut ? pos(p.annualRent) : 0;
    const municipal = letOut ? pos(p.municipalTax) : 0;
    const nav = pos(rent - municipal);
    const stdDed = letOut ? nav * 0.3 : 0;
    let interest = pos(p.interest);
    let interestAllowed = interest;
    let capNote = "";

    if (!letOut) {
      if (regime === "new") {
        interestAllowed = 0;
        capNote = "Self-occupied interest is not deductible under the new regime.";
      } else {
        interestAllowed = Math.min(interest, 200000);
        if (interest > 200000) capNote = "Capped at ₹2,00,000 under s.24(b).";
      }
    }
    const income = R(nav - stdDed - interestAllowed);
    total += income;
    rows.push({
      name: p.name || (letOut ? "Let-out property" : "Self-occupied property"),
      type: p.type, rent: R0(rent), municipalTax: R0(municipal), nav: R0(nav),
      standardDeduction: R0(stdDed), interestPaid: R0(interest),
      interestAllowed: R0(interestAllowed), income: R0(income), note: capNote,
    });
  }

  let setOffAgainstOtherHeads = Math.min(0, total);
  let carriedForward = 0;
  let setOffNote = "";
  if (total < 0) {
    if (regime === "new") {
      carriedForward = -total;
      setOffAgainstOtherHeads = 0;
      setOffNote = "Under the new regime a house-property loss cannot be set off against any other head. " +
                   "It is carried forward for eight years, usable only against future house-property income.";
    } else if (-total > 200000) {
      setOffAgainstOtherHeads = -200000;
      carriedForward = -total - 200000;
      setOffNote = "Set-off against other heads is capped at ₹2,00,000 by s.71(3A); the balance is carried forward for eight years.";
    }
  }
  return {
    rows,
    grossIncome: R0(total),
    incomeForGTI: R0(total > 0 ? total : setOffAgainstOtherHeads),
    carriedForward: R0(carriedForward),
    note: setOffNote,
  };
}

/* ----------------------------------------------------- capital gains split */

/**
 * Buckets capital gains by the rate that applies to them.
 * `debtSlab` covers specified mutual funds and any gain that falls to slab rates.
 */
export function bucketCapitalGains(cg = {}) {
  const equityLtcgGross = pos(cg.equityLTCG);
  const exemptionUsed = Math.min(equityLtcgGross, 125000);
  return {
    slabRate: R0(pos(cg.debtSlab) + pos(cg.otherSTCG) + pos(cg.propertySTCG)),
    s111A:    { amount: R0(pos(cg.equitySTCG)),                  rate: 0.20,  label: "STCG, listed equity (s.111A)" },
    s112A:    { amount: R0(pos(equityLtcgGross - exemptionUsed)), rate: 0.125, label: "LTCG, listed equity (s.112A)",
                gross: R0(equityLtcgGross), exemptionUsed: R0(exemptionUsed) },
    s112:     { amount: R0(pos(cg.otherLTCG) + pos(cg.propertyLTCG)), rate: 0.125, label: "LTCG, other assets (s.112)" },
    vda:      { amount: R0(pos(cg.vda)),                          rate: 0.30,  label: "Virtual digital assets (s.115BBH)" },
  };
}

/* ------------------------------------------------------------- surcharge */

function surchargeRateFor(totalIncome, regime) {
  let rate = 0;
  for (const b of SURCHARGE_BANDS) if (totalIncome > b.over) rate = b.rate;
  return Math.min(rate, SURCHARGE_CAP[regime]);
}

/**
 * Surcharge, with the s.2 proviso capping the rate on the s.111A / s.112 /
 * s.112A and dividend components at 15%.
 */
function computeSurcharge(totalIncome, taxParts, regime) {
  const rate = surchargeRateFor(totalIncome, regime);
  if (rate === 0) return { rate: 0, amount: 0, cappedRate: 0, split: null };
  const cappedRate = Math.min(rate, SPECIAL_RATE_SURCHARGE_CAP);
  const capped = taxParts.cappedComponentTax * cappedRate;
  const uncapped = taxParts.otherTax * rate;
  return {
    rate, cappedRate, amount: R(capped + uncapped),
    split: {
      cappedComponentTax: R(taxParts.cappedComponentTax), cappedRate, cappedSurcharge: R(capped),
      otherTax: R(taxParts.otherTax), rate, otherSurcharge: R(uncapped),
    },
  };
}

function surchargeThresholdBelow(totalIncome, regime) {
  let hit = null;
  for (const b of SURCHARGE_BANDS) {
    if (totalIncome > b.over && Math.min(b.rate, SURCHARGE_CAP[regime]) > 0) hit = b;
  }
  return hit;
}

/* ------------------------------------------------------------ main engine */

/**
 * @param {object} inp
 *   regime      "new" | "old"
 *   residency   "resident" | "rnor" | "nri"
 *   age         number
 *   salaryGross number (after HRA/LTA exemptions, before standard deduction)
 *   isSalaried  boolean — governs the standard deduction
 *   housePropertyIncome number (already netted, may be negative)
 *   businessIncome number
 *   otherIncome  number (interest, dividend, family pension net, etc.)
 *   dividendIncome number — subset of otherIncome, for the 15% surcharge cap
 *   capitalGains object — see bucketCapitalGains
 *   chapterVIA   number — total Chapter VI-A deductions already validated
 *   familyPension number — gross, for its own deduction
 */
export function computeTax(inp) {
  const regime = inp.regime === "old" ? "old" : "new";
  const residency = inp.residency || "resident";
  const isResident = residency !== "nri";
  const age = Number(inp.age) || 30;
  const trace = [];

  /* 1 — Gross total income by head ------------------------------------- */
  const stdDed = inp.isSalaried
    ? Math.min(SALARY.standardDeduction[regime], pos(inp.salaryGross)) : 0;
  const salaryNet = pos(pos(inp.salaryGross) - stdDed);

  const fpGross = pos(inp.familyPension);
  const fpRule = SALARY.familyPensionDeduction[regime];
  const fpDeduction = fpGross ? Math.min(fpGross * fpRule.pct, fpRule.cap) : 0;

  const cg = bucketCapitalGains(inp.capitalGains || {});
  const specialTotal = cg.s111A.amount + cg.s112A.amount + cg.s112.amount + cg.vda.amount;

  const normalGTI = salaryNet
    + Number(inp.housePropertyIncome || 0)
    + pos(inp.businessIncome)
    + pos(inp.otherIncome)
    + cg.slabRate
    - fpDeduction;

  const gti = R0(normalGTI + specialTotal);
  trace.push({ step: "Gross total income", value: gti,
    detail: `Salary ${R0(salaryNet)} (after standard deduction ${R0(stdDed)}) · house property ${R0(inp.housePropertyIncome || 0)} · business ${R0(inp.businessIncome)} · other sources ${R0(pos(inp.otherIncome) - fpDeduction)} · capital gains ${R0(cg.slabRate + specialTotal)}` });

  /* 2 — Chapter VI-A. Deductions cannot reduce special-rate income. ------ */
  const chVIA = Math.min(pos(inp.chapterVIA), pos(normalGTI));
  const normalIncome = R0(pos(normalGTI - chVIA));
  const totalIncome = R0(normalIncome + specialTotal);
  trace.push({ step: "Chapter VI-A deductions", value: -R0(chVIA),
    detail: chVIA < pos(inp.chapterVIA)
      ? `Restricted — deductions cannot be set against income taxed at special rates, and cannot create a loss.`
      : (regime === "new" ? "Only the deductions that survive the new regime are counted." : "") });
  trace.push({ step: "Total income", value: totalIncome,
    detail: `${R0(normalIncome)} at slab rates + ${R0(specialTotal)} at special rates` });

  /* 3 — Resident-only basic-exemption adjustment ------------------------ */
  const exemption = basicExemption(regime, age, residency);
  const buckets = [
    { key: "s111A", ...cg.s111A },
    { key: "s112",  ...cg.s112  },
    { key: "s112A", ...cg.s112A },
  ];
  let adjusted = { s111A: cg.s111A.amount, s112: cg.s112.amount, s112A: cg.s112A.amount };
  let exemptionAdjustment = 0;

  if (isResident && normalIncome < exemption && specialTotal > 0) {
    // Set the unexhausted exemption against the highest-taxed eligible bucket
    // first — that is the arrangement most favourable to the taxpayer.
    // VDA under s.115BBH is expressly excluded.
    let spare = exemption - normalIncome;
    for (const b of buckets.sort((a, z) => z.rate - a.rate)) {
      if (spare <= 0) break;
      const use = Math.min(spare, adjusted[b.key]);
      adjusted[b.key] -= use;
      spare -= use;
      exemptionAdjustment += use;
    }
    if (exemptionAdjustment > 0) {
      trace.push({ step: "Basic exemption set against capital gains", value: -R0(exemptionAdjustment),
        detail: `Slab income of ${R0(normalIncome)} leaves ${R0(exemption - normalIncome)} of the ₹${R0(exemption)} exemption unused. A resident may set the balance against capital gains — a non-resident may not.` });
    }
  } else if (!isResident && normalIncome < exemption && specialTotal > 0) {
    trace.push({ step: "Basic exemption set against capital gains", value: 0,
      detail: "Not available. A non-resident cannot set an unexhausted basic exemption against capital gains — proviso to s.111A / s.112 / s.112A." });
  }

  /* 4 — Tax before rebate ----------------------------------------------- */
  const slabs = slabsFor(regime, age, residency);
  const slabPart = slabTax(normalIncome, slabs);
  const specialTax = {
    s111A: R(adjusted.s111A * 0.20),
    s112A: R(adjusted.s112A * 0.125),
    s112:  R(adjusted.s112  * 0.125),
    vda:   R(cg.vda.amount  * 0.30),
  };
  const specialTaxTotal = R(specialTax.s111A + specialTax.s112A + specialTax.s112 + specialTax.vda);
  const taxBeforeRebate = R(slabPart.tax + specialTaxTotal);
  trace.push({ step: "Tax before rebate", value: R0(taxBeforeRebate),
    detail: `Slab tax ${R0(slabPart.tax)} + special-rate tax ${R0(specialTaxTotal)}` });

  /* 5 — Rebate, s.87A. Residents only, and not against special-rate tax. */
  let rebate = 0, rebateMarginalRelief = 0, rebateNote = "";
  const rb = REBATE[regime];
  if (!isResident) {
    rebateNote = "Not available — s.87A is confined to a resident individual.";
  } else if (totalIncome <= rb.maxTaxableIncome) {
    rebate = Math.min(rb.maxRebate, slabPart.tax);
    rebateNote = `Total income is within ₹${R0(rb.maxTaxableIncome)}, so tax on slab-rate income is rebated up to ₹${R0(rb.maxRebate)}. The rebate does not reach tax on capital gains.`;
  } else if (rb.marginalRelief) {
    // Marginal relief: tax must not exceed the amount by which income crosses
    // the rebate threshold. Applied to the slab-rate portion.
    const excessIncome = totalIncome - rb.maxTaxableIncome;
    const taxOnSlabPortion = slabPart.tax;
    if (taxOnSlabPortion > excessIncome) {
      rebateMarginalRelief = R(taxOnSlabPortion - excessIncome);
      rebate = rebateMarginalRelief;
      rebateNote = `Marginal relief. Income exceeds ₹${R0(rb.maxTaxableIncome)} by only ${R0(excessIncome)}, so the tax on slab income is held down to that excess.`;
    }
  }
  const taxAfterRebate = R(pos(taxBeforeRebate - rebate));
  if (rebate > 0) trace.push({ step: "Rebate u/s 87A (2025 Act s.156)", value: -R0(rebate), detail: rebateNote });
  else if (rebateNote) trace.push({ step: "Rebate u/s 87A", value: 0, detail: rebateNote });

  /* 6 — Surcharge, with the 15% cap on CG and dividend --------------------*/
  const cappedComponentTax = R(specialTax.s111A + specialTax.s112A + specialTax.s112
    + (pos(inp.dividendIncome) > 0 && normalIncome > 0
        ? slabPart.tax * Math.min(1, pos(inp.dividendIncome) / Math.max(1, normalIncome))
        : 0));
  const otherTax = R(pos(taxAfterRebate - cappedComponentTax));
  const sur = computeSurcharge(totalIncome, { cappedComponentTax: Math.min(cappedComponentTax, taxAfterRebate), otherTax }, regime);

  /* 6b — Surcharge marginal relief ---------------------------------------*/
  let surchargeRelief = 0;
  const band = surchargeThresholdBelow(totalIncome, regime);
  if (band && sur.amount > 0) {
    // Reference tax at the threshold, with the same income composition,
    // reduced from the slab-rate income first.
    const reduceBy = totalIncome - band.over;
    const refNormal = pos(normalIncome - reduceBy);
    const shortfall = pos(reduceBy - normalIncome);
    const scale = specialTotal > 0 ? pos(specialTotal - shortfall) / specialTotal : 0;
    const refSlab = slabTax(refNormal, slabs).tax;
    const refSpecial = R((specialTax.s111A + specialTax.s112A + specialTax.s112 + specialTax.vda) * scale);
    let refTax = R(refSlab + refSpecial);
    if (isResident && band.over <= rb.maxTaxableIncome) refTax = pos(refTax - Math.min(rb.maxRebate, refSlab));
    const ceiling = R(refTax + (totalIncome - band.over));
    const actual = R(taxAfterRebate + sur.amount);
    if (actual > ceiling) {
      surchargeRelief = R(actual - ceiling);
      trace.push({ step: "Marginal relief on surcharge", value: -R0(surchargeRelief),
        detail: `Total income crosses ₹${R0(band.over)} by ${R0(totalIncome - band.over)}. Tax plus surcharge is held to the tax at the threshold plus that excess.` });
    }
  }
  const surchargeNet = R(pos(sur.amount - surchargeRelief));
  if (surchargeNet > 0) {
    trace.push({ step: `Surcharge at ${(sur.rate * 100).toFixed(0)}%`, value: R0(surchargeNet),
      detail: sur.split && sur.cappedRate < sur.rate
        ? `Capital-gain and dividend tax of ${R0(sur.split.cappedComponentTax)} bears a capped ${(sur.cappedRate * 100).toFixed(0)}%; the remaining ${R0(sur.split.otherTax)} bears ${(sur.rate * 100).toFixed(0)}%.`
        : "" });
  }

  /* 7 — Cess -------------------------------------------------------------*/
  const cess = R((taxAfterRebate + surchargeNet) * CESS.rate);
  trace.push({ step: `${CESS.label} at 4%`, value: R0(cess) });

  const totalTax = R(taxAfterRebate + surchargeNet + cess);
  trace.push({ step: "Total tax payable", value: R0(totalTax) });

  const effectiveRate = gti > 0 ? (totalTax / gti) * 100 : 0;
  const marginal = marginalRateAt(totalIncome, regime, age, residency);

  return {
    regime, residency, age,
    grossTotalIncome: gti,
    standardDeduction: R0(stdDed),
    familyPensionDeduction: R0(fpDeduction),
    chapterVIA: R0(chVIA),
    chapterVIARequested: R0(pos(inp.chapterVIA)),
    normalIncome, specialIncome: R0(specialTotal), totalIncome,
    exemptionLimit: exemption, exemptionAdjustment: R0(exemptionAdjustment),
    slabRows: slabPart.rows, slabTax: R0(slabPart.tax),
    capitalGains: cg, specialTax, specialTaxTotal: R0(specialTaxTotal),
    taxBeforeRebate: R0(taxBeforeRebate),
    rebate: R0(rebate), rebateNote,
    taxAfterRebate: R0(taxAfterRebate),
    surcharge: R0(surchargeNet), surchargeRate: sur.rate, surchargeSplit: sur.split,
    surchargeRelief: R0(surchargeRelief),
    cess: R0(cess),
    totalTax: R0(totalTax),
    effectiveRate: R(effectiveRate),
    marginalRate: marginal,
    trace,
  };
}

/** Marginal rate on the next rupee of ordinary income, including cess and surcharge. */
export function marginalRateAt(totalIncome, regime, age, residency) {
  const slabs = slabsFor(regime, age, residency);
  let base = 0;
  for (const s of slabs) { base = s.rate; if (s.upto !== null && totalIncome < s.upto) break; }
  const sur = surchargeRateFor(totalIncome, regime);
  return R(base * (1 + sur) * (1 + CESS.rate) * 100);
}

/* ------------------------------------------------------- regime comparison */

export function compareRegimes(base, deductionsOld, deductionsNew) {
  const oldR = computeTax({ ...base, regime: "old", chapterVIA: deductionsOld });
  const newR = computeTax({ ...base, regime: "new", chapterVIA: deductionsNew });
  const saving = R0(oldR.totalTax - newR.totalTax);
  return {
    old: oldR, new: newR,
    better: saving > 0 ? "new" : saving < 0 ? "old" : "equal",
    saving: Math.abs(saving),
    /* Break-even: how much more deduction the old regime would need to match. */
    breakEvenExtraDeduction: saving > 0 ? deductionNeededToMatch(base, deductionsOld, newR.totalTax) : 0,
  };
}

function deductionNeededToMatch(base, currentOld, targetTax) {
  let lo = currentOld, hi = currentOld + 2500000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const t = computeTax({ ...base, regime: "old", chapterVIA: mid }).totalTax;
    if (t > targetTax) lo = mid; else hi = mid;
  }
  return R0(hi - currentOld);
}

/* --------------------------------------------------------- advance tax ---- */

export function advanceTaxSchedule(totalTax, tdsAlready = 0) {
  const net = pos(totalTax - pos(tdsAlready));
  const due = [
    { by: "15 June 2026",     cum: 0.15 },
    { by: "15 September 2026",cum: 0.45 },
    { by: "15 December 2026", cum: 0.75 },
    { by: "15 March 2027",    cum: 1.00 },
  ];
  let paid = 0;
  const rows = due.map((d) => {
    const cumAmt = R0(net * d.cum);
    const inst = R0(cumAmt - paid);
    paid = cumAmt;
    return { by: d.by, cumulativePct: d.cum * 100, cumulative: cumAmt, instalment: inst };
  });
  return {
    liableIfOver: 10000,
    applicable: net > 10000,
    netLiability: R0(net),
    rows,
    interest: {
      s234B: "1% a month where advance tax paid by 31 March is under 90% of the liability.",
      s234C: "1% a month for three months on each instalment shortfall.",
      seniorExemption: "A resident individual aged 60 or above with no business income is exempt from advance tax altogether.",
    },
  };
}

/* --------------------------------------------------- presumptive business */

export function presumptive({ scheme, turnover, digitalShare = 1, actualProfit = null }) {
  const t = pos(turnover);
  if (scheme === "44AD") {
    const limit = 30000000; // ₹3 crore where cash receipts stay within 5%
    const digital = t * Math.min(1, Math.max(0, digitalShare));
    const cash = t - digital;
    const deemed = digital * 0.06 + cash * 0.08;
    return {
      scheme: "s.44AD — small business", eligible: t <= limit, limit,
      deemedProfit: R0(deemed), rate: "6% on digital receipts, 8% on cash receipts",
      note: "The ₹3 crore ceiling applies only where cash receipts are 5% or less of turnover; otherwise ₹2 crore. " +
            "Declaring below the deemed rate triggers audit and books. Opting out locks you out for five years.",
      declaredHigher: actualProfit !== null && actualProfit > deemed,
    };
  }
  if (scheme === "44ADA") {
    const limit = 7500000; // ₹75 lakh where cash receipts stay within 5%
    const deemed = t * 0.5;
    return {
      scheme: "s.44ADA — specified profession", eligible: t <= limit, limit,
      deemedProfit: R0(deemed), rate: "50% of gross receipts",
      note: "For a doctor, lawyer, architect, engineer, accountant, technical consultant or interior decorator. " +
            "₹75 lakh ceiling where cash receipts are within 5% of turnover, otherwise ₹50 lakh.",
      declaredHigher: actualProfit !== null && actualProfit > deemed,
    };
  }
  return { scheme: "Regular books", deemedProfit: R0(actualProfit || 0), eligible: true };
}
