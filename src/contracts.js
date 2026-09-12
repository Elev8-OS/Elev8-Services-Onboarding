'use strict';

/**
 * Vertragserzeugung aus dem ausgefüllten Formular.
 *
 * Zwei Dokumente: der Auftragsverarbeitungsvertrag nach Art. 28 DSGVO und
 * der GRO-Dienstleistungsvertrag. Beide werden aus denselben Antworten
 * gebaut, damit im Vertrag nichts steht, was der Kunde nicht selbst
 * angegeben hat.
 *
 * Aufbau eines Dokuments:
 *   { key, title, subtitle, parties:[{role, lines[]}], sections:[
 *       { n, h, blocks:[ {p} | {ul:[]} | {kv:[[k,v]]} ] } ] }
 *
 * Deutsch ist die bindende Fassung, Englisch die Lesefassung. Die
 * Vorrangklausel steht in den Schlussbestimmungen beider Dokumente.
 */

const { t, L } = require('./i18n');
const { FIELD_MAP, valueLabel, optionLabel } = require('./questions');

/* ---------------- Partei Elev8 Suite ---------------- */

const ELEV8 = {
  name: process.env.ELEV8_LEGAL_NAME || 'Elevate Software AG',
  street: process.env.ELEV8_STREET || 'Im Füler 7',
  city: process.env.ELEV8_CITY || '4616 Kappel SO',
  country: process.env.ELEV8_COUNTRY || 'Schweiz',
  uid: process.env.ELEV8_UID || 'CHE-398.140.212',
  signer: process.env.ELEV8_SIGNER || 'Reto Wyss',
  signerRole: process.env.ELEV8_SIGNER_ROLE || 'Mitglied des Verwaltungsrats',
  email: process.env.ELEV8_EMAIL || 'legal@elev8-suite.com',
  privacyEmail: process.env.ELEV8_PRIVACY_EMAIL || 'datenschutz@elev8-suite.com',
  euRep: process.env.ELEV8_EU_REP || ''
};

const DEFAULT_TERMS = {
  currency: 'EUR',
  price_per_unit: '',
  setup_fee: '',
  term_months: '12',
  notice_months: '3',
  billing: 'monthly',
  start_date: '',
  law: 'CH',
  venue: process.env.ELEV8_VENUE || 'Solothurn, Schweiz'
};

/* ---------------- Hilfen ---------------- */

function txt(v, lang) { return t(v, lang); }

function money(amount, currency, lang) {
  const a = String(amount == null ? '' : amount).trim();
  if (!a) return lang === 'en' ? '[to be agreed]' : '[noch zu vereinbaren]';
  return (currency || 'EUR') + ' ' + a;
}

function orOpen(v, lang) {
  const s = String(v == null ? '' : v).trim();
  if (s) return s;
  return lang === 'en' ? '[not stated]' : '[nicht angegeben]';
}

/** Antwort eines Feldes als lesbarer Text in der Vertragssprache. */
function ans(ctx, id) {
  const f = FIELD_MAP.get(id);
  const raw = (ctx.answers && ctx.answers[id]) || '';
  if (!f) return String(raw);
  const v = valueLabel(f, raw, ctx.lang);
  return String(v || '').trim();
}

function ansOr(ctx, id) {
  const f = FIELD_MAP.get(id);
  const v = ans(ctx, id);
  if (!v) return orOpen('', ctx.lang);
  if (f && f.type === 'money') return (ctx.terms.currency || 'EUR') + ' ' + v;
  return v;
}

/**
 * Mehrfachauswahl als Aufzählung. Wichtig: über die Codes gehen, nicht über
 * den zusammengesetzten Text — mehrere Optionstexte enthalten selbst Kommas.
 */
function ansList(ctx, id) {
  const f = FIELD_MAP.get(id);
  const raw = String((ctx.answers && ctx.answers[id]) || '').trim();
  if (!raw) return [];
  if (!f || !f.options) return [raw];
  return raw.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
    .map(function (code) { return optionLabel(f, code, ctx.lang); });
}

