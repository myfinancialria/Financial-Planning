/* ============================================================================
   tax-rules.js — statutory parameters, India
   ----------------------------------------------------------------------------
   Every number here is a POLICY CONSTANT, kept separate from the calculation
   engines so that a Finance Act change is a data edit, not a code edit.

   Primary year: TAX YEAR 2026-27 (1 Apr 2026 – 31 Mar 2027).
   From 1 April 2026 the Income-tax Act, 2025 replaces the Income-tax Act, 1961
   and the "previous year / assessment year" pair collapses into a single
   "tax year". Rates and slabs were left unchanged by the Union Budget 2026.

   Section labels: the 1961 numbering is shown first because that is what
   clients, Form 16s and every existing document still use; the Income-tax
   Act, 2025 equivalent follows in `s2025` where the CBDT concordance is
   unambiguous. Verify uncommon provisions against the CBDT concordance
   utility before relying on a 2025-Act citation in client documentation.
   ========================================================================== */

export const CESS = { rate: 0.04, label: "Health & Education Cess", basis: "tax + surcharge" };

/* --- Slab structures ------------------------------------------------------ */
/* `upto: null` means "and above". Rates are fractions. */

const NEW_REGIME_SLABS = [
  { upto:  400000, rate: 0.00 },
  { upto:  800000, rate: 0.05 },
  { upto: 1200000, rate: 0.10 },
  { upto: 1600000, rate: 0.15 },
  { upto: 2000000, rate: 0.20 },
  { upto: 2400000, rate: 0.25 },
  { upto:    null, rate: 0.30 },
];

const OLD_REGIME_SLABS = {
  general: [ // below 60
    { upto:  250000, rate: 0.00 },
    { upto:  500000, rate: 0.05 },
    { upto: 1000000, rate: 0.20 },
    { upto:    null, rate: 0.30 },
  ],
  senior: [ // 60 to below 80 — resident only
    { upto:  300000, rate: 0.00 },
    { upto:  500000, rate: 0.05 },
    { upto: 1000000, rate: 0.20 },
    { upto:    null, rate: 0.30 },
  ],
  superSenior: [ // 80+ — resident only
    { upto:  500000, rate: 0.00 },
    { upto: 1000000, rate: 0.20 },
    { upto:    null, rate: 0.30 },
  ],
};

/* --- Surcharge ------------------------------------------------------------
   Thresholds apply to TOTAL INCOME. Surcharge attributable to income taxed
   under s.111A / s.112 / s.112A and to dividend is capped at 15%; the new
   regime caps overall surcharge at 25%. Marginal relief applies at every
   threshold. ------------------------------------------------------------- */
const SURCHARGE_BANDS = [
  { over:  5000000, rate: 0.10 },
  { over: 10000000, rate: 0.15 },
  { over: 20000000, rate: 0.25 },
  { over: 50000000, rate: 0.37 },
];
const SURCHARGE_CAP = { new: 0.25, old: 0.37 };
const SPECIAL_RATE_SURCHARGE_CAP = 0.15; // on 111A/112/112A/dividend components

/* --- Rebate (s.87A / IT Act 2025 s.156) ---------------------------------- */
/* RESIDENT individuals only. Not available to a non-resident.
   Not available against income charged at special rates (capital gains,
   VDA, lottery) — it applies to the slab-rate portion of the liability. */
const REBATE = {
  new: { maxTaxableIncome: 1200000, maxRebate: 60000, marginalRelief: true },
  old: { maxTaxableIncome:  500000, maxRebate: 12500, marginalRelief: false },
};

/* --- Standard deduction & salary reliefs ---------------------------------- */
const SALARY = {
  standardDeduction: { new: 75000, old: 50000 },  // s.16(ia) → 2025 s.19
  familyPensionDeduction: {                        // s.57(iia)
    new: { pct: 1/3, cap: 25000 },
    old: { pct: 1/3, cap: 15000 },
  },
  gratuityExemptCap: 2000000,                      // s.10(10), non-government
  leaveEncashmentExemptCap: 2500000,               // s.10(10AA), non-government
};

