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

const GROUP = {
  // Schwestergesellschaft in Indonesien; dort sind die GRO- und
  // Revenue-Mitarbeitenden angestellt.
  opsName: process.env.ELEV8_OPS_NAME || 'PT Elevate Property Management',
  opsCountry: process.env.ELEV8_OPS_COUNTRY || 'Indonesien',
  opsCountryEn: process.env.ELEV8_OPS_COUNTRY_EN || 'Indonesia',
  // Öffentlich abrufbare, stets aktuelle Liste der technischen
  // Unterauftragsverarbeiter. Muss erreichbar sein - der AVV verweist darauf.
  subList: process.env.ELEV8_SUBPROCESSOR_URL || 'https://www.elev8-suite.com/subprozessoren',
  cloud: process.env.ELEV8_CLOUD || 'Google Cloud Platform',
  ticketUrl: process.env.ELEV8_SUPPORT_URL || 'https://support.elev8-suite.com',
  suspendDays: process.env.ELEV8_SUSPEND_DAYS || '10'
};

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
  platform_model: 'per_unit',
  platform_price_per_unit: '',
  platform_price_per_booking: '',
  platform_term_months: '12',
  platform_notice_months: '3',
  rm_price_per_unit: '',
  rm_tier_from: '',
  rm_tier_price: '',
  rm_term_months: '6',
  rm_notice_months: '3',
  price_per_unit: '',
  setup_fee: '',
  term_months: '12',
  notice_months: '3',
  billing: 'monthly',
  start_date: '',
  law: 'CH',
  venue: process.env.ELEV8_VENUE || 'Olten, Schweiz'
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
    P('Der Verantwortliche erteilt die allgemeine Genehmigung zur Beauftragung der in Anlage 2 aufgeführten Unterauftragsverarbeiter. Der Auftragsverarbeiter verpflichtet diese auf dieselben Datenschutzpflichten, die ihn selbst treffen; die technischen Dienstleister sind lizenzierte Whitelabel-Anbieter, mit denen inhaltsgleiche Verträge bestehen.',
      'The controller grants general authorisation for engaging the sub-processors listed in Annex 2. The processor imposes on them the same data protection obligations that apply to it; the technical providers are licensed white-label providers with whom equivalent agreements are in place.'),
    P('Die namentliche Aufstellung der technischen Dienstleister mit Sitz, Leistung und Ort der Verarbeitung ist jederzeit unter ' + GROUP.subList + ' abrufbar und ist Bestandteil dieses Vertrags. Der Verantwortliche kann dort eine Benachrichtigung über Änderungen abonnieren.',
      'The list naming the technical providers with their registered office, service and place of processing is available at any time at ' + GROUP.subList + ' and forms part of this agreement. The controller can subscribe there to notifications of changes.'),
    P('Beabsichtigte Änderungen teilt der Auftragsverarbeiter dem Verantwortlichen mindestens 30 Tage vorher in Textform mit. Der Verantwortliche kann binnen 14 Tagen aus wichtigem, datenschutzbezogenem Grund widersprechen. Bleibt der Widerspruch bestehen und lässt sich keine Lösung finden, kann jede Partei den Hauptvertrag mit einer Frist von 30 Tagen kündigen.',
      'The processor informs the controller of intended changes in text form at least 30 days in advance. The controller may object within 14 days on substantial data protection grounds. If the objection persists and no solution is found, either party may terminate the main agreement on 30 days’ notice.'),
    { kvHead: [txt(L('Unterauftragsverarbeiter', 'Sub-processor'), l), txt(L('Leistung', 'Service'), l), txt(L('Ort der Verarbeitung', 'Place of processing'), l)],
      rows: subs.map(function (x) { return [x.name, txt(x.service, l), txt(x.place, l)]; }) }
  ]);

  S('6', L('Verarbeitung in Drittländern', 'Processing in third countries'), [
    P('Der Auftragsverarbeiter hat seinen Sitz in der Schweiz. Für die Schweiz besteht ein Angemessenheitsbeschluss der Europäischen Kommission; eine Übermittlung dorthin bedarf daher keiner zusätzlichen Garantien nach Art. 46 DSGVO.',
      'The processor is established in Switzerland. An adequacy decision of the European Commission is in place for Switzerland; transfers there therefore require no additional safeguards under Art. 46 GDPR.'),
    P('Die Mitarbeitenden, die den Verantwortlichen betreuen, sind bei ' + GROUP.opsName + ' angestellt, einer Schwestergesellschaft des Auftragsverarbeiters mit Sitz in ' + GROUP.opsCountry + '. Es handelt sich um zwei getrennte Abteilungen mit unterschiedlichem Datenzugriff: Guest Relations betreut die Gästekommunikation im Regelfall rund um die Uhr, das Revenue Management arbeitet Montag bis Samstag zu Bürozeiten und ohne Zugriff auf Nachrichteninhalte, Gesprächsaufzeichnungen und Ausweisdokumente. Vertretung und Ausfallbetrieb können aus der Europäischen Union und aus der Schweiz erfolgen. Für die Übermittlung nach ' + GROUP.opsCountry + ' haben der Auftragsverarbeiter und ' + GROUP.opsName + ' die Standardvertragsklauseln der Europäischen Kommission in der Fassung des Durchführungsbeschlusses (EU) 2021/914, Modul 3 (Auftragsverarbeiter an Auftragsverarbeiter), abgeschlossen. Sie gelten zusammen mit der in Anlage 3 dokumentierten Beurteilung des Übermittlungsrisikos und den dort beschriebenen zusätzlichen Massnahmen.',
      'The staff serving the controller are employed by ' + GROUP.opsName + ', a sister company of the processor established in ' + GROUP.opsCountryEn + '. They form two separate departments with different data access: guest relations handles guest communication as a rule around the clock, while revenue management works Monday to Saturday during office hours and without access to message content, call recordings or identity documents. Cover and fallback operation may take place from the European Union and from Switzerland. For the transfer to ' + GROUP.opsCountryEn + ', the processor and ' + GROUP.opsName + ' have concluded the Standard Contractual Clauses of the European Commission as set out in Implementing Decision (EU) 2021/914, Module Three (processor to processor). They apply together with the transfer risk assessment documented in Annex 3 and the supplementary measures described there.'),
    P('Der Verantwortliche wird hiermit ausdrücklich darauf hingewiesen, dass für ' + GROUP.opsCountry + ' kein Angemessenheitsbeschluss der Europäischen Kommission vorliegt.',
      'The controller is expressly informed that no adequacy decision of the European Commission exists for ' + GROUP.opsCountryEn + '.')
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

/**
 * Unterauftragsverarbeiter. Die Schwestergesellschaft wird namentlich
 * genannt - sie stellt die Mitarbeitenden. Die technischen Dienstleister
 * stehen als Kategorie im Vertrag und namentlich in der jederzeit
 * abrufbaren Liste, auf die der Vertrag verweist. Das hält den Vertrag frei
 * von Anbieternamen und erfüllt zugleich Art. 28 Abs. 2 DSGVO.
 */
function subprocessors(ctx) {
  return [
    { name: GROUP.opsName + ' — Guest Relations',
      service: L('Gästekommunikation über die verbundenen Kanäle; im Regelfall rund um die Uhr, einschliesslich Nacht- und Wochenendschichten. Zugriff auf Gastdaten einschliesslich Kontaktdaten, Nachrichteninhalten, Gesprächsaufzeichnungen und hinterlegten Ausweisdaten.',
        'Guest communication through the connected channels; as a rule around the clock, including night and weekend shifts. Access to guest data including contact details, message content, call recordings and stored identity document data.'),
      place: L(GROUP.opsCountry + '; Vertretung und Ausfallbetrieb in der EU und/oder der Schweiz',
        GROUP.opsCountryEn + '; cover and fallback operation in the EU and/or Switzerland') },
    { name: GROUP.opsName + ' — Revenue Management',
      service: L('Preissetzung, Restriktionen und Auswertung, soweit beauftragt; Montag bis Samstag zu Bürozeiten. Zugriff auf Buchungs- und Gastprofildaten zur Segmentierung — insbesondere Reisegruppe, Herkunftsland, Sprache, Kanal, Rate, Aufenthaltsdauer und Vorlaufzeit. Kein Zugriff auf Nachrichteninhalte, Gesprächsaufzeichnungen und Ausweisdokumente.',
        'Pricing, restrictions and analysis where commissioned; Monday to Saturday during office hours. Access to booking and guest profile data for segmentation — in particular party composition, country of origin, language, channel, rate, length of stay and lead time. No access to message content, call recordings or identity documents.'),
      place: L(GROUP.opsCountry + '; Vertretung und Ausfallbetrieb in der EU und/oder der Schweiz',
        GROUP.opsCountryEn + '; cover and fallback operation in the EU and/or Switzerland') },
    { name: txt(L('Technische Dienstleister der Plattform', 'Technical platform providers'), ctx.lang),
      service: L('Hosting sowie Kanal- und Nachrichtenanbindung als lizenzierte Whitelabel-Leistungen; namentlich aufgeführt in der stets aktuellen Liste unter ' + GROUP.subList,
        'Hosting and channel and messaging connectivity as licensed white-label services; named individually in the current list at ' + GROUP.subList),
      place: L('EU, Schweiz und weitere in der Liste bezeichnete Länder',
        'EU, Switzerland and further countries named in the list') }
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
          'Separation by department: revenue management users are assigned a role without access to message content, call recordings or identity documents. The role is set on creation and reviewed quarterly.',
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
          'Trennung nach Abteilung: Benutzer des Revenue Managements erhalten eine Rolle ohne Zugriff auf Nachrichteninhalte, Gesprächsaufzeichnungen und Ausweisdokumente. Die Rolle wird beim Anlegen gesetzt und vierteljährlich überprüft.',
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
      h: txt(L('Anlage 3 — Übermittlung nach ' + GROUP.opsCountry, 'Annex 3 — Transfer to ' + GROUP.opsCountryEn), l),
      blocks: [
        { p: txt(L('Für ' + GROUP.opsCountry + ' besteht kein Angemessenheitsbeschluss. Die Übermittlung an ' + GROUP.opsName + ' stützt sich auf die zwischen dem Auftragsverarbeiter und dieser Gesellschaft abgeschlossenen Standardvertragsklauseln nach Durchführungsbeschluss (EU) 2021/914, Modul 3.',
          'No adequacy decision exists for ' + GROUP.opsCountryEn + '. The transfer to ' + GROUP.opsName + ' relies on the Standard Contractual Clauses concluded between the processor and that company under Implementing Decision (EU) 2021/914, Module Three.'), l) },
        { p: txt(L('Zusätzliche Massnahmen:', 'Supplementary measures:'), l) },
        { ul: en ? [
          'No data at rest in ' + GROUP.opsCountryEn + ': staff work exclusively inside Elev8 Suite; downloads and exports are technically restricted.',
          'Minimisation: a GRO sees only the data needed for the current request.',
          'Encryption in transit; encrypted devices with enforced screen locking.',
          'Contractual commitment to notify the controller immediately of any request from a public authority, unless prohibited by law.',
          'Annual review of the assessment, and immediately if the legal situation changes materially.'
        ] : [
          'Keine ruhende Datenhaltung in ' + GROUP.opsCountry + ': Die Mitarbeitenden arbeiten ausschliesslich in Elev8 Suite; Downloads und Exporte sind technisch eingeschränkt.',
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

/* ---------------- Rahmenvertrag Elev8 Suite ---------------- */

function platformPrice(ctx) {
  const tm = ctx.terms;
  const l = ctx.lang;
  if (tm.platform_model === 'per_booking') {
    return money(tm.platform_price_per_booking, tm.currency, l) + ' ' +
      txt(L('je bestätigter Buchung', 'per confirmed booking'), l);
  }
  return money(tm.platform_price_per_unit, tm.currency, l) + ' ' +
    txt(L('je Einheit und Monat', 'per unit and month'), l);
}

function platform(ctx) {
  const l = ctx.lang;
  const en = l === 'en';
  const tm = ctx.terms;
  const sections = [];
  const S = function (n, h, blocks) { sections.push({ n: n, h: txt(h, l), blocks: blocks }); };
  const P = function (de, enTxt) { return { p: txt(L(de, enTxt), l) }; };

  S('1', L('Vertragsgegenstand', 'Subject matter'), [
    P('Elevate Software AG stellt dem Kunden ihre Software Elev8 Suite zur Nutzung über das Internet zur Verfügung (Software as a Service). Dieser Vertrag ist der Rahmen für die Nutzung der Plattform. Einzelne Zusatzleistungen — etwa Guest Relations oder Revenue Management — werden in gesonderten Leistungsscheinen vereinbart, die auf diesen Rahmenvertrag Bezug nehmen.',
      'Elevate Software AG makes its software Elev8 Suite available to the client for use over the internet (software as a service). This agreement is the framework for using the platform. Individual additional services — such as guest relations or revenue management — are agreed in separate service schedules that refer to this framework agreement.'),
    { kv: [
      [txt(L('Kunde', 'Client'), l), orOpen(ans(ctx, 'company') || ctx.tenantName, l)],
      [txt(L('Objekt', 'Property'), l), ansOr(ctx, 'address')],
      [txt(L('Anzahl Einheiten bei Vertragsschluss', 'Number of units at signature'), l), ansOr(ctx, 'units')]
    ] }
  ]);

  S('2', L('Nutzungsrecht', 'Right of use'), [
    P('Der Kunde erhält für die Dauer einer gültigen Subscription ein nicht ausschliessliches, nicht übertragbares Recht, Elev8 Suite im vereinbarten Umfang zu nutzen. Das Recht ist inhaltlich nicht eingeschränkt, solange die Subscription gültig ist.',
      'For the duration of a valid subscription the client receives a non-exclusive, non-transferable right to use Elev8 Suite within the agreed scope. The right is not restricted in substance for as long as the subscription is valid.'),
    P('Die Zahl der Benutzerkonten ist unbegrenzt. Der Kunde verwaltet seine Benutzer selbst, verantwortet deren Berechtigungen und die Geheimhaltung der Zugangsdaten und entzieht Zugänge unverzüglich, wenn eine Person ausscheidet.',
      'The number of user accounts is unlimited. The client manages its own users, is responsible for their permissions and for keeping credentials confidential, and withdraws access without delay when a person leaves.'),
    P('Das Nutzungsrecht besteht, solange die Subscription bezahlt ist. Die Folgen einer ausbleibenden Zahlung — mehrfacher Einzugsversuch, laufende Information des Kunden und Einstellung der Leistungen nach ' + GROUP.suspendDays + ' Tagen — regelt Ziffer 5.',
      'The right of use exists for as long as the subscription is paid. The consequences of non-payment — repeated charge attempts, ongoing notification of the client and suspension of services after ' + GROUP.suspendDays + ' days — are governed by section 5.')
  ]);

  S('3', L('Verfügbarkeit und Betrieb', 'Availability and operation'), [
    P('Elev8 Suite läuft auf professioneller Infrastruktur der ' + GROUP.cloud + '. Elevate Software AG strebt eine durchgehende Verfügbarkeit an, schuldet sie jedoch nicht. Eine bestimmte Verfügbarkeit, Reaktionszeit oder Wiederherstellungszeit wird ausdrücklich nicht zugesichert.',
      'Elev8 Suite runs on professional infrastructure of ' + GROUP.cloud + '. Elevate Software AG aims for continuous availability but does not owe it. No particular availability, response time or recovery time is warranted.'),
    P('Wartungsarbeiten, Aktualisierungen und Störungen können den Zugang vorübergehend einschränken. Elevate Software AG bemüht sich, planbare Arbeiten in verkehrsarme Zeiten zu legen, ist dazu aber nicht verpflichtet.',
      'Maintenance, updates and faults may temporarily restrict access. Elevate Software AG endeavours to schedule planned work at quiet times but is not obliged to do so.')
  ]);

  S('4', L('Support', 'Support'), [
    P('Support wird über das Ticketsystem unter ' + GROUP.ticketUrl + ' geleistet. Anfragen werden in der Reihenfolge ihres Eingangs und nach Dringlichkeit bearbeitet. Ein Service Level mit zugesicherten Reaktions- oder Lösungszeiten ist nicht Bestandteil dieses Vertrags; er kann auf Wunsch gesondert und gegen Aufpreis vereinbart werden.',
      'Support is provided through the ticket system at ' + GROUP.ticketUrl + '. Requests are handled in order of receipt and by urgency. A service level with committed response or resolution times is not part of this agreement; it can be agreed separately and for an additional fee on request.')
  ]);

  S('5', L('Vergütung', 'Remuneration'), [
    { kv: [
      [txt(L('Abrechnungsmodell', 'Billing model'), l),
        txt(tm.platform_model === 'per_booking'
          ? L('pro Buchung', 'per booking')
          : L('pro Einheit', 'per unit'), l)],
      [txt(L('Preis', 'Price'), l), platformPrice(ctx)],
      [txt(L('Einheiten bei Vertragsschluss', 'Units at signature'), l), ansOr(ctx, 'units')]
    ] },
    P('Als Einheit gilt jede in Elev8 Suite aktive Einheit des Kunden, unabhängig davon, wie viele Angebote daraus gebildet werden. Alle Beträge verstehen sich netto zuzüglich allfälliger Steuern und Abgaben.',
      'A unit means every unit of the client active in Elev8 Suite, regardless of how many listings are formed from it. All amounts are net and exclusive of any taxes and levies.'),
    P('Die Abrechnung erfolgt monatlich im Voraus. Am ersten Tag jedes Monats wird die Vergütung für den kommenden Monat über die vom Kunden hinterlegte Kreditkarte eingezogen. Das gilt für sämtliche aktiven Einheiten und für alle gebuchten Module, einschliesslich der Leistungsscheine. Der Kunde hält eine gültige Kreditkarte mit ausreichender Deckung hinterlegt und aktualisiert sie unverzüglich, wenn sie abläuft, gesperrt oder ersetzt wird.',
      'Billing is monthly in advance. On the first day of each month the fee for the coming month is charged to the credit card the client has provided. This covers all active units and all booked modules, including the service schedules. The client keeps a valid credit card with sufficient funds on file and updates it without delay if it expires, is blocked or is replaced.'),
    P('Scheitert der Einzug, informiert Elevate Software AG den Kunden und wiederholt den Einzug mehrfach. Ist die Vergütung zehn Tage nach Fälligkeit weiterhin nicht vollständig beglichen, stellt Elevate Software AG die Leistungen ein und deaktiviert den Zugang, bis der Rückstand vollständig ausgeglichen ist. Der Vergütungsanspruch bleibt für diesen Zeitraum bestehen; die Daten des Kunden bleiben während der Einstellung gespeichert.',
      'If the charge fails, Elevate Software AG informs the client and retries the charge several times. If the fee is still not settled in full ten days after it fell due, Elevate Software AG suspends the services and deactivates access until the arrears are settled in full. The right to remuneration for that period remains; the client’s data stays stored during the suspension.'),
    P('Ändert sich die Anzahl der Einheiten, wird taggenau pro rata abgerechnet: Jede Einheit wird ab dem Tag ihrer Aktivierung und bis zum Tag ihrer Deaktivierung berechnet.',
      'If the number of units changes, billing is pro rata on a daily basis: each unit is charged from the day it is activated until the day it is deactivated.'),
    P('Bei Zahlungsverzug fallen Verzugszinsen in gesetzlicher Höhe an. Aufrechnen darf der Kunde nur mit unbestrittenen oder rechtskräftig festgestellten Forderungen. Elevate Software AG kann die Vergütung einmal je Kalenderjahr mit einer Frist von zwei Monaten zum Monatsende anpassen; übersteigt die Erhöhung fünf Prozent, steht dem Kunden ein Sonderkündigungsrecht zum Wirksamwerden der Anpassung zu.',
      'Late payment bears statutory default interest. The client may set off only against undisputed or legally established claims. Elevate Software AG may adjust the fee once per calendar year on two months’ notice to the end of a month; if the increase exceeds five percent, the client has a special right of termination effective as of the adjustment.')
  ]);

  S('6', L('Daten des Kunden', 'The client’s data'), [
    P('Gäste-, Reservations- und Objektdaten, die der Kunde in Elev8 Suite einstellt oder die dort für ihn entstehen, gehören dem Kunden. Elevate Software AG erwirbt daran keine Rechte und nutzt sie nur, um diesen Vertrag zu erfüllen und den Betrieb sicherzustellen.',
      'Guest, reservation and property data that the client enters into Elev8 Suite, or that arises there for the client, belongs to the client. Elevate Software AG acquires no rights to it and uses it only to perform this agreement and to ensure operation.'),
    P('Solange die Subscription gültig ist, kann der Kunde seine Daten jederzeit selbst in einem gängigen Format exportieren. Nach Vertragsende stellt Elevate Software AG die Daten auf Anfrage noch 30 Tage zum Export bereit und löscht sie danach; gesetzliche Aufbewahrungspflichten bleiben unberührt.',
      'While the subscription is valid the client can export its data at any time in a common format. After the agreement ends, Elevate Software AG keeps the data available for export for a further 30 days on request and deletes it thereafter; statutory retention obligations remain unaffected.'),
    P('Elevate Software AG darf anonymisierte, nicht auf den Kunden oder einzelne Personen rückführbare Auswertungen erstellen und zur Verbesserung und Vermarktung der Plattform verwenden.',
      'Elevate Software AG may create anonymised analyses that cannot be traced back to the client or to individuals and use them to improve and market the platform.')
  ]);

  S('7', L('Weiterentwicklung, neue Funktionen und Beta', 'Development, new features and beta'), [
    P('Elevate Software AG entwickelt Elev8 Suite eigenständig weiter und entscheidet allein über Inhalt, Umfang und Zeitpunkt von Änderungen. Neue Funktionen können einzelnen Kunden, einzelnen Kundengruppen oder allen Kunden zur Verfügung gestellt werden.',
      'Elevate Software AG develops Elev8 Suite independently and decides alone on the content, scope and timing of changes. New features may be made available to individual clients, to groups of clients or to all clients.'),
    P('Neue Funktionen können entweder ohne Zusatzkosten in das Produkt aufgenommen oder gegen Aufpreis gesondert abonniert werden. Elevate Software AG entscheidet darüber im Einzelfall.',
      'New features may either be included in the product at no extra cost or offered as a separate paid subscription. Elevate Software AG decides this case by case.'),
    P('Funktionen im Beta-Status können einzelnen Kunden oder allen Kunden zugänglich gemacht werden. Sie werden ohne Gewähr bereitgestellt, können jederzeit geändert oder eingestellt werden und begründen keinen Anspruch auf dauerhafte Verfügbarkeit.',
      'Features in beta status may be made available to individual clients or to all clients. They are provided without warranty, may be changed or discontinued at any time and give rise to no claim to permanent availability.'),
    P('Ein Anspruch darauf, dass der heutige Funktionsumfang künftig unverändert bestehen bleibt, besteht nicht. Elevate Software AG kann Funktionen ändern, ersetzen oder einstellen. Führt der Wegfall einer Funktion für den Kunden zu einer erheblichen Beeinträchtigung, steht ihm ein Sonderkündigungsrecht mit einer Frist von 30 Tagen zu.',
      'There is no claim that the current scope of functions will remain unchanged in future. Elevate Software AG may change, replace or discontinue features. If the removal of a feature significantly impairs the client, the client has a special right of termination on 30 days’ notice.')
  ]);

  S('8', L('Zulässige Nutzung', 'Permitted use'), [
    P('Der Kunde nutzt Elev8 Suite nur für den vorgesehenen Zweck und im Rahmen der gesetzlichen Bestimmungen. Er stellt sicher, dass die von ihm eingestellten Daten richtig sind und keine Rechte Dritter verletzen.',
      'The client uses Elev8 Suite only for its intended purpose and within the law. The client ensures that the data it enters is accurate and does not infringe third-party rights.'),
    P('Unzulässig ist insbesondere jede Umgehung des vereinbarten Abrechnungsmodells. Beim Modell „pro Buchung" gilt es als Umgehung, Aufenthalte statt als Buchung als manuelle Blockierung im Kalender zu erfassen. Elevate Software AG prüft die Nutzung mit automatisierten Verfahren auf solche Muster.',
      'In particular, any circumvention of the agreed billing model is prohibited. Under the "per booking" model it counts as circumvention to record stays as manual calendar blocks instead of as bookings. Elevate Software AG checks usage for such patterns using automated methods.'),
    P('Stellt Elevate Software AG eine Umgehung fest, verwarnt sie den Kunden in Textform und setzt eine Frist zur Bereinigung. Bleibt die Bereinigung aus oder wiederholt sich der Vorgang, kann Elevate Software AG die tatsächlich angefallene Vergütung nachbelasten, den Zugang deaktivieren und den Vertrag aus wichtigem Grund kündigen.',
      'If Elevate Software AG establishes circumvention, it warns the client in text form and sets a deadline for correction. If correction does not follow, or the conduct recurs, Elevate Software AG may charge the fees actually incurred, deactivate access and terminate the agreement for cause.'),
    P('Untersagt sind das Zurückentwickeln, Dekompilieren und Disassemblieren der Software, jeder Versuch, den Quellcode oder die zugrunde liegende Logik zu ermitteln, das automatisierte Auslesen über die vorgesehenen Schnittstellen hinaus sowie die Überlassung des Zugangs an Dritte ausserhalb des eigenen Betriebs. Zwingende gesetzliche Rechte bleiben unberührt.',
      'Reverse engineering, decompiling and disassembling the software, any attempt to determine the source code or underlying logic, automated extraction beyond the intended interfaces, and passing access to third parties outside the client’s own operation are prohibited. Mandatory statutory rights remain unaffected.')
  ]);

  S('9', L('Rechte an der Software', 'Rights in the software'), [
    P('Alle Rechte an Elev8 Suite, ihrer Weiterentwicklung, ihrer Gestaltung und der zugrunde liegenden Verfahren verbleiben bei Elevate Software AG. Der Kunde erhält ausschliesslich das in Ziffer 2 beschriebene Nutzungsrecht. Rückmeldungen und Verbesserungsvorschläge des Kunden darf Elevate Software AG ohne Vergütung und ohne Einschränkung verwenden.',
      'All rights in Elev8 Suite, its further development, its design and the underlying methods remain with Elevate Software AG. The client receives only the right of use described in section 2. Elevate Software AG may use the client’s feedback and suggestions without remuneration and without restriction.')
  ]);

  S('10', L('Laufzeit und Kündigung', 'Term and termination'), [
    { kv: [
      [txt(L('Mindestlaufzeit', 'Minimum term'), l),
        (tm.platform_term_months || '12') + ' ' + txt(L('Monate', 'months'), l)],
      [txt(L('Kündigungsfrist', 'Notice period'), l),
        (tm.platform_notice_months || '3') + ' ' + txt(L('Monate zum Monatsende', 'months to the end of a month'), l)]
    ] },
    P('Nach Ablauf der Mindestlaufzeit verlängert sich der Vertrag unbefristet und kann mit der genannten Frist gekündigt werden. Das Recht zur Kündigung aus wichtigem Grund bleibt beiden Parteien vorbehalten. Kündigungen bedürfen der Textform. Mit dem Ende dieses Vertrags enden auch alle Leistungsscheine, die auf ihn Bezug nehmen.',
      'After the minimum term the agreement continues indefinitely and may be terminated on the stated notice. Both parties reserve the right to terminate for cause. Termination requires text form. When this agreement ends, all service schedules referring to it end as well.')
  ]);

  S('11', L('Haftung', 'Liability'), [
    P('Elevate Software AG haftet unbeschränkt nur für Vorsatz und grobe Fahrlässigkeit, für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie in den Fällen zwingender gesetzlicher Haftung. Jede weitergehende Haftung ist im gesetzlich zulässigen Umfang ausgeschlossen.',
      'Elevate Software AG is liable without limitation only for intent and gross negligence, for damage arising from injury to life, body or health, and in cases of mandatory statutory liability. Any further liability is excluded to the extent permitted by law.'),
    P('Im Übrigen haftet Elevate Software AG nur für die Verletzung einer wesentlichen Vertragspflicht, deren Erfüllung die ordnungsgemässe Durchführung dieses Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Kunde regelmässig vertrauen darf, und der Höhe nach begrenzt auf den bei Vertragsschluss vorhersehbaren, vertragstypischen Schaden, höchstens jedoch auf die Nettovergütung der zwölf Monate vor dem schädigenden Ereignis.',
      'Otherwise Elevate Software AG is liable only for breach of a material contractual obligation whose fulfilment makes the proper performance of this agreement possible in the first place and on whose observance the client may regularly rely, limited to the damage foreseeable at conclusion of the contract and typical for this type of contract, and in any event to the net fees of the twelve months preceding the damaging event.'),
    P('Nicht ersetzt werden, soweit gesetzlich zulässig: entgangener Gewinn, ausgebliebene Einsparungen, mittelbare Schäden und Folgeschäden, Ansprüche Dritter, Schäden aus Nichtverfügbarkeit oder verzögerter Verfügbarkeit der Plattform, Schäden aus Beta-Funktionen sowie Datenverluste über den Aufwand hinaus, der bei ordnungsgemässer Datensicherung zur Wiederherstellung erforderlich gewesen wäre.',
      'To the extent permitted by law the following are not compensated: lost profit, savings not realised, indirect and consequential damage, third-party claims, damage from unavailability or delayed availability of the platform, damage from beta features, and data loss beyond the effort that would have been required for restoration with proper data backup.'),
    P('Die Software wird im jeweils verfügbaren Zustand bereitgestellt. Eine Eignung für einen bestimmten Zweck, ein bestimmter wirtschaftlicher Erfolg und die Fehlerfreiheit werden nicht zugesichert. Ansprüche gegen Elevate Software AG verjähren, soweit gesetzlich zulässig, zwölf Monate nach Kenntnis der anspruchsbegründenden Umstände. Die Beschränkungen gelten auch zugunsten der Mitarbeitenden, Organe und Erfüllungsgehilfen.',
      'The software is provided as available. Fitness for a particular purpose, a particular commercial outcome and freedom from defects are not warranted. Claims against Elevate Software AG become time-barred, to the extent permitted by law, twelve months after the client becomes aware of the circumstances giving rise to the claim. The limitations also apply for the benefit of employees, officers and vicarious agents.')
  ]);

  S('12', L('Höhere Gewalt', 'Force majeure'), [
    P('Ereignisse ausserhalb des Einflussbereichs von Elevate Software AG befreien sie für ihre Dauer von der Leistungspflicht, ohne dass daraus Ansprüche des Kunden entstehen. Dazu zählen insbesondere Ausfälle der eingesetzten Infrastruktur, Störungen von Internetverbindungen, Stromausfälle, Streik, behördliche Massnahmen, Naturereignisse, Epidemien und kriegerische Ereignisse. Dauert das Ereignis länger als 60 Tage, kann jede Partei den Vertrag mit einer Frist von 30 Tagen kündigen.',
      'Events beyond the control of Elevate Software AG release it from its obligation to perform for their duration, without giving rise to claims by the client. These include in particular outages of the infrastructure used, disruptions to internet connections, power failures, strikes, official measures, natural events, epidemics and acts of war. If the event lasts longer than 60 days, either party may terminate the agreement on 30 days’ notice.')
  ]);

  S('13', L('Vertraulichkeit und Abwerbeverbot', 'Confidentiality and non-solicitation'), [
    P('Beide Parteien behandeln alle im Rahmen dieses Vertrags erlangten Informationen vertraulich und nutzen sie nur zur Vertragserfüllung. Die Pflicht gilt für die Dauer des Vertrags und drei Jahre darüber hinaus.',
      'Both parties treat all information obtained under this agreement as confidential and use it solely to perform the agreement. The obligation applies for the term of the agreement and for three years thereafter.'),
    P('Der Kunde wird während der Vertragsdauer und zwölf Monate danach keine Mitarbeitenden von Elevate Software AG oder ihrer verbundenen Gesellschaften abwerben oder beschäftigen, die für ihn tätig waren. Bei Zuwiderhandlung schuldet er eine Vertragsstrafe in Höhe von sechs Monatsvergütungen der betroffenen Person; die Geltendmachung eines weitergehenden Schadens bleibt vorbehalten.',
      'For the term of the agreement and twelve months thereafter, the client will not solicit or employ any staff of Elevate Software AG or its affiliated companies who worked for it. In case of breach the client owes a contractual penalty equal to six monthly salaries of the person concerned; the right to claim further damages is reserved.'),
    P('Elevate Software AG darf den Kunden mit Namen und Logo als Referenz nennen. Der Kunde kann dem jederzeit in Textform widersprechen.',
      'Elevate Software AG may name the client, with name and logo, as a reference. The client may object to this at any time in text form.')
  ]);

  S('14', L('Datenschutz', 'Data protection'), [
    P('Die Verarbeitung personenbezogener Daten richtet sich nach dem gesondert abgeschlossenen Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO, der Bestandteil dieses Vertrags ist und für die Plattform ebenso wie für alle Leistungsscheine gilt.',
      'The processing of personal data is governed by the separately concluded data processing agreement under Art. 28 GDPR, which forms part of this agreement and applies to the platform as well as to all service schedules.')
  ]);

  S('15', L('Schlussbestimmungen', 'Final provisions'), [
    P('Änderungen und Ergänzungen bedürfen der Textform. Der Kunde kann Rechte und Pflichten aus diesem Vertrag nur mit vorheriger Zustimmung von Elevate Software AG übertragen; Elevate Software AG darf den Vertrag auf ein verbundenes Unternehmen übertragen.',
      'Amendments and additions require text form. The client may transfer rights and obligations under this agreement only with the prior consent of Elevate Software AG; Elevate Software AG may transfer the agreement to an affiliated company.'),
    P('Bei Widersprüchen gilt: Dieser Rahmenvertrag geht einem Leistungsschein vor, soweit der Leistungsschein nicht ausdrücklich etwas anderes bestimmt. In Datenschutzfragen geht der Vertrag zur Auftragsverarbeitung beiden vor.',
      'In case of conflict: this framework agreement prevails over a service schedule unless the service schedule expressly provides otherwise. On data protection matters the data processing agreement prevails over both.'),
    P('Sollte eine Bestimmung unwirksam sein oder werden, bleibt der Vertrag im Übrigen wirksam; Haftungsbeschränkungen gelten im gesetzlich zulässigen Umfang fort.',
      'Should any provision be or become invalid, the remainder of the agreement stays effective; limitations of liability continue to apply to the extent permitted by law.'),
    P('Dieser Vertrag liegt in deutscher und englischer Sprache vor. Verbindlich ist ausschliesslich die deutsche Fassung; die englische Fassung dient dem Verständnis.',
      'This agreement exists in German and English. Only the German version is binding; the English version serves comprehension only.'),
    P('Es gilt ' + lawText(ctx) + '. Gerichtsstand ist ' + tm.venue + '. Das UN-Kaufrecht ist ausgeschlossen.',
      lawTextEn(ctx) + ' applies. The place of jurisdiction is ' + tm.venue + '. The UN Convention on Contracts for the International Sale of Goods is excluded.')
  ]);

  return {
    key: 'platform',
    title: txt(L('Rahmenvertrag Elev8 Suite', 'Elev8 Suite Framework Agreement'), l),
    subtitle: txt(L('Nutzung der Plattform als Software as a Service',
      'Use of the platform as software as a service'), l),
    parties: partyBlock(ctx, L('Kunde', 'Client'), L('Anbieter', 'Provider')),
    sections: sections,
    annexes: []
  };
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

  S('1', L('Gegenstand und Verhältnis zum Rahmenvertrag', 'Subject matter and relation to the framework agreement'), [
    P('Dieser Leistungsschein ergänzt den zwischen den Parteien geschlossenen Rahmenvertrag Elev8 Suite und gilt nur zusammen mit ihm. Soweit hier nichts Abweichendes geregelt ist, gelten die Bestimmungen des Rahmenvertrags, insbesondere zu Vergütungsmodalitäten, Haftung, höherer Gewalt, Vertraulichkeit, Abwerbeverbot, anwendbarem Recht und Gerichtsstand.',
      'This service schedule supplements the Elev8 Suite framework agreement concluded between the parties and applies only together with it. Unless otherwise provided here, the provisions of the framework agreement apply, in particular on payment terms, liability, force majeure, confidentiality, non-solicitation, applicable law and jurisdiction.'),
    P('Elevate Software AG erbringt für den Kunden Guest-Relations-Leistungen. Sie erbringt diese Leistungen über ihre Plattform Elev8 Suite. Ein Guest Relations Officer (nachfolgend „GRO") führt die Kommunikation mit den Gästen des Kunden im Namen und im Auftrag des Kunden. Der GRO tritt gegenüber Gästen unter dem vom Kunden bestimmten Namen auf. Die betreuenden Guest Relations Officer sind bei ' + GROUP.opsName + ' angestellt, einer Schwestergesellschaft von Elevate Software AG, und gehören dort der Abteilung Guest Relations an.',
      'Elevate Software AG provides guest relations services to the client. It delivers those services through its platform, Elev8 Suite. A Guest Relations Officer (“GRO”) handles communication with the client’s guests in the client’s name and on the client’s behalf. Towards guests the GRO appears under the name specified by the client. The Guest Relations Officers serving the client are employed by ' + GROUP.opsName + ', a sister company of Elevate Software AG, in its guest relations department.'),
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
    P('Als Einheit gilt jede in Elev8 Suite aktive Einheit des Kunden, unabhängig davon, wie viele Angebote daraus gebildet werden. Alle Beträge verstehen sich netto zuzüglich allfälliger Steuern und Abgaben. Der Einzug erfolgt zusammen mit der Vergütung für die Plattform am ersten Tag jedes Monats für den kommenden Monat über die hinterlegte Kreditkarte.',
      'A unit means every unit of the client active in Elev8 Suite, regardless of how many listings are formed from it. All amounts are net and exclusive of any taxes and levies. The charge is made together with the platform fee on the first day of each month for the coming month, to the credit card on file.'),
    P('Ändert sich die Anzahl der Einheiten, wird taggenau pro rata abgerechnet: Jede Einheit wird ab dem Tag ihrer Aktivierung und bis zum Tag ihrer Deaktivierung in Elev8 Suite berechnet. Die Differenz erscheint auf der nächsten Rechnung.',
      'If the number of units changes, billing is pro rata on a daily basis: each unit is charged from the day it is activated until the day it is deactivated in Elev8 Suite. The difference appears on the next invoice.'),
    P('Zahlungsmodalitäten, Verzugsfolgen und Preisanpassung richten sich nach dem Rahmenvertrag Elev8 Suite.',
      'Payment terms, consequences of default and price adjustment are governed by the Elev8 Suite framework agreement.')
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
    P('Es gilt die Haftungsregelung des Rahmenvertrags Elev8 Suite. Ergänzend gilt für diesen Leistungsschein:',
      'The liability provisions of the Elev8 Suite framework agreement apply. In addition, the following applies to this service schedule:'),
    { ul: en ? [
      'Decisions taken by the GRO within the limits set out in section 3 are deemed authorised by the client and do not give rise to liability on the part of Elevate Software AG.',
      'Elevate Software AG is not liable for the consequences of incomplete, outdated or incorrect information provided by the client, nor for the client’s instructions.',
      'Elevate Software AG is not liable for outages or malfunctions of the booking channels, telephony or other third-party services.',
      'No particular commercial outcome is owed, in particular no rating, response time or occupancy.',
      'The client indemnifies Elevate Software AG against third-party claims based on information, content or instructions supplied by the client, to the extent the client is at fault.'
    ] : [
      'Entscheidungen, die der GRO innerhalb der in Ziffer 3 gesetzten Grenzen trifft, gelten als vom Kunden autorisiert und begründen keine Haftung von Elevate Software AG.',
      'Elevate Software AG haftet nicht für Folgen unvollständiger, veralteter oder unrichtiger Angaben des Kunden und nicht für Weisungen des Kunden.',
      'Elevate Software AG haftet nicht für Ausfälle oder Fehlfunktionen der Buchungskanäle, der Telefonie oder anderer Leistungen Dritter.',
      'Ein bestimmter wirtschaftlicher Erfolg wird nicht geschuldet, insbesondere keine Bewertung, keine Antwortzeit und keine Auslastung.',
      'Der Kunde stellt Elevate Software AG von Ansprüchen Dritter frei, die auf Angaben, Inhalten oder Weisungen des Kunden beruhen, soweit den Kunden ein Verschulden trifft.'
    ] }
  ]);

  S('11', L('Schlussbestimmungen', 'Final provisions'), [
    P('Änderungen und Ergänzungen bedürfen der Textform. Angaben, die als vertragsrelevant gekennzeichnet sind, können nach der Unterzeichnung nur durch einen von beiden Seiten bestätigten Nachtrag geändert werden. Alle übrigen Angaben im Aufnahmeformular sind Betriebswissen und jederzeit durch den Kunden anpassbar.',
      'Amendments and additions require text form. Entries marked as contractually relevant can be changed after signature only by an addendum confirmed by both sides. All other entries in the onboarding form are operational knowledge and can be adjusted by the client at any time.'),
    P('Bei Widersprüchen geht der Rahmenvertrag diesem Leistungsschein vor, soweit hier nicht ausdrücklich etwas anderes bestimmt ist. In Datenschutzfragen geht der Vertrag zur Auftragsverarbeitung beiden vor.',
      'In case of conflict the framework agreement prevails over this service schedule unless expressly provided otherwise here. On data protection matters the data processing agreement prevails over both.'),
    P('Dieser Leistungsschein liegt in deutscher und englischer Sprache vor. Verbindlich ist ausschliesslich die deutsche Fassung; die englische Fassung dient dem Verständnis.',
      'This service schedule exists in German and English. Only the German version is binding; the English version serves comprehension only.')
  ]);

  return {
    key: 'gro',
    title: txt(L('Leistungsschein Guest Relations', 'Guest Relations Service Schedule'), l),
    subtitle: txt(L('Zum Rahmenvertrag Elev8 Suite', 'To the Elev8 Suite framework agreement'), l),
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

/* ---------------- Leistungsschein Revenue Management ---------------- */

function rmPrice(ctx) {
  const tm = ctx.terms;
  const l = ctx.lang;
  const base = money(tm.rm_price_per_unit, tm.currency, l) + ' ' +
    txt(L('je Einheit und Monat', 'per unit and month'), l);
  if (String(tm.rm_tier_from || '').trim() && String(tm.rm_tier_price || '').trim()) {
    return base + '; ' + txt(L('ab ' + tm.rm_tier_from + ' Einheiten ' +
      money(tm.rm_tier_price, tm.currency, l) + ' je Einheit und Monat',
      'from ' + tm.rm_tier_from + ' units ' + money(tm.rm_tier_price, tm.currency, l) +
      ' per unit and month'), l);
  }
  return base;
}

function rm(ctx) {
  const l = ctx.lang;
  const en = l === 'en';
  const tm = ctx.terms;
  const sections = [];
  const S = function (n, h, blocks) { sections.push({ n: n, h: txt(h, l), blocks: blocks }); };
  const P = function (de, enTxt) { return { p: txt(L(de, enTxt), l) }; };

  S('1', L('Gegenstand und Verhältnis zum Rahmenvertrag', 'Subject matter and relation to the framework agreement'), [
    P('Dieser Leistungsschein ergänzt den zwischen den Parteien geschlossenen Rahmenvertrag Elev8 Suite und gilt nur zusammen mit ihm. Soweit hier nichts Abweichendes geregelt ist, gelten die Bestimmungen des Rahmenvertrags, insbesondere zu Zahlung und Einzug, Haftung, höherer Gewalt, Vertraulichkeit, Abwerbeverbot, anwendbarem Recht und Gerichtsstand.',
      'This service schedule supplements the Elev8 Suite framework agreement concluded between the parties and applies only together with it. Unless otherwise provided here, the provisions of the framework agreement apply, in particular on payment and collection, liability, force majeure, confidentiality, non-solicitation, applicable law and jurisdiction.'),
    P('Elevate Software AG übernimmt für den Kunden das Revenue Management der in Elev8 Suite verbundenen Einheiten. Die Arbeit leistet ein Revenue Manager. Das Revenue Management ist eine von der Gästebetreuung getrennte Abteilung bei ' + GROUP.opsName + ' mit eigenem, eingeschränktem Zugang: Es sieht Buchungs- und Gastprofildaten zur Segmentierung, jedoch keine Nachrichteninhalte, Gesprächsaufzeichnungen oder Ausweisdokumente.',
      'Elevate Software AG takes on revenue management for the client for the units connected in Elev8 Suite. The work is performed by a revenue manager. Revenue management is a department at ' + GROUP.opsName + ' separate from guest relations, with its own restricted access: it sees booking and guest profile data for segmentation, but no message content, call recordings or identity documents.'),
    { kv: [
      [txt(L('Objekt', 'Property'), l), ansOr(ctx, 'address')],
      [txt(L('Anzahl Einheiten', 'Number of units'), l), ansOr(ctx, 'units')],
      [txt(L('Optimierungsziel', 'Optimisation goal'), l), ansOr(ctx, 'rm_goal')],
      [txt(L('Zielauslastung', 'Target occupancy'), l), ansOr(ctx, 'rm_target_occupancy')],
      [txt(L('Leistungsbeginn', 'Start of service'), l), startText(ctx)]
    ] }
  ]);

  S('2', L('Leistungsumfang', 'Scope of services'), [
    P('Ab Vertragsbeginn:', 'From the start of the agreement:'),
    { ul: en ? [
      'Daily pricing for all connected units within the agreed corridor.',
      'Minimum stay, lead-time rules and arrival and departure restrictions within the agreed ranges.',
      'Season and event calendar, maintenance of the price curve.',
      'Targeted pricing of orphan gaps — single nights between bookings.',
      'Discount ladders for last-minute, early-bird and long stays within the agreed limits.',
      'Monitoring of rate parity across the connected channels.',
      'Maintenance of rate plans and cancellation terms in Elev8 Suite.',
      'Regular report with pace, forecast and recommendations.'
    ] : [
      'Tagesaktuelle Preissetzung für alle verbundenen Einheiten innerhalb des vereinbarten Korridors.',
      'Mindestaufenthalt, Vorlauffristen sowie An- und Abreisebeschränkungen innerhalb der vereinbarten Spannen.',
      'Saison- und Ereigniskalender, Pflege der Preiskurve.',
      'Gezielte Bepreisung von Orphan Gaps — Einzelnächten zwischen Buchungen.',
      'Rabattleitern für Last Minute, Frühbucher und Langzeit innerhalb der vereinbarten Grenzen.',
      'Überwachung der Preisparität über die verbundenen Kanäle.',
      'Pflege von Rate-Plans und Stornobedingungen in Elev8 Suite.',
      'Regelmässiger Bericht mit Pace, Forecast und Empfehlungen.'
    ] },
    P('Ab Verfügbarkeit der Content-Schnittstelle zu den Buchungsportalen, ohne Preisänderung und ohne Nachtrag:',
      'From the availability of the content interface to the booking portals, at no change in price and without an addendum:'),
    { ul: en ? [
      'Maintenance of titles, descriptions and amenity attributes on the connected channels.',
      'Uploading and ordering of image material supplied by the client.',
      'Ongoing observation of visibility factors and recommendations derived from them.'
    ] : [
      'Pflege von Titeln, Beschreibungen und Ausstattungsmerkmalen auf den verbundenen Kanälen.',
      'Einspielen und Sortieren des vom Kunden gelieferten Bildmaterials.',
      'Laufende Beobachtung der Sichtbarkeitsfaktoren und daraus abgeleitete Empfehlungen.'
    ] },
    P('Elevate Software AG nennt keinen Termin für die Verfügbarkeit der Schnittstelle und schuldet sie nicht. Bis dahin bleibt die Vergütung unverändert; ein Abzug wegen noch nicht aktivierter Leistungen ist ausgeschlossen.',
      'Elevate Software AG names no date for the availability of the interface and does not owe it. Until then the fee remains unchanged; a deduction for services not yet activated is excluded.'),
    { kv: [
      [txt(L('Preispflege', 'Price maintenance'), l),
        txt(L('täglich automatisiert, wöchentlich durch einen Revenue Manager geprüft',
          'automated daily, reviewed weekly by a revenue manager'), l)],
      [txt(L('Arbeitszeiten Revenue Management', 'Revenue management working hours'), l),
        txt(L('Montag bis Samstag zu Bürozeiten', 'Monday to Saturday during office hours'), l)]
    ] }
  ]);

  S('3', L('Der Preiskorridor', 'The price corridor'), [
    P('Der Kunde legt für jede Einheit einen Mindestpreis, einen Basispreis und einen Höchstpreis fest. Elevate Software AG unterbreitet dazu einen Vorschlag aus der Historie des Kunden und aus Marktdaten; die Entscheidung trifft der Kunde. Der festgelegte Korridor ist Anlage 1 dieses Leistungsscheins.',
      'For each unit the client sets a minimum price, a base price and a maximum price. Elevate Software AG submits a proposal based on the client’s history and on market data; the decision is the client’s. The agreed corridor is Annex 1 to this service schedule.'),
    P('Innerhalb des Korridors handelt Elevate Software AG ohne Rückfrage. Den Korridor selbst verschiebt sie nie ohne Freigabe des Kunden.',
      'Within the corridor Elevate Software AG acts without asking. It never moves the corridor itself without the client’s approval.'),
    { kvHead: [txt(L('Gegenstand', 'Matter'), l), txt(L('Ohne Rückfrage', 'Without asking'), l), txt(L('Freigabe nötig', 'Approval required'), l)],
      rows: (en ? [
        ['Daily price within minimum and maximum', 'yes', ''],
        ['Base price and season curve', 'yes', ''],
        ['Minimum stay, lead times, arrival and departure days', 'yes', ''],
        ['Orphan gap pricing', 'yes', ''],
        ['Discount ladders within the agreed limit', 'yes', ''],
        ['Changing the minimum or maximum price itself', '', 'yes'],
        ['Opening or closing a channel', '', 'yes'],
        ['Changing cancellation terms', '', 'yes'],
        ['Changing the cleaning fee or ancillary charges', '', 'yes'],
        ['Creating or deleting a rate plan', '', 'yes']
      ] : [
        ['Tagespreis innerhalb von Minimum und Maximum', 'ja', ''],
        ['Basispreis und Saisonkurve', 'ja', ''],
        ['Mindestaufenthalt, Vorlauffristen, An- und Abreisetage', 'ja', ''],
        ['Bepreisung von Orphan Gaps', 'ja', ''],
        ['Rabattleitern innerhalb der vereinbarten Grenze', 'ja', ''],
        ['Minimum oder Maximum selbst verändern', '', 'ja'],
        ['Kanal öffnen oder schliessen', '', 'ja'],
        ['Stornobedingungen ändern', '', 'ja'],
        ['Reinigungsgebühr oder Nebenkosten ändern', '', 'ja'],
        ['Rate-Plan anlegen oder löschen', '', 'ja']
      ]) },
    { kv: [
      [txt(L('Spanne Mindestaufenthalt', 'Minimum stay range'), l), ansOr(ctx, 'rm_minstay')],
      [txt(L('Maximaler Rabatt', 'Maximum discount'), l), ansOr(ctx, 'rm_discount_max')],
      [txt(L('Last Minute', 'Last minute'), l), ansOr(ctx, 'rm_lastminute')],
      [txt(L('Frühbucher', 'Early bird'), l), ansOr(ctx, 'rm_earlybird')],
      [txt(L('Preisparität', 'Rate parity'), l), ansOr(ctx, 'rm_parity')]
    ] },
    P('Der Korridor gilt unbefristet. Einmal jährlich unterbreitet Elevate Software AG einen Vorschlag zur Anpassung; bis zur Freigabe durch den Kunden gilt der bisherige Korridor weiter.',
      'The corridor applies indefinitely. Once a year Elevate Software AG submits a proposal for adjustment; until the client approves it, the existing corridor continues to apply.')
  ]);

  S('4', L('Eingriffe des Kunden', 'Client interventions'), [
    P('Der Kunde darf jederzeit selbst Preise, Restriktionen oder Verfügbarkeiten setzen. Für die betroffenen Einheiten und Zeiträume entfällt dadurch jede Zielzusage von Elevate Software AG. Jeder Eingriff wird im Bericht mit Datum, Einheit und geschätzter Auswirkung ausgewiesen.',
      'The client may set prices, restrictions or availability at any time. For the units and periods concerned, any target commitment by Elevate Software AG lapses. Every intervention is shown in the report with date, unit and estimated effect.')
  ]);

  S('5', L('Eskalation', 'Escalation'), [
    P('Weicht die Belegung der kommenden 30 Tage um mehr als 15 Prozentpunkte vom Vorjahreswert oder vom Forecast ab, meldet Elevate Software AG dies innerhalb von drei Werktagen in Textform und unterbreitet einen Vorschlag. Unabhängig davon meldet sie erkannte Paritätsverstösse und technische Störungen der Preisverteilung unverzüglich.',
      'If occupancy for the coming 30 days deviates by more than 15 percentage points from the previous year or from the forecast, Elevate Software AG reports this in text form within three working days and submits a proposal. Independently of this it reports detected parity breaches and technical failures in price distribution without delay.')
  ]);

  S('6', L('Berichtswesen', 'Reporting'), [
    { kv: [
      [txt(L('Rhythmus', 'Frequency'), l), ansOr(ctx, 'rm_report_rhythm')],
      [txt(L('Empfänger', 'Recipient'), l), ansOr(ctx, 'rm_report_to')]
    ] },
    P('Der Bericht enthält Kernzahlen gegen Vormonat und Vorjahr, die Belegungsentwicklung für die kommenden 30, 60 und 90 Tage, den Kanalmix, die stärksten und schwächsten Einheiten, einen Marktvergleich, die durchgeführten Massnahmen, die Eingriffe des Kunden sowie Empfehlungen. Kennzahlen, die Elev8 Suite nicht zuverlässig liefert — derzeit der Bewertungsschnitt — sind nicht Bestandteil des Berichts.',
      'The report contains key figures against the previous month and previous year, the occupancy pace for the coming 30, 60 and 90 days, the channel mix, the strongest and weakest units, a market comparison, the measures taken, the client’s interventions and recommendations. Key figures that Elev8 Suite does not deliver reliably — currently the average review score — are not part of the report.')
  ]);

  S('7', L('Mitwirkungspflichten des Kunden', 'Client’s duties to cooperate'), [
    { ul: en ? [
      'Set the corridor per unit and approve adjustments without undue delay.',
      'Conclude and maintain the contracts with the booking portals; Elevate Software AG does not act as a contracting party towards the portals.',
      'Keep unit data in Elev8 Suite current and remove units that are no longer let, so that reports are not distorted.',
      'Supply image material and, where required, texts for the content services.',
      'Report offline bookings, owner stays and blocks promptly.'
    ] : [
      'Den Korridor je Einheit festlegen und Anpassungen ohne unnötige Verzögerung freigeben.',
      'Die Verträge mit den Buchungsportalen selbst schliessen und unterhalten; Elevate Software AG tritt gegenüber den Portalen nicht als Vertragspartei auf.',
      'Die Einheitendaten in Elev8 Suite aktuell halten und nicht mehr vermietete Einheiten entfernen, damit die Auswertungen nicht verzerrt werden.',
      'Bildmaterial und, soweit erforderlich, Texte für die Content-Leistungen liefern.',
      'Offline-Buchungen, Eigennutzung und Blockierungen zeitnah erfassen.'
    ] }
  ]);

  S('8', L('Nicht enthaltene Leistungen', 'Services not included'), [
    { ul: en ? [
      'Guest communication — that is the subject of the guest relations service schedule.',
      'Photo production and copywriting in foreign languages.',
      'Concluding contracts with booking portals.',
      'Any guarantee of a particular ranking, occupancy, average rate or revenue.',
      'Handing over the pricing tool or an account in it.'
    ] : [
      'Gästekommunikation — dafür gilt der Leistungsschein Guest Relations.',
      'Fotoproduktion und Texterstellung in Fremdsprachen.',
      'Abschluss von Verträgen mit Buchungsportalen.',
      'Jede Garantie für ein bestimmtes Ranking, eine Auslastung, einen Durchschnittspreis oder einen Umsatz.',
      'Herausgabe des Preiswerkzeugs oder eines Zugangs dazu.'
    ] }
  ]);

  S('9', L('Werkzeuge und Arbeitsergebnisse', 'Tools and work product'), [
    P('Elevate Software AG setzt zur Preissetzung eigene Werkzeuge und Verfahren ein und betreibt sie auf eigene Rechnung. Ein Zugang des Kunden zu diesen Werkzeugen ist nicht Gegenstand dieses Leistungsscheins.',
      'Elevate Software AG uses its own tools and methods for pricing and operates them at its own expense. Client access to those tools is not part of this service schedule.'),
    P('Die Buchungs-, Gast- und Objektdaten des Kunden gehören ihm; das regelt der Rahmenvertrag. Die von Elevate Software AG daraus abgeleiteten Preisparameter, Regelwerke, Vergleichsgruppen und Auswertungsmethoden sind demgegenüber Arbeitsergebnis von Elevate Software AG und verbleiben bei ihr. Nach Vertragsende erhält der Kunde auf Anfrage die zuletzt gültigen Preise und den Korridor in einem gängigen Format.',
      'The client’s booking, guest and property data belongs to the client; this is governed by the framework agreement. By contrast, the pricing parameters, rule sets, comparison groups and analysis methods derived from it by Elevate Software AG are its work product and remain with it. After the agreement ends, the client receives on request the last valid prices and the corridor in a common format.')
  ]);

  S('10', L('Vergütung', 'Remuneration'), [
    { kv: [
      [txt(L('Preis', 'Price'), l), rmPrice(ctx)],
      [txt(L('Abgerechnete Einheiten', 'Units billed'), l), ansOr(ctx, 'units')],
      [txt(L('Monatliche Vergütung', 'Monthly fee'), l), rmTotal(ctx)]
    ] },
    P('Die Vergütung wird zusammen mit der Vergütung für die Plattform am ersten Tag jedes Monats für den kommenden Monat über die hinterlegte Kreditkarte eingezogen. Die Werkzeugkosten sind darin enthalten. Ändert sich die Anzahl der Einheiten, wird taggenau pro rata abgerechnet. Im Übrigen gilt Ziffer 5 des Rahmenvertrags.',
      'The fee is charged together with the platform fee on the first day of each month for the coming month, to the credit card on file. Tool costs are included. If the number of units changes, billing is pro rata on a daily basis. Section 5 of the framework agreement applies in all other respects.')
  ]);

  S('11', L('Laufzeit und Kündigung', 'Term and termination'), [
    { kv: [
      [txt(L('Beginn', 'Start'), l), startText(ctx)],
      [txt(L('Mindestlaufzeit', 'Minimum term'), l),
        (tm.rm_term_months || '6') + ' ' + txt(L('Monate', 'months'), l)],
      [txt(L('Kündigungsfrist', 'Notice period'), l),
        (tm.rm_notice_months || '3') + ' ' + txt(L('Monate zum Monatsende', 'months to the end of a month'), l)]
    ] },
    P('Die Mindestlaufzeit trägt dem Umstand Rechnung, dass Preisstrategie erst über das Buchungsfenster wirkt. Nach ihrem Ablauf verlängert sich der Leistungsschein unbefristet und kann mit der genannten Frist gekündigt werden. Mit dem Ende des Rahmenvertrags endet auch dieser Leistungsschein.',
      'The minimum term reflects the fact that pricing strategy only takes effect over the booking window. After it expires the service schedule continues indefinitely and may be terminated on the stated notice. When the framework agreement ends, this service schedule ends as well.')
  ]);

  S('12', L('Haftung', 'Liability'), [
    P('Es gilt die Haftungsregelung des Rahmenvertrags Elev8 Suite. Ergänzend gilt für diesen Leistungsschein:',
      'The liability provisions of the Elev8 Suite framework agreement apply. In addition, the following applies to this service schedule:'),
    { ul: en ? [
      'Pricing decisions taken within the corridor set out in section 3 are deemed authorised by the client.',
      'No particular commercial outcome is owed — in particular no occupancy, no average rate, no revenue and no ranking.',
      'Elevate Software AG is not liable for the consequences of incorrect or outdated data supplied by the client, nor for its interventions under section 4.',
      'Elevate Software AG is not liable for outages or malfunctions of the booking channels, the channel connection or the pricing tool.',
      'Market data and forecasts are estimates; no liability attaches to their accuracy.'
    ] : [
      'Preisentscheidungen innerhalb des Korridors nach Ziffer 3 gelten als vom Kunden autorisiert.',
      'Ein bestimmter wirtschaftlicher Erfolg wird nicht geschuldet — insbesondere keine Auslastung, kein Durchschnittspreis, kein Umsatz und kein Ranking.',
      'Elevate Software AG haftet nicht für Folgen unrichtiger oder veralteter Daten des Kunden und nicht für dessen Eingriffe nach Ziffer 4.',
      'Elevate Software AG haftet nicht für Ausfälle oder Fehlfunktionen der Buchungskanäle, der Kanalanbindung oder des Preiswerkzeugs.',
      'Marktdaten und Prognosen sind Schätzungen; für ihre Richtigkeit wird nicht gehaftet.'
    ] }
  ]);

  S('13', L('Schlussbestimmungen', 'Final provisions'), [
    P('Änderungen und Ergänzungen bedürfen der Textform. Angaben, die als vertragsrelevant gekennzeichnet sind, können nach der Unterzeichnung nur durch einen von beiden Seiten bestätigten Nachtrag geändert werden. Der Preiskorridor in Anlage 1 wird abweichend davon durch die in Ziffer 3 beschriebene Freigabe angepasst.',
      'Amendments and additions require text form. Entries marked as contractually relevant can be changed after signature only by an addendum confirmed by both sides. By way of exception, the price corridor in Annex 1 is adjusted through the approval process described in section 3.'),
    P('Bei Widersprüchen geht der Rahmenvertrag diesem Leistungsschein vor, soweit hier nicht ausdrücklich etwas anderes bestimmt ist. In Datenschutzfragen geht der Vertrag zur Auftragsverarbeitung beiden vor.',
      'In case of conflict the framework agreement prevails over this service schedule unless expressly provided otherwise here. On data protection matters the data processing agreement prevails over both.'),
    P('Dieser Leistungsschein liegt in deutscher und englischer Sprache vor. Verbindlich ist ausschliesslich die deutsche Fassung; die englische Fassung dient dem Verständnis.',
      'This service schedule exists in German and English. Only the German version is binding; the English version serves comprehension only.')
  ]);

  return {
    key: 'rm',
    title: txt(L('Leistungsschein Revenue Management', 'Revenue Management Service Schedule'), l),
    subtitle: txt(L('Zum Rahmenvertrag Elev8 Suite', 'To the Elev8 Suite framework agreement'), l),
    parties: partyBlock(ctx, L('Kunde', 'Client'), L('Dienstleister', 'Service provider')),
    sections: sections,
    annexes: corridorAnnex(ctx)
  };
}

function rmTotal(ctx) {
  const tm = ctx.terms;
  const units = parseInt(String((ctx.answers && ctx.answers.units) || '').replace(/\D/g, ''), 10);
  const tierFrom = parseInt(String(tm.rm_tier_from || '').replace(/\D/g, ''), 10);
  const rate = (units && tierFrom && units >= tierFrom && String(tm.rm_tier_price || '').trim())
    ? parseFloat(String(tm.rm_tier_price).replace(',', '.'))
    : parseFloat(String(tm.rm_price_per_unit || '').replace(',', '.'));
  if (!rate || !units) return money('', tm.currency, ctx.lang);
  const total = Math.round(rate * units * 100) / 100;
  return (tm.currency || 'EUR') + ' ' + total.toFixed(2).replace('.', ctx.lang === 'en' ? '.' : ',');
}

/** Anlage 1: der Preiskorridor, wie ihn der Kunde im Formular festgelegt hat. */
function corridorAnnex(ctx) {
  const l = ctx.lang;
  const raw = (ctx.answers && ctx.answers.rm_corridor) || '';
  let rows = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) rows = parsed;
  } catch (e) { rows = []; }

  const cur = ctx.terms.currency || 'EUR';
  const body = rows.length
    ? rows.map(function (r) {
      return [String(r.name || r.id || ''),
        r.min ? cur + ' ' + r.min : orOpen('', l),
        r.base ? cur + ' ' + r.base : orOpen('', l),
        r.max ? cur + ' ' + r.max : orOpen('', l)];
    })
    : [[orOpen('', l), orOpen('', l), orOpen('', l), orOpen('', l)]];

  return [{
    h: txt(L('Anlage 1 — Preiskorridor je Einheit', 'Annex 1 — Price corridor per unit'), l),
    blocks: [
      { p: txt(L('Innerhalb dieser Grenzen setzt Elevate Software AG die Preise ohne Rückfrage. Die Grenzen selbst werden nur mit Freigabe des Kunden verändert.',
        'Within these limits Elevate Software AG sets prices without asking. The limits themselves are changed only with the client’s approval.'), l) },
      { kvHead: [txt(L('Einheit', 'Unit'), l), txt(L('Minimum', 'Minimum'), l),
        txt(L('Basispreis', 'Base price'), l), txt(L('Maximum', 'Maximum'), l)],
        rows: body }
    ]
  }];
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
  if (kind === 'avv') return avv(ctx);
  if (kind === 'platform') return platform(ctx);
  if (kind === 'rm') return rm(ctx);
  return gro(ctx);
}

module.exports = {
  ELEV8, GROUP, DEFAULT_TERMS, buildContext, build, avv, gro, platform, rm,
  subprocessors, documentHtml, documentText, today, money
};
