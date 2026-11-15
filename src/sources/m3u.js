// Sorgente playlist M3U (URL oppure file importato dal telefono/NAS)
import { fetchText } from '../core/net.js';
import { parseM3U, buildCatalogFromM3U } from '../core/parsers.js';
import { idbGet, idbSet, cached } from '../core/store.js';

export class M3USource {
  constructor(cfg) { this.cfg = cfg; this.kind = 'media'; this.cat = null; this.epgUrl = cfg.epgUrl || ''; }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }

  async _text() {
    if (this.cfg.type === 'm3ufile') {
      const t = await idbGet('file:' + this.cfg.id);
      if (!t) throw new Error('Playlist importata non trovata, reimportala');
      return t;
    }
    return fetchText(this.cfg.url, { timeout: 90000 });
  }

  async _build(onProgress) {
    const text = await this._text();
    const p = await parseM3U(text, onProgress);
    const cat = buildCatalogFromM3U(p.entries);
    cat.epgUrl = p.epgUrl;
    return cat;
  }

  async init(onProgress, force) {
    // cache del catalogo già elaborato -> avvio rapido, aggiornamento in background
    const key = 'src:' + this.id + ':cat';
    const cat = await cached(key, 6 * 3600000, () => this._build(onProgress), force);
    this.cat = cat;
    if (!this.epgUrl) this.epgUrl = cat.epgUrl || '';
    return this;
  }

  async test() {
    const cat = await this._build();
    return cat.live.items.length + ' canali, ' + cat.movies.items.length + ' film, ' + cat.series.items.length + ' serie';
  }

  async live() { return this.cat.live; }
  async vodCats() { return this.cat.movies.cats; }
  async vodItems(catId) { return catId ? this.cat.movies.items.filter(i => i.group === catId) : this.cat.movies.items; }
  async vodInfo(item) { return { plot: '', year: '', rating: '', genre: item.group, duration: 0 }; }
  async seriesCats() { return this.cat.series.cats; }
  async seriesItems(catId) { return catId ? this.cat.series.items.filter(i => i.group === catId) : this.cat.series.items; }
  async seriesInfo(show) {
    const seasons = [];
    for (const sn in show.seasons) {
      const eps = show.seasons[sn].slice().sort((a, b) => a.num - b.num);
      seasons.push({ n: +sn, episodes: eps.map(e => ({ id: e.id, num: e.num, title: e.title, url: e.url, plot: '', duration: 0, img: '' })) });
    }
    seasons.sort((a, b) => a.n - b.n);
    return { info: { plot: '', genre: show.group }, seasons: seasons };
  }
  urlFor(item) { return item.url; }
  async shortEpg() { return null; }
}
