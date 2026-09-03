/* ============================================================================
   rules/fund-categories.js — SEBI mutual fund scheme categories
   ----------------------------------------------------------------------------
   Framework: SEBI circular "Categorization and Rationalization of Mutual Fund
   Schemes" dated 26 February 2026, which replaces the October 2017 framework.
   Existing schemes had six months to comply; thematic schemes have up to three
   years to align portfolios.

   What changed, and why this file exists rather than a list of scheme names:
     · Solution-oriented schemes (Children's, Retirement) were REMOVED. They
       duplicated ordinary equity and hybrid portfolios while carrying a lock-in.
     · Life Cycle Funds were ADDED — a single scheme with a built-in glide path,
       5 to 30 years in five-year steps, equity starting at 65-95% and tapering.
     · Sectoral Debt Funds were ADDED — minimum 80% in one sector, AA+ and above.
     · Debt categories were renamed: Low Duration became "Ultra Short to Short
       Term", and Short/Medium/Long Duration became "Short/Medium/Long Term".
       The Macaulay duration bands themselves are unchanged.
     · Value and Contra may now co-exist at one AMC, capped at 50% overlap.
     · Scheme names must match the category, and may not contain return-focused
       words.

   This tool recommends CATEGORIES, never schemes. Category mandates are
   regulated and stable; scheme selection is the adviser's judgement, is made
   on the adviser's own record, and goes stale within a quarter.
   ========================================================================== */

export const CATEGORY_FRAMEWORK = {
  circular: "SEBI circular on Categorization and Rationalization of Mutual Fund Schemes",
  dated: "26 February 2026",
  supersedes: "SEBI/HO/IMD/DF3/CIR/P/2017/114 dated 6 October 2017",
  complianceWindow: "Six months for most schemes; up to three years for thematic portfolios.",
  whyCategoriesNotSchemes:
    "A category's mandate is written by the regulator and changes rarely. A scheme's manager, " +
    "mandate drift, expense ratio and relative performance change constantly. Recommending a " +
    "category is durable advice; recommending a scheme is a judgement that has to be made fresh, " +
    "documented, and reviewed — which is the adviser's job, not a static tool's.",
};

/* Taxation, as it stands for tax year 2026-27.
   Section 50AA was narrowed with effect from FY 2025-26: only a fund holding
   MORE than 65% in debt and money-market instruments (or a fund of funds
   holding 65%+ in such funds) is a "specified mutual fund" taxed wholly at
   slab rates. Gold ETFs, international ETFs and gold/international funds of
   funds fell OUT of s.50AA and now follow ordinary capital-gains rules. */
export const FUND_TAX = {
  equityOriented: {
    id: "equityOriented",
    label: "Equity-oriented — 65% or more in Indian equity",
    longTermAfterMonths: 12,
    ltcg: "12.5% on gains above the ₹1,25,000 annual s.112A exemption",
    stcg: "20% under s.111A",
  },
  hybridMid: {
    id: "hybridMid",
    label: "Hybrid holding 35% to 65% equity",
    longTermAfterMonths: 24,
    ltcg: "12.5% under s.112, no indexation",
    stcg: "Slab rates",
    note: "The awkward middle band — neither equity nor a specified fund. Twenty-four months to long term.",
  },
  specifiedDebt: {
    id: "specifiedDebt",
    label: "Specified mutual fund — more than 65% in debt and money market",
    longTermAfterMonths: null,
    ltcg: "Slab rates, whatever the holding period",
    stcg: "Slab rates",
    note: "s.50AA. There is no long-term treatment at all. At a 31.2% marginal rate a debt fund " +
          "returning 7% keeps 4.8% — which is the arithmetic that makes EPF, PPF and NPS worth using first.",
  },
  listedNonEquity: {
    id: "listedNonEquity",
    label: "Listed non-equity — gold and international ETFs",
    longTermAfterMonths: 12,
    ltcg: "12.5% under s.112, no indexation",
    stcg: "Slab rates",
    note: "Out of s.50AA from FY 2025-26. A listed gold ETF now reaches long term in twelve months.",
  },
  unlistedNonEquity: {
    id: "unlistedNonEquity",
    label: "Unlisted non-equity — gold and international funds of funds",
    longTermAfterMonths: 24,
    ltcg: "12.5% under s.112, no indexation",
    stcg: "Slab rates",
    note: "A fund of funds needs twenty-four months where the equivalent ETF needs twelve. " +
          "Worth knowing before choosing the wrapper.",
  },
};

/* ---------------------------------------------------------------------------
   The categories this tool will actually recommend. Not the complete SEBI list
   — sectoral, thematic, credit risk and other categories exist and are noted
   below as deliberately excluded, with the reason.
   --------------------------------------------------------------------------- */

