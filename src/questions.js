'use strict';

/**
 * Fragenkatalog für das Tenant-Intake, zweisprachig.
 *
 * Zwei Grundsätze:
 *  1. So wenig Freitext wie möglich — was in Chips passt, wird als Chip gefragt.
 *  2. Gespeichert wird immer der Code einer Option, nie der angezeigte Text.
 *     Sonst bricht jede Antwort, sobald jemand die Sprache wechselt.
 *
 * Feld-Eigenschaften über die Standardfelder hinaus:
 *   dependsOn { field, equals }  – Feld entfällt, solange die Bedingung nicht
 *                                  erfüllt ist. `equals` ist ein Code oder eine
 *                                  Liste von Codes.
 *   preset / presetNote          – Vorschlag von uns (nicht aus Elev8 Suite)
 *   type 'multi'                 – Mehrfachauswahl, gespeichert als Codeliste
 *   type 'note'                  – reiner Hinweis, keine Frage
 *   contract: true               – Bestandteil des Vertrags; nach der
 *                                  Unterschrift nur noch per Nachtrag änderbar
 */

const { t, L } = require('./i18n');

function o(code, de, en) { return { code: code, de: de, en: en }; }

const YESNO = [
  o('yes', 'Ja', 'Yes'),
  o('no', 'Nein', 'No'),
  o('ask', 'Nach Rücksprache', 'After checking with you')
];

const ESC_OPTIONS = [
  o('fire', 'Feuer oder Rauch', 'Fire or smoke'),
  o('water', 'Wasserschaden', 'Water damage'),
  o('injury', 'Verletzung oder medizinischer Notfall', 'Injury or medical emergency'),
  o('police', 'Polizei oder Einbruch', 'Police or break-in'),
  o('lockout', 'Ausgesperrter Gast', 'Locked-out guest'),
  o('heating', 'Heizung oder Strom ausgefallen', 'Heating or power failure'),
  o('hotwater', 'Kein warmes Wasser', 'No hot water'),
  o('press', 'Presse- oder Behördenanfrage', 'Press or authority enquiry')
];

const BREAKFAST_ON = ['included', 'paid'];
const PARK_OWN = ['onsite', 'nearby'];
const PARK_ANY = PARK_OWN.concat(['public']);

