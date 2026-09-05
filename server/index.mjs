/**
 * Trivo Student Programs — lean self-hosted entrypoint. Same pattern as
 * trivo-lean's server/index.mjs: plain Node `http`, zero framework,
 * static + /api/*. Own Postgres, own Docker Compose project — see
 * ../edge/README.md for how this joins the shared reverse proxy.
 */

import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleApi } from "./lib/router.mjs";
import { serveStatic } from "./lib/static.mjs";
import * as db from "./lib/db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

function required(name) {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}. See .env.example.`);
    process.exit(1);
  }
}

required("ADMIN_PASSWORD");
required("SESSION_SECRET");
required("DATABASE_URL");

const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
function accessLog(req, res, startedAt) {
  if (LOG_LEVEL === "silent") return;
  if (req.url === "/healthz") return;
  const ms = Date.now() - startedAt;
  console.log(`${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  res.on("finish", () => accessLog(req, res, startedAt));

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(SITE_ROOT, req, res, url);
  } catch (err) {
    console.error("unhandled server error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error." }));
    }
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

async function start() {
  try {
    await db.healthcheck();
    console.log("Database connection OK.");
  } catch (err) {
    console.error("FATAL: could not connect to the database:", err.message);
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    console.log(`Trivo Student Programs server listening on http://${HOST}:${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
