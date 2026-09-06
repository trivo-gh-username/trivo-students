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
import { pgTable, integer, text, timestamp, uuid, jsonb, bigint } from "drizzle-orm/pg-core";
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
  _db = drizzle(getPool(), { schema: { siteContent, registrations, auditLog } });
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
};
