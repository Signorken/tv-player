// Persistenza: impostazioni/sorgenti/preferiti in localStorage, cache grandi in IndexedDB
import { uid } from './util.js';

const LS = 'tvapp.v1';
const DEFAULTS = {
  sources: [], activeSource: null,
  settings: {
    previewVideo: false,     // anteprima video mentre si scorrono i canali (consuma risorse)
    wallpaper: '01-aurora',   // sfondo (vedi www/wallpapers) oppure 'none'
    audioLang: '',           // lingua audio preferita (it, en…): ricordata quando la scegli nel player
    layout: 'A',             // A = barra laterale, B = pulsanti in alto
    clock: '24',             // 24 | 12
    startScreen: 'home',     // schermata all'avvio: home | live | movie | series | sport | favs | last
    miniPlayer: 'always',    // Indietro dal player = finestrella: always | live | vod | never
    sounds: true,            // suoni di navigazione
    lang: '',                // lingua: '' = automatica (come il dispositivo) | it | en
    odSort: '',              // ordine della griglia On Demand: '' | az | za | rd | ra
    videoEngine: 'auto',     // auto = lettore nativo (ExoPlayer/AVPlay) se c'è, web = lettore HTML5
    perf: 'auto',            // prestazioni: auto | full | lite (lite = niente animazioni, sfondo semplice, niente anteprime)
    perfHud: false,          // indicatore prestazioni
    liveFormat: 'm3u8',      // m3u8 | ts  (per Xtream)
    uiScale: 100,
    bufferSec: 20,
    epgHours: 12,
    companion: '',           // es. http://192.168.1.10:8787
    proxyMedia: false,       // instrada anche i flussi video dal proxy (se CORS lo richiede)
    room: '',
    transcode: 'auto',       // solo desktop: convertitore ffmpeg (auto | always | never)
    userAgent: ''            // solo desktop: User-Agent da presentare ai server IPTV
  },
  favorites: {},  // key -> {name, logo, kind, src, id}
  mylist: {},     // "La mia lista": film e serie da guardare (separata dai preferiti)
  recents: [],    // [{key, ...}]
  watched: {},    // key -> timestamp (film/episodi visti fino alla fine)
  contClearedAt: 0, // la riga "Continua a guardare" mostra solo ciò che è stato guardato dopo questo istante
  progress: {}    // key -> {pos, dur, t}
};

let data = null;
let favV = 0;
export function favVer() { return favV; }
let saveT = null;

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { d = null; }
  data = clone(DEFAULTS);
  if (d) {
    for (const k in d) {
      if (k === 'settings') { for (const s in d.settings) data.settings[s] = d.settings[s]; }
      else data[k] = d[k];
    }
  }
  if (!data.settings.room) data.settings.room = randomRoom();
  // migrazioni 2.1: finestrella a 4 scelte, animazioni attive una volta (prima erano spente di default)
  const st = data.settings;
  if (st.miniPlayer === true) st.miniPlayer = 'always'; else if (st.miniPlayer === false) st.miniPlayer = 'never';
  if (!st.mig21) { st.mig21 = 1; st.lowPower = false; }
  // 2.4: "Risparmio risorse" diventa il profilo prestazioni (chi l'aveva attivato resta in modalità leggera)
  if (!st.mig24) { st.mig24 = 1; st.perf = st.lowPower ? 'lite' : 'auto'; }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  return data;
}

function randomRoom() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = '';
  for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function newRoom() { get().settings.room = randomRoom(); save(); return get().settings.room; }
export function get() { return data || load(); }
export function settings() { return get().settings; }

export function save(now) {
  if (now) { flush(); return; }
  clearTimeout(saveT);
  saveT = setTimeout(flush, 400);
}
function flush() {
  try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) { /* quota */ }
}

// ---- sorgenti
export function addSource(cfg) {
  const d = get();
  cfg.id = cfg.id || uid();
  const i = d.sources.findIndex(s => s.id === cfg.id);
  if (i >= 0) d.sources[i] = cfg; else d.sources.push(cfg);
  if (!d.activeSource) d.activeSource = cfg.id;
  save();
  return cfg;
}
export function removeSource(id) {
  const d = get();
  d.sources = d.sources.filter(s => s.id !== id);
  if (d.activeSource === id) d.activeSource = d.sources.length ? d.sources[0].id : null;
  idbDelPrefix('src:' + id);
  save();
}
export function mediaSources() { return get().sources.filter(s => s.type === 'm3u' || s.type === 'm3ufile' || s.type === 'xtream'); }
export function fileSources() { return get().sources.filter(s => s.type === 'webdav' || s.type === 'http' || s.type === 'local' || s.type === 'dlna'); }
export function activeSource() {
  const d = get();
  const m = mediaSources();
  return m.find(s => s.id === d.activeSource) || m[0] || null;
}
export function setActive(id) { get().activeSource = id; save(); }

