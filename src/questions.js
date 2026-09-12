'use strict';

/**
 * Fragenkatalog für das Tenant-Intake.
 * Grundsatz: so wenig Freitext wie möglich. Was in Chips oder Auswahllisten
 * passt, wird auch so gefragt — schneller für den Tenant, auswertbar für uns.
 *
 * Feld-Eigenschaften über die Standardfelder hinaus:
 *   dependsOn  { field, equals }  – Feld wird ausgegraut, solange die
 *                                   Bedingung nicht erfüllt ist. `equals`
 *                                   darf ein Wert oder eine Liste sein.
 *   preset / presetNote           – Vorschlag von uns (nicht aus Elev8),
 *                                   den der Tenant nur bestätigen muss
 *   type 'multi'                  – Mehrfachauswahl, gespeichert als Liste
 *                                   (Optionen dürfen kein Komma enthalten)
 *   type 'note'                   – reiner Hinweis, keine Frage
 */

const YESNO = ['Ja', 'Nein', 'Nach Rücksprache'];

const SCOPE_OPTIONS = [
  'Gästenachrichten auf allen verbundenen Kanälen',
  'Anfragen vor der Buchung',
  'Beschwerden aufnehmen und lösen',
  'Eskalation an Sie nach Ihren Regeln',
  'Verlängerung / Late Check-out / Zusatzleistungen',
  'Aufträge an Ihr Team vor Ort über Elev8',
  'Telefonische Erreichbarkeit für Gäste'
];

const ESC_OPTIONS = [
  'Feuer oder Rauch',
  'Wasserschaden',
  'Verletzung oder medizinischer Notfall',
  'Polizei oder Einbruch',
  'Ausgesperrter Gast',
  'Heizung oder Strom ausgefallen',
  'Kein warmes Wasser',
  'Presse- oder Behördenanfrage'
];