/* --- Capital gains -------------------------------------------------------- */
export const CAPITAL_GAINS = {
  equitySTT: {
    label: "Listed equity & equity-oriented MF (STT paid)",
    holdingMonths: 12,
    stcg: { rate: 0.20, section: "111A" },
    ltcg: { rate: 0.125, section: "112A", annualExemption: 125000, indexation: false },
    note: "The ₹1,25,000 exemption is a single annual allowance across all s.112A gains, not per transaction.",
  },
  listedBondsDebentures: {
    label: "Listed bonds / debentures / listed non-equity ETFs",
    holdingMonths: 12,
    stcg: { slab: true },
    ltcg: { rate: 0.125, section: "112", indexation: false },
  },
  unlistedShares: {
    label: "Unlisted shares",
    holdingMonths: 24,
    stcg: { slab: true },
    ltcg: { rate: 0.125, section: "112", indexation: false },
  },
  immovable: {
    label: "Land & building",
    holdingMonths: 24,
    stcg: { slab: true },
    ltcg: {
      rate: 0.125, section: "112", indexation: false,
      grandfather: {
        appliesTo: "resident individual / HUF only",
        condition: "asset acquired before 23 July 2024",
        alternative: { rate: 0.20, indexation: true },
        note: "Tax payable is the LOWER of 12.5% without indexation and 20% with indexation. " +
              "A non-resident does NOT get this choice — 12.5% without indexation applies.",
      },
    },
  },
  goldAndOther: {
    label: "Gold, jewellery, art, foreign shares, other capital assets",
    holdingMonths: 24,
    stcg: { slab: true },
    ltcg: { rate: 0.125, section: "112", indexation: false },
  },
  specifiedMF: {
    label: "Specified mutual funds (>65% debt) bought on/after 1 Apr 2023",
    holdingMonths: null,
    stcg: { slab: true },
    ltcg: { slab: true },
    note: "Deemed short-term irrespective of holding period — always taxed at slab rates.",
  },
  debtPre2023: {
    label: "Debt MF units purchased before 1 Apr 2023",
    holdingMonths: 24,
    stcg: { slab: true },
    ltcg: { rate: 0.125, section: "112", indexation: false },
  },
  vda: {
    label: "Virtual digital assets (crypto, NFTs)",
    holdingMonths: null,
    flat: {
      rate: 0.30, section: "115BBH",
      noDeductions: "Only cost of acquisition is deductible. No expenses, no indexation.",
      noSetOff: "Losses cannot be set off against any income, and cannot be carried forward.",
      tds: { rate: 0.01, section: "194S" },
    },
  },
};

/* --- Chapter VI-A deductions (1961) = Chapter VIII, ss.122-154 (2025) ------
   `regime: "old"` means the deduction is unavailable under the new regime. */
