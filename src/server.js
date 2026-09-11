'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');

const db = require('./db');
const elev8 = require('./elev8');
const { FIELD_MAP, SECTIONS } = require('./questions');
const view = require('./render');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ELEV8_ADMIN_TOKEN = process.env.ELEV8_ADMIN_TOKEN || '';
const ELEV8_TENANTS_TOOL = process.env.ELEV8_TENANTS_TOOL || '';
const COOKIE = 'e8sess';

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

/* ---------- helpers ---------- */

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return proto + '://' + req.get('host');
}

function sign(value) {
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex').slice(0, 32);
  return value + '.' + mac;
}

function verify(signed) {
  if (!signed || signed.indexOf('.') === -1) return null;
  const idx = signed.lastIndexOf('.');
  const value = signed.slice(0, idx);
  return sign(value) === signed ? value : null;
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.slice(0, name.length + 1) === name + '=') return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const v = verify(readCookie(req, COOKIE));
  if (!v) return false;
  const parts = v.split('|');
  return parts[0] === 'admin' && Date.now() < Number(parts[1] || 0);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.redirect('/admin/login');
}

function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function errText(e) {
  const m = (e && e.message) || String(e);
  return m.length > 700 ? m.slice(0, 700) + '…' : m;
}

/** Holt Elev8-Daten fuer einen Tenant und schreibt sie weg. */
async function syncTenant(tenant) {
  if (!tenant.elev8_token) {
    await db.saveTenantSync(tenant.id, null, 'Kein Elev8-Token hinterlegt.');
    return null;
  }
  try {
    const result = await elev8.sync(tenant.elev8_token, tenant.name);
    await db.saveTenantSync(tenant.id, result, null);
    return result;
  } catch (e) {
    await db.saveTenantSync(tenant.id, null, errText(e));
    return null;
  }
}

/**
 * Eine Aufnahme haelt ihre Vorbelegung als Schnappschuss fest. Wurde sie
 * angelegt, bevor Elev8-Daten da waren, ist der Schnappschuss leer - dann
 * holen wir ihn beim naechsten Aufruf aus dem Tenant nach und schreiben ihn
 * fest, damit der Tenant ab dann eine stabile Ansicht sieht.
 */
async function tenantForIntake(intake) {
  if (intake.tenant_id) return db.getTenant(intake.tenant_id);
  // Aufnahmen aus der ersten Fassung tragen nur den Namen. Passt einer auf
  // einen angelegten Tenant, tragen wir die Verknuepfung nach.
  const name = String(intake.tenant_name || '').trim().toLowerCase();
  if (!name) return null;
  const all = await db.listTenants();
  const hit = all.filter(function (t) { return String(t.name).trim().toLowerCase() === name; })[0];
  if (!hit) return null;
  await db.linkIntakeTenant(intake.id, hit.id);
  intake.tenant_id = hit.id;
  return db.getTenant(hit.id);
}

async function ensureSnapshot(intake) {
  const pre = intake.snapshot && intake.snapshot.prefill;
  if (pre && Object.keys(pre).length) return intake.snapshot;

  const t = await tenantForIntake(intake);
  if (!t || !t.prefill || !Object.keys(t.prefill).length) return intake.snapshot || null;

  const snap = {
    facts: t.facts, prefill: t.prefill, readiness: t.readiness || [],
    syncedAt: t.synced_at ? new Date(t.synced_at).toISOString() : new Date().toISOString()
  };
  await db.setIntakeSnapshot(intake.id, snap);
  intake.snapshot = snap;
  return snap;
}

/* ---------- health ---------- */

app.get('/healthz', function (req, res) { res.type('text/plain').send('ok'); });
app.get('/', function (req, res) { res.redirect('/admin'); });

/* ---------- admin auth ---------- */

app.get('/admin/login', function (req, res) {
  if (isAdmin(req)) return res.redirect('/admin');
  res.type('html').send(view.loginPage(req.query.e ? 'Passwort stimmt nicht.' : null));
});

app.post('/admin/login', function (req, res) {
  const given = String(req.body.password || '');
  if (!ADMIN_PASSWORD) return res.status(500).type('text/plain').send('ADMIN_PASSWORD ist nicht gesetzt.');
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) return res.redirect('/admin/login?e=1');
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
  res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(sign('admin|' + exp)) +
    '; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=' + (60 * 60 * 24 * 14));
  res.redirect('/admin');
});

app.get('/admin/logout', function (req, res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
  res.redirect('/admin/login');
});

/* ---------- admin: intakes ---------- */

app.get('/admin', requireAdmin, async function (req, res, next) {
  try {
    const [list, tenants] = await Promise.all([db.listIntakes(), db.listTenants()]);
    res.type('html').send(view.adminList(list, tenants, baseUrl(req), req.query.msg || null));
  } catch (e) { next(e); }
});

