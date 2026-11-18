# Swasthya Saathi

**Assisted primary-care intake in Hindi, Tamil, Telugu, Kannada and English.**

**Theme:** Operational efficiency of healthcare organisations.

**Problem and audience.** A patient should be able to explain a visit without needing English. Intake workers and clinicians need a concise account they can verify, with medication quantities, symptom denials and uncertainty retained.

**Solution.** Sarvam voice recognition and translation turn a fictional patient story into an editable English account. A back-translation/readback is confirmed with the patient before extraction. The application creates a source-sentence catalog; the model selects evidence IDs and the application supplies the exact quotations. Optional structured values and bounded follow-up questions speed review. A human checks original words, translation, unknowns, corrections and critical details before exporting a handoff.

**AI and engineering.** Saaras v3, Sarvam Translate v1, sarvam-105b and Bulbul v3; Node 22 with zero runtime dependencies. A fixed application-owned plan permits at most three model calls per extraction and one optional clarification pass. Consent, same-origin access, size limits, cancellation and mandatory human approval protect the workflow. No model-executed tools or patient database.

**Measured prototype evidence.** On separate clock-time development cases, the old harness failed 3/3 cases. The corrected v3.1 build validated 6/6 development cases plus 3/3 repeat runs, preserving every required quote and field. Combined development and deployment-smoke cost approximately INR 0.32 before GST without cache discounts. There are 161 passing software tests. These are synthetic development results, not a fresh holdout or clinical accuracy claim.

**Why it matters and adoption path.** The worker-assisted workflow supports language inclusion and a traceable clinician handoff. Next steps are fluent-speaker review, independent clinical adjudication, consented recordings of fictional stories, and a matched manual-versus-assisted timing study before any real patient pilot.

**Data and limits.** Author-written fictional fixtures only; no real patient data and no model training on patient records. No diagnosis, prescriptions, urgency assessment, EHR integration or claimed clinical validation. A prior frozen v3 holdout stopped after one validation failure; it remains unchanged. The new evidence-ID fix was tested on separate development inputs. Native language quality, question usefulness and practical time savings remain unvalidated.

**Demo:** https://swasthya-saathi-935048564575.asia-south1.run.app

**Source:** https://github.com/gowtham66867/swasthya-saathi (private; source package available).

**Version disclosure:** Source and public demo are v3.1, deployed with owner approval on 18 November 2026. **Team:** Swasthya Saathi. **Members:** Gowtham Ramachandra and Dr Sowmya (as provided by the owner).