const BREAKFAST_ON = ['Ja, im Preis inbegriffen', 'Optional gegen Aufpreis'];
const BREAKFAST_PAID = 'Optional gegen Aufpreis';
const PARK_OWN = ['Ja, eigene Plätze am Haus', 'Ja, Partnergarage oder Parkplatz in der Nähe'];
const PARK_ANY = PARK_OWN.concat(['Nur öffentliche Parkplätze']);

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
      { id: 'contact_main', label: 'Hauptansprechpartner (Name und Rolle)', type: 'text', required: true },
      { id: 'contact_phone', label: 'Telefonnummer', type: 'tel', required: true },
      { id: 'contact_email', label: 'E-Mail-Adresse', type: 'email', required: true },
      { id: 'start_date', label: 'Ab wann sollen wir übernehmen?', type: 'radio', required: true,
        options: ['So bald wie möglich', 'Innerhalb von zwei Wochen', 'Ab nächstem Monatsersten', 'Zu einem festen Datum'] },
      { id: 'start_date_when', label: 'Welches Datum?', type: 'text', placeholder: '01.11.2026',
        dependsOn: { field: 'start_date', equals: 'Zu einem festen Datum' } }
    ]
  },

  {
    id: 'betrieb',
    title: 'Betrieb und Anreise',
    intro: 'Was ein Gast erlebt, wenn er ankommt — und was wir ihm sagen können, wenn etwas nicht wie geplant läuft.',
    fields: [
      { id: 'reception', label: 'Gibt es bei Ihnen eine Rezeption?', type: 'radio', options: ['Ja', 'Nein'], required: true, help: 'Bei „Nein" überspringen wir alles, was eine Rezeption voraussetzt.' },
      { id: 'reception_hours', label: 'Rezeptionszeiten', type: 'radio',
        options: ['24/7', '07:00–22:00', '08:00–20:00', 'Andere Zeiten'],
        dependsOn: { field: 'reception', equals: 'Ja' } },
      { id: 'reception_hours_custom', label: 'Welche Zeiten genau?', type: 'text', placeholder: 'Mo–Fr 07:00–21:00, Sa/So 08:00–20:00',
        dependsOn: { field: 'reception_hours', equals: 'Andere Zeiten' } },
      { id: 'after_hours', label: 'Was passiert bei Anreise nach Rezeptionsschluss?', type: 'radio',
        options: ['Self-Check-in mit Code oder Schlüsselbox', 'Nachtportier vor Ort', 'Gast ruft eine Notfallnummer an', 'Anreise nach Schluss nicht möglich', 'Anders'],
        dependsOn: { field: 'reception_hours', equals: ['07:00–22:00', '08:00–20:00', 'Andere Zeiten'] } },
      { id: 'after_hours_custom', label: 'Wie genau?', type: 'text',
        dependsOn: { field: 'after_hours', equals: 'Anders' } },
      { id: 'selfcheckin', label: 'Gibt es Self-Check-in?', type: 'radio', options: ['Ja', 'Nein', 'Teilweise'] },
      { id: 'access', label: 'Wie kommt der Gast in Haus und Zimmer?', type: 'radio', required: true,
        options: ['Smart Lock mit Code', 'Schlüsselbox', 'Persönliche Übergabe', 'Schlüssel bei Partner oder Nachbar', 'Unterschiedlich je Einheit'] },
      { id: 'access_note', label: 'Ablauf in Stichworten, falls nötig', type: 'textarea' },
      { id: 'checkin_time', label: 'Check-in ab', type: 'text', placeholder: '15:00' },
      { id: 'checkout_time', label: 'Check-out bis', type: 'text', placeholder: '11:00' },

      { id: 'breakfast', label: 'Bieten Sie Frühstück an?', type: 'radio', required: true,
        options: ['Ja, im Preis inbegriffen', BREAKFAST_PAID, 'Nein'] },
      { id: 'breakfast_hours', label: 'Frühstückszeiten', type: 'text', placeholder: '07:00–10:00, Sa/So bis 11:00',
        dependsOn: { field: 'breakfast', equals: BREAKFAST_ON } },
      { id: 'breakfast_where', label: 'Wo wird serviert?', type: 'text', placeholder: 'Frühstücksraum im Erdgeschoss',
        dependsOn: { field: 'breakfast', equals: BREAKFAST_ON } },
      { id: 'breakfast_price', label: 'Preis pro Person und Tag', type: 'money',
        dependsOn: { field: 'breakfast', equals: BREAKFAST_PAID } },
      { id: 'breakfast_seen', label: 'Woran sehen wir, ob ein Gast Frühstück gebucht hat?', type: 'radio', required: true,
        options: ['Als Upsell in Elev8', 'In der Buchung vom Kanal', 'Liste beim Team vor Ort', 'Gast meldet sich direkt vor Ort', 'Noch nicht geregelt'],
        help: 'Ohne diese Information können wir Gästen keine verbindliche Auskunft geben.',
        dependsOn: { field: 'breakfast', equals: BREAKFAST_PAID } },
      { id: 'breakfast_deadline', label: 'Bis wann kann nachgebucht werden?', type: 'radio',
        options: ['Bis zum Vorabend', 'Bis 22:00 am Vortag', 'Auch noch am Morgen', 'Nur bei der Buchung'],
        dependsOn: { field: 'breakfast', equals: BREAKFAST_PAID } },

      { id: 'parking', label: 'Gibt es Parkmöglichkeiten?', type: 'radio', required: true,
        options: PARK_OWN.concat(['Nur öffentliche Parkplätze', 'Nein']) },
      { id: 'parking_cost', label: 'Kostenpflichtig?', type: 'radio', options: ['Kostenlos', 'Kostenpflichtig'],
        dependsOn: { field: 'parking', equals: PARK_OWN } },
      { id: 'parking_price', label: 'Preis pro Nacht', type: 'money',
        dependsOn: { field: 'parking_cost', equals: 'Kostenpflichtig' } },
      { id: 'parking_reserve', label: 'Reservierbar?', type: 'radio',
        options: ['Ja, im Voraus reservierbar', 'Nein, nach Verfügbarkeit', 'Jeder Einheit fest zugeteilt'],
        dependsOn: { field: 'parking', equals: PARK_OWN } },
      { id: 'parking_spots', label: 'Anzahl Plätze', type: 'number',
        dependsOn: { field: 'parking', equals: PARK_OWN } },
      { id: 'parking_note', label: 'Was muss der Gast wissen?', type: 'text', placeholder: 'Zufahrt, Einfahrtshöhe, Adresse der Garage',
        dependsOn: { field: 'parking', equals: PARK_ANY } },

      { id: 'wifi', label: 'WLAN-Name (SSID)', type: 'text' },
      { id: 'wifi_pass', label: 'WLAN-Passwort', type: 'text', required: true, help: 'Bitte prüfen Sie, ob es noch stimmt — das ist die häufigste Gastfrage.' },
      { id: 'quirks', label: 'Was fragen Ihre Gäste am häufigsten?', type: 'textarea', help: 'Die drei bis fünf häufigsten Fragen sparen uns Wochen Einarbeitung.' }
    ]
  },

  {
    id: 'auftrag',
    title: 'Was wir übernehmen sollen',
    intro: 'Umfang und Zeiten. Danach richten wir unsere Schichtplanung aus.',
    fields: [
      {
        id: 'scope', label: 'Welche Aufgaben soll unser Guest Relations Officer übernehmen?',
        type: 'multi', options: SCOPE_OPTIONS, required: true,
        preset: SCOPE_OPTIONS.join(', '),
        presetNote: 'Unser Standardumfang — hier abwählen, was für Sie nicht gilt'
      },
      { id: 'scope_extra', label: 'Fehlt etwas?', type: 'text' },
      { id: 'coverage', label: 'Welche Zeiten sollen wir abdecken?', type: 'radio', required: true,
        options: ['24/7', '12/7 (Tagesschicht)', 'Andere Zeiten'] },
      { id: 'coverage_custom', label: 'Welche Zeiten genau?', type: 'text', placeholder: '08:00–20:00 Ortszeit, täglich',
        dependsOn: { field: 'coverage', equals: 'Andere Zeiten' } },
      { id: 'languages', label: 'In welchen Sprachen sollen wir antworten?', type: 'multi', options: ['Deutsch', 'Englisch'], required: true, help: 'Mehrfachauswahl. Andere Sprachen können wir derzeit nicht zusagen.' },
      { id: 'volume', label: 'Ungefähres Nachrichtenaufkommen pro Tag', type: 'radio',
        options: ['unter 20', '20 bis 50', '50 bis 100', 'über 100', 'Weiss ich nicht'] },
      { id: 'peaks', label: 'Wann ist bei Ihnen Hochbetrieb?', type: 'multi',
        options: ['Sommerferien', 'Weihnachten und Neujahr', 'Messen', 'Wochenenden', 'Firmenreisen Mo–Do', 'Ganzjährig gleichmässig'] },
      { id: 'peaks_note', label: 'Konkrete Termine, die wir kennen sollten', type: 'text', placeholder: 'Messe Stuttgart, 12.–15. März' }
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
      { id: 'late_checkout_until', label: 'Bis zu welcher Uhrzeit?', type: 'radio',
        options: ['12:00', '13:00', '14:00', 'Nach Verfügbarkeit'],
        dependsOn: { field: 'late_checkout', equals: ['Ja', 'Nach Rücksprache'] } },
      { id: 'early_checkin', label: 'Early Check-in gratis gewähren?', type: 'radio', options: YESNO },
      { id: 'early_checkin_from', label: 'Ab welcher Uhrzeit?', type: 'radio',
        options: ['ab 12:00', 'ab 13:00', 'ab 14:00', 'Nach Verfügbarkeit'],
        dependsOn: { field: 'early_checkin', equals: ['Ja', 'Nach Rücksprache'] } },
      { id: 'cancel_rebook', label: 'Darf der GRO stornieren, umbuchen oder upgraden?', type: 'radio', options: YESNO },
      { id: 'cancel_rules', label: 'In welchen Fällen?', type: 'multi',
        options: ['Bei Überbuchung', 'Bei defektem Zimmer', 'Auf Gastwunsch innerhalb der Stornofrist', 'Bei Doppelbuchung über den Kanal'],
        dependsOn: { field: 'cancel_rebook', equals: ['Ja', 'Nach Rücksprache'] } },
      { id: 'overbooking', label: 'Bei Überbuchung: wie gehen wir vor?', type: 'radio',
        options: ['Gleichwertiges Haus in der Nähe, Differenz zu Ihren Lasten', 'Gleichwertiges Haus, Differenz trägt der Gast', 'Immer zuerst Rücksprache mit Ihnen', 'Kommt bei uns nicht vor'] },
      { id: 'noshow', label: 'No-Show: wann wird die Karte belastet?', type: 'radio',
        options: ['Nach 24:00 des Anreisetags', 'Nach zwei Stunden ohne Kontakt', 'Nur nach Rücksprache', 'Der Kanal regelt das'] },
      { id: 'damage_limit', label: 'Schäden: ab welchem Betrag eskalieren wir an Sie?', type: 'money' },
      { id: 'damage_rules', label: 'Wie gehen wir mit Schäden um?', type: 'multi',
        options: ['Kaution einbehalten', 'Foto dokumentieren und an Sie melden', 'Gast direkt belasten', 'Über den Kanal melden'] },
      { id: 'discount', label: 'Rabatt bei Verlängerung oder Direktanfrage', type: 'radio',
        options: ['Kein Rabatt', 'Bis 5 %', 'Bis 10 %', 'Bis 15 %', 'Nur nach Rücksprache'] },
      { id: 'mandate_signer', label: 'Wer unterzeichnet die Vollmacht dafür?', type: 'text', required: true }
    ]
  },

  {
    id: 'eskalation',
    title: 'Eskalation und Erreichbarkeit',
    intro: 'Wen rufen wir an, wenn es brennt — wörtlich und im übertragenen Sinn.',
    fields: [
      { id: 'note_elev8_users', type: 'note',
        label: 'Alle Personen, die informiert oder eskaliert werden sollen, müssen in Elev8 als Benutzer angelegt sein. Nur dann erreicht unser GRO sie über das System und der Vorgang bleibt nachvollziehbar. Bitte legen Sie fehlende Personen vor dem Start an.' },
      { id: 'esc1', label: 'Stufe 1: Name, Telefon, erreichbar wann', type: 'textarea', required: true },
      { id: 'esc2', label: 'Stufe 2: Name, Telefon, erreichbar wann', type: 'textarea' },
      { id: 'esc3', label: 'Stufe 3: Name, Telefon, erreichbar wann', type: 'textarea' },
      { id: 'esc_in_elev8', label: 'Sind diese Personen bereits als Benutzer in Elev8 angelegt?', type: 'radio', required: true,
        options: ['Ja, alle', 'Teilweise', 'Nein, noch nicht'],
        help: 'Zwingende Voraussetzung — ohne Elev8-Benutzer keine Eskalation.' },
      { id: 'esc_immediate', label: 'Welche Fälle sollen wir sofort telefonisch melden?', type: 'multi',
        options: ESC_OPTIONS, required: true,
        preset: ESC_OPTIONS.slice(0, 6).join(', '),
        presetNote: 'Unser Standard — bitte anpassen' },
      { id: 'esc_immediate_other', label: 'Weitere Fälle', type: 'text' },
      { id: 'esc_nobody', label: 'Was, wenn niemand von Ihnen erreichbar ist?', type: 'radio',
        options: ['Notdienst bis zum Kulanzlimit beauftragen', 'Notdienst bis zu einem eigenen Limit beauftragen', 'Warten und dokumentieren', 'Zweite Notfallnummer anrufen'] },
      { id: 'esc_nobody_limit', label: 'Bis zu welchem Betrag?', type: 'money',
        dependsOn: { field: 'esc_nobody', equals: 'Notdienst bis zu einem eigenen Limit beauftragen' } },
      { id: 'esc_contact_us', label: 'Wer ist Ihr fester Ansprechpartner für uns — nicht für Gäste?', type: 'text' }
    ]
  },

  {
    id: 'vorort',
    title: 'Team und Partner vor Ort',
    intro: 'Unser GRO sitzt nicht im Haus. Alles, was Hände braucht, läuft über Ihre Leute.',
    fields: [
      { id: 'staff_onsite', label: 'Wer ist vor Ort? Rolle, Name, Telefon, Arbeitszeiten', type: 'textarea', required: true },
      { id: 'staff_in_elev8', label: 'Sind diese Personen bereits als Benutzer in Elev8 angelegt?', type: 'radio', options: ['Ja', 'Nein', 'Teilweise', 'Weiss ich nicht'],
        help: 'Auch hier zwingend: Aufträge und Informationen laufen ausschliesslich über Elev8.' },
      { id: 'lockout', label: 'Ausgesperrter Gast — was steht zur Verfügung?', type: 'multi',
        options: ['Ersatzschlüssel an der Rezeption', 'Schlüsselbox mit Notfallcode', 'Smart-Lock-Code aus der Ferne', 'Team vor Ort innerhalb von 30 Minuten', 'Team vor Ort innerhalb von 60 Minuten', 'Schlüsseldienst wird gerufen'] },
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
      { id: 'tone_form', label: 'Anrede', type: 'radio', options: ['Sie', 'Du', 'Je nach Kanal'], required: true },
      { id: 'tone_style', label: 'Tonalität', type: 'radio', options: ['Kurz und sachlich', 'Freundlich und ausführlich', 'Herzlich und persönlich'] },
      { id: 'nogos', label: 'Worüber soll unser GRO nie entscheiden oder sprechen?', type: 'multi',
        options: ['Preise und Rabatte', 'Rechtliche Fragen', 'Beschwerden über Personal', 'Bewertungen', 'Presseanfragen', 'Nachbarschaftskonflikte', 'Nichts davon'] },
      { id: 'templates', label: 'Haben Sie bestehende Textvorlagen, die wir übernehmen sollen?', type: 'radio',
        options: ['Ja, wir schicken sie', 'Teilweise', 'Nein, bitte erstellen Sie welche'] },
      { id: 'note_recording', type: 'note',
        label: 'Hinweis zu Telefonaten: Wir zeichnen alle Anrufe auf. Der Anrufer wird zu Beginn des Gesprächs darauf hingewiesen. Wer damit nicht einverstanden ist, kann uns über WhatsApp, E-Mail oder den Chat des Buchungsportals erreichen.' }
    ]
  },

  {
    id: 'geld',
    title: 'Zusatzleistungen und Zahlungen',
    fields: [
      { id: 'upsells', label: 'Welche Zusatzleistungen können Sie liefern?', type: 'multi',
        options: ['Frühstück', 'Late Check-out', 'Early Check-in', 'Parkplatz', 'Flughafentransfer', 'Haustier', 'Zusatzbett', 'Wäscheservice', 'Willkommenspaket'] },
      { id: 'upsells_note', label: 'Preise und Vorlaufzeit', type: 'text', placeholder: 'Transfer 65 EUR, 24 h vorher' },
      { id: 'payment', label: 'Wie wird kassiert?', type: 'multi',
        options: ['Vor Ort per Karte', 'Vor Ort bar', 'Über den Buchungskanal', 'Zahlungslink', 'Rechnung an die Firma', 'Vorkasse per Überweisung'] },
      { id: 'deposit', label: 'Kaution', type: 'radio',
        options: ['Keine Kaution', 'Kreditkarten-Vorautorisierung', 'Bar vor Ort', 'Zahlungslink', 'Über den Kanal'] },
      { id: 'deposit_amount', label: 'Höhe der Kaution', type: 'money',
        dependsOn: { field: 'deposit', equals: ['Kreditkarten-Vorautorisierung', 'Bar vor Ort', 'Zahlungslink', 'Über den Kanal'] } }
    ]
  },

  {
    id: 'recht',
    title: 'Recht, Meldewesen, Datenschutz',
    intro: 'Für Objekte in der EU brauchen wir das schriftlich, bevor wir den ersten Gast betreuen.',
    fields: [
      { id: 'note_meldeschein', type: 'note',
        label: 'Meldescheine gehören nicht zum Leistungsumfang des Guest Relations Officer. Sie werden entweder über die direkt angebundenen Schnittstellen in Elev8 erfasst oder von Ihnen selbst.' },
      { id: 'meldeschein', label: 'Wie werden Meldescheine für ausländische Gäste heute erfasst?', type: 'radio',
        options: ['Über die Schnittstelle in Elev8', 'Wir selbst vor Ort', 'Noch nicht geregelt'],
        help: 'Für deutsche Staatsangehörige ist die besondere Meldepflicht seit 1.1.2025 entfallen, für ausländische Gäste besteht sie weiter.' },
      { id: 'citytax', label: 'Beherbergungs- oder Kurtaxe', type: 'radio',
        options: ['Ja, im Zimmerpreis enthalten', 'Ja, wird vor Ort erhoben', 'Ja, über den Buchungskanal', 'Nein, fällt nicht an'] },
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
      { id: 'elev8_access', label: 'Wer legt die Elev8-Benutzer für unsere GROs an?', type: 'radio',
        options: ['Wir legen sie an', 'Bitte legt Elev8 sie an', 'Noch offen'] },
      { id: 'smartlock', label: 'Wie werden Türcodes erzeugt und an Gäste geschickt?', type: 'radio',
        options: ['Automatisch über Elev8', 'Manuell durch unser Team', 'Fester Code je Einheit', 'Schlüsselbox mit festem Code', 'Kein Code nötig'] },
      { id: 'whatsapp', label: 'Nutzen Sie WhatsApp Business?', type: 'radio',
        options: ['Ja, die Nummer gehört uns', 'Ja, soll über Elev8 laufen', 'Nein, nutzen wir nicht'] },
      { id: 'other_tools', label: 'Weitere Werkzeuge, die wir brauchen', type: 'text' }
    ]
  },

  {
    id: 'sonstiges',
    title: 'Zum Schluss',
    fields: [
      { id: 'priority', label: 'Was ist Ihnen am wichtigsten?', type: 'multi',
        options: ['Schnelle Antwortzeiten', 'Gleichbleibende Qualität', 'Bessere Bewertungen', 'Entlastung des eigenen Teams', 'Mehr Zusatzumsatz', 'Abdeckung in der Nacht'] },
      { id: 'concerns', label: 'Was bereitet Ihnen bei einer externen Gästebetreuung Sorgen?', type: 'multi',
        options: ['Verlust der persönlichen Note', 'Datenschutz', 'Sprachqualität', 'Kontrolle über Kulanz', 'Reaktionszeit', 'Keine Sorgen'] },
      { id: 'anything', label: 'Sonstiges, das wir wissen sollten', type: 'textarea' },
      { id: 'revenue_package', label: 'Haben Sie zusätzlich das Revenue-Management-Paket gebucht?', type: 'radio',
        options: ['Ja', 'Nein', 'Noch offen'], required: true,
        help: 'Zugänge zu den OTA-Extranets fragen wir hier bewusst nicht ab — die gehören zum Revenue Management.' },
      { id: 'note_revenue', type: 'note',
        label: 'Gut. Sobald diese Aufnahme abgeschlossen ist, schalten wir Ihnen die zweite, kurze Checkliste zum Revenue Management frei — Kanäle, Extranet-Zugänge und Preisstrategie.',
        dependsOn: { field: 'revenue_package', equals: 'Ja' } }
    ]
  }
];

/** Nur Felder, die der Tenant tatsächlich beantwortet (Hinweise zählen nicht). */
function isInput(f) { return f.type !== 'note'; }

const ALL_FIELDS = [];
const FIELD_MAP = new Map();
SECTIONS.forEach(function (sec) {
  sec.fields.forEach(function (f) {
    const rec = Object.assign({ section: sec.id, sectionTitle: sec.title }, f);
    ALL_FIELDS.push(rec);
    FIELD_MAP.set(f.id, rec);
  });
});
const INPUT_FIELDS = ALL_FIELDS.filter(isInput);

/** Vorschläge, die von uns kommen und nicht aus Elev8. */
function presets() {
  const out = {};
  ALL_FIELDS.forEach(function (f) {
    if (f.preset) out[f.id] = { value: f.preset, evidence: f.presetNote || 'Vorschlag von Elev8 — bitte prüfen' };
  });
  return out;
}

/** Elev8-Vorbelegung über die eigenen Vorschläge legen. */
function mergePrefill(fromElev8) {
  return Object.assign({}, presets(), fromElev8 || {});
}

module.exports = { SECTIONS, ALL_FIELDS, INPUT_FIELDS, FIELD_MAP, isInput, presets, mergePrefill };
