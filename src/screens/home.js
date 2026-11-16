// Home: tessere principali + "Continua a guardare"
import { h } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { icon } from '../ui/icons.js';
import { hints, img, setImg } from '../ui/chrome.js';
import * as Modal from '../ui/modal.js';
import { openSource, sourceById, liveOpts, movieOpts, fileOpts, episodesOpts, isReady, showLoading, hideLoading } from '../core/session.js';
import { createSource } from '../sources/index.js';
import { Android } from '../core/android.js';
import { AndroidUsbSource, TizenUsbSource, tizenUsbAvailable, tizenUsbVolumes, tizenOnUsb } from '../sources/usb.js';
import { exitApp, platform } from '../core/platform.js';
import { LiveScreen } from './live.js';
import { VodScreen } from './vod.js';
import { FilesScreen } from './files.js';
import { FavsScreen } from './favs.js';
import { SettingsScreen } from './settings.js';
import { addNetworkFolderFlow, addSourceFlow, addFromClipboard, pickPlaylistFile, discoverFlow, addFolderFlow } from './addflow.js';
import { DetailScreen } from './detail.js';
import { SearchScreen } from './search.js';
import { PlayerScreen, Mini } from './player.js';
import { MENU } from '../ui/shell.js';
import { TYPE_LABEL } from '../sources/index.js';
import { tr } from '../core/i18n.js';

const DEMO = '#EXTM3U\n' +
  '#EXTINF:-1 group-title="Demo HLS" tvg-id="bipbop",Apple BipBop (HLS)\nhttps://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8\n' +
  '#EXTINF:-1 group-title="Demo HLS" tvg-id="bbb",Big Buck Bunny (HLS)\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n' +
  '#EXTINF:-1 group-title="Demo HLS" tvg-id="sintel",Sintel (HLS)\nhttps://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8\n' +
  '#EXTINF:5280 group-title="Film demo" tvg-logo="",Big Buck Bunny (MP4)\nhttps://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4\n';
export async function addDemo() {
  const id = 'demo';
  await store.idbSet('file:' + id, DEMO);
  store.addSource({ id: id, type: 'm3ufile', name: tr('Demo (flussi di prova pubblici)') });
  Modal.toast(tr('Sorgente demo aggiunta'));
  const c = router.current; if (c && c.refresh) c.refresh();
}

export async function needMedia() {
  const cfg = store.activeSource();
  if (cfg) return cfg;
  const ok = await Modal.confirm(tr('Nessuna sorgente'), tr('Aggiungi una playlist M3U, un account Xtream o un server di rete per iniziare.'), tr('Aggiungi sorgente'), tr('Più tardi'));
  if (ok) addSourceFlow();
  return null;
}

export async function chooseSource(replaceCurrent) {
  const list = store.mediaSources();
  if (!list.length) { addSourceFlow(); return; }
  const act = store.activeSource();
  const r = await Modal.menu(tr('Scegli la sorgente'), list.map(s => ({ label: s.name + (act && act.id === s.id ? '   ✓' : ''), sub: TYPE_LABEL[s.type], value: s.id, icon: s.type === 'xtream' ? 'cloud' : 'list' })));
  if (!r) return;
  store.setActive(r);
  if (act && act.id === r) return;
  const cur = router.current;
  if (replaceCurrent && cur && (cur instanceof LiveScreen || cur instanceof VodScreen)) {
    const cfg = sourceById(r);
    const src = await openSource(cfg);
    router.replace(cur instanceof LiveScreen ? new LiveScreen(src) : new VodScreen(src, cur.mode));
  } else if (cur && cur.refresh) cur.refresh();
}

