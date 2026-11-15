import { h } from '../core/util.js';
import * as store from '../core/store.js';
import { VList } from '../ui/vlist.js';
import { header, hints, remPx, img, setImg } from '../ui/chrome.js';
import * as Modal from '../ui/modal.js';
import { playMeta } from './home.js';

const KIND = { live: 'Canale', movie: 'Film', series: 'Serie TV', episode: 'Episodio', file: 'File' };

export class FavsScreen {
  constructor() {
    this.hd = header('Preferiti', '', []);
    this.list = new VList({
      rowH: () => Math.round(remPx() * 3.6),
      build: () => { const im = img(); const r = h('div', { class: 'row favrow' }, h('div', { class: 'lg' }, im), h('div', { class: 'cmid' }, h('div', { class: 'cn' }), h('div', { class: 'cnow' })), h('span', { class: 'rc' })); r._im = im; r._n = r.querySelector('.cn'); r._s = r.querySelector('.cnow'); r._k = r.lastChild; return r; },
      fill: (n, f) => { n._n.textContent = f.name; n._s.textContent = f.sub || ''; n._k.textContent = KIND[f.kind] || ''; setImg(n._im, f.logo || f.poster); },
      onSelect: f => playMeta(f),
      onMenu: f => this.menu(f), onEdge: () => true
    });
    this.empty = h('div', { class: 'empty', text: 'Nessun preferito. Premi il tasto rosso (o tieni premuto OK) su un canale, film o serie.' });
    this.el = h('div', { class: 'screen favs' }, this.hd.el, h('div', { class: 'single' }, this.list.el), this.empty, hints([['ok', 'Apri'], ['menu', 'Rimuovi'], ['back', 'Indietro']]));
  }
  onShow() { this.load(); this.list.setActive(true); this.list.relayout(); }
  load() {
    const f = store.get().favorites; const arr = [];
    for (const k in f) { const x = f[k]; x.key = k; arr.push(x); }
    arr.sort((a, b) => (b.t || 0) - (a.t || 0));
    this.list.setItems(arr, true);
    this.empty.style.display = arr.length ? 'none' : '';
  }
  async menu(f) {
    const r = await Modal.menu(f.name, [{ label: 'Apri', value: 'open', icon: 'play' }, { label: 'Rimuovi dai preferiti', value: 'rm', icon: 'trash', danger: true }]);
    if (r === 'open') playMeta(f); else if (r === 'rm') { store.toggleFav(f.key, {}); this.load(); }
  }
  onKey(a) { if (a.a === 'red') { const f = this.list.current(); if (f) { store.toggleFav(f.key, {}); this.load(); } return true; } return this.list.handleKey(a.a); }
}
