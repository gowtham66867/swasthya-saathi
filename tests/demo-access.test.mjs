import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeAccess,
  demoConfiguration,
  createGcsBudgetStore,
} from "../demo-access.mjs";
import { handleApi } from "../server.mjs";
const owner = "o".repeat(32),
  demo = "d".repeat(32);
const env = {
  SARVAM_API_KEY: "mock",
  LIVE_ACCESS_TOKEN: owner,
  DEMO_ACCESS_TOKEN: demo,
  DEMO_REQUEST_LIMIT: "2",
  DEMO_EXPIRES_AT: "2026-11-18T00:00:00Z",
  DEMO_BUDGET_BUCKET: "fictional-budget",
};
const now = () => Date.parse("2026-11-17T17:00:00Z");
test("judge settings fail closed on missing cap/expiry/storage, or owner-token reuse", async () => {
  for (const changed of [
    { DEMO_REQUEST_LIMIT: "" },
    { DEMO_REQUEST_LIMIT: "2.5" },
    { DEMO_EXPIRES_AT: "bad" },
    { DEMO_BUDGET_BUCKET: "" },
    { DEMO_ACCESS_TOKEN: owner },
  ])
    assert.equal(demoConfiguration({ ...env, ...changed }), null);
  assert.equal((await authorizeAccess("Bearer " + owner, env)).kind, "owner");
});
test("expiry and cap are server-enforced; invalid/expired requests never reserve", async () => {
  let used = 0;
  const store = {
    async consume() {
      return ++used <= 2;
    },
  };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await authorizeAccess("Bearer " + demo, env, { store, now })).ok,
      true,
    );
  assert.equal(
    (await authorizeAccess("Bearer " + demo, env, { store, now })).status,
    429,
  );
  const before = used;
  assert.equal(
    (
      await authorizeAccess("Bearer " + demo, env, {
        store,
        now: () => Date.parse(env.DEMO_EXPIRES_AT),
      })
    ).status,
    401,
  );
  assert.equal(
    (await authorizeAccess("Bearer wrong", env, { store, now })).status,
    401,
  );
  assert.equal(used, before);
});
test("counter failure denies access and consent still gates demo requests", async () => {
  const store = {
    async consume() {
      throw Error("fake unavailable");
    },
  };
  const request = (consent) =>
    new Request("https://a.test/api/translate", {
      method: "POST",
      headers: {
        origin: "https://a.test",
        "X-Patient-Consent": consent,
        Authorization: "Bearer " + demo,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Fictional", language: "en-IN" }),
    });
  assert.equal(
    (await handleApi(request("yes"), env, { demoStore: store, now })).status,
    503,
  );
  assert.equal(
    (await handleApi(request("no"), env, { demoStore: store, now })).status,
    403,
  );
});
function fakeStorage() {
  let used = null,
    generation = 1,
    meta = 0;
  let conflict = false;
  const calls = [];
  return {
    calls,
    set conflict(value) {
      conflict = value;
    },
    async fetcher(url, options) {
      calls.push({ url, method: options.method || "GET", body: options.body });
      if (!options.method) {
        return used === null
          ? new Response("", { status: 404 })
          : Response.json({
              generation: String(generation),
              metageneration: String(meta),
              metadata: { used: String(used) },
            });
      }
      if (options.method === "POST") {
        assert.match(url, /ifGenerationMatch=0/);
        assert.match(options.body, /"used":"1"/);
        if (used !== null) return new Response("", { status: 412 });
        used = 1;
        meta = 1;
        return Response.json({});
      }
      const parsed = new URL(url);
      if (conflict) {
        conflict = false;
        meta++;
        return new Response("", { status: 412 });
      }
      if (parsed.searchParams.get("ifMetagenerationMatch") !== String(meta))
        return new Response("", { status: 412 });
      assert.equal(
        parsed.searchParams.get("ifGenerationMatch"),
        String(generation),
      );
      used = Number(JSON.parse(options.body).metadata.used);
      meta++;
      return Response.json({});
    },
  };
}
test("durable CAS counter survives new store instances, retries contention, and caps concurrency", async () => {
  const fake = fakeStorage();
  const create = () =>
    createGcsBudgetStore({
      bucket: "fictional",
      fetcher: fake.fetcher,
      getAccessToken: async () => "mock-credential",
    });
  assert.equal(await create().consume({ id: "hash", limit: 3 }), true);
  fake.conflict = true;
  assert.equal(await create().consume({ id: "hash", limit: 3 }), true);
  const results = await Promise.all([
    create().consume({ id: "hash", limit: 3 }),
    create().consume({ id: "hash", limit: 3 }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await create().consume({ id: "hash", limit: 3 }), false);
  assert.equal(
    fake.calls.some((c) => (c.body || "").includes(demo)),
    false,
  );
});
test("malformed persistent counter and metadata-token failure fail closed", async () => {
  const store = createGcsBudgetStore({
    bucket: "fictional",
    getAccessToken: async () => "mock",
    fetcher: async () =>
      Response.json({
        generation: "1",
        metageneration: "1",
        metadata: { used: "NaN" },
      }),
  });
  await assert.rejects(store.consume({ id: "hash", limit: 2 }));
  const unavailable = createGcsBudgetStore({
    bucket: "fictional",
    fetcher: async () => new Response("", { status: 503 }),
  });
  await assert.rejects(unavailable.consume({ id: "hash", limit: 2 }));
});

test("timezone-less expiry is rejected and reservation crossing expiry is denied", async () => {
  assert.equal(
    demoConfiguration({ ...env, DEMO_EXPIRES_AT: "2026-11-18T00:00:00" }),
    null,
  );
  let timestamp = now();
  const result = await authorizeAccess("Bearer " + demo, env, {
    now: () => timestamp,
    store: {
      async consume() {
        timestamp = Date.parse(env.DEMO_EXPIRES_AT);
        return true;
      },
    },
  });
  assert.equal(result.status, 401);
});

test("the API consumes a shared judge allowance and rejects the next request", async () => {
  let used = 0;
  const store = {
    async consume() {
      return ++used <= 2;
    },
  };
  const request = () =>
    new Request("https://a.test/api/translate", {
      method: "POST",
      headers: {
        origin: "https://a.test",
        "X-Patient-Consent": "yes",
        Authorization: "Bearer " + demo,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Fictional identity translation",
        language: "en-IN",
      }),
    });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await handleApi(request(), env, { demoStore: store, now })).status,
      200,
    );
  assert.equal(
    (await handleApi(request(), env, { demoStore: store, now })).status,
    429,
  );
});
