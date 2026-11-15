// TV in diretta: categorie | canali (con "ora in onda") | anteprima con guida programmi
import { h, fmtClock, debounce } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { Epg } from '../core/epg.js';
import { VList } from '../ui/vlist.js';
import { header, hints, remPx, img, setImg } from '../ui/chrome.js';
import { icon } from '../ui/icons.js';
import { promptText } from '../ui/keyboard.js';
import * as Modal from '../ui/modal.js';
import { Engine } from '../ui/engine.js';
import { startEpg, epgStatus, liveOpts, showLoading, hideLoading } from '../core/session.js';
import { PlayerScreen } from './player.js';

export class LiveScreen {
  constructor(src, opts) {
    this.src = src; this.opts = opts || {};
    this.zone = 'chs'; this.query = ''; this.catId = '__all';
    this.hd = header('TV in diretta', src.name, [
      { icon: 'search', label: 'Cerca', onclick: () => this.search() },
      { icon: 'list', label: 'Sorgente', onclick: () => this.switchSource() }
    ]);
    const rh = () => Math.round(remPx() * 3.1);
    this.cats = new VList({
      rowH: () => Math.round(remPx() * 2.9),
      build: () => h('div', { class: 'row crow' }, h('span', { class: 'rt' }), h('span', { class: 'rc' })),
      fill: (n, it) => { if (n._it === it) return; n._it = it; n.firstChild.textContent = it.name; n.lastChild.textContent = it.count != null ? it.count : ''; },
      onChange: it => this.pickCat(it),
      onSelect: () => this.setZone('chs'),
      onEdge: d => { if (d === 'right') { this.setZone('chs'); return true; } if (d === 'up') { this.setZone('bar'); return true; } return true; }
    });
    this.chs = new VList({
      rowH: rh,
      build: () => {
        const logo = h('div', { class: 'lg' }); const im = img(); logo.appendChild(im);
        const nm = h('div', { class: 'cn' }), now = h('div', { class: 'cnow' });
        const bar = h('div', { class: 'cbar' }, h('div', { class: 'cfill' }));
        const star = icon('star', 'cstar');
        const r = h('div', { class: 'row chrow' }, h('span', { class: 'cnum' }), logo, h('div', { class: 'cmid' }, nm, now, bar), star);
        r._n = r.firstChild; r._im = im; r._nm = nm; r._now = now; r._bar = bar; r._star = star;
        return r;
      },
      fill: (n, ch) => this.fillChannel(n, ch),
      onChange: ch => this.onChannel(ch),
      onSelect: (ch, i) => this.play(i),
      onMenu: ch => this.channelMenu(ch),
      onEdge: d => { if (d === 'left') { this.setZone('cats'); return true; } if (d === 'up') { this.setZone('bar'); return true; } return true; }
    });
    // pannello anteprima
    this.pv = h('video', { class: 'pvideo', muted: true, playsinline: true });
    this.pvLogo = img('pvlogo');
    this.pvBox = h('div', { class: 'pbox' }, this.pvLogo, this.pv);
    this.pvT = h('div', { class: 'pvt' }); this.pvS = h('div', { class: 'pvs' });
    this.pvBar = h('div', { class: 'pbar' }, h('div', { class: 'pfill' }));
    this.pvD = h('div', { class: 'pvd' }); this.pvN = h('div', { class: 'pvn' });
    this.pvEpg = h('div', { class: 'pvepg' });
    this.prev = h('div', { class: 'pane prev' }, this.pvBox, this.pvT, this.pvS, this.pvBar, this.pvD, this.pvN, this.pvEpg);
    this.panes = h('div', { class: 'panes' },
      h('div', { class: 'pane cats' }, this.cats.el),
      h('div', { class: 'pane chs' }, this.chs.el), this.prev);
    this.status = h('div', { class: 'status' });
    this.el = h('div', { class: 'screen live' }, this.hd.el, this.panes, hints([['red', 'Preferito'], ['green', 'Cerca'], ['yellow', 'Sorgente'], ['ok', 'Guarda'], ['menu', 'Opzioni']]), this.status);
    this.updPrev = debounce(() => this.renderPreview(), 180);
    this.pvEngine = null; this.pvTimer = null;
    this.loaded = false;
  }