const SECTIONS = [
  {
    id: 'kontakt',
    title: L('Ihr Betrieb', 'Your operation'),
    intro: L('Damit wir wissen, mit wem wir arbeiten und worüber Ihre Gäste buchen.',
      'So we know who we work with and where your guests book.'),
    fields: [
      { id: 'company', type: 'text', required: true, contract: true,
        label: L('Firmenname des Betreibers', 'Legal name of the operator') },
      { id: 'brand', type: 'text',
        label: L('Name, unter dem Ihre Gäste Sie kennen', 'Name your guests know you by'),
        help: L('Unter diesem Namen treten wir gegenüber Gästen auf.', 'We will use this name when speaking to guests.') },
      { id: 'address', type: 'textarea', required: true, contract: true,
        label: L('Adresse des Objekts', 'Property address') },
      { id: 'units', type: 'number', contract: true,
        label: L('Anzahl Zimmer bzw. Einheiten', 'Number of rooms or units') },
      { id: 'channels', type: 'textarea',
        label: L('Über welche Kanäle buchen Ihre Gäste?', 'Which channels do your guests book through?'),
        placeholder: L('z. B. Booking.com 70 %, Direktbuchungen 20 %, Telefon 10 %',
          'e.g. Booking.com 70%, direct 20%, phone 10%') },
      { id: 'contact_main', type: 'text', required: true, contract: true,
        label: L('Hauptansprechpartner (Name und Rolle)', 'Main contact (name and role)') },
      { id: 'contact_phone', type: 'tel', required: true,
        label: L('Telefonnummer', 'Phone number') },
      { id: 'contact_email', type: 'email', required: true, contract: true,
        label: L('E-Mail-Adresse', 'Email address') },
      { id: 'start_date', type: 'radio', required: true, contract: true,
        label: L('Ab wann sollen wir übernehmen?', 'When should we take over?'),
        options: [
          o('asap', 'So bald wie möglich', 'As soon as possible'),
          o('two_weeks', 'Innerhalb von zwei Wochen', 'Within two weeks'),
          o('next_month', 'Ab nächstem Monatsersten', 'From the first of next month'),
          o('fixed', 'Zu einem festen Datum', 'On a fixed date')
        ] },
      { id: 'start_date_when', type: 'text', contract: true,
        label: L('Welches Datum?', 'Which date?'), placeholder: L('01.11.2026', '01/11/2026'),
        dependsOn: { field: 'start_date', equals: 'fixed' } }
    ]
  },

  {
    id: 'betrieb',
    module: 'gro',
    title: L('Betrieb und Anreise', 'Operations and arrival'),
    intro: L('Was ein Gast erlebt, wenn er ankommt — und was wir ihm sagen können, wenn etwas nicht wie geplant läuft.',
      'What a guest experiences on arrival — and what we can tell them when something goes wrong.'),
    fields: [
      { id: 'reception', type: 'radio', required: true,
        label: L('Gibt es bei Ihnen eine Rezeption?', 'Do you have a reception desk?'),
        help: L('Bei „Nein" überspringen wir alles, was eine Rezeption voraussetzt.',
          'If "No", we skip everything that assumes a reception desk.'),
        options: [o('yes', 'Ja', 'Yes'), o('no', 'Nein', 'No')] },
      { id: 'reception_hours', type: 'radio',
        label: L('Rezeptionszeiten', 'Reception hours'),
        options: [
          o('h24', '24/7', '24/7'),
          o('h07_22', '07:00–22:00', '07:00–22:00'),
          o('h08_20', '08:00–20:00', '08:00–20:00'),
          o('other', 'Andere Zeiten', 'Other hours')
        ],
        dependsOn: { field: 'reception', equals: 'yes' } },
      { id: 'reception_hours_custom', type: 'text',
        label: L('Welche Zeiten genau?', 'Which hours exactly?'),
        placeholder: L('Mo–Fr 07:00–21:00, Sa/So 08:00–20:00', 'Mon–Fri 07:00–21:00, Sat/Sun 08:00–20:00'),
        dependsOn: { field: 'reception_hours', equals: 'other' } },
      { id: 'after_hours', type: 'radio',
        label: L('Was passiert bei Anreise nach Rezeptionsschluss?', 'What happens when a guest arrives after reception closes?'),
        options: [
          o('selfcheckin', 'Self-Check-in mit Code oder Schlüsselbox', 'Self check-in with a code or key box'),
          o('night_porter', 'Nachtportier vor Ort', 'Night porter on site'),
          o('emergency_line', 'Gast ruft eine Notfallnummer an', 'Guest calls an emergency number'),
          o('not_possible', 'Anreise nach Schluss nicht möglich', 'Arrival after closing is not possible'),
          o('other', 'Anders', 'Other')
        ],
        dependsOn: { field: 'reception_hours', equals: ['h07_22', 'h08_20', 'other'] } },
      { id: 'after_hours_custom', type: 'text', label: L('Wie genau?', 'How exactly?'),
        dependsOn: { field: 'after_hours', equals: 'other' } },
      { id: 'selfcheckin', type: 'radio', label: L('Gibt es Self-Check-in?', 'Is there self check-in?'),
        options: [o('yes', 'Ja', 'Yes'), o('no', 'Nein', 'No'), o('partly', 'Teilweise', 'Partly')] },
      { id: 'access', type: 'radio', required: true,
        label: L('Wie kommt der Gast in Haus und Zimmer?', 'How does a guest get into the building and the room?'),
        options: [
          o('smart_lock', 'Smart Lock mit Code', 'Smart lock with a code'),
          o('keybox', 'Schlüsselbox', 'Key box'),
          o('in_person', 'Persönliche Übergabe', 'Handover in person'),
          o('partner', 'Schlüssel bei Partner oder Nachbar', 'Key with a partner or neighbour'),
          o('mixed', 'Unterschiedlich je Einheit', 'Varies by unit')
        ] },
      { id: 'access_note', type: 'textarea',
        label: L('Ablauf in Stichworten, falls nötig', 'The procedure in short, if needed') },
      { id: 'checkin_time', type: 'text', label: L('Check-in ab', 'Check-in from'), placeholder: L('15:00', '15:00') },
      { id: 'checkout_time', type: 'text', label: L('Check-out bis', 'Check-out until'), placeholder: L('11:00', '11:00') },

      { id: 'breakfast', type: 'radio', required: true,
        label: L('Bieten Sie Frühstück an?', 'Do you serve breakfast?'),
        options: [
          o('included', 'Ja, im Preis inbegriffen', 'Yes, included in the rate'),
          o('paid', 'Optional gegen Aufpreis', 'Optional, for an extra charge'),
          o('none', 'Nein', 'No')
        ] },
      { id: 'breakfast_hours', type: 'text', label: L('Frühstückszeiten', 'Breakfast hours'),
        placeholder: L('07:00–10:00, Sa/So bis 11:00', '07:00–10:00, Sat/Sun until 11:00'),
        dependsOn: { field: 'breakfast', equals: BREAKFAST_ON } },
      { id: 'breakfast_where', type: 'text', label: L('Wo wird serviert?', 'Where is it served?'),
        placeholder: L('Frühstücksraum im Erdgeschoss', 'Breakfast room on the ground floor'),
        dependsOn: { field: 'breakfast', equals: BREAKFAST_ON } },
      { id: 'breakfast_price', type: 'money', label: L('Preis pro Person und Tag', 'Price per person per day'),
        dependsOn: { field: 'breakfast', equals: 'paid' } },
      { id: 'breakfast_seen', type: 'radio', required: true,
        label: L('Woran sehen wir, ob ein Gast Frühstück gebucht hat?',
          'How do we see whether a guest has booked breakfast?'),
        help: L('Ohne diese Information können wir Gästen keine verbindliche Auskunft geben.',
          'Without this we cannot give guests a reliable answer.'),
        options: [
          o('elev8_upsell', 'Als Upsell in Elev8 Suite', 'As an upsell in Elev8 Suite'),
          o('channel_booking', 'In der Buchung vom Kanal', 'In the booking from the channel'),
          o('team_list', 'Liste beim Team vor Ort', 'A list held by the on-site team'),
          o('guest_onsite', 'Gast meldet sich direkt vor Ort', 'The guest asks on site'),
          o('unclear', 'Noch nicht geregelt', 'Not yet decided')
        ],
        dependsOn: { field: 'breakfast', equals: 'paid' } },
      { id: 'breakfast_deadline', type: 'radio',
        label: L('Bis wann kann nachgebucht werden?', 'Until when can it be added?'),
        options: [
          o('prev_evening', 'Bis zum Vorabend', 'Until the evening before'),
          o('prev_2200', 'Bis 22:00 am Vortag', 'Until 22:00 the day before'),
          o('morning', 'Auch noch am Morgen', 'Even on the morning itself'),
          o('at_booking', 'Nur bei der Buchung', 'Only when booking')
        ],
        dependsOn: { field: 'breakfast', equals: 'paid' } },

      { id: 'parking', type: 'radio', required: true,
        label: L('Gibt es Parkmöglichkeiten?', 'Is there parking?'),
        options: [
          o('onsite', 'Ja, eigene Plätze am Haus', 'Yes, our own spaces at the property'),
          o('nearby', 'Ja, Partnergarage oder Parkplatz in der Nähe', 'Yes, a partner garage or car park nearby'),
          o('public', 'Nur öffentliche Parkplätze', 'Public parking only'),
          o('none', 'Nein', 'No')
        ] },
      { id: 'parking_cost', type: 'radio', label: L('Kostenpflichtig?', 'Chargeable?'),
        options: [o('free', 'Kostenlos', 'Free'), o('paid', 'Kostenpflichtig', 'Chargeable')],
        dependsOn: { field: 'parking', equals: PARK_OWN } },
      { id: 'parking_price', type: 'money', label: L('Preis pro Nacht', 'Price per night'),
        dependsOn: { field: 'parking_cost', equals: 'paid' } },
      { id: 'parking_reserve', type: 'radio', label: L('Reservierbar?', 'Can it be reserved?'),
        options: [
          o('reservable', 'Ja, im Voraus reservierbar', 'Yes, can be reserved in advance'),
          o('availability', 'Nein, nach Verfügbarkeit', 'No, subject to availability'),
          o('assigned', 'Jeder Einheit fest zugeteilt', 'Permanently assigned to each unit')
        ],
        dependsOn: { field: 'parking', equals: PARK_OWN } },
      { id: 'parking_spots', type: 'number', label: L('Anzahl Plätze', 'Number of spaces'),
        dependsOn: { field: 'parking', equals: PARK_OWN } },
      { id: 'parking_note', type: 'text', label: L('Was muss der Gast wissen?', 'What does the guest need to know?'),
        placeholder: L('Zufahrt, Einfahrtshöhe, Adresse der Garage', 'Access, height limit, garage address'),
        dependsOn: { field: 'parking', equals: PARK_ANY } },

      { id: 'wifi', type: 'text', label: L('WLAN-Name (SSID)', 'Wi-Fi name (SSID)') },
      { id: 'wifi_pass', type: 'text', required: true, label: L('WLAN-Passwort', 'Wi-Fi password'),
        help: L('Bitte prüfen Sie, ob es noch stimmt — das ist die häufigste Gastfrage.',
          'Please check it is still correct — this is the most common guest question.') },
      { id: 'quirks', type: 'textarea',
        label: L('Was fragen Ihre Gäste am häufigsten?', 'What do your guests ask most often?'),
        help: L('Die drei bis fünf häufigsten Fragen sparen uns Wochen Einarbeitung.',
          'The three to five most common questions save us weeks of ramp-up.') }
    ]
  },

  {
    id: 'auftrag',
    module: 'gro',
    title: L('Was wir übernehmen sollen', 'What we should take on'),
    intro: L('Ihr gebuchter Umfang steht oben. Hier geht es um die Sprachen und darum, wann bei Ihnen viel los ist — danach richten wir unsere Schichtplanung aus.',
      'Your booked scope is shown above. Here it is about languages and about when you are busy — we plan our shifts around this.'),
    fields: [
      { id: 'languages', type: 'multi', required: true, contract: true,
        label: L('In welchen Sprachen sollen wir antworten?', 'In which languages should we reply?'),
        help: L('Mehrfachauswahl. Andere Sprachen können wir derzeit nicht zusagen.',
          'Multiple choice. We cannot commit to other languages at this time.'),
        options: [o('de', 'Deutsch', 'German'), o('en', 'Englisch', 'English')] },
      { id: 'volume', type: 'radio',
        label: L('Ungefähres Nachrichtenaufkommen pro Tag', 'Approximate messages per day'),
        options: [
          o('lt20', 'unter 20', 'under 20'),
          o('20_50', '20 bis 50', '20 to 50'),
          o('50_100', '50 bis 100', '50 to 100'),
          o('gt100', 'über 100', 'over 100'),
          o('unknown', 'Weiss ich nicht', 'I do not know')
        ] },
      { id: 'peaks', type: 'multi', label: L('Wann ist bei Ihnen Hochbetrieb?', 'When are your peak times?'),
        options: [
          o('summer', 'Sommerferien', 'Summer holidays'),
          o('christmas', 'Weihnachten und Neujahr', 'Christmas and New Year'),
          o('fairs', 'Messen', 'Trade fairs'),
          o('weekends', 'Wochenenden', 'Weekends'),
          o('business', 'Firmenreisen Mo–Do', 'Business travel Mon–Thu'),
          o('even', 'Ganzjährig gleichmässig', 'Evenly all year')
        ] },
      { id: 'peaks_note', type: 'text',
        label: L('Konkrete Termine, die wir kennen sollten', 'Specific dates we should know about'),
        placeholder: L('Messe Stuttgart, 12.–15. März', 'Stuttgart trade fair, 12–15 March') }
    ]
  },

  {
    id: 'revenue',
    module: 'rm',
    title: L('Revenue Management', 'Revenue management'),
    intro: L('Das meiste steht schon in Elev8 Suite — Sie prüfen vor allem den Preiskorridor und legen die Grenzen fest, innerhalb derer wir ohne Rückfrage arbeiten.',
      'Most of it is already in Elev8 Suite — mainly you check the price corridor and set the limits within which we work without asking.'),
    fields: [
      { id: 'rm_goal', type: 'radio', required: true, contract: true,
        label: L('Worauf sollen wir optimieren?', 'What should we optimise for?'),
        help: L('Beides zugleich geht nicht — wer den Preis hochhält, verkauft weniger Nächte.',
          'You cannot have both — holding the rate high sells fewer nights.'),
        options: [
          o('adr', 'Höherer Durchschnittspreis, auch bei weniger Nächten', 'Higher average rate, even at fewer nights'),
          o('occupancy', 'Höhere Auslastung, auch zu tieferen Preisen', 'Higher occupancy, even at lower rates'),
          o('balanced', 'Ausgewogen auf den Umsatz je verfügbare Einheit', 'Balanced towards revenue per available unit')
        ] },
      { id: 'rm_target_occupancy', type: 'radio',
        label: L('Zielauslastung im Jahresmittel', 'Target occupancy on annual average'),
        options: [
          o('lt60', 'unter 60 %', 'under 60%'),
          o('60_70', '60 bis 70 %', '60 to 70%'),
          o('70_80', '70 bis 80 %', '70 to 80%'),
          o('gt80', 'über 80 %', 'over 80%'),
          o('none', 'Kein festes Ziel', 'No fixed target')
        ] },
      { id: 'rm_breakeven', type: 'money',
        label: L('Kostenschwelle je Einheit und Nacht', 'Cost threshold per unit and night'),
        help: L('Unter diesem Betrag lohnt sich eine Nacht für Sie nicht. Freiwillig, hilft uns beim Vorschlag für den Mindestpreis.',
          'Below this amount a night is not worth it for you. Optional, helps us propose the minimum price.') },

      { id: 'rm_corridor', type: 'matrix', required: true, contract: true,
        label: L('Preiskorridor je Einheit', 'Price corridor per unit'),
        help: L('Wir haben aus Ihrer Historie und dem Markt einen Vorschlag gerechnet. Innerhalb dieses Korridors setzen wir die Preise ohne Rückfrage; den Korridor selbst verschieben wir nie ohne Ihre Freigabe.',
          'We have calculated a proposal from your history and the market. Within this corridor we set prices without asking; we never move the corridor itself without your approval.'),
        columns: [
          { key: 'min', label: L('Minimum', 'Minimum') },
          { key: 'base', label: L('Basispreis', 'Base price') },
          { key: 'max', label: L('Maximum', 'Maximum') }
        ] },
      { id: 'rm_minstay', type: 'radio', contract: true,
        label: L('In welcher Spanne dürfen wir den Mindestaufenthalt setzen?',
          'Within which range may we set the minimum stay?'),
        options: [
          o('1_3', '1 bis 3 Nächte', '1 to 3 nights'),
          o('1_5', '1 bis 5 Nächte', '1 to 5 nights'),
          o('1_7', '1 bis 7 Nächte', '1 to 7 nights'),
          o('2_7', '2 bis 7 Nächte', '2 to 7 nights')
        ] },
      { id: 'rm_discount_max', type: 'radio', contract: true,
        label: L('Maximaler Rabatt auf den Basispreis', 'Maximum discount on the base price'),
        options: [
          o('p10', 'bis 10 %', 'up to 10%'),
          o('p15', 'bis 15 %', 'up to 15%'),
          o('p20', 'bis 20 %', 'up to 20%'),
          o('p25', 'bis 25 %', 'up to 25%')
        ] },
      { id: 'rm_lastminute', type: 'radio', contract: true,
        label: L('Last-Minute-Rabatte', 'Last-minute discounts'),
        options: [
          o('d7', 'Ab 7 Tagen vor Anreise', 'From 7 days before arrival'),
          o('d3', 'Ab 3 Tagen vor Anreise', 'From 3 days before arrival'),
          o('none', 'Keine Last-Minute-Rabatte', 'No last-minute discounts')
        ] },
      { id: 'rm_earlybird', type: 'radio', contract: true,
        label: L('Frühbucherrabatte', 'Early-bird discounts'),
        options: [
          o('d90', 'Ab 90 Tagen vor Anreise', 'From 90 days before arrival'),
          o('d180', 'Ab 180 Tagen vor Anreise', 'From 180 days before arrival'),
          o('none', 'Keine Frühbucherrabatte', 'No early-bird discounts')
        ] },

      { id: 'rm_history', type: 'radio',
        label: L('Können Sie uns zwölf Monate Historie liefern?', 'Can you provide twelve months of history?'),
        help: L('Durchschnittspreis, Auslastung und Umsatz je Einheit und Monat. Ohne Historie messen wir gegen den Markt statt gegen Ihr Vorjahr.',
          'Average rate, occupancy and revenue per unit and month. Without history we measure against the market instead of your previous year.'),
        options: [
          o('yes', 'Ja, wir liefern sie', 'Yes, we will provide it'),
          o('partly', 'Nur teilweise', 'Only partly'),
          o('no', 'Nein, haben wir nicht', 'No, we do not have it')
        ] },
      { id: 'rm_channels_wanted', type: 'multi',
        label: L('Welche Kanäle sollen wir zusätzlich öffnen?', 'Which channels should we additionally open?'),
        help: L('Die Verträge mit den Portalen schliessen Sie selbst; wir richten ein und pflegen.',
          'You conclude the contracts with the portals yourself; we set them up and maintain them.'),
        options: [
          o('booking', 'Booking.com', 'Booking.com'),
          o('airbnb', 'Airbnb', 'Airbnb'),
          o('expedia', 'Expedia', 'Expedia'),
          o('vrbo', 'Vrbo', 'Vrbo'),
          o('google', 'Google Vacation Rentals', 'Google Vacation Rentals'),
          o('direct', 'Direktbuchung über die eigene Website', 'Direct booking via your own website'),
          o('none', 'Keine weiteren', 'None further')
        ] },
      { id: 'rm_parity', type: 'radio', contract: true,
        label: L('Wie halten wir es mit der Preisparität?', 'How do we handle rate parity?'),
        options: [
          o('strict', 'Überall derselbe Preis', 'The same price everywhere'),
          o('direct_cheaper', 'Direktbuchung darf günstiger sein', 'Direct booking may be cheaper'),
          o('free', 'Keine Vorgabe', 'No requirement')
        ] },

      { id: 'note_rm_phase2', type: 'note',
        label: L('Die folgenden drei Fragen betreffen Titel, Beschreibungen und Bilder auf den Buchungsportalen. Diese Leistung aktivieren wir, sobald die Content-Schnittstelle zu den Portalen verfügbar ist — ohne Preisänderung und ohne Nachtrag.',
          'The next three questions concern titles, descriptions and images on the booking portals. We activate this service as soon as the content interface to the portals is available — at no change in price and without an addendum.') },
      { id: 'rm_photos', type: 'radio',
        label: L('Wie steht es um Ihr Bildmaterial?', 'What about your photography?'),
        options: [
          o('professional', 'Professionelle Fotos vorhanden', 'Professional photos available'),
          o('mixed', 'Gemischt, einige Einheiten brauchen neue', 'Mixed, some units need new ones'),
          o('needed', 'Neue Fotos werden gebraucht', 'New photos are needed')
        ] },
      { id: 'rm_content_langs', type: 'multi',
        label: L('In welchen Sprachen sollen Titel und Beschreibungen laufen?',
          'In which languages should titles and descriptions run?'),
        options: [o('de', 'Deutsch', 'German'), o('en', 'Englisch', 'English')] },
      { id: 'rm_content_approval', type: 'radio', contract: true,
        label: L('Wer gibt Texte und Bilder frei?', 'Who approves texts and images?'),
        options: [
          o('client', 'Wir geben jede Änderung frei', 'We approve every change'),
          o('elev8', 'Sie dürfen selbst entscheiden', 'You may decide yourselves')
        ] },

      { id: 'rm_report_rhythm', type: 'radio', contract: true,
        label: L('Wie oft wünschen Sie den Bericht?', 'How often would you like the report?'),
        options: [
          o('monthly', 'Monatlich', 'Monthly'),
          o('biweekly', 'Alle zwei Wochen', 'Every two weeks')
        ] },
      { id: 'rm_report_to', type: 'text', contract: true,
        label: L('An wen geht der Bericht?', 'Who receives the report?'),
        placeholder: L('Name und E-Mail-Adresse', 'Name and email address') }
    ]
  },

  {
    id: 'mandat',
    module: 'gro',
    title: L('Was unser GRO entscheiden darf', 'What our GRO may decide'),
    intro: L('Der wichtigste Teil. Ohne klare Grenzen muss unser Team bei jeder Kleinigkeit nachfragen — und Ihre Gäste warten.',
      'The most important part. Without clear limits our team has to ask about every detail — and your guests wait.'),
    fields: [
      { id: 'goodwill_limit', type: 'money', required: true, contract: true,
        label: L('Kulanz und Erstattung bis zu welchem Betrag ohne Rückfrage?',
          'Goodwill and refunds up to what amount without asking?') },
      { id: 'goodwill_month', type: 'money', contract: true,
        label: L('Obergrenze pro Monat', 'Cap per month') },
      { id: 'late_checkout', type: 'radio', contract: true, options: YESNO,
        label: L('Late Check-out gratis gewähren?', 'Grant late check-out free of charge?') },
      { id: 'late_checkout_until', type: 'radio', contract: true,
        label: L('Bis zu welcher Uhrzeit?', 'Until what time?'),
        options: [o('t1200', '12:00', '12:00'), o('t1300', '13:00', '13:00'),
          o('t1400', '14:00', '14:00'), o('availability', 'Nach Verfügbarkeit', 'Subject to availability')],
        dependsOn: { field: 'late_checkout', equals: ['yes', 'ask'] } },
      { id: 'early_checkin', type: 'radio', contract: true, options: YESNO,
        label: L('Early Check-in gratis gewähren?', 'Grant early check-in free of charge?') },
      { id: 'early_checkin_from', type: 'radio', contract: true,
        label: L('Ab welcher Uhrzeit?', 'From what time?'),
        options: [o('f1200', 'ab 12:00', 'from 12:00'), o('f1300', 'ab 13:00', 'from 13:00'),
          o('f1400', 'ab 14:00', 'from 14:00'), o('availability', 'Nach Verfügbarkeit', 'Subject to availability')],
        dependsOn: { field: 'early_checkin', equals: ['yes', 'ask'] } },
      { id: 'cancel_rebook', type: 'radio', contract: true, options: YESNO,
        label: L('Darf der GRO stornieren, umbuchen oder upgraden?',
          'May the GRO cancel, rebook or upgrade?') },
      { id: 'cancel_rules', type: 'multi', contract: true, label: L('In welchen Fällen?', 'In which cases?'),
        options: [
          o('overbooking', 'Bei Überbuchung', 'In case of overbooking'),
          o('defect', 'Bei defektem Zimmer', 'If a room is defective'),
          o('guest_request', 'Auf Gastwunsch innerhalb der Stornofrist', 'At guest request within the cancellation window'),
          o('double_booking', 'Bei Doppelbuchung über den Kanal', 'On a double booking via the channel')
        ],
        dependsOn: { field: 'cancel_rebook', equals: ['yes', 'ask'] } },
      { id: 'overbooking', type: 'radio', contract: true,
        label: L('Bei Überbuchung: wie gehen wir vor?', 'On overbooking: how do we proceed?'),
        options: [
          o('equal_we_pay', 'Gleichwertiges Haus in der Nähe, Differenz zu Ihren Lasten',
            'Equivalent property nearby, you cover the difference'),
          o('equal_guest_pays', 'Gleichwertiges Haus, Differenz trägt der Gast',
            'Equivalent property, the guest covers the difference'),
          o('always_ask', 'Immer zuerst Rücksprache mit Ihnen', 'Always check with you first'),
          o('na', 'Kommt bei uns nicht vor', 'Does not happen with us')
        ] },
      { id: 'noshow', type: 'radio', contract: true,
        label: L('No-Show: wann wird die Karte belastet?', 'No-show: when is the card charged?'),
        options: [
          o('after_midnight', 'Nach 24:00 des Anreisetags', 'After midnight on the arrival day'),
          o('after_2h', 'Nach zwei Stunden ohne Kontakt', 'After two hours without contact'),
          o('ask', 'Nur nach Rücksprache', 'Only after checking with you'),
          o('channel', 'Der Kanal regelt das', 'The channel handles it')
        ] },
      { id: 'damage_limit', type: 'money', contract: true,
        label: L('Schäden: ab welchem Betrag eskalieren wir an Sie?',
          'Damage: from what amount do we escalate to you?') },
      { id: 'damage_rules', type: 'multi', contract: true,
        label: L('Wie gehen wir mit Schäden um?', 'How do we handle damage?'),
        options: [
          o('hold_deposit', 'Kaution einbehalten', 'Retain the deposit'),
          o('photo_report', 'Foto dokumentieren und an Sie melden', 'Document with photos and report to you'),
          o('charge_guest', 'Gast direkt belasten', 'Charge the guest directly'),
          o('report_channel', 'Über den Kanal melden', 'Report via the channel')
        ] },
      { id: 'discount', type: 'radio', contract: true,
        label: L('Rabatt bei Verlängerung oder Direktanfrage', 'Discount on extensions or direct enquiries'),
        options: [
          o('none', 'Kein Rabatt', 'No discount'),
          o('p5', 'Bis 5 %', 'Up to 5%'),
          o('p10', 'Bis 10 %', 'Up to 10%'),
          o('p15', 'Bis 15 %', 'Up to 15%'),
          o('ask', 'Nur nach Rücksprache', 'Only after checking with you')
        ] },
      { id: 'mandate_signer', type: 'text', required: true, contract: true,
        label: L('Wer unterzeichnet die Vollmacht dafür?', 'Who signs the authorisation for this?') }
    ]
  },

  {
    id: 'eskalation',
    module: 'gro',
    title: L('Eskalation und Erreichbarkeit', 'Escalation and availability'),
    intro: L('Wen rufen wir an, wenn es brennt — wörtlich und im übertragenen Sinn.',
      'Who do we call when there is a fire — literally and figuratively.'),
    fields: [
      { id: 'note_elev8_users', type: 'note',
        label: L('Alle Personen, die informiert oder eskaliert werden sollen, müssen in Elev8 Suite als Benutzer angelegt sein. Nur dann erreicht unser GRO sie über das System und der Vorgang bleibt nachvollziehbar. Bitte legen Sie fehlende Personen vor dem Start an.',
          'Everyone who should be informed or escalated to must exist as a user in Elev8 Suite. Only then can our GRO reach them through the system and the case stays traceable. Please create any missing people before we start.') },
      { id: 'esc1', type: 'textarea', required: true, contract: true,
        label: L('Stufe 1: Name, Telefon, erreichbar wann', 'Level 1: name, phone, when reachable') },
      { id: 'esc2', type: 'textarea', contract: true,
        label: L('Stufe 2: Name, Telefon, erreichbar wann', 'Level 2: name, phone, when reachable') },
      { id: 'esc3', type: 'textarea', contract: true,
        label: L('Stufe 3: Name, Telefon, erreichbar wann', 'Level 3: name, phone, when reachable') },
      { id: 'esc_in_elev8', type: 'radio', required: true,
        label: L('Sind diese Personen bereits als Benutzer in Elev8 Suite angelegt?',
          'Do these people already exist as users in Elev8 Suite?'),
        help: L('Zwingende Voraussetzung — ohne Elev8-Suite-Benutzer keine Eskalation.',
          'A hard requirement — no Elev8 Suite user, no escalation.'),
        options: [o('all', 'Ja, alle', 'Yes, all of them'), o('partly', 'Teilweise', 'Some of them'),
          o('none', 'Nein, noch nicht', 'No, not yet')] },
      { id: 'esc_immediate', type: 'multi', required: true, contract: true,
        label: L('Welche Fälle sollen wir sofort telefonisch melden?',
          'Which cases should we report to you by phone immediately?'),
        options: ESC_OPTIONS,
        preset: ESC_OPTIONS.slice(0, 6).map(function (x) { return x.code; }).join(', '),
        presetNote: L('Unser Standard — bitte anpassen', 'Our default — please adjust') },
      { id: 'esc_immediate_other', type: 'text', contract: true,
        label: L('Weitere Fälle', 'Further cases') },
      { id: 'esc_nobody', type: 'radio', contract: true,
        label: L('Was, wenn niemand von Ihnen erreichbar ist?', 'What if nobody on your side can be reached?'),
        options: [
          o('up_to_goodwill', 'Notdienst bis zum Kulanzlimit beauftragen', 'Call out a contractor up to the goodwill limit'),
          o('own_limit', 'Notdienst bis zu einem eigenen Limit beauftragen', 'Call out a contractor up to a separate limit'),
          o('wait', 'Warten und dokumentieren', 'Wait and document'),
          o('second_number', 'Zweite Notfallnummer anrufen', 'Call a second emergency number')
        ] },
      { id: 'esc_nobody_limit', type: 'money', contract: true,
        label: L('Bis zu welchem Betrag?', 'Up to what amount?'),
        dependsOn: { field: 'esc_nobody', equals: 'own_limit' } },
      { id: 'esc_contact_us', type: 'text',
        label: L('Wer ist Ihr fester Ansprechpartner für uns — nicht für Gäste?',
          'Who is your permanent contact for us — not for guests?') }
    ]
  },

  {
    id: 'vorort',
    module: 'gro',
    title: L('Team und Partner vor Ort', 'On-site team and partners'),
    intro: L('Unser GRO sitzt nicht im Haus. Alles, was Hände braucht, läuft über Ihre Leute.',
      'Our GRO is not in the building. Anything that needs hands goes through your people.'),
    fields: [
      { id: 'staff_onsite', type: 'textarea', required: true,
        label: L('Wer ist vor Ort? Rolle, Name, Telefon, Arbeitszeiten',
          'Who is on site? Role, name, phone, working hours') },
      { id: 'staff_in_elev8', type: 'radio',
        label: L('Sind diese Personen bereits als Benutzer in Elev8 Suite angelegt?',
          'Do these people already exist as users in Elev8 Suite?'),
        help: L('Auch hier zwingend: Aufträge und Informationen laufen ausschliesslich über Elev8 Suite.',
          'Also mandatory here: tasks and information run exclusively through Elev8 Suite.'),
        options: [o('yes', 'Ja', 'Yes'), o('no', 'Nein', 'No'), o('partly', 'Teilweise', 'Partly'),
          o('unknown', 'Weiss ich nicht', 'I do not know')] },
      { id: 'lockout', type: 'multi',
        label: L('Ausgesperrter Gast — was steht zur Verfügung?',
          'Locked-out guest — what is available?'),
        options: [
          o('spare_reception', 'Ersatzschlüssel an der Rezeption', 'Spare key at reception'),
          o('keybox_emergency', 'Schlüsselbox mit Notfallcode', 'Key box with an emergency code'),
          o('remote_code', 'Smart-Lock-Code aus der Ferne', 'Smart lock code issued remotely'),
          o('team_30', 'Team vor Ort innerhalb von 30 Minuten', 'On-site team within 30 minutes'),
          o('team_60', 'Team vor Ort innerhalb von 60 Minuten', 'On-site team within 60 minutes'),
          o('locksmith', 'Schlüsseldienst wird gerufen', 'A locksmith is called')
        ] },
      { id: 'trades', type: 'textarea',
        label: L('Notdienste: Sanitär, Elektro, Schlüsseldienst — mit Kontakt',
          'Emergency trades: plumbing, electrical, locksmith — with contacts') },
      { id: 'emergency', type: 'textarea',
        label: L('Arzt und Klinik in der Nähe, Polizei, Ihre Versicherung',
          'Nearby doctor and hospital, police, your insurer') }
    ]
  },

  {
    id: 'auftritt',
    module: 'gro',
    title: L('Auftreten gegenüber Gästen', 'How we appear to guests'),
    intro: L('Der Gast soll Ihr Haus sehen, nicht uns.', 'The guest should see your property, not us.'),
    fields: [
      { id: 'signature', type: 'text', required: true, contract: true,
        label: L('Unter welchem Namen und welcher Signatur sollen wir schreiben?',
          'Under which name and signature should we write?') },
      { id: 'tone_form', type: 'radio', required: true, contract: true,
        label: L('Anrede', 'Form of address'),
        options: [o('formal', 'Sie', 'Formal'), o('informal', 'Du', 'Informal'),
          o('by_channel', 'Je nach Kanal', 'Depends on the channel')] },
      { id: 'tone_style', type: 'radio', label: L('Tonalität', 'Tone'),
        options: [
          o('short', 'Kurz und sachlich', 'Short and factual'),
          o('friendly', 'Freundlich und ausführlich', 'Friendly and detailed'),
          o('warm', 'Herzlich und persönlich', 'Warm and personal')
        ] },
      { id: 'nogos', type: 'multi', contract: true,
        label: L('Worüber soll unser GRO nie entscheiden oder sprechen?',
          'What should our GRO never decide or discuss?'),
        options: [
          o('prices', 'Preise und Rabatte', 'Prices and discounts'),
          o('legal', 'Rechtliche Fragen', 'Legal matters'),
          o('staff', 'Beschwerden über Personal', 'Complaints about staff'),
          o('reviews', 'Bewertungen', 'Reviews'),
          o('press', 'Presseanfragen', 'Press enquiries'),
          o('neighbours', 'Nachbarschaftskonflikte', 'Neighbour disputes'),
          o('none', 'Nichts davon', 'None of these')
        ] },
      { id: 'templates', type: 'radio',
        label: L('Haben Sie bestehende Textvorlagen, die wir übernehmen sollen?',
          'Do you have existing message templates we should use?'),
        options: [
          o('yes', 'Ja, wir schicken sie', 'Yes, we will send them'),
          o('partly', 'Teilweise', 'Some'),
          o('no', 'Nein, bitte erstellen Sie welche', 'No, please write some')
        ] },
      { id: 'note_recording', type: 'note',
        label: L('Hinweis zu Telefonaten: Wir zeichnen alle Anrufe auf. Der Anrufer wird zu Beginn des Gesprächs darauf hingewiesen. Wer damit nicht einverstanden ist, kann uns über WhatsApp, E-Mail oder den Chat des Buchungsportals erreichen.',
          'Note on phone calls: we record all calls. Callers are informed at the start of the call. Anyone who does not agree can reach us via WhatsApp, email or the booking portal chat.') }
    ]
  },

  {
    id: 'geld',
    module: 'gro',
    title: L('Zusatzleistungen und Zahlungen', 'Extras and payments'),
    fields: [
      { id: 'upsells', type: 'multi',
        label: L('Welche Zusatzleistungen können Sie liefern?', 'Which extras can you provide?'),
        options: [
          o('breakfast', 'Frühstück', 'Breakfast'),
          o('late_checkout', 'Late Check-out', 'Late check-out'),
          o('early_checkin', 'Early Check-in', 'Early check-in'),
          o('parking', 'Parkplatz', 'Parking'),
          o('transfer', 'Flughafentransfer', 'Airport transfer'),
          o('pet', 'Haustier', 'Pets'),
          o('extra_bed', 'Zusatzbett', 'Extra bed'),
          o('laundry', 'Wäscheservice', 'Laundry service'),
          o('welcome', 'Willkommenspaket', 'Welcome package')
        ] },
      { id: 'upsells_note', type: 'text', label: L('Preise und Vorlaufzeit', 'Prices and lead time'),
        placeholder: L('Transfer 65 EUR, 24 h vorher', 'Transfer EUR 65, 24 h in advance') },
      { id: 'payment', type: 'multi', label: L('Wie wird kassiert?', 'How is payment taken?'),
        options: [
          o('card_onsite', 'Vor Ort per Karte', 'By card on site'),
          o('cash_onsite', 'Vor Ort bar', 'In cash on site'),
          o('channel', 'Über den Buchungskanal', 'Through the booking channel'),
          o('payment_link', 'Zahlungslink', 'Payment link'),
          o('invoice', 'Rechnung an die Firma', 'Invoice to the company'),
          o('prepay', 'Vorkasse per Überweisung', 'Advance bank transfer')
        ] },
      { id: 'deposit', type: 'radio', label: L('Kaution', 'Deposit'),
        options: [
          o('none', 'Keine Kaution', 'No deposit'),
          o('cc_preauth', 'Kreditkarten-Vorautorisierung', 'Credit card pre-authorisation'),
          o('cash', 'Bar vor Ort', 'Cash on site'),
          o('link', 'Zahlungslink', 'Payment link'),
          o('channel', 'Über den Kanal', 'Through the channel')
        ] },
      { id: 'deposit_amount', type: 'money', label: L('Höhe der Kaution', 'Deposit amount'),
        dependsOn: { field: 'deposit', equals: ['cc_preauth', 'cash', 'link', 'channel'] } }
    ]
  },

  {
    id: 'recht',
    title: L('Recht, Meldewesen, Datenschutz', 'Law, guest registration, data protection'),
    intro: L('Für Objekte in der EU brauchen wir das schriftlich, bevor wir den ersten Gast betreuen.',
      'For properties in the EU we need this in writing before we serve the first guest.'),
    fields: [
      { id: 'note_meldeschein', type: 'note',
        label: L('Meldescheine gehören nicht zum Leistungsumfang des Guest Relations Officer. Sie werden entweder über die direkt angebundenen Schnittstellen in Elev8 Suite erfasst oder von Ihnen selbst.',
          'Guest registration forms are not part of the Guest Relations Officer scope. They are captured either through the directly connected interfaces in Elev8 Suite or by you.') },
      { id: 'meldeschein', type: 'radio',
        label: L('Wie werden Meldescheine für ausländische Gäste heute erfasst?',
          'How are registration forms for foreign guests captured today?'),
        help: L('Für deutsche Staatsangehörige ist die besondere Meldepflicht seit 1.1.2025 entfallen, für ausländische Gäste besteht sie weiter.',
          'For German nationals the special registration duty ended on 1 January 2025; for foreign guests it still applies.'),
        options: [
          o('elev8_interface', 'Über die Schnittstelle in Elev8 Suite', 'Through the interface in Elev8 Suite'),
          o('ourselves', 'Wir selbst vor Ort', 'By us on site'),
          o('unclear', 'Noch nicht geregelt', 'Not yet decided')
        ] },
      { id: 'citytax', type: 'radio', label: L('Beherbergungs- oder Kurtaxe', 'City or tourist tax'),
        options: [
          o('in_rate', 'Ja, im Zimmerpreis enthalten', 'Yes, included in the room rate'),
          o('onsite', 'Ja, wird vor Ort erhoben', 'Yes, collected on site'),
          o('channel', 'Ja, über den Buchungskanal', 'Yes, via the booking channel'),
          o('none', 'Nein, fällt nicht an', 'No, does not apply')
        ] },
      { id: 'dpo', type: 'text', contract: true,
        label: L('Ansprechpartner für Datenschutz auf Ihrer Seite', 'Data protection contact on your side') },
      { id: 'avv', type: 'radio', contract: true,
        label: L('Haben Sie eine eigene Vorlage für den Auftragsverarbeitungsvertrag?',
          'Do you have your own data processing agreement template?'),
        options: [
          o('own_template', 'Ja, wir stellen sie', 'Yes, we will provide it'),
          o('your_template', 'Nein, bitte Ihre Vorlage', 'No, please use yours'),
          o('open', 'Noch offen', 'Still open')
        ] },
      { id: 'data_notes', type: 'textarea',
        label: L('Besondere Auflagen zum Umgang mit Gastdaten',
          'Special requirements for handling guest data') }
    ]
  },

  {
    id: 'zugaenge',
    title: L('Zugänge und Werkzeuge', 'Access and tools'),
    intro: L('Ohne die richtigen Zugänge kann unser Team nur zuschauen.',
      'Without the right access our team can only watch.'),
    fields: [
      { id: 'elev8_access', type: 'radio',
        label: L('Wer legt die Elev8-Suite-Benutzer für unsere GROs an?',
          'Who creates the Elev8 Suite users for our GROs?'),
        options: [
          o('we_create', 'Wir legen sie an', 'We will create them'),
          o('elev8_creates', 'Bitte legt Elevate Software AG sie an', 'Please have Elevate Software AG create them'),
          o('open', 'Noch offen', 'Still open')
        ] },
      { id: 'smartlock', type: 'radio',
        label: L('Wie werden Türcodes erzeugt und an Gäste geschickt?',
          'How are door codes generated and sent to guests?'),
        options: [
          o('elev8_auto', 'Automatisch über Elev8 Suite', 'Automatically through Elev8 Suite'),
          o('manual_team', 'Manuell durch unser Team', 'Manually by our team'),
          o('fixed_per_unit', 'Fester Code je Einheit', 'A fixed code per unit'),
          o('keybox_fixed', 'Schlüsselbox mit festem Code', 'Key box with a fixed code'),
          o('none', 'Kein Code nötig', 'No code needed')
        ] },
      { id: 'whatsapp', type: 'radio', label: L('Nutzen Sie WhatsApp Business?', 'Do you use WhatsApp Business?'),
        options: [
          o('ours', 'Ja, die Nummer gehört uns', 'Yes, the number is ours'),
          o('via_elev8', 'Ja, soll über Elev8 Suite laufen', 'Yes, it should run through Elev8 Suite'),
          o('no', 'Nein, nutzen wir nicht', 'No, we do not use it')
        ] },
      { id: 'other_tools', type: 'text',
        label: L('Weitere Werkzeuge, die wir brauchen', 'Other tools we will need') }
    ]
  },

  {
    id: 'sonstiges',
    title: L('Zum Schluss', 'Finally'),
    fields: [
      { id: 'priority', type: 'multi', label: L('Was ist Ihnen am wichtigsten?', 'What matters most to you?'),
        options: [
          o('speed', 'Schnelle Antwortzeiten', 'Fast response times'),
          o('consistency', 'Gleichbleibende Qualität', 'Consistent quality'),
          o('reviews', 'Bessere Bewertungen', 'Better reviews'),
          o('relief', 'Entlastung des eigenen Teams', 'Relief for your own team'),
          o('upsell', 'Mehr Zusatzumsatz', 'More ancillary revenue'),
          o('night', 'Abdeckung in der Nacht', 'Overnight coverage')
        ] },
      { id: 'concerns', type: 'multi',
        label: L('Was bereitet Ihnen bei einer externen Gästebetreuung Sorgen?',
          'What worries you about outsourcing guest care?'),
        options: [
          o('personal_touch', 'Verlust der persönlichen Note', 'Losing the personal touch'),
          o('privacy', 'Datenschutz', 'Data protection'),
          o('language', 'Sprachqualität', 'Language quality'),
          o('goodwill_control', 'Kontrolle über Kulanz', 'Control over goodwill'),
          o('response_time', 'Reaktionszeit', 'Response time'),
          o('none', 'Keine Sorgen', 'No concerns')
        ] },
      { id: 'anything', type: 'textarea',
        label: L('Sonstiges, das wir wissen sollten', 'Anything else we should know') },
    ]
  }
];

