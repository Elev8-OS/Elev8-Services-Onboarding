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
  await pool.query(`ALTER TABLE intakes ADD COLUMN IF NOT EXISTS lang TEXT;`);
  await pool.query(`ALTER TABLE intakes ADD COLUMN IF NOT EXISTS terms JSONB;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id           SERIAL PRIMARY KEY,
      intake_id    INTEGER NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      lang         TEXT NOT NULL,
      doc_text     TEXT NOT NULL,
      doc_hash     TEXT NOT NULL,
      answers      JSONB NOT NULL,
      terms        JSONB NOT NULL,
      signer_name  TEXT NOT NULL,
      signer_role  TEXT,
      signer_email TEXT NOT NULL,
      signer_ip    TEXT,
      signer_ua    TEXT,
      signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      pdf          BYTEA,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_per_kind ON contracts(intake_id, kind);`);
  // Jeder Vertrag wird in beiden Sprachen ausgestellt; verbindlich ist Deutsch.
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_en BYTEA`);
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS doc_text_en TEXT`);
  // Gekündigte Kunden bleiben lesbar, verschwinden aber aus dem Alltag.
  await pool.query(`ALTER TABLE intakes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await migrateOptionCodes();
  await migrateModules();
}

/**
 * Vor den Modulen steckte der Leistungsumfang in den Antworten des Tenants
 * und das Revenue-Paket in einer Frage. Beides wandert einmalig in die
 * Vertragsdaten der Aufnahme, wo es nur noch der Admin pflegt. Aufnahmen,
 * die bereits einen Modulstand tragen, bleiben unberuehrt.
 */
async function migrateModules() {
  const mods = require('./modules');
  const { rows } = await pool.query(`SELECT id, terms FROM intakes`);
  let changed = 0;
  for (const r of rows) {
    const terms = r.terms || {};
    if (terms.mod_gro !== undefined || terms.mod_rm !== undefined) continue;
    const { rows: ans } = await pool.query(
      `SELECT field_id, value FROM answers WHERE intake_id = $1
         AND field_id IN ('scope','scope_extra','coverage','coverage_custom','revenue_package')`,
      [r.id]);
    const a = {};
    ans.forEach(function (x) { a[x.field_id] = x.value; });

    const next = Object.assign({}, terms);
    // Guest Relations gab es bisher fuer jede Aufnahme.
    next.mod_gro = '1';
    next.gro_scope = String(a.scope || '').trim() || mods.defaults('gro').gro_scope;
    next.gro_scope_extra = String(a.scope_extra || '').trim();
    next.gro_coverage = String(a.coverage || '').trim() || 'h24_7';
    next.gro_coverage_custom = String(a.coverage_custom || '').trim();
    // Revenue Management nur dort, wo der Tenant es bestellt hatte.
    const hadRm = String(a.revenue_package || '') === 'yes';
    next.mod_rm = hadRm ? '1' : '';
    next.rm_scope = terms.rm_scope || mods.defaults('rm').rm_scope;

    await pool.query('UPDATE intakes SET terms = $2 WHERE id = $1', [r.id, next]);
    changed++;
  }
  if (changed) console.log('Module aus den Antworten uebernommen: ' + changed + ' Aufnahmen');
}

/**
 * Vor der Zweisprachigkeit standen in den Antworten die deutschen
 * Optionstexte. Jetzt stehen dort Codes. Was noch alt ist, wird einmalig
 * uebersetzt - alles, was sich nicht zuordnen laesst, bleibt unangetastet.
 */
async function migrateOptionCodes() {
  const { legacyCodeMap, FIELD_MAP } = require('./questions');
  const map = legacyCodeMap();
  const { rows } = await pool.query(
    `SELECT intake_id, field_id, value FROM answers WHERE value <> ''`);
  let changed = 0;
  for (const r of rows) {
    const f = FIELD_MAP.get(r.field_id);
    if (!f || !f.options) continue;
    const parts = String(r.value).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    const known = f.options.map(function (x) { return x.code; });
    if (parts.every(function (x) { return known.indexOf(x) > -1; })) continue;   // schon Codes
    const mapped = parts.map(function (x) {
      return map.get(r.field_id + '::' + x.toLowerCase()) || null;
    });
    if (mapped.some(function (x) { return !x; })) continue;                      // unklar -> lassen
    await pool.query('UPDATE answers SET value = $3 WHERE intake_id = $1 AND field_id = $2',
      [r.intake_id, r.field_id, mapped.join(', ')]);
    changed++;
  }
  if (changed) console.log('Antworten auf Optionscodes umgestellt: ' + changed);
}

/* ---------------- tenants ---------------- */

async function listTenants() {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.external_id, t.note, t.synced_at, t.sync_error, t.archived_at,
           (t.elev8_token IS NOT NULL AND t.elev8_token <> '') AS has_token,
           t.facts, t.readiness,
           COALESCE(c.n, 0) AS intake_count
    FROM tenants t
    LEFT JOIN (SELECT tenant_id, COUNT(*) AS n FROM intakes GROUP BY tenant_id) c ON c.tenant_id = t.id
    ORDER BY (t.archived_at IS NOT NULL), lower(t.name)
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

/**
 * Löscht den Tenant samt seiner Aufnahmen. Ohne das blieben die Aufnahmen
 * als Waisen stehen - die Fremdschlüsselregel setzt nur tenant_id auf NULL.
 * Aufgerufen wird das nur, wenn kein Vertrag unterzeichnet ist.
 */
async function deleteTenant(id) {
  await pool.query('DELETE FROM intakes WHERE tenant_id = $1', [id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
}

/* ---------------- intakes ---------------- */

async function listIntakes() {
  const { rows } = await pool.query(`
    SELECT i.*, COALESCE(a.filled, 0) AS filled, COALESCE(c.n, 0) AS signed_count
    FROM intakes i
    LEFT JOIN (
      SELECT intake_id, COUNT(*) AS filled
      FROM answers WHERE value <> '' GROUP BY intake_id
    ) a ON a.intake_id = i.id
    LEFT JOIN (
      SELECT intake_id, COUNT(*) AS n FROM contracts GROUP BY intake_id
    ) c ON c.intake_id = i.id
    ORDER BY i.created_at DESC
  `);
  return rows;
}

/** Archivieren statt löschen: der Fall bleibt nachlesbar, ist aber erledigt. */
async function setArchived(intakeId, on) {
  await pool.query('UPDATE intakes SET archived_at = ' + (on ? 'now()' : 'NULL') +
    ' WHERE id = $1', [intakeId]);
}

async function setTenantArchived(id, on) {
  await pool.query('UPDATE tenants SET archived_at = ' + (on ? 'now()' : 'NULL') +
    ' WHERE id = $1', [id]);
}

/** Wie viele unterzeichnete Verträge hängen an diesem Tenant? */
async function signedCountForTenant(id) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM contracts c
       JOIN intakes i ON i.id = c.intake_id
      WHERE i.tenant_id = $1`, [id]);
  return rows[0] ? rows[0].n : 0;
}

