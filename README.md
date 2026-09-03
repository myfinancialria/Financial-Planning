# Financial Planning

A complete financial-planning workbench for India — residents and non-residents — built for a
SEBI-registered investment adviser to work through with a client.

**→ [Open the tool](https://myfinancialria.github.io/Financial-Planning/)**

It runs entirely in the browser. No server, no account, no network call: a client's whole
financial picture stays on the device it was typed into, and the only way it leaves is the
export button. That constraint is deliberate — a page that collects income, PAN, assets,
liabilities, insurance and estate details has no business sending them anywhere.

---

## What it does

**A full fact-find.** Personal and residency details, all five heads of income, expenses,
assets, liabilities, goals, insurance, will and nomination, and deductions claimed. Around 180
fields, each one feeding the analysis rather than sitting in a form.

**A tax engine for Tax Year 2026-27**, under the Income-tax Act, 2025. Both regimes computed
side by side, every step shown and traceable: slab tax, special-rate capital gains, the s.87A
rebate with marginal relief, surcharge with the 15% cap on capital-gain and dividend components,
surcharge marginal relief, cess. It answers the question that actually matters — *how much more
deduction would the old regime need to win?* — by bisection rather than by guesswork.

**Residents and non-residents, handled as genuinely different cases.** Residential status is
determined from day counts under s.6 and shown test by test. The differences then propagate
everywhere: no s.87A rebate for a non-resident, no unused basic exemption set against capital
gains, no senior-citizen slab, no 20%-with-indexation option on pre-July-2024 property, NRE and
FCNR interest exempt while NRO interest bears 30% at source, and the s.197 lower-deduction
certificate flagged before any Indian property sale rather than after.

**Goal-by-goal allocation, in SEBI fund categories.** Each goal gets its own equity/debt/gold mix,
because a car needed in three years and a retirement twenty years out are not the same problem.
Horizon sets the ceiling and the risk profile decides where under it to sit — an aggressive
investor still cannot load equity into an eighteen-month goal, and a conservative one still needs
equity over twenty-five years. The mix is then broken into **categories** under SEBI's 26 February
2026 framework, with the rupee amount per category, the tax treatment of each, and a glide path
that steps equity down as the date approaches. It recommends categories, never scheme names:
a category mandate is regulated and durable, a scheme is a judgement that goes stale in a quarter.
It also refuses to over-diversify — below a certain contribution it says so and routes to a single
hybrid scheme rather than emitting four ₹500 SIPs.

**Rebalancing, with the tax cost attached.** 5/25 bands — five points absolute or 25% of the
sleeve's own weight, whichever is tighter. Annual review, act only on a breach, because in India
every rebalancing sale is a taxable event with no relief on the way back in. The action ladder is
ordered by tax cost, not tidiness: redirect new contributions first, then switch inside NPS and
EPF where it is free, and sell last — with the actual rupee tax computed against the unused
₹1.25 lakh s.112A exemption.

**Analysis, not just arithmetic.** Findings ranked by severity, each stating a fact about the
client's own position and *why it matters*. A ranked tax playbook that prices every lever at the
client's own marginal rate and states the catch. A dated action plan. Goal funding, life and
health cover gaps computed two ways, prepay-versus-invest on every loan, and a retirement page
that reconciles what the client *asked for* against what their spending actually *implies* —
because those two numbers usually disagree.

**The SEBI layer.** Risk profiling on the capacity/willingness/knowledge split, with the lower of
capacity and willingness governing. A suitability check. A compliance checklist against the
Investment Advisers Regulations as amended to November 2025, including the fee caps. A printable
client report.

**Charts that work in black and white.** Every series is separated by tone *and* hatch pattern,
never by hue, so nothing is lost in a greyscale print or to a colour-blind reader. All SVG, all
hand-written, no charting library.

---

## Running it

Nothing to build and nothing to install — it is static files and ES modules.

```bash
git clone https://github.com/myfinancialria/Financial-Planning.git
cd Financial-Planning
python3 -m http.server 8787
```

Then open `http://localhost:8787`. Click **Load a worked example** to see it with a full file in
place. (Opening `index.html` directly off the filesystem will not work — ES modules need an
HTTP origin.)

### Tests

```bash
node test/tax.test.mjs         # 37 assertions, hand-computed
node test/finance.test.mjs     # 21 assertions
node test/allocation.test.mjs  # 43 assertions — mixes, glide paths, bands, rebalancing
node test/model.test.mjs       # end-to-end, resident and NRI
```

The tax tests are worth reading before trusting the engine: each case states the expected figure
and the arithmetic behind it, so a wrong answer is visible rather than plausible. The allocation
suite checks properties rather than fixed numbers — that 135 combinations of horizon, profile and
priority all sum to exactly one and never breach the ceiling, that consolidation never silently
merges across asset groups, and that a glide path only ever de-risks.

---

## How it is put together

```
assets/js/
  rules/tax-rules.js     Statutory parameters, isolated so a Finance Act change is a data edit
  rules/fund-categories.js  SEBI scheme categories and their taxation, Feb 2026 framework
  calc/tax.js            The tax engine — both regimes, all heads, special rates, surcharge
  calc/finance.js        Time value of money, EMI and amortisation, retirement mathematics
  calc/plan.js           Net worth, ratios, goals, cover needs, drift, health score
  calc/allocation.js     Goal mixes, category sleeves, glide paths, rebalancing plan
  calc/ria.js            Findings, tax playbook, action plan, risk profiling, compliance
  model.js               Where a client record becomes a computed picture — one integration point
  charts.js              SVG charts: donut, bars, stacked, waterfall, line, slab step, gauge, timeline
  store.js               Data model, localStorage, import/export, residency determination
  ui/                    Form primitives and the views
```

Every view reads from what `model.js` returns; nothing recomputes locally, so there is one place
a number can come from and one place it can be wrong.

Typing into a field writes straight to the store without re-rendering, so the caret never jumps.
Only structural changes — adding a row, switching regime, changing residency — trigger a redraw.

### Changing the statutory parameters

Slabs, rebates, surcharge bands, deduction ceilings, capital-gains rates, small-savings rates,
NRI rules and the SEBI fee caps are all data in `assets/js/rules/tax-rules.js`, each with the
date or Finance Act it came from. Fund categories, their mandates and their taxation live in
`assets/js/rules/fund-categories.js`, tied to the SEBI circular they come from. Editing those two
files is how you move the tool to a new tax year or a new categorisation framework.
`assets/js/calc/` reads those constants and should not need to change.

---

## What it deliberately does not do

It holds no assets, places no orders, and has no execution capability. It recommends asset
allocations and SEBI fund *categories* — never a scheme, an AMC, or a product. It measures a
position against the client's own stated goals, their recorded profile, and the statutory limits,
and leaves the judgement where the regulations put it.

It also does not model: clubbing provisions, cross-year set-off and carry-forward, MAT/AMT, HUF
and trust structures, ESOP perquisite timing, foreign tax credit under Rule 128, or treaty
positions beyond the headline withholding rate. Those belong with a chartered accountant, and
`docs/methodology.md` says so at each point.

---

## Read next

- [`docs/methodology.md`](docs/methodology.md) — what every number means and how it is computed
- [`DISCLAIMER.md`](DISCLAIMER.md) — regulatory position, data handling, and the limits

---

## Licence

MIT. Not investment advice — see [`DISCLAIMER.md`](DISCLAIMER.md).
