-- trivo-students — deliberately simpler than trivo-lean's schema. This is
-- a v1: one directly-editable content document (no draft/publish/snapshot
-- system yet — see README.md "What's temporary here"), plus a
-- registrations table for the student sign-up form.

CREATE TABLE IF NOT EXISTS site_content (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  data        JSONB       NOT NULL, -- hero copy, stats, course cards, faq, etc — see data/config.json
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_content_singleton CHECK (id = 1)
);

-- The temporary registration form (see README.md) posts here. `data` holds
-- whatever fields the current form version collects — deliberately loose,
-- the same pattern trivo-lean uses for its own submissions table, since
-- the form fields are expected to change once the real multi-step version
-- is built.
CREATE TABLE IF NOT EXISTS registrations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT        NOT NULL DEFAULT 'new',
  notes       TEXT        NOT NULL DEFAULT '',
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON registrations (created_at DESC);
CREATE INDEX IF NOT EXISTS registrations_status_idx     ON registrations (status);

-- Partial-progress capture for the questionnaire: one row per browser
-- (client_id, generated and kept in localStorage), upserted on every
-- autosave as the person fills the form out. Separate from
-- `registrations` on purpose — this is "what we saw them typing", not a
-- completed submission. Lets the admin panel show a drop-off funnel (how
-- many people's furthest screen was each step) and, if desired, follow up
-- with people who got most of the way through and didn't finish.
CREATE TABLE IF NOT EXISTS draft_registrations (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   TEXT        NOT NULL UNIQUE,
  data                        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  current_step                INTEGER     NOT NULL DEFAULT -1,
  furthest_step               INTEGER     NOT NULL DEFAULT -1,
  total_steps                 INTEGER     NOT NULL DEFAULT 0,
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted                   BOOLEAN     NOT NULL DEFAULT false,
  submitted_registration_id   UUID        REFERENCES registrations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS draft_registrations_updated_at_idx ON draft_registrations (updated_at DESC);
CREATE INDEX IF NOT EXISTS draft_registrations_submitted_idx  ON draft_registrations (submitted);

CREATE TABLE IF NOT EXISTS audit_log (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  role    TEXT        NOT NULL,
  action  TEXT        NOT NULL,
  entity  TEXT        NOT NULL,
  detail  TEXT        NOT NULL DEFAULT ''
);
