'use strict';

/**
 * Anbindung an den Elev8-MCP-Server.
 *
 * Pro Tenant ist ein Bearer-Token hinterlegt. Damit holt die App die Daten,
 * die in Elev8 ohnehin schon stehen, und füllt das Intake damit vor.
 * Der Tenant bestätigt nur noch statt zu tippen.
 */

const { Client } = require('@modelcontextprotocol/sdk/client');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MCP_URL = process.env.ELEV8_MCP_URL || 'https://mcp.elev8-suite.com/sse';
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
  if (!token) throw new Error('Kein Elev8-Token hinterlegt.');
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
  if (res && res.isError) throw new Error('Elev8-Tool "' + name + '" meldet einen Fehler.');
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
      out.warnings.push('Elev8 lieferte keine Listen-Übersicht.');
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

    out.fetchedAt = new Date().toISOString();
    return out;
  });
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
    channels: summariseChannels(raw.channels),
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
function prefillAnswers(facts, tenantName) {
  const out = {};
  const put = function (id, value, evidence) {
    const v = String(value == null ? '' : value).trim();
    if (v) out[id] = { value: v, evidence: evidence || 'aus Elev8' };
  };

  put('company', tenantName, 'Ihr Tenant-Name in Elev8');

  if (facts.primaryAddress) {
    const more = facts.addresses.length - 1;
    put('address', facts.primaryAddress + (more > 0 ? '\n(und ' + plural(more, 'weitere Adresse', 'weitere Adressen') + ' in Elev8)' : ''),
      'Adresse der Einheiten in Elev8');
  }

  put('units', facts.total, 'aktive Einheiten in Elev8');

  if (facts.channels.length) {
    put('channels', facts.channels.map(function (c) {
      return c.name + (c.share ? ' ' + c.share + ' %' : '');
    }).join(', '), 'Kanalverteilung des letzten Monats aus Elev8');
  }

  const lock = lockSummary(facts);
  if (lock) {
    const extra = facts.checkin.n
      ? '\nCheck-in-Anleitung in Elev8 hinterlegt für ' + facts.checkin.n + ' von ' + facts.total +
        ' Einheiten (' + plural(facts.checkin.avg, 'Schritt', 'Schritte') + ' im Schnitt, max. ' + facts.checkin.max + ').'
      : '';
    put('access', 'Schlosssystem: ' + lock + '.' + extra, 'Lock-Typ und Check-in-Steps aus Elev8');
  }

  if (facts.smartLocks > 0) {
    put('smartlock', plural(facts.smartLocks, 'Einheit ist', 'Einheiten sind') +
      ' mit einem Smart Lock in Elev8 verbunden; Codes werden dort erzeugt.',
      'Smart-Lock-Verbindungen in Elev8');
  }

  if (facts.ssids.length === 1 && facts.wifiCount === facts.total) {
    put('wifi', facts.ssids[0].value, 'WLAN aus Elev8');
  } else if (facts.wifiCount > 0) {
    put('wifi', 'Je Einheit in Elev8 hinterlegt (' + facts.wifiCount + ' von ' + facts.total + ').', 'WLAN-Angaben aus Elev8');
  }

  if (facts.deposits.length) {
    put('deposit', 'In Elev8 hinterlegt: ' + facts.deposits.map(function (d) {
      return d.value.trim() + ' bei ' + plural(d.n, 'Einheit', 'Einheiten');
    }).join(', ') + '.', 'Kaution aus Elev8');
  } else if (facts.total) {
    put('deposit', 'In Elev8 ist keine Kaution hinterlegt.', 'Kaution aus Elev8');
  }

  if (facts.upsells) {
    put('upsells', plural(facts.upsells, 'Einheit hat', 'Einheiten haben') +
      ' bereits Upsells in Elev8 zugewiesen. Bitte ergänzen Sie Preis und Vorlaufzeit.',
      'Upsell-Zuweisungen aus Elev8');
  }

  if (facts.aiActive) {
    put('ai', 'Ja', 'In Elev8 ist die AI-Antwort bei ' + facts.aiActive + ' Einheiten bereits aktiv');
  }

  return out;
}

/**
 * Bereitschaftsanzeige: was in Elev8 gepflegt ist und was fehlt.
 * Reine Information — keine Frage an den Tenant.
 */
function readiness(facts) {
  const t = facts.total || 0;
  const row = function (label, n, hint) {
    return { label: label, n: n, total: t, ok: t > 0 && n >= t, partial: n > 0 && n < t, hint: hint || '' };
  };
  return [
    row('Check-in-Schritte hinterlegt', facts.checkin.n, 'Ohne diese Schritte kann der GRO keine Anreise erklären.'),
    row('Check-out-Schritte hinterlegt', facts.checkout.n, ''),
    row('WLAN hinterlegt', facts.wifiCount, 'Die häufigste Gastfrage überhaupt.'),
    row('Good to Know gepflegt', facts.goodToKnow, 'Parken, Frühstück, Anreise — spart dem GRO Nachfragen bei Ihnen.'),
    row('Reinigungs-Setup aktiv', facts.cleaning, ''),
    row('Upsells zugewiesen', facts.upsells, ''),
    row('Schloss hinterlegt', t - (facts.locks.filter(function (l) { return /unknown|unbekannt/i.test(l.value); })[0] || { n: 0 }).n, '')
  ];
}

async function sync(token, tenantName) {
  const raw = await fetchRaw(token);
  const facts = deriveFacts(raw);
  return {
    facts: facts,
    prefill: prefillAnswers(facts, tenantName),
    readiness: readiness(facts)
  };
}

module.exports = {
  MCP_URL, withClient, callTool, listTools, fetchRaw,
  deriveFacts, prefillAnswers, readiness, sync, lockSummary
};
