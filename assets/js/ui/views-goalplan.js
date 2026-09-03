/* ============================================================================
   ui/views-goalplan.js — the goal plan: per-goal allocation, fund categories,
   the glide path, and the rebalancing plan.
   ========================================================================== */

import { card, stat, statRow, note, meter, chip, empty, acc, table, flag, field,
         esc, inr, inrShort, pct } from "./dom.js";
import * as CH from "../charts.js";
import { CATEGORIES, CATEGORY_FRAMEWORK, EXCLUDED_CATEGORIES, FUND_TAX } from "../rules/fund-categories.js";
import { nextGlideStep, horizonRationale } from "../calc/allocation.js";

const GROUP_LABEL = { equity: "Equity", debt: "Debt", gold: "Gold", hybrid: "Hybrid" };

/* ------------------------------------------------------------ goal plan */

export function viewGoalPlan(c, m) {
  if (!m) return empty("Nothing computed yet.");
  if (!m.goalPlans.length) {
    return card("Goal plan", empty(
      "No goals recorded yet. Allocation follows from what the money is for and when it is needed — " +
      "add goals first and this page fills itself in.") +
      `<div class="btnrow" style="margin-top:12px"><button class="btn btn--quiet btn--sm" data-goto="goals">Go to goals</button></div>`);
  }

  const head = card("How the allocation is arrived at", `
    ${statRow([
      stat("Goals planned", String(m.goalPlans.length), ""),
      stat("Risk profile", `<span style="font-size:19px;text-transform:capitalize">${esc(m.riskProfile)}</span>`,
        m.risk ? `governed by ${m.risk.governedBy}` : "not yet profiled"),
      stat("Blended target equity", pct(m.portfolioTargetMix.equity * 100),
        `weighted across goals, not a single house number`),
      stat("Monthly contribution", inrShort(m.monthlySipTotal),
        `${inrShort(m.goals.totalRequiredSip)} needed`),
      stat("Investable assets", inrShort(m.allocation.investable),
        m.allocation.reserve ? `${inrShort(m.allocation.reserve)} reserve held separately` : ""),
    ], 5)}
    ${note("Two rules, applied in this order", `
      <p><b>Horizon binds; the risk profile modulates.</b> An aggressive investor with an eighteen-month
      goal still cannot use equity for it, and a conservative investor with a twenty-five-year goal still
      needs some. The horizon sets the ceiling; the profile decides where under that ceiling to sit.
      A goal that <i>must</i> happen on a fixed date is tilted more conservative than a discretionary one —
      but that tilt fades as the horizon lengthens, because time to recover is itself a form of safety.</p>
      <p><b>Categories, never schemes.</b> ${esc(CATEGORY_FRAMEWORK.whyCategoriesNotSchemes)}</p>`)}
    ${m.allocation.reserveNote ? note("The emergency fund sits outside all of this", `<p>${esc(m.allocation.reserveNote)}</p>`) : ""}`,
    { sub: `Category framework: ${esc(CATEGORY_FRAMEWORK.circular)}, ${esc(CATEGORY_FRAMEWORK.dated)}.` });

  const goalCards = m.goalPlans.map((p, i) => goalPlanCard(p, m, i)).join("");

  return head + goalCards + referenceCard(m);
}