/** Nur Felder, die der Tenant tatsächlich beantwortet (Hinweise zählen nicht). */
function isInput(f) { return f.type !== 'note'; }

const ALL_FIELDS = [];
const FIELD_MAP = new Map();
SECTIONS.forEach(function (sec) {
  sec.fields.forEach(function (f) {
    const rec = Object.assign({ section: sec.id, sectionTitle: sec.title, module: sec.module || null }, f);
    ALL_FIELDS.push(rec);
    FIELD_MAP.set(f.id, rec);
  });
});
const INPUT_FIELDS = ALL_FIELDS.filter(isInput);
/** Felder, die in den Vertrag wandern und nach der Unterschrift feststehen. */
const CONTRACT_FIELDS = INPUT_FIELDS.filter(function (f) { return !!f.contract; });

/** Angezeigter Text zu einem gespeicherten Code. */
function optionLabel(field, code, lang) {
  if (!field || !field.options) return String(code == null ? '' : code);
  const hit = field.options.filter(function (x) { return x.code === code; })[0];
  return hit ? t(hit, lang) : String(code == null ? '' : code);
}

/**
 * Gespeicherten Wert lesbar machen. Codes bei Auswahlfeldern, sonst
 * unveraendert. Mehrfachauswahl kommt als Codeliste.
 */
