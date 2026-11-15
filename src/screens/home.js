// Home: tessere principali + "Continua a guardare"
import { h, fmtClock } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { icon } from '../ui/icons.js';
import { hints, img, setImg } from '../ui/chrome.js';
import * as Modal from '../ui/modal.js';
import { openSource, sourceById, liveOpts, movieOpts, fileOpts } from '../core/session.js';
import { exitApp, platform } from '../core/platform.js';
import { LiveScreen } from './live.js';
import { VodScreen } from './vod.js';
import { FilesScreen } from './files.js';
import { FavsScreen } from './favs.js';
import { SettingsScreen, SourcesScreen } from './settings.js';
import { addNetworkFolderFlow, addSourceFlow, addFromClipboard, pickPlaylistFile, discoverFlow, addFolderFlow } from './addflow.js';
import { DetailScreen } from './detail.js';
import { PlayerScreen } from './player.js';
import { openSport } from './sport.js';
import { MENU } from '../ui/shell.js';
import { TYPE_LABEL } from '../sources/index.js';

const DEMO = '#EXTM3U\n' +
  '#EXTINF:-1 group-title="Demo HLS" tvg-id="bipbop",Apple BipBop (HLS)\nhttps://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8\n' +
  '#EXTINF:-1 group-title="Demo HLS" tvg-id="bbb",Big Buck Bunny (HLS)\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n' +
  '#EXTINF:-1 group-title="Demo HLS" tvg-id="sintel",Sintel (HLS)\nhttps://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8\n' +
  '#EXTINF:5280 group-title="Film demo" tvg-logo="",Big Buck Bunny (MP4)\nhttps://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4\n';
export async function addDemo() {
  const id = 'demo';
  await store.idbSet('file:' + id, DEMO);
  store.addSource({ id: id, type: 'm3ufile', name: 'Demo (flussi di prova pubblici)' });
  Modal.toast('Sorgente demo aggiunta');
  const c = router.current; if (c && c.refresh) c.refresh();
}

export async function needMedia() {
  const cfg = store.activeSource();
  if (cfg) return cfg;
  const ok = await Modal.confirm('Nessuna sorgente', 'Aggiungi una playlist M3U, un account Xtream o un server di rete per iniziare.', 'Aggiungi sorgente', 'Più tardi');
  if (ok) addSourceFlow();
  return null;
}

