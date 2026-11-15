// Parser M3U e XMLTV (a blocchi, per non bloccare la UI su playlist da decine di MB)
import { tick, decodeEntities, extOf } from './util.js';

const ATTR = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;

function lastTopLevelComma(s) {
  let q = false, idx = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) q = !q;
    else if (c === 44 && !q) idx = i;
  }
  return idx;
}

function parseInf(line, grp) {
  const rest = line.slice(8);
  const ci = lastTopLevelComma(rest);
  const head = ci >= 0 ? rest.slice(0, ci) : rest;
  const name = ci >= 0 ? rest.slice(ci + 1).trim() : '';
  const at = {};
  let m; ATTR.lastIndex = 0;
  while ((m = ATTR.exec(head))) at[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
  const dur = parseFloat(head);
  return {
    name: at['tvg-name'] && !name ? at['tvg-name'] : name,
    logo: at['tvg-logo'] || at['logo'] || '',
    group: at['group-title'] || grp || '',
    epgId: at['tvg-id'] || '',
    num: at['tvg-chno'] || at['channel-number'] || '',
    dur: isNaN(dur) ? -1 : dur,
    url: ''
  };
}

export async function parseM3U(text, onProgress) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const head = {};
  let cur = null, grp = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l) {
      if (l.charCodeAt(0) === 35) {
        if (l.indexOf('#EXTINF:') === 0) cur = parseInf(l, grp);
        else if (l.indexOf('#EXTGRP:') === 0) grp = l.slice(8).trim();
        else if (l.indexOf('#EXTM3U') === 0) {
          let m; ATTR.lastIndex = 0;
          while ((m = ATTR.exec(l))) head[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
        }
      } else if (cur) {
        cur.url = l; out.push(cur); cur = null; grp = '';
      } else if (/^[a-z]+:\/\//i.test(l)) {
        const nm = decodeURIComponent((l.split('?')[0].split('/').pop() || l)).replace(/\.[a-z0-9]{2,4}$/i, '');
        out.push({ name: nm, logo: '', group: '', epgId: '', num: '', dur: -1, url: l });
      }
    }
    if (i % 5000 === 4999) { if (onProgress) onProgress(i / lines.length); await tick(); }
  }
  return { entries: out, head: head, epgUrl: head['url-tvg'] || head['x-tvg-url'] || head['tvg-url'] || '' };
}

const VOD_EXT = { mkv: 1, mp4: 1, avi: 1, mov: 1, wmv: 1, m4v: 1, flv: 1, webm: 1, mpg: 1, mpeg: 1 };
const SE = /^(.*?)[\s._\-]*[Ss](\d{1,2})\s*[._\-]?\s*[Ee](\d{1,3})\b[\s._\-:]*(.*)$/;

