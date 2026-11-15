// Prove 2.0: barra laterale, Aspetto B, orologio, schermata all'avvio, tastiera con maiuscole,
// player per telecomandi senza tasti (pannelli laterali, OK info/pausa), finestrella, OK lungo senza keydown ripetuti.
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const OUT = process.env.OUT3 || '/tmp/shots3'; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1920, height: 1080 } });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const key = async (k, n) => { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await sleep(140); } };
  const wait = async (fn, ms) => { try { await page.waitForFunction(fn, { timeout: ms || 12000, polling: 150 }); return true; } catch (e) { return false; } };
  const text = sel => page.$eval(sel, e => e.textContent).catch(() => null);
  const shot = n => page.screenshot({ path: OUT + '/' + n + '.png' });
  const goHome = async () => { await page.evaluate(() => { const M = window.__app.Mini; if (M && M.player) M.close(); window.__app.router.home(); }); await sleep(400); };
  const cur = () => page.evaluate(() => { const c = window.__app.router.current; return c && c.constructor && (c.railId || (c.isPlayer ? 'player' : '?')); });
  // tasto "lungo" senza keydown ripetuti (come i telecomandi Samsung)
  const longOk = async () => { await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))); await sleep(900); await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }))); await sleep(300); };

  await page.goto('http://localhost:8787/app/'); await sleep(500);
  await page.evaluate(() => {
    const s = window.__app.store; s.settings().proxyMedia = true; s.settings().lowPower = false;
    s.addSource({ id: 'm1', type: 'm3u', name: 'M3U demo', url: 'http://localhost:9100/list.m3u', epgUrl: 'http://localhost:9100/epg.xml' });
    s.addSource({ id: 'x1', type: 'xtream', name: 'Xtream', url: 'http://localhost:9100', user: 'u', pass: 'p', epgMode: 'short' });
    s.setActive('x1');
    s.addRecent(s.favKey('x1', 'movie', '803'), { kind: 'movie', src: 'x1', id: '803', name: 'Film numero 3', sub: '2013', poster: 'http://localhost:9100/img/p4.jpg', ext: 'mp4' });
    s.setProgress(s.favKey('x1', 'movie', '803'), 1200, 5400);
    s.addRecent(s.favKey('x1', 'live', '1'), { kind: 'live', src: 'x1', id: '1', name: 'Canale 1', logo: 'http://localhost:9100/img/l2.png' });
    s.save(true);
  });
  await page.reload(); await sleep(1200);

  // --- Aspetto A
  ok('Aspetto A predefinito: barra laterale visibile, pulsanti nascosti', await page.evaluate(() => document.body.classList.contains('layA') && getComputedStyle(document.getElementById('rail')).display !== 'none' && getComputedStyle(document.querySelector('.home .tiles')).display === 'none'));
  ok('Home: Riprendi + Continua a guardare + Canali recenti', await page.evaluate(() => !!document.querySelector('.hero .btn') && document.querySelectorAll('.home .ccard').length >= 2 && /Canali visti/.test(document.querySelector('.home').textContent)));
  ok('focus iniziale sul pulsante Riprendi', /Riprendi/.test(await page.evaluate(() => document.querySelector('.focused') && document.querySelector('.focused').textContent)));
  ok('versione e orologio', await page.evaluate(() => /^v\d/.test(document.getElementById('ver').textContent) && /^\d\d:\d\d$/.test(document.getElementById('gclock').textContent)));
  await shot('01-home-A');
  await key('ArrowLeft'); await sleep(300);
  ok('Sinistra apre la barra (con i nomi)', await page.evaluate(() => document.getElementById('rail').classList.contains('open') && /Home/.test(document.querySelector('.ri.focused').textContent)));
  await shot('02-barra-aperta');
  await key('ArrowRight'); await sleep(200);
  ok('Destra richiude la barra e torna al contenuto', await page.evaluate(() => !document.getElementById('rail').classList.contains('open') && /Riprendi/.test(document.querySelector('.focused').textContent)));
  await key('ArrowLeft'); await key('ArrowDown', 2); await key('Enter');
  ok('barra: Film apre la griglia', await wait(() => document.querySelectorAll('.cell').length > 2, 15000) && (await cur()) === 'movie');
  await sleep(800);
  ok('barra: sezione corrente evidenziata', await page.evaluate(() => /Film/.test(document.querySelector('.ri.cur').textContent)));
  // dalla prima colonna (categorie) Sinistra entra nella barra
  await key('ArrowLeft'); await sleep(150); await key('ArrowLeft'); await sleep(250);
  ok('Sinistra dalle categorie dei film entra nella barra', await page.evaluate(() => document.getElementById('rail').classList.contains('open')));
  await key('ArrowUp', 2); await key('Enter'); await sleep(500);
  ok('barra: Home riporta alla Home', (await cur()) === 'home');

  // --- tastiera con maiuscole
  await page.evaluate(() => window.__app.store.settings().lowPower = false);
  await goHome(); await page.evaluate(() => { const c = window.__app.router.current; c.openLive(); });
  await wait(() => window.__app.router.current.all, 15000); await sleep(600);
  await page.evaluate(() => { window.__app.router.current.search(); });
  await wait(() => document.querySelector('.kb-keys'), 4000); await sleep(200);
  const typeKey = async ch => { await page.evaluate(c => { const k = [].slice.call(document.querySelectorAll('.kb-keys .key')).find(x => x.textContent.toLowerCase() === c); k.click(); }, ch); await sleep(80); };
  const shift = async () => { await page.evaluate(() => document.querySelector('.kb-keys .shiftk').click()); await sleep(80); };
  await shift(); await typeKey('c'); await typeKey('a'); await shift(); await shift(); await typeKey('n'); await typeKey('e');
  await shot('03-tastiera-maiuscole');
  ok('tastiera: Shift una volta = una maiuscola, due volte = blocco maiuscole', (await page.$eval('.kb-input', e => e.value)) === 'CaNE', await page.$eval('.kb-input', e => e.value));
  await key('Escape'); await sleep(300);

  // --- OK lungo (timer, senza keydown ripetuti)
  await longOk();
  ok('OK lungo senza ripetizione apre il menu del canale', /Guarda ora/.test(await page.evaluate(() => (document.querySelector('.modal') || {}).textContent || '')));
  await key('Escape'); await sleep(300);

  // --- player live: OK info -> pausa, Sinistra canali, Destra opzioni
  await key('Enter');
  await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.5; }, 15000); await sleep(5600);
  ok('player: informazioni nascoste dopo qualche secondo', await page.evaluate(() => !window.__app.router.current.shown));
  await key('Enter'); await sleep(250);
  ok('player: primo OK mostra le informazioni', await page.evaluate(() => window.__app.router.current.shown && !document.querySelector('video.pv').paused));
  await key('Enter'); await sleep(250);
  ok('player: secondo OK mette in pausa', await page.evaluate(() => document.querySelector('video.pv').paused));
  await key('Enter'); await sleep(400);
  const t1 = await text('.pt');
  await key('ArrowLeft'); await sleep(500);
  ok('player: Sinistra apre il pannello Canali', /Canali/.test((await text('.pdrawer .pdt')) || ''));
  await shot('04-player-canali');
  await key('ArrowDown', 2); await key('Enter'); await sleep(900);
  ok('pannello Canali: OK cambia canale e chiude', !(await page.$('.pdrawer')) && (await text('.pt')) !== t1, t1 + ' -> ' + (await text('.pt')));
  await key('ArrowRight'); await sleep(500);
  ok('player: Destra apre il pannello Opzioni', /Opzioni/.test((await text('.pdrawer .pdt')) || ''));
  await shot('05-player-opzioni');
  await key('ArrowLeft'); await sleep(300);
  ok('pannello Opzioni: Sinistra lo chiude', !(await page.$('.pdrawer')));
  const t2 = await text('.pt');
  await key('ArrowUp'); await sleep(900);
  ok('player live: Su cambia canale', (await text('.pt')) !== t2);

  // --- finestrella: stesso canale = nessun ricaricamento; Play/Pausa la riespande
  const chName = await text('.pt');
  await key('Escape'); await sleep(600);
  ok('Indietro: finestrella', !!(await page.$('.screen.player.mini')));
  ok('barra: voce "In riproduzione" visibile', await page.evaluate(() => getComputedStyle(document.querySelector('.ri.now')).display !== 'none'));
  const t0 = await page.evaluate(() => document.querySelector('.screen.player.mini video').currentTime);
  await page.evaluate(() => { window.__mark = window.__app.Mini.player; });
  await key('Enter'); await sleep(1200);
  ok('riaprire lo stesso canale riespande la finestrella senza ricaricare', await page.evaluate(() => window.__app.router.current === window.__mark && !document.querySelector('.screen.player.mini')) && (await page.evaluate(() => document.querySelector('video.pv').currentTime)) >= t0, chName);
  await key('Escape'); await sleep(500);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaPlayPause', keyCode: 10252, bubbles: true }))); await sleep(500);
  ok('Play/Pausa riporta la finestrella a schermo intero', await page.evaluate(() => window.__app.router.current && window.__app.router.current.isPlayer && !window.__app.router.current.mini));
  await key('Escape'); await sleep(400);
  await key('ArrowLeft', 2); await sleep(200);
  await page.evaluate(() => { const r = document.getElementById('rail'); });
  await page.evaluate(() => window.__app.Mini.close()); await sleep(200);

  // --- film: Sinistra/Destra scorrono solo con le informazioni visibili
  await goHome();
  await page.evaluate(() => window.__app.router.current.openVod('movie'));
  await wait(() => document.querySelectorAll('.cell').length > 2, 15000); await sleep(800);
  await key('Enter'); await wait(() => document.querySelector('.screen.detail .dbtns .btn'), 8000); await sleep(500);
  await key('Enter');
  await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.5; }, 15000); await sleep(300);
  const dbg = await page.evaluate(() => { const c = window.__app.router.current; return 'shown=' + c.shown + ' d=' + c._d() + ' seek=' + c.engine.canSeek() + ' paused=' + c.video.paused; });
  await key('ArrowRight'); await sleep(300);
  ok('film: con le informazioni visibili, Destra scorre di 10 s', await page.evaluate(() => /\+10/.test(document.querySelector('.pseek').textContent) && !document.querySelector('.pdrawer')), dbg + ' ' + await text('.pseek') + ' ' + await page.evaluate(() => { const c = window.__app.router.current; return c.isPlayer + ' ' + c.pend + ' ' + c.video.currentTime; }));
  await sleep(6500);
  await key('ArrowRight'); await sleep(400);
  ok('film: senza informazioni, Destra apre le opzioni', /Opzioni/.test((await text('.pdrawer .pdt')) || ''));
  await key('Escape'); await sleep(200);
  await key('ArrowLeft'); await sleep(300);
  ok('film singolo: Sinistra avvisa che non ci sono altri episodi', !(await page.$('.pdrawer')));
  await page.evaluate(() => { window.__app.router.current._exit(); }); await sleep(400);

  // --- Aspetto B + orologio 12 h
  await goHome();
  await page.evaluate(() => { const s = window.__app.store.settings(); s.layout = 'B'; s.clock = '12'; window.__app.store.save(); window.__app.applyUi(); window.__app.router.current.refresh(); });
  await sleep(300);
  await page.evaluate(() => window.__app.nav.focus(document.querySelector('.home .tile')));
  await sleep(200);
  ok('Aspetto B: niente barra, pulsanti a icone', await page.evaluate(() => getComputedStyle(document.getElementById('rail')).display === 'none' && getComputedStyle(document.querySelector('.home .tiles')).display !== 'none'));
  ok('Aspetto B: solo il pulsante selezionato mostra il nome', await page.evaluate(() => { const t = document.querySelectorAll('.home .tile'); return getComputedStyle(t[0].querySelector('.t1')).display !== 'none' && getComputedStyle(t[1].querySelector('.t1')).display === 'none'; }));
  ok('orologio a 12 ore', /(AM|PM)$/.test(await text('#gclock')), await text('#gclock'));
  await shot('06-home-B');
  await key('ArrowRight'); await sleep(200);
  await shot('07-home-B-film');

  // --- schermata all'avvio
  await page.evaluate(() => { const s = window.__app.store.settings(); s.layout = 'A'; s.clock = '24'; s.startScreen = 'live'; window.__app.store.save(true); });
  await page.reload(); await sleep(500);
  ok('schermata all\'avvio: TV in diretta', await wait(() => window.__app.router.current && window.__app.router.current.railId === 'live' && window.__app.router.current.all, 15000));
  await key('Escape'); await sleep(300);
  ok('Indietro dalla schermata di avvio torna alla Home', (await cur()) === 'home');
  await page.evaluate(() => { window.__app.store.settings().startScreen = 'home'; window.__app.store.save(true); });

  // --- impostazioni: nuove voci in Aspetto
  await page.evaluate(() => window.__app.router.current.openSettings()); await sleep(300);
  await page.evaluate(() => { const c = [].slice.call(document.querySelectorAll('.scat')).find(x => /Aspetto/.test(x.textContent)); c.click(); }); await sleep(200);
  const look = await page.evaluate(() => [].slice.call(document.querySelectorAll('.srow .sl')).map(x => x.textContent).join(' | '));
  ok('Aspetto: disposizione, orologio, schermata all\'avvio', /Disposizione/.test(look) && /Orologio/.test(look) && /avvio/.test(look), look);
  await shot('08-impostazioni-aspetto');

  console.log('Errori JS: ' + errs.length, errs.slice(0, 5));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await browser.close();
  process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(1); });
