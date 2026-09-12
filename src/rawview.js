'use strict';

/**
 * Rohdaten-Ansicht: zeigt Zeile für Zeile, was Elev8 zu den Einheiten eines
 * Tenants liefert. Gedacht für genau die Frage "warum steht da Manual,
 * obwohl ein Smart Lock verbunden ist" — die Antwort steht dann in der
 * Spalte lock_type, unverändert so, wie der MCP sie ausgibt.
 */

const view = require('./render');

const COLUMNS = [
  { key: 'listing_name', label: 'Einheit' },
  { key: 'lock_type', label: 'lock_type' },
  { key: 'manual_access_name', label: 'manual_access_name' },
  { key: 'wifi_ssid', label: 'wifi_ssid' },
  { key: 'total_check_in_step', label: 'check_in_steps', num: true },
  { key: 'total_check_out_step', label: 'check_out_steps', num: true },
  { key: 'total_upsell_assigned', label: 'upsells', num: true },
  { key: 'status', label: 'status', num: true }
];

function cell(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === 'null') return '<span class="muted">—</span>';
  return view.esc(s);
}

function rawListingsPage(tenant, rows, error) {
  const list = Array.isArray(rows) ? rows : [];

  const locks = {};
  list.forEach(function (r) {
    const k = String(r.lock_type || '').trim() || '(leer)';
    locks[k] = (locks[k] || 0) + 1;
  });
  const lockLine = Object.keys(locks).sort(function (a, b) { return locks[b] - locks[a]; })
    .map(function (k) { return '<b>' + view.esc(k) + '</b>: ' + locks[k]; }).join(' · ');

  const head = COLUMNS.map(function (c) {
    return '<th' + (c.num ? ' class="num"' : '') + '>' + view.esc(c.label) + '</th>';
  }).join('');

  const body = list.length ? list.map(function (r) {
    return '<tr>' + COLUMNS.map(function (c) {
      return '<td' + (c.num ? ' class="num"' : '') + '>' + cell(r[c.key]) + '</td>';
    }).join('') + '</tr>';
  }).join('') : '<tr><td colspan="' + COLUMNS.length + '" class="muted">Keine Einheiten geliefert.</td></tr>';

  return view.layout({
    title: 'Rohdaten — ' + tenant.name,
    bodyClass: 'admin',
    body: `<div class="page wide">
  <header class="hero tight">
    <p class="eyebrow"><a href="/admin/tenants/${tenant.id}">← ${view.esc(tenant.name)}</a></p>
    <h1>Was Elev8 wirklich liefert</h1>
    <p class="lede">Unverändert aus <code>get_listings_overview</code>, gerade eben geholt. Wenn hier
    <code>Manual</code> steht, meldet Elev8 diese Einheit als manuelles Schloss — dann ist an dieser
    Einheit kein Smart Lock hinterlegt, unabhängig davon, was im Schloss-Konto verbunden ist.</p>
    ${error ? '<p class="banner err">' + view.esc(error) + '</p>' : ''}
    ${list.length ? '<p class="banner">' + list.length + ' Einheiten · Schlosssysteme: ' + lockLine + '</p>' : ''}
  </header>

  <div class="scroller">
    <table class="tbl mono">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>

  <footer class="foot"><p><a href="/admin/tenants/${tenant.id}">Zurück zum Tenant</a></p></footer>
</div>`
  });
}

module.exports = { rawListingsPage, COLUMNS };
