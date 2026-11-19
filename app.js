import { createRecording } from "./modules/recording.js";
import { renderFactCards, renderQuestions } from "./modules/review.js";
import {
  downloadObject,
  downloadText,
  prepareReviewExport,
  assertExportable,
} from "./modules/export.js";
import {
  translationSignals,
  confirmationMatches,
} from "./translation-checks.js";
import { tr, applyLocale } from "./modules/i18n.js";
import {
  applyReviewRules,
  timingObservation,
  canApprove,
  mergeReviewSignals,
} from "./review-tools.js";
import {
  VERSION,
  Workflow,
  validateExtraction,
  retainAnswers,
} from "./agent.js";
import { CASES } from "./sample-cases.js";
const $ = (id) => document.getElementById(id);
const flow = new Workflow();
let ready = false,
  mode = "manual",
  loaded = null,
  result = null,
  clarifications = "",
  corrections = {},
  valueCorrections = {},
  busy = false,
  controller = null,
  requestSerial = 0;
let backTranslation = "",
  backRead = false,
  translationConfirmation = null;
let startedAt = null,
  assistedMs = null,
  manualStarted = null,
  manualMs = null,
  manualCaseId = null,
  originalAnswers = "",
  signals = [],
  reviewPacket = null;
const capture = createRecording({
  $,
  t: (key) => t(key),
  flow,
  isBusy: () => busy,
  getRevision: () => requestSerial,
  requireConsent,
  observeStart,
  resetDerived,
  move,
  setBusy,
  status: (message) => status(message),
  task,
  api,
  onTranscript(text) {
    $("transcript").value = text;
    $("english").value = "";
    mode = "live";
    loaded = null;
    move("transcribed");
    $("source").textContent = "Sarvam transcript";
    status(t("recorded"));
  },
});
const { startCapture, speakText } = capture;
const t = (key) => tr($("language").value, key);
const localizedStatus = {
  "Fictional case loaded. Translation and extraction are prewritten; no API calls.":
    "sampleLoaded",
  "Facts ready. Verify the full quotes and their categories.": "factsReady",
  "Ready for human review. Unanswered details remain unknown.": "reviewReady",
  "Session cleared.": "cleared",
  "Transcript ready. Review and translate.": "recorded",
  "Translation ready. Check numbers, negations, and names.": "translated",
  "Translating with Sarvam…": "translating",
  "Extracting evidence with Sarvam…": "extracting",
  "Checking clarification evidence…": "saving",
};
const status = (message) => {
  $("status").textContent = localizedStatus[message]
    ? t(localizedStatus[message])
    : message;
};
function observeStart() {
  if (startedAt === null) {
    startedAt = performance.now();
    assistedMs = null;
  }
}
function invalidateReviewer() {
  clearApproval();
  if (["approved", "exported"].includes(flow.state)) {
    flow.state = "awaiting_review";
    renderState();
  }
}
const renderState = () => {
  $("workflow").textContent = flow.state;
};
function move(state) {
  flow.move(state);
  renderState();
}
function cleanAudio() {
  capture.cleanAudio();
}
function clearApproval() {
  $("critical-reviewed").checked = false;
  $("reviewed").checked = false;
  $("summary-box").hidden = true;
  $("summary").textContent = "";
  reviewPacket = null;
}
function resetDerived() {
  backTranslation = "";
  backRead = false;
  translationConfirmation = null;
  $("back-words").textContent = "";
  $("translation-agreed").checked = false;
  $("translation-flags").textContent = "";
  controller?.abort();
  requestSerial++;
  flow.reset();
  renderState();
  result = null;
  clarifications = "";
  corrections = {};
  valueCorrections = {};
  signals = [];
  originalAnswers = "";
  $("overview").hidden = true;
  $("clarification-source").hidden = true;
  $("facts").replaceChildren();
  $("questions").replaceChildren();
  $("clarification-panel").hidden = true;
  $("agent-meta").textContent = "";
  clearApproval();
  cleanAudio();
}
function translatedState() {
  flow.reset();
  move("consented");
  move("transcribed");
  move("translated");
}
function populateCases() {
  const options = CASES.filter((c) => c.language === $("language").value);
  $("sample").disabled = !options.length;
  $("case").disabled = !options.length;
  $("case").replaceChildren(
    ...options.map((c) => new Option(c.id.split("-").slice(2).join("-"), c.id)),
  );
}
function requireConsent() {
  if (!$("consent").checked) throw Error(t("noConsent"));
  if (!ready)
    throw Error("Live Sarvam is not configured. Try a fictional sample case.");
  if (!$("access").value.trim()) {
    $("live-access").open = true;
    $("access").focus();
    throw Error(
      "Live recording, translation and playback need an app access token. Enter the deployment owner’s token in Live processing access, then retry. Sample cases work without a token.",
    );
  }
}
async function api(path, body, signal) {
  const isForm = body instanceof FormData;
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      "X-Patient-Consent": "yes",
      Authorization: "Bearer " + $("access").value,
    },
    body: isForm ? body : JSON.stringify(body),
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Processing failed.");
  return data;
}
function setBusy(value) {
  busy = value;
  document
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.disabled =
          (value && b.id !== "cancel") || b.dataset.unavailable === "true"),
    );
  document
    .querySelectorAll("input,textarea,select")
    .forEach((e) => (e.disabled = value));
}
async function task(fn) {
  if (busy || capture.active) return;
  controller = new AbortController();
  const signal = controller.signal;
  const serial = ++requestSerial;
  setBusy(true);
  try {
    await fn(signal, () => {
      if (signal.aborted || serial !== requestSerial)
        throw new DOMException("Cancelled", "AbortError");
    });
  } catch (e) {
    if (e.name === "AbortError") {
      status("Processing cancelled. Retry explicitly when ready.");
    } else {
      clearApproval();
      if (
        ["translated", "translation_confirmed", "clarifying"].includes(
          flow.state,
        )
      )
        move("failed");
      status(e.message);
    }
  } finally {
    controller = null;
    setBusy(false);
  }
}
function loadSample() {
  resetDerived();
  loaded = CASES.find((c) => c.id === $("case").value);
  if (!loaded)
    return status(
      "Fictional samples are available in English, Hindi, Tamil, Telugu, and Kannada.",
    );
  mode = "sample";
  startedAt = performance.now();
  assistedMs = null;
  $("transcript").value = loaded.original;
  $("english").value = loaded.english;
  translatedState();
  $("source").textContent = "Prewritten sample";
  status(
    "Fictional case loaded. Translation and extraction are prewritten; no API calls.",
  );
}
function edited(original = false) {
  observeStart();
  resetDerived();
  loaded = null;
  mode = "manual";
  $("source").textContent = "Operator edited";
  if (original) $("english").value = "";
  if ($("english").value.trim()) translatedState();
  else {
    move("consented");
    move("transcribed");
  }
  status("Text changed. Extract again and review before export.");
}
function renderFacts() {
  return renderFactCards({
    $,
    t,
    result,
    corrections,
    valueCorrections,
    signals,
    mode,
    clarifications,
    invalidateReviewer,
  });
}
async function extractionReady(data, signal, check = () => {}) {
  result = data.result;
  const errors = validateExtraction(result, {
    original: $("transcript").value,
    english: $("english").value,
    clarifications,
  });
  if (errors.length) throw Error("Invalid evidence. Review text and retry.");
  const checked = applyReviewRules(result, {
    original: $("transcript").value,
    english: $("english").value,
    clarifications,
  });
  result = checked.result;
  signals = [
    ...checked.signals,
    ...translationSignals($("transcript").value, $("english").value),
    ...(data.valueFlags || []),
    ...(data.questionFlags || []),
  ];
  move("extracted");
  const pending = renderFacts();
  $("agent-meta").textContent = data.meta
    ? `${data.meta.mode} · ${data.meta.calls} calls · ${data.meta.latencyMs} ms · prompt ${VERSION}`
    : mode === "manual-review"
      ? "Manual operator review · no model calls"
      : "Prewritten sample extraction · no model calls";
  await renderQuestions({
    $,
    t,
    questions: pending.questions,
    requireConsent,
    api,
    signal,
    check,
    speakText,
    startCapture,
  });
  if (pending.questions.length) {
    move("clarifying");
    $("clarification-panel").hidden = false;
  } else move("awaiting_review");
  status("Facts ready. Verify the full quotes and their categories.");
}
$("sample").onclick = loadSample;
$("case").onchange = () => {
  resetDerived();
  $("transcript").value = "";
  $("english").value = "";
  loaded = null;
  mode = "manual";
  status("Choose Try a sample case to load the selected fictional case.");
};
$("language").onchange = () => {
  resetDerived();
  populateCases();
  applyLocale($("language").value);
  startedAt = null;
  assistedMs = null;
  $("transcript").value = "";
  $("english").value = "";
  loaded = null;
  mode = "manual";
  $("source").textContent = "No case loaded";
  status("Language changed. Record, type, or load a sample.");
};
$("transcript").oninput = () => edited(true);
$("english").oninput = () => edited(false);
$("patient").oninput = () => {
  clearApproval();
  if (["approved", "exported"].includes(flow.state)) {
    flow.state = "awaiting_review";
    renderState();
  }
};
$("consent").onchange = () => {
  if (!$("consent").checked) {
    controller?.abort();
    capture.stop();
    clearApproval();
  }
};
$("translate").onclick = () =>
  task(async (signal, check) => {
    const text = $("transcript").value.trim();
    if (!text) throw Error("Enter patient words first.");
    if ($("language").value === "en-IN") {
      resetDerived();
      $("english").value = text;
      mode = "manual";
      translatedState();
      return status("English source copied. Review before extraction.");
    }
    requireConsent();
    clearApproval();
    status("Translating with Sarvam…");
    const data = await api(
      "translate",
      { text, language: $("language").value },
      signal,
    );
    check();
    resetDerived();
    $("english").value = data.translated_text;
    mode = "live";
    loaded = null;
    translatedState();
    $("source").textContent = "Sarvam translation";
    status("Translation ready. Check numbers, negations, and names.");
  });