app.post('/admin/intakes', requireAdmin, async function (req, res, next) {
  try {
    const tenant = await db.getTenant(Number(req.body.tenant_id));
    if (!tenant) return res.redirect('/admin');

    // Beim Anlegen frische Daten holen; scheitert das, nehmen wir den letzten Stand.
    let result = await syncTenant(tenant);
    if (!result && tenant.facts) {
      result = { facts: tenant.facts, prefill: tenant.prefill || {}, readiness: tenant.readiness || [] };
    }
    const snapshot = result
      ? { facts: result.facts, prefill: result.prefill, readiness: result.readiness, syncedAt: new Date().toISOString() }
      : null;

    await db.createIntake(tenant, newToken(), snapshot);
    const n = snapshot ? Object.keys(snapshot.prefill || {}).length : 0;
    res.redirect('/admin?msg=' + encodeURIComponent(
      'Aufnahme für ' + tenant.name + ' angelegt' + (n ? ' — ' + n + ' Felder aus Elev8 vorausgefüllt.' : '. Ohne Elev8-Daten.')
    ));
  } catch (e) { next(e); }
});

app.get('/admin/i/:id', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.status(404).type('text/plain').send('Nicht gefunden');
    await ensureSnapshot(intake);
    const a = await db.getAnswers(intake.id);
    res.type('html').send(view.adminDetail(intake, a.values, a.sources, baseUrl(req), req.query.msg || null));
  } catch (e) { next(e); }
});

app.post('/admin/i/:id/refresh', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.redirect('/admin');
    let msg = 'Kein Tenant mit diesem Namen angelegt — bitte den Tenant unter "Tenants verwalten" anlegen.';
    {
      const t = await tenantForIntake(intake);
      if (t) {
        const result = await syncTenant(t);
        const fresh = await db.getTenant(t.id);
        if (fresh && fresh.prefill && Object.keys(fresh.prefill).length) {
          await db.setIntakeSnapshot(intake.id, {
            facts: fresh.facts, prefill: fresh.prefill, readiness: fresh.readiness || [],
            syncedAt: new Date().toISOString()
          });
          msg = Object.keys(fresh.prefill).length + ' Felder aus Elev8 übernommen' +
            (result ? '.' : ' (letzter bekannter Stand, Elev8 antwortet gerade nicht).');
        } else {
          msg = 'Elev8 lieferte keine Daten: ' + ((fresh && fresh.sync_error) || 'unbekannter Grund');
        }
      }
    }
    res.redirect('/admin/i/' + intake.id + '?msg=' + encodeURIComponent(msg));
  } catch (e) { next(e); }
});

app.get('/admin/i/:id/export.md', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.status(404).type('text/plain').send('Nicht gefunden');
    const a = await db.getAnswers(intake.id);
    const slug = intake.tenant_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    res.setHeader('Content-Disposition', 'attachment; filename="aufnahme-' + (slug || 'tenant') + '.md"');
    res.type('text/markdown; charset=utf-8').send(view.exportMarkdown(intake, a.values, a.sources));
  } catch (e) { next(e); }
});

app.get('/admin/i/:id/export.json', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.status(404).json({ error: 'not found' });
    const a = await db.getAnswers(intake.id);
    res.json({
      tenant: intake.tenant_name, status: intake.status, created_at: intake.created_at,
      answers: a.values, sources: a.sources, elev8: intake.snapshot || null
    });
  } catch (e) { next(e); }
});

/* ---------- admin: tenants ---------- */

function discoveryBlock() {
  if (ELEV8_ADMIN_TOKEN && ELEV8_TENANTS_TOOL) {
    return '<p class="banner done">Tenant-Liste aus Elev8 ist konfiguriert (' +
      view.esc(ELEV8_TENANTS_TOOL) + '). <a href="/admin/tenants/discover">Jetzt Tenants aus Elev8 laden</a>.</p>';
  }
  return '<p class="banner">Die Liste aller Tenants direkt aus Elev8 ist noch nicht verdrahtet. Sobald der ' +
    'Admin-Endpoint feststeht, genügen die Variablen <code>ELEV8_ADMIN_TOKEN</code> und ' +
    '<code>ELEV8_TENANTS_TOOL</code> — bis dahin wird ein Tenant hier einmal angelegt und danach nur noch ausgewählt.</p>';
}

app.get('/admin/tenants', requireAdmin, async function (req, res, next) {
  try {
    const tenants = await db.listTenants();
    res.type('html').send(view.tenantsPage(tenants, req.query.msg || null, req.query.err || null, discoveryBlock()));
  } catch (e) { next(e); }
});

app.post('/admin/tenants', requireAdmin, async function (req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect('/admin/tenants');
    const tenant = await db.upsertTenant(
      name,
      String(req.body.external_id || '').trim() || null,
      String(req.body.note || '').trim() || null,
      String(req.body.elev8_token || '').trim() || null
    );
    const result = await syncTenant(tenant);
    const fresh = await db.getTenant(tenant.id);
    res.redirect('/admin/tenants?' + (result
      ? 'msg=' + encodeURIComponent(name + ' angelegt — ' + (result.facts.total || 0) + ' Einheiten aus Elev8 gelesen.')
      : 'err=' + encodeURIComponent(name + ' angelegt, aber Elev8 antwortet nicht: ' + (fresh && fresh.sync_error ? fresh.sync_error : 'unbekannter Fehler'))));
  } catch (e) { next(e); }
});

