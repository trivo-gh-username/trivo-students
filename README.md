# Trivo Student Programs

`students.trivoailabs.com` — a separate app from trivo-lean, with its own
database, admin, and CI/CD. Nothing here reads or writes trivo-lean's
data, and nothing in trivo-lean's deploy touches this project.

## Quick start (local)

```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up --build
```

Site → http://localhost:3100 · Admin → http://localhost:3100/admin/

## Production

```bash
cp .env.example .env   # set DOMAIN, ADMIN_PASSWORD, SESSION_SECRET, POSTGRES_PASSWORD
docker compose up -d
./scripts/deploy.sh    # publishes this app's Caddy config into the shared edge/ stack
```

Requires the shared `edge/` stack already running on the host — see
`../edge/README.md`. Nothing else about trivo-lean or ai-vision-demo needs
to exist for this to work.

## What's temporary here (on purpose)

This is a deliberate v1, not an oversight. Two things are explicitly
scoped down for now, per the original brief, and called out here so
nobody mistakes "simple" for "unfinished by accident":

1. **The registration form (`students-form.html`) is a single page**, not
   the multi-step, save-as-you-go, progressively-informative experience
   described in the design brief. It collects name/email/phone/college/
   path/message, submits once, done. The full version — save state
   between steps, interleaved educational content, more thoughtful
   sequencing to build trust before asking for more — is real, planned
   work for later, not a corner cut silently.
2. **Site content editing is direct-write, no draft/publish/versioning.**
   `POST /api/content` overwrites the live content immediately. This is
   intentionally simpler than trivo-lean's catalog/snapshot system (see
   `trivo-lean/docs/CATALOG_MODEL.md`) because this site's content changes
   far less often and is managed by a much smaller team. If that stops
   being true, trivo-lean's `catalog.mjs` pattern (draft tables +
   immutable publish snapshots) is the template to bring over — don't
   reinvent it from scratch.

Everything else — the DB, admin auth, rate limiting, the Caddy/edge
deploy pattern, CI/CD — is built the same way as trivo-lean, not
shortcut.

## Design

Dark mode, Space Grotesk (display) + Inter (body), inspired by
brilliant.org's confident stat-driven layout and apple.com's restraint —
generous whitespace, scroll-triggered reveals, one clear CTA per screen.
See `css/app.css` for the full token set.

## Structure

```
index.html            landing page
students-form.html    the temporary registration form (see above)
admin/index.html      lean admin: site content editor + registrations list
server/                plain Node http, same pattern as trivo-lean, much smaller
db/schema.sql          site_content (single doc) + registrations + audit_log
deploy/                Caddy site template for the shared edge/ stack
```

## Registrations

Every submission lands in the `registrations` table, reviewable in
`/admin/`. Rate-limited (5/10min, 15/day per IP) and honeypot/timing-trap
protected, same as trivo-lean's contact form.
