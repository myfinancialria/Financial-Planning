/* ============================================================================
   calc/ria.js — the analysis layer
   ----------------------------------------------------------------------------
   Turns the computed picture into (a) observations an adviser must look at,
   (b) a ranked, rupee-quantified tax playbook, and (c) a sequenced action plan.

   Deliberate design rule: nothing here says "buy X". Every finding states a
   fact about the client's own position, measured against the client's own
   stated goals and profile or against a statutory limit. Product selection is
   the adviser's judgement, made in writing, on the record.
   ========================================================================== */

import { DEDUCTIONS, NRI, SEBI_RIA, INSURANCE_RULES, ESTATE_RULES,
         SMALL_SAVINGS, ASSUMPTIONS } from "../rules/tax-rules.js";
import { computeTax, compareRegimes, marginalRateAt } from "./tax.js";
import { LIABILITY_TYPES, ASSET_CLASSES } from "./plan.js";

const pos = (n) => Math.max(0, Number(n) || 0);
const R0 = (n) => Math.round(Number(n) || 0);
const inr = (n) => "₹" + R0(n).toLocaleString("en-IN");

/* ------------------------------------------------------------- observations */

const SEV = { high: 3, med: 2, low: 1 };

export function findings(ctx) {
  const {
    profile, nw, ratioList, lifeCover, healthCover, goals, allocation,
    cashflowData, tax, estate, insurancePolicies = [], liabilities = [], assets = [],
  } = ctx;
  const out = [];
  const push = (sev, area, title, body, why) =>
    out.push({ sev, area, title, body, why });
  const ratio = (id) => (ratioList.find((r) => r.id === id) || {}).value || 0;
  const isNri = profile.residency === "nri";

  /* --- Protection ------------------------------------------------------ */
  if (healthCover.existingOwn === 0 && healthCover.corporate === 0) {
    push("high", "Protection", "No health insurance of any kind",
      `A hospitalisation event would be met from savings. Indicative cover for the household is ${inr(healthCover.recommendedFloor)}.`,
      "Medical inflation runs near 11% a year — well ahead of general inflation. One critical admission can consume several years of savings.");
  } else if (healthCover.corporateWarning) {
    push("high", "Protection", "Health cover depends entirely on the employer",
      healthCover.corporateWarning,
      `Recommended independent floor for this household: ${inr(healthCover.recommendedFloor)}.`);
  } else if (healthCover.gap > 0) {
    push("med", "Protection", "Health cover below the indicative floor",
      `Held ${inr(healthCover.existingOwn)} against an indicative ${inr(healthCover.recommendedFloor)} for this city and family size — short by ${inr(healthCover.gap)}.`,
      healthCover.structureTip || "");
  }

  const dependants = (profile.dependants || []).length;
  if (lifeCover.gap > 0 && dependants > 0) {
    push("high", "Protection", "Life cover short of requirement",
      `Cover held ${inr(lifeCover.existingCover)} against a net requirement of ${inr(lifeCover.netRequirement)}. Shortfall ${inr(lifeCover.gap)}.`,
      `Needs analysis: ${inr(lifeCover.breakdown.expenseReplacement)} to replace household expenses for ${lifeCover.supportYears} years, ${inr(lifeCover.breakdown.debtClearance)} to clear debt, ${inr(lifeCover.breakdown.goalFunding)} to fund committed goals. Human Life Value puts it at ${inr(lifeCover.hlv)}.`);
  } else if (dependants === 0 && lifeCover.existingCover > pos(nw.totalLiabilities) * 1.5 && lifeCover.existingCover > 0) {
    push("low", "Protection", "Life cover may exceed what it needs to do",
      `No dependants are recorded, and cover of ${inr(lifeCover.existingCover)} sits against debt of ${inr(nw.totalLiabilities)}.`,
      "Life cover replaces income other people rely on. Without dependants its job is to clear debt so it does not fall on a co-borrower or guarantor.");
  }

  const bundled = insurancePolicies.filter((p) =>
    ["ulip", "endowment", "moneyback", "wholelife"].includes(p.policyType));
  if (bundled.length) {
    const prem = bundled.reduce((s, p) => s + pos(p.annualPremium), 0);
    const sa = bundled.reduce((s, p) => s + pos(p.sumAssured), 0);
    push("med", "Protection", `${bundled.length} investment-linked insurance ${bundled.length === 1 ? "policy" : "policies"} held`,
      `Annual premium ${inr(prem)} buys ${inr(sa)} of cover — a multiple of ${sa && prem ? (sa / prem).toFixed(0) : "0"}×. Pure term cover typically buys 100× to 200× the premium.`,
      "Bundled products do two jobs at once and are structurally worse at both. Before surrendering, check the paid-up value, the surrender penalty, and whether s.80C relief already claimed would be reversed — an old policy near maturity is often better carried than cancelled.");
  }

  const noNominee = insurancePolicies.filter((p) => !p.nominee || !String(p.nominee).trim());
  if (noNominee.length) {
    push("med", "Protection", `${noNominee.length} ${noNominee.length === 1 ? "policy has" : "policies have"} no nominee recorded`,
      "A claim without a nominee runs through a succession certificate — months of delay at the exact moment the family needs the money.",
      ESTATE_RULES.nomineeVsHeir.principle);
  }

  /* --- Liquidity ------------------------------------------------------- */
  const em = ratio("emergencyMonths");
  if (em < 3) {
    push("high", "Liquidity", `Emergency buffer covers ${em.toFixed(1)} months`,
      `Against essential outgo of ${inr((cashflowData.expenses + cashflowData.emi))} a month, a six-month buffer is ${inr((cashflowData.expenses + cashflowData.emi) * 6)}.`,
      "Without a buffer, the next unexpected expense is met by breaking an investment at a bad time or by borrowing at a bad rate. This is the single highest-return fix on the list, and it is not an investment decision.");
  } else if (em < 6) {
    push("med", "Liquidity", `Emergency buffer covers ${em.toFixed(1)} months`,
      `Short of the six-month standard by ${inr(Math.max(0, (cashflowData.expenses + cashflowData.emi) * 6 - pos(ctx.emergencyFund)))}.`, "");
  }

  /* --- Debt ------------------------------------------------------------ */
  const costly = liabilities.filter((l) => pos(l.rate) >= 14 && pos(l.outstanding) > 0);
  if (costly.length) {
    const tot = costly.reduce((s, l) => s + pos(l.outstanding), 0);
    const annualInterest = costly.reduce((s, l) => s + pos(l.outstanding) * pos(l.rate) / 100, 0);
    push("high", "Debt", "High-cost debt outstanding",
      `${costly.map((l) => `${(LIABILITY_TYPES[l.type] || {}).label || l.type} ${inr(l.outstanding)} at ${l.rate}%`).join("; ")}. Total ${inr(tot)}, costing ${inr(annualInterest)} a year in interest alone.`,
      `Clearing this is a guaranteed, tax-free return equal to the interest rate. No investment offers ${Math.max(...costly.map((l) => pos(l.rate))).toFixed(0)}% with certainty. It ranks ahead of every SIP.`);
  }
  if (ratio("emiToIncome") > 0.40) {
    push("high", "Debt", `EMIs take ${(ratio("emiToIncome") * 100).toFixed(0)}% of income`,
      `${inr(cashflowData.emi)} of ${inr(cashflowData.income)} monthly income is committed before anything else happens.`,
      "Above 40% there is no capacity left to absorb a rate rise, an income gap, or an emergency. Lenders themselves stop at roughly 50%.");
  } else if (ratio("emiToIncome") > 0.30) {
    push("med", "Debt", `EMIs take ${(ratio("emiToIncome") * 100).toFixed(0)}% of income`,
      "Above the 30% comfort threshold.", "");
  }

  /* --- Cash flow ------------------------------------------------------- */
  const freeCashFlow = cashflowData.income - cashflowData.committed;
  if (freeCashFlow < 0) {
    push("high", "Cash flow", "Committed outgo exceeds income",
      `Living costs, EMIs and premiums come to ${inr(cashflowData.committed)} against income of ${inr(cashflowData.income)} — a monthly shortfall of ${inr(-freeCashFlow)} before a rupee is invested.`,
      "A deficit at this level is being funded from savings or from credit. Nothing else in the plan works until the sign changes.");
  } else if (cashflowData.surplus < 0) {
    push("med", "Cash flow", "Contributions exceed free cash flow",
      `After living costs, EMIs and premiums, ${inr(freeCashFlow)} a month is left, against ${inr(cashflowData.investments)} of scheduled contributions — an overshoot of ${inr(-cashflowData.surplus)}.`,
      "The gap is being met from existing balances. It is sustainable only for as long as those last, and it is the usual reason a SIP gets cancelled in a bad month. Either the contribution or the spending has to give.");
  } else if (ratio("savingsRate") < 0.10 && cashflowData.income > 0) {
    push("high", "Cash flow", `Savings rate of ${(ratio("savingsRate") * 100).toFixed(0)}%`,
      "Below 10%, capital does not accumulate fast enough for compounding to matter over a working life.", "");
  } else if (ratio("savingsRate") < 0.20 && cashflowData.income > 0) {
    push("med", "Cash flow", `Savings rate of ${(ratio("savingsRate") * 100).toFixed(0)}%`,
      "Below the 20% mark that most long-horizon goals assume.", "");
  }
  if (cashflowData.surplus > cashflowData.income * 0.15 && cashflowData.income > 0) {
    push("med", "Cash flow", `${inr(cashflowData.surplus)} a month is unallocated`,
      "Surplus with no destination tends to be absorbed by spending rather than by goals.",
      `Directed at the goal shortfall of ${inr(ctx.goals.totalShortfallSip)} a month, it would close ${ctx.goals.totalShortfallSip > 0 ? Math.min(100, (cashflowData.surplus / ctx.goals.totalShortfallSip) * 100).toFixed(0) : 100}% of it.`);
  }

  /* --- Goals ----------------------------------------------------------- */
  for (const g of goals.rows) {
    if (g.status === "critical" && g.futureCost > 0) {
      push("high", "Goals", `${g.name} is critically underfunded`,
        `${g.years} years out. Projected ${inr(g.projected)} against a future cost of ${inr(g.futureCost)} — ${g.fundedPct.toFixed(0)}% funded. Required contribution ${inr(g.requiredSip)} a month against ${inr(g.monthlySip)} running.`,
        `Inflating at ${g.inflation}% and growing at ${g.expectedReturn}%. The options are more contribution, a later date, a smaller target, or accepting the gap — stated explicitly, not left to drift.`);
    } else if (g.status === "behind" && g.futureCost > 0) {
      push("med", "Goals", `${g.name} is behind`,
        `${g.fundedPct.toFixed(0)}% funded on current contributions. A further ${inr(g.sipShortfall)} a month closes it.`, "");
    }
    if (g.years <= 2 && g.recommendedEquity === 0 && g.assetMix === "equity") {
      push("high", "Goals", `${g.name} is due in ${g.years} years but funded from equity`,
        "A goal inside two years cannot carry equity risk — a drawdown arriving in the final year cannot be waited out.",
        g.horizonNote);
    }
  }

  /* --- Allocation ------------------------------------------------------ */
  if (allocation.investable > 0) {
    if (allocation.needsRebalance) {
      const worst = allocation.rows.slice().sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))[0];
      push("med", "Portfolio", `Allocation has drifted ${(Math.abs(worst.drift) * 100).toFixed(0)} points from target`,
        `${worst.key} sits at ${(worst.actual * 100).toFixed(0)}% against a target of ${(worst.target * 100).toFixed(0)}% for a ${profile.riskProfile} profile — ${inr(Math.abs(worst.rupeeDrift))} ${worst.drift > 0 ? "over" : "under"}weight.`,
        "Rebalancing is the mechanism that enforces selling high and buying low. Note the tax cost before acting — see the capital-gains position.");
    }
    if (allocation.largestHolding && allocation.largestHolding.share > 0.25) {
      push("med", "Portfolio", "Concentration in a single holding",
        `${allocation.largestHolding.name} is ${(allocation.largestHolding.share * 100).toFixed(0)}% of investable assets at ${inr(allocation.largestHolding.value)}.`,
        "Concentration is how wealth is built and how it is lost. It deserves a deliberate decision rather than an accidental one.");
    }
    const esop = assets.filter((a) => a.assetClass === "esop").reduce((s, a) => s + pos(a.value), 0);
    if (esop > 0 && cashflowData.income > 0 && esop > allocation.investable * 0.2) {
      push("med", "Portfolio", "Employer stock and salary share one risk",
        `${inr(esop)} of employer equity — ${(esop / allocation.investable * 100).toFixed(0)}% of investable assets — sits alongside the salary from the same company.`,
        "If the employer runs into trouble, income and capital fall together. That is the one correlation a portfolio should never carry.");
    }
    if (allocation.realEstateShare > 0.6) {
      push("low", "Portfolio", `Real estate is ${(allocation.realEstateShare * 100).toFixed(0)}% of investable assets`,
        "Illiquid, indivisible and hard to rebalance.",
        "Not a problem in itself, but it limits what the rest of the portfolio can be asked to do.");
    }
  }

  /* --- Tax ------------------------------------------------------------- */
  if (tax && tax.comparison) {
    const c = tax.comparison;
    if (c.saving > 1000) {
      push("med", "Tax", `The ${c.better === "new" ? "new" : "old"} regime is cheaper by ${inr(c.saving)}`,
        `Old regime ${inr(c.old.totalTax)} against new regime ${inr(c.new.totalTax)} on the deductions recorded.`,
        c.better === "new" && c.breakEvenExtraDeduction > 0
          ? `The old regime would need a further ${inr(c.breakEvenExtraDeduction)} of eligible deductions to match. A salaried taxpayer may switch each year; a taxpayer with business income who leaves the new regime may return to it only once.`
          : "A salaried taxpayer chooses afresh each year.");
    }
  }
  if (isNri) {
    const holdsProhibited = assets.filter((a) => a.assetClass === "smallSavings" && pos(a.value) > 0);
    if (holdsProhibited.length) {
      push("high", "Compliance", "Small-savings holdings need review against non-resident status",
        "PPF, SSY, SCSS, NSC and KVP are closed to non-residents. An account opened while resident generally runs to maturity but cannot be extended; SSY must be closed on a change of status.",
        NRI.fema.statusChange);
    }
    push("med", "Compliance", "Resident bank accounts must be redesignated",
      NRI.fema.statusChange,
      "Continuing to operate a resident savings account after becoming a non-resident is a FEMA contravention, independent of any tax question.");
    const property = assets.filter((a) => ["realEstate", "homeSelf"].includes(a.assetClass) && pos(a.value) > 0);
    if (property.length) {
      push("med", "Compliance", "Plan any Indian property sale around s.197 before signing",
        NRI.section197.why,
        NRI.section197.how);
    }
  }

  /* --- Estate ---------------------------------------------------------- */
  if (!estate.hasWill) {
    push(nw.netWorth > 5000000 ? "high" : "med", "Estate", "No will recorded",
      `Net worth of ${inr(nw.netWorth)} would devolve under intestate succession — a statutory formula, not the client's intention.`,
      ESTATE_RULES.will.validity);
  } else if (estate.lastReviewedYears > 3) {
    push("low", "Estate", `Will last reviewed ${estate.lastReviewedYears} years ago`,
      "Marriage, a birth, a death, a property purchase or a change of residence each alter how a will operates.", "");
  }
  if (estate.nominationGaps > 0) {
    push("med", "Estate", `${estate.nominationGaps} ${estate.nominationGaps === 1 ? "asset has" : "assets have"} no nomination recorded`,
      "Nomination is what lets an institution release an asset without a court order.",
      ESTATE_RULES.nomineeVsHeir.detail);
  }
  if (isNri && estate.hasWill && !estate.indianWill) {
    push("med", "Estate", "Indian assets are covered only by a foreign will",
      ESTATE_RULES.nriEstate.twoWills, ESTATE_RULES.nriEstate.situs);
  }

  return out.sort((a, b) => SEV[b.sev] - SEV[a.sev]);
}

