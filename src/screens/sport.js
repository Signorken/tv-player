// Sport: dirette sportive + eventi/film/serie on demand riconosciuti per nome del gruppo.
import * as Modal from '../ui/modal.js';
import { router } from '../core/router.js';
import { showLoading, hideLoading } from '../core/session.js';
import { isSportChannel, isSportGroup } from '../core/sport.js';
import { LiveScreen } from './live.js';
import { VodScreen } from './vod.js';
import { tr } from '../core/i18n.js';

export async function openSport(src) {
  showLoading(tr('Ricerca contenuti sportivi…'), src.name);
  let nLive = 0, nMov = 0, nSer = 0;
  try {
    const r = await Promise.all([
      src.live().then(l => l.items.filter(isSportChannel).length).catch(() => 0),
      Promise.resolve().then(() => src.vodCats()).then(c => c.filter(x => isSportGroup(x.name)).length).catch(() => 0),
      Promise.resolve().then(() => src.seriesCats()).then(c => c.filter(x => isSportGroup(x.name)).length).catch(() => 0)]);
    nLive = r[0]; nMov = r[1]; nSer = r[2];
  } finally { hideLoading(); }
  if (!nLive && !nMov && !nSer) { Modal.toast(tr('Nessun contenuto sportivo trovato in questa sorgente'), 5000); return; }
  const items = [];
  if (nLive) items.push({ label: tr('Dirette sportive'), sub: nLive + tr(' canali'), value: 'live', icon: 'tv' });
  if (nMov) items.push({ label: tr('Eventi on demand'), sub: nMov + tr(' categorie'), value: 'movie', icon: 'film' });
  if (nSer) items.push({ label: tr('Programmi e serie sportive'), sub: nSer + tr(' categorie'), value: 'series', icon: 'series' });
  const v = await Modal.menu('Sport', items);
  if (!v) return;
  if (v === 'live') router.push(new LiveScreen(src, { sport: true }));
  else router.push(new VodScreen(src, v, { sport: true }));
}
