# Intake v3 implementation record

No paid live evaluations or deployment performed during these phases. Historical live results remain historical; offline replay is fixture consistency only.

## Phase 1 — Source boundaries

Changed `sentence.js`, `agent.js`, `review-tools.js` and asset packaging. Shared offset-preserving Intl sentence segmentation guards decimals, common abbreviations, danda and hard newlines. Exact-unit membership replaces punctuation-based acceptance; complete labelled clarification answers remain valid.

Added nine boundary regressions in `tests/sentence.test.mjs`, including all three reported truncations, repeated sentences and punctuation-free answers. Checks: 74 tests passed; offline replay 30/30 fixtures valid; build passed. Intl behaviour was verified locally; real clinical text coverage remains unverified.