// riproduce un elemento salvato in preferiti/recenti
export async function playMeta(meta) {
  const cfg = sourceById(meta.src);
  if (!cfg) { Modal.toast(tr('La sorgente non esiste più')); return; }
  try {
    const src = await openSource(cfg);
    if (meta.kind === 'live') {
      const live = await src.live();
      const idx = live.items.findIndex(c => c.id === meta.id);
      if (idx < 0) { Modal.toast(tr('Canale non più presente nella playlist')); return; }
      router.push(new PlayerScreen(liveOpts(src, live.items, idx)));
    } else if (meta.kind === 'movie') {
      router.push(new PlayerScreen(movieOpts(src, { id: meta.id, name: meta.name, poster: meta.poster || meta.logo, ext: meta.ext, url: meta.url })));
    } else if (meta.kind === 'episode') {
      // con la serie nota si caricano tutti gli episodi: nel player funzionano elenco episodi ed episodio successivo
      if (meta.series && src.seriesInfo) {
        try {
          const show = meta.seriesItem || { id: meta.series, name: meta.show, poster: meta.poster };
          showLoading(tr('Caricamento…'), show.name || '');
          let r; try { r = await src.seriesInfo(show); } finally { hideLoading(); }
          const all = [];
          (r.seasons || []).forEach(se => se.episodes.forEach(e => { e.season = se.n; all.push(e); }));
          const i = all.findIndex(e => String(e.id) === String(meta.id));
          if (i >= 0) { router.push(new PlayerScreen(episodesOpts(src, Object.assign({}, show, { poster: show.poster || (r.info && r.info.poster) }), all, i))); return; }
        } catch (e) { /* si ripiega sull'episodio singolo */ }
      }
      const ep = { id: meta.id, ext: meta.ext, url: meta.url, num: 0, season: 0, title: '' };
      router.push(new PlayerScreen({
        kind: 'vod', list: [ep], index: 0,
        resolve: e => ({ url: src.urlFor(e, 'series'), title: meta.show || meta.name, sub: meta.sub, logo: meta.poster, key: store.favKey(src.id, 'ep', e.id), meta: meta })
      }));
    } else if (meta.kind === 'series') {
      router.push(new DetailScreen(src, 'series', meta.item || { id: meta.id, name: meta.name, poster: meta.poster }));
    } else if (meta.kind === 'file') {
      router.push(new PlayerScreen(fileOpts(src, [{ path: meta.id, name: meta.name, url: meta.url }], 0)));
    }
  } catch (e) { Modal.toast(tr('Errore: ') + e.message, 5000); }
}

