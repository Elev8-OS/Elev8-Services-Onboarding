'use strict';

const { SECTIONS, INPUT_FIELDS, isInput, mergePrefill, valueLabel } = require('./questions');
const { t, UI, clientStrings, DEFAULT_LANG } = require('./i18n');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

/** "vor 3 Minuten" - der Tenant soll sehen, worauf er gerade schaut. */
function ago(iso, lang) {
  const en = lang === 'en';
  const ts = iso ? Date.parse(iso) : NaN;
  if (isNaN(ts)) return en ? 'never' : 'noch nie';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return en ? 'just now' : 'gerade eben';
  if (m === 1) return en ? '1 minute ago' : 'vor 1 Minute';
  if (m < 60) return en ? m + ' minutes ago' : 'vor ' + m + ' Minuten';
  const h = Math.round(m / 60);
  if (h === 1) return en ? '1 hour ago' : 'vor 1 Stunde';
  if (h < 24) return en ? h + ' hours ago' : 'vor ' + h + ' Stunden';
  const d = Math.round(h / 24);
  if (d === 1) return en ? 'yesterday' : 'gestern';
  return en ? d + ' days ago' : 'vor ' + d + ' Tagen';
}

function layout(opts) {
  return `<!doctype html>
<html lang="${opts.lang || 'de'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23efb100'/%3E%3Cpath d='M9 22V10h14M9 16h11' stroke='%231a1a15' stroke-width='2.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
</head>
<body${opts.bodyClass ? ' class="' + opts.bodyClass + '"' : ''}>
${opts.body}
${opts.script ? '<script src="' + opts.script + '" defer></script>' : ''}
</body>
</html>`;
}

/* ---------------- form controls ---------------- */

