// Scheda dettaglio: film (trama, cast, durata, riprendi) e serie (stagioni/episodi)
import { h, fmtDur } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { VList } from '../ui/vlist.js';
import { remPx, img, setImg, hints } from '../ui/chrome.js';
import { icon } from '../ui/icons.js';
import * as Modal from '../ui/modal.js';
import { showLoading, hideLoading, movieOpts, episodesOpts } from '../core/session.js';
import { PlayerScreen } from './player.js';
import { Rail } from '../ui/shell.js';

export class DetailScreen {
  constructor(src, mode, item, cachedInfo) {
    this.railId = mode;
    this.src = src; this.mode = mode; this.item = item; this.info = cachedInfo || {};
    this.key = store.favKey(src.id, mode === 'movie' ? 'movie' : 'series', item.id);
    this.poster = img('dpost'); setImg(this.poster, item.poster);
    this.t = h('div', { class: 'dt', text: item.name });
    this.m = h('div', { class: 'dm' }); this.p = h('div', { class: 'dp', text: item.plot || '' }); this.c = h('div', { class: 'dc' });
    this.btns = h('div', { class: 'dbtns' });
    this.seasonsBox = h('div', { class: 'dseasons', 'data-scroll': 1 });
    this.eps = null;
    this.right = h('div', { class: 'dright' }, this.t, this.m, this.p, this.c, this.btns, this.seasonsBox);
    this.back = h('div', { class: 'dback' });
    this.el = h('div', { class: 'screen detail' }, h('div', { class: 'backbtn floating', title: 'Indietro', onclick: () => router.back() }, icon('back')), h('div', { class: 'dwrap' }, h('div', { class: 'dleft' }, h('div', { class: 'dpbox' }, this.poster)), this.right), hints([['ok', 'Seleziona'], ['back', 'Indietro'], ['red', 'Preferito']]));
    this.zone = 'btns';
  }

  async onShow(first) {
    if (!first) { this.refreshButtons(); if (this.eps) this.eps.render(); return; }
    this.fill();
    this.refreshButtons();
    showLoading('Carico la scheda…');
    try {
      if (this.mode === 'movie') {
        if (!this.info.plot) this.info = await this.src.vodInfo(this.item) || {};
        this.fill();
      } else {
        const r = await this.src.seriesInfo(this.item);
        this.info = r.info || {}; this.seasons = r.seasons || [];
        this.fill(); this.buildEpisodes();
      }
    } catch (e) { Modal.toast('Errore: ' + e.message, 4000); }
    hideLoading();
    this.refreshButtons();
    this.setFocus();
  }

  fill() {
    const i = this.info, it = this.item;
    this.t.textContent = it.name;
    this.m.textContent = [i.year || it.year, i.rating && +i.rating ? '★ ' + i.rating : '', i.genre || it.genre, i.duration ? Math.round(i.duration / 60) + ' min' : ''].filter(Boolean).join('  •  ');
    this.p.textContent = i.plot || it.plot || 'Nessuna descrizione disponibile.';
    this.c.textContent = [i.director ? 'Regia: ' + i.director : '', i.cast ? 'Cast: ' + String(i.cast).slice(0, 160) : ''].filter(Boolean).join('   ');
    if (i.poster && !this.item.poster) setImg(this.poster, i.poster);
  }

  refreshButtons() {
    this.btns.innerHTML = '';
    const prog = this.mode === 'movie' ? store.getProgress(this.key.replace('|series|', '|movie|')) : null;
    if (this.mode === 'movie') {
      if (prog && prog.pos > 30) {
        this.btns.appendChild(this.btn('play', 'Riprendi da ' + fmtDur(prog.pos), () => this.playMovie(), true));
        this.btns.appendChild(this.btn('refresh', 'Dall\'inizio', () => { store.clearProgress(store.favKey(this.src.id, 'movie', this.item.id)); this.playMovie(); }));
      } else this.btns.appendChild(this.btn('play', 'Riproduci', () => this.playMovie(), true));
    }
    this.favBtn = this.btn('star', store.isFav(this.key) ? 'Nei preferiti' : 'Preferiti', () => this.toggleFav());
    this.btns.appendChild(this.favBtn);
  }
  btn(ic, label, fn, primary) { return h('div', { class: 'btn' + (primary ? ' primary' : ''), 'data-f': 1, onclick: fn }, icon(ic), h('span', { text: label })); }

  setFocus() {
    const first = this.btns.querySelector('[data-f]');
    if (this.mode === 'series' && this.eps && this.eps.items.length) { this.setZone('eps'); }
    else { this.zone = 'btns'; if (first) nav.focus(first); }
  }
  setZone(z) {
    this.zone = z;
    if (this.eps) this.eps.setActive(z === 'eps');
    if (z === 'btns') { const f = this.btns.querySelector('[data-f]'); if (f) nav.focus(f); }
    else if (z === 'seasons') { const s = this.seasonsBox.querySelector('.chip.on') || this.seasonsBox.querySelector('.chip'); if (s) nav.focus(s); }
    else if (nav.getFocus()) nav.getFocus().classList.remove('focused');
  }

