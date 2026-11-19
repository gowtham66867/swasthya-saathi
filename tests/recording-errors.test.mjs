import test from "node:test";
import assert from "node:assert/strict";
import { createRecording, recordingError } from "../modules/recording.js";

function fixture({
  mediaError,
  startError,
  empty = false,
  deferred = false,
} = {}) {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        checked: true,
        value: "en-IN",
        disabled: false,
        textContent: "",
        pause() {},
        removeAttribute() {},
      });
    return elements.get(id);
  };
  let recorder,
    uploads = 0,
    stops = 0,
    requests = 0,
    pendingResolve,
    timerCleared = 0;
  const statuses = [];
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, options) {
      this.mimeType = options.mimeType;
      this.state = "inactive";
      recorder = this;
    }
    start() {
      if (startError) throw startError;
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable({
        data: new Blob(empty ? [] : ["fictional audio"]),
      });
      this.onstop();
    }
  }
  const stream = {
    getTracks: () => [
      {
        stop() {
          stops++;
        },
      },
    ],
  };
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
    status: (x) => statuses.push(x),
    task: async (fn) => fn(undefined, () => {}),
    api: async () => {
      uploads++;
      return { transcript: "Fictional." };
    },
    onTranscript() {},
    mediaDevices: {
      getUserMedia: async () => {
        requests++;
        if (mediaError) throw mediaError;
        if (deferred)
          return new Promise((resolve) => (pendingResolve = resolve));
        return stream;
      },
    },
    Recorder,
    clock: {
      setInterval() {
        return 1;
      },
      clearInterval() {
        timerCleared++;
      },
    },
  });
  return {
    capture,
    statuses,
    $,
    get recorder() {
      return recorder;
    },
    get uploads() {
      return uploads;
    },
    get stops() {
      return stops;
    },
    get requests() {
      return requests;
    },
    get timerCleared() {
      return timerCleared;
    },
    resolve() {
      pendingResolve(stream);
    },
  };
}
const originalDocument = globalThis.document;
test.before(() => {
  globalThis.document = {
    querySelector: () => ({ classList: { add() {}, remove() {} } }),
  };
});
test.after(() => {
  globalThis.document = originalDocument;
});

for (const [name, expected] of [
  ["NotAllowedError", /site settings/],
  ["NotFoundError", /No microphone/],
  ["NotReadableError", /Close other apps/],
  ["NotSupportedError", /audio format/],
]) {
  test(`actionable ${name} error and no upload`, async () => {
    const f = fixture({ mediaError: new DOMException("failure", name) });
    await f.capture.startCapture();
    assert.match(f.statuses.at(-1), expected);
    assert.equal(f.capture.active, false);
    assert.equal(f.uploads, 0);
  });
}
test("pending permission prevents overlapping microphone requests", async () => {
  const f = fixture({ deferred: true });
  const first = f.capture.startCapture();
  await f.capture.startCapture();
  assert.equal(f.requests, 1);
  f.resolve();
  await first;
  f.capture.stop();
  await new Promise((r) => setImmediate(r));
  assert.equal(f.uploads, 1);
});
test("recorder startup failure stops tracks and resets timer and button", async () => {
  const f = fixture({
    startError: new DOMException("format", "NotSupportedError"),
  });
  await f.capture.startCapture();
  assert.equal(f.stops, 1);
  assert.equal(f.capture.active, false);
  assert.equal(f.uploads, 0);
  assert.equal(f.$("record").textContent, "record");
  assert.ok(f.timerCleared);
});
test("recorder asynchronous failure releases microphone and never uploads", async () => {
  const f = fixture();
  await f.capture.startCapture();
  f.recorder.onerror({
    error: new DOMException("device lost", "NotReadableError"),
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(f.capture.active, false);
  assert.equal(f.uploads, 0);
  assert.ok(f.stops);
  assert.match(f.statuses.at(-1), /Close other apps/);
});
test("empty capture never calls transcription", async () => {
  const f = fixture({ empty: true });
  await f.capture.startCapture();
  f.capture.stop();
  await new Promise((r) => setImmediate(r));
  assert.equal(f.uploads, 0);
  assert.match(f.statuses.at(-1), /No audio was captured/);
});
test("unrecognized failures retain the application access/consent explanation", () => {
  assert.equal(
    recordingError(new Error("Access required.")),
    "Access required.",
  );
});
