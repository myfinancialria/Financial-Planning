/* ============================================================================
   store.js — client records, persistence and the data model.

   Everything lives in the browser. There is no server, no account, no network
   call: localStorage holds the roster, and JSON export is the only way data
   leaves the device. That is a deliberate constraint for a tool that collects
   a complete financial picture, and it is stated plainly in the interface.
   ========================================================================== */

const KEY = "fp.clients.v1";
const ACTIVE = "fp.active.v1";
const SETTINGS = "fp.settings.v1";

export const SCHEMA_VERSION = 1;

const uid = () => "c" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const today = () => new Date().toISOString().slice(0, 10);

/* --------------------------------------------------------- blank record */

export function blankClient(name = "Untitled client") {
  return {
    id: uid(), version: SCHEMA_VERSION, createdAt: today(), updatedAt: today(),
    profile: {
      name, dob: "", gender: "", pan: "", maritalStatus: "",
      city: "", cityTier: "metro", occupation: "", employerType: "private",
      residency: "resident", citizenship: "indian", countryOfResidence: "",
      dtaaAvailable: false, hasTRC: false, form10F: false,
      daysInIndia: { cy: "", py1: "", py2: "", py3: "", py4: "", last7y: "", nrYearsOf10: "" },
      dependants: [],
      riskAnswers: {}, riskProfile: "", riskProfileAccepted: false,
      adviserName: "", riaRegNo: "", agreementDate: "",
      feeMode: "", annualFee: "", aua: "",
      conflictsDisclosed: false, distributionRelationship: false,
      segregationConfirmed: false, recordsMaintained: false,
    },
    income: {
      salary: { basic: "", da: "", hra: "", lta: "", special: "", bonus: "",
                perquisites: "", employerNps: "", employerPf: "", professionalTax: "" },
      rentPaid: "", metroCity: true, receivesHra: true,
      business: { scheme: "none", turnover: "", digitalShare: "100", netProfit: "" },
      houseProperties: [],
      other: { savingsInterest: "", fdInterest: "", dividend: "", familyPension: "",
               otherIncome: "", nreInterest: "", nroInterest: "", agricultural: "" },
      capitalGains: { equitySTCG: "", equityLTCG: "", otherSTCG: "", otherLTCG: "",
                      propertySTCG: "", propertyLTCG: "", vda: "", debtSlab: "" },
      unrealisedEquityGain: "", unrealisedEquityLoss: "",
      tdsAlready: "", advanceTaxPaid: "",
    },
    expenses: {},
    assets: [], liabilities: [], goals: [], insurance: [],
    estate: {
      hasWill: false, willDate: "", willRegistered: false, willLocation: "",
      executor: "", witnesses: "", indianWill: false, foreignWill: false,
      poa: false, livingWill: false, guardian: "", successionLaw: "hindu",
      lastReviewed: "", notes: "",
    },
    deductions: {
      s80C: "", s80CCD1B: "", s80D: "", s80DD: "", s80DDB: "", s80E: "",
      s80EEB: "", s80G: "", s80GG: "", s80TTA: "", s80U: "", s24b: "",
    },
    assumptions: {},
    settings: { taxYear: "2026-27", regime: "auto" },
    notes: "",
  };
}

/* ------------------------------------------------------------- expenses */

export const EXPENSE_GROUPS = [
  { id: "housing", label: "Home & utilities", items: [
    { id: "rent", label: "Rent" },
    { id: "maintenance", label: "Society maintenance" },
    { id: "utilities", label: "Electricity, water, gas" },
    { id: "internet", label: "Internet & phone" },
    { id: "help", label: "Household help" },
  ]},
  { id: "living", label: "Daily living", items: [
    { id: "groceries", label: "Groceries" },
    { id: "dining", label: "Eating out & delivery" },
    { id: "transport", label: "Fuel, cab, transport" },
    { id: "personal", label: "Personal care" },
  ]},
  { id: "family", label: "Family & health", items: [
    { id: "schoolFees", label: "School & tuition fees" },
    { id: "childcare", label: "Childcare & activities" },
    { id: "medical", label: "Routine medical, out of pocket" },
    { id: "parents", label: "Support to parents" },
  ]},
  { id: "lifestyle", label: "Lifestyle", items: [
    { id: "shopping", label: "Shopping & clothing" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "entertainment", label: "Entertainment" },
    { id: "travelMonthly", label: "Travel, monthly average" },
  ]},
  { id: "annual", label: "Annual & lumpy — enter the yearly figure", annual: true, items: [
    { id: "vacations", label: "Holidays" },
    { id: "festivals", label: "Festivals & gifting" },
    { id: "insurancePremiums", label: "Insurance premiums", derived: true },
    { id: "propertyTax", label: "Property tax & annual maintenance" },
    { id: "repairs", label: "Repairs & replacements" },
    { id: "professional", label: "Professional fees" },
  ]},
];

