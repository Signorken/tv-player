// Impostazioni, gestione sorgenti, form di inserimento dati, abbinamento telefono
import { h, loadScript } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { VList, relayoutAll } from '../ui/vlist.js';
import { header, hints, remPx } from '../ui/chrome.js';
import { icon } from '../ui/icons.js';
import { promptText } from '../ui/keyboard.js';
import * as Modal from '../ui/modal.js';
import { Remote } from '../core/remote.js';
import { platform } from '../core/platform.js';
import { LANG } from '../ui/engine.js';
import { createSource, forget, TYPE_LABEL, isFileType } from '../sources/index.js';
import { normalizeXtream } from '../core/detect.js';
import { addSourceFlow } from './addflow.js';
import { showLoading, hideLoading, invalidate } from '../core/session.js';
import { Epg } from '../core/epg.js';

import { applyShell, VERSION, Rail } from '../ui/shell.js';
import { Perf } from '../core/perf.js';
import { nativeName } from '../ui/native/index.js';
import { Hud } from '../ui/hud.js';
import { tr, LANG as UILANG } from '../core/i18n.js';
import { Android } from '../core/android.js';
export function applyUi() {
  const s = store.settings();
  const k = (s.uiScale || 100) / 100;
  // TV: dimensioni proporzionali alla larghezza (si guarda da lontano). Desktop: px con minimo leggibile.
  // dimensione automatica: proporzionata allo schermo in larghezza E in altezza (finestre basse, portatili, TV),
  // poi il fattore manuale scelto in Aspetto (o con Ctrl +/-)
  const W = window.innerWidth || 1280, H = window.innerHeight || 720;
  let base = Math.min(W * 0.0105, H * 0.0187);
  if (platform.isDesktop) base = Math.max(12, Math.min(28, base));
  document.documentElement.style.fontSize = (base * k).toFixed(2) + 'px';
  const lite = Perf.mode(s.perf) === 'lite';
  document.body.classList.toggle('lowpower', lite);
  document.body.classList.toggle('lite', lite);
  const light = s.theme === 'light';
  document.body.classList.toggle('light', light); document.documentElement.classList.toggle('light', light);
  Hud.show(!!s.perfHud);
  applyShell();
  relayoutAll();
  applyWallpaper();
}

export const WALLPAPERS = [['01-aurora', 'Aurora'], ['02-orbita', tr('Orbita')], ['03-dune', 'Dune'], ['04-nebula', tr('Nebulosa')], ['05-griglia', tr('Griglia neon')], ['06-prisma', tr('Prisma')], ['07-onde', tr('Onde')], ['08-notte', tr('Notte')], ['none', tr('Nessuno (sfondo scuro)')]];
export const WALLPAPERS_LIGHT = [['l1-alba', tr('Alba')], ['l2-petali', tr('Cerchi')], ['l3-onde', tr('Onde chiare')], ['l4-geometrie', tr('Cristalli')], ['none', tr('Nessuno (sfondo chiaro)')]];
const wpList = () => store.settings().theme === 'light' ? WALLPAPERS_LIGHT : WALLPAPERS;
const wpName = () => { const w = store.settings().wallpaper, f = wpList().concat(WALLPAPERS, WALLPAPERS_LIGHT).find(x => x[0] === w); return f ? f[1] : w; };
// tema: ogni tema ha i suoi sfondi; cambiando tema si passa al primo sfondo di quel tema
function setTheme(t) {
  const s = store.settings(); if ((s.theme || 'dark') === t) return;
  s.theme = t;
  const list = t === 'light' ? WALLPAPERS_LIGHT : WALLPAPERS;
  if (!list.some(x => x[0] === s.wallpaper)) s.wallpaper = list[0][0];
  store.save(); applyUi();
}
// scelta dello sfondo con le miniature
function pickWallpaper(done) {
  const cur = store.settings().wallpaper;
  let m;
  const cells = wpList().map(w => h('div', { class: 'wpc' + (w[0] === cur ? ' cur' : ''), 'data-f': 1, onclick: () => m.close(w[0]) },
    h('div', { class: 'wpt' + (w[0] === 'none' ? ' none' : ''), style: w[0] === 'none' ? '' : 'background-image:url(wallpapers/thumbs/' + w[0] + '.jpg)' }), h('div', { class: 'wpn', text: w[1] + (w[0] === cur ? '  ✓' : '') })));
  m = Modal.open([h('div', { class: 'mtitle', text: tr('Sfondo') }), h('div', { class: 'wpgrid' }, cells)], { cls: 'wpick', focus: cells[Math.max(0, wpList().findIndex(w => w[0] === cur))] });
  m.onClose = v => { if (v != null) { store.settings().wallpaper = v; store.save(); applyUi(); } if (done) done(); };
}
// 4K solo su schermi 4K (un'immagine 4K occupa ~33 MB di RAM: sulle TV economiche si resta a 1080p)
export function applyWallpaper() {
  const w = store.settings().wallpaper, bg = document.getElementById('bg'); if (!bg) return;
  if (!w || w === 'none') { bg.style.backgroundImage = 'none'; return; }
  const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
  const mem = navigator.deviceMemory;
  // sui televisori i pacchetti contengono solo la versione 1080p (più leggera da installare e da decodificare)
  const q = px >= 3000 && (platform.isDesktop || platform.name === 'web') && (!mem || mem >= 3) ? '4k' : '1080';
  bg.style.backgroundImage = 'url(wallpapers/' + w + '-' + q + '.jpg)';
}

