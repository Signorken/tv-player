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
import { addSourceFlow, addFromClipboard, pickPlaylistFile, discoverFlow, addFolderFlow } from './addflow.js';
import { DetailScreen } from './detail.js';
import { PlayerScreen } from './player.js';
import { openSport } from './sport.js';
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
    this.clock = h('div', { class: 'hclock' });
    this.srcBtn = h('div', { class: 'btn small', 'data-f': 1, onclick: () => chooseSource(false) }, icon('list'), h('span'));
    this.tiles = h('div', { class: 'tiles' });
    const T = (ic, label, sub, fn) => h('div', { class: 'tile', 'data-f': 1, onclick: fn }, icon(ic), h('div', { class: 't1', text: label }), h('div', { class: 't2', text: sub }));
    this.tLive = T('tv', 'TV in diretta', 'Canali e guida programmi', () => this.openLive());
    this.tVod = T('film', 'Film', 'Locandine, trama, cast', () => this.openVod('movie'));
    this.tSer = T('series', 'Serie TV', 'Stagioni ed episodi', () => this.openVod('series'));
    this.tSport = T('trophy', 'Sport', 'Dirette ed eventi', () => this.openSport());
    this.tNas = T('folder', 'File di rete', 'NAS / server locali', () => this.openFiles());
    this.tFav = T('star', 'Preferiti', 'I tuoi contenuti', () => router.push(new FavsScreen()));
    this.tSet = T('gear', 'Impostazioni', 'Sorgenti, telefono, opzioni', () => router.push(new SettingsScreen()));
    [this.tLive, this.tVod, this.tSer, this.tSport, this.tNas, this.tFav, this.tSet].forEach(t => this.tiles.appendChild(t));
    this.cont = h('div', { class: 'contbox' });
    this.contT = h('div', { class: 'contt', text: 'Continua a guardare' });
    this.contX = h('div', { class: 'btn small', 'data-f': 1, title: 'Rimuovi la riga dalla Home (i progressi restano salvati)', onclick: () => this.clearRow() }, icon('x'), h('span', { text: 'Rimuovi riga' }));
    this.hero = h('div', { class: 'hero' });
    this.contHd = h('div', { class: 'conthd' }, this.contT, h('span', { class: 'contnote', text: 'Solo film e serie' }), h('div', { class: 'flex1' }), this.contX);
    this.empty = h('div', { class: 'empty' });
    this.el = h('div', { class: 'screen home' },
      h('div', { class: 'hbar' }, h('div', { class: 'brand' }, icon('tv'), h('span', { text: 'TV Player' })), h('div', { class: 'hbr' }, h('div', { class: 'btn small accent', 'data-f': 1, title: 'Lista canali (tasto verde)', onclick: () => this.openLive() }, icon('tv'), h('span', { text: 'TV in diretta' })), platform.isDesktop ? h('div', { class: 'btn small', 'data-f': 1, title: 'Aggiungi sorgente (Ctrl+V per incollare un link)', onclick: () => addSourceFlow() }, icon('plus'), h('span', { text: 'Aggiungi' })) : null, this.srcBtn, this.clock)),
      this.tiles, this.hero, this.empty, this.contHd, this.cont,
      hints([['ok', 'Apri'], ['green', 'TV in diretta'], ['yellow', 'Rimuovi riga'], ['back', 'Esci']]));
    this.clockT = setInterval(() => { this.clock.textContent = fmtClock(Date.now()); }, 20000);
  }
  onShow(first) {
    this.clock.textContent = fmtClock(Date.now());
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
    if (first || !nav.getFocus() || !this.el.contains(nav.getFocus())) {
      nav.focus(store.get().sources.length ? this.tLive : this.empty.querySelector('.btn'));
    }
  }
  destroy() { clearInterval(this.clockT); }
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
      this.cont.appendChild(card);
    });
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
    this.hero.appendChild(h('div', { class: 'btn primary', 'data-f': 1, onclick: () => playMeta(r) }, icon('play'), h('span', { text: p && p.pos > 30 ? ' Riprendi' : ' Guarda' })));
  }
  async clearRow() {
    if (!store.contItems(1).length) return;
    const f = nav.getFocus();
    store.clearContRow();
    this.renderCont();
    Modal.toast('Riga rimossa. I progressi di film e serie restano salvati.');
    if (!f || !document.body.contains(f)) nav.focus(this.tLive);
  }

  async openLive() { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new LiveScreen(s)); } catch (e) { Modal.toast('Errore: ' + e.message, 6000); } }
  async openSport() { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); await openSport(s); } catch (e) { Modal.toast('Errore: ' + e.message, 6000); } }
  async openVod(mode) { const cfg = await needMedia(); if (!cfg) return; try { const s = await openSource(cfg); router.push(new VodScreen(s, mode)); } catch (e) { Modal.toast('Errore: ' + e.message, 6000); } }
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
    if (a.a === 'green' || a.a === 'guide' || a.a === 'chup' || a.a === 'chdown') { this.openLive(); return true; }
    if (a.a === 'yellow' || a.a === 'del') { const f = nav.getFocus(); if (a.a === 'yellow' || (f && this.cont.contains(f))) { this.clearRow(); return true; } }
    return false;
  }
  async confirmExit() { if (await Modal.confirm('Uscire dall\'app?', '', 'Esci', 'Resta')) exitApp(); }
}
