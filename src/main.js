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
import { applyUi, SettingsScreen } from './screens/settings.js';
import { addSourceFlow, addFromText, addFromClipboard, importFiles, pickPlaylistFile, discoverFlow, addFolderFlow, playUrl } from './screens/addflow.js';
import { uid } from './core/util.js';
import { initShell, Rail, goSection } from './ui/shell.js';
import { Sound, Sel } from './ui/sound.js';
import { Perf } from './core/perf.js';
import { setImg } from './ui/chrome.js';
import { tr } from './core/i18n.js';
Perf.detect();

function defaultNav(a) {
  switch (a.a) {
    case 'up': case 'down': case 'right': if (!nav.move(a.a)) Mini.focusFrom(a.a); break;
    case 'left': if (!nav.move('left')) Rail.enter(); break;
    case 'ok': nav.activate(); break;
    case 'back': case 'longback': router.back(); break;
  }
}

// suoni: spostamento solo se la selezione è cambiata davvero; mai dentro il player
const ARROW = { up: 1, down: 1, left: 1, right: 1, chup: 1, chdown: 1 };
function dispatch(a, e) {
  const s0 = router.current, quiet = !!(s0 && s0.isPlayer && !Modal.top()), v0 = Sel.v;
  dispatchKey(a, e);
  if (quiet) return;
  if (ARROW[a.a]) { if (Sel.v !== v0) Sound.move(); }
  else if (a.a === 'ok') Sound.ok();
  else if (a.a === 'back' || a.a === 'backspace') Sound.back();
}
function dispatchKey(a, e) {
  const m = Modal.top();
  if (m) {
    if (m.onKey && m.onKey(a, e)) return;
    if (a.a === 'backspace' || a.a === 'longback') a = { a: 'back' };
    if (a.a === 'back') { if (m.cancelable) m.close(); return; }
    defaultNav(a); return;
  }
  const s = router.current;
  if (!s) return;
  if (a.a === 'inputEnter') return;
  if (a.a !== 'char') document.body.classList.remove('mouse');
  if (a.a === 'backspace') a = { a: 'back' };
  if (Rail.active) { Rail.onKey(a); return; }
  if (Mini.focused && Mini.onFocusKey(a)) return;
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
      if (m.cfg && m.cfg.type && m.cfg.url) { m.cfg.id = uid(); store.addSource(m.cfg); Modal.toast(tr('Sorgente aggiunta dal telefono: ') + (m.cfg.name || m.cfg.type)); const c = router.current; if (c && c.refresh) c.refresh(); }
      break;
    case 'm3u':
      if (m.text) { const id = uid(); store.idbSet('file:' + id, m.text).then(() => { store.addSource({ id: id, type: 'm3ufile', name: m.name || tr('Playlist dal telefono') }); Modal.toast(tr('Playlist ricevuta: ') + (m.name || '')); const c = router.current; if (c && c.refresh) c.refresh(); }); }
      break;
    case 'play':
      if (m.url) {
        const live = /\.(m3u8|ts)(\?|$)/i.test(m.url);
        router.push(new PlayerScreen({ kind: live ? 'live' : 'vod', list: [{ id: m.url, num: '' }], index: 0, resolve: it => ({ url: it.id, title: m.name || tr('Dal telefono'), sub: tr('Inviato dal telefono') }) }));
      }
      break;
  }
}

// play() interrotto da pause()/nuovo caricamento (zapping, flusso alternativo) è normale, non un errore
const benign = r => { const m = String(r && (r.message || r) || ''); return (r && r.name === 'AbortError') || /interrupted by a (call to pause|new load request)|The play\(\) request/i.test(m); };
window.addEventListener('error', e => { if (benign(e.error || e.message)) return; try { Modal.toast(tr('Errore: ') + (e.message || e.error), 5000); } catch (x) { /* */ } });
window.addEventListener('unhandledrejection', e => { if (benign(e.reason)) { e.preventDefault(); return; } try { Modal.toast(tr('Errore: ') + (e.reason && e.reason.message || e.reason), 5000); } catch (x) { /* */ } });

