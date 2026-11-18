# Clock-time validation fix: development results

18 November 2026. User approved separate development investigation and testing within a fresh INR 15 allowance, with results reviewed before deployment. The original v3 holdout and its partial failure report were not rerun or relabelled.

## Diagnosis

Three new development stories containing times/titles were sent through the unchanged v3 harness. All three failed after one repair (six provider calls). The retained synthetic response traces showed exact-copy corruption: `6 a.m.` became `6 a.0.` or `6 a.00a.m.`, and one proposed `1.5 mg` quote became `1.0 mg`. Another response exhausted 2,200 tokens in repeated whitespace. The local sentence splitter preserved these source times; the failures occurred in provider-generated JSON quote strings. The historical `7 a.m.` rejected payload was not retained, so these traces establish the development failure family, not its exact historical payload.

## Fix

The v3.1 harness supplies a catalog of complete source sentences with application-owned IDs. Its dynamic strict provider schema asks for evidence IDs instead of generated quote/source text. `resolveReferences` retrieves the exact source quotation in application code; unknown IDs and extra quote fields fail validation. The public fact/handoff shape stays unchanged, and proposed values still undergo exact token, full-number, unit and negation checks. A generated dose cannot overwrite the source words.

The shared splitter also handles a time abbreviation followed by an explicit correction as two units while preserving introductory time phrases. Metadata now retains finish reasons, JSON/reference status and content-free validation categories. Runtime diagnostics contain no patient words. Synthetic evaluation traces remain explicitly labelled development data.

The application-owned plan, three-call ceiling, one repair, consent/access gates, translation confirmation, mandatory review and ephemeral patient content remain in place. No extra runtime dependency was added.

## Live results

| Measurement                                        | Result                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| Old v3 baseline on three new cases                 | 0/3 completed validation; six calls                                   |
| v3.1 verification on six development cases         | 6/6 completed validation; all required quotations and fields retained |
| Repeat checks on the first three development cases | 3/3 completed validation                                              |
| Fixed-build requests                               | 10 for nine runs; one repair for duplicate facts                      |
| Optional values rejected safely                    | 7 removal flags across nine fixed runs                                |
| Model-question fallback                            | 2 occurrences across nine fixed runs                                  |

Scenarios: title plus morning onset, evening onset, reported medicine plus decimal/time, two decimal doses/times, an explicit morning/evening correction, and a timed symptom denial. Optional value rejection included unknown medicine-name guesses; these were dropped rather than accepted. Classification completeness, value usefulness and question relevance still need clinician adjudication. These development/repeat counts are not a fresh holdout score or clinical accuracy estimate.

## Combined budget and verification

Both baseline and fixed testing used the same approval: **16 requests total**, **INR 9.60 conservatively reserved**, **19,674 input** and **4,452 output** tokens. Estimated cost is **INR 0.30804 before GST without cache discounts**, or approximately **INR 0.140496** using returned cached-input usage. Pricing: [Sarvam published rates](https://docs.sarvam.ai/api/getting-started/pricing). These are usage estimates, not an observed account-balance debit. No further paid suites were run.

Checks: 161 unit/integration tests, 46 offline fixture validations, build and formatting. Mock regressions cover times/decimals/titles, exact source-ID resolution, missing/unknown references, forbidden provider quote fields, bounded repairs, fallback questions and content-free diagnostics. The frozen holdout hash is unchanged.

No deployment or public-visibility changes were made. Submission remains pending the organizer's link, registered team details and approval to update the public demo if desired.

Artifacts: [baseline traces](../evals/results/time-development-baseline.json), [fixed traces and budget](../evals/results/time-development-fixed.json), [development cases](../evals/time-development.json).