/* --------------------------------------------------- the tax-saving playbook */

/**
 * Ranked, quantified levers. Each entry states the rupee tax saved at the
 * client's own marginal rate, what it costs in cash, and the catch.
 */
export function taxPlaybook(ctx) {
  const { profile, tax, cashflowData, nw, liabilities = [], deductionsUsed = {}, salary = {} } = ctx;
  const regime = tax.chosenRegime;
  const marginal = marginalRateAt(tax.result.totalIncome, regime, profile.age, profile.residency) / 100;
  const isNri = profile.residency === "nri";
  const items = [];
  const add = (o) => items.push({ ...o, saving: R0(o.saving) });

  /* Employer NPS — the one large lever that survives the new regime. */
  const basicDa = pos(salary.basic) + pos(salary.da);
  const npsCapPct = regime === "new" ? 0.14 : (profile.employerType === "government" ? 0.14 : 0.10);
  const npsRoom = Math.max(0, basicDa * npsCapPct - pos(deductionsUsed.employerNps));
  if (basicDa > 0 && npsRoom > 1000) {
    add({
      id: "80CCD2", rank: 1,
      title: "Route part of CTC through employer NPS, s.80CCD(2)",
      saving: npsRoom * marginal,
      cost: "No extra cash — it is a restructuring of existing CTC, not new spending.",
      detail: `Unused room ${inr(npsRoom)}, being ${(npsCapPct * 100).toFixed(0)}% of basic plus DA (${inr(basicDa)}) less the ${inr(pos(deductionsUsed.employerNps))} already routed.`,
      catch: "Locked to 60. At exit, 60% is withdrawable tax-free and 40% must buy an annuity, whose income is taxable. Needs the employer to agree to restructure the salary.",
      availableIn: "Both regimes — the only major deduction that is.",
      applies: true,
    });
  }

  if (regime === "old") {
    const c80 = Math.max(0, 150000 - pos(deductionsUsed.s80C));
    if (c80 > 1000) add({
      id: "80C", rank: 2, title: "Fill the s.80C ceiling",
      saving: c80 * marginal,
      cost: `${inr(c80)} of investment or eligible spending.`,
      detail: `${inr(pos(deductionsUsed.s80C))} of the ₹1,50,000 limit is used. EPF already contributed, home-loan principal repaid, and children's tuition fees all count before any new investment is made.`,
      catch: "ELSS locks for three years, PPF for fifteen, a tax-saver deposit for five. Count what is already there first — most people are closer to the limit than they think.",
      availableIn: "Old regime only.", applies: true,
    });

    const c1b = Math.max(0, 50000 - pos(deductionsUsed.s80CCD1B));
    if (c1b > 1000) add({
      id: "80CCD1B", rank: 3, title: "Additional NPS contribution, s.80CCD(1B)",
      saving: c1b * marginal, cost: `${inr(c1b)} into NPS Tier-I.`,
      detail: "Sits over and above the ₹1.5 lakh ceiling, so it is genuinely additional room.",
      catch: "Same lock-in and annuity requirement as above.",
      availableIn: "Old regime only.", applies: true,
    });

    const senior = profile.age >= 60;
    const parentsSenior = (profile.dependants || []).some((d) => d.relationship === "parent" && pos(d.age) >= 60);
    const selfCap = senior ? 50000 : 25000;
    const parentCap = parentsSenior ? 50000 : 25000;
    const d80 = Math.max(0, selfCap + parentCap - pos(deductionsUsed.s80D));
    if (d80 > 1000) add({
      id: "80D", rank: 4, title: "Health insurance premium, s.80D",
      saving: d80 * marginal, cost: `${inr(d80)} of premium — which buys cover, not just relief.`,
      detail: `${inr(selfCap)} for self, spouse and children${parentsSenior ? `, plus ${inr(parentCap)} for senior-citizen parents` : `, plus ${inr(parentCap)} for parents`}. Preventive check-ups of ₹5,000 count inside these limits, not on top.`,
      catch: "Premium must be paid other than in cash. The deduction is a by-product; buy the cover for the cover.",
      availableIn: "Old regime only.", applies: true,
    });

    const homeLoans = liabilities.filter((l) => l.type === "home" && pos(l.outstanding) > 0);
    if (homeLoans.length) {
      const interest = homeLoans.reduce((s, l) => s + pos(l.outstanding) * pos(l.rate) / 100, 0);
      const claimable = Math.min(interest, 200000) - pos(deductionsUsed.s24b);
      if (claimable > 1000) add({
        id: "24B", rank: 5, title: "Home-loan interest on a self-occupied property, s.24(b)",
        saving: claimable * marginal, cost: "Already being paid — this is relief on an existing outgo.",
        detail: `Roughly ${inr(interest)} of interest accrues this year; ${inr(Math.min(interest, 200000))} is deductible.`,
        catch: "Capped at ₹2,00,000 and unavailable under the new regime. Principal repayment sits inside the s.80C limit, not on top of it.",
        availableIn: "Old regime only.", applies: true,
      });
    }
    if (pos(salary.hra) > 0 && pos(ctx.rentPaid) > 0) add({
      id: "HRA", rank: 6, title: "House Rent Allowance, s.10(13A)",
      saving: pos(ctx.hraExempt) * marginal, cost: "Rent already being paid.",
      detail: `Exempt portion ${inr(ctx.hraExempt)} on rent of ${inr(ctx.rentPaid)}.`,
      catch: "Landlord's PAN is mandatory once annual rent crosses ₹1,00,000. Rent paid to a parent is allowed but must be genuine, banked, and declared by the parent as income.",
      availableIn: "Old regime only.", applies: true,
    });
  }

  /* Capital-gains housekeeping — available to everyone. */
  const unrealised = pos(ctx.unrealisedEquityGain);
  const usedExemption = pos(tax.result.capitalGains?.s112A?.exemptionUsed);
  const headroom = Math.max(0, 125000 - usedExemption);
  if (headroom > 5000 && unrealised > 0) add({
    id: "harvest", rank: 7, title: "Harvest the s.112A annual exemption",
    saving: Math.min(headroom, unrealised) * 0.125,
    cost: "No cash cost — sell and repurchase the same units.",
    detail: `${inr(headroom)} of the ₹1,25,000 annual long-term exemption is unused. Realising that much gain now resets the cost base upward at zero tax.`,
    catch: "It only works on gains already long-term. Repurchase starts a fresh twelve-month clock, and the round trip costs brokerage, STT and a day or two out of the market. It is housekeeping, not a strategy.",
    availableIn: "Both regimes.", applies: true,
  });

  const stLosses = pos(ctx.unrealisedEquityLoss);
  const stGains = pos(tax.result.capitalGains?.s111A?.amount);
  if (stLosses > 0 && stGains > 0) add({
    id: "tlh", rank: 8, title: "Set realised losses against realised gains",
    saving: Math.min(stLosses, stGains) * 0.20,
    cost: "Crystallises a loss that already exists on paper.",
    detail: `${inr(stLosses)} of unrealised loss against ${inr(stGains)} of short-term gain taxed at 20%.`,
    catch: "A short-term loss offsets both short and long-term gains; a long-term loss offsets only long-term gains. Unused losses carry forward eight years, but only if the return is filed by the due date. India has no wash-sale rule, though selling purely to book a loss and repurchasing immediately invites scrutiny.",
    availableIn: "Both regimes.", applies: true,
  });

  if (isNri) {
    add({
      id: "dtaa", rank: 1.5, title: "Claim treaty relief on NRO income",
      saving: pos(ctx.nroInterest) * Math.max(0, 0.30 - 0.15),
      cost: "Documentation only.",
      detail: `NRO interest suffers 30% at source plus surcharge and cess. Most treaties cut it to 10–15%. On ${inr(ctx.nroInterest)} of NRO interest that is a meaningful difference — recoverable by refund even if not applied at source.`,
      catch: "Needs a Tax Residency Certificate from the country of residence and Form 10F filed electronically before the deduction. Both must be in place before the interest is credited, not afterwards.",
      availableIn: "Non-residents.", applies: true,
    });
    add({
      id: "nre", rank: 2.5, title: "Hold foreign earnings in NRE or FCNR, not NRO",
      saving: pos(ctx.nroBalanceFromForeign) * 0.06 * 0.30,
      cost: "None — it is an account-designation decision.",
      detail: "NRE and FCNR interest is exempt u/s 10(4)(ii) while non-resident status holds, and is fully repatriable. NRO interest is fully taxable and repatriation runs through the USD 1 million window.",
      catch: "NRE can only be funded from foreign earnings. Indian-source income — rent, dividends, pension — must go to NRO. The exemption ends the day residency changes.",
      availableIn: "Non-residents.", applies: true,
    });
    if (pos(ctx.indianPropertyValue) > 0) add({
      id: "s197", rank: 3.5, title: "Obtain a s.197 lower-deduction certificate before selling property",
      saving: 0,
      savingNote: "Cash-flow timing, not a tax reduction.",
      detail: NRI.section197.why,
      cost: "Form 13 on TRACES, six to eight weeks.",
      catch: "It must be obtained before the sale deed is executed. Afterwards the only remedy is a refund claim in the return, which takes a year or more.",
      availableIn: "Non-residents.", applies: true,
    });
  }

  if (profile.age >= 60 && regime === "old") {
    add({ id:"80TTB", rank:9, title:"Interest deduction for senior citizens, s.80TTB",
      saving: Math.min(50000, pos(ctx.depositInterest)) * marginal,
      cost:"None — it applies to interest already being earned.",
      detail:"₹50,000 of interest across savings accounts, fixed and recurring deposits, against ₹10,000 of savings-account interest only for everyone else.",
      catch:"Old regime only. Form 15H stops the deduction at source where total income stays below the taxable threshold.",
      availableIn:"Old regime, resident senior citizens.", applies:true });
  }

  return items
    .filter((i) => i.applies && (i.saving > 500 || i.savingNote))
    .sort((a, b) => (b.saving - a.saving) || (a.rank - b.rank));
}

