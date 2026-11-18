import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FACT_SCHEMA, validateExtraction } from "../agent.js";
import { CASES } from "../sample-cases.js";
test("published schema equals runtime schema and all demo fixtures remain valid", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../prompts/intake-v3.schema.json", import.meta.url),
    ),
  );
  assert.deepEqual(schema, FACT_SCHEMA);
  for (const name of [".gitignore", ".gcloudignore"]) {
    const ignores = await readFile(
      new URL("../" + name, import.meta.url),
      "utf8",
    );
    assert.ok(ignores.includes("evals/audio-private/"));
  }
  for (const c of CASES)
    assert.deepEqual(
      validateExtraction(c.expected, {
        english: c.english,
        clarifications: "",
      }),
      [],
    );
  assert.ok(
    CASES.some((c) => c.expected.facts.some((f) => f.value?.dose === "500")),
  );
});
test("README headlines agree with historical data and demo contains confirmation", async () => {
  const report = JSON.parse(
    await readFile(new URL("../evals/results/text-live.json", import.meta.url)),
  );
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  assert.ok(
    readme.includes((report.holdout.factRecall * 100).toFixed(1) + "%"),
  );
  assert.ok(
    readme.includes((report.holdout.factPrecision * 100).toFixed(1) + "%"),
  );
  assert.match(readme, /historical|Historical/);
  const demo = await readFile(new URL("../demo.html", import.meta.url), "utf8");
  assert.match(demo, /back-translation/);
  assert.match(demo, /confirmation/);
  const evidence = JSON.parse(
    await readFile(new URL("../evaluation.json", import.meta.url)),
  );
  assert.equal(evidence.clockTimeDevelopment.verification.valid, 6);
  assert.equal(evidence.clockTimeDevelopment.repeats.valid, 3);
  assert.equal(evidence.v3PartialHoldout.attempted, 4);
  assert.equal(evidence.implementation.fullCurrentHoldoutEvaluated, false);
});
