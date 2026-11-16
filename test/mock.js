// Server di prova SENZA header CORS (come molti server IPTV/NAS reali): M3U, Xtream, XMLTV, WebDAV, indice HTTP, HLS e MP4.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.MOCK_PORT || 9100;
const M = path.join(__dirname, 'media');
const HOST = 'http://localhost:' + PORT;

function xmltvTime(t) { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + ' +0000'; }

function epg() {
  const now = Date.now(); const base = Math.floor(now / 1800000) * 1800000 - 3600000;
  let x = '<?xml version="1.0" encoding="UTF-8"?><tv>';
  ['rai1', 'tg24', 'mtv'].forEach((id, k) => { x += '<channel id="' + id + '"><display-name>' + ['Rai 1', 'Tg 24', 'MTV'][k] + '</display-name></channel>'; });
  ['rai1', 'tg24', 'mtv'].forEach((id, k) => {
    for (let i = 0; i < 8; i++) {
      const s = base + i * 1800000, e = s + 1800000;
      x += '<programme start="' + xmltvTime(s) + '" stop="' + xmltvTime(e) + '" channel="' + id + '"><title lang="it">' + ['Telegiornale', 'Il Commissario &amp; Co.', 'Quiz della sera', 'Film: La grande fuga'][ (i + k) % 4] + ' ' + (i + 1) + '</title><desc lang="it">Descrizione di prova per il programma numero ' + (i + 1) + ' del canale ' + id + '. Una trama abbastanza lunga per verificare il ritaglio del testo nel pannello di anteprima.</desc></programme>';
    }
  });
  return x + '</tv>';
}

function m3u() {
  const t = HOST + '/hls/1/index.m3u8', t2 = HOST + '/hls/2/index.m3u8';
  let s = '#EXTM3U url-tvg="' + HOST + '/epg.xml"\n';
  s += '#EXTINF:-1 tvg-id="rai1" tvg-logo="' + HOST + '/img/l1.png" group-title="Generalisti",Rai 1 HD\n' + t + '\n';
  s += '#EXTINF:-1 tvg-id="tg24" tvg-logo="' + HOST + '/img/l2.png" group-title="Notizie",Tg 24\n' + t2 + '\n';
  s += '#EXTINF:-1 tvg-id="mtv" tvg-logo="' + HOST + '/img/l3.png" group-title="Musica",MTV\n' + t + '\n';
  for (let i = 1; i <= 40; i++) s += '#EXTINF:-1 group-title="Extra",Canale prova ' + i + '\n' + (i % 2 ? t : t2) + '\n';
  s += '#EXTINF:5400 tvg-logo="' + HOST + '/img/p1.jpg" group-title="Film",Il grande film di prova\n' + HOST + '/movie/u/p/900.mp4\n';
  s += '#EXTINF:2400 tvg-logo="' + HOST + '/img/p2.jpg" group-title="Serie",Serie Demo S01E01 Pilota\n' + HOST + '/series/u/p/901.mp4\n';
  s += '#EXTINF:2400 tvg-logo="' + HOST + '/img/p2.jpg" group-title="Serie",Serie Demo S01E02 Secondo\n' + HOST + '/series/u/p/902.mp4\n';
  return s;
}

