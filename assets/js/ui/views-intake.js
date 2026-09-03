/* ============================================================================
   ui/views-intake.js — the fact-find. Eight sections, each a pure render
   function returning HTML. Structural actions (add/remove rows) are handled by
   delegated clicks in main.js; field edits go straight to the store.
   ========================================================================== */

import { field, card, stat, statRow, note, meter, chip, empty, acc, table, esc,
         inr, inrShort, pct } from "./dom.js";
import { EXPENSE_GROUPS, monthlyExpenseTotal, determineResidency } from "../store.js";
import { ASSET_CLASSES, LIABILITY_TYPES } from "../calc/plan.js";
import { RISK_QUESTIONS } from "../calc/ria.js";
import { NRI, SMALL_SAVINGS, DEDUCTIONS, ESTATE_RULES, INSURANCE_RULES,
         SEBI_RIA, ASSUMPTIONS } from "../rules/tax-rules.js";

const g = (c, path, d = "") => path.split(".").reduce((n, k) => n?.[k], c) ?? d;
const opt = (v, t) => ({ v, t });

const addBtn = (list, label) =>
  `<button class="btn btn--quiet btn--sm" data-add="${list}">+ ${label}</button>`;
const delBtn = (list, id) =>
  `<button class="btn btn--quiet btn--sm" data-del="${list}" data-id="${id}" aria-label="Remove">Remove</button>`;

/* ======================================================== 1 · PROFILE ==== */

