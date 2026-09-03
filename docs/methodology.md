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

Clubbing of income; set-off and carry-forward across years; MAT/AMT; HUF and trust structures;
ESOP perquisite timing and the two-stage taxation of RSUs; foreign tax credit under Rule 128;
GST; stamp duty; the tax cost of rebalancing (flagged, not computed); sequence-of-returns risk in
retirement (a single deterministic path is shown, not a distribution); and any treaty position
beyond the headline withholding rate.

Every one of these is a place to bring in a professional rather than trust the tool.
