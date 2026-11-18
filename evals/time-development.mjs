import { readFile, writeFile } from "node:fs/promises";
import { runExtraction } from "../harness.mjs";
import { validateExtraction, VERSION } from "../agent.js";
import { evidenceCatalog, resolveReferences } from "../evidence-catalog.js";
import { sanitizeValues } from "../values.js";
import { sanitizeQuestions } from "../questions.js";
import { createRequestBudget } from "./request-budget.mjs";
if (process.env.EVAL_LIVE !== "yes" || !process.env.SARVAM_API_KEY)
  throw Error(
    "Explicit paid development approval and securely injected key required.",
  );
const destination = new URL(
  "./results/time-development-fixed.json",
  import.meta.url,
);
try {
  await readFile(destination);
  throw Error(
    "Preserve existing development run; select a new labelled report for any retest.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const baseline = JSON.parse(
  await readFile(
    new URL("./results/time-development-baseline.json", import.meta.url),
  ),
);
const priorPaise = Math.round(baseline.budget.reservedINR * 100);
const budget = createRequestBudget({ limitPaise: 1500 - priorPaise });
const cases = JSON.parse(
  await readFile(new URL("./time-development.json", import.meta.url)),
);
const scheduled = [
  ...cases.map((c) => ({ ...c, round: "verification" })),
  ...cases.slice(0, 3).map((c) => ({ ...c, round: "repeat" })),
];
const results = [];
const key = process.env.SARVAM_API_KEY;
for (const c of scheduled) {
  const sources = { english: c.english, clarifications: "" },
    catalog = evidenceCatalog(sources),
    attempts = [];
  let output, error, errorMeta;
  try {
    output = await runExtraction(sources, {
      key,
      fetcher: async (url, options) => {
        budget.reserve(options.body);
        const response = await fetch(url, options);
        const body = await response.clone().json();
        let wire;
        try {
          wire = JSON.parse(body.choices?.[0]?.message?.content);
        } catch {}
        const resolved = resolveReferences(wire, catalog);
        const sanitized = sanitizeValues(resolved.result);
        const questioned = sanitizeQuestions(sanitized.result, sources);
        attempts.push({
          status: response.status,
          finishReason: body.choices?.[0]?.finish_reason,
          usage: body.usage,
          wireContent: body.choices?.[0]?.message?.content,
          errors: [
            ...resolved.errors,
            ...validateExtraction(questioned.result, sources, {
              requireQuestions: true,
            }),
          ],
        });
        return response;
      },
    });
  } catch (e) {
    error = e.code || "provider";
    errorMeta = e.meta;
  }
  const facts = output?.result?.facts || [],
    valid =
      Boolean(output) &&
      !validateExtraction(output.result, sources, { requireQuestions: true })
        .length;
  const quoteCoverage = c.requiredQuotes.every((quote) =>
    facts.some((f) => f.quote === quote),
  );
  const fieldCoverage = c.requiredFields.every((field) =>
    facts.some((f) => f.field === field),
  );
  results.push({
    id: c.id,
    round: c.round,
    english: c.english,
    error,
    errorMeta,
    valid,
    quoteCoverage,
    fieldCoverage,
    output,
    attempts,
  });
  console.log(
    c.round,
    c.id,
    error || "valid",
    "quotes",
    quoteCoverage,
    "fields",
    fieldCoverage,
  );
  await writeFile(
    destination,
    JSON.stringify(
      {
        status: "running",
        date: new Date().toISOString(),
        version: VERSION,
        kind: "Development verification and repeated cases; NOT a holdout",
        priorReservedINR: priorPaise / 100,
        budget: budget.snapshot(),
        combinedReservedINR: priorPaise / 100 + budget.snapshot().reservedINR,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  if (error === "budget") break;
}
let input = 0,
  outputTokens = 0,
  cached = 0;
for (const row of [...baseline.results, ...results])
  for (const a of row.attempts) {
    input += a.usage?.prompt_tokens || 0;
    outputTokens += a.usage?.completion_tokens || 0;
    cached += a.usage?.prompt_tokens_details?.cached_tokens || 0;
  }
const report = {
  status: results.length === scheduled.length ? "complete" : "budget-stopped",
  date: new Date().toISOString(),
  version: VERSION,
  kind: "Development verification and repeated cases; NOT a holdout",
  baseline: {
    cases: baseline.results.length,
    valid: baseline.results.filter((r) => !r.error).length,
  },
  verification: {
    cases: results.filter((r) => r.round === "verification").length,
    valid: results.filter((r) => r.round === "verification" && r.valid).length,
    quoteCoverage: results.filter(
      (r) => r.round === "verification" && r.quoteCoverage,
    ).length,
    fieldCoverage: results.filter(
      (r) => r.round === "verification" && r.fieldCoverage,
    ).length,
  },
  repeats: {
    cases: results.filter((r) => r.round === "repeat").length,
    valid: results.filter((r) => r.round === "repeat" && r.valid).length,
  },
  priorReservedINR: priorPaise / 100,
  budget: budget.snapshot(),
  combinedReservedINR: priorPaise / 100 + budget.snapshot().reservedINR,
  combinedUsage: {
    input,
    output: outputTokens,
    cached,
    estimatedINRNoCacheDiscount: (input * 10 + outputTokens * 25) / 1e6,
    estimatedINRWithCache:
      ((input - cached) * 10 + cached * 0.25 + outputTokens * 25) / 1e6,
  },
  limitations: [
    "Development cases, including repeats, not a fresh holdout.",
    "Classification and question usefulness still require clinician review.",
    "Historic frozen v3 holdout was not rerun.",
    "Usage-based cost estimate, not an account-balance measurement.",
  ],
  results,
};
await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      baseline: report.baseline,
      verification: report.verification,
      repeats: report.repeats,
      combinedReservedINR: report.combinedReservedINR,
      combinedUsage: report.combinedUsage,
    },
    null,
    2,
  ),
);