export const DEDUCTIONS = [
  { id:"80C",       s1961:"80C",        s2025:"123", regime:"old",  cap:150000,
    label:"Life insurance premium, ELSS, EPF, PPF, principal on home loan, tuition fees, SSY, NSC, 5-yr tax-saver FD",
    shared:["80C","80CCC","80CCD1"],
    note:"80C, 80CCC and 80CCD(1) share one combined ceiling of ₹1,50,000 (s.80CCE)." },

  { id:"80CCD1B",   s1961:"80CCD(1B)",  s2025:"124", regime:"old",  cap:50000,
    label:"Additional NPS Tier-I contribution, over and above the ₹1.5 lakh ceiling" },

  { id:"80CCD2",    s1961:"80CCD(2)",   s2025:"124", regime:"both", cap:null,
    pctOfSalary:{ new:0.14, oldPrivate:0.10, oldGovt:0.14 },
    label:"Employer's contribution to NPS Tier-I",
    note:"The single most valuable deduction that SURVIVES the new regime. Capped at 14% of " +
         "(basic + DA) under the new regime; 10% for private-sector employees under the old regime." },

  { id:"80D",       s1961:"80D",        s2025:"126", regime:"old",  cap:null,
    subCaps:{ selfFamily:25000, selfFamilySenior:50000, parents:25000, parentsSenior:50000,
              preventiveCheckup:5000, veryOldUninsuredMedical:50000 },
    label:"Health insurance premium — self/spouse/children, plus a separate limit for parents",
    note:"Preventive health check-up of ₹5,000 sits INSIDE the applicable limit, it is not additional. " +
         "Premium must be paid other than in cash (cash is allowed only for the check-up)." },

  { id:"80DD",      s1961:"80DD",       s2025:"127", regime:"old",
    tiers:{ disability:75000, severeDisability:125000 },
    label:"Maintenance and medical treatment of a dependant with disability (flat deduction, not actuals)" },

  { id:"80DDB",     s1961:"80DDB",      s2025:"128", regime:"old",
    tiers:{ normal:40000, senior:100000 },
    label:"Treatment of specified diseases for self or dependant (needs a prescription in Form 10-I)" },

  { id:"80E",       s1961:"80E",        s2025:"129", regime:"old",  cap:null,
    label:"Interest on an education loan — no monetary ceiling, allowed for 8 assessment years from first repayment",
    note:"Principal is not deductible. Loan must be from a bank or notified financial institution." },

  { id:"80EEB",     s1961:"80EEB",      s2025:"132", regime:"old",  cap:150000,
    label:"Interest on a loan for an electric vehicle (loan sanctioned 1 Apr 2019 – 31 Mar 2023)" },

  { id:"80G",       s1961:"80G",        s2025:"133", regime:"old",  cap:null,
    label:"Donations to approved funds and institutions — 100% or 50%, some subject to a 10%-of-adjusted-GTI ceiling",
    note:"Cash donations above ₹2,000 are not deductible. Donee's 80G registration number is mandatory in the return." },

  { id:"80GG",      s1961:"80GG",       s2025:"—",   regime:"old",  cap:60000,
    label:"Rent paid where no HRA is received — least of ₹5,000/month, 25% of total income, or rent minus 10% of total income" },

  { id:"80TTA_TTB", s1961:"80TTA / 80TTB", s2025:"153", regime:"old",
    tiers:{ nonSenior:10000, senior:50000 },
    label:"Interest income — ₹10,000 on savings-account interest, or ₹50,000 on all deposit interest for a resident senior citizen",
    note:"Merged into a single section 153 under the Income-tax Act, 2025." },

  { id:"80U",       s1961:"80U",        s2025:"154", regime:"old",
    tiers:{ disability:75000, severeDisability:125000 },
    label:"Self-disability certified by a medical authority (flat deduction)" },

  { id:"24B_SOP",   s1961:"24(b)",      s2025:"22",  regime:"old",  cap:200000,
    label:"Interest on a home loan for a self-occupied property",
    note:"NOT available under the new regime for a self-occupied house. Interest on a LET-OUT " +
         "property remains deductible in full under both regimes — but under the new regime the " +
         "resulting house-property loss cannot be set off against salary or other heads at all." },

  { id:"HRA",       s1961:"10(13A)",    s2025:"Sch. II", regime:"old", cap:null,
    label:"House Rent Allowance — least of actual HRA, rent minus 10% of salary, or 50%/40% of salary (metro/non-metro)" },
];

