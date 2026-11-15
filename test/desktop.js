// Test GUI della versione desktop: avvia Electron (xvfb), lo pilota via DevTools Protocol
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
const OUT = '/tmp/shots3'; fs.mkdirSync(OUT, { recursive: true });

// cartella locale di prova
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tvp-'));
fs.mkdirSync(path.join(tmp, 'Film', 'Azione'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'media', 'movie.mp4'), path.join(tmp, 'Film', 'bel film.mp4'));
fs.writeFileSync(path.join(tmp, 'Film', 'bel film.nfo'), '<movie><title>Il Bel Film</title><plot>Una trama di prova.</plot><year>2020</year></movie>');
fs.copyFileSync(path.join(__dirname, 'media', 'movie.mp4'), path.join(tmp, 'Film', 'Azione', 'uno.mp4'));
fs.writeFileSync(path.join(tmp, 'lista.m3u'), '#EXTM3U\n#EXTINF:-1,Prova\nhttp://localhost:9100/live.ts\n');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tvp-ud-'));

// server DLNA finto (SSDP non testabile nel sandbox: provo Browse SOAP + parser)
const dl = http.createServer((req, res2) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const id = (/<ObjectID>([^<]*)/.exec(b) || [])[1];
    const didl = id === '0'
      ? '<DIDL-Lite><container id="v" parentID="0"><dc:title>Video</dc:title></container></DIDL-Lite>'
      : '<DIDL-Lite><item id="i1" parentID="v"><dc:title>Clip DLNA</dc:title><res protocolInfo="http-get:*:video/mp4:*" size="2643834">http://localhost:9100/media/movie.mp4</res></item></DIDL-Lite>';
    const esc = didl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res2.writeHead(200, { 'Content-Type': 'text/xml' });
    res2.end('<?xml version="1.0"?><s:Envelope xmlns:s="x"><s:Body><u:BrowseResponse><Result>' + esc + '</Result><NumberReturned>1</NumberReturned><TotalMatches>1</TotalMatches></u:BrowseResponse></s:Body></s:Envelope>');
  });
}).listen(9200);