function parseMatrix(v) {
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

/**
 * Preiskorridor-Tabelle: eine Zeile je Einheit aus Elev8 Suite.
 * Gespeichert wird das verborgene JSON-Feld - die Zellen halten es aktuell.
 * Steht in Elev8 Suite noch keine Einheit, bleibt ein Hinweis stehen.
 */
function matrixControl(f, v, lang, units, opts) {
  const o = opts || {};
  const stored = parseMatrix(v);
  const byId = {};
  stored.forEach(function (r) { if (r && (r.id || r.name)) byId[r.id || r.name] = r; });

  const list = (units && units.length)
    ? units.map(function (u) {
      const r = byId[u.id] || byId[u.name] || {};
      return { id: u.id, name: r.name || u.name, city: u.city || '',
        min: r.min || '', base: r.base || '', max: r.max || '', est: r.est || 0 };
    })
    : stored.map(function (r) {
      return { id: r.id || '', name: r.name || '', city: '', min: r.min || '',
        base: r.base || '', max: r.max || '', est: r.est || 0 };
    });

  const hidden = '<input type="hidden" name="' + f.id + '" value="' +
    esc(list.length ? JSON.stringify(list.map(function (r) {
      const out = { id: r.id, name: r.name, min: r.min, base: r.base, max: r.max };
      if (r.est) out.est = 1;
      return out;
    })) : '') + '"' + (o.locked ? ' data-frozen="1"' : '') + '>';

  if (!list.length) return '<p class="fhelp">' + esc(t(UI.mxEmpty, lang)) + '</p>' + hidden;

  const cur = esc(o.currency || 'EUR');
  const dis = o.locked ? ' disabled' : '';
  const cols = (f.columns || []).map(function (c) { return { key: c.key, label: t(c.label, lang) }; });

  const head = '<tr><th class="mxu">' + esc(t(UI.mxUnit, lang)) + '</th>' +
    cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr>';

  const body = list.map(function (r) {
    const cells = cols.map(function (c) {
      return '<td><div class="money"><span class="cur">' + cur + '</span>' +
        '<input type="text" inputmode="decimal" data-mx="' + esc(c.key) + '" value="' +
        esc(r[c.key] || '') + '" placeholder="0"' + dis + '></div></td>';
    }).join('');
    return '<tr data-mxrow data-uid="' + esc(r.id) + '" data-uname="' + esc(r.name) + '"' +
      (r.est ? ' class="est"' : '') + '>' +
      '<th scope="row"><span class="mxn">' + esc(r.name) + '</span>' +
      (r.city ? '<span class="mxsub">' + esc(r.city) + '</span>' : '') +
      (r.est ? '<span class="mxest" title="' + esc(t(UI.mxEstHint, lang)) + '">' +
        esc(t(UI.mxEst, lang)) + '</span>' : '') +
      '</th>' + cells + '</tr>';
  }).join('');

  return '<div class="mxwrap"><table class="mxt"><thead>' + head + '</thead><tbody>' +
    body + '</tbody></table></div>' +
    '<p class="fhelp mxnote">' + esc(t(UI.mxNote, lang)) + '</p>' + hidden;
}

function control(f, v, lang) {
  const id = 'f_' + f.id;
  if (f.type === 'note') return '';
  const ph = esc(t(f.placeholder, lang));
  if (f.type === 'textarea') {
    return `<textarea id="${id}" name="${f.id}" rows="3" placeholder="${ph}">${esc(v)}</textarea>`;
  }
  if (f.type === 'radio') {
    return '<div class="choices">' + f.options.map(function (o, i) {
      return `<label class="choice"><input type="radio" id="${id}_${i}" name="${f.id}" value="${esc(o.code)}"${v === o.code ? ' checked' : ''}><span>${esc(t(o, lang))}</span></label>`;
    }).join('') + '</div>';
  }
  if (f.type === 'multi') {
    const chosen = String(v || '').split(',').map(function (x) { return x.trim(); });
    return '<div class="choices">' + f.options.map(function (o, i) {
      return `<label class="choice"><input type="checkbox" id="${id}_${i}" name="${f.id}" value="${esc(o.code)}"${chosen.indexOf(o.code) > -1 ? ' checked' : ''}><span>${esc(t(o, lang))}</span></label>`;
    }).join('') + '</div>';
  }
  if (f.type === 'money') {
    return `<div class="money"><span class="cur">EUR</span><input type="text" inputmode="decimal" id="${id}" name="${f.id}" value="${esc(v)}" placeholder="0"></div>`;
  }
  const kind = f.type === 'number' ? 'number' : (f.type === 'tel' ? 'tel' : (f.type === 'email' ? 'email' : 'text'));
  return `<input type="${kind}" id="${id}" name="${f.id}" value="${esc(v)}" placeholder="${ph}">`;
}

/**
 * Drei Zustände:
 *  - offen                      → normales Eingabefeld
 *  - aus Elev8 Suite, unbestätigt     → Wert steht da, ein Klick auf "Stimmt" genügt
 *  - beantwortet / bestätigt    → kompakte Zeile mit "Ändern"
 */
function field(f, value, source, pre, conflict, lang, units, opts) {
  const v = value == null ? '' : value;
  const has = String(v).trim() !== '';
  const locked = !!(f.lockedNow);
  const dep = f.dependsOn
    ? ` data-depends="${esc(f.dependsOn.field)}" data-depends-value="${esc([].concat(f.dependsOn.equals).join('|'))}"`
    : '';
  if (f.type === 'note') {
    return `<div class="field note" data-field="${f.id}"${dep}><p class="notebox">${nl2br(t(f.label, lang))}</p></div>`;
  }

  const head = `<label class="flabel" for="f_${f.id}">${esc(t(f.label, lang))}${f.required ? '<span class="star" title="' + esc(t(UI.required, lang)) + '">*</span>' : ''}</label>` +
    (f.help ? '<p class="fhelp">' + esc(t(f.help, lang)) + '</p>' : '');

  if (f.type === 'matrix') {
    const src = has ? v : ((pre && pre.value) || '');
    const waiting = !has && !!(pre && pre.value);
    const badge = has
      ? '<span class="src"><span class="tick" aria-hidden="true">✓</span> ' +
        esc(t(source === 'confirmed' ? UI.fromElev8Confirmed : UI.yourAnswer, lang)) + '</span>'
      : (waiting
        ? '<span class="src elev8"><span class="dot"></span>' +
          esc(t(pre.evidence, lang) || t(UI.fromElev8, lang)) + '</span>'
        : '');
    const acts = locked
      ? '<span class="lockflag" title="' + esc(t(UI.lockedHint, lang)) + '">' + esc(t(UI.locked, lang)) + '</span>'
      : (waiting ? '<button class="mini primary" type="button" data-act="ok">' + esc(t(UI.ok, lang)) + '</button>' : '');
    return `<div class="field mx${f.required ? ' req' : ''}${has ? ' done' : (waiting ? ' pre' : '')}${locked ? ' locked' : ''}" data-field="${f.id}" data-type="matrix"${dep}>
  ${head}
  ${matrixControl(f, src, lang, units, { locked: locked, currency: (opts && opts.currency) || '' })}
  <div class="mxfoot">${badge}${acts}</div>
</div>`;
  }


  if (has) {
    const shown = valueLabel(f, v, lang);
    const badge = '<span class="tick" aria-hidden="true">✓</span> ' +
      esc(t(source === 'confirmed' ? UI.fromElev8Confirmed : UI.yourAnswer, lang));
    const clash = conflict ? `
  <div class="conflict">
    <p class="cft"><b>${esc(t(UI.clashH, lang))}</b></p>
    <p class="cfl"><span class="cflab">${esc(t(UI.clashMine, lang))}</span> ${nl2br(valueLabel(f, conflict.mine, lang))}</p>
    <p class="cfl"><span class="cflab">${esc(t(UI.clashTheirs, lang))}</span> ${nl2br(valueLabel(f, conflict.elev8, lang))}</p>
    <div class="cfacts">
      <button class="mini primary" type="button" data-act="takeelev8">${esc(t(UI.clashTake, lang))}</button>
      <button class="mini" type="button" data-act="keepmine">${esc(t(UI.clashKeep, lang))}</button>
    </div>
  </div>` : '';
    return `<div class="field done${f.required ? ' req' : ''}${conflict ? ' clash' : ''}${locked ? ' locked' : ''}" data-field="${f.id}"${dep}>
  ${head}
  <div class="answered">
    <div class="aval">${nl2br(shown)}</div>
    <div class="afoot"><span class="src">${badge}</span>${locked
      ? '<span class="lockflag" title="' + esc(t(UI.lockedHint, lang)) + '">' + esc(t(UI.locked, lang)) + '</span>'
      : '<button class="mini" type="button" data-act="edit">' + esc(t(UI.change, lang)) + '</button>'}</div>
  </div>${clash}
  ${locked
    ? '<input type="hidden" name="' + f.id + '" value="' + esc(v) + '" data-frozen="1">'
    : '<div class="editwrap" hidden>' + control(f, v, lang) + '</div>'}
</div>`;
  }

  if (pre && pre.value) {
    return `<div class="field pre${f.required ? ' req' : ''}" data-field="${f.id}"${dep}>
  ${head}
  <div class="prebox">
    <div class="preval">${nl2br(valueLabel(f, pre.value, lang))}</div>
    <div class="prefoot">
      <span class="src elev8"><span class="dot"></span>${esc(t(pre.evidence, lang) || t(UI.fromElev8, lang))}</span>
      <span class="preacts">
        <button class="mini primary" type="button" data-act="ok">${esc(t(UI.ok, lang))}</button>
        <button class="mini" type="button" data-act="edit">${esc(t(UI.change, lang))}</button>
      </span>
    </div>
  </div>
  <div class="editwrap" hidden>${control(f, pre.value, lang)}</div>
</div>`;
  }

  return `<div class="field${f.required ? ' req' : ''}" data-field="${f.id}"${dep}>
  ${head}
  ${control(f, v, lang)}
</div>`;
}

/* ---------------- readiness panel ---------------- */

function readinessRows(rows, lang) {
  return (rows || []).map(function (r) {
    const cls = r.ok ? 'ok' : (r.partial ? 'partial' : 'gap');
    const pct = r.total ? Math.round((r.n / r.total) * 100) : 0;
    return `<li class="rd ${cls}">
  <span class="rd-label">${esc(t(r.label, lang))}</span>
  <span class="rd-bar"><span style="width:${pct}%"></span></span>
  <span class="rd-n">${r.n}/${r.total}</span>
</li>`;
  }).join('');
}

function readinessHints(rows, lang) {
  const gaps = (rows || []).filter(function (r) { return !r.ok && t(r.hint, lang); }).slice(0, 2);
  if (!gaps.length) return '';
  return gaps.map(function (g) {
    return '<p><b>' + esc(t(g.label, lang)) + ':</b> ' + esc(t(g.hint, lang)) + '</p>';
  }).join('');
}

/**
 * Bereitschaftsanzeige. Neu: der Tenant kann selbst nachholen, wenn er in
 * Elev8 Suite etwas nachgepflegt hat - ohne uns anzurufen.
 */
function readinessPanel(rows, facts, opts) {
  const o = opts || {};
  const lang = o.lang || DEFAULT_LANG;
  const has = rows && rows.length;
  if (!has && !o.canResync) return '';
  return `<section class="panel elev8panel">
  <div class="panel-head">
    <span class="src elev8"><span class="dot"></span>${esc(t(UI.panelSrc, lang))}</span>
    <h2>${esc(t(UI.panelH, lang))}</h2>
  </div>
  <p class="lede small">${facts && facts.total ? '<span id="rdunits">' + facts.total + '</span> ' + esc(t(UI.panelUnits, lang)) + ' ' : ''}${esc(t(UI.panelLede, lang))}</p>
  <ul class="rdlist" id="rdlist">${readinessRows(rows, lang)}</ul>
  <div class="rdhints" id="rdhints">${readinessHints(rows, lang)}</div>
  ${o.canResync ? `<div class="rdfoot">
    <div class="rdstampwrap">
      <span class="rdstamp">${esc(t(UI.lastFetched, lang))} <b id="rdstamp">${esc(ago(o.syncedAt, lang))}</b></span>
      <span class="rdmsg" id="resyncMsg"></span>
    </div>
    <button class="btn ghost" type="button" id="resyncBtn">${esc(t(UI.resyncBtn, lang))}</button>
  </div>` : ''}
</section>`;
}

/* ---------------- tenant form ---------------- */

function tenantForm(intake, answers, sources, snapshot, opts) {
  const o = opts || {};
  const lang = o.lang || DEFAULT_LANG;
  const other = lang === 'de' ? 'en' : 'de';
  const clashes = {};
  (o.conflicts || []).forEach(function (c) { clashes[c.field] = c; });
  const lockedSet = o.locked || {};
  // Elev8-Suite-Daten plus unsere eigenen Vorschlaege (z. B. der Leistungsumfang).
  const pre = mergePrefill(snapshot && snapshot.prefill);
  const filled = INPUT_FIELDS.filter(function (f) { return (answers[f.id] || '').trim() !== ''; }).length;
  const open = INPUT_FIELDS.filter(function (f) {
    return (answers[f.id] || '').trim() === '' && !(pre[f.id] && pre[f.id].value);
  }).length;
  const waiting = INPUT_FIELDS.filter(function (f) {
    return (answers[f.id] || '').trim() === '' && pre[f.id] && pre[f.id].value;
  }).length;
  const submitted = intake.status === 'submitted';

  // Einheiten aus Elev8 Suite - Grundlage der Korridor-Tabelle.
  const units = (snapshot && snapshot.facts && snapshot.facts.unitList) || [];
  const currency = (units.find(function (u) { return u.currency; }) || {}).currency || 'EUR';

  const nav = SECTIONS.map(function (s, i) {
    const d = s.dependsOn
      ? ` data-navdep="${esc(s.dependsOn.field)}" data-navdep-value="${esc([].concat(s.dependsOn.equals).join('|'))}"`
      : '';
    return `<a href="#s-${s.id}" data-navsec="${s.id}"${d}><span class="n">${String(i + 1).padStart(2, '0')}</span>${esc(t(s.title, lang))}</a>`;
  }).join('');

  const body = SECTIONS.map(function (s, i) {
    const secPre = s.fields.filter(function (f) {
      return isInput(f) && (answers[f.id] || '').trim() === '' && pre[f.id] && pre[f.id].value;
    }).length;
    const bulkLabel = secPre + ' ' + t(secPre === 1 ? UI.confirmSecOne : UI.confirmSecMany, lang);
    const secDep = s.dependsOn
      ? ` data-depends="${esc(s.dependsOn.field)}" data-depends-value="${esc([].concat(s.dependsOn.equals).join('|'))}"`
      : '';
    return `<section class="sec" id="s-${s.id}" data-sec="${s.id}"${secDep}>
  <div class="sec-head">
    <span class="sec-n">${String(i + 1).padStart(2, '0')}</span>
    <h2>${esc(t(s.title, lang))}</h2>
    <span class="sec-prog" data-secprog="${s.id}"></span>
  </div>
  ${s.intro ? '<p class="sec-intro">' + esc(t(s.intro, lang)) + '</p>' : ''}
  ${secPre ? '<div class="secbulk"><button class="mini primary" type="button" data-act="okall" data-sec="' + s.id + '">' + esc(bulkLabel) + '</button></div>' : ''}
  <div class="fields">${s.fields.map(function (f) {
      const withLock = lockedSet[f.id] ? Object.assign({}, f, { lockedNow: true }) : f;
      return field(withLock, answers[f.id], sources[f.id], pre[f.id], clashes[f.id], lang,
        units, { currency: currency });
    }).join('')}</div>
</section>`;
  }).join('');

  const minutes = waiting ? (lang === 'en' ? '10 to 15' : '10 bis 15') : (lang === 'en' ? '20 to 30' : '20 bis 30');

  return layout({
    lang: lang,
    title: (lang === 'en' ? 'Onboarding — ' : 'Aufnahme — ') + intake.tenant_name,
    bodyClass: 'tenant',
    script: '/intake.js',
    body: `
<div class="topbar">
  <div class="topbar-in">
    <div class="brandline"><span class="dot"></span>${esc(t(UI.brandline, lang))}</div>
    <div class="topright">
      <a class="langsw" href="?lang=${other}" rel="nofollow">${esc(t(UI.langSwitch, lang))}</a>
      <div class="saveline"><span id="saveflag">${esc(t(UI.saveHint, lang))}</span></div>
    </div>
  </div>
  <div class="rail"><span id="railfill"></span></div>
</div>

<div class="page">
  <header class="hero">
    <p class="eyebrow">${esc(t(UI.eyebrow, lang))} ${esc(intake.tenant_name)}</p>
    <h1>${esc(t(UI.h1, lang))}</h1>
    <p class="lede">${esc(t(UI.lede, lang))}</p>
    ${waiting ? `<div class="bulkbar">
      <div><b>${waiting}</b> ${esc(t(waiting === 1 ? UI.waitingOne : UI.waitingMany, lang))}</div>
      <button class="btn" type="button" id="okAll">${esc(t(UI.confirmAll, lang))}</button>
    </div>` : ''}
    <p class="lede small">${esc(t(UI.timeHint, lang))} ${minutes} ${esc(t(UI.minutes, lang))}</p>
    ${submitted ? '<p class="banner done">' + esc(t(UI.submittedBanner, lang)) + '</p>' : ''}
  </header>

  ${readinessPanel(snapshot && snapshot.readiness, snapshot && snapshot.facts,
    { canResync: !!o.canResync, syncedAt: snapshot && snapshot.syncedAt, lang: lang })}

  <nav class="toc" aria-label="${esc(t(UI.sections, lang))}">${nav}</nav>

  <main>${body}</main>

  <div class="finish">
    <h3>${esc(t(UI.finishH, lang))}</h3>
    <p>${esc(t(UI.finishP, lang))}</p>
    <button type="button" class="btn big" id="submitBtn"${submitted ? ' disabled' : ''}>${esc(t(submitted ? UI.finishDone : UI.finishBtn, lang))}</button>
    <p class="finish-note" id="finishNote"></p>
  </div>

  ${o.contractsBlock || ''}

  <footer class="foot">
    <p>${esc(t(UI.footer, lang))}</p>
  </footer>
</div>

<script id="bootstrap" type="application/json">${JSON.stringify({
      token: intake.token,
      lang: lang,
      total: INPUT_FIELDS.length,
      filled: filled,
      open: open,
      submitted: submitted,
      canResync: !!o.canResync,
      s: clientStrings(lang),
      optLabels: (function () {
        // Der Browser braucht die Beschriftungen zu den Codes, sonst steht in
        // den Hinweisen "Entfaellt, weil Sie paid angegeben haben".
        const m = {};
        INPUT_FIELDS.forEach(function (f) {
          if (!f.options) return;
          const one = {};
          f.options.forEach(function (op) { one[op.code] = t(op, lang); });
          m[f.id] = one;
        });
        return m;
      })(),
      sections: SECTIONS.map(function (s) {
        return { id: s.id, fields: s.fields.filter(isInput).map(function (f) { return f.id; }) };
      })
    })}</script>
`
  });
}

/* ---------------- admin ---------------- */

function loginPage(error) {
  return layout({
    title: 'Anmelden',
    bodyClass: 'admin login',
    body: `<div class="loginwrap">
  <form method="post" action="/admin/login" class="loginbox">
    <p class="brandline"><span class="dot"></span>Elev8 Suite · Guest Relations</p>
    <h1>Tenant-Aufnahme</h1>
    <p class="lede small">Interner Bereich.</p>
    ${error ? '<p class="banner err">' + esc(error) + '</p>' : ''}
    <label class="flabel" for="pw">Passwort</label>
    <input type="password" id="pw" name="password" autocomplete="current-password" autofocus>
    <button class="btn" type="submit">Anmelden</button>
  </form>
</div>`
  });
}

function tenantOption(t) {
  const bits = [];
  if (t.facts && t.facts.total) bits.push(t.facts.total + ' Einheiten');
  if (!t.has_token) bits.push('kein Token');
  else if (t.sync_error) bits.push('Sync-Fehler');
  else if (!t.synced_at) bits.push('noch nicht synchronisiert');
  return `<option value="${t.id}">${esc(t.name)}${bits.length ? ' — ' + esc(bits.join(', ')) : ''}</option>`;
}

function adminList(intakes, tenants, baseUrl, flash) {
  const rows = intakes.length ? intakes.map(function (i) {
    const pct = Math.round((Number(i.filled) / INPUT_FIELDS.length) * 100);
    return `<tr>
  <td><a class="tname" href="/admin/i/${i.id}">${esc(i.tenant_name)}</a>${i.note ? '<span class="tnote">' + esc(i.note) + '</span>' : ''}</td>
  <td><span class="pill ${i.status === 'submitted' ? 'ok' : 'open'}">${i.status === 'submitted' ? 'Abgeschlossen' : 'Offen'}</span></td>
  <td class="num">${pct}&thinsp;%</td>
  <td class="num">${new Date(i.created_at).toLocaleDateString('de-CH')}</td>
  <td><button class="linkbtn copy" type="button" data-link="${esc(baseUrl)}/f/${esc(i.token)}">Link kopieren</button></td>
</tr>`;
  }).join('') : '<tr><td colspan="5" class="muted">Noch keine Aufnahme angelegt.</td></tr>';

  // Auswaehlbar ist jeder angelegte Tenant. Fehlt das Token, entsteht die
  // Aufnahme eben ohne Vorbelegung - das steht dann auch in der Option.
  const ready = tenants;

  return layout({
    title: 'Tenant-Aufnahmen',
    bodyClass: 'admin',
    script: '/admin.js',
    body: `<div class="page">
  <header class="hero tight">
    <p class="eyebrow">Elev8 Suite · Guest Relations · intern</p>
    <h1>Tenant-Aufnahmen</h1>
    <p class="lede">Tenant auswählen, Link verschicken, Antworten mitlesen. Was in Elev8 Suite schon steht, füllt sich von selbst.</p>
    <div class="actions">
      <a class="btn ghost" href="/admin/tenants">Tenants verwalten (${tenants.length})</a>
      <form method="post" action="/admin/resync-sweep"><button class="btn ghost" type="submit">Alle Aufnahmen aus Elev8 Suite auffrischen</button></form>
    </div>
  </header>

  ${flash ? '<p class="banner done">' + esc(flash) + '</p>' : ''}

  <form class="newbox" method="post" action="/admin/intakes">
    <div class="newrow">
      <div class="field">
        <label class="flabel" for="tid">Tenant</label>
        ${ready.length
        ? `<select id="tid" name="tenant_id" required>
             <option value="" disabled selected>— auswählen —</option>
             ${tenants.map(tenantOption).join('')}
           </select>`
        : '<p class="fhelp">Noch kein Tenant angelegt. <a href="/admin/tenants">Zuerst einen Tenant mit Elev8-Suite-Token hinzufügen.</a></p>'}
      </div>
      <button class="btn" type="submit"${ready.length ? '' : ' disabled'}>Aufnahme anlegen</button>
    </div>
    <p class="fhelp">Beim Anlegen holt die App die aktuellen Elev8-Suite-Daten und füllt das Formular damit vor.</p>
  </form>

  <table class="tbl">
    <thead><tr><th>Tenant</th><th>Status</th><th class="num">Ausgefüllt</th><th class="num">Angelegt</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <footer class="foot"><p><a href="/admin/logout">Abmelden</a></p></footer>
</div>`
  });
}

function tenantsPage(tenants, flash, error, discovery) {
  const rows = tenants.length ? tenants.map(function (t) {
    const state = !t.has_token ? '<span class="pill warn">Kein Token</span>'
      : t.sync_error ? '<span class="pill err" title="' + esc(t.sync_error) + '">Sync-Fehler</span>'
        : t.synced_at ? '<span class="pill ok">Synchronisiert</span>'
          : '<span class="pill open">Noch nie geholt</span>';
    const facts = t.facts || {};
    return `<tr>
  <td><a class="tname" href="/admin/tenants/${t.id}">${esc(t.name)}</a>${t.note ? '<span class="tnote">' + esc(t.note) + '</span>' : ''}</td>
  <td>${state}</td>
  <td class="num">${facts.total || '–'}</td>
  <td class="num">${t.synced_at ? new Date(t.synced_at).toLocaleDateString('de-CH') : '–'}</td>
  <td class="num">${t.intake_count}</td>
  <td><form method="post" action="/admin/tenants/${t.id}/sync"><button class="linkbtn" type="submit">Jetzt holen</button></form></td>
</tr>`;
  }).join('') : '<tr><td colspan="6" class="muted">Noch kein Tenant angelegt.</td></tr>';

  return layout({
    title: 'Tenants',
    bodyClass: 'admin',
    script: '/admin.js',
    body: `<div class="page">
  <header class="hero tight">
    <p class="eyebrow"><a href="/admin">← Aufnahmen</a></p>
    <h1>Tenants</h1>
    <p class="lede">Ein Tenant wird einmal angelegt — mit dem Elev8-Suite-Token, mit dem die App seine Daten liest. Danach wählt man ihn nur noch aus.</p>
  </header>

  ${flash ? '<p class="banner done">' + esc(flash) + '</p>' : ''}
  ${error ? '<p class="banner err">' + esc(error) + '</p>' : ''}
  ${discovery}

  <form class="newbox" method="post" action="/admin/tenants">
    <div class="newrow">
      <div class="field"><label class="flabel" for="tn">Name</label>
        <input type="text" id="tn" name="name" placeholder="z. B. Kraut Homes" required></div>
      <div class="field"><label class="flabel" for="nt">Notiz (intern)</label>
        <input type="text" id="nt" name="note" placeholder="Hotel Zimmermann, Filderstadt"></div>
    </div>
    <div class="field" style="margin-top:12px">
      <label class="flabel" for="tk">Elev8-Suite-Token</label>
      <p class="fhelp">Bearer-Token für den Elev8-MCP dieses Tenants. Wird serverseitig gespeichert und nie im Formular angezeigt.</p>
      <input type="password" id="tk" name="elev8_token" autocomplete="off" placeholder="eyJ…">
    </div>
    <div class="actions"><button class="btn" type="submit">Tenant anlegen und Daten holen</button></div>
  </form>

  <table class="tbl">
    <thead><tr><th>Tenant</th><th>Elev8 Suite</th><th class="num">Einheiten</th><th class="num">Zuletzt geholt</th><th class="num">Aufnahmen</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <footer class="foot"><p><a href="/admin">Zurück</a> · <a href="/admin/logout">Abmelden</a></p></footer>
</div>`
  });
}

function tenantDetail(t, flash) {
  const facts = t.facts || {};
  const pre = t.prefill || {};
  const rd = t.readiness || [];

  const factRows = [
    ['Einheiten (aktiv)', facts.total],
    ['Gesamtkapazität (Personen)', facts.capacity],
    ['Adressen', (facts.addresses || []).map(function (a) { return a.value + ' (' + a.n + ')'; }).join('<br>')],
    ['Schlosssysteme', (facts.locks || []).map(function (l) { return l.value + ': ' + l.n; }).join(', ')],
    ['Check-in-Schritte', facts.checkin ? facts.checkin.n + ' Einheiten, Ø ' + facts.checkin.avg + ', max. ' + facts.checkin.max : ''],
    ['WLAN hinterlegt', facts.wifiCount],
    ['Kaution', (facts.deposits || []).map(function (d) { return d.value + ' × ' + d.n; }).join(', ')],
    ['Kanäle', (facts.channels || []).map(function (c) { return c.name + ' ' + c.share + ' %'; }).join(', ')],
    ['AI aktiv', facts.aiActive],
    ['Profil-Tool', facts.profile && facts.profile.tool]
  ].filter(function (r) { return r[1] !== undefined && r[1] !== null && String(r[1]) !== ''; })
    .map(function (r) { return '<div class="qa"><div class="q">' + esc(r[0]) + '</div><div class="a">' + r[1] + '</div></div>'; })
    .join('');

  const preRows = Object.keys(pre).map(function (k) {
    return '<div class="qa"><div class="q">' + esc(k) + '</div><div class="a">' + nl2br(pre[k].value) +
      '<span class="tnote">' + esc(pre[k].evidence || '') + '</span></div></div>';
  }).join('');

  return layout({
    title: t.name + ' — Tenant',
    bodyClass: 'admin',
    script: '/admin.js',
    body: `<div class="page">
  <header class="hero tight">
    <p class="eyebrow"><a href="/admin/tenants">← Alle Tenants</a></p>
    <h1>${esc(t.name)}</h1>
    <p class="lede">${t.synced_at ? 'Zuletzt aus Elev8 Suite geholt am ' + new Date(t.synced_at).toLocaleString('de-CH') : 'Noch keine Daten aus Elev8 Suite geholt.'}</p>
    ${t.sync_error ? '<p class="banner err">' + esc(t.sync_error) + '</p>' : ''}
    ${flash ? '<p class="banner done">' + esc(flash) + '</p>' : ''}
    <div class="actions">
      <form method="post" action="/admin/tenants/${t.id}/sync"><button class="btn ghost" type="submit">Daten neu holen</button></form>
      <a class="btn ghost" href="/admin/tenants/${t.id}/raw">Rohdaten der Einheiten</a>
      <a class="btn ghost" href="/admin/tenants/${t.id}/diagnose">Verbindung prüfen</a>
    </div>
  </header>

  <form class="newbox" method="post" action="/admin/tenants/${t.id}/token">
    <div class="field">
      <label class="flabel" for="tk">Elev8-Suite-Token ersetzen</label>
      <input type="password" id="tk" name="elev8_token" autocomplete="off" placeholder="${t.elev8_token ? 'hinterlegt — neuen Wert eingeben zum Ersetzen' : 'noch keiner hinterlegt'}">
    </div>
    <div class="actions"><button class="btn" type="submit">Speichern und neu holen</button></div>
  </form>

  <section class="sec">
    <div class="sec-head"><h2>Aus Elev8 Suite gelesen</h2></div>
    <div class="qalist">${factRows || '<p class="muted">Noch nichts geholt.</p>'}</div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2>Damit wird vorausgefüllt</h2><span class="sec-prog">${Object.keys(pre).length} Felder</span></div>
    <div class="qalist">${preRows || '<p class="muted">Keine Vorbelegung.</p>'}</div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2>Datenqualität im Konto</h2></div>
    ${rd.length ? '<ul class="rdlist">' + rd.map(function (r) {
      const pct = r.total ? Math.round((r.n / r.total) * 100) : 0;
      return `<li class="rd ${r.ok ? 'ok' : (r.partial ? 'partial' : 'gap')}"><span class="rd-label">${esc(r.label)}</span><span class="rd-bar"><span style="width:${pct}%"></span></span><span class="rd-n">${r.n}/${r.total}</span></li>`;
    }).join('') + '</ul>' : '<p class="muted">Noch keine Daten aus Elev8 Suite geholt.</p>'}
  </section>

  <footer class="foot"><p><a href="/admin/tenants">Zurück</a></p></footer>
</div>`
  });
}

function diagnosePage(t, result) {
  return layout({
    title: 'Verbindung — ' + t.name,
    bodyClass: 'admin',
    body: `<div class="page">
  <header class="hero tight">
    <p class="eyebrow"><a href="/admin/tenants/${t.id}">← ${esc(t.name)}</a></p>
    <h1>Verbindung zu Elev8 Suite</h1>
  </header>
  <pre class="code">${esc(JSON.stringify(result, null, 2))}</pre>
  <footer class="foot"><p><a href="/admin/tenants">Zurück</a></p></footer>
</div>`
  });
}

/**
 * Kaufmaennische Angaben und Vertragsstand. Was hier steht, wandert wortwoertlich
 * in den GRO-Vertrag; ohne Preis und Laufzeit erscheint beim Tenant kein Vertrag.
 */
function termsPanel(intake, extra) {
  const tm = extra.terms || {};
  const signed = extra.contracts || [];
  const missing = extra.missing || [];
  const byKind = {};
  signed.forEach(function (c) { byKind[c.kind] = c; });
  const inp = function (name, label, value, ph, wide) {
    return `<div class="field${wide ? ' wide' : ''}">
      <label class="flabel" for="t_${name}">${esc(label)}</label>
      <input type="text" id="t_${name}" name="${name}" value="${esc(value == null ? '' : value)}" placeholder="${esc(ph || '')}">
    </div>`;
  };
  const row = function (kind, title) {
    const c = byKind[kind];
    return `<div class="crow${c ? ' cdone' : ''}">
      <div><div class="cttl">${esc(title)}</div>
      <div class="cmeta">${c
        ? 'Unterzeichnet von ' + esc(c.signer_name) + (c.signer_role ? ', ' + esc(c.signer_role) : '') +
          ' · ' + esc(new Date(c.signed_at).toISOString().replace('T', ' ').slice(0, 16)) + ' UTC · IP ' +
          esc(c.signer_ip || '—') + '<br><span class="mono">' + esc(c.doc_hash) + '</span>'
        : 'Noch nicht unterzeichnet'}</div></div>
      <div class="cacts">
        <a class="btn ghost" href="/admin/i/${intake.id}/vertrag/${kind}.pdf?muster=1">Muster-PDF</a>
        ${c ? '<a class="btn ghost" href="/admin/i/' + intake.id + '/vertrag/' + kind + '.pdf">Unterzeichnetes PDF</a>' : ''}
      </div>
    </div>`;
  };
  const filled = function (k) { return String(tm[k] || '').trim() !== ''; };
  const rmOrdered = String((extra.answers || {}).revenue_package || '') === 'yes';
  const platformPriceKey = tm.platform_model === 'per_booking' ? 'platform_price_per_booking' : 'platform_price_per_unit';
  const ready = filled(platformPriceKey) && filled('price_per_unit') &&
    filled('term_months') && filled('notice_months') &&
    (!rmOrdered || (filled('rm_price_per_unit') && filled('rm_term_months') && filled('rm_notice_months')));
  const perBooking = tm.platform_model === 'per_booking';

  return `<section class="panel">
  <div class="panel-head"><h2>Vertragsdaten</h2></div>
  <p class="lede small">Diese Angaben stehen wörtlich in den Verträgen. Mit „Muster-PDF" erzeugen Sie jederzeit einen gekennzeichneten Entwurf zum Verschicken — auch bevor etwas ausgefüllt oder unterschrieben ist.</p>
  <form method="post" action="/admin/i/${intake.id}/terms" class="tbox">
    <div class="tgroup">
      <h3>Rahmenvertrag Elev8 Suite</h3>
      <div class="field">
        <label class="flabel">Abrechnungsmodell</label>
        <div class="choices">
          <label class="choice"><input type="radio" name="platform_model" value="per_unit"${perBooking ? '' : ' checked'}><span>pro Einheit</span></label>
          <label class="choice"><input type="radio" name="platform_model" value="per_booking"${perBooking ? ' checked' : ''}><span>pro Buchung</span></label>
        </div>
      </div>
      <div class="tgrid">
        ${inp('platform_price_per_unit', 'Preis je Einheit/Monat', tm.platform_price_per_unit, '4.90')}
        ${inp('platform_price_per_booking', 'Preis je Buchung', tm.platform_price_per_booking, '2.50')}
        ${inp('platform_term_months', 'Mindestlaufzeit (Mt.)', tm.platform_term_months || '12', '12')}
        ${inp('platform_notice_months', 'Kündigungsfrist (Mt.)', tm.platform_notice_months || '3', '3')}
      </div>
    </div>

    <div class="tgroup">
      <h3>Leistungsschein Guest Relations</h3>
      <div class="tgrid">
        ${inp('price_per_unit', 'Preis je Einheit/Monat', tm.price_per_unit, '9.50')}
        ${inp('setup_fee', 'Einrichtung einmalig', tm.setup_fee, 'leer = entfällt')}
        ${inp('term_months', 'Mindestlaufzeit (Mt.)', tm.term_months || '12', '12')}
        ${inp('notice_months', 'Kündigungsfrist (Mt.)', tm.notice_months || '3', '3')}
      </div>
    </div>

    <div class="tgroup${rmOrdered ? '' : ' off'}">
      <h3>Leistungsschein Revenue Management${rmOrdered ? '' : ' <span class="tnote">nicht bestellt</span>'}</h3>
      <div class="tgrid">
        ${inp('rm_price_per_unit', 'Preis je Einheit/Monat', tm.rm_price_per_unit, '6.50')}
        ${inp('rm_tier_from', 'Staffel ab Einheiten', tm.rm_tier_from, '25')}
        ${inp('rm_tier_price', 'Staffelpreis je Einheit', tm.rm_tier_price, '5.50')}
        ${inp('rm_term_months', 'Mindestlaufzeit (Mt.)', tm.rm_term_months || '6', '6')}
        ${inp('rm_notice_months', 'Kündigungsfrist (Mt.)', tm.rm_notice_months || '3', '3')}
      </div>
    </div>

    <div class="tgroup">
      <h3>Für alle Dokumente</h3>
      <div class="tgrid">
        ${inp('currency', 'Währung', tm.currency || 'EUR', 'EUR')}
        ${inp('law', 'Recht (CH oder DE)', tm.law || 'CH', 'CH')}
        ${inp('venue', 'Gerichtsstand', tm.venue || 'Olten, Schweiz', 'Olten, Schweiz')}
      </div>
    </div>

    <div class="actions"><button class="btn" type="submit">Vertragsdaten speichern</button></div>
  </form>
  <div class="clist">
    ${row('platform', 'Rahmenvertrag Elev8 Suite')}
    ${row('avv', 'Vertrag zur Auftragsverarbeitung')}
    ${row('gro', 'Leistungsschein Guest Relations')}
    ${rmOrdered ? row('rm', 'Leistungsschein Revenue Management') : ''}
  </div>
  <p class="lede small">${ready
    ? (missing.length
      ? 'Der Tenant sieht die Verträge noch nicht: ' + missing.length + ' Pflichtfeld' + (missing.length === 1 ? '' : 'er') + ' fehlt noch (' + esc(missing.slice(0, 6).join(', ')) + (missing.length > 6 ? ' …' : '') + ').'
      : 'Der Tenant kann alle Dokumente lesen und in der Reihenfolge Rahmenvertrag, AVV, Leistungsscheine unterzeichnen.')
    : 'Sobald Preise, Mindestlaufzeit und Kündigungsfrist stehen, erscheinen die Verträge beim Tenant.'}</p>
</section>`;
}

function adminDetail(intake, answers, sources, baseUrl, flash, extra) {
  const pre = (intake.snapshot && intake.snapshot.prefill) || {};
  const blocks = SECTIONS.map(function (s) {
    const inputs = s.fields.filter(isInput);
    const rows = inputs.map(function (f) {
      const v = (answers[f.id] || '').trim();
      const src = sources[f.id];
      const tag = v
        ? (src === 'confirmed' ? '<span class="tnote">aus Elev8 Suite, bestätigt</span>' : '')
        : (pre[f.id] ? '<span class="tnote">Vorschlag aus Elev8 Suite, noch nicht bestätigt</span>' : '');
      return `<div class="qa${v ? '' : ' empty'}">
  <div class="q">${esc(t(f.label, 'de'))}</div>
  <div class="a">${v ? nl2br(valueLabel(f, v, 'de')) : (pre[f.id] ? '<span class="muted">' + nl2br(valueLabel(f, pre[f.id].value, 'de')) + '</span>' : '<span class="muted">— offen —</span>')}${tag}</div>
</div>`;
    }).join('');
    const filled = inputs.filter(function (f) { return (answers[f.id] || '').trim() !== ''; }).length;
    return `<section class="sec">
  <div class="sec-head"><h2>${esc(t(s.title, 'de'))}</h2><span class="sec-prog">${filled}/${inputs.length}</span></div>
  <div class="qalist">${rows}</div>
</section>`;
  }).join('');

  const filled = INPUT_FIELDS.filter(function (f) { return (answers[f.id] || '').trim() !== ''; }).length;
  const preCount = Object.keys(pre).length;

  return layout({
    title: intake.tenant_name + ' — Aufnahme',
    bodyClass: 'admin',
    script: '/admin.js',
    body: `<div class="page">
  <header class="hero tight">
    <p class="eyebrow"><a href="/admin">← Alle Aufnahmen</a></p>
    <h1>${esc(intake.tenant_name)}</h1>
    <p class="lede">${filled} von ${INPUT_FIELDS.length} Feldern beantwortet, ${preCount} aus Elev8 Suite vorausgefüllt · ${intake.status === 'submitted' ? 'vom Tenant abgeschlossen' : 'noch offen'}</p>
    ${flash ? '<p class="banner done">' + esc(flash) + '</p>' : ''}
    ${preCount ? '' : '<p class="banner">Für diese Aufnahme ist noch nichts aus Elev8 Suite vorausgefüllt. Wenn der Tenant inzwischen Daten liefert, hier neu holen — der Link an den Tenant bleibt derselbe.</p>'}
    <div class="actions">
      <button class="btn ghost copy" type="button" data-link="${esc(baseUrl)}/f/${esc(intake.token)}">Tenant-Link kopieren</button>
      <form method="post" action="/admin/i/${intake.id}/refresh"><button class="btn ghost" type="submit">Vorbelegung aus Elev8 Suite neu holen</button></form>
      <a class="btn ghost" href="/admin/i/${intake.id}/export.md">Als Markdown</a>
      <a class="btn ghost" href="/admin/i/${intake.id}/export.json">Als JSON</a>
    </div>
  </header>
  ${termsPanel(intake, extra || {})}
  <main>${blocks}</main>
  <footer class="foot"><p><a href="/admin">Zurück</a> · <a href="/admin/logout">Abmelden</a></p></footer>
</div>`
  });
}

function exportMarkdown(intake, answers, sources) {
  const out = [];
  out.push('# Tenant-Aufnahme — ' + intake.tenant_name);
  out.push('');
  out.push('Stand: ' + new Date().toLocaleString('de-CH'));
  out.push('Status: ' + (intake.status === 'submitted' ? 'abgeschlossen' : 'offen'));
  out.push('');
  SECTIONS.forEach(function (s) {
    out.push('## ' + t(s.title, 'de'));
    out.push('');
    s.fields.filter(isInput).forEach(function (f) {
      const v = (answers[f.id] || '').trim();
      out.push('**' + t(f.label, 'de') + '**' + (sources[f.id] === 'confirmed' ? ' _(aus Elev8 Suite, bestätigt)_' : ''));
      out.push('');
      out.push(v ? valueLabel(f, v, 'de') : '_offen_');
      out.push('');
    });
  });
  return out.join('\n');
}

module.exports = {
  layout, tenantForm, loginPage, adminList, adminDetail, tenantsPage, tenantDetail,
  diagnosePage, exportMarkdown, esc, ago
};
