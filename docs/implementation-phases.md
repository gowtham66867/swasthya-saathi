# Intake v3 implementation record

No paid live evaluations or deployment performed during these phases. Historical live results remain historical; offline replay is fixture consistency only.

## Phase 1 — Source boundaries

Changed `sentence.js`, `agent.js`, `review-tools.js` and asset packaging. Shared offset-preserving Intl sentence segmentation guards decimals, common abbreviations, danda and hard newlines. Exact-unit membership replaces punctuation-based acceptance; complete labelled clarification answers remain valid.

Added nine boundary regressions in `tests/sentence.test.mjs`, including all three reported truncations, repeated sentences and punctuation-free answers. Checks: 74 tests passed; offline replay 30/30 fixtures valid; build passed. Intl behaviour was verified locally; real clinical text coverage remains unverified.

## Phase 2 — Deterministic multilingual review

Changed `rule-patterns.js`, `review-tools.js`, `server.mjs`, `app.js` and packaging. Rules v2 check original and English sources, instruction phrases anywhere in a sentence, reported advice, expanded family relations, and author-written Hindi/Tamil/Telugu/Kannada instruction/uncertainty/correction/family patterns. Reported doctor advice is flagged and retained, not deleted.

Added 36 pattern and false-positive tests in `tests/rules-v2.test.mjs`. Checks: 110 tests passed; offline replay 30/30 valid; build passed. Non-English patterns still need fluent-speaker review; rule coverage is not a security or clinical accuracy guarantee.

## Pre-v3 historical failure investigation (before prompt changes)

In `text-live.json`, `timing-conflict` returned no ambiguities. Holdout `nausea-correction` returned the two conflicting sentences as one combined ambiguity quote, which the old validator accepted but the exact-span grader did not match to either expected sentence. Holdout ambiguity quote recall was therefore 0. The shared Phase 1 boundary check now rejects combined evidence.

Negation exact matching changed from 13/14 to 12/14 between the frozen v2 run and v2.2 regression. `itching-denial` and `itch-evening` lost the allergies category while keeping the denial under symptoms; `ear-allergy-unknown` gained the allergies category. Net loss: one category match. The grader counts any quote with “not” as negation, including uncertainty (“not sure”), so it is an imperfect semantic metric. Both runs used the same v2 prompt but different runtime anchoring; no controlled repeated experiment establishes anchoring as the cause. Historical outputs support category instability, not a claim of lost denial wording. No prompt changes were made for this investigation.

## Phase 3 — Proposed structured values

Changed `values.js`, `agent.js` (intake-v3), `harness.mjs`, new `prompts/intake-v3.mjs`, review rendering/export in `app.js`, packaging and API version assertions. Optional field-specific values require exact bounded quote tokens, complete decimal numbers, and explicit denial wording for negation. Unsupported values are removed while retaining the quote and recording a review flag. Editable proposed hints remain alongside their quote; operator value edits export separately.

Added nine value tests covering decimal doses, wrong units, unsupported names, uncertainty, negation and export provenance. Checks: 119 tests passed; offline 30/30 valid; build passed. Strict provider acceptance of the extended schema and live extraction quality are unverified (no paid calls).

## Phase 4 — Translation confirmation

Changed `translation-checks.js`, `agent.js`, `server.mjs`, `app.js`, `index.html`, architecture and packaging. Added back-translation direction, readback, explicit patient confirmation, `translation_confirmed` state and exact-content confirmation records. Source edits invalidate confirmation; exports reject stale/missing confirmation. Manual fallback also requires confirmed source text. Selected number/unit/negation mismatches remain visible review flags.

Added five translation/state/API/export tests, and supplied confirmation records in existing export tests. Checks: 124 tests passed; offline 30/30 valid; build passed. No live back-translation or TTS was called. Confirmation is self-attested; the server asserts stage/confirmation without persisting patient state. Pattern scope and actual patient comprehension require human review.

## Phase 5 — Bounded model follow-ups

Changed `questions.js`, schema/prompt/harness, review rules, UI and packaging. Extraction requests at most three targeted questions in the same model call. Evidence, target fields, shape, length and wording are checked; invalid/empty proposals fall back to fixed templates without a repair call. English stays visible to the operator. Accepted questions translate through the existing route (at most three explicit localization calls); unavailable localization is labelled and its audio control disabled.

