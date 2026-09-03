/* ============================================================================
   calc/allocation.js — goal-level asset allocation, fund-category sleeves,
   the glide path, and the rebalancing plan.

   Two rules govern everything here:

   1. HORIZON BINDS, PROFILE MODULATES. An aggressive investor with an
      eighteen-month goal still cannot use equity for it, and a conservative
      investor with a twenty-five-year goal still needs some. The horizon sets
      the ceiling; the risk profile decides where under that ceiling to sit.

   2. RECOMMEND CATEGORIES, NEVER SCHEMES. A category mandate is regulated and
      durable. Scheme selection is the adviser's judgement, made on their own
      record, and stale within a quarter.
   ========================================================================== */

import { CATEGORIES, FUND_TAX, taxFor } from "../rules/fund-categories.js";
import { ALLOCATION_GUIDE, ASSUMPTIONS } from "../rules/tax-rules.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pos = (n) => Math.max(0, Number(n) || 0);
const R0 = (n) => Math.round(Number(n) || 0);
const num = (n) => Number(n) || 0;

/* -------------------------------------------------------- the equity glide */

/**
 * Maximum sensible equity share for money needed in `years`.
 * A continuous curve rather than steps, because a goal does not become
 * differently investable the day it crosses a band boundary.
 *
 *   ≤1y   0%      money with a date inside a year cannot carry equity at all
 *   1-3y  0→15%
 *   3-5y  15→30%
 *   5-10y 30→65%
 *   10-15 65→80%
 *   >15y  80%
 */
export function equityCeilingFor(years) {
  const y = pos(years);
  if (y <= 1) return 0;
  if (y <= 3) return 0.15 * (y - 1) / 2;
  if (y <= 5) return 0.15 + 0.15 * (y - 3) / 2;
  if (y <= 10) return 0.30 + 0.35 * (y - 5) / 5;
  if (y <= 15) return 0.65 + 0.15 * (y - 10) / 5;
  return 0.80;
}

/** Why the ceiling is what it is, in words, for the horizon in question. */
export function horizonRationale(years) {
  const y = pos(years);
  if (y <= 1) return "Inside a year, a fall cannot be waited out. Capital protection is the only objective.";
  if (y <= 3) return "One to three years. A drawdown arriving late in this window would still be unrecovered on the date the money is needed.";
  if (y <= 5) return "Three to five years. Enough time to absorb an ordinary correction, not enough to absorb a bad one — a modest equity sleeve on a debt core.";
  if (y <= 10) return "Five to ten years. Long enough for equity to do most of the work, with the last three years' worth progressively moved to safety.";
  if (y <= 15) return "Ten to fifteen years. Equity's volatility is a cost worth paying; the risk that matters now is inflation, not price.";
  return "Beyond fifteen years, the dominant risk is holding too little equity, not too much. Inflation compounds against a debt-heavy portfolio.";
}

/* ------------------------------------------------------- target asset mix */

const PRIORITY_TILT = { must: -0.08, should: 0, nice: 0.04 };

/**
 * Target equity / debt / gold for one goal.
 * `priority` shifts the answer: a goal that MUST happen on a fixed date earns
 * a more conservative mix than a discretionary goal at the same horizon.
 */
export function targetMix({ years, riskProfile = "balanced", priority = "should" }) {
  const base = (ALLOCATION_GUIDE.byRisk[riskProfile] || ALLOCATION_GUIDE.byRisk.balanced).equity;
  const ceiling = equityCeilingFor(years);
  // Priority matters most where there is no time to recover from being wrong.
  // A car needed in three years earns the full conservative tilt; a retirement
  // twenty years out has time on its side and earns almost none of it.
  const tiltDecay = Math.max(0, 1 - pos(years) / 15);
  const tilt = (PRIORITY_TILT[priority] ?? 0) * tiltDecay;

  const equity = clamp(Math.min(base, ceiling) + tilt, 0, ceiling);
  const remainder = 1 - equity;

  // Gold is a diversifier, not a holding in its own right. Capped at 10% of the
  // portfolio, and dropped entirely for goals inside three years, where its own
  // volatility is the problem it was supposed to solve.
  const gold = years < 3 ? 0 : Math.min(0.10, remainder * 0.18);
  const debt = remainder - gold;

  return {
    equity: +equity.toFixed(4), debt: +debt.toFixed(4), gold: +gold.toFixed(4),
    ceiling: +ceiling.toFixed(4),
    boundBy: Math.min(base, ceiling) === ceiling && base > ceiling ? "horizon" : "risk profile",
    profileEquity: base,
    priorityTilt: +tilt.toFixed(4), tiltDecay: +tiltDecay.toFixed(3),
  };
}

