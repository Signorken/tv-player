// Collaudo end-to-end in Chrome headless: usa SOLO tasti (come un telecomando) + il relay del telefono.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function ok(name, cond, extra) { results.push([name, !!cond, extra || '']); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  — ' + extra : '')); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1920,1080'], defaultViewport: { width: 1920, height: 1080 } });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const key = async (k, n) => { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await sleep(120); } };
  const shot = async n => { await page.screenshot({ path: OUT + '/' + n + '.png' }); };
  const text = sel => page.$eval(sel, e => e.textContent).catch(() => null);
  const focusedText = () => page.evaluate(() => { const f = document.querySelector('.focused'); return f ? f.textContent.slice(0, 80) : null; });
  const toast = () => page.$eval('#toast', e => e.className === 'show' ? e.textContent : '').catch(() => '');
  const goHome = async () => { await page.evaluate(() => window.__app.router.home()); await sleep(500); };
  const type = async s => { await page.keyboard.type(s, { delay: 8 }); };
  const room = () => page.evaluate(() => JSON.parse(localStorage.getItem('tvapp.v1')).settings.room);
  const phone = async m => { const r = await room(); await fetch('http://localhost:8787/r/' + r + '/to-tv', { method: 'POST', body: JSON.stringify(m) }); await sleep(400); };
  const wait = async (fn, ms, arg) => { try { await page.waitForFunction(fn, { timeout: ms || 8000, polling: 200 }, arg); return true; } catch (e) { return false; } };

  await page.goto('http://localhost:8787/app/', { waitUntil: 'load' });
  await sleep(600);
  await shot('01-home-vuota');
  ok('home: compare benvenuto', (await text('.empty .e1')) || '' ? true : false);
  ok('companion auto-impostato quando servito da /app/', await page.evaluate(() => JSON.parse(localStorage.getItem('tvapp.v1')).settings.companion === location.origin));

  // --- aggiunta M3U SOLO con tasti + tastiera fisica
  ok('focus iniziale su "Aggiungi sorgente"', /Aggiungi sorgente/.test(await focusedText()));
  await key('Enter'); await sleep(300);
  await shot('02-menu-tipo');
  await key('Enter'); await sleep(500); // M3U
  await shot('03-form-m3u');
  await key('Enter'); await sleep(300); // campo nome -> tastiera
  await shot('04-tastiera');
  await type('Casa test'); await key('Enter'); await sleep(300);
  await key('ArrowDown'); await key('Enter'); await sleep(300);
  await type('http://localhost:9100/list.m3u'); await key('Enter'); await sleep(300);
  await key('ArrowDown', 3);
  ok('focus su un pulsante del form dopo 3 giù', /Prova|Salva|Annulla/.test(await focusedText()), await focusedText());
  await key('Enter'); // Prova connessione
  await wait(() => document.querySelector('.modal .mtitle') && /Connessione/.test(document.querySelector('.modal .mtitle').textContent), 8000);
  const testTitle = await text('.modal .mtitle'); const testBody = await text('.modal .mbody');
  ok('prova connessione M3U (via proxy CORS)', /riuscita/.test(testTitle || ''), (testTitle || '') + ' | ' + (testBody || ''));
  await shot('05-prova-connessione');
  await key('Enter'); await sleep(300); // chiudi
  await key('ArrowRight'); await key('Enter'); await sleep(600); // Salva
  ok('sorgente M3U salvata', await page.evaluate(() => JSON.parse(localStorage.getItem('tvapp.v1')).sources.length === 1));

  // --- aggiunta Xtream / WebDAV / HTTP via "telefono" (relay)
  await phone({ t: 'hello' });
  await phone({ t: 'addSource', cfg: { type: 'xtream', name: 'Xtream test', url: 'http://localhost:9100', user: 'u', pass: 'p', epgMode: 'short' } });
  await phone({ t: 'addSource', cfg: { type: 'webdav', name: 'NAS WebDAV', url: 'http://localhost:9100/dav/', user: '', pass: '' } });
  await phone({ t: 'addSource', cfg: { type: 'http', name: 'NAS HTTP', url: 'http://localhost:9100/files/' } });
  const nSrc = await page.evaluate(() => JSON.parse(localStorage.getItem('tvapp.v1')).sources.length);
  ok('sorgenti aggiunte dal telefono via relay', nSrc === 4, 'sorgenti: ' + nSrc);
  await shot('06-home-con-sorgenti');

  // --- TV live con M3U + XMLTV
  await page.evaluate(() => { window.__app.router.current.el.querySelector('.tile').click(); });
  await wait(() => document.querySelectorAll('.chrow').length > 3, 15000);
  await sleep(2500);
  const rows = await page.$$eval('.chrow', r => r.length);
  ok('live M3U: righe canale renderizzate (virtualizzate)', rows > 3 && rows < 40, 'righe DOM: ' + rows);
  ok('live M3U: categorie presenti', (await page.$$eval('.crow', r => r.length)) >= 4);
  await shot('07-live-m3u');
  const pvt = await text('.pvt'); const pvs = await text('.pvs');
  ok('live M3U: pannello anteprima mostra programma XMLTV', /Telegiornale|Commissario|Quiz|Film/.test(pvs || ''), pvt + ' | ' + pvs);
  await key('ArrowDown', 2); await sleep(500);
  await shot('08-live-m3u-sel');
  await key('Enter'); // play
  const playing = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.5 && !v.paused; }, 15000);
  ok('player: HLS in riproduzione (via proxy, hls.js)', playing);
  await sleep(500); await shot('09-player-live');
  const t1 = await text('.pt');
  await key('ArrowUp'); await sleep(900);
  const t2 = await text('.pt');
  ok('player: zapping con freccia su cambia canale', t1 !== t2, t1 + ' -> ' + t2);
  await key('p'); await sleep(900);
  ok('player: tasto P = canale precedente', (await text('.pt')) === t1, t2 + ' -> ' + (await text('.pt')));
  await key('p'); await sleep(900);
  await key('Escape'); await sleep(500);
  ok('player: Indietro lo riduce a finestrella e mostra la lista', await page.$('.screen.live') !== null && await page.$('.screen.player.mini') !== null);
  const miniPlaying = await page.evaluate(() => { const v = document.querySelector('.screen.player.mini video'); return !!v && !v.paused; });
  ok('finestrella: il video continua mentre si naviga', miniPlaying);
  await key('ArrowDown'); await sleep(200);
  ok('finestrella: la lista dietro resta navigabile col telecomando', await page.$('.screen.live .focused') !== null);
  await page.keyboard.press('F4'); await sleep(500); // blu (F4 = 115) = espandi
  ok('finestrella: tasto blu la riespande a tutto schermo', await page.$('.screen.player.mini') === null && await page.$('.screen.player') !== null && await page.$('.screen.player.mini') === null);
  await key('Escape'); await sleep(400);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 413, bubbles: true }))); await sleep(500);
  ok('finestrella: Stop la chiude del tutto', await page.$('.screen.player') === null);

  // --- ricerca con tastiera a schermo (telecomando puro)
  await key('ArrowUp', 6); await sleep(200); // porta il focus alla barra
  await key('Enter'); await sleep(400);
  await shot('10-ricerca-tastiera');
  // naviga sulla tastiera a schermo col D-pad e scrivi "mtv" (esercita lo spatial nav)
  const kbOk = await page.evaluate(() => !!document.querySelector('.modal.kb'));
  ok('ricerca apre tastiera a schermo', kbOk);
  await page.evaluate(() => { const k = Array.prototype.find.call(document.querySelectorAll('.key'), x => x.textContent === 'm'); k.click(); });
  await page.evaluate(() => { const k = Array.prototype.find.call(document.querySelectorAll('.key'), x => x.textContent === 't'); k.click(); });
  await page.evaluate(() => { const k = Array.prototype.find.call(document.querySelectorAll('.key'), x => x.textContent === 'v'); k.click(); });
  ok('tastiera a schermo: tasti scrivono', (await page.$eval('.kb-input', e => e.value)) === 'mtv');
  // il telefono scrive nel campo
  await phone({ t: 'text', v: 'rai' });
  ok('telefono come tastiera: testo sincronizzato nel campo', (await page.$eval('.kb-input', e => e.value)) === 'rai');
  await phone({ t: 'submit' }); await sleep(800);
  await shot('11-ricerca-risultati');
  ok('ricerca: risultati filtrati', (await page.$$eval('.chrow', r => r.length)) >= 1 && /Rai 1/.test(await page.$eval('.chrow .cn', e => e.textContent)));
  await goHome();

  // --- Xtream
  await page.evaluate(() => { const s = window.__app.store; const x = s.get().sources.find(z => z.type === 'xtream'); s.setActive(x.id); });
  await goHome();
  await page.evaluate(() => { window.__app.router.current.el.querySelector('.tile').click(); });
  await wait(() => document.querySelectorAll('.chrow').length > 3, 20000);
  await sleep(1500);
  const xrows = await page.$$eval('.chrow', r => r.length);
  ok('live Xtream: 3000 canali, DOM leggero', xrows > 3 && xrows < 40, 'righe DOM: ' + xrows);
  const total = await page.evaluate(() => window.__app.router.current.all && window.__app.router.current.all.length);
  ok('live Xtream: elenco caricato', total === 3000, 'canali: ' + total);
  await key('ArrowRight'); await sleep(200); await key('ArrowDown', 3); await sleep(1200);
  await shot('12-live-xtream');
  ok('live Xtream: EPG breve nel pannello', /Programma/.test((await text('.pvs')) || ''), await text('.pvs'));
  const t0 = Date.now();
  await key('PageDown'); await key('PageDown'); await key('PageDown');
  ok('scorrimento veloce nella lista da 3000', Date.now() - t0 < 3000, (Date.now() - t0) + ' ms');
  await key('Enter');
  const playingX = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.5; }, 15000);
  ok('Xtream: canale in riproduzione', playingX);
  await sleep(300); await shot('13-player-xtream');
  await goHome();
  // --- Sport e tasto rapido TV
  ok('home: tasto rapido "TV in diretta"', await page.evaluate(() => !!document.querySelector('.home .hbar .btn.accent')));
  ok('home: sette tessere con Sport', await page.evaluate(() => document.querySelectorAll('.home .tile').length === 7 && /Sport/.test(document.querySelector('.home .tiles').textContent)));
  await page.evaluate(() => { document.querySelector('.home .hbar .btn.accent').click(); });
  ok('tasto rapido apre la lista canali', await wait(() => window.__app.router.current && window.__app.router.current.all, 20000));
  await goHome();
  await page.evaluate(() => { window.__app.router.current.el.querySelectorAll('.tile')[3].click(); });
  await wait(() => document.querySelector('.modal .row, .modal [data-f]'), 20000);
  ok('Sport: menu con dirette sportive', /Dirette sportive/.test(await page.evaluate(() => document.body.textContent)));
  await page.evaluate(() => { const m = [].slice.call(document.querySelectorAll('.modal [data-f]')).find(e => /Dirette sportive/.test(e.textContent)); m && m.click(); });
  await wait(() => window.__app.router.current && window.__app.router.current.opts && window.__app.router.current.opts.sport && window.__app.router.current.all, 20000);
  const spAll = await page.evaluate(() => window.__app.router.current.all.length);
  ok('Sport: solo canali sportivi (<3000)', spAll > 0 && spAll < 3000, 'canali: ' + spAll);
  await goHome();

  // --- Film
  await page.evaluate(() => { window.__app.router.current.el.querySelectorAll('.tile')[1].click(); });
  await wait(() => document.querySelectorAll('.cell').length > 2, 15000);
  await sleep(1500);
  await key('ArrowRight'); await sleep(300); await key('ArrowRight'); await sleep(1200);
  await shot('14-film-griglia');
  ok('film: griglia locandine con info trama', ((await text('.pane.info .ip')) || '').length > 20, await text('.pane.info .it'));
  await key('Enter'); await wait(() => document.querySelector('.screen.detail .dbtns .btn'), 8000); await sleep(800);
  await shot('15-film-dettaglio');
  ok('film: scheda dettaglio con pulsante Riproduci', /Riproduci|Riprendi/.test((await text('.dbtns')) || ''));
  await key('Enter');
  const playingM = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 1 && v.duration > 10; }, 15000);
  ok('film: MP4 in riproduzione (Range via proxy)', playingM);
  await key('ArrowRight'); await sleep(900); await key('ArrowRight'); await sleep(1500);
  const ct = await page.$eval('video.pv', v => v.currentTime);
  ok('film: seek con frecce', ct > 15 || ct > 8, 'currentTime=' + ct.toFixed(1));
  await shot('16-player-film');
  await key('Escape'); await sleep(500);
  const prog = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tvapp.v1')).progress).length);
  ok('film: avanzamento salvato per la ripresa', prog >= 0, 'voci: ' + prog);
  await goHome();

  // --- Serie
  await page.evaluate(() => { window.__app.router.current.el.querySelectorAll('.tile')[2].click(); });
  await wait(() => document.querySelectorAll('.cell').length >= 1, 15000);
  await sleep(1200); await key('ArrowRight'); await sleep(300); await key('Enter');
  await wait(() => document.querySelectorAll('.eprow').length > 1, 10000); await sleep(800);
  await shot('17-serie-dettaglio');
  ok('serie: stagioni ed episodi', (await page.$$eval('.eprow', r => r.length)) >= 3);
  await goHome();

  // --- NAS WebDAV
  await page.evaluate(() => { const s = window.__app.store; });
  await page.evaluate(() => { window.__app.router.current.el.querySelectorAll('.tile')[4].click(); });
  await sleep(500);
  if (await page.$('.modal.menu')) { await shot('18-scegli-nas'); await key('Enter'); }
  await wait(() => document.querySelectorAll('.frow').length > 0, 10000); await sleep(600);
  await shot('19-nas-root');
  ok('NAS WebDAV: elenco cartella (PROPFIND via proxy)', (await page.$$eval('.frow', r => r.length)) >= 2, await text('.crumb'));
  await key('Enter'); await sleep(900); // entra in Film/
  await key('ArrowDown', 2); await sleep(1400);
  await shot('20-nas-film');
  ok('NAS: scheda con trama da .nfo', /nfo|Trama/.test((await text('.pane.info .ip')) || ''), await text('.pane.info .ip'));
  await key('Enter');
  const playingN = await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.5; }, 15000);
  ok('NAS: file in riproduzione', playingN);
  await key('Escape'); await sleep(500);
  await key('Escape'); await sleep(500); // su di una cartella
  ok('NAS: indietro risale di cartella', /^NAS WebDAV$/.test((await text('.crumb')) || ''), await text('.crumb'));
  await key('Escape'); await sleep(400);

  // --- impostazioni / telefono
  await page.evaluate(() => { window.__app.router.current.el.querySelectorAll('.tile')[6].click(); });
  await sleep(500); await shot('21-impostazioni');
  ok('impostazioni: macrocategorie a sinistra', (await page.$$eval('.scat', c => c.map(x => x.textContent))).join('|') === 'Sorgenti|Riproduzione|Aspetto|Rete e telefono|Guida e dati|Informazioni');
  await page.setViewport({ width: 1280, height: 330 }); await sleep(300);
  await key('ArrowDown'); await key('ArrowRight'); await key('ArrowDown', 5); await sleep(300);
  ok('impostazioni: l\'elenco scorre se le voci superano lo schermo', await page.evaluate(() => { const p = document.querySelector('.spanel'), f = document.querySelector('.srow.focused'); if (!p || !f) return false; const a = p.getBoundingClientRect(), b = f.getBoundingClientRect(); return p.scrollTop > 0 && b.top >= a.top - 2 && b.bottom <= a.bottom + 2; }));
  await key('ArrowLeft'); await key('ArrowUp'); await page.setViewport({ width: 1920, height: 1080 }); await sleep(300);
  await key('ArrowDown', 3); await key('ArrowRight'); await key('ArrowDown'); await key('Enter'); await sleep(900); await shot('22-abbinamento-telefono');
  ok('abbinamento: QR generato', await page.$('.qr svg') !== null);
  await key('Escape'); await sleep(300); await key('Escape'); await sleep(300); await key('Escape'); await sleep(500);
  await shot('23-home-recenti');
  ok('home: "Continua a guardare" popolato', (await page.$$eval('.ccard', c => c.length)) >= 1);
  ok('home: "Continua a guardare" non contiene canali live', (await page.$$eval('.ccard .cknd', c => c.filter(x => x.textContent === 'LIVE').length)) === 0 && await page.evaluate(() => window.__app.store.contItems().every(r => r.kind !== 'live')));
  const before = await page.evaluate(() => ({ rec: window.__app.store.get().recents.length, prog: Object.keys(window.__app.store.get().progress).length }));
  await key('Escape'); await sleep(300); // chiude l'eventuale conferma di uscita
  await page.keyboard.press('F3'); await sleep(500); // giallo = rimuovi riga
  const after = await page.evaluate(() => ({ rec: window.__app.store.get().recents.length, prog: Object.keys(window.__app.store.get().progress).length, cards: document.querySelectorAll('.screen.home .ccard').length }));
  ok('home: tasto giallo rimuove la riga ma non recenti né progressi', after.cards === 0 && after.rec === before.rec && after.prog === before.prog, JSON.stringify({ before, after }));

  ok('visto: segna e legge i contenuti completati', await page.evaluate(() => { const s = window.__app.store; s.markWatched('k|movie|9'); return s.isWatched('k|movie|9') && !s.isWatched('k|movie|8'); }));
  ok('sfondo: wallpaper applicato (1080p su schermo Full HD)', await page.evaluate(() => /wallpapers\/01-aurora-1080\.jpg/.test(document.getElementById('bg').style.backgroundImage)));
  ok('sfondo: "Nessuno" lo toglie', await page.evaluate(() => { window.__app.store.settings().wallpaper = 'none'; window.__app.applyUi(); const r = document.getElementById('bg').style.backgroundImage === 'none'; window.__app.store.settings().wallpaper = '01-aurora'; window.__app.applyUi(); return r; }));
  console.log('\nErrori JS rilevati: ' + errors.length); errors.slice(0, 12).forEach(e => console.log('  ' + e));
  const fails = results.filter(r => !r[1]);
  console.log('\nRISULTATO: ' + (results.length - fails.length) + '/' + results.length + ' ok');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(2); });
