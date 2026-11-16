// Sorgente file di rete (NAS): WebDAV oppure indice HTTP (nginx/apache autoindex, miniserve, ecc.)
import { request, fetchText, proxyBase, viaProxy } from '../core/net.js';
import { extOf, decodeEntities } from '../core/util.js';
import { tr } from '../core/i18n.js';

const VIDEO = { mkv: 1, mp4: 1, avi: 1, mov: 1, m4v: 1, ts: 1, webm: 1, wmv: 1, mpg: 1, mpeg: 1, m3u8: 1, flv: 1 };
const AUDIO = { mp3: 1, flac: 1, aac: 1, m4a: 1, ogg: 1, wav: 1 };
const IMG = { jpg: 1, jpeg: 1, png: 1, webp: 1 };

function kindOf(name, isDir) {
  if (isDir) return 'dir';
  const e = extOf(name);
  if (e === 'm3u') return 'playlist';
  if (VIDEO[e]) return 'video';
  if (AUDIO[e]) return 'audio';
  if (IMG[e]) return 'image';
  if (e === 'nfo') return 'nfo';
  return 'other';
}

function join(base, path) { return base.replace(/\/+$/, '') + path; }

export class DavSource {
  constructor(cfg) {
    this.cfg = cfg; this.kind = 'files';
    const m = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(cfg.url.trim());
    this.origin = m ? m[1] : cfg.url; this.root = (m && m[2] ? m[2] : '/').replace(/\/+$/, '') + '/';
    this.auth = cfg.user ? cfg.user + ':' + (cfg.pass || '') : '';
  }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }

  async test() { const r = await this.list(this.root); return r.length + tr(' elementi nella cartella principale'); }

  // path = percorso assoluto url-encoded che termina con '/'
  async list(path) {
    const url = this.origin + path;
    let entries;
    if (this.cfg.type === 'webdav') entries = await this._propfind(url, path);
    else entries = await this._html(url, path);
    // poster Kodi-style nella stessa cartella
    const files = {};
    entries.forEach(e => { files[e.name.toLowerCase()] = e; });
    entries.forEach(e => {
      if (e.kind !== 'video') return;
      const stem = e.name.replace(/\.[^.]+$/, '').toLowerCase();
      const p = files[stem + '-poster.jpg'] || files[stem + '.jpg'] || files[stem + '-poster.png'] || files[stem + '.png'] || files['poster.jpg'] || files['folder.jpg'];
      if (p) e.poster = this.fileUrl(p);
      const nfo = files[stem + '.nfo']; if (nfo) e.nfo = nfo.path;
    });
    entries = entries.filter(e => e.kind !== 'image' && e.kind !== 'nfo' && e.kind !== 'other' || e.kind === 'dir');
    entries.sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return entries;
  }

  async _propfind(url, path) {
    const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>';
    const res = await request(url, { method: 'PROPFIND', headers: { Depth: '1', 'Content-Type': 'text/xml' }, body: body, auth: this.auth });
    const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
    const rs = xml.getElementsByTagNameNS('DAV:', 'response');
    const out = [];
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const hrefEl = r.getElementsByTagNameNS('DAV:', 'href')[0];
      if (!hrefEl) continue;
      let href = hrefEl.textContent.trim();
      try { href = new URL(href, this.origin).pathname; } catch (e) { /* */ }
      if (href.replace(/\/+$/, '') === path.replace(/\/+$/, '')) continue;
      const isDir = r.getElementsByTagNameNS('DAV:', 'collection').length > 0;
      const len = r.getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
      const lm = r.getElementsByTagNameNS('DAV:', 'getlastmodified')[0];
      let name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop());
      out.push({ name: name, path: href, dir: isDir, kind: kindOf(name, isDir), size: len ? +len.textContent : 0, date: lm ? lm.textContent : '' });
    }
    return out;
  }

  async _html(url, path) {
    const html = await fetchText(url, { auth: this.auth, timeout: 30000 });
    const out = []; const rx = /<a\s+[^>]*href="([^"#?]+)"[^>]*>([^<]*)<\/a>([^<\n]*)/gi; let m;
    while ((m = rx.exec(html))) {
      let href = decodeEntities(m[1]);
      if (href === '../' || href === '/' || href.charAt(0) === '?' || /^[a-z]+:\/\//i.test(href) && href.indexOf(this.origin) !== 0) continue;
      let abs;
      try { abs = new URL(href, url).pathname; } catch (e) { continue; }
      if (abs.replace(/\/+$/, '') === path.replace(/\/+$/, '') || abs.length < path.length) continue;
      const isDir = /\/$/.test(abs);
      const name = decodeURIComponent(abs.replace(/\/+$/, '').split('/').pop());
      if (!name || name.charAt(0) === '.') continue;
      const tail = (m[3] || '').trim().split(/\s+/);
      out.push({ name: name, path: abs, dir: isDir, kind: kindOf(name, isDir), size: 0, date: tail.length >= 2 ? tail[0] + ' ' + tail[1] : '' });
    }
    return out;
  }

  fileUrl(e) {
    const u = this.origin + e.path;
    if (!this.auth) return u;
    if (proxyBase()) return viaProxy(u, { auth: this.auth }); // il proxy aggiunge l'autenticazione e supporta i Range
    return this._withCreds(u);
  }
  _withCreds(u) {
    // alcuni browser TV accettano user:pass@host nell'URL del video; con il proxy è più affidabile
    return u.replace('://', '://' + encodeURIComponent(this.cfg.user) + ':' + encodeURIComponent(this.cfg.pass || '') + '@');
  }
  async nfo(e) {
    if (!e.nfo) return null;
    try {
      const t = await fetchText(this.origin + e.nfo, { auth: this.auth, timeout: 8000 });
      const g = (tag) => { const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(t); return m ? decodeEntities(m[1].trim()) : ''; };
      return { title: g('title'), plot: g('plot'), year: g('year'), rating: g('rating'), runtime: g('runtime') };
    } catch (err) { return null; }
  }
  async playlistText(e) { return fetchText(this.origin + e.path, { auth: this.auth, timeout: 60000 }); }
  get rootPath() { return this.root; }
}
