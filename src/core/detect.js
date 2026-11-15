// Riconoscimento intelligente di ciò che l'utente incolla/trascina: niente più campi da compilare a mano.
import { request } from './net.js';

export function hostName(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'Sorgente'; } }

// Estrae le credenziali Xtream da get.php?username=..&password=.. / player_api.php / URL /live|movie|series/u/p/id
export function parseXtream(u) {
  try {
    const x = new URL(u);
    const user = x.searchParams.get('username'), pass = x.searchParams.get('password');
    if (user && pass) return { url: x.origin, user: user, pass: pass };
    const m = /^\/(?:live|movie|series)\/([^/]+)\/([^/]+)\/[^/]+$/.exec(x.pathname);
    if (m) return { url: x.origin, user: decodeURIComponent(m[1]), pass: decodeURIComponent(m[2]) };
  } catch (e) { /* */ }
  return null;
}

// Sistema i campi di un form Xtream se l'utente ha incollato un URL completo nel campo "server"
export function normalizeXtream(v) {
  const o = Object.assign({}, v);
  const x = parseXtream(o.url || '');
  if (x) { o.url = x.url; o.user = o.user || x.user; o.pass = o.pass || x.pass; }
  else if (o.url) o.url = o.url.replace(/\/(player_api|get|xmltv)\.php.*$/i, '').replace(/\/+$/, '');
  return o;
}

// Un .m3u8 può essere una playlist di canali oppure un singolo flusso HLS: guardo i primi KB
export async function probeM3U(url) {
  try {
    const r = await request(url, { timeout: 15000 });
    const t = (await r.text()).slice(0, 8000);
    if (/#EXT-X-(STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE)/.test(t) && !/tvg-|group-title/.test(t)) return 'stream';
    if (/^\s*#EXTM3U/.test(t)) return 'playlist';
    return 'unknown';
  } catch (e) { return 'unreachable'; }
}

// text -> { type: 'xtream'|'m3u'|'m3ufile'|'webdav'|'stream'|'unknown', ... } oppure null
export async function detect(text) {
  text = String(text || '').trim().replace(/^﻿/, '');
  if (!text) return null;
  if (/^#EXTM3U/i.test(text)) return { type: 'm3ufile', text: text, name: 'Playlist incollata' };
  const m = /(webdavs?|davs?|https?):\/\/[^\s"'<>]+/i.exec(text);
  if (!m) return null;
  let url = m[0].replace(/[),.;]+$/, '');
  let dav = false;
  if (/^(webdav|dav)(s?):/i.test(url)) { url = url.replace(/^(?:webdav|dav)(s?):/i, (a, s) => 'http' + s + ':'); dav = true; }
  const xt = parseXtream(url);
  if (xt) return { type: 'xtream', name: hostName(xt.url), url: xt.url, user: xt.user, pass: xt.pass, epgMode: 'short' };
  if (dav || /\/remote\.php\/(web)?dav|\/webdav(\/|$)|\/dav(\/|$)/i.test(url)) return { type: 'webdav', name: hostName(url), url: url };
  if (/get\.php|type=m3u|output=(ts|m3u8)|\.m3u(\?|$)/i.test(url)) return { type: 'm3u', name: hostName(url), url: url };
  if (/\.m3u8(\?|$)/i.test(url)) {
    const k = await probeM3U(url);
    if (k === 'stream') return { type: 'stream', name: hostName(url), url: url };
    return { type: 'm3u', name: hostName(url), url: url };
  }
  if (/\.(mp4|mkv|ts|webm|mov|avi)(\?|$)/i.test(url)) return { type: 'stream', name: hostName(url), url: url };
  return { type: 'unknown', name: hostName(url), url: url };
}
