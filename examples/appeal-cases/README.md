# Appeal case test pack

These files are prepared for manually exercising Recourse's case intake, evidence extraction, provenance, contradiction detection, readiness analysis, appeal drafting, and assisted-submission handoff.

## Suggested test order

For each case:

1. Create a new case using the institution and decision type below.
2. Upload the `01_decision_notice.txt` file as the adverse decision.
3. Upload the remaining files as supporting evidence.
4. Wait for processing and inspect extracted claims, source locations, contradictions, and missing requirements.
5. Generate an appeal only after the case is marked ready or the product explains why it is not ready.
6. Review every factual sentence and attachment before approving an assisted/manual handoff.

## Case index

| Case | Institution | Decision | Main test |
|---|---|---|---|
| 1 | Amazon Marketplace | Seller suspension and payout hold | Authenticity evidence, invoice chain, dates, business impact |
| 2 | Uber | Driver account deactivation | Identity/account-sharing allegation, verification evidence, contradiction handling |
| 3 | YouTube | Monetization suspension | Originality/licensing evidence, content chronology, missing-item detection |
| 4 | Stripe | Payout restriction | Screenshot extraction, dashboard notice, business fulfillment evidence |

All dates use 2026.

## Case 4 screenshot note

For the Stripe case, upload `dashboard_restriction_screenshot.png` as image evidence. The visible banner, case reference, date, balance, and review reason are designed to be extracted as evidence.