function goalPlanCard(p, m, idx) {
  const step = nextGlideStep({ years: p.years, priority: p.priority }, { riskProfile: m.riskProfile });
  const goal = m.goals.rows.find((g) => g.id === p.goalId) || {};

  const mixBar = `
    <div class="meter"><div class="mrow"><b>Target mix</b><span class="num">${
      pct(p.mix.equity * 100)} equity · ${pct(p.mix.debt * 100)} debt${
      p.mix.gold > 0 ? ` · ${pct(p.mix.gold * 100)} gold` : ""}</span></div>
      <div class="track" style="display:flex;height:14px">
        <div style="width:${(p.mix.equity * 100).toFixed(1)}%;background:var(--t1)"></div>
        <div style="width:${(p.mix.debt * 100).toFixed(1)}%;background:repeating-linear-gradient(45deg,var(--t3) 0 3px,transparent 3px 6px);background-color:var(--t5)"></div>
        <div style="width:${(p.mix.gold * 100).toFixed(1)}%;background:var(--t4)"></div>
      </div>
      <div class="tiny muted" style="margin-top:4px">Equity ceiling for a ${p.years}-year horizon is
        ${pct(p.mix.ceiling * 100)}; the ${esc(m.riskProfile)} profile alone would sit at ${pct(p.mix.profileEquity * 100)}.
        <b>Bound by ${esc(p.boundBy)}.</b></div>
    </div>`;

  const rows = table(
    [{t:"Category"},{t:"Weight",n:true},{t:"Monthly",n:true},{t:goal.earmarked ? "From existing corpus" : "", n:true},{t:"Long term after",n:true}],
    p.rows.map((r) => [
      `<b>${esc(r.name)}</b> <span class="chip chip--dash">${GROUP_LABEL[r.group] || r.group}</span>` +
      `<div class="tiny muted" style="margin-top:3px">${esc(r.mandate)}</div>` +
      (r.note ? `<div class="tiny muted" style="margin-top:2px">${esc(r.note)}</div>` : ""),
      {t:pct(r.weight * 100, 1),n:true},
      {t:r.monthly ? inr(r.monthly) : "—",n:true},
      {t:r.lumpsum ? inr(r.lumpsum) : "—",n:true},
      {t:r.tax ? (r.tax.longTermAfterMonths ? `${r.tax.longTermAfterMonths} mo` : "never") : "varies",n:true},
    ]),
    { foot:["Total", {t:pct(p.rows.reduce((s, r) => s + r.weight, 0) * 100, 1),n:true},
      {t:inr(p.rows.reduce((s, r) => s + r.monthly, 0)),n:true},
      {t:goal.earmarked ? inr(p.rows.reduce((s, r) => s + r.lumpsum, 0)) : "",n:true}, ""] });

  const why = acc("Why each category is here", p.rows.map((r) =>
    `<div style="margin-bottom:12px"><b>${esc(r.name)}</b>
      <p style="margin:3px 0 0;font-size:12.5px">${esc(r.why)}</p>
      ${r.caution ? `<p class="tiny muted" style="margin:4px 0 0"><b>Caution.</b> ${esc(r.caution)}</p>` : ""}
      ${r.tax ? `<p class="tiny muted" style="margin:3px 0 0"><b>Tax.</b> ${esc(r.tax.label)} — ${esc(r.tax.ltcg)}${r.tax.note ? ` ${esc(r.tax.note)}` : ""}</p>` : ""}
    </div>`).join(""));

  const merges = p.consolidation.merged.length ? acc(
    `Simplified from ${p.consolidation.rawCount} categories to ${p.consolidation.keptCount}`,
    `<p>The contribution to this goal supports about ${p.consolidation.maxSchemes} scheme${p.consolidation.maxSchemes === 1 ? "" : "s"}
      before tracking cost outweighs the diversification. These were folded into the holdings above,
      within the same asset group, so the mix is unchanged:</p>
     <ul>${p.consolidation.merged.map((x) =>
       `<li>${esc(x.from)} — ${pct(x.weight * 100, 1)} — into ${esc(x.into)}</li>`).join("")}</ul>`) : "";

  const simple = acc(`One-scheme alternative — ${esc(p.simpleAlternative.name)}`,
    `<p>${esc(p.simpleAlternative.when)}</p>
     <p><b>Mandate.</b> ${esc(p.simpleAlternative.mandate)}</p>
     <p>${esc(p.simpleAlternative.why)}</p>
     ${p.simpleAlternative.caution ? `<p class="tiny muted"><b>Caution.</b> ${esc(p.simpleAlternative.caution)}</p>` : ""}`,
    p.consolidation.preferSingleScheme);

  const glideNote = step
    ? `<b>Next de-risking step: ${step.year}</b>, ${step.inYears} year${step.inYears === 1 ? "" : "s"} from now —
       equity down from ${pct(step.from * 100)} to ${pct(step.to * 100)}. Diarise it; a glide path that is
       never actually stepped is just a chart.`
    : `No further de-risking step falls due before this goal matures.`;

  const warnings = p.warnings.length
    ? p.warnings.map((w) => flag(w.includes("urgent") || w.includes("no equity at all") ? "high" : "med",
        "Check this", esc(w), "")).join("")
    : "";

  return card(
    `${esc(p.name)} <span class="muted" style="font-weight:400;font-size:14px">· ${p.years} years · ${esc(p.priority === "must" ? "must happen" : p.priority === "nice" ? "discretionary" : "should happen")}</span>`,
    `${warnings}
     <p class="muted" style="font-size:13px;margin-bottom:14px">${esc(p.rationale)}</p>
     ${mixBar}
     <div style="margin-top:16px">${rows}</div>
     <div id="chGlide_${p.goalId}" style="margin-top:18px"></div>
     ${note("Stepping down as the date approaches", `<p>${glideNote}</p>
       <p class="tiny muted">The chart shows the target mix year by year. Each step down is executed by
       redirecting contributions first and selling only if that is not enough — the same ladder as the
       rebalancing plan below.</p>`)}
     ${why}${merges}${simple}`,
    { h: "h2",
      aside: `<span class="chip">${p.rows.length} ${p.rows.length === 1 ? "scheme" : "schemes"}</span>` });
}