Added eight question tests for same-call proposals, unsafe wording, evidence, count and fallback. Checks: 132 tests passed; offline 30/30 valid; build passed. Live provider schema acceptance, generated question usefulness and translation quality remain unverified.

## Phase 6 — Frozen holdout and recorded-audio path

Added a hash-frozen 16-case `cases.v3` holdout and free replay/opt-in first-run evaluator, an audio-manifest loader, a non-TTS human-speech runner and shared CER metrics. Added consent/path/size limits and ignored private recordings. Existing paid evaluators now write new filenames, preserving historical evidence. `docs/live-run-plan.md` contains commands and official-price estimates; the pre-prompt failure investigation appears above.

Added two tests for frozen integrity/schema and audio consent/duplicate/path/symlink rejection. Checks: 134 tests passed; offline replay 30/30 historical + 16/16 v3 fixtures valid; build passed. No holdout model outputs were generated or used for tuning. No human audio exists in the repository; loader tests use explicitly non-recording placeholder bytes. Actual speech quality, provider compatibility and paid results remain unverified.

## Phase 7 — Hardening and readability

Formatted source, styles, markup, tests and documentation with pinned Prettier 3.6.2 (development tool only; no runtime dependency). Frozen/historical evidence and generated bundles are excluded from formatting. Split browser media, workflow, review rendering, exports and i18n into `modules/`; kept public imports compatible. Added `access.mjs` using `crypto.timingSafeEqual` on fixed-size digests. Updated the five-language meta description and packaging.

Added five module/token/media/markup integration tests. Browser testing exposed missing Phase 4 confirmation markup; added the controls and a regression checking all static element references. Verified locally: Telugu sample → back-translation/readback attestation → confirmation → extraction → clarification → approved text/JSON-ready handoff. Editing English cleared confirmation, facts and approval. No live APIs called. Checks: 139 tests passed; offline 46/46 valid; build passed. Real microphone/device and paid-provider integration remain unverified.

## Phase 8 — Judge path and concise documentation

Changed `demo-access.mjs`, protected route authorization, `.env.example`, packaging, README, architecture, judge setup and demo/evidence generation. A separate judge token requires an absolute expiry, request cap and durable private GCS counter; atomic generation/metageneration preconditions preserve the cap across restarts/concurrency. Unavailable storage fails closed. No cloud resources, permissions or credentials were created. README now starts with problem/audience, a five-step demo, three historical measured numbers and architecture, with consolidated limitations. Historical pages are explicitly marked as pre-v3 evidence. Prewritten medication/allergy samples demonstrate proposed values without paid calls.

Final integration checks also preserve diagnostics across clarification, validate original-language clarification flags, reject duplicate facts disguised by different values, require `questions` in v3 model responses, and stop the first frozen live run on its first failure. Historical fixtures remain compatible. The published v3 schema matches runtime schema.

Added 12 demo-budget/delivery/integration regressions. Checks: 151 tests passed; offline 30/30 historical + 16/16 v3 valid; build passed. Mocked budget tests cover expiry, configuration, storage errors, counter persistence and concurrent CAS; actual GCS/IAM/metadata authentication is unverified. No paid evaluation, deployment, judge provisioning or new GitHub push occurred during this task.

## Remaining human work

- Fluent-speaker review of native wording, heuristic patterns and new questions in Hindi, Tamil, Telugu and Kannada.
- Qualified clinician adjudication of facts, proposed values, ambiguity labels, question usefulness and handoff acceptance.
- Actual consented recordings of fictional stories plus reviewed reference transcripts; no recordings were fabricated.
- Approval for the first paid v3 holdout (rough estimate ₹0.5–₹2; conservative ₹15 planning allowance), then separate approval for other live suites and review of failures/provider schema compatibility.
- Approval for deployment; separately approve judge secret/bucket/IAM setup if that path should be enabled. The current deployed v2.2 app is unchanged.

Final runtime verification used Node v22.23.5: all tests, both offline fixture evaluators and the build passed. Source formatting and `git diff --check` passed. No runtime dependencies were added.