$("extract").onclick = () =>
  task(async (signal, check) => {
    if (!$("english").value.trim() || !$("transcript").value.trim())
      throw Error("Review original words and English text first.");
    clearApproval();
    clarifications = "";
    corrections = {};
    valueCorrections = {};
    if (
      !confirmationMatches(
        translationConfirmation,
        $("transcript").value,
        $("english").value,
      ) ||
      flow.state !== "translation_confirmed"
    )
      throw Error("Read back and confirm the translation before extraction.");
    if (mode === "sample" && loaded) {
      await extractionReady(
        { result: structuredClone(loaded.expected) },
        signal,
        check,
      );
      return;
    }
    requireConsent();
    status("Extracting evidence with Sarvam…");
    const data = await api(
      "extract",
      {
        original: $("transcript").value,
        text: $("english").value,
        stage: flow.state,
        translationConfirmed: true,
      },
      signal,
    );
    check();
    await extractionReady(data, signal, check);
  });
$("clarify").onclick = () =>
  task(async (signal, check) => {
    if (flow.state !== "clarifying") throw Error("Extract facts first.");
    const answers = [...$("questions").querySelectorAll("textarea")]
      .map((el) => ({ field: el.dataset.field, text: el.value.trim() }))
      .filter((x) => x.text);
    originalAnswers = answers.map((a) => `${a.field}: ${a.text}`).join("\n");
    if (
      answers.length &&
      mode !== "sample" &&
      $("language").value !== "en-IN"
    ) {
      requireConsent();
      for (const answer of answers) {
        const translated = await api(
          "translate",
          { text: answer.text, language: $("language").value },
          signal,
        );
        check();
        answer.text = translated.translated_text;
      }
    }
    clarifications = answers.map((a) => `${a.field}: ${a.text}`).join("\n");
    if (answers.length && mode !== "sample") {
      requireConsent();
      status("Checking clarification evidence…");
      const data = await api(
        "extract",
        {
          original: $("transcript").value,
          text: $("english").value,
          clarifications,
          originalClarifications: originalAnswers,
          stage: "clarifying",
          translationConfirmed: Boolean(translationConfirmation?.confirmed),
        },
        signal,
      );
      check();
      if (
        validateExtraction(data.result, {
          original: $("transcript").value,
          english: $("english").value,
          clarifications,
        }).length
      )
        throw Error("Clarification evidence is invalid.");
      result = data.result;
      signals = mergeReviewSignals(
        signals,
        data.valueFlags || [],
        data.questionFlags || [],
      );
      $("agent-meta").textContent =
        `${data.meta.mode} · clarification pass · ${data.meta.calls} calls`;
    } else if (answers.length) {
      status(
        "Sample answers recorded verbatim under operator-selected fields. No AI call.",
      );
    }
    result = retainAnswers(result, answers);
    if (
      validateExtraction(result, {
        original: $("transcript").value,
        english: $("english").value,
        clarifications,
      }).length
    )
      throw Error(
        "Clarification evidence is invalid. Review and extract again.",
      );
    const checked = applyReviewRules(result, {
      original: $("transcript").value,
      originalClarifications: originalAnswers,
      english: $("english").value,
      clarifications,
    });
    result = checked.result;
    signals = mergeReviewSignals(
      signals,
      checked.signals,
      translationSignals($("transcript").value, $("english").value),
    );
    renderFacts();
    $("clarification-source").hidden = !originalAnswers;
    $("original-answers").textContent =
      "Original answers (" + $("language").value + ")\n" + originalAnswers;
    $("translated-answers").textContent =
      "Clarification source (sample: operator text; live: English)\n" +
      clarifications;
    $("clarification-panel").hidden = true;
    move("awaiting_review");
    status("Ready for human review. Unanswered details remain unknown.");
  });