// Xtream
function xtream(q) {
  const a = q.get('action');
  const cats = [{ category_id: '1', category_name: 'Italia' }, { category_id: '2', category_name: 'Sport' }, { category_id: '3', category_name: 'Bambini' }];
  if (!a) return { user_info: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 90), max_connections: '2', active_cons: '0' }, server_info: { url: 'localhost' } };
  if (a === 'get_live_categories') return cats;
  if (a === 'get_live_streams') { const o = []; for (let i = 1; i <= 3000; i++) o.push({ num: i, name: 'Canale ' + i + (i % 7 === 0 ? ' Sport' : ''), stream_id: i, stream_icon: HOST + '/img/l' + (i % 3 + 1) + '.png', epg_channel_id: i === 1 ? 'rai1' : '', category_id: String(i % 3 + 1) }); return o; }
  if (a === 'get_short_epg') { const now = Math.floor(Date.now() / 1000); return { epg_listings: [0, 1, 2].map(i => ({ title: Buffer.from('Programma ' + (i + 1) + ' su canale ' + q.get('stream_id')).toString('base64'), description: Buffer.from('Trama del programma ' + (i + 1)).toString('base64'), start_timestamp: String(now - 600 + i * 1800), stop_timestamp: String(now + 1200 + i * 1800) })) }; }
  // utente "ml": il provider ha anche la categoria "La mia lista" (salvata dal suo portale)
  const ml = q.get('username') === 'ml';
  if (a === 'get_vod_categories') return cats.slice(0, 2).concat(ml ? [{ category_id: '9', category_name: 'La Mia Lista' }] : []);
  if (a === 'get_vod_streams' && q.get('category_id') === '9') return [5, 7].map(i => ({ stream_id: 800 + i, name: 'Film numero ' + i, stream_icon: HOST + '/img/p' + (i % 4 + 1) + '.jpg', rating_5based: 3.5, container_extension: 'mp4', category_id: '9' }));
  if (a === 'get_series_categories' && ml) return cats.slice(0, 1).concat([{ category_id: '9', category_name: '★ My List' }]);
  if (a === 'get_series' && q.get('category_id') === '9') return [{ series_id: 77, name: 'La serie di prova', cover: HOST + '/img/p3.jpg', category_id: '9' }];
  if (a === 'get_vod_streams') { const o = []; for (let i = 1; i <= 60; i++) o.push({ stream_id: 800 + i, name: 'Film numero ' + i, stream_icon: HOST + '/img/p' + (i % 4 + 1) + '.jpg', rating_5based: 3.5, container_extension: 'mp4', year: '20' + (10 + i % 14), category_id: String(i % 2 + 1) }); return q.get('category_id') ? o.filter(x => x.category_id === q.get('category_id')) : o; }
  if (a === 'get_vod_info') return { info: { plot: 'Un film di prova con una trama molto avvincente: un eroe, un viaggio e un finale a sorpresa. Ideale per verificare la scheda informativa.', releasedate: '2021-05-12', rating: '7.4', genre: 'Avventura, Azione', duration_secs: 5400, cast: 'Mario Rossi, Anna Bianchi, Luca Verdi', director: 'Regista Prova' } };
  if (a === 'get_series_categories') return cats.slice(0, 1);
  if (a === 'get_series') return [{ series_id: 77, name: 'La serie di prova', cover: HOST + '/img/p3.jpg', plot: 'Una serie in due stagioni.', rating_5based: 4, releaseDate: '2019-01-01', genre: 'Drammatico', category_id: '1' }];
  if (a === 'get_series_info') return { info: { plot: 'Una serie in due stagioni per provare navigazione e riproduzione degli episodi.', genre: 'Drammatico', rating: '8', releaseDate: '2019-01-01' }, episodes: { 1: [1, 2, 3].map(n => ({ id: String(900 + n), episode_num: n, title: 'Episodio ' + n + ' - titolo', container_extension: 'mp4', info: { plot: 'Trama dell\'episodio ' + n, duration_secs: 1500 } })), 2: [1, 2].map(n => ({ id: String(910 + n), episode_num: n, title: 'Ritorno ' + n, container_extension: 'mp4', info: { duration_secs: 1500 } })) } };
  return [];
}

function range(req, res, file, type) {
  const st = fs.statSync(file); const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (r) { const s = r[1] ? +r[1] : 0, e = r[2] ? +r[2] : st.size - 1; res.writeHead(206, { 'Content-Type': type, 'Content-Range': 'bytes ' + s + '-' + e + '/' + st.size, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); fs.createReadStream(file, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size }); fs.createReadStream(file).pipe(res); }
}

const DAV = {
  '/dav/': [['Film/', 1], ['clip.mp4', 0, 2643834], ['lista-test.m3u', 0, 300]],
  '/dav/Film/': [['Dramma/', 1], ['bel film.mp4', 0, 2643834], ['bel film.nfo', 0, 200], ['bel film-poster.jpg', 0, 5000], ['altro.mkv', 0, 8123456]],
  '/dav/Film/Dramma/': [['uno.mp4', 0, 2643834]]
};