  async onShow(first) {
    if (first) {
      showLoading('Caricamento canali…', this.src.name);
      let live;
      try { live = await this.src.live(); } catch (e) { hideLoading(); Modal.toast('Errore: ' + e.message, 5000); router.back(); return; }
      hideLoading();
      if (Epg.srcId !== this.src.id) Epg.reset();
      this.all = live.items; this.baseCats = live.cats;
      this.byGroup = {};
      this.all.forEach(c => { (this.byGroup[c.group] = this.byGroup[c.group] || []).push(c); c._k = c.name.toLowerCase(); });
      this.rebuildCats();
      this.loaded = true;
      this.setZone('chs');
      // posizione iniziale: ultimo canale visto
      const last = store.get().recents.filter(r => r.kind === 'live' && r.src === this.src.id)[0];
      const want = this.opts.playId || (last && last.id);
      if (want) { const idx = this.list.findIndex(c => c.id === want); if (idx >= 0) this.chs.select(idx, true); }
      this.chs.render(); this.cats.render();
      this.onChannel(this.chs.current());
      if (this.src.epgUrl) {
        this.status.textContent = 'Guida programmi: caricamento…';
        startEpg(this.src, this.all, () => { this.status.textContent = ''; this.chs.render(); this.renderPreview(); });
        const iv = setInterval(() => { if (epgStatus(this.src.id) !== 'loading') { clearInterval(iv); if (epgStatus(this.src.id) === 'error') this.status.textContent = 'Guida programmi non disponibile'; else this.status.textContent = ''; } }, 1500);
        this._iv = iv;
      }
      if (this.opts.playId) { const idx = this.list.findIndex(c => c.id === this.opts.playId); if (idx >= 0) this.play(idx); }
    } else {
      this.chs.relayout(); this.cats.relayout();
      this.setZone(this.zone === 'bar' ? 'chs' : this.zone);
      this.chs.render();
    }
  }
  onHide() { this.stopPreview(); }
  destroy() { clearInterval(this._iv); this.stopPreview(); if (this.pvEngine) { this.pvEngine.destroy(); this.pvEngine = null; } }

  rebuildCats() {
    const favCount = this.all.filter(c => store.isFav(store.favKey(this.src.id, 'live', c.id))).length;
    const cats = [{ id: '__fav', name: 'Preferiti', count: favCount }, { id: '__all', name: 'Tutti i canali', count: this.all.length }].concat(this.baseCats);
    if (this.query) cats.unshift({ id: '__q', name: 'Ricerca: ' + this.query, count: 0 });
    this.catList = cats;
    const keepIdx = Math.max(0, cats.findIndex(c => c.id === this.catId));
    this.cats.setItems(cats); this.cats.sel = keepIdx; this.cats.render();
    this.pickCat(cats[keepIdx], true);
  }

  pickCat(c, keepSel) {
    if (!c) return;
    this.catId = c.id;
    if (c.id === '__all') this.list = this.all;
    else if (c.id === '__fav') this.list = this.all.filter(ch => store.isFav(store.favKey(this.src.id, 'live', ch.id)));
    else if (c.id === '__q') { const q = this.query.toLowerCase(); this.list = this.all.filter(ch => ch._k.indexOf(q) >= 0); c.count = this.list.length; }
    else this.list = this.byGroup[c.id] || [];
    this.chs.setItems(this.list, false);
    this.onChannel(this.chs.current());
  }

  fillChannel(n, ch) {
    n._n.textContent = ch.num;
    n._nm.textContent = ch.name;
    setImg(n._im, ch.logo);
    n._star.style.display = store.isFav(store.favKey(this.src.id, 'live', ch.id)) ? '' : 'none';
    const nn = Epg.ready || Epg.getShort(ch) ? Epg.nowNext(ch) : null;
    if (nn && nn.now) {
      n._now.textContent = nn.now[2];
      n._bar.style.display = '';
      n._bar.firstChild.style.width = Math.max(0, Math.min(100, (Date.now() - nn.now[0]) / (nn.now[1] - nn.now[0]) * 100)) + '%';
    } else { n._now.textContent = ''; n._bar.style.display = 'none'; }
  }

  // ---- zone / focus
  setZone(z) {
    this.zone = z;
    this.cats.setActive(z === 'cats'); this.chs.setActive(z === 'chs');
    if (z === 'bar') nav.focus(this.hd.buttons[0]);
    else if (nav.getFocus() && this.hd.el.contains(nav.getFocus())) { nav.getFocus().classList.remove('focused'); }
  }

  onKey(a) {
    if (!this.loaded) return a.a === 'back' ? false : true;
    const k = a.a;
    if (this.zone === 'bar') {
      if (k === 'down') { this.setZone('chs'); return true; }
      if (k === 'left' || k === 'right') { nav.move(k); return true; }
      if (k === 'ok') { nav.activate(); return true; }
    } else {
      if (k === 'red') { this.toggleFav(); return true; }
      if (k === 'green') { this.search(); return true; }
      if (k === 'yellow') { this.switchSource(); return true; }
      const vl = this.zone === 'cats' ? this.cats : this.chs;
      if (vl.handleKey(k)) return true;
    }
    if (k === 'back') { if (this.query) { this.query = ''; this.catId = '__all'; this.rebuildCats(); return true; } }
    return false;
  }

