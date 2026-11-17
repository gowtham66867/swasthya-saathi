import { sanitizeQuestions } from "./questions.js";
import {
  FACT_SCHEMA,
  VERSION,
  anchorEvidence,
  validateExtraction,
  clarify,
} from "./agent.js";
import { PROMPT } from "./prompts/intake-v3.mjs";
import { sanitizeValues } from "./values.js";
export class AgentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export async function runExtraction(
  sources,
  { key, model = "sarvam-105b", signal, fetcher = fetch } = {},
) {
  if (!["sarvam-105b", "sarvam-105b-conversations"].includes(model))
    throw new AgentError("configuration", "Unsupported extraction model.");
  if (
    typeof sources.english !== "string" ||
    !sources.english.trim() ||
    sources.english.length > 2000 ||
    typeof sources.clarifications !== "string" ||
    sources.clarifications.length > 2000
  )
    throw new AgentError(
      "input",
      "Provide English text and at most 2000 characters of clarification.",
    );
  const started = Date.now();
  let calls = 0;
  let repair = false;
  let usage = { input: 0, output: 0 };
  let issue = "";
  const fail = (code, message) => {
    const error = new AgentError(code, message);
    error.meta = {
      version: VERSION,
      mode: "live Sarvam",
      model,
      calls,
      repair,
      latencyMs: Date.now() - started,
      usage,
    };
    return error;
  };
  // A fixed application-owned plan. No tool call returned by the model is executed.
  while (calls < 3) {
    calls++;
    const response = await fetcher(
      "https://api.sarvam.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": key,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                PROMPT +
                "\nRequired JSON schema: " +
                JSON.stringify(FACT_SCHEMA) +
                (issue
                  ? "\nPrior result rejected: " +
                    issue +
                    ". Quote exactly ONE full sentence from the supplied source. Do not shorten, combine, translate or paraphrase it. Return a corrected extraction."
                  : ""),
            },
            { role: "user", content: JSON.stringify(sources) },
          ],
          max_tokens: 2200,
          reasoning_effort: "low",
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "patient_intake_v3",
              strict: true,
              schema: FACT_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(25000),
        ]),
      },
    );
    if (!response.ok) {
      if ([429, 502, 503, 504].includes(response.status) && calls === 1) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 300);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new AgentError("cancelled", "Request cancelled."));
            },
            { once: true },
          );
        });
        continue;
      }
      throw fail(
        "provider",
        "Sarvam extraction unavailable. Check access, credits, or retry later.",
      );
    }
    const body = await response.json();
    usage.input += Number(body.usage?.prompt_tokens) || 0;
    usage.output += Number(body.usage?.completion_tokens) || 0;
    let result;
    try {
      result = JSON.parse(body.choices?.[0]?.message?.content);
    } catch {
      result = null;
    }
    const anchored = anchorEvidence(result, sources);
    const sanitized = sanitizeValues(anchored.result);
    const questioned = sanitizeQuestions(sanitized.result, sources);
    result = questioned.result;
    const errors = validateExtraction(result, sources);
    if (!errors.length)
      return {
        result,
        valueFlags: sanitized.flags,
        questionFlags: questioned.flags,
        ...clarify(result, sources),
        meta: {
          evidenceExpansions: anchored.expansions,
          version: VERSION,
          mode: "live Sarvam",
          model,
          calls,
          repair,
          latencyMs: Date.now() - started,
          usage,
        },
      };
    if (repair)
      throw fail(
        "validation",
        "Extraction failed evidence validation. Review the text and try again.",
      );
    repair = true;
    issue = errors.join(", ");
  }
  throw fail(
    "budget",
    "Agent call limit reached. Review and retry explicitly.",
  );
}
