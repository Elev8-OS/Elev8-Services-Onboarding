'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL fehlt. Bitte Postgres an den Service anhaengen.');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: /\bsslmode=require\b/.test(connectionString || '') ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      external_id  TEXT,
      note         TEXT,
      elev8_token  TEXT,
      facts        JSONB,
      readiness    JSONB,
      prefill      JSONB,
      synced_at    TIMESTAMPTZ,
      sync_error   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intakes (
      id            SERIAL PRIMARY KEY,
      token         TEXT UNIQUE NOT NULL,
      tenant_name   TEXT NOT NULL,
      note          TEXT,
      status        TEXT NOT NULL DEFAULT 'open',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      submitted_at  TIMESTAMPTZ
    );
  `);
  await pool.query(`ALTER TABLE intakes ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE intakes ADD COLUMN IF NOT EXISTS snapshot JSONB;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      intake_id   INTEGER NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
      field_id    TEXT NOT NULL,
      value       TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT 'tenant',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (intake_id, field_id)
    );
  `);
  await pool.query(`ALTER TABLE answers ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'tenant';`);
  await pool.query(`CREATE INDEX IF NOT EXISTS answers_intake_idx ON answers(intake_id);`);
}

/* ---------------- tenants ---------------- */

async function listTenants() {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.external_id, t.note, t.synced_at, t.sync_error,
           (t.elev8_token IS NOT NULL AND t.elev8_token <> '') AS has_token,
           t.facts, t.readiness,
           COALESCE(c.n, 0) AS intake_count
    FROM tenants t
    LEFT JOIN (SELECT tenant_id, COUNT(*) AS n FROM intakes GROUP BY tenant_id) c ON c.tenant_id = t.id
    ORDER BY lower(t.name)
  `);
  return rows;
}

async function getTenant(id) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
  return rows[0] || null;
}

async function upsertTenant(name, externalId, note, token) {
  const { rows } = await pool.query(
    `INSERT INTO tenants (name, external_id, note, elev8_token)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, externalId || null, note || null, token || null]
  );
  return rows[0];
}

async function updateTenantToken(id, token) {
  await pool.query('UPDATE tenants SET elev8_token = $2 WHERE id = $1', [id, token || null]);
}

async function saveTenantSync(id, result, error) {
  await pool.query(
    // Ein fehlgeschlagener Sync darf den letzten guten Stand nicht loeschen.
    `UPDATE tenants SET
       facts     = COALESCE($2::jsonb, facts),
       readiness = COALESCE($3::jsonb, readiness),
       prefill   = COALESCE($4::jsonb, prefill),
       synced_at = CASE WHEN $2::jsonb IS NOT NULL THEN now() ELSE synced_at END,
       sync_error = $5
     WHERE id = $1`,
    [
      id,
      result ? JSON.stringify(result.facts) : null,
      result ? JSON.stringify(result.readiness) : null,
      result ? JSON.stringify(result.prefill) : null,
      error || null
    ]
  );
}

async function deleteTenant(id) {
  await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
}

/* ---------------- intakes ---------------- */

async function listIntakes() {
  const { rows } = await pool.query(`
    SELECT i.*, COALESCE(a.filled, 0) AS filled
    FROM intakes i
    LEFT JOIN (
      SELECT intake_id, COUNT(*) AS filled
      FROM answers WHERE value <> '' GROUP BY intake_id
    ) a ON a.intake_id = i.id
    ORDER BY i.created_at DESC
  `);
  return rows;
}

async function createIntake(tenant, token, snapshot) {
  const { rows } = await pool.query(
    `INSERT INTO intakes (tenant_id, tenant_name, token, note, snapshot)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tenant.id, tenant.name, token, tenant.note || null, snapshot ? JSON.stringify(snapshot) : null]
  );
  return rows[0];
}

async function getIntakeByToken(token) {
  const { rows } = await pool.query('SELECT * FROM intakes WHERE token = $1', [token]);
  return rows[0] || null;
}

async function getIntakeById(id) {
  const { rows } = await pool.query('SELECT * FROM intakes WHERE id = $1', [id]);
  return rows[0] || null;
}

async function linkIntakeTenant(intakeId, tenantId) {
  await pool.query('UPDATE intakes SET tenant_id = $2 WHERE id = $1', [intakeId, tenantId]);
}

/**
 * Aufnahmen, die fuer den Nachtlauf in Frage kommen: mit verknuepftem
 * Tenant und hinterlegtem Elev8-Token. Aelter als maxDays wird ignoriert,
 * damit wir nicht ewig gegen tote Aufnahmen laufen.
 */
async function listIntakesForResync(maxDays) {
  const { rows } = await pool.query(`
    SELECT i.id, i.token, i.tenant_id, i.tenant_name, i.status, i.snapshot,
           t.elev8_token, t.name AS tenant_real_name
    FROM intakes i
    JOIN tenants t ON t.id = i.tenant_id
    WHERE t.elev8_token IS NOT NULL
      AND t.elev8_token <> ''
      AND i.created_at > now() - ($1 || ' days')::interval
    ORDER BY i.created_at DESC
  `, [String(maxDays || 90)]);
  return rows;
}

async function setIntakeSnapshot(id, snapshot) {
  await pool.query('UPDATE intakes SET snapshot = $2 WHERE id = $1', [id, JSON.stringify(snapshot)]);
}

/* ---------------- answers ---------------- */

async function getAnswers(intakeId) {
  const { rows } = await pool.query(
    'SELECT field_id, value, source FROM answers WHERE intake_id = $1', [intakeId]
  );
  const values = {};
  const sources = {};
  rows.forEach(function (r) { values[r.field_id] = r.value; sources[r.field_id] = r.source; });
  return { values: values, sources: sources };
}

async function saveAnswer(intakeId, fieldId, value, source) {
  await pool.query(
    `INSERT INTO answers (intake_id, field_id, value, source, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (intake_id, field_id)
     DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now()`,
    [intakeId, fieldId, value, source || 'tenant']
  );
}

async function setStatus(intakeId, status) {
  await pool.query(
    `UPDATE intakes SET status = $2, submitted_at = CASE WHEN $2 = 'submitted' THEN now() ELSE submitted_at END WHERE id = $1`,
    [intakeId, status]
  );
}

async function deleteIntake(intakeId) {
  await pool.query('DELETE FROM intakes WHERE id = $1', [intakeId]);
}

module.exports = {
  pool, init,
  listTenants, getTenant, upsertTenant, updateTenantToken, saveTenantSync, deleteTenant,
  listIntakes, createIntake, getIntakeByToken, getIntakeById, setIntakeSnapshot, linkIntakeTenant,
  listIntakesForResync,
  getAnswers, saveAnswer, setStatus, deleteIntake
};
