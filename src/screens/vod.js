import { isSportGroup } from '../core/sport.js';
import { Rail } from '../ui/shell.js';
import { Mini } from './player.js';
// Film e Serie TV: categorie | griglia locandine | scheda informativa
import { h, debounce } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { VList } from '../ui/vlist.js';
import { header, hints, remPx, img, setImg } from '../ui/chrome.js';
import { promptText } from '../ui/keyboard.js';
import * as Modal from '../ui/modal.js';
import { showLoading, hideLoading } from '../core/session.js';
import { DetailScreen } from './detail.js';

export class VodScreen {
  // mode: 'movie' | 'series'
  constructor(src, mode, opts) {
    this.opts = opts || {};
    this.railId = this.opts.sport ? 'sport' : mode;
    this.src = src; this.mode = mode; this.zone = 'grid'; this.query = '';
    this.title = mode === 'movie' ? 'Film' : 'Serie TV';
    this.hd = header(this.title, src.name, [
      { icon: 'search', label: 'Cerca', onclick: () => this.search() },
      { icon: 'list', label: 'Sorgente', onclick: async () => { const m = await import('./home.js'); m.chooseSource(true); } }
    ]);
    this.cats = new VList({
      rowH: () => Math.round(remPx() * 2.9),
      build: () => h('div', { class: 'row crow' }, h('span', { class: 'rt' }), h('span', { class: 'rc' })),
      fill: (n, it) => { if (n._it === it) return; n._it = it; n.firstChild.textContent = it.name; n.lastChild.textContent = ''; },
      onChange: it => this.pickCat(it),
      onSelect: () => this.setZone('grid'),
      onEdge: d => { if (d === 'right') { this.setZone('grid'); return true; } if (d === 'up') { this.setZone('bar'); return true; } if (d === 'left') Rail.enter(); return true; }
    });
    this.cols = 4;
    this.grid = new VList({
      cols: this.cols,
      rowH: W => Math.round((W / this.cols) * 1.42 + remPx() * 2.6),
      build: () => {
        const p = img('cposter'); const t = h('div', { class: 'ctitle' }); const b = h('div', { class: 'cbadge' });
        const c = h('div', { class: 'cell' }, h('div', { class: 'cin' }, h('div', { class: 'cpbox' }, p, b), t));
        c._p = p; c._t = t; c._b = b; return c;
      },
      fill: (n, it) => {
        if (n._it !== it) { n._it = it; n._t.textContent = it.name; setImg(n._p, it.poster); n._b.textContent = it.rating && +it.rating ? '★ ' + it.rating : ''; }
        const mk = store.favKey(this.src.id, 'movie', it.id);
        const done = this.mode === 'movie' ? (store.getProgress(mk) || store.isWatched(mk)) : null;
        n.classList.toggle('seen', !!done);
      },
      onChange: it => this.onItem(it),
      onSelect: it => this.open(it),
      onMenu: it => this.itemMenu(it),
      onEdge: d => { if (d === 'left') { this.setZone('cats'); return true; } if (d === 'up') { this.setZone('bar'); return true; } if (d === 'down') Mini.focusFrom(d); return true; }
    });
    // pannello info
    this.iPoster = img('ipost'); this.iT = h('div', { class: 'it' }); this.iM = h('div', { class: 'im' }); this.iP = h('div', { class: 'ip' }); this.iC = h('div', { class: 'ic' });
    this.info = h('div', { class: 'pane info' }, h('div', { class: 'ipbox' }, this.iPoster), this.iT, this.iM, this.iP, this.iC);
    this.el = h('div', { class: 'screen vod' }, this.hd.el,
      h('div', { class: 'panes' }, h('div', { class: 'pane cats' }, this.cats.el), h('div', { class: 'pane grid' }, this.grid.el), this.info),
      hints([['ok', 'Dettagli'], ['menu', 'Preferito / opzioni'], ['back', 'Indietro']]));
    this.updInfo = debounce(it => this.fetchInfo(it), 450);
    this.infoCache = {};
  }

