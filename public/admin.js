(function () {
  'use strict';

  /**
   * Zweistufiges Loeschen ohne Systemdialog: der erste Klick fragt nach, der
   * zweite fuehrt aus. Ein Klick daneben nimmt die Frage wieder zurueck.
   */
  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form.dataset || !form.dataset.confirm) return;
    if (form.dataset.armed === '1') return;
    ev.preventDefault();
    var btn = form.querySelector('button');
    if (!btn) return;
    var label = btn.textContent;
    form.dataset.armed = '1';
    btn.textContent = 'Wirklich?';
    btn.classList.add('armed');
    btn.title = form.dataset.confirm;
    var undo = setTimeout(function () {
      form.dataset.armed = '';
      btn.textContent = label;
      btn.classList.remove('armed');
    }, 6000);
    form.addEventListener('submit', function () { clearTimeout(undo); }, { once: true });
  }, true);

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.copy');
    if (!btn) return;
    var link = btn.dataset.link;
    var label = btn.textContent;
    function done(msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = label; }, 1800);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(function () { done('Kopiert'); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done('Kopiert'); }
      catch (e) { window.prompt('Link kopieren:', link); }
      document.body.removeChild(ta);
    }
  });
})();