export function viewProfile(c, m) {
  const p = c.profile;
  const isNri = p.residency === "nri" || p.residency === "rnor";
  const rt = m?.residencyTest;

  const identity = card("Who this plan is for", `
    <div class="grid g3">
      ${field({ label:"Full name", path:"profile.name", value:p.name })}
      ${field({ label:"Date of birth", path:"profile.dob", type:"date", value:p.dob,
                hint: m ? `Age ${m.age}` : "" })}
      ${field({ label:"Gender", path:"profile.gender", type:"select", value:p.gender,
        options:["", "Female","Male","Other","Prefer not to say"] })}
      ${field({ label:"PAN", path:"profile.pan", value:p.pan, placeholder:"ABCDE1234F",
                hint:"Required for KYC and for the advisory agreement" })}
      ${field({ label:"Marital status", path:"profile.maritalStatus", type:"select", value:p.maritalStatus,
        options:["", "Single","Married","Divorced","Widowed"] })}
      ${field({ label:"Occupation", path:"profile.occupation", value:p.occupation })}
      ${field({ label:"Employer type", path:"profile.employerType", type:"select", value:p.employerType,
        options:[opt("private","Private sector"),opt("government","Government / PSU"),
                 opt("selfEmployed","Self-employed / business"),opt("professional","Practising professional"),
                 opt("retired","Retired"),opt("notWorking","Not working")],
        hint:"Government employees get a 14% employer-NPS ceiling under the old regime, not 10%" })}
      ${field({ label:"City", path:"profile.city", value:p.city })}
      ${field({ label:"City tier", path:"profile.cityTier", type:"select", value:p.cityTier,
        options:[opt("metro","Metro"),opt("tier2","Tier 2"),opt("smallTown","Smaller town")],
        hint:"Drives the health-cover benchmark and the HRA metro test" })}
    </div>`);

  const deps = (p.dependants || []).map((d, i) => `
    <div class="item" data-item="${d.id}">
      <div class="itemhead"><span class="n">${i + 1}</span><h4>${esc(d.name || "Dependant")}</h4>
        ${delBtn("dependants", d.id)}</div>
      <div class="grid g4">
        ${field({ label:"Name", path:`__list.dependants.${d.id}.name`, value:d.name })}
        ${field({ label:"Relationship", path:`__list.dependants.${d.id}.relationship`, type:"select",
          value:d.relationship, options:[opt("spouse","Spouse"),opt("child","Child"),
            opt("parent","Parent"),opt("sibling","Sibling"),opt("other","Other")] })}
        ${field({ label:"Age", path:`__list.dependants.${d.id}.age`, type:"number", value:d.age, min:0, max:120 })}
        ${field({ label:"Financially dependent", path:`__list.dependants.${d.id}.financiallyDependent`,
          type:"check", value:d.financiallyDependent !== false })}
      </div>
    </div>`).join("");

  const dependants = card("Who depends on this income",
    `<div class="items">${deps || empty("Nobody recorded yet. Life-cover sizing depends on this.")}</div>
     <div class="btnrow" style="margin-top:12px">${addBtn("dependants", "Add dependant")}</div>`,
    { sub:"Life cover protects other people's income. Without dependants, cover beyond outstanding debt has no job to do." });

  const residency = card("Residential status", `
    <div class="grid g3">
      ${field({ label:"Status for this tax year", path:"profile.residency", type:"select", value:p.residency,
        options:[opt("resident","Resident and ordinarily resident"),
                 opt("rnor","Resident but not ordinarily resident"),
                 opt("nri","Non-resident (NRI)")] })}
      ${field({ label:"Citizenship / origin", path:"profile.citizenship", type:"select", value:p.citizenship,
        options:[opt("indian","Indian citizen"),opt("pio","Person of Indian Origin / OCI"),opt("foreign","Foreign national")] })}
      ${field({ label:"Country of residence", path:"profile.countryOfResidence", value:p.countryOfResidence,
        hint:isNri ? "Determines which treaty applies" : "" })}
    </div>
    ${acc("Work out the status from day counts — s.6", `
      <div class="grid g3">
        ${field({ label:"Days in India, this tax year", path:"profile.daysInIndia.cy", type:"number", value:g(c,"profile.daysInIndia.cy"), min:0, max:366 })}
        ${field({ label:"Days, previous year", path:"profile.daysInIndia.py1", type:"number", value:g(c,"profile.daysInIndia.py1"), min:0, max:366 })}
        ${field({ label:"Days, two years ago", path:"profile.daysInIndia.py2", type:"number", value:g(c,"profile.daysInIndia.py2"), min:0, max:366 })}
        ${field({ label:"Days, three years ago", path:"profile.daysInIndia.py3", type:"number", value:g(c,"profile.daysInIndia.py3"), min:0, max:366 })}
        ${field({ label:"Days, four years ago", path:"profile.daysInIndia.py4", type:"number", value:g(c,"profile.daysInIndia.py4"), min:0, max:366 })}
        ${field({ label:"Days in India over the last 7 years", path:"profile.daysInIndia.last7y", type:"number", value:g(c,"profile.daysInIndia.last7y"), min:0,
          hint:"729 or fewer makes a resident 'not ordinarily resident'" })}
        ${field({ label:"Non-resident in how many of the last 10 years", path:"profile.daysInIndia.nrYearsOf10", type:"number", value:g(c,"profile.daysInIndia.nrYearsOf10"), min:0, max:10 })}
        ${field({ label:"Liable to tax in another country", path:"profile.taxableElsewhere", type:"check", value:p.taxableElsewhere })}
      </div>
      ${rt ? `<div class="note" style="margin-top:14px"><h4>Determination — ${esc(rt.label)}</h4>
        ${table([{t:"Test"},{t:"Met"},{t:"Detail"}], rt.trail.map((t) => [
          t.test, t.met ? "Yes" : "No", { t:`<span class="tiny muted">${esc(t.detail)}</span>` }]))}
        <p style="margin-top:10px"><b>Scope of Indian tax:</b> ${esc(rt.scope)}</p></div>`
      : `<p class="tiny muted" style="margin-top:10px">Enter at least the current-year day count to run the test.</p>`}`,
      isNri)}`,
    { sub:"Everything downstream — which slabs apply, whether the s.87A rebate is available, whether an unused basic exemption can shelter capital gains, and which products are open — turns on this one field." });

  const nriPanel = isNri ? card("Non-resident specifics", `
    <div class="grid g3">
      ${field({ label:"A treaty applies with the country of residence", path:"profile.dtaaAvailable", type:"check", value:p.dtaaAvailable })}
      ${field({ label:"Tax Residency Certificate held", path:"profile.hasTRC", type:"check", value:p.hasTRC })}
      ${field({ label:"Form 10F filed on the portal", path:"profile.form10F", type:"check", value:p.form10F })}
    </div>
    ${note("What changes when the status is non-resident", `<ul>
      <li><b>No s.87A rebate.</b> ${esc(NRI.noRebate87A)}</li>
      <li><b>No basic-exemption shelter for capital gains.</b> ${esc(NRI.noBasicExemptionAdjustment)}</li>
      <li><b>No senior-citizen slab.</b> The higher exemption for those over 60 is confined to residents.</li>
      <li><b>NRE and FCNR interest is exempt</b> u/s 10(4)(ii); NRO interest bears 30% at source.</li>
      <li><b>No 20%-with-indexation option</b> on property bought before 23 July 2024 — that choice is for residents only.</li>
    </ul>`)}
    ${acc("Accounts — what each one is for", table(
      [{t:"Account"},{t:"Funded from"},{t:"Repatriable"},{t:"Indian tax on interest"}],
      NRI.accounts.map((a) => [a.name, a.source, a.repatriable, a.taxIndia])))}
    ${acc("Closed to non-residents", `<ul>${NRI.prohibited.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`)}
    ${acc("Open to non-residents", `<ul>${NRI.permitted.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`)}
    ${acc("FEMA points that catch people out", `<ul>
      <li>${esc(NRI.fema.statusChange)}</li>
      <li>${esc(NRI.fema.repatriationCap)}</li>
      <li>${esc(NRI.fema.propertySaleRule)}</li>
      <li>${esc(NRI.fema.lrsInboundNote)}</li></ul>`)}`) : "";

  return identity + residency + nriPanel + dependants + viewRiskProfile(c, m) + viewAdviser(c, m);
}

/* --------------------------------------------------------- risk profile */

export function viewRiskProfile(c, m) {
  const ans = c.profile.riskAnswers || {};
  const r = m?.risk;
  const qs = RISK_QUESTIONS.map((q, i) => `
    <div class="item">
      <div class="itemhead"><span class="n">${i + 1}</span>
        <h4 style="white-space:normal">${esc(q.q)}</h4>
        <span class="chip chip--dash">${q.dim}</span></div>
      <div class="grid g2" style="gap:6px">
        ${q.options.map((o) => `
          <label class="field inline" style="cursor:pointer">
            <input type="radio" name="risk_${q.id}" data-risk="${q.id}" value="${o.v}"
              ${String(ans[q.id]) === String(o.v) ? "checked" : ""} style="width:auto">
            <span style="font-size:13px">${esc(o.t)}</span>
          </label>`).join("")}
      </div>
    </div>`).join("");

  const result = r ? `
    ${statRow([
      stat("Score", `${r.score}<small>/100</small>`, `${r.answered} of ${r.total} answered`),
      stat("Category", `<span style="font-size:19px;text-transform:capitalize">${r.category}</span>`, "Drives the target allocation"),
      stat("Capacity", r.capacity.toFixed(1), "Circumstances — horizon, buffer, dependants"),
      stat("Willingness", r.willingness.toFixed(1), "Attitude and past behaviour"),
    ], 4)}
    ${note(`Governed by ${r.governedBy}`, `<p>${esc(r.note)}</p>
      <p class="tiny muted" style="margin-top:6px">SEBI requires the lower of capacity and willingness to govern, and requires the client's consent to the resulting profile to be on record.</p>`)}
    <div class="grid g2" style="margin-top:14px">
      ${field({ label:"Override the category (state the reason in notes)", path:"profile.riskProfile",
        type:"select", value:c.profile.riskProfile || r.category,
        options:[opt("conservative","Conservative"),opt("moderate","Moderate"),opt("balanced","Balanced"),
                 opt("growth","Growth"),opt("aggressive","Aggressive")] })}
      ${field({ label:"Client has seen and accepted this profile", path:"profile.riskProfileAccepted",
        type:"check", value:c.profile.riskProfileAccepted })}
    </div>`
    : note("", "<p>Answer the capacity and willingness questions to generate a profile.</p>");

  return card("Risk profile", `<div class="items">${qs}</div><div style="margin-top:16px">${result}</div>`,
    { sub:"Regulation 16(c) and 17 — a profile must be recorded, consented to, and not contradicted by the advice that follows." });
}

/* -------------------------------------------------------------- adviser */

export function viewAdviser(c, m) {
  const p = c.profile, fee = m?.ctx?.feeArrangement;
  return card("Adviser and engagement", `
    <div class="grid g3">
      ${field({ label:"Adviser name", path:"profile.adviserName", value:p.adviserName })}
      ${field({ label:"SEBI registration number", path:"profile.riaRegNo", value:p.riaRegNo, placeholder:"INA000000000" })}
      ${field({ label:"Advisory agreement dated", path:"profile.agreementDate", type:"date", value:p.agreementDate })}
      ${field({ label:"Fee mode", path:"profile.feeMode", type:"select", value:p.feeMode,
        options:[opt("","Not recorded"),opt("fixed","Fixed fee"),opt("aua","Assets under advice")] })}
      ${field({ label:"Annual fee", path:"profile.annualFee", type:"money", value:p.annualFee })}
      ${field({ label:"Assets under advice", path:"profile.aua", type:"money", value:p.aua,
        hint:"Leave blank to use investable assets" })}
    </div>
    ${fee && fee.mode ? note(fee.withinCap ? "Within the cap" : "Exceeds the cap",
      `<p>${esc(fee.display)}</p><p class="tiny muted" style="margin-top:5px">${esc(fee.note || "")}</p>`) : ""}
    <div class="grid g2" style="margin-top:14px">
      ${field({ label:"Conflicts of interest disclosed in writing", path:"profile.conflictsDisclosed", type:"check", value:p.conflictsDisclosed })}
      ${field({ label:"A distribution relationship exists with this family", path:"profile.distributionRelationship", type:"check", value:p.distributionRelationship })}
      ${field({ label:"Advisory and distribution segregation evidenced", path:"profile.segregationConfirmed", type:"check", value:p.segregationConfirmed })}
      ${field({ label:"Interaction and rationale records maintained", path:"profile.recordsMaintained", type:"check", value:p.recordsMaintained })}
    </div>
    ${acc("Fee caps and standing obligations", `
      ${table([{t:"Mode"},{t:"Cap"},{t:"Note"}], SEBI_RIA.feeModes.map((f) => [f.mode, f.cap, f.note]))}
      <p style="margin-top:10px"><b>${esc(SEBI_RIA.advanceFee)}</b></p>
      <ul>${SEBI_RIA.obligations.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      <p class="tiny muted">${esc(SEBI_RIA.regulation)}</p>`)}`);
}

/* ========================================================= 2 · INCOME === */

export function viewIncome(c, m) {
  const s = c.income.salary, o = c.income.other, cg = c.income.capitalGains, b = c.income.business;
  const hp = c.income.houseProperties || [];

  const salary = card("Salary", `
    <div class="grid g4">
      ${field({ label:"Basic", path:"income.salary.basic", type:"money", value:s.basic, hint:"Annual" })}
      ${field({ label:"Dearness allowance", path:"income.salary.da", type:"money", value:s.da })}
      ${field({ label:"HRA received", path:"income.salary.hra", type:"money", value:s.hra })}
      ${field({ label:"LTA", path:"income.salary.lta", type:"money", value:s.lta })}
      ${field({ label:"Special allowance & other", path:"income.salary.special", type:"money", value:s.special })}
      ${field({ label:"Bonus & variable pay", path:"income.salary.bonus", type:"money", value:s.bonus })}
      ${field({ label:"Perquisites, taxable value", path:"income.salary.perquisites", type:"money", value:s.perquisites })}
      ${field({ label:"Employer NPS contribution", path:"income.salary.employerNps", type:"money", value:s.employerNps,
        hint:"Deductible u/s 80CCD(2) in both regimes" })}
      ${field({ label:"Employer PF contribution", path:"income.salary.employerPf", type:"money", value:s.employerPf,
        hint:"Exempt within 12% of basic + DA" })}
      ${field({ label:"Professional tax paid", path:"income.salary.professionalTax", type:"money", value:s.professionalTax, step:100 })}
      ${field({ label:"Monthly rent paid", path:"income.rentPaid", type:"money", value:c.income.rentPaid })}
      ${field({ label:"Rented home is in a metro", path:"income.metroCity", type:"check", value:c.income.metroCity })}
    </div>
    ${m && m.salary.components > 0 ? `
      ${statRow([
        stat("Gross salary", inrShort(m.salary.components + m.salary.employerNps), "Including employer NPS"),
        stat("HRA exempt", inrShort(m.salary.hra.exempt), "Old regime only"),
        stat("Taxable — old", inrShort(m.salary.grossOld), "After HRA and professional tax"),
        stat("Taxable — new", inrShort(m.salary.grossNew), "No HRA relief"),
      ], 4)}
      ${acc("How the HRA exemption was arrived at", table(
        [{t:"Test"},{t:"Amount", n:true}],
        m.salary.hra.tests.map((t) => [t.label, { t:inr(t.value), n:true }]),
        { foot:["Exempt — the least of the three", { t:inr(m.salary.hra.exempt), n:true }] }))}` : ""}`,
    { sub:"Annual figures. The engine applies the standard deduction itself — ₹75,000 under the new regime, ₹50,000 under the old." });

  const hpRows = hp.map((x, i) => `
    <div class="item" data-item="${x.id}">
      <div class="itemhead"><span class="n">${i + 1}</span><h4>${esc(x.name || "Property")}</h4>
        ${delBtn("houseProperties", x.id)}</div>
      <div class="grid g3">
        ${field({ label:"Name", path:`__list.houseProperties.${x.id}.name`, value:x.name })}
        ${field({ label:"Type", path:`__list.houseProperties.${x.id}.type`, type:"select", value:x.type,
          options:[opt("self","Self-occupied"),opt("letout","Let out"),opt("deemedLetout","Deemed let out")] })}
        ${field({ label:"Annual rent received", path:`__list.houseProperties.${x.id}.annualRent`, type:"money", value:x.annualRent })}
        ${field({ label:"Municipal tax paid", path:`__list.houseProperties.${x.id}.municipalTax`, type:"money", value:x.municipalTax })}
        ${field({ label:"Home-loan interest for the year", path:`__list.houseProperties.${x.id}.interest`, type:"money", value:x.interest })}
        ${field({ label:"Principal repaid", path:`__list.houseProperties.${x.id}.principalRepaid`, type:"money", value:x.principalRepaid,
          hint:"Counts inside the s.80C ceiling" })}
      </div>
    </div>`).join("");

  const houseProp = card("House property", `
    <div class="items">${hpRows || empty("No property income recorded.")}</div>
    <div class="btnrow" style="margin-top:12px">${addBtn("houseProperties", "Add property")}</div>
    ${m && hp.length ? `
      ${table([{t:"Property"},{t:"Net annual value", n:true},{t:"30% deduction", n:true},{t:"Interest allowed", n:true},{t:"Income", n:true}],
        m.housePropertyOld.rows.map((r) => [r.name, {t:inr(r.nav),n:true},{t:inr(r.standardDeduction),n:true},
          {t:inr(r.interestAllowed),n:true},{t:inr(r.income),n:true}]))}
      ${statRow([
        stat("Head income — old regime", inrShort(m.housePropertyOld.incomeForGTI), m.housePropertyOld.note ? "Set-off restricted" : ""),
        stat("Head income — new regime", inrShort(m.housePropertyNew.incomeForGTI), m.housePropertyNew.note ? "Set-off restricted" : ""),
      ], 2)}
      ${m.housePropertyNew.note ? note("Set-off restriction", `<p>${esc(m.housePropertyNew.note)}</p>`) : ""}` : ""}`,
    { sub:"A self-occupied property produces no income; its only entry is the interest deduction, which the new regime disallows." });

  const business = card("Business or professional income", `
    <div class="grid g4">
      ${field({ label:"Basis", path:"income.business.scheme", type:"select", value:b.scheme,
        options:[opt("none","Not applicable"),opt("regular","Regular books"),
                 opt("44AD","Presumptive — s.44AD business"),opt("44ADA","Presumptive — s.44ADA profession")] })}
      ${field({ label:"Gross turnover / receipts", path:"income.business.turnover", type:"money", value:b.turnover })}
      ${field({ label:"Digital receipts share", path:"income.business.digitalShare", type:"pct", value:b.digitalShare,
        hint:"s.44AD applies 6% to digital and 8% to cash" })}
      ${field({ label:"Actual net profit", path:"income.business.netProfit", type:"money", value:b.netProfit })}
    </div>
    ${m && m.business ? `${statRow([
        stat("Deemed profit", inrShort(m.business.deemedProfit), m.business.rate),
        stat("Within the ceiling", m.business.eligible ? "Yes" : "No", inrShort(m.business.limit) + " limit"),
        stat("Taxed on", inrShort(m.businessIncome), m.business.declaredHigher ? "Actual profit is higher" : "Presumptive basis"),
      ], 3)}${note("", `<p>${esc(m.business.note || "")}</p>`)}` : ""}`);

  const other = card("Other sources", `
    <div class="grid g4">
      ${field({ label:"Savings-account interest", path:"income.other.savingsInterest", type:"money", value:o.savingsInterest })}
      ${field({ label:"Fixed & recurring deposit interest", path:"income.other.fdInterest", type:"money", value:o.fdInterest })}
      ${field({ label:"Dividend", path:"income.other.dividend", type:"money", value:o.dividend,
        hint:"Taxable at slab; surcharge capped at 15%" })}
      ${field({ label:"Family pension", path:"income.other.familyPension", type:"money", value:o.familyPension,
        hint:"One third is deductible, capped at ₹25,000 in the new regime" })}
      ${field({ label:"NRE / FCNR interest", path:"income.other.nreInterest", type:"money", value:o.nreInterest,
        hint:"Exempt while non-resident" })}
      ${field({ label:"NRO interest", path:"income.other.nroInterest", type:"money", value:o.nroInterest,
        hint:"Fully taxable, 30% at source" })}
      ${field({ label:"Agricultural income", path:"income.other.agricultural", type:"money", value:o.agricultural,
        hint:"Exempt, but aggregated to set the rate" })}
      ${field({ label:"Anything else", path:"income.other.otherIncome", type:"money", value:o.otherIncome })}
    </div>`);

  const gains = card("Capital gains realised this year", `
    <div class="grid g4">
      ${field({ label:"Listed equity — short term", path:"income.capitalGains.equitySTCG", type:"money", value:cg.equitySTCG, hint:"s.111A · 20%" })}
      ${field({ label:"Listed equity — long term", path:"income.capitalGains.equityLTCG", type:"money", value:cg.equityLTCG, hint:"s.112A · 12.5% above ₹1.25 L" })}
      ${field({ label:"Property — short term", path:"income.capitalGains.propertySTCG", type:"money", value:cg.propertySTCG, hint:"Slab rates" })}
      ${field({ label:"Property — long term", path:"income.capitalGains.propertyLTCG", type:"money", value:cg.propertyLTCG, hint:"s.112 · 12.5%" })}
      ${field({ label:"Other assets — short term", path:"income.capitalGains.otherSTCG", type:"money", value:cg.otherSTCG, hint:"Gold, unlisted, foreign — slab" })}
      ${field({ label:"Other assets — long term", path:"income.capitalGains.otherLTCG", type:"money", value:cg.otherLTCG, hint:"s.112 · 12.5%" })}
      ${field({ label:"Debt funds & specified MFs", path:"income.capitalGains.debtSlab", type:"money", value:cg.debtSlab, hint:"Always slab rates" })}
      ${field({ label:"Virtual digital assets", path:"income.capitalGains.vda", type:"money", value:cg.vda, hint:"Flat 30%, no set-off" })}
    </div>
    <div class="grid g3" style="margin-top:14px">
      ${field({ label:"Unrealised long-term equity gain", path:"income.unrealisedEquityGain", type:"money", value:c.income.unrealisedEquityGain,
        hint:"Used to size the annual exemption harvest" })}
      ${field({ label:"Unrealised loss available", path:"income.unrealisedEquityLoss", type:"money", value:c.income.unrealisedEquityLoss })}
      ${field({ label:"TDS already deducted", path:"income.tdsAlready", type:"money", value:c.income.tdsAlready })}
      ${field({ label:"Advance tax already paid", path:"income.advanceTaxPaid", type:"money", value:c.income.advanceTaxPaid })}
    </div>
    ${m ? note("", `<p class="tiny">The ₹1,25,000 annual exemption under s.112A is a single allowance for the whole year, not one per transaction. ${
      m.tax.chosen.capitalGains.s112A.exemptionUsed > 0
        ? `${inr(m.tax.chosen.capitalGains.s112A.exemptionUsed)} of it is used by the gains entered above.`
        : "None of it is used yet."}</p>`) : ""}`);

  return salary + houseProp + business + other + gains;
}

/* ======================================================= 3 · EXPENSES === */

export function viewExpenses(c, m) {
  const e = c.expenses || {};
  const t = monthlyExpenseTotal(e);
  const groups = EXPENSE_GROUPS.map((grp) => card(grp.label,
    `<div class="grid g3">${grp.items.map((it) => field({
      label: it.label, path: `expenses.${it.id}`, type: "money", value: e[it.id],
      hint: grp.annual ? "per year" : "per month" })).join("")}</div>`,
    { h: "h3", sub: grp.annual ? "Entered annually; the summary divides by twelve." : "" })).join("");

  const inc = m ? m.monthlyTakeHome : 0;
  const summary = statRow([
    stat("Monthly outgo", inrShort(t.monthly), "Living costs including annualised lumps"),
    stat("Essential", inrShort(t.essential), inc ? pct((t.essential / inc) * 100) + " of take-home" : ""),
    stat("Discretionary", inrShort(t.discretionary), inc ? pct((t.discretionary / inc) * 100) + " of take-home" : ""),
    stat("Annual lumps", inrShort(t.annualised), inrShort(t.annualised / 12) + " a month"),
  ], 4);

  const insight = m ? note("Against income", `
    ${meter("Living costs as a share of take-home pay", t.monthly, Math.max(1, inc),
      { right: pct((t.monthly / Math.max(1, inc)) * 100), tick: inc * 0.5,
        sub: "The tick marks 50%. Above 60%, there is no capacity left to absorb a shock." })}
    ${meter("Living costs plus EMIs", t.monthly + m.nw.monthlyEmi, Math.max(1, inc),
      { right: pct(((t.monthly + m.nw.monthlyEmi) / Math.max(1, inc)) * 100), hatch: true })}
    <p class="tiny muted" style="margin-top:8px">Take-home is derived from gross income less the computed tax — ${inr(inc)} a month.</p>`) : "";

  return card("What the household actually spends", summary + insight,
    { sub:"Under-reporting here is the most common single defect in a fact-find. Reconcile the total against bank and card statements before relying on the surplus figure." }) + groups;
}

/* ================================================== 4 · BALANCE SHEET === */

export function viewAssets(c, m) {
  const rows = (c.assets || []).map((a, i) => `
    <div class="item" data-item="${a.id}">
      <div class="itemhead"><span class="n">${i + 1}</span>
        <h4>${esc(a.name || "Asset")} <span class="muted tiny">· ${esc((ASSET_CLASSES[a.assetClass] || {}).label || "")}</span></h4>
        <span class="chip">${inrShort(a.value)}</span>${delBtn("assets", a.id)}</div>
      <div class="grid g4">
        ${field({ label:"Description", path:`__list.assets.${a.id}.name`, value:a.name })}
        ${field({ label:"Class", path:`__list.assets.${a.id}.assetClass`, type:"select", value:a.assetClass,
          options:Object.entries(ASSET_CLASSES).map(([k, v]) => opt(k, v.label)) })}
        ${field({ label:"Current value", path:`__list.assets.${a.id}.value`, type:"money", value:a.value })}
        ${field({ label:"Valued as of", path:`__list.assets.${a.id}.asOf`, type:"date", value:a.asOf })}
        ${field({ label:"Held by", path:`__list.assets.${a.id}.owner`, type:"select", value:a.owner || "self",
          options:[opt("self","Self"),opt("spouse","Spouse"),opt("joint","Joint"),opt("huf","HUF"),opt("minor","Minor child")] })}
        ${field({ label:"Nominee", path:`__list.assets.${a.id}.nominee`, value:a.nominee, placeholder:"Name" })}
        ${a.assetClass === "cash" ? field({ label:"Account type", path:`__list.assets.${a.id}.accountType`, type:"select",
          value:a.accountType, options:[opt("resident","Resident"),opt("nre","NRE"),opt("nro","NRO"),opt("fcnr","FCNR")] }) : ""}
        ${field({ label:"Counts as emergency money", path:`__list.assets.${a.id}.emergency`, type:"check", value:a.emergency })}
      </div>
    </div>`).join("");

  const liabRows = (c.liabilities || []).map((l, i) => `
    <div class="item" data-item="${l.id}">
      <div class="itemhead"><span class="n">${i + 1}</span>
        <h4>${esc(l.name || "Borrowing")} <span class="muted tiny">· ${esc((LIABILITY_TYPES[l.type] || {}).label || "")}</span></h4>
        <span class="chip">${inrShort(l.outstanding)} @ ${l.rate || 0}%</span>${delBtn("liabilities", l.id)}</div>
      <div class="grid g4">
        ${field({ label:"Description", path:`__list.liabilities.${l.id}.name`, value:l.name })}
        ${field({ label:"Type", path:`__list.liabilities.${l.id}.type`, type:"select", value:l.type,
          options:Object.entries(LIABILITY_TYPES).map(([k, v]) => opt(k, v.label)) })}
        ${field({ label:"Outstanding", path:`__list.liabilities.${l.id}.outstanding`, type:"money", value:l.outstanding })}
        ${field({ label:"Interest rate", path:`__list.liabilities.${l.id}.rate`, type:"pct", value:l.rate, max:60 })}
        ${field({ label:"Monthly EMI", path:`__list.liabilities.${l.id}.emi`, type:"money", value:l.emi })}
        ${field({ label:"Months remaining", path:`__list.liabilities.${l.id}.monthsRemaining`, type:"number", value:l.monthsRemaining, min:0 })}
        ${field({ label:"Co-borrower or guarantor", path:`__list.liabilities.${l.id}.coBorrower`, value:l.coBorrower })}
      </div>
    </div>`).join("");

  const summary = m ? statRow([
    stat("Total assets", inrShort(m.nw.totalAssets), `${(c.assets || []).length} holdings`),
    stat("Total liabilities", inrShort(m.nw.totalLiabilities), `${(c.liabilities || []).length} borrowings`),
    stat("Net worth", inrShort(m.nw.netWorth), `Solvency ${pct(m.nw.solvency * 100)}`, { neg: m.nw.netWorth < 0 }),
    stat("Liquid assets", inrShort(m.nw.liquidAssets), "Reachable within days"),
    stat("Monthly EMI", inrShort(m.nw.monthlyEmi), m.monthlyTakeHome ? pct((m.nw.monthlyEmi / m.monthlyTakeHome) * 100) + " of take-home" : ""),
  ], 5) : "";

  return card("Balance sheet", summary, { sub:"Every value carries a date. A balance sheet without dates is a guess." }) +
    card("Assets", `<div class="items">${rows || empty("No assets recorded.")}</div>
      <div class="btnrow" style="margin-top:12px">${addBtn("assets", "Add asset")}</div>`) +
    card("Liabilities", `<div class="items">${liabRows || empty("No borrowings recorded.")}</div>
      <div class="btnrow" style="margin-top:12px">${addBtn("liabilities", "Add borrowing")}</div>
      ${m && m.nw.liabRows.length ? table(
        [{t:"Borrowing"},{t:"Outstanding",n:true},{t:"Rate",n:true},{t:"EMI",n:true},{t:"Interest a year",n:true},{t:"Character"}],
        m.nw.liabRows.map((l) => [esc(l.name || l.label), {t:inr(l.outstanding),n:true},
          {t:pct(l.rate,1),n:true},{t:inr(l.emi),n:true},{t:inr(l.annualInterest),n:true},
          l.good ? "Productive" : "Consumption"])) : ""}`);
}

/* ========================================================== 5 · GOALS === */

export function viewGoals(c, m) {
  const rows = (c.goals || []).map((x, i) => {
    const an = m ? m.goals.rows.find((r) => r.id === x.id) : null;
    return `
    <div class="item" data-item="${x.id}">
      <div class="itemhead"><span class="n">${i + 1}</span><h4>${esc(x.name || "Goal")}</h4>
        ${an ? `<span class="chip${an.status === "on track" ? " chip--solid" : ""}">${an.status} · ${an.fundedPct.toFixed(0)}%</span>` : ""}
        ${delBtn("goals", x.id)}</div>
      <div class="grid g4">
        ${field({ label:"Goal", path:`__list.goals.${x.id}.name`, value:x.name })}
        ${field({ label:"Kind", path:`__list.goals.${x.id}.kind`, type:"select", value:x.kind,
          options:[opt("retirement","Retirement"),opt("education","Education"),opt("home","Home purchase"),
                   opt("vehicle","Vehicle"),opt("wedding","Wedding"),opt("travel","Travel"),
                   opt("emergency","Emergency fund"),opt("medical","Medical"),opt("legacy","Legacy"),opt("other","Other")] })}
        ${field({ label:"Needed by", path:`__list.goals.${x.id}.targetYear`, type:"number", value:x.targetYear,
          min:new Date().getFullYear(), max:2100 })}
        ${field({ label:"Cost in today's money", path:`__list.goals.${x.id}.presentCost`, type:"money", value:x.presentCost })}
        ${field({ label:"Already earmarked", path:`__list.goals.${x.id}.earmarked`, type:"money", value:x.earmarked })}
        ${field({ label:"Monthly contribution", path:`__list.goals.${x.id}.monthlySip`, type:"money", value:x.monthlySip, step:500 })}
        ${field({ label:"Annual step-up", path:`__list.goals.${x.id}.stepUp`, type:"pct", value:x.stepUp, max:30 })}
        ${field({ label:"Inflation override", path:`__list.goals.${x.id}.inflation`, type:"pct", value:x.inflation,
          hint:an ? `Default ${an.inflation}%` : "" })}
        ${field({ label:"Return override", path:`__list.goals.${x.id}.expectedReturn`, type:"pct", value:x.expectedReturn,
          hint:an ? `Default ${an.expectedReturn}% from the horizon` : "" })}
        ${field({ label:"Priority", path:`__list.goals.${x.id}.priority`, type:"select", value:x.priority,
          options:[opt("must","Must happen"),opt("should","Should happen"),opt("nice","Would be nice")] })}
      </div>
      ${an ? `<div style="margin-top:12px">
        ${meter(`Funded on current contributions`, an.projected, Math.max(1, an.futureCost),
          { right: `${inrShort(an.projected)} of ${inrShort(an.futureCost)}`, hatch: an.status !== "on track" })}
        <div class="grid g4" style="margin-top:10px;gap:8px">
          <div class="tiny"><span class="muted">Cost in ${an.targetYear}</span><br><b>${inr(an.futureCost)}</b></div>
          <div class="tiny"><span class="muted">Needs a month</span><br><b>${inr(an.requiredSip)}</b></div>
          <div class="tiny"><span class="muted">Shortfall a month</span><br><b>${inr(an.sipShortfall)}</b></div>
          <div class="tiny"><span class="muted">Horizon guide</span><br><b>${pct(an.recommendedEquity * 100)} equity</b></div>
        </div>
        <p class="tiny muted" style="margin-top:8px">${esc(an.horizonNote)}</p>
      </div>` : ""}
    </div>`;
  }).join("");

  const summary = m && m.goals.rows.length ? statRow([
    stat("Goals recorded", String(m.goals.rows.length), ""),
    stat("Total cost, future rupees", inrShort(m.goals.totalFutureCost), "Inflated to each target year"),
    stat("Projected", inrShort(m.goals.totalProjected), `${m.goals.totalFutureCost ? pct((m.goals.totalProjected / m.goals.totalFutureCost) * 100) : "—"} of target`),
    stat("Contribution needed", inrShort(m.goals.totalRequiredSip), `${inrShort(m.goals.totalCurrentSip)} running`),
    stat("Monthly shortfall", inrShort(m.goals.totalShortfallSip), "", { neg: m.goals.totalShortfallSip > 0 }),
  ], 5) : "";

  return card("Goals", summary +
    `<div id="goalTimeline" style="margin-top:8px"></div>`,
    { sub:"A goal without a date and a rupee figure cannot be funded, measured, or missed. Costs are entered in today's money and inflated by kind — education at 9%, medical at 11%, general at 6%." }) +
    card("Each goal", `<div class="items">${rows || empty("No goals recorded yet.")}</div>
      <div class="btnrow" style="margin-top:12px">${addBtn("goals", "Add goal")}</div>`);
}

/* ====================================================== 6 · INSURANCE === */

export function viewInsurance(c, m) {
  const rows = (c.insurance || []).map((p, i) => `
    <div class="item" data-item="${p.id}">
      <div class="itemhead"><span class="n">${i + 1}</span>
        <h4>${esc(p.insurer || "Policy")} <span class="muted tiny">· ${esc(p.policyType || "")}</span></h4>
        <span class="chip">${inrShort(p.sumAssured)}</span>${delBtn("insurance", p.id)}</div>
      <div class="grid g4">
        ${field({ label:"Category", path:`__list.insurance.${p.id}.category`, type:"select", value:p.category,
          options:[opt("life","Life"),opt("health","Health"),opt("criticalIllness","Critical illness"),
                   opt("accident","Personal accident"),opt("disability","Disability"),opt("motor","Motor"),
                   opt("home","Home"),opt("travel","Travel"),opt("professional","Professional indemnity"),opt("cyber","Cyber")] })}
        ${field({ label:"Product type", path:`__list.insurance.${p.id}.policyType`, type:"select", value:p.policyType,
          options:[opt("term","Term"),opt("ulip","ULIP"),opt("endowment","Endowment"),opt("moneyback","Money-back"),
                   opt("wholelife","Whole life"),opt("individual","Individual health"),opt("floater","Family floater"),
                   opt("topup","Top-up / super top-up"),opt("corporate","Employer-provided"),opt("other","Other")] })}
        ${field({ label:"Insurer", path:`__list.insurance.${p.id}.insurer`, value:p.insurer })}
        ${field({ label:"Policy number", path:`__list.insurance.${p.id}.policyNo`, value:p.policyNo })}
        ${field({ label:"Sum assured", path:`__list.insurance.${p.id}.sumAssured`, type:"money", value:p.sumAssured })}
        ${field({ label:"Annual premium", path:`__list.insurance.${p.id}.annualPremium`, type:"money", value:p.annualPremium })}
        ${field({ label:"Started", path:`__list.insurance.${p.id}.startYear`, type:"number", value:p.startYear, min:1950, max:2100 })}
        ${field({ label:"Term, years", path:`__list.insurance.${p.id}.term`, type:"number", value:p.term, min:1, max:100 })}
        ${field({ label:"Nominee", path:`__list.insurance.${p.id}.nominee`, value:p.nominee })}
        ${field({ label:"Employer-provided", path:`__list.insurance.${p.id}.corporate`, type:"check", value:p.corporate })}
        ${field({ label:"Under the MWP Act", path:`__list.insurance.${p.id}.mwp`, type:"check", value:p.mwp })}
      </div>
    </div>`).join("");

  const life = m ? card("Life cover", `
    ${statRow([
      stat("Cover held", inrShort(m.existingLifeCover), ""),
      stat("Requirement", inrShort(m.lifeCover.netRequirement), `${m.lifeCover.incomeMultiple}× gross income`),
      stat("Gap", inrShort(m.lifeCover.gap), m.lifeCover.gap ? "Uninsured exposure" : "None", { neg: m.lifeCover.gap > 0 }),
      stat("Cross-check — HLV", inrShort(m.lifeCover.hlv), `${m.lifeCover.hlvDivergence}× the needs figure`),
    ], 4)}
    ${meter("Cover against requirement", m.existingLifeCover, Math.max(1, m.lifeCover.netRequirement),
      { right: pct(Math.min(100, m.lifeCover.coverageRatio * 100)) })}
    ${table([{t:"What the money has to do"},{t:"Amount",n:true}], [
      [`Replace household expenses for ${m.lifeCover.supportYears} years`, {t:inr(m.lifeCover.breakdown.expenseReplacement),n:true}],
      ["Clear outstanding debt", {t:inr(m.lifeCover.breakdown.debtClearance),n:true}],
      ["Fund goals that survive the earner", {t:inr(m.lifeCover.breakdown.goalFunding),n:true}],
      [{t:"Less liquid assets already available",cls:"sub"}, {t:"− " + inr(m.lifeCover.lessLiquidAssets),n:true}],
    ], { foot:["Net requirement", {t:inr(m.lifeCover.netRequirement),n:true}] })}
    ${m.lifeCover.note ? note("", `<p>${esc(m.lifeCover.note)}</p>`) : ""}
    ${note("On the two methods", `<p>The recommendation is the needs figure — what the money must actually do. Human Life Value capitalises gross earning power and here lands ${m.lifeCover.hlvDivergence}× higher; it is the number insurers quote, and it is shown only as a cross-check.</p>`)}`) : "";

  const health = m ? card("Health cover", `
    ${statRow([
      stat("Own cover", inrShort(m.ownHealth), "Independent of employment"),
      stat("Employer cover", inrShort(m.corpHealth), m.corpHealth ? "Ends with the job" : "None"),
      stat("Indicative floor", inrShort(m.healthCover.recommendedFloor), `${c.profile.cityTier}, ${1 + (c.profile.dependants || []).length} people`),
      stat("Gap", inrShort(m.healthCover.gap), "", { neg: m.healthCover.gap > 0 }),
    ], 4)}
    ${m.healthCover.corporateWarning ? note("Employer cover is not a plan", `<p>${esc(m.healthCover.corporateWarning)}</p>`) : ""}
    ${m.healthCover.seniorNote ? note("Senior parents", `<p>${esc(m.healthCover.seniorNote)}</p>`) : ""}
    ${m.healthCover.structureTip ? note("Structuring the cover", `<p>${esc(m.healthCover.structureTip)}</p>`) : ""}`) : "";

  return life + health +
    card("Policies held", `<div class="items">${rows || empty("No policies recorded.")}</div>
      <div class="btnrow" style="margin-top:12px">${addBtn("insurance", "Add policy")}</div>`) +
    card("Taxability of the proceeds — s.10(10D)", `
      ${table([{t:"Situation"},{t:"Treatment"}], [
        ["Death benefit", INSURANCE_RULES.s10_10D.death],
        ["Non-ULIP policy issued on or after 1 Apr 2023", INSURANCE_RULES.s10_10D.nonUlipAfter2023],
        ["ULIP issued on or after 1 Feb 2021", INSURANCE_RULES.s10_10D.ulipAfter2021],
        ["Premium to sum-assured test", INSURANCE_RULES.s10_10D.premiumToSumAssured],
        ["If the exemption is lost", INSURANCE_RULES.s10_10D.taxationIfBreached],
      ])}
      ${acc("The MWP Act route", `<p><b>${esc(INSURANCE_RULES.mwpAct.label)}</b></p>
        <p>${esc(INSURANCE_RULES.mwpAct.what)}</p><p>${esc(INSURANCE_RULES.mwpAct.when)}</p>`)}
      ${c.profile.residency === "nri" ? note("Non-residents", `<p>${esc(INSURANCE_RULES.nriBuying)}</p>`) : ""}`);
}

/* ========================================================= 7 · ESTATE === */

export function viewEstate(c, m) {
  const e = c.estate || {};
  const isNri = c.profile.residency === "nri";
  const nominationRows = [
    ...(c.assets || []).map((a) => ({ what: a.name, kind: (ASSET_CLASSES[a.assetClass] || {}).label,
      value: a.value, nominee: a.nominee })),
    ...(c.insurance || []).map((p) => ({ what: `${p.insurer || "Policy"} — ${p.policyType || ""}`,
      kind: "Insurance", value: p.sumAssured, nominee: p.nominee })),
  ];

  return card("Will", `
    <div class="grid g3">
      ${field({ label:"A will exists", path:"estate.hasWill", type:"check", value:e.hasWill })}
      ${field({ label:"Dated", path:"estate.willDate", type:"date", value:e.willDate })}
      ${field({ label:"Registered", path:"estate.willRegistered", type:"check", value:e.willRegistered })}
      ${field({ label:"Where the original is kept", path:"estate.willLocation", value:e.willLocation })}
      ${field({ label:"Executor", path:"estate.executor", value:e.executor })}
      ${field({ label:"Witnesses", path:"estate.witnesses", value:e.witnesses, hint:"Two, neither a beneficiary" })}
      ${field({ label:"Last reviewed", path:"estate.lastReviewed", type:"date", value:e.lastReviewed })}
      ${field({ label:"Guardian named for minor children", path:"estate.guardian", value:e.guardian })}
      ${field({ label:"Succession law that applies", path:"estate.successionLaw", type:"select", value:e.successionLaw,
        options:[opt("hindu","Hindu Succession Act, 1956"),opt("indian","Indian Succession Act, 1925"),
                 opt("muslim","Muslim personal law"),opt("special","Special Marriage Act")] })}
      ${field({ label:"Power of attorney in place", path:"estate.poa", type:"check", value:e.poa })}
      ${field({ label:"Living will / advance directive", path:"estate.livingWill", type:"check", value:e.livingWill })}
      ${isNri ? field({ label:"A separate Indian will covers Indian assets", path:"estate.indianWill", type:"check", value:e.indianWill }) : ""}
      ${isNri ? field({ label:"A foreign will exists", path:"estate.foreignWill", type:"check", value:e.foreignWill }) : ""}
    </div>
    ${field({ label:"Notes", path:"estate.notes", type:"textarea", value:e.notes, rows:3 })}
    ${note("What makes a will valid in India", `<p>${esc(ESTATE_RULES.will.validity)}</p>
      <p>${esc(ESTATE_RULES.will.registration)}</p><p>${esc(ESTATE_RULES.will.probate)}</p>
      <p><b>${esc(ESTATE_RULES.will.noEstateDuty)}</b></p>`)}`,
    { sub:"Without a will, the estate devolves by statutory formula. That formula is unlikely to match anyone's intention, and it takes far longer." }) +

  card("Nomination register", `
    ${m ? statRow([
      stat("Holdings tracked", String(nominationRows.length), "Assets and policies"),
      stat("Nominations missing", String(m.estate.nominationGaps), "", { neg: m.estate.nominationGaps > 0 }),
      stat("Estate value", inrShort(m.nw.netWorth), "Net of liabilities"),
    ], 3) : ""}
    ${nominationRows.length ? table(
      [{t:"Holding"},{t:"Kind"},{t:"Value",n:true},{t:"Nominee"}],
      nominationRows.map((r) => [esc(r.what || "—"), esc(r.kind || "—"), {t:inrShort(r.value),n:true},
        r.nominee ? esc(r.nominee) : `<span class="chip chip--dash">not recorded</span>`]))
      : empty("Add assets and policies to build the register.")}
    ${note("A nominee is not an heir", `<p>${esc(ESTATE_RULES.nomineeVsHeir.detail)}</p>`)}`,
    { sub:"Nomination decides who an institution may pay. A will decides who is entitled to keep it. Both are needed." }) +

  card("Succession law", table([{t:"Law"},{t:"Applies to"},{t:"On intestacy"}],
    ESTATE_RULES.succession.map((s) => [s.law, s.applies, s.intestate])) +
    (isNri ? note("Cross-border estates", `<ul>
      <li>${esc(ESTATE_RULES.nriEstate.situs)}</li>
      <li>${esc(ESTATE_RULES.nriEstate.twoWills)}</li>
      <li><b>${esc(ESTATE_RULES.nriEstate.foreignDuty)}</b></li></ul>`) : ""));
}

/* ===================================================== 8 · DEDUCTIONS === */

export function viewDeductions(c, m) {
  const d = c.deductions || {};
  const usedNew = m ? m.deductions.chVIANew : 0;

  return card("Deductions claimed", `
    <div class="grid g3">
      ${field({ label:"s.80C — investments, insurance, PF, tuition, principal", path:"deductions.s80C", type:"money", value:d.s80C, hint:"Ceiling ₹1,50,000" })}
      ${field({ label:"s.80CCD(1B) — additional NPS", path:"deductions.s80CCD1B", type:"money", value:d.s80CCD1B, hint:"Ceiling ₹50,000" })}
      ${field({ label:"s.80D — health insurance premium", path:"deductions.s80D", type:"money", value:d.s80D, hint:"₹25,000 + ₹25,000, or ₹50,000 each where senior" })}
      ${field({ label:"s.80DD — dependant with disability", path:"deductions.s80DD", type:"money", value:d.s80DD, hint:"₹75,000 or ₹1,25,000, flat" })}
      ${field({ label:"s.80DDB — specified diseases", path:"deductions.s80DDB", type:"money", value:d.s80DDB, hint:"₹40,000, or ₹1,00,000 for a senior" })}
      ${field({ label:"s.80E — education-loan interest", path:"deductions.s80E", type:"money", value:d.s80E, hint:"No ceiling, eight years" })}
      ${field({ label:"s.80EEB — electric-vehicle loan interest", path:"deductions.s80EEB", type:"money", value:d.s80EEB, hint:"Ceiling ₹1,50,000" })}
      ${field({ label:"s.80G — donations", path:"deductions.s80G", type:"money", value:d.s80G, hint:"Eligible amount after any 50% or 10%-of-GTI restriction" })}
      ${field({ label:"s.80TTA / 80TTB — deposit interest", path:"deductions.s80TTA", type:"money", value:d.s80TTA, hint:"₹10,000, or ₹50,000 for a resident senior" })}
      ${field({ label:"s.80U — own disability", path:"deductions.s80U", type:"money", value:d.s80U, hint:"₹75,000 or ₹1,25,000, flat" })}
      <div class="field">
        <label>s.24(b) — home-loan interest</label>
        <div class="prefix"><span>₹</span><input type="number" value="${m ? Math.abs(Math.min(0, m.housePropertyOld.incomeForGTI)) : 0}" disabled
          style="opacity:.7;cursor:not-allowed" aria-describedby="h24b"></div>
        <span class="hint" id="h24b">Taken from the house-property section, not entered here — interest interacts with rent
          and the 30% standard deduction, so it cannot be a standalone number.
          <a href="#income">Edit it there</a>.</span>
      </div>
      ${field({ label:"s.80GG — rent where no HRA is received", path:"deductions.s80GG", type:"money", value:d.s80GG,
        hint: c.income.receivesHra ? "Unavailable — HRA is received" : (m ? `Capped at the computed maximum of ${inr(m.deductions.gg.deduction)}` : "") })}
    </div>
    ${m ? statRow([
      stat("Total, old regime", inrShort(m.deductions.chVIAOld), "Chapter VI-A plus employer NPS"),
      stat("Total, new regime", inrShort(usedNew), "Employer NPS only"),
      stat("Difference", inrShort(m.deductions.chVIAOld - usedNew), "What the old regime buys"),
    ], 3) : ""}`,
    { sub:"Annual amounts actually claimable, not amounts spent. Enter the eligible figure after any statutory restriction." }) +

  card("What survives each regime", table(
    [{t:"Provision"},{t:"1961 Act"},{t:"2025 Act"},{t:"Ceiling"},{t:"Available under"}],
    DEDUCTIONS.map((x) => [esc(x.label.length > 78 ? x.label.slice(0, 77) + "…" : x.label),
      x.s1961, x.s2025,
      x.cap ? inr(x.cap) : x.tiers ? Object.values(x.tiers).map(inrShort).join(" / ")
        : x.subCaps ? "see note" : x.pctOfSalary ? "% of salary" : "no ceiling",
      x.regime === "both" ? "Both regimes" : "Old regime only"])) +
    note("The one that matters under the new regime", `<p>${esc(DEDUCTIONS.find((x) => x.id === "80CCD2").note)}</p>`));
}