$("reviewed").onchange = () => {
  clearApprovalOnly();
  if (
    $("reviewed").checked &&
    canApprove({
      state: flow.state,
      reviewer: $("reviewer").value,
      critical: $("critical-reviewed").checked,
    })
  ) {
    move("approved");
    assistedMs = performance.now() - (startedAt || performance.now());
    $("assisted-time").textContent =
      `Assisted intake: ${(assistedMs / 1000).toFixed(1)} seconds (self-timed)`;
  } else if ($("reviewed").checked) {
    $("reviewed").checked = false;
    status(
      "Complete extraction, clarification, reviewer reference and critical-detail checks before approval.",
    );
  } else if (["approved", "exported"].includes(flow.state)) {
    flow.state = "awaiting_review";
    renderState();
  }
};
function clearApprovalOnly() {
  $("summary-box").hidden = true;
  $("summary").textContent = "";
}
$("generate").onclick = () => {
  try {
    if (!$("reviewer").value.trim() || !$("critical-reviewed").checked)
      throw Error("Add a reviewer reference and check critical details first.");
    const prepared = prepareReviewExport({
      reference: $("patient").value,
      language: $("language").selectedOptions[0].textContent,
      original: $("transcript").value,
      english: $("english").value,
      clarifications,
      result,
      corrections,
      valueCorrections,
      translationConfirmation,
      reviewed: $("reviewed").checked,
      state: flow.state,
      mode:
        mode === "sample"
          ? "PREWRITTEN FICTIONAL SAMPLE"
          : mode === "manual-review"
            ? "MANUAL OPERATOR REVIEW - NO AI EXTRACTION"
            : "SARVAM + OPERATOR REVIEW",
      reviewer: $("reviewer").value,
      role: $("reviewer-role").value,
      originalAnswers,
      signals,
      languageCode: $("language").value,
      timing: {
        manualMs,
        assistedMs,
        manualCaseId,
        caseId: loaded?.id || "operator-entered",
        corrections: Object.values(corrections).filter(Boolean).length,
      },
    });
    $("summary").textContent = prepared.text;
    reviewPacket = prepared.packet;
    const acceptance = prepared.acceptance;
    $("acceptance").textContent =
      "Accepted for this visit · " +
      acceptance.role +
      " · " +
      acceptance.reviewer;
    $("summary-box").hidden = false;
    status("Reviewed handoff ready.");
  } catch (e) {
    status(e.message);
  }
};
function exported() {
  assertExportable({
    text: $("summary").textContent,
    reviewed: $("reviewed").checked,
    state: flow.state,
  });
  if (flow.state === "approved") move("exported");
}
$("download").onclick = () => {
  try {
    exported();
    downloadText($("summary").textContent, "patient-handoff.txt");
  } catch (e) {
    status(e.message);
  }
};
$("copy").onclick = async () => {
  try {
    exported();
    await navigator.clipboard.writeText($("summary").textContent);
    status("Handoff copied.");
  } catch {
    status("Copy unavailable. Download the reviewed summary instead.");
  }
};
$("print").onclick = () => {
  try {
    exported();
    window.print();
  } catch (e) {
    status(e.message);
  }
};
$("cancel").onclick = () => {
  controller?.abort();
  capture.stop();
  requestSerial++;
  clearApproval();
  if (!["cancelled", "failed"].includes(flow.state)) move("cancelled");
  status("Cancelled. Start extraction again to continue.");
};
$("record").onclick = () => startCapture();
$("readback").onclick = () => speakText($("transcript").value);
$("live-case").onclick = () => {
  if (!$("transcript").value.trim())
    return status("Load a case or enter patient words first.");
  resetDerived();
  mode = "live";
  observeStart();
  if ($("english").value.trim()) translatedState();
  $("source").textContent = "Live AI · synthetic case";
  status(t("liveSelected"));
};
["reviewer", "reviewer-role"].forEach((id) =>
  $(id).addEventListener("change", invalidateReviewer),
);
$("reviewer").addEventListener("input", invalidateReviewer);
$("critical-reviewed").addEventListener("change", () => {
  const checked = $("critical-reviewed").checked;
  invalidateReviewer();
  $("critical-reviewed").checked = checked;
});
$("json-export").onclick = () => {
  try {
    exported();
    downloadObject(reviewPacket, "patient-review.json");
  } catch (e) {
    status(e.message);
  }
};
$("manual-start").onclick = () => {
  manualStarted = performance.now();
  manualMs = null;
  manualCaseId = $("case").value || "operator-entered";
  $("manual-time").textContent =
    "Manual timer running. Use the same fictional case.";
};
$("manual-stop").onclick = () => {
  if (manualStarted === null) return;
  manualMs = performance.now() - manualStarted;
  manualStarted = null;
  $("manual-time").textContent =
    `Manual intake: ${(manualMs / 1000).toFixed(1)} seconds (self-timed)`;
};
$("timing-export").onclick = () =>
  downloadObject(
    timingObservation({
      manualMs,
      assistedMs,
      manualCaseId,
      caseId: loaded?.id || "operator-entered",
      corrections: Object.values(corrections).filter(Boolean).length,
    }),
    "timing-observation.json",
  );
