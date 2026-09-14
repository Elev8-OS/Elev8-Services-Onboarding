'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');

const db = require('./db');
const elev8 = require('./elev8');
const { FIELD_MAP, SECTIONS, CONTRACT_FIELDS, INPUT_FIELDS, mergePrefill, valueLabel } = require('./questions');
const mods = require('./modules');
const contracts = require('./contracts');
const contractview = require('./contractview');
const pdfout = require('./pdf');
const i18n = require('./i18n');
const view = require('./render');
const rawview = require('./rawview');
const resync = require('./resync');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ELEV8_ADMIN_TOKEN = process.env.ELEV8_ADMIN_TOKEN || '';
const ELEV8_TENANTS_TOOL = process.env.ELEV8_TENANTS_TOOL || '';
// Nachtlauf: Aufnahmen, deren Schnappschuss aelter ist als das, werden
// automatisch aufgefrischt. 0 schaltet den Lauf ab.
const RESYNC_AGE_HOURS = Number(process.env.RESYNC_AGE_HOURS || 20);
const RESYNC_MAX_DAYS = Number(process.env.RESYNC_MAX_DAYS || 90);
// Wie oft der Tenant selbst nachholen darf.
const RESYNC_COOLDOWN_MS = Number(process.env.RESYNC_COOLDOWN_MS || 60000);
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

/**
 * Holt frische Elev8-Daten fuer eine Aufnahme und fuehrt sie mit dem
 * bestehenden Schnappschuss zusammen. Ergaenzen ja, ueberschreiben nie.
 */
async function resyncIntake(intake, tenant) {
  if (!tenant || !tenant.elev8_token) {
    const e = new Error('Für diesen Zugang ist in Elev8 kein Token hinterlegt.');
    e.code = 'no_token';
    throw e;
  }
  const fresh = await elev8.sync(tenant.elev8_token, tenant.name || intake.tenant_name);
  const answers = await db.getAnswers(intake.id);
  const merged = resync.mergeSnapshot(intake.snapshot || null, fresh, answers.values);
  await db.setIntakeSnapshot(intake.id, merged.snapshot);
  intake.snapshot = merged.snapshot;
  // Der Tenant-Datensatz profitiert davon gleich mit.
  if (tenant.id) { try { await db.saveTenantSync(tenant.id, fresh, null); } catch (e) { /* egal */ } }
  return merged;
}

let runSweep = async function () { return { skipped: true }; };

function snapshotAgeMs(snap) {
  const t = snap && snap.syncedAt ? Date.parse(snap.syncedAt) : NaN;
  return isNaN(t) ? Infinity : Date.now() - t;
}

/**
 * Sprache: einmal aus dem Browser, danach entscheidet die Wahl des Tenants.
 * ?lang=xx setzt sie um und wird an der Aufnahme festgehalten.
 */
async function langFor(req, intake) {
  const wanted = i18n.normLang(req.query && req.query.lang);
  if (wanted) {
    if (intake.lang !== wanted) {
      try { await db.setIntakeLang(intake.id, wanted); } catch (e) { /* egal */ }
      intake.lang = wanted;
    }
    return wanted;
  }
  const stored = i18n.normLang(intake.lang);
  if (stored) return stored;
  const guess = i18n.pickLang(req.headers['accept-language']);
  try { await db.setIntakeLang(intake.id, guess); } catch (e) { /* egal */ }
  intake.lang = guess;
  return guess;
}

/* ---------- Vertraege ---------- */

// Reihenfolge = Reihenfolge der Unterzeichnung: erst der Rahmen, dann der AVV,
// dann die Leistungsscheine.
const KINDS = ['platform', 'avv', 'gro', 'rm'];
// Der Rahmenvertrag fixiert nur die Stammdaten, der Leistungsschein alles Weitere.
const PLATFORM_FIELDS = ['company', 'address', 'contact_main', 'contact_email', 'units'];
// Der GRO-Schein fixiert den Betrieb, der Revenue-Schein den Preisteil.
const RM_FIELDS = CONTRACT_FIELDS.filter(function (f) { return f.section === 'revenue'; });
const GRO_FIELDS = CONTRACT_FIELDS.filter(function (f) { return f.section !== 'revenue'; });

/**
 * Welche Dokumente gehoeren zu diesem Kunden? Rahmenvertrag und AVV immer,
 * ein Leistungsschein nur, wenn das Modul im Admin freigeschaltet ist.
 */
function kindsFor(terms) {
  const t = terms || {};
  return KINDS.filter(function (k) {
    if (k === 'platform' || k === 'avv') return true;
    return mods.isActive(t, k);
  });
}