export function classify(e) {
  const u = e.url;
  if (/\/series\//i.test(u) || SE.test(e.name)) return SE.test(e.name) ? 'series' : 'movie';
  if (/\/movie\//i.test(u)) return 'movie';
  if (e.dur > 0 && VOD_EXT[extOf(u)]) return 'movie';
  if (e.dur > 600) return 'movie';
  return 'live';
}

function buildCats(items) {
  const map = {}, cats = [];
  for (let i = 0; i < items.length; i++) {
    const g = items[i].group || 'Senza gruppo';
    if (!map[g]) { map[g] = { id: g, name: g, count: 0 }; cats.push(map[g]); }
    map[g].count++;
  }
  return cats;
}

export function buildCatalogFromM3U(entries) {
  const live = [], movies = [], shows = {}, showList = [];
  let n = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const k = classify(e);
    if (k === 'live') {
      live.push({ id: 'l' + i, name: e.name, logo: e.logo, group: e.group || 'Senza gruppo', num: e.num || String(++n), url: e.url, epgId: e.epgId });
    } else if (k === 'movie') {
      movies.push({ id: 'm' + i, name: e.name, poster: e.logo, group: e.group || 'Film', url: e.url, ext: extOf(e.url) });
    } else {
      const m = SE.exec(e.name);
      const key = (e.group || '') + '|' + m[1].toLowerCase();
      let s = shows[key];
      if (!s) { s = shows[key] = { id: 's' + showList.length, name: m[1].replace(/[._]+/g, ' ').trim(), poster: e.logo, group: e.group || 'Serie', seasons: {} }; showList.push(s); }
      const sn = parseInt(m[2], 10), en = parseInt(m[3], 10);
      (s.seasons[sn] = s.seasons[sn] || []).push({ id: 'e' + i, num: en, title: (m[4] || '').trim() || ('Episodio ' + en), url: e.url, ext: extOf(e.url) });
    }
  }
  return {
    live: { cats: buildCats(live), items: live },
    movies: { cats: buildCats(movies), items: movies },
    series: { cats: buildCats(showList), items: showList }
  };
}

// ---------------- XMLTV ----------------
function xmltvTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(s || '');
  if (!m) return 0;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) {
    const sign = m[7][0] === '-' ? -1 : 1;
    t -= sign * ((+m[7].slice(1, 3)) * 60 + (+m[7].slice(3, 5))) * 60000;
  }
  return t;
}
const RX_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;
const RX_DESC = /<desc[^>]*>([\s\S]*?)<\/desc>/;
const RX_START = /start="([^"]*)"/;
const RX_STOP = /stop="([^"]*)"/;
const RX_CHAN = /channel="([^"]*)"/;
const RX_NAME = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;

// restituisce { names:{id:[nomi]}, progs:{id:[[start,stop,titolo,desc],...]} }
export async function parseXMLTV(text, opts) {
  opts = opts || {};
  const from = opts.from || (Date.now() - 3600000), to = opts.to || (Date.now() + 12 * 3600000);
  const names = {}, progs = {};
  let pos = 0, n = 0;
  // canali
  while (true) {
    const a = text.indexOf('<channel ', pos);
    if (a < 0) break;
    const b = text.indexOf('</channel>', a);
    if (b < 0) break;
    const blk = text.slice(a, b);
    const idm = /id="([^"]*)"/.exec(blk);
    if (idm) {
      const id = decodeEntities(idm[1]); const arr = []; let m; RX_NAME.lastIndex = 0;
      while ((m = RX_NAME.exec(blk))) arr.push(decodeEntities(m[1].trim()));
      names[id] = arr;
    }
    pos = b + 10;
    if ((++n) % 2000 === 0) await tick();
  }
  // programmi
  pos = 0; n = 0;
  const want = opts.wantId;
  while (true) {
    const a = text.indexOf('<programme', pos);
    if (a < 0) break;
    const b = text.indexOf('</programme>', a);
    if (b < 0) break;
    pos = b + 12;
    const tagEnd = text.indexOf('>', a);
    const tag = text.slice(a, tagEnd);
    const st = RX_START.exec(tag), sp = RX_STOP.exec(tag), ch = RX_CHAN.exec(tag);
    if (st && sp && ch) {
      const s = xmltvTime(st[1]), e = xmltvTime(sp[1]);
      if (e >= from && s <= to) {
        const id = decodeEntities(ch[1]);
        if (!want || want(id)) {
          const body = text.slice(tagEnd, b);
          const t = RX_TITLE.exec(body), d = RX_DESC.exec(body);
          (progs[id] = progs[id] || []).push([s, e, t ? decodeEntities(t[1].trim()) : '', d ? decodeEntities(d[1].trim()).slice(0, 400) : '']);
        }
      }
    }
    if ((++n) % 3000 === 0) { if (opts.onProgress) opts.onProgress(pos / text.length); await tick(); }
  }
  for (const id in progs) progs[id].sort((x, y) => x[0] - y[0]);
  return { names: names, progs: progs };
}