/* ---------------------------------------------------------- fund sleeves */

const RISK_SATELLITE = {
  conservative: 0.10, moderate: 0.25, balanced: 0.35, growth: 0.45, aggressive: 0.55,
};

/** Split the equity share across categories. Weights sum to 1 within equity. */
export function equitySleeve({ years, riskProfile = "balanced", oldRegimeS80CRoom = 0 }) {
  const y = pos(years);
  const horizonCapacity = y <= 5 ? 0 : y <= 10 ? 0.30 : y <= 15 ? 0.45 : 0.50;
  const satellite = Math.min(horizonCapacity, RISK_SATELLITE[riskProfile] ?? 0.35);

  const intl = y > 7 && (RISK_SATELLITE[riskProfile] ?? 0.35) >= 0.25 ? 0.15
             : y > 5 ? 0.10 : 0;

  const smallEligible = y >= 10;
  const mid = smallEligible ? satellite * 0.55 : satellite;
  const small = smallEligible ? satellite * 0.45 : 0;
  const core = Math.max(0, 1 - satellite - intl);

  const rows = [];
  if (core > 0.001) {
    // Where s.80C room is genuinely unfilled under the old regime, part of the
    // core can do two jobs. Never more than the room actually available.
    if (oldRegimeS80CRoom > 0) {
      rows.push({ cat: "elss", weight: +Math.min(core * 0.4, 0.4).toFixed(4),
        note: "Only while the old regime is in force and s.80C is genuinely unfilled." });
      rows.push({ cat: y <= 7 ? "largeCap" : "flexiCap", weight: +(core - Math.min(core * 0.4, 0.4)).toFixed(4) });
    } else if (y <= 7) {
      rows.push({ cat: "largeCap", weight: +(core * 0.6).toFixed(4) });
      rows.push({ cat: "indexFund", weight: +(core * 0.4).toFixed(4) });
    } else {
      rows.push({ cat: "flexiCap", weight: +(core * 0.55).toFixed(4) });
      rows.push({ cat: "indexFund", weight: +(core * 0.45).toFixed(4) });
    }
  }
  if (mid > 0.001) rows.push({ cat: "midCap", weight: +mid.toFixed(4) });
  if (small > 0.001) rows.push({ cat: "smallCap", weight: +small.toFixed(4) });
  if (intl > 0.001) rows.push({ cat: "international", weight: +intl.toFixed(4) });

  return rows.filter((r) => r.weight > 0.005);
}

/**
 * Split the debt share across categories, driven by horizon.
 * `retiralCover` is the share of the goal's debt requirement already met by
 * EPF, PPF and the debt part of NPS — money that is already debt, already
 * tax-favoured, and should be counted before any debt fund is bought.
 */
export function debtSleeve({ years, retiralCover = 0, marginalRate = 30 }) {
  const y = pos(years);
  let rows;
  if (y <= 1) {
    rows = [{ cat: "liquid", weight: 1 }];
  } else if (y <= 3) {
    rows = [{ cat: "ultraShortToShort", weight: 0.45 }, { cat: "shortTerm", weight: 0.55 }];
  } else if (y <= 5) {
    rows = [{ cat: "shortTerm", weight: 0.40 }, { cat: "corporateBond", weight: 0.35 },
            { cat: "targetMaturity", weight: 0.25 }];
  } else if (y <= 10) {
    rows = [{ cat: "corporateBond", weight: 0.35 }, { cat: "targetMaturity", weight: 0.30 },
            { cat: "bankingPsu", weight: 0.20 }, { cat: "shortTerm", weight: 0.15 }];
  } else {
    rows = [{ cat: "corporateBond", weight: 0.30 }, { cat: "targetMaturity", weight: 0.25 },
            { cat: "bankingPsu", weight: 0.25 }, { cat: "gilt", weight: 0.20 }];
  }

  // Arbitrage is debt-like risk taxed as equity. Above a 20% marginal rate and
  // beyond three months it usually beats a liquid fund after tax.
  const arbitrageWorthIt = marginalRate >= 20 && y >= 0.25 && y <= 3;
  return {
    rows,
    retiralCover,
    arbitrageNote: arbitrageWorthIt
      ? `At a ${marginalRate}% marginal rate, a debt fund's return is taxed at slab under s.50AA while an ` +
        `arbitrage fund is taxed as equity — 20% short-term, 12.5% beyond a year. For a horizon of a few ` +
        `months to three years that difference usually outweighs the small yield give-up.`
      : "",
    retiralNote: retiralCover > 0
      ? `EPF, PPF and the debt portion of NPS already cover a meaningful part of this debt requirement, at ` +
        `rates a debt fund cannot match after tax. Fill the debt sleeve from what is already contributed ` +
        `there before buying a debt fund on top of it.`
      : "",
  };
}