/* ----------------------------------------------------------- action plan */

export function actionPlan(ctx, findingsList, playbook) {
  const { threePlan, cashflowData, goals } = ctx;
  const actions = [];
  const seq = (horizon, title, detail, measure) =>
    actions.push({ horizon, title, detail, measure });

  const high = findingsList.filter((f) => f.sev === "high");
  const med = findingsList.filter((f) => f.sev === "med");

  for (const f of high.slice(0, 6)) {
    seq("Now — next 30 days", f.title, f.body,
        f.area === "Protection" ? "Cover in force, policy document on file"
      : f.area === "Liquidity" ? "Buffer balance reaches the six-month mark"
      : f.area === "Debt" ? "Balance cleared or refinanced"
      : "Position corrected and evidenced");
  }
  if (playbook.length) {
    const top = playbook.slice(0, 3);
    const total = top.reduce((s, p) => s + p.saving, 0);
    seq("This quarter", "Act on the tax levers before the year closes",
      `${top.map((p) => p.title).join("; ")}. Together worth about ${inr(total)} this year.`,
      "Proofs of investment submitted, regime election confirmed with the employer");
  }
  if (goals.totalShortfallSip > 0) {
    seq("This quarter", "Close the contribution gap",
      `Goals need ${inr(goals.totalRequiredSip)} a month against ${inr(goals.totalCurrentSip)} running — a gap of ${inr(goals.totalShortfallSip)}.` +
      (cashflowData.surplus > 0 ? ` Unallocated surplus of ${inr(cashflowData.surplus)} covers ${Math.min(100, (cashflowData.surplus / goals.totalShortfallSip) * 100).toFixed(0)}% of it.` : ""),
      "Mandates registered; the first instalment debits");
  }
  for (const f of med.slice(0, 5)) {
    seq("Next 6 months", f.title, f.body, "Reviewed and closed at the next meeting");
  }
  if (!threePlan.plan1.complete) {
    seq("Ongoing", "Complete Plan 1 before extending Plan 2",
      `${threePlan.plan1.done} of ${threePlan.plan1.total} safety items are in place. Goal investing sits on top of the safety layer, not beside it.`,
      "All five Plan 1 items marked done");
  }
  seq("Annually", "Review the whole plan",
    "Regime election, risk profile, cover adequacy against changed income, nomination register, will, and goal progress against target.",
    "Signed review note on file — required in any case by the SEBI record-keeping obligation");

  return actions;
}