/* --------------------------------------------------------- rebalancing */

export function viewRebalance(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const rb = m.rebalance;

  const head = card("Where the portfolio stands against target", `
    ${statRow([
      stat("Status", rb.needsAction ? "Action due" : "Within tolerance",
        rb.needsAction ? `${rb.breaches.length} sleeve${rb.breaches.length === 1 ? "" : "s"} outside the band` : "no band breached",
        { neg: rb.needsAction }),
      stat("Amount to move", inrShort(rb.correctionNeeded),
        rb.monthsByContribution ? `${rb.monthsByContribution} months of contributions` : ""),
      stat("Tax if sold today", inrShort(rb.tax.taxIfSoldLongTerm),
        rb.tax.exemptionUsed ? `after ${inrShort(rb.tax.exemptionUsed)} of exemption` : "on long-term units"),
      stat("Last reviewed", rb.monthsSinceReview != null ? `${rb.monthsSinceReview} mo ago` : "—",
        rb.reviewDue ? "review due" : "up to date", { neg: rb.reviewDue }),
      stat("Next review", rb.nextReview.overdue ? "Overdue" : rb.nextReview.label,
        rb.nextReview.overdue ? esc(rb.nextReview.label) : "annual cycle", { neg: rb.nextReview.overdue }),
    ], 5)}
    <div id="chRebal" style="margin-top:8px"></div>
    ${table([{t:"Sleeve"},{t:"Target",n:true},{t:"Actual",n:true},{t:"Drift",n:true},{t:"Band",n:true},{t:"Status"},{t:"Amount",n:true}],
      rb.rows.map((r) => [
        r.key.charAt(0).toUpperCase() + r.key.slice(1),
        {t:pct(r.target * 100, 1),n:true},{t:pct(r.actual * 100, 1),n:true},
        {t:`${r.drift > 0 ? "+" : ""}${pct(r.drift * 100, 1)}`,n:true},
        {t:`±${pct(r.band * 100, 1)}`,n:true},
        r.breached ? `<b>Outside</b>` : "Within",
        {t:r.breached ? inrShort(Math.abs(r.rupees)) : "—",n:true}]))}
    <p class="tiny muted" style="margin-top:8px">Target is the goal-weighted blend, ${
      m.portfolioTargetMix.derivedFrom === "goals"
        ? "derived from what each goal actually needs rather than from a single house allocation"
        : "falling back to the risk profile because no goals are recorded"}.
      ${m.allocation.reserve ? `The ${inrShort(m.allocation.reserve)} emergency reserve is excluded — a reserve is not rebalanced.` : ""}</p>`,
    { sub: "Bands are the 5/25 rule: 5 percentage points absolute, or 25% of the sleeve's own target weight, whichever is tighter. On a 57% equity target the 5-point rule binds; on a 7% gold sleeve the 25% rule binds at under 2 points." });

  const when = card("When to rebalance", `
    ${note(rb.needsAction ? "Act now, then reset the annual clock" : "Nothing to do today", `
      <p>${rb.needsAction
        ? `${rb.over.map((o) => `<b>${o.key}</b> is ${pct(Math.abs(o.drift) * 100, 1)} above target, ${inr(Math.abs(o.rupees))} in rupee terms`).join("; ")}. ` +
          `That is outside the band, so this is a rebalance, not a watch item.`
        : `Every sleeve is inside its band. Rebalancing now would realise tax for no risk reduction. ` +
          `The next scheduled check is ${esc(rb.nextReview.label)}.`}</p>`)}
    <h4 style="margin:18px 0 8px">The method, and why this one</h4>
    <p style="font-size:13.5px"><b>${esc(rb.method.chosen)}.</b> ${esc(rb.method.why)}</p>
    <h4 style="margin:18px 0 8px">Also review, whatever the calendar says</h4>
    <ul style="font-size:13.5px">${rb.method.alsoReviewOn.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="grid g3" style="margin-top:18px">
      ${field({ label:"Last rebalanced on", path:"settings.lastRebalanced", type:"date",
        value:c.settings?.lastRebalanced || "",
        hint:"Sets the annual clock. Record the date each time it is actually done." })}
    </div>`);

  const how = card("How to rebalance, cheapest first", `
    <p class="muted" style="font-size:13px;margin-bottom:14px">Ordered by tax cost, not by tidiness.
      In India a rebalancing sale is a taxable event and there is no relief on the way back in, so the
      order of these steps is worth more than the precision of the target.</p>
    ${rb.ladder.map((l) => `
      <div class="flag">
        <div class="sev" data-sev="${l.taxCost === 0 ? "low" : "med"}">${l.step}</div>
        <div class="fb">
          <h4>${esc(l.action)} ${l.taxCost === 0
            ? `<span class="chip">no tax</span>`
            : `<span class="chip chip--dash">costs ${inr(l.taxCost)}</span>`}</h4>
          <p>${esc(l.detail)}</p>
          ${l.note ? `<div class="why">${esc(l.note)}</div>` : ""}
        </div>
      </div>`).join("")}
    ${rb.tax.sellAmount > 0 ? acc("The tax arithmetic on selling, in full", table(
      [{t:"Step"},{t:"Amount",n:true}], [
        ["Value to sell down", {t:inr(rb.tax.sellAmount),n:true}],
        ["Embedded gain in that amount", {t:inr(rb.tax.embeddedGain),n:true}],
        ["Absorbed by the unused s.112A annual exemption", {t:"− " + inr(rb.tax.exemptionUsed),n:true}],
        ["Taxable gain", {t:inr(rb.tax.taxableGain),n:true}],
        [{t:"<b>Tax at 12.5%, if the units are long term</b>"}, {t:`<b>${inr(rb.tax.taxIfSoldLongTerm)}</b>`,n:true}],
        [{t:"Tax at 20%, if any are short term",cls:"sub"}, {t:inr(rb.tax.taxIfSoldShortTerm),n:true}],
      ]) + `<p class="tiny muted" style="margin-top:10px">The embedded-gain share is estimated from the
      unrealised gain recorded on the income page against the value of equity holdings. Check it against
      the actual capital-gains statement before acting — the difference between long-term and short-term
      units is the difference between ${inr(rb.tax.taxIfSoldLongTerm)} and ${inr(rb.tax.taxIfSoldShortTerm)}.</p>`) : ""}`);

  return head + when + how;
}

