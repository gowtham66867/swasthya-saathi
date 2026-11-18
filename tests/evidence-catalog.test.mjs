import test from "node:test";
import assert from "node:assert/strict";
import {
  evidenceCatalog,
  referenceSchema,
  resolveReferences,
} from "../evidence-catalog.js";
import { validateExtraction } from "../agent.js";
import { runExtraction } from "../harness.mjs";
const sources = {
  english: "Ms. Rao said the pain began at 3 a.m.\nI take 1.75 mg at 8 p.m.",
  clarifications: "allergies: I have no known allergies.",
};
test("catalog IDs preserve complete times, decimals, titles and clarification answers", () => {
  const catalog = evidenceCatalog(sources);
  assert.equal(catalog[0].quote, "Ms. Rao said the pain began at 3 a.m.");
  const wire = {
    facts: [
      { field: "duration", evidenceId: "E0" },
      {
        field: "medicines",
        evidenceId: "E1",
        value: { dose: "1.75", unit: "mg" },
      },
    ],
    ambiguities: [],
    questions: [],
  };
  const resolved = resolveReferences(wire, catalog);
  assert.deepEqual(resolved.errors, []);
  assert.deepEqual(
    validateExtraction(resolved.result, sources, { requireQuestions: true }),
    [],
  );
  assert.equal(resolved.result.facts[1].quote, sources.english.split("\n")[1]);
  const clarification = catalog.find(
    (s) =>
      s.sourceId === "clarifications" &&
      s.quote === "I have no known allergies.",
  );
  assert.ok(clarification);
  assert.equal(
    resolveReferences(
      {
        facts: [{ field: "allergies", evidenceId: clarification.id }],
        ambiguities: [],
        questions: [],
      },
      catalog,
    ).result.facts[0].sourceId,
    "clarifications",
  );
});
test("wire schema only permits IDs from the application catalog, never provider quotes", () => {
  const catalog = evidenceCatalog(sources),
    schema = referenceSchema(catalog);
  assert.deepEqual(
    schema.properties.facts.items.properties.evidenceId.enum,
    catalog.map((s) => s.id),
  );
  assert.equal(schema.properties.facts.items.properties.quote, undefined);
  for (const item of [
    { field: "duration", evidenceId: "missing" },
    { field: "duration", evidenceId: "E0", quote: "3 a.0." },
  ])
    assert.ok(
      resolveReferences(
        { facts: [item], ambiguities: [], questions: [] },
        catalog,
      ).errors.length,
    );
});
test("duplicate source sentences share one ID and overflow fails instead of truncating", () => {
  assert.equal(evidenceCatalog({ english: "No fever. No fever." }).length, 1);
  assert.throws(
    () =>
      evidenceCatalog({
        english: Array.from(
          { length: 65 },
          (_, i) => "Statement " + i + ".",
        ).join("\n"),
      }),
    /Too many/,
  );
});
test("unsupported question reference falls back while fact references remain valid", async () => {
  const output = await runExtraction(
    { english: sources.english, clarifications: "" },
    {
      key: "mock",
      fetcher: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  facts: [{ field: "duration", evidenceId: "E0" }],
                  ambiguities: [],
                  questions: [
                    {
                      field: "duration",
                      evidenceId: "missing",
                      text: "When did it start?",
                    },
                  ],
                }),
              },
            },
          ],
        }),
    },
  );
  assert.equal(output.questionFlags.length, 1);
  assert.equal(output.result.facts[0].quote, sources.english.split("\n")[0]);
});
test("length-limited malformed JSON gets one bounded repair with content-free diagnostics", async () => {
  let calls = 0;
  const out = await runExtraction(
    { english: "Private fictional words at 6 a.m.", clarifications: "" },
    {
      key: "mock",
      fetcher: async () => {
        calls++;
        return calls === 1
          ? Response.json({
              choices: [
                { finish_reason: "length", message: { content: '{"facts":' } },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 2200 },
            })
          : Response.json({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      facts: [{ field: "duration", evidenceId: "E0" }],
                      ambiguities: [],
                      questions: [],
                    }),
                  },
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 50 },
            });
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(out.meta.diagnostics[0].finishReason, "length");
  assert.equal(out.meta.diagnostics[0].jsonParsed, false);
  assert.equal(JSON.stringify(out.meta).includes("Private fictional"), false);
  assert.equal(out.meta.evidenceProtocol, "catalog-ids-v1");
});
test("unknown fact references never become quotations and final errors retain diagnostics", async () => {
  let calls = 0;
  await assert.rejects(
    runExtraction(
      { english: "I have pain at 4 p.m.", clarifications: "" },
      {
        key: "mock",
        fetcher: async () => {
          calls++;
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    facts: [{ field: "duration", evidenceId: "invented" }],
                    ambiguities: [],
                    questions: [],
                  }),
                },
              },
            ],
          });
        },
      },
    ),
    (e) =>
      e.code === "validation" &&
      e.meta.diagnostics.length === 2 &&
      e.meta.diagnostics[0].validationErrors.includes("unknown_evidence_id"),
  );
  assert.equal(calls, 2);
});