export class HomeScreen {
  constructor() {
    this.railId = 'home';
    this.srcBtn = h('div', { class: 'btn small', 'data-f': 1, onclick: () => chooseSource(false) }, icon('list'), h('span'));
    this.tiles = h('div', { class: 'tiles' });
    // Aspetto B: pulsanti a sola icona, il nome compare sul pulsante selezionato
    this.tileEls = MENU.filter(m => m.id !== 'home').map(m => {
      const t = h('div', { class: 'tile', 'data-f': 1, onclick: () => m.go(this) }, icon(m.icon), h('div', { class: 't1', text: m.label }));
      this.tiles.appendChild(t); return t;
    });
    this.tLive = this.tileEls[0]; this.tSet = this.tileEls[this.tileEls.length - 1];

    this.cont = h('div', { class: 'contbox' });
    this.contT = h('div', { class: 'contt', text: tr('Continua a guardare') });
    // "Rimuovi riga" è l'ultima tessera di ogni riga: si raggiunge andando sempre a destra
    const xcard = (cls, fn) => h('div', { class: 'ccard xcard ' + cls, 'data-f': 1, onclick: fn }, h('div', { class: 'cthumb' }, h('div', { class: 'xin' }, icon('x'), h('span', { text: tr('Rimuovi riga') }))));
    this.contX = xcard('', () => this.clearRow());
    this.nowBox = h('div', { class: 'nowbox' });
    this.hero = h('div', { class: 'hero' });
    this.contHd = h('div', { class: 'conthd' }, this.contT, h('span', { class: 'contnote', text: tr('Solo film e serie') }));
    this.empty = h('div', { class: 'empty' });
    this.liveX = xcard('lcard', () => this.clearLive());
    this.liveHd = h('div', { class: 'conthd' }, h('div', { class: 'contt', text: tr('Canali visti di recente') }));
    this.liveRow = h('div', { class: 'contbox liverow' });
    // "La mia lista" di On Demand della sorgente scelta in alto
    this.listHd = h('div', { class: 'conthd' }, h('div', { class: 'contt', text: tr('La mia lista') }), h('span', { class: 'contnote' }));
    this.listRow = h('div', { class: 'contbox listrow' });
    // canali TV preferiti della sorgente scelta (OK = guarda; nel player ▲▼ scorre solo tra i preferiti)
    this.favHd = h('div', { class: 'conthd' }, h('div', { class: 'contt', text: tr('Canali preferiti') }));
    this.favRow = h('div', { class: 'contbox favrow2' });
    // archivi: NAS, cartelle, DLNA e chiavette USB collegate
    this.fileHd = h('div', { class: 'conthd' }, h('div', { class: 'contt', text: tr('File di rete') }), h('span', { class: 'contnote', text: tr('NAS, cartelle e chiavette USB') }));
    this.fileRow = h('div', { class: 'contbox filerow' });
    this.usb = [];
    this.el = h('div', { class: 'screen home' },
      h('div', { class: 'hbar' }, h('div', { class: 'brand' }, h('img', { class: 'blogo', src: 'icon.png', alt: '' }), h('span', { text: 'MAXENTA' })), h('div', { class: 'hbr' }, platform.isDesktop ? h('div', { class: 'btn small', 'data-f': 1, title: tr('Aggiungi sorgente (Ctrl+V per incollare un link)'), onclick: () => addSourceFlow() }, icon('plus'), h('span', { text: tr('Aggiungi') })) : null, this.srcBtn)),
      this.tiles, h('div', { class: 'hmain', 'data-scroll': 1 }, this.nowBox, this.listHd, this.listRow, this.favHd, this.favRow, this.hero, this.empty, this.contHd, this.cont, this.liveHd, this.liveRow, this.fileHd, this.fileRow),
      hints([['ok', tr('Apri')], ['menu', tr('Opzioni')], ['back', tr('Esci')]]));
  }
  onShow(first) {
    const act = store.activeSource();
    this.srcBtn.lastChild.textContent = act ? act.name : tr('Nessuna sorgente');
    this.renderCont();
    this.renderNow();
    this.renderList();
    this.loadProviderList();
    this.renderFavs();
    this.renderFiles(); this.scanUsb();
    if (!store.get().sources.length) {
      this.empty.innerHTML = '';
      this.empty.appendChild(h('div', { class: 'e1', text: tr('Benvenuto! Inizia aggiungendo una sorgente.') }));
      if (platform.isDesktop) {
        this.empty.appendChild(h('div', { class: 'e2', text: tr('Niente da digitare: copia un link o una playlist e incollalo (Ctrl+V), trascina qui un file .m3u, oppure lascia che cerchi i NAS nella tua rete.') }));
        const B = (ic, t, fn, p) => h('div', { class: 'btn' + (p ? ' primary' : ''), 'data-f': 1, onclick: fn }, icon(ic), h('span', { text: t }));
        this.empty.appendChild(h('div', { class: 'ebtns' },
          B('clip', tr('Incolla link o playlist'), () => addFromClipboard(), true),
          B('list', tr('Scegli file playlist…'), () => pickPlaylistFile()),
          B('cloud', tr('Cerca NAS in rete'), () => discoverFlow()),
          B('folder', tr('NAS Windows (\\\\NAS\\cartella)'), () => addNetworkFolderFlow()),
          B('folder', tr('Cartella del computer…'), () => addFolderFlow()),
          B('plus', tr('Altre opzioni (manuale)'), () => addSourceFlow()),
          B('play', tr('Prova con la demo'), () => addDemo())));
      } else {
        this.empty.appendChild(h('div', { class: 'e2', text: tr('Playlist M3U, account Xtream oppure un NAS in rete locale. Puoi inserire i dati con il telecomando, una tastiera o dal telefono.') }));
        this.empty.appendChild(h('div', { class: 'btn primary', 'data-f': 1, text: tr('Aggiungi sorgente'), onclick: () => addSourceFlow() }));
        this.empty.appendChild(h('span', { style: 'display:inline-block;width:1rem' }));
        this.empty.appendChild(h('div', { class: 'btn', 'data-f': 1, text: tr('Prova con la sorgente demo'), onclick: () => addDemo() }));
      }
      this.empty.style.display = '';
    } else this.empty.style.display = 'none';
    const cf = nav.getFocus();
    // appena comparsa la barra "In riproduzione" (si torna dal player in finestrella) il cursore va lì
    const had = this._hadNow; this._hadNow = !!Mini.player;
    if (Mini.player && !had && this.nowBox.firstChild) { nav.focus(this.nowBox.firstChild); return true; }
    if (first || !cf || !this.el.contains(cf) || !cf.offsetParent) {
      nav.focus(this.firstFocus());
    }
  }
  refresh() { this.onShow(false); }