$("clear").onclick = () => {
  resetDerived();
  loaded = null;
  mode = "manual";
  $("transcript").value = "";
  $("english").value = "";
  $("patient").value = "Demo patient 001";
  $("reviewer").value = "";
  $("critical-reviewed").checked = false;
  startedAt = null;
  assistedMs = null;
  $("consent").checked = false;
  $("access").value = "";
  $("source").textContent = "No case loaded";
  status("Session cleared.");
};
window.addEventListener("pagehide", () => {
  controller?.abort();
  capture.dispose();
  $("access").value = "";
});
populateCases();
applyLocale($("language").value);
renderState();
fetch("/api/status")
  .then((r) => r.json())
  .then((data) => {
    ready = data.ready;
    $("connection").textContent = ready
      ? "● Sarvam · access required"
      : "○ Synthetic demo · key needed";
  })
  .catch(() => {
    $("connection").textContent = "○ Server unavailable";
  });

$("back-translate").onclick = () =>
  task(async (signal, check) => {
    if (flow.state !== "translated")
      throw Error("Prepare an English translation first.");
    const english = $("english").value.trim();
    if (!english) throw Error("Add English text first.");
    if (mode === "sample" && loaded) {
      backTranslation = loaded.original;
      $("back-words").textContent =
        "Prewritten sample back-translation: " + backTranslation;
    } else if ($("language").value === "en-IN") {
      backTranslation = english;
      $("back-words").textContent = backTranslation;
    } else {
      requireConsent();
      const data = await api(
        "translate",
        { text: english, language: $("language").value, direction: "back" },
        signal,
      );
      check();
      backTranslation = data.translated_text;
      $("back-words").textContent = backTranslation;
    }
    backRead = false;
    $("translation-agreed").checked = false;
    $("translation-flags").textContent = translationSignals(
      $("transcript").value,
      $("english").value,
    )
      .map((s) => s.text)
      .join(" ");
  });
