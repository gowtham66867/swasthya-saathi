# Owner-approved v3.1 deployment

18 November 2026. The user explicitly approved “Deploy tested v3.1”.

- Service: `swasthya-saathi`, project `swasthya-saathi-2026`, region `asia-south1`.
- Revision: `swasthya-saathi-00007-shl`, 100% traffic.
- Deployed source: commit `4dfd144`; subsequent documentation/artifact updates do not change the runtime code.
- Live URL: https://swasthya-saathi-935048564575.asia-south1.run.app
- Previous revision retained: `swasthya-saathi-00006-j9d`.

All 161 tests, 46 offline fixture checks and the build passed before deployment. Existing runtime service account, Secret Manager bindings, max-one-instance configuration and owner access gate were retained. No judge credential/bucket or broader permissions were provisioned.

Live verification: `/api/status` reports `intake-v3.1` and ready. One fictional confirmed extraction preserved the full clock-time sentence and its duration field using `catalog-ids-v1`. It took one model call. The API rejected an unauthenticated paid request with 401. Main UI, evidence, evaluation JSON and workflow module assets responded successfully. Browser testing completed a prewritten medication example through translation confirmation, human review and handoff, with proposed values remaining alongside the original quote.

Combined development diagnosis/fixed verification plus deployed smoke: 17 model calls, estimated INR 0.31984 before GST without cache discounts. Conservative allowance reservations total INR 11.40 of the approved INR 15. This is a token-usage estimate, not an observed account debit. [Synthetic smoke evidence](../evals/results/deployment-v3.1-smoke.json).

The initial frozen holdout remains unchanged and incomplete. Deployment does not establish clinical accuracy. Submission is pending the organizer's form link and the user's registered team details.
