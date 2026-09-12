'use strict';

/**
 * Zweisprachigkeit. Deutsch ist die Ausgangssprache, Englisch die zweite.
 * Alles, was der Tenant sieht, laeuft durch t(). Der Adminbereich bleibt
 * bewusst deutsch - er ist intern.
 */

const LANGS = ['de', 'en'];
const DEFAULT_LANG = 'de';

function normLang(x) {
  const l = String(x || '').trim().toLowerCase().slice(0, 2);
  return LANGS.indexOf(l) > -1 ? l : null;
}

/** Sprache aus dem Browser. Erste Anzeige, danach entscheidet die Wahl. */
function pickLang(acceptLanguage) {
  const raw = String(acceptLanguage || '');
  if (!raw) return DEFAULT_LANG;
  const items = raw.split(',').map(function (part) {
    const bits = part.split(';');
    const tag = normLang(bits[0]);
    let q = 1;
    for (let i = 1; i < bits.length; i++) {
      const m = /^\s*q=([0-9.]+)\s*$/.exec(bits[i]);
      if (m) q = parseFloat(m[1]);
    }
    return tag ? { tag: tag, q: isNaN(q) ? 0 : q } : null;
  }).filter(Boolean);
  if (!items.length) return DEFAULT_LANG;
  items.sort(function (a, b) { return b.q - a.q; });
  return items[0].tag;
}

/** Nimmt {de, en} oder einen einfachen String. */
function t(v, lang) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const l = normLang(lang) || DEFAULT_LANG;
  return v[l] != null && v[l] !== '' ? v[l] : (v[DEFAULT_LANG] || v.en || '');
}

/** Kurzschreibweise beim Anlegen von Texten. */
function L(de, en) { return { de: de, en: en }; }

/* ---------------- Oberflaechentexte ---------------- */