/* --- Small savings and administered rates (Q2 FY 2026-27, Jul–Sep 2026) ---- */
export const SMALL_SAVINGS = {
  asOf: "2026-07-01",
  reviewedQuarterly: true,
  schemes: [
    { id:"ppf",   name:"Public Provident Fund",        rate:7.1,  lockIn:"15 years", tax:"EEE",
      maxPa:150000, nri:false, nriNote:"An NRI cannot open a PPF account. An account opened while resident continues to maturity but cannot be extended." },
    { id:"ssy",   name:"Sukanya Samriddhi Yojana",     rate:8.2,  lockIn:"21 years / marriage after 18", tax:"EEE",
      maxPa:150000, nri:false, nriNote:"Must be closed if the girl child becomes a non-resident or non-citizen." },
    { id:"scss",  name:"Senior Citizen Savings Scheme",rate:8.2,  lockIn:"5 years", tax:"Interest taxable",
      maxPa:3000000, nri:false, nriNote:"NRIs are not eligible." },
    { id:"nsc",   name:"National Savings Certificate", rate:7.7,  lockIn:"5 years", tax:"Interest taxable, reinvested interest qualifies u/s 80C",
      nri:false },
    { id:"kvp",   name:"Kisan Vikas Patra",            rate:7.5,  lockIn:"115 months (doubles)", tax:"Interest taxable", nri:false },
    { id:"pomis", name:"Post Office Monthly Income Scheme", rate:7.4, lockIn:"5 years", tax:"Interest taxable", nri:false },
    { id:"td5",   name:"Post Office Time Deposit — 5 yr", rate:7.5, lockIn:"5 years", tax:"Interest taxable; 80C on 5-yr", nri:false },
    { id:"epf",   name:"Employees' Provident Fund",    rate:8.25, lockIn:"Retirement / 5 yr for tax-free withdrawal", tax:"EEE within limits",
      nri:true, nriNote:"An existing EPF balance can be retained; it stops earning interest 36 months after contributions cease." },
  ],
  epfTaxableThreshold: {
    employee: 250000,
    employeeNoEmployerContribution: 500000,
    note: "Interest on an employee's own EPF/VPF contribution above ₹2,50,000 in a year is taxable (₹5,00,000 where the employer does not contribute).",
  },
  employerRetiralCap: {
    amount: 750000,
    note: "Aggregate employer contribution to EPF + NPS + superannuation above ₹7,50,000 a year is a taxable perquisite, as is the accretion on the excess.",
  },
};

