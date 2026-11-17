# Approval plan — prepared, not executed

17 November 2026. No new paid calls or deployment were made during intake-v3 work. Existing public evidence describes historical v2/v2.2 results, not the new runtime. Approve live evaluation separately from deployment; stop on schema incompatibility before running the rest of the suite.

## Scope and commands

Use an existing app credential loaded into the process environment through Secret Manager; do not paste it into source, a URL or a command argument. The commands below assume `SARVAM_API_KEY` is already injected securely.

```sh
# FREE: frozen-label/schema replay, no network requests
npm run eval
# PAID, only after approval: first 16-case frozen v3 holdout, max 48 LLM calls
EVAL_LIVE=yes node evals/v3.mjs --live
# PAID, separately labelled seen-case regression, max 90 LLM calls
EVAL_LIVE=yes node evals/benchmark.mjs --regression
# PAID: fresh 24-case machine-voice run, writes speech-v3.json (preserves historical speech-live.json)
EVAL_LIVE=yes node evals/speech-live.mjs
# FREE: validate user-supplied consented fictional recordings, no upload
node evals/human-speech.mjs --manifest evals/audio-private/manifest.json
# PAID, only after consent/approval for specific files; no TTS generation
EVAL_LIVE=yes node evals/human-speech.mjs --manifest evals/audio-private/manifest.json --live
```

The frozen holdout runner refuses to overwrite its first report, including a partial failed run. Preserve and inspect failures; do not tune on the holdout. New benchmark default filenames preserve old evidence. One case can incur at most three extraction calls; no model tool execution or extra clarification-generation call. Dataset labels, value matching and language rules still require independent adjudication.

## Expected costs for approval

[Official Sarvam pricing](https://docs.sarvam.ai/api/getting-started/pricing), checked 17 November 2026: sarvam-105b ₹10/million input and ₹25/million output tokens; STT ₹0.49/minute; Bulbul v3 ₹3/1,000 characters; translation ₹2/1,000 characters. GST and Cloud Run costs are excluded; actual billing, retries and rounding may differ.

| Run | Expected planning range | Conservative model allowance |
| --- | --- | --- |
| Frozen v3, 16 cases | ₹0.5–₹2 | ₹14.16 assuming 3 calls/case, 24,000 input and 2,200 output tokens/call |
| Seen-case regression, 30 cases | ₹1–₹4 | ₹26.55 under the same assumptions |
| Four-language synthetic speech, 24 cases | ₹7–₹15 | Add up to ₹21.24 for extraction under the same assumptions; provider retries can add cost |
| Human-recorded fictional audio | Cannot estimate a total until manifest/durations are supplied | Example six × 25-second clips, 200 transcription characters each: STT ≈₹1.23, translation ≈₹2.40, extraction ≈₹0.2–₹1 expected (up to ₹5.31 under conservative assumptions); no TTS charge |

These are planning estimates, not enforced rupee billing caps or account-balance measurements. For the first holdout, request approval for a ₹15 allowance and stop after the first provider/schema failure for inspection. Approve the other suites independently. Demo request caps in Phase 8 bound calls, not INR.

## Human-recorded audio path

Copy `evals/audio-manifest.example.json` to an ignored local `evals/audio-private/manifest.json`. Record consenting adults reading fictional case words; a fluent reviewer supplies the actual native transcript. `syntheticContent` means fictional clinical content, not synthesized audio. Set the consent assertion only after permission to upload those specific recordings to Sarvam. Include one unique ID, relative file, supported language and reference per entry. No recordings were fabricated or supplied by this implementation.

The loader rejects path traversal/symlink escapes, duplicates, unsupported MIME extensions, >5 MB files, >20 cases, missing consent and real clinical content assertions. It checks structure/size, not an acoustic duration guarantee. The runner reports aggregate CER and completion without saving audio or raw transcripts. CER is spelling agreement, not clinical correctness. Reference transcripts remain in the ignored local manifest. A human must validate duration, speaker consent, language and labels before upload.

## Deployment after evaluation approval

No infrastructure changes are required to review this source locally. After reviewing evaluated results, approve a separate deployment of the eight phase commits. Run test/eval/build, deploy the built source to the existing Cloud Run service with its unchanged secret bindings, and perform a consented synthetic smoke test. Until then, the current deployed v2.2 app is unchanged.
