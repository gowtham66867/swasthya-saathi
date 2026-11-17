# Capped judge access — not enabled

This is configuration-ready code, not an active credential or provisioned service. No secret value is committed. Ask for approval before infrastructure, IAM, secret creation or deployment.

## Required settings

| Setting              | Meaning                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `DEMO_ACCESS_TOKEN`  | Dedicated random secret, at least 32 characters, distinct from owner token; inject from Secret Manager |
| `DEMO_REQUEST_LIMIT` | Integer 1–1000 authenticated POST attempts shared by everyone using this token                         |
| `DEMO_EXPIRES_AT`    | Absolute ISO timestamp including timezone, e.g. a chosen demo end time converted to UTC                |
| `DEMO_BUDGET_BUCKET` | Private Cloud Storage bucket for non-patient counter metadata                                          |

All settings are required. Never give judges the owner token or Sarvam subscription key. Share the judge token directly through an approved channel, not a URL or repository. It goes in the existing access field. Never persist it in browser storage.

## Durable reservation and fail-closed behavior

`authorizeAccess` checks owner access first, otherwise compares the judge token using fixed-size digests and `timingSafeEqual`. Invalid/expired tokens cannot reserve capacity. Before forwarding a judge POST, `createGcsBudgetStore` atomically reserves one counter slot. A create uses `ifGenerationMatch=0`; updates use both generation and metageneration preconditions. Conflicts retry at most three times, then deny. Storage/IAM/network errors deny access. Expiry is checked again after reservation.

Only the SHA-256 identifier derived from token/expiry/limit and an integer `used` count are stored, under `judge-budgets/`. No request payloads, patient identifiers, transcripts or audio enter this bucket. Counters are never refunded after failure: a provider request may have incurred a charge. Recreating the same process or scaling instances reads the same durable counter. Rotating the token or changing expiry/limit deliberately establishes a new allowance; configuration access is administrative.

The counter grants at most the configured number of authenticated POST attempts. Each extraction can use three model calls; translation/TTS/transcription each forward one provider request. This is a request budget, not a billing cap. The ordinary size, origin, consent, timeout and rate limits remain active. Owner access retains its existing separate coarse limits.

## Setup after approval

1. Create/select a private bucket with public access prevention and uniform bucket access. Keep this bucket separate from any content storage. Do not enable a lifecycle rule that removes a live counter.
2. Grant the Cloud Run runtime service account only `storage.objects.get`, `storage.objects.create` and `storage.objects.update` scoped to this bucket/prefix, using an appropriate custom role and condition. Do not grant access to unrelated buckets.
3. Generate a dedicated token, store it in Secret Manager and grant the runtime service account access to that secret only. Supply cap/expiry/bucket as configuration; pin the secret version. Retain the owner gate.
4. Deploy only after approval. Verify with a small separate synthetic budget: consent denial, cap exhaustion, expiry, unavailable storage and restart behavior. Then configure the approved event allowance. No such cloud tests were run here.

Implementation follows Google's [object insert](https://cloud.google.com/storage/docs/json_api/v1/objects/insert), [metadata patch](https://cloud.google.com/storage/docs/json_api/v1/objects/patch) and [request precondition](https://cloud.google.com/storage/docs/request-preconditions) APIs. Mocked tests cover concurrency and restart semantics; actual IAM, Cloud Run metadata authentication and GCS integration still need an approved smoke test.