/** Kennzeichnung für Entwürfe, die an Interessenten gehen. */
const DRAFT_MARK = {
  label: 'Muster',
  stamp: 'MUSTER',
  note: 'Unverbindlicher Entwurf zur Prüfung. Dieses Dokument ist nicht unterzeichnet und begründet keine Rechte oder Pflichten. Kaufmännische Angaben und die in eckigen Klammern stehenden Felder werden vor der Unterzeichnung gemeinsam festgelegt. Der verbindliche Vertrag entsteht erst durch die elektronische Unterzeichnung über Elev8 Suite.'
};
const DRAFT_MARK_EN = {
  label: 'Sample',
  stamp: 'SAMPLE',
  note: 'Non-binding draft for review. This document is not signed and creates no rights or obligations. Commercial figures and the fields shown in square brackets are agreed before signature. The binding agreement comes into existence only through electronic signature via Elev8 Suite. Translation for convenience — the German version governs.'
};
// Verbindlich ist die deutsche Fassung. Englisch gibt es nur zum Lesen.
const CONTRACT_LANG = 'de';

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || '';
}

/** Sind die kaufmaennischen Angaben vollstaendig genug fuer einen Vertrag? */
function termsReady(terms, kind) {
  const t = terms || {};
  const has = function (k) { return String(t[k] || '').trim() !== ''; };
  if (kind === 'platform') {
    const price = t.platform_model === 'per_booking' ? 'platform_price_per_booking' : 'platform_price_per_unit';
    return has(price) && has('platform_term_months') && has('platform_notice_months');
  }
  if (kind === 'gro') {
    return mods.isActive(t, 'gro') && mods.scopeReady(t, 'gro') &&
      has('price_per_unit') && has('term_months') && has('notice_months');
  }
  if (kind === 'rm') {
    return mods.isActive(t, 'rm') && mods.scopeReady(t, 'rm') &&
      has('rm_price_per_unit') && has('rm_term_months') && has('rm_notice_months');
  }
  return true;   // der AVV braucht keine kaufmaennischen Angaben
}

/**
 * Kann dieses Dokument jetzt unterzeichnet werden - und wenn nicht, warum?
 * Der Entwurf steht dem Kunden immer offen; die Unterschrift erst, wenn
 * alles Nötige da ist.
 */
function signability(kind, terms, missing, signedByKind, lang) {
  if (signedByKind[kind]) return { signed: signedByKind[kind], canSign: false, reason: null };
  if (!termsReady(terms, kind)) {
    return { canSign: false, reason: i18n.t(i18n.UI.contractsMissingTerms, lang) };
  }
  if (missing.length) {
    return { canSign: false, reason: i18n.t(i18n.UI.contractsMissingFields, lang) };
  }
  if (kind === 'gro' && !signedByKind.platform) {
    return { canSign: false, reason: i18n.t(i18n.UI.needsPlatform, lang) };
  }
  return { canSign: true, reason: null };
}

/** Welche Pflichtfelder fehlen noch? Abhaengige Felder zaehlen nur, wenn aktiv. */
function missingRequired(values, terms) {
  return INPUT_FIELDS.filter(function (f) {
    if (!f.required) return false;
    if (!mods.fieldAllowed(f, terms || {})) return false;
    if (f.dependsOn) {
      const have = String(values[f.dependsOn.field] || '').trim();
      const want = [].concat(f.dependsOn.equals);
      if (!have || want.indexOf(have) < 0) return false;
    }
    return String(values[f.id] || '').trim() === '';
  }).map(function (f) { return f.id; });
}

/** Nach der Unterschrift des GRO-Vertrags stehen die Vertragsfelder fest. */
async function lockedFields(intake) {
  const signed = await db.listContracts(intake.id);
  const out = {};
  signed.forEach(function (c) {
    if (c.kind === 'gro') GRO_FIELDS.forEach(function (f) { out[f.id] = true; });
    if (c.kind === 'rm') RM_FIELDS.forEach(function (f) { out[f.id] = true; });
    if (c.kind === 'platform' || c.kind === 'avv') PLATFORM_FIELDS.forEach(function (id) { out[id] = true; });
  });
  return out;
}

/**
 * Die englische Fassung eines unterzeichneten Vertrags. Sie entsteht normal
 * bei der Unterschrift; fehlt sie - etwa bei Vertraegen aus der Zeit vor der
 * Zweisprachigkeit - wird sie aus den festgehaltenen Antworten nachgebaut und
 * gespeichert. Unterschriftsangaben und Pruefsumme bleiben die der deutschen.
 */
async function englishPdf(intake, signed) {
  if (signed && signed.pdf_en) return signed.pdf_en;
  if (!signed) return null;
  const doc = contracts.build(signed.kind, intake, signed.answers || {}, signed.terms || {}, 'en');
  const buf = await pdfout.render(doc, signatureBlock('en', signed, doc.title));
  try {
    await db.pool.query('UPDATE contracts SET pdf_en = $2, doc_text_en = $3 WHERE id = $1',
      [signed.id, buf, contracts.documentText(doc)]);
  } catch (e) { /* der Download geht trotzdem raus */ }
  return buf;
}

