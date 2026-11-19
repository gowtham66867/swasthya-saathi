# Recording and deployed-feature check — 19 November 2026

The public service still serves `swasthya-saathi-00007-shl` / intake-v3.1. No deployment or paid Sarvam calls were made during this check.

## Findings

The existing browser tab showed an older, incomplete interface. Before reload it reported that live Sarvam was not configured, although `/api/status` reported ready. Reloading loaded the deployed interface and restored the connection indicator. The current recording flow then correctly refused capture without an app access token. The access panel was collapsed, making the requirement easy to miss.

The server and client modules match the repository baseline. HTTP asset checks succeeded for the home page, browser modules, stylesheet, demo, evidence and evaluation data. All four paid endpoints denied unauthenticated requests with 401.

Browser checks completed the prewritten medication workflow in Hindi, Tamil, Telugu, Kannada and English: load case, back-translation, readback attestation, confirmation, extraction, clarification skip, human review and handoff. Telugu TXT and JSON downloads contained original text, confirmation, exact evidence and medication values. Editing source text hid the prior handoff and cleared confirmation; clearing reset the workflow. These sample checks do not exercise the paid provider or establish language accuracy.

## Prepared fixes (not deployed)

- Recording requirements are visible beside the recording control.
- Missing access opens the token panel and focuses the input; access and consent remain mandatory.
- Permission, missing-device, busy-device and unsupported-format errors explain recovery steps, including using Chrome/Safari directly when an in-app browser blocks capture.
- Pending microphone permission cannot create overlapping capture requests.
- Recorder startup/asynchronous failures release tracks and reset controls/timers; failed or empty capture never uploads audio.
- Nine regression tests cover these capture paths. Total: 170 passing tests; 46 valid offline fixtures; build passed.

A local browser check confirmed the missing-token panel opens with the recovery message. Actual hardware capture, device/browser permissions, and paid transcription/translation/TTS/extraction were not verified in this check. A separate request for a capped INR 5 synthetic provider check is awaiting the owner. No real patient audio was recorded.

## Owner steps for recording

Reload the live page. Select the language, check processing consent and enter the app access token under Live processing access (this is not the Sarvam API key). Press Start recording and allow microphone access. Stop within 25 seconds. If the browser blocks the microphone, open the same HTTPS address directly in Chrome or Safari and check both browser-site and operating-system microphone permissions. Do not use real patient information in this prototype.

The prepared fixes require deployment approval under the owner's existing ground rule. Until deployed, the current page still shows the older access/error guidance.

## Owner-approved live check and deployment

The owner approved synthetic provider tests within INR 5 and deployment of the tested recording fixes. Eight live speech/translation checks passed: Telugu and Kannada TTS returned valid 2.13-second WAV audio, Saaras returned nonempty transcripts, and forward/back translation returned nonempty text. This confirms route functionality, not fluent-speaker semantic accuracy or actual speaker playback.

The first extraction returned successfully but failed the test's exact symptom-denial preservation assertion. The test script did not retain that response or its token usage before failing; this limits diagnosis. A separate medication development input passed exact evidence and proposed dose checks in one call. The failure is retained; no prompt/holdout tuning or extraction-logic change was made. No full-pass claim is warranted.

Conservative reservations: INR 4.60 of the approved INR 5. Speech/translation estimate INR 0.486 before GST; separate extraction estimate INR 0.013805 before GST. The total actual debit cannot be stated because the first extraction usage was not retained. See [synthetic functionality report](../evals/results/recording-feature-smoke.json). No real microphone or patient audio was uploaded.

Deployment completed: `swasthya-saathi-00008-9v6`, serving 100% of traffic. Post-deployment HTTP checks verified the new HTML guidance, access-panel handling and recording-error module; `/api/status` remains ready. Existing secrets, access gates and service account were retained. The owner's existing in-app tab was refreshed and its app access token populated securely in memory; the temporary token file was deleted and no credential was printed or committed. Consent is left unchecked for the owner to choose before recording. Device microphone capture remains unverified; the user reports the problem inside Codex's browser. If it blocks capture, the same HTTPS app can be opened directly in Chrome/Safari with microphone permission.
