import { readFile, writeFile, mkdir } from "node:fs/promises";
import { runExtraction } from "../harness.mjs";
if (process.env.EVAL_LIVE !== "yes" || !process.env.SARVAM_API_KEY)
  throw Error("Explicit live opt-in and key required.");
const source = JSON.parse(
  await readFile(new URL("./speech-cases.v2.json", import.meta.url), "utf8"),
);
const cases = source.filter(
  (c) =>
    ["hi-IN", "ta-IN", "te-IN", "kn-IN"].includes(c.language) &&
    [
      "headache",
      "negation",
      "allergy-denial",
      "allergy-reported",
      "medication",
      "vague",
    ].some((tag) => c.id.endsWith("-" + tag)),
);
const additional = process.argv.includes("--additional"),
  resume = process.argv.includes("--resume");
const results =
  additional || resume
    ? JSON.parse(
        await readFile(
          new URL("./results/speech-v3.json", import.meta.url),
          "utf8",
        ),
      ).results
    : [];
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
let providerCalls = 0,
  rateLimitRetries = 0;
async function provider(endpoint, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (++providerCalls > 160) throw Error("Evaluation request budget reached");
    const form = body instanceof FormData;
    const response = await fetch("https://api.sarvam.ai/" + endpoint, {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY,
        ...(form ? {} : { "Content-Type": "application/json" }),
      },
      body: form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (response.status === 429 && attempt < 2) {
      rateLimitRetries++;
      const seconds = Math.min(
        20,
        Math.max(
          5,
          Number(response.headers.get("retry-after")) || 5 * (attempt + 1),
        ),
      );
      await new Promise((r) => setTimeout(r, seconds * 1000));
      continue;
    }
    if (!response.ok) throw Error(endpoint + " provider " + response.status);
    return response.json();
  }
}
import { characterError } from "./metrics.mjs";
function secondsWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  let byteRate = null,
    data = null;
  for (let i = 12; i + 8 <= buffer.length; ) {
    const size = buffer.readUInt32LE(i + 4),
      id = buffer.toString("ascii", i, i + 4);
    if (id === "fmt " && size >= 16) byteRate = buffer.readUInt32LE(i + 16);
    if (id === "data") data = size;
    i += 8 + size + (size % 2);
  }
  return byteRate && data ? data / byteRate : null;
}
for (const c of cases.filter(
  (c) =>
    (!additional || ["te-IN", "kn-IN"].includes(c.language)) &&
    (!resume || !results.some((r) => r.id === c.id && r.completed)),
)) {
  const started = Date.now();
  let row = { id: c.id, language: c.language, reference: c.original };
  try {
    const previous = results.find((r) => r.id === c.id);
    let transcript, translated, audioSeconds;
    if (process.argv.includes("--reextract") && previous?.translation) {
      row = {
        ...previous,
        priorExtractionAttempts: [
          ...(previous.priorExtractionAttempts || []),
          { error: previous.extractionError, meta: previous.meta },
        ],
      };
      delete row.error;
      delete row.extractionError;
      transcript = { transcript: previous.transcript };
      translated = { translated_text: previous.translation };
      audioSeconds = previous.audioSeconds;
    } else {
      const speech = await provider("text-to-speech", {
        text: c.original,
        language_code: c.language,
        model: "bulbul:v3",
        speaker: "shubh",
        output_audio_codec: "wav",
      });
      const bytes = Buffer.from(speech.audios[0], "base64");
      audioSeconds = secondsWav(bytes);
      row = {
        ...row,
        ttsCharacters: [...c.original].length,
        audioSeconds,
        ttsCompleted: true,
      };
      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes], { type: "audio/wav" }),
        "synthetic.wav",
      );
      form.append("model", "saaras:v3");
      form.append("mode", "transcribe");
      form.append("language_code", c.language);
      transcript = await provider("speech-to-text", form);
      row = {
        ...row,
        transcript: transcript.transcript,
        sttCompleted: true,
        cer: characterError(c.original, transcript.transcript),
        translationCharacters: [...transcript.transcript].length,
      };
      translated = await provider("translate", {
        input: transcript.transcript,
        source_language_code: c.language,
        target_language_code: "en-IN",
        model: "sarvam-translate:v1",
      });
      row = {
        ...row,
        transcript: transcript.transcript,
        translation: translated.translated_text,
        cer: characterError(c.original, transcript.transcript),
        audioSeconds,
        ttsCharacters: [...c.original].length,
        translationCharacters: [...transcript.transcript].length,
        speechCompleted: true,
      };
    }
    let extraction;
    try {
      extraction = await runExtraction(
        { english: translated.translated_text, clarifications: "" },
        { key: process.env.SARVAM_API_KEY },
      );
    } catch (e) {
      row.extractionError = e.code || "failure";
      row.meta = e.meta;
    }
    const text = translated.translated_text.toLowerCase();
    const checks = [];
    if (c.id.endsWith("-negation"))
      checks.push({
        name: "fever denial",
        pass: /(no|not|don't|do not|without).{0,50}fever/.test(text),
      });
    if (c.id.endsWith("-allergy-denial"))
      checks.push({
        name: "allergy denial",
        pass: /(no|not|don't|do not|without).{0,50}allerg/.test(text),
      });
    if (c.id.endsWith("-allergy-reported"))
      checks.push({
        name: "penicillin reported",
        pass: /penicillin/.test(text) && /allerg/.test(text),
      });
    if (c.id.endsWith("-medication"))
      checks.push(
        { name: "500 mg preserved", pass: /500\s*(mg|milligram)/.test(text) },
        { name: "metformin preserved", pass: /metformin/.test(text) },
      );
    if (c.id.endsWith("-headache"))
      checks.push({
        name: "three days preserved",
        pass: /(three|3)\s*days?/.test(text),
      });
    if (c.id.endsWith("-vague"))
      checks.push({
        name: "vague severity preserved",
        pass: /(little|slight|mild)/.test(text),
      });
    row = {
      ...row,
      transcript: transcript.transcript,
      translation: translated.translated_text,
      extraction: extraction?.result,
      meta: extraction?.meta || row.meta,
      cer: characterError(c.original, transcript.transcript),
      audioSeconds,
      ttsCharacters: [...c.original].length,
      translationCharacters: [...transcript.transcript].length,
      checks,
      completed: Boolean(extraction),
    };
  } catch (e) {
    row.error = e.message;
    row.completed = false;
  }
  row.recheckElapsedMs = row.priorExtractionAttempts
    ? Date.now() - started
    : undefined;
  row.elapsedMs =
    Date.now() -
    started +
    (row.priorExtractionAttempts ? row.elapsedMs || 0 : 0);
  const old = results.findIndex((r) => r.id === row.id);
  if (old >= 0) results[old] = row;
  else results.push(row);
  await writeFile(
    new URL("./results/speech-v3.json", import.meta.url),
    JSON.stringify({ status: "running", results }, null, 2),
  );
  console.log(
    `${results.length}/${cases.length} ${c.id} ${row.error || row.extractionError || "complete"}`,
  );
  await new Promise((r) => setTimeout(r, 3500));
}
const groups = (language) => {
  const rows = results.filter((r) => r.language === language),
    completed = rows.filter((r) => r.speechCompleted),
    checks = completed.flatMap((r) => r.checks);
  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const latency = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
  return {
    cases: rows.length,
    speechCompleted: completed.length,
    completed: rows.filter((r) => r.completed).length,
    weightedCER:
      completed.reduce((n, r) => n + r.cer.errors, 0) /
      Math.max(
        1,
        completed.reduce((n, r) => n + r.cer.referenceCharacters, 0),
      ),
    criticalChecksPassed: checks.filter((c) => c.pass).length,
    criticalChecksTotal: checks.length,
    p95Ms:
      latency[
        Math.min(latency.length - 1, Math.ceil(latency.length * 0.95) - 1)
      ],
    audioSeconds: sum("audioSeconds"),
    ttsCharacters: sum("ttsCharacters"),
    translationCharacters: sum("translationCharacters"),
    inputTokens: rows.reduce((n, r) => n + (r.meta?.usage?.input || 0), 0),
    outputTokens: rows.reduce((n, r) => n + (r.meta?.usage?.output || 0), 0),
  };
};
const summary = Object.fromEntries(
  ["hi-IN", "ta-IN", "te-IN", "kn-IN"].map((lang) => [lang, groups(lang)]),
);
let estimatedINR = 0;
for (const s of Object.values(summary))
  estimatedINR +=
    (s.ttsCharacters * 3) / 1000 +
    (s.translationCharacters * 2) / 1000 +
    (s.audioSeconds * 0.49) / 60 +
    (s.inputTokens * 10 + s.outputTokens * 25) / 1e6;
const report = {
  status: "complete",
  date: new Date().toISOString(),
  providerCallsInThisRun: providerCalls,
  rateLimitRetries,
  kind: "live synthetic speech round trip: Bulbul → Saaras → translation → extraction",
  models: {
    tts: "bulbul:v3",
    stt: "saaras:v3",
    translation: "sarvam-translate:v1",
    extraction: "sarvam-105b",
  },
  summary,
  estimatedINR,
  pricing:
    "Published pay-as-you-go rates; excludes GST/cloud; no cache discount. Failed-call billing and rounding may differ.",
  limitations: [
    "Machine-generated quiet audio, not human recordings or clinic noise.",
    "Same-provider synthesis/recognition can bias results upward.",
    "CER ignores punctuation, spaces and symbols; numerals and word choices can still differ.",
    "Critical checks are small lexical probes, not semantic or clinical accuracy.",
    "No fluent-speaker or clinician adjudication.",
  ],
  results,
};
await writeFile(
  new URL("./results/speech-v3.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ summary, estimatedINR }, null, 2));