/* ---------------------------------------------------------- reference */

function referenceCard(m) {
  const used = new Set(m.goalPlans.flatMap((p) => p.rows.map((r) => r.catId)));
  return card("Category reference", `
    ${table([{t:"Category"},{t:"Mandate"},{t:"Long term after",n:true},{t:"Taxed as"}],
      [...used].map((id) => CATEGORIES[id]).filter(Boolean).map((cat) => [
        `<b>${esc(cat.name)}</b>`, `<span class="tiny">${esc(cat.mandate)}</span>`,
        {t: FUND_TAX[cat.tax] ? (FUND_TAX[cat.tax].longTermAfterMonths ? `${FUND_TAX[cat.tax].longTermAfterMonths} mo` : "never") : "varies", n:true},
        `<span class="tiny">${FUND_TAX[cat.tax] ? esc(FUND_TAX[cat.tax].ltcg) : "depends on the scheme's equity share"}</span>`]))}
    ${acc("How each fund type is taxed", table(
      [{t:"Fund type"},{t:"Long term after",n:true},{t:"Long-term rate"},{t:"Short-term rate"}],
      Object.values(FUND_TAX).map((t) => [
        `<b>${esc(t.label)}</b>${t.note ? `<div class="tiny muted" style="margin-top:3px">${esc(t.note)}</div>` : ""}`,
        {t:t.longTermAfterMonths ? `${t.longTermAfterMonths} mo` : "—",n:true},
        esc(t.ltcg), esc(t.stcg)])) +
      `<p class="tiny muted" style="margin-top:10px">Section 50AA was narrowed with effect from FY 2025-26:
       only a fund holding more than 65% in debt and money market instruments is a specified mutual fund
       taxed wholly at slab. Gold and international ETFs and funds of funds fell out of it and now follow
       ordinary capital-gains rules — a change that materially improves the after-tax case for both.</p>`)}
    ${acc("What this tool deliberately does not recommend", EXCLUDED_CATEGORIES.map((x) =>
      `<div style="margin-bottom:10px"><b>${esc(x.name)}</b><p style="margin:2px 0 0;font-size:12.5px">${esc(x.why)}</p></div>`).join(""))}
    ${acc("What changed in the February 2026 framework", `
      <p>${esc(CATEGORY_FRAMEWORK.circular)}, ${esc(CATEGORY_FRAMEWORK.dated)}, replacing
      ${esc(CATEGORY_FRAMEWORK.supersedes)}.</p>
      <ul>
        <li><b>Solution-oriented schemes removed.</b> Children's and Retirement funds duplicated ordinary
          equity and hybrid portfolios while adding a lock-in. Existing schemes stop taking new money and
          will be merged; current investors need do nothing immediately.</li>
        <li><b>Life Cycle Funds added.</b> A single scheme with a built-in glide path, 5 to 30 years in
          five-year steps, equity starting between 65% and 95%. It automates the taper this page
          recommends doing manually — at the cost of a 3/2/1% exit load in the first three years, and a
          glide path set by the fund rather than by the client.</li>
        <li><b>Sectoral Debt Funds added</b> — at least 80% in one sector's bonds, AA+ and above.</li>
        <li><b>Debt categories renamed.</b> Low Duration became Ultra Short to Short Term; Short, Medium
          and Long Duration became Short, Medium and Long Term; Dynamic Bond became Dynamic Term; Floater
          became Floating Interest Rate. The Macaulay duration bands themselves are unchanged.</li>
        <li><b>Value and Contra may now co-exist</b> at one AMC, capped at 50% portfolio overlap.</li>
        <li><b>Scheme names must match the category</b> and may not contain return-focused words.</li>
      </ul>
      <p class="tiny muted">${esc(CATEGORY_FRAMEWORK.complianceWindow)}</p>`)}`,
    { sub: "Only the categories this plan actually uses, plus the taxation that applies to each." });
}

