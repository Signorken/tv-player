import * as store from './core/store.js';
import * as nav from './core/nav.js';
import { router } from './core/router.js';
import { installKeys } from './core/keys.js';
import { initPlatform, platform } from './core/platform.js';
import { Remote } from './core/remote.js';
import * as Modal from './ui/modal.js';
import { active as kbActive, promptText } from './ui/keyboard.js';
import { HomeScreen } from './screens/home.js';
import { PlayerScreen, Mini } from './screens/player.js';
import { applyUi } from './screens/settings.js';
import { addSourceFlow, addFromText, addFromClipboard, importFiles, pickPlaylistFile, discoverFlow, addFolderFlow, playUrl } from './screens/addflow.js';
import { uid } from './core/util.js';

function defaultNav(a) {
  switch (a.a) {
    case 'up': case 'down': case 'left': case 'right': nav.move(a.a); break;
    case 'ok': nav.activate(); break;
    case 'back': router.back(); break;
  }
}

function dispatch(a, e) {
  const m = Modal.top();
  if (m) {
    if (m.onKey && m.onKey(a, e)) return;
    if (a.a === 'backspace') a = { a: 'back' };
    if (a.a === 'back') { if (m.cancelable) m.close(); return; }
    defaultNav(a); return;
  }
  const s = router.current;
  if (!s) return;
  if (a.a === 'inputEnter') return;
  if (a.a !== 'char') document.body.classList.remove('mouse');
  if (a.a === 'backspace') a = { a: 'back' };
  if (s.onKey && s.onKey(a, e)) return;
  if (Mini.onKey(a)) return;
  defaultNav(a);
}

// messaggi dal telefono (relay del companion)
function onRemote(m) {
  switch (m.t) {
    case 'key': dispatch({ a: m.a, d: m.d }, null); break;
    case 'text': if (kbActive.prompt) kbActive.prompt.setValue(String(m.v || '')); break;
    case 'submit': if (kbActive.prompt) kbActive.prompt.submit(); break;
    case 'addSource':
      if (m.cfg && m.cfg.type && m.cfg.url) { m.cfg.id = uid(); store.addSource(m.cfg); Modal.toast('Sorgente aggiunta dal telefono: ' + (m.cfg.name || m.cfg.type)); const c = router.current; if (c && c.refresh) c.refresh(); }
      break;
    case 'm3u':
      if (m.text) { const id = uid(); store.idbSet('file:' + id, m.text).then(() => { store.addSource({ id: id, type: 'm3ufile', name: m.name || 'Playlist dal telefono' }); Modal.toast('Playlist ricevuta: ' + (m.name || '')); const c = router.current; if (c && c.refresh) c.refresh(); }); }
      break;
    case 'play':
      if (m.url) {
        const live = /\.(m3u8|ts)(\?|$)/i.test(m.url);
        router.push(new PlayerScreen({ kind: live ? 'live' : 'vod', list: [{ id: m.url, num: '' }], index: 0, resolve: it => ({ url: it.id, title: m.name || 'Dal telefono', sub: 'Inviato dal telefono' }) }));
      }
      break;
  }
}

// play() interrotto da pause()/nuovo caricamento (zapping, flusso alternativo) è normale, non un errore
const benign = r => { const m = String(r && (r.message || r) || ''); return (r && r.name === 'AbortError') || /interrupted by a (call to pause|new load request)|The play\(\) request/i.test(m); };
window.addEventListener('error', e => { if (benign(e.error || e.message)) return; try { Modal.toast('Errore: ' + (e.message || e.error), 5000); } catch (x) { /* */ } });
window.addEventListener('unhandledrejection', e => { if (benign(e.reason)) { e.preventDefault(); return; } try { Modal.toast('Errore: ' + (e.reason && e.reason.message || e.reason), 5000); } catch (x) { /* */ } });

