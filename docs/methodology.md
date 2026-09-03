# Methodology

What each number means, how it is computed, and where the computation stops.

---

## 1. Conventions that change the answers

**Investment returns compound annually; loan rates do not.** A SIP growing at "12% a year" uses
a monthly rate of `1.12^(1/12) − 1 = 0.9489%`, so twelve months of it compounds to exactly 12%.
A lump sum growing at 12% in the same goal uses `(1.12)^n`. The two therefore agree.

An EMI, by contrast, uses `rate / 12`, because that is literally how an Indian lender computes
one: 8.5% means 0.7083% a month, which compounds to 8.84% a year. The two conventions differ on
purpose. Using the investment convention for loans would understate every EMI in the tool.

**Everything is annual unless a field says otherwise.** Income and deductions are annual;
expenses are monthly except the explicitly annual group; goal costs are in today's money and
inflated to the target year.

**Dates matter.** Asset values carry an `asOf` date. Statutory parameters carry the quarter or
Finance Act they came from.

---

## 2. Residential status — s.6

Determined from day counts, not asserted. The tool runs the tests in order and shows which one
decided the answer:

1. 182 days or more in India in the tax year → resident.
2. 60 days in the year and 365 across the preceding four → resident. For an Indian citizen or
   person of Indian origin this relaxes to 182 days, **unless** Indian income exceeds ₹15 lakh,
   in which case the threshold is 120 days.
3. Deemed resident under s.6(1A): an Indian citizen with Indian income above ₹15 lakh who is not
   liable to tax in any other country. Always classified RNOR.
4. A resident is *not ordinarily* resident if non-resident in 9 of the preceding 10 years, or in
   India for 729 days or fewer in the preceding 7, or resident only by the 120-day rule, or
   deemed resident.

Three consequences flow from the answer and are applied throughout:

| | Resident | RNOR | Non-resident |
|---|---|---|---|
| Scope | Worldwide | Indian income + foreign business controlled from India | Indian income only |
| s.87A rebate | Yes | Yes | **No** |
| Unused basic exemption set against capital gains | Yes | Yes | **No** |
| Higher senior-citizen exemption | Yes | Yes | **No** |
| 20%-with-indexation option on pre-July-2024 property | Yes | Yes | **No** |

---

## 3. The tax engine

Computed in this order, and the interface shows every step:

1. **Gross total income** by head. Salary is netted of the standard deduction (₹75,000 new,
   ₹50,000 old) and, in the old regime only, of the HRA exemption and professional tax.
2. **Chapter VI-A deductions**, restricted so they cannot reduce income taxed at special rates
   and cannot create a loss.
3. **Basic-exemption adjustment**, residents only. Where slab income falls below the exemption,
   the unused balance is set against capital gains — applied to the highest-taxed eligible bucket
   first, which is the arrangement most favourable to the taxpayer. VDA under s.115BBH is excluded.
4. **Tax**: slab rates on ordinary income, plus s.111A at 20%, s.112A at 12.5% above the
   ₹1,25,000 annual exemption, s.112 at 12.5%, and VDA at 30%.
5. **Rebate u/s 87A**, residents only, against slab-rate tax only, with marginal relief where
   total income marginally exceeds ₹12,00,000 in the new regime.
6. **Surcharge**, with the s.2 proviso capping the rate on the s.111A / s.112 / s.112A and
   dividend components at 15%, and the new regime capping overall surcharge at 25%.
7. **Marginal relief on surcharge**, computed against a reference tax at the threshold with the
   reduction taken off slab income first.
8. **Cess** at 4% on tax plus surcharge.

The dividend share of the 15% surcharge cap is attributed proportionally to its share of slab
income. This is the common practical approach; a top-slice attribution would sometimes give a
slightly different answer.

**Regime comparison** runs the whole computation twice and reports the difference, plus the
break-even: how much *additional* eligible deduction the old regime would need to match the new
one, found by bisection.

---

## 4. Net worth and liquidity