// ---- preferiti / recenti / avanzamento
export function favKey(srcId, kind, id) { return srcId + '|' + kind + '|' + id; }
export function isFav(key) { return !!get().favorites[key]; }
export function inList(key) { return !!(get().mylist || {})[key]; }
export function toggleList(key, info) {
  const d = get(); if (!d.mylist) d.mylist = {};
  if (d.mylist[key]) delete d.mylist[key]; else { info.t = Date.now(); d.mylist[key] = info; }
  save();
  return !!d.mylist[key];
}
export function toggleFav(key, info) {
  const f = get().favorites;
  if (f[key]) delete f[key]; else { info.t = Date.now(); f[key] = info; }
  favV++;
  save();
  return !!f[key];
}
export function addRecent(key, info) {
  const r = get().recents.filter(x => x.key !== key);
  info.key = key; info.t = Date.now();
  r.unshift(info);
  get().recents = r.slice(0, 30);
  save();
}
// "Continua a guardare": solo contenuti VOD (film, episodi, file), mai canali live.
// Rimuovere la riga non cancella né recenti né progressi.
export function contItems(max) {
  const c = get().contClearedAt || 0;
  return get().recents.filter(r => r.kind !== 'live' && r.t > c && !r.hid).slice(0, max || 12);
}
// toglie un solo elemento dalla riga (riappare se lo si riguarda)
export function hideRecent(key) { const r = get().recents.find(x => x.key === key); if (r) { r.hid = 1; save(); } }
export function liveItems(max) {
  const c = get().liveClearedAt || 0, seen = {};
  return get().recents.filter(r => r.kind === 'live' && r.t > c && !r.hid && !seen[r.key] && (seen[r.key] = 1)).slice(0, max || 8);
}
export function clearLiveRow() { get().liveClearedAt = Date.now(); save(); }
export function clearContRow() { get().contClearedAt = Date.now(); save(); }
export function setProgress(key, pos, dur) {
  get().progress[key] = { pos: Math.floor(pos), dur: Math.floor(dur), t: Date.now() };
  save();
}
export function markWatched(key) { get().watched[key] = Date.now(); save(); }
export function isWatched(key) { return !!get().watched[key]; }
export function getProgress(key) { return get().progress[key] || null; }
export function clearProgress(key) { delete get().progress[key]; save(); }

// ---- IndexedDB (cache cataloghi, EPG, playlist importate)
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('no idb')); return; }
    const rq = indexedDB.open('tvapp', 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('kv'); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return dbp;
}
export function idbGet(key) {
  return db().then(d => new Promise((res) => {
    const rq = d.transaction('kv').objectStore('kv').get(key);
    rq.onsuccess = () => res(rq.result === undefined ? null : rq.result);
    rq.onerror = () => res(null);
  })).catch(() => null);
}
export function idbSet(key, val) {
  return db().then(d => new Promise((res) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  })).catch(() => false);
}
export function idbDelPrefix(prefix) {
  return db().then(d => new Promise((res) => {
    const tx = d.transaction('kv', 'readwrite');
    const st = tx.objectStore('kv');
    const rq = st.openCursor();
    rq.onsuccess = () => {
      const c = rq.result;
      if (c) { if (String(c.key).indexOf(prefix) === 0) c.delete(); c.continue(); }
    };
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  })).catch(() => false);
}
export function idbClear() {
  return db().then(d => new Promise((res) => {
    const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').clear();
    tx.oncomplete = () => res(true); tx.onerror = () => res(false);
  })).catch(() => false);
}

// cache con scadenza: restituisce subito i dati (anche vecchi) se presenti e rinfresca in background
export async function cached(key, ttlMs, loader, force) {
  const hit = force ? null : await idbGet(key);
  if (hit && hit.t && hit.v !== undefined) {
    if (Date.now() - hit.t > ttlMs) { loader().then(v => idbSet(key, { t: Date.now(), v: v })).catch(() => { }); }
    return hit.v;
  }
  const v = await loader();
  idbSet(key, { t: Date.now(), v: v });
  return v;
}