export function goldSleeve({ years, hasDemat = true }) {
  const rows = hasDemat
    ? [{ cat: "goldEtf", weight: 1 }]
    : [{ cat: "goldFof", weight: 1, note: "No demat account — a fund of funds is the route, and it needs twenty-four months to reach long term rather than twelve." }];
  return { rows,
    note: years >= 8
      ? "For a horizon beyond eight years, a Sovereign Gold Bond held to maturity pays 2.5% a year on top of the gold price and its redemption gain is exempt — but no fresh tranche has been issued since 2024, so this depends on the secondary market."
      : "" };
}

/* ------------------------------------------------------- the full plan */

/**
 * Everything for one goal: target mix, category sleeves with rupee amounts,
 * the glide path, and the specific cautions that apply.
 */
export function buildGoalPlan(goal, opts = {}) {
  const {
    riskProfile = "balanced", marginalRate = 30, hasDemat = true,
    oldRegimeS80CRoom = 0, retiralCover = 0,
  } = opts;
  const years = pos(goal.years);
  const mix = targetMix({ years, riskProfile, priority: goal.priority || "should" });

  const eq = equitySleeve({ years, riskProfile, oldRegimeS80CRoom });
  const dt = debtSleeve({ years, retiralCover, marginalRate });
  const gd = goldSleeve({ years, hasDemat });

  const contribution = pos(goal.requiredSip) || pos(goal.monthlySip);
  const corpus = pos(goal.earmarked);

  const line = (catId, shareOfSleeve, sleeveWeight, extraNote) => {
    const cat = CATEGORIES[catId];
    const w = shareOfSleeve * sleeveWeight;
    return {
      catId, name: cat.name, group: cat.group, role: cat.role,
      mandate: cat.mandate, why: cat.why, caution: cat.caution || "",
      note: extraNote || "",
      tax: taxFor(cat), taxKey: cat.tax,
      weight: +w.toFixed(4),
      monthly: R0(contribution * w),
      lumpsum: R0(corpus * w),
      minHorizonYears: cat.minHorizonYears,
      horizonOk: years >= cat.minHorizonYears,
    };
  };

  const rawRows = [
    ...eq.map((r) => line(r.cat, r.weight, mix.equity, r.note)),
    ...dt.rows.map((r) => line(r.cat, r.weight, mix.debt)),
    ...(mix.gold > 0 ? gd.rows.map((r) => line(r.cat, r.weight, mix.gold, r.note)) : []),
  ].filter((r) => r.weight > 0.004);

  const con = consolidate(rawRows, contribution, corpus, mix, years);
  const { rows, merged, droppedGroups, maxSchemes, preferSingleScheme } = con;

  // A single-scheme alternative, for small contributions where four schemes is
  // administrative overhead rather than diversification.
  const simple = years <= 4 ? "equitySavings"
    : mix.equity >= 0.62 && mix.equity <= 0.80 ? "aggressiveHybrid"
    : mix.equity < 0.35 ? "conservativeHybrid"
    : mix.gold > 0.03 ? "multiAsset" : "balancedAdvantage";

  return {
    goalId: goal.id, name: goal.name, years, priority: goal.priority || "should",
    mix, rows,
    equitySleeve: eq, debtSleeve: dt, goldSleeve: gd,
    contribution: R0(contribution), corpus: R0(corpus),
    consolidation: { merged, droppedGroups, maxSchemes, preferSingleScheme,
                     rawCount: rawRows.length, keptCount: rows.length },
    rationale: horizonRationale(years),
    boundBy: mix.boundBy,
    glide: glidePath(goal, { riskProfile }),
    simpleAlternative: {
      catId: simple, ...CATEGORIES[simple],
      when: "Where the monthly contribution is small enough that four schemes is paperwork rather " +
            "than diversification, one scheme in this category carries the same allocation, " +
            "rebalances itself, and creates no tax event doing so.",
    },
    warnings: buildWarnings({ goal, years, mix, rows, droppedGroups, preferSingleScheme, simple }),
  };
}

