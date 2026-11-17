import test from "node:test";
import assert from "node:assert/strict";
import { segmentSentences, wholeEvidence } from "../sentence.js";
import { anchorEvidence, validateExtraction } from "../agent.js";
for (const [source, bad] of [
  ["I take amlodipine 2.5 mg daily.", "5 mg daily."],
  ["I take amlodipine 2.5 mg daily.", "I take amlodipine 2."],
  ["Dr. Rao said I do not have diabetes.", "Rao said I do not have diabetes."],
])
  test("reject truncated evidence: " + bad, () => {
    const result = {
      facts: [{ field: "medicines", quote: bad, sourceId: "english" }],
      ambiguities: [],
    };
    const sources = { english: source, clarifications: "" };
    assert.ok(validateExtraction(result, sources).length);
    const anchored = anchorEvidence(result, sources);
    if (anchored.expansions)
      assert.equal(anchored.result.facts[0].quote, source);
  });
for (const text of [
  "I take 2.5 mg and 0.25 mg daily.",
  "Dr. Rao saw Mr. Kumar and Mrs. Rao at 9 a.m.",
  "Use 5 mg. daily, e.g. after food, i.e. at 8 p.m.",
  "No. 5 is my reference.",
  "No terminal punctuation",
])
  test("complete evidence unit: " + text, () => {
    assert.deepEqual(segmentSentences(text), [text]);
    assert.ok(wholeEvidence(text, text, "english"));
  });
test("danda, newlines and repeated identical sentences", () => {
  assert.deepEqual(
    segmentSentences("दर्द है। बुखार नहीं है।\nNo fever. No fever."),
    ["दर्द है।", "बुखार नहीं है।", "No fever.", "No fever."],
  );
  assert.ok(wholeEvidence("No fever.", "No fever. No fever.", "english"));
  assert.ok(
    wholeEvidence(
      "I do not know. I will check.",
      "medicines: I do not know. I will check.",
      "clarifications",
    ),
  );
  assert.equal(
    wholeEvidence("Rao is here.", "Dr. Rao is here.", "english"),
    false,
  );
});
