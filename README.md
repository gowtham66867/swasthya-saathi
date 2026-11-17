# Swasthya Saathi

Multilingual patient intake with Sarvam voice, a bounded extraction harness, exact source evidence, clarification, and human-reviewed clinician handoff.

- App: https://swasthya-saathi-935048564575.asia-south1.run.app
- Source: https://github.com/gowtham66867/swasthya-saathi (private)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Prompt: [prompts/intake-v1.mjs](prompts/intake-v1.mjs)
- Schema: [prompts/intake-v1.schema.json](prompts/intake-v1.schema.json)

## Run

Node 22 or later. No installation or external runtime packages required.

```sh
npm test
npm run eval
npm run build
npm run dev
```

Open http://127.0.0.1:4317. Select a language and fictional case, load it, extract the prewritten facts, optionally answer clarification questions, approve review, and export. English, Hindi, and Tamil have ten fictional cases each. Other languages remain selectable for live processing and typed intake. All samples are explicitly prewritten; they are not model demonstrations.

## Live configuration

Live mode requires `SARVAM_API_KEY` and `LIVE_ACCESS_TOKEN` (at least 32 characters). Enter the owner's access token under **Live processing access**; it is held in the page only and cleared with the session. The Sarvam subscription key never enters browser code. Obtain credentials separately; none are included. Local `.env` files are not automatically loaded.

Optional `SARVAM_TEXT_MODEL` is `sarvam-105b` (default) or `sarvam-105b-conversations`. Speech uses `saaras:v3`, translation `sarvam-translate:v1`, readback `bulbul:v3`. Extraction uses Sarvam's `/v1/chat/completions`, strict JSON-schema output, `reasoning_effort:low`, and a 2200-output-token limit per call. No additional AI provider is enabled.

Consent is required before any live request. Processing fails closed without both the provider key and access gate. Public demo visitors cannot invoke paid APIs unauthenticated. The shared access token is a prototype gate, not patient identity or clinical access management.

## Harness and review

Application code owns the plan: transcribe → translate → extract → validate evidence → ask at most three clarifications → review → export. The model proposes extractive fact categories and ambiguity spans, never executable tools. Each extraction allows one transient retry and one repair, with an absolute three-call ceiling. There is one optional clarification extraction pass (at most six calls across the full interaction). Requests have timeouts, client cancellation, serialized UI operations, and stale-response checks.

Facts contain exact quotes and source IDs rather than generated value paraphrases. Validation rejects unknown categories, extra fields, fabricated spans, duplicate facts, and quotes that truncate a source sentence. Missing facts remain unknown; explicit denials retain their source sentence. Quote matching cannot establish correct clinical categorization or fully prove entailment. Human review is mandatory. Original and English text remain visible; there is no invented word alignment. Operator corrections remain labelled and retain extracted evidence. Editing text invalidates extraction and approval; correcting a field or reference resets approval.

Workflow state is ephemeral and owned by the page. The server gates extraction stages and validates every extraction response, but does not persist or cryptographically attest the clinical workflow. Download, copy, and print are local actions gated by review; this is not a signed clinical record.

## Evaluations

```sh
npm run eval
# Explicit opt-in to paid calls, using synthetic cases only:
EVAL_LIVE=yes npm run eval:live
```

`evals/cases.v1.json` has 30 author-labelled fictional text cases: ten scenarios each in English, Hindi, and Tamil. Each language version shares its scenario's English translation. Live extraction evaluation therefore measures ten unique English scenarios repeated across language-paired fixtures; it does not measure native-language understanding or translation. Native-language text requires fluent human review.

Offline runs replay expected labels through the validator and grader. Perfect offline matching is fixture consistency, NOT model accuracy. Reports are labelled accordingly. Live runs record actual usage, latency, call count, completion, schema/evidence validity, exact-span fact precision/recall, extra labelled facts, negation matching, and unknown preservation. Failed cases fail the evaluation. Exact matching can penalize equally valid quotes; use human adjudication. Semantic entailment, clarification relevance, clinical terminology, and prompt-injection behavior require live and qualified human evaluation. Speech and translation accuracy need separately labelled audio datasets; no audio scores are claimed.

Tests mock providers and cover repair/retry bounds, injected instructions staying in the data message, no executable model tools, unsupported evidence, negation truncation, state errors, stale revisions, cancellation, approval/export, correction provenance, provider errors, consent, access gates, and size caps. A mocked injection test verifies request construction, not model resistance.

## Privacy and operations

No application database, local storage, transcript logs, or retained audio files. Browser data exists until cleared or closed; Sarvam processes live content under its own policies. Cloud Run infrastructure request logs may include URLs, status, and metadata; no patient content is placed in URLs. The application does not log medical content or secrets. Exports and clipboard copies leave the ephemeral session under the operator's control.

Server caps incoming bodies at 5 MB before parsing, including streamed requests. Only supported audio MIME types are forwarded. Browser capture stops at 25 seconds. Actual audio duration is not independently decoded server-side: the size cap is the server-enforced limit. Server allows two concurrent paid requests and 30 POST requests per minute per instance; use max one instance for this prototype. This is a coarse shared limit, not durable per-user rate limiting. Use stronger identity and perimeter controls for any real patient workflow.

## Deploy and rollback

Existing project `swasthya-saathi-2026`, service `swasthya-saathi`, region `asia-south1`.

```sh
npm test
npm run eval
npm run build
gcloud run deploy swasthya-saathi --source . --project=swasthya-saathi-2026 --region=asia-south1 --min-instances=0 --max-instances=1 --concurrency=10 --memory=512Mi --cpu=1 --timeout=90 --quiet
```

The Docker image contains built server/static assets only. `.gcloudignore` and `.dockerignore` exclude credentials and Git metadata. Put production secrets in Secret Manager and grant the Cloud Run runtime service account access only to those secrets. Attach them via Cloud Run `--update-secrets` with explicit version numbers. Configure both required secrets together. Do not pass values through shell arguments or source files. Production credentials are stored in Secret Manager and attached by explicit version. A small synthetic live smoke test is run separately from the 30-case evaluation; live evaluation accuracy is not established by a smoke test.

List revisions with `gcloud run revisions list --service=swasthya-saathi --region=asia-south1 --project=swasthya-saathi-2026`. Roll back using `gcloud run services update-traffic swasthya-saathi --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1 --project=swasthya-saathi-2026`.

GitHub Actions runs tests, offline fixture checks, and a build. It does not deploy or store cloud credentials. Deployment is currently an explicit CLI operation.

## Boundaries

Synthetic prototype for communication support. No diagnosis, prescribing, urgency scoring, EHR integration, persistent patient memory, clinical validation, or regulatory compliance claim. The screenshot supplied at project start contained a buildathon signup reminder, not judging criteria or a healthcare specification.

## Live smoke test (17 November 2026)

The personal Sarvam account had 2600 available credits before testing. A dedicated app key was created with owner approval and stored in Secret Manager; it was never committed. Live Hindi-to-English translation, generated Hindi speech, and transcription of that generated speech succeeded. The chat endpoint rejected the documentation's `none` reasoning setting; the harness uses `low` and strict `json_schema` output. The corrected extraction returned three valid facts in one call (583 input / 74 output tokens in the direct synthetic test). This is a functional smoke test, not clinical accuracy or a full evaluation. The production access gate remains required. The existing unrelated key was left intact.