/* ---------------------------------------------------------- consolidation */

/**
 * Diversification stops helping and starts costing at some point, and where
 * that point sits depends on how much money is going in. Four ₹500 SIPs are
 * not a diversified portfolio, they are four statements to reconcile.
 *
 * The one thing consolidation must NOT do is change the asset mix. Merging a
 * gold sleeve into an equity fund to save a scheme would quietly undo the
 * allocation the whole page just argued for. So merging happens strictly
 * within an asset group; when a group is too small to earn its own scheme it
 * is dropped explicitly, its weight handed to the nearest surviving group, and
 * the change is reported rather than buried.
 */
export function consolidate(rows, monthlyContribution, corpus, mix, years) {
  const deployable = pos(monthlyContribution) * 12 + pos(corpus) / Math.max(1, years);
  const maxSchemes =
    deployable < 60000 ? 2 :
    deployable < 180000 ? 3 :
    deployable < 400000 ? 5 :
    deployable < 1000000 ? 7 : 9;

  const groupWeight = { equity: mix.equity, debt: mix.debt, gold: mix.gold };
  const byGroup = { equity: [], debt: [], gold: [] };
  for (const r of rows) (byGroup[r.group] ||= []).push(r);
  for (const k of Object.keys(byGroup)) byGroup[k].sort((a, b) => b.weight - a.weight);

  // A group has to be big enough to justify a scheme of its own. When slots are
  // scarce the bar rises, because a 6% sleeve inside a three-scheme portfolio is
  // noise the client still has to track.
  const minGroupWeight = maxSchemes <= 3 ? 0.12 : 0.05;
  const present = Object.keys(groupWeight).filter((k) => groupWeight[k] > 0.001 && byGroup[k]?.length);
  const active = present.filter((k) => groupWeight[k] >= minGroupWeight);
  const shed = present.filter((k) => !active.includes(k));

  const droppedGroups = [];
  const effWeight = { ...groupWeight };
  for (const k of shed) {
    // Gold's weight goes to debt — both are the ballast. Anything else goes to
    // whichever surviving group is largest.
    const host = k === "gold" && active.includes("debt") ? "debt"
      : active.slice().sort((a, b) => effWeight[b] - effWeight[a])[0];
    if (!host) continue;
    droppedGroups.push({ group: k, weight: effWeight[k], into: host });
    effWeight[host] += effWeight[k];
    effWeight[k] = 0;
  }
  if (!active.length && present.length) active.push(present[0]);

  // Hand out scheme slots in proportion to weight, one each to start.
  const slots = {};
  for (const k of active) slots[k] = 1;
  let spare = Math.max(0, maxSchemes - active.length);
  while (spare > 0) {
    const next = active
      .filter((k) => slots[k] < byGroup[k].length)
      .sort((a, b) => (effWeight[b] / slots[b]) - (effWeight[a] / slots[a]))[0];
    if (!next) break;
    slots[next]++; spare--;
  }

  const keep = [], merged = [];
  for (const k of active) {
    const list = byGroup[k];
    const kept = list.slice(0, slots[k]).map((r) => ({ ...r }));
    const rest = list.slice(slots[k]);
    // Rescale the kept schemes so the GROUP's weight is preserved exactly,
    // including any weight inherited from a shed group.
    const keptSum = kept.reduce((t, r) => t + r.weight, 0) || 1;
    const scale = effWeight[k] / keptSum;
    for (const r of kept) {
      r.weight = +(r.weight * scale).toFixed(4);
      r.monthly = R0(pos(monthlyContribution) * r.weight);
      r.lumpsum = R0(pos(corpus) * r.weight);
    }
    for (const r of rest) merged.push({ from: r.name, into: kept[0].name, weight: r.weight, sameGroup: true });
    keep.push(...kept);
  }

  return {
    rows: keep.sort((a, b) => b.weight - a.weight),
    merged, droppedGroups, maxSchemes,
    // Below three slots with more than one asset group in play, a multi-scheme
    // portfolio cannot carry the mix. A hybrid scheme can.
    preferSingleScheme: maxSchemes <= 2 && present.length > 1,
  };
}

