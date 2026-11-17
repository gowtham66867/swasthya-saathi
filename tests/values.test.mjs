import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeValues, valueIssues, factKey } from "../values.js";
import { validateExtraction, handoff, VERSION } from "../agent.js";
const fact = {
  field: "medicines",
  quote: "I take amlodipine 2.5 mg daily.",
  sourceId: "english",
  value: { name: "amlodipine", dose: "2.5", unit: "mg", frequency: "daily" },
};
test("v3 supports extractive proposed values", () => {
  assert.equal(VERSION, "intake-v3");
  assert.deepEqual(valueIssues(fact), []);
  assert.deepEqual(
    validateExtraction(
      { facts: [fact], ambiguities: [] },
      { english: fact.quote, clarifications: "" },
    ),
    [],
  );
});
for (const value of [
  { name: "metformin" },
  { unit: "g" },
  { dose: "5" },
  { frequency: "twice daily" },
  { diagnosis: "hypertension" },
  { negated: true },
])
  test(
    "unsupported value removed, quote retained: " + JSON.stringify(value),
    () => {
      const r = sanitizeValues({
        facts: [{ ...fact, value }],
        ambiguities: [],
      });
      assert.equal(r.result.facts[0].value, undefined);
      assert.equal(r.result.facts[0].quote, fact.quote);
      assert.equal(r.flags.length, 1);
    },
  );
test("negation must match explicit denial; uncertainty is not denial", () => {
  assert.deepEqual(
    valueIssues({
      field: "allergies",
      quote: "I have no known drug allergies.",
      value: { type: "drug", negated: true },
    }),
    [],
  );
  assert.ok(
    valueIssues({
      field: "allergies",
      quote: "I am not sure whether I have allergies.",
      value: { negated: true },
    }).length,
  );
  assert.ok(
    valueIssues({
      field: "allergies",
      quote: "I have no known allergies.",
      value: { negated: false },
    }).length,
  );
});
test("values remain paired with quotes in handoff and operator edits are separate", () => {
  const result = { facts: [fact], ambiguities: [] };
  const text = handoff({
    result,
    english: fact.quote,
    original: fact.quote,
    translationConfirmation: {
      confirmed: true,
      readAloud: true,
      original: fact.quote,
      english: fact.quote,
      backTranslation: fact.quote,
      confirmedAt: "test",
    },
    reviewed: true,
    state: "approved",
    valueCorrections: { [factKey(fact)]: "confirm dose" },
  });
  assert.match(text, /Evidence.*I take amlodipine/);
  assert.match(text, /Proposed — verify against quote/);
  assert.match(text, /Operator value correction/);
  assert.equal(result.facts[0].value.dose, "2.5");
});