Assets carry a liquidity coefficient (cash 1.0, equity funds 0.9, real estate 0.05,
self-occupied home 0.0). "Liquid assets" is the value-weighted sum. Self-occupied property is
excluded from *investable* assets everywhere, because it cannot fund a goal without the household
moving out.

Emergency-fund cover counts assets explicitly marked as emergency money, defaulting to cash and
fixed deposits, divided by essential monthly outgo — living costs *plus* EMIs, since an EMI does
not pause when income does.

---

## 5. Goals

Each goal is inflated from today's cost to the target year at a rate that depends on its kind:
education 9%, medical 11%, lifestyle 7%, housing 7%, general 6%. Expected return defaults to the
horizon-appropriate blend rather than a single house number:

| Horizon | Equity ceiling | Why |
|---|---|---|
| Under 2 years | 0% | A drawdown in the final year cannot be waited out |
| 2 to 5 years | 30% | Debt core, modest equity sleeve |
| 5 to 10 years | 65% | Equity carries the load, debt cushions the last three years |
| Over 10 years | 80% | Volatility is a cost worth paying for the return |

Projected value = existing earmarked corpus compounded + SIP future value (with any annual
step-up). Required SIP inverts the same equation. A goal is *on track* at 100% funded, *close*
above 75%, *behind* above 40%, and *critical* below that.

---

## 5a. Goal allocation and fund categories

**Horizon binds; the profile modulates.** Target equity for a goal is
`min(profile equity, horizon ceiling) + priority tilt`, clamped to the ceiling. The ceiling is a
continuous curve, not steps, because a goal does not become differently investable the day it
crosses a band boundary:

| Horizon | Equity ceiling |
|---|---|
| ≤ 1 year | 0% |
| 1 – 3 years | 0 → 15% |
| 3 – 5 years | 15 → 30% |
| 5 – 10 years | 30 → 65% |
| 10 – 15 years | 65 → 80% |
| > 15 years | 80% |

**The priority tilt fades with horizon.** A goal marked *must happen* is tilted 8 points more
conservative, *would be nice* 4 points less so — but multiplied by `max(0, 1 − years/15)`. A car
needed in three years earns nearly the full tilt; a retirement twenty years out earns none of it,
because time to recover is itself a form of safety.

**Gold** is capped at 10% of the goal and at 18% of whatever is not equity, and is dropped entirely
inside three years, where its own volatility is the problem it was meant to solve.

**Category sleeves.** The equity share splits into core (large cap, flexi cap, broad index),
satellite (mid, small) and a diversifier (international), with satellite capacity the lesser of
what the horizon permits and what the profile permits. Small cap appears only beyond ten years.
ELSS replaces part of the core only where the old regime is in force *and* s.80C is genuinely
unfilled. The debt share is driven by horizon alone, from liquid inside a year through to corporate
bond, target maturity and gilt beyond ten.

**Consolidation.** Deployable money per year sets a scheme budget — two schemes below ₹60,000 a
year, rising to nine above ₹10 lakh. Merging happens strictly *within* an asset group, so
consolidation can never quietly undo the allocation. Where a whole group is too small to earn a
scheme, it is dropped explicitly, its weight handed to the nearest surviving group, and the change
reported. Below three slots with more than one group in play, the tool says so and routes to a
single hybrid scheme rather than emitting a mangled split.

**Categories, not schemes.** The framework is SEBI's circular of 26 February 2026, which removed
solution-oriented schemes, added Life Cycle Funds and Sectoral Debt Funds, and renamed the debt
duration categories. A category mandate is written by the regulator and changes rarely; a scheme's
manager, mandate drift, expense ratio and relative performance change constantly.

**Fund taxation** follows s.50AA as narrowed from FY 2025-26: only a fund holding more than 65% in
debt and money market is a specified mutual fund taxed wholly at slab. Gold and international ETFs
and funds of funds fell out of it — a listed gold ETF now reaches long term in twelve months, a
gold fund of funds in twenty-four. Hybrids holding 35–65% equity sit in their own band at
twenty-four months.

---

## 5b. Rebalancing