function valueLabel(field, value, lang) {
  const v = value == null ? '' : String(value);
  if (field && field.type === 'matrix') return matrixLabel(v, lang);
  if (!field || !field.options || v === '') return v;
  return v.split(',').map(function (x) { return optionLabel(field, x.trim(), lang); })
    .filter(function (x) { return x !== ''; }).join(', ');
}

/**
 * Eine Matrix wird als JSON gespeichert. Lesbar gemacht wird sie als eine
 * Zeile je Einheit — so steht sie im Admin-Export und im Vertrag brauchbar da.
 */
function matrixLabel(v, lang) {
  let rows = [];
  try { const p = JSON.parse(v); if (Array.isArray(p)) rows = p; } catch (e) { rows = []; }
  if (!rows.length) return '';
  return rows.map(function (r) {
    return (r.name || r.id || '—') + ': ' + (r.min || '—') + ' / ' + (r.base || '—') + ' / ' + (r.max || '—') +
      (r.est ? (lang === 'en' ? ' (estimated)' : ' (geschätzt)') : '');
  }).join('\n');
}

/** Vorschläge, die von uns kommen und nicht aus Elev8 Suite. */
function presets() {
  const out = {};
  ALL_FIELDS.forEach(function (f) {
    if (f.preset) {
      out[f.id] = {
        value: f.preset,
        evidence: f.presetNote || L('Vorschlag von Elev8 Suite — bitte prüfen', 'Suggested by Elev8 Suite — please check')
      };
    }
  });
  return out;
}

/** Elev8-Suite-Vorbelegung über die eigenen Vorschläge legen. */
function mergePrefill(fromElev8) {
  return Object.assign({}, presets(), fromElev8 || {});
}

/**
 * Karte "Optionstext klein geschrieben -> Code", damit Antworten aus der Zeit
 * vor der Umstellung auf Codes nicht verloren gehen.
 */
function legacyCodeMap() {
  const map = new Map();
  ALL_FIELDS.forEach(function (f) {
    if (!f.options) return;
    f.options.forEach(function (x) {
      map.set(f.id + '::' + String(x.de).toLowerCase().trim(), x.code);
      map.set(f.id + '::' + String(x.en).toLowerCase().trim(), x.code);
    });
  });
  return map;
}

module.exports = {
  SECTIONS, ALL_FIELDS, INPUT_FIELDS, CONTRACT_FIELDS, FIELD_MAP,
  isInput, optionLabel, valueLabel, matrixLabel, presets, mergePrefill, legacyCodeMap
};