function signatureBlock(lang, signed, docTitle) {
  const de = lang !== 'en';
  return {
    heading: de ? 'Unterschrift' : 'Signature',
    note: de
      ? 'Dieses Dokument wurde elektronisch in Textform unterzeichnet. Art. 28 Abs. 9 DSGVO lässt das elektronische Format ausdrücklich zu; eine qualifizierte elektronische Signatur ist nicht erforderlich. Die folgenden Angaben wurden beim Absenden festgehalten.'
      : 'This document was signed electronically in text form. Art. 28(9) GDPR expressly permits the electronic format; a qualified electronic signature is not required. The following details were recorded on submission. This English version is a translation issued alongside the binding German version; the checksum below is that of the German text, which governs.',
    labels: de
      ? { name: 'Name', role: 'Funktion', email: 'E-Mail', when: 'Zeitpunkt (UTC)', ip: 'IP-Adresse', agent: 'Browser', hash: 'Dokument-Prüfsumme (SHA-256)' }
      : { name: 'Name', role: 'Role', email: 'Email', when: 'Time (UTC)', ip: 'IP address', agent: 'Browser', hash: 'Document checksum (SHA-256)' },
    name: signed.signer_name,
    role: signed.signer_role || '—',
    email: signed.signer_email,
    signedAt: new Date(signed.signed_at).toISOString().replace('T', ' ').slice(0, 19),
    ip: signed.signer_ip,
    ua: signed.signer_ua,
    hash: signed.doc_hash,
    counterHeading: de ? 'Gegenzeichnung' : 'Countersignature',
    counterLines: [contracts.ELEV8.name, contracts.ELEV8.signer + ', ' +
      (de ? contracts.ELEV8.signerRole : contracts.ELEV8.signerRoleEn),
      contracts.ELEV8.street + ', ' + contracts.ELEV8.city],
    footer: docTitle
  };
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

/**
 * Musterverträge ohne Aufnahme. Ein Interessent bekommt so die Dokumente zur
 * Prüfung, bevor er überhaupt als Tenant angelegt ist. Es wird nichts
 * gespeichert - die Angaben aus dem Formular gehen direkt in den Entwurf.
 */
app.get('/admin/muster', requireAdmin, function (req, res) {
  res.type('html').send(view.musterPage(req.query || {}, null));
});

/** Baut aus den Formularangaben eine Aufnahme-Attrappe für den Entwurf. */
function musterSource(q) {
  const pick = function (k, max) { return String(q[k] == null ? '' : q[k]).trim().slice(0, max || 120); };
  const company = pick('company', 160);
  const modGro = String(q.mod_gro || '') === '1';
  const modRm = String(q.mod_rm || '') === '1';

  const terms = Object.assign({}, contracts.DEFAULT_TERMS, {
    currency: pick('currency', 8) || 'EUR',
    platform_price_per_unit: pick('platform_price_per_unit', 20),
    price_per_unit: pick('price_per_unit', 20),
    rm_price_per_unit: pick('rm_price_per_unit', 20),
    rm_tier_from: pick('rm_tier_from', 6),
    rm_tier_price: pick('rm_tier_price', 20),
    mod_gro: modGro ? '1' : '',
    mod_rm: modRm ? '1' : ''
  }, modGro ? mods.defaults('gro') : {}, modRm ? { rm_scope: mods.defaults('rm').rm_scope } : {});

  const answers = {};
  const put = function (id, val) { if (val) answers[id] = val; };
  put('company', company);
  put('address', pick('address', 200));
  put('contact_main', pick('contact', 120));
  put('contact_email', pick('email', 120));
  put('units', pick('units', 8).replace(/\D/g, ''));

  return {
    intake: { id: 0, tenant_name: company || 'Muster GmbH', terms: terms },
    answers: answers,
    terms: terms
  };
}

app.get('/admin/muster/pdf', requireAdmin, async function (req, res, next) {
  try {
    const kind = String(req.query.kind || '');
    if (KINDS.indexOf(kind) < 0) return res.status(404).type('text/plain').send('Nicht gefunden');
    const wantEn = i18n.normLang(req.query.lang) === 'en';
    const src = musterSource(req.query || {});
    const doc = contracts.build(kind, src.intake, src.answers, src.terms,
      wantEn ? 'en' : CONTRACT_LANG);
    const buf = await pdfout.render(doc, null, { draft: wantEn ? DRAFT_MARK_EN : DRAFT_MARK });
    const stem = String(src.intake.tenant_name).replace(/[^A-Za-z0-9_-]+/g, '-') || 'Muster';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' +
      (wantEn ? 'Sample-' : 'Muster-') + kind + '-' + stem + '.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
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
    const signedList = await db.listContracts(intake.id);
    res.type('html').send(view.adminDetail(intake, a.values, a.sources, baseUrl(req),
      req.query.msg || null, { terms: intake.terms || contracts.DEFAULT_TERMS, contracts: signedList,
        missing: missingRequired(a.values, intake.terms || {}), answers: a.values }));
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

/**
 * Archivieren: der Fall ist erledigt - gekündigt, abgesprungen, erledigt -
 * bleibt aber vollständig nachlesbar. Der Tenant-Link funktioniert weiter,
 * das Formular nimmt aber nichts mehr an.
 */
app.post('/admin/i/:id/archive', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.redirect('/admin');
    const on = String(req.body.on || '1') === '1';
    await db.setArchived(intake.id, on);
    res.redirect('/admin?msg=' + encodeURIComponent(
      on ? 'Aufnahme archiviert.' : 'Aufnahme wieder aktiv.'));
  } catch (e) { next(e); }
});

/**
 * Löschen: nur für Tests und Fehlanlagen. Sobald ein Vertrag unterzeichnet
 * ist, wird nicht mehr gelöscht - das Dokument und der Nachweis der
 * Unterschrift bleiben aufbewahrungspflichtig. Dann bleibt das Archiv.
 */
app.post('/admin/i/:id/delete', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.redirect('/admin');
    const signed = await db.listContracts(intake.id);
    if (signed.length) {
      return res.redirect('/admin/i/' + intake.id + '?msg=' + encodeURIComponent(
        'Nicht gelöscht: zu dieser Aufnahme gehören ' + signed.length +
        ' unterzeichnete Verträge. Archivieren Sie sie stattdessen.'));
    }
    await db.deleteIntake(intake.id);
    res.redirect('/admin?msg=' + encodeURIComponent('Aufnahme gelöscht.'));
  } catch (e) { next(e); }
});

