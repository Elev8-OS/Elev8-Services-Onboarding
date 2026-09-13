'use strict';

/**
 * PriceLabs-Anbindung — nur lesend, nur für Vorschläge.
 *
 * Wir betreiben das Revenue Management über ein eigenes PriceLabs-Konto, in
 * dem alle Objekte aller Kunden liegen. Die Listing-ID dort ist zusammengesetzt
 * aus der Elev8-Listing-UUID und der Zimmer-UUID des Channel Managers:
 *
 *     97cc814c-…-887237b29335___a3a040e5-…-e4f012fceb21
 *     ^ Elev8-Einheit            ^ Channex-Zimmer
 *
 * Über den vorderen Teil ordnen wir jede PriceLabs-Zeile der Einheit in Elev8
 * zu. Fehlt der Schlüssel oder antwortet PriceLabs nicht, fällt der Vorschlag
 * auf die Zahlen aus Elev8 Suite zurück - das Formular funktioniert in jedem
 * Fall.
 */

const API_URL = process.env.PRICELABS_API_URL || 'https://api.pricelabs.co/v1/listings';
const API_KEY = process.env.PRICELABS_API_KEY || '';
const API_HEADER = process.env.PRICELABS_API_HEADER || 'X-API-Key';
const TIMEOUT_MS = Number(process.env.PRICELABS_TIMEOUT_MS || 12000);

function configured() { return !!API_KEY; }

function num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

/** Der Teil vor dem dreifachen Unterstrich ist die Einheit in Elev8 Suite. */
function elev8Id(pricelabsId) {
  const raw = String(pricelabsId || '');
  const cut = raw.indexOf('___');
  return (cut > 0 ? raw.slice(0, cut) : raw).trim();
}

/**
 * Holt alle Listings und gibt sie je Elev8-Einheit zurück. Mehrere Zimmer
 * derselben Einheit kommen vor (ein Elev8-Listing mit mehreren Channex-Zimmern);
 * wir behalten das erste, das brauchbare Preise trägt.
 */
async function fetchListings() {
  if (!configured()) return { ok: false, reason: 'no_key', byUnit: {} };

  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  let rows = [];
  try {
    const headers = { Accept: 'application/json' };
    headers[API_HEADER] = API_KEY;
    const res = await fetch(API_URL, { headers: headers, signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: 'http_' + res.status, byUnit: {} };
    const body = await res.json();
    rows = Array.isArray(body) ? body
      : (Array.isArray(body && body.listings) ? body.listings
        : (body && body.data && Array.isArray(body.data.listings) ? body.data.listings : []));
  } catch (e) {
    return { ok: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'error', byUnit: {} };
  } finally {
    clearTimeout(timer);
  }

  const byUnit = {};
  rows.forEach(function (r) {
    const id = elev8Id(r.id || r.listing_id);
    if (!id) return;
    const rec = {
      min: num(r.min),
      base: num(r.base) || num(r.recommended_base_price),
      max: num(r.max),
      recommended: num(r.recommended_base_price),
      currency: String(r.currency || '').trim(),
      bedrooms: parseInt(r.no_of_bedrooms, 10) || 0,
      name: String(r.name || '').trim()
    };
    const have = byUnit[id];
    // Die Zeile mit den meisten gesetzten Werten gewinnt.
    const score = function (x) { return (x.min ? 1 : 0) + (x.base ? 1 : 0) + (x.max ? 1 : 0); };
    if (!have || score(rec) > score(have)) byUnit[id] = rec;
  });

  return { ok: true, reason: '', byUnit: byUnit, count: Object.keys(byUnit).length };
}

module.exports = { configured, fetchListings, elev8Id, API_URL };
