# Disclaimer

**This tool is not investment advice, and it does not become investment advice by being used.**

It organises information a client supplies, performs arithmetic on it, and measures the result
against that client's own stated goals, their recorded risk profile, and the statutory position
as at the tax year shown in the interface. Nothing in it constitutes a recommendation to buy,
sell, hold, or switch any security, insurance policy, or financial product.

## Regulatory position

Personalised investment advice in India may be given only by an investment adviser registered
with the Securities and Exchange Board of India under the SEBI (Investment Advisers)
Regulations, 2013, or by a person exempt under those regulations.

If you are a registered investment adviser using this tool with a client:

- The advice remains yours. The tool computes; it does not advise.
- Regulation 17 requires documented suitability. The tool surfaces the inputs to that
  judgement; the judgement, and the record of it, are yours.
- Regulation 19 requires records of every interaction and the rationale for advice, kept for
  five years. This tool keeps nothing on any server and therefore keeps no such record for you.
- Fee caps under Regulation 15A are shown in the interface for reference only. Compliance with
  them is your responsibility.

If you are an individual using this tool on your own affairs, you are using a calculator. Take
tax positions to a qualified chartered accountant and product decisions to a registered adviser.

## Tax computations

Tax figures are indicative. They are computed for the tax year stated in the interface under
the Income-tax Act, 2025, and they do not replace a return prepared by a qualified professional.
Statutory rates, thresholds and section numbers change; the parameters used are collected in
`assets/js/rules/tax-rules.js` with the date they were verified. Verify them against the current
Finance Act, CBDT notifications, and the CBDT section-concordance utility before relying on any
number in client documentation.

Several areas are deliberately simplified and should not be relied on without professional
review: clubbing provisions, set-off and carry-forward across years, minimum alternate tax,
trusts and HUF-specific provisions, ESOP perquisite timing, foreign tax credit computation
under Rule 128, and any treaty position beyond the headline rate.

## Projections

Every projection rests on assumptions about inflation and return that are visible and editable
in the interface. They are assumptions, not forecasts. Actual outcomes will differ, and the
difference compounds over the horizons this tool works with. A projection is a way of comparing
choices, not a promise about the future.

## Data

The application runs entirely in the browser. There is no server, no account, and no network
call. Data is held in that browser's `localStorage` and leaves the device only when you use the
export button. Consequences worth understanding:

- Clearing site data, using a private window, or switching browser or device loses the file.
  Export regularly.
- `localStorage` is not encrypted. Anyone with access to the unlocked device can read it.
- The published GitHub Pages copy is served over HTTPS as static files. It transmits nothing.
- Client data is personal data. If you hold it as an adviser, the Digital Personal Data
  Protection Act, 2023 applies to you regardless of where the file sits.

## Warranty

Provided under the MIT Licence, without warranty of any kind. See `LICENSE`.