(async () => {
  const xv = spawn('Xvfb', [':77', '-screen', '0', '1600x900x24'], { stdio: 'ignore' });
  await sleep(800);
  const el = spawn(path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron'),
    ['.', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=' + userData],
    { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { DISPLAY: ':77' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; el.stdout.on('data', d => log += d); el.stderr.on('data', d => log += d);
  const done = async code => { try { el.kill(); xv.kill(); dl.close(); } catch (e) { /* */ } fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); };
  let browser;
  for (let i = 0; i < 30 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null }); } catch (e) { await sleep(500); } }
  if (!browser) { console.log('Electron non raggiungibile\n' + log.slice(-1500)); return done(1); }
  let page; for (let i = 0; i < 20; i++) { const pp = await browser.pages(); page = pp.find(p => /index\.html/.test(p.url())); if (page) break; await sleep(300); }
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await sleep(1200);
  const wait = async (fn, ms) => { try { await page.waitForFunction(fn, { timeout: ms || 10000, polling: 150 }); return true; } catch (e) { return false; } };
  const clickText = async (sel, txt) => page.evaluate((sel, txt) => { const e = Array.from(document.querySelectorAll(sel)).find(x => x.textContent.indexOf(txt) >= 0 && x.offsetParent); if (e) { e.click(); return true; } return false; }, sel, txt);

  // 1. bridge + modalità desktop
  const info = await page.evaluate(() => ({ d: !!window.desktop, cls: document.body.className, fs: getComputedStyle(document.documentElement).fontSize, back: !!document.querySelector('.backbtn') }));
  ok('bridge window.desktop presente e body.desktop', info.d && /desktop/.test(info.cls), JSON.stringify(info));
  const emptyBtns = await page.evaluate(() => Array.from(document.querySelectorAll('.ebtns .btn')).map(b => b.textContent));
  ok('schermata iniziale desktop con azioni senza digitare', emptyBtns.length === 6 && /Incolla/.test(emptyBtns[0]), emptyBtns.join(' | '));
  await page.screenshot({ path: OUT + '/d1-home-vuota.png' });

  // 2. incolla un URL Xtream (get.php) -> riconosciuto da solo
  await page.evaluate(() => { setTimeout(() => window.__app.addFromText('http://localhost:9100/get.php?username=u&password=p&type=m3u_plus&output=ts'), 0); });
  await wait(() => document.querySelector('.modal .mbody'), 8000);
  const body = await page.evaluate(() => (document.querySelector('.modal .mbody') || {}).textContent);
  ok('URL get.php riconosciuto come Xtream con utente', /Xtream/.test(body || '') && /Utente: u/.test(body), (body || '').replace(/\n/g, ' / '));
  await page.screenshot({ path: OUT + '/d2-conferma-xtream.png' });
  await clickText('.modal .btn', 'Aggiungi');
  await wait(() => window.__app.store.get().sources.length === 1, 5000);
  const s1 = await page.evaluate(() => window.__app.store.get().sources[0]);
  ok('sorgente Xtream creata con credenziali estratte', s1 && s1.type === 'xtream' && s1.user === 'u' && s1.pass === 'p' && s1.url === 'http://localhost:9100', JSON.stringify(s1));
  await sleep(2500);

  // 3. incolla testo di una playlist M3U
  await page.evaluate(() => { setTimeout(() => window.__app.addFromText('#EXTM3U\n#EXTINF:-1 group-title="G",Canale uno\nhttp://localhost:9100/live.ts\n'), 0); });
  await wait(() => document.querySelector('.modal .mbody'), 5000);
  await clickText('.modal .btn', 'Aggiungi');
  await wait(() => window.__app.store.get().sources.length === 2, 5000);
  ok('playlist M3U incollata come testo -> sorgente file', await page.evaluate(() => window.__app.store.get().sources[1].type) === 'm3ufile');
  await sleep(1500);

  // 4. link .m3u -> playlist; link webdav -> NAS
  await page.evaluate(() => { setTimeout(() => window.__app.addFromText('Guarda qui http://localhost:9100/list.m3u grazie'), 0); });
  await wait(() => document.querySelector('.modal .mbody'), 5000);
  const b3 = await page.evaluate(() => document.querySelector('.modal .mbody').textContent);
  ok('link .m3u dentro un testo -> playlist M3U', /M3U/.test(b3), b3.replace(/\n/g, ' / '));
  await page.keyboard.press('Escape'); await sleep(300);

  // 5. cartella locale
  await page.evaluate(p => { const s = window.__app.store; s.addSource({ id: 'loc', type: 'local', name: 'Prova locale', path: p }); }, tmp);
  await page.evaluate(() => window.__app.router.home());
  await sleep(300);
  await page.evaluate(() => { setTimeout(() => window.__app.router.current.openFiles(), 0); });
  await wait(() => document.querySelector('.menu .mrow') || document.querySelectorAll('.frow').length, 8000);
  if (await page.$('.menu .mrow')) { await clickText('.mrow', 'Prova locale'); }
  await wait(() => Array.from(document.querySelectorAll('.frow')).some(r => r.offsetParent && /Film/.test(r.textContent)), 8000);
  const crumb0 = await page.$eval('.crumb', e => e.textContent).catch(() => '');
  const rows0 = await page.evaluate(() => window.__app.router.current.entries.map(e => e.name));
  ok('cartella locale: elenco radice (Film, lista.m3u)', rows0.indexOf('Film') >= 0 && rows0.indexOf('lista.m3u') >= 0, rows0.join(', ') + ' | crumb=' + crumb0);
  // clic su "Film" (mouse reale)
  const pos = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('.frow')).find(x => x.offsetParent && /Film/.test(x.textContent)).getBoundingClientRect(); return { x: r.x + 80, y: r.y + r.height / 2 }; });
  await page.mouse.click(pos.x, pos.y); await sleep(900);
  const rows1 = await page.evaluate(() => window.__app.router.current.entries.map(e => e.name));
  const crumb1 = await page.$eval('.crumb', e => e.textContent);
  ok('clic del mouse apre la cartella; crumb con nome sorgente', rows1.indexOf('bel film.mp4') >= 0 && /Prova locale\s+›\s+Film/.test(crumb1), rows1.join(', ') + ' | ' + crumb1);
  await sleep(700);
  const plot = await page.evaluate(() => { const c = window.__app.router.current; const i = c.entries.findIndex(e => e.name === 'bel film.mp4'); c.list.select(i); return i; });
  await sleep(900);
  const itxt = await page.$eval('.pane.info', e => e.textContent);
  ok('scheda file: titolo/trama da .nfo', /Il Bel Film/.test(itxt) && /Una trama di prova/.test(itxt), itxt.slice(0, 80));
  await page.screenshot({ path: OUT + '/d3-file-locali.png' });
  // rotella
  await page.mouse.move(pos.x, pos.y); await page.mouse.wheel({ deltaY: -120 }); await sleep(300);
  const sel1 = await page.evaluate(() => window.__app.router.current.list.sel);
  ok('rotella del mouse sposta la selezione', sel1 !== plot, 'sel ' + plot + ' -> ' + sel1);
  // riproduzione file locale (file://)
  await page.evaluate(() => { const c = window.__app.router.current; c.list.select(c.entries.findIndex(e => e.name === 'bel film.mp4')); setTimeout(() => c.open(c.list.current()), 0); });
  const played = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.5; }, 12000);
  const vsrc = await page.evaluate(() => (document.querySelector('video.pv') || {}).currentSrc);
  ok('riproduzione di un file locale via file://', played && /^file:\/\//.test(vsrc), vsrc);
  await sleep(500);
  await page.screenshot({ path: OUT + '/d4-player.png' });
  const hasBar = await page.evaluate(() => !!document.querySelector('.player .dbar') && !!document.querySelector('.player .pseekbar'));
  ok('player: barra controlli per mouse con barra di avanzamento', hasBar);
  // controlli: spazio = pausa, clic su play, F schermo intero
  await page.keyboard.press('Space'); await sleep(300);
  ok('Spazio mette in pausa', await page.evaluate(() => document.querySelector('video.pv').paused));
  await page.evaluate(() => document.querySelector('.player .cbtn.big').click()); await sleep(300);
  ok('pulsante play/pausa riprende', await page.evaluate(() => !document.querySelector('video.pv').paused));
  await page.evaluate(() => { const v = document.querySelector('video.pv'); window.__t0 = v.currentTime; });
  await page.evaluate(() => { const b = document.querySelector('.pseekbar'); const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.8, clientY: r.top + 2 })); });
  await sleep(500);
  const jumped = await page.evaluate(() => document.querySelector('video.pv').currentTime > window.__t0 + 1 || document.querySelector('video.pv').currentTime > 5);
  ok('clic sulla barra di avanzamento salta in avanti', jumped);
  await page.keyboard.press('Escape'); await sleep(600);
  ok('Esc chiude il player', await page.evaluate(() => !document.querySelector('video.pv')));

  // 6. DLNA (SOAP + parser) via bridge
  const dres = await page.evaluate(async () => { const a = await window.desktop.dlnaBrowse('http://localhost:9200/ctl', '0'); const b = await window.desktop.dlnaBrowse('http://localhost:9200/ctl', 'v'); return { a, b }; });
  ok('DLNA: Browse SOAP + DIDL (contenitore e file con url)', dres.a[0].dir && dres.a[0].title === 'Video' && dres.b[0].url === 'http://localhost:9100/media/movie.mp4' && dres.b[0].mime === 'video/mp4', JSON.stringify(dres.b[0]));
  await page.evaluate(() => window.__app.store.addSource({ id: 'dl', type: 'dlna', name: 'NAS DLNA', control: 'http://localhost:9200/ctl', url: 'http://localhost:9200' }));
  const dcount = await page.evaluate(async () => { const { createSource } = await import('./app.js').catch(() => ({})); return 0; }).catch(() => 0);

  // 7. sicurezza lettura file
  const sec = await page.evaluate(async () => { try { await window.desktop.readText('/etc/passwd'); return 'LETTO'; } catch (e) { return 'bloccato'; } });
  ok('lettura file non consentiti bloccata (/etc/passwd)', sec === 'bloccato');
  const lst = await page.evaluate(async p => (await window.desktop.listDir(p)).map(x => x.name).sort().join(','), tmp);
  ok('listDir dal main process', lst === 'Film,lista.m3u', lst);

  // 8. discover non crasha (nel sandbox non ci sono dispositivi)
  const dsc = await page.evaluate(async () => { try { const r = await window.desktop.discover(1800); return Array.isArray(r) ? 'ok' : 'x'; } catch (e) { return 'err ' + e.message; } });
  ok('ricerca in rete (SSDP/mDNS) termina senza errori', dsc === 'ok', dsc);

  // 9. impostazioni desktop: niente righe companion/telefono
  await page.evaluate(() => { window.__app.router.home(); });
  await sleep(300);
  await page.evaluate(() => { const T = window.__app.router.current; T.tSet.click(); });
  await sleep(600);
  const setl = await page.evaluate(() => Array.from(document.querySelectorAll('.setrow .sl')).map(x => x.textContent));
  ok('impostazioni desktop senza companion/telefono, con identità lettore', !setl.some(x => /companion|Telefono/i.test(x)) && setl.some(x => /Identità/.test(x)), setl.join(' | '));
  await page.screenshot({ path: OUT + '/d5-impostazioni.png' });

  ok('nessun errore JS nella pagina', errs.length === 0, errs.join(' ; '));
  console.log('\n' + res.filter(Boolean).length + '/' + res.length + ' superati');
  await done(res.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
