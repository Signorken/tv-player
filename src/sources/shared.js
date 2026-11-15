// Utilità condivise dalle sorgenti "file" (cartella locale, DLNA)
import { extOf, decodeEntities } from '../core/util.js';

const VIDEO = { mkv: 1, mp4: 1, avi: 1, mov: 1, m4v: 1, ts: 1, webm: 1, wmv: 1, mpg: 1, mpeg: 1, m3u8: 1, flv: 1, m2ts: 1 };
const AUDIO = { mp3: 1, flac: 1, aac: 1, m4a: 1, ogg: 1, wav: 1, opus: 1 };
const IMG = { jpg: 1, jpeg: 1, png: 1, webp: 1 };

export function kindOf(name, isDir) {
  if (isDir) return 'dir';
  const e = extOf(name);
  if (e === 'm3u') return 'playlist';
  if (VIDEO[e]) return 'video';
  if (AUDIO[e]) return 'audio';
  if (IMG[e]) return 'image';
  if (e === 'nfo') return 'nfo';
  return 'other';
}

export function parseNfo(t) {
  const g = tag => { const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(t); return m ? decodeEntities(m[1].trim()) : ''; };
  return { title: g('title'), plot: g('plot'), year: g('year'), rating: g('rating'), runtime: g('runtime') };
}

export function sortEntries(list) {
  return list.sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

// percorso del file system -> URL file://
export function toFileUrl(p) {
  p = String(p);
  if (/^[A-Za-z]:[\\/]/.test(p)) return 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  if (/^\\\\/.test(p)) return 'file:' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
}