// ---------------- form generico ----------------
export class FormScreen {
  // fields: [{key,label,type:'text'|'password'|'choice',choices:[[value,label]],hint,optional}]
  constructor(o) {
    this.o = o; this.v = Object.assign({}, o.values || {});
    this.rows = {};
    const box = h('div', { class: 'form', 'data-scroll': 1 });
    o.fields.forEach(f => {
      const val = h('div', { class: 'fval' });
      const r = h('div', { class: 'frow2', 'data-f': 1, onclick: () => this.edit(f) }, h('div', { class: 'flab', text: f.label + (f.optional ? tr(' (facoltativo)') : '') }), val);
      this.rows[f.key] = val; box.appendChild(r); this.show(f);
    });
    const acts = h('div', { class: 'facts' },
      o.onTest ? h('div', { class: 'btn', 'data-f': 1, text: tr('Prova connessione'), onclick: () => this.test() }) : null,
      h('div', { class: 'btn primary', 'data-f': 1, text: tr('Salva'), onclick: () => this.save() }),
      h('div', { class: 'btn', 'data-f': 1, text: tr('Annulla'), onclick: () => router.back() }));
    this.hd = header(o.title, o.sub || '', []);
    this.el = h('div', { class: 'screen formscr' }, this.hd.el, h('div', { class: 'single' }, box, acts), hints([['ok', tr('Modifica')], ['back', tr('Annulla')]]));
  }
  onShow(first) { if (first) nav.focusFirst(this.el); }
  show(f) {
    const v = this.v[f.key];
    let t = v == null || v === '' ? '—' : String(v);
    if (f.type === 'password' && v) t = '••••••••';
    if (f.type === 'choice') { const c = f.choices.find(x => x[0] === v); t = c ? c[1] : '—'; }
    this.rows[f.key].textContent = t;
  }
  async edit(f) {
    if (f.type === 'choice') {
      const r = await Modal.menu(f.label, f.choices.map(c => ({ label: c[1], value: c[0] })));
      if (r != null) { this.v[f.key] = r; this.show(f); }
      return;
    }
    const r = await promptText({ title: f.label, value: this.v[f.key] || '', password: f.type === 'password', hint: f.hint || '', quick: f.type !== 'password' && f.key !== 'name' });
    if (r !== null) { this.v[f.key] = r.trim(); this.show(f); }
  }
  validate() {
    for (let i = 0; i < this.o.fields.length; i++) { const f = this.o.fields[i]; if (!f.optional && !this.v[f.key]) { Modal.toast(tr('Compila il campo: ') + f.label, 3000); return false; } }
    return true;
  }
  async test() {
    if (!this.validate()) return;
    showLoading(tr('Provo la connessione…'));
    try { const r = await this.o.onTest(this.v); hideLoading(); Modal.confirm(tr('Connessione riuscita'), String(r), 'OK', ''); }
    catch (e) { hideLoading(); Modal.confirm(tr('Connessione non riuscita'), String(e.message || e) + (store.settings().companion ? '' : tr('\n\nSe l\'errore riguarda CORS, configura il server companion nelle Impostazioni.')), 'OK', ''); }
  }
  save() { if (!this.validate()) return; this.o.onSave(this.v); }
}

