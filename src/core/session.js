// Apertura sorgenti (con overlay di caricamento) e costruzione delle opzioni del player
import { createSource } from '../sources/index.js';
import * as store from './store.js';
import { Epg } from './epg.js';
import * as Modal from '../ui/modal.js';
import { tr } from './i18n.js';

const ready = {};
let ld = null;

export function showLoading(txt, sub) {
  ld = ld || document.getElementById('loading');
  ld.querySelector('.l1').textContent = txt || tr('Caricamento…');
  ld.querySelector('.l2').textContent = sub || '';
  ld.classList.add('show');
}
export function setLoading(sub) { ld = ld || document.getElementById('loading'); ld.querySelector('.l2').textContent = sub || ''; }
export function hideLoading() { ld = ld || document.getElementById('loading'); ld.classList.remove('show'); }

export async function openSource(cfg, force) {
  const s = createSource(cfg);
  if (ready[cfg.id] && !force) return s;
  showLoading(tr('Caricamento “') + cfg.name + '”…', tr('La prima volta può richiedere qualche secondo'));
  try {
    if (s.init) await s.init(p => setLoading(Math.round(p * 100) + '%'), force);
    ready[cfg.id] = true;
    if (s.limit) setTimeout(() => Modal.toast(tr('Connessioni in uso ') + s.limit.active + '/' + s.limit.max + tr(': se la playlist è attiva su un altro dispositivo il provider potrebbe rifiutare i flussi'), 9000), 300);
    return s;
  } finally { hideLoading(); }
}
export function invalidate(id) { delete ready[id]; }
export function isReady(id) { return !!ready[id]; }

export function sourceById(id) { return store.get().sources.find(s => s.id === id) || null; }

// ---- EPG in background
const epgState = {};
export function startEpg(src, channels, done) {
  const url = src.epgUrl;
  if (!url || epgState[src.id] === 'loading' || epgState[src.id] === 'done') { if (epgState[src.id] === 'done' && done) done(); return; }
  epgState[src.id] = 'loading';
  Epg.loadXmltv(src.id, url, channels).then(() => { epgState[src.id] = 'done'; if (done) done(); })
    .catch(() => { epgState[src.id] = 'error'; });
}

// ---- opzioni player
export function liveOpts(src, items, index, extra) {
  return Object.assign({
    kind: 'live', list: items, index: index,
    resolve: ch => ({
      url: src.urlFor(ch, 'live'), alt: src.cfg.type === 'xtream' ? src.urlFor(ch, 'live-alt') : null,
      title: ch.name, logo: ch.logo, num: ch.num, ch: ch, src: src, key: store.favKey(src.id, 'live', ch.id),
      meta: { kind: 'live', src: src.id, id: ch.id }
    })
  }, extra || {});
}
export function movieOpts(src, item, info) {
  return {
    kind: 'vod', list: [item], index: 0,
    resolve: it => ({
      url: src.urlFor(it, 'movie'), title: it.name, logo: it.poster, sub: (info && info.year ? info.year : it.year) || '',
      key: store.favKey(src.id, 'movie', it.id), meta: { kind: 'movie', src: src.id, id: it.id, ext: it.ext, url: it.url, poster: it.poster }
    })
  };
}
export function episodesOpts(src, show, episodes, index) {
  // episodes: [{id, num, title, season, ext, url}]
  return {
    kind: 'vod', list: episodes, index: index,
    resolve: ep => ({
      url: src.urlFor(ep, 'series'), title: show.name, logo: show.poster,
      sub: 'S' + (ep.season < 10 ? '0' : '') + ep.season + 'E' + (ep.num < 10 ? '0' : '') + ep.num + ' · ' + ep.title,
      key: store.favKey(src.id, 'ep', ep.id), meta: { kind: 'episode', src: src.id, id: ep.id, ext: ep.ext, url: ep.url, poster: show.poster, show: show.name, series: show.id, seriesItem: { id: show.id, name: show.name, poster: show.poster } }
    })
  };
}
export function fileOpts(src, files, index) {
  return {
    kind: 'vod', list: files, index: index,
    resolve: f => ({
      url: src.fileUrl(f), title: f.name.replace(/\.[^.]+$/, ''), logo: f.poster || '', sub: tr('Dalla rete locale'),
      key: store.favKey(src.id, 'file', f.path), meta: { kind: 'file', src: src.id, id: f.path, url: f.url || '' }
    })
  };
}