export const CATEGORIES = {

  /* ---- Equity ---------------------------------------------------------- */
  largeCap: {
    id: "largeCap", name: "Large Cap Fund", group: "equity", role: "core",
    mandate: "At least 80% in the top 100 companies by full market capitalisation.",
    risk: 4, minHorizonYears: 5,
    tax: "equityOriented",
    why: "The most predictable part of an equity allocation. Shallower drawdowns and faster " +
         "recovery than the rest of the market, which is what makes it usable as a core.",
  },
  flexiCap: {
    id: "flexiCap", name: "Flexi Cap Fund", group: "equity", role: "core",
    mandate: "At least 65% in equity, with no constraint on where across market capitalisations.",
    risk: 4, minHorizonYears: 5,
    tax: "equityOriented",
    why: "Hands the size decision to the manager instead of fixing it in the allocation. " +
         "Useful as a core where the adviser would rather not run that decision themselves.",
  },
  indexFund: {
    id: "indexFund", name: "Index Fund or ETF — broad market", group: "equity", role: "core",
    mandate: "Passive replication of a broad index; tracking error and tracking difference disclosed.",
    risk: 4, minHorizonYears: 5,
    tax: "equityOriented",
    why: "The cost floor. Where a core sleeve has no view to express, the cheapest way to hold " +
         "the market is usually the right way — the expense saved is certain, the alpha is not.",
  },
  largeAndMidCap: {
    id: "largeAndMidCap", name: "Large & Mid Cap Fund", group: "equity", role: "core",
    mandate: "At least 35% in large cap and at least 35% in mid cap.",
    risk: 4, minHorizonYears: 7,
    tax: "equityOriented",
    why: "One scheme carrying a fixed large-mid split, for portfolios small enough that separate " +
         "sleeves would be unnecessary clutter.",
  },
  midCap: {
    id: "midCap", name: "Mid Cap Fund", group: "equity", role: "satellite",
    mandate: "At least 65% in companies ranked 101st to 250th by market capitalisation.",
    risk: 5, minHorizonYears: 7,
    tax: "equityOriented",
    why: "Higher long-run return has historically come with drawdowns well beyond the large-cap " +
         "index and recovery periods measured in years, not months. It needs a horizon that can wait.",
  },
  smallCap: {
    id: "smallCap", name: "Small Cap Fund", group: "equity", role: "satellite",
    mandate: "At least 65% in companies ranked 251st and below by market capitalisation.",
    risk: 5, minHorizonYears: 10,
    tax: "equityOriented",
    why: "The most volatile equity sleeve and the least liquid. Sized small, held long, and " +
         "never used for a goal with a fixed date inside a decade.",
  },
  international: {
    id: "international", name: "International Fund or ETF", group: "equity", role: "diversifier",
    mandate: "Invests in overseas securities, directly or through a feeder or fund of funds.",
    risk: 4, minHorizonYears: 7,
    tax: "listedNonEquity",
    taxAlt: "unlistedNonEquity",
    why: "The only genuine diversifier against a domestic-only portfolio: different currency, " +
         "different cycle, different set of companies. The rupee's long-run depreciation has " +
         "historically added to returns rather than subtracted.",
    caution: "The RBI's overseas investment limits for mutual funds are periodically exhausted, at " +
             "which point schemes stop accepting fresh subscriptions. Check before relying on a SIP. " +
             "A listed ETF reaches long term in twelve months; a fund of funds needs twenty-four.",
  },
  elss: {
    id: "elss", name: "ELSS Tax Saver Fund", group: "equity", role: "core",
    mandate: "At least 80% in equity, with a three-year lock-in on every instalment.",
    risk: 4, minHorizonYears: 5,
    tax: "equityOriented",
    why: "Only worth using where the old regime is in force and the s.80C ceiling is genuinely " +
         "unfilled. Under the new regime it buys no deduction, and it is then simply a flexi-cap " +
         "fund carrying a pointless lock-in.",
  },

  /* ---- Hybrid ---------------------------------------------------------- */
  aggressiveHybrid: {
    id: "aggressiveHybrid", name: "Aggressive Hybrid Fund", group: "hybrid", role: "core",
    mandate: "65% to 80% equity, 20% to 35% debt.",
    risk: 3, minHorizonYears: 5,
    tax: "equityOriented",
    why: "Stays equity-oriented for tax while carrying a permanent debt cushion, and rebalances " +
         "internally without the investor realising a gain. For a single-scheme portfolio it does " +
         "more work than any other category.",
  },
  balancedAdvantage: {
    id: "balancedAdvantage", name: "Dynamic Asset Allocation / Balanced Advantage", group: "hybrid", role: "core",
    mandate: "Equity and debt managed dynamically between 0% and 100%.",
    risk: 3, minHorizonYears: 4,
    tax: "equityOriented",
    why: "Hands the allocation decision to a model. Equity taxation is usually preserved through " +
         "arbitrage. The trade-off is that the model, not the plan, then sets the risk.",
  },
  equitySavings: {
    id: "equitySavings", name: "Equity Savings Fund", group: "hybrid", role: "core",
    mandate: "At least 65% in equity and arbitrage combined, at least 10% in debt.",
    risk: 2, minHorizonYears: 3,
    tax: "equityOriented",
    why: "Roughly a third net equity, the rest hedged or in debt — but taxed as equity. For a " +
         "three-to-five-year goal it is usually more tax-efficient than a debt fund at the same risk.",
  },
  conservativeHybrid: {
    id: "conservativeHybrid", name: "Conservative Hybrid Fund", group: "hybrid", role: "core",
    mandate: "10% to 25% equity, 75% to 90% debt.",
    risk: 2, minHorizonYears: 3,
    tax: "hybridMid",
    why: "A small equity sleeve on a debt base. Note the tax: below 65% equity it needs twenty-four " +
         "months to reach long term.",
  },
  multiAsset: {
    id: "multiAsset", name: "Multi Asset Allocation Fund", group: "hybrid", role: "core",
    mandate: "At least 10% in each of at least three asset classes.",
    risk: 3, minHorizonYears: 5,
    tax: "varies",
    why: "Equity, debt and gold in one scheme, rebalanced internally with no tax event for the " +
         "investor. Taxation depends on the equity share the particular scheme actually runs — check it.",
  },
  arbitrage: {
    id: "arbitrage", name: "Arbitrage Fund", group: "hybrid", role: "parking",
    mandate: "At least 65% in equity arbitrage — simultaneous cash and futures positions.",
    risk: 1, minHorizonYears: 0.25,
    tax: "equityOriented",
    why: "Debt-like return, equity taxation. For a taxpayer at 30% parking money for three months " +
         "or more, it usually beats a liquid fund after tax. Returns depend on the futures spread " +
         "and thin out when market activity does.",
  },

  /* ---- Debt ------------------------------------------------------------ */
  overnight: {
    id: "overnight", name: "Overnight Fund", group: "debt", role: "parking",
    mandate: "Securities maturing in one day.", risk: 1, minHorizonYears: 0,
    tax: "specifiedDebt",
    why: "Effectively no credit or duration risk. For money needed within days.",
  },
  liquid: {
    id: "liquid", name: "Liquid Fund", group: "debt", role: "parking",
    mandate: "Securities maturing within 91 days.", risk: 1, minHorizonYears: 0,
    tax: "specifiedDebt",
    why: "The standard home for an emergency fund and for money with a date inside a year. " +
         "Instant-redemption facilities are capped per day; treat the cap, not the balance, as " +
         "the money available today.",
  },
  ultraShortToShort: {
    id: "ultraShortToShort", name: "Ultra Short to Short Term Fund", group: "debt", role: "core",
    mandate: "Macaulay duration between six and twelve months.",
    risk: 1, minHorizonYears: 0.75, tax: "specifiedDebt",
    why: "Renamed from Low Duration Fund by the February 2026 circular. Slightly more yield than " +
         "liquid for money that can sit for a year.",
  },
  shortTerm: {
    id: "shortTerm", name: "Short Term Fund", group: "debt", role: "core",
    mandate: "Macaulay duration between one and three years.",
    risk: 2, minHorizonYears: 2, tax: "specifiedDebt",
    why: "Renamed from Short Duration Fund. The workhorse of a two-to-four-year debt sleeve — " +
         "enough duration to earn the accrual, not enough to be hurt badly by a rate move.",
  },
  corporateBond: {
    id: "corporateBond", name: "Corporate Bond Fund", group: "debt", role: "core",
    mandate: "At least 80% in the highest-rated corporate bonds, AA+ and above.",
    risk: 2, minHorizonYears: 3, tax: "specifiedDebt",
    why: "A spread over government paper without reaching into weak credit. The rating floor is " +
         "the whole point of the category — a fund reaching for yield below it is in the wrong box.",
  },
  bankingPsu: {
    id: "bankingPsu", name: "Banking & PSU Fund", group: "debt", role: "core",
    mandate: "At least 80% in debt of banks, public sector undertakings and public financial institutions.",
    risk: 2, minHorizonYears: 3, tax: "specifiedDebt",
    why: "Quasi-sovereign credit with a modest spread. Where the debt sleeve exists to be boring, " +
         "this is the boring option.",
  },
  gilt: {
    id: "gilt", name: "Gilt Fund", group: "debt", role: "satellite",
    mandate: "At least 80% in government securities across maturities.",
    risk: 3, minHorizonYears: 5, tax: "specifiedDebt",
    why: "No credit risk at all, and full exposure to interest rates. A long gilt fund can fall " +
         "several per cent in a quarter when yields rise — safety from default is not safety from price.",
  },
  targetMaturity: {
    id: "targetMaturity", name: "Target Maturity Index Fund or ETF", group: "debt", role: "core",
    mandate: "Passive portfolio of government, state or PSU paper maturing around a stated date.",
    risk: 2, minHorizonYears: 3, tax: "specifiedDebt",
    why: "Held to its maturity date, the return is close to the yield at purchase. The one debt " +
         "structure that lets a dated goal be matched to a dated instrument.",
  },
  dynamicTerm: {
    id: "dynamicTerm", name: "Dynamic Term Fund", group: "debt", role: "satellite",
    mandate: "Duration managed actively across the curve.",
    risk: 3, minHorizonYears: 4, tax: "specifiedDebt",
    why: "Renamed from Dynamic Bond Fund. The duration call is the manager's; the outcome depends " +
         "entirely on whether they get rates right.",
  },

  /* ---- Commodity ------------------------------------------------------- */
  goldEtf: {
    id: "goldEtf", name: "Gold ETF", group: "gold", role: "diversifier",
    mandate: "Tracks domestic gold prices; units held in a demat account.",
    risk: 3, minHorizonYears: 5, tax: "listedNonEquity",
    why: "Gold earns nothing and its case is entirely diversification — it has historically held " +
         "or gained value in the quarters when equity fell hardest, and in rupee terms it also " +
         "carries the currency. Held to 5-10% it lowers portfolio volatility more than it costs in return.",
  },
  goldFof: {
    id: "goldFof", name: "Gold Fund of Funds", group: "gold", role: "diversifier",
    mandate: "Feeds a gold ETF; bought like any mutual fund, no demat account needed.",
    risk: 3, minHorizonYears: 5, tax: "unlistedNonEquity",
    why: "The route for an investor without a demat account, and the only gold route that accepts " +
         "a SIP. It needs twenty-four months to reach long term where the ETF needs twelve.",
  },
  sgb: {
    id: "sgb", name: "Sovereign Gold Bond", group: "gold", role: "diversifier",
    mandate: "Government security denominated in grams of gold, 2.5% annual interest, eight-year tenor.",
    risk: 3, minHorizonYears: 8, tax: "special",
    why: "Pays 2.5% a year on top of the gold price, and capital gains on redemption at maturity " +
         "are exempt for an individual — the only gold route with that treatment.",
    caution: "Fresh tranches have not been issued since 2024. Secondary-market purchases trade at " +
             "a premium or discount to intrinsic value, and the maturity exemption applies to " +
             "redemption with the RBI, not to a sale on the exchange.",
  },

  /* ---- Life cycle ------------------------------------------------------ */
  lifeCycle: {
    id: "lifeCycle", name: "Life Cycle Fund", group: "hybrid", role: "core",
    mandate: "Target-date scheme with a built-in glide path. Durations of 5 to 30 years in " +
             "five-year steps; equity starts between 65% and 95% and tapers as the date approaches.",
    risk: 3, minHorizonYears: 5, tax: "varies",
    why: "New in the February 2026 framework. It automates the taper this page recommends doing " +
         "manually, and rebalances inside the scheme with no tax event for the investor.",
    caution: "Exit load of 3% in year one, 2% in year two and 1% in year three. Each AMC may run " +
             "at most six. The glide path is the fund's, not the client's — check it matches the " +
             "goal before treating them as equivalent.",
  },
};