function buildWarnings({ goal, years, mix, rows, droppedGroups, preferSingleScheme, simple }) {
  const out = [];
  if (years <= 1 && mix.equity > 0) out.push(
    "A goal inside a year should hold no equity at all.");
  if (goal.currentMix === "equity" && mix.equity < 0.35) out.push(
    `This goal's money is recorded as sitting in equity, against a recommended ${(mix.equity * 100).toFixed(0)}%. ` +
    `With ${years.toFixed(0)} year${years === 1 ? "" : "s"} to run, a drawdown arriving late would not recover in time. ` +
    `Moving it down is the single most urgent action on this goal.`);
  if (goal.currentMix === "debt" && mix.equity > 0.6) out.push(
    `This goal's money is recorded as sitting in debt, against a recommended ${(mix.equity * 100).toFixed(0)}% equity. ` +
    `Over ${years.toFixed(0)} years, a debt-only holding is very likely to lose to inflation after tax — ` +
    `the safe-looking choice is the risky one at this horizon.`);
  if (preferSingleScheme) out.push(
    `The contribution to this goal is too small to spread across schemes and still hold the mix. ` +
    `A single ${CATEGORIES[simple].name} carries the same allocation internally, rebalances itself, ` +
    `and creates no tax event doing so — take the single-scheme route below rather than the split above.`);
  for (const d of (droppedGroups || [])) out.push(
    `The ${d.group} sleeve works out at ${(d.weight * 100).toFixed(0)}% — too small to justify a scheme of ` +
    `its own at this contribution level, so its weight has been added to ${d.into}. That is a deliberate ` +
    `simplification, not an oversight: revisit it once the contribution grows.`);
  const offHorizon = rows.filter((r) => !r.horizonOk);
  if (offHorizon.length) out.push(
    `${offHorizon.map((r) => r.name).join(" and ")} normally needs a longer horizon than this goal has. ` +
    `It appears here only because the risk profile permits it — consider dropping it into the core instead.`);
  return out;
}

/* ------------------------------------------------------------ glide path */

/** Year-by-year target mix from today to the goal date. */
export function glidePath(goal, { riskProfile = "balanced", steps = null } = {}) {
  const years = pos(goal.years);
  const n = steps || Math.min(30, Math.max(1, Math.ceil(years)));
  const out = [];
  const thisYear = new Date().getFullYear();
  for (let i = 0; i <= n; i++) {
    const remaining = years * (1 - i / n);
    const m = targetMix({ years: remaining, riskProfile, priority: goal.priority || "should" });
    out.push({ year: thisYear + Math.round(years - remaining), yearsLeft: +remaining.toFixed(1),
      equity: m.equity, debt: m.debt, gold: m.gold });
  }
  return out;
}

/** The next scheduled de-risking step, so it can be diarised rather than remembered. */
export function nextGlideStep(goal, { riskProfile = "balanced" } = {}) {
  const years = pos(goal.years);
  const now = targetMix({ years, riskProfile, priority: goal.priority });
  for (let y = 1; y <= Math.ceil(years); y++) {
    const then = targetMix({ years: years - y, riskProfile, priority: goal.priority });
    if (now.equity - then.equity >= 0.05) {
      return { inYears: y, year: new Date().getFullYear() + y,
        from: now.equity, to: then.equity,
        drop: +(now.equity - then.equity).toFixed(3) };
    }
  }
  return null;
}

/* ---------------------------------------------------------- rebalancing */

/**
 * The 5/25 band. A sleeve is out of tolerance when it has moved 5 percentage
 * points in absolute terms OR 25% of its own target weight — whichever is the
 * TIGHTER test for that sleeve. On a 60% target the 5-point rule binds; on an
 * 8% gold sleeve the 25% rule binds at 2 points.
 */
