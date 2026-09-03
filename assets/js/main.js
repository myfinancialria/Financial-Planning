/* ============================================================================
   main.js — routing, rendering and event wiring.

   Rendering strategy: a section's HTML is written once; typing into a field
   writes to the store without re-rendering, so the caret never moves. Anything
   that changes structure (adding a row, switching client, changing the regime)
   triggers a full re-render of the current section.
   ========================================================================== */

import { Store, blankClient, getSettings, setSettings } from "./store.js";
import { computeAll } from "./model.js";
import { bindFields, toast, download, confirmBox, esc, inrShort } from "./ui/dom.js";
import { viewProfile, viewIncome, viewExpenses, viewAssets, viewGoals,
         viewInsurance, viewEstate, viewDeductions } from "./ui/views-intake.js";
import { viewDashboard, viewTax, viewAnalysis, viewLoans, viewRetirement,
         viewReference, viewReport, mountCharts } from "./ui/views-analysis.js";
import { hideTip } from "./charts.js";

const store = new Store();
let model = null;
let lastRendered = null;

const SECTIONS = [
  { group: "Analysis", items: [
    { id: "dashboard",  label: "Dashboard",     view: viewDashboard,
      title: "Dashboard", blurb: "Everything in one place — net worth, allocation, cash flow, goals and what needs attention." },
    { id: "tax",        label: "Tax",           view: viewTax,
      title: "Tax", blurb: "Both regimes computed side by side, every step shown, and the levers ranked by what they are actually worth." },
    { id: "analysis",   label: "RIA analysis",  view: viewAnalysis,
      title: "Analysis and action plan", blurb: "Findings, the three-plan sequence, a dated action plan, suitability, and the compliance record." },
    { id: "loans",      label: "Debt",          view: viewLoans,
      title: "Debt", blurb: "Amortisation, post-tax cost, and whether prepaying beats investing the same money." },
    { id: "retirement", label: "Retirement",    view: viewRetirement,
      title: "Retirement", blurb: "The corpus the stated lifestyle requires, against what current contributions will actually deliver." },
    { id: "report",     label: "Client report", view: viewReport,
      title: "Client report", blurb: "" },
  ]},
  { group: "Fact-find", items: [
    { id: "profile",    label: "Profile & risk", view: viewProfile, count: (c) => (c.profile.dependants || []).length || null,
      title: "Profile, residency and risk", blurb: "Who the client is, where they are resident for tax, who depends on them, and how much risk their circumstances and temperament actually support." },
    { id: "income",     label: "Income",        view: viewIncome,
      title: "Income", blurb: "All five heads. Annual figures, gross of tax." },
    { id: "expenses",   label: "Expenses",      view: viewExpenses,
      title: "Expenses", blurb: "Where the money goes each month, and the lumpy annual items people forget." },
    { id: "assets",     label: "Balance sheet", view: viewAssets, count: (c) => (c.assets || []).length + (c.liabilities || []).length || null,
      title: "Assets and liabilities", blurb: "What is owned, what is owed, and what could actually be reached in a hurry." },
    { id: "goals",      label: "Goals",         view: viewGoals, count: (c) => (c.goals || []).length || null,
      title: "Goals", blurb: "What the money is for, when it is needed, and whether current contributions get there." },
    { id: "insurance",  label: "Insurance",     view: viewInsurance, count: (c) => (c.insurance || []).length || null,
      title: "Insurance", blurb: "Cover held against cover needed, and how the proceeds will be taxed." },
    { id: "estate",     label: "Will & nomination", view: viewEstate,
      title: "Will, nomination and succession", blurb: "Who inherits, who can be paid, and the difference between the two." },
    { id: "deductions", label: "Deductions",    view: viewDeductions,
      title: "Deductions claimed", blurb: "What is being claimed this year, and what each regime allows." },
  ]},
  { group: "Reference", items: [
    { id: "reference",  label: "Rules & assumptions", view: viewReference,
      title: "Rules and assumptions", blurb: "The statutory parameters this tool computes with, and the assumptions behind every projection." },
  ]},
];
const ALL = SECTIONS.flatMap((g) => g.items);
let current = location.hash.slice(1) || "dashboard";
if (!ALL.some((s) => s.id === current)) current = "dashboard";

/* ------------------------------------------------------------------ chrome */

