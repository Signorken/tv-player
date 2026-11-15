// Guida programmi: XMLTV (opzionale) + EPG breve per canale (Xtream), tutto in memoria compatta.
import { norm } from './util.js';
import { parseXMLTV } from './parsers.js';
import { fetchMaybeGz } from './net.js';
import { idbGet, idbSet, settings } from './store.js';

const E = { progs: {}, alias: {}, ids: {}, ready: false, srcId: null };

function xmlId(ch) {
  // trova l'id XMLTV corrispondente ad un canale
  if (ch._xid !== undefined) return ch._xid;
  let id = null;
  if (ch.epgId) { const k = ch.epgId.toLowerCase(); if (E.ids[k]) id = E.ids[k]; }
  if (!id) { const a = E.alias[norm(ch.name)]; if (a) id = a; }
  ch._xid = id;
  return id;
}

export const Epg = {
  get ready() { return E.ready; },
  reset() { E.progs = {}; E.alias = {}; E.ids = {}; E.ready = false; E.srcId = null; },

  // Scarica e indicizza l'XMLTV, tenendo solo i canali presenti e la finestra temporale richiesta
  async loadXmltv(srcId, url, channels, onProgress) {
    const hours = settings().epgHours || 12;
    const key = 'epg:' + srcId;
    const hit = await idbGet(key);
    if (hit && Date.now() - hit.t < 3 * 3600000 && hit.v) { this._apply(srcId, hit.v); return true; }
    const text = await fetchMaybeGz(url);
    // 1) indice nomi -> per sapere quali id XMLTV servono
    const wanted = {};
    const epgIds = {};
    for (let i = 0; i < channels.length; i++) { if (channels[i].epgId) epgIds[channels[i].epgId.toLowerCase()] = 1; }
    const nameSet = {};
    for (let i = 0; i < channels.length; i++) nameSet[norm(channels[i].name)] = 1;
    const parsedNames = await parseXMLTV(text.slice(0, Math.min(text.length, text.indexOf('<programme') > 0 ? text.indexOf('<programme') : text.length)), { from: 1, to: 0 });
    for (const id in parsedNames.names) {
      if (epgIds[id.toLowerCase()]) wanted[id] = 1;
      else { const nn = parsedNames.names[id]; for (let j = 0; j < nn.length; j++) if (nameSet[norm(nn[j])]) { wanted[id] = 1; break; } }
    }
    const res = await parseXMLTV(text, {
      from: Date.now() - 3600000, to: Date.now() + hours * 3600000,
      wantId: id => !!wanted[id], onProgress: onProgress
    });
    const pack = { names: parsedNames.names, progs: res.progs };
    idbSet(key, { t: Date.now(), v: pack });
    this._apply(srcId, pack);
    return true;
  },

  _apply(srcId, pack) {
    E.srcId = srcId; E.progs = pack.progs; E.alias = {}; E.ids = {};
    for (const id in pack.names) {
      E.ids[id.toLowerCase()] = id;
      const nn = pack.names[id];
      for (let j = 0; j < nn.length; j++) E.alias[norm(nn[j])] = id;
    }
    for (const id in pack.progs) { E.ids[id.toLowerCase()] = id; }
    E.ready = true;
  },

  get srcId() { return E.srcId; },
  setShort(ch, list) { ch._se = { t: Date.now(), list: list }; },
  getShort(ch) { const s = ch._se; return s && Date.now() - s.t < 300000 ? s.list : null; },

  // lista [start, stop, title, desc] del canale (XMLTV oppure EPG breve)
  list(ch) {
    const id = E.ready ? xmlId(ch) : null;
    if (id && E.progs[id]) return E.progs[id];
    const s = this.getShort(ch);
    return s || null;
  },
  nowNext(ch, t) {
    t = t || Date.now();
    const l = this.list(ch);
    if (!l) return null;
    let i = 0;
    while (i < l.length && l[i][1] <= t) i++;
    if (i >= l.length) return null;
    const cur = l[i][0] <= t ? l[i] : null;
    const next = cur ? l[i + 1] : l[i];
    return { now: cur, next: next || null, after: cur ? l[i + 2] || null : l[i + 1] || null };
  }
};