export async function chooseSource(replaceCurrent) {
  const list = store.mediaSources();
  if (!list.length) { addSourceFlow(); return; }
  const act = store.activeSource();
  const r = await Modal.menu('Scegli la sorgente', list.map(s => ({ label: s.name + (act && act.id === s.id ? '   ✓' : ''), sub: TYPE_LABEL[s.type], value: s.id, icon: s.type === 'xtream' ? 'cloud' : 'list' })));
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
  if (!cfg) { Modal.toast('La sorgente non esiste più'); return; }
  try {
    const src = await openSource(cfg);
    if (meta.kind === 'live') {
      const live = await src.live();
      const idx = live.items.findIndex(c => c.id === meta.id);
      if (idx < 0) { Modal.toast('Canale non più presente nella playlist'); return; }
      router.push(new PlayerScreen(liveOpts(src, live.items, idx)));
    } else if (meta.kind === 'movie') {
      router.push(new PlayerScreen(movieOpts(src, { id: meta.id, name: meta.name, poster: meta.poster || meta.logo, ext: meta.ext, url: meta.url })));
    } else if (meta.kind === 'episode') {
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
  } catch (e) { Modal.toast('Errore: ' + e.message, 5000); }
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
    this.contT = h('div', { class: 'contt', text: 'Continua a guardare' });
    this.contX = h('div', { class: 'btn small', 'data-f': 1, title: 'Rimuovi la riga dalla Home (i progressi restano salvati)', onclick: () => this.clearRow() }, icon('x'), h('span', { text: 'Rimuovi riga' }));
    this.hero = h('div', { class: 'hero' });
    this.contHd = h('div', { class: 'conthd' }, this.contT, h('span', { class: 'contnote', text: 'Solo film e serie' }), h('div', { class: 'flex1' }), this.contX);
    this.empty = h('div', { class: 'empty' });
    this.liveHd = h('div', { class: 'conthd' }, h('div', { class: 'contt', text: 'Canali visti di recente' }));
    this.liveRow = h('div', { class: 'contbox liverow' });
    this.el = h('div', { class: 'screen home' },
      h('div', { class: 'hbar' }, h('div', { class: 'brand' }, h('img', { class: 'blogo', src: 'icon.png', alt: '' }), h('span', { text: 'MAXENTA' })), h('div', { class: 'hbr' }, platform.isDesktop ? h('div', { class: 'btn small', 'data-f': 1, title: 'Aggiungi sorgente (Ctrl+V per incollare un link)', onclick: () => addSourceFlow() }, icon('plus'), h('span', { text: 'Aggiungi' })) : null, this.srcBtn)),
      this.tiles, h('div', { class: 'hmain', 'data-scroll': 1 }, this.hero, this.empty, this.contHd, this.cont, this.liveHd, this.liveRow),
      hints([['ok', 'Apri'], ['menu', 'Opzioni'], ['back', 'Esci']]));
  }
  onShow(first) {
    const act = store.activeSource();
    this.srcBtn.lastChild.textContent = act ? act.name : 'Nessuna sorgente';
    this.renderCont();
    if (!store.get().sources.length) {
      this.empty.innerHTML = '';
      this.empty.appendChild(h('div', { class: 'e1', text: 'Benvenuto! Inizia aggiungendo una sorgente.' }));
      if (platform.isDesktop) {
        this.empty.appendChild(h('div', { class: 'e2', text: 'Niente da digitare: copia un link o una playlist e incollalo (Ctrl+V), trascina qui un file .m3u, oppure lascia che cerchi i NAS nella tua rete.' }));
        const B = (ic, t, fn, p) => h('div', { class: 'btn' + (p ? ' primary' : ''), 'data-f': 1, onclick: fn }, icon(ic), h('span', { text: t }));
        this.empty.appendChild(h('div', { class: 'ebtns' },
          B('clip', 'Incolla link o playlist', () => addFromClipboard(), true),
          B('list', 'Scegli file playlist…', () => pickPlaylistFile()),
          B('cloud', 'Cerca NAS in rete', () => discoverFlow()),
          B('folder', 'NAS Windows (\\\\NAS\\cartella)', () => addNetworkFolderFlow()),
          B('folder', 'Cartella del computer…', () => addFolderFlow()),
          B('plus', 'Altre opzioni (manuale)', () => addSourceFlow()),
          B('play', 'Prova con la demo', () => addDemo())));
      } else {
        this.empty.appendChild(h('div', { class: 'e2', text: 'Playlist M3U, account Xtream oppure un NAS in rete locale. Puoi inserire i dati con il telecomando, una tastiera o dal telefono.' }));
        this.empty.appendChild(h('div', { class: 'btn primary', 'data-f': 1, text: 'Aggiungi sorgente', onclick: () => addSourceFlow() }));
        this.empty.appendChild(h('span', { style: 'display:inline-block;width:1rem' }));
        this.empty.appendChild(h('div', { class: 'btn', 'data-f': 1, text: 'Prova con la sorgente demo', onclick: () => addDemo() }));
      }
      this.empty.style.display = '';
    } else this.empty.style.display = 'none';
    const cf = nav.getFocus();
    if (first || !cf || !this.el.contains(cf) || !cf.offsetParent) {
      nav.focus(this.firstFocus());
    }
  }
  refresh() { this.onShow(false); }

  renderCont() {
    this.cont.innerHTML = '';
    const rec = store.contItems(10);
    this.contHd.style.display = rec.length ? '' : 'none';
    this.renderHero(rec[0]);
    rec.forEach(r => {
      const p = store.getProgress(r.key);
      const im = img(); setImg(im, r.logo || r.poster);
      const card = h('div', { class: 'ccard', 'data-f': 1, onclick: () => playMeta(r) },
        h('div', { class: 'cthumb' }, im, p && p.dur ? h('div', { class: 'cbar' }, h('div', { class: 'cfill', style: 'width:' + Math.min(100, p.pos / p.dur * 100) + '%' })) : null),
        h('div', { class: 'cname', text: r.name }), h('div', { class: 'csub', text: r.sub || '' }));
      card._meta = r;
      this.cont.appendChild(card);
    });
    // canali live visti di recente: accesso rapido alla TV
    this.liveRow.innerHTML = '';
    const seen = {}, live = store.get().recents.filter(r => r.kind === 'live' && !seen[r.key] && (seen[r.key] = 1)).slice(0, 8);
    this.liveHd.style.display = this.liveRow.style.display = live.length ? '' : 'none';
    live.forEach(r => {
      const im = img(); setImg(im, r.logo);
      this.liveRow.appendChild(h('div', { class: 'ccard lcard', 'data-f': 1, onclick: () => playMeta(r) }, h('div', { class: 'cthumb' }, im), h('div', { class: 'cname', text: r.name })));
    });
    // niente da riprendere: in Aspetto A mostra comunque i pulsanti delle sezioni
    this.el.classList.toggle('nocont', !rec.length && !live.length);
  }
  renderHero(r) {
    this.hero.innerHTML = '';
    this.hero.style.display = r ? '' : 'none';
    if (!r) return;
    const p = store.getProgress(r.key);
    this.hero.appendChild(h('div', { class: 'hg', text: 'RIPRENDI DA DOVE ERI RIMASTO' }));
    this.hero.appendChild(h('div', { class: 'hn', text: r.name }));
    this.hero.appendChild(h('div', { class: 'hs', text: r.sub || '' }));
    if (p && p.dur) this.hero.appendChild(h('div', { class: 'hbar2' }, h('div', { style: 'width:' + Math.min(100, p.pos / p.dur * 100) + '%' })));
    const b = h('div', { class: 'btn primary', 'data-f': 1, onclick: () => playMeta(r) }, icon('play'), h('span', { text: p && p.pos > 30 ? ' Riprendi' : ' Guarda' }));
    b.onfocusnav = () => { this.hero.parentNode.scrollTop = 0; };
    this.hero.appendChild(b);
  }
  async clearRow() {
    if (!store.contItems(1).length) return;
    const f = nav.getFocus();
    store.clearContRow();
    this.renderCont();
    Modal.toast('Riga rimossa. I progressi di film e serie restano salvati.');
    if (!f || !document.body.contains(f)) nav.focus(this.firstFocus());
  }

  async openLive() { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new LiveScreen(s)); } catch (e) { Modal.toast('Errore: ' + e.message, 6000); } }
  async openSport() { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); await openSport(s); } catch (e) { Modal.toast('Errore: ' + e.message, 6000); } }
  async openVod(mode) { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new VodScreen(s, mode)); } catch (e) { Modal.toast('Errore: ' + e.message, 6000); } }
  playMeta(r) { return playMeta(r); }
  openFavs() { router.push(new FavsScreen()); }
  openSettings() { router.push(new SettingsScreen()); }
  // focus iniziale: in Aspetto A non ci sono pulsanti, si parte dal contenuto
  firstFocus() {
    if (!store.get().sources.length) return this.empty.querySelector('.btn');
    if (document.body.classList.contains('layA')) return this.hero.querySelector('[data-f]') || this.cont.querySelector('[data-f]') || this.srcBtn;
    return this.tLive;
  }
  async openFiles() {
    const list = store.fileSources();
    if (!list.length) {
      const ok = await Modal.confirm('Nessun server di rete', 'Aggiungi un NAS (WebDAV oppure indice HTTP) per sfogliare i tuoi file.', 'Aggiungi NAS', 'Più tardi');
      if (ok) addSourceFlow(platform.isDesktop ? undefined : 'webdav');
      return;
    }
    let cfg = list[0];
    if (list.length > 1) { const id = await Modal.menu('Scegli il server', list.map(s => ({ label: s.name, sub: TYPE_LABEL[s.type], value: s.id, icon: 'folder' }))); if (!id) return; cfg = list.find(s => s.id === id); }
    const { createSource } = await import('../sources/index.js');
    router.push(new FilesScreen(createSource(cfg)));
  }

  onKey(a) {
    if (a.a === 'back') { this.confirmExit(); return true; }
    if (a.a === 'green' || a.a === 'guide') { this.openLive(); return true; }
    if (a.a === 'yellow' || a.a === 'del') { const f = nav.getFocus(); if (a.a === 'yellow' || (f && this.cont.contains(f))) { this.clearRow(); return true; } }
    if (a.a === 'menu') { const f = nav.getFocus(); if (f && f._meta) { this.cardMenu(f._meta); return true; } }
    return false;
  }
  async cardMenu(r) {
    const v = await Modal.menu(r.name, [{ label: 'Guarda', value: 'play', icon: 'play' }, { label: 'Togli dalla riga', value: 'one', icon: 'x' }, { label: 'Svuota la riga “Continua a guardare”', value: 'all', icon: 'trash' }]);
    if (v === 'play') playMeta(r);
    else if (v === 'one') { store.hideRecent(r.key); this.renderCont(); nav.focus(this.firstFocus()); }
    else if (v === 'all') this.clearRow();
  }
  async confirmExit() { if (await Modal.confirm('Uscire dall\'app?', '', 'Esci', 'Resta')) exitApp(); }
}
