/**
 * Static file serving — security headers, clean-URL redirects, and
 * per-path Cache-Control rules. Caddy (in front of this process) adds
 * zstd/gzip compression and TLS. This module is the origin-level policy.
 *
 * Deliberately simpler than trivo-lean's version: no dynamic SEO
 * injection yet (single landing page, content changes infrequently enough
 * that a manual title/meta update is fine for v1 — revisit if this site's
 * content starts changing as often as trivo-lean's catalog does).
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

export const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

const REDIRECTS = [
  { from: "/admin", to: "/admin/", status: 301 },
  { from: "/form", to: "/students-form.html", status: 301 },
  { from: "/register", to: "/students-form.html", status: 301 },
];

const REWRITES = [{ from: "/admin/", to: "/admin/index.html" }];

function cacheControlFor(pathname) {
  if (pathname.startsWith("/admin/")) return "no-store";
  if (pathname.startsWith("/data/")) return "no-store";
  if (/\/(css|js)\/[^/]+\.[a-f0-9]{8,}\.(css|js)$/.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/css/") || pathname.startsWith("/js/")) return "no-cache";
  if (pathname === "/favicon.svg") return "public, max-age=604800";
  if (/\.(png|jpe?g|webp|avif|ico|webmanifest|woff2)$/.test(pathname)) return "public, max-age=604800";
  if (pathname.endsWith(".html")) return "no-cache";
  return "no-cache";
}

function extraHeadersFor(pathname) {
  const h = {};
  if (pathname.startsWith("/admin/")) h["X-Robots-Tag"] = "noindex, nofollow, noarchive";
  if (pathname.startsWith("/data/")) h["X-Robots-Tag"] = "noindex";
  return h;
}

export function findRedirect(pathname) {
  return REDIRECTS.find((r) => r.from === pathname) || null;
}

function applyRewrite(pathname) {
  const hit = REWRITES.find((r) => r.from === pathname);
  return hit ? hit.to : pathname;
}

/** Prevents path traversal (../../etc) — resolves within ROOT only. */
function safeJoin(root, pathname) {
  const target = normalize(join(root, pathname));
  if (!target.startsWith(root + sep) && target !== root) return null;
  return target;
}

export async function serveStatic(root, req, res, url) {
  let pathname = decodeURIComponent(url.pathname);

  const redirect = findRedirect(pathname);
  if (redirect) {
    res.writeHead(redirect.status, { Location: redirect.to, ...SECURITY_HEADERS });
    res.end();
    return;
  }

  pathname = applyRewrite(pathname);

  let filePath = safeJoin(root, pathname);
  if (!filePath) {
    res.writeHead(400, SECURITY_HEADERS);
    res.end("Bad request.");
    return;
  }

  if (pathname.endsWith("/")) {
    filePath = join(filePath, "index.html");
  } else if (!extname(filePath) && !existsSync(filePath)) {
    const withHtml = filePath + ".html";
    if (existsSync(withHtml)) filePath = withHtml;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const notFound = join(root, "404.html");
    const headers = { "Content-Type": MIME[".html"], "Cache-Control": "no-cache", ...SECURITY_HEADERS };
    res.writeHead(404, headers);
    if (existsSync(notFound)) createReadStream(notFound).pipe(res);
    else res.end("Not found.");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheControlFor(pathname),
    ...SECURITY_HEADERS,
    ...extraHeadersFor(pathname),
  };

  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}
