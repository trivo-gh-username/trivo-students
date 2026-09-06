/**
 * Database access for trivo-students.
 *
 * Deliberately simpler than trivo-lean's: ONE directly-editable content
 * document (site_content), no draft/publish/snapshot system — admin saves
 * write straight through. This is a considered v1 scope, not an oversight
 * — see README.md "What's temporary here." If this site's content editing
 * grows past a single small team, trivo-lean's catalog.mjs is the pattern
 * to bring over (draft tables + immutable publish snapshots).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, integer, text, timestamp, uuid, jsonb, bigint, boolean } from "drizzle-orm/pg-core";
import { eq, desc, sql, count } from "drizzle-orm";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const siteContent = pgTable("site_content", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const registrations = pgTable("registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("new"),
  notes: text("notes").notNull().default(""),
  data: jsonb("data").notNull().default({}),
});

const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  role: text("role").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  detail: text("detail").notNull().default(""),
});

// Partial-progress capture for the registration questionnaire — a
// separate table from `registrations` on purpose. `registrations` is
// "things a person actually chose to submit"; this is "what we saw them
// typing along the way", kept so drop-off can be measured (which screen
// people abandon on) and so a person who got most of the way through can
// be followed up with, without ever pretending an in-progress fill-out is
// the same thing as a completed registration. One row per client_id
// (the browser generates and keeps a stable id in localStorage), upserted
// on every autosave — never a growing history of every keystroke.
const draftRegistrations = pgTable("draft_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull().unique(),
  data: jsonb("data").notNull().default({}),
  current_step: integer("current_step").notNull().default(-1),
  furthest_step: integer("furthest_step").notNull().default(-1),
  total_steps: integer("total_steps").notNull().default(0),
  started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  submitted: boolean("submitted").notNull().default(false),
  submitted_registration_id: uuid("submitted_registration_id"),
});

let _pool = null;
let _db = null;

function getPool() {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  _pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  return _pool;
}

function getDb() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema: { siteContent, registrations, draftRegistrations, auditLog } });
  return _db;
}

let _schemaReady = null;
async function ensureSchema() {
  if (_schemaReady) return _schemaReady;
  const database = getDb();
  _schemaReady = (async () => {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS site_content (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT site_content_singleton CHECK (id = 1)
      )`);
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT NOT NULL DEFAULT '',
        data JSONB NOT NULL DEFAULT '{}'::jsonb
      )`);
    await database.execute(sql`CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON registrations (created_at DESC)`);
    await database.execute(sql`CREATE INDEX IF NOT EXISTS registrations_status_idx ON registrations (status)`);
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS draft_registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id TEXT NOT NULL UNIQUE,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        current_step INTEGER NOT NULL DEFAULT -1,
        furthest_step INTEGER NOT NULL DEFAULT -1,
        total_steps INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        submitted BOOLEAN NOT NULL DEFAULT false,
        submitted_registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL
      )`);
    await database.execute(sql`CREATE INDEX IF NOT EXISTS draft_registrations_updated_at_idx ON draft_registrations (updated_at DESC)`);
    await database.execute(sql`CREATE INDEX IF NOT EXISTS draft_registrations_submitted_idx ON draft_registrations (submitted)`);
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT ''
      )`);
  })();
  return _schemaReady;
}

function readSeedConfig() {
  try {
    return JSON.parse(readFileSync(join(__dirname, "..", "..", "data", "config.json"), "utf8"));
  } catch (err) {
    console.error("Could not read data/config.json seed:", err.message);
    return null;
  }
}

let _seeded = false;
async function ensureSeeded() {
  if (_seeded) return;
  await ensureSchema();
  const database = getDb();
  const existing = await database.select({ id: siteContent.id }).from(siteContent).where(eq(siteContent.id, 1)).limit(1);
  if (!existing.length) {
    const seed = readSeedConfig() || { site: { name: "Trivo Student Programs" } };
    await database.insert(siteContent).values({ id: 1, data: seed });
  }
  _seeded = true;
}

async function getContent() {
  await ensureSeeded();
  const database = getDb();
  const rows = await database.select().from(siteContent).where(eq(siteContent.id, 1)).limit(1);
  return rows.length ? rows[0].data : null;
}

async function saveContent(data) {
  await ensureSeeded();
  const database = getDb();
  await database.update(siteContent).set({ data, updated_at: new Date() }).where(eq(siteContent.id, 1));
  return { updatedAt: new Date().toISOString() };
}

async function createRegistration({ data, status = "new" }) {
  await ensureSeeded();
  const database = getDb();
  const [row] = await database.insert(registrations).values({ data, status }).returning();
  return row;
}

async function listRegistrations({ status, limit = 200, offset = 0 } = {}) {
  await ensureSeeded();
  const database = getDb();
  const conditions = status ? eq(registrations.status, status) : undefined;
  let query = database.select().from(registrations).orderBy(desc(registrations.created_at)).limit(limit).offset(offset);
  if (conditions) query = query.where(conditions);
  const rows = await query;
  const [{ total }] = await database.select({ total: count() }).from(registrations);
  return { rows, total };
}

async function updateRegistration(id, patch) {
  await ensureSeeded();
  const database = getDb();
  const fields = { updated_at: new Date() };
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.notes !== undefined) fields.notes = patch.notes;
  const [row] = await database.update(registrations).set(fields).where(eq(registrations.id, id)).returning();
  return row || null;
}

async function deleteRegistration(id) {
  await ensureSeeded();
  const database = getDb();
  const [row] = await database.delete(registrations).where(eq(registrations.id, id)).returning({ id: registrations.id });
  return !!row;
}

async function logAudit(role, action, entity, detail = "") {
  try {
    await ensureSeeded();
    const database = getDb();
    await database.insert(auditLog).values({ role, action, entity, detail: String(detail).slice(0, 500) });
  } catch (err) {
    console.error("audit log failed:", err.message);
  }
}

// ── Draft (in-progress) registrations ─────────────────────────────────
// One row per client_id, upserted on every autosave. `furthest_step` only
// ever moves forward (a person going Back to fix an earlier answer
// shouldn't make it look like they regressed in the funnel).
async function upsertDraftRegistration({ clientId, data, currentStep, furthestStep, totalSteps }) {
  await ensureSeeded();
  const database = getDb();
  const now = new Date();
  const [row] = await database
    .insert(draftRegistrations)
    .values({
      client_id: clientId,
      data,
      current_step: currentStep,
      furthest_step: furthestStep,
      total_steps: totalSteps,
      started_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: draftRegistrations.client_id,
      set: {
        data,
        current_step: currentStep,
        // GREATEST() so this can never move backwards from a stale/out-of-
        // order request (autosave calls can race on a flaky connection).
        furthest_step: sql`GREATEST(${draftRegistrations.furthest_step}, ${furthestStep})`,
        total_steps: totalSteps,
        updated_at: now,
      },
    })
    .returning();
  return row;
}

async function markDraftSubmitted(clientId, registrationId) {
  if (!clientId) return;
  await ensureSeeded();
  const database = getDb();
  await database
    .update(draftRegistrations)
    .set({ submitted: true, submitted_registration_id: registrationId, updated_at: new Date() })
    .where(eq(draftRegistrations.client_id, clientId));
}

async function listDraftRegistrations({ includeSubmitted = false, limit = 200, offset = 0 } = {}) {
  await ensureSeeded();
  const database = getDb();
  let query = database.select().from(draftRegistrations).orderBy(desc(draftRegistrations.updated_at)).limit(limit).offset(offset);
  if (!includeSubmitted) query = query.where(eq(draftRegistrations.submitted, false));
  const rows = await query;
  const [{ total }] = await database.select({ total: count() }).from(draftRegistrations);
  return { rows, total };
}

async function deleteDraftRegistration(id) {
  await ensureSeeded();
  const database = getDb();
  const [row] = await database.delete(draftRegistrations).where(eq(draftRegistrations.id, id)).returning({ id: draftRegistrations.id });
  return !!row;
}

// Funnel: how many people's *furthest* screen was each step, plus overall
// start -> finish conversion. Computed on read rather than maintained
// incrementally — this table is small (one row per attempt, not per
// keystroke), so a full scan on an admin page load is cheap.
async function getFunnelStats() {
  await ensureSeeded();
  const database = getDb();
  const rows = await database
    .select({ furthest_step: draftRegistrations.furthest_step, submitted: draftRegistrations.submitted })
    .from(draftRegistrations);
  const totalStarted = rows.length;
  const totalSubmitted = rows.filter((r) => r.submitted).length;
  const byStep = {};
  for (const r of rows) {
    const step = r.furthest_step;
    byStep[step] = (byStep[step] || 0) + 1;
  }
  return { totalStarted, totalSubmitted, byFurthestStep: byStep };
}

async function healthcheck() {
  const database = getDb();
  await database.execute(sql`SELECT 1`);
}

export {
  ensureSchema,
  ensureSeeded,
  healthcheck,
  getContent,
  saveContent,
  createRegistration,
  listRegistrations,
  updateRegistration,
  deleteRegistration,
  logAudit,
  upsertDraftRegistration,
  markDraftSubmitted,
  listDraftRegistrations,
  deleteDraftRegistration,
  getFunnelStats,
};