/* ------------------------------------------------------- SEBI compliance */

export function complianceChecklist(ctx) {
  const { profile, riskProfileScore, feeArrangement = {} } = ctx;
  const items = [
    { id:"agreement", label:"Written Investment Advisory Agreement executed before advice",
      done: !!profile.agreementDate, detail: profile.agreementDate || "Not recorded",
      cite:"Reg. 19(1)(d) and the mandatory-agreement circular" },
    { id:"kyc", label:"KYC completed and PAN on record",
      done: !!profile.pan, detail: profile.pan ? "PAN recorded" : "PAN not recorded",
      cite:"Reg. 16" },
    { id:"risk", label:"Risk profile completed, and the client's consent to it recorded",
      done: riskProfileScore != null && !!profile.riskProfileAccepted,
      detail: riskProfileScore != null
        ? `Score ${riskProfileScore}, category ${profile.riskProfile}${profile.riskProfileAccepted ? ", accepted" : ", not yet accepted by the client"}`
        : "Not completed",
      cite:"Reg. 16(c) and 17" },
    { id:"suitability", label:"Advice consistent with the recorded risk profile",
      done: !!ctx.suitabilityConsistent,
      detail: ctx.suitabilityConsistent ? "Recommended allocation matches the profile"
            : "Recommended or actual allocation sits outside the profile — the rationale must be documented",
      cite:"Reg. 17" },
    { id:"fee", label:"Fee within the applicable cap, and the mode disclosed",
      done: !!feeArrangement.mode && feeArrangement.withinCap !== false,
      detail: feeArrangement.mode
        ? `${feeArrangement.mode === "fixed" ? "Fixed fee" : "AUA"} — ${feeArrangement.display || ""}${feeArrangement.withinCap === false ? " — EXCEEDS the cap" : ""}`
        : "Not recorded",
      cite:"Reg. 15A — ₹1,51,000 a year per family, or 2.5% of AUA" },
    { id:"conflict", label:"Conflicts of interest disclosed in writing",
      done: !!profile.conflictsDisclosed, detail: profile.conflictsDisclosed ? "Disclosed" : "Not recorded",
      cite:"Reg. 15(1) — fiduciary duty" },
    { id:"segregation", label:"Advisory and distribution kept segregated at family level",
      done: profile.distributionRelationship !== true || !!profile.segregationConfirmed,
      detail: profile.distributionRelationship
        ? (profile.segregationConfirmed ? "Confirmed" : "A distribution relationship exists — segregation must be evidenced")
        : "No distribution relationship",
      cite:"Reg. 22 and 22B" },
    { id:"records", label:"Interaction and rationale records maintained for five years",
      done: !!profile.recordsMaintained, detail: profile.recordsMaintained ? "Confirmed" : "Not confirmed",
      cite:"Reg. 19" },
    { id:"nocustody", label:"No custody of, or discretion over, client assets",
      done: true, detail:"Structural — this tool holds no assets and places no orders",
      cite:"Reg. 22" },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, complete: done === items.length };
}