app.post('/admin/tenants/:id/archive', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.redirect('/admin/tenants');
    const on = String(req.body.on || '1') === '1';
    await db.setTenantArchived(t.id, on);
    res.redirect('/admin/tenants?msg=' + encodeURIComponent(
      on ? 'Tenant archiviert.' : 'Tenant wieder aktiv.'));
  } catch (e) { next(e); }
});

app.post('/admin/tenants/:id/delete', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.redirect('/admin/tenants');
    const signed = await db.signedCountForTenant(t.id);
    if (signed) {
      return res.redirect('/admin/tenants?msg=' + encodeURIComponent(
        'Nicht gelöscht: an diesem Tenant hängen ' + signed +
        ' unterzeichnete Verträge. Archivieren Sie ihn stattdessen.'));
    }
    await db.deleteTenant(t.id);
    res.redirect('/admin/tenants?msg=' + encodeURIComponent('Tenant und seine Aufnahmen gelöscht.'));
  } catch (e) { next(e); }
});

app.post('/admin/i/:id/terms', requireAdmin, async function (req, res, next) {
  try {
    const intake = await db.getIntakeById(Number(req.params.id));
    if (!intake) return res.status(404).type('text/plain').send('Nicht gefunden');
    const pick = function (k, max) { return String(req.body[k] == null ? '' : req.body[k]).trim().slice(0, max || 60); };
    // Mehrfachauswahl: Checkboxen kommen je nach Anzahl als String oder Array.
    const picks = function (k, allowed) {
      const raw = req.body[k];
      const list = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]);
      const ok = {};
      allowed.forEach(function (x) { ok[x.code] = true; });
      return list.map(String).filter(function (x) { return ok[x]; }).join(', ');
    };
    const flag = function (k) { return req.body[k] ? '1' : ''; };
    // Ein unterzeichneter Leistungsschein friert sein Modul ein.
    const signedKinds = {};
    (await db.listContracts(intake.id)).forEach(function (c) { signedKinds[c.kind] = true; });
    const cur = intake.terms || {};
    const keep = function (id, value) { return signedKinds[id] ? (cur['mod_' + id] || '') : value; };

    await db.setTerms(intake.id, {
      currency: pick('currency', 8) || 'EUR',
      platform_model: pick('platform_model', 20) === 'per_booking' ? 'per_booking' : 'per_unit',
      platform_price_per_unit: pick('platform_price_per_unit', 20),
      platform_price_per_booking: pick('platform_price_per_booking', 20),
      platform_term_months: pick('platform_term_months', 4) || '12',
      platform_notice_months: pick('platform_notice_months', 4) || '3',
      price_per_unit: pick('price_per_unit', 20),
      setup_fee: pick('setup_fee', 20),
      term_months: pick('term_months', 4),
      notice_months: pick('notice_months', 4),
      rm_price_per_unit: pick('rm_price_per_unit', 20),
      rm_tier_from: pick('rm_tier_from', 6),
      rm_tier_price: pick('rm_tier_price', 20),
      rm_term_months: pick('rm_term_months', 4) || '6',
      rm_notice_months: pick('rm_notice_months', 4) || '3',
      mod_gro: keep('gro', flag('mod_gro')),
      mod_rm: keep('rm', flag('mod_rm')),
      gro_scope: picks('gro_scope', mods.GRO_SCOPE),
      gro_scope_extra: pick('gro_scope_extra', 200),
      gro_coverage: pick('gro_coverage', 20),
      gro_coverage_custom: pick('gro_coverage_custom', 120),
      rm_scope: picks('rm_scope', mods.RM_SCOPE),
      start_date: pick('start_date', 40),
      law: pick('law', 4) || 'CH',
      venue: pick('venue', 120) || 'Olten, Schweiz'
    });
    res.redirect('/admin/i/' + intake.id + '?msg=' + encodeURIComponent('Vertragsdaten gespeichert.'));
  } catch (e) { next(e); }
});

