// Test VOD su Electron: server con Range, senza Range, HEVC+AC3 -> convertitore ffmpeg, seek
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
const M = path.join(__dirname, 'media');
const send = (req, res2, file, mime, range) => {
  const st = fs.statSync(file);
  if (range && req.headers.range) {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range); const a = +m[1], b = m[2] ? +m[2] : st.size - 1;
    res2.writeHead(206, { 'Content-Type': mime, 'Content-Range': 'bytes ' + a + '-' + b + '/' + st.size, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(file, { start: a, end: b }).pipe(res2);
  }
  res2.writeHead(200, range ? { 'Content-Type': mime, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' } : { 'Content-Type': mime });  // senza Range: niente Accept-Ranges, niente Content-Length (chunked)
  fs.createReadStream(file).pipe(res2);
};
const srv = http.createServer((req, res2) => {
  if (req.url.indexOf('/range.mp4') === 0) return send(req, res2, M + '/movie.mp4', 'video/mp4', true);
  if (req.url.indexOf('/norange.mp4') === 0) return send(req, res2, M + '/movie.mp4', 'video/mp4', false);
  if (req.url.indexOf('/hevc.mkv') === 0) return send(req, res2, M + '/hevc-ac3.mkv', 'video/x-matroska', true);
  res2.writeHead(404); res2.end();
}).listen(9301);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tvp-ud-'));
(async () => {
  const xv = spawn('Xvfb', [':81', '-screen', '0', '1600x900x24'], { stdio: 'ignore' }); await sleep(800);
  const el = spawn(path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron'), ['.', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9334', '--user-data-dir=' + userData],
    { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { DISPLAY: ':81' }), stdio: 'ignore' });
  const done = c => { try { el.kill(); xv.kill(); srv.close(); } catch (e) { /* */ } process.exit(c); };
  let browser; for (let i = 0; i < 30 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9334', defaultViewport: null }); } catch (e) { await sleep(500); } }
  let page; for (let i = 0; i < 20; i++) { page = (await browser.pages()).find(p => /index\.html/.test(p.url())); if (page) break; await sleep(300); }
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await sleep(1200);
  const wait = async (fn, ms) => { try { await page.waitForFunction(fn, { timeout: ms || 15000, polling: 200 }); return true; } catch (e) { return false; } };
  const state = () => page.evaluate(() => { const c = window.__app.router.current, e = c.engine, v = c.video; return { ff: e.ff ? { v: e.ff.v, dur: Math.round(e.ff.dur), off: Math.round(e.ff.off) } : null, t: +e.time().toFixed(1), d: Math.round(e.duration() || 0), paused: v.paused, eng: e.attempts[e.ai] && e.attempts[e.ai].eng, fails: e.fails.join(' | '), msg: (c.msg.textContent || '') }; });
  const play = async url => { await page.evaluate(u => { window.__app.playUrl(u, 'T'); }, url); };
  const close = async () => { await page.keyboard.press('Escape'); await sleep(700); };

  // 1. server con Range: lettore nativo, seek nativo
  await play('http://localhost:9301/range.mp4');
  ok('MP4 con Range parte (nativo)', await wait(() => window.__app.router.current.video.currentTime > 0.8));
  let s = await state(); ok('  senza convertitore', !s.ff && s.eng === 'native', JSON.stringify(s));
  await page.evaluate(() => window.__app.router.current.engine.seekTo(12)); await sleep(1500);
  s = await state(); ok('  seek nativo a 12 s', s.t >= 12 && s.t < 16, 't=' + s.t);
  await close();

  // 2. server SENZA Range: timeline non scorrevole -> convertitore
  await play('http://localhost:9301/norange.mp4');
  const started = await wait(() => { const c = window.__app.router.current; return c.engine.time() > 0.8; }, 25000);
  await sleep(1500); s = await state();
  ok('MP4 senza Range parte', started, JSON.stringify(s));
  ok('  rilevato "timeline non scorrevole" -> convertitore attivo', !!s.ff && s.d >= 19, JSON.stringify(s));
  await page.evaluate(() => window.__app.router.current.engine.seekTo(11)); 
  const sk = await wait(() => window.__app.router.current.engine.time() >= 11 && !window.__app.router.current.video.paused, 20000); s = await state();
  ok('  seek a 11 s funziona', sk && s.t >= 11 && s.t < 16, JSON.stringify(s));
  // clic sulla barra di avanzamento a ~80%
  await page.evaluate(() => { const b = document.querySelector('.pseekbar'); const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.8, clientY: r.top + 2 })); });
  const sk2 = await wait(() => window.__app.router.current.engine.time() >= 15.5, 20000); s = await state();
  ok('  clic sulla barra (80%) salta in avanti', sk2, JSON.stringify(s));
  await page.screenshot({ path: '/tmp/shots3/v-norange.png' });
  await close();

  // 3. HEVC + AC3 in MKV
  await play('http://localhost:9301/hevc.mkv');
  const st3 = await wait(() => window.__app.router.current.engine.time() > 0.8, 40000); await sleep(800); s = await state();
  ok('HEVC+AC3 (MKV) parte tramite convertitore', st3 && !!s.ff && s.ff.v === 'tx', JSON.stringify(s));
  await page.evaluate(() => window.__app.router.current.engine.seekTo(9)); const sk3 = await wait(() => window.__app.router.current.engine.time() >= 9, 30000);
  ok('  seek anche qui', sk3, JSON.stringify(await state()));
  await close();

  // 4. impostazione "Mai": niente convertitore, errore con dettagli
  await page.evaluate(() => { window.__app.store.settings().transcode = 'never'; });
  await play('http://localhost:9301/hevc.mkv');
  await wait(() => /Impossibile/.test(window.__app.router.current.msg.textContent), 30000); s = await state();
  ok('con "Mai": errore chiaro con dettagli', /Impossibile/.test(s.msg) && /Dettagli: errore/.test(s.msg), s.msg);
  await close();
  await page.evaluate(() => { window.__app.store.settings().transcode = 'auto'; });
  ok('nessun errore JS', errs.length === 0, errs.join(';'));
  console.log(res.filter(Boolean).length + '/' + res.length + ' superati');
  done(res.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
