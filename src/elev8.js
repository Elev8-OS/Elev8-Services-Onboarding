'use strict';

const { L } = require('./i18n');
const pricelabs = require('./pricelabs');

/**
 * Anbindung an den Elev8-MCP-Server.
 *
 * Pro Tenant ist ein Bearer-Token hinterlegt. Damit holt die App die Daten,
 * die in Elev8 Suite ohnehin schon stehen, und füllt das Intake damit vor.
 * Der Tenant bestätigt nur noch statt zu tippen.
 */

const { Client } = require('@modelcontextprotocol/sdk/client');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MCP_URL = process.env.ELEV8_MCP_URL || 'https://mcp.elev8-suite.com/sse';
// Optional: Name eines Tools, das Kontakt-/Profildaten des Tenants liefert.
// Solange der MCP keines anbietet, bleibt die Sondierung wirkungslos.
const PROFILE_TOOL = process.env.ELEV8_PROFILE_TOOL || '';
const TIMEOUT_MS = Number(process.env.ELEV8_TIMEOUT_MS || 25000);

/* ------------------------------------------------------------------ *
 * Verbindung
 * ------------------------------------------------------------------ */

/**
 * Setzt den Bearer-Token, ohne die übrigen Header zu verlieren.
 *
 * Wichtig: `init.headers` ist hier oft eine Headers-Instanz. Ein
 * Object.assign darauf ergibt ein leeres Objekt und wirft damit
 * Content-Type und Accept weg — der Server antwortet dann mit
 * "Content-Type must be 'application/json'".
 */
function authFetch(token) {
  return function (url, init) {
    const headers = new Headers((init && init.headers) || undefined);
    headers.set('Authorization', 'Bearer ' + token);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/event-stream');
    return fetch(url, Object.assign({}, init, { headers: headers }));
  };
}

function makeTransport(kind, token) {
  const url = new URL(MCP_URL);
  const common = {
    requestInit: { headers: { Authorization: 'Bearer ' + token } },
    fetch: authFetch(token)
  };
  if (kind === 'sse') {
    return new SSEClientTransport(url, Object.assign({
      eventSourceInit: { fetch: authFetch(token) }
    }, common));
  }
  return new StreamableHTTPClientTransport(url, common);
}

/**
 * Öffnet eine Verbindung, führt `fn(client)` aus und schliesst wieder.
 * Versucht zuerst den Transport, der zur URL passt, dann den anderen.
 */
async function withClient(token, fn) {
  if (!token) throw new Error('Kein Elev8-Suite-Token hinterlegt.');
  const order = /\/sse\/?$/.test(MCP_URL) ? ['sse', 'http'] : ['http', 'sse'];
  const failures = [];
  for (const kind of order) {
    const client = new Client({ name: 'elev8-tenant-intake', version: '1.0.0' }, { capabilities: {} });
    let connected = false;
    try {
      await client.connect(makeTransport(kind, token));
      connected = true;
      try {
        return await fn(client);
      } finally {
        await client.close().catch(function () {});
      }
    } catch (e) {
      // Nach erfolgreichem Verbindungsaufbau ist der Fehler inhaltlich -
      // den anderen Transport zu probieren bringt dann nichts.
      if (connected) throw e;
      failures.push(kind.toUpperCase() + ': ' + ((e && e.message) || String(e)));
      try { await client.close(); } catch (e2) { /* ignore */ }
    }
  }
  throw new Error('Verbindung zum Elev8-MCP fehlgeschlagen — ' + failures.join(' | '));
}

async function callTool(client, name, args) {
  const res = await client.callTool({ name: name, arguments: args || {} }, undefined, { timeout: TIMEOUT_MS });
  if (res && res.isError) throw new Error('Elev8-Suite-Tool "' + name + '" meldet einen Fehler.');
  const parts = (res && res.content) || [];
  for (const part of parts) {
    if (part.type !== 'text' || typeof part.text !== 'string') continue;
    try {
      const data = JSON.parse(part.text);
      if (data && Array.isArray(data.results)) return data.results;
      if (Array.isArray(data)) return data;
      return data;
    } catch (e) {
      return part.text;
    }
  }
  return null;
}

