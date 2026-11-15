// Cartella del computer o condivisione di rete già montata dal sistema (SMB/NFS/UNC): solo desktop
import { kindOf, parseNfo, sortEntries, toFileUrl } from './shared.js';

function sep(p) { return /\\/.test(p) && !/\//.test(p) ? '\\' : '/'; }

export class LocalSource {
  constructor(cfg) { this.cfg = cfg; this.kind = 'files'; }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }
  get rootPath() { return this.cfg.path; }
  dirPath(e) { return e.path; }

  async test() { const r = await this.list(this.cfg.path); return r.length + ' elementi'; }

  async list(dir) {
    if (!window.desktop) throw new Error('Le cartelle locali richiedono l\'app per computer');
    const raw = await window.desktop.listDir(dir);
    const s = sep(dir), base = dir.replace(/[\\/]+$/, '');
    let entries = raw.map(r => ({ name: r.name, path: base + s + r.name, dir: r.dir, kind: kindOf(r.name, r.dir), size: r.size || 0, date: r.mtime ? new Date(r.mtime).toLocaleDateString() : '' }));
    const files = {}; entries.forEach(e => { files[e.name.toLowerCase()] = e; });
    entries.forEach(e => {
      if (e.kind !== 'video') return;
      const stem = e.name.replace(/\.[^.]+$/, '').toLowerCase();
      const p = files[stem + '-poster.jpg'] || files[stem + '.jpg'] || files[stem + '-poster.png'] || files[stem + '.png'] || files['poster.jpg'] || files['folder.jpg'];
      if (p) e.poster = toFileUrl(p.path);
      const n = files[stem + '.nfo']; if (n) e.nfo = n.path;
    });
    entries = entries.filter(e => e.kind === 'dir' || e.kind === 'video' || e.kind === 'audio' || e.kind === 'playlist');
    return sortEntries(entries);
  }

  fileUrl(e) { return toFileUrl(e.path); }
  async nfo(e) { if (!e.nfo) return null; try { return parseNfo(await window.desktop.readText(e.nfo)); } catch (err) { return null; } }
  async playlistText(e) { return window.desktop.readText(e.path); }
}