function today(lang) {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return lang === 'en'
    ? p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear()
    : p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

/** Zusammenhängender Text für die Abdeckungszeiten. */
function coverageText(ctx) {
  const code = (ctx.answers && ctx.answers.coverage) || '';
  if (code === 'other') return ansOr(ctx, 'coverage_custom');
  return ansOr(ctx, 'coverage');
}

function startText(ctx) {
  const code = (ctx.answers && ctx.answers.start_date) || '';
  if (code === 'fixed') return ansOr(ctx, 'start_date_when');
  return ansOr(ctx, 'start_date');
}

/** Kontext für beide Dokumente. */
function buildContext(intake, answers, terms, lang) {
  return {
    lang: lang || 'de',
    intake: intake,
    answers: answers || {},
    terms: Object.assign({}, DEFAULT_TERMS, terms || {}),
    elev8: ELEV8,
    tenantName: intake.tenant_name
  };
}

/* ---------------- Auftragsverarbeitungsvertrag ---------------- */

function avv(ctx) {
  const l = ctx.lang;
  const en = l === 'en';
  const e = ctx.elev8;
  const subs = subprocessors(ctx);

  const sections = [];
  const S = function (n, h, blocks) { sections.push({ n: n, h: txt(h, l), blocks: blocks }); };
  const P = function (de, enTxt) { return { p: txt(L(de, enTxt), l) }; };
  const UL = function (deArr, enArr) { return { ul: (en ? enArr : deArr) }; };

  S('1', L('Gegenstand und Dauer', 'Subject matter and duration'), [
    P('Dieser Vertrag konkretisiert die Pflichten der Parteien zum Datenschutz, die sich aus der Erbringung der Guest-Relations-Leistungen gemäss dem zwischen den Parteien geschlossenen Dienstleistungsvertrag (nachfolgend „Hauptvertrag") ergeben. Er gilt für alle Verarbeitungen personenbezogener Daten, die der Auftragsverarbeiter für den Verantwortlichen durchführt.',
      'This agreement sets out the data protection obligations of the parties arising from the provision of the guest relations services under the service agreement concluded between the parties (the "main agreement"). It applies to all processing of personal data carried out by the processor on behalf of the controller.'),
    P('Die Laufzeit entspricht der Laufzeit des Hauptvertrags. Eine Kündigung des Hauptvertrags beendet auch diesen Vertrag; die Pflichten zur Löschung und Rückgabe nach Ziffer 9 bestehen darüber hinaus fort.',
      'The term corresponds to the term of the main agreement. Termination of the main agreement also ends this agreement; the deletion and return obligations under section 9 survive it.')
  ]);

  S('2', L('Art, Umfang und Zweck der Verarbeitung', 'Nature, scope and purpose of the processing'), [
    { kv: [
      [txt(L('Zweck', 'Purpose'), l),
        txt(L('Kommunikation mit Gästen des Verantwortlichen vor, während und nach dem Aufenthalt sowie die damit verbundene Bearbeitung von Anliegen, Beschwerden und Zusatzleistungen.',
          'Communication with the controller’s guests before, during and after the stay, and the related handling of requests, complaints and additional services.'), l)],
      [txt(L('Art der Verarbeitung', 'Nature of processing'), l),
        txt(L('Erheben, Erfassen, Speichern, Verwenden, Auslesen, Abfragen, Übermitteln innerhalb der eingesetzten Systeme, Löschen.',
          'Collection, recording, storage, use, retrieval, consultation, transmission within the systems used, erasure.'), l)],
      [txt(L('Betroffene Personen', 'Categories of data subjects'), l),
        txt(L('Gäste und Buchende des Verantwortlichen, deren Begleitpersonen sowie Mitarbeitende und Dienstleister des Verantwortlichen, soweit sie im Rahmen der Betreuung kontaktiert werden.',
          'Guests and bookers of the controller, their companions, and employees and service providers of the controller insofar as they are contacted in the course of the service.'), l)],
      [txt(L('Datenarten', 'Categories of data'), l),
        txt(L('Name, Anrede, Geburtsdatum, Staatsangehörigkeit, Anschrift, Sprache; Ausweisdaten, soweit sie in Elev8 Suite hinterlegt oder von Gästen übermittelt werden (Personalausweis, Reisepass, Führerschein, einschliesslich Ausweisnummer, Gültigkeit und Lichtbild); Kontaktdaten (E-Mail, Telefon, Messenger-Kennung); Buchungsdaten (Objekt, Zeitraum, Personenzahl, Kanal, Preis); Kommunikationsinhalte einschliesslich Gesprächsaufzeichnungen; Angaben zu Sonderwünschen und Beschwerden; Zahlungsstatus ohne vollständige Kartendaten; Zugangscodes zur Unterkunft; Reisedaten wie Flugnummer und Ankunftszeit.',
          'Name, salutation, date of birth, nationality, address, language; identity document data where stored in Elev8 Suite or supplied by guests (identity card, passport, driving licence, including document number, validity and photograph); contact details (email, phone, messenger identifier); booking data (property, period, number of persons, channel, price); content of communications including call recordings; special requests and complaints; payment status without full card data; accommodation access codes; travel data such as flight number and arrival time.'), l)],
      [txt(L('Besondere Kategorien', 'Special categories'), l),
        txt(L('Nicht Gegenstand des Auftrags. Teilt ein Gast von sich aus Gesundheitsangaben mit (z. B. Allergien, Barrierefreiheit) oder ergibt sich aus einem Ausweisdokument ein Hinweis auf eine besondere Kategorie, werden diese Angaben ausschliesslich zur Bearbeitung des konkreten Anliegens verwendet, nicht gesondert ausgewertet und nicht weitergegeben.',
          'Not part of the assignment. If a guest volunteers health information (e.g. allergies, accessibility needs), or if an identity document reveals an indication of a special category, that information is used solely to handle the specific request, is not evaluated separately and is not passed on.'), l)]
    ] }
  ]);

  S('3', L('Weisungsrecht', 'Instructions'), [
    P('Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschliesslich auf dokumentierte Weisung des Verantwortlichen. Dieser Vertrag und die im Aufnahmeformular festgehaltenen Angaben, insbesondere die Entscheidungsbefugnisse und Eskalationsregeln, gelten als dokumentierte Erstweisung.',
      'The processor processes personal data solely on documented instructions from the controller. This agreement and the entries recorded in the onboarding form, in particular the decision-making authority and escalation rules, constitute the documented initial instruction.'),
    P('Weitere Weisungen erteilt der Verantwortliche in Textform gegenüber der im Hauptvertrag genannten Kontaktstelle. Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, teilt er dies unverzüglich mit und darf die Ausführung bis zur Klärung aussetzen.',
      'Further instructions are issued by the controller in text form to the contact point named in the main agreement. If the processor considers an instruction to be unlawful, it shall notify the controller without undue delay and may suspend execution until the matter is resolved.')
  ]);

  S('4', L('Pflichten des Auftragsverarbeiters', 'Obligations of the processor'), [
    UL([
      'Vertraulichkeit: Alle mit der Verarbeitung befassten Personen sind zur Vertraulichkeit verpflichtet und vor Aufnahme der Tätigkeit auf den Datenschutz verpflichtet worden.',
      'Sicherheit der Verarbeitung: Der Auftragsverarbeiter trifft die in Anlage 1 beschriebenen technischen und organisatorischen Massnahmen nach Art. 32 DSGVO und hält sie auf dem Stand der Technik.',
      'Unterstützung: Er unterstützt den Verantwortlichen bei der Erfüllung der Pflichten nach Art. 32 bis 36 DSGVO, insbesondere bei Datenschutz-Folgenabschätzungen und Meldungen an die Aufsichtsbehörde.',
      'Meldung von Verletzungen: Er meldet dem Verantwortlichen jede Verletzung des Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von 24 Stunden nach Kenntnis, mit allen für die Meldung nach Art. 33 DSGVO erforderlichen Angaben.',
      'Verzeichnis: Er führt ein Verzeichnis aller Verarbeitungstätigkeiten nach Art. 30 Abs. 2 DSGVO und stellt es dem Verantwortlichen auf Anfrage zur Verfügung.',
      'Datenschutzkontakt: Anfragen richtet der Verantwortliche an ' + e.privacyEmail + '.'
    ], [
      'Confidentiality: everyone involved in the processing is bound to confidentiality and has been committed to data protection before starting work.',
      'Security of processing: the processor implements the technical and organisational measures described in Annex 1 pursuant to Art. 32 GDPR and keeps them state of the art.',
      'Assistance: it assists the controller in complying with Art. 32 to 36 GDPR, in particular with data protection impact assessments and notifications to the supervisory authority.',
      'Breach notification: it notifies the controller of any personal data breach without undue delay and at the latest within 24 hours of becoming aware, with all information required for a notification under Art. 33 GDPR.',
      'Records: it maintains a record of all processing activities under Art. 30(2) GDPR and makes it available to the controller on request.',
      'Data protection contact: the controller addresses enquiries to ' + e.privacyEmail + '.'
    ])
  ]);

  S('5', L('Unterauftragsverarbeiter', 'Sub-processors'), [
    P('Der Verantwortliche erteilt die allgemeine Genehmigung zur Beauftragung der in Anlage 2 aufgeführten Unterauftragsverarbeiter. Der Auftragsverarbeiter verpflichtet diese auf dieselben Datenschutzpflichten, die ihn selbst treffen.',
      'The controller grants general authorisation for engaging the sub-processors listed in Annex 2. The processor imposes on them the same data protection obligations that apply to it.'),
    P('Beabsichtigte Änderungen teilt der Auftragsverarbeiter dem Verantwortlichen mindestens 30 Tage vorher in Textform mit. Der Verantwortliche kann binnen 14 Tagen aus wichtigem, datenschutzbezogenem Grund widersprechen. Bleibt der Widerspruch bestehen und lässt sich keine Lösung finden, kann jede Partei den Hauptvertrag mit einer Frist von 30 Tagen kündigen.',
      'The processor informs the controller of intended changes in text form at least 30 days in advance. The controller may object within 14 days on substantial data protection grounds. If the objection persists and no solution is found, either party may terminate the main agreement on 30 days’ notice.'),
    { kvHead: [txt(L('Unterauftragsverarbeiter', 'Sub-processor'), l), txt(L('Leistung', 'Service'), l), txt(L('Ort der Verarbeitung', 'Place of processing'), l)],
      rows: subs.map(function (x) { return [x.name, txt(x.service, l), txt(x.place, l)]; }) }
  ]);

  S('6', L('Verarbeitung in Drittländern', 'Processing in third countries'), [
    P('Der Auftragsverarbeiter hat seinen Sitz in der Schweiz. Für die Schweiz besteht ein Angemessenheitsbeschluss der Europäischen Kommission; eine Übermittlung dorthin bedarf daher keiner zusätzlichen Garantien nach Art. 46 DSGVO.',
      'The processor is established in Switzerland. An adequacy decision of the European Commission is in place for Switzerland; transfers there therefore require no additional safeguards under Art. 46 GDPR.'),
    P('Das Guest-Relations-Team arbeitet im Regelfall rund um die Uhr aus Indonesien; Vertretung und Ausfallbetrieb können aus der Europäischen Union und aus der Schweiz erfolgen. Für die Übermittlung nach Indonesien gelten die Standardvertragsklauseln der Europäischen Kommission in der Fassung des Durchführungsbeschlusses (EU) 2021/914, Modul 3 (Auftragsverarbeiter an Auftragsverarbeiter), zusammen mit der in Anlage 3 dokumentierten Beurteilung des Übermittlungsrisikos und den dort beschriebenen zusätzlichen Massnahmen.',
      'The guest relations team works, as a rule, around the clock from Indonesia; cover and fallback operation may take place from the European Union and from Switzerland. The transfer to Indonesia is governed by the Standard Contractual Clauses of the European Commission as set out in Implementing Decision (EU) 2021/914, Module Three (processor to processor), together with the transfer risk assessment documented in Annex 3 and the supplementary measures described there.'),
    P('Der Verantwortliche wird hiermit ausdrücklich darauf hingewiesen, dass für Indonesien kein Angemessenheitsbeschluss vorliegt.',
      'The controller is expressly informed that no adequacy decision exists for Indonesia.')
  ]);

  S('7', L('Rechte der betroffenen Personen', 'Rights of data subjects'), [
    P('Wendet sich eine betroffene Person unmittelbar an den Auftragsverarbeiter, leitet dieser das Anliegen unverzüglich an den Verantwortlichen weiter und beantwortet es nicht selbst, sofern der Verantwortliche nichts anderes angewiesen hat.',
      'If a data subject contacts the processor directly, the processor forwards the request to the controller without undue delay and does not answer it itself unless the controller has instructed otherwise.'),
    P('Der Auftragsverarbeiter unterstützt den Verantwortlichen mit geeigneten Massnahmen dabei, Auskunfts-, Berichtigungs-, Lösch-, Einschränkungs-, Widerspruchs- und Übertragbarkeitsbegehren zu erfüllen.',
      'The processor assists the controller with appropriate measures in fulfilling requests for access, rectification, erasure, restriction, objection and portability.')
  ]);

  S('8', L('Nachweise und Kontrollen', 'Evidence and audits'), [
    P('Der Auftragsverarbeiter weist die Einhaltung dieses Vertrags auf Anfrage nach, vorrangig durch aktuelle Berichte, Zertifizierungen oder eine ausgefüllte Selbstauskunft. Genügt das im Einzelfall nicht, ermöglicht er dem Verantwortlichen oder einem von ihm beauftragten, zur Verschwiegenheit verpflichteten Prüfer nach Ankündigung von mindestens 14 Tagen und höchstens einmal jährlich eine Prüfung während der üblichen Geschäftszeiten. Anlassbezogene Prüfungen bleiben davon unberührt.',
      'On request the processor demonstrates compliance with this agreement, primarily by way of current reports, certifications or a completed self-assessment. Where that is not sufficient in an individual case, it allows the controller, or an auditor appointed by it and bound to confidentiality, to carry out an audit during normal business hours on at least 14 days’ notice and at most once a year. Audits for cause remain unaffected.')
  ]);

  S('9', L('Löschung und Rückgabe', 'Deletion and return'), [
    P('Nach Beendigung des Hauptvertrags löscht der Auftragsverarbeiter alle personenbezogenen Daten oder gibt sie nach Wahl des Verantwortlichen zurück, spätestens innerhalb von 60 Tagen. Gesetzliche Aufbewahrungspflichten bleiben unberührt; für die Dauer der Aufbewahrung wird die Verarbeitung auf die Erfüllung dieser Pflichten eingeschränkt.',
      'On termination of the main agreement the processor deletes all personal data or returns it at the controller’s choice, within 60 days at the latest. Statutory retention obligations remain unaffected; for the duration of retention, processing is restricted to fulfilling those obligations.'),
    P('Gesprächsaufzeichnungen werden spätestens 90 Tage nach der Aufnahme automatisch gelöscht, sofern sie nicht zur Klärung eines konkreten Vorfalls benötigt werden.',
      'Call recordings are deleted automatically no later than 90 days after recording, unless they are needed to clarify a specific incident.')
  ]);

  S('10', L('Haftung', 'Liability'), [
    P('Es gilt Art. 82 DSGVO. Im Innenverhältnis haften die Parteien nach ihrem jeweiligen Verursachungsbeitrag. Die Haftungsregelung des Hauptvertrags bleibt im Übrigen unberührt.',
      'Art. 82 GDPR applies. Between the parties, liability is allocated according to each party’s share of responsibility. The liability provisions of the main agreement otherwise remain unaffected.')
  ]);

  S('11', L('Schlussbestimmungen', 'Final provisions'), [
    P('Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.',
      'Amendments and additions require text form. Should any provision be invalid, the remainder of the agreement remains effective.'),
    P('Bei Widersprüchen zwischen diesem Vertrag und dem Hauptvertrag geht dieser Vertrag in Datenschutzfragen vor.',
      'In the event of conflict between this agreement and the main agreement, this agreement prevails on data protection matters.'),
    P('Dieser Vertrag liegt in deutscher und englischer Sprache vor. Verbindlich ist ausschliesslich die deutsche Fassung; die englische Fassung dient dem Verständnis.',
      'This agreement exists in German and English. Only the German version is binding; the English version serves comprehension only.'),
    P('Es gilt ' + lawText(ctx) + '. Gerichtsstand ist ' + ctx.terms.venue + '. Zwingende Zuständigkeiten und die Rechte betroffener Personen nach der DSGVO bleiben unberührt.',
      lawTextEn(ctx) + ' applies. The place of jurisdiction is ' + ctx.terms.venue + '. Mandatory jurisdictions and the rights of data subjects under the GDPR remain unaffected.')
  ]);

  return {
    key: 'avv',
    title: txt(L('Vertrag zur Auftragsverarbeitung', 'Data Processing Agreement'), l),
    subtitle: txt(L('nach Art. 28 DSGVO', 'pursuant to Art. 28 GDPR'), l),
    parties: partyBlock(ctx, L('Verantwortlicher', 'Controller'), L('Auftragsverarbeiter', 'Processor')),
    sections: sections,
    annexes: avvAnnexes(ctx)
  };
}

function lawText(ctx) {
  return ctx.terms.law === 'DE' ? 'deutsches Recht' : 'Schweizer Recht unter Ausschluss des Kollisionsrechts';
}
function lawTextEn(ctx) {
  return ctx.terms.law === 'DE' ? 'German law' : 'Swiss law, excluding its conflict-of-law rules,';
}

function subprocessors(ctx) {
  return [
    { name: ctx.elev8.name + ' — ' + (ctx.lang === 'en' ? 'guest relations team' : 'Guest-Relations-Team'),
      service: L('Gästekommunikation im Regelfall rund um die Uhr, einschliesslich Nacht- und Wochenendschichten',
        'Guest communication, as a rule around the clock, including night and weekend shifts'),
      place: L('Indonesien; Vertretung und Ausfallbetrieb in der EU und/oder der Schweiz',
        'Indonesia; cover and fallback operation in the EU and/or Switzerland') },
    { name: 'Elev8 Suite',
      service: L('Betrieb der Property-Management-Plattform, in der die Kommunikation stattfindet',
        'Operation of the property management platform in which the communication takes place'),
      place: L('EU / Schweiz', 'EU / Switzerland') }
  ];
}

function avvAnnexes(ctx) {
  const l = ctx.lang;
  const en = l === 'en';
  return [
    {
      h: txt(L('Anlage 1 — Technische und organisatorische Massnahmen',
        'Annex 1 — Technical and organisational measures'), l),
      blocks: [
        { ul: en ? [
          'Access control: named user accounts, no shared logins, multi-factor authentication for all administrative access, immediate revocation on departure.',
          'Authorisation: role-based rights in Elev8 Suite, least privilege, quarterly review of assignments.',
          'Transmission: TLS for all connections, no guest data over private channels or personal devices.',
          'Storage: data resides in Elev8 Suite; no local copies on end devices, no exports without a documented reason.',
          'Separation: strict tenant separation in Elev8 Suite; a GRO only sees the tenants assigned to them.',
          'Logging: all access and changes are logged in Elev8 Suite and traceable to a named user.',
          'Availability: backups by the platform operator, documented restore procedure.',
          'Staff: confidentiality undertaking and data protection training before the first shift, refreshed annually.',
          'Incidents: defined reporting chain with a 24-hour notification deadline to the controller.'
        ] : [
          'Zugangskontrolle: benannte Benutzerkonten, keine geteilten Zugänge, Mehrfaktor-Authentisierung für alle administrativen Zugriffe, sofortiger Entzug beim Austritt.',
          'Berechtigungen: rollenbasierte Rechte in Elev8 Suite, Minimalprinzip, vierteljährliche Überprüfung der Zuweisungen.',
          'Übertragung: TLS für sämtliche Verbindungen, keine Gastdaten über private Kanäle oder Privatgeräte.',
          'Speicherung: Die Daten liegen in Elev8 Suite; keine lokalen Kopien auf Endgeräten, keine Exporte ohne dokumentierten Anlass.',
          'Trennung: strikte Mandantentrennung in Elev8 Suite; ein GRO sieht ausschliesslich die ihm zugewiesenen Tenants.',
          'Protokollierung: Zugriffe und Änderungen werden in Elev8 Suite protokolliert und sind einer benannten Person zuordenbar.',
          'Verfügbarkeit: Sicherungen durch den Plattformbetreiber, dokumentiertes Wiederherstellungsverfahren.',
          'Personal: Vertraulichkeitsverpflichtung und Datenschutzschulung vor der ersten Schicht, jährliche Auffrischung.',
          'Vorfälle: definierte Meldekette mit 24-Stunden-Frist gegenüber dem Verantwortlichen.'
        ] }
      ]
    },
    {
      h: txt(L('Anlage 2 — Unterauftragsverarbeiter', 'Annex 2 — Sub-processors'), l),
      blocks: [
        { kvHead: [txt(L('Name', 'Name'), l), txt(L('Leistung', 'Service'), l), txt(L('Ort', 'Place'), l)],
          rows: subprocessors(ctx).map(function (x) { return [x.name, txt(x.service, l), txt(x.place, l)]; }) }
      ]
    },
    {
      h: txt(L('Anlage 3 — Übermittlung nach Indonesien', 'Annex 3 — Transfer to Indonesia'), l),
      blocks: [
        { p: txt(L('Für Indonesien besteht kein Angemessenheitsbeschluss. Die Übermittlung stützt sich auf die Standardvertragsklauseln nach Durchführungsbeschluss (EU) 2021/914, Modul 3.',
          'No adequacy decision exists for Indonesia. The transfer relies on the Standard Contractual Clauses under Implementing Decision (EU) 2021/914, Module Three.'), l) },
        { p: txt(L('Zusätzliche Massnahmen:', 'Supplementary measures:'), l) },
        { ul: en ? [
          'No data at rest in Indonesia: staff work exclusively inside Elev8 Suite; downloads and exports are technically restricted.',
          'Minimisation: a GRO sees only the data needed for the current request.',
          'Encryption in transit; encrypted devices with enforced screen locking.',
          'Contractual commitment to notify the controller immediately of any request from a public authority, unless prohibited by law.',
          'Annual review of the assessment, and immediately if the legal situation changes materially.'
        ] : [
          'Keine ruhende Datenhaltung in Indonesien: Die Mitarbeitenden arbeiten ausschliesslich in Elev8 Suite; Downloads und Exporte sind technisch eingeschränkt.',
          'Datenminimierung: Ein GRO sieht nur die für das jeweilige Anliegen erforderlichen Daten.',
          'Verschlüsselung auf dem Transportweg; verschlüsselte Geräte mit erzwungener Bildschirmsperre.',
          'Vertragliche Pflicht, jede behördliche Herausgabeanordnung dem Verantwortlichen unverzüglich mitzuteilen, soweit gesetzlich zulässig.',
          'Jährliche Überprüfung dieser Beurteilung sowie unverzüglich bei wesentlicher Änderung der Rechtslage.'
        ] }
      ]
    }
  ];
}

function partyBlock(ctx, roleA, roleB) {
  const l = ctx.lang;
  const e = ctx.elev8;
  const a = [
    orOpen(ans(ctx, 'company') || ctx.tenantName, l),
    orOpen(ans(ctx, 'address'), l),
    (l === 'en' ? 'Contact: ' : 'Ansprechpartner: ') + orOpen(ans(ctx, 'contact_main'), l),
    orOpen(ans(ctx, 'contact_email'), l)
  ];
  const dpo = ans(ctx, 'dpo');
  if (dpo) a.push((l === 'en' ? 'Data protection contact: ' : 'Datenschutzkontakt: ') + dpo);
  return [
    { role: txt(roleA, l), lines: a },
    { role: txt(roleB, l), lines: [
      e.name, e.street, e.city + ', ' + e.country,
      (l === 'en' ? 'Commercial register no.: ' : 'UID: ') + e.uid,
      e.email
    ] }
  ];
}

/* ---------------- GRO-Dienstleistungsvertrag ---------------- */

function gro(ctx) {
  const l = ctx.lang;
  const en = l === 'en';
  const tm = ctx.terms;
  const sections = [];
  const S = function (n, h, blocks) { sections.push({ n: n, h: txt(h, l), blocks: blocks }); };
  const P = function (de, enTxt) { return { p: txt(L(de, enTxt), l) }; };

  const scope = ansList(ctx, 'scope');
  const extra = ans(ctx, 'scope_extra');
  if (extra) scope.push(extra);

  S('1', L('Vertragsgegenstand', 'Subject matter'), [
    P('Elevate Software AG erbringt für den Kunden Guest-Relations-Leistungen. Sie erbringt diese Leistungen über ihre Plattform Elev8 Suite. Ein Guest Relations Officer (nachfolgend „GRO") führt die Kommunikation mit den Gästen des Kunden im Namen und im Auftrag des Kunden. Der GRO tritt gegenüber Gästen unter dem vom Kunden bestimmten Namen auf.',
      'Elevate Software AG provides guest relations services to the client. It delivers those services through its platform, Elev8 Suite. A Guest Relations Officer (“GRO”) handles communication with the client’s guests in the client’s name and on the client’s behalf. Towards guests the GRO appears under the name specified by the client.'),
    { kv: [
      [txt(L('Objekt', 'Property'), l), ansOr(ctx, 'address')],
      [txt(L('Anzahl Einheiten', 'Number of units'), l), ansOr(ctx, 'units')],
      [txt(L('Auftreten gegenüber Gästen', 'Appearance towards guests'), l), ansOr(ctx, 'signature')],
      [txt(L('Anrede', 'Form of address'), l), ansOr(ctx, 'tone_form')],
      [txt(L('Leistungsbeginn', 'Start of service'), l), startText(ctx)]
    ] }
  ]);

  S('2', L('Leistungsumfang', 'Scope of services'), [
    P('Elevate Software AG übernimmt die folgenden Aufgaben:', 'Elevate Software AG takes on the following tasks:'),
    { ul: scope.length ? scope : [orOpen('', l)] },
    { kv: [
      [txt(L('Abdeckungszeiten', 'Coverage hours'), l), coverageText(ctx)],
      [txt(L('Sprachen', 'Languages'), l), ansOr(ctx, 'languages')]
    ] },
    P('Die Kommunikation läuft ausschliesslich über die in Elev8 Suite verbundenen Kanäle. Telefonate laufen über die vom Kunden im System aufgeschaltete Rufnummer.',
      'Communication runs exclusively through the channels connected in Elev8 Suite. Calls run through the number the client has provisioned in the system.')
  ]);

  S('3', L('Entscheidungsbefugnisse des GRO', 'Decision-making authority of the GRO'), [
    P('Der Kunde erteilt dem GRO im folgenden Rahmen Vollmacht, gegenüber Gästen verbindlich zu handeln. Innerhalb dieses Rahmens entscheidet der GRO ohne Rückfrage; ausserhalb holt er die Zustimmung des Kunden ein.',
      'The client authorises the GRO to act with binding effect towards guests within the following limits. Within these limits the GRO decides without asking; beyond them it obtains the client’s approval.'),
    { kv: [
      [txt(L('Kulanz je Fall ohne Rückfrage', 'Goodwill per case without asking'), l), ansOr(ctx, 'goodwill_limit')],
      [txt(L('Kulanz je Monat', 'Goodwill per month'), l), ansOr(ctx, 'goodwill_month')],
      [txt(L('Late Check-out', 'Late check-out'), l), ansOr(ctx, 'late_checkout') + timeSuffix(ctx, 'late_checkout_until')],
      [txt(L('Early Check-in', 'Early check-in'), l), ansOr(ctx, 'early_checkin') + timeSuffix(ctx, 'early_checkin_from')],
      [txt(L('Stornieren, Umbuchen, Upgraden', 'Cancel, rebook, upgrade'), l), ansOr(ctx, 'cancel_rebook') + listSuffix(ctx, 'cancel_rules')],
      [txt(L('Überbuchung', 'Overbooking'), l), ansOr(ctx, 'overbooking')],
      [txt(L('No-Show', 'No-show'), l), ansOr(ctx, 'noshow')],
      [txt(L('Rabattspielraum', 'Discount latitude'), l), ansOr(ctx, 'discount')],
      [txt(L('Schäden: Eskalationsschwelle', 'Damage: escalation threshold'), l), ansOr(ctx, 'damage_limit')],
      [txt(L('Umgang mit Schäden', 'Handling of damage'), l), ansOr(ctx, 'damage_rules')],
      [txt(L('Themen ohne Entscheidungsbefugnis', 'Topics outside the GRO’s authority'), l), ansOr(ctx, 'nogos')],
      [txt(L('Vollmachtgeber', 'Authorising person'), l), ansOr(ctx, 'mandate_signer')]
    ] }
  ]);

  S('4', L('Eskalation', 'Escalation'), [
    P('Der Kunde benennt die folgenden Eskalationsstufen. Alle genannten Personen müssen in Elev8 Suite als Benutzer angelegt sein; nur dann kann der GRO sie über das System erreichen und der Vorgang bleibt nachvollziehbar.',
      'The client names the following escalation levels. Everyone named must exist as a user in Elev8 Suite; only then can the GRO reach them through the system and the case stays traceable.'),
    { kv: [
      [txt(L('Stufe 1', 'Level 1'), l), ansOr(ctx, 'esc1')]
    ].concat(ans(ctx, 'esc2') ? [[txt(L('Stufe 2', 'Level 2'), l), ans(ctx, 'esc2')]] : [])
      .concat(ans(ctx, 'esc3') ? [[txt(L('Stufe 3', 'Level 3'), l), ans(ctx, 'esc3')]] : [])
      .concat([
      [txt(L('Sofort telefonisch zu melden', 'To be reported by phone immediately'), l),
        ansOr(ctx, 'esc_immediate') + (ans(ctx, 'esc_immediate_other') ? ', ' + ans(ctx, 'esc_immediate_other') : '')],
      [txt(L('Wenn niemand erreichbar ist', 'If nobody can be reached'), l),
        ansOr(ctx, 'esc_nobody') + (ans(ctx, 'esc_nobody_limit')
          ? ' (' + (ctx.terms.currency || 'EUR') + ' ' + ans(ctx, 'esc_nobody_limit') + ')' : '')]
    ]) }
  ]);

  S('5', L('Mitwirkungspflichten des Kunden', 'Client’s duties to cooperate'), [
    { ul: en ? [
      'Keep the data in Elev8 Suite current and complete, in particular check-in steps, Wi-Fi credentials, house rules and access codes.',
      'Create every person who is to be informed or escalated to as a user in Elev8 Suite, and keep those users current.',
      'Provide the GRO users with the access rights required for the service.',
      'Name a permanent contact for Elevate Software AG and ensure that person is reachable during the agreed coverage hours.',
      'Report changes that affect guests — construction work, closures, changed times — without delay.'
    ] : [
      'Die Daten in Elev8 Suite aktuell und vollständig halten, insbesondere Check-in-Schritte, WLAN-Zugangsdaten, Hausregeln und Zugangscodes.',
      'Jede Person, die informiert oder eskaliert werden soll, als Benutzer in Elev8 Suite anlegen und aktuell halten.',
      'Den GRO-Benutzern die für die Leistung erforderlichen Zugriffsrechte einräumen.',
      'Einen festen Ansprechpartner für Elevate Software AG benennen und dessen Erreichbarkeit während der vereinbarten Abdeckungszeiten sicherstellen.',
      'Änderungen, die Gäste betreffen — Bauarbeiten, Schliessungen, geänderte Zeiten — unverzüglich melden.'
    ] },
    P('Kommt der Kunde diesen Pflichten nicht nach, kann Elevate Software AG die betroffenen Leistungen nicht erbringen; ein Vergütungsanspruch bleibt bestehen.',
      'If the client fails to meet these duties, Elevate Software AG cannot deliver the affected services; the right to remuneration remains.')
  ]);

  S('6', L('Nicht enthaltene Leistungen', 'Services not included'), [
    { ul: en ? [
      'Guest registration forms. These are captured either through the interfaces connected in Elev8 Suite or by the client.',
      'Replying to reviews and public reputation management.',
      'Active selling and upselling on commission.',
      'Issuing or correcting guest invoices.',
      'Revenue management, pricing and access to the OTA extranets. These services are not covered by this agreement; if the client orders them in addition, they are governed by a separate agreement.',
      'Any activity requiring physical presence at the property.'
    ] : [
      'Meldescheine. Diese werden entweder über die in Elev8 Suite angebundenen Schnittstellen oder durch den Kunden erfasst.',
      'Beantwortung von Bewertungen und öffentliche Reputationspflege.',
      'Aktiver Verkauf und Upselling auf Provisionsbasis.',
      'Ausstellung oder Korrektur von Gästerechnungen.',
      'Revenue Management, Preissetzung und Zugriff auf die OTA-Extranets. Diese Leistungen sind nicht Gegenstand dieses Vertrags; beauftragt der Kunde sie zusätzlich, werden sie in einem gesonderten Vertrag geregelt.',
      'Jede Tätigkeit, die körperliche Anwesenheit vor Ort erfordert.'
    ] }
  ]);

  S('7', L('Aufzeichnung von Telefonaten', 'Recording of telephone calls'), [
    P('Elevate Software AG zeichnet alle Telefonate mit Gästen auf. Der Anrufer wird zu Beginn des Gesprächs darauf hingewiesen. Willigt er in die Aufzeichnung nicht ein, stehen ihm die schriftlichen Kanäle offen: WhatsApp, E-Mail und der Chat des Buchungsportals. Ein Gespräch ohne Aufzeichnung findet nicht statt.',
      'Elevate Software AG records all telephone calls with guests. The caller is informed at the start of the call. If the caller does not consent to the recording, the written channels remain available: WhatsApp, email and the booking portal chat. Calls are not conducted without recording.'),
    P('Die Aufzeichnungen dienen der Qualitätssicherung und der Klärung von Vorfällen und werden spätestens nach 90 Tagen gelöscht.',
      'Recordings serve quality assurance and incident clarification and are deleted after 90 days at the latest.')
  ]);

  S('8', L('Vergütung', 'Remuneration'), [
    { kv: [
      [txt(L('Preis je Einheit und Monat', 'Price per unit and month'), l), money(tm.price_per_unit, tm.currency, l)],
      [txt(L('Abgerechnete Einheiten', 'Units billed'), l), ansOr(ctx, 'units')],
      [txt(L('Monatliche Vergütung', 'Monthly fee'), l), monthlyTotal(ctx)],
      [txt(L('Einmalige Einrichtung', 'One-off setup'), l),
        tm.setup_fee ? money(tm.setup_fee, tm.currency, l) : txt(L('entfällt', 'not applicable'), l)]
    ] },
    P('Als Einheit gilt jede in Elev8 Suite aktive Einheit des Kunden, unabhängig davon, wie viele Angebote daraus gebildet werden. Die Abrechnung erfolgt monatlich im Voraus, zahlbar innert 30 Tagen ab Rechnungsdatum ohne Abzug. Alle Beträge verstehen sich netto zuzüglich allfälliger Steuern und Abgaben.',
      'A unit means every unit of the client active in Elev8 Suite, regardless of how many listings are formed from it. Invoicing is monthly in advance, payable within 30 days of the invoice date without deduction. All amounts are net and exclusive of any taxes and levies.'),
    P('Ändert sich die Anzahl der Einheiten, wird taggenau pro rata abgerechnet: Jede Einheit wird ab dem Tag ihrer Aktivierung und bis zum Tag ihrer Deaktivierung in Elev8 Suite berechnet. Die Differenz erscheint auf der nächsten Rechnung.',
      'If the number of units changes, billing is pro rata on a daily basis: each unit is charged from the day it is activated until the day it is deactivated in Elev8 Suite. The difference appears on the next invoice.'),
    P('Bei Zahlungsverzug fallen Verzugszinsen in gesetzlicher Höhe an. Gerät der Kunde mit einer fälligen Zahlung mehr als 14 Tage in Verzug, ist Elevate Software AG nach einmaliger Mahnung berechtigt, die Leistungen bis zum Ausgleich auszusetzen; der Vergütungsanspruch bleibt für diesen Zeitraum bestehen. Aufrechnen darf der Kunde nur mit unbestrittenen oder rechtskräftig festgestellten Forderungen; ein Zurückbehaltungsrecht steht ihm nur wegen Ansprüchen aus diesem Vertrag zu.',
      'Late payment bears statutory default interest. If the client is more than 14 days late with a due payment, Elevate Software AG is entitled, after one reminder, to suspend the services until payment is made; the right to remuneration for that period remains. The client may set off only against undisputed or legally established claims, and may exercise a right of retention only for claims arising from this agreement.'),
    P('Elevate Software AG kann die Vergütung einmal je Kalenderjahr mit einer Frist von zwei Monaten zum Monatsende anpassen. Übersteigt die Erhöhung fünf Prozent, steht dem Kunden ein Sonderkündigungsrecht zum Wirksamwerden der Anpassung zu.',
      'Elevate Software AG may adjust the fee once per calendar year on two months’ notice to the end of a month. If the increase exceeds five percent, the client has a special right of termination effective as of the adjustment.')
  ]);

  S('9', L('Laufzeit und Kündigung', 'Term and termination'), [
    { kv: [
      [txt(L('Beginn', 'Start'), l), startText(ctx)],
      [txt(L('Mindestlaufzeit', 'Minimum term'), l),
        tm.term_months + ' ' + txt(L('Monate', 'months'), l)],
      [txt(L('Kündigungsfrist', 'Notice period'), l),
        tm.notice_months + ' ' + txt(L('Monate zum Monatsende', 'months to the end of a month'), l)]
    ] },
    P('Nach Ablauf der Mindestlaufzeit verlängert sich der Vertrag unbefristet und kann mit der genannten Frist gekündigt werden. Das Recht zur Kündigung aus wichtigem Grund bleibt beiden Parteien vorbehalten; für Elevate Software AG liegt ein wichtiger Grund insbesondere vor, wenn der Kunde seinen Mitwirkungspflichten nach Ziffer 5 trotz Aufforderung nicht nachkommt oder mit zwei Monatsvergütungen in Verzug ist. Kündigungen bedürfen der Textform.',
      'After the minimum term the agreement continues indefinitely and may be terminated on the stated notice. Both parties reserve the right to terminate for cause; for Elevate Software AG, cause exists in particular if the client fails to meet its duties to cooperate under section 5 despite a request, or is in arrears with two monthly fees. Termination requires text form.')
  ]);

  S('10', L('Haftung', 'Liability'), [
    P('Elevate Software AG haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit, für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie in den Fällen zwingender gesetzlicher Haftung.',
      'Elevate Software AG is liable without limitation for intent and gross negligence, for damage arising from injury to life, body or health, and in cases of mandatory statutory liability.'),
    P('Im Übrigen haftet Elevate Software AG nur für die Verletzung einer wesentlichen Vertragspflicht, deren Erfüllung die ordnungsgemässe Durchführung dieses Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Kunde regelmässig vertrauen darf. Die Haftung ist in diesem Fall der Höhe nach begrenzt auf den bei Vertragsschluss vorhersehbaren, vertragstypischen Schaden, höchstens jedoch auf die Nettovergütung, die der Kunde in den zwölf Monaten vor dem schädigenden Ereignis gezahlt hat.',
      'Otherwise Elevate Software AG is liable only for breach of a material contractual obligation whose fulfilment makes the proper performance of this agreement possible in the first place and on whose observance the client may regularly rely. In that case liability is limited to the damage foreseeable at the conclusion of the contract and typical for this type of contract, and in any event to the net fees paid by the client in the twelve months preceding the damaging event.'),
    P('Nicht ersetzt werden, soweit gesetzlich zulässig: entgangener Gewinn, ausgebliebene Einsparungen, mittelbare Schäden und Folgeschäden, Ansprüche Dritter, Schäden aus Bewertungen oder Rufschädigung sowie Datenverluste über den Aufwand hinaus, der bei ordnungsgemässer Datensicherung zur Wiederherstellung erforderlich gewesen wäre.',
      'To the extent permitted by law, the following are not compensated: lost profit, savings not realised, indirect and consequential damage, third-party claims, damage arising from reviews or reputational harm, and data loss beyond the effort that would have been required for restoration with proper data backup.'),
    P('Elevate Software AG haftet nicht für Entscheidungen, die der GRO innerhalb der in Ziffer 3 gesetzten Grenzen trifft; diese gelten als vom Kunden autorisiert. Ebenso wenig haftet Elevate Software AG für Folgen unvollständiger, veralteter oder unrichtiger Angaben des Kunden, für Weisungen des Kunden sowie für Ausfälle oder Fehlfunktionen von Elev8 Suite, der Buchungskanäle, der Telefonie oder anderer Leistungen Dritter.',
      'Elevate Software AG is not liable for decisions taken by the GRO within the limits set out in section 3; these are deemed authorised by the client. Nor is Elevate Software AG liable for the consequences of incomplete, outdated or incorrect information provided by the client, for the client’s instructions, or for outages or malfunctions of Elev8 Suite, the booking channels, telephony or other third-party services.'),
    P('Der Kunde stellt Elevate Software AG von Ansprüchen Dritter frei, die auf Angaben, Inhalten oder Weisungen des Kunden beruhen, soweit den Kunden ein Verschulden trifft.',
      'The client indemnifies Elevate Software AG against third-party claims based on information, content or instructions supplied by the client, to the extent the client is at fault.'),
    P('Ansprüche gegen Elevate Software AG verjähren, soweit gesetzlich zulässig, zwölf Monate nach dem Zeitpunkt, in dem der Kunde von den anspruchsbegründenden Umständen Kenntnis erlangt hat oder ohne grobe Fahrlässigkeit erlangen musste. Die vorstehenden Beschränkungen gelten auch zugunsten der Mitarbeitenden, Organe und Erfüllungsgehilfen von Elevate Software AG.',
      'Claims against Elevate Software AG become time-barred, to the extent permitted by law, twelve months after the client became aware of the circumstances giving rise to the claim or should have become aware without gross negligence. The above limitations also apply for the benefit of the employees, officers and vicarious agents of Elevate Software AG.')
  ]);

  S('11', L('Höhere Gewalt und Leistungsstörungen', 'Force majeure and disruptions'), [
    P('Ereignisse ausserhalb des Einflussbereichs von Elevate Software AG befreien sie für ihre Dauer von der Leistungspflicht, ohne dass daraus Ansprüche des Kunden entstehen. Dazu zählen insbesondere Ausfälle von Elev8 Suite oder anderer Plattformen, Störungen von Telefon- und Internetverbindungen, Stromausfälle, Streik, behördliche Massnahmen, Naturereignisse, Epidemien und kriegerische Ereignisse.',
      'Events beyond the control of Elevate Software AG release it from its obligation to perform for their duration, without giving rise to claims by the client. These include in particular outages of Elev8 Suite or other platforms, disruptions to telephone and internet connections, power failures, strikes, official measures, natural events, epidemics and acts of war.'),
    P('Dauert das Ereignis länger als 60 Tage, kann jede Partei den Vertrag mit einer Frist von 30 Tagen kündigen. Elevate Software AG darf einzelne Leistungen durch gleichwertige ersetzen und Dritte zur Leistungserbringung heranziehen.',
      'If the event lasts longer than 60 days, either party may terminate the agreement on 30 days’ notice. Elevate Software AG may replace individual services with equivalent ones and engage third parties to perform.')
  ]);

  S('12', L('Vertraulichkeit, Abwerbeverbot und Rechte', 'Confidentiality, non-solicitation and rights'), [
    P('Beide Parteien behandeln alle im Rahmen dieses Vertrags erlangten Informationen vertraulich und nutzen sie nur zur Vertragserfüllung. Die Pflicht gilt für die Dauer des Vertrags und drei Jahre darüber hinaus.',
      'Both parties treat all information obtained under this agreement as confidential and use it solely to perform the agreement. The obligation applies for the term of the agreement and for three years thereafter.'),
    P('Der Kunde wird während der Vertragsdauer und zwölf Monate danach keine Mitarbeitenden von Elevate Software AG abwerben oder beschäftigen, die für ihn tätig waren. Bei Zuwiderhandlung schuldet er eine Vertragsstrafe in Höhe von sechs Monatsvergütungen der betroffenen Person; die Geltendmachung eines weitergehenden Schadens bleibt vorbehalten.',
      'For the term of the agreement and twelve months thereafter, the client will not solicit or employ any Elevate Software AG staff who worked for it. In case of breach the client owes a contractual penalty equal to six monthly salaries of the person concerned; the right to claim further damages is reserved.'),
    P('Alle Rechte an den von Elevate Software AG eingesetzten Verfahren, Vorlagen, Textbausteinen, Auswertungen und Werkzeugen verbleiben bei Elevate Software AG. Der Kunde erhält daran für die Vertragsdauer ein einfaches, nicht übertragbares Nutzungsrecht zum vertragsgemässen Gebrauch.',
      'All rights to the procedures, templates, text modules, analyses and tools used by Elevate Software AG remain with Elevate Software AG. For the term of the agreement the client receives a simple, non-transferable right to use them as intended under this agreement.'),
    P('Elevate Software AG darf den Kunden mit Namen und Logo als Referenz nennen. Der Kunde kann dem jederzeit in Textform widersprechen.',
      'Elevate Software AG may name the client, with name and logo, as a reference. The client may object to this at any time in text form.')
  ]);

  S('13', L('Datenschutz', 'Data protection'), [
    P('Die Verarbeitung personenbezogener Daten richtet sich nach dem gesondert abgeschlossenen Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO, der Bestandteil dieses Vertrags ist. Teile des Teams arbeiten in Indonesien; die dafür erforderlichen Garantien sind dort geregelt.',
      'The processing of personal data is governed by the separately concluded data processing agreement under Art. 28 GDPR, which forms part of this agreement. Parts of the team work in Indonesia; the safeguards required for this are set out there.')
  ]);

  S('14', L('Schlussbestimmungen', 'Final provisions'), [
    P('Änderungen und Ergänzungen bedürfen der Textform. Angaben, die als vertragsrelevant gekennzeichnet sind, können nach der Unterzeichnung nur durch einen von beiden Seiten bestätigten Nachtrag geändert werden. Alle übrigen Angaben im Aufnahmeformular sind Betriebswissen und jederzeit durch den Kunden anpassbar.',
      'Amendments and additions require text form. Entries marked as contractually relevant can be changed after signature only by an addendum confirmed by both sides. All other entries in the onboarding form are operational knowledge and can be adjusted by the client at any time.'),
    P('Der Kunde kann Rechte und Pflichten aus diesem Vertrag nur mit vorheriger Zustimmung von Elevate Software AG übertragen. Elevate Software AG darf den Vertrag auf ein verbundenes Unternehmen übertragen.',
      'The client may transfer rights and obligations under this agreement only with the prior consent of Elevate Software AG. Elevate Software AG may transfer the agreement to an affiliated company.'),
    P('Sollte eine Bestimmung dieses Vertrags unwirksam sein oder werden, bleibt der Vertrag im Übrigen wirksam. Die Parteien ersetzen die unwirksame Bestimmung durch eine wirksame, die dem wirtschaftlichen Zweck am nächsten kommt; Haftungsbeschränkungen gelten im gesetzlich zulässigen Umfang fort.',
      'Should any provision of this agreement be or become invalid, the remainder of the agreement stays effective. The parties will replace the invalid provision with a valid one that comes closest to its economic purpose; limitations of liability continue to apply to the extent permitted by law.'),
    P('Dieser Vertrag liegt in deutscher und englischer Sprache vor. Verbindlich ist ausschliesslich die deutsche Fassung; die englische Fassung dient dem Verständnis.',
      'This agreement exists in German and English. Only the German version is binding; the English version serves comprehension only.'),
    P('Es gilt ' + lawText(ctx) + '. Gerichtsstand ist ' + tm.venue + '. Das UN-Kaufrecht ist ausgeschlossen.',
      lawTextEn(ctx) + ' applies. The place of jurisdiction is ' + tm.venue + '. The UN Convention on Contracts for the International Sale of Goods is excluded.')
  ]);

  return {
    key: 'gro',
    title: txt(L('Vertrag über Guest-Relations-Leistungen', 'Guest Relations Services Agreement'), l),
    subtitle: txt(L('Dienstleistungsvertrag zwischen Kunde und Elevate Software AG',
      'Service agreement between the client and Elevate Software AG'), l),
    parties: partyBlock(ctx, L('Kunde', 'Client'), L('Dienstleister', 'Service provider')),
    sections: sections,
    annexes: []
  };
}

function timeSuffix(ctx, id) {
  const v = ans(ctx, id);
  return v ? ' (' + v + ')' : '';
}
function listSuffix(ctx, id) {
  const v = ans(ctx, id);
  return v ? ' — ' + v : '';
}
function monthlyTotal(ctx) {
  const tm = ctx.terms;
  const price = parseFloat(String(tm.price_per_unit || '').replace(',', '.'));
  const units = parseInt(String((ctx.answers && ctx.answers.units) || '').replace(/\D/g, ''), 10);
  if (!price || !units) return money('', tm.currency, ctx.lang);
  const total = Math.round(price * units * 100) / 100;
  return (tm.currency || 'EUR') + ' ' + total.toFixed(2).replace('.', ctx.lang === 'en' ? '.' : ',');
}

/* ---------------- Ausgabe ---------------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function blocksHtml(blocks) {
  return (blocks || []).map(function (b) {
    if (b.p) return '<p>' + esc(b.p).replace(/\n/g, '<br>') + '</p>';
    if (b.ul) return '<ul>' + b.ul.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (b.kv) return '<dl class="kv">' + b.kv.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]).replace(/\n/g, '<br>') + '</dd>';
    }).join('') + '</dl>';
    if (b.rows) return '<table class="ctbl"><thead><tr>' +
      (b.kvHead || []).map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + b.rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    return '';
  }).join('');
}

/** Vertragskörper als HTML — für die Webansicht und als Grundlage des Hashes. */
function documentHtml(doc) {
  const parties = doc.parties.map(function (p) {
    return '<div class="party"><h4>' + esc(p.role) + '</h4>' +
      p.lines.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>';
  }).join('');
  const secs = doc.sections.map(function (s) {
    return '<section class="csec"><h3><span class="cn">' + esc(s.n) + '</span>' + esc(s.h) + '</h3>' +
      blocksHtml(s.blocks) + '</section>';
  }).join('');
  const ann = (doc.annexes || []).map(function (a) {
    return '<section class="csec annex"><h3>' + esc(a.h) + '</h3>' + blocksHtml(a.blocks) + '</section>';
  }).join('');
  return '<div class="contract"><header class="chead"><h2>' + esc(doc.title) + '</h2>' +
    (doc.subtitle ? '<p class="csub">' + esc(doc.subtitle) + '</p>' : '') +
    '<div class="parties">' + parties + '</div></header>' + secs + ann + '</div>';
}

/** Stabiler Text des Dokuments — Grundlage für den Hash der Unterschrift. */
function documentText(doc) {
  const out = [doc.title, doc.subtitle || ''];
  doc.parties.forEach(function (p) { out.push(p.role); p.lines.forEach(function (x) { out.push(x); }); });
  const blocks = function (bs) {
    (bs || []).forEach(function (b) {
      if (b.p) out.push(b.p);
      if (b.ul) b.ul.forEach(function (x) { out.push('- ' + x); });
      if (b.kv) b.kv.forEach(function (r) { out.push(r[0] + ': ' + r[1]); });
      if (b.rows) b.rows.forEach(function (r) { out.push(r.join(' | ')); });
    });
  };
  doc.sections.forEach(function (s) { out.push(s.n + '. ' + s.h); blocks(s.blocks); });
  (doc.annexes || []).forEach(function (a) { out.push(a.h); blocks(a.blocks); });
  return out.join('\n');
}

function build(kind, intake, answers, terms, lang) {
  const ctx = buildContext(intake, answers, terms, lang);
  return kind === 'avv' ? avv(ctx) : gro(ctx);
}

module.exports = {
  ELEV8, DEFAULT_TERMS, buildContext, build, avv, gro,
  subprocessors, documentHtml, documentText, today, money
};