async function listTools(token) {
  return withClient(token, async function (client) {
    const res = await client.listTools();
    return (res.tools || []).map(function (t) { return t.name; });
  });
}

/* ------------------------------------------------------------------ *
 * Rohdaten holen
 * ------------------------------------------------------------------ */

async function fetchRaw(token) {
  return withClient(token, async function (client) {
    const out = { warnings: [] };

    out.listings = await callTool(client, 'get_listings_overview');
    if (!Array.isArray(out.listings)) {
      out.listings = [];
      out.warnings.push('Elev8 Suite lieferte keine Listen-Übersicht.');
    }

    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    try {
      out.channels = await callTool(client, 'get_revenue_by_channel', {
        year: prev.getFullYear(), month: prev.getMonth() + 1
      });
    } catch (e) {
      out.channels = null;
      out.warnings.push('Kanalverteilung konnte nicht gelesen werden.');
    }

    // ADR je Einheit - Grundlage fuer den Preiskorridor im Revenue Management.
    try {
      const from = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      out.performance = await callTool(client, 'get_listing_performance_summary', {
        from_date: isoDay(from), to_date: isoDay(now)
      });
    } catch (e) {
      out.performance = null;
      out.warnings.push('Leistungsdaten je Einheit konnten nicht gelesen werden.');
    }

    out.profile = await probeProfile(client);

    out.fetchedAt = new Date().toISOString();
    return out;
  });
}

/**
 * Sucht ein Tool, das Stammdaten des Tenants liefert (Ansprechpartner,
 * Telefon, E-Mail, Check-in-Zeiten). Aufgerufen wird nur, was der Server
 * selbst anbietet und was ohne Pflichtparameter auskommt - es wird also
 * nichts geraten. Bietet der MCP nichts dergleichen, bleibt das Ergebnis
 * null und die betroffenen Felder bleiben normale Fragen.
 */
async function probeProfile(client) {
  let tools = [];
  try {
    const res = await client.listTools();
    tools = res.tools || [];
  } catch (e) {
    return null;
  }

  const candidates = [];
  if (PROFILE_TOOL) candidates.push(PROFILE_TOOL);
  tools.forEach(function (t) {
    const req = (t.inputSchema && t.inputSchema.required) || [];
    if (req.length) return;
    if (/account|profile|host|contact|company|property_detail|listing_detail/i.test(t.name)) {
      if (candidates.indexOf(t.name) === -1) candidates.push(t.name);
    }
  });

  for (const name of candidates) {
    try {
      const data = await callTool(client, name, {});
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return Object.assign({ __tool: name }, row);
      }
    } catch (e) { /* naechster Kandidat */ }
  }
  return null;
}

/** Ersten Wert finden, dessen Schluessel zum Muster passt. */
function isoDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * ADR je Einheit aus der Leistungsuebersicht. Die Antwort enthaelt je Einheit
 * mehrere Zeilen - leere und gefuellte. Wir behalten je listing_id den hoechsten
 * belastbaren Wert und ignorieren Zeilen ohne Buchungen.
 */
function perfMap(raw) {
  const rows = Array.isArray(raw && raw.performance) ? raw.performance
    : (raw && raw.performance && Array.isArray(raw.performance.results) ? raw.performance.results : []);
  const out = {};
  rows.forEach(function (r) {
    const id = nonEmpty(r.listing_id);
    if (!id) return;
    const adr = num(r.avg_daily_rate);
    const los = num(r.avg_length_of_stay);
    const cur = out[id] || (out[id] = { adr: 0, los: 0 });
    if (adr > cur.adr) cur.adr = adr;
    if (los > cur.los) cur.los = los;
  });
  return out;
}

/** Nur die Durchschnittspreise - fuer die Stellen, die sonst nichts brauchen. */
function adrMap(raw) {
  const out = {};
  const m = perfMap(raw);
  Object.keys(m).forEach(function (id) { if (m[id].adr) out[id] = m[id].adr; });
  return out;
}

function median(list) {
  const xs = list.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2 * 100) / 100;
}

