'use strict';

/**
 * Nachholen von Elev8-Daten, ausgeloest vom Tenant selbst.
 *
 * Die eine Regel, die hier zaehlt: ergaenzen ja, ueberschreiben nie.
 * Ein fehlgeschlagener oder unvollstaendiger Abruf darf niemals dazu
 * fuehren, dass bereits vorhandene Angaben verschwinden.
 */

const { FIELD_MAP } = require('./questions');

function norm(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function labelOf(id) {
  const f = FIELD_MAP.get(id);
  return (f && f.label) || id;
}

/**
 * Widersprueche: der Tenant hat etwas eingetragen, Elev8 sagt inzwischen
 * etwas anderes. Wir loesen das nicht still auf, sondern zeigen beides.
 */
function conflictsFor(values, prefill) {
  const out = [];
  Object.keys(prefill || {}).forEach(function (id) {
    if (!FIELD_MAP.has(id)) return;
    const p = prefill[id] && prefill[id].value;
    const mine = values ? values[id] : '';
    if (!norm(p) || !norm(mine)) return;
    if (norm(mine) === norm(p)) return;
    out.push({
      field: id,
      label: labelOf(id),
      mine: String(mine),
      elev8: String(p),
      evidence: (prefill[id] && prefill[id].evidence) || 'aus Elev8'
    });
  });
  return out;
}

/** Welche Luecken in der Bereitschaftsanzeige sich geschlossen haben. */
function closedGaps(oldRows, newRows) {
  const before = {};
  (oldRows || []).forEach(function (r) { before[r.label] = r; });
  return (newRows || []).filter(function (r) {
    const b = before[r.label];
    if (!b) return false;
    if (r.ok && !b.ok) return true;
    return Number(r.n) > Number(b.n);
  }).map(function (r) {
    const b = before[r.label];
    return { label: r.label, from: Number(b.n), to: Number(r.n), total: Number(r.total), ok: !!r.ok };
  });
}

/**
 * Alten Schnappschuss mit frischen Elev8-Daten zusammenfuehren.
 * Liefert den neuen Schnappschuss plus das, was der Tenant sehen soll.
 */
function mergeSnapshot(oldSnap, fresh, values) {
  const oldPre = (oldSnap && oldSnap.prefill) || {};
  const freshPre = (fresh && fresh.prefill) || {};
  const vals = values || {};
  const prefill = Object.assign({}, oldPre);
  const added = [];

  Object.keys(freshPre).forEach(function (id) {
    if (!FIELD_MAP.has(id)) return;
    const nv = freshPre[id] && freshPre[id].value;
    if (!norm(nv)) return;                    // Elev8 liefert nichts -> Altes behalten
    const before = oldPre[id] && oldPre[id].value;
    prefill[id] = freshPre[id];               // Vorschlag aktualisieren
    if (norm(vals[id])) return;               // schon beantwortet -> kein neuer Vorschlag
    if (norm(before) === norm(nv)) return;    // unveraendert -> nichts zu melden
    added.push({
      field: id,
      label: labelOf(id),
      value: String(nv),
      evidence: freshPre[id].evidence || 'aus Elev8'
    });
  });

  const readiness = (fresh && fresh.readiness && fresh.readiness.length)
    ? fresh.readiness
    : ((oldSnap && oldSnap.readiness) || []);

  const snapshot = {
    facts: (fresh && fresh.facts) || (oldSnap && oldSnap.facts) || null,
    prefill: prefill,
    readiness: readiness,
    syncedAt: new Date().toISOString()
  };

  return {
    snapshot: snapshot,
    added: added,
    conflicts: conflictsFor(vals, prefill),
    closed: closedGaps(oldSnap && oldSnap.readiness, readiness)
  };
}

/** Menschliche Zusammenfassung fuer die Statuszeile im Formular. */
function summarize(r) {
  const parts = [];
  if (r.closed.length) {
    parts.push(r.closed.map(function (c) {
      return c.label + ' ' + c.to + '/' + c.total;
    }).join(', '));
  }
  if (r.added.length) {
    parts.push(r.added.length + (r.added.length === 1 ? ' neue Angabe' : ' neue Angaben') + ' aus Elev8');
  }
  if (!parts.length) return 'Nichts Neues — in Elev8 steht dasselbe wie vorhin.';
  return parts.join(' · ');
}

module.exports = { mergeSnapshot, conflictsFor, closedGaps, summarize, norm };
