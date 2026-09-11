(function () {
  'use strict';

  var boot;
  try { boot = JSON.parse(document.getElementById('bootstrap').textContent); }
  catch (e) { return; }

  var flag = document.getElementById('saveflag');
  var railfill = document.getElementById('railfill');
  var timers = {};
  var pending = 0;

  function setFlag(text, cls) {
    flag.textContent = text;
    flag.parentNode.className = 'saveline' + (cls ? ' ' + cls : '');
  }

  function box(fieldId) { return document.querySelector('[data-field="' + fieldId + '"]'); }

  function valueOf(fieldId) {
    var els = document.getElementsByName(fieldId);
    if (!els.length) return '';
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
   * Rezeption), werden ausgegraut und gesperrt, solange die Bedingung nicht
   * erfuellt ist. Sie zaehlen dann weder im Fortschritt noch als Pflichtfeld.
   */
  function applyDeps() {
    document.querySelectorAll('[data-depends]').forEach(function (b) {
      var want = b.dataset.dependsValue;
      var have = valueOf(b.dataset.depends);
      var off = have !== '' && have !== want;
      b.classList.toggle('dep-off', off);
      b.querySelectorAll('input, textarea, button').forEach(function (el) { el.disabled = off; });
      var note = b.querySelector('.dep-note');
      if (off && !note) {
        note = document.createElement('p');
        note.className = 'fhelp dep-note';
        note.textContent = 'Entfällt, weil Sie „' + have + '" angegeben haben.';
        b.appendChild(note);
      } else if (!off && note) {
        note.remove();
      }
    });
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
        '<span class="src"></span><button class="mini" type="button" data-act="edit">Ändern</button></div>';
      if (edit) b.insertBefore(answered, edit); else b.appendChild(answered);
    }
    answered.querySelector('.aval').innerHTML = String(value)
      .replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; })
      .replace(/\n/g, '<br>');
    answered.querySelector('.src').innerHTML = '<span class="tick" aria-hidden="true">✓</span> ' +
      (confirmed ? 'aus Elev8, von Ihnen bestätigt' : 'Ihre Angabe');
    b.classList.add('flash');
    setTimeout(function () { b.classList.remove('flash'); }, 1200);
  }

  /* ---------- speichern ---------- */

  function save(fieldId) {
    var value = valueOf(fieldId);
    pending++;
    setFlag('Speichert …');
    fetch('/api/f/' + encodeURIComponent(boot.token) + '/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: fieldId, value: value })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      pending--;
      if (pending <= 0) { pending = 0; setFlag('Alles gespeichert', 'ok'); }
      progress();
    }).catch(function () {
      pending = Math.max(0, pending - 1);
      setFlag('Nicht gespeichert — bitte Verbindung prüfen', 'err');
    });
  }

  function queue(fieldId) {
    clearTimeout(timers[fieldId]);
    timers[fieldId] = setTimeout(function () { save(fieldId); }, 800);
  }

  function confirm(payload, label) {
    setFlag(label || 'Übernimmt …');
    return fetch('/api/f/' + encodeURIComponent(boot.token) + '/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (data) {
      (data.applied || []).forEach(function (a) { markDone(a.field, a.value, true); });
      setFlag((data.applied || []).length + ' aus Elev8 übernommen', 'ok');
      progress();
      return data;
    }).catch(function () {
      setFlag('Übernahme fehlgeschlagen — bitte nochmals', 'err');
    });
  }

  /* ---------- interaktion ---------- */

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;

    if (act === 'okall') {
      confirm({ section: btn.dataset.sec }, 'Abschnitt wird übernommen …');
      return;
    }

    var b = btn.closest('.field');
    if (!b) return;
    var id = b.dataset.field;

    if (act === 'ok') { confirm({ field: id }); return; }

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
    if (!el.name || el.closest('.finish')) return;
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
      confirm({}, 'Alle Elev8-Angaben werden übernommen …').then(function () {
        var bar = okAll.closest('.bulkbar');
        if (bar) bar.remove();
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
        finishNote.textContent = missing.length +
          (missing.length === 1 ? ' Pflichtfeld fehlt' : ' Pflichtfelder fehlen') +
          ' noch — wir springen zum ersten.';
        missing[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        var el = missing[0].querySelector('input, textarea');
        if (el && !el.closest('[hidden]')) el.focus({ preventScroll: true });
        return;
      }
      submitBtn.disabled = true;
      finishNote.textContent = 'Wird übermittelt …';
      fetch('/api/f/' + encodeURIComponent(boot.token) + '/submit', { method: 'POST' })
        .then(function (r) {
          if (!r.ok) throw new Error('http');
          submitBtn.textContent = 'Abgeschlossen — danke';
          finishNote.textContent = 'Wir melden uns. Sie können hier jederzeit noch etwas ändern, ' +
            p.filled + ' von ' + p.total + ' Feldern sind ausgefüllt.';
        })
        .catch(function () {
          submitBtn.disabled = false;
          finishNote.textContent = 'Das hat nicht geklappt — bitte nochmals versuchen.';
        });
    });
  }

  applyDeps();
  progress();
})();
