/**
 * API router — plain Node http, no framework. Same style as trivo-lean,
 * much smaller surface area.
 *
 * Route map:
 *   POST   /api/auth/login
 *   GET    /api/config                public — site content
 *   GET    /api/content               admin — same data, admin-facing name
 *   POST   /api/content               admin — save site content (direct write, no draft/publish — see db.mjs)
 *   POST   /api/register              public — the temporary registration form, rate-limited
 *   GET    /api/registrations         admin — list
 *   PATCH  /api/registrations/:id     admin — update status/notes
 *   DELETE /api/registrations/:id     admin
 */
import * as db from "./db.mjs";
import * as auth from "./auth.mjs";
import * as ratelimit from "./ratelimit.mjs";
import { SECURITY_HEADERS } from "./static.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function send(res, status, body, extraHeaders) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    ...SECURITY_HEADERS,
    ...CORS,
    ...(extraHeaders || {}),
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "HEAD") return resolve({});
    let size = 0;
    const chunks = [];
    const MAX = 512 * 1024; // 512KB — this app has no file uploads
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        req.destroy();
        reject(Object.assign(new Error("Payload too large."), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function routeSegments(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("api");
  return idx === -1 ? parts : parts.slice(idx + 1);
}

export async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const segments = routeSegments(url.pathname);
  const [resource, id] = segments;
  const query = Object.fromEntries(url.searchParams);

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return send(res, err.statusCode || 400, { error: err.message || "Bad request." });
  }

  const event = { headers: req.headers, queryStringParameters: query };

  try {
    if (resource === "auth" && id === "login" && req.method === "POST") {
      let result;
      try {
        result = auth.login(body.password);
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
      if (!result) return send(res, 401, { error: "Incorrect password." });
      await db.logAudit("editor", "login", "auth");
      return send(res, 200, result);
    }

    if (resource === "config" && !id && req.method === "GET") {
      const content = await db.getContent();
      if (!content) return send(res, 404, { error: "Not configured yet." });
      return send(res, 200, content, { "Cache-Control": "public, max-age=30" });
    }

    if (resource === "content" && !id) {
      const gate = auth.requireAuth(event);
      if (!gate.ok) return send(res, gate.code, { error: gate.error });
      if (req.method === "GET") {
        return send(res, 200, await db.getContent(), { "Cache-Control": "no-store" });
      }
      if (req.method === "POST") {
        if (!body.content || typeof body.content !== "object") return send(res, 400, { error: "Missing content object." });
        const saved = await db.saveContent(body.content);
        await db.logAudit(gate.session.role, "save", "content");
        return send(res, 200, { ok: true, updatedAt: saved.updatedAt });
      }
      return send(res, 405, { error: "Method not allowed." });
    }

    if (resource === "register" && !id && req.method === "POST") {
      const ip = ratelimit.clientIp(req);

      // Honeypot — same pattern as trivo-lean's contact form.
      if (body.honeypot || body["company-website"]) {
        return send(res, 200, { ok: true });
      }

      const gate = ratelimit.check(ip);
      if (!gate.ok) {
        return send(res, 429, { error: gate.reason }, { "Retry-After": String(gate.retryAfterSeconds) });
      }

      const data = { ...body };
      delete data.honeypot;
      delete data["company-website"];

      // Timing trap — same pattern as trivo-lean's contact form.
      const MIN_SUBMIT_MS = 1500;
      const renderedAt = Number(data["form-rendered-at"]);
      delete data["form-rendered-at"];
      if (renderedAt && Number.isFinite(renderedAt)) {
        const elapsed = Date.now() - renderedAt;
        if (elapsed >= 0 && elapsed < MIN_SUBMIT_MS) {
          return send(res, 200, { ok: true });
        }
      }

      if (!data.name || !data.email) {
        return send(res, 400, { error: "Name and email are required." });
      }

      const created = await db.createRegistration({ data });
      ratelimit.record(ip);
      await db.logAudit("public", "create", "registration", created.id);
      return send(res, 201, { ok: true, id: created.id });
    }

    if (resource === "registrations") {
      const gate = auth.requireAuth(event);
      if (!gate.ok) return send(res, gate.code, { error: gate.error });

      if (!id && req.method === "GET") {
        const result = await db.listRegistrations({
          status: query.status || undefined,
          limit: query.limit ? parseInt(query.limit, 10) : 200,
          offset: query.offset ? parseInt(query.offset, 10) : 0,
        });
        return send(res, 200, result, { "Cache-Control": "no-store" });
      }
      if (id && req.method === "PATCH") {
        const updated = await db.updateRegistration(id, body);
        if (!updated) return send(res, 404, { error: "Not found." });
        await db.logAudit(gate.session.role, "update", "registration", id);
        return send(res, 200, { ok: true, registration: updated });
      }
      if (id && req.method === "DELETE") {
        const removed = await db.deleteRegistration(id);
        if (!removed) return send(res, 404, { error: "Not found." });
        await db.logAudit(gate.session.role, "delete", "registration", id);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "Method not allowed." });
    }

    if (resource === "healthz") {
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "Unknown route." });
  } catch (err) {
    console.error("api error:", err);
    return send(res, 500, { error: err.message || "Internal error." });
  }
}
