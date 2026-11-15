// Impostazioni, gestione sorgenti, form di inserimento dati, abbinamento telefono
import { h } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { VList } from '../ui/vlist.js';
import { header, hints, remPx } from '../ui/chrome.js';
import { icon } from '../ui/icons.js';
import { promptText } from '../ui/keyboard.js';
import * as Modal from '../ui/modal.js';
import { Remote } from '../core/remote.js';
import { platform } from '../core/platform.js';
import { createSource, forget, TYPE_LABEL, isFileType } from '../sources/index.js';
import { normalizeXtream } from '../core/detect.js';
import { addSourceFlow } from './addflow.js';
import { showLoading, hideLoading, invalidate } from '../core/session.js';
import { Epg } from '../core/epg.js';

export function applyUi() {
  const s = store.settings();
  const k = (s.uiScale || 100) / 100;
  // TV: dimensioni proporzionali alla larghezza (si guarda da lontano). Desktop: px con minimo leggibile.
  if (platform.isDesktop) document.documentElement.style.fontSize = Math.max(13, Math.min(26, window.innerWidth * 0.0105)) * k + 'px';
  else document.documentElement.style.fontSize = (1.05 * k) + 'vw';
  document.body.classList.toggle('lowpower', !!s.lowPower);
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
      const r = h('div', { class: 'frow2', 'data-f': 1, onclick: () => this.edit(f) }, h('div', { class: 'flab', text: f.label + (f.optional ? ' (facoltativo)' : '') }), val);
      this.rows[f.key] = val; box.appendChild(r); this.show(f);
    });
    const acts = h('div', { class: 'facts' },
      o.onTest ? h('div', { class: 'btn', 'data-f': 1, text: 'Prova connessione', onclick: () => this.test() }) : null,
      h('div', { class: 'btn primary', 'data-f': 1, text: 'Salva', onclick: () => this.save() }),
      h('div', { class: 'btn', 'data-f': 1, text: 'Annulla', onclick: () => router.back() }));
    this.hd = header(o.title, o.sub || '', []);
    this.el = h('div', { class: 'screen formscr' }, this.hd.el, h('div', { class: 'single' }, box, acts), hints([['ok', 'Modifica'], ['back', 'Annulla']]));
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
    for (let i = 0; i < this.o.fields.length; i++) { const f = this.o.fields[i]; if (!f.optional && !this.v[f.key]) { Modal.toast('Compila il campo: ' + f.label, 3000); return false; } }
    return true;
  }
  async test() {
    if (!this.validate()) return;
    showLoading('Provo la connessione…');
    try { const r = await this.o.onTest(this.v); hideLoading(); Modal.confirm('Connessione riuscita', String(r), 'OK', ''); }
    catch (e) { hideLoading(); Modal.confirm('Connessione non riuscita', String(e.message || e) + (store.settings().companion ? '' : '\n\nSe l\'errore riguarda CORS, configura il server companion nelle Impostazioni.'), 'OK', ''); }
  }
  save() { if (!this.validate()) return; this.o.onSave(this.v); }
}

const FIELDS = {
  m3u: [{ key: 'name', label: 'Nome' }, { key: 'url', label: 'Indirizzo della playlist (URL .m3u / .m3u8)' }, { key: 'epgUrl', label: 'Guida programmi XMLTV (URL)', optional: true }],
  xtream: [{ key: 'name', label: 'Nome' }, { key: 'url', label: 'Server (es. http://esempio.tv:8080)' }, { key: 'user', label: 'Utente' }, { key: 'pass', label: 'Password', type: 'password' },
    { key: 'epgMode', label: 'Guida programmi', type: 'choice', choices: [['short', 'Leggera (solo canale selezionato)'], ['xmltv', 'Completa (scarica XMLTV, più pesante)']] }],
  webdav: [{ key: 'name', label: 'Nome' }, { key: 'url', label: 'Indirizzo (es. http://192.168.1.10:5005/video)' }, { key: 'user', label: 'Utente', optional: true }, { key: 'pass', label: 'Password', type: 'password', optional: true }],
  http: [{ key: 'name', label: 'Nome' }, { key: 'url', label: 'Indirizzo (es. http://192.168.1.10:8080/film/)' }, { key: 'user', label: 'Utente', optional: true }, { key: 'pass', label: 'Password', type: 'password', optional: true }]
};

