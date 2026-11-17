import { FIELDS, LABELS, clarify } from "../agent.js";
import { reviewOverview } from "../review-tools.js";
import { factKey } from "../values.js";
export function renderFactCards({
  $,
  t,
  result,
  corrections,
  valueCorrections,
  signals,
  mode,
  clarifications,
  invalidateReviewer,
}) {
  $("facts").replaceChildren();
  const pending = clarify(result, {
    english: $("english").value,
    clarifications,
  });
  const overview = reviewOverview(result, corrections);
  $("overview").hidden = false;
  $("overview").replaceChildren();
  for (const text of [
    `${overview.known.length}/8 fields reported · ${overview.unknown.length} unknown`,
    ...signals.map((s) => `${s.text} “${s.quote}” (${s.sourceId})`),
  ]) {
    const p = document.createElement("p");
    p.textContent = text;
    $("overview").append(p);
  }
  for (const field of FIELDS) {
    const card = document.createElement("section");
    card.className = "fact-card";
    const h = document.createElement("h3");
    h.textContent = LABELS[field];
    card.append(h);
    const facts = result.facts.filter((f) => f.field === field);
    if (!facts.length) {
      const p = document.createElement("p");
      p.className = "unknown";
      p.textContent = t("unknown");
      card.append(p);
    }
    for (const f of facts) {
      const q = document.createElement("blockquote");
      q.textContent = f.quote;
      const small = document.createElement("small");
      small.textContent = `Evidence: ${f.sourceId} · ${f.sourceId === "clarifications" ? "operator-recorded answer" : mode === "sample" ? "sample fixture" : "extracted"} · classification requires review`;
      card.append(q, small);
      if (f.value) {
        const label = document.createElement("label");
        label.textContent = "Proposed — verify against quote";
        const input = document.createElement("input");
        input.maxLength = 500;
        input.value = valueCorrections[factKey(f)] || JSON.stringify(f.value);
        input.addEventListener("input", () => {
          valueCorrections[factKey(f)] = input.value;
          invalidateReviewer();
        });
        label.append(input);
        card.append(label);
      }
    }
    const label = document.createElement("label");
    label.textContent = "Optional operator correction";
    const input = document.createElement("input");
    input.maxLength = 500;
    input.placeholder = "Keep evidence above, or record a correction";
    input.value = corrections[field] || "";
    input.addEventListener("input", () => {
      corrections[field] = input.value;
      invalidateReviewer();
    });
    label.append(input);
    card.append(label);
    $("facts").append(card);
  }
  if (result.ambiguities.length) {
    const warn = document.createElement("p");
    warn.className = "review-note";
    warn.textContent =
      "Unresolved / ambiguous: " +
      result.ambiguities.map((a) => `“${a.quote}”`).join(" · ");
    $("facts").append(warn);
  }
  return pending;
}

export async function renderQuestions({
  $,
  t,
  questions,
  requireConsent,
  api,
  signal,
  check,
  speakText,
  startCapture,
}) {
  $("questions").replaceChildren();
  for (const question of questions) {
    const label = document.createElement("label");
    let patientQuestion = t(question.field);
    let questionLocalized = true;
    if (question.proposed) {
      patientQuestion = question.text;
      if ($("language").value !== "en-IN") {
        try {
          requireConsent();
          const translated = await api(
            "translate",
            {
              text: question.text,
              language: $("language").value,
              direction: "back",
            },
            signal,
          );
          check();
          patientQuestion = translated.translated_text;
        } catch (e) {
          if (e.name === "AbortError") throw e;
          questionLocalized = false;
          patientQuestion =
            "Intake worker: translate the English question below for the patient.";
        }
      }
    }
    label.textContent = patientQuestion;
    if (question.proposed) {
      const english = document.createElement("small");
      english.textContent =
        "Operator: " + question.text + " · Evidence: " + question.quote;
      label.append(english);
    }
    const input = document.createElement("textarea");
    input.rows = 2;
    input.maxLength = 300;
    input.dataset.field = question.field;
    input.placeholder = t("optional");
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "text-button";
    listen.textContent = t("listen");
    listen.disabled = !questionLocalized;
    if (!questionLocalized) listen.dataset.unavailable = "true";
    listen.onclick = () => speakText(patientQuestion);
    const recordAnswer = document.createElement("button");
    recordAnswer.type = "button";
    recordAnswer.className = "text-button";
    recordAnswer.textContent = t("answer");
    recordAnswer.onclick = () => startCapture(input, recordAnswer);
    label.append(input, listen, recordAnswer);
    $("questions").append(label);
  }
}