/**
 * Vertrag als PDF. Ohne Parameter das unterzeichnete Dokument, mit
 * ?muster=1 ein deutlich gekennzeichneter Entwurf aus dem aktuellen Stand -
 * zum Verschicken an Interessenten, bevor irgendetwas unterschrieben ist.
 */
app.get('/admin/i/:id/vertrag/:kind.pdf', requireAdmin, async function (req, res, next) {
  try {
    const id = Number(req.params.id);
    const kind = String(req.params.kind);
    if (KINDS.indexOf(kind) < 0) return res.status(404).type('text/plain').send('Nicht gefunden');

    const wantEn = i18n.normLang(req.query.lang) === 'en';
    if (String(req.query.muster || '') === '1') {
      const intake = await db.getIntakeById(id);
      if (!intake) return res.status(404).type('text/plain').send('Nicht gefunden');
      const a = await db.getAnswers(intake.id);
      const doc = contracts.build(kind, intake, a.values, intake.terms || {},
        wantEn ? 'en' : CONTRACT_LANG);
      const buf = await pdfout.render(doc, null, { draft: wantEn ? DRAFT_MARK_EN : DRAFT_MARK });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="Muster-' + kind + '-' +
        (wantEn ? 'en-' : '') +
        String(intake.tenant_name).replace(/[^A-Za-z0-9_-]+/g, '-') + '.pdf"');
      return res.send(buf);
    }

    const signed = await db.getContract(id, kind);
    if (!signed || !signed.pdf) return res.status(404).type('text/plain').send('Noch nicht unterzeichnet');
    const intake = await db.getIntakeById(id);
    const file = wantEn ? await englishPdf(intake, signed) : signed.pdf;
    res.setHeader('Content-Type', 'application/pdf');
    res.send(file);
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

app.get('/admin/tenants/:id/raw', requireAdmin, async function (req, res, next) {
  try {
    const t = await db.getTenant(Number(req.params.id));
    if (!t) return res.status(404).type('text/plain').send('Nicht gefunden');
    let rows = [];
    let err = null;
    try {
      rows = await elev8.withClient(t.elev8_token, function (client) {
        return elev8.callTool(client, 'get_listings_overview');
      });
    } catch (e) {
      err = errText(e);
    }
    res.type('html').send(rawview.rawListingsPage(t, rows, err));
  } catch (e) { next(e); }
});

/** Nachtlauf von Hand anstossen - nuetzlich nach einer grossen Pflegeaktion. */
app.post('/admin/resync-sweep', requireAdmin, async function (req, res, next) {
  try {
    const r = await runSweep(true);
    res.redirect('/admin?msg=' + encodeURIComponent(
      r.skipped ? 'Nachtlauf läuft bereits.'
        : 'Nachtlauf: ' + r.done + ' Aufnahmen aufgefrischt, ' + r.failed + ' fehlgeschlagen.'
    ));
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
    if (!intake) {
      const l = i18n.pickLang(req.headers['accept-language']);
      return res.status(404).type('html').send(view.layout({
        lang: l,
        title: i18n.t(i18n.UI.notValid, l),
        body: '<div class="page"><header class="hero"><h1>' + i18n.t(i18n.UI.notValid, l) +
          '</h1><p class="lede">' + i18n.t(i18n.UI.notValidP, l) + '</p></header></div>'
      }));
    }
    const lang = await langFor(req, intake);
    const snapshot = await ensureSnapshot(intake);
    const a = await db.getAnswers(intake.id);
    const tenant = await tenantForIntake(intake);
    const [locked, signedList] = await Promise.all([lockedFields(intake), db.listContracts(intake.id)]);
    const terms = intake.terms || {};
    const missing = missingRequired(a.values, terms);
    const signedByKind = {};
    signedList.forEach(function (c) { signedByKind[c.kind] = c; });

    const kinds = kindsFor(terms);
    const docs = kinds.map(function (k) { return contracts.build(k, intake, a.values, terms, CONTRACT_LANG); });
    const statusByKind = {};
    kinds.forEach(function (k) { statusByKind[k] = signability(k, terms, missing, signedByKind, lang); });
    const block = contractview.contractsBlock(intake, docs, statusByKind, lang);

    const opts = {
      lang: lang,
      canResync: !!(tenant && tenant.elev8_token),
      conflicts: resync.conflictsFor(a.values, snapshot && snapshot.prefill),
      locked: locked,
      terms: terms,
      contractsBlock: block
    };
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(view.tenantForm(intake, a.values, a.sources, snapshot, opts));
  } catch (e) { next(e); }
});

app.post('/api/f/:token/answer', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).json({ error: 'unknown token' });
    const fieldId = String(req.body.field || '');
    if (!FIELD_MAP.has(fieldId)) return res.status(400).json({ error: 'unknown field' });
    const locked = await lockedFields(intake);
    if (locked[fieldId]) {
      return res.status(409).json({
        error: 'locked',
        message: i18n.t(i18n.UI.lockedHint, i18n.normLang(intake.lang) || 'de')
      });
    }
    if (intake.archived_at) return res.status(409).json({ error: 'archived' });
    const fdef = FIELD_MAP.get(fieldId);
    if (!mods.fieldAllowed(fdef, intake.terms || {})) {
      return res.status(409).json({ error: 'module_off' });
    }
    const cap = fdef.type === 'matrix' ? 200000 : 8000;
    const value = String(req.body.value == null ? '' : req.body.value).slice(0, cap);
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
    // Elev8-Daten plus unsere eigenen Vorschlaege - beides ist bestaetigbar.
    const pre = mergePrefill(snapshot && snapshot.prefill);
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

    // Bei einem Widerspruch darf der Tenant den Elev8-Wert ausdruecklich
    // uebernehmen - nur dann ueberschreiben wir eine vorhandene Antwort.
    const override = req.body.override === true && !!req.body.field;

    const lockedNow = await lockedFields(intake);
    const applied = [];
    for (const id of ids) {
      if (!FIELD_MAP.has(id)) continue;
      if (lockedNow[id]) continue;
      if (!pre[id] || !pre[id].value) continue;
      if (!override && (existing.values[id] || '').trim() !== '') continue;
      await db.saveAnswer(intake.id, id, pre[id].value, 'confirmed');
      applied.push({
        field: id,
        value: pre[id].value,
        display: valueLabel(FIELD_MAP.get(id), pre[id].value, i18n.normLang(intake.lang) || 'de')
      });
    }
    res.json({ ok: true, applied: applied });
  } catch (e) { next(e); }
});

