import { VERSION } from "../agent.js";
import { readFile, writeFile } from "node:fs/promises";
const load = async (name) => {
  try {
    return JSON.parse(await readFile("evals/results/" + name, "utf8"));
  } catch {
    return null;
  }
};
const baseline = await load("baseline-development.json"),
  text = await load("text-live.json"),
  speech = await load("speech-live.json"),
  regression = await load("text-regression.json"),
  v3Partial = await load("text-v3.json"),
  timeDevelopment = await load("time-development-fixed.json");
const pct = (n) =>
  typeof n === "number" ? (n * 100).toFixed(1) + "%" : "Not measured";
const esc = (s) =>
  String(s ?? "Not measured").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  typeof n === "number" ? "₹" + n.toFixed(3) : "Not measured";
const dev = text?.runs.filter((r) => r.split === "development") || [];
const sum = (k) => dev.reduce((n, r) => n + (r[k] || 0), 0);
const devRecall = sum("tp") / (sum("tp") + sum("fn") || 1);
const devPrecision = sum("tp") / (sum("tp") + sum("fp") || 1);
const record = {
  generatedAt: new Date().toISOString(),
  implementation: {
    version: VERSION,
    liveDevelopmentEvaluated: timeDevelopment?.status === "complete",
    fullCurrentHoldoutEvaluated: false,
    measurementVersions: ["intake-v2.1", "intake-v2.2"],
  },
  study:
    "Author-labelled synthetic data; no clinician or fluent-speaker adjudication",
  baseline: baseline?.summary,
  text: {
    version: text?.version,
    summary: text?.summary,
    holdout: text?.holdout,
    development: {
      cases: dev.length,
      factRecall: devRecall,
      factPrecision: devPrecision,
    },
    limitations: text?.limitations,
  },
  speech:
    speech?.status === "complete"
      ? {
          summary: speech.summary,
          estimatedINR: speech.estimatedINR,
          limitations: speech.limitations,
        }
      : null,
  regression:
    regression?.status === "complete"
      ? {
          version: regression.version,
          summary: regression.summary,
          limitations: regression.limitations,
        }
      : null,
  v3PartialHoldout: v3Partial
    ? {
        version: v3Partial.version,
        status: v3Partial.status,
        date: v3Partial.date,
        attempted: v3Partial.cases,
        valid: v3Partial.valid,
        planned: v3Partial.plannedCases,
      }
    : null,
  clockTimeDevelopment:
    timeDevelopment?.status === "complete"
      ? {
          version: timeDevelopment.version,
          date: timeDevelopment.date,
          baseline: timeDevelopment.baseline,
          verification: timeDevelopment.verification,
          repeats: timeDevelopment.repeats,
          combinedUsage: timeDevelopment.combinedUsage,
          combinedReservedINR: timeDevelopment.combinedReservedINR,
          limitations: timeDevelopment.limitations,
        }
      : null,
  manualTimeSavings: null,
  clinicianValidation: false,
  source:
    "https://github.com/gowtham66867/swasthya-saathi/tree/main/evals/results",
};
await writeFile("evaluation.json", JSON.stringify(record, null, 2) + "\n");
const shell = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Swasthya Saathi</title><link rel="stylesheet" href="/style.css"></head><body class="evidence-page"><main><div class="content"><a class="top-link" href="/">← Patient intake workspace</a>${body}<footer>Measured on synthetic data · ${esc(record.generatedAt)} · No clinical validation claim.</footer></div></main></body></html>`;
const row = (label, ...cells) =>
  `<tr><th>${esc(label)}</th>${cells.map((x) => "<td>" + esc(x) + "</td>").join("")}</tr>`;
const speechRows = record.speech
  ? Object.entries(record.speech.summary)
      .map(([lang, m]) =>
        row(
          lang,
          `${m.completed}/${m.cases}`,
          `${m.speechCompleted}/${m.cases}`,
          pct(m.weightedCER),
          `${m.criticalChecksPassed}/${m.criticalChecksTotal}`,
          (m.p95Ms / 1000).toFixed(2) + " s",
        ),
      )
      .join("")
  : row("Speech run", "In progress");
const failures =
  speech?.results?.filter(
    (r) => !r.completed || r.checks?.some((c) => !c.pass),
  ) || [];
await writeFile(
  "evidence.html",
  shell(
    "Evaluation evidence",
    `<div class="eyebrow">LIVE RESULTS, WITH LIMITS</div><h1>Proof you can inspect.</h1><div class="review-note">Historical intake-v2/v2.2 measurements remain frozen below. Current source: ${esc(VERSION)}. New development verification is reported separately; a complete current-version holdout and clinical validation are still pending.</div><p class="intro">A functional primary-care intake prototype with a published evaluation record. These are measured API results on fictional inputs, not clinical accuracy or a patient study.</p><div class="evidence-grid"><div class="metric"><strong>${text?.summary?.completed || 0}/30</strong><span>Distinct text cases completed · live Sarvam</span></div><div class="metric"><strong>${pct(text?.holdout?.factRecall)}</strong><span>Exact fact recall · 20-case frozen holdout</span></div><div class="metric"><strong>${pct(text?.holdout?.factPrecision)}</strong><span>Exact fact precision · same holdout</span></div></div><h2>Development versus a frozen holdout</h2><p class="report-note">The first 10 cases were used for prompt refinement. The other 20 were scored once before inspecting failures. Their results remain frozen here. Later retests are labelled regression, not a new holdout.</p><table class="report-table"><thead><tr><th>Metric</th><th>Initial 10 development</th><th>Updated 10 development</th><th>Frozen 20 holdout</th></tr></thead><tbody>${row("Exact fact recall", pct(baseline?.summary.factRecall), pct(devRecall), pct(text?.holdout?.factRecall))}${row("Exact fact precision", pct(baseline?.summary.factPrecision), pct(devPrecision), pct(text?.holdout?.factPrecision))}${row("Negation exact match", pct(baseline?.summary.negationExactMatch), "See raw report", pct(text?.holdout?.negationExactMatch))}${row("Unknown preservation", pct(baseline?.summary.unknownPreservation), "See raw report", pct(text?.holdout?.unknownPreservation))}${row("Ambiguity quote recall", pct(baseline?.summary.ambiguityRecall), "See raw report", pct(text?.holdout?.ambiguityRecall))}${row("p95 latency", baseline?.summary.p95Ms + " ms", "See raw report", text?.holdout?.p95Ms + " ms")}</tbody></table><div class="review-note">Known weakness: the model misses some uncertainty and contradiction labels and can assign quotes to extra categories. Matching a real sentence does not establish a correct clinical interpretation. The review screen separately flags explicit correction language, family context, uncertainty, and instruction-like text. These rules do not detect every clinical contradiction.</div><h2>Four-language speech pipeline</h2><p class="report-note">Bulbul-generated speech → Saaras transcription → English translation → extraction. Six author-written cases per language. Synthetic quiet audio from the same provider is easier than real people speaking in a clinic. CER is a normalized character error rate; lower is better. Lexical critical checks cover selected numbers and denials, not full semantic correctness. Speech-only success excludes the extraction step. Failed extractions were rechecked using saved translations; earlier successful rows were retained. Latency includes the original attempt plus recheck where applicable, not a fresh pipeline benchmark.</p><div class="table-scroll"><table class="report-table"><thead><tr><th>Language</th><th>Full pipeline</th><th>Speech + translation</th><th>CER on speech successes</th><th>Critical probes</th><th>p95</th></tr></thead><tbody>${speechRows}</tbody></table></div><h3>Failures remain visible</h3><ul>${failures.map((r) => '<li class="report-note">' + esc(r.id) + ": " + esc(r.error || r.extractionError || "lexical critical check failed") + "</li>").join("") || "<li>See raw records for all case-level outputs and checks.</li>"}</ul><h2>Cost and usage</h2><p class="report-note">Frozen text run: ${money(text?.summary.estimatedINR)} from ${esc(text?.summary.inputTokens)} input and ${esc(text?.summary.outputTokens)} output tokens. Speech evaluation estimate: ${money(record.speech?.estimatedINR)}. These are estimates from recorded successful usage at published pay-as-you-go rates, excluding GST, cloud costs, failed-call billing, earlier attempts and any cache discount. They are not a measured account-balance debit. <a href="https://docs.sarvam.ai/api/getting-started/pricing">Pricing source</a>.</p>${record.regression ? '<h2>Post-review regression retest</h2><p class="report-note">' + esc(record.regression.version) + " on the same 30 previously seen cases. Recall " + pct(record.regression.summary.factRecall) + ", precision " + pct(record.regression.summary.factPrecision) + ". This is not fresh generalization evidence.</p>" : ""}${record.v3PartialHoldout ? '<h2>First v3 holdout stopped early</h2><p class="report-note">' + esc(record.v3PartialHoldout.valid) + " valid cases out of " + esc(record.v3PartialHoldout.attempted) + " attempted, with " + esc(record.v3PartialHoldout.planned - record.v3PartialHoldout.attempted) + " not run. It stopped at the first validation failure; this is not a full holdout accuracy score. The report was preserved.</p>" : ""}${record.clockTimeDevelopment ? '<h2>Clock-time fix: development verification</h2><p class="report-note">' + esc(record.clockTimeDevelopment.version) + ": baseline " + esc(record.clockTimeDevelopment.baseline.valid) + "/" + esc(record.clockTimeDevelopment.baseline.cases) + " validated; fixed build " + esc(record.clockTimeDevelopment.verification.valid) + "/" + esc(record.clockTimeDevelopment.verification.cases) + " new development cases and " + esc(record.clockTimeDevelopment.repeats.valid) + "/" + esc(record.clockTimeDevelopment.repeats.cases) + " repeat runs validated. Every required quotation and target field was retained. The model selected source IDs and the application supplied original quotations; proposed values and categories still require human review. Combined baseline/fixed cost estimate " + money(record.clockTimeDevelopment.combinedUsage.estimatedINRNoCacheDiscount) + " before GST, ignoring cache discounts. These are development/repeat results, not a fresh holdout.</p>" : ""}<h2>Human validation still required</h2><p class="report-note">No clinician has adjudicated these labels or accepted a real patient handoff. Native-language wording requires fluent review. Manual intake time savings have not been measured. The app includes a same-case self-timing tool; it does not fabricate a percentage improvement.</p><p><a href="/evaluation.json">Download machine-readable summary</a> · <a href="${record.source}">Inspect complete synthetic results in GitHub (private)</a></p>`,
  ),
);
await writeFile(
  "demo.html",
  shell(
    "Two-minute demonstration",
    `<div class="playbook"><div class="eyebrow">SHOW ONE CLINIC VISIT</div><h1>From patient voice<br>to a reviewed handoff.</h1><p class="intro">An intake worker helps a patient prepare for a primary-care visit. Choose Hindi, Tamil, Telugu or Kannada. All examples are fictional.</p><ol><li><strong>0:00–0:20 · The problem.</strong> “A patient should not need English to explain why they came. A clinician needs a concise account they can verify.” Select a language and the medication or negation example.</li><li><strong>0:20–0:50 · Capture and review.</strong> Demonstrate recording after consent and app access, or clearly choose a prewritten sample. For a live test on a sample, press Use live AI, then Translate. Prepare the back-translation, read it aloud, record patient confirmation, then Extract. Show original and English text together. Samples use clearly labelled prewritten back-translation and operator readback.</li><li><strong>0:50–1:15 · Clarify.</strong> Play a missing-detail question in the selected language. Record or type a fictional answer. In live mode, its English translation and original words remain visible. Leave an unknown detail blank.</li><li><strong>1:15–1:40 · The clinician’s view.</strong> Inspect the quoted evidence and unknown fields. Show a correction resetting approval. Enter “Demo reviewer A”, choose Hackathon demo reviewer, check critical details and approve. Export the text or review JSON. Do not claim a real clinician accepted this demo.</li><li><strong>1:40–2:00 · Show the evidence.</strong> Open the live evaluation page. Explain the holdout precision, recall and failed speech cases. Show where human language and clinical review are still pending. Avoid a claim that software test counts establish medical accuracy.</li></ol><h2>Judge access</h2><p class="report-note">Prewritten examples work without a token. For paid voice/translation/extraction, ask the owner for a dedicated expiring judge token with a shared server-enforced request cap. No judge credential is embedded here. Demo access stays off until its private counter bucket and secret are configured and approved.</p><h2>Optional measured comparison</h2><p class="report-note">Ask an independent intake worker to time manual intake on the same fictional case, then assisted intake, counterbalancing the order across cases. Use the built-in timing export. Report observations and corrections; don't call a single self-timed demo a clinical study.</p><a class="top-link" href="/">Start the demonstration →</a></div>`,
  ),
);
console.log("Published evidence pages from actual reports.");