**Bands: the 5/25 rule.** A sleeve is out of tolerance at 5 percentage points absolute *or* 25% of
its own target weight — whichever is the tighter test for that sleeve. On a 57% equity target the
5-point rule binds; on a 7% gold sleeve the 25% rule binds at under 2 points. Floored at 1 point.

**Cadence: annual review, act only on a breach.** Calendar rebalancing on its own trades when
nothing has moved, and in a taxable Indian portfolio every one of those trades costs 12.5% or 20%
of the gain. Pure threshold rebalancing needs constant monitoring. The hybrid gets most of the
benefit at a fraction of the tax.

**The ladder is ordered by tax cost, not tidiness:**

1. Point new contributions at the underweight sleeve — no sale, no tax, no exit load.
2. Switch inside NPS and EPF — the one place a portfolio can be rebalanced with no tax
   consequence at all.
3. Sell down the overweight sleeve — last. The tool computes the actual cost: the embedded gain
   (estimated from the recorded unrealised gain against equity holdings), less the unused ₹1.25
   lakh s.112A exemption, taxed at 12.5%, with the 20% short-term figure shown alongside because
   the difference is usually larger than the drift being corrected.

**The emergency fund is excluded from all of this.** A reserve exists to be spent at the worst
possible moment; rebalancing it would defeat its only purpose.

**The portfolio target is goal-weighted**, blended across goals by the corpus each needs, rather
than a single house allocation for the profile. Where no goals are recorded it falls back to the
risk profile and says so.

---

## 6. Life cover

Computed two ways, and the recommendation is the **needs** figure:

- **Needs**: present value of 75% of household expenses for the support period, plus outstanding
  debt, plus the present value of goals that survive the earner — education, home, wedding —
  discounted at the debt return. Retirement is excluded: the deceased's own retirement need ends,
  and the survivors' living costs are already in the expense replacement. Liquid assets are
  netted off.
- **Human Life Value**: present value of income to retirement, net of 25% own consumption,
  discounted at the debt rate against wage growth.

HLV is shown as a cross-check only. It capitalises gross earning power and routinely lands 30-50%
above what the money actually has to do, which is why it is the figure insurers quote.

Support period is the longer of "youngest dependant reaches 25" and the earner's remaining
working life capped at 20 years.

---

## 7. Health cover

Indicative floors by city tier, from published Indian cover guidance: metro ₹15-50 lakh
individual, tier-2 ₹10-25 lakh, smaller towns ₹5-15 lakh, with a 1.5-1.75× multiplier for a
family floater. Employer cover is counted separately and never treated as a substitute, because
it ends with employment. A senior parent triggers a note recommending a separate senior policy
rather than inflating the floater — adding them re-prices the whole floater on the eldest
member's age, and one hospitalisation then exhausts the cover for everybody.

---

## 8. Risk profile

Eight questions across three dimensions: capacity (circumstances), willingness (attitude and past
behaviour), and knowledge. **The lower of capacity and willingness governs**, per SEBI's own
framing; knowledge caps the ceiling but cannot raise the floor. Where the two diverge by more
than a full point the tool says so explicitly and states which way, because the two divergences
call for opposite responses.

---

## 9. Health score

Weighted 0-100: protection 25, emergency buffer 20, savings rate 20, debt load 15, goal funding
15, estate and nomination 5. Each component is banded against the benchmark table in
`tax-rules.js`. The weights are a judgement, stated openly so they can be argued with.

---

## 10. What this does not model

Scheme selection within a category; expense ratios, tracking error and manager risk; the tax cost
of the glide path's own steps (flagged, not netted); sequence-of-returns risk on the glide path.
Clubbing of income; set-off and carry-forward across years; MAT/AMT; HUF and trust structures;
ESOP perquisite timing and the two-stage taxation of RSUs; foreign tax credit under Rule 128;
GST; stamp duty; the tax cost of rebalancing (flagged, not computed); sequence-of-returns risk in
retirement (a single deterministic path is shown, not a distribution); and any treaty position
beyond the headline withholding rate.

Every one of these is a place to bring in a professional rather than trust the tool.
