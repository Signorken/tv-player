// Chiavette e dischi USB collegati alla TV.
//  - Android: tramite il plugin MaxSystem (accesso concesso una volta per chiavetta dalla finestra di sistema), file content://
//  - Samsung Tizen: tramite tizen.filesystem (memorie "removable"), file file:// riprodotti da AVPlay
import { kindOf, sortEntries } from './shared.js';
import { Android } from '../core/android.js';
import { tr } from '../core/i18n.js';

const keep = e => e.kind === 'dir' || e.kind === 'video' || e.kind === 'audio';

export class AndroidUsbSource {
  constructor(cfg) { this.cfg = cfg; this.kind = 'files'; }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }
  get rootPath() { return ''; }
  dirPath(e) { return e.doc; }
  async list(doc) {
    const items = await Android.usbList(this.cfg.tree, doc);
    return sortEntries(items.map(it => ({ name: it.name, doc: it.doc, path: it.doc, uri: it.uri, dir: it.dir, kind: kindOf(it.name, it.dir), size: it.size || 0, date: it.mtime ? new Date(it.mtime).toLocaleDateString() : '' })).filter(keep));
  }
  fileUrl(e) { return e.uri; }
  async nfo() { return null; }
  async playlistText() { throw new Error(tr('Le playlist su chiavetta non sono supportate')); }
}

// ---- Samsung Tizen
const tfs = () => window.tizen && window.tizen.filesystem;
export function tizenUsbAvailable() { return !!tfs(); }
export function tizenUsbVolumes() {
  return new Promise(res => {
    try {
      tfs().listStorages(list => res((list || []).filter(s => s.type === 'EXTERNAL' && s.state === 'MOUNTED').map(s => ({ id: s.label, name: s.label.replace(/^removable_?/i, 'USB ').replace(/_/g, ' ') }))), () => res([]));
    } catch (e) { res([]); }
  });
}
export function tizenOnUsb(cb) { try { tfs().addStorageStateChangeListener(() => cb()); } catch (e) { /* */ } }

export class TizenUsbSource {
  constructor(cfg) { this.cfg = cfg; this.kind = 'files'; }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }
  get rootPath() { return this.cfg.label; }
  dirPath(e) { return e.path; }
  list(path) {
    return new Promise((res, rej) => {
      try {
        tfs().resolve(path, dir => {
          dir.listFiles(files => {
            res(sortEntries(files.map(f => ({ name: f.name, path: path + '/' + f.name, uri: f.toURI(), dir: f.isDirectory, kind: kindOf(f.name, f.isDirectory), size: f.fileSize || 0, date: f.modified ? f.modified.toLocaleDateString() : '' })).filter(keep)));
          }, e => rej(new Error(e && e.message || 'USB')));
        }, e => rej(new Error(e && e.message || 'USB')), 'r');
      } catch (e) { rej(e); }
    });
  }
  fileUrl(e) { return e.uri; }
  async nfo() { return null; }
  async playlistText() { throw new Error(tr('Le playlist su chiavetta non sono supportate')); }
}
