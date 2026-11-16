import { M3USource } from './m3u.js';
import { XtreamSource } from './xtream.js';
import { DavSource } from './dav.js';
import { LocalSource } from './local.js';
import { DlnaSource } from './dlna.js';
import { tr } from '../core/i18n.js';

const live = {};
export function createSource(cfg) {
  if (live[cfg.id] && live[cfg.id].cfg === cfg) return live[cfg.id];
  let s;
  switch (cfg.type) {
    case 'xtream': s = new XtreamSource(cfg); break;
    case 'm3u': case 'm3ufile': s = new M3USource(cfg); break;
    case 'webdav': case 'http': s = new DavSource(cfg); break;
    case 'local': s = new LocalSource(cfg); break;
    case 'dlna': s = new DlnaSource(cfg); break;
    default: throw new Error(tr('Tipo sorgente sconosciuto: ') + cfg.type);
  }
  live[cfg.id] = s;
  return s;
}
export function forget(id) { delete live[id]; }
export const FILE_TYPES = { webdav: 1, http: 1, local: 1, dlna: 1 };
export function isFileType(t) { return !!FILE_TYPES[t]; }
export const TYPE_LABEL = { m3u: tr('Playlist M3U (URL)'), m3ufile: tr('Playlist M3U (file)'), xtream: 'Xtream API', webdav: 'NAS - WebDAV', http: tr('NAS - Indice HTTP'), local: tr('Cartella del computer / NAS montato'), dlna: 'Server DLNA/UPnP' };