http.createServer((req, res) => {
  const u = new URL(req.url, HOST); const p = u.pathname;
  if (process.env.LOG) console.log(req.method, req.url);
  let m;
  if (p === '/version.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ version: '2.7.0', minShell: 1, apk: '2.7.0', apkUrl: HOST + '/MAXENTA-2.7.0-android-tv.apk' })); }
  if (p === '/list.m3u') { res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' }); return res.end(m3u()); }
  if (p === '/epg.xml') { res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end(epg()); }
  if (p === '/player_api.php') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(xtream(u.searchParams))); }
  if (p === '/xmltv.php') { res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end(epg()); }
  if ((m = /^\/hls\/(\d)\/(.+)$/.exec(p))) { const f = path.join(M, 'hls' + m[1], m[2]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } return range(req, res, f, /m3u8$/.test(f) ? 'application/vnd.apple.mpegurl' : 'video/mp2t'); }
  if ((m = /^\/live\/[^/]+\/[^/]+\/(\d+)\.m3u8$/.exec(p))) { let t = fs.readFileSync(path.join(M, 'hls1/index.m3u8'), 'utf8').replace(/^(seg\d+\.ts)$/gm, HOST + '/hls/1/$1'); res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); return res.end(t); }
  if (/^\/live\/[^/]+\/[^/]+\/\d+\.ts$/.test(p)) { res.writeHead(200, { 'Content-Type': 'video/mp2t' }); return fs.createReadStream(path.join(M, 'live.ts')).pipe(res); }
  if (/^\/(movie|series)\/[^/]+\/[^/]+\/\d+\.mp4$/.test(p)) return range(req, res, path.join(M, 'movie.mp4'), 'video/mp4');
  if ((m = /^\/img\/(.+)$/.exec(p))) { const f = path.join(M, 'img', m[1]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } return range(req, res, f, /png$/.test(f) ? 'image/png' : 'image/jpeg'); }
  // WebDAV
  if (p.indexOf('/dav/') === 0) {
    if (req.method === 'PROPFIND') {
      const dir = p.replace(/\/*$/, '/'); const ent = DAV[dir];
      if (!ent) { res.writeHead(404); return res.end(); }
      let x = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>' + dir + '</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>';
      ent.forEach(e => { x += '<d:response><d:href>' + dir + encodeURI(e[0]) + '</d:href><d:propstat><d:prop><d:displayname>' + e[0] + '</d:displayname>' + (e[1] ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/><d:getcontentlength>' + e[2] + '</d:getcontentlength><d:getlastmodified>Sat, 01 Mar 2025 10:00:00 GMT</d:getlastmodified>') + '</d:prop></d:propstat></d:response>'; });
      res.writeHead(207, { 'Content-Type': 'application/xml' }); return res.end(x + '</d:multistatus>');
    }
    const name = decodeURIComponent(p.split('/').pop());
    if (/\.mp4$|\.mkv$/.test(name)) return range(req, res, path.join(M, 'movie.mp4'), 'video/mp4');
    if (/\.jpg$/.test(name)) return range(req, res, path.join(M, 'img/p1.jpg'), 'image/jpeg');
    if (/\.nfo$/.test(name)) { res.writeHead(200); return res.end('<movie><title>Il bel film</title><plot>Trama letta dal file .nfo accanto al video, come fa Kodi.</plot><year>2020</year><rating>7.9</rating><runtime>98</runtime></movie>'); }
    if (/\.m3u$/.test(name)) { res.writeHead(200); return res.end(m3u()); }
    res.writeHead(404); return res.end();
  }
  // indice HTTP stile nginx
  if (p === '/files/' || p === '/files/Serie/') {
    const items = p === '/files/' ? ['Serie/', 'documentario.mp4', 'playlist.m3u'] : ['ep1.mp4', 'ep2.mp4'];
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html><body><h1>Index of ' + p + '</h1><hr><pre><a href="../">../</a>\n' + items.map(i => '<a href="' + i + '">' + i + '</a>                  01-Mar-2025 10:00      2643834').join('\n') + '</pre></body></html>');
  }
  if (p.indexOf('/files/') === 0) { if (/m3u$/.test(p)) { res.writeHead(200); return res.end(m3u()); } return range(req, res, path.join(M, 'movie.mp4'), 'video/mp4'); }
  res.writeHead(404); res.end('nf');
}).listen(PORT, () => console.log('mock su ' + HOST));
