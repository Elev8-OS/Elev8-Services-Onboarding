'use strict';

/**
 * Die Seiten rund um den Vertrag: die Ansicht mit Unterschriftsfeld für den
 * Tenant und der Block am Ende des Formulars. Eigene Datei, damit render.js
 * nicht weiter wächst; die Stile stehen inline, das erspart eine weitere
 * Runde in styles.css.
 */

const view = require('./render');
const { t, UI, clientStrings } = require('./i18n');
const contracts = require('./contracts');

const esc = view.esc;

const STYLE = `<style>
  .cpage{max-width:820px;margin:0 auto;padding:0 20px 80px}
  .cnav{display:flex;justify-content:space-between;align-items:center;gap:12px;
    padding:16px 0;border-bottom:1px solid var(--line);margin-bottom:28px;flex-wrap:wrap}
  .cnav a{color:var(--ink-2);font-size:14px}
  .contract{font-size:15px;line-height:1.62}
  .chead h2{font-family:var(--f-display);font-weight:600;font-size:26px;margin:0 0 4px}
  .chead .csub{margin:0 0 22px;color:var(--muted);font-size:14px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:22px;padding:18px 0 22px;
    border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:8px}
  .party h4{margin:0 0 6px;font-family:var(--f-mono);font-size:11px;text-transform:uppercase;
    letter-spacing:.08em;color:var(--muted);font-weight:500}
  .party p{margin:0;font-size:14.5px;line-height:1.5}
  .csec{margin-top:26px}
  .csec h3{font-family:var(--f-display);font-weight:600;font-size:17.5px;margin:0 0 8px;
    display:flex;gap:10px;align-items:baseline}
  .csec .cn{font-family:var(--f-mono);font-size:12px;color:var(--gold-ink)}
  .csec p{margin:0 0 10px}
  .csec ul{margin:0 0 12px;padding-left:20px}
  .csec li{margin-bottom:6px}
  .kv{display:grid;grid-template-columns:230px 1fr;gap:6px 16px;margin:2px 0 14px}
  .kv dt{font-size:13px;color:var(--muted)}
  .kv dd{margin:0;font-size:14.5px}
  .ctbl{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:14px}
  .ctbl th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;
    color:var(--muted);font-weight:500;border-bottom:1px solid var(--line-strong);padding:6px 10px 6px 0}
  .ctbl td{padding:7px 10px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
  .annex{margin-top:40px;padding-top:24px;border-top:2px solid var(--line-strong)}
  .signbox{margin-top:44px;padding:26px;border:1px solid var(--line-strong);border-radius:var(--radius);
    background:var(--surface)}
  .signbox h3{font-family:var(--f-display);font-weight:600;font-size:20px;margin:0 0 8px}
  .signbox .lede{font-size:14px;color:var(--ink-2);max-width:64ch;margin:0 0 20px}
  .signgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
  .signgrid .field{margin:0}
  .agree{display:flex;gap:10px;align-items:flex-start;margin:4px 0 18px;font-size:14.5px;cursor:pointer}
  .agree input{margin-top:3px;accent-color:var(--gold)}
  .signednote{margin-top:44px;padding:22px 26px;border:1px solid var(--line-strong);
    border-left:3px solid var(--gold);border-radius:var(--radius);background:var(--surface-2)}
  .signednote h3{font-family:var(--f-display);font-weight:600;font-size:19px;margin:0 0 10px}
  .mono{font-family:var(--f-mono);font-size:12px;word-break:break-all}
  .clist{display:grid;gap:12px;margin-top:18px}
  .crow{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;
    padding:16px 18px;border:1px solid var(--line-strong);border-radius:10px;background:var(--bg)}
  .crow .cttl{font-size:15.5px;font-weight:500}
  .crow .cmeta{font-size:13px;color:var(--muted)}
  .crow .cacts{display:flex;gap:8px;flex-wrap:wrap}
  .cdone{border-left:3px solid var(--gold)}
  @media (max-width:640px){ .parties,.signgrid{grid-template-columns:1fr} .kv{grid-template-columns:1fr} }
</style>`;

