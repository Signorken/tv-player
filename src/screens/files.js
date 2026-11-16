// Sfoglia NAS / server di rete (WebDAV o indice HTTP)
import { h, fmtSize, debounce } from '../core/util.js';
import * as store from '../core/store.js';
import { router } from '../core/router.js';
import { VList } from '../ui/vlist.js';
import { header, hints, remPx, img, setImg } from '../ui/chrome.js';
import { icon } from '../ui/icons.js';
import * as Modal from '../ui/modal.js';
import { showLoading, hideLoading, fileOpts } from '../core/session.js';
import { PlayerScreen, Mini } from './player.js';
import { Rail } from '../ui/shell.js';
import { uid } from '../core/util.js';
import { tr } from '../core/i18n.js';

export class FilesScreen {
  constructor(src) {
    this.railId = 'files';
    this.src = src; this.path = src.rootPath; this.entries = []; this.trail = []; this.names = [];
    this.hd = header(src.name, '', [{ icon: 'refresh', label: tr('Aggiorna'), onclick: () => this.load() }]);
    this.list = new VList({
      rowH: () => Math.round(remPx() * 3.0),
      build: () => { const ic = h('span', { class: 'fic' }); const r = h('div', { class: 'row frow' }, ic, h('span', { class: 'fn' }), h('span', { class: 'fs' })); r._ic = ic; r._n = r.querySelector('.fn'); r._s = r.querySelector('.fs'); r._k = null; return r; },
      fill: (n, e) => {
        if (n._e === e) return; n._e = e;
        n._n.textContent = e.name; n._s.textContent = e.dir ? '' : fmtSize(e.size);
        n._ic.innerHTML = ''; n._ic.appendChild(icon(e.dir ? 'folder' : e.kind === 'video' ? 'film' : e.kind === 'playlist' ? 'list' : e.kind === 'audio' ? 'video' : 'video'));
      },
      onChange: e => this.onEntry(e),
      onSelect: e => this.open(e),
      onMenu: e => this.menu(e),
      onEdge: d => { if (d === 'left') Rail.enter(); else if (d === 'down') Mini.focusFrom(d); return true; }
    });
    this.iPoster = img('ipost'); this.iT = h('div', { class: 'it' }); this.iM = h('div', { class: 'im' }); this.iP = h('div', { class: 'ip' });
    this.info = h('div', { class: 'pane info' }, h('div', { class: 'ipbox' }, this.iPoster), this.iT, this.iM, this.iP);
    this.crumb = h('div', { class: 'crumb' });
    this.el = h('div', { class: 'screen files' }, this.hd.el, this.crumb, h('div', { class: 'panes' }, h('div', { class: 'pane flist' }, this.list.el), this.info), hints([['ok', tr('Apri / Riproduci')], ['menu', tr('Opzioni')], ['back', tr('Su di una cartella')]]));
    this.upd = debounce(e => this.fetchNfo(e), 400);
  }
  onShow(first) { this.list.setActive(true); this.list.relayout(); if (first) this.load(); }
  destroy() { this.upd.cancel(); }

  async load(keepSel) {
    showLoading(tr('Leggo la cartella…'), this.names.join(' › '));
    try {
      this.entries = await this.src.list(this.path);
      hideLoading();
    } catch (e) {
      hideLoading();
      Modal.toast(tr('Errore: ') + e.message + tr(' — se è un problema CORS imposta il server companion nelle Impostazioni'), 7000);
      this.entries = [];
    }
    const nv = this.entries.filter(x => x.kind === 'video').length, nd = this.entries.filter(x => x.dir).length;
    this.crumb.textContent = [this.src.name].concat(this.names).join('  ›  ') + '   —   ' + (nv ? nv + (nv === 1 ? ' video' : ' video') : tr('nessun video')) + (nd ? ', ' + nd + (nd === 1 ? tr(' cartella') : tr(' cartelle')) : '');
    this.list.setItems(this.entries, !!keepSel);
    this.onEntry(this.list.current());
  }

  onEntry(e) {
    if (!e) { this.iT.textContent = ''; this.iM.textContent = ''; this.iP.textContent = ''; setImg(this.iPoster, ''); return; }
    setImg(this.iPoster, e.poster || '');
    this.iT.textContent = e.name.replace(/\.[^.]+$/, e.dir ? '$&' : '');
    this.iM.textContent = e.dir ? tr('Cartella') : [fmtSize(e.size), e.date].filter(Boolean).join('  •  ');
    this.iP.textContent = e.plot || '';
    if (e.nfo) this.upd(e);
  }
  async fetchNfo(e) {
    if (this.list.current() !== e) return;
    const n = await this.src.nfo(e); if (!n || this.list.current() !== e) return;
    if (n.title) this.iT.textContent = n.title;
    this.iM.textContent = [n.year, n.rating && +n.rating ? '★ ' + (+n.rating).toFixed(1) : '', n.runtime ? n.runtime + ' min' : '', fmtSize(e.size)].filter(Boolean).join('  •  ');
    this.iP.textContent = n.plot || '';
  }

  open(e) {
    if (!e) return;
    if (e.dir) { this.trail.push(this.path); this.names.push(e.name); this.path = this.src.dirPath ? this.src.dirPath(e) : e.path.replace(/\/*$/, '/'); this.load(); return; }
    if (e.kind === 'video' || e.kind === 'audio') {
      const vids = this.entries.filter(x => x.kind === 'video' || x.kind === 'audio');
      router.push(new PlayerScreen(fileOpts(this.src, vids, vids.indexOf(e))));
    } else if (e.kind === 'playlist') this.menu(e);
  }

  async menu(e) {
    if (!e) return;
    const items = [];
    if (e.dir && this.src.cfg && this.src.cfg.type === 'local') items.push({ label: tr('Salva come accesso rapido'), sub: tr('Compare in “File di rete”'), value: 'save', icon: 'star' });
    if (e.kind === 'video' || e.kind === 'audio') items.push({ label: tr('Riproduci'), value: 'play', icon: 'play' });
    if (e.kind === 'playlist') items.push({ label: tr('Aggiungi come sorgente M3U'), value: 'import', icon: 'plus' });
    if (!items.length) return;
    const r = await Modal.menu(e.name, items);
    if (r === 'save') {
      store.addSource({ id: uid(), type: 'local', name: e.name, path: e.path });
      Modal.toast(tr('Cartella salvata: ') + e.name + tr(' — la trovi in “File di rete”'), 4000);
    } else if (r === 'play') this.open(e);
    else if (r === 'import') {
      showLoading(tr('Importo la playlist…'));
      try {
        const text = await this.src.playlistText(e);
        const id = uid();
        await store.idbSet('file:' + id, text);
        store.addSource({ id: id, type: 'm3ufile', name: e.name.replace(/\.[^.]+$/, '') });
        hideLoading(); Modal.toast(tr('Playlist aggiunta alle sorgenti'));
      } catch (err) { hideLoading(); Modal.toast(tr('Errore: ') + err.message, 5000); }
    }
  }

  onRailEnter() { this.list.setActive(false); }
  onRailExit() { this.list.setActive(true); }
  onKey(a) {
    if (a.a === 'back') {
      if (this.trail.length) { this.path = this.trail.pop(); this.names.pop(); this.load(); return true; }
      return false;
    }
    return this.list.handleKey(a.a);
  }
}
