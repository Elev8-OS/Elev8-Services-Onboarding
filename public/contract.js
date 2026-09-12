(function () {
  'use strict';

  var boot;
  try { boot = JSON.parse(document.getElementById('bootstrap').textContent); }
  catch (e) { return; }

  var S = boot.s || {};
  function say(k) { return S[k] || ''; }

  var btn = document.getElementById('signBtn');
  if (!btn) return;
  var note = document.getElementById('signNote');

  btn.addEventListener('click', function () {
    var name = (document.getElementById('sg_name').value || '').trim();
    var role = (document.getElementById('sg_role').value || '').trim();
    var email = (document.getElementById('sg_email').value || '').trim();
    var ok = document.getElementById('sg_ok').checked;

    if (!name || !email || !ok) {
      note.textContent = boot.lang === 'en'
        ? 'Please enter your name and email and confirm the declaration.'
        : 'Bitte Name und E-Mail eintragen und die Erklärung bestätigen.';
      return;
    }
    if (email.indexOf('@') < 1) {
      note.textContent = boot.lang === 'en' ? 'Please check the email address.'
        : 'Bitte prüfen Sie die E-Mail-Adresse.';
      return;
    }

    btn.disabled = true;
    note.textContent = say('signBusy');

    fetch('/api/f/' + encodeURIComponent(boot.token) + '/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: boot.kind, name: name, role: role, email: email, confirm: true })
    }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, d: d }; });
    }).then(function (res) {
      if (!res.d || !res.d.ok) {
        btn.disabled = false;
        note.textContent = (res.d && res.d.message) || say('signFail');
        return;
      }
      note.textContent = say('signDone');
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function () {
      btn.disabled = false;
      note.textContent = say('signFail');
    });
  });
})();