/**
 * Der Tenant hat in Elev8 nachgepflegt und will das Ergebnis sehen.
 * Braucht keinen Admin - der Link, den er ohnehin hat, genuegt.
 */
const resyncLast = new Map();

app.post('/api/f/:token/resync', async function (req, res, next) {
  const key = String(req.params.token);
  try {
    const intake = await db.getIntakeByToken(key);
    if (!intake) return res.status(404).json({ error: 'unknown token' });

    const last = resyncLast.get(key) || 0;
    const wait = RESYNC_COOLDOWN_MS - (Date.now() - last);
    if (wait > 0) {
      return res.status(429).json({
        error: 'cooldown',
        retryIn: Math.ceil(wait / 1000),
        message: 'Bitte einen Moment — wir haben gerade eben schon nachgesehen.'
      });
    }
    resyncLast.set(key, Date.now());

    const tenant = await tenantForIntake(intake);
    let merged;
    try {
      merged = await resyncIntake(intake, tenant);
    } catch (e) {
      resyncLast.set(key, 0);
      const known = e && e.code === 'no_token';
      return res.status(known ? 400 : 502).json({
        error: known ? 'no_token' : 'elev8',
        message: known ? e.message : 'Elev8 antwortet gerade nicht. Bitte in ein paar Minuten nochmals.',
        detail: errText(e)
      });
    }

    res.json({
      ok: true,
      added: merged.added,
      conflicts: merged.conflicts,
      closed: merged.closed,
      readiness: merged.snapshot.readiness || [],
      units: (merged.snapshot.facts && merged.snapshot.facts.total) || 0,
      syncedAt: merged.snapshot.syncedAt,
      summary: resync.summarize(merged),
      changed: merged.added.length > 0 || merged.closed.length > 0
    });
  } catch (e) { next(e); }
});

/* ---------- Vertragsseiten fuer den Tenant ---------- */

