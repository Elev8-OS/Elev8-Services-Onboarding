'use strict';

/**
 * PDF-Ausgabe eines Vertrags. Bewusst schlicht: der Vertrag soll lesbar
 * und druckbar sein, nicht hübsch. pdfkit bringt Helvetica mit, das deckt
 * Umlaute und die üblichen Sonderzeichen ab.
 */

const PDFDocument = require('pdfkit');

const M = 56;                 // Rand
const W = 595.28 - 2 * M;     // Textbreite auf A4

function line(doc, y) {
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.5).strokeColor('#cccccc').stroke();
}

function heading(doc, text, size) {
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(size || 11.5).fillColor('#111111')
    .text(text, { width: W });
  doc.moveDown(0.25);
}

function para(doc, text) {
  doc.font('Helvetica').fontSize(9.5).fillColor('#222222')
    .text(text, { width: W, align: 'left', lineGap: 2.2 });
  doc.moveDown(0.45);
}

function bullets(doc, items) {
  doc.font('Helvetica').fontSize(9.5).fillColor('#222222');
  items.forEach(function (x) {
    doc.text('•  ' + x, { width: W - 12, indent: 10, lineGap: 2 });
    doc.moveDown(0.2);
  });
  doc.moveDown(0.25);
}

function keyvals(doc, rows) {
  const kw = 175;
  rows.forEach(function (r) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444')
      .text(String(r[0]), M, y, { width: kw - 10, lineGap: 1.5 });
    const after = doc.y;
    doc.font('Helvetica').fontSize(9.5).fillColor('#111111')
      .text(String(r[1] == null ? '' : r[1]), M + kw, y, { width: W - kw, lineGap: 1.5 });
    doc.y = Math.max(after, doc.y);
    doc.moveDown(0.25);
  });
  doc.moveDown(0.3);
}

function table(doc, head, rows) {
  const cols = head.length;
  const cw = W / cols;
  const y0 = doc.y;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444444');
  head.forEach(function (h, i) { doc.text(String(h), M + i * cw, y0, { width: cw - 8 }); });
  doc.moveDown(0.3);
  line(doc, doc.y); doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(9).fillColor('#111111');
  rows.forEach(function (r) {
    const y = doc.y;
    let bottom = y;
    r.forEach(function (c, i) {
      doc.text(String(c == null ? '' : c), M + i * cw, y, { width: cw - 8, lineGap: 1.5 });
      bottom = Math.max(bottom, doc.y);
    });
    doc.y = bottom;
    doc.moveDown(0.35);
  });
  doc.moveDown(0.3);
}

function blocks(doc, bs) {
  (bs || []).forEach(function (b) {
    if (b.p) para(doc, b.p);
    else if (b.ul) bullets(doc, b.ul);
    else if (b.kv) keyvals(doc, b.kv);
    else if (b.rows) table(doc, b.kvHead || [], b.rows);
  });
}

/**
 * @param doc  Dokumentmodell aus contracts.js
 * @param sig  { name, role, email, signedAt, ip, ua, hash, note }
 * @returns Promise<Buffer>
 */
function render(doc, sig) {
  return new Promise(function (resolve, reject) {
    const d = new PDFDocument({ size: 'A4', margin: M, bufferPages: true,
      info: { Title: doc.title, Author: 'Elevate Software AG' } });
    const chunks = [];
    d.on('data', function (c) { chunks.push(c); });
    d.on('end', function () { resolve(Buffer.concat(chunks)); });
    d.on('error', reject);

    d.font('Helvetica-Bold').fontSize(17).fillColor('#111111').text(doc.title, { width: W });
    if (doc.subtitle) {
      d.font('Helvetica').fontSize(10).fillColor('#666666').text(doc.subtitle, { width: W });
    }
    d.moveDown(0.6); line(d, d.y); d.moveDown(0.6);

    doc.parties.forEach(function (p) {
      d.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text(p.role, { width: W });
      d.font('Helvetica').fontSize(9.5).fillColor('#111111');
      p.lines.forEach(function (x) { d.text(x, { width: W, lineGap: 1.2 }); });
      d.moveDown(0.5);
    });
    line(d, d.y);

    doc.sections.forEach(function (s) {
      heading(d, s.n + '.  ' + s.h, 11.5);
      blocks(d, s.blocks);
    });

    (doc.annexes || []).forEach(function (a) {
      d.addPage();
      heading(d, a.h, 13);
      blocks(d, a.blocks);
    });

    if (sig) {
      d.addPage();
      heading(d, sig.heading || 'Unterschrift', 13);
      para(d, sig.note || '');
      keyvals(d, [
        [sig.labels.name, sig.name],
        [sig.labels.role, sig.role || '—'],
        [sig.labels.email, sig.email],
        [sig.labels.when, sig.signedAt],
        [sig.labels.ip, sig.ip || '—'],
        [sig.labels.agent, (sig.ua || '').slice(0, 120)],
        [sig.labels.hash, sig.hash]
      ]);
      d.moveDown(0.4);
      d.font('Helvetica-Bold').fontSize(9.5).fillColor('#111111').text(sig.counterHeading, { width: W });
      d.font('Helvetica').fontSize(9.5).fillColor('#111111');
      (sig.counterLines || []).forEach(function (x) { d.text(x, { width: W, lineGap: 1.2 }); });
    }

    // Fusszeile mit Seitenzahlen. Der untere Rand muss dafuer weg, sonst
    // loest der Text in der Fusszeile selbst einen Seitenumbruch aus.
    const range = d.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      d.switchToPage(range.start + i);
      d.page.margins.bottom = 0;
      d.font('Helvetica').fontSize(7.5).fillColor('#999999')
        .text((sig && sig.footer ? sig.footer + ' · ' : '') + (i + 1) + '/' + range.count,
          M, d.page.height - 38, { width: W, align: 'right', lineBreak: false });
    }
    d.flushPages();

    d.end();
  });
}

module.exports = { render };