/* --- NRI-specific parameters ---------------------------------------------- */
export const NRI = {
  residence: {
    basicDays: 182,
    alternativeStayDays: 60,
    alternativePrecedingFourYearDays: 365,
    visitingIndianCitizenRelaxedDays: 182,      // s.6(1) Explanation 1(b)
    highIncomeVisitorDays: 120,                  // applies when Indian income > ₹15,00,000
    highIncomeThreshold: 1500000,
    deemedResident: {
      section: "6(1A)",
      test: "Indian citizen, Indian-source income above ₹15,00,000, and not liable to tax in any other country by reason of domicile/residence.",
      status: "Deemed resident — always classified RNOR.",
    },
    rnor: {
      section: "6(6)",
      tests: [
        "Non-resident in 9 or more of the 10 tax years preceding the relevant year, OR",
        "In India for 729 days or less in the 7 tax years preceding the relevant year, OR",
        "Resident only by virtue of the 120-day high-income rule, OR",
        "A deemed resident under s.6(1A).",
      ],
      effect: "Foreign income is outside the Indian net unless it is derived from a business controlled from, or a profession set up in, India.",
    },
  },
  scope: {
    resident:  "Worldwide income.",
    rnor:      "Indian income, plus foreign income from a business controlled in or a profession set up in India.",
    nonResident:"Income received in India, accruing in India, or deemed to accrue or arise in India — nothing else.",
  },
  noRebate87A: "Section 87A rebate is available to a RESIDENT individual only. A non-resident pays tax from the first rupee above the basic exemption.",
  noBasicExemptionAdjustment:
    "A resident may set an unexhausted basic exemption limit against long-term or short-term capital gains. A non-resident cannot — the proviso to s.111A/112/112A denies it.",
  accounts: [
    { id:"nre", name:"NRE — Non-Resident External", currency:"INR",
      source:"Foreign earnings only", repatriable:"Fully, principal and interest",
      taxIndia:"Interest fully exempt u/s 10(4)(ii) while the holder is a non-resident",
      joint:"With another NRI, or with a resident close relative on a former-or-survivor basis" },
    { id:"nro", name:"NRO — Non-Resident Ordinary", currency:"INR",
      source:"Indian income — rent, dividend, pension, sale proceeds",
      repatriable:"Up to USD 1,000,000 per financial year, with Forms 15CA/15CB",
      taxIndia:"Interest fully taxable; TDS at 30% plus surcharge and cess, reducible under a DTAA",
      joint:"With a resident Indian" },
    { id:"fcnr", name:"FCNR(B) — Foreign Currency Non-Resident (Bank)", currency:"Foreign currency",
      source:"Foreign earnings", repatriable:"Fully",
      taxIndia:"Interest exempt while the holder is a non-resident; no rupee exchange risk",
      joint:"Term deposit only, 1 to 5 years" },
  ],
  tds: [
    { head:"NRO interest",              rate:0.30,  section:"195", note:"Plus surcharge and 4% cess. DTAA usually reduces this to 10–15% with a TRC and Form 10F." },
    { head:"NRE / FCNR interest",       rate:0.00,  section:"10(4)(ii)", note:"Exempt while the holder is a non-resident." },
    { head:"Rent on Indian property",   rate:0.30,  section:"195", note:"The tenant must hold a TAN and file Form 27Q. This is not the resident 194-I regime." },
    { head:"Dividend from Indian company", rate:0.20, section:"195/196D", note:"Most treaties cap this at 10–15%." },
    { head:"LTCG — listed equity (112A)", rate:0.125, section:"195", note:"Above the ₹1.25 lakh annual exemption." },
    { head:"STCG — listed equity (111A)", rate:0.20,  section:"195" },
    { head:"LTCG — immovable property", rate:0.125, section:"195",
      note:"Deducted on the FULL sale consideration, not on the gain, unless a lower-deduction certificate u/s 197 is obtained. This is the single biggest cash-flow trap in an NRI property sale." },
    { head:"STCG — immovable property", rate:0.30,  section:"195", note:"Deducted on the full consideration absent a s.197 certificate." },
  ],
  section197: {
    label:"Lower / nil deduction certificate",
    why:"Without it, TDS on a property sale is computed on the entire sale value. On a ₹2 crore sale with a ₹30 lakh gain, that is roughly ₹25 lakh withheld against a ₹3.75 lakh liability — refundable only after the return is filed and processed.",
    how:"Apply online in Form 13 on TRACES before executing the sale deed. Allow six to eight weeks.",
  },
  section115H: {
    label:"Continuation of concessional treatment (Chapter XII-A)",
    what:"An NRI who becomes resident may elect, by declaration with the return, to keep the Chapter XII-A concessional regime on income from specified foreign-exchange assets until those assets are transferred or converted.",
  },
  prohibited: [
    "PPF — cannot be opened; an existing account runs to maturity but cannot be extended",
    "Sukanya Samriddhi Yojana — must be closed on change of status",
    "Senior Citizen Savings Scheme, NSC, KVP, Post Office monthly income and time deposits",
    "Agricultural land, plantation property and farmhouses — cannot be purchased (may be inherited)",
    "Currency derivatives and commodity derivatives on Indian exchanges",
  ],
  permitted: [
    "Direct equity and ETFs under the Portfolio Investment Scheme, through one designated NRE or NRO account with one bank",
    "Mutual funds — most AMCs accept NRIs; a few restrict US and Canada residents because of FATCA reporting cost",
    "NRE, NRO and FCNR deposits, and corporate fixed deposits on a non-repatriable basis",
    "Government securities, T-bills and listed corporate bonds",
    "Residential and commercial real estate",
    "National Pension System — Tier I, for Indian citizens aged 18 to 70",
    "Life and health insurance from Indian insurers",
    "GIFT City IFSC funds and deposits, treated as offshore for many purposes",
  ],
  fema: {
    lrsInboundNote:"The Liberalised Remittance Scheme governs a RESIDENT sending money out (USD 250,000 a year). It does not apply to an NRI bringing money in.",
    repatriationCap:"USD 1,000,000 per financial year out of NRO balances, including sale proceeds of immovable property, on production of Forms 15CA and 15CB.",
    propertySaleRule:"Sale proceeds of no more than two residential properties may be repatriated through the NRE route; anything beyond that runs through the NRO USD 1 million window.",
    statusChange:"On becoming a non-resident, resident savings accounts must be redesignated as NRO. Continuing to hold a resident account is a FEMA contravention.",
  },
  dtaa: {
    what:"A Double Taxation Avoidance Agreement lets an NRI claim either exemption or a foreign tax credit on the same income.",
    docs:["Tax Residency Certificate from the country of residence","Form 10F filed electronically on the Indian portal","A no-permanent-establishment declaration where the treaty requires it"],
    note:"Section 90(2) allows the taxpayer to apply whichever of the treaty and the Act is more beneficial, provision by provision.",
  },
};