async function createIntake(tenant, token, snapshot) {
  // Neue Aufnahme: Guest Relations ist das Standardmodul und kommt mit dem
  // vollen Leistungsumfang; Revenue Management schaltet der Admin dazu.
  const mods = require('./modules');
  const terms = Object.assign({ mod_gro: '1', mod_rm: '' },
    mods.defaults('gro'), { rm_scope: mods.defaults('rm').rm_scope });
  const { rows } = await pool.query(
    `INSERT INTO intakes (tenant_id, tenant_name, token, note, snapshot, terms)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tenant.id, tenant.name, token, tenant.note || null,
      snapshot ? JSON.stringify(snapshot) : null, terms]
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

/* ---------------- Vertraege ---------------- */

async function setTerms(intakeId, terms) {
  await pool.query('UPDATE intakes SET terms = $2 WHERE id = $1', [intakeId, JSON.stringify(terms)]);
}

/** Unterzeichnete Vertraege einer Aufnahme, ohne die PDF-Daten. */
async function listContracts(intakeId) {
  const { rows } = await pool.query(
    `SELECT id, kind, lang, doc_hash, signer_name, signer_role, signer_email,
            signer_ip, signed_at
     FROM contracts WHERE intake_id = $1 ORDER BY signed_at`, [intakeId]);
  return rows;
}

async function getContract(intakeId, kind) {
  const { rows } = await pool.query(
    'SELECT * FROM contracts WHERE intake_id = $1 AND kind = $2', [intakeId, kind]);
  return rows[0] || null;
}

async function saveContract(rec) {
  const { rows } = await pool.query(
    `INSERT INTO contracts
       (intake_id, kind, lang, doc_text, doc_hash, answers, terms,
        signer_name, signer_role, signer_email, signer_ip, signer_ua, pdf)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (intake_id, kind) DO NOTHING
     RETURNING id, signed_at`,
    [rec.intakeId, rec.kind, rec.lang, rec.docText, rec.docHash,
      JSON.stringify(rec.answers || {}), JSON.stringify(rec.terms || {}),
      rec.signerName, rec.signerRole || null, rec.signerEmail,
      rec.signerIp || null, rec.signerUa || null, rec.pdf || null]);
  return rows[0] || null;
}

async function setIntakeLang(id, lang) {
  await pool.query('UPDATE intakes SET lang = $2 WHERE id = $1', [id, lang]);
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
  listIntakesForResync, setIntakeLang, setTerms, listContracts, getContract, saveContract,
  getAnswers, saveAnswer, setStatus, deleteIntake,
  setArchived, setTenantArchived, signedCountForTenant
};