  // le righe si ridisegnano solo se è cambiato qualcosa (tornando alla Home dal player spesso non cambia nulla)
  same(name, sig) { if (this['_sig' + name] === sig) return true; this['_sig' + name] = sig; return false; }
  renderCont() {
    const rec = store.contItems(10), live0 = store.liveItems(8);
    const sig = rec.map(r => { const p = store.getProgress(r.key); return r.key + ':' + (p ? Math.round(p.pos / 30) : '') + (r.upnext ? 'n' : ''); }).join() + '|' + live0.map(r => r.key).join() + '|' + store.settings().lang;
    if (this.same('cont', sig)) return;
    this.cont.innerHTML = '';
    this.contHd.style.display = rec.length ? '' : 'none';
    this.renderHero(rec[0]);
    rec.forEach(r => {
      const p = store.getProgress(r.key);
      const im = img(); setImg(im, r.logo || r.poster);
      const card = h('div', { class: 'ccard', 'data-f': 1, onclick: () => playMeta(r) },
        h('div', { class: 'cthumb' }, im, p && p.dur ? h('div', { class: 'cbar' }, h('div', { class: 'cfill', style: 'width:' + Math.min(100, p.pos / p.dur * 100) + '%' })) : null),
        h('div', { class: 'cname', text: r.name }), h('div', { class: 'csub', text: (r.upnext ? tr('Prossimo: ') : '') + (r.sub || '') }));
      card._meta = r;
      this.cont.appendChild(card);
    });
    if (rec.length) this.cont.appendChild(this.contX);
    // canali live visti di recente: accesso rapido alla TV
    this.liveRow.innerHTML = '';
    const live = store.liveItems(8);
    this.liveHd.style.display = this.liveRow.style.display = live.length ? '' : 'none';
    live.forEach(r => {
      const im = img(); setImg(im, r.logo);
      const c = h('div', { class: 'ccard lcard', 'data-f': 1, onclick: () => playMeta(r) }, h('div', { class: 'cthumb' }, im), h('div', { class: 'cname', text: r.name }));
      c._meta = r; this.liveRow.appendChild(c);
    });
    if (live.length) this.liveRow.appendChild(this.liveX);
    // niente da riprendere: in Aspetto A mostra comunque i pulsanti delle sezioni
    this.el.classList.toggle('nocont', !rec.length && !live.length && !this.listItems().length && !this.favItems().length);
  }
  // video nella finestrella: tessera in cima alla Home per tornarci o chiuderlo
  renderNow() {
    const m = Mini.player;
    this.nowBox.innerHTML = '';
    this.nowBox.style.display = m ? '' : 'none';
    if (!m) return;
    // tutta la barra è selezionabile (larga quanto lo schermo, così Su/Giù la trovano sempre); OK = schermo intero
    const main = h('div', { class: 'nowmain', 'data-f': 1, onclick: () => { if (Mini.player) Mini.player.expand(); } },
      icon('play'), h('div', { class: 'nowt' }, h('div', { class: 'hg', text: tr('IN RIPRODUZIONE') }), h('div', { class: 'nown', text: m.cur ? m.cur.title : '' })),
      h('div', { class: 'nowok' }, icon('full'), h('span', { text: tr('Schermo intero') })));
    main.onfocusnav = () => { this.nowBox.parentNode.scrollTop = 0; };
    this.nowBox.appendChild(main);
    this.nowBox.appendChild(h('div', { class: 'btn small nowx', 'data-f': 1, onclick: () => { Mini.close(); } }, icon('x'), h('span', { text: tr('Chiudi') })));
  }
  // "La mia lista" = lista dell'app + categoria "La mia lista / My list" del provider (salvata dal suo portale), senza doppioni
  listItems() {
    const act = store.activeSource(); if (!act) return [];
    const l = store.get().mylist || {};
    const mine = Object.keys(l).map(k => l[k]).filter(x => x && x.src === act.id).sort((a, b) => (b.t || 0) - (a.t || 0));
    const prov = this._pl && this._pl.id === act.id ? this._pl.items : [];
    const seen = {}, out = [];
    mine.concat(prov).forEach(x => { const k = x.kind + '|' + x.id; if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out.slice(0, 30);
  }
  // legge (senza bloccare la Home) le categorie del provider che si chiamano "La mia lista", "My list", "Watchlist"…
  loadProviderList() {
    const act = store.activeSource(); if (!act) return;
    if (this._pl && this._pl.id === act.id && Date.now() - this._pl.t < 10 * 60000) return;
    // M3U: solo se la playlist è già stata letta (non la si scarica apposta all'avvio)
    if (act.type !== 'xtream' && !isReady(act.id)) return;
    const pl = this._pl = { id: act.id, t: Date.now(), items: [] };
    const isList = c => /^\W*(la\s+)?mia\s+lista|^\W*(my\s*list|watch\s*list|lista\s+personale|preferiti\s+del\s+portale)/i.test(String(c.name || ''));
    let src; try { src = createSource(act); } catch (e) { return; }
    const grab = async (cats, items, kind) => {
      const cs = (await cats().catch(() => [])).filter(isList);
      for (let i = 0; i < cs.length; i++) (await items(cs[i].id).catch(() => [])).forEach(it => pl.items.push({ kind: kind, src: act.id, id: it.id, name: it.name, poster: it.poster, ext: it.ext, item: Object.assign({ _mode: kind }, it), prov: 1 }));
    };
    Promise.all([grab(() => src.vodCats(), id => src.vodItems(id), 'movie'), src.seriesCats ? grab(() => src.seriesCats(), id => src.seriesItems(id), 'series') : null])
      .then(() => { if (pl === this._pl && pl.items.length && router.current === this) this.renderList(true); });
  }
  renderList(keepFocus) {
    const items = this.listItems();
    if (this.same('list', items.map(x => x.kind + x.id).join() + '|' + (store.activeSource() || {}).id)) return;
    const f = nav.getFocus(), fi = keepFocus && f && this.listRow.contains(f) ? Array.prototype.indexOf.call(this.listRow.children, f) : -1;
    this.listRow.innerHTML = '';
    this.listHd.style.display = this.listRow.style.display = items.length ? '' : 'none';
    this.listHd.lastChild.textContent = items.length ? (store.activeSource().name) : '';
    items.forEach(r => {
      const im = img(); setImg(im, r.poster);
      const c = h('div', { class: 'ccard', 'data-f': 1, onclick: () => this.openListItem(r) },
        h('div', { class: 'cthumb' }, im, h('div', { class: 'kbadge ' + (r.kind === 'series' ? 'k-s' : 'k-m'), text: r.kind === 'series' ? tr('SERIE TV') : tr('FILM') })),
        h('div', { class: 'cname', text: r.name }));
      c._list = r; this.listRow.appendChild(c);
    });
    this.el.classList.toggle('haslist', items.length > 0);
    this.el.classList.toggle('nocont', !store.contItems(1).length && !store.liveItems(1).length && !items.length && !this.favItems().length);
    if (fi >= 0 && this.listRow.children.length) nav.focus(this.listRow.children[Math.min(fi, this.listRow.children.length - 1)], true);
  }
  // ---- canali preferiti
  favItems() {
    const act = store.activeSource(); if (!act) return [];
    const f = store.get().favorites || {};
    return Object.keys(f).map(k => f[k]).filter(x => x && x.kind === 'live' && x.src === act.id);
  }
  renderFavs() {
    const items = this.favItems();
    if (this.same('fav', items.map(x => x.id + x.name).join() + '|' + (store.activeSource() || {}).id)) return;
    this.favRow.innerHTML = '';
    this.favHd.style.display = this.favRow.style.display = items.length ? '' : 'none';
    items.forEach(r => {
      const im = img(); setImg(im, r.logo);
      const c = h('div', { class: 'ccard lcard', 'data-f': 1, onclick: () => this.playFav(r) }, h('div', { class: 'cthumb' }, im), h('div', { class: 'cname', text: r.name }));
      c._fav = r; this.favRow.appendChild(c);
    });
  }
  async playFav(r) {
    const cfg = sourceById(r.src); if (!cfg) { Modal.toast(tr('La sorgente non esiste più')); return; }
    try {
      const src = await openSource(cfg), live = await src.live();
      const ids = this.favItems().map(x => x.id), by = {};
      live.items.forEach(c => { by[c.id] = c; });
      const list = ids.map(id => by[id]).filter(Boolean);
      const i = list.findIndex(c => c.id === r.id);
      if (i < 0) { Modal.toast(tr('Canale non più presente nella playlist')); return; }
      router.push(new PlayerScreen(liveOpts(src, list, i)));
    } catch (e) { Modal.toast(tr('Errore: ') + e.message, 5000); }
  }
  async favMenu(r) {
    const v = await Modal.menu(r.name, [{ label: tr('Guarda'), value: 'play', icon: 'play' }, { label: tr('Rimuovi dai preferiti'), value: 'rm', icon: 'x' }]);
    if (v === 'play') this.playFav(r);
    else if (v === 'rm') { store.toggleFav(store.favKey(r.src, 'live', r.id), r); this.renderFavs(); nav.focus(this.firstFocus()); }
  }

  // ---- archivi e chiavette USB
  async scanUsb() {
    let v = [];
    try {
      if (window.desktop && window.desktop.listDrives) v = (await window.desktop.listDrives()).map(d => ({ kind: 'drive', id: 'drive:' + d.path, name: d.name, path: d.path }));
      else if (Android.available) v = (await Android.usbVolumes()).map(d => ({ kind: 'android', id: 'usb:' + d.id, vid: d.id, name: d.name, tree: d.tree, granted: d.granted }));
      else if (tizenUsbAvailable()) v = (await tizenUsbVolumes()).map(d => ({ kind: 'tizen', id: 'usb:' + d.id, label: d.id, name: d.name }));
    } catch (e) { v = []; }
    const sig = JSON.stringify(v);
    if (sig === this._usbSig) return;
    this._usbSig = sig; this.usb = v;
    if (router.current === this) this.renderFiles(true);
    if (!this._usbWatch) {
      this._usbWatch = 1;
      const again = () => setTimeout(() => this.scanUsb(), 1500);
      if (Android.available) Android.onUsb(again);
      else if (tizenUsbAvailable()) tizenOnUsb(again);
      // computer: controllo leggero solo con la Home aperta e la finestra in primo piano (su Windows ogni 30 s: interroga PowerShell)
      else if (window.desktop && window.desktop.listDrives) setInterval(() => { if (router.current === this && document.hasFocus()) this.scanUsb(); }, window.desktop.platform === 'win32' ? 30000 : 6000);
      if (window.desktop && window.desktop.listDrives) window.addEventListener('focus', () => { if (router.current === this) this.scanUsb(); });
    }
  }
  fileTargets() {
    return store.fileSources().map(c => ({ kind: 'saved', id: c.id, name: c.name, cfg: c, sub: TYPE_LABEL[c.type] })).concat(this.usb.map(u => Object.assign({ sub: tr('Chiavetta / disco USB') }, u)));
  }
  renderFiles(keepFocus) {
    const items = this.fileTargets();
    if (this.same('files', items.map(x => x.id + x.name + (x.tree ? 1 : 0)).join())) return;
    const f = nav.getFocus(), fi = keepFocus && f && this.fileRow.contains(f) ? Array.prototype.indexOf.call(this.fileRow.children, f) : -1;
    this.fileRow.innerHTML = '';
    this.fileHd.style.display = this.fileRow.style.display = items.length ? '' : 'none';
    items.forEach(t => {
      const c = h('div', { class: 'ccard fcard2', 'data-f': 1, onclick: () => this.openTarget(t) },
        h('div', { class: 'cthumb' }, h('div', { class: 'fin' }, icon(t.kind === 'saved' ? (t.cfg.type === 'dlna' ? 'tv' : t.cfg.type === 'local' ? 'folder' : 'cloud') : 'usb'))),
        h('div', { class: 'cname', text: t.name }), h('div', { class: 'csub', text: t.sub || '' }));
      this.fileRow.appendChild(c);
    });
    if (fi >= 0 && this.fileRow.children.length) nav.focus(this.fileRow.children[Math.min(fi, this.fileRow.children.length - 1)], true);
  }
  async openTarget(t) {
    try {
      let src;
      if (t.kind === 'saved') src = createSource(t.cfg);
      else if (t.kind === 'drive') src = createSource({ type: 'local', id: t.id, name: t.name, path: t.path });
      else if (t.kind === 'tizen') src = new TizenUsbSource({ id: t.id, name: t.name, label: t.label });
      else if (t.kind === 'android') {
        let tree = t.tree;
        if (!tree) {
          await Modal.confirm(t.name, tr('La prima volta Android chiede il permesso di leggere la chiavetta: nella finestra che si apre premi "Usa questa cartella" (o "Consenti").'), 'OK', '');
          tree = await Android.usbGrant(t.vid);
          if (!tree) return;
          t.tree = tree; this._usbSig = '';
        }
        src = new AndroidUsbSource({ id: t.id, name: t.name, tree: tree });
      }
      if (src) router.push(new FilesScreen(src));
    } catch (e) { Modal.toast(tr('Errore: ') + (e.message || e), 5000); }
  }

  async openListItem(r) {
    const cfg = sourceById(r.src); if (!cfg) { Modal.toast(tr('La sorgente non esiste più')); return; }
    try { const src = await openSource(cfg); router.push(new DetailScreen(src, r.kind === 'series' ? 'series' : 'movie', r.item || { id: r.id, name: r.name, poster: r.poster, ext: r.ext })); }
    catch (e) { Modal.toast(tr('Errore: ') + e.message, 5000); }
  }
  async listMenu(r) {
    const v = await Modal.menu(r.name, [{ label: tr('Apri'), value: 'open', icon: 'play' }].concat(store.inList(store.favKey(r.src, r.kind, r.id)) ? [{ label: tr('Togli dalla mia lista'), value: 'rm', icon: 'x' }] : [{ label: tr('Dal portale del provider: si toglie da lì'), value: '', icon: 'info' }]));
    if (v === 'open') this.openListItem(r);
    else if (v === 'rm') { store.toggleList(store.favKey(r.src, r.kind, r.id), r); this.renderList(); nav.focus(this.firstFocus()); }
  }
  renderHero(r) {
    this.hero.innerHTML = '';
    this.hero.style.display = r ? '' : 'none';
    if (!r) return;
    const p = store.getProgress(r.key);
    this.hero.appendChild(h('div', { class: 'hg', text: r.upnext ? tr('PROSSIMO EPISODIO') : tr('RIPRENDI DA DOVE ERI RIMASTO') }));
    this.hero.appendChild(h('div', { class: 'hn', text: r.name }));
    this.hero.appendChild(h('div', { class: 'hs', text: r.sub || '' }));
    if (p && p.dur) this.hero.appendChild(h('div', { class: 'hbar2' }, h('div', { style: 'width:' + Math.min(100, p.pos / p.dur * 100) + '%' })));
    const b = h('div', { class: 'btn primary', 'data-f': 1, onclick: () => playMeta(r) }, icon('play'), h('span', { text: p && p.pos > 30 ? tr(' Riprendi') : tr(' Guarda') }));
    b.onfocusnav = () => { this.hero.parentNode.scrollTop = 0; };
    this.hero.appendChild(b);
  }
  async clearRow() {
    if (!store.contItems(1).length) return;
    const f = nav.getFocus();
    store.clearContRow();
    this.renderCont();
    Modal.toast(tr('Riga rimossa. I progressi di film e serie restano salvati.'));
    if (!f || !document.body.contains(f)) nav.focus(this.firstFocus());
  }

  async openLive() { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new LiveScreen(s)); } catch (e) { Modal.toast(tr('Errore: ') + e.message, 6000); } }
  async openSport() { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new VodScreen(s, 'movie', { mix: 'sport' })); } catch (e) { Modal.toast(tr('Errore: ') + e.message, 6000); } }
  async openVod(mode, mix) { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new VodScreen(s, mode, { mix: mix })); } catch (e) { Modal.toast(tr('Errore: ') + e.message, 6000); } }
  playMeta(r) { return playMeta(r); }
  openFavs() { router.push(new FavsScreen()); }
  openSearch() { router.push(new SearchScreen()); }
  openSettings() { router.push(new SettingsScreen()); }
  // focus iniziale: in Aspetto A non ci sono pulsanti, si parte dal contenuto
  firstFocus() {
    if (!store.get().sources.length) return this.empty.querySelector('.btn');
    if (document.body.classList.contains('layA')) return this.hero.querySelector('[data-f]') || this.listRow.querySelector('[data-f]') || this.cont.querySelector('[data-f]') || this.liveRow.querySelector('[data-f]') || this.srcBtn;
    return this.tLive;
  }
  async openFiles() {
    await this.scanUsb();
    const all = this.fileTargets();
    if (all.length && (all.length > 1 || all[0].kind !== 'saved')) {
      if (all.length === 1) { this.openTarget(all[0]); return; }
      const id = await Modal.menu(tr('Scegli il server'), all.map(t => ({ label: t.name, sub: t.sub, value: t.id, icon: t.kind === 'saved' ? 'folder' : 'usb' })));
      const t = all.find(x => x.id === id); if (t) this.openTarget(t); return;
    }
    const list = store.fileSources();
    if (!list.length) {
      const ok = await Modal.confirm(tr('Nessun server di rete'), tr('Aggiungi un NAS (WebDAV oppure indice HTTP) per sfogliare i tuoi file.'), tr('Aggiungi NAS'), tr('Più tardi'));
      if (ok) addSourceFlow(platform.isDesktop ? undefined : 'webdav');
      return;
    }
    let cfg = list[0];
    if (list.length > 1) { const id = await Modal.menu(tr('Scegli il server'), list.map(s => ({ label: s.name, sub: TYPE_LABEL[s.type], value: s.id, icon: 'folder' }))); if (!id) return; cfg = list.find(s => s.id === id); }
    const { createSource } = await import('../sources/index.js');
    router.push(new FilesScreen(createSource(cfg)));
  }

  onKey(a) {
    // con la finestrella aperta, Indietro dalla Home la chiude (prima di chiedere se uscire)
    if (a.a === 'back') { if (Mini.player) { Mini.close(); Modal.toast(tr('Riproduzione chiusa'), 1500); return true; } this.confirmExit(); return true; }
    if (a.a === 'green' || a.a === 'guide') { this.openLive(); return true; }
    if (a.a === 'yellow' || a.a === 'del') { const f = nav.getFocus(); if (a.a === 'yellow' || (f && this.cont.contains(f))) { this.clearRow(); return true; } }
    if (a.a === 'menu') { const f = nav.getFocus(); if (f && f._meta) { this.cardMenu(f._meta); return true; } if (f && f._list) { this.listMenu(f._list); return true; } if (f && f._fav) { this.favMenu(f._fav); return true; } }
    return false;
  }
  clearLive() {
    store.clearLiveRow(); this.renderCont();
    Modal.toast(tr('Riga dei canali rimossa: tornerà con i prossimi canali che guardi.'));
    nav.focus(this.firstFocus());
  }
  async cardMenu(r) {
    const lv = r.kind === 'live';
    const v = await Modal.menu(r.name, [{ label: tr('Guarda'), value: 'play', icon: 'play' }, { label: tr('Togli dalla riga'), value: 'one', icon: 'x' }, { label: lv ? tr('Svuota la riga dei canali') : tr('Svuota la riga “Continua a guardare”'), value: lv ? 'live' : 'all', icon: 'trash' }]);
    if (v === 'play') playMeta(r);
    else if (v === 'one') { store.hideRecent(r.key); this.renderCont(); nav.focus(this.firstFocus()); }
    else if (v === 'all') this.clearRow();
    else if (v === 'live') this.clearLive();
  }
  async confirmExit() { if (await Modal.confirm(tr('Uscire dall\'app?'), '', tr('Esci'), tr('Resta'))) exitApp(); }
}