/* --- Insurance and estate parameters -------------------------------------- */
export const INSURANCE_RULES = {
  s10_10D: {
    death:"A death benefit is exempt without limit, in every case.",
    nonUlipAfter2023:"For a non-ULIP policy issued on or after 1 April 2023, maturity proceeds are exempt only if aggregate annual premium across all such policies stays within ₹5,00,000.",
    ulipAfter2021:"For a ULIP issued on or after 1 February 2021, maturity proceeds are exempt only if aggregate annual premium across all such ULIPs stays within ₹2,50,000.",
    premiumToSumAssured:"Exemption also requires premium not to exceed 10% of the sum assured (20% for policies issued before 1 April 2012).",
    taxationIfBreached:"Proceeds outside the exemption are taxed as capital gains for ULIPs, and under Income from Other Sources for non-ULIP policies.",
  },
  healthCoverGuide: {
    metro:      { individual:[1500000, 5000000], floaterMultiplier:1.75 },
    tier2:      { individual:[1000000, 2500000], floaterMultiplier:1.75 },
    smallTown:  { individual:[ 500000, 1500000], floaterMultiplier:1.5  },
  },
  mwpAct:{
    label:"Married Women's Property Act, 1874 — section 6",
    what:"A life policy taken under the MWP Act creates a statutory trust for the wife and children. The proceeds sit outside the policyholder's estate and are beyond the reach of creditors.",
    when:"Elect it at the time of purchase — it cannot be added later. Particularly relevant for business owners and personally-guaranteed borrowers.",
  },
  nriBuying:"An NRI may buy Indian life and health insurance. Premiums may be paid from NRE, NRO or FCNR balances; a claim paid from an NRE-funded policy is fully repatriable, while an NRO-funded policy is not.",
};

export const ESTATE_RULES = {
  nomineeVsHeir:{
    principle:"A nominee is a trustee, not an owner.",
    detail:"Except for shares and debentures under s.72 of the Companies Act, 2013, a nominee merely receives the asset and holds it for the legal heirs determined by succession law or by a will. Sarbati Devi v. Union of India settled this for insurance. Nomination without a will resolves custody, not title.",
  },
  succession:[
    { law:"Hindu Succession Act, 1956", applies:"Hindus, Buddhists, Jains, Sikhs",
      intestate:"Class I heirs — widow, children and mother — take equally. Daughters have been coparceners in ancestral property since the 2005 amendment." },
    { law:"Indian Succession Act, 1925", applies:"Christians, Parsis, and anyone married under the Special Marriage Act",
      intestate:"Spouse takes one third and lineal descendants two thirds, where descendants exist." },
    { law:"Muslim personal law", applies:"Muslims",
      intestate:"Fixed Quranic shares. Only one third of the estate may be bequeathed by will without the consent of heirs." },
  ],
  will:{
    validity:"A will need not be registered, stamped, or written by a lawyer. It needs a sound-mind testator, signature, and attestation by two witnesses who are not beneficiaries.",
    registration:"Registration is optional but makes a challenge harder and gives a public record of the date.",
    probate:"Probate is mandatory for wills made in the ordinary civil jurisdictions of Mumbai, Kolkata and Chennai, and for immovable property situated there.",
    noEstateDuty:"India has levied no estate or inheritance duty since 1985. Inherited assets are not taxed on receipt — but the heir inherits the original cost and holding period for future capital gains.",
  },
  nriEstate:{
    situs:"Indian assets are governed by Indian law regardless of the owner's residence. Immovable property always follows the law of the place where it is situated.",
    twoWills:"A separate Indian will covering only Indian assets usually settles faster than one global will, because the Indian court need not construe foreign law. State clearly in each that it does not revoke the other.",
    foreignDuty:"Several countries — the United States, the United Kingdom and others — levy estate or inheritance tax on worldwide assets of their domiciliaries. India has no reciprocal credit for it. This is the single largest planning gap for an NRI with Indian property.",
  },
};