app.get('/admin/tenants/discover', requireAdmin, async function (req, res, next) {
  try {
    if (!(ELEV8_ADMIN_TOKEN && ELEV8_TENANTS_TOOL)) return res.redirect('/admin/tenants');
    const rows = await elev8.withClient(ELEV8_ADMIN_TOKEN, function (client) {
      return elev8.callTool(client, ELEV8_TENANTS_TOOL, {});
    });
    res.type('html').send(view.diagnosePage({ id: 0, name: 'Tenant-Liste aus Elev8' }, rows));
  } catch (e) {
    res.redirect('/admin/tenants?err=' + encodeURIComponent(errText(e)));
  }
});

app.get('/admin/tenants/:id', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.status(404).type('text/plain').send('Nicht gefunden');
    res.type('html').send(view.tenantDetail(t, req.query.msg || null));
  } catch (e) { next(e); }
});

app.post('/admin/tenants/:id/sync', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.redirect('/admin/tenants');
    const result = await syncTenant(t);
    res.redirect('/admin/tenants/' + t.id + (result ? '?msg=' + encodeURIComponent('Daten aktualisiert.') : ''));
  } catch (e) { next(e); }
});

app.post('/admin/tenants/:id/token', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.redirect('/admin/tenants');
    const token = String(req.body.elev8_token || '').trim();
    if (token) {
      await db.updateTenantToken(t.id, token);
      await syncTenant(Object.assign({}, t, { elev8_token: token }));
    }
    res.redirect('/admin/tenants/' + t.id + '?msg=' + encodeURIComponent('Token gespeichert.'));
  } catch (e) { next(e); }
});

app.get('/admin/tenants/:id/diagnose', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.status(404).type('text/plain').send('Nicht gefunden');
    const out = { mcpUrl: elev8.MCP_URL, hasToken: !!t.elev8_token };
    if (t.elev8_token) {
      try { out.tools = await elev8.listTools(t.elev8_token); }
      catch (e) { out.error = errText(e); }
    }
    res.type('html').send(view.diagnosePage(t, out));
  } catch (e) { next(e); }
});

/* ---------- tenant form ---------- */

app.get('/f/:token', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).type('html').send(view.layout({
      title: 'Link nicht gültig',
      body: '<div class="page"><header class="hero"><h1>Dieser Link ist nicht gültig</h1><p class="lede">Bitte fragen Sie bei Ihrem Ansprechpartner bei Elev8 nach einem neuen Link.</p></header></div>'
    }));
    const snapshot = await ensureSnapshot(intake);
    const a = await db.getAnswers(intake.id);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(view.tenantForm(intake, a.values, a.sources, snapshot));
  } catch (e) { next(e); }
});

app.post('/api/f/:token/answer', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).json({ error: 'unknown token' });
    const fieldId = String(req.body.field || '');
    if (!FIELD_MAP.has(fieldId)) return res.status(400).json({ error: 'unknown field' });
    const value = String(req.body.value == null ? '' : req.body.value).slice(0, 8000);
    await db.saveAnswer(intake.id, fieldId, value, 'tenant');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Uebernimmt Elev8-Vorschlaege als Antwort - einzeln, abschnittsweise oder alle. */
app.post('/api/f/:token/confirm', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).json({ error: 'unknown token' });
    const snapshot = await ensureSnapshot(intake);
    const pre = (snapshot && snapshot.prefill) || {};
    const existing = await db.getAnswers(intake.id);

    let ids;
    if (req.body.field) {
      ids = [String(req.body.field)];
    } else if (req.body.section) {
      const sec = SECTIONS.filter(function (s) { return s.id === String(req.body.section); })[0];
      ids = sec ? sec.fields.map(function (f) { return f.id; }) : [];
    } else {
      ids = Object.keys(pre);
    }

    const applied = [];
    for (const id of ids) {
      if (!FIELD_MAP.has(id)) continue;
      if (!pre[id] || !pre[id].value) continue;
      if ((existing.values[id] || '').trim() !== '') continue;
      await db.saveAnswer(intake.id, id, pre[id].value, 'confirmed');
      applied.push({ field: id, value: pre[id].value });
    }
    res.json({ ok: true, applied: applied });
  } catch (e) { next(e); }
});

app.post('/api/f/:token/submit', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).json({ error: 'unknown token' });
    await db.setStatus(intake.id, 'submitted');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- errors ---------- */

app.use(function (err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).type('text/plain').send('Serverfehler');
});

/* ---------- boot ---------- */

db.init()
  .then(function () {
    app.listen(PORT, '0.0.0.0', function () {
      console.log('Tenant-Intake laeuft auf Port ' + PORT);
      console.log('Elev8-MCP: ' + elev8.MCP_URL);
      if (!ADMIN_PASSWORD) console.warn('WARNUNG: ADMIN_PASSWORD ist nicht gesetzt — der Adminbereich ist gesperrt.');
    });
  })
  .catch(function (e) {
    console.error('Datenbank konnte nicht initialisiert werden:', e);
    process.exit(1);
  });
