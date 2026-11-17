# Swasthya Saathi

A Sarvam-powered patient intake and clinician handoff prototype for an Indian-language buildathon.

## Why this topic

Voice intake is a concrete use of Indian-language speech and translation: a patient tells their story, reviews the transcript and English translation, and takes a short summary to the doctor. The scope is communication support. No diagnosis, prescribing, triage, or claims of clinical validation.

The supplied screenshot only identifies a buildathon group and a reminder to create an Indus account. It does not contain healthcare requirements, judging criteria, API credentials, or a full event brief. This topic is a proposed starting point, not an organizer requirement. Indus account access and a Sarvam developer API key are separate setup steps.

## Implemented

- Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, and English language selection.
- Microphone capture limited to 25 seconds, Sarvam Saaras transcription, Sarvam English translation, and Bulbul audio readback.
- Editable original and English text, explicit unknowns for missing context, patient review gate, text export, and copy.
- Clearly marked prewritten samples work without a key. Samples never masquerade as live model results.
- Server-side API key, same-origin and consent checks, bounded requests, error redaction, and no application data persistence.

## Run locally

Requires Node 22 or later, no package installation.

```sh
npm run build
npm test
export SARVAM_API_KEY='your-key'
npm run dev
```

Open http://127.0.0.1:4317. Without the key, sample mode is available. The dev server reads the shell environment; it does not automatically load .env files. Never put the key in client code or commit it.

## Hosted setup

The private Sites deployment uses `.openai/hosting.json` and `dist/server/index.js`. Set production secret `SARVAM_API_KEY` using the Sites environment-variable controls and redeploy. Local environment variables do not configure the hosted runtime. Preserve owner-private access; this prototype has no public-use rate limiting or application login of its own.

## Demo script

1. Select Hindi or Tamil and choose **Try a sample case**.
2. Show the original statement beside its prewritten English version.
3. Review the details, check the review box, and generate the handoff.
4. Download the patient-reported summary; missing medication and allergy details remain unknown.
5. With a key configured, consent to processing, record a fictional complaint, translate it, and play the Sarvam readback.

## Verification and limits

API tests mock Sarvam and verify contracts and safeguards; they do not prove live API or clinical accuracy. Live provider calls require a real key. Sample translations and all medical-language output require human validation. The app does not log or store patient content; Sarvam processes live requests under its own service policies. Use synthetic cases during development. Clinical deployment would require clinician-led evaluation, privacy controls, and operational review.

## API references

- https://docs.sarvam.ai/api-reference/speech-to-text/transcribe
- https://docs.sarvam.ai/api-reference/text/translate-text
- https://docs.sarvam.ai/api-reference/text-to-speech/convert

Stable explicitly selected models: `saaras:v3`, `sarvam-translate:v1`, `bulbul:v3`.
