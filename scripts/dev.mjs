import http from "node:http";
import crypto from "node:crypto";
import worker from "../dist/server/index.js";
const port = Number(process.env.PORT || 4317);
let active = 0,
  windowStart = Date.now(),
  requests = 0;
http
  .createServer(async (req, res) => {
    const id = crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    let slot = false;
    try {
      if (req.url.startsWith("/api/") && req.method === "POST") {
        if (Date.now() - windowStart > 60000) {
          windowStart = Date.now();
          requests = 0;
        }
        if (++requests > 30 || active >= 2) {
          res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": "10",
          });
          return res.end(
            JSON.stringify({
              error: "Processing limit reached. Retry shortly.",
            }),
          );
        }
        slot = true;
        active++;
      }
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 5 * 1024 * 1024) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request exceeds 5 MB." }));
          return;
        }
        chunks.push(c);
      }
      const protocol =
        req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const request = new Request(
        `${protocol}://${req.headers.host || `127.0.0.1:${port}`}${req.url}`,
        {
          method: req.method,
          headers: req.headers,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(80000),
          ]),
          ...(!["GET", "HEAD"].includes(req.method)
            ? { body: Buffer.concat(chunks) }
            : {}),
        },
      );
      const response = await worker.fetch(request, process.env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent)
        res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request failed.", requestId: id }));
    } finally {
      if (slot) active--;
    }
  })
  .listen(port, process.env.HOST || "0.0.0.0", () =>
    console.log(`Local: http://127.0.0.1:${port}`),
  );