store.load();
// se l'app è servita dal companion (/app/), usa lo stesso server come proxy/relay
if (!store.settings().companion && /\/app\//.test(location.pathname) && /^https?:/.test(location.protocol)) { store.settings().companion = location.origin; store.save(); }
initPlatform();
applyUi();
router.init(document.getElementById('screens'));
initShell();
installKeys(dispatch);
Remote.onMessage(onRemote);
Remote.start();
router.push(new HomeScreen());
if (window.__shell && window.__shell.updatedFrom) setTimeout(() => Modal.toast(tr('MAXENTA aggiornata alla versione ') + window.__shell.version, 5000), 800);
// schermata all'avvio scelta nelle impostazioni
(function () {
  const st = store.settings().startScreen;
  if (!st || st === 'home' || !store.get().sources.length) return;
  if (st === 'last') { const r = store.get().recents.find(x => x.kind === 'live'); if (r) router.current.playMeta(r); return; }
  goSection(st);
})();

// clic del mouse su un elemento: stesso suono di OK (i clic simulati dal telecomando non sono isTrusted)
document.addEventListener('click', e => { if (!e.isTrusted) return; const c = router.current; if (c && c.isPlayer && !c.mini) return; if (e.target.closest && e.target.closest('[data-f],.ri,.vl-row')) Sound.ok(); }, true);

// ---- desktop / mouse
// Il puntatore (anche il Magic Remote LG) attiva la modalità "mouse": hover, pulsante indietro visibile
let lastMove = 0;
window.addEventListener('mousemove', e => {
  const now = Date.now(); if (now - lastMove < 120) return; lastMove = now;
  if (!document.body.classList.contains('mouse')) document.body.classList.add('mouse');
  // hover = focus per gli elementi navigabili (non nelle liste virtuali, che gestiscono da sole)
  const t = e.target && e.target.closest ? e.target.closest('[data-f]') : null;
  if (t && t !== nav.getFocus()) { const m = Modal.top(); if (m) { if (m.el.contains(t)) { nav.focus(t, true); Sound.move(); } } else if (nav.getScope().contains(t) && !t.hasAttribute('data-off')) { nav.focus(t, true); Sound.move(); } }
}, true);
// zoom manuale dell'interfaccia (Ctrl +/-/0 sul computer; sempre anche da Impostazioni › Aspetto)
const ZOOM = [70, 80, 90, 100, 110, 120, 130, 150];
function zoomUi(cmd) {
  const s = store.settings(), i = ZOOM.indexOf(s.uiScale || 100);
  s.uiScale = cmd === 'zoomreset' ? 100 : ZOOM[Math.max(0, Math.min(ZOOM.length - 1, (i < 0 ? 3 : i) + (cmd === 'zoomin' ? 1 : -1)))];
  store.save(); applyUi();
  Modal.toast(tr('Dimensione interfaccia: ') + s.uiScale + '%', 1200);
}
window.addEventListener('resize', applyUi);
// browser (TV o PC): Ctrl +/-/0 regolano la dimensione dell'interfaccia
window.addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey) || window.desktop) return; const k = e.key; if (k === '+' || k === '=') zoomUi('zoomin'); else if (k === '-') zoomUi('zoomout'); else if (k === '0') zoomUi('zoomreset'); else return; e.preventDefault(); }, true);
if (platform.isDesktop) {
  document.body.classList.add('desktop');
  // Incolla (Ctrl/Cmd+V) ovunque, fuori dai campi di testo: riconosce da solo il tipo di sorgente
  document.addEventListener('paste', e => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.readOnly) return;
    const txt = e.clipboardData && e.clipboardData.getData('text'); if (!txt) return;
    e.preventDefault(); if (!Modal.top()) addFromText(txt);
  });
  // Trascina file playlist/video o link nella finestra
  let dragN = 0;
  const ov = document.createElement('div'); ov.id = 'dropov'; ov.textContent = tr('Rilascia qui una playlist, un video o un link'); document.body.appendChild(ov);
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
        case 'zoomin': case 'zoomout': case 'zoomreset': zoomUi(cmd); break;
        case 'update': window.desktop.updateCheck(); break;
        case 'settings': import('./screens/settings.js').then(m => router.push(new m.SettingsScreen())); break;
      }
    });
    window.desktop.onOpenPath(async p => {
      try { const t = await window.desktop.readText(p); await addFromText(t); } catch (e) { Modal.toast(tr('Impossibile aprire il file: ') + e.message, 4000); }
    });
    window.desktop.onUpdate(async m => {
      if (m.state === 'available') {
        const ok = await Modal.confirm(tr('Aggiornamento disponibile: versione ') + m.version, (m.notes ? m.notes + '\n\n' : '') + (m.auto ? tr('Si scarica in background e si installa al riavvio.') : (/Mac/.test(navigator.platform) ? tr('Su Mac scarico il file .dmg: aprilo e trascina MAXENTA in Applicazioni sostituendo la versione precedente.') : tr('Questa installazione (.deb/.rpm) si aggiorna a mano: apro la pagina di download.'))), m.auto ? tr('Scarica') : tr('Apri pagina'), tr('Più tardi'));
        if (ok) { window.desktop.updateDownload(); if (m.auto) Modal.toast(tr('Scarico l\'aggiornamento…'), 4000); }
      } else if (m.state === 'progress') { Modal.toast(tr('Scarico l\'aggiornamento… ') + m.percent + '%', 1500); }
      else if (m.state === 'ready') {
        if (await Modal.confirm(tr('Aggiornamento pronto: versione ') + m.version, tr('Riavvio l\'app per installarlo. La tua configurazione e i preferiti restano.'), tr('Riavvia ora'), tr('Al prossimo avvio'))) window.desktop.updateInstall();
      } else if (m.state === 'none') Modal.toast(tr('Sei già aggiornato (versione ') + m.version + ')', 4000);
      else if (m.state === 'disabled') {
        const r = await promptText({ title: tr('Repository GitHub degli aggiornamenti'), value: '', hint: tr('Formato utente/repository (es. mario/tv-player). È il repository dove pubblichi le Release.'), quick: false });
        if (r && r.trim()) { const okr = await window.desktop.setRepoAndCheck(r); if (!okr) Modal.toast(tr('Formato non valido: usa utente/repository'), 5000); }
      }
      else if (m.state === 'error') { if (await Modal.confirm(tr('Aggiornamento non riuscito'), m.message + tr('\n\nPuoi scaricare l\'ultima versione dalla pagina del progetto.'), tr('Apri pagina'), tr('Chiudi'))) window.desktop.updatePage(); }
    });
    if (store.settings().userAgent && window.desktop.setUserAgent) window.desktop.setUserAgent(store.settings().userAgent);
  }
}
// Android: APK più vecchio del necessario -> propone l'aggiornamento dall'app (qualche secondo dopo l'avvio)
setTimeout(() => { import('./core/android.js').then(m => m.Android.check(false)).catch(() => {}); }, 7000);
window.__app = { SettingsScreen: SettingsScreen, Mini: Mini, Sound: Sound, setImg: setImg, applyUi: applyUi, router: router, store: store, nav: nav, dispatch: dispatch, addFromText: addFromText, playUrl: playUrl };