/* --- SEBI Investment Adviser framework ------------------------------------ */
export const SEBI_RIA = {
  regulation:"SEBI (Investment Advisers) Regulations, 2013, as amended to 25 November 2025",
  feeModes:[
    { mode:"Fixed fee", cap:"₹1,51,000 per annum per family of clients, across all services",
      note:"Reviewed by the IAASB every three years against the Cost Inflation Index." },
    { mode:"Assets under advice", cap:"2.5% of AUA per annum per family of clients, across all services",
      note:"Extends to assets held under a pre-existing distribution arrangement where the client seeks a second opinion." },
  ],
  advanceFee:"Advance fees may be collected for at most two quarters, and only with the client's consent.",
  obligations:[
    "Act in a fiduciary capacity and disclose every conflict of interest",
    "Complete risk profiling and record the client's consent to the profile before advising",
    "Ensure documented suitability — advice must not contradict the recorded profile",
    "Maintain client-level segregation between advisory and distribution activity, at family level",
    "Keep records of every interaction and rationale for five years",
    "Execute a written Investment Advisory Agreement before the first advice",
    "No custody of, or discretion over, client assets or funds",
    "Annual compliance audit within six months of the financial year end",
  ],
  riskProfileDimensions:[
    "Capacity to absorb loss — income stability, net worth, dependants, horizon",
    "Willingness to accept volatility — attitude, behaviour in past drawdowns",
    "Knowledge and experience of the products being recommended",
    "The lower of capacity and willingness governs. Evidence is required; a superficial questionnaire will not survive an inspection.",
  ],
};

/* --- Benchmarks used by the health scorer --------------------------------- */
export const BENCHMARKS = {
  savingsRate:        { good:0.30, ok:0.20, poor:0.10, dir:"higher" },
  expenseToIncome:    { good:0.50, ok:0.60, poor:0.75, dir:"lower"  },
  emiToIncome:        { good:0.20, ok:0.30, poor:0.40, dir:"lower"  },
  emergencyMonths:    { good:6,    ok:3,    poor:1,    dir:"higher" },
  lifeCoverToIncome:  { good:10,   ok:7,    poor:5,    dir:"higher" },
  solvency:           { good:0.50, ok:0.30, poor:0.15, dir:"higher" }, // net worth / total assets
  liquidity:          { good:0.15, ok:0.08, poor:0.04, dir:"higher" },
  debtToAssets:       { good:0.30, ok:0.50, poor:0.70, dir:"lower"  },
};

/* Equity allocation guide — a starting point, adjusted by risk profile
   and by the horizon of each goal. Not a recommendation. */
export const ALLOCATION_GUIDE = {
  byRisk: {
    conservative: { equity:0.25, debt:0.60, gold:0.10, cash:0.05 },
    moderate:     { equity:0.50, debt:0.35, gold:0.10, cash:0.05 },
    balanced:     { equity:0.60, debt:0.28, gold:0.08, cash:0.04 },
    growth:       { equity:0.72, debt:0.18, gold:0.07, cash:0.03 },
    aggressive:   { equity:0.82, debt:0.10, gold:0.05, cash:0.03 },
  },
  byHorizon: [
    { maxYears:2,  equity:0.00, note:"Under two years, capital protection dominates. Liquid or arbitrage funds, not equity." },
    { maxYears:5,  equity:0.30, note:"Two to five years. A meaningful debt core with a modest equity sleeve." },
    { maxYears:10, equity:0.65, note:"Five to ten years. Equity can carry the load, with debt cushioning the last three years." },
    { maxYears:99, equity:0.80, note:"Beyond ten years, equity's volatility is a cost worth paying for its return." },
  ],
};