export function feeCheck({ mode, annualFee, aua, familyMembers = 1 }) {
  if (mode === "fixed") {
    const cap = 151000;
    return { mode, cap, charged: R0(annualFee), withinCap: pos(annualFee) <= cap,
      display: `${inr(annualFee)} against a cap of ${inr(cap)} per family per year`,
      note: SEBI_RIA.feeModes[0].note };
  }
  if (mode === "aua") {
    const cap = pos(aua) * 0.025;
    return { mode, cap: R0(cap), charged: R0(annualFee), withinCap: pos(annualFee) <= cap,
      display: `${inr(annualFee)} on AUA of ${inr(aua)} — ${pos(aua) > 0 ? (pos(annualFee) / pos(aua) * 100).toFixed(2) : "0"}% against a 2.5% cap`,
      note: SEBI_RIA.feeModes[1].note };
  }
  return { mode: null, withinCap: null, display: "" };
}

/* ------------------------------------------------------- risk profiling */

export const RISK_QUESTIONS = [
  { id:"horizon", dim:"capacity", q:"When will the largest part of this money be needed?",
    options:[ {t:"Within 2 years",v:1},{t:"2 to 5 years",v:2},{t:"5 to 10 years",v:3},
              {t:"10 to 20 years",v:4},{t:"Beyond 20 years",v:5} ] },
  { id:"stability", dim:"capacity", q:"How stable is the income funding this plan?",
    options:[ {t:"Irregular or uncertain",v:1},{t:"Variable — commission or business",v:2},
              {t:"Stable with a variable component",v:3},{t:"Salaried and secure",v:4},
              {t:"Secure, with a second household income",v:5} ] },
  { id:"buffer", dim:"capacity", q:"If income stopped tomorrow, how long would liquid savings last?",
    options:[ {t:"Under a month",v:1},{t:"1 to 3 months",v:2},{t:"3 to 6 months",v:3},
              {t:"6 to 12 months",v:4},{t:"Over a year",v:5} ] },
  { id:"dependants", dim:"capacity", q:"How many people depend on this income?",
    options:[ {t:"Four or more",v:1},{t:"Three",v:2},{t:"Two",v:3},{t:"One",v:4},{t:"Nobody",v:5} ] },
  { id:"drawdown", dim:"willingness", q:"The portfolio falls 25% in four months. What do you actually do?",
    options:[ {t:"Sell everything and stop",v:1},{t:"Sell some to limit the damage",v:2},
              {t:"Hold, but stop new contributions",v:3},{t:"Hold and keep contributing",v:4},
              {t:"Add more deliberately",v:5} ] },
  { id:"tradeoff", dim:"willingness", q:"Which outcome would you rather own over ten years?",
    options:[ {t:"6% a year, never a losing year",v:1},{t:"8% a year, occasional small dips",v:2},
              {t:"10% a year, a 20% fall roughly once a decade",v:3},
              {t:"12% a year, a 35% fall roughly once a decade",v:4},
              {t:"14% a year, a 50% fall is possible",v:5} ] },
  { id:"experience", dim:"knowledge", q:"What have you actually held, with your own money?",
    options:[ {t:"Deposits and savings only",v:1},{t:"Some mutual funds",v:2},
              {t:"Equity funds through a full cycle",v:3},{t:"Direct equity as well",v:4},
              {t:"Derivatives, unlisted or international assets",v:5} ] },
  { id:"behaviour", dim:"willingness", q:"In the worst market you have personally lived through, what did you do?",
    options:[ {t:"Have not invested through a downturn",v:2},{t:"Exited and stayed out",v:1},
              {t:"Exited, returned later",v:2},{t:"Held throughout",v:4},{t:"Added to positions",v:5} ] },
];