export function monthlyExpenseTotal(expenses = {}) {
  let monthly = 0, annual = 0, discretionary = 0, essential = 0;
  for (const g of EXPENSE_GROUPS) {
    for (const it of g.items) {
      const v = Number(expenses[it.id]) || 0;
      if (g.annual) annual += v;
      else {
        monthly += v;
        if (g.id === "lifestyle") discretionary += v; else essential += v;
      }
    }
  }
  return {
    monthly: Math.round(monthly + annual / 12),
    coreMonthly: Math.round(monthly),
    annualised: Math.round(annual),
    essential: Math.round(essential),
    discretionary: Math.round(discretionary + annual / 12),
  };
}

/* -------------------------------------------------------------- storage */

function safeParse(s, fallback) { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } }

export function loadAll() {
  if (typeof localStorage === "undefined") return [];
  try { return safeParse(localStorage.getItem(KEY), []) || []; } catch { return []; }
}
export function saveAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch (e) { console.warn("Could not persist — storage may be full or blocked.", e); return false; }
}
export function activeId() {
  try { return localStorage.getItem(ACTIVE) || null; } catch { return null; }
}
export function setActiveId(id) { try { localStorage.setItem(ACTIVE, id); } catch {} }

export function getSettings() {
  try { return safeParse(localStorage.getItem(SETTINGS), {}) || {}; } catch { return {}; }
}
export function setSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch {}
}

/* ------------------------------------------------------------ the store */

export class Store {
  constructor() {
    this.clients = loadAll();
    this.listeners = new Set();
    const id = activeId();
    this.current = this.clients.find((c) => c.id === id) || this.clients[0] || null;
    if (this.current) this.current = migrate(this.current);
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason = "change") { for (const fn of this.listeners) fn(this.current, reason); }

  create(name) {
    const c = blankClient(name);
    this.clients.push(c);
    this.current = c;
    setActiveId(c.id);
    this.persist("create");
    return c;
  }
  select(id) {
    const c = this.clients.find((x) => x.id === id);
    if (!c) return;
    this.current = migrate(c);
    setActiveId(id);
    this.emit("select");
  }
  remove(id) {
    this.clients = this.clients.filter((c) => c.id !== id);
    if (this.current && this.current.id === id) this.current = this.clients[0] || null;
    if (this.current) setActiveId(this.current.id);
    this.persist("remove");
  }
  duplicate(id) {
    const src = this.clients.find((c) => c.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.profile.name = src.profile.name + " (copy)";
    copy.createdAt = copy.updatedAt = today();
    this.clients.push(copy);
    this.persist("duplicate");
    return copy;
  }
  persist(reason = "change") {
    if (this.current) {
      this.current.updatedAt = today();
      const i = this.clients.findIndex((c) => c.id === this.current.id);
      if (i >= 0) this.clients[i] = this.current; else this.clients.push(this.current);
    }
    saveAll(this.clients);
    this.emit(reason);
  }
  /** Write a value at a dotted path, creating objects as needed. */
  set(path, value) {
    if (!this.current) return;
    const keys = path.split(".");
    let node = this.current;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] == null || typeof node[keys[i]] !== "object") node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
    this.persist("field:" + path);
  }
  get(path, fallback = "") {
    if (!this.current) return fallback;
    return path.split(".").reduce((n, k) => (n == null ? undefined : n[k]), this.current) ?? fallback;
  }
  addItem(listName, item) {
    if (!this.current) return;
    if (!Array.isArray(this.current[listName])) this.current[listName] = [];
    this.current[listName].push({ id: uid(), ...item });
    this.persist("add:" + listName);
  }
  updateItem(listName, id, patch) {
    if (!this.current) return;
    const arr = this.current[listName] || [];
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { arr[i] = { ...arr[i], ...patch }; this.persist("update:" + listName); }
  }
  removeItem(listName, id) {
    if (!this.current) return;
    this.current[listName] = (this.current[listName] || []).filter((x) => x.id !== id);
    this.persist("remove:" + listName);
  }

  exportJSON(id = null) {
    const c = id ? this.clients.find((x) => x.id === id) : this.current;
    return JSON.stringify({ kind: "financial-planning-client", version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(), client: c }, null, 2);
  }
  exportAllJSON() {
    return JSON.stringify({ kind: "financial-planning-vault", version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(), clients: this.clients }, null, 2);
  }
  importJSON(text) {
    const data = JSON.parse(text);
    const incoming = data.clients ? data.clients : data.client ? [data.client] : null;
    if (!incoming) throw new Error("Not a recognised export file.");
    let added = 0;
    for (const c of incoming) {
      const rec = migrate(c);
      rec.id = uid();
      this.clients.push(rec);
      added++;
    }
    if (added) { this.current = this.clients[this.clients.length - 1]; setActiveId(this.current.id); }
    this.persist("import");
    return added;
  }
}

