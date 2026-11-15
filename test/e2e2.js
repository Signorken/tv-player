// Prove mirate: hls.js (senza HLS nativo) con proxy video, mpegts.js, zapping numerico, OK lungo, preferiti, ripresa
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const OUT = '/tmp/shots2'; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1920, height: 1080 } });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // simula una TV senza HLS nativo (webOS/Tizen vecchi hanno HLS, ma Chrome Android WebView no)
  await page.evaluateOnNewDocument(() => { const o = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (t) { return /mpegurl/i.test(t) ? '' : o.call(this, t); }; });
  let proxied = 0; page.on('request', r => { if (/localhost:8787\/proxy\?url=.*(seg|m3u8|\.ts)/.test(r.url())) proxied++; });
  const key = async (k, n) => { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await sleep(130); } };
  const wait = async (fn, ms) => { try { await page.waitForFunction(fn, { timeout: ms || 12000, polling: 200 }); return true; } catch (e) { return false; } };
  const text = sel => page.$eval(sel, e => e.textContent).catch(() => null);
  const goHome = async () => { await page.evaluate(() => window.__app.router.home()); await sleep(400); };
  await page.goto('http://localhost:8787/app/'); await sleep(500);
  await page.evaluate(() => {
    const s = window.__app.store; s.settings().proxyMedia = true;
    s.addSource({ id: 'm1', type: 'm3u', name: 'M3U', url: 'http://localhost:9100/list.m3u' });
    s.addSource({ id: 'x1', type: 'xtream', name: 'X', url: 'http://localhost:9100', user: 'u', pass: 'p', epgMode: 'short' });
    s.setActive('m1'); s.save(true);
  });
  await page.reload(); await sleep(500);
  // --- hls.js + proxy video
  await page.evaluate(() => window.__app.router.current.el.querySelector('.tile').click());
  await wait(() => document.querySelectorAll('.chrow').length > 3, 15000); await sleep(800);
  await key('Enter');
  const hlsOk = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.8; }, 15000);
  const eng = await page.evaluate(() => { const e = window.__app.router.current.engine; return e && e.attempts[e.ai] && e.attempts[e.ai].eng; });
  ok('hls.js riproduce (HLS nativo assente) con manifest/segmenti via proxy', hlsOk && eng === 'hls', 'motore=' + eng + ' richieste proxy=' + proxied);
  // --- zapping numerico
  await key('Digit2'); await sleep(2600);
  ok('zapping numerico: "2" -> Tg 24', /Tg 24/.test(await text('.pt')), await text('.pt'));
  // --- tasti colorati: rosso (F1) = preferito
  await key('F1'); await sleep(400);
  const favs = await page.evaluate(() => Object.keys(window.__app.store.get().favorites).length);
  ok('tasto rosso nel player aggiunge ai preferiti', favs === 1, 'preferiti=' + favs);
  // --- menu con OK lungo nel player
  await page.keyboard.down('Enter'); await sleep(700); await page.keyboard.down('Enter'); await sleep(200); await page.keyboard.up('Enter'); await sleep(500);
  ok('OK lungo apre il menu opzioni del player', /Opzioni/.test((await text('.modal .mtitle')) || ''));
  await page.screenshot({ path: OUT + '/menu-player.png' });
  await key('Escape'); await sleep(300);
  await key('Escape'); await sleep(600);
  ok('torna alla lista live', await page.$('.screen.live') !== null);
  // --- preferiti: categoria + schermata
  await key('ArrowLeft'); await sleep(200); await key('ArrowUp'); await sleep(200); await key('Enter'); await sleep(200);
  const favRows = await page.$$eval('.chrow', r => r.filter(x => x.style.display !== 'none').length);
  ok('categoria Preferiti mostra il canale', favRows === 1, 'righe=' + favRows);
  await page.screenshot({ path: OUT + '/live-preferiti.png' });
  // --- OK lungo su canale -> menu contestuale
  await key('ArrowRight'); await sleep(200);
  await page.keyboard.down('Enter'); await sleep(700); await page.keyboard.down('Enter'); await sleep(200); await page.keyboard.up('Enter'); await sleep(400);
  ok('OK lungo su un canale apre il menu contestuale', /Tg 24/.test((await text('.modal .mtitle')) || ''), await text('.modal .mtitle'));
  await key('Escape'); await sleep(300);
  await goHome();
  // --- mpegts.js (Xtream formato .ts)
  await page.evaluate(() => { const s = window.__app.store; s.settings().liveFormat = 'ts'; s.setActive('x1'); });
  await page.evaluate(() => window.__app.router.current.el.querySelector('.tile').click());
  await wait(() => document.querySelectorAll('.chrow').length > 3, 20000); await sleep(800);
  await key('ArrowRight'); await key('ArrowDown'); await sleep(300); await key('Enter');
  const tsOk = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.8; }, 15000);
  const eng2 = await page.evaluate(() => { const e = window.__app.router.current.engine; return e && e.attempts[e.ai] && e.attempts[e.ai].eng; });
  ok('mpegts.js riproduce un flusso .ts', tsOk && eng2 === 'mpegts', 'motore=' + eng2);
  await key('Escape'); await sleep(500); await goHome();
  // --- Preferiti da Home + ripresa film
  await page.evaluate(() => { const st = window.__app.store; st.setProgress(st.favKey('x1', 'movie', '802'), 40, 100); });
  await page.evaluate(() => window.__app.router.current.el.querySelectorAll('.tile')[1].click());
  await wait(() => document.querySelectorAll('.cell').length > 2, 15000); await sleep(1000);
  await key('Enter');
  await wait(() => document.querySelector('.screen.detail .dbtns .btn'), 8000); await sleep(800);
  const b = await text('.dbtns');
  ok('film: pulsante "Riprendi da" se c\'è un avanzamento', /Riprendi da 0:40/.test(b || ''), b);
  await page.screenshot({ path: OUT + '/dettaglio-riprendi.png' });
  await goHome();
  await page.evaluate(() => window.__app.router.current.el.querySelectorAll('.tile')[5].click()); await sleep(600);
  ok('schermata Preferiti elenca il canale', (await page.$$eval('.favrow', r => r.filter(x => x.style.display !== 'none').length)) === 1);
  await page.screenshot({ path: OUT + '/preferiti.png' });
  console.log('Errori JS: ' + errs.length, errs.slice(0, 5));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await browser.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