export function scoreRiskProfile(answers = {}) {
  const dims = { capacity: [], willingness: [], knowledge: [] };
  for (const q of RISK_QUESTIONS) {
    const v = answers[q.id];
    if (v != null) dims[q.dim].push(Number(v));
  }
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const capacity = avg(dims.capacity), willingness = avg(dims.willingness), knowledge = avg(dims.knowledge);
  if (capacity == null || willingness == null) return null;

  // SEBI's own framing: the LOWER of capacity and willingness governs.
  // Knowledge caps the ceiling but cannot raise the floor.
  const governing = Math.min(capacity, willingness);
  const capped = knowledge != null ? Math.min(governing, knowledge + 1) : governing;
  const score = Math.round(capped * 20);
  const category =
    capped < 1.8 ? "conservative" : capped < 2.6 ? "moderate" :
    capped < 3.4 ? "balanced"     : capped < 4.2 ? "growth"   : "aggressive";

  return {
    score, category,
    capacity: +capacity.toFixed(2), willingness: +willingness.toFixed(2),
    knowledge: knowledge != null ? +knowledge.toFixed(2) : null,
    governedBy: capacity <= willingness ? "capacity" : "willingness",
    answered: Object.keys(answers).length, total: RISK_QUESTIONS.length,
    note: Math.abs(capacity - willingness) > 1
      ? `Capacity (${capacity.toFixed(1)}) and willingness (${willingness.toFixed(1)}) diverge by more than a full point. ` +
        (capacity > willingness
          ? "The client can afford more risk than they are comfortable taking. Forcing the gap closed tends to end in a panic sale — plan to the comfort level and revisit it as experience accumulates."
          : "The client is willing to take more risk than their circumstances support. Capacity governs; the appetite is not the constraint here, the balance sheet is.")
      : "Capacity and willingness are consistent.",
  };
}
