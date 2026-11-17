import { createHash, randomUUID } from "node:crypto";
import { tokenEqual } from "./access.mjs";
export function demoConfiguration(env) {
  const limit = Number(env.DEMO_REQUEST_LIMIT),
    expires = Date.parse(env.DEMO_EXPIRES_AT || "");
  if (
    typeof env.DEMO_ACCESS_TOKEN !== "string" ||
    env.DEMO_ACCESS_TOKEN.length < 32 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isFinite(expires) ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(
      env.DEMO_EXPIRES_AT || "",
    ) ||
    !/^[-a-z0-9.]{3,222}$/.test(env.DEMO_BUDGET_BUCKET || "") ||
    tokenEqual(env.DEMO_ACCESS_TOKEN, env.LIVE_ACCESS_TOKEN)
  )
    return null;
  return {
    limit,
    expires,
    bucket: env.DEMO_BUDGET_BUCKET,
    id: createHash("sha256")
      .update(env.DEMO_ACCESS_TOKEN + "\n" + env.DEMO_EXPIRES_AT + "\n" + limit)
      .digest("hex"),
  };
}
export async function authorizeAccess(
  header,
  env,
  { store, now = Date.now, signal } = {},
) {
  if (
    env.LIVE_ACCESS_TOKEN?.length >= 32 &&
    tokenEqual(header, "Bearer " + env.LIVE_ACCESS_TOKEN)
  )
    return { ok: true, kind: "owner" };
  const config = demoConfiguration(env);
  if (
    !config ||
    !tokenEqual(header, "Bearer " + env.DEMO_ACCESS_TOKEN) ||
    now() >= config.expires
  )
    return {
      ok: false,
      status: 401,
      error: "Live processing requires a valid, unexpired access token.",
    };
  try {
    const counter = store || createGcsBudgetStore({ bucket: config.bucket });
    const granted = await counter.consume({
      id: config.id,
      limit: config.limit,
      signal,
    });
    if (!granted)
      return {
        ok: false,
        status: 429,
        error: "Judge demo request allowance exhausted.",
      };
    if (now() >= config.expires)
      return { ok: false, status: 401, error: "Judge demo access expired." };
    return { ok: true, kind: "judge-demo" };
  } catch {
    return {
      ok: false,
      status: 503,
      error:
        "Judge demo budget verification unavailable. No provider request was sent.",
    };
  }
}
// Durable non-patient metadata only. CAS preconditions make the count shared across
// concurrent instances/restarts. Any metadata/IAM/network error fails closed.
export function createGcsBudgetStore({
  bucket,
  fetcher = fetch,
  getAccessToken,
} = {}) {
  const timeout = (signal) =>
    AbortSignal.any([
      signal || new AbortController().signal,
      AbortSignal.timeout(5000),
    ]);
  async function accessToken(signal) {
    if (getAccessToken) return getAccessToken();
    const response = await fetcher(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, signal: timeout(signal) },
    );
    if (!response.ok) throw Error("Metadata unavailable");
    const body = await response.json();
    if (typeof body.access_token !== "string" || !body.access_token)
      throw Error("Metadata token missing");
    return body.access_token;
  }
  return {
    async consume({ id, limit, signal }) {
      const token = await accessToken(signal),
        name = "judge-budgets/" + id;
      const url =
        "https://storage.googleapis.com/storage/v1/b/" +
        encodeURIComponent(bucket) +
        "/o/" +
        encodeURIComponent(name);
      const headers = { Authorization: "Bearer " + token };
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetcher(url, {
          headers,
          signal: timeout(signal),
        });
        let update;
        if (response.status === 404) {
          const boundary = "saathi_" + randomUUID();
          const metadata = JSON.stringify({ name, metadata: { used: "1" } });
          const body =
            "--" +
            boundary +
            "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
            metadata +
            "\r\n--" +
            boundary +
            "\r\nContent-Type: application/octet-stream\r\n\r\n\r\n--" +
            boundary +
            "--\r\n";
          update = await fetcher(
            "https://storage.googleapis.com/upload/storage/v1/b/" +
              encodeURIComponent(bucket) +
              "/o?uploadType=multipart&ifGenerationMatch=0",
            {
              method: "POST",
              headers: {
                ...headers,
                "Content-Type": "multipart/related; boundary=" + boundary,
              },
              body,
              signal: timeout(signal),
            },
          );
        } else {
          if (!response.ok) throw Error("Budget read failed");
          const object = await response.json(),
            used = Number(object.metadata?.used);
          if (
            !/^\d+$/.test(object.metadata?.used || "") ||
            !Number.isSafeInteger(used) ||
            used < 1 ||
            !/^\d+$/.test(object.metageneration || "") ||
            !/^\d+$/.test(object.generation || "")
          )
            throw Error("Budget state invalid");
          if (used >= limit) return false;
          update = await fetcher(
            url +
              "?ifMetagenerationMatch=" +
              object.metageneration +
              "&ifGenerationMatch=" +
              object.generation,
            {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ metadata: { used: String(used + 1) } }),
              signal: timeout(signal),
            },
          );
        }
        if (update.status === 412) continue;
        if (!update.ok) throw Error("Budget reservation failed");
        return true;
      }
      throw Error("Budget contention limit reached");
    },
  };
}