  // ---- azioni
  play(i) {
    this.stopPreview();
    router.push(new PlayerScreen(liveOpts(this.src, this.list, i, { onIndex: ix => { this.chs.select(ix, true); } })));
  }

  toggleFav() {
    const ch = this.chs.current(); if (!ch) return;
    const key = store.favKey(this.src.id, 'live', ch.id);
    const on = store.toggleFav(key, { kind: 'live', src: this.src.id, id: ch.id, name: ch.name, logo: ch.logo });
    Modal.toast(on ? '★ ' + ch.name + ' aggiunto ai preferiti' : ch.name + ' rimosso dai preferiti', 1800);
    const fav = this.catList.find(c => c.id === '__fav'); if (fav) { fav.count += on ? 1 : -1; }
    if (this.catId === '__fav') this.pickCat(this.catList.find(c => c.id === '__fav'));
    this.cats.render(); this.chs.render();
  }

  async channelMenu(ch) {
    const key = store.favKey(this.src.id, 'live', ch.id);
    const r = await Modal.menu(ch.name, [
      { label: 'Guarda ora', value: 'play', icon: 'play' },
      { label: store.isFav(key) ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti', value: 'fav', icon: 'star' }]);
    if (r === 'play') this.play(this.chs.sel); else if (r === 'fav') this.toggleFav();
  }

  async search() {
    const q = await promptText({ title: 'Cerca un canale', value: this.query, quick: false, hint: 'Cerca in tutti i canali di questa sorgente' });
    if (q === null) { this.setZone(this.zone === 'bar' ? 'chs' : this.zone); return; }
    this.query = q.trim();
    this.catId = this.query ? '__q' : '__all';
    this.rebuildCats();
    this.setZone('chs');
  }

  async switchSource() {
    const { chooseSource } = await import('./home.js');
    chooseSource(true);
  }

  // ---- anteprima
  onChannel(ch) {
    this.stopPreview();
    this.updPrev();
    const o = store.settings();
    if (o.previewVideo && ch) {
      clearTimeout(this.pvTimer);
      this.pvTimer = setTimeout(() => this.startPreview(ch), 1400);
    }
    // EPG breve a richiesta (Xtream) per il canale selezionato
    if (ch && !Epg.ready && this.src.shortEpg && !Epg.getShort(ch)) {
      clearTimeout(this._eT);
      this._eT = setTimeout(async () => {
        const l = await this.src.shortEpg(ch);
        if (l && l.length) { Epg.setShort(ch, l); if (this.chs.current() === ch) { this.renderPreview(); this.chs.render(); } }
      }, 350);
    }
  }

  renderPreview() {
    const ch = this.chs.current();
    if (!ch) { this.pvT.textContent = this.list && !this.list.length ? 'Nessun canale' : ''; this.pvS.textContent = ''; this.pvD.textContent = ''; this.pvN.textContent = ''; this.pvEpg.innerHTML = ''; setImg(this.pvLogo, ''); return; }
    setImg(this.pvLogo, ch.logo);
    this.pvT.textContent = ch.num + '  ' + ch.name;
    const nn = Epg.nowNext(ch);
    this.pvEpg.innerHTML = '';
    if (nn && nn.now) {
      this.pvS.textContent = 'In onda: ' + nn.now[2] + '  (' + fmtClock(nn.now[0]) + ' – ' + fmtClock(nn.now[1]) + ')';
      this.pvBar.style.display = ''; this.pvBar.firstChild.style.width = Math.max(0, Math.min(100, (Date.now() - nn.now[0]) / (nn.now[1] - nn.now[0]) * 100)) + '%';
      this.pvD.textContent = nn.now[3] || '';
      const l = Epg.list(ch) || [];
      const nowI = l.indexOf(nn.now);
      for (let i = nowI + 1; i < Math.min(l.length, nowI + 5); i++) this.pvEpg.appendChild(h('div', { class: 'pe' }, h('span', { class: 'pet', text: fmtClock(l[i][0]) }), h('span', { text: l[i][2] })));
    } else {
      this.pvS.textContent = ch.group || ''; this.pvBar.style.display = 'none'; this.pvD.textContent = ''; this.pvN.textContent = Epg.ready || this.src.shortEpg ? '' : '';
    }
  }

  startPreview(ch) {
    if (router.current !== this) return;
    if (!this.pvEngine) { this.pvEngine = new Engine(this.pv); this.pvEngine.onPlaying = () => this.pv.classList.add('on'); }
    this.pvEngine.load(this.src.urlFor(ch, 'live'), { live: true, muted: true });
  }
  stopPreview() {
    clearTimeout(this.pvTimer);
    if (this.pvEngine) { this.pvEngine.stop(); }
    this.pv.classList.remove('on');
  }
}
