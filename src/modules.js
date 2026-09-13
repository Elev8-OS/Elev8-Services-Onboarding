'use strict';

/**
 * Module der Elev8 Suite.
 *
 * Der Rahmenvertrag (Plattform) gilt immer. Alles Weitere ist ein Modul, das
 * im Admin freigeschaltet wird. Ein Modul bringt drei Dinge mit:
 *   - Abschnitte im Formular, die erst mit dem Modul erscheinen
 *   - einen Leistungsumfang, den ausschliesslich der Admin pflegt
 *   - einen Leistungsschein, der erst mit dem Modul unterschrieben werden kann
 *
 * Der Leistungsumfang steht in den Vertragsdaten der Aufnahme (terms), nicht
 * bei den Antworten - der Tenant sieht ihn, kann ihn aber nicht ändern.
 */

const { L } = require('./i18n');

function o(code, de, en) { return { code: code, de: de, en: en }; }

const GRO_SCOPE = [
  o('messages', 'Gästenachrichten auf allen verbundenen Kanälen', 'Guest messages on all connected channels'),
  o('pre_booking', 'Anfragen vor der Buchung', 'Pre-booking enquiries'),
  o('complaints', 'Beschwerden aufnehmen und lösen', 'Taking and resolving complaints'),
  o('escalation', 'Eskalation an Sie nach Ihren Regeln', 'Escalation to you under your rules'),
  o('extensions', 'Verlängerung, Late Check-out, Zusatzleistungen', 'Extensions, late check-out, extras'),
  o('tasks', 'Aufträge an Ihr Team vor Ort über Elev8 Suite', 'Dispatching your on-site team via Elev8 Suite'),
  o('phone', 'Telefonische Erreichbarkeit für Gäste', 'Phone availability for guests')
];

const COVERAGE = [
  o('h24_7', '24/7', '24/7'),
  o('h12_7', '12/7 (Tagesschicht)', '12/7 (day shift)'),
  o('other', 'Andere Zeiten', 'Other hours')
];

const RM_SCOPE = [
  o('pricing', 'Preissetzung, Mindestaufenthalt und Rabattsteuerung im Korridor',
    'Pricing, minimum stay and discount control within the corridor'),
  o('content', 'Titel, Beschreibungen und Bildmaterial auf den Kanälen',
    'Titles, descriptions and image material on the channels')
];

const MODULES = [
  {
    id: 'gro',
    kind: 'gro',
    name: L('Guest Relations', 'Guest relations'),
    docTitle: L('Leistungsschein Guest Relations', 'Service schedule guest relations'),
    sections: ['betrieb', 'auftrag', 'mandat', 'eskalation', 'vorort', 'auftritt', 'geld'],
    // Abschnitt, über dem der gebuchte Umfang für den Tenant steht.
    scopeSection: 'auftrag',
    scope: { key: 'gro_scope', options: GRO_SCOPE, label: L('Leistungsumfang', 'Scope of services') },
    extra: { key: 'gro_scope_extra', label: L('Zusätzlich vereinbart', 'Additionally agreed') },
    coverage: { key: 'gro_coverage', customKey: 'gro_coverage_custom', options: COVERAGE,
      label: L('Abdeckungszeiten', 'Coverage hours') },
    price: ['price_per_unit', 'term_months', 'notice_months']
  },
  {
    id: 'rm',
    kind: 'rm',
    name: L('Revenue Management', 'Revenue management'),
    docTitle: L('Leistungsschein Revenue Management', 'Service schedule revenue management'),
    sections: ['revenue'],
    scopeSection: 'revenue',
    scope: { key: 'rm_scope', options: RM_SCOPE, label: L('Leistungsumfang', 'Scope of services') },
    price: ['rm_price_per_unit', 'rm_term_months', 'rm_notice_months']
  }
];

const BY_ID = {};
MODULES.forEach(function (m) { BY_ID[m.id] = m; });

/** Ist ein Modul für diese Aufnahme freigeschaltet? */
function isActive(terms, id) {
  return String((terms || {})['mod_' + id] || '') === '1';
}

function activeModules(terms) {
  return MODULES.filter(function (m) { return isActive(terms, m.id); });
}

/** Abschnitte, die für diese Aufnahme überhaupt gezeigt werden. */
function sectionAllowed(section, terms) {
  if (!section || !section.module) return true;
  return isActive(terms, section.module);
}

/**
 * Einzelne Fragen können an einem Teil des Leistungsumfangs hängen - die
 * Content-Fragen etwa nur, wenn der Content-Teil auch bestellt ist.
 */
function fieldAllowed(field, terms) {
  if (!field) return true;
  if (field.module && !isActive(terms, field.module)) return false;
  const need = field.requiresScope;
  if (!need) return true;
  return isActive(terms, need.module) && hasScope(terms, need.module, need.code);
}

/** Gewählte Codes eines Leistungsumfangs. */
function scopeCodes(terms, id) {
  const m = BY_ID[id];
  if (!m || !m.scope) return [];
  return String((terms || {})[m.scope.key] || '').split(',')
    .map(function (x) { return x.trim(); }).filter(Boolean);
}

function hasScope(terms, id, code) {
  return scopeCodes(terms, id).indexOf(code) > -1;
}

/** Leistungsumfang als lesbare Liste - für Vertrag und Anzeige. */
function scopeLabels(terms, id, lang) {
  const m = BY_ID[id];
  if (!m || !m.scope) return [];
  const picked = scopeCodes(terms, id);
  const out = m.scope.options.filter(function (x) { return picked.indexOf(x.code) > -1; })
    .map(function (x) { return lang === 'en' ? x.en : x.de; });
  const extra = m.extra ? String((terms || {})[m.extra.key] || '').trim() : '';
  if (extra) out.push(extra);
  return out;
}

/** Abdeckungszeiten als Text, mit der freien Eingabe bei "Andere Zeiten". */
function coverageText(terms, id, lang) {
  const m = BY_ID[id];
  if (!m || !m.coverage) return '';
  const t = terms || {};
  const code = String(t[m.coverage.key] || '');
  if (code === 'other') return String(t[m.coverage.customKey] || '').trim();
  const hit = m.coverage.options.filter(function (x) { return x.code === code; })[0];
  return hit ? (lang === 'en' ? hit.en : hit.de) : '';
}

/** Ist der Leistungsumfang vollständig genug für einen Leistungsschein? */
function scopeReady(terms, id) {
  const m = BY_ID[id];
  if (!m) return false;
  if (!scopeCodes(terms, id).length) return false;
  if (m.coverage && !coverageText(terms, id, 'de')) return false;
  return true;
}

/** Standardwerte beim Freischalten eines Moduls: voller Umfang. */
function defaults(id) {
  const m = BY_ID[id];
  if (!m) return {};
  const out = {};
  out[m.scope.key] = m.scope.options.map(function (x) { return x.code; }).join(', ');
  if (m.coverage) out[m.coverage.key] = m.coverage.options[0].code;
  return out;
}

module.exports = {
  MODULES, BY_ID, GRO_SCOPE, COVERAGE, RM_SCOPE,
  isActive, activeModules, sectionAllowed, fieldAllowed, scopeCodes, hasScope,
  scopeLabels, coverageText, scopeReady, defaults
};