/* Forward-compatible: fill in anything a newer blank record has that an older
   saved record does not, without touching values the user has entered. */
export function migrate(client) {
  const blank = blankClient();
  const merge = (a, b) => {
    if (Array.isArray(b)) return Array.isArray(a) ? a : b;
    if (b && typeof b === "object") {
      const out = { ...b };
      for (const k of Object.keys(b)) out[k] = merge(a?.[k], b[k]);
      for (const k of Object.keys(a || {})) if (!(k in out)) out[k] = a[k];
      return out;
    }
    return a === undefined ? b : a;
  };
  const merged = merge(client, blank);
  merged.id = client.id || uid();
  merged.version = SCHEMA_VERSION;
  return merged;
}

/* --------------------------------------------------------------- helpers */

export function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

/** Residential status determination under s.6, from recorded day counts. */
export function determineResidency(p) {
  const d = p.daysInIndia || {};
  const cy = Number(d.cy);
  if (!Number.isFinite(cy) || d.cy === "") return null;
  const prior4 = ["py1", "py2", "py3", "py4"].reduce((s, k) => s + (Number(d[k]) || 0), 0);
  const indianIncome = Number(p.indianIncomeForResidence) || 0;
  const isCitizenOrPio = p.citizenship === "indian" || p.citizenship === "pio";
  const trail = [];

  let resident = false, basis = "";
  if (cy >= 182) { resident = true; basis = "182 days or more in India this year."; }
  trail.push({ test: "In India 182 days or more", met: cy >= 182, detail: `${cy} days` });

  const secondTestApplies = !isCitizenOrPio || indianIncome > 1500000;
  const secondDayThreshold = !isCitizenOrPio ? 60 : 120;
  const secondMet = secondTestApplies && cy >= secondDayThreshold && prior4 >= 365;
  trail.push({
    test: isCitizenOrPio
      ? `Indian citizen or PIO with Indian income above ₹15 lakh: ${secondDayThreshold} days this year and 365 in the preceding four`
      : "60 days this year and 365 days in the preceding four",
    met: secondMet,
    detail: isCitizenOrPio && indianIncome <= 1500000
      ? `Not applicable — Indian income of ₹${indianIncome.toLocaleString("en-IN")} is within ₹15 lakh, so the relaxed 182-day test applies instead`
      : `${cy} days this year, ${prior4} days across the preceding four`,
  });
  if (secondMet && !resident) { resident = true; basis = trail[1].test; }

  const deemed = p.citizenship === "indian" && indianIncome > 1500000 && p.taxableElsewhere === false;
  trail.push({ test: "Deemed resident u/s 6(1A) — Indian citizen, Indian income above ₹15 lakh, not liable to tax anywhere else",
    met: deemed, detail: deemed ? "All three conditions met" : "Not met" });

  if (!resident && !deemed) {
    return { status: "nri", label: "Non-resident", trail,
      scope: "Only income received, accruing or deemed to accrue in India is taxable.",
      basis: "Neither test in s.6(1) is satisfied." };
  }

  const nrYears = Number(d.nrYearsOf10);
  const last7 = Number(d.last7y);
  const rnorByHistory = (Number.isFinite(nrYears) && nrYears >= 9) || (Number.isFinite(last7) && last7 <= 729);
  const rnorBy120 = isCitizenOrPio && indianIncome > 1500000 && cy >= 120 && cy < 182;
  const isRnor = deemed || rnorByHistory || rnorBy120;

  trail.push({ test: "Not-ordinarily-resident u/s 6(6)", met: isRnor,
    detail: deemed ? "A deemed resident is always RNOR"
      : rnorBy120 ? "Resident only by the 120-day high-income rule"
      : rnorByHistory ? `Non-resident in ${nrYears || "—"} of the last 10 years, or ${last7 || "—"} days in the last 7`
      : "Neither condition met — ordinarily resident" });

  return isRnor
    ? { status: "rnor", label: "Resident but not ordinarily resident", trail, basis,
        scope: "Indian income, plus foreign income from a business controlled in or a profession set up in India." }
    : { status: "resident", label: "Resident and ordinarily resident", trail, basis,
        scope: "Worldwide income is taxable in India." };
}