export function sourceForm(type, existing) {
  const vals = existing ? Object.assign({}, existing) : { type: type, name: '', epgMode: 'short' };
  router.push(new FormScreen({
    title: existing ? 'Modifica sorgente' : 'Nuova sorgente', sub: TYPE_LABEL[type], fields: FIELDS[type] || FIELDS.http, values: vals,
    onTest: async v => { if (type === 'xtream') v = normalizeXtream(v); const cfg = Object.assign({}, v, { id: '__test' + Date.now(), type: type }); return createSource(cfg).test(); },
    onSave: v => {
      if (type === 'xtream') v = normalizeXtream(v);
      const cfg = Object.assign({}, existing || {}, v, { type: type });
      if (!cfg.name) cfg.name = type === 'xtream' ? 'Xtream' : 'Sorgente';
      if ((type === 'm3u' || type === 'xtream' || type === 'webdav' || type === 'http') && !/^https?:\/\//i.test(cfg.url)) cfg.url = 'http://' + cfg.url;
      store.addSource(cfg);
      if (cfg.id) { store.idbDelPrefix('src:' + cfg.id); forget(cfg.id); invalidate(cfg.id); }
      Modal.toast('Sorgente salvata');
      router.back();
      const cur = router.current; if (cur && cur.load) cur.load(); if (cur && cur.refresh) cur.refresh();
    }
  }));
}

export { addSourceFlow };

// ---------------- elenco sorgenti ----------------
export class SourcesScreen {
  constructor() {
    this.hd = header('Sorgenti', 'Playlist, Xtream e server di rete', [{ icon: 'plus', label: 'Aggiungi', onclick: () => addSourceFlow() }]);
    this.list = new VList({
      rowH: () => Math.round(remPx() * 3.8),
      build: () => { const r = h('div', { class: 'row srow' }, h('span', { class: 'sic' }), h('div', { class: 'cmid' }, h('div', { class: 'cn' }), h('div', { class: 'cnow' })), h('span', { class: 'rc' })); r._ic = r.firstChild; r._n = r.querySelector('.cn'); r._s = r.querySelector('.cnow'); r._k = r.lastChild; return r; },
      fill: (n, s) => { n._n.textContent = s.name; n._s.textContent = TYPE_LABEL[s.type] + (s.url ? '  •  ' + s.url.replace(/^https?:\/\//, '').slice(0, 50) : ''); const act = store.activeSource(); n._k.textContent = act && act.id === s.id ? 'ATTIVA' : ''; n._ic.innerHTML = ''; n._ic.appendChild(icon(s.type === 'xtream' ? 'cloud' : isFileType(s.type) ? 'folder' : 'list')); },
      onSelect: s => this.menu(s), onMenu: s => this.menu(s),
      onEdge: d => { if (d === 'up') { nav.focus(this.hd.buttons[0]); this.bar = true; this.list.setActive(false); return true; } return true; }
    });
    this.empty = h('div', { class: 'empty', text: 'Nessuna sorgente. Premi “Aggiungi” per iniziare.' });
    this.el = h('div', { class: 'screen srcs' }, this.hd.el, h('div', { class: 'single' }, this.list.el), this.empty, hints([['ok', 'Opzioni'], ['back', 'Indietro']]));
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
    if (media) items.push({ label: 'Imposta come sorgente attiva', value: 'act', icon: 'check' });
    items.push({ label: 'Modifica', value: 'edit', icon: 'gear' });
    if (media) items.push({ label: 'Aggiorna dati (ricarica elenco)', value: 'ref', icon: 'refresh' });
    items.push({ label: 'Elimina', value: 'del', icon: 'trash', danger: true });
    const r = await Modal.menu(s.name, items);
    if (r === 'act') { store.setActive(s.id); this.load(); Modal.toast('Sorgente attiva: ' + s.name); }
    else if (r === 'edit') { if (s.type === 'm3ufile' || s.type === 'local' || s.type === 'dlna') Modal.toast('Questa sorgente non ha campi da modificare: eliminala e aggiungila di nuovo'); else sourceForm(s.type, s); }
    else if (r === 'ref') { store.idbDelPrefix('src:' + s.id); store.idbDelPrefix('epg:' + s.id); forget(s.id); invalidate(s.id); Epg.reset(); Modal.toast('Verrà riscaricata al prossimo accesso'); }
    else if (r === 'del') { if (await Modal.confirm('Eliminare “' + s.name + '”?', '', 'Elimina', 'Annulla')) { store.removeSource(s.id); forget(s.id); this.load(); } }
  }
}

// ---------------- abbinamento telefono ----------------
export class PairScreen {
  constructor() {
    this.hd = header('Telefono come tastiera e telecomando', '', []);
    this.body = h('div', { class: 'pair' });
    this.el = h('div', { class: 'screen pairscr' }, this.hd.el, this.body, hints([['ok', 'Seleziona'], ['back', 'Indietro']]));
    this.h = m => { if (m.t === 'hello' && this.el.parentNode) this.render(); };
    Remote.onMessage(this.h);
  }
  onShow() { this.render(); }
  render() {
    this.body.innerHTML = '';
    if (!Remote.configured()) {
      this.body.appendChild(h('div', { class: 'p1', text: 'Per usare lo smartphone serve il “companion”, un piccolo programma da avviare sul NAS, su un Raspberry Pi o sul PC (stessa rete della TV).' }));
      this.body.appendChild(h('div', { class: 'p2', text: 'Avvialo con:  node companion/server.js   (oppure con Docker, vedi README). Poi inserisci qui il suo indirizzo, ad esempio http://192.168.1.10:8787' }));
      this.body.appendChild(h('div', { class: 'btn primary', 'data-f': 1, text: 'Imposta indirizzo companion', onclick: () => this.setAddr() }));
      this.body.appendChild(h('div', { class: 'p2', text: 'Senza companion puoi comunque usare una tastiera Bluetooth/USB, la tastiera a schermo, oppure la tastiera del telefono tramite l\'app telecomando del produttore (Google TV, SmartThings, LG ThinQ, Hisense RemoteNOW) col pulsante “Tastiera di sistema”.' }));
    } else {
      const qr = h('div', { class: 'qr' });
      try { const q = window.qrcode(0, 'M'); q.addData(Remote.pairUrl()); q.make(); qr.innerHTML = q.createSvgTag(6, 8); } catch (e) { qr.textContent = 'QR non disponibile'; }
      this.body.appendChild(h('div', { class: 'pcols' }, qr, h('div', { class: 'pinfo2' },
        h('div', { class: 'p1', text: 'Inquadra il codice con la fotocamera del telefono (stessa rete Wi-Fi) oppure apri questo indirizzo:' }),
        h('div', { class: 'purl', text: Remote.pairUrl() }),
        h('div', { class: 'p2', text: 'Codice stanza: ' + Remote.room() }),
        h('div', { class: 'pstat ' + (Remote.phoneSeen ? 'ok' : ''), text: Remote.connected ? (Remote.phoneSeen ? '● Telefono collegato' : '● Companion raggiunto, in attesa del telefono…') : '○ Companion non raggiungibile' }),
        h('div', { class: 'p2', text: 'Dal telefono puoi: scrivere nei campi della TV, usare le frecce/OK/Indietro, inviare playlist M3U, aggiungere sorgenti Xtream/NAS e mandare un URL da riprodurre.' }),
        h('div', { class: 'pbtns' },
          h('div', { class: 'btn', 'data-f': 1, text: 'Cambia indirizzo', onclick: () => this.setAddr() }),
          h('div', { class: 'btn', 'data-f': 1, text: 'Nuovo codice stanza', onclick: () => { store.newRoom(); Remote.start(); this.render(); } })))));
    }
    nav.focusFirst(this.el);
  }
  async setAddr() {
    const r = await promptText({ title: 'Indirizzo del companion', value: store.settings().companion || 'http://', hint: 'Esempio: http://192.168.1.10:8787', quick: true });
    if (r === null) return;
    store.settings().companion = r.replace(/\/+$/, '') === 'http:/' || r === 'http://' ? '' : r.replace(/\/+$/, ''); store.save();
    Remote.start(); this.render();
  }
}

// ---------------- impostazioni ----------------
export class SettingsScreen {
  constructor() {
    this.hd = header('Impostazioni', 'TV Player', []);
    this.list = new VList({
      rowH: () => Math.round(remPx() * 3.3),
      build: () => { const r = h('div', { class: 'row setrow' }, h('span', { class: 'sl' }), h('span', { class: 'sv' })); r._l = r.firstChild; r._v = r.lastChild; return r; },
      fill: (n, it) => { n._l.textContent = it.label; n._v.textContent = it.value ? it.value() : ''; },
      onSelect: it => it.act(), onEdge: () => true
    });
    this.el = h('div', { class: 'screen sets' }, this.hd.el, h('div', { class: 'single' }, this.list.el), hints([['ok', 'Cambia'], ['back', 'Indietro']]));
    const S = store.settings;
    const toggle = (label, key, after) => ({ label: label, value: () => S()[key] ? 'Sì' : 'No', act: () => { S()[key] = !S()[key]; store.save(); if (after) after(); this.list.render(); } });
    const choice = (label, key, opts, fmt, after) => ({ label: label, value: () => { const c = opts.find(o => o[0] === S()[key]); return c ? c[1] : String(S()[key]); }, act: async () => { const r = await Modal.menu(label, opts.map(o => ({ label: o[1], value: o[0] }))); if (r != null) { S()[key] = r; store.save(); if (after) after(); this.list.render(); } } });
    this.items = [
      { label: 'Sorgenti (playlist, Xtream, NAS)', value: () => store.get().sources.length + ' configurate', act: () => router.push(new SourcesScreen()) },
      platform.isDesktop ? null : { label: 'Telefono come tastiera / telecomando', value: () => Remote.configured() ? (Remote.phoneSeen ? 'collegato' : 'pronto') : 'non configurato', act: () => router.push(new PairScreen()) },
      platform.isDesktop ? null : { label: 'Server companion (proxy CORS + relay telefono)', value: () => S().companion || 'non impostato', act: async () => { const r = await promptText({ title: 'Indirizzo del companion', value: S().companion || 'http://', hint: 'Esempio: http://192.168.1.10:8787 — lascia vuoto per disattivare' }); if (r !== null) { S().companion = r === 'http://' ? '' : r.replace(/\/+$/, ''); store.save(); Remote.start(); this.list.render(); } } },
      platform.isDesktop ? choice('Identità del lettore (se il provider blocca)', 'userAgent', [['', 'Predefinita'], ['VLC/3.0.20 LibVLC/3.0.20', 'VLC'], ['Kodi/21.0 (Windows NT 10.0; Win64; x64)', 'Kodi'], ['okhttp/4.12.0', 'Android (okhttp)'], ['Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36', 'Smart TV Samsung']], null, () => window.desktop && window.desktop.setUserAgent && window.desktop.setUserAgent(S().userAgent)) : toggle('Video tramite proxy (se il server blocca CORS)', 'proxyMedia'),
      choice('Formato canali live Xtream', 'liveFormat', [['m3u8', 'HLS (.m3u8) — consigliato'], ['ts', 'MPEG-TS (.ts)']]),
      toggle('Anteprima video scorrendo i canali (usa più risorse)', 'previewVideo'),
      toggle('Risparmio risorse (niente animazioni)', 'lowPower', applyUi),
      choice('Dimensione interfaccia', 'uiScale', [[80, 'Piccola (80%)'], [90, '90%'], [100, 'Normale (100%)'], [115, 'Grande (115%)'], [130, 'Molto grande (130%)']], null, applyUi),
      choice('Buffer di riproduzione', 'bufferSec', [[10, '10 secondi (poca RAM)'], [20, '20 secondi'], [40, '40 secondi (connessione instabile)']]),
      choice('Guida programmi (finestra)', 'epgHours', [[6, '6 ore'], [12, '12 ore'], [24, '24 ore'], [48, '48 ore']]),
      platform.isDesktop ? { label: 'Aggiornamenti dell\'app', value: () => 'v' + (window.__ver || '…'), act: () => window.desktop.updateCheck() } : null,
      platform.isDesktop ? choice('Convertitore video (film/serie)', 'transcode', [['auto', 'Automatico: solo se serve (consigliato)'], ['always', 'Sempre (codec strani, timeline bloccata)'], ['never', 'Mai (solo lettore nativo)']]) : null,
      { label: 'Svuota cache e guida programmi', value: () => '', act: async () => { await store.idbClear(); Epg.reset(); Modal.toast('Cache svuotata'); } },
      { label: 'Informazioni', value: () => platform.name, act: () => Modal.confirm('TV Player', 'Piattaforma rilevata: ' + platform.name + (platform.isDesktop ? '\nMouse: clic per aprire, tasto destro = opzioni, rotella = scorri.\nTastiera: Ctrl+V incolla un link/playlist, Spazio pausa, F schermo intero, M muto, ← → ±10 s, Esc indietro.' : '\nTasti: frecce + OK; OK lungo = menu; Rosso = preferito; Verde = cerca; Blu = audio/sottotitoli; numeri = canale.'), 'OK', '') }
    ].filter(Boolean);
  }
  onShow() { if (platform.isDesktop && !window.__ver) window.desktop.appVersion().then(v => { window.__ver = v; this.list.render(); }); this.list.setItems(this.items, true); this.list.setActive(true); this.list.relayout(); }
  onKey(a) { return this.list.handleKey(a.a); }
}
