// Server dimostrativo (porta 9110) per gli screenshot del README: account Xtream di fantasia con
// canali, film e serie inventati e locandine generate (docs/demo). I flussi video sono quelli di test/mock.js (porta 9100).
const http = require('http'), fs = require('fs'), path = require('path');
const D = require('../docs/demo/data.json'), IMG = path.join(__dirname, '..', 'docs', 'demo', 'img');
const HOST = 'http://localhost:9110', MOCK = 'http://localhost:9100';
const now = () => Math.floor(Date.now() / 1000);
const PROG = ['Telegiornale', 'Il caffè del mattino', 'Viaggio in Italia', 'Cucina di casa', 'Grande cinema', 'Speciale sport', 'Documentario: Oceani', 'Musica live', 'Cartoni animati', 'Meteo'];
const live = [];
D.chans.forEach((c, i) => live.push({ num: i + 1, name: c[0], stream_id: i + 1, stream_icon: HOST + '/img/c' + i + '.png', category_id: c[1], epg_channel_id: 'c' + i }));
for (let i = live.length; i < 180; i++) live.push({ num: i + 1, name: 'Canale ' + (i + 1), stream_id: i + 1, stream_icon: HOST + '/img/c' + (i % 12) + '.png', category_id: ['Generalisti', 'Notizie', 'Cinema', 'Musica'][i % 4] });
const lcats = Array.from(new Set(live.map(x => x.category_id))).map(n => ({ category_id: n, category_name: n }));
const vcats = [{ category_id: 'az', category_name: 'Azione' }, { category_id: 'dr', category_name: 'Drammatico' }, { category_id: 'co', category_name: 'Commedia' }];
const scats = [{ category_id: 'dr', category_name: 'Drammatico' }, { category_id: 'gi', category_name: 'Gialli' }];
const vod = D.movies.map((n, i) => ({ stream_id: 500 + i, name: n, stream_icon: HOST + '/img/m' + i + '.jpg', rating_5based: 3 + (i % 5) * 0.4, container_extension: 'mp4', year: String(2015 + i % 10), category_id: vcats[i % 3].category_id, added: String(now() - i * 86400) }));
const ser = D.series.map((n, i) => ({ series_id: 700 + i, name: n, cover: HOST + '/img/s' + i + '.jpg', plot: 'Una serie originale di fantasia per la demo di MAXENTA.', rating_5based: 4, releaseDate: String(2018 + i) + '-01-01', genre: 'Drammatico', category_id: scats[i % 2].category_id, last_modified: String(now() - i * 43200) }));
function api(q) {
  const a = q.get('action'), cat = q.get('category_id');
  if (!a) return { user_info: { auth: 1, status: 'Active', exp_date: String(now() + 86400 * 200), max_connections: '2', active_cons: '0' }, server_info: { url: 'demo' } };
  if (a === 'get_live_categories') return lcats;
  if (a === 'get_live_streams') return live;
  if (a === 'get_short_epg') { const id = +q.get('stream_id'), t = now() - 1500; return { epg_listings: [0, 1, 2].map(k => ({ title: Buffer.from(PROG[(id + k) % PROG.length]).toString('base64'), description: Buffer.from('In onda su ' + (live[id - 1] || {}).name).toString('base64'), start_timestamp: String(t + k * 3600), stop_timestamp: String(t + (k + 1) * 3600) })) }; }
  if (a === 'get_vod_categories') return vcats;
  if (a === 'get_vod_streams') return cat ? vod.filter(x => x.category_id === cat) : vod;
  if (a === 'get_vod_info') return { info: { plot: 'Un racconto di fantasia creato per mostrare la scheda dei film di MAXENTA: trama, cast, durata e valutazione.', releasedate: '2022-03-10', rating: '7.8', genre: 'Avventura, Dramma', duration_secs: 6300, cast: 'Attori di fantasia', director: 'Regia demo' } };
  if (a === 'get_series_categories') return scats;
  if (a === 'get_series') return cat ? ser.filter(x => x.category_id === cat) : ser;
  if (a === 'get_series_info') return { info: { plot: 'Una serie originale di fantasia per la demo di MAXENTA.', genre: 'Drammatico', rating: '8.2', releaseDate: '2021-01-01' }, episodes: { 1: [1, 2, 3, 4].map(n => ({ id: String(950 + n), episode_num: n, title: 'Episodio ' + n, container_extension: 'mp4', info: { plot: 'Trama dell\'episodio ' + n, duration_secs: 2700 } })) } };
  return [];
}
http.createServer((req, res) => {
  const u = new URL(req.url, HOST), p = u.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (p === '/player_api.php') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(api(u.searchParams))); }
  const m = /^\/img\/([\w.]+)$/.exec(p);
  if (m && fs.existsSync(path.join(IMG, m[1]))) { res.writeHead(200, { 'Content-Type': /png$/.test(m[1]) ? 'image/png' : 'image/jpeg' }); return fs.createReadStream(path.join(IMG, m[1])).pipe(res); }
  // dirette: breve video dimostrativo (docs/demo/hls)
  let hm;
  if (/^\/live\/[^/]+\/[^/]+\/\d+\.(m3u8|ts)$/.test(p)) { const t = fs.readFileSync(path.join(__dirname, '..', 'docs', 'demo', 'hls', 'index.m3u8'), 'utf8').replace(/^(index\d+\.ts)$/gm, HOST + '/hls/$1'); res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); return res.end(t); }
  if ((hm = /^\/hls\/(index\d+\.ts)$/.exec(p))) { res.writeHead(200, { 'Content-Type': 'video/mp2t' }); return fs.createReadStream(path.join(__dirname, '..', 'docs', 'demo', 'hls', hm[1])).pipe(res); }
  // film ed episodi: quelli del server di prova
  res.writeHead(302, { Location: MOCK + req.url.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\/\d+/, (x, k) => '/' + k + '/u/p/' + (k === 'live' ? '1' : '900')) }); res.end();
}).listen(9110, () => console.log('demo su ' + HOST));
