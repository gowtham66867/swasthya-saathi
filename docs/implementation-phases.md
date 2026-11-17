# Intake v3 implementation record

No paid live evaluations or deployment performed during these phases. Historical live results remain historical; offline replay is fixture consistency only.

## Phase 1 — Source boundaries

Changed `sentence.js`, `agent.js`, `review-tools.js` and asset packaging. Shared offset-preserving Intl sentence segmentation guards decimals, common abbreviations, danda and hard newlines. Exact-unit membership replaces punctuation-based acceptance; complete labelled clarification answers remain valid.

Added nine boundary regressions in `tests/sentence.test.mjs`, including all three reported truncations, repeated sentences and punctuation-free answers. Checks: 74 tests passed; offline replay 30/30 fixtures valid; build passed. Intl behaviour was verified locally; real clinical text coverage remains unverified.

## Phase 2 — Deterministic multilingual review

Changed `rule-patterns.js`, `review-tools.js`, `server.mjs`, `app.js` and packaging. Rules v2 check original and English sources, instruction phrases anywhere in a sentence, reported advice, expanded family relations, and author-written Hindi/Tamil/Telugu/Kannada instruction/uncertainty/correction/family patterns. Reported doctor advice is flagged and retained, not deleted.

Added 36 pattern and false-positive tests in `tests/rules-v2.test.mjs`. Checks: 110 tests passed; offline replay 30/30 valid; build passed. Non-English patterns still need fluent-speaker review; rule coverage is not a security or clinical accuracy guarantee.
