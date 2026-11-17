import {
  QUESTION_SCHEMA,
  questionIssues,
  proposedQuestions,
} from "./questions.js";
import { confirmationMatches } from "./translation-checks.js";
import { VALUE_SCHEMA, valueIssues, factKey } from "./values.js";
import { evidenceUnits, wholeEvidence } from "./sentence.js";
export const VERSION = "intake-v3";
export const FIELDS = [
  "concern",
  "symptoms",
  "duration",
  "severity",
  "medicines",
  "allergies",
  "history",
  "questions",
];
export const LABELS = {
  concern: "Main concern",
  symptoms: "Reported symptoms",
  duration: "Onset / duration",
  severity: "Severity in patient’s words",
  medicines: "Current medicines",
  allergies: "Allergies",
  history: "Reported history",
  questions: "Patient questions",
};
export const FACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facts", "ambiguities", "questions"],
  properties: {
    questions: QUESTION_SCHEMA,
    facts: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "quote", "sourceId"],
        properties: {
          field: { type: "string", enum: FIELDS },
          quote: { type: "string", minLength: 1, maxLength: 500 },
          sourceId: { type: "string", enum: ["english", "clarifications"] },
          value: VALUE_SCHEMA,
        },
      },
    },
    ambiguities: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "sourceId"],
        properties: {
          quote: { type: "string", minLength: 1, maxLength: 500 },
          sourceId: { type: "string", enum: ["english", "clarifications"] },
        },
      },
    },
  },
};
// Expand only contiguous source tokens to their unique, complete source sentence.
// This changes quotation boundaries, never the patient's words or the field label.
export function anchorEvidence(result, sources) {
  if (
    !result ||
    !Array.isArray(result.facts) ||
    !Array.isArray(result.ambiguities)
  )
    return { result, expansions: 0 };
  const tokens = (s) =>
    (
      s
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{M}\p{N}]+/gu) || []
    ).join(" ");
  let expansions = 0;
  const anchor = (f) => {
    if (
      !f ||
      typeof f.quote !== "string" ||
      typeof sources[f.sourceId] !== "string"
    )
      return f;
    const sentences = evidenceUnits(sources[f.sourceId], f.sourceId);
    if (sentences.includes(f.quote)) return f;
    const needle = tokens(f.quote);
    if (!needle) return f;
    const matches = sentences.filter(
      (s) =>
        s.length <= 500 && (" " + tokens(s) + " ").includes(" " + needle + " "),
    );
    if (matches.length !== 1) return f;
    expansions++;
    return { ...f, quote: matches[0] };
  };
  const dedupe = (rows) => [
    ...new Map(rows.map((f) => [JSON.stringify(f), f])).values(),
  ];
  return {
    result: {
      ...result,
      facts: dedupe(result.facts.map(anchor)),
      ambiguities: dedupe(result.ambiguities.map(anchor)),
    },
    expansions,
  };
}
export function validateExtraction(
  result,
  sources,
  { requireQuestions = false } = {},
) {
  const errors = [];
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some(
      (k) => !["facts", "ambiguities", "questions"].includes(k),
    ) ||
    !Array.isArray(result.facts) ||
    !Array.isArray(result.ambiguities)
  )
    return ["Invalid extraction schema"];
  if (requireQuestions && !Array.isArray(result.questions))
    errors.push("Questions array required for v3 model output");
  if (result.questions !== undefined) {
    if (!Array.isArray(result.questions) || result.questions.length > 3)
      errors.push("Invalid questions");
    else
      for (const question of result.questions)
        errors.push(...questionIssues(question, sources));
  }
  if (result.facts.length > 24 || result.ambiguities.length > 6)
    errors.push("Too many results");
  for (const fact of [...result.facts, ...result.ambiguities]) {
    const keys = result.facts.includes(fact)
      ? ["field", "quote", "sourceId", "value"]
      : ["quote", "sourceId"];
    if (
      !fact ||
      typeof fact !== "object" ||
      Object.keys(fact).some((k) => !keys.includes(k)) ||
      keys.filter((k) => k !== "value").some((k) => typeof fact[k] !== "string")
    ) {
      errors.push("Invalid fact schema");
      continue;
    }
    if (keys.includes("field") && !FIELDS.includes(fact.field))
      errors.push("Field not allowed");
    if (keys.includes("field")) errors.push(...valueIssues(fact));
    if (
      !["english", "clarifications"].includes(fact.sourceId) ||
      !fact.quote.trim() ||
      fact.quote.length > 500 ||
      !sources[fact.sourceId]?.includes(fact.quote)
    )
      errors.push("Evidence does not match source");
    if (!wholeEvidence(fact.quote, sources[fact.sourceId], fact.sourceId))
      errors.push(
        "Quote must preserve the full sentence or clarification answer",
      );
    // Evidence is displayed verbatim: the model cannot introduce a separate unsupported value.
  }
  const unique = new Set(result.facts.map(factKey));
  if (unique.size !== result.facts.length) errors.push("Duplicate fact");
  return errors;
}
export function clarify(result, sources = {}) {
  const missing = FIELDS.filter(
    (field) => !result.facts.some((f) => f.field === field),
  );
  const proposed = proposedQuestions(result, sources);
  if (proposed.length) return { missing, questions: proposed };
  const questions = [];
  if (result.ambiguities.length)
    questions.push({
      field: "ambiguities",
      text: "Please clarify the statements marked as ambiguous below. If unsure, leave them unresolved.",
    });
  for (const [field, text] of [
    ["duration", "When did this concern start?"],
    ["medicines", "What medicines are you currently taking, if any?"],
    ["allergies", "Do you have any known allergies?"],
  ])
    if (missing.includes(field)) questions.push({ field, text });
  return { missing, questions: questions.slice(0, 3) };
}
export { Workflow } from "./modules/workflow.js";
export function handoff({
  reference,
  language,
  original,
  english,
  clarifications = "",
  result,
  corrections = {},
  valueCorrections = {},
  translationConfirmation,
  reviewed,
  state,
  mode,
}) {
  if (!reviewed || !["approved", "exported"].includes(state))
    throw Error("Patient review is required before export.");
  if (!confirmationMatches(translationConfirmation, original, english))
    throw Error("Translation confirmation is stale.");
  if (validateExtraction(result, { english, clarifications }).length)
    throw Error("Invalid evidence. Extract again before export.");
  const rows = FIELDS.map((field) => {
    const facts = result.facts.filter((f) => f.field === field);
    const correction = corrections[field]?.trim();
    return `${LABELS[field]}: ${correction ? correction + " [operator correction — confirm with patient]" : facts.length ? facts.map((f) => f.quote).join(" | ") : "Unknown — not reported"}\n${facts.map((f) => `  Evidence (${f.sourceId}): “${f.quote}”${f.value ? "\n  Proposed — verify against quote: " + JSON.stringify(f.value) : ""}${valueCorrections[factKey(f)] ? "\n  Operator value correction — confirm with patient: " + valueCorrections[factKey(f)] : ""}`).join("\n")}`;
  });
  return [
    "SWASTHYA SAATHI · PATIENT-REPORTED HANDOFF",
    "For clinician review · no diagnosis or urgency assessment",
    `Reference: ${reference || "Not provided"}`,
    `Language: ${language}`,
    `Mode: ${mode}`,
    `Prompt/schema: ${VERSION}`,
    `Created: ${new Date().toISOString()}`,
    "",
    "ORIGINAL PATIENT WORDS",
    original,
    "",
    "ENGLISH VERSION — operator reviewed",
    english,
    "",
    "TRANSLATION CONFIRMATION",
    JSON.stringify(translationConfirmation),
    "",
    "CLARIFICATIONS — operator recorded",
    clarifications || "Not provided",
    "",
    ...rows,
    "",
    "UNRESOLVED / AMBIGUOUS",
    ...result.ambiguities.map((a) => `“${a.quote}” (${a.sourceId})`),
    "",
    "Missing fields may remain unknown. Confirm details directly with the patient. Translation and classification can contain errors.",
  ].join("\n");
}

export function retainAnswers(result, answers) {
  const facts = [...result.facts];
  for (const answer of answers)
    if (
      FIELDS.includes(answer.field) &&
      answer.text?.trim() &&
      !facts.some(
        (f) =>
          f.field === answer.field &&
          f.sourceId === "clarifications" &&
          f.quote === answer.text,
      )
    )
      facts.push({
        field: answer.field,
        quote: answer.text,
        sourceId: "clarifications",
      });
  return { ...result, facts };
}