store.load();
// se l'app è servita dal companion (/app/), usa lo stesso server come proxy/relay
if (!store.settings().companion && /\/app\//.test(location.pathname) && /^https?:/.test(location.protocol)) { store.settings().companion = location.origin; store.save(); }
initPlatform();
applyUi();
router.init(document.getElementById('screens'));
installKeys(dispatch);
Remote.onMessage(onRemote);
Remote.start();
router.push(new HomeScreen());

// ---- desktop / mouse
// Il puntatore (anche il Magic Remote LG) attiva la modalità "mouse": hover, pulsante indietro visibile
let lastMove = 0;
window.addEventListener('mousemove', e => {
  const now = Date.now(); if (now - lastMove < 120) return; lastMove = now;
  if (!document.body.classList.contains('mouse')) document.body.classList.add('mouse');
  // hover = focus per gli elementi navigabili (non nelle liste virtuali, che gestiscono da sole)
  const t = e.target && e.target.closest ? e.target.closest('[data-f]') : null;
  if (t && !Modal.top() ? nav.focusables().indexOf(t) >= 0 : t && Modal.top() && Modal.top().el.contains(t)) nav.focus(t, true);
}, true);
if (platform.isDesktop) {
  document.body.classList.add('desktop');
  window.addEventListener('resize', applyUi);
  // Incolla (Ctrl/Cmd+V) ovunque, fuori dai campi di testo: riconosce da solo il tipo di sorgente
  document.addEventListener('paste', e => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.readOnly) return;
    const txt = e.clipboardData && e.clipboardData.getData('text'); if (!txt) return;
    e.preventDefault(); if (!Modal.top()) addFromText(txt);
  });
  // Trascina file playlist/video o link nella finestra
  let dragN = 0;
  const ov = document.createElement('div'); ov.id = 'dropov'; ov.textContent = 'Rilascia qui una playlist, un video o un link'; document.body.appendChild(ov);
  window.addEventListener('dragenter', e => { e.preventDefault(); dragN++; ov.classList.add('show'); });
  window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; ov.classList.remove('show'); } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragN = 0; ov.classList.remove('show');
    const dt = e.dataTransfer; if (!dt) return;
    if (dt.files && dt.files.length) importFiles(dt.files);
    else { const t = dt.getData('text/uri-list') || dt.getData('text'); if (t) addFromText(t); }
  });
  // comandi dal menu nativo e file aperti dal sistema (doppio clic su .m3u)
  if (window.desktop) {
    window.desktop.onMenu(cmd => {
      switch (cmd) {
        case 'paste': addFromClipboard(); break;
        case 'openfile': pickPlaylistFile(); break;
        case 'discover': discoverFlow(); break;
        case 'folder': addFolderFlow(); break;
        case 'add': addSourceFlow(); break;
        case 'home': router.home(); break;
        case 'update': window.desktop.updateCheck(); break;
        case 'settings': import('./screens/settings.js').then(m => router.push(new m.SettingsScreen())); break;
      }
    });
    window.desktop.onOpenPath(async p => {
      try { const t = await window.desktop.readText(p); await addFromText(t); } catch (e) { Modal.toast('Impossibile aprire il file: ' + e.message, 4000); }
    });
    window.desktop.onUpdate(async m => {
      if (m.state === 'available') {
        const ok = await Modal.confirm('Aggiornamento disponibile: versione ' + m.version, (m.notes ? m.notes + '\n\n' : '') + (m.auto ? 'Si scarica in background e si installa al riavvio.' : 'Questa installazione (.deb/.rpm) si aggiorna a mano: apro la pagina di download.'), m.auto ? 'Scarica' : 'Apri pagina', 'Più tardi');
        if (ok) { window.desktop.updateDownload(); if (m.auto) Modal.toast('Scarico l\'aggiornamento…', 4000); }
      } else if (m.state === 'progress') { Modal.toast('Scarico l\'aggiornamento… ' + m.percent + '%', 1500); }
      else if (m.state === 'ready') {
        if (await Modal.confirm('Aggiornamento pronto: versione ' + m.version, 'Riavvio l\'app per installarlo. La tua configurazione e i preferiti restano.', 'Riavvia ora', 'Al prossimo avvio')) window.desktop.updateInstall();
      } else if (m.state === 'none') Modal.toast('Sei già aggiornato (versione ' + m.version + ')', 4000);
      else if (m.state === 'disabled') {
        const r = await promptText({ title: 'Repository GitHub degli aggiornamenti', value: '', hint: 'Formato utente/repository (es. mario/tv-player). È il repository dove pubblichi le Release.', quick: false });
        if (r && r.trim()) { const okr = await window.desktop.setRepoAndCheck(r); if (!okr) Modal.toast('Formato non valido: usa utente/repository', 5000); }
      }
      else if (m.state === 'error') { if (await Modal.confirm('Aggiornamento non riuscito', m.message + '\n\nPuoi scaricare l\'ultima versione dalla pagina del progetto.', 'Apri pagina', 'Chiudi')) window.desktop.updatePage(); }
    });
    if (store.settings().userAgent && window.desktop.setUserAgent) window.desktop.setUserAgent(store.settings().userAgent);
  }
}
window.__app = { router: router, store: store, nav: nav, dispatch: dispatch, addFromText: addFromText, playUrl: playUrl };
