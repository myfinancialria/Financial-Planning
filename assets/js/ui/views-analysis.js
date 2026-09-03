/* ============================================================================
   ui/views-analysis.js — dashboard, tax workbench, RIA analysis, reference,
   and the printable client report.
   Chart containers are rendered empty and filled by mountCharts() afterwards.
   ========================================================================== */

import { card, stat, statRow, note, meter, chip, empty, acc, table, flag, field,
         esc, inr, inrShort, pct } from "./dom.js";
import * as CH from "../charts.js";
import { projectNetWorth } from "../model.js";
import { ASSET_CLASSES, LIABILITY_TYPES } from "../calc/plan.js";
import { amortise, prepaymentAnalysis, retirementCorpus, corpusLongevity } from "../calc/finance.js";
import { TAX_YEAR, ACT_CONCORDANCE, SMALL_SAVINGS, NRI, SEBI_RIA, CAPITAL_GAINS,
         ALLOCATION_GUIDE, ASSUMPTIONS, ESTATE_RULES } from "../rules/tax-rules.js";

const CLASS_LABEL = (k) => (ASSET_CLASSES[k] || {}).label || k;
const opt = (v, t) => ({ v, t });

/* ====================================================== DASHBOARD ======== */

export function viewDashboard(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const r = (id) => m.ratioList.find((x) => x.id === id) || { value: 0, verdict: "weak" };

  const headline = statRow([
    stat("Net worth", inrShort(m.nw.netWorth),
      `${inrShort(m.nw.totalAssets)} of assets less ${inrShort(m.nw.totalLiabilities)} of debt`,
      { neg: m.nw.netWorth < 0 }),
    stat("Monthly surplus", inrShort(m.cashflow.surplus),
      m.cashflow.income - m.cashflow.committed < 0 ? "Committed outgo exceeds income"
        : m.cashflow.surplus < 0 ? "Contributions exceed free cash flow"
        : "Unallocated after everything",
      { neg: m.cashflow.surplus < 0 }),
    stat("Tax this year", inrShort(m.tax.chosen.totalTax),
      `${m.tax.chosenRegime === "new" ? "New" : "Old"} regime · effective ${pct(m.tax.chosen.effectiveRate, 1)}`),
    stat("Protection gap", inrShort(m.lifeCover.gap + m.healthCover.gap),
      "Life and health cover shortfall combined", { neg: (m.lifeCover.gap + m.healthCover.gap) > 0 }),
    stat("Goals funded", pct(m.goals.totalFutureCost ? (m.goals.totalProjected / m.goals.totalFutureCost) * 100 : 0),
      `${m.goals.rows.length} goals · ${inrShort(m.goals.totalShortfallSip)}/mo short`),
  ], 5);

  const scoreCard = card("Financial health", `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center">
      <div id="chHealth"></div>
      <div>
        <h3 style="margin-bottom:6px">${m.health.grade}</h3>
        <p class="muted" style="font-size:13px;max-width:52ch">${esc(m.health.verdict)}</p>
        <div style="margin-top:12px">
          ${m.health.parts.map((p) => meter(p.label, p.points, p.weight,
            { right: `${p.points} / ${p.weight}`, hatch: p.score < 0.7 })).join("")}
        </div>
      </div>
    </div>`, { sub: "Weighted across the six things that determine whether a plan survives contact with reality." });

  const alloc = card("Where the money is", `
    <div class="cards c2">
      <div><div id="chAlloc"></div></div>
      <div>
        <h4 style="margin-bottom:10px">Against a ${esc(m.riskProfile)} target</h4>
        <div id="chDrift"></div>
        <p class="tiny muted" style="margin-top:8px">Dashed tick marks the target weight. Hybrid holdings are split evenly between equity and debt for this comparison. Self-occupied property is excluded from investable assets throughout.</p>
      </div>
    </div>`, {
      aside: `<span class="chip">${inrShort(m.allocation.investable)} investable</span>`,
    });

  const flows = card("Where the money goes", `<div id="chWaterfall"></div>
    <p class="tiny muted" style="margin-top:8px">Monthly. Take-home is gross income less computed tax, so the tax step is already netted out of the starting figure.</p>`);

  const worth = card("Net worth, projected", `<div id="chWorth"></div>
    <p class="tiny muted" style="margin-top:8px">Assets compound at the blended ${pct(m.nw.blendedExpectedReturn, 1)} implied by the current mix; savings of ${inrShort(m.cashflow.investments * 12 + Math.max(0, m.cashflow.surplus) * 12)} a year are added; debt amortises at the current EMI. It is an arithmetic extension of today's position, not a forecast.</p>`);

  const goalsCard = card("Goals on the clock", `<div id="chTimeline"></div>`, {
    sub: "Bar length runs to the target year; the filled part is what current contributions are projected to deliver.",
  });

  const ratiosCard = card("Ratios", table(
    [{t:"Ratio"},{t:"Value",n:true},{t:"Reading"},{t:"Why it matters"}],
    m.ratioList.map((x) => [
      x.label,
      { t: x.fmt === "pct" ? pct(x.value * 100) : x.fmt === "months" ? x.value.toFixed(1) + " mo"
          : x.value.toFixed(1) + "×", n: true },
      `<span class="chip${x.verdict === "strong" ? " chip--solid" : x.verdict === "weak" ? " chip--dash" : ""}">${x.verdict}</span>`,
      `<span class="tiny muted">${esc(x.why)}</span>`,
    ])));

  const top = m.findings.slice(0, 5);
  const priorities = card("What needs attention", top.length
    ? top.map((f) => flag(f.sev, esc(f.title), esc(f.body), esc(f.why))).join("") +
      `<div class="btnrow" style="margin-top:14px"><button class="btn btn--quiet btn--sm" data-goto="analysis">See all ${m.findings.length} findings</button></div>`
    : `<p class="muted">Nothing flagged. Fill in the fact-find to get findings.</p>`);

  return headline + scoreCard +
    `<div class="cards c2">${alloc}${flows}</div>` +
    goalsCard + worth +
    `<div class="cards c2">${priorities}${ratiosCard}</div>`;
}

/* ============================================================ TAX ======== */

