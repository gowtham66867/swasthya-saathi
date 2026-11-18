import test from "node:test";
import assert from "node:assert/strict";
import { createRequestBudget } from "../evals/request-budget.mjs";
const body = JSON.stringify({
  model: "sarvam-105b",
  max_tokens: 2200,
  messages: [{ role: "user", content: "Fictional input" }],
});
test("evaluation refuses request 26 before network and never exceeds INR 15 reserved", () => {
  const budget = createRequestBudget();
  for (let i = 0; i < 25; i++) budget.reserve(body);
  assert.equal(budget.snapshot().reservedINR, 15);
  assert.throws(
    () => budget.reserve(body),
    (e) => e.code === "budget",
  );
  assert.equal(budget.snapshot().calls, 25);
});
test("unsupported model, output cap and oversized prompt cannot consume the budget", () => {
  const budget = createRequestBudget();
  for (const change of [
    { model: "other" },
    { max_tokens: 5000 },
    { messages: [{ content: "a".repeat(12001) }] },
  ])
    assert.throws(() =>
      budget.reserve(JSON.stringify({ ...JSON.parse(body), ...change })),
    );
  assert.equal(budget.snapshot().calls, 0);
});
