import test from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../server.mjs";
const origin = "https://example.test";
const req = (path, body, extra = {}) =>
  new Request(origin + "/api/" + path, {
    method: "POST",
    headers: {
      origin,
      "X-Patient-Consent": "yes",
      "Content-Type": "application/json",
      Authorization: "Bearer " + "a".repeat(32),
      ...extra,
    },
    body: JSON.stringify(body),
  });
test("status never exposes the secret", async () => {
  const r = await handleApi(new Request(origin + "/api/status"), {
    SARVAM_API_KEY: "test-secret",
    LIVE_ACCESS_TOKEN: "a".repeat(32),
  });
  assert.deepEqual(await r.json(), {
    ready: true,
    provider: "Sarvam",
    mode: "synthetic-demo",
    version: "intake-v3",
  });
});
test("live calls require configured key and explicit consent", async () => {
  assert.equal(
    (
      await handleApi(
        req("translate", { text: "hello", language: "en-IN" }),
        {},
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleApi(req("translate", {}, { "X-Patient-Consent": "no" }), {
        SARVAM_API_KEY: "test",
        LIVE_ACCESS_TOKEN: "a".repeat(32),
      })
    ).status,
    403,
  );
});
test("rejects cross-origin requests", async () => {
  assert.equal(
    (
      await handleApi(req("speak", {}, { origin: "https://other.test" }), {
        SARVAM_API_KEY: "test",
        LIVE_ACCESS_TOKEN: "a".repeat(32),
      })
    ).status,
    403,
  );
});
test("rejects unsupported language and oversized text", async () => {
  for (const body of [
    { text: "hi", language: "bad" },
    { text: "a".repeat(2001), language: "hi-IN" },
  ])
    assert.equal(
      (
        await handleApi(req("translate", body), {
          SARVAM_API_KEY: "test",
          LIVE_ACCESS_TOKEN: "a".repeat(32),
        })
      ).status,
      400,
    );
});
test("translation sends correct Sarvam request and filters response", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.sarvam.ai/translate");
    assert.equal(options.headers["api-subscription-key"], "test");
    assert.deepEqual(JSON.parse(options.body), {
      input: "नमस्ते",
      source_language_code: "hi-IN",
      target_language_code: "en-IN",
      model: "sarvam-translate:v1",
    });
    return Response.json({ translated_text: "Hello", request_id: "internal" });
  };
  try {
    const result = await handleApi(
      req("translate", { text: "नमस्ते", language: "hi-IN" }),
      { SARVAM_API_KEY: "test", LIVE_ACCESS_TOKEN: "a".repeat(32) },
    );
    assert.deepEqual(await result.json(), { translated_text: "Hello" });
  } finally {
    globalThis.fetch = old;
  }
});
test("transcription forwards audio and correct model", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.sarvam.ai/speech-to-text");
    assert.equal(options.body.get("model"), "saaras:v3");
    assert.equal(options.body.get("mode"), "transcribe");
    assert.equal(options.body.get("language_code"), "ta-IN");
    assert.equal(options.body.get("file").size, 3);
    return Response.json({ transcript: "வணக்கம்", language_code: "ta-IN" });
  };
  try {
    const data = new FormData();
    data.append("file", new Blob(["abc"], { type: "audio/webm" }), "test.webm");
    data.append("language", "ta-IN");
    const result = await handleApi(
      new Request(origin + "/api/transcribe", {
        method: "POST",
        headers: {
          origin,
          "X-Patient-Consent": "yes",
          Authorization: "Bearer " + "a".repeat(32),
        },
        body: data,
      }),
      { SARVAM_API_KEY: "test", LIVE_ACCESS_TOKEN: "a".repeat(32) },
    );
    assert.equal((await result.json()).transcript, "வணக்கம்");
  } finally {
    globalThis.fetch = old;
  }
});
test("TTS uses Bulbul and does not expose provider errors", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.sarvam.ai/text-to-speech");
    assert.equal(JSON.parse(options.body).model, "bulbul:v3");
    return new Response("secret upstream detail", { status: 403 });
  };
  try {
    const result = await handleApi(
      req("speak", { text: "नमस्ते", language: "hi-IN" }),
      { SARVAM_API_KEY: "test", LIVE_ACCESS_TOKEN: "a".repeat(32) },
    );
    assert.equal(result.status, 502);
    assert.equal(
      JSON.stringify(await result.json()).includes("secret upstream"),
      false,
    );
  } finally {
    globalThis.fetch = old;
  }
});
