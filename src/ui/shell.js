// Elementi comuni a tutte le schermate: barra laterale (Aspetto A), orologio centrale, versione.
import { h, fmtClock, clockOpt } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { icon } from './icons.js';
import { Sel } from './sound.js';

export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

// voci della barra: id, icona, etichetta, azione (chiamata sulla Home)
const ITEMS = [
  ['home', 'home', 'Home', hm => { }],
  ['live', 'tv', 'TV in diretta', hm => hm.openLive()],
  ['ondemand', 'film', 'On Demand', hm => hm.openVod('movie')],
  ['files', 'folder', 'File di rete', hm => hm.openFiles()],
  ['favs', 'star', 'Preferiti', hm => hm.openFavs()],
  ['set', 'gear', 'Impostazioni', hm => hm.openSettings()]
];
export const MENU = ITEMS.map(x => ({ id: x[0], icon: x[1], label: x[2], go: x[3] }));
// sezioni raggiungibili (anche come schermata all'avvio) senza una voce propria nel menu
const EXTRA = { movie: hm => hm.openVod('movie'), series: hm => hm.openVod('series'), sport: hm => hm.openSport() };

// apre una sezione partendo sempre dalla Home (così Indietro riporta lì)
export function goSection(id) {
  router.home();
  const hm = router.current, it = MENU.find(m => m.id === id);
  if (hm && it) it.go(hm); else if (hm && EXTRA[id]) EXTRA[id](hm);
}

let rail = null, items = [], sel = 0, prev = null, clockEl = null, clockT = null;

export const Rail = {
  active: false,
  mini: null,      // funzione per tornare al player in finestrella (impostata dal player)
  enabled() { return store.settings().layout !== 'B'; },
  // entra nella barra (Sinistra dal primo elemento di una schermata)
  enter() {
    const s = router.current;
    if (!this.enabled() || !rail || !s || s.isPlayer) return false;
    prev = nav.getFocus(); if (prev) prev.classList.remove('focused');
    if (s.onRailEnter) s.onRailEnter();
    this.active = true;
    sel = Math.max(0, items.findIndex(e => e._id === (s.railId || 'home')));
    rail.classList.add('open');
    Sel.v++;
    this._paint();
    return true;
  },
  exit() {
    if (!this.active) return;
    this.active = false; rail.classList.remove('open'); this._paint();
    const s = router.current;
    if (s && s.onRailExit) s.onRailExit();
    else if (prev && document.body.contains(prev)) nav.focus(prev, true);
    else nav.focusFirst();
  },
  _paint() { items.forEach((e, i) => e.classList.toggle('focused', this.active && i === sel)); },
  onKey(a) {
    const k = a.a;
    if (k === 'up' || k === 'down') {
      let n = sel;
      do { n += k === 'down' ? 1 : -1; } while (n >= 0 && n < items.length && items[n].style.display === 'none');
      if (n >= 0 && n < items.length) { sel = n; Sel.v++; this._paint(); }
      return true;
    }
    if (k === 'right' || k === 'back') { this.exit(); return true; }
    if (k === 'ok') { const id = items[sel]._id; this.exit(); if (id === 'now') { if (this.expandMini) this.expandMini(); } else goSection(id); return true; }
    return true;
  },
  // evidenzia la sezione in cui ci si trova
  sync() {
    const s = router.current;
    // cambio schermata: la barra si richiude e la finestrella perde la selezione
    if (this.active) { this.active = false; if (rail) rail.classList.remove('open'); this._paint(); }
    if (this.onRoute) this.onRoute();
    document.body.classList.toggle('playing', !!(s && s.isPlayer));
    if (!rail) return;
    const id = s && s.railId || 'home';
    items.forEach(e => e.classList.toggle('cur', e._id === id));
    const m = this.mini && this.mini();
    items[0].style.display = m ? '' : 'none';
    if (m) { const sp = items[0].lastChild; sp.innerHTML = ''; sp.appendChild(h('span', { class: 'mq' + (m.length > 13 ? ' run' : ''), text: m })); }
  }
};

function tick() { if (clockEl) clockEl.textContent = fmtClock(Date.now()); }

export function applyShell() {
  const s = store.settings();
  clockOpt.h12 = s.clock === '12';
  document.body.classList.toggle('layA', Rail.enabled());
  document.body.classList.toggle('layB', !Rail.enabled());
  tick();
}

export function initShell() {
  rail = h('div', { id: 'rail' }, h('img', { class: 'rlogo', src: 'icon.png', alt: '' }));
  items = [{ id: 'now', icon: 'play', label: 'In riproduzione' }].concat(MENU).map(m => {
    const e = h('div', { class: 'ri' + (m.id === 'set' ? ' last' : '') + (m.id === 'now' ? ' now' : ''), onclick: () => { if (Rail.active) Rail.exit(); if (m.id === 'now') { if (Rail.expandMini) Rail.expandMini(); } else goSection(m.id); } }, icon(m.icon), h('span', { text: m.label }));
    e._id = m.id; rail.appendChild(e); return e;
  });
  rail.addEventListener('mouseenter', () => { if (document.body.classList.contains('mouse')) rail.classList.add('open'); });
  rail.addEventListener('mouseleave', () => { if (!Rail.active) rail.classList.remove('open'); });
  clockEl = h('div', { id: 'gclock' });
  const ver = h('div', { id: 'ver', text: 'v' + VERSION });
  document.body.appendChild(rail); document.body.appendChild(clockEl); document.body.appendChild(ver);
  // aggiorna allo scoccare del minuto, poi ogni minuto
  const now = new Date();
  setTimeout(() => { tick(); clockT = setInterval(tick, 60000); }, (60 - now.getSeconds()) * 1000 + 50);
  applyShell();
  router.onChange = () => Rail.sync();
  Rail.sync();
}
