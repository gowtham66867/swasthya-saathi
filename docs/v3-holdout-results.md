# First v3 holdout — partial run, 18 November 2026

User approved the frozen 16-case synthetic v3 holdout within ₹15, with results reviewed before deployment. The application/harness used source commit `182bf9e`, with a new tested local request-budget gate, and the unchanged hash-frozen `cases.v3` dataset. No prompts, labels or application behavior were tuned after seeing these outputs.

**Stopped at the first failed case, as specified in the approved run plan.** Four of 16 cases were attempted: three passed schema/evidence validation and exactly matched their expected fact categories; the fourth failed validation after one repair. The other twelve were not run or scored. This is not a complete holdout accuracy measurement.

| Case                | Result                          | Model calls | Observations                                                                                       |
| ------------------- | ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Decimal dose        | Pass after repair               | 2           | `bisoprolol 1.25 mg every morning` preserved; all four proposed value tokens matched the quote     |
| Doctor abbreviation | Pass                            | 1           | Complete `Dr. Sen…` quotation and asthma denial preserved                                          |
| Multiple decimals   | Pass after repair               | 2           | Complete sentence retained `0.5 mg` and `0.25 mg`                                                  |
| Time abbreviation   | Validation failure after repair | 2           | Source: `Mr. Das said the pain began at 7 a.m.`; rejected output was not accepted or exported      |
| Remaining 12 cases  | Not run                         | 0           | Stop-on-first-failure protocol; includes the non-English injection and translation-mismatch probes |

There were three matched expected facts, zero extra accepted facts and one missed expected fact among attempted cases. Only one case had gold structured values; it matched. These small counts must not be presented as general normalization, question-quality or clinical accuracy results.

## Cost and budget

Seven HTTP-200 Sarvam requests reported **10,282 input** and **5,138 output** tokens, including 4,211 reasoning tokens. At the checked [Sarvam pricing](https://docs.sarvam.ai/api/getting-started/pricing), the conservative estimate without cached-input discounts is **₹0.23127 before GST**. Returned usage includes 8,160 cached input tokens; applying the published cache rate yields approximately **₹0.15171 before GST**. Neither number is a measured account-balance debit.

A tested local request gate reserved ₹0.60 before every request, including retries: **₹4.20 reserved**, below the approved ₹15. It would refuse request 26 before sending it. Reservations use generous input/output allowances and tax/rounding headroom; they are a conservative request-control estimate, not a provider billing instrument. No voice, translation, other live suites, recharge or deployment was performed.

## What the failure tells us

Credentials, available credits and provider acceptance were functional: all seven requests returned HTTP 200. Two responses used the full 2,200-token output allowance and consumed about 2,100 reasoning tokens each. One was the initial decimal-dose response; the other was the failed case's repair. This suggests output-budget pressure, but the evaluator did not retain finish reasons, raw rejected outputs or detailed validation errors. It cannot establish whether the final rejection was malformed JSON, a sentence/value constraint or another schema issue. Do not label this a confirmed sentence-segmentation regression.

## Recommendation before deployment

Keep the current public v2.2 service unchanged. First improve synthetic-only failure diagnostics and investigate an independently authored development example of the same abbreviation pattern. Any further paid calls need a separately scoped approval. Preserve this report, including the failure; do not rerun it as a fresh holdout or tune against the twelve unattempted labels. A controlled continuation would need a separately labelled protocol/approval, while an independent new holdout would be needed for later generalization claims.

Artifacts: [raw first-run report](../evals/results/text-v3.json), [request/usage audit](../evals/results/text-v3-budget.json), [machine-readable summary](../evals/results/text-v3-summary.json). No new GitHub push or deployment occurred.