const UI = {
  brandline: L('Elev8 · Guest Relations', 'Elev8 · Guest Relations'),
  saveHint: L('Jede Eingabe wird sofort gespeichert', 'Every entry is saved immediately'),
  saving: L('Speichert …', 'Saving …'),
  savedAll: L('Alles gespeichert', 'All saved'),
  saveFailed: L('Nicht gespeichert — bitte Verbindung prüfen', 'Not saved — please check your connection'),
  applying: L('Übernimmt …', 'Applying …'),
  applySection: L('Abschnitt wird übernommen …', 'Applying section …'),
  applyAll: L('Alle Elev8-Angaben werden übernommen …', 'Applying all Elev8 entries …'),
  applied: L('aus Elev8 übernommen', 'taken from Elev8'),
  applyFailed: L('Übernahme fehlgeschlagen — bitte nochmals', 'Could not apply — please try again'),
  taking: L('Wird übernommen …', 'Applying …'),

  eyebrow: L('Aufnahme für', 'Onboarding for'),
  h1: L('Was unser Team über Ihr Haus wissen muss',
    'What our team needs to know about your property'),
  lede: L('Wir übernehmen die Gästekommunikation für Sie. Alles, was in Ihrem Elev8-Konto schon steht, haben wir bereits eingetragen — Sie bestätigen es nur. Tippen müssen Sie nur das, was in keinem System steht: was unser Guest Relations Officer entscheiden darf, wen er anruft, und wie Sie klingen wollen.',
    'We take over guest communication for you. Everything already in your Elev8 account is filled in — you only confirm it. You only type what no system holds: what our Guest Relations Officer may decide, who to call, and how you want to sound.'),
  waitingOne: L('Angabe kommt aus Elev8 und wartet nur auf Ihr Okay.',
    'entry comes from Elev8 and is only waiting for your go-ahead.'),
  waitingMany: L('Angaben kommen aus Elev8 und warten nur auf Ihr Okay.',
    'entries come from Elev8 and are only waiting for your go-ahead.'),
  confirmAll: L('Alle auf einmal bestätigen', 'Confirm all at once'),
  timeHint: L('Jede Antwort wird sofort gespeichert; Sie können jederzeit aufhören und über denselben Link weitermachen. Rechnen Sie mit',
    'Every answer is saved immediately; you can stop any time and continue via the same link. Allow about'),
  minutes: L('Minuten.', 'minutes.'),
  submittedBanner: L('Sie haben diese Aufnahme abgeschlossen. Änderungen sind weiterhin möglich und werden gespeichert.',
    'You have completed this onboarding. Changes are still possible and will be saved.'),
  sections: L('Abschnitte', 'Sections'),
  finishH: L('Fertig?', 'Done?'),
  finishP: L('Alles Weitere klären wir im Gespräch. Mit dem Abschluss sagen Sie uns, dass wir mit der Einarbeitung starten können.',
    'We will settle everything else in conversation. Completing tells us we can start onboarding.'),
  finishBtn: L('Aufnahme abschliessen', 'Complete onboarding'),
  finishDone: L('Bereits abgeschlossen', 'Already completed'),
  submitting: L('Wird übermittelt …', 'Submitting …'),
  submitOk: L('Abgeschlossen — danke', 'Completed — thank you'),
  submitOkNote: L('Wir melden uns. Sie können hier jederzeit noch etwas ändern,',
    'We will be in touch. You can still change things here,'),
  submitOkNote2: L('Feldern sind ausgefüllt.', 'fields are filled in.'),
  submitFail: L('Das hat nicht geklappt — bitte nochmals versuchen.',
    'That did not work — please try again.'),
  missingOne: L('Pflichtfeld fehlt', 'required field is missing'),
  missingMany: L('Pflichtfelder fehlen', 'required fields are missing'),
  missingTail: L('noch — wir springen zum ersten.', '— we will jump to the first one.'),
  footer: L('Elev8 · Guest Relations Service. Diese Seite ist nur über Ihren persönlichen Link erreichbar und nicht öffentlich auffindbar.',
    'Elev8 · Guest Relations Service. This page is reachable only via your personal link and is not publicly listed.'),

  ok: L('Stimmt', 'Correct'),
  change: L('Ändern', 'Change'),
  yourAnswer: L('Ihre Angabe', 'Your entry'),
  fromElev8Confirmed: L('aus Elev8, von Ihnen bestätigt', 'from Elev8, confirmed by you'),
  fromElev8: L('aus Elev8', 'from Elev8'),
  required: L('Pflichtangabe', 'Required'),
  confirmSecOne: L('Elev8-Angabe hier bestätigen', 'Confirm the Elev8 entry here'),
  confirmSecMany: L('Elev8-Angaben hier bestätigen', 'Confirm the Elev8 entries here'),

  depBecause: L('Entfällt, weil Sie „%s" angegeben haben.', 'Not applicable because you selected "%s".'),
  depPrev: L('Entfällt aufgrund einer vorherigen Angabe.', 'Not applicable due to an earlier answer.'),
  depWait: L('Erscheint, sobald Sie die Frage darüber beantwortet haben.',
    'Appears once you have answered the question above.'),

  panelSrc: L('Direkt aus Ihrem Elev8-Konto', 'Straight from your Elev8 account'),
  panelH: L('Was schon gepflegt ist', 'What is already maintained'),
  panelUnits: L('Einheiten gefunden.', 'units found.'),
  panelLede: L('Diese Angaben mussten Sie nicht eintippen — wir haben sie aus Elev8 gelesen. Sie sehen sie hier nur zur Kontrolle.',
    'You did not have to type these — we read them from Elev8. They are shown here for checking only.'),
  lastFetched: L('Zuletzt aus Elev8 geholt:', 'Last fetched from Elev8:'),
  resyncBtn: L('In Elev8 nachgepflegt? Jetzt neu prüfen', 'Updated things in Elev8? Check again now'),
  resyncBusy: L('Wir sehen in Elev8 nach …', 'Checking Elev8 …'),
  resyncWait: L('Das dauert ein paar Sekunden.', 'This takes a few seconds.'),
  resyncReload: L('die Seite wird aktualisiert.', 'the page is refreshing.'),
  resyncNone: L('Nichts Neues — in Elev8 steht dasselbe wie vorhin.',
    'Nothing new — Elev8 says the same as before.'),
  resyncNoConn: L('Keine Verbindung. Bitte nochmals versuchen.', 'No connection. Please try again.'),
  resyncFail: L('Das hat nicht geklappt.', 'That did not work.'),

  clashH: L('In Elev8 steht inzwischen etwas anderes.', 'Elev8 now says something different.'),
  clashMine: L('Ihre Angabe', 'Your entry'),
  clashTheirs: L('Aus Elev8', 'From Elev8'),
  clashTake: L('Elev8-Wert übernehmen', 'Use the Elev8 value'),
  clashKeep: L('Meine Angabe behalten', 'Keep my entry'),

  langSwitch: L('English', 'Deutsch'),
  locked: L('Vertraglich fixiert', 'Fixed by contract'),
  lockedHint: L('Dieses Feld ist Bestandteil des unterzeichneten Vertrags und kann nur per Nachtrag geändert werden.',
    'This field is part of the signed contract and can only be changed by an addendum.'),
  newEntries: L('neue Angaben aus Elev8', 'new entries from Elev8'),
  newEntry: L('neue Angabe aus Elev8', 'new entry from Elev8'),

  readingEn: L('English reading version', 'English reading version'),
  readingDe: L('Zur verbindlichen deutschen Fassung', 'Go to the binding German version'),
  readingNotice: L('Unverbindliche Lesefassung. Verbindlich und zu unterzeichnen ist ausschliesslich die deutsche Fassung.',
    'Non-binding reading version. Only the German version is binding and is the one to be signed.'),
  bindingNotice: L('Verbindliche Fassung. Der Vertrag wird in deutscher Sprache geschlossen; eine englische Lesefassung steht daneben.',
    'Binding version. The contract is concluded in German; an English reading version is available alongside.'),
  contractsH: L('Verträge', 'Contracts'),
  contractsP: L('Aus Ihren Angaben entstehen zwei Dokumente. Bitte lesen und unterzeichnen Sie beide — danach können wir starten.',
    'Two documents are generated from your entries. Please read and sign both — then we can start.'),
  contractOpen: L('Lesen und unterzeichnen', 'Read and sign'),
  contractSigned: L('Unterzeichnet', 'Signed'),
  contractPdf: L('PDF herunterladen', 'Download PDF'),
  contractsBlocked: L('Die Verträge erscheinen hier, sobald alle Pflichtfelder ausgefüllt sind und wir die kaufmännischen Angaben hinterlegt haben.',
    'The contracts appear here once all required fields are filled in and we have entered the commercial terms.'),
  contractsMissingFields: L('Es fehlen noch Pflichtangaben.', 'Some required entries are still missing.'),
  contractsMissingTerms: L('Wir hinterlegen gerade Preis und Laufzeit. Sie hören von uns.',
    'We are entering price and term. You will hear from us.'),
  signH: L('Elektronisch unterzeichnen', 'Sign electronically'),
  signP: L('Mit dem Absenden unterzeichnen Sie dieses Dokument rechtsverbindlich in Textform. Wir halten Name, Funktion, E-Mail, Zeitpunkt, IP-Adresse und eine Prüfsumme des Dokuments fest. Art. 28 Abs. 9 DSGVO lässt das elektronische Format ausdrücklich zu; eine qualifizierte elektronische Signatur ist nicht erforderlich.',
    'By submitting you sign this document with legally binding effect in text form. We record name, role, email, time, IP address and a checksum of the document. Art. 28(9) GDPR expressly permits the electronic format; a qualified electronic signature is not required.'),
  signName: L('Vor- und Nachname', 'First and last name'),
  signRole: L('Funktion', 'Role'),
  signEmail: L('E-Mail-Adresse', 'Email address'),
  signConfirm: L('Ich bin zeichnungsberechtigt und unterzeichne dieses Dokument rechtsverbindlich.',
    'I am authorised to sign and hereby sign this document with binding effect.'),
  signBtn: L('Rechtsverbindlich unterzeichnen', 'Sign with binding effect'),
  signBusy: L('Wird unterzeichnet …', 'Signing …'),
  signDone: L('Unterzeichnet. Das PDF liegt bereit.', 'Signed. The PDF is ready.'),
  signFail: L('Das hat nicht geklappt. Bitte nochmals versuchen.', 'That did not work. Please try again.'),
  signedOn: L('Unterzeichnet am', 'Signed on'),
  signedBy: L('Unterzeichnet von', 'Signed by'),
  docHash: L('Dokument-Prüfsumme', 'Document checksum'),
  signAudit: L('Protokoll der Unterschrift', 'Signature record'),
  signIp: L('IP-Adresse', 'IP address'),
  signAgent: L('Browser', 'Browser'),
  signWhen: L('Zeitpunkt', 'Time'),
  backToForm: L('Zurück zur Aufnahme', 'Back to the onboarding form'),
  lockedNotice: L('Dieses Dokument ist unterzeichnet. Die darin festgehaltenen Angaben sind im Formular gesperrt und lassen sich nur per Nachtrag ändern.',
    'This document is signed. The entries it records are locked in the form and can only be changed by an addendum.'),
  counterSign: L('Gegenzeichnung', 'Countersignature'),

  notValid: L('Dieser Link ist nicht gültig', 'This link is not valid'),
  notValidP: L('Bitte fragen Sie bei Ihrem Ansprechpartner bei Elev8 nach einem neuen Link.',
    'Please ask your Elev8 contact for a new link.')
};

/** Texte, die das Frontend braucht. */
function clientStrings(lang) {
  const keys = ['saving', 'savedAll', 'saveFailed', 'applying', 'applySection', 'applyAll',
    'applied', 'applyFailed', 'taking', 'submitting', 'submitOk', 'submitOkNote', 'submitOkNote2',
    'submitFail', 'missingOne', 'missingMany', 'missingTail', 'depBecause', 'depPrev', 'depWait',
    'resyncBtn', 'resyncBusy', 'resyncWait', 'resyncReload', 'resyncNone', 'resyncNoConn',
    'resyncFail', 'yourAnswer', 'fromElev8Confirmed', 'change', 'lastFetched',
    'signBusy', 'signDone', 'signFail'];
  const out = {};
  keys.forEach(function (k) { out[k] = t(UI[k], lang); });
  out.justNow = lang === 'en' ? 'just now' : 'gerade eben';
  return out;
}

module.exports = { LANGS, DEFAULT_LANG, pickLang, normLang, t, L, UI, clientStrings };