export function bandFor(target) {
  return Math.min(0.05, Math.max(0.01, target * 0.25));
}

/**
 * The portfolio-level rebalancing plan.
 *
 * Deliberately ordered by tax cost, not by tidiness: new money first, then
 * redirected contributions, and selling last — because in India selling to
 * rebalance is a taxable event with no wash-sale relief on the way back in.
 */
export function rebalancePlan({
  actual, target, investable, monthlyContribution = 0,
  lastRebalanced = null, equityExemptionHeadroom = 125000,
  unrealisedEquityGainShare = 0.25, marginalRate = 30, insideRetiral = 0,
}) {
  const classes = ["equity", "debt", "gold", "cash"];
  const rows = classes.map((k) => {
    const t = num(target[k]), a = num(actual[k]);
    const band = bandFor(t);
    const drift = a - t;
    return {
      key: k, target: t, actual: a, drift: +drift.toFixed(4),
      band: +band.toFixed(4),
      breached: t > 0 || a > 0 ? Math.abs(drift) > band : false,
      rupees: R0(drift * pos(investable)),
      bandBoundBy: t * 0.25 < 0.05 ? "25% relative" : "5 points absolute",
    };
  }).filter((r) => r.target > 0 || r.actual > 0.005);

  const breaches = rows.filter((r) => r.breached);
  const over = breaches.filter((r) => r.drift > 0).sort((a, b) => b.rupees - a.rupees);
  const under = breaches.filter((r) => r.drift < 0).sort((a, b) => a.rupees - b.rupees);
  // Where to send money is a different question from where a band is breached:
  // if equity is over, contributions should go to whatever is under target,
  // breach or not.
  const belowTarget = rows.filter((r) => r.drift < -0.002).sort((a, b) => a.drift - b.drift);
  const correctionNeeded = R0(over.reduce((s, r) => s + Math.abs(r.rupees), 0));

  // How long redirecting the whole monthly contribution would take to close it.
  const monthsByContribution = monthlyContribution > 0
    ? Math.ceil(correctionNeeded / monthlyContribution) : null;

  // What selling would actually cost. Only the gain portion is taxed, and the
  // annual s.112A exemption absorbs the first slice of an equity gain.
  const equityOver = over.find((r) => r.key === "equity");
  const sellAmount = equityOver ? Math.abs(equityOver.rupees) : 0;
  const embeddedGain = sellAmount * clamp(unrealisedEquityGainShare, 0, 1);
  const taxableGain = Math.max(0, embeddedGain - pos(equityExemptionHeadroom));
  const taxIfSoldLongTerm = R0(taxableGain * 0.125);
  const taxIfSoldShortTerm = R0(embeddedGain * 0.20);

  const monthsSinceReview = lastRebalanced
    ? Math.max(0, Math.round((Date.now() - new Date(lastRebalanced).getTime()) / (30.44 * 864e5)))
    : null;
  const reviewDue = monthsSinceReview === null || monthsSinceReview >= 12;

  const ladder = [];
  if (belowTarget.length && monthlyContribution > 0) ladder.push({
    step: 1, action: "Point new contributions at the underweight sleeve",
    detail: `Redirect the ₹${R0(monthlyContribution).toLocaleString("en-IN")} a month already being ` +
            `contributed into ${belowTarget.map((u) => u.key).join(" and ")} until the band closes` +
            (monthsByContribution ? `, roughly ${monthsByContribution} month${monthsByContribution === 1 ? "" : "s"}` : "") + ".",
    taxCost: 0,
    note: "No sale, no tax, no exit load. This closes most drift on its own if it is caught early enough.",
  });
  if (insideRetiral > 0) ladder.push({
    step: ladder.length + 1, action: "Rebalance inside NPS and EPF first",
    detail: `₹${R0(insideRetiral).toLocaleString("en-IN")} sits in NPS and provident fund. Switching ` +
            `between the equity and debt schemes inside NPS is not a transfer for tax purposes.`,
    taxCost: 0,
    note: "The one place a portfolio can be rebalanced with no tax consequence at all. Use it before touching anything taxable.",
  });
  if (correctionNeeded > 0) ladder.push({
    step: ladder.length + 1, action: "Sell down the overweight sleeve — last, not first",
    detail: over.length
      ? `${over.map((o) => `${o.key} is ₹${Math.abs(o.rupees).toLocaleString("en-IN")} over its band`).join("; ")}.`
      : "",
    taxCost: taxIfSoldLongTerm,
    note: sellAmount > 0
      ? `Selling ₹${R0(sellAmount).toLocaleString("en-IN")} of equity with roughly ` +
        `${(clamp(unrealisedEquityGainShare, 0, 1) * 100).toFixed(0)}% embedded gain realises about ` +
        `₹${R0(embeddedGain).toLocaleString("en-IN")}. The unused s.112A exemption absorbs ` +
        `₹${R0(Math.min(embeddedGain, pos(equityExemptionHeadroom))).toLocaleString("en-IN")}, leaving ` +
        `₹${R0(taxableGain).toLocaleString("en-IN")} taxed at 12.5% — about ` +
        `₹${taxIfSoldLongTerm.toLocaleString("en-IN")}. Units held under twelve months would instead ` +
        `be taxed at 20%, about ₹${taxIfSoldShortTerm.toLocaleString("en-IN")}. India has no wash-sale ` +
        `rule, so buying back immediately is permitted — but it restarts the holding-period clock.`
      : "",
  });

  return {
    rows, breaches, over, under, belowTarget, correctionNeeded,
    needsAction: breaches.length > 0,
    monthsByContribution,
    monthsSinceReview, reviewDue,
    nextReview: nextReviewDate(lastRebalanced),
    tax: { sellAmount: R0(sellAmount), embeddedGain: R0(embeddedGain),
           exemptionUsed: R0(Math.min(embeddedGain, pos(equityExemptionHeadroom))),
           taxableGain: R0(taxableGain), taxIfSoldLongTerm, taxIfSoldShortTerm },
    ladder,
    method: {
      chosen: "Annual review, act only on a breach",
      why: "Calendar rebalancing on its own trades when nothing has moved, and in a taxable Indian " +
           "portfolio every one of those trades costs 12.5% or 20% of the gain. Pure threshold " +
           "rebalancing needs constant monitoring. Reviewing once a year and acting only where a " +
           "band is actually breached gets almost all of the benefit at a fraction of the tax.",
      bands: "5 percentage points absolute, or 25% of the sleeve's own target weight — whichever is tighter.",
      alsoReviewOn: [
        "A change in income, employment or residency",
        "A market move beyond roughly 20% in either direction",
        "Any goal moving inside its next glide-path step",
        "A change in the risk profile, or in who depends on this income",
      ],
    },
  };
}