function pick(row, re) {
  if (!row) return '';
  const keys = Object.keys(row);
  for (const k of keys) {
    if (!re.test(k)) continue;
    const v = nonEmpty(row[k]);
    if (v) return v;
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * Ableiten
 * ------------------------------------------------------------------ */

function num(v) {
  const n = Number(String(v == null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function nonEmpty(v) {
  const s = String(v == null ? '' : v).trim();
  return s && s !== 'null' && s !== 'undefined' ? s : '';
}

function tally(items, pick) {
  const map = new Map();
  items.forEach(function (it) {
    const key = pick(it);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(function (e) { return { value: e[0], n: e[1] }; })
    .sort(function (a, b) { return b.n - a.n; });
}

function deriveFacts(raw) {
  const all = Array.isArray(raw.listings) ? raw.listings : [];
  const perf = perfMap(raw);
  const live = all.filter(function (l) { return String(l.status) !== '0'; });
  const base = live.length ? live : all;
  const total = base.length;

  const addresses = tally(base, function (l) { return nonEmpty(l.address); });
  const cities = tally(base, function (l) { return nonEmpty(l.city); });
  const countries = tally(base, function (l) { return nonEmpty(l.country); });
  const timezones = tally(base, function (l) { return nonEmpty(l.timezone); });
  const locks = tally(base, function (l) { return nonEmpty(l.lock_type) || 'Unbekannt'; });
  const ssids = tally(base, function (l) { return nonEmpty(l.wifi_ssid); });

  const withCheckin = base.filter(function (l) { return num(l.total_check_in_step) > 0; });
  const withCheckout = base.filter(function (l) { return num(l.total_check_out_step) > 0; });
  const checkinSteps = withCheckin.map(function (l) { return num(l.total_check_in_step); });

  const deposits = tally(
    base.filter(function (l) { return num(l.deposit_amount) > 0; }),
    function (l) { return num(l.deposit_amount) + ' ' + (nonEmpty(l.deposit_currency) || nonEmpty(l.currency) || ''); }
  );

  const flag = function (key) { return base.filter(function (l) { return String(l[key]) === '1'; }).length; };

  return {
    fetchedAt: raw.fetchedAt,
    total: total,
    inactive: all.length - live.length,
    // Einheitenliste fuer die Korridor-Tabelle im Revenue Management.
    unitList: base.map(function (l) {
      return {
        id: nonEmpty(l.listing_id) || nonEmpty(l.internal_name) || nonEmpty(l.listing_name),
        name: nonEmpty(l.listing_name) || nonEmpty(l.internal_name) || '—',
        internal: nonEmpty(l.internal_name),
        city: nonEmpty(l.city),
        capacity: num(l.maximum_capacity),
        currency: nonEmpty(l.currency),
        adr: (perf[nonEmpty(l.listing_id)] || {}).adr || 0,
        los: (perf[nonEmpty(l.listing_id)] || {}).los || 0
      };
    }).sort(function (x, y) { return String(x.name).localeCompare(String(y.name), 'de'); }),
    addresses: addresses.slice(0, 6),
    primaryAddress: addresses.length ? addresses[0].value : '',
    cities: cities.slice(0, 4),
    countries: countries.slice(0, 4),
    timezones: timezones.slice(0, 3),
    locks: locks,
    smartLocks: base.filter(function (l) { return /lock/i.test(nonEmpty(l.lock_type)) && !/^manual$/i.test(nonEmpty(l.lock_type)); }).length,
    ssids: ssids.slice(0, 3),
    wifiCount: base.filter(function (l) { return nonEmpty(l.wifi_ssid); }).length,
    capacity: base.reduce(function (s, l) { return s + num(l.maximum_capacity); }, 0),
    checkin: {
      n: withCheckin.length,
      max: checkinSteps.length ? Math.max.apply(null, checkinSteps) : 0,
      avg: checkinSteps.length ? Math.round(checkinSteps.reduce(function (a, b) { return a + b; }, 0) / checkinSteps.length) : 0
    },
    checkout: { n: withCheckout.length },
    deposits: deposits.slice(0, 3),
    depositRequired: flag('is_required_deposit'),
    upsells: base.filter(function (l) { return num(l.total_upsell_assigned) > 0; }).length,
    goodToKnow: flag('is_have_good_to_know'),
    cleaning: flag('is_have_cleaning_setup'),
    aiActive: flag('is_toggle_ai_active'),
    minibar: flag('is_activate_minibar'),
    checkinTime: tally(base, function (l) { return nonEmpty(l.check_in_time || l.checkin_time || l.checkin_from); })[0],
    checkoutTime: tally(base, function (l) { return nonEmpty(l.check_out_time || l.checkout_time || l.checkout_until); })[0],
    profile: raw.profile ? {
      tool: raw.profile.__tool || '',
      contact: pick(raw.profile, /^(contact_name|owner|manager|host_name|primary_contact|full_name|name)$/i),
      phone: pick(raw.profile, /phone|mobile|telefon|whatsapp/i),
      email: pick(raw.profile, /e?_?mail/i),
      checkin: pick(raw.profile, /check.?in.*(time|from)|time.*check.?in/i),
      checkout: pick(raw.profile, /check.?out.*(time|until)|time.*check.?out/i)
    } : null,
    channels: summariseChannels(raw.channels),
    adrKnown: Object.keys(perf).filter(function (k) { return perf[k].adr; }).length,
    warnings: raw.warnings || []
  };
}

/** Die Kanal-Antwort ist je nach Version unterschiedlich benannt — defensiv lesen. */
function summariseChannels(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const nameKeys = ['channel', 'channel_name', 'source', 'ota', 'name', 'booking_channel'];
  const countKeys = ['bookings', 'booking_count', 'reservations', 'count', 'total_bookings'];
  const revKeys = ['revenue', 'total_revenue', 'amount', 'gross_revenue'];

  const pick = function (row, keys) {
    for (const k of keys) if (row[k] != null && String(row[k]) !== '') return row[k];
    return null;
  };

  const out = rows.map(function (row) {
    return {
      name: nonEmpty(pick(row, nameKeys)) || 'Unbenannt',
      bookings: num(pick(row, countKeys)),
      revenue: num(pick(row, revKeys))
    };
  }).filter(function (r) { return r.name !== 'Unbenannt' || r.bookings || r.revenue; });

  const totalRev = out.reduce(function (s, r) { return s + r.revenue; }, 0);
  const totalBk = out.reduce(function (s, r) { return s + r.bookings; }, 0);
  return out.map(function (r) {
    const share = totalRev > 0 ? r.revenue / totalRev : (totalBk > 0 ? r.bookings / totalBk : 0);
    return Object.assign({}, r, { share: Math.round(share * 100) });
  }).sort(function (a, b) { return b.share - a.share; }).slice(0, 6);
}

/* ------------------------------------------------------------------ *
 * Vorbelegung der Antworten
 * ------------------------------------------------------------------ */

function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

function lockSummary(facts) {
  if (!facts.locks.length) return '';
  return facts.locks.map(function (l) {
    const label = /^manual$/i.test(l.value) ? 'manuell (Schlüssel oder Code)'
      : (/^unknown$/i.test(l.value) || l.value === 'Unbekannt') ? 'nicht hinterlegt'
        : l.value;
    return label + ': ' + plural(l.n, 'Einheit', 'Einheiten');
  }).join(', ');
}

/**
 * Liefert { fieldId: { value, evidence } } — evidence erklärt dem Tenant,
 * woher der Wert kommt, damit er ihn bestätigen statt tippen kann.
 */
function prefillAnswers(facts, tenantName, pricelabsData) {
  const out = {};
  const put = function (id, value, evidence) {
    const v = String(value == null ? '' : value).trim();
    if (v) out[id] = { value: v, evidence: evidence || L('aus Elev8 Suite', 'from Elev8 Suite') };
  };

  put('company', tenantName, L('Ihr Tenant-Name in Elev8 Suite', 'Your tenant name in Elev8 Suite'));

  if (facts.primaryAddress) {
    const more = facts.addresses.length - 1;
    put('address', facts.primaryAddress + (more > 0 ? '\n(und ' + plural(more, 'weitere Adresse', 'weitere Adressen') + ' in Elev8 Suite)' : ''),
      L('Adresse der Einheiten in Elev8 Suite', 'Address of your units in Elev8 Suite'));
  }

  put('units', facts.total, L('aktive Einheiten in Elev8 Suite', 'active units in Elev8 Suite'));

  if (facts.channels.length) {
    put('channels', facts.channels.map(function (c) {
      return c.name + (c.share ? ' ' + c.share + ' %' : '');
    }).join(', '), L('Kanalverteilung des letzten Monats aus Elev8 Suite', 'Channel mix of the last month from Elev8 Suite'));
  }

  const p = facts.profile;
  if (p) {
    const fromProfile = L('aus Ihrem Elev8-Suite-Profil', 'from your Elev8 Suite profile');
    put('contact_main', p.contact, fromProfile);
    put('contact_phone', p.phone, fromProfile);
    put('contact_email', p.email, fromProfile);
  }

  const corridor = corridorProposal(facts, pricelabsData);
  if (corridor.rows.length) {
    if (facts.pricelabs) facts.pricelabs.matched = corridor.fromPricelabs || 0;
    const src = corridor.fromPricelabs
      ? L('Preise aus PriceLabs für ' + corridor.fromPricelabs + ' von ' + corridor.rows.length +
            ' Einheiten, der Rest aus Ihren Zahlen der letzten zwölf Monate',
        'Prices from PriceLabs for ' + corridor.fromPricelabs + ' of ' + corridor.rows.length +
            ' units, the rest from your last twelve months')
      : L('Vorschlag aus Ihren Zahlen der letzten zwölf Monate',
        'Proposal from your last twelve months');
    const tail = corridor.estimated
      ? L(' — ' + corridor.estimated + ' Einheiten ohne eigene Historie, aus vergleichbaren Einheiten abgeleitet',
        ' — ' + corridor.estimated + ' units without own history, derived from comparable units')
      : L('', '');
    put('rm_corridor', JSON.stringify(corridor.rows),
      L(src.de + tail.de + '. Aufenthaltsregeln aus Ihrer durchschnittlichen Aufenthaltsdauer.',
        src.en + tail.en + '. Stay rules from your average length of stay.'));
  }

  return out;
}

/**
 * Preiskorridor-Vorschlag je Einheit.
 *   Minimum   rund 75 Prozent des erzielten Durchschnittspreises
 *   Basis     der erzielte Durchschnittspreis
 *   Maximum   rund das 1,9-fache, damit Spitzentage mitgenommen werden
 * Einheiten ohne eigene Historie erben den Median ihrer Stadt, sonst den
 * Median des Portfolios. Diese Zeilen sind als geschaetzt markiert.
 */
/**
 * Aufenthaltsregeln je Einheit, so wie ein Revenue Manager sie ansetzt.
 *
 *   Mindestaufenthalt   folgt der tatsaechlichen Aufenthaltsdauer: wer im
 *                       Schnitt eine Nacht verkauft, darf keine zwei fordern.
 *   Wochenende          eine Nacht mehr, damit Freitag und Samstag nicht als
 *                       Einzelnacht verbrannt werden - aber nie mehr als drei.
 *   Hoechstaufenthalt   28 Naechte als Regel; Objekte, die faktisch monatelang
 *                       vermietet werden, bekommen 90.
 *   Luecke              immer eine Nacht: eine Luecke zwischen zwei Buchungen
 *                       ist sonst unverkaeuflich.
 */
function stayProposal(unit) {
  const los = (unit && unit.los) || 0;
  const cap = (unit && unit.capacity) || 0;
  let minstay = 1;
  if (los > 5) minstay = 3;
  else if (los > 2.5) minstay = 2;
  // Grosse Objekte lohnen eine Einzelnacht selten - Reinigung und Wechsel.
  if (cap >= 6 && minstay < 2) minstay = 2;
  let we = minstay + 1;
  if (we > 3) we = 3;
  const maxstay = los > 20 ? 90 : 28;
  return { minstay: String(minstay), minstay_we: String(we), maxstay: String(maxstay), gap: '1' };
}

function corridorProposal(facts, pricelabs) {
  const units = facts.unitList || [];
  const pl = (pricelabs && pricelabs.byUnit) || {};
  const withAdr = units.filter(function (u) { return u.adr > 0; });
  const havePl = Object.keys(pl).length;
  if (!withAdr.length && !havePl) return { rows: [], estimated: 0, fromPricelabs: 0 };

  const all = median(withAdr.map(function (u) { return u.adr; }));
  const byCity = {};
  withAdr.forEach(function (u) {
    const c = u.city || '';
    (byCity[c] = byCity[c] || []).push(u.adr);
  });
  Object.keys(byCity).forEach(function (c) { byCity[c] = median(byCity[c]); });

  let estimated = 0;
  let fromPl = 0;
  const rows = units.map(function (u) {
    const p = pl[u.id] || null;
    const base = u.adr > 0 ? u.adr : (byCity[u.city || ''] || all);
    // Geschaetzt ist eine Zeile nur, wenn weder PriceLabs noch eigene
    // Historie etwas hergeben.
    const est = (p && (p.min || p.base || p.max)) ? 0 : (u.adr > 0 ? 0 : 1);
    if (est) estimated++;
    if (p && (p.min || p.base || p.max)) fromPl++;

    const r = Object.assign({ id: u.id, name: u.name }, stayProposal(u));
    r.min = String(Math.round((p && p.min) || (base * 0.75)));
    r.base = String(Math.round((p && p.base) || base));
    r.max = String(Math.round((p && p.max) || (Math.max((p && p.base) || base, base) * 1.9)));
    if (est) r.est = 1;
    if (p && (p.min || p.base || p.max)) r.pl = 1;
    return r;
  });
  return { rows: rows, estimated: estimated, fromPricelabs: fromPl };
}

/**
 * Bereitschaftsanzeige: was in Elev8 Suite gepflegt ist und was fehlt.
 * Reine Information — keine Frage an den Tenant.
 */
function readiness(facts) {
  const t = facts.total || 0;
  const row = function (label, n, hint) {
    return { label: label, n: n, total: t, ok: t > 0 && n >= t, partial: n > 0 && n < t, hint: hint || '' };
  };
  return [
    row(L('Check-in-Schritte hinterlegt', 'Check-in steps set up'), facts.checkin.n,
      L('Ohne diese Schritte kann der GRO keine Anreise erklären.',
        'Without these the GRO cannot explain the arrival.')),
    row(L('Check-out-Schritte hinterlegt', 'Check-out steps set up'), facts.checkout.n, ''),
    row(L('WLAN hinterlegt', 'Wi-Fi stored'), facts.wifiCount,
      L('Die häufigste Gastfrage überhaupt.', 'The single most common guest question.')),
    row(L('Good to Know gepflegt', 'Good to know maintained'), facts.goodToKnow,
      L('Parken, Frühstück, Anreise — spart dem GRO Nachfragen bei Ihnen.',
        'Parking, breakfast, arrival — saves the GRO from asking you.')),
    row(L('Reinigungs-Setup aktiv', 'Cleaning setup active'), facts.cleaning, ''),
    row(L('Upsells zugewiesen', 'Upsells assigned'), facts.upsells, ''),
    row(L('Schloss hinterlegt', 'Lock configured'),
      t - (facts.locks.filter(function (l) { return /unknown|unbekannt/i.test(l.value); })[0] || { n: 0 }).n, '')
  ];
}

async function sync(token, tenantName) {
  const raw = await fetchRaw(token);
  const facts = deriveFacts(raw);
  // PriceLabs ist optional: ohne Schluessel oder bei einem Fehler bleiben die
  // Vorschlaege bei den Zahlen aus Elev8 Suite.
  let pl = { ok: false, reason: 'no_key', byUnit: {} };
  try { pl = await pricelabs.fetchListings(); } catch (e) { /* egal */ }
  if (!pl.ok && pl.reason !== 'no_key') {
    facts.warnings = (facts.warnings || []).concat(['PriceLabs antwortete nicht (' + pl.reason + ').']);
  }
  facts.pricelabs = { ok: !!pl.ok, matched: 0 };
  const prefill = prefillAnswers(facts, tenantName, pl);
  return { facts: facts, prefill: prefill, readiness: readiness(facts) };
}

module.exports = {
  MCP_URL, withClient, callTool, listTools, fetchRaw,
  deriveFacts, prefillAnswers, readiness, sync, lockSummary, probeProfile,
  corridorProposal, adrMap, perfMap, stayProposal
};