  buildEpisodes() {
    this.seasonsBox.innerHTML = '';
    if (!this.seasons.length) { this.seasonsBox.appendChild(h('div', { class: 'dp', text: 'Nessun episodio disponibile.' })); return; }
    this.curSeason = 0;
    const last = store.get().recents.filter(r => r.kind === 'episode' && r.src === this.src.id && r.show === this.item.name)[0];
    this.chips = h('div', { class: 'chips' }, this.seasons.map((s, i) => h('div', { class: 'chip' + (i === 0 ? ' on' : ''), 'data-f': 1, text: 'Stagione ' + s.n, onclick: () => { this.pickSeason(i); this.setZone('eps'); } })));
    this.seasonsBox.appendChild(this.chips);
    this.eps = new VList({
      rowH: () => Math.round(remPx() * 3.6),
      build: () => { const r = h('div', { class: 'row eprow' }, h('span', { class: 'en' }), h('div', { class: 'et' }, h('div', { class: 'e1' }), h('div', { class: 'e2' })), h('span', { class: 'ed' }), h('div', { class: 'cbar' }, h('div', { class: 'cfill' }))); r._n = r.firstChild; r._1 = r.querySelector('.e1'); r._2 = r.querySelector('.e2'); r._d = r.querySelector('.ed'); r._b = r.lastChild; return r; },
      fill: (n, ep) => {
        n._n.textContent = ep.num; n._1.textContent = ep.title; n._2.textContent = ep.plot ? ep.plot.slice(0, 110) : '';
        const ek = store.favKey(this.src.id, 'ep', ep.id);
        n._d.textContent = (store.isWatched(ek) ? '✓ visto  ' : '') + (ep.duration ? Math.round(ep.duration / 60) + ' min' : '');
        const p = store.getProgress(ek);
        n._b.style.display = p ? '' : 'none'; if (p) n._b.firstChild.style.width = Math.min(100, p.pos / p.dur * 100) + '%';
      },
      onSelect: (ep, i) => this.playEpisode(i),
      onEdge: d => { if (d === 'up') { this.setZone('seasons'); return true; } if (d === 'left') Rail.enter(); return true; }
    });
    this.eps.el.classList.add('eplist');
    this.seasonsBox.appendChild(this.eps.el);
    let si = 0, ei = 0;
    if (last) { this.seasons.forEach((s, i) => s.episodes.forEach((e, j) => { if (e.id === last.id) { si = i; ei = j; } })); }
    this.pickSeason(si);
    this.eps.sel = ei; this.eps.render();
  }

  pickSeason(i) {
    this.curSeason = i;
    const s = this.seasons[i];
    s.episodes.forEach(e => { e.season = s.n; });
    if (this.chips) Array.prototype.forEach.call(this.chips.children, (c, k) => c.classList.toggle('on', k === i));
    this.eps.setItems(s.episodes);
  }

  onRailEnter() { if (this.eps) this.eps.setActive(false); }
  onRailExit() { this.setZone(this.zone || 'btns'); }
  onKey(a) {
    const k = a.a;
    if (k === 'red') { this.toggleFav(); return true; }
    if (this.mode === 'series' && this.eps) {
      if (this.zone === 'eps') {
        if (this.eps.handleKey(k)) return true;
        if (k === 'back') return false;
      } else if (this.zone === 'seasons') {
        if (k === 'left' || k === 'right') { nav.move(k); const idx = Array.prototype.indexOf.call(this.chips.children, nav.getFocus()); if (idx >= 0) this.pickSeason(idx); return true; }
        if (k === 'down') { this.setZone('eps'); return true; }
        if (k === 'up') { this.setZone('btns'); return true; }
        if (k === 'ok') { this.setZone('eps'); return true; }
      } else if (this.zone === 'btns') {
        if (k === 'down') { this.setZone('seasons'); return true; }
        if (k === 'left' || k === 'right') { if (!nav.move(k) && k === 'left') Rail.enter(); return true; }
        if (k === 'ok') { nav.activate(); return true; }
      }
      return false;
    }
    if (k === 'left' || k === 'right') { if (!nav.move(k) && k === 'left') Rail.enter(); return true; }
    if (k === 'ok') { nav.activate(); return true; }
    return false;
  }

  toggleFav() {
    const kind = this.mode === 'movie' ? 'movie' : 'series';
    const it = this.item;
    const on = store.toggleFav(store.favKey(this.src.id, kind, it.id), { kind: kind, src: this.src.id, id: it.id, name: it.name, logo: it.poster, poster: it.poster, ext: it.ext, item: it });
    Modal.toast(on ? '★ Aggiunto ai preferiti' : 'Rimosso dai preferiti', 1500);
    this.refreshButtons(); if (this.zone === 'btns') this.setZone('btns');
  }

  playMovie() { router.push(new PlayerScreen(movieOpts(this.src, this.item, this.info))); }
  playEpisode(i) {
    const s = this.seasons[this.curSeason];
    const all = [];
    let start = 0;
    this.seasons.forEach(se => se.episodes.forEach(e => { e.season = se.n; if (se === s && e === s.episodes[i]) start = all.length; all.push(e); }));
    router.push(new PlayerScreen(episodesOpts(this.src, Object.assign({}, this.item, { poster: this.item.poster || this.info.poster }), all, start)));
  }
}
