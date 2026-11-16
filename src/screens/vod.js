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

// unisce due elenchi ordinandoli per data di aggiunta (se nota), altrimenti alternandoli
function mergeRecent(a, b) {
  const t = x => +x.added || 0;
  if (a.concat(b).filter(t).length > (a.length + b.length) / 2) return a.concat(b).sort((x, y) => t(y) - t(x));
  const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

export class VodScreen {
  // mode: 'movie' | 'series'
  constructor(src, mode, opts) {
    this.opts = opts || {};
    // mix: 'all' = film e serie insieme (predefinito di On Demand), 'sport' = eventi sportivi di film e serie
    this.mix = this.opts.mix || (this.opts.sport ? 'sport' : '');
    this.railId = 'ondemand';
    this.src = src; this.mode = this.baseMode = mode; this.zone = 'grid'; this.query = '';
    this.title = this.mix === 'sport' ? 'Sport on demand' : this.mix ? 'On Demand' : mode === 'movie' ? 'Film' : 'Serie TV';
    this.hd = header('On Demand', src.name, [
      { icon: 'search', label: 'Cerca', onclick: () => this.search() },
      { icon: 'list', label: 'Sorgente', onclick: async () => { const m = await import('./home.js'); m.chooseSource(true); } }
    ]);
    this.cats = new VList({
      rowH: () => Math.round(remPx() * 2.9),
      build: () => h('div', { class: 'row crow' }, h('span', { class: 'rt' }), h('span', { class: 'rc' })),
      fill: (n, it) => {
        const on = it.kind === 'filter' && it.mix === this.mix && it.mode === this.mode;
        const tx = it.kind === 'filter' ? (on ? '● ' : '○ ') + it.name : it.kind === 'group' ? it.name : it.name;
        const rc = it.kind === 'group' ? (this.collOpen ? '▾' : '▸') : '';
        if (n._tx === tx && n._rc === rc && n._k === it.kind) return;
        n._tx = tx; n._rc = rc; n._k = it.kind;
        n.firstChild.textContent = tx; n.lastChild.textContent = rc;
        ['k-filter', 'k-group', 'k-coll'].forEach(c => n.classList.toggle(c, c === 'k-' + it.kind));
        n.classList.toggle('on', on);
      },
      // spostandosi sulle categorie la griglia si aggiorna (con un attimo di ritardo, per non caricare a ogni tasto)
      onChange: it => { if (!it.kind || it.kind === 'coll') this.pickSoon(it); },
      onSelect: it => this.catOk(it),
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
        if (n._it !== it) { n._it = it; n._t.textContent = it.name; setImg(n._p, it.poster); n._b.textContent = (this.mix && it._mode === 'series' ? 'SERIE  ' : '') + (it.rating && +it.rating ? '★ ' + it.rating : ''); }
        const mk = store.favKey(this.src.id, 'movie', it.id);
        const done = (it._mode || this.mode) === 'movie' ? (store.getProgress(mk) || store.isWatched(mk)) : null;
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

  // colonna di sinistra: filtri (Tutto/Film/Serie TV/Sport), Raccolte apribili, poi le categorie
  buildList() {
    const F = [{ kind: 'filter', name: 'Tutto', mix: 'all', mode: 'movie' }, { kind: 'filter', name: 'Film', mix: '', mode: 'movie' },
      { kind: 'filter', name: 'Serie TV', mix: '', mode: 'series' }, { kind: 'filter', name: 'Sport', mix: 'sport', mode: 'movie' }];
    const coll = [{ kind: 'coll', id: '', name: '   Tutti' }, { kind: 'coll', id: '__fav', name: '   Preferiti' }, { kind: 'coll', id: '__list', name: '   La mia lista' }];
    if (this.mode === 'movie' && this.mix !== 'sport') coll.push({ kind: 'coll', id: '__cont', name: '   Continua a guardare' });
    const list = F.concat([{ kind: 'group', name: 'Raccolte' }], this.collOpen ? coll : [], this.baseCats);
    this.catList = list;
    return list;
  }
  async loadCats() {
    let cats;
    if (this.mix) {
      // film e serie insieme (tutto, oppure solo le categorie sportive)
      const r = await Promise.all([Promise.resolve().then(() => this.src.vodCats()).catch(() => []), Promise.resolve().then(() => this.src.seriesCats()).catch(() => [])]);
      const keep = c => this.mix !== 'sport' || isSportGroup(c.name);
      if (this.mix === 'all') {
        // stessa categoria per film e serie (es. "Azione") = una sola voce con entrambi
        const by = {}; cats = [];
        r[0].map(c => [c, 'movie']).concat(r[1].map(c => [c, 'series'])).forEach(x => {
          const k = x[0].name.trim().toLowerCase();
          if (!by[k]) { by[k] = { id: 'mix:' + k, name: x[0].name.trim(), parts: [] }; cats.push(by[k]); }
          by[k].parts.push({ id: x[0].id, _mode: x[1] });
        });
      } else cats = r[0].filter(keep).map(c => Object.assign({}, c, { _mode: 'movie' }))
        .concat(r[1].filter(keep).map(c => Object.assign({}, c, { _mode: 'series', name: c.name + '  · serie' })));
      if (!cats.length && this.mix === 'sport') Modal.toast('Nessun contenuto sportivo on demand in questa sorgente. Le dirette sono in TV in diretta › Sport', 6000);
    } else cats = await (this.mode === 'movie' ? this.src.vodCats() : this.src.seriesCats());
    this.baseCats = cats;
  }
  // prima voce da mostrare: con Xtream la prima categoria (il catalogo intero è pesante), altrimenti "Tutti"
  defaultIndex() {
    const list = this.catList, firstCat = list.findIndex(c => !c.kind);
    if (this.src.cfg.type === 'xtream' && firstCat >= 0) return firstCat;
    const all = list.findIndex(c => c.kind === 'coll' && c.id === '');
    return all >= 0 ? all : (firstCat >= 0 ? firstCat : 0);
  }
  async onShow(first) {
    if (first) {
      this.collOpen = !!store.settings().odCollOpen || this.src.cfg.type !== 'xtream';
      showLoading('Caricamento ' + this.title.toLowerCase() + '…', this.src.name);
      try {
        await this.loadCats();
        hideLoading();
        this.cats.setItems(this.buildList());
        this.loaded = true;
        this.cats.sel = this.defaultIndex();
        this.cats.render();
        await this.pickCat(this.catList[this.cats.sel]);
        this.setZone('grid');
      } catch (e) { hideLoading(); Modal.toast('Errore: ' + e.message, 5000); router.back(); }
    } else {
      this.cats.relayout(); this.grid.relayout(); this.setZone(this.zone === 'bar' ? 'grid' : this.zone); this.grid.render();
    }
  }
  pickSoon(it) { clearTimeout(this._pt); this._pt = setTimeout(() => this.pickCat(it), 220); }
  // OK nella colonna: filtro = cambia tipo senza ricostruire la schermata; Raccolte = apri/chiudi; categoria = vai alla griglia
  async catOk(it) {
    if (!it) return;
    if (it.kind === 'group') {
      this.collOpen = !this.collOpen; store.settings().odCollOpen = this.collOpen; store.save();
      const keep = this.cats.sel; this.cats.setItems(this.buildList()); this.cats.sel = keep; this.cats.render(); return;
    }
    if (it.kind === 'filter') {
      if (it.mix === this.mix && it.mode === this.mode) { this.setZone('grid'); return; }
      this.mix = it.mix; this.mode = this.baseMode = it.mode;
      this.title = this.mix === 'sport' ? 'Sport on demand' : this.mix ? 'On Demand' : this.mode === 'movie' ? 'Film' : 'Serie TV';
      showLoading('Caricamento ' + it.name.toLowerCase() + '…', this.src.name);
      try { await this.loadCats(); } catch (e) { Modal.toast('Errore: ' + e.message, 4000); }
      hideLoading();
      const fi = this.catList.indexOf(it);
      this.cats.setItems(this.buildList()); this.cats.sel = fi >= 0 ? fi : 0; this.cats.render();
      await this.pickCat(this.catList[this.defaultIndex()]);
      return;
    }
    clearTimeout(this._pt);
    if (this.catId !== it.id) await this.pickCat(it);
    this.setZone('grid');
  }
  destroy() { this.updInfo.cancel(); clearTimeout(this._pt); }

  async fetchList(c) {
    const m = this.mode === 'movie';
    if (c.id === '__fav') {
      const favs = store.get().favorites; const out = [];
      for (const k in favs) { const f = favs[k]; const ok = this.mix === 'all' ? (f.kind === 'movie' || f.kind === 'series') : (m ? f.kind === 'movie' : f.kind === 'series'); if (f.src === this.src.id && ok) { const it = Object.assign({}, f.item || { id: f.id, name: f.name, poster: f.poster || f.logo, ext: f.ext }); it._mode = f.kind; out.push(it); } }
      return out;
    }
    if (c.id === '__list') {
      const l = store.get().mylist || {}; const out = [];
      for (const k in l) { const f = l[k]; const ok = this.mix === 'all' ? true : this.mix === 'sport' ? true : (m ? f.kind === 'movie' : f.kind === 'series'); if (f.src === this.src.id && ok) { const it = Object.assign({}, f.item || { id: f.id, name: f.name, poster: f.poster, ext: f.ext }); it._mode = f.kind; out.push(it); } }
      return out.sort((a, b) => ((l[store.favKey(this.src.id, b._mode, b.id)] || {}).t || 0) - ((l[store.favKey(this.src.id, a._mode, a.id)] || {}).t || 0));
    }
    if (c.id === '__cont') {
      const out = []; const prog = store.get().progress;
      store.get().recents.forEach(r => { if (r.src === this.src.id && r.kind === 'movie' && prog[r.key]) out.push({ id: r.id, name: r.name, poster: r.poster || r.logo, ext: r.ext, url: r.url, _mode: 'movie' }); });
      return out;
    }
    if (this.mix === 'all' && c.id === '') {
      // tutto: film e serie in un'unica griglia, i più recenti per primi
      const r = await Promise.all([this._items({ id: '', _mode: 'movie' }).catch(() => []), this._items({ id: '', _mode: 'series' }).catch(() => [])]);
      return mergeRecent(r[0], r[1]);
    }
    if (this.mix && c.id === '') {
      const parts = await Promise.all(this.baseCats.map(k => this._items(k)));
      return [].concat.apply([], parts);
    }
    if (c.parts) {
      const r = await Promise.all(c.parts.map(k => this._items(k).catch(() => [])));
      return r.length > 1 ? mergeRecent(r[0], r[1]) : r[0];
    }
    if (this.mix && c._mode) return this._items(c);
    return m ? this.src.vodItems(c.id) : this.src.seriesItems(c.id);
  }
  async _items(k) {
    const l = await (k._mode === 'series' ? this.src.seriesItems(k.id) : this.src.vodItems(k.id));
    l.forEach(i => { i._mode = k._mode; });
    return l;
  }

  async pickCat(c) {
    if (!c || c.kind === 'filter' || c.kind === 'group') return;
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
    if (k === 'back' && this.query) { this.query = ''; this.pickCat(this.catList.find(c => c.id === this.catId) || this.catList[this.defaultIndex()]); return true; }
    return false;
  }

  async search() {
    const q = await promptText({ title: 'Cerca in ' + this.title, quick: false, value: this.query, hint: 'Cerca in tutte le categorie' });
    this.setZone(this.zone === 'bar' ? 'grid' : this.zone);
    if (q === null) return;
    const text = q.trim().toLowerCase();
    if (!text) { this.pickCat(this.catList.find(c => c.id === this.catId) || this.catList[this.defaultIndex()]); return; }
    showLoading('Ricerca…');
    try {
      const all = this.mix === 'all' ? mergeRecent(await this._items({ id: '', _mode: 'movie' }).catch(() => []), await this._items({ id: '', _mode: 'series' }).catch(() => [])) : await (this.mode === 'movie' ? this.src.vodItems('') : this.src.seriesItems(''));
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
      try { inf = this.infoCache[it.id] = (it._mode || this.mode) === 'movie' ? await this.src.vodInfo(it) : (await this.src.seriesInfo(it)).info; } catch (e) { return; }
    }
    if (this.grid.current() !== it) return;
    this.iP.textContent = inf.plot || it.plot || '';
    this.iM.textContent = [inf.year || it.year, inf.rating && +inf.rating ? '★ ' + inf.rating : '', inf.genre || it.genre, inf.duration ? Math.round(inf.duration / 60) + ' min' : ''].filter(Boolean).join('  •  ');
    this.iC.textContent = inf.cast ? 'Cast: ' + String(inf.cast).slice(0, 140) : '';
  }

  open(it) {
    if (!it) return;
    router.push(new DetailScreen(this.src, it._mode || this.mode, it, this.infoCache[it.id]));
  }

  toggleFav(it) {
    if (!it) return;
    const kind = (it._mode || this.mode) === 'movie' ? 'movie' : 'series';
    const key = store.favKey(this.src.id, kind, it.id);
    const on = store.toggleFav(key, { kind: kind, src: this.src.id, id: it.id, name: it.name, logo: it.poster, poster: it.poster, ext: it.ext, item: it });
    Modal.toast(on ? '★ Aggiunto ai preferiti' : 'Rimosso dai preferiti', 1500);
  }
  async itemMenu(it) {
    const kind = (it._mode || this.mode) === 'movie' ? 'movie' : 'series', key = store.favKey(this.src.id, kind, it.id);
    const r = await Modal.menu(it.name, [{ label: 'Apri scheda', value: 'open', icon: 'info' },
      { label: store.isFav(key) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti', value: 'fav', icon: 'star' },
      { label: store.inList(key) ? 'Togli dalla mia lista' : 'Aggiungi alla mia lista', value: 'list', icon: 'plus' }]);
    if (r === 'open') this.open(it); else if (r === 'fav') this.toggleFav(it);
    else if (r === 'list') { const on = store.toggleList(key, { kind: kind, src: this.src.id, id: it.id, name: it.name, poster: it.poster, ext: it.ext, item: it }); Modal.toast(on ? 'Aggiunto alla tua lista' : 'Tolto dalla tua lista', 1500); if (this.catId === '__list') this.pickCat(this.catList.find(c => c.id === '__list')); }
  }
}