/** Vertragsseite mit Unterschriftsfeld oder Unterschriftsprotokoll. */
function contractPage(intake, doc, signed, lang, baseHref) {
  const l = lang;
  const body = contracts.documentHtml(doc);

  const tail = signed
    ? `<div class="signednote">
    <h3>${esc(t(UI.contractSigned, l))}</h3>
    <p>${esc(t(UI.lockedNotice, l))}</p>
    <dl class="kv">
      <dt>${esc(t(UI.signedBy, l))}</dt><dd>${esc(signed.signer_name)}${signed.signer_role ? ', ' + esc(signed.signer_role) : ''} · ${esc(signed.signer_email)}</dd>
      <dt>${esc(t(UI.signedOn, l))}</dt><dd>${esc(new Date(signed.signed_at).toISOString().replace('T', ' ').slice(0, 16))} UTC</dd>
      <dt>${esc(t(UI.signIp, l))}</dt><dd>${esc(signed.signer_ip || '—')}</dd>
      <dt>${esc(t(UI.docHash, l))}</dt><dd class="mono">${esc(signed.doc_hash)}</dd>
    </dl>
    <p><a class="btn ghost" href="${baseHref}/${doc.key}.pdf">${esc(t(UI.contractPdf, l))}</a></p>
  </div>`
    : `<div class="signbox" id="signbox" data-kind="${doc.key}">
    <h3>${esc(t(UI.signH, l))}</h3>
    <p class="lede">${esc(t(UI.signP, l))}</p>
    <div class="signgrid">
      <div class="field"><label class="flabel" for="sg_name">${esc(t(UI.signName, l))}</label>
        <input type="text" id="sg_name" autocomplete="name"></div>
      <div class="field"><label class="flabel" for="sg_role">${esc(t(UI.signRole, l))}</label>
        <input type="text" id="sg_role" autocomplete="organization-title"></div>
      <div class="field"><label class="flabel" for="sg_email">${esc(t(UI.signEmail, l))}</label>
        <input type="email" id="sg_email" autocomplete="email"></div>
    </div>
    <label class="agree"><input type="checkbox" id="sg_ok"><span>${esc(t(UI.signConfirm, l))}</span></label>
    <button class="btn big" type="button" id="signBtn">${esc(t(UI.signBtn, l))}</button>
    <p class="finish-note" id="signNote"></p>
  </div>`;

  return view.layout({
    lang: l,
    title: doc.title + ' — ' + intake.tenant_name,
    bodyClass: 'tenant',
    script: '/contract.js',
    body: `${STYLE}
<div class="cpage">
  <div class="cnav">
    <a href="${baseHref.replace(/\/vertrag$/, '')}">← ${esc(t(UI.backToForm, l))}</a>
    <span class="cmeta">${esc(intake.tenant_name)}</span>
  </div>
  ${body}
  ${tail}
</div>
<script id="bootstrap" type="application/json">${JSON.stringify({
      token: intake.token, kind: doc.key, lang: l, s: clientStrings(l)
    })}</script>`
  });
}

/** Block am Ende des Formulars. */
function contractsBlock(intake, docs, signedByKind, lang, reason) {
  const l = lang;
  if (reason) {
    return `<div class="finish">
  <h3>${esc(t(UI.contractsH, l))}</h3>
  <p>${esc(t(UI.contractsBlocked, l))}</p>
  <p class="finish-note">${esc(reason)}</p>
</div>`;
  }
  const rows = docs.map(function (d) {
    const s = signedByKind[d.key];
    return `<div class="crow${s ? ' cdone' : ''}">
    <div>
      <div class="cttl">${esc(d.title)}</div>
      <div class="cmeta">${s
        ? esc(t(UI.contractSigned, l)) + ' · ' + esc(s.signer_name) + ' · ' +
          esc(new Date(s.signed_at).toISOString().slice(0, 10))
        : esc(d.subtitle || '')}</div>
    </div>
    <div class="cacts">
      <a class="btn ghost" href="/f/${esc(intake.token)}/vertrag/${d.key}">${esc(t(s ? UI.contractSigned : UI.contractOpen, l))}</a>
      ${s ? '<a class="btn ghost" href="/f/' + esc(intake.token) + '/vertrag/' + d.key + '.pdf">' + esc(t(UI.contractPdf, l)) + '</a>' : ''}
    </div>
  </div>`;
  }).join('');

  return `${STYLE}<div class="finish">
  <h3>${esc(t(UI.contractsH, l))}</h3>
  <p>${esc(t(UI.contractsP, l))}</p>
  <div class="clist">${rows}</div>
</div>`;
}

module.exports = { contractPage, contractsBlock, STYLE };
