// Prove del lettore nativo (ExoPlayer / AVPlay) con un backend finto (window.__fakeNative):
// apertura, posizione del video, pausa, scorrimento, tracce, finestrella con "buco" nell'interfaccia, chiusura, ripiego sul lettore web.
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.evaluateOnNewDocument(() => { window.__fakeNative = true; });
  const key = async (k, n) => { for (let i = 0; i < (n || 1); i++) { await p.keyboard.press(k); await sleep(150); } };
  const wait = (fn, ms) => p.waitForFunction(fn, { timeout: ms || 12000, polling: 100 }).then(() => true).catch(() => false);
  const log = () => p.evaluate(() => (window.__fakeLog || []).join(' | '));
  await p.goto('http://localhost:8787/app/'); await sleep(300);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(300);
  await p.evaluate(() => { const s = window.__app.store; s.settings().proxyMedia = true; s.settings().sounds = false; s.addSource({ id: 'x1', type: 'xtream', name: 'Xtream', url: 'http://localhost:9100', user: 'u', pass: 'p', epgMode: 'short' }); s.setActive('x1'); s.save(true); });
  await p.reload(); await sleep(800);
  await p.evaluate(() => window.__app.router.current.openLive());
  await wait(() => window.__app.router.current.all, 20000); await sleep(400);
  await key('Enter');
  ok('canale aperto col lettore nativo', await wait(() => { const c = window.__app.router.current; return c.isPlayer && c.video.isNative && c.video.currentTime > 0.3; }, 15000), await log());
  ok('video nativo a schermo intero sotto la pagina (pagina trasparente)', await p.evaluate(() => document.documentElement.classList.contains('nv') && getComputedStyle(document.querySelector('video.pv')).visibility === 'hidden' && window.__fakeRect && window.__fakeRect.full));
  ok('spinner nascosto quando il video parte', await p.evaluate(() => !document.querySelector('.pspin').classList.contains('show')));
  await sleep(5600);
  await key('Enter'); await key('Enter'); await sleep(400);
  ok('OK, OK: pausa inviata al lettore nativo', /pause/.test(await log()) && await p.evaluate(() => window.__app.router.current.video.paused));
  await key('Enter'); await sleep(300);
  await key('ArrowRight'); await sleep(500);
  ok('pannello Opzioni con Audio (tracce lette dal lettore nativo)', await p.evaluate(() => /Audio/.test(document.querySelector('.pdrawer').textContent)));
  await p.evaluate(() => { const c = window.__app.router.current; c.optionsDrawer('audio'); }); await sleep(300);
  await key('ArrowDown'); await key('Enter'); await sleep(300);
  ok('cambio lingua audio inviato al lettore nativo', /select audio 0 1/.test(await log()), await log());
  await key('Escape'); await sleep(700);
  ok('finestrella: il video nativo si sposta nel riquadro', await p.evaluate(() => window.__fakeRect && !window.__fakeRect.full && window.__fakeRect.w < 800));
  ok('finestrella: "buco" trasparente nello sfondo e nella schermata sotto', await p.evaluate(() => /polygon/.test(document.getElementById('bg').style.webkitClipPath || document.getElementById('bg').style.clipPath) && /polygon/.test(window.__app.router.current.el.style.webkitClipPath || window.__app.router.current.el.style.clipPath)));
  await p.evaluate(() => window.__app.Mini.player.expand()); await sleep(700);
  ok('di nuovo a schermo intero', await p.evaluate(() => window.__fakeRect.full && !document.getElementById('bg').style.clipPath));
  await p.evaluate(() => window.__app.router.current._exit()); await sleep(500);
  ok('chiudendo il player il lettore nativo si ferma e la pagina torna normale', /stop/.test(await log()) && await p.evaluate(() => !document.documentElement.classList.contains('nv')));
  // film: scorrimento
  await p.evaluate(() => window.__app.router.home()); await sleep(300);
  await p.evaluate(() => window.__app.router.current.openVod('movie'));
  await wait(() => document.querySelectorAll('.cell').length > 2, 15000); await sleep(600);
  await key('Enter'); await wait(() => document.querySelector('.screen.detail .dbtns .btn')); await sleep(300); await key('Enter');
  await wait(() => { const c = window.__app.router.current; return c.isPlayer && c.video.currentTime > 0.3; }, 15000);
  await key('ArrowRight'); await sleep(900);
  ok('film: Destra con le informazioni visibili = scorrimento nativo', /seek \d+/.test(await log()), (await log()).slice(-120));
  await p.evaluate(() => window.__app.router.current._exit()); await sleep(400);
  // ripiego sul lettore web se il nativo fallisce
  await p.evaluate(() => { window.__fakeFail = true; window.__app.router.home(); }); await sleep(300);
  await p.evaluate(() => window.__app.router.current.openLive());
  await wait(() => window.__app.router.current.all, 20000); await sleep(300);
  await key('Enter');
  ok('lettore nativo in errore: si passa da solo al lettore web e il canale parte', await wait(() => { const c = window.__app.router.current; return c.isPlayer && !c.video.isNative && c.video.currentTime > 0.3; }, 25000));
  await p.evaluate(() => { window.__fakeFail = false; window.__app.router.current._exit(); }); await sleep(300);
  console.log('Errori JS: ' + errs.length, errs.slice(0, 4));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await b.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(1); });
