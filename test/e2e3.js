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
  ok('barra: On Demand apre la griglia dei film', await wait(() => document.querySelectorAll('.cell').length > 2, 15000) && (await cur()) === 'ondemand');
  await sleep(800);
  ok('On Demand dalla barra: film e serie insieme (filtro Tutto)', await page.evaluate(() => { const c = window.__app.router.current; return c.mix === 'all' && /● Tutto/.test(document.querySelector('.crow.on').textContent) && c.catList.some(k => k.parts && k.parts.length === 2); }));
  ok('Tutto: nella griglia ci sono sia film sia serie', await wait(() => { const c = window.__app.router.current; return c.items && c.items.some(i => i._mode === 'series') && c.items.some(i => i._mode === 'movie'); }, 8000) || await page.evaluate(() => { const c = window.__app.router.current; const k = c.catList.find(x => x.parts && x.parts.length === 2); c.cats.select(c.catList.indexOf(k)); return false; }));
  ok('barra: sezione corrente evidenziata', await page.evaluate(() => /On Demand/.test(document.querySelector('.ri.cur').textContent)));
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
  ok('Aspetto B: solo il pulsante selezionato mostra il nome', await page.evaluate(() => { const t = document.querySelectorAll('.home .tile'); return getComputedStyle(t[0].querySelector('.t1')).opacity !== '0' && getComputedStyle(t[1].querySelector('.t1')).opacity === '0'; }));
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

  // --- 2.1: schede On Demand, finestrella configurabile, Indietro tenuto premuto, suoni, riga canali
  const longBack = async () => { await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))); await sleep(1000); await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }))); await sleep(400); };
  await goHome();
  await page.evaluate(() => { const S = window.__app.Sound; window.__snd = { move: 0, ok: 0 }; const m = S.move, o = S.ok; S.move = function () { window.__snd.move++; return m.apply(S, arguments); }; S.ok = function () { window.__snd.ok++; return o.apply(S, arguments); }; });
  await page.evaluate(() => window.__app.router.current.openVod('movie'));
  await wait(() => window.__app.router.current.loaded, 15000); await sleep(600);
  await key('ArrowRight'); await key('ArrowLeft');
  const snd1 = await page.evaluate(() => window.__snd.move);
  ok('suoni: spostarsi tra gli elementi produce il suono di navigazione', snd1 >= 2, 'suoni=' + snd1);
  await page.evaluate(() => { const c = window.__app.router.current; c.setZone('cats'); c.cats.select(0); }); await sleep(200);
  ok('On Demand: filtri Tutto / Film / Serie TV / Sport e Raccolte nella colonna, niente schede in alto', await page.evaluate(() => { const c = window.__app.router.current; return c.catList.slice(0, 4).map(x => x.name).join('|') === 'Tutto|Film|Serie TV|Sport' && c.catList[4].kind === 'group' && !document.querySelector('.hd .tab'); }));
  await key('ArrowDown', 2); await key('Enter');
  ok('filtro Serie TV: stessa schermata, elenco delle serie', await wait(() => window.__app.router.current.mode === 'series' && window.__app.router.current.items && window.__app.router.current.items.length > 0, 15000) && await page.evaluate(() => window.__app.router.depth === 2 && /● Serie TV/.test(document.querySelector('.crow.on').textContent)));
  const coll0 = await page.evaluate(() => window.__app.router.current.collOpen);
  await page.evaluate(() => { const c = window.__app.router.current; c.cats.select(4); }); await key('Enter'); await sleep(300);
  ok('Raccolte si apre e si chiude con OK', await page.evaluate(o => { const c = window.__app.router.current; return c.collOpen === !o && c.catList.some(x => x.id === '__list') === !o; }, coll0));
  await page.evaluate(() => { const c = window.__app.router.current; if (!c.collOpen) { c.cats.select(4); c.catOk(c.catList[4]); } }); await sleep(200);
  await page.evaluate(() => { const c = window.__app.router.current; c.cats.select(c.catList.findIndex(x => !x.kind)); c.setZone('grid'); }); await sleep(800);
  await page.evaluate(() => { const c = window.__app.router.current; const it = c.grid.current(); const k = window.__app.store.favKey(c.src.id, 'series', it.id); window.__app.store.toggleList(k, { kind: 'series', src: c.src.id, id: it.id, name: it.name, item: it }); window.__lname = it.name; });
  await page.evaluate(() => { const c = window.__app.router.current; c.catOk(c.catList.find(x => x.id === '__list')); }); await sleep(600);
  ok('La mia lista: separata dai preferiti, mostra ciò che hai aggiunto', await page.evaluate(() => { const c = window.__app.router.current; return c.catId === '__list' && c.items.length === 1 && c.items[0].name === window.__lname && !window.__app.store.isFav(window.__app.store.favKey(c.src.id, 'series', c.items[0].id)); }));
  await shot('09-ondemand-serie');
  await goHome();
  await page.evaluate(() => window.__app.router.current.openLive());
  await wait(() => window.__app.router.current.all, 15000); await sleep(400);
  await key('Enter'); await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.3; }, 15000);
  await page.evaluate(() => { window.__snd.move = 0; });
  await key('ArrowLeft'); await sleep(300); await key('ArrowDown', 3);
  ok('suoni: nessun suono navigando nel pannello canali del player', await page.evaluate(() => window.__snd.move === 0));
  await key('Escape'); await sleep(200);
  await key('Escape'); await sleep(600);
  ok('finestrella aperta', !!(await page.$('.screen.player.mini')));
  await longBack();
  ok('Indietro tenuto premuto chiude la finestrella', !(await page.$('.screen.player')));
  await page.evaluate(() => { window.__app.store.settings().miniPlayer = 'vod'; });
  await key('Enter'); await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.3; }, 15000);
  await key('Escape'); await sleep(600);
  ok('finestrella "solo film e serie": Indietro da un canale chiude il player', !(await page.$('.screen.player')) && (await cur()) === 'live');
  await page.evaluate(() => { window.__app.store.settings().miniPlayer = 'always'; });
  await goHome();
  ok('Home: riga canali recenti con "Rimuovi riga"', await page.evaluate(() => getComputedStyle(document.querySelector('.liverow')).display !== 'none'));
  await page.evaluate(() => window.__app.router.current.liveX.click()); await sleep(300);
  ok('Rimuovi riga nasconde i canali recenti', await page.evaluate(() => getComputedStyle(document.querySelector('.liverow')).display === 'none'));

  // --- 2.4: finestrella chiudibile con qualsiasi telecomando, Rimuovi riga in fondo alla riga
  const openMini = async () => {
    await goHome(); await page.evaluate(() => window.__app.router.current.openLive());
    await wait(() => window.__app.router.current.all, 15000); await sleep(300);
    await key('Enter'); await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.2; }, 15000);
    await key('Escape'); await sleep(500);
    await page.evaluate(() => window.__app.router.home()); await sleep(500);
  };
  await openMini();
  ok('Home: tessera "In riproduzione" con Schermo intero e Chiudi', await page.evaluate(() => { const b = document.querySelector('.nowbox'); return b && b.style.display !== 'none' && b.querySelectorAll('.btn').length === 2; }));
  await shot('10-home-in-riproduzione');
  await key('Escape'); await sleep(500);
  ok('Indietro dalla Home chiude la finestrella (senza chiedere di uscire)', !(await page.$('.screen.player')) && !(await page.$('.modal')));
  await openMini();
  await page.evaluate(() => window.dispatchEvent(new Event('maxenta-longback'))); await sleep(400);
  ok('Android: Indietro tenuto premuto (segnalato dall\'APK) chiude la finestrella', !(await page.$('.screen.player')));
  await openMini();
  await page.evaluate(() => { const M = window.__app.Mini; M.focusFrom('down'); }); await sleep(200);
  ok('finestrella selezionata: pulsanti Schermo intero / Chiudi', await page.evaluate(() => getComputedStyle(document.querySelector('.screen.player.mini .mbtns2')).display !== 'none'));
  await shot('11-finestrella-selezionata');
  await key('ArrowRight'); await key('Enter'); await sleep(400);
  ok('Destra + OK sulla finestrella la chiude', !(await page.$('.screen.player')));
  await openMini();
  await key('ArrowLeft'); await sleep(200); await key('ArrowUp', 3); await sleep(150);
  ok('barra: "In riproduzione" in cima', await page.evaluate(() => document.querySelector('.ri.focused') && document.querySelector('.ri.focused').classList.contains('now')));
  await key('Enter'); await sleep(400);
  ok('barra: "In riproduzione" apre il menu Schermo intero / Chiudi', /Chiudi la finestrella/.test(await page.evaluate(() => (document.querySelector('.modal') || {}).textContent || '')));
  await key('ArrowDown'); await key('Enter'); await sleep(400);
  ok('dal menu: Chiudi', !(await page.$('.screen.player')));
  await goHome();
  await page.evaluate(() => { const s = window.__app.store; s.get().liveClearedAt = 0; s.get().recents.forEach(r => { delete r.hid; }); s.addRecent(s.favKey('x1', 'live', '2'), { kind: 'live', src: 'x1', id: '2', name: 'Canale 2' }); window.__app.router.current.refresh(); });
  await sleep(300);
  await page.evaluate(() => window.__app.nav.focus(document.querySelector('.liverow .ccard')));
  await key('ArrowRight', 10); await sleep(200);
  ok('"Rimuovi riga" raggiungibile andando sempre a destra', await page.evaluate(() => { const f = document.querySelector('.focused'); return f && f.classList.contains('xcard'); }));
  await key('Enter'); await sleep(300);
  ok('...e con OK toglie la riga', await page.evaluate(() => getComputedStyle(document.querySelector('.liverow')).display === 'none'));

  // --- 2.3: pannelli del player interi, barra con nome e versione, dimensione proporzionata
  ok('barra: nome e versione accanto al logo', await page.evaluate(() => /MAXENTA/.test(document.querySelector('.rname').textContent) && /^v\d/.test(document.querySelector('.rver').textContent)));
  const fs1 = await page.evaluate(() => parseFloat(document.documentElement.style.fontSize));
  await page.setViewport({ width: 1920, height: 700 }); await sleep(300);
  const fs2 = await page.evaluate(() => parseFloat(document.documentElement.style.fontSize));
  ok('dimensione automatica: si adatta anche all\'altezza della finestra', fs2 < fs1, fs1 + ' -> ' + fs2);
  await page.setViewport({ width: 1920, height: 1080 }); await sleep(300);
  await page.evaluate(() => window.__app.router.current.openLive && window.__app.router.current.openLive());
  await wait(() => window.__app.router.current.all, 15000); await sleep(300);
  await key('Enter'); await wait(() => { const v = document.querySelector('video.pv'); return v && v.currentTime > 0.2; }, 15000); await sleep(5600);
  await key('ArrowLeft'); await sleep(600);
  ok('pannello Canali tutto dentro lo schermo', await page.evaluate(() => { const r = document.querySelector('.pdrawer').getBoundingClientRect(); return r.left >= 0; }));
  await key('Escape'); await sleep(300);
  await key('ArrowRight'); await sleep(600);
  ok('pannello Opzioni tutto dentro lo schermo', await page.evaluate(() => { const r = document.querySelector('.pdrawer').getBoundingClientRect(); return r.right <= window.innerWidth + 1; }));
  await page.evaluate(() => window.__app.router.current._exit()); await sleep(300);
  console.log('Errori JS: ' + errs.length, errs.slice(0, 5));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await browser.close();
  process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(1); });
