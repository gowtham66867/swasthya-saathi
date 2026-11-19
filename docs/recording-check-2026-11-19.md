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