$("back-listen").onclick = () => {
  if (!backTranslation) return status("Prepare the back-translation first.");
  if (mode === "sample") {
    backRead = true;
    return status(
      "Prewritten sample: intake worker, read the displayed back-translation aloud before confirmation. No speech API call.",
    );
  }
  speakText(backTranslation, () => {
    backRead = true;
  });
};
$("confirm-translation").onclick = () => {
  try {
    if (!backRead || !$("translation-agreed").checked)
      throw Error(
        "Read the back-translation aloud and record patient confirmation first.",
      );
    translationConfirmation = {
      original: $("transcript").value,
      english: $("english").value,
      backTranslation,
      readAloud: true,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      method:
        mode === "sample"
          ? "prewritten sample, operator-read self-attestation"
          : "readback self-attestation",
    };
    flow.confirmTranslation(translationConfirmation);
    renderState();
    status("Translation confirmed. Extract reported facts next.");
  } catch (e) {
    status(e.message);
  }
};
$("translation-agreed").onchange = () => {
  if (!$("translation-agreed").checked && translationConfirmation) {
    resetDerived();
    translatedState();
    status("Confirmation revoked. Prepare and confirm again.");
  }
};
$("manual-review").onclick = async () => {
  if (
    !confirmationMatches(
      translationConfirmation,
      $("transcript").value,
      $("english").value,
    )
  )
    return status("Confirm the translation first.");
  if (flow.state !== "translation_confirmed") {
    translatedState();
    flow.confirmTranslation(translationConfirmation);
    renderState();
  }
  clearApproval();
  mode = "manual-review";
  result = { facts: [], ambiguities: [] };
  await extractionReady({ result });
  if (flow.state === "clarifying") move("awaiting_review");
  $("clarification-panel").hidden = true;
  $("source").textContent = "Manual review - no AI extraction";
  status(
    "Original words retained. Enter operator corrections in the fields and review; unfilled details remain unknown.",
  );
};