  async onShow(first) {
    if (first) {
      showLoading('Caricamento ' + this.title.toLowerCase() + '…', this.src.name);
      try {
        let cats = await (this.mode === 'movie' ? this.src.vodCats() : this.src.seriesCats());
        hideLoading();
        const sp = this.opts.sport;
        if (sp) cats = cats.filter(c => isSportGroup(c.name));
        this.baseCats = cats;
        const list = [{ id: '', name: 'Tutti' }, { id: '__fav', name: 'Preferiti' }, { id: '__cont', name: 'Continua a guardare' }].concat(cats);
        if (this.mode === 'series') list.splice(2, 1);
        if (sp) { const i = list.findIndex(c => c.id === '__cont'); if (i >= 0) list.splice(i, 1); }
        this.catList = list;
        this.cats.setItems(list);
        this.loaded = true;
        this.cats.sel = !sp && list.length > 3 && this.src.cfg.type === 'xtream' ? 3 : 0;
        this.cats.render();
        await this.pickCat(list[this.cats.sel]);
        this.setZone('grid');
      } catch (e) { hideLoading(); Modal.toast('Errore: ' + e.message, 5000); router.back(); }
    } else {
      this.cats.relayout(); this.grid.relayout(); this.setZone(this.zone === 'bar' ? 'grid' : this.zone); this.grid.render();
    }
  }
  destroy() { this.updInfo.cancel(); }

  async fetchList(c) {
    const m = this.mode === 'movie';
    if (c.id === '__fav') {
      const favs = store.get().favorites; const out = [];
      for (const k in favs) { const f = favs[k]; if (f.src === this.src.id && (m ? f.kind === 'movie' : f.kind === 'series')) out.push(f.item || { id: f.id, name: f.name, poster: f.poster || f.logo, ext: f.ext }); }
      return out;
    }
    if (c.id === '__cont') {
      const out = []; const prog = store.get().progress;
      store.get().recents.forEach(r => { if (r.src === this.src.id && r.kind === 'movie' && prog[r.key]) out.push({ id: r.id, name: r.name, poster: r.poster || r.logo, ext: r.ext, url: r.url }); });
      return out;
    }
    if (this.opts.sport && c.id === '') {
      const parts = await Promise.all(this.baseCats.map(k => m ? this.src.vodItems(k.id) : this.src.seriesItems(k.id)));
      return [].concat.apply([], parts);
    }
    return m ? this.src.vodItems(c.id) : this.src.seriesItems(c.id);
  }

  async pickCat(c) {
    if (!c) return;
    this.catId = c.id; const mine = (this._tok = (this._tok || 0) + 1);
    this.query = '';
    let items;
    try { items = await this.fetchList(c); } catch (e) { Modal.toast('Errore: ' + e.message, 4000); items = []; }
    if (mine !== this._tok) return;
    this.items = items;
    this.grid.setItems(items);
    this.onItem(this.grid.current());
  }

  setZone(z) {
    this.zone = z;
    this.cats.setActive(z === 'cats'); this.grid.setActive(z === 'grid');
    if (z === 'bar') nav.focus(this.hd.buttons[0]);
    else if (nav.getFocus() && this.hd.el.contains(nav.getFocus())) nav.getFocus().classList.remove('focused');
  }

  onRailEnter() { this.cats.setActive(false); this.grid.setActive(false); }
  onRailExit() { this.setZone(this.zone === 'bar' ? 'grid' : this.zone); }
  onKey(a) {
    if (!this.loaded) return a.a !== 'back';
    const k = a.a;
    if (this.zone === 'bar') {
      if (k === 'down') { this.setZone('grid'); return true; }
      if (k === 'left' || k === 'right') { nav.move(k); return true; }
      if (k === 'ok') { nav.activate(); return true; }
    } else {
      if (k === 'green') { this.search(); return true; }
      if (k === 'yellow') { this.hd.buttons[1].click(); return true; }
      if (k === 'red') { this.toggleFav(this.grid.current()); return true; }
      const vl = this.zone === 'cats' ? this.cats : this.grid;
      if (vl.handleKey(k)) return true;
    }
    if (k === 'back' && this.query) { this.pickCat(this.catList[this.cats.sel]); return true; }
    return false;
  }

