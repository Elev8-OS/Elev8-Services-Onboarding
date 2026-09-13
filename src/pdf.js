'use strict';

/**
 * Vertrags-PDF. Gesetzt wie ein Vertrag aussehen soll: eine Spalte, ruhige
 * Typografie, klare Nummerierung, Kopf- und Fusszeile ab Seite zwei.
 *
 * Zwei Fallen, die pdfkit gerne stellt und die hier bewusst behandelt sind:
 *  - Nach positioniertem Text merkt sich das Dokument die x-Position. Ohne
 *    Rücksetzen rutscht der nächste Absatz in die rechte Spalte.
 *  - Text unterhalb des unteren Rands erzeugt eine neue Seite. Die Fusszeile
 *    braucht deshalb einen abgeschalteten Rand.
 */

const PDFDocument = require('pdfkit');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 62;                     // Seitenrand
const TOP = 96;                   // Textbeginn ab Seite zwei (unter dem Kopf)
const BOTTOM = 74;                // Reserve für die Fusszeile
const W = PAGE_W - 2 * M;
const KEY_W = 168;                // Breite der Merkmalspalte

const INK = '#16160f';
const BODY = '#2a2a22';
const MUTED = '#7c7a6e';
const RULE = '#d8d5c9';
const GOLD = '#b8860b';