function renderNav() {
  const c = store.current;
  document.getElementById("nav").innerHTML = SECTIONS.map((g) => `
    <div class="navgroup"><p class="eyebrow">${g.group}</p></div>
    <ul class="nav">${g.items.map((s) => {
      const n = c && s.count ? s.count(c) : null;
      return `<li><a href="#${s.id}" ${s.id === current ? 'aria-current="page"' : ""}>
        <span>${s.label}</span>${n ? `<span class="badge">${n}</span>` : ""}</a></li>`;
    }).join("")}</ul>`).join("");
}

function renderTopbar() {
  const c = store.current;
  const bar = document.getElementById("topbar");
  if (!c) { bar.innerHTML = ""; return; }
  const others = store.clients.filter((x) => x.id !== c.id);
  bar.innerHTML = `
    <button class="btn btn--quiet btn--sm menubtn" data-menu aria-label="Menu">☰</button>
    <div class="who">
      <strong>${esc(c.profile.name || "Untitled client")}</strong>
      <span class="chipline">
        ${model ? `<span class="chip">${esc(model.residency === "nri" ? "NRI" : model.residency === "rnor" ? "RNOR" : "Resident")}</span>` : ""}
        ${model && model.age ? `<span class="chip">Age ${model.age}</span>` : ""}
        ${model ? `<span class="chip">Net worth <strong>${inrShort(model.nw.netWorth)}</strong></span>` : ""}
        ${model ? `<span class="chip">Score <strong>${model.health.score}</strong></span>` : ""}
      </span>
    </div>
    <div class="spacer"></div>
    <div class="btnrow">
      <select id="clientPick" class="btn btn--quiet btn--sm" style="max-width:190px" aria-label="Switch client">
        ${store.clients.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.profile.name || "Untitled")}</option>`).join("")}
      </select>
      <button class="btn btn--quiet btn--sm" data-new>New</button>
      <button class="btn btn--quiet btn--sm" data-export>Export</button>
      <button class="btn btn--quiet btn--sm" data-import>Import</button>
      <button class="btn btn--quiet btn--sm" data-theme aria-label="Toggle theme">◐</button>
    </div>`;
}

/* ------------------------------------------------------------------ render */

function render() {
  const c = store.current;
  const main = document.getElementById("content");

  if (!c) {
    main.innerHTML = `
      <div class="welcome">
        <h1>Financial Planning</h1>
        <p>A complete fact-find, tax engine and analysis workbench for Indian residents and non-residents,
           built for a SEBI-registered investment adviser.</p>
        <p class="tiny muted" style="margin-top:14px">Everything stays in this browser. There is no server,
           no account and no network call — the only way data leaves this device is the export button.</p>
        <div class="btnrow">
          <button class="btn btn--solid" data-new>Start a new client</button>
          <button class="btn" data-import>Import a file</button>
          <button class="btn btn--quiet" data-demo>Load a worked example</button>
        </div>
      </div>`;
    renderNav(); renderTopbar();
    return;
  }

  model = computeAll(c);
  const sec = ALL.find((s) => s.id === current);
  main.innerHTML =
    (sec.id === "report" ? "" : `<div class="pagehead"><h1>${esc(sec.title)}</h1>${sec.blurb ? `<p>${esc(sec.blurb)}</p>` : ""}</div>`) +
    `<div class="section active" id="sec_${sec.id}">${sec.view(c, model)}</div>`;

  renderNav(); renderTopbar();
  try { mountCharts(sec.id, c, model); }
  catch (e) { console.warn("Chart mounting failed:", e); }

  document.querySelectorAll("[data-risk]").forEach((el) => {
    el.addEventListener("change", () => {
      store.set(`profile.riskAnswers.${el.dataset.risk}`, Number(el.value));
      render();
    });
  });
  if (lastRendered !== sec.id) { window.scrollTo({ top: 0 }); lastRendered = sec.id; }
}

/* ---------------------------------------------------------------- routing */

window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (ALL.some((s) => s.id === id)) { current = id; hideTip(); render(); }
});

/* --------------------------------------------------------------- defaults */

const DEFAULTS = {
  assets:       { name: "", assetClass: "equityMf", value: "", asOf: new Date().toISOString().slice(0, 10), owner: "self", nominee: "" },
  liabilities:  { name: "", type: "home", outstanding: "", rate: "", emi: "", monthsRemaining: "" },
  goals:        { name: "", kind: "other", targetYear: new Date().getFullYear() + 10, presentCost: "", earmarked: "", monthlySip: "", stepUp: "", priority: "should" },
  insurance:    { category: "life", policyType: "term", insurer: "", sumAssured: "", annualPremium: "", nominee: "" },
  dependants:   { name: "", relationship: "child", age: "", financiallyDependent: true },
  houseProperties: { name: "", type: "letout", annualRent: "", municipalTax: "", interest: "" },
};
const NESTED = { dependants: "profile.dependants", houseProperties: "income.houseProperties" };

function listRef(list) {
  if (!NESTED[list]) return store.current[list] || (store.current[list] = []);
  const path = NESTED[list].split(".");
  let node = store.current;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]] ??= {};
  return node[path[path.length - 1]] ??= [];
}

/* ------------------------------------------------------------ interactions */

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add],[data-del],[data-goto],[data-new],[data-export],[data-import],[data-theme],[data-print],[data-menu],[data-demo]");
  if (!t) return;

  if (t.dataset.add != null) {
    const list = t.dataset.add;
    const arr = listRef(list);
    arr.push({ id: "i" + Math.random().toString(36).slice(2, 9), ...(DEFAULTS[list] || {}) });
    store.persist("add"); render(); return;
  }
  if (t.dataset.del != null) {
    const { del: list, id } = t.dataset;
    const arr = listRef(list);
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { arr.splice(i, 1); store.persist("del"); render(); }
    return;
  }
  if (t.dataset.goto) { location.hash = t.dataset.goto; return; }
  if (t.dataset.new != null) {
    const name = prompt("Client name") || "Untitled client";
    store.create(name); current = "profile"; location.hash = "profile"; render();
    toast("Client created"); return;
  }
  if (t.dataset.export != null) {
    const c = store.current;
    download(`${(c?.profile.name || "client").replace(/[^\w-]+/g, "-").toLowerCase()}-plan.json`,
      store.exportJSON());
    toast("Exported"); return;
  }
  if (t.dataset.import != null) { document.getElementById("fileInput").click(); return; }
  if (t.dataset.theme != null) {
    const root = document.documentElement;
    const now = root.getAttribute("data-theme");
    const next = now === "dark" ? "light" : now === "light" ? "" : "dark";
    if (next) root.setAttribute("data-theme", next); else root.removeAttribute("data-theme");
    setSettings({ ...getSettings(), theme: next });
    render(); return;
  }
  if (t.dataset.print != null) { window.print(); return; }
  if (t.dataset.menu != null) { document.querySelector(".side").classList.toggle("open"); return; }
  if (t.dataset.demo != null) { loadDemo(); return; }
});

document.getElementById("fileInput").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const n = store.importJSON(r.result);
      toast(`Imported ${n} client${n === 1 ? "" : "s"}`);
      current = "dashboard"; location.hash = "dashboard"; render();
    } catch (err) { toast("Could not read that file — " + err.message); }
  };
  r.readAsText(f);
  e.target.value = "";
});

document.addEventListener("change", (e) => {
  if (e.target.id === "clientPick") { store.select(e.target.value); render(); }
});

/* Field writes. `__list.<list>.<id>.<field>` routes into an array item. */
bindFields(document.getElementById("content"), {
  set(path, value) {
    if (path.startsWith("__list.")) {
      const [, list, id, key] = path.split(".");
      const arr = listRef(list);
      const item = arr.find((x) => x.id === id);
      if (item) { item[key] = value; store.persist("item"); }
      return;
    }
    store.set(path, value);
  },
}, (path) => {
  // Structural fields change what is on screen; re-render for those only.
  if (/^(settings\.regime|profile\.residency|profile\.riskProfile|assumptions\.|income\.receivesHra|__list\.(assets|liabilities|goals|insurance)\.[^.]+\.(assetClass|type|category|kind))/.test(path)) {
    clearTimeout(window.__rr);
    window.__rr = setTimeout(render, 260);
  } else {
    clearTimeout(window.__soft);
    window.__soft = setTimeout(() => { model = computeAll(store.current); renderTopbar(); }, 400);
  }
});

/* ------------------------------------------------------------------ demo */

async function loadDemo() {
  try {
    const res = await fetch("./demo-client.json", { cache: "no-store" });
    if (!res.ok) throw new Error("not found");
    store.importJSON(await res.text());
    current = "dashboard"; location.hash = "dashboard"; render();
    toast("Worked example loaded");
  } catch {
    toast("Example file could not be loaded");
  }
}

/* ------------------------------------------------------------------ boot */

const saved = getSettings();
if (saved.theme) document.documentElement.setAttribute("data-theme", saved.theme);
window.addEventListener("scroll", hideTip, { passive: true });
render();