  async search() {
    const q = await promptText({ title: 'Cerca in ' + this.title, quick: false, value: this.query, hint: 'Cerca in tutte le categorie' });
    this.setZone(this.zone === 'bar' ? 'grid' : this.zone);
    if (q === null) return;
    const text = q.trim().toLowerCase();
    if (!text) { this.pickCat(this.catList[this.cats.sel]); return; }
    showLoading('Ricerca…');
    try {
      const all = await (this.mode === 'movie' ? this.src.vodItems('') : this.src.seriesItems(''));
      this.items = all.filter(i => i.name.toLowerCase().indexOf(text) >= 0);
      this.query = q.trim();
      this.grid.setItems(this.items);
      this.onItem(this.grid.current());
      Modal.toast(this.items.length + ' risultati per “' + q.trim() + '”', 2500);
    } catch (e) { Modal.toast('Errore: ' + e.message, 4000); }
    hideLoading();
  }

  // ---- scheda informativa
  onItem(it) {
    if (!it) { this.iT.textContent = ''; this.iM.textContent = ''; this.iP.textContent = ''; this.iC.textContent = ''; setImg(this.iPoster, ''); return; }
    setImg(this.iPoster, it.poster);
    this.iT.textContent = it.name;
    const meta = [it.year, it.rating && +it.rating ? '★ ' + it.rating : '', it.genre].filter(Boolean).join('  •  ');
    this.iM.textContent = meta;
    this.iP.textContent = it.plot || (this.infoCache[it.id] && this.infoCache[it.id].plot) || '';
    this.iC.textContent = '';
    this.updInfo(it);
  }
  async fetchInfo(it) {
    if (this.grid.current() !== it) return;
    let inf = this.infoCache[it.id];
    if (!inf) {
      try { inf = this.infoCache[it.id] = this.mode === 'movie' ? await this.src.vodInfo(it) : (await this.src.seriesInfo(it)).info; } catch (e) { return; }
    }
    if (this.grid.current() !== it) return;
    this.iP.textContent = inf.plot || it.plot || '';
    this.iM.textContent = [inf.year || it.year, inf.rating && +inf.rating ? '★ ' + inf.rating : '', inf.genre || it.genre, inf.duration ? Math.round(inf.duration / 60) + ' min' : ''].filter(Boolean).join('  •  ');
    this.iC.textContent = inf.cast ? 'Cast: ' + String(inf.cast).slice(0, 140) : '';
  }

  open(it) {
    if (!it) return;
    router.push(new DetailScreen(this.src, this.mode, it, this.infoCache[it.id]));
  }

  toggleFav(it) {
    if (!it) return;
    const kind = this.mode === 'movie' ? 'movie' : 'series';
    const key = store.favKey(this.src.id, kind, it.id);
    const on = store.toggleFav(key, { kind: kind, src: this.src.id, id: it.id, name: it.name, logo: it.poster, poster: it.poster, ext: it.ext, item: it });
    Modal.toast(on ? '★ Aggiunto ai preferiti' : 'Rimosso dai preferiti', 1500);
  }
  async itemMenu(it) {
    const r = await Modal.menu(it.name, [{ label: 'Apri scheda', value: 'open', icon: 'info' }, { label: 'Aggiungi/Rimuovi preferito', value: 'fav', icon: 'star' }]);
    if (r === 'open') this.open(it); else if (r === 'fav') this.toggleFav(it);
  }
}