const FIELDS = {
  m3u: [{ key: 'name', label: tr('Nome') }, { key: 'url', label: tr('Indirizzo della playlist (URL .m3u / .m3u8)') }, { key: 'epgUrl', label: tr('Guida programmi XMLTV (URL)'), optional: true }],
  xtream: [{ key: 'name', label: tr('Nome') }, { key: 'url', label: 'Server (es. http://esempio.tv:8080)' }, { key: 'user', label: 'Utente' }, { key: 'pass', label: 'Password', type: 'password' },
    { key: 'epgMode', label: tr('Guida programmi'), type: 'choice', choices: [['short', tr('Leggera (solo canale selezionato)')], ['xmltv', tr('Completa (scarica XMLTV, più pesante)')]] }],
  webdav: [{ key: 'name', label: tr('Nome') }, { key: 'url', label: 'Indirizzo (es. http://192.168.1.10:5005/video)' }, { key: 'user', label: 'Utente', optional: true }, { key: 'pass', label: 'Password', type: 'password', optional: true }],
  http: [{ key: 'name', label: tr('Nome') }, { key: 'url', label: 'Indirizzo (es. http://192.168.1.10:8080/film/)' }, { key: 'user', label: 'Utente', optional: true }, { key: 'pass', label: 'Password', type: 'password', optional: true }]
};