async function contractContext(req, res) {
  const intake = await db.getIntakeByToken(req.params.token);
  if (!intake) { res.status(404).type('text/plain').send('Nicht gefunden'); return null; }
  const kind = String(req.params.kind || '');
  if (KINDS.indexOf(kind) < 0) { res.status(404).type('text/plain').send('Nicht gefunden'); return null; }
  const lang = await langFor(req, intake);
  const a = await db.getAnswers(intake.id);
  if (kindsFor(intake.terms || {}).indexOf(kind) < 0) {
    res.status(404).type('text/plain').send('Nicht gefunden'); return null;
  }
  return { intake: intake, kind: kind, lang: lang, answers: a.values, terms: intake.terms || {} };
}

app.get('/f/:token/vertrag/:kind.pdf', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).type('text/plain').send('Nicht gefunden');
    const kind = String(req.params.kind || '');
    if (KINDS.indexOf(kind) < 0) return res.status(404).type('text/plain').send('Nicht gefunden');
    const wantEn = i18n.normLang(req.query.lang) === 'en';
    const signed = await db.getContract(intake.id, kind);
    const stem = String(intake.tenant_name).replace(/[^A-Za-z0-9_-]+/g, '-');
    res.setHeader('Content-Type', 'application/pdf');

    if (signed && signed.pdf) {
      const file = wantEn ? await englishPdf(intake, signed) : signed.pdf;
      res.setHeader('Content-Disposition', 'inline; filename="' + kind + '-' +
        (wantEn ? 'en-' : '') + stem + '.pdf"');
      return res.send(file);
    }
    // Noch nicht unterzeichnet: gekennzeichneter Entwurf aus dem aktuellen Stand.
    const a = await db.getAnswers(intake.id);
    if (kindsFor(intake.terms || {}).indexOf(kind) < 0) return res.status(404).type('text/plain').send('Nicht gefunden');
    const doc = contracts.build(kind, intake, a.values, intake.terms || {},
      wantEn ? 'en' : CONTRACT_LANG);
    const buf = await pdfout.render(doc, null, { draft: wantEn ? DRAFT_MARK_EN : DRAFT_MARK });
    res.setHeader('Content-Disposition', 'inline; filename="Muster-' + kind + '-' +
      (wantEn ? 'en-' : '') + stem + '.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) { next(e); }
});

app.get('/f/:token/vertrag/:kind', async function (req, res, next) {
  try {
    const c = await contractContext(req, res);
    if (!c) return;
    const reading = String(req.query.read || '') === 'en';
    const signed = await db.getContract(c.intake.id, c.kind);
    // Ein unterzeichneter Vertrag wird immer so gezeigt, wie er unterzeichnet
    // wurde - nicht neu aus inzwischen geaenderten Antworten gebaut.
    const src = signed ? { a: signed.answers, t: signed.terms } : { a: c.answers, t: c.terms };
    const doc = contracts.build(c.kind, c.intake, src.a, src.t, reading ? 'en' : CONTRACT_LANG);
    const all = await db.listContracts(c.intake.id);
    const byKind = {};
    all.forEach(function (x) { byKind[x.kind] = x; });
    const st = signability(c.kind, c.terms, missingRequired(c.answers, c.terms), byKind, c.lang);

    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(contractview.contractPage(
      c.intake, doc, signed, c.lang, '/f/' + c.intake.token + '/vertrag',
      { reading: reading, blockReason: st.reason }));
  } catch (e) { next(e); }
});

