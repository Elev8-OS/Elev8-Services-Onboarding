(function () {
  'use strict';

  var boot;
  try { boot = JSON.parse(document.getElementById('bootstrap').textContent); }
  catch (e) { return; }

  var S = boot.s || {};
  function say(key, fallback) { return S[key] || fallback || ''; }
  function optLabel(fieldId, code) {
    var m = boot.optLabels && boot.optLabels[fieldId];
    if (!m) return code;
    return String(code).split(',').map(function (c) {
      c = c.trim(); return m[c] || c;
    }).filter(Boolean).join(', ');
  }

  var flag = document.getElementById('saveflag');
  var railfill = document.getElementById('railfill');
  var timers = {};
  var pending = 0;

  function setFlag(text, cls) {
    flag.textContent = text;
    flag.parentNode.className = 'saveline' + (cls ? ' ' + cls : '');
  }

  function box(fieldId) { return document.querySelector('[data-field="' + fieldId + '"]'); }

  /* ---------- Korridor-Tabelle ---------- */

  function isMatrix(b) { return !!(b && b.dataset && b.dataset.type === 'matrix'); }

  /** Traegt den Stand der Tabelle in das verborgene Feld ein - das wird gespeichert. */
  function syncMatrix(b) {
    if (!isMatrix(b)) return '';
    var rows = [].slice.call(b.querySelectorAll('[data-mxrow]')).map(function (tr) {
      var r = { id: tr.dataset.uid || '', name: tr.dataset.uname || '' };
      tr.querySelectorAll('[data-mx]').forEach(function (inp) {
        r[inp.dataset.mx] = inp.value.trim();
      });
      if (tr.classList.contains('est')) r.est = 1;
      return r;
    });
    var hidden = b.querySelector('input[type="hidden"][name="' + b.dataset.field + '"]');
    var empty = rows.every(function (r) { return !r.min && !r.base && !r.max; });
    if (hidden) hidden.value = (!rows.length || empty) ? '' : JSON.stringify(rows);
    return hidden ? hidden.value : '';
  }

  /** Eine bearbeitete Tabelle gilt als beantwortet - ohne die Zeile zusammenzuklappen. */
  function matrixDone(b, confirmed) {
    if (!isMatrix(b)) return;
    b.classList.remove('pre');
    b.classList.add('done');
    var ok = b.querySelector('.mxfoot [data-act="ok"]');
    if (ok) ok.remove();
    var src = b.querySelector('.mxfoot .src');
    if (src) {
      src.className = 'src';
      src.innerHTML = '<span class="tick" aria-hidden="true">✓</span> ' +
        (confirmed ? say('fromElev8Confirmed') : say('yourAnswer'));
    }
  }

  function valueOf(fieldId) {
    var els = document.getElementsByName(fieldId);
    if (!els.length) return '';
    // Vertraglich fixierte Felder tragen nur noch ein verborgenes Feld,
    // damit abhaengige Fragen weiterhin richtig rechnen.
    if (els[0].type === 'hidden') return els[0].value;
    if (els[0].type === 'radio') {
      for (var i = 0; i < els.length; i++) if (els[i].checked) return els[i].value;
      return '';
    }
    if (els[0].type === 'checkbox') {
      var picked = [];
      for (var j = 0; j < els.length; j++) if (els[j].checked) picked.push(els[j].value);
      return picked.join(', ');
    }
    return els[0].value;
  }

  /**
   * Beantwortet heisst: erledigt markiert oder selbst getippt.
   * Ein unbestaetigter Elev8-Vorschlag zaehlt NICHT - sein Wert steht zwar
   * schon im verborgenen Eingabefeld, gilt aber erst nach dem Okay.
   */
  function isAnswered(fieldId) {
    var b = box(fieldId);
    if (b) {
      if (b.classList.contains('dep-off')) return true;
      if (b.classList.contains('done')) return true;
      if (b.classList.contains('pre') && !b.classList.contains('editing')) return false;
    }
    return valueOf(fieldId).trim() !== '';
  }

  /**
   * Felder, die an einer anderen Antwort haengen (z. B. alles rund um die
   * Rezeption oder das Fruehstueck), werden ausgegraut und gesperrt, solange
   * die Bedingung nicht erfuellt ist. Sie zaehlen dann weder im Fortschritt
   * noch als Pflichtfeld. Haengt ein Feld an einem Feld, das selbst
   * ausgegraut ist, faellt es mit weg - so bleibt eine Kette sauber.
   * Ein Feld, das wegfaellt, wird geleert, damit keine Karteileiche im
   * Ergebnis landet.
   */
  function clearField(fieldId) {
    var els = document.getElementsByName(fieldId);
    var touched = false;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.type === 'radio' || el.type === 'checkbox') {
        if (el.checked) { el.checked = false; touched = true; }
      } else if (el.value !== '') { el.value = ''; touched = true; }
    }
    var mb = box(fieldId);
    if (isMatrix(mb)) {
      mb.querySelectorAll('[data-mx]').forEach(function (inp) {
        if (inp.value !== '') { inp.value = ''; touched = true; }
      });
    }
    if (touched) {
      var b = box(fieldId);
      if (b) {
        b.classList.remove('done');
        var answered = b.querySelector('.answered');
        if (answered) answered.remove();
        var ew = b.querySelector('.editwrap');
        if (ew) ew.hidden = false;
      }
      save(fieldId);
    }
  }

  function depReason(parentId, have, parentOff) {
    if (parentOff) return say('depPrev');
    if (have) return say('depBecause').replace('%s', optLabel(parentId, have));
    return say('depWait');
  }

  var depsReady = false;

  function applyDeps() {
    var boxes = [].slice.call(document.querySelectorAll('[data-depends]'));
    // Mehrere Durchlaeufe, damit auch Ketten (A -> B -> C) sauber aufloesen.
    for (var pass = 0; pass < 4; pass++) {
      boxes.forEach(function (b) {
        var parentId = b.dataset.depends;
        var wanted = String(b.dataset.dependsValue || '').split('|');
        var parentBox = box(parentId);
        var parentOff = !!(parentBox && parentBox.classList.contains('dep-off'));
        var have = valueOf(parentId).trim();
        var hit = wanted.some(function (w) {
          if (have === w) return true;
          return have.split(',').map(function (x) { return x.trim(); }).indexOf(w) > -1;
        });
        // Streng: sichtbar nur, wenn die Bedingung wirklich erfuellt ist.
        var off = parentOff || !hit;
        b.classList.toggle('dep-off', off);
        b.querySelectorAll('input, textarea, button').forEach(function (el) { el.disabled = off; });

        var note = b.querySelector('.dep-note');
        if (off && !note && b.classList.contains('field') && !b.classList.contains('note')) {
          note = document.createElement('p');
          note.className = 'fhelp dep-note';
          note.textContent = depReason(parentId, have, parentOff);
          b.appendChild(note);
        } else if (!off && note) {
          note.remove();
        } else if (off && note) {
          note.textContent = depReason(parentId, have, parentOff);
        }
      });
    }
    // Erst nach dem Aufloesen leeren, sonst raeumen wir Zwischenzustaende ab.
    boxes.forEach(function (b) {
      var wasOff = b.dataset.depOff === '1';
      var isOff = b.classList.contains('dep-off');
      // Beim ersten Durchlauf nur merken - sonst wuerden wir Vorschlaege aus
      // Elev8 loeschen, bevor der Tenant die uebergeordnete Frage beantwortet hat.
      var protectedPre = b.classList.contains('pre');
      if (depsReady && isOff && !wasOff && !protectedPre && b.dataset.field) clearField(b.dataset.field);
      b.dataset.depOff = isOff ? '1' : '0';
    });
    // Abschnittsweise: die Sprungleiste zeigt nur, was auch offen ist.
    document.querySelectorAll('[data-navdep]').forEach(function (a) {
      var wanted = String(a.dataset.navdepValue || '').split('|');
      var have = valueOf(a.dataset.navdep).trim();
      var hit = wanted.some(function (w) {
        if (have === w) return true;
        return have.split(',').map(function (x) { return x.trim(); }).indexOf(w) > -1;
      });
      a.hidden = !hit;
    });
    depsReady = true;
  }

  function progress() {
    var filled = 0, total = 0;
    boot.sections.forEach(function (s) {
      var secFilled = 0;
      s.fields.forEach(function (id) {
        total++;
        if (isAnswered(id)) { filled++; secFilled++; }
      });
      var badge = document.querySelector('[data-secprog="' + s.id + '"]');
      if (badge) badge.textContent = secFilled + '/' + s.fields.length;
    });
    railfill.style.width = (total ? Math.round(filled / total * 100) : 0) + '%';
    refreshBulk();
    return { filled: filled, total: total };
  }

  function refreshBulk() {
    var left = document.querySelectorAll('.field.pre').length;
    var bar = document.querySelector('.bulkbar');
    if (bar && !left) bar.remove();
    document.querySelectorAll('.secbulk').forEach(function (el) {
      var sec = el.closest('.sec');
      if (sec && !sec.querySelectorAll('.field.pre').length) el.remove();
    });
  }

  /** Macht aus einem Vorschlags- oder Eingabefeld eine erledigte Zeile. */
  function markDone(fieldId, value, confirmed) {
    var b = box(fieldId);
    if (!b) return;
    if (isMatrix(b)) { matrixDone(b, confirmed); return; }
    b.classList.remove('pre', 'editing');
    b.classList.add('done');
    var prebox = b.querySelector('.prebox');
    if (prebox) prebox.remove();
    var edit = b.querySelector('.editwrap');
    if (edit) edit.hidden = true;

    var answered = b.querySelector('.answered');
    if (!answered) {
      answered = document.createElement('div');
      answered.className = 'answered';
      answered.innerHTML = '<div class="aval"></div><div class="afoot">' +
        '<span class="src"></span><button class="mini" type="button" data-act="edit"></button></div>';
      answered.querySelector('[data-act="edit"]').textContent = say('change');
      if (edit) b.insertBefore(answered, edit); else b.appendChild(answered);
    }
    answered.querySelector('.aval').innerHTML = String(value)
      .replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; })
      .replace(/\n/g, '<br>');
    answered.querySelector('.src').innerHTML = '<span class="tick" aria-hidden="true">✓</span> ' +
      (confirmed ? say('fromElev8Confirmed') : say('yourAnswer'));
    b.classList.add('flash');
    setTimeout(function () { b.classList.remove('flash'); }, 1200);
  }

  /* ---------- speichern ---------- */

  function save(fieldId) {
    var value = valueOf(fieldId);
    pending++;
    setFlag(say('saving'));
    fetch('/api/f/' + encodeURIComponent(boot.token) + '/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: fieldId, value: value })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      pending--;
      if (pending <= 0) { pending = 0; setFlag(say('savedAll'), 'ok'); }
      progress();
    }).catch(function () {
      pending = Math.max(0, pending - 1);
      setFlag(say('saveFailed'), 'err');
    });
  }

  function queue(fieldId) {
    clearTimeout(timers[fieldId]);
    timers[fieldId] = setTimeout(function () { save(fieldId); }, 800);
  }

  function confirm(payload, label) {
    setFlag(label || say('applying'));
    return fetch('/api/f/' + encodeURIComponent(boot.token) + '/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (data) {
      (data.applied || []).forEach(function (a) { markDone(a.field, a.display || a.value, true); });
      setFlag((data.applied || []).length + ' ' + say('applied'), 'ok');
      progress();
      return data;
    }).catch(function () {
      setFlag(say('applyFailed'), 'err');
    });
  }

  /* ---------- interaktion ---------- */

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;

    if (act === 'okall') {
      confirm({ section: btn.dataset.sec }, say('applySection'));
      return;
    }

    var b = btn.closest('.field');
    if (!b) return;
    var id = b.dataset.field;

    if (act === 'ok') { confirm({ field: id }); return; }

    // Widerspruch: entweder den Elev8-Wert nehmen oder die eigene Angabe behalten.
    if (act === 'takeelev8') {
      btn.disabled = true;
      confirm({ field: id, override: true }, say('taking')).then(function () {
        var c = b.querySelector('.conflict');
        if (c) c.remove();
        b.classList.remove('clash');
      });
      return;
    }
    if (act === 'keepmine') {
      var box2 = b.querySelector('.conflict');
      if (box2) box2.remove();
      b.classList.remove('clash');
      return;
    }

    if (act === 'edit') {
      var edit = b.querySelector('.editwrap');
      if (!edit) return;
      edit.hidden = false;
      b.classList.add('editing');
      var prebox = b.querySelector('.prebox');
      if (prebox) prebox.style.display = 'none';
      var answered = b.querySelector('.answered');
      if (answered) answered.style.display = 'none';
      var input = edit.querySelector('input, textarea');
      if (input) {
        input.focus();
        // Cursor ans Ende - bei number/email wirft setSelectionRange, das ist egal.
        try { if (input.value) input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* egal */ }
      }
    }
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.dataset && el.dataset.mx) {
      var mb = el.closest('.field');
      if (!mb || mb.classList.contains('dep-off')) return;
      syncMatrix(mb);
      matrixDone(mb, false);
      queue(mb.dataset.field);
      return;
    }
    if (!el.name || el.closest('.finish') || el.dataset.frozen) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') queue(el.name);
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
      clearTimeout(timers[el.name]);
      save(el.name);
      applyDeps();
      progress();
    }
  });

  document.addEventListener('blur', function (ev) {
    var el = ev.target;
    if (!el.name) return;
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && timers[el.name]) {
      clearTimeout(timers[el.name]);
      save(el.name);
    }
  }, true);

  window.addEventListener('beforeunload', function (e) {
    if (pending > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  var okAll = document.getElementById('okAll');
  if (okAll) {
    okAll.addEventListener('click', function () {
      okAll.disabled = true;
      confirm({}, say('applyAll')).then(function () {
        var bar = okAll.closest('.bulkbar');
        if (bar) bar.remove();
      });
    });
  }

  /* ---------- Elev8 nachholen ---------- */

  function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }

  function renderReadiness(rows) {
    var ul = document.getElementById('rdlist');
    if (!ul || !rows) return;
    ul.innerHTML = rows.map(function (r) {
      var cls = r.ok ? 'ok' : (r.partial ? 'partial' : 'gap');
      return '<li class="rd ' + cls + '">' +
        '<span class="rd-label"></span>' +
        '<span class="rd-bar"><span style="width:' + pct(r.n, r.total) + '%"></span></span>' +
        '<span class="rd-n">' + r.n + '/' + r.total + '</span></li>';
    }).join('');
    // Text ueber textContent setzen, damit nichts aus der Antwort als HTML landet.
    var labels = ul.querySelectorAll('.rd-label');
    for (var i = 0; i < labels.length; i++) labels[i].textContent = rows[i].label;

    var hints = document.getElementById('rdhints');
    if (hints) {
      hints.innerHTML = '';
      rows.filter(function (r) { return !r.ok && r.hint; }).slice(0, 2).forEach(function (g) {
        var p = document.createElement('p');
        var b = document.createElement('b');
        b.textContent = g.label + ':';
        p.appendChild(b);
        p.appendChild(document.createTextNode(' ' + g.hint));
        hints.appendChild(p);
      });
    }
  }

  function setResyncMsg(text, cls) {
    var el = document.getElementById('resyncMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'rdmsg' + (cls ? ' ' + cls : '');
  }

  var resyncBtn = document.getElementById('resyncBtn');
  if (resyncBtn) {
    resyncBtn.addEventListener('click', function () {
      var label = resyncBtn.textContent;
      resyncBtn.disabled = true;
      resyncBtn.classList.add('loading');
      resyncBtn.textContent = say('resyncBusy');
      setResyncMsg(say('resyncWait'));

      fetch('/api/f/' + encodeURIComponent(boot.token) + '/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }).then(function (r) {
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      }).then(function (res) {
        var d = res.data || {};
        if (res.status === 429) {
          setResyncMsg(d.message || say('resyncWait'), 'warn');
          return;
        }
        if (!d.ok) {
          setResyncMsg(d.message || say('resyncFail'), 'err');
          return;
        }
        renderReadiness(d.readiness);
        var stamp = document.getElementById('rdstamp');
        if (stamp) stamp.textContent = say('justNow');
        var units = document.getElementById('rdunits');
        if (units && d.units) units.textContent = d.units;

        if (d.changed) {
          setResyncMsg(d.summary + ' — ' + say('resyncReload'), 'ok');
          setTimeout(function () { location.reload(); }, 1400);
        } else {
          setResyncMsg(d.summary || say('resyncNone'), 'ok');
        }
      }).catch(function () {
        setResyncMsg(say('resyncNoConn'), 'err');
      }).then(function () {
        // Nach dem Neuladen ist das egal, sonst muss der Knopf wieder gehen.
        setTimeout(function () {
          resyncBtn.disabled = false;
          resyncBtn.classList.remove('loading');
          resyncBtn.textContent = label;
        }, 1500);
      });
    });
  }

  /* ---------- abschluss ---------- */

  var submitBtn = document.getElementById('submitBtn');
  var finishNote = document.getElementById('finishNote');
  if (submitBtn && !boot.submitted) {
    submitBtn.addEventListener('click', function () {
      var p = progress();
      var missing = [];
      document.querySelectorAll('.field.req').forEach(function (b) {
        if (!isAnswered(b.dataset.field)) missing.push(b);
      });
      if (missing.length) {
        finishNote.textContent = missing.length + ' ' +
          (missing.length === 1 ? say('missingOne') : say('missingMany')) + ' ' + say('missingTail');
        missing[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        var el = missing[0].querySelector('input, textarea');
        if (el && !el.closest('[hidden]')) el.focus({ preventScroll: true });
        return;
      }
      submitBtn.disabled = true;
      finishNote.textContent = say('submitting');
      fetch('/api/f/' + encodeURIComponent(boot.token) + '/submit', { method: 'POST' })
        .then(function (r) {
          if (!r.ok) throw new Error('http');
          submitBtn.textContent = say('submitOk');
          finishNote.textContent = say('submitOkNote') + ' ' + p.filled + '/' + p.total + ' ' +
            say('submitOkNote2');
        })
        .catch(function () {
          submitBtn.disabled = false;
          finishNote.textContent = say('submitFail');
        });
    });
  }

  applyDeps();
  progress();
})();