const F = { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique' };

/* ---------------- Grundbausteine ---------------- */

function reset(d) { d.x = M; }

function rule(d, colour, weight) {
  const y = d.y;
  d.moveTo(M, y).lineTo(M + W, y).lineWidth(weight || 0.6).strokeColor(colour || RULE).stroke();
  d.y = y;
  reset(d);
}

function space(d, n) { d.y += n; reset(d); }

/** Reicht der Platz noch? Sonst neue Seite. */
function need(d, points) {
  if (d.y + points > PAGE_H - BOTTOM) { d.addPage(); return true; }
  return false;
}

/**
 * Absatz mit Schusterjungen- und Hurenkindkontrolle: Bleiben auf dieser
 * Seite weniger als zwei Zeilen Platz, oder würden auf der nächsten Seite
 * weniger als zwei Zeilen übrig bleiben, wandert der ganze Absatz weiter.
 */
function para(d, text, opts) {
  const o = opts || {};
  const size = o.size || 9.8;
  const gap = o.gap == null ? 2.6 : o.gap;
  const str = String(text == null ? '' : text);
  reset(d);
  d.font(o.font || F.r).fontSize(size);

  const lineH = size * 1.15 + gap;
  // pdfkit setzt den Zeilenabstand auch hinter die letzte Zeile. Ohne Reserve
  // sagt die Messung "passt" und die letzte Zeile rutscht trotzdem um.
  const h = d.heightOfString(str, { width: W, lineGap: gap }) + gap + 2;
  const avail = (PAGE_H - BOTTOM) - d.y;
  if (h > avail) {
    const fits = Math.floor(avail / lineH);
    const total = Math.max(1, Math.ceil(h / lineH));
    // Eine Zeile Puffer nach beiden Seiten: die Messung liegt gelegentlich um
    // eine Zeile daneben, und genau dann steht die Waise oben auf der Seite.
    if (fits < 3 || (total - fits) < 3) d.addPage();
  }

  reset(d);
  d.font(o.font || F.r).fontSize(size).fillColor(o.colour || BODY)
    .text(str, M, d.y, { width: W, align: o.align || 'justify', lineGap: gap });
  reset(d);
  d.y += o.after == null ? 7 : o.after;
}

function sectionHeading(d, number, title) {
  need(d, 72);
  space(d, 9);
  const y = d.y;
  if (number) {
    d.font(F.b).fontSize(9).fillColor(GOLD).text(number, M, y + 1.5, { width: 26, lineBreak: false });
  }
  d.font(F.b).fontSize(11.8).fillColor(INK)
    .text(title, M + (number ? 26 : 0), y, { width: W - (number ? 26 : 0), lineGap: 1 });
  reset(d);
  d.y += 6;
}

function annexHeading(d, title) {
  d.font(F.b).fontSize(14).fillColor(INK).text(title, M, d.y, { width: W });
  reset(d);
  d.y += 6;
  rule(d, GOLD, 1.2);
  d.y += 12;
  reset(d);
}

function bullets(d, items) {
  items.forEach(function (x) {
    // Auch ein Aufzählungspunkt soll nicht mit einer Zeile auf der
    // nächsten Seite landen.
    d.font(F.r).fontSize(9.8);
    const h = d.heightOfString(String(x), { width: W - 18, lineGap: 2.4 }) + 4;
    if (d.y + h > PAGE_H - BOTTOM) d.addPage();
    const y = d.y;
    d.font(F.r).fontSize(9.8).fillColor(GOLD).text('—', M + 2, y, { width: 12, lineBreak: false });
    d.font(F.r).fontSize(9.8).fillColor(BODY)
      .text(String(x), M + 18, y, { width: W - 18, lineGap: 2.4, align: 'left' });
    reset(d);
    d.y += 4.5;
  });
  d.y += 4;
  reset(d);
}

function keyvals(d, rows) {
  // Eine kurze Merkmalsliste soll nicht auseinandergerissen werden - eine
  // einzelne Zeile am Seitenkopf sieht aus wie ein Fehler.
  const est = rows.reduce(function (sum, r) {
    d.font(F.r).fontSize(9.8);
    const hv = d.heightOfString(String(r[1] == null ? '' : r[1]), { width: W - KEY_W, lineGap: 1.8 });
    d.font(F.r).fontSize(8.6);
    const hk = d.heightOfString(String(r[0]), { width: KEY_W - 14, lineGap: 1.4 });
    return sum + Math.max(hv, hk) + 10.5;
  }, 0) + 5;
  const room = (PAGE_H - BOTTOM) - d.y;
  if (est > room && est <= (PAGE_H - BOTTOM) - TOP) d.addPage();

  rows.forEach(function (r, i) {
    need(d, 34);
    const y = d.y;
    d.font(F.r).fontSize(8.6).fillColor(MUTED)
      .text(String(r[0]), M, y + 0.8, { width: KEY_W - 14, lineGap: 1.4 });
    const yKey = d.y;
    d.font(F.r).fontSize(9.8).fillColor(INK)
      .text(String(r[1] == null ? '' : r[1]), M + KEY_W, y, { width: W - KEY_W, lineGap: 1.8 });
    d.y = Math.max(yKey, d.y);
    reset(d);
    d.y += 5;
    if (i < rows.length - 1) { rule(d, '#eae7dc', 0.5); d.y += 5; }
  });
  d.y += 5;
  reset(d);
}

function table(d, head, rows) {
  const cols = Math.max(1, head.length);
  const cw = W / cols;
  const drawHead = function () {
    const y0 = d.y;
    d.font(F.b).fontSize(7.8).fillColor(MUTED);
    head.forEach(function (h, i) {
      d.text(String(h).toUpperCase(), M + i * cw, y0, { width: cw - 10, characterSpacing: 0.4 });
    });
    d.y = y0 + 12;
    reset(d);
    rule(d, RULE, 0.7);
    d.y += 7;
  };
  need(d, 70);
  drawHead();
  rows.forEach(function (r) {
    // Reisst die Tabelle um, kommt der Kopf auf der neuen Seite mit.
    if (need(d, 34)) drawHead();
    const y = d.y;
    let bottom = y;
    d.font(F.r).fontSize(9.2).fillColor(BODY);
    r.forEach(function (c, i) {
      d.text(String(c == null ? '' : c), M + i * cw, y, { width: cw - 10, lineGap: 1.6 });
      bottom = Math.max(bottom, d.y);
    });
    d.y = bottom + 6;
    reset(d);
    rule(d, '#eae7dc', 0.5);
    d.y += 6;
  });
  d.y += 3;
  reset(d);
}

function blocks(d, bs) {
  (bs || []).forEach(function (b) {
    if (b.p) para(d, b.p);
    else if (b.ul) bullets(d, b.ul);
    else if (b.kv) keyvals(d, b.kv);
    else if (b.rows) table(d, b.kvHead || [], b.rows);
  });
}

/* ---------------- Kopf, Fuss, Titel ---------------- */

function pageHeader(d, doc) {
  const y = 46;
  d.font(F.b).fontSize(7.6).fillColor(GOLD)
    .text('ELEV8 SUITE', M, y, { width: 92, characterSpacing: 1.1, lineBreak: false });
  d.font(F.r).fontSize(7.6).fillColor(MUTED)
    .text(doc.title, M + 92, y, { width: W - 92, align: 'right', lineBreak: false });
  d.moveTo(M, y + 13).lineTo(M + W, y + 13).lineWidth(0.6).strokeColor(RULE).stroke();
  d.y = TOP;
  reset(d);
}

/** Hinweisbalken über dem Titel, wenn das Dokument als Muster läuft. */
function draftBanner(d, draft) {
  const top = 62;
  const pad = 12;
  d.font(F.r).fontSize(8.8);
  const h = d.heightOfString(draft.note, { width: W - 2 * pad - 76, lineGap: 1.6 }) + 2 * pad;
  d.roundedRect(M, top, W, h, 5).fillColor('#fdf6e0').fill();
  d.rect(M, top, 3, h).fillColor(GOLD).fill();
  d.font(F.b).fontSize(8.6).fillColor(GOLD)
    .text(draft.label.toUpperCase(), M + pad + 4, top + pad + 1, { width: 68, characterSpacing: 0.8, lineBreak: false });
  d.font(F.r).fontSize(8.8).fillColor('#5c5847')
    .text(draft.note, M + pad + 76, top + pad, { width: W - 2 * pad - 76, lineGap: 1.6 });
  d.y = top + h + 26;
  reset(d);
}

function titleBlock(d, doc, draft) {
  if (draft) { draftBanner(d, draft); } else { d.y = 92; }
  reset(d);
  d.font(F.b).fontSize(7.8).fillColor(GOLD)
    .text('ELEV8 READY', M, d.y, { width: W, characterSpacing: 1.4 });
  reset(d);
  d.y += 16;
  d.font(F.b).fontSize(23).fillColor(INK).text(doc.title, M, d.y, { width: W, lineGap: 2 });
  reset(d);
  if (doc.subtitle) {
    d.y += 5;
    d.font(F.r).fontSize(11).fillColor(MUTED).text(doc.subtitle, M, d.y, { width: W });
    reset(d);
  }
  d.y += 20;
  rule(d, INK, 1.4);
  d.y += 22;
  reset(d);
}

function partiesBlock(d, doc) {
  const colW = (W - 26) / 2;
  const y0 = d.y;
  let bottom = y0;
  doc.parties.forEach(function (p, i) {
    const x = M + i * (colW + 26);
    d.font(F.b).fontSize(7.6).fillColor(GOLD)
      .text(String(p.role).toUpperCase(), x, y0, { width: colW, characterSpacing: 0.9 });
    let y = d.y + 4;
    p.lines.forEach(function (ln, j) {
      d.font(j === 0 ? F.b : F.r).fontSize(9.6).fillColor(j === 0 ? INK : BODY)
        .text(String(ln), x, y, { width: colW, lineGap: 1.6 });
      y = d.y;
    });
    bottom = Math.max(bottom, y);
  });
  d.y = bottom + 16;
  reset(d);
  rule(d, RULE, 0.6);
  d.y += 4;
  reset(d);
}

function signatureBox(d, sig) {
  d.addPage();
  annexHeading(d, sig.heading);
  para(d, sig.note, { size: 9.4, colour: BODY, after: 16 });

  const rows = [
    [sig.labels.name, sig.name],
    [sig.labels.role, sig.role || '—'],
    [sig.labels.email, sig.email],
    [sig.labels.when, sig.signedAt],
    [sig.labels.ip, sig.ip || '—'],
    [sig.labels.agent, (sig.ua || '—').slice(0, 110)]
  ];

  const boxTop = d.y;
  d.y = boxTop + 18;
  reset(d);
  d.x = M + 18;
  rows.forEach(function (r, i) {
    const y = d.y;
    d.font(F.r).fontSize(8.4).fillColor(MUTED).text(String(r[0]), M + 18, y + 0.8, { width: 130 });
    const yk = d.y;
    d.font(F.r).fontSize(10).fillColor(INK).text(String(r[1]), M + 158, y, { width: W - 176 });
    d.y = Math.max(yk, d.y) + 5;
    if (i < rows.length - 1) {
      const ry = d.y;
      d.moveTo(M + 18, ry).lineTo(M + W - 18, ry).lineWidth(0.5).strokeColor('#eae7dc').stroke();
      d.y = ry + 5;
    }
  });
  d.y += 6;
  d.font(F.r).fontSize(8.4).fillColor(MUTED).text(sig.labels.hash, M + 18, d.y, { width: W - 36 });
  d.font('Courier').fontSize(8.6).fillColor(INK).text(sig.hash, M + 18, d.y + 2, { width: W - 36 });
  const boxBottom = d.y + 16;
  d.roundedRect(M, boxTop, W, boxBottom - boxTop, 6).lineWidth(0.8).strokeColor(RULE).stroke();
  d.rect(M, boxTop + 7, 2.6, boxBottom - boxTop - 14).fillColor(GOLD).fill();
  d.y = boxBottom + 26;
  reset(d);

  d.font(F.b).fontSize(7.6).fillColor(GOLD)
    .text(String(sig.counterHeading).toUpperCase(), M, d.y, { width: W, characterSpacing: 0.9 });
  reset(d);
  d.y += 5;
  (sig.counterLines || []).forEach(function (x, i) {
    d.font(i === 0 ? F.b : F.r).fontSize(9.6).fillColor(i === 0 ? INK : BODY)
      .text(String(x), M, d.y, { width: W, lineGap: 1.6 });
    reset(d);
  });
}

/**
 * @param doc  Dokumentmodell aus contracts.js
 * @param sig  Unterschriftsangaben oder null für den Entwurf
 */
/**
 * @param doc   Dokumentmodell aus contracts.js
 * @param sig   Unterschriftsangaben oder null
 * @param opts  { draft: { label, note, stamp } } für ein gekennzeichnetes Muster
 */
function render(doc, sig, opts) {
  const o = opts || {};
  const draft = o.draft || null;
  return new Promise(function (resolve, reject) {
    const d = new PDFDocument({
      size: 'A4', bufferPages: true,
      margins: { top: TOP, bottom: BOTTOM, left: M, right: M },
      info: {
        Title: (draft ? draft.label + ' — ' : '') + doc.title,
        Author: 'Elevate Software AG',
        Subject: doc.subtitle || '',
        Keywords: draft ? draft.label : ''
      }
    });
    // Das Wasserzeichen gehört unter den Text. pdfkit zeichnet in der
    // Reihenfolge der Aufrufe, also muss es beim Anlegen der Seite entstehen -
    // nachträglich läge es über den Tabellen und machte Zahlen unleserlich.
    const stamp = function () {
      if (!draft) return;
      // Der Aufruf kommt mitten aus einem Seitenumbruch heraus, oft innerhalb
      // eines laufenden Absatzes. save()/restore() sichert in pdfkit nur den
      // Grafikzustand - Schrift, Grösse, Farbe und Position gehören dem
      // Dokument und müssen von Hand zurückgelegt werden. Sonst setzt die
      // Fortsetzung des Absatzes in 72 Punkt fett.
      const x = d.x, y = d.y;
      const prevFont = (d._font && d._font.name) || F.r;
      const prevSize = d._fontSize || 9.8;
      const prevFill = d._fillColor;
      d.save();
      d.rotate(-32, { origin: [PAGE_W / 2, PAGE_H / 2] });
      d.fillOpacity(0.055).font(F.b).fontSize(72).fillColor(GOLD)
        .text(draft.stamp || draft.label, 0, PAGE_H / 2 - 40,
          { width: PAGE_W, align: 'center', lineBreak: false });
      d.restore();
      d.fillOpacity(1);
      d.font(prevFont).fontSize(prevSize);
      if (prevFill) d.fillColor(prevFill[0], prevFill[1]); else d.fillColor(BODY);
      d.x = x; d.y = y;
    };
    d.on('pageAdded', stamp);

    const chunks = [];
    d.on('data', function (c) { chunks.push(c); });
    d.on('end', function () { resolve(Buffer.concat(chunks)); });
    d.on('error', reject);

    stamp();                       // die erste Seite entsteht im Konstruktor
    titleBlock(d, doc, draft);
    partiesBlock(d, doc);

    doc.sections.forEach(function (s) {
      sectionHeading(d, s.n ? s.n + '.' : '', s.h);
      blocks(d, s.blocks);
    });

    (doc.annexes || []).forEach(function (a) {
      d.addPage();
      annexHeading(d, a.h);
      blocks(d, a.blocks);
    });

    if (sig) signatureBox(d, sig);

    // Kopf ab Seite zwei, Fusszeile überall. Der untere Rand muss dafür weg,
    // sonst erzeugt die Fusszeile selbst eine weitere Seite.
    const range = d.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      d.switchToPage(range.start + i);
      d.page.margins.bottom = 0;
      if (i > 0) {
        d.font(F.b).fontSize(7.4).fillColor(GOLD)
          .text('ELEV8 SUITE', M, 44, { width: 92, characterSpacing: 1.1, lineBreak: false });
        d.font(F.r).fontSize(7.4).fillColor(MUTED)
          .text(doc.title, M + 92, 44, { width: W - 92, align: 'right', lineBreak: false });
        d.moveTo(M, 57).lineTo(M + W, 57).lineWidth(0.5).strokeColor(RULE).stroke();
      }
      d.moveTo(M, PAGE_H - 52).lineTo(M + W, PAGE_H - 52).lineWidth(0.5).strokeColor(RULE).stroke();
      d.font(F.r).fontSize(7.4).fillColor(MUTED)
        .text((draft ? draft.label + ' · ' : '') + (sig && sig.footer ? sig.footer : 'Elevate Software AG'),
          M, PAGE_H - 44, { width: W * 0.7, lineBreak: false });
      d.font(F.r).fontSize(7.4).fillColor(MUTED)
        .text((i + 1) + ' / ' + range.count, M + W * 0.7, PAGE_H - 44,
          { width: W * 0.3, align: 'right', lineBreak: false });
    }
    d.flushPages();
    d.end();
  });
}

module.exports = { render };