/* Deliberately not recommended by this tool, with the reason stated. */
export const EXCLUDED_CATEGORIES = [
  { name: "Sectoral and Thematic Funds",
    why: "A concentrated bet on one sector, requiring both an entry and an exit call. Under the " +
         "February 2026 framework they also carry a 50% portfolio-overlap cap against the AMC's " +
         "other equity schemes. They are a view, not an allocation, and this tool builds allocations." },
  { name: "Sectoral Debt Funds",
    why: "New in February 2026 — at least 80% in one sector's bonds, AA+ and above. Sector " +
         "concentration in the sleeve whose entire job is not to surprise anyone." },
  { name: "Credit Risk Funds",
    why: "At least 65% in AA and below. The 2018-2020 defaults showed the risk is not the yield " +
         "giving way gradually but redemption gating entirely. Not an appropriate holding for a " +
         "dated goal." },
  { name: "Focused and Dividend Yield Funds",
    why: "Legitimate categories, but they express a manager's style rather than an asset-class " +
         "weight. They belong in a portfolio because the adviser chose that style deliberately, " +
         "not because an allocation model emitted them." },
  { name: "Solution-Oriented Schemes",
    why: "Removed by the February 2026 circular. Children's and Retirement funds duplicated " +
         "ordinary equity and hybrid portfolios while adding a lock-in. Existing schemes stop " +
         "taking new money and will be merged; current investors need do nothing immediately." },
];

export const taxFor = (cat) => FUND_TAX[cat.tax] || null;
