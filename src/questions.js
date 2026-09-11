'use strict';

/**
 * Fragenkatalog für das Tenant-Intake.
 * Abgeleitet aus der GRO-Checkliste: alles, was Elev8 nicht bereits im
 * eigenen System hat und beim Tenant abgeholt werden muss.
 */

const YESNO = ['Ja', 'Nein', 'Nach Rücksprache'];

const SECTIONS = [
  {
    id: 'kontakt',
    title: 'Ihr Betrieb',
    intro: 'Damit wir wissen, mit wem wir arbeiten und worüber Ihre Gäste buchen.',
    fields: [
      { id: 'company', label: 'Firmenname des Betreibers', type: 'text', required: true },
      { id: 'brand', label: 'Name, unter dem Ihre Gäste Sie kennen', type: 'text', help: 'Unter diesem Namen treten wir gegenüber Gästen auf.' },
      { id: 'address', label: 'Adresse des Objekts', type: 'textarea', required: true },
      { id: 'units', label: 'Anzahl Zimmer bzw. Einheiten', type: 'number' },
      { id: 'channels', label: 'Über welche Kanäle buchen Ihre Gäste?', type: 'textarea', placeholder: 'z. B. Booking.com 70 %, Direktbuchungen 20 %, Telefon 10 %' },
      { id: 'pms', label: 'Welches PMS oder Channel Manager nutzen Sie?', type: 'text' },
      { id: 'contact_main', label: 'Hauptansprechpartner (Name und Rolle)', type: 'text', required: true },
      { id: 'contact_phone', label: 'Telefonnummer', type: 'tel', required: true },
      { id: 'contact_email', label: 'E-Mail-Adresse', type: 'email', required: true },
      { id: 'start_date', label: 'Ab wann sollen wir übernehmen?', type: 'text', placeholder: 'z. B. ab 1. November, oder: sobald möglich' }
    ]
  },

  {
    id: 'betrieb',
    title: 'Betrieb und Anreise',
    intro: 'Was ein Gast erlebt, wenn er ankommt — und was wir ihm sagen können, wenn etwas nicht wie geplant läuft.',
    fields: [
      { id: 'reception_hours', label: 'Rezeptionszeiten', type: 'textarea', placeholder: 'Mo–Fr 07:00–21:00, Sa/So 08:00–20:00' },
      { id: 'after_hours', label: 'Was passiert bei Anreise nach Rezeptionsschluss?', type: 'textarea', required: true },
      { id: 'selfcheckin', label: 'Gibt es Self-Check-in?', type: 'radio', options: ['Ja', 'Nein', 'Teilweise'] },
      { id: 'access', label: 'Wie kommt der Gast in Haus und Zimmer?', type: 'textarea', help: 'Schlüsselbox, Smart Lock, Schlüsselübergabe — bitte inklusive Ablauf.' },
      { id: 'checkin_time', label: 'Check-in ab', type: 'text', placeholder: '15:00' },
      { id: 'checkout_time', label: 'Check-out bis', type: 'text', placeholder: '11:00' },
      { id: 'breakfast', label: 'Frühstück: Zeiten, Preis, Anmeldung nötig?', type: 'textarea' },
      { id: 'parking', label: 'Parken: verfügbar, Preis, reservierbar?', type: 'textarea' },
      { id: 'wifi', label: 'WLAN-Name und Passwort', type: 'text' },
      { id: 'quirks', label: 'Was fragen Ihre Gäste am häufigsten?', type: 'textarea', help: 'Die drei bis fünf häufigsten Fragen sparen uns Wochen Einarbeitung.' }
    ]
  },

  {
    id: 'auftrag',
    title: 'Was wir übernehmen sollen',
    intro: 'Umfang und Zeiten. Danach richten wir unsere Schichtplanung aus.',
    fields: [
      { id: 'scope', label: 'Welche Aufgaben soll unser Guest Relations Officer übernehmen?', type: 'textarea', required: true, placeholder: 'Gästenachrichten, Telefon, Beschwerden, Upsell, Koordination Housekeeping …' },
      { id: 'coverage', label: 'Welche Zeiten sollen wir abdecken?', type: 'textarea', required: true, help: 'Bitte in Ihrer Ortszeit angeben.' },
      { id: 'languages', label: 'In welchen Sprachen müssen wir antworten?', type: 'text', required: true },
      { id: 'response_target', label: 'Welche Antwortzeit erwarten Sie?', type: 'text', placeholder: 'z. B. innerhalb 15 Minuten während der Abdeckung' },
      { id: 'volume', label: 'Ungefähres Nachrichtenaufkommen pro Tag', type: 'text' },
      { id: 'peaks', label: 'Wann ist bei Ihnen Hochbetrieb?', type: 'textarea', placeholder: 'Messen, Ferien, Wochenenden, Firmenreisezeiten' }
    ]
  },

  {
    id: 'mandat',
    title: 'Was unser GRO entscheiden darf',
    intro: 'Der wichtigste Teil. Ohne klare Grenzen muss unser Team bei jeder Kleinigkeit nachfragen — und Ihre Gäste warten.',
    fields: [
      { id: 'goodwill_limit', label: 'Kulanz und Erstattung bis zu welchem Betrag ohne Rückfrage?', type: 'money', required: true },
      { id: 'goodwill_month', label: 'Obergrenze pro Monat', type: 'money' },
      { id: 'late_checkout', label: 'Late Check-out gratis gewähren?', type: 'radio', options: YESNO },
      { id: 'late_checkout_until', label: 'Wenn ja: bis zu welcher Uhrzeit?', type: 'text' },
      { id: 'early_checkin', label: 'Early Check-in gratis gewähren?', type: 'radio', options: YESNO },
      { id: 'cancel_rebook', label: 'Darf der GRO stornieren, umbuchen oder upgraden?', type: 'radio', options: YESNO },
      { id: 'cancel_rules', label: 'Unter welchen Bedingungen?', type: 'textarea' },
      { id: 'overbooking', label: 'Bei Überbuchung: wohin wird umgebucht, wer trägt die Differenz?', type: 'textarea' },
      { id: 'noshow', label: 'No-Show: wer entscheidet über die Belastung der Karte, nach welcher Frist?', type: 'textarea' },
      { id: 'damage_limit', label: 'Schäden: ab welchem Betrag eskalieren wir an Sie?', type: 'money' },
      { id: 'damage_rules', label: 'Wie gehen wir mit Schäden und Kaution um?', type: 'textarea' },
      { id: 'discount', label: 'Rabatt bei Verlängerung oder Direktanfrage — welcher Spielraum?', type: 'textarea' },
      { id: 'reviews', label: 'Darf der GRO Bewertungen im Namen des Hauses beantworten?', type: 'radio', options: YESNO },
      { id: 'mandate_signer', label: 'Wer unterzeichnet die Vollmacht dafür?', type: 'text', required: true }
    ]
  },

  {
    id: 'eskalation',
    title: 'Eskalation und Erreichbarkeit',
    intro: 'Wen rufen wir an, wenn es brennt — wörtlich und im übertragenen Sinn.',
    fields: [
      { id: 'esc1', label: 'Stufe 1: Name, Telefon, erreichbar wann', type: 'textarea', required: true },
      { id: 'esc2', label: 'Stufe 2: Name, Telefon, erreichbar wann', type: 'textarea' },
      { id: 'esc3', label: 'Stufe 3: Name, Telefon, erreichbar wann', type: 'textarea' },
      { id: 'esc_immediate', label: 'Welche Fälle sollen wir sofort telefonisch melden?', type: 'textarea', required: true, placeholder: 'Feuer, Wasserschaden, Verletzung, Polizei, ausgesperrter Gast, Heizungsausfall …' },
      { id: 'esc_nobody', label: 'Was, wenn niemand von Ihnen erreichbar ist?', type: 'textarea', help: 'Darf unser GRO selbst einen Notdienst beauftragen? Bis zu welchem Betrag?' },
      { id: 'esc_contact_us', label: 'Wer ist Ihr fester Ansprechpartner für uns — nicht für Gäste?', type: 'text' }
    ]
  },

  {
    id: 'vorort',
    title: 'Team und Partner vor Ort',
    intro: 'Unser GRO sitzt nicht im Haus. Alles, was Hände braucht, läuft über Ihre Leute.',
    fields: [
      { id: 'staff_onsite', label: 'Wer ist vor Ort? Rolle, Name, Telefon, Arbeitszeiten', type: 'textarea', required: true },
      { id: 'staff_in_elev8', label: 'Sind diese Personen bereits als Benutzer in Elev8 angelegt?', type: 'radio', options: ['Ja', 'Nein', 'Teilweise', 'Weiss ich nicht'] },
      { id: 'lockout', label: 'Ausgesperrter Gast: Ersatzschlüssel, wer hat Zugang, wie schnell ist jemand da?', type: 'textarea' },
      { id: 'trades', label: 'Notdienste: Sanitär, Elektro, Schlüsseldienst — mit Kontakt', type: 'textarea' },
      { id: 'emergency', label: 'Arzt und Klinik in der Nähe, Polizei, Ihre Versicherung', type: 'textarea' }
    ]
  },

  {
    id: 'auftritt',
    title: 'Auftreten gegenüber Gästen',
    intro: 'Der Gast soll Ihr Haus sehen, nicht uns.',
    fields: [
      { id: 'signature', label: 'Unter welchem Namen und welcher Signatur sollen wir schreiben?', type: 'text', required: true },
      { id: 'tone', label: 'Tonalität: Du oder Sie, Länge, Stil', type: 'textarea' },
      { id: 'nogos', label: 'Worüber soll unser GRO nie entscheiden oder sprechen?', type: 'textarea' },
      { id: 'ai', label: 'Dürfen wir KI-gestützte Antwortvorschläge einsetzen?', type: 'radio', options: ['Ja', 'Nein', 'Nur mit Freigabe durch einen Menschen'] },
      { id: 'phone_ok', label: 'Sollen wir auch Anrufe entgegennehmen?', type: 'radio', options: YESNO },
      { id: 'recording', label: 'Ist eine Gesprächsaufzeichnung gewünscht?', type: 'radio', options: ['Ja', 'Nein'], help: 'In Deutschland nur mit ausdrücklicher Einwilligung des Gastes zulässig.' },
      { id: 'templates', label: 'Haben Sie bestehende Textvorlagen, die wir übernehmen sollen?', type: 'textarea' }
    ]
  },

  {
    id: 'geld',
    title: 'Zusatzleistungen und Zahlungen',
    fields: [
      { id: 'upsells', label: 'Welche Zusatzleistungen können Sie liefern?', type: 'textarea', placeholder: 'Leistung — Preis — Vorlaufzeit — wer liefert' },
      { id: 'upsell_sell', label: 'Sollen wir aktiv verkaufen?', type: 'radio', options: YESNO },
      { id: 'upsell_terms', label: 'Wenn ja: Ziel und Vergütung', type: 'text' },
      { id: 'payment', label: 'Wie wird kassiert?', type: 'textarea', placeholder: 'vor Ort, über Booking.com, Zahlungslink, Rechnung …' },
      { id: 'deposit', label: 'Kaution: Höhe, Erhebung, Rückzahlung', type: 'textarea' },
      { id: 'invoices', label: 'Darf der GRO Gästerechnungen ausstellen oder korrigieren?', type: 'radio', options: YESNO }
    ]
  },

  {
    id: 'recht',
    title: 'Recht, Meldewesen, Datenschutz',
    intro: 'Für Objekte in der EU brauchen wir das schriftlich, bevor wir den ersten Gast betreuen.',
    fields: [
      { id: 'meldeschein', label: 'Wie erfassen Sie heute Meldescheine für ausländische Gäste?', type: 'textarea', help: 'Für deutsche Staatsangehörige ist die besondere Meldepflicht seit 1.1.2025 entfallen, für ausländische Gäste besteht sie weiter.' },
      { id: 'meldeschein_who', label: 'Wer soll das künftig übernehmen?', type: 'radio', options: ['Wir selbst', 'Der GRO', 'Gemeinsam', 'Noch offen'] },
      { id: 'citytax', label: 'Beherbergungs- oder Kurtaxe: fällt sie an, wer erhebt sie?', type: 'textarea' },
      { id: 'dpo', label: 'Ansprechpartner für Datenschutz auf Ihrer Seite', type: 'text' },
      { id: 'avv', label: 'Haben Sie eine eigene Vorlage für den Auftragsverarbeitungsvertrag?', type: 'radio', options: ['Ja, wir stellen sie', 'Nein, bitte Ihre Vorlage', 'Noch offen'] },
      { id: 'data_notes', label: 'Besondere Auflagen zum Umgang mit Gastdaten', type: 'textarea' }
    ]
  },

  {
    id: 'zugaenge',
    title: 'Zugänge und Werkzeuge',
    intro: 'Ohne die richtigen Zugänge kann unser Team nur zuschauen.',
    fields: [
      { id: 'extranet', label: 'Können wir eigene Zugänge zu Ihrem OTA-Extranet bekommen?', type: 'radio', options: YESNO, help: 'Eigene Sub-Accounts statt geteilter Logins — sicherer und nachvollziehbar.' },
      { id: 'elev8_access', label: 'Wer legt die Elev8-Benutzer für unsere GROs an?', type: 'text' },
      { id: 'smartlock', label: 'Wie werden Türcodes erzeugt und an Gäste geschickt?', type: 'textarea' },
      { id: 'whatsapp', label: 'Nutzen Sie WhatsApp Business? Wem gehört die Nummer?', type: 'textarea' },
      { id: 'other_tools', label: 'Weitere Werkzeuge, die wir brauchen', type: 'textarea' }
    ]
  },

  {
    id: 'sonstiges',
    title: 'Zum Schluss',
    fields: [
      { id: 'priority', label: 'Was ist Ihnen am wichtigsten?', type: 'textarea', help: 'Ein Satz genügt. Danach richten wir die Einarbeitung aus.' },
      { id: 'concerns', label: 'Was bereitet Ihnen bei einer externen Gästebetreuung Sorgen?', type: 'textarea' },
      { id: 'anything', label: 'Sonstiges, das wir wissen sollten', type: 'textarea' }
    ]
  }
];

const ALL_FIELDS = [];
const FIELD_MAP = new Map();
SECTIONS.forEach(function (sec) {
  sec.fields.forEach(function (f) {
    const rec = Object.assign({ section: sec.id, sectionTitle: sec.title }, f);
    ALL_FIELDS.push(rec);
    FIELD_MAP.set(f.id, rec);
  });
});

module.exports = { SECTIONS, ALL_FIELDS, FIELD_MAP };