export function viewTax(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const t = m.tax.chosen, cmp = m.tax.comparison;

  const head = card(`${TAX_YEAR.label} — ${TAX_YEAR.span}`, `
    ${statRow([
      stat("Gross total income", inrShort(t.grossTotalIncome), ""),
      stat("Total income", inrShort(t.totalIncome), `after ${inrShort(t.chapterVIA)} of deductions`),
      stat("Tax payable", inrShort(t.totalTax), `effective ${pct(t.effectiveRate, 2)}`),
      stat("Marginal rate", pct(m.tax.marginalRate, 1), "on the next rupee of ordinary income"),
      stat("Regime in use", m.tax.chosenRegime === "new" ? "New" : "Old",
        cmp.saving > 0 ? `${m.tax.better === m.tax.chosenRegime ? "the cheaper one" : `costs ${inrShort(cmp.saving)} more`}` : ""),
    ], 5)}
    <div class="grid g3" style="margin-top:6px">
      ${field({ label:"Regime", path:"settings.regime", type:"select", value:c.settings?.regime || "auto",
        options:[opt("auto","Whichever is cheaper"),opt("new","New regime"),opt("old","Old regime")] })}
    </div>
    ${note(TAX_YEAR.act, `<p>${esc(TAX_YEAR.budgetNote)} ${esc(TAX_YEAR.legacyLabel)}.</p>`)}`,
    { sub: `${esc(m.residency === "nri" ? "Computed on the non-resident basis — no s.87A rebate, no basic-exemption shelter for capital gains, no senior-citizen slab." : "Computed on the resident basis.")}` });

  const compare = card("Old regime against new", `
    <div class="cards c2">
      <div><div id="chRegime"></div></div>
      <div>
        ${table([{t:"Step"},{t:"Old",n:true},{t:"New",n:true}], [
          ["Gross total income", {t:inr(cmp.old.grossTotalIncome),n:true},{t:inr(cmp.new.grossTotalIncome),n:true}],
          ["Deductions", {t:"− " + inr(cmp.old.chapterVIA),n:true},{t:"− " + inr(cmp.new.chapterVIA),n:true}],
          ["Total income", {t:inr(cmp.old.totalIncome),n:true},{t:inr(cmp.new.totalIncome),n:true}],
          ["Tax before rebate", {t:inr(cmp.old.taxBeforeRebate),n:true},{t:inr(cmp.new.taxBeforeRebate),n:true}],
          ["Rebate u/s 87A", {t:"− " + inr(cmp.old.rebate),n:true},{t:"− " + inr(cmp.new.rebate),n:true}],
          ["Surcharge", {t:inr(cmp.old.surcharge),n:true},{t:inr(cmp.new.surcharge),n:true}],
          ["Cess", {t:inr(cmp.old.cess),n:true},{t:inr(cmp.new.cess),n:true}],
        ], { foot:["Tax payable", {t:inr(cmp.old.totalTax),n:true},{t:inr(cmp.new.totalTax),n:true}] })}
        ${note(cmp.better === "new" ? "The new regime is cheaper here" : "The old regime is cheaper here",
          `<p>By ${inr(cmp.saving)}.</p>` +
          (cmp.better === "new" && cmp.breakEvenExtraDeduction > 0
            ? `<p>For the old regime to catch up, a further <b>${inr(cmp.breakEvenExtraDeduction)}</b> of eligible deductions would be needed — on top of the ${inr(cmp.old.chapterVIA)} already claimed.</p>`
            : "") +
          `<p class="tiny muted">A salaried taxpayer elects afresh each year. A taxpayer with business income who leaves the new regime may return to it only once, ever.</p>`)}
      </div>
    </div>`);

  const slabCard = card("How the tax was built", `
    <div id="chSlab"></div>
    ${table([{t:"Band"},{t:"Rate",n:true},{t:"Income in band",n:true},{t:"Tax",n:true}],
      t.slabRows.map((r) => [
        `${inr(r.from)} ${r.to ? "to " + inr(r.to) : "and above"}`,
        {t:pct(r.rate * 100),n:true},{t:inr(r.amount),n:true},{t:inr(r.tax),n:true}]),
      { foot:["Slab tax", "", "", {t:inr(t.slabTax),n:true}] })}
    ${t.specialTaxTotal > 0 ? table(
      [{t:"Special-rate income"},{t:"Amount",n:true},{t:"Rate",n:true},{t:"Tax",n:true}],
      [
        ["STCG, listed equity (s.111A)", {t:inr(t.capitalGains.s111A.amount),n:true},{t:"20%",n:true},{t:inr(t.specialTax.s111A),n:true}],
        [`LTCG, listed equity (s.112A)${t.capitalGains.s112A.exemptionUsed ? ` — after the ${inr(t.capitalGains.s112A.exemptionUsed)} exemption` : ""}`,
          {t:inr(t.capitalGains.s112A.amount),n:true},{t:"12.5%",n:true},{t:inr(t.specialTax.s112A),n:true}],
        ["LTCG, other assets (s.112)", {t:inr(t.capitalGains.s112.amount),n:true},{t:"12.5%",n:true},{t:inr(t.specialTax.s112),n:true}],
        ["Virtual digital assets", {t:inr(t.capitalGains.vda.amount),n:true},{t:"30%",n:true},{t:inr(t.specialTax.vda),n:true}],
      ].filter((row) => row[3].t !== "₹0"),
      { foot:["Special-rate tax","","",{t:inr(t.specialTaxTotal),n:true}] }) : ""}
    <h4 style="margin:18px 0 8px">Every step, in order</h4>
    ${table([{t:"Step"},{t:"Amount",n:true},{t:"Note"}],
      t.trace.map((s) => [esc(s.step), {t:inr(s.value),n:true},
        `<span class="tiny muted">${esc(s.detail || "")}</span>`]))}`);

  const advanceTax = card("Advance tax", m.tax.advance.applicable ? `
    ${table([{t:"Due by"},{t:"Cumulative",n:true},{t:"Instalment",n:true}],
      m.tax.advance.rows.map((x) => [x.by, {t:`${x.cumulativePct}% · ${inr(x.cumulative)}`,n:true},{t:inr(x.instalment),n:true}]))}
    ${note("Interest for falling short", `<ul>
      <li><b>s.234B</b> — ${esc(m.tax.advance.interest.s234B)}</li>
      <li><b>s.234C</b> — ${esc(m.tax.advance.interest.s234C)}</li>
      <li>${esc(m.tax.advance.interest.seniorExemption)}</li></ul>`)}`
    : `<p class="muted">Net liability after TDS is ${inr(m.tax.advance.netLiability)} — within the ₹10,000 threshold, so no advance tax is due.</p>`);

  const playbook = card("Ways to pay less, ranked by what they are worth", m.playbook.length ? `
    ${table([{t:"Lever"},{t:"Worth this year",n:true},{t:"What it costs"},{t:"Available under"}],
      m.playbook.map((p) => [
        `<b>${esc(p.title)}</b><div class="tiny muted" style="margin-top:3px">${esc(p.detail)}</div>`,
        {t: p.saving ? inr(p.saving) : `<span class="tiny">${esc(p.savingNote || "—")}</span>`, n:true},
        `<span class="tiny">${esc(p.cost)}</span>`,
        `<span class="tiny">${esc(p.availableIn)}</span>`]))}
    <h4 style="margin:18px 0 8px">The catch, in each case</h4>
    ${m.playbook.map((p) => acc(esc(p.title), `<p>${esc(p.catch)}</p>`)).join("")}
    ${note("", `<p class="tiny">Computed at this client's marginal rate of ${pct(m.tax.marginalRate, 1)}. A deduction is worth the tax it saves, never the amount invested — and a bad investment bought for a deduction is still a bad investment.</p>`)}
    ${m.playbookAlt && m.playbookAlt.length ? acc(
      `What the ${m.altRegime === "old" ? "old" : "new"} regime would open up — ${m.playbookAlt.length} further ${m.playbookAlt.length === 1 ? "lever" : "levers"}`,
      table([{t:"Lever"},{t:"Worth",n:true},{t:"What it costs"}],
        m.playbookAlt.map((p) => [`<b>${esc(p.title)}</b><div class="tiny muted" style="margin-top:3px">${esc(p.detail)}</div>`,
          {t: p.saving ? inr(p.saving) : "—", n:true}, `<span class="tiny">${esc(p.cost)}</span>`])) +
      `<p class="tiny muted" style="margin-top:10px">These are priced under the ${m.altRegime} regime, which currently costs ${
        inr(Math.abs((m.altRegime === "old" ? m.tax.old : m.tax.new).totalTax - m.tax.chosen.totalTax))} ${
        (m.altRegime === "old" ? m.tax.old : m.tax.new).totalTax > m.tax.chosen.totalTax ? "more" : "less"
      } in tax. Claiming every one of them still has to clear that gap before switching makes sense.</p>`) : ""}`
    : `<p class="muted">No levers with a material rupee value at the current income and regime.</p>`);

  const nriTax = m.isNri ? card("Non-resident specifics", `
    ${table([{t:"Income"},{t:"Rate at source",n:true},{t:"Section"},{t:"Note"}],
      NRI.tds.map((x) => [x.head, {t:pct(x.rate * 100, x.rate * 100 % 1 ? 1 : 0),n:true}, x.section,
        `<span class="tiny muted">${esc(x.note || "")}</span>`]))}
    ${note(NRI.section197.label, `<p>${esc(NRI.section197.why)}</p><p><b>${esc(NRI.section197.how)}</b></p>`)}
    ${acc("Treaty relief", `<p>${esc(NRI.dtaa.what)}</p><ul>${NRI.dtaa.docs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul><p>${esc(NRI.dtaa.note)}</p>`)}
    ${acc(NRI.section115H.label, `<p>${esc(NRI.section115H.what)}</p>`)}
    ${acc("Scope of Indian tax by status", table([{t:"Status"},{t:"What India taxes"}],
      [["Resident and ordinarily resident", NRI.scope.resident],
       ["Resident but not ordinarily resident", NRI.scope.rnor],
       ["Non-resident", NRI.scope.nonResident]]))}`) : "";

  const cgRef = card("Capital gains at a glance", table(
    [{t:"Asset"},{t:"Long-term after",n:true},{t:"Short-term"},{t:"Long-term"}],
    Object.values(CAPITAL_GAINS).map((x) => [
      x.label,
      {t: x.holdingMonths ? `${x.holdingMonths} months` : "—", n:true},
      x.flat ? `${pct(x.flat.rate * 100)} flat` : x.stcg.slab ? "Slab rates" : pct(x.stcg.rate * 100),
      x.flat ? "—" : x.ltcg.slab ? "Slab rates" : `${pct(x.ltcg.rate * 100)}${x.ltcg.annualExemption ? ` above ${inrShort(x.ltcg.annualExemption)}` : ""}`,
    ])) +
    note("Two traps", `<ul>
      <li>${esc(CAPITAL_GAINS.immovable.ltcg.grandfather.note)}</li>
      <li>${esc(CAPITAL_GAINS.vda.flat.noSetOff)} ${esc(CAPITAL_GAINS.vda.flat.noDeductions)}</li></ul>`));

  return head + compare + slabCard + playbook + advanceTax + nriTax + cgRef;
}

/* ======================================================= ANALYSIS ======== */

export function viewAnalysis(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const bySev = { high: [], med: [], low: [] };
  for (const f of m.findings) bySev[f.sev].push(f);

  const summary = statRow([
    stat("Findings", String(m.findings.length),
      `${bySev.high.length} high · ${bySev.med.length} medium · ${bySev.low.length} low`),
    stat("Health score", `${m.health.score}<small>/100</small>`, m.health.grade),
    stat("Plan 1 — safety", `${m.threePlan.plan1.done}<small>/${m.threePlan.plan1.total}</small>`,
      m.threePlan.plan1.complete ? "Complete" : "Incomplete"),
    stat("Plan 2 — goals", `${m.threePlan.plan2.done}<small>/${m.threePlan.plan2.total}</small>`,
      m.threePlan.plan2.gated ? "Gated by Plan 1" : m.threePlan.plan2.complete ? "Complete" : "In progress"),
    stat("Compliance", `${m.compliance.done}<small>/${m.compliance.total}</small>`,
      m.compliance.complete ? "Complete" : "Items outstanding"),
  ], 5);

  const areas = [...new Set(m.findings.map((f) => f.area))];
  const findingsCard = card("Findings", m.findings.length ? `
    <div class="pill-row">${areas.map((a) =>
      `<span class="chip">${esc(a)} <strong>${m.findings.filter((f) => f.area === a).length}</strong></span>`).join("")}</div>
    ${["high","med","low"].map((s) => bySev[s].length ? `
      <h4 style="margin:18px 0 4px">${s === "high" ? "High priority" : s === "med" ? "Worth addressing" : "Noted"}</h4>
      ${bySev[s].map((f) => flag(f.sev, `${esc(f.title)} <span class="muted tiny">· ${esc(f.area)}</span>`,
        esc(f.body), esc(f.why))).join("")}` : "").join("")}`
    : `<p class="muted">No findings. That usually means the fact-find is not filled in yet.</p>`,
    { sub:"Each finding states a fact about this client's own position, measured against their stated goals, their recorded profile, or a statutory limit." });

  const seq = card("The three plans, in order", `
    ${[m.threePlan.plan1, m.threePlan.plan2].map((p) => `
      <h4 style="margin:14px 0 8px">${esc(p.label)} — ${p.done} of ${p.total}
        ${p.gated ? `<span class="chip chip--dash">gated by Plan 1</span>` : ""}</h4>
      ${table([{t:"Item"},{t:"Status"},{t:"Detail"}], p.items.map((i) =>
        [esc(i.item), i.done ? "Done" : "Open", `<span class="tiny muted">${esc(i.detail)}</span>`]))}`).join("")}
    ${note(m.threePlan.plan3.gated ? "Plan 3 — lifestyle, not yet" : "Plan 3 — lifestyle",
      `<p>${esc(m.threePlan.plan3.note)}</p>`)}`,
    { sub:"Safety before goals, goals before lifestyle. The order is the point — funding a lifestyle goal while the emergency buffer is empty is how a plan fails." });

  const actions = card("Action plan", `
    ${["Now — next 30 days","This quarter","Next 6 months","Ongoing","Annually"].map((h) => {
      const items = m.actions.filter((a) => a.horizon === h);
      return items.length ? `
        <h4 style="margin:16px 0 6px">${esc(h)}</h4>
        ${table([{t:"Action"},{t:"What it means"},{t:"Done when"}], items.map((a) =>
          [`<b>${esc(a.title)}</b>`, `<span class="tiny">${esc(a.detail)}</span>`,
           `<span class="tiny muted">${esc(a.measure)}</span>`]))}` : "";
    }).join("")}`);

  const suitability = card("Suitability", `
    <div class="cards c2">
      <div>
        <h4 style="margin-bottom:8px">Recorded profile</h4>
        ${m.risk ? `
          ${table([{t:"Dimension"},{t:"Score",n:true}], [
            ["Capacity", {t:m.risk.capacity.toFixed(2),n:true}],
            ["Willingness", {t:m.risk.willingness.toFixed(2),n:true}],
            ["Knowledge", {t:m.risk.knowledge != null ? m.risk.knowledge.toFixed(2) : "—",n:true}],
            [{t:"<b>Governing</b>"}, {t:`<b>${esc(m.risk.governedBy)}</b>`,n:true}],
          ])}
          <p class="tiny muted" style="margin-top:8px">${esc(m.risk.note)}</p>`
          : `<p class="muted">Risk profile not completed.</p>`}
      </div>
      <div>
        <h4 style="margin-bottom:8px">Target against actual</h4>
        ${table([{t:"Class"},{t:"Target",n:true},{t:"Actual",n:true},{t:"Drift",n:true}],
          m.allocation.rows.map((x) => [
            x.key.charAt(0).toUpperCase() + x.key.slice(1),
            {t:pct(x.target * 100),n:true},{t:pct(x.actual * 100),n:true},
            {t:`${x.drift > 0 ? "+" : ""}${pct(x.drift * 100)} · ${inrShort(x.rupeeDrift)}`,n:true}]))}
        <p class="tiny muted" style="margin-top:8px">${m.allocation.needsRebalance
          ? "Drift beyond ten points. Any rebalancing must be netted against the capital-gains cost before it is recommended."
          : "Within tolerance."}</p>
      </div>
    </div>`);

  const compliance = card("SEBI compliance", table(
    [{t:"Requirement"},{t:"Status"},{t:"Detail"},{t:"Basis"}],
    m.compliance.items.map((i) => [esc(i.label), i.done ? "Done" : "Outstanding",
      `<span class="tiny muted">${esc(i.detail)}</span>`, `<span class="tiny muted">${esc(i.cite)}</span>`])) +
    note("What this tool does not do", `<p>It holds no assets, places no orders, and has no execution capability of any kind. It organises a client's own information, computes the arithmetic, and measures the result against the client's own stated goals and the statutory position. Product selection, and the rationale for it, remain the adviser's — recorded in writing, on the adviser's own file.</p>`),
    { sub: esc(SEBI_RIA.regulation) });

  return summary + findingsCard + seq + actions + suitability + compliance;
}

/* ========================================================= LOANS ========= */

export function viewLoans(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const loans = (c.liabilities || []).filter((l) => Number(l.outstanding) > 0);
  if (!loans.length) return card("Debt", empty("No borrowings recorded."));

  const cards = loans.map((l) => {
    const months = Number(l.monthsRemaining) || 0;
    const base = months ? amortise(l.outstanding, l.rate, months) : null;
    const pre = months ? prepaymentAnalysis(
      { outstanding: l.outstanding, rate: l.rate, monthsRemaining: months },
      Math.round(Number(l.emi) * 0.1) || 5000, 0, m.nw.blendedExpectedReturn || 10) : null;
    return card(`${esc(l.name || (LIABILITY_TYPES[l.type] || {}).label)}`, `
      ${statRow([
        stat("Outstanding", inrShort(l.outstanding), `${pct(l.rate, 2)} · ${months} months left`),
        stat("EMI", inrShort(l.emi), base ? `computed ${inrShort(base.emi)}` : ""),
        stat("Interest still to pay", base ? inrShort(base.totalInterest) : "—",
          base ? `${pct((base.totalInterest / Number(l.outstanding)) * 100)} of the balance` : ""),
        stat("Post-tax cost", (LIABILITY_TYPES[l.type] || {}).deductible && m.tax.chosenRegime === "old"
          ? pct(Number(l.rate) * (1 - m.tax.marginalRate / 100), 2) : pct(l.rate, 2),
          (LIABILITY_TYPES[l.type] || {}).deductible && m.tax.chosenRegime === "old"
            ? "after the interest deduction" : "no deduction available"),
      ], 4)}
      <div id="chLoan_${l.id}" style="margin-top:10px"></div>
      ${pre ? note("If ₹" + Math.round(Number(l.emi) * 0.1 || 5000).toLocaleString("en-IN") + " a month were added to the EMI",
        `<p>Interest saved <b>${inr(pre.interestSaved)}</b>, and the loan closes <b>${pre.yearsSaved} years</b> earlier.</p>
         <p>Against investing the same money at ${pct(m.nw.blendedExpectedReturn, 1)}: prepaying is worth ${inr(pre.prepayValue)}, investing ${inr(pre.investedValue)} — <b>${pre.verdict === "prepay" ? "prepaying wins" : "investing wins"}</b> by ${inr(pre.margin)}.</p>
         <p class="tiny muted">${esc(pre.caveat)}</p>`) : ""}`,
      { h: "h3" });
  }).join("");

  const summary = statRow([
    stat("Total debt", inrShort(m.nw.totalLiabilities), `${loans.length} borrowings`),
    stat("Monthly EMI", inrShort(m.nw.monthlyEmi),
      m.monthlyTakeHome ? pct((m.nw.monthlyEmi / m.monthlyTakeHome) * 100) + " of take-home" : ""),
    stat("Non-productive debt", inrShort(m.nw.badDebt), "Consumption borrowing", { neg: m.nw.badDebt > 0 }),
    stat("Deductible interest", inrShort(m.nw.deductibleInterestAnnual),
      m.tax.chosenRegime === "old" ? "claimable this year" : "no relief under the new regime"),
  ], 4);

  return card("Debt", summary + `<div id="chDebt"></div>`, {
    sub: "Clearing a loan is a guaranteed return equal to its interest rate. Ranked against an uncertain market return, high-cost debt wins every time.",
  }) + cards;
}

/* ==================================================== RETIREMENT ========= */

export function viewRetirement(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const A = m.assumptions;
  const goal = m.goals.rows.find((g) => g.kind === "retirement");
  const preRet = A.returnEquity * 0.6 + A.returnDebt * 0.4;

  // Two different questions, answered separately, because they routinely disagree
  // and the disagreement is the most useful thing on this page.
  //   (a) What corpus does the client's CURRENT SPENDING imply?
  //   (b) What corpus has the client ASKED for, in the retirement goal?
  const rc = retirementCorpus({
    currentAge: m.age, retirementAge: A.retirementAge, lifeExpectancy: A.lifeExpectancy,
    monthlyExpenseToday: m.exp.monthly * 0.8,
    inflationPct: A.inflationGeneral, postRetReturnPct: A.postRetirementReturn,
    existingCorpus: goal ? Number(goal.earmarked) || 0 : 0,
    monthlySip: goal ? Number(goal.monthlySip) || 0 : 0,
    preRetReturnPct: preRet, stepUpPct: goal ? Number(goal.stepUp) || 0 : 0,
  });
  const stated = goal ? goal.futureCost : 0;
  const binding = Math.max(rc.corpusRequired, stated);
  const bindingLabel = stated > rc.corpusRequired ? "the client's stated target" : "current spending";
  const projected = rc.projectedCorpus;
  const longevity = corpusLongevity(projected, rc.netFirstYearExpense,
    A.postRetirementReturn, A.inflationGeneral);

  const reconcile = goal ? note(
    stated > rc.corpusRequired * 1.15 ? "The stated target is more ambitious than current spending requires"
      : stated < rc.corpusRequired * 0.85 ? "The stated target falls short of what current spending requires"
      : "The stated target and current spending broadly agree",
    `<p>Two different questions get two different answers, and both are on this page:</p>
     <ul>
       <li><b>${inrShort(rc.corpusRequired)}</b> is what today's spending of ${inr(Math.round(m.exp.monthly * 0.8))} a month,
           inflated for ${rc.yearsToRetire} years and drawn down to age ${A.lifeExpectancy}, actually requires.</li>
       <li><b>${inrShort(stated)}</b> is what the retirement goal asks for — ${inr(goal.presentCost)} in today's money,
           inflated at ${pct(goal.inflation, 1)}.</li>
     </ul>
     <p>The <b>Goals</b> page tracks against the stated target. This page plans against
        <b>${esc(bindingLabel)}</b>, the higher of the two, at ${inrShort(binding)}.
        ${stated > rc.corpusRequired * 1.15
          ? "If the extra is deliberate — a better retirement than today's spending implies, or a margin for medical costs — leave it. If it was a round number picked without arithmetic behind it, the spending-derived figure is the one to fund."
          : stated < rc.corpusRequired * 0.85
          ? "Funding only the stated target would leave the client short of their own current standard of living."
          : ""}</p>`)
    : note("No retirement goal recorded", `<p>This page is planning against current spending alone. Add a retirement goal to record what the client is actually aiming for.</p>`);

  const shortfallSip = Math.max(0, Math.round(
    (binding - projected) > 0
      ? (goal ? goal.requiredSip - (Number(goal.monthlySip) || 0) : rc.additionalSipNeeded)
      : 0));

  return card("Retirement", `
    ${statRow([
      stat("Years to retirement", String(rc.yearsToRetire), `retiring at ${A.retirementAge}`),
      stat("First year's expense then", inrShort(rc.firstYearExpense),
        `${inrShort(m.exp.monthly * 0.8)} a month today, inflated at ${pct(A.inflationGeneral, 1)}`),
      stat("Corpus — spending implies", inrShort(rc.corpusRequired), `to age ${A.lifeExpectancy}`),
      stat("Corpus — client's target", stated ? inrShort(stated) : "—",
        goal ? `${inr(goal.presentCost)} in today's money` : "no goal recorded"),
      stat("Projected", inrShort(projected),
        `${pct(binding ? Math.min(100, (projected / binding) * 100) : 100)} of ${esc(bindingLabel)}`,
        { neg: projected < binding }),
    ], 5)}
    ${meter(`Funded against ${bindingLabel}`, projected, Math.max(1, binding),
      { right: pct(binding ? Math.min(100, (projected / binding) * 100) : 100), hatch: projected < binding })}
    ${meter("Funded against current spending alone", projected, Math.max(1, rc.corpusRequired),
      { right: pct(rc.corpusRequired ? Math.min(100, (projected / rc.corpusRequired) * 100) : 100) })}
    ${reconcile}
    ${shortfallSip > 0 ? note("Contribution gap",
      `<p>A further <b>${inr(shortfallSip)}</b> a month closes the gap against ${esc(bindingLabel)},
       on top of the ${inr(goal ? goal.monthlySip : 0)} already running.</p>`) : ""}
    <div id="chRetire" style="margin-top:16px"></div>
    ${note("What the arithmetic assumes", `<ul>
      <li>Post-retirement spending at 80% of today's — commuting, children's costs and contributions stop; medical rises.</li>
      <li>Contributions grow at ${pct(preRet, 1)} before retirement, a 60:40 equity-debt blend, and the corpus earns ${pct(A.postRetirementReturn, 1)} after it.</li>
      <li>Real return in retirement of ${pct(rc.realReturnInRetirement, 2)} — ${pct(A.postRetirementReturn, 1)} nominal against ${pct(A.inflationGeneral, 1)} inflation.</li>
      <li>The first year's withdrawal is ${pct(rc.swrCheck, 2)} of the spending-derived corpus. Beyond about 4%, a portfolio funding a thirty-year retirement starts to run a real risk of depletion.</li>
      <li>On the projected corpus, the money lasts ${longevity.exhausted ? `${longevity.yearsLasted} years — running out at age ${A.retirementAge + longevity.yearsLasted}` : `beyond age ${A.lifeExpectancy}`}.</li>
    </ul>`)}
    <div class="grid g4" style="margin-top:16px">
      ${field({ label:"Retirement age", path:"assumptions.retirementAge", type:"number", value:A.retirementAge, min:35, max:80 })}
      ${field({ label:"Life expectancy", path:"assumptions.lifeExpectancy", type:"number", value:A.lifeExpectancy, min:60, max:110 })}
      ${field({ label:"Inflation", path:"assumptions.inflationGeneral", type:"pct", value:A.inflationGeneral })}
      ${field({ label:"Return after retirement", path:"assumptions.postRetirementReturn", type:"pct", value:A.postRetirementReturn })}
    </div>`,
    { sub: "The largest goal, the longest horizon, and the only one that cannot be borrowed for." });
}

/* ====================================================== REFERENCE ======== */

export function viewReference(c, m) {
  return card("The Income-tax Act, 2025", `
    <p>${esc(ACT_CONCORDANCE.headline)}</p>
    ${note("Which numbering applies when", `<p>${esc(ACT_CONCORDANCE.caveat)}</p>`)}
    ${table([{t:"Provision"},{t:"1961 Act"},{t:"2025 Act"}],
      ACT_CONCORDANCE.map.map((r) => [r[0], `<code>${esc(r[1])}</code>`, `<code>${esc(r[2])}</code>`]))}`,
    { sub: `In force from ${ACT_CONCORDANCE.effective}` }) +

  card("Small savings and administered rates", `
    ${table([{t:"Scheme"},{t:"Rate",n:true},{t:"Lock-in"},{t:"Tax"},{t:"Open to non-residents"}],
      SMALL_SAVINGS.schemes.map((s) => [s.name, {t:pct(s.rate, 2),n:true}, s.lockIn, s.tax,
        s.nri ? "Yes" : `<span class="tiny">No${s.nriNote ? " — " + esc(s.nriNote) : ""}</span>`]))}
    <p class="tiny muted" style="margin-top:8px">Rates as notified for the quarter beginning ${esc(SMALL_SAVINGS.asOf)}; reviewed quarterly.</p>
    ${note("Provident fund thresholds", `<ul>
      <li>${esc(SMALL_SAVINGS.epfTaxableThreshold.note)}</li>
      <li>${esc(SMALL_SAVINGS.employerRetiralCap.note)}</li></ul>`)}`) +

  card("Allocation guide", `
    ${table([{t:"Profile"},{t:"Equity",n:true},{t:"Debt",n:true},{t:"Gold",n:true},{t:"Cash",n:true}],
      Object.entries(ALLOCATION_GUIDE.byRisk).map(([k, v]) => [
        k.charAt(0).toUpperCase() + k.slice(1),
        {t:pct(v.equity * 100),n:true},{t:pct(v.debt * 100),n:true},
        {t:pct(v.gold * 100),n:true},{t:pct(v.cash * 100),n:true}]))}
    <h4 style="margin:16px 0 8px">By horizon</h4>
    ${table([{t:"Horizon"},{t:"Equity ceiling",n:true},{t:"Reasoning"}],
      ALLOCATION_GUIDE.byHorizon.map((b) => [
        b.maxYears >= 99 ? "Over 10 years" : `Up to ${b.maxYears} years`,
        {t:pct(b.equity * 100),n:true}, b.note]))}
    ${note("", `<p class="tiny">A starting point for a conversation, not a recommendation. The horizon ceiling binds regardless of profile: a conservative investor with a twenty-year goal still needs equity, and an aggressive investor with an eighteen-month goal still cannot use it.</p>`)}`) +

  card("Default assumptions", `
    <div class="grid g4">
      ${[["inflationGeneral","General inflation"],["inflationEducation","Education inflation"],
         ["inflationMedical","Medical inflation"],["inflationLifestyle","Lifestyle inflation"],
         ["returnEquity","Equity return"],["returnDebt","Debt return"],["returnGold","Gold return"],
         ["returnRealEstate","Real-estate return"],["salaryGrowth","Salary growth"],
         ["safeWithdrawalRate","Safe withdrawal rate"]].map(([k, label]) =>
        field({ label, path:`assumptions.${k}`, type:"pct",
          value:(m ? m.assumptions : ASSUMPTIONS)[k] })).join("")}
    </div>
    <p class="tiny muted" style="margin-top:10px">Overrides are stored with this client and used everywhere. Changing them changes every projection in the file, which is the point — an assumption is a stated position, not a hidden constant.</p>`) +

  card("Nominee and heir", note("", `<p><b>${esc(ESTATE_RULES.nomineeVsHeir.principle)}</b> ${esc(ESTATE_RULES.nomineeVsHeir.detail)}</p>`) +
    table([{t:"Law"},{t:"Applies to"},{t:"On intestacy"}],
      ESTATE_RULES.succession.map((s) => [s.law, s.applies, s.intestate])));
}

/* ========================================================= REPORT ======== */

export function viewReport(c, m) {
  if (!m) return empty("Nothing computed yet.");
  const p = c.profile;
  const d = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return `
  <div class="pagehead noprint">
    <h1>Client report</h1>
    <p>A print-ready summary. Use the browser's print dialogue and choose "Save as PDF".</p>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn btn--solid" data-print>Print or save as PDF</button>
    </div>
  </div>

  <div style="border:1px solid var(--rule);padding:26px;border-radius:2px">
    <div style="border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:20px">
      <div class="eyebrow">Financial plan · ${esc(TAX_YEAR.label)}</div>
      <h1 style="margin-bottom:6px">${esc(p.name || "Client")}</h1>
      <p class="muted" style="font-size:13px;margin:0">
        ${m.age ? `Age ${m.age} · ` : ""}${esc(m.residency === "nri" ? "Non-resident" : m.residency === "rnor" ? "Resident but not ordinarily resident" : "Resident")}
        ${p.city ? ` · ${esc(p.city)}` : ""}${(p.dependants || []).length ? ` · ${(p.dependants || []).length} dependants` : ""}
        · Prepared ${d}${p.adviserName ? ` by ${esc(p.adviserName)}` : ""}${p.riaRegNo ? ` (${esc(p.riaRegNo)})` : ""}
      </p>
    </div>

    <h2 style="margin-bottom:12px">Position today</h2>
    ${statRow([
      stat("Net worth", inrShort(m.nw.netWorth), ""),
      stat("Annual income", inrShort(m.grossAnnualIncome), ""),
      stat("Tax", inrShort(m.tax.chosen.totalTax), `${m.tax.chosenRegime} regime`),
      stat("Health score", `${m.health.score}/100`, m.health.grade),
    ], 4)}
    <p style="font-size:13.5px;max-width:74ch">${esc(m.health.verdict)}</p>

    <h2 style="margin:26px 0 12px">Balance sheet</h2>
    ${table([{t:"Asset class"},{t:"Value",n:true},{t:"Share",n:true}],
      Object.entries(m.nw.byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => [
        CLASS_LABEL(k), {t:inr(v),n:true},
        {t:pct(m.nw.totalAssets ? (v / m.nw.totalAssets) * 100 : 0, 1),n:true}]),
      { foot:["Total assets", {t:inr(m.nw.totalAssets),n:true}, {t:"100%",n:true}] })}
    ${m.nw.liabRows.length ? table([{t:"Borrowing"},{t:"Outstanding",n:true},{t:"Rate",n:true},{t:"EMI",n:true}],
      m.nw.liabRows.map((l) => [esc(l.name || l.label), {t:inr(l.outstanding),n:true},
        {t:pct(l.rate, 2),n:true},{t:inr(l.emi),n:true}]),
      { foot:["Total liabilities", {t:inr(m.nw.totalLiabilities),n:true}, "", {t:inr(m.nw.monthlyEmi),n:true}] }) : ""}

    <h2 style="margin:26px 0 12px">Cash flow, monthly</h2>
    ${table([{t:"Item"},{t:"Amount",n:true},{t:"Share of take-home",n:true}],
      m.cashflow.waterfall.filter((w) => w.kind === "out").map((w) => [
        w.label, {t:inr(Math.abs(w.value)),n:true},
        {t:pct(m.cashflow.income ? (Math.abs(w.value) / m.cashflow.income) * 100 : 0),n:true}]),
      { foot:["Unallocated surplus", {t:inr(m.cashflow.surplus),n:true},
        {t:pct(m.cashflow.income ? (m.cashflow.surplus / m.cashflow.income) * 100 : 0),n:true}] })}

    <h2 style="margin:26px 0 12px">Protection</h2>
    ${table([{t:"Cover"},{t:"Held",n:true},{t:"Required",n:true},{t:"Gap",n:true}], [
      ["Life", {t:inr(m.existingLifeCover),n:true},{t:inr(m.lifeCover.netRequirement),n:true},{t:inr(m.lifeCover.gap),n:true}],
      ["Health — own", {t:inr(m.ownHealth),n:true},{t:inr(m.healthCover.recommendedFloor),n:true},{t:inr(m.healthCover.gap),n:true}],
    ])}

    <h2 style="margin:26px 0 12px">Goals</h2>
    ${m.goals.rows.length ? table(
      [{t:"Goal"},{t:"Year",n:true},{t:"Cost then",n:true},{t:"Projected",n:true},{t:"Funded",n:true},{t:"Needs/month",n:true}],
      m.goals.rows.map((g) => [esc(g.name), {t:String(g.targetYear),n:true},
        {t:inr(g.futureCost),n:true},{t:inr(g.projected),n:true},
        {t:pct(g.fundedPct),n:true},{t:inr(g.requiredSip),n:true}]),
      { foot:["Total","",{t:inr(m.goals.totalFutureCost),n:true},{t:inr(m.goals.totalProjected),n:true},"",
        {t:inr(m.goals.totalRequiredSip),n:true}] }) : `<p class="muted">No goals recorded.</p>`}

    <h2 style="margin:26px 0 12px">Tax</h2>
    ${table([{t:"Step"},{t:"Amount",n:true}],
      m.tax.chosen.trace.map((s) => [esc(s.step), {t:inr(s.value),n:true}]))}

    <h2 style="margin:26px 0 12px">Findings</h2>
    ${m.findings.length ? m.findings.map((f) =>
      `<div style="margin-bottom:12px;padding-left:12px;border-left:2px solid ${f.sev === "high" ? "var(--ink)" : "var(--rule-2)"}">
        <b style="font-size:13.5px">${esc(f.title)}</b>
        <span class="tiny muted"> · ${esc(f.area)} · ${f.sev}</span>
        <p style="margin:3px 0 0;font-size:13px">${esc(f.body)}</p>
        ${f.why ? `<p class="tiny muted" style="margin:4px 0 0">${esc(f.why)}</p>` : ""}
      </div>`).join("") : `<p class="muted">None.</p>`}

    <h2 style="margin:26px 0 12px">Actions</h2>
    ${table([{t:"When"},{t:"Action"},{t:"Done when"}],
      m.actions.map((a) => [esc(a.horizon), `<b>${esc(a.title)}</b><br><span class="tiny">${esc(a.detail)}</span>`,
        `<span class="tiny muted">${esc(a.measure)}</span>`]))}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--rule);font-size:11px;line-height:1.6;color:var(--ink-3)">
      <b>Basis and limitations.</b> Prepared for ${esc(TAX_YEAR.label)} (${esc(TAX_YEAR.span)}) under the ${esc(TAX_YEAR.act)},
      on information supplied by the client and not independently verified. Projections assume
      ${pct(m.assumptions.inflationGeneral, 1)} general inflation and ${pct(m.assumptions.returnEquity, 1)} equity
      and ${pct(m.assumptions.returnDebt, 1)} debt returns; actual outcomes will differ. Tax computations are
      indicative and do not replace a return prepared by a qualified professional. This document organises
      information and states arithmetic; it is not a recommendation to buy or sell any security or product,
      and it is not personalised investment advice unless issued by a SEBI-registered investment adviser
      who has accepted responsibility for it in writing.
    </div>
  </div>`;
}

/* =================================================== CHART MOUNTING ====== */

export function mountCharts(section, c, m) {
  if (!m) return;
  const $ = (id) => document.getElementById(id);

  if (section === "dashboard") {
    if ($("chHealth")) CH.gauge($("chHealth"), m.health.score,
      { max: 100, label: m.health.grade, size: 190 });

    if ($("chAlloc")) {
      const byGroup = Object.entries(m.nw.byGroup)
        .map(([k, v]) => ({ label: { equity:"Equity", debt:"Debt", gold:"Gold", cash:"Cash",
          realEstate:"Real estate", mixed:"Hybrid & NPS", other:"Other" }[k] || k, value: v }))
        .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
      CH.donut($("chAlloc"), byGroup, { centerValue: CH.fmtINR(m.nw.totalAssets),
        centerLabel: "total assets", size: 250 });
    }

    if ($("chDrift")) CH.barsH($("chDrift"), m.allocation.rows.map((x, i) => ({
      label: x.key.charAt(0).toUpperCase() + x.key.slice(1),
      value: Math.round(x.actual * 1000) / 10, target: Math.round(x.target * 1000) / 10,
      toneIndex: i, hatch: true,
      note: `${x.drift > 0 ? "Overweight" : "Underweight"} by ${CH.fmtINR(Math.abs(x.rupeeDrift))}`,
    })), { fmt: (v) => v.toFixed(0) + "%", showTarget: true, maxOverride: 100,
           labelW: 78, width: 420, valueLabel: "Actual", rowFmt: (d) => d.value.toFixed(0) + "%" });

    if ($("chWaterfall")) CH.waterfall($("chWaterfall"), m.cashflow.waterfall.filter((w) =>
      w.kind !== "out" || Math.abs(w.value) > 0), { width: 620, height: 300 });

    if ($("chWorth")) {
      const proj = projectNetWorth(m, 20);
      CH.lines($("chWorth"), proj.xs, proj.series, { width: 900, height: 300, xFmt: (v) => String(v) });
    }

    if ($("chTimeline")) CH.timeline($("chTimeline"), m.goals.rows, { width: 900 });
  }

  if (section === "tax") {
    if ($("chRegime")) CH.columns($("chRegime"),
      ["Tax before rebate", "Rebate", "Surcharge + cess", "Tax payable"],
      [{ label: "Old regime", values: [m.tax.old.taxBeforeRebate, m.tax.old.rebate,
          m.tax.old.surcharge + m.tax.old.cess, m.tax.old.totalTax] },
       { label: "New regime", values: [m.tax.new.taxBeforeRebate, m.tax.new.rebate,
          m.tax.new.surcharge + m.tax.new.cess, m.tax.new.totalTax] }],
      { width: 460, height: 290, valueLabels: false });
    if ($("chSlab") && m.tax.chosen.slabRows.length)
      CH.slabStep($("chSlab"), m.tax.chosen.slabRows, { width: 880, height: 240 });
  }

  if (section === "goals" && $("goalTimeline"))
    CH.timeline($("goalTimeline"), m.goals.rows, { width: 900 });

  if (section === "loans") {
    if ($("chDebt")) {
      const rows = m.nw.liabRows.filter((l) => Number(l.outstanding) > 0)
        .sort((a, b) => Number(b.rate) - Number(a.rate))
        .map((l, i) => ({ label: (l.name || l.label).slice(0, 22), value: Number(l.outstanding),
          toneIndex: i, hatch: true, note: `${l.rate}% · ${CH.fmtINR(l.annualInterest)} interest a year` }));
      if (rows.length) CH.barsH($("chDebt"), rows, { width: 860, labelW: 170,
        valueLabel: "Outstanding" });
    }
    for (const l of (m.client.liabilities || [])) {
      const node = $(`chLoan_${l.id}`);
      if (!node || !Number(l.monthsRemaining)) continue;
      const a = amortise(l.outstanding, l.rate, Number(l.monthsRemaining));
      CH.lines(node, a.yearly.map((y) => y.year),
        [{ label: "Balance", values: a.yearly.map((y) => y.closing) },
         { label: "Interest paid that year", values: a.yearly.map((y) => y.interest) },
         { label: "Principal repaid that year", values: a.yearly.map((y) => y.principal) }],
        { width: 860, height: 250, xFmt: (v) => "Yr " + v });
    }
  }

  if (section === "retirement" && $("chRetire")) {
    const A = m.assumptions;
    const goal = m.goals.rows.find((g) => g.kind === "retirement");
    const rc = retirementCorpus({
      currentAge: m.age, retirementAge: A.retirementAge, lifeExpectancy: A.lifeExpectancy,
      monthlyExpenseToday: m.exp.monthly * 0.8, inflationPct: A.inflationGeneral,
      postRetReturnPct: A.postRetirementReturn,
      existingCorpus: goal ? Number(goal.earmarked) || 0 : 0,
      monthlySip: goal ? Number(goal.monthlySip) || 0 : 0,
      preRetReturnPct: A.returnEquity * 0.6 + A.returnDebt * 0.4,
      stepUpPct: goal ? Number(goal.stepUp) || 0 : 0,
    });
    const long = corpusLongevity(rc.projectedCorpus, rc.netFirstYearExpense,
      A.postRetirementReturn, A.inflationGeneral, A.lifeExpectancy - A.retirementAge + 5);
    CH.lines($("chRetire"), long.path.map((x) => A.retirementAge + x.year),
      [{ label: "Corpus remaining", values: long.path.map((x) => x.balance) },
       { label: "Annual withdrawal", values: long.path.map((x) => x.withdrawal) }],
      { width: 900, height: 280, xFmt: (v) => "Age " + v,
        markers: [{ x: A.lifeExpectancy, label: "life expectancy" }] });
  }
}
