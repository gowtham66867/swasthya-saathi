import { readFile, writeFile } from "node:fs/promises";
import { validateExtraction, FIELDS } from "../agent.js";
import { runExtraction } from "../harness.mjs";
const live = process.argv.includes("--live");
if (live && (!process.env.SARVAM_API_KEY || process.env.EVAL_LIVE !== "yes"))
  throw Error(
    "Live eval requires SARVAM_API_KEY and EVAL_LIVE=yes; uses paid synthetic calls.",
  );
const cases = JSON.parse(
  await readFile(new URL("./cases.v1.json", import.meta.url), "utf8"),
);
let tp = 0,
  fp = 0,
  fn = 0,
  valid = 0,
  completed = 0,
  missingCorrect = 0,
  missingTotal = 0,
  negationCorrect = 0,
  negationTotal = 0;
const runs = [];
for (const c of cases) {
  const sources = { english: c.english, clarifications: "" };
  let result,
    meta = {},
    error;
  try {
    if (live) {
      ({ result, meta } = await runExtraction(sources, {
        key: process.env.SARVAM_API_KEY,
      }));
    } else {
      result = c.expected;
    }
    const errors = validateExtraction(result, sources);
    valid += !errors.length;
    completed++;
    const key = (f) => JSON.stringify([f.field, f.quote, f.sourceId]);
    const expected = new Set(c.expected.facts.map(key)),
      actual = new Set(result.facts.map(key));
    for (const k of actual) expected.has(k) ? tp++ : fp++;
    for (const k of expected) if (!actual.has(k)) fn++;
    for (const field of FIELDS.filter(
      (f) => !c.expected.facts.some((x) => x.field === f),
    )) {
      missingTotal++;
      if (!result.facts.some((x) => x.field === field)) missingCorrect++;
    }
    for (const f of c.expected.facts.filter((f) =>
      /\b(no|not)\b/.test(f.quote),
    )) {
      negationTotal++;
      if (actual.has(key(f))) negationCorrect++;
    }
  } catch (e) {
    error = e.code || "failure";
  }
  runs.push({ id: c.id, ...meta, error });
}
const report = {
  mode: live
    ? "live Sarvam text extraction"
    : "offline labelled-fixture replay — NOT model accuracy",
  dataset: "cases.v1",
  cases: cases.length,
  completed,
  schemaAndEvidenceValid: valid,
  exactFactPrecision: tp / (tp + fp || 1),
  exactFactRecall: tp / (tp + fn || 1),
  extraLabelledFactRate: fp / (tp + fp || 1),
  unknownPreservation: missingCorrect / (missingTotal || 1),
  negationExactMatch: negationCorrect / (negationTotal || 1),
  limitations: [
    "Offline replay checks fixtures and grading only.",
    "Exact matching penalizes semantically equivalent spans; human adjudication needed.",
    "No speech/translation accuracy measured.",
    "Semantic evidence entailment and injection resilience require live evaluation and qualified review.",
  ],
  runs,
};
await writeFile(
  new URL(
    live ? "./report.live.json" : "./report.offline.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, runs: undefined }, null, 2));
if (valid !== cases.length) process.exitCode = 1;