/* ------------------------------------------------------ chart mounting */

export function mountGoalPlanCharts(section, c, m) {
  if (!m) return;
  const $ = (id) => document.getElementById(id);

  if (section === "goalplan") {
    for (const p of m.goalPlans) {
      const node = $(`chGlide_${p.goalId}`);
      if (!node || !p.glide.length) continue;
      CH.lines(node, p.glide.map((g) => g.year),
        [{ label: "Equity", values: p.glide.map((g) => +(g.equity * 100).toFixed(1)) },
         { label: "Debt", values: p.glide.map((g) => +(g.debt * 100).toFixed(1)) },
         { label: "Gold", values: p.glide.map((g) => +(g.gold * 100).toFixed(1)) }],
        { width: 880, height: 210, xFmt: (v) => String(v),
          fmt: (v) => v.toFixed(0) + "%" });
    }
  }

  if (section === "rebalance" && $("chRebal")) {
    CH.barsH($("chRebal"), m.rebalance.rows.map((r, i) => ({
      label: r.key.charAt(0).toUpperCase() + r.key.slice(1),
      value: +(r.actual * 100).toFixed(1), target: +(r.target * 100).toFixed(1),
      toneIndex: i, hatch: true,
      note: r.breached
        ? `Outside the ±${(r.band * 100).toFixed(1)} point band by ${Math.abs(r.rupees).toLocaleString("en-IN")}`
        : `Inside the ±${(r.band * 100).toFixed(1)} point band`,
    })), { fmt: (v) => v.toFixed(0) + "%", showTarget: true, maxOverride: 100,
           labelW: 90, width: 880, valueLabel: "Actual",
           rowFmt: (d) => d.value.toFixed(1) + "%" });
  }
}
