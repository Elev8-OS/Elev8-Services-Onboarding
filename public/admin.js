(function () {
  'use strict';
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