/* --- Default assumptions the adviser can override ------------------------- */
export const ASSUMPTIONS = {
  inflationGeneral: 6.0,
  inflationEducation: 9.0,
  inflationMedical: 11.0,
  inflationLifestyle: 7.0,
  returnEquity: 12.0,
  returnDebt: 7.0,
  returnGold: 8.0,
  returnCash: 4.0,
  returnRealEstate: 7.0,
  postRetirementReturn: 7.5,
  salaryGrowth: 8.0,
  lifeExpectancy: 85,
  retirementAge: 60,
  safeWithdrawalRate: 3.5,
};

/* --- The 1961 → 2025 concordance shown in the UI -------------------------- */
export const ACT_CONCORDANCE = {
  effective:"1 April 2026",
  headline:"The Income-tax Act, 2025 replaces the Income-tax Act, 1961 from tax year 2026-27. 536 sections in 23 chapters replace 800-plus. The rules are substantially carried over; the numbering is not.",
  caveat:"Returns for FY 2025-26, filed in 2026, still run on the 1961 Act. The 2025 numbering first appears in returns filed in 2027. Verify uncommon provisions against the CBDT concordance utility before citing them to a client.",
  map:[
    ["Exempt incomes",                  "10 (various)",   "Schedule II"],
    ["Salary, perquisites, standard deduction","15, 16, 17","19"],
    ["House property, home-loan interest","22 to 24",     "20 to 22"],
    ["New tax regime",                  "115BAC",         "202"],
    ["Chapter VI-A deductions",         "80C to 80U",     "Chapter VIII, 122 to 154"],
    ["Investments, insurance, PF, tuition","80C",          "123"],
    ["NPS",                             "80CCD",          "124"],
    ["Health insurance",                "80D",            "126"],
    ["Dependant with disability",       "80DD",           "127"],
    ["Specified diseases",              "80DDB",          "128"],
    ["Education-loan interest",         "80E",            "129"],
    ["Additional housing interest",     "80EE / 80EEA",   "130 / 131"],
    ["Electric-vehicle loan interest",  "80EEB",          "132"],
    ["Donations",                       "80G",            "133"],
    ["Interest on deposits (merged)",   "80TTA / 80TTB",  "153"],
    ["Disability — self",               "80U",            "154"],
    ["Rebate for resident individuals", "87A",            "156"],
    ["Tax audit",                       "44AB",           "63"],
    ["TDS on salary",                   "192",            "392"],
    ["All other TDS",                   "193 to 196D",    "393"],
    ["TCS",                             "206C",           "394"],
    ["Form 15G / 15H",                  "—",              "Form 121"],
    ["Form 16",                         "—",              "Form 130"],
  ],
};

export const TAX_YEAR = {
  id:"2026-27",
  label:"Tax Year 2026-27",
  span:"1 April 2026 to 31 March 2027",
  act:"Income-tax Act, 2025",
  legacyLabel:"AY 2027-28 under the old nomenclature",
  budgetNote:"The Union Budget 2026 left slabs, rebate and capital-gains rates unchanged.",
};

export const REGIME_DATA = {
  new: { slabs: NEW_REGIME_SLABS, rebate: REBATE.new, stdDeduction: SALARY.standardDeduction.new,
         surchargeCap: SURCHARGE_CAP.new, isDefault: true,
         label:"New regime (default)", section:"115BAC / 2025 s.202" },
  old: { slabsByAge: OLD_REGIME_SLABS, rebate: REBATE.old, stdDeduction: SALARY.standardDeduction.old,
         surchargeCap: SURCHARGE_CAP.old, isDefault: false,
         label:"Old regime (opt-in)", section:"—",
         optOutNote:"A salaried taxpayer chooses each year. A taxpayer with business income who opts out of the new regime may return to it only once." },
};

export { NEW_REGIME_SLABS, OLD_REGIME_SLABS, SURCHARGE_BANDS, SURCHARGE_CAP,
         SPECIAL_RATE_SURCHARGE_CAP, REBATE, SALARY };
