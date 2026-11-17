import test from "node:test";
import assert from "node:assert/strict";
import { tokenEqual } from "../access.mjs";
import { createRecording } from "../modules/recording.js";
import { assertExportable, prepareReviewExport } from "../modules/export.js";
import { Workflow } from "../modules/workflow.js";
import { tr } from "../modules/i18n.js";
test("constant-time digest comparison handles lengths, prefixes and Unicode", () => {
  assert.equal(tokenEqual("a".repeat(32), "a".repeat(32)), true);
  for (const x of [
    "a".repeat(31),
    "a".repeat(33),
    "a".repeat(31) + "b",
    "",
    null,
  ])
    assert.equal(tokenEqual(x, "a".repeat(32)), false);
  assert.equal(tokenEqual("ಕನ್ನಡ", "ಕನ್ನಡ"), true);
});
test("split workflow, localization and export keep their public behavior", () => {
  assert.equal(new Workflow().state, "created");
  assert.ok(tr("te-IN", "allergies"));
  assert.throws(() =>
    assertExportable({ text: "x", reviewed: false, state: "approved" }),
  );
  assert.doesNotThrow(() =>
    assertExportable({ text: "x", reviewed: true, state: "approved" }),
  );
  const confirmation = {
    original: "Synthetic.",
    english: "Synthetic.",
    backTranslation: "Synthetic.",
    confirmed: true,
    readAloud: true,
    confirmedAt: "test",
  };
  const result = prepareReviewExport({
    reference: "fictional",
    language: "English",
    languageCode: "en-IN",
    original: "Synthetic.",
    english: "Synthetic.",
    clarifications: "",
    result: { facts: [], ambiguities: [] },
    corrections: {},
    valueCorrections: {},
    translationConfirmation: confirmation,
    state: "approved",
    reviewed: true,
    reviewer: "Demo",
    role: "Hackathon demo reviewer",
    signals: [],
    originalAnswers: "",
    timing: { caseId: "sample" },
  });
  assert.equal(result.packet.acceptance.reviewer, "Demo");
  assert.equal(result.packet.translationConfirmation, confirmation);
  assert.match(result.text, /TRANSLATION CONFIRMATION/);
});
test("recording module stops at 25 seconds and forwards one ephemeral blob", async () => {
  let tick,
    stops = 0,
    uploads = 0,
    transcript,
    rec;
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        checked: true,
        disabled: false,
        textContent: "",
        value: "te-IN",
        pause() {},
        removeAttribute() {},
        hidden: true,
      });
    return elements.get(id);
  };
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, options) {
      this.mimeType = options.mimeType;
      this.state = "inactive";
      rec = this;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob(["synthetic test bytes"]) });
      this.onstop();
    }
  }
  const old = globalThis.document;
  globalThis.document = {
    querySelector() {
      return { classList: { add() {}, remove() {} } };
    },
  };
  try {
    const capture = createRecording({
      $,
      t: (x) => x,
      flow: { state: "consented" },
      isBusy: () => false,
      getRevision: () => 1,
      requireConsent() {},
      observeStart() {},
      resetDerived() {},
      move() {},
      setBusy() {},
      status() {},
      task: async (fn) => fn(undefined, () => {}),
      api: async (path, form) => {
        uploads++;
        assert.equal(path, "transcribe");
        assert.equal(form.get("language"), "te-IN");
        return { transcript: "Fictional transcript" };
      },
      onTranscript: (text) => {
        transcript = text;
      },
      mediaDevices: {
        async getUserMedia() {
          return {
            getTracks: () => [
              {
                stop() {
                  stops++;
                },
              },
            ],
          };
        },
      },
      Recorder,
      clock: {
        setInterval(fn) {
          tick = fn;
          return 1;
        },
        clearInterval() {},
      },
    });
    await capture.startCapture();
    assert.equal(capture.active, true);
    for (let i = 0; i < 25; i++) tick();
    await new Promise((r) => setImmediate(r));
    assert.equal(rec.state, "inactive");
    assert.equal(capture.active, false);
    assert.equal(stops, 1);
    assert.equal(uploads, 1);
    assert.equal(transcript, "Fictional transcript");
  } finally {
    globalThis.document = old;
  }
});
test("stale microphone permission completion discards stream without upload", async () => {
  let revision = 1,
    resolveMedia,
    stopped = false;
  const elements = { consent: { checked: true } };
  const capture = createRecording({
    $: (id) => elements[id],
    getRevision: () => revision,
    isBusy: () => false,
    requireConsent() {},
    status() {},
    setBusy() {},
    mediaDevices: {
      getUserMedia: () => new Promise((r) => (resolveMedia = r)),
    },
    Recorder: class {},
  });
  const pending = capture.startCapture(null, {});
  revision++;
  resolveMedia({
    getTracks: () => [
      {
        stop() {
          stopped = true;
        },
      },
    ],
  });
  await pending;
  assert.equal(stopped, true);
  assert.equal(capture.active, false);
});

test("every static browser-module element reference exists in page markup", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const file of ["app.js", "modules/recording.js", "modules/review.js"]) {
    const source = await readFile(
      new URL("../" + file, import.meta.url),
      "utf8",
    );
    for (const match of source.matchAll(/\$\(["']([^"']+)["']\)/g))
      assert.ok(ids.has(match[1]), file + ": missing #" + match[1]);
  }
});
