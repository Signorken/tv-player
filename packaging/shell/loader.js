// MAXENTA — guscio per le TV (Tizen, webOS, VIDAA, Android TV).
// Installato una volta sola: a ogni avvio controlla se su GitHub c'è una versione più nuova del programma,
// la scarica (circa 200 KB), la conserva sulla TV e la avvia. Senza rete usa l'ultima copia salvata o quella inclusa.
// Scritto in ES5 per i televisori più vecchi.
(function () {
  var SHELL = 1;                       // versione del guscio: aumenta solo se cambia questo file
  var BUNDLED = '__BUNDLED__';         // versione inclusa nel pacchetto
  var BASE = '__BASE__';               // dove si trovano version.json, app.js, app.css
  var ls = window.localStorage;
  function get(k) { try { return ls.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { ls.setItem(k, v); return true; } catch (e) { return false; } }
  function del(k) { try { ls.removeItem(k); } catch (e) { } }
  function cmp(a, b) { a = String(a).split('.'); b = String(b).split('.'); for (var i = 0; i < 3; i++) { var d = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0); if (d) return d; } return 0; }
  function load(url, ms, cb) {
    var done = false, x = new XMLHttpRequest();
    var fin = function (t) { if (!done) { done = true; cb(t); } };
    try {
      x.open('GET', url + '?t=' + Date.now(), true);
      x.timeout = ms;
      x.onload = function () { fin(x.status >= 200 && x.status < 300 ? x.responseText : null); };
      x.onerror = x.ontimeout = function () { fin(null); };
      x.send();
    } catch (e) { fin(null); }
    setTimeout(function () { fin(null); }, ms + 500);
  }
  // lingua (come l'app): impostazione salvata, altrimenti quella del dispositivo
  var EN = (function () { try { var d = JSON.parse(get('tvapp.v1') || 'null'), l = d && d.settings && d.settings.lang; if (l) return l === 'en'; } catch (e) { } return !/^it/i.test(navigator.language || 'it'); })();
  function msg(t) { var l = document.getElementById('loading'); if (!l) return; l.querySelector('.l1').textContent = t; l.className = 'show'; }
  function cached() {
    var v = get('mx.ver');
    return v && v !== get('mx.bad') && cmp(v, BUNDLED) > 0 && get('mx.js') && get('mx.css') ? v : null;
  }
  function start() {
    var v = cached(), seen = get('mx.seen');
    var run = v || BUNDLED;
    window.__shell = { shell: SHELL, version: run, bundled: BUNDLED, updatedFrom: seen && seen !== run ? seen : '' };
    set('mx.seen', run);
    var l = document.getElementById('loading'); if (l) l.className = '';
    if (v) {
      var old = document.getElementById('appcss'); if (old) old.parentNode.removeChild(old);
      var st = document.createElement('style');
      st.textContent = get('mx.css').replace(/url\(\.\.\//g, 'url(');
      document.head.appendChild(st);
      var s = document.createElement('script'); s.text = get('mx.js'); document.body.appendChild(s);
      // se la versione scaricata non parte, la si scarta e si torna a quella inclusa
      setTimeout(function () { if (!window.__app) { set('mx.bad', v); location.reload(); } }, 9000);
    } else {
      var j = document.createElement('script'); j.src = 'app.js'; document.body.appendChild(j);
    }
  }
  var t0 = setTimeout(function () { msg(EN ? 'Checking for updates…' : 'Controllo aggiornamenti…'); }, 700);
  load(BASE + 'version.json', 3000, function (txt) {
    clearTimeout(t0);
    var r = null; try { r = txt ? JSON.parse(txt) : null; } catch (e) { r = null; }
    try { window.__mxLatest = r; } catch (e) { }
    var have = cached() || BUNDLED;
    if (!r || !r.version || cmp(r.version, have) <= 0 || r.version === get('mx.bad') || (r.minShell || 1) > SHELL) { start(); return; }
    msg((EN ? 'Updating MAXENTA to version ' : 'Aggiorno MAXENTA alla versione ') + r.version + '…');
    load(BASE + 'app.js', 20000, function (js) {
      load(BASE + 'app.css', 15000, function (css) {
        if (js && css && js.length > 50000) {
          // prima libera lo spazio della copia vecchia, poi salva la nuova
          del('mx.js'); del('mx.css'); del('mx.ver');
          if (set('mx.js', js) && set('mx.css', css)) set('mx.ver', r.version); else { del('mx.js'); del('mx.css'); }
        }
        start();
      });
    });
  });
})();
