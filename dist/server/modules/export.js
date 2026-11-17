import { VERSION, handoff } from "../agent.js";
import { timingObservation } from "../review-tools.js";
export function downloadObject(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function assertExportable({ text, reviewed, state }) {
  if (!text || !reviewed || !["approved", "exported"].includes(state))
    throw Error("Create a reviewed handoff first.");
}
export function downloadText(text, name) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function prepareReviewExport(data) {
  const {
    reviewer,
    role,
    originalAnswers,
    signals,
    languageCode,
    timing,
    ...input
  } = data;
  if (!reviewer?.trim()) throw Error("Reviewer reference required.");
  const acceptance = {
    reviewer: reviewer.trim(),
    role,
    selfAttested: true,
    acceptedAt: new Date().toISOString(),
    clinicianValidationStudy: false,
  };
  const text =
    handoff(input) +
    "\n\nREVIEW ACCEPTANCE (self-attested)\n" +
    acceptance.reviewer +
    " · " +
    acceptance.role +
    " · " +
    acceptance.acceptedAt +
    "\n\nORIGINAL CLARIFICATION ANSWERS\n" +
    (originalAnswers || "Not provided") +
    "\n\nREVIEW FLAGS\n" +
    (signals
      .map((s) => s.text + (s.quote ? " “" + s.quote + "”" : ""))
      .join("\n") || "No automatic flags; human review still required.");
  return {
    text,
    acceptance,
    packet: {
      kind: "patient-reported intake review — not an EHR record",
      schema: VERSION,
      patientReference: input.reference,
      language: languageCode,
      original: input.original,
      english: input.english,
      clarifications: input.clarifications,
      originalAnswers,
      facts: input.result.facts,
      ambiguities: input.result.ambiguities,
      signals,
      corrections: input.corrections,
      valueCorrections: input.valueCorrections,
      translationConfirmation: input.translationConfirmation,
      acceptance,
      timing: timingObservation(timing),
    },
  };
}