app.post('/api/f/:token/sign', async function (req, res, next) {
  try {
    const intake = await db.getIntakeByToken(req.params.token);
    if (!intake) return res.status(404).json({ error: 'unknown token' });
    if (intake.archived_at) return res.status(409).json({ error: 'archived' });
    const kind = String(req.body.kind || '');
    if (KINDS.indexOf(kind) < 0) return res.status(400).json({ error: 'unknown kind' });

    const lang = CONTRACT_LANG;
    const uiLang = i18n.normLang(intake.lang) || 'de';
    const name = String(req.body.name || '').trim().slice(0, 200);
    const role = String(req.body.role || '').trim().slice(0, 200);
    const email = String(req.body.email || '').trim().slice(0, 200);
    if (!name || email.indexOf('@') < 1 || req.body.confirm !== true) {
      return res.status(400).json({ error: 'incomplete', message: i18n.t(i18n.UI.signFail, uiLang) });
    }

    const already = await db.getContract(intake.id, kind);
    if (already) return res.json({ ok: true, already: true });

    const a = await db.getAnswers(intake.id);
    const terms = intake.terms || {};
    if (!termsReady(terms, kind)) {
      return res.status(409).json({ error: 'no_terms', message: i18n.t(i18n.UI.contractsMissingTerms, uiLang) });
    }
    // Ein Leistungsschein steht nur zusammen mit dem Rahmenvertrag.
    if (kindsFor(terms).indexOf(kind) < 0) {
      return res.status(409).json({ error: 'not_ordered' });
    }
    if (kind === 'gro' || kind === 'rm') {
      const base = await db.getContract(intake.id, 'platform');
      if (!base) {
        return res.status(409).json({ error: 'needs_platform', message: i18n.t(i18n.UI.needsPlatform, uiLang) });
      }
    }
    const missing = missingRequired(a.values, terms);
    if (missing.length) {
      return res.status(409).json({ error: 'missing', message: i18n.t(i18n.UI.contractsMissingFields, uiLang) });
    }

    const doc = contracts.build(kind, intake, a.values, terms, lang);
    const text = contracts.documentText(doc);
    const hash = sha256(text);

    const saved = await db.saveContract({
      intakeId: intake.id, kind: kind, lang: lang,
      docText: text, docHash: hash, answers: a.values, terms: terms,
      signerName: name, signerRole: role, signerEmail: email,
      signerIp: clientIp(req), signerUa: String(req.headers['user-agent'] || '').slice(0, 400)
    });
    if (!saved) return res.json({ ok: true, already: true });

    // Beide Fassungen nachreichen - die Unterschrift ist bereits gueltig.
    // Verbindlich ist die deutsche; die englische traegt dieselben
    // Unterschriftsangaben und dieselbe Pruefsumme.
    try {
      const fresh = await db.getContract(intake.id, kind);
      const buf = await pdfout.render(doc, signatureBlock(lang, fresh, doc.title));
      await db.pool.query('UPDATE contracts SET pdf = $2 WHERE id = $1', [saved.id, buf]);

      const docEn = contracts.build(kind, intake, a.values, terms, 'en');
      const bufEn = await pdfout.render(docEn, signatureBlock('en', fresh, docEn.title));
      await db.pool.query('UPDATE contracts SET pdf_en = $2, doc_text_en = $3 WHERE id = $1',
        [saved.id, bufEn, contracts.documentText(docEn)]);
    } catch (e) {
      console.warn('PDF konnte nicht erzeugt werden: ' + errText(e));
    }

    res.json({ ok: true, hash: hash });
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

/* ---------- Nachtlauf ---------- */

/**
 * Frischt reihum alle Aufnahmen auf, deren Schnappschuss zu alt ist.
 * Damit findet der Tenant beim naechsten Oeffnen ohnehin den aktuellen
 * Stand vor, auch wenn er den Knopf nie drueckt. Laeuft bewusst seriell
 * und mit Pause - der MCP ist kein Lastesel.
 */
let sweepRunning = false;

async function resyncSweep(force) {
  if (sweepRunning) return { skipped: true };
  if (!RESYNC_AGE_HOURS && !force) return { skipped: true };
  sweepRunning = true;
  const maxAge = force ? 0 : RESYNC_AGE_HOURS * 3600 * 1000;
  let done = 0, failed = 0;
  try {
    const rows = await db.listIntakesForResync(RESYNC_MAX_DAYS);
    for (const row of rows) {
      if (snapshotAgeMs(row.snapshot) < maxAge) continue;
      const tenant = { id: row.tenant_id, name: row.tenant_real_name || row.tenant_name, elev8_token: row.elev8_token };
      try {
        await resyncIntake(row, tenant);
        done++;
      } catch (e) {
        failed++;
        console.warn('Nachtlauf: Aufnahme ' + row.id + ' fehlgeschlagen — ' + errText(e));
      }
      await new Promise(function (r) { setTimeout(r, 1500); });
    }
    if (done || failed) console.log('Nachtlauf: ' + done + ' aufgefrischt, ' + failed + ' fehlgeschlagen.');
  } catch (e) {
    console.warn('Nachtlauf konnte nicht starten: ' + errText(e));
  } finally {
    sweepRunning = false;
  }
  return { done: done, failed: failed };
}

runSweep = resyncSweep;

/* ---------- boot ---------- */

db.init()
  .then(function () {
    app.listen(PORT, '0.0.0.0', function () {
      console.log('Tenant-Intake laeuft auf Port ' + PORT);
      console.log('Elev8-MCP: ' + elev8.MCP_URL);
      if (!ADMIN_PASSWORD) console.warn('WARNUNG: ADMIN_PASSWORD ist nicht gesetzt — der Adminbereich ist gesperrt.');
      if (RESYNC_AGE_HOURS) {
        console.log('Nachtlauf aktiv: Aufnahmen aelter als ' + RESYNC_AGE_HOURS + ' h werden aufgefrischt.');
        setTimeout(resyncSweep, 60000);                       // kurz nach dem Start einmal
        setInterval(resyncSweep, 30 * 60 * 1000);             // danach halbstuendlich pruefen
      }
    });
  })
  .catch(function (e) {
    console.error('Datenbank konnte nicht initialisiert werden:', e);
    process.exit(1);
  });
