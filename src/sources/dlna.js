// Server multimediale DLNA/UPnP (ContentDirectory) — l'accesso di rete avviene nel processo principale di Electron
export class DlnaSource {
  constructor(cfg) { this.cfg = cfg; this.kind = 'files'; }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }
  get rootPath() { return '0'; }
  dirPath(e) { return e.path; }

  async test() { const r = await this.list('0'); return r.length + ' elementi nella radice'; }

  async list(id) {
    if (!window.desktop) throw new Error('DLNA richiede l\'app per computer');
    const items = await window.desktop.dlnaBrowse(this.cfg.control, id);
    return items.map(i => ({
      name: i.title, path: i.id, dir: i.dir,
      kind: i.dir ? 'dir' : (/^video/.test(i.mime) ? 'video' : /^audio/.test(i.mime) ? 'audio' : 'other'),
      size: i.size || 0, date: i.duration || '', poster: i.art || '', url: i.url || '', plot: i.desc || ''
    })).filter(e => e.kind === 'dir' || e.kind === 'video' || e.kind === 'audio');
  }
  fileUrl(e) { return e.url; }
  async nfo() { return null; }
  async playlistText() { return ''; }
}