function nextReviewDate(lastRebalanced) {
  if (!lastRebalanced) {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return { date: d.toISOString().slice(0, 10), overdue: false,
      label: `${d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })} — no previous review recorded, so the clock starts today` };
  }
  const d = new Date(lastRebalanced);
  d.setFullYear(d.getFullYear() + 1);
  const overdue = d.getTime() < Date.now();
  const months = Math.round((Date.now() - d.getTime()) / (30.44 * 864e5));
  const label = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return { date: d.toISOString().slice(0, 10), overdue,
    label: overdue ? `Was due ${label} — ${months} month${months === 1 ? "" : "s"} overdue` : label };
}

/** Portfolio-level target, weighted across goals by the corpus each needs. */
export function portfolioTarget(goalPlans, fallbackRisk = "balanced") {
  const weighted = { equity: 0, debt: 0, gold: 0 };
  let total = 0;
  for (const p of goalPlans) {
    const w = Math.max(1, p.corpus + p.contribution * 12 * Math.max(1, p.years));
    total += w;
    weighted.equity += p.mix.equity * w;
    weighted.debt += p.mix.debt * w;
    weighted.gold += p.mix.gold * w;
  }
  if (!total) {
    const b = ALLOCATION_GUIDE.byRisk[fallbackRisk] || ALLOCATION_GUIDE.byRisk.balanced;
    return { equity: b.equity, debt: b.debt, gold: b.gold, cash: b.cash, derivedFrom: "risk profile" };
  }
  return {
    equity: +(weighted.equity / total).toFixed(4),
    debt: +(weighted.debt / total).toFixed(4),
    gold: +(weighted.gold / total).toFixed(4),
    cash: 0,
    derivedFrom: "goals",
  };
}
