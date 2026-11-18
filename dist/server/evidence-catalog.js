import { evidenceUnits } from "./sentence.js";
import { FIELDS } from "./agent.js";
import { VALUE_SCHEMA } from "./values.js";
// Application-owned quotations: the provider selects opaque IDs, never rewrites
// patient words. This wire schema is distinct from the public handoff schema.
export function evidenceCatalog(sources) {
  const catalog = [];
  for (const sourceId of ["english", "clarifications"]) {
    const quotes = [
      ...new Set(evidenceUnits(sources[sourceId] || "", sourceId)),
    ];
    for (const [index, quote] of quotes.entries())
      catalog.push({
        id: (sourceId === "english" ? "E" : "C") + index,
        sourceId,
        quote,
      });
  }
  if (catalog.length > 64)
    throw Error("Too many source evidence units; shorten the input.");
  return catalog;
}
export function referenceSchema(catalog) {
  const evidenceId = { type: "string", enum: catalog.map((s) => s.id) };
  return {
    type: "object",
    additionalProperties: false,
    required: ["facts", "ambiguities", "questions"],
    properties: {
      facts: {
        type: "array",
        maxItems: 24,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "evidenceId"],
          properties: {
            field: { type: "string", enum: FIELDS },
            evidenceId,
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
          required: ["evidenceId"],
          properties: { evidenceId },
        },
      },
      questions: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "evidenceId", "text"],
          properties: {
            field: { type: "string", enum: FIELDS },
            evidenceId,
            text: { type: "string", minLength: 1, maxLength: 240 },
          },
        },
      },
    },
  };
}
export function resolveReferences(wire, catalog) {
  const errors = [];
  if (
    !wire ||
    typeof wire !== "object" ||
    Array.isArray(wire) ||
    Object.keys(wire).some(
      (k) => !["facts", "ambiguities", "questions"].includes(k),
    ) ||
    !Array.isArray(wire.facts) ||
    !Array.isArray(wire.ambiguities)
  )
    return { result: null, errors: ["Invalid reference schema"] };
  const byId = new Map(catalog.map((row) => [row.id, row]));
  const resolve = (item, kind) => {
    const allowed =
      kind === "fact"
        ? ["field", "evidenceId", "value"]
        : kind === "question"
          ? ["field", "evidenceId", "text"]
          : ["evidenceId"];
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      Object.keys(item).some((k) => !allowed.includes(k))
    ) {
      errors.push("Invalid " + kind + " reference shape");
      return {};
    }
    const source = byId.get(item.evidenceId);
    if (!source) {
      errors.push("Unknown " + kind + " evidence ID");
      return {};
    }
    const result = { quote: source.quote, sourceId: source.sourceId };
    if (kind !== "ambiguity") result.field = item.field;
    if (kind === "fact" && item.value !== undefined) result.value = item.value;
    if (kind === "question") result.text = item.text;
    return result;
  };
  const facts = wire.facts.map((item) => resolve(item, "fact"));
  const ambiguities = wire.ambiguities.map((item) =>
    resolve(item, "ambiguity"),
  );
  // Invalid questions go through the established template fallback path.
  const questions = Array.isArray(wire.questions)
    ? wire.questions.map((item) => {
        const previous = errors.length,
          result = resolve(item, "question");
        errors.splice(previous);
        return result;
      })
    : wire.questions;
  return {
    result: {
      facts,
      ambiguities,
      ...(questions !== undefined ? { questions } : {}),
    },
    errors,
  };
}
