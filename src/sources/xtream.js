// Sorgente Xtream Codes API (player_api.php)
import { fetchJSON } from '../core/net.js';
import { cached, settings } from '../core/store.js';
import { b64utf8 } from '../core/util.js';
import { tr } from '../core/i18n.js';

function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(k => x[k]) : []); }

export class XtreamSource {
  constructor(cfg) {
    this.cfg = cfg; this.kind = 'media';
    this.base = cfg.url.replace(/\/+$/, '').replace(/\/player_api\.php.*$/, '');
    this.u = encodeURIComponent(cfg.user || ''); this.p = encodeURIComponent(cfg.pass || '');
    this.memo = {};
    this.epgUrl = cfg.epgMode === 'xmltv' ? this.base + '/xmltv.php?username=' + this.u + '&password=' + this.p : (cfg.epgUrl || '');
  }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }

  api(action, extra) {
    let url = this.base + '/player_api.php?username=' + this.u + '&password=' + this.p;
    if (action) url += '&action=' + action;
    if (extra) for (const k in extra) url += '&' + k + '=' + encodeURIComponent(extra[k]);
    return fetchJSON(url, { timeout: 60000 });
  }
  // memo + cache persistente
  _c(key, ttl, fn) {
    if (this.memo[key]) return this.memo[key];
    return (this.memo[key] = cached('src:' + this.id + ':' + key, ttl, fn).catch(e => { delete this.memo[key]; throw e; }));
  }

  async init() {
    const info = await this.api();
    if (!info || !info.user_info) throw new Error(tr('Risposta Xtream non valida'));
    if (info.user_info.auth === 0) throw new Error(tr('Credenziali non valide'));
    this.info = info;
    const u = info.user_info;
    if (u.status && /disabled|banned|expired/i.test(u.status)) throw new Error(tr('Account ') + u.status.toLowerCase() + tr(': contatta il provider'));
    if (u.exp_date && u.exp_date !== 'null' && u.exp_date * 1000 < Date.now()) throw new Error(tr('Abbonamento scaduto il ') + new Date(u.exp_date * 1000).toLocaleDateString());
    const max = +u.max_connections || 0, act = +u.active_cons || 0;
    this.limit = max && act >= max ? { active: act, max: max } : null; // connessioni esaurite: il provider potrebbe rifiutare nuovi flussi
    return this;
  }

  async test() {
    const i = await this.api();
    if (!i || !i.user_info) throw new Error(tr('Server non Xtream'));
    const u = i.user_info;
    if (u.auth === 0) throw new Error(tr('Credenziali non valide'));
    const exp = u.exp_date && u.exp_date !== 'null' ? new Date(u.exp_date * 1000).toLocaleDateString() : 'illimitata';
    return tr('Account ') + (u.status || 'ok') + tr(', scade: ') + exp + tr(', connessioni: ') + (u.active_cons || 0) + '/' + (u.max_connections || '?');
  }

  // ---- live
  async live() {
    return this._c('live', 6 * 3600000, async () => {
      const [cats, streams] = await Promise.all([this.api('get_live_categories'), this.api('get_live_streams')]);
      const cm = {}; const cc = arr(cats).map(c => { cm[c.category_id] = c.category_name; return { id: c.category_name, name: c.category_name, count: 0 }; });
      const cnt = {};
      const items = arr(streams).map((s, i) => {
        const g = cm[s.category_id] || tr('Altro'); cnt[g] = (cnt[g] || 0) + 1;
        return { id: String(s.stream_id), name: s.name || '', logo: s.stream_icon || '', group: g, num: String(s.num || i + 1), epgId: s.epg_channel_id || '', arch: s.tv_archive ? 1 : 0 };
      });
      cc.forEach(c => c.count = cnt[c.name] || 0);
      return { cats: cc.filter(c => c.count > 0), items: items };
    });
  }
  async shortEpg(ch, limit) {
    try {
      const r = await this.api('get_short_epg', { stream_id: ch.id, limit: limit || 5 });
      return arr(r.epg_listings).map(e => [
        (+e.start_timestamp) * 1000, (+e.stop_timestamp) * 1000, b64utf8(e.title || ''), b64utf8(e.description || '').slice(0, 400)
      ]);
    } catch (e) { return null; }
  }

  // ---- film
  vodCats() {
    return this._c('vcats', 12 * 3600000, async () => arr(await this.api('get_vod_categories')).map(c => ({ id: c.category_id, name: c.category_name })));
  }
  vodItems(catId) {
    return this._c('vod:' + (catId || 'all'), 6 * 3600000, async () => arr(await this.api('get_vod_streams', catId ? { category_id: catId } : null)).map(s => ({
      id: String(s.stream_id), name: s.name || '', poster: s.stream_icon || '', rating: s.rating_5based ? (s.rating_5based * 2).toFixed(1) : (s.rating || ''),
      ext: s.container_extension || 'mp4', year: (s.year || '') + '', added: s.added, group: catId || ''
    })));
  }
  async vodInfo(item) {
    try {
      const r = await this.api('get_vod_info', { vod_id: item.id });
      const i = r.info || {};
      return {
        plot: i.plot || i.description || '', year: (i.releasedate || i.releaseDate || '').slice(0, 4) || item.year, rating: i.rating || item.rating,
        genre: i.genre || '', duration: i.duration_secs || 0, cast: i.cast || i.actors || '', director: i.director || '',
        backdrop: arr(i.backdrop_path)[0] || '', poster: i.movie_image || item.poster
      };
    } catch (e) { return { plot: '' }; }
  }

  // ---- serie
  seriesCats() {
    return this._c('scats', 12 * 3600000, async () => arr(await this.api('get_series_categories')).map(c => ({ id: c.category_id, name: c.category_name })));
  }
  seriesItems(catId) {
    return this._c('series:' + (catId || 'all'), 6 * 3600000, async () => arr(await this.api('get_series', catId ? { category_id: catId } : null)).map(s => ({
      id: String(s.series_id), name: s.name || '', poster: s.cover || '', plot: String(s.plot || '').slice(0, 300), rating: s.rating_5based ? (s.rating_5based * 2).toFixed(1) : (s.rating || ''),
      year: (s.releaseDate || s.release_date || '').slice(0, 4), genre: s.genre || '', group: catId || '', added: s.last_modified
    })));
  }
  async seriesInfo(show) {
    const r = await this.api('get_series_info', { series_id: show.id });
    const i = r.info || {};
    const seasons = [];
    const eps = r.episodes || {};
    for (const sn in eps) {
      seasons.push({
        n: +sn, episodes: arr(eps[sn]).map(e => ({
          id: String(e.id), num: +e.episode_num, title: e.title || (tr('Episodio ') + e.episode_num), ext: e.container_extension || 'mp4',
          plot: (e.info && e.info.plot) || '', duration: (e.info && e.info.duration_secs) || 0, img: (e.info && e.info.movie_image) || ''
        }))
      });
    }
    seasons.sort((a, b) => a.n - b.n);
    return { info: { plot: i.plot || show.plot, genre: i.genre || show.genre, cast: i.cast, director: i.director, year: (i.releaseDate || '').slice(0, 4) || show.year, rating: i.rating || show.rating, backdrop: arr(i.backdrop_path)[0] || '', poster: i.cover || show.poster }, seasons: seasons };
  }

  // ---- URL di riproduzione
  urlFor(item, kind) {
    const b = this.base + '/';
    const cred = this.cfg.user ? encodeURIComponent(this.cfg.user) + '/' + encodeURIComponent(this.cfg.pass || '') + '/' : '';
    if (kind === 'live') return b + 'live/' + cred + item.id + '.' + (settings().liveFormat === 'ts' ? 'ts' : 'm3u8');
    if (kind === 'live-alt') return b + 'live/' + cred + item.id + '.' + (settings().liveFormat === 'ts' ? 'm3u8' : 'ts');
    if (kind === 'series') return b + 'series/' + cred + item.id + '.' + (item.ext || 'mp4');
    return b + 'movie/' + cred + item.id + '.' + (item.ext || 'mp4');
  }
}