export function sourceForm(type, existing) {
  const vals = existing ? Object.assign({}, existing) : { type: type, name: '', epgMode: 'short' };
  router.push(new FormScreen({
    title: existing ? tr('Modifica sorgente') : tr('Nuova sorgente'), sub: TYPE_LABEL[type], fields: FIELDS[type] || FIELDS.http, values: vals,
    onTest: async v => { if (type === 'xtream') v = normalizeXtream(v); const cfg = Object.assign({}, v, { id: '__test' + Date.now(), type: type }); return createSource(cfg).test(); },
    onSave: v => {
      if (type === 'xtream') v = normalizeXtream(v);
      const cfg = Object.assign({}, existing || {}, v, { type: type });
      if (!cfg.name) cfg.name = type === 'xtream' ? 'Xtream' : tr('Sorgente');
      if ((type === 'm3u' || type === 'xtream' || type === 'webdav' || type === 'http') && !/^https?:\/\//i.test(cfg.url)) cfg.url = 'http://' + cfg.url;
      store.addSource(cfg);
      if (cfg.id) { store.idbDelPrefix('src:' + cfg.id); forget(cfg.id); invalidate(cfg.id); }
      Modal.toast(tr('Sorgente salvata'));
      router.back();
      const cur = router.current; if (cur && cur.load) cur.load(); if (cur && cur.refresh) cur.refresh();
    }
  }));
}

export { addSourceFlow };

// ---------------- elenco sorgenti ----------------
export class SourcesScreen {
  constructor() {
    this.hd = header(tr('Sorgenti'), tr('Playlist, Xtream e server di rete'), [{ icon: 'plus', label: tr('Aggiungi'), onclick: () => addSourceFlow() }]);
    this.list = new VList({
      rowH: () => Math.round(remPx() * 3.8),
      build: () => { const r = h('div', { class: 'row srow' }, h('span', { class: 'sic' }), h('div', { class: 'cmid' }, h('div', { class: 'cn' }), h('div', { class: 'cnow' })), h('span', { class: 'rc' })); r._ic = r.firstChild; r._n = r.querySelector('.cn'); r._s = r.querySelector('.cnow'); r._k = r.lastChild; return r; },
      fill: (n, s) => { n._n.textContent = s.name; n._s.textContent = TYPE_LABEL[s.type] + (s.url ? '  •  ' + s.url.replace(/^https?:\/\//, '').slice(0, 50) : ''); const act = store.activeSource(); n._k.textContent = act && act.id === s.id ? 'ATTIVA' : ''; n._ic.innerHTML = ''; n._ic.appendChild(icon(s.type === 'xtream' ? 'cloud' : isFileType(s.type) ? 'folder' : 'list')); },
      onSelect: s => this.menu(s), onMenu: s => this.menu(s),
      onEdge: d => { if (d === 'up') { nav.focus(this.hd.buttons[0]); this.bar = true; this.list.setActive(false); return true; } return true; }
    });
    this.empty = h('div', { class: 'empty', text: tr('Nessuna sorgente. Premi “Aggiungi” per iniziare.') });
    this.el = h('div', { class: 'screen srcs' }, this.hd.el, h('div', { class: 'single' }, this.list.el), this.empty, hints([['ok', tr('Opzioni')], ['back', tr('Indietro')]]));
  }
  onShow() { this.load(); this.list.setActive(true); this.bar = false; this.list.relayout(); }
  load() { const s = store.get().sources; this.list.setItems(s, true); this.empty.style.display = s.length ? 'none' : ''; this.bar = false; this.list.setActive(true); }
  refresh() { this.load(); }
  onKey(a) {
    if (this.bar) { if (a.a === 'down') { this.bar = false; this.list.setActive(true); this.hd.buttons[0].classList.remove('focused'); return true; } if (a.a === 'ok') { nav.activate(); return true; } return a.a !== 'back'; }
    return this.list.handleKey(a.a);
  }
  async menu(s) {
    const media = !isFileType(s.type);
    const items = [];
    if (media) items.push({ label: tr('Imposta come sorgente attiva'), value: 'act', icon: 'check' });
    items.push({ label: tr('Modifica'), value: 'edit', icon: 'gear' });
    if (media) items.push({ label: tr('Aggiorna dati (ricarica elenco)'), value: 'ref', icon: 'refresh' });
    items.push({ label: tr('Elimina'), value: 'del', icon: 'trash', danger: true });
    const r = await Modal.menu(s.name, items);
    if (r === 'act') { store.setActive(s.id); this.load(); Modal.toast(tr('Sorgente attiva: ') + s.name); }
    else if (r === 'edit') { if (s.type === 'm3ufile' || s.type === 'local' || s.type === 'dlna') Modal.toast(tr('Questa sorgente non ha campi da modificare: eliminala e aggiungila di nuovo')); else sourceForm(s.type, s); }
    else if (r === 'ref') { store.idbDelPrefix('src:' + s.id); store.idbDelPrefix('epg:' + s.id); forget(s.id); invalidate(s.id); Epg.reset(); Modal.toast(tr('Verrà riscaricata al prossimo accesso')); }
    else if (r === 'del') { if (await Modal.confirm(tr('Eliminare “') + s.name + '”?', '', tr('Elimina'), tr('Annulla'))) { store.removeSource(s.id); forget(s.id); this.load(); } }
  }
}

// ---------------- abbinamento telefono ----------------
export class PairScreen {
  constructor() {
    this.hd = header(tr('Telefono'), tr('Tastiera e telecomando dal telefono'), []);
    this.body = h('div', { class: 'pair' });
    this.el = h('div', { class: 'screen pairscr' }, this.hd.el, this.body, hints([['ok', tr('Seleziona')], ['back', tr('Indietro')]]));
    this.h = m => { if (m.t === 'hello' && this.el.parentNode) this.render(); };
    Remote.onMessage(this.h);
  }
  onShow() { this.render(); }
  render() {
    this.body.innerHTML = '';
    if (!Remote.configured()) {
      this.body.appendChild(h('div', { class: 'p1', text: tr('Per usare lo smartphone serve il “companion”, un piccolo programma da avviare sul NAS, su un Raspberry Pi o sul PC (stessa rete della TV).') }));
      this.body.appendChild(h('div', { class: 'p2', text: 'Avvialo con:  node companion/server.js   (oppure con Docker, vedi README). Poi inserisci qui il suo indirizzo, ad esempio http://192.168.1.10:8787' }));
      this.body.appendChild(h('div', { class: 'btn primary', 'data-f': 1, text: tr('Imposta indirizzo companion'), onclick: () => this.setAddr() }));
      this.body.appendChild(h('div', { class: 'p2', text: tr('Senza companion puoi comunque usare una tastiera Bluetooth/USB, la tastiera a schermo, oppure la tastiera del telefono tramite l\'app telecomando del produttore (Google TV, SmartThings, LG ThinQ, Hisense RemoteNOW) col pulsante “Tastiera di sistema”.') }));
    } else {
      const qr = h('div', { class: 'qr' });
      loadScript('vendor/qrcode.js').then(() => { const q = window.qrcode(0, 'M'); q.addData(Remote.pairUrl()); q.make(); qr.innerHTML = q.createSvgTag(6, 8); }).catch(() => { qr.textContent = tr('QR non disponibile'); });
      this.body.appendChild(h('div', { class: 'pcols' }, qr, h('div', { class: 'pinfo2' },
        h('div', { class: 'p1', text: tr('Inquadra il codice con la fotocamera del telefono (stessa rete Wi-Fi) oppure apri questo indirizzo:') }),
        h('div', { class: 'purl', text: Remote.pairUrl() }),
        h('div', { class: 'p2', text: tr('Codice stanza: ') + Remote.room() }),
        h('div', { class: 'pstat ' + (Remote.phoneSeen ? 'ok' : ''), text: Remote.connected ? (Remote.phoneSeen ? tr('● Telefono collegato') : tr('● Companion raggiunto, in attesa del telefono…')) : tr('○ Companion non raggiungibile') }),
        h('div', { class: 'p2', text: tr('Dal telefono puoi: scrivere nei campi della TV, usare le frecce/OK/Indietro, inviare playlist M3U, aggiungere sorgenti Xtream/NAS e mandare un URL da riprodurre.') }),
        h('div', { class: 'pbtns' },
          h('div', { class: 'btn', 'data-f': 1, text: tr('Cambia indirizzo'), onclick: () => this.setAddr() }),
          h('div', { class: 'btn', 'data-f': 1, text: tr('Nuovo codice stanza'), onclick: () => { store.newRoom(); Remote.start(); this.render(); } })))));
    }
    nav.focusFirst(this.el);
  }
  async setAddr() {
    const r = await promptText({ title: tr('Indirizzo del companion'), value: store.settings().companion || 'http://', hint: 'Esempio: http://192.168.1.10:8787', quick: true });
    if (r === null) return;
    store.settings().companion = r.replace(/\/+$/, '') === 'http:/' || r === 'http://' ? '' : r.replace(/\/+$/, ''); store.save();
    Remote.start(); this.render();
  }
}

// ---------------- impostazioni ----------------
export class SettingsScreen {
  constructor() {
    this.railId = 'set';
    this.hd = header(tr('Impostazioni'), 'MAXENTA', []);
    this.catBox = h('div', { class: 'scats' });
    this.panel = h('div', { class: 'spanel', 'data-scroll': 1 });
    this.el = h('div', { class: 'screen sets' }, this.hd.el, h('div', { class: 'sbody' }, this.catBox, this.panel), hints([['ok', tr('Cambia')], ['back', tr('Indietro')]]));
    const S = store.settings, self = this;
    const toggle = (label, key, after, sub) => ({ label: label, sub: sub, value: () => S()[key] ? tr('Sì') : tr('No'), act: () => { S()[key] = !S()[key]; store.save(); if (after) after(); self.sync(); } });
    const choice = (label, key, opts, fmt, after, sub) => ({ label: label, sub: sub, value: () => { const c = opts.find(o => o[0] === S()[key]); return c ? c[1] : String(S()[key]); }, act: async () => { const r = await Modal.menu(label, opts.map(o => ({ label: o[1], value: o[0] }))); if (r != null) { S()[key] = r; store.save(); if (after) after(); self.sync(); } } });
    const list = (...x) => x.filter(Boolean);
    const UA = [['', tr('Predefinita')], ['VLC/3.0.20 LibVLC/3.0.20', 'VLC'], ['Kodi/21.0 (Windows NT 10.0; Win64; x64)', 'Kodi'], ['okhttp/4.12.0', 'Android (okhttp)'], ['Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36', 'Smart TV Samsung']];
    const langs = [['', tr('Automatica (come nel file)')]].concat(Object.keys(LANG).map(k => [k, LANG[k]]));
    this.cats = [
      { id: 'src', label: tr('Sorgenti'), icon: 'list', items: [
        { label: tr('Sorgenti (playlist, Xtream, NAS)'), value: () => store.get().sources.length + tr(' configurate'), act: () => router.push(new SourcesScreen()) },
        { label: tr('Aggiungi una sorgente'), value: () => '', act: () => addSourceFlow() }] },
      { id: 'play', label: tr('Riproduzione'), icon: 'play', items: list(
        choice(tr('Formato canali live Xtream'), 'liveFormat', [['m3u8', tr('HLS (.m3u8) — consigliato')], ['ts', 'MPEG-TS (.ts)']]),
        choice(tr('Lingua audio preferita'), 'audioLang', langs, null, null),
        nativeName() === 'ExoPlayer' ? toggle(tr('Adatta la frequenza dello schermo al video (50 Hz)'), 'matchRate') : null,
        toggle(tr('Episodio successivo automatico'), 'autoNext'),
        platform.isDesktop || !nativeName() ? null : choice(tr('Lettore video'), 'videoEngine', [['auto', tr('Nativo ') + nativeName() + tr(' (consigliato)')], ['web', tr('Lettore web (HTML5)')]]),
        choice(tr('Finestrella (Indietro dal player)'), 'miniPlayer', [['always', tr('Sempre')], ['live', tr('Solo con i canali TV')], ['vod', tr('Solo con film e serie')], ['never', tr('Mai (Indietro chiude il player)')]]),
        toggle(tr('Anteprima video scorrendo i canali (usa più risorse)'), 'previewVideo'),
        choice(tr('Buffer di riproduzione'), 'bufferSec', [[10, tr('10 secondi (poca RAM)')], [20, tr('20 secondi')], [40, tr('40 secondi (connessione instabile)')]]),
        platform.isDesktop ? choice(tr('Convertitore video (film/serie)'), 'transcode', [['auto', tr('Automatico: solo se serve (consigliato)')], ['always', tr('Sempre (codec strani, timeline bloccata)')], ['never', tr('Mai (solo lettore nativo)')]]) : null) },
      { id: 'look', label: tr('Aspetto'), icon: 'tv', items: [
        { label: tr('Lingua'), value: () => (S().lang === 'it' ? tr('Italiano') : S().lang === 'en' ? tr('English') : tr('Automatica (come il dispositivo)') + ' · ' + (UILANG === 'it' ? tr('Italiano') : tr('English'))),
          act: async () => { const r = await Modal.menu(tr('Lingua'), [{ label: tr('Automatica (come il dispositivo)'), value: 'auto' }, { label: tr('Italiano'), value: 'it' }, { label: tr('English'), value: 'en' }]);
            if (r == null) return; const v = r === 'auto' ? '' : r; if (v === (S().lang || '')) return;
            S().lang = v; store.save(true); Modal.toast(tr('Lingua: riavvio…'), 1200); setTimeout(() => location.reload(), 500); } },
        choice(tr('Disposizione'), 'layout', [['A', tr('Aspetto A: barra laterale (consigliato)')], ['B', tr('Aspetto B: pulsanti in alto')]], null, applyUi),
        choice(tr('Orologio'), 'clock', [['24', tr('24 ore (21:45)')], ['12', tr('12 ore (9:45 PM)')]], null, applyUi),
        choice(tr('Schermata all\'avvio'), 'startScreen', [['home', 'Home'], ['live', tr('TV in diretta')], ['movie', tr('On Demand: Film')], ['series', tr('On Demand: Serie TV')], ['sport', tr('On Demand: Sport')], ['favs', tr('Preferiti')], ['last', tr('Ultimo canale visto')]]),
        { label: tr('Tema'), value: () => store.settings().theme === 'light' ? tr('Chiaro') : tr('Scuro (predefinito)'), act: async () => { const v = await Modal.menu(tr('Tema'), [{ label: tr('Scuro (predefinito)'), value: 'dark' }, { label: tr('Chiaro'), value: 'light' }]); if (v) { setTheme(v); self.sync(); } } },
        { label: tr('Sfondo'), value: () => wpName(), act: () => pickWallpaper(() => self.sync()) },
        choice(tr('Dimensione interfaccia'), 'uiScale', [[70, '70%'], [80, tr('Piccola (80%)')], [90, '90%'], [100, tr('Automatica (100%)')], [110, '110%'], [115, '115%'], [120, '120%'], [130, tr('Grande (130%)')], [150, tr('Molto grande (150%)')]], null, applyUi),
        toggle(tr('Suoni di navigazione'), 'sounds'),
        choice(tr('Prestazioni'), 'perf', [['auto', tr('Automatiche (leggere sui dispositivi deboli)')], ['full', tr('Massima qualità (animazioni)')], ['lite', tr('Leggere (niente animazioni)')]], null, applyUi),
        toggle(tr('Indicatore prestazioni (fotogrammi e ritardo dei tasti)'), 'perfHud', applyUi)] },
      { id: 'net', label: platform.isDesktop ? tr('Rete') : tr('Rete e telefono'), icon: 'cloud', items: list(
        platform.isDesktop ? choice(tr('Identità del lettore (se il provider blocca)'), 'userAgent', UA, null, () => window.desktop && window.desktop.setUserAgent && window.desktop.setUserAgent(S().userAgent)) : toggle(tr('Video tramite proxy (se il server blocca CORS)'), 'proxyMedia'),
        platform.isDesktop ? null : { label: tr('Telefono come tastiera / telecomando'), value: () => Remote.configured() ? (Remote.phoneSeen ? tr('collegato') : tr('pronto')) : tr('non configurato'), act: () => router.push(new PairScreen()) },
        platform.isDesktop ? null : { label: tr('Server companion (proxy CORS + relay telefono)'), value: () => S().companion || tr('non impostato'), act: async () => { const r = await promptText({ title: tr('Indirizzo del companion'), value: S().companion || 'http://', hint: 'Esempio: http://192.168.1.10:8787 — lascia vuoto per disattivare' }); if (r !== null) { S().companion = r === 'http://' ? '' : r.replace(/\/+$/, ''); store.save(); Remote.start(); self.sync(); } } }) },
      { id: 'data', label: tr('Guida e dati'), icon: 'clock', items: [
        choice(tr('Guida programmi (finestra)'), 'epgHours', [[6, tr('6 ore')], [12, tr('12 ore')], [24, tr('24 ore')], [48, tr('48 ore')]]),
        { label: tr('Svuota cache e guida programmi'), value: () => '', act: async () => { await store.idbClear(); Epg.reset(); Modal.toast(tr('Cache svuotata')); } }] },
      { id: 'info', label: tr('Informazioni'), icon: 'info', items: list(
        platform.isDesktop ? { label: tr('Versione'), value: () => 'v' + VERSION, button: { label: tr('Verifica aggiornamenti'), act: () => window.desktop.updateCheck() } } : window.__shell ? { label: tr('Versione'), value: () => 'v' + VERSION + tr(' · aggiornamento automatico attivo'), button: { label: tr('Verifica aggiornamenti'), act: async () => { if (Android.available && await Android.check(true)) return; Modal.toast(tr('Riavvio e controllo gli aggiornamenti…'), 1500); setTimeout(() => location.reload(), 600); } } } : { label: tr('Versione'), value: () => 'v' + VERSION },
        // Android: versione dell'APK installato (il banner e il codice nativo cambiano solo installando l'APK)
        (platform.name === 'android' || platform.name === 'firetv') && window.Capacitor ? { label: tr('Versione APK installato'), value: () => self.apkVer || '…', act: async () => { if (!(await Android.check(true))) Modal.toast(tr('L\'app è aggiornata')); } } : null,
        { label: tr('Crediti'), value: () => tr('Icone Solar (480 Design, CC BY 4.0) · Font Plus Jakarta Sans (OFL)') },
        { label: tr('Piattaforma e comandi'), value: () => platform.name, act: () => Modal.confirm('MAXENTA', tr('Piattaforma rilevata: ') + platform.name + (platform.isDesktop ? '\nMouse: clic per aprire, tasto destro = opzioni, rotella = scorri.\nTastiera: Ctrl+V incolla un link/playlist, Spazio pausa, F schermo intero, M muto, ← → ±10 s, Esc indietro.' : '\nTasti: frecce + OK; OK lungo = menu; Rosso = preferito; Verde = cerca; Blu = audio/sottotitoli/finestrella; Giallo = rimuovi riga; numeri = canale.'), 'OK', '') }) }
    ];
    if ((platform.name === 'android' || platform.name === 'firetv') && window.Capacitor) {
      if (Android.available) Android.info().then(i => { self.apkVer = i && i.version ? i.version : '?'; self.sync(); }).catch(() => { });
      else self.apkVer = tr('precedente alla 2.7 (da reinstallare)');
    }
    this.catEls = this.cats.map((c, i) => {
      const e = h('div', { class: 'scat', 'data-f': 1, onclick: () => { this.show(i); this.toPanel(); } }, icon(c.icon), h('span', { text: c.label }));
      e.onfocusnav = () => this.show(i);
      this.catBox.appendChild(e); return e;
    });
    this.ci = -1; this.rows = [];
  }
  show(i) {
    if (i === this.ci) return;
    this.ci = i;
    this.catEls.forEach((e, k) => e.classList.toggle('on', k === i));
    this.panel.innerHTML = ''; this.panel.scrollTop = 0; this.rows = [];
    // voci in ordine alfabetico (A-Z) nella lingua dell'interfaccia
    const coll = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(UILANG, { sensitivity: 'base' }) : null;
    this.cats[i].items.slice().sort((a, b) => coll ? coll.compare(a.label, b.label) : (a.label < b.label ? -1 : 1)).forEach(it => {
      const v = h('span', { class: 'sv' });
      let r;
      if (it.button) {
        r = h('div', { class: 'srow static' }, h('span', { class: 'sl', text: it.label }), v, h('div', { class: 'btn small', 'data-f': 1, onclick: it.button.act }, icon('refresh'), h('span', { text: it.button.label })));
      } else {
        r = h('div', { class: 'srow', 'data-f': 1, onclick: () => it.act() }, h('span', { class: 'sl', text: it.label }), v);
      }
      r._v = v; r._it = it; this.panel.appendChild(r); this.rows.push(r);
    });
    this.sync();
  }
  sync() { this.rows.forEach(r => { r._v.textContent = r._it.value ? r._it.value() : ''; }); }
  toPanel() { const f = this.panel.querySelector('[data-f]'); if (f) nav.focus(f); }
  onShow(first) {
    if (first || this.ci < 0) { this.ci = -1; this.show(0); nav.focus(this.catEls[0]); } else this.sync();
  }
  onKey(a) {
    const f = nav.getFocus(), inCat = f && this.catBox.contains(f);
    if (inCat) {
      if (a.a === 'right' || a.a === 'ok') { this.toPanel(); return true; }
      if (a.a === 'left') { Rail.enter(); return true; }
      if (a.a === 'down' || a.a === 'up') { const k = this.catEls.indexOf(f) + (a.a === 'down' ? 1 : -1); if (k >= 0 && k < this.catEls.length) nav.focus(this.catEls[k]); return true; }
    } else if (f && this.panel.contains(f)) {
      if (a.a === 'left') { nav.focus(this.catEls[this.ci]); return true; }
      if (a.a === 'right') return true;
      if (a.a === 'up' || a.a === 'down') { // un solo passo alla volta, dentro il pannello (scorre da solo)
        const all = nav.focusables(this.panel), k = all.indexOf(f) + (a.a === 'down' ? 1 : -1);
        if (k >= 0 && k < all.length) nav.focus(all[k]); return true;
      }
    }
    return false;
  }
}
