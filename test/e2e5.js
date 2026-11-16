// Prove 2.6: La mia lista unita (provider + app), ricerca unica, TV in diretta con categorie a scomparsa, guida a griglia,
// episodio successivo automatico, tema chiaro e scelta dello sfondo con miniature.
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', env: Object.assign({}, process.env, { LANG: 'it_IT.UTF-8', LANGUAGE: 'it' }), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const key = async (k, n) => { for (let i = 0; i < (n || 1); i++) { await p.keyboard.press(k); await sleep(180); } };
  const wait = (fn, ms) => p.waitForFunction(fn, { timeout: ms || 12000, polling: 100 }).then(() => true).catch(() => false);
  await p.goto('http://localhost:8787/app/'); await sleep(300);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(300);
  // utente "ml": il provider ha le categorie "La Mia Lista" (film) e "★ My List" (serie)
  await p.evaluate(() => { const s = window.__app.store; s.settings().proxyMedia = true; s.settings().sounds = false; s.addSource({ id: 'x1', type: 'xtream', name: 'Xtream', url: 'http://localhost:9100', user: 'ml', pass: 'p', epgMode: 'short' }); s.setActive('x1'); s.save(true); });
  await p.reload(); await sleep(800);
  ok('Home: "La mia lista" mostra i titoli salvati sul portale del provider', await wait(() => document.querySelectorAll('.home .listrow .ccard').length === 3, 8000),
    await p.evaluate(() => document.querySelector('.home .listrow').textContent));
  await p.evaluate(() => { const st = window.__app.store; st.toggleList(st.favKey('x1', 'movie', '820'), { kind: 'movie', src: 'x1', id: '820', name: 'Film numero 20', poster: '' }); st.toggleList(st.favKey('x1', 'movie', '805'), { kind: 'movie', src: 'x1', id: '805', name: 'Film numero 5', poster: '' }); window.__app.router.current.renderList(); });
  const names = await p.evaluate(() => [...document.querySelectorAll('.home .listrow .cname')].map(x => x.textContent));
  ok('…unita alla lista dell\'app, senza doppioni (prima i titoli aggiunti nell\'app)', names.length === 4 && names.indexOf('Film numero 20') >= 0 && names.indexOf('Film numero 20') < names.indexOf('Film numero 7') && names.filter(x => x === 'Film numero 5').length === 1, names.join(' | '));
  ok('Home: con la lista, "Riprendi" compatto (classe haslist)', await p.evaluate(() => document.querySelector('.home').classList.contains('haslist')));
  // ricerca unica
  await p.evaluate(() => window.__app.router.current.openSearch()); await sleep(500);
  await p.keyboard.type('canale 7'); await key('Enter');
  ok('Ricerca unica: risultati raggruppati (canali)', await wait(() => document.querySelectorAll('.screen.search .ccard').length > 0, 15000) && await p.evaluate(() => /Canali/.test(document.querySelector('.screen.search').textContent)));
  await p.evaluate(() => window.__app.router.current.query = '').catch(() => {});
  await p.evaluate(() => { const s = window.__app.router.current; s.query = 'numero 1'; s.run(); });
  ok('Ricerca unica: film trovati con l\'etichetta FILM', await wait(() => /Film numero 1/.test(document.querySelector('.screen.search').textContent) && document.querySelector('.screen.search .kbadge.k-m') !== null, 15000));
  await key('Enter'); await sleep(800);
  ok('Ricerca: OK su un film apre la scheda', await wait(() => document.querySelector('.screen.detail') !== null, 8000));
  // TV in diretta
  await p.evaluate(() => window.__app.router.home()); await sleep(300);
  await p.evaluate(() => window.__app.router.current.openLive());
  await wait(() => window.__app.router.current.all, 20000); await sleep(400);
  ok('TV in diretta: si apre direttamente sull\'elenco dei canali (categorie nascoste)', await p.evaluate(() => !document.querySelector('.live').classList.contains('catsopen') && getComputedStyle(document.querySelector('.live .pane.cats')).display === 'none' && document.querySelectorAll('.live .chrow').length > 5));
  await key('ArrowLeft'); await sleep(300);
  ok('Sinistra apre le categorie sopra l\'elenco', await p.evaluate(() => document.querySelector('.live').classList.contains('catsopen') && document.querySelectorAll('.live .crow').length >= 4));
  await key('ArrowDown', 1); await key('Enter'); await sleep(400);
  ok('OK su una categoria la chiude e filtra i canali', await p.evaluate(() => !document.querySelector('.live').classList.contains('catsopen') && /Sport/.test(document.querySelector('.chcat').textContent)));
  await key('ArrowLeft'); await sleep(200); await key('Escape'); await sleep(200);
  ok('Indietro chiude le categorie', await p.evaluate(() => !document.querySelector('.live').classList.contains('catsopen') && window.__app.router.current.constructor.name !== 'HomeScreen'));
  // guida
  await p.evaluate(() => window.__app.router.current.openGuide());
  ok('Guida TV a griglia: righe canali con programmi', await wait(() => document.querySelectorAll('.guide .gprog:not(.empty)').length > 5, 15000));
  ok('Guida: solo le righe visibili nel DOM', await p.evaluate(() => document.querySelectorAll('.guide .grow').length < 20));
  await key('ArrowDown', 2); await key('ArrowRight'); await sleep(300);
  ok('Guida: Giù/Destra spostano la selezione e aggiornano il dettaglio', await p.evaluate(() => { const g = window.__app.router.current; return g.row === 2 && /Programma 2/.test(document.querySelector('.gdt').textContent); }));
  await key('ArrowLeft'); await sleep(200); await key('Enter');
  ok('Guida: OK sul programma in onda apre il canale', await wait(() => { const c = window.__app.router.current; return c.isPlayer; }, 8000));
  await p.evaluate(() => window.__app.router.current._exit()); await sleep(400);
  // episodio successivo
  await p.evaluate(() => window.__app.router.home()); await sleep(300);
  await p.evaluate(() => window.__app.router.current.openVod('series'));
  await wait(() => document.querySelectorAll('.cell').length > 0, 15000); await sleep(500);
  await key('Enter'); await wait(() => document.querySelector('.screen.detail .dbtns .btn')); await sleep(600);
  await key('Enter');
  await wait(() => { const c = window.__app.router.current; return c.isPlayer && c.video.currentTime > 0.2; }, 15000);
  await p.evaluate(() => { const c = window.__app.router.current; c._d = () => 1500; c._t = () => 1490; c._checkNext(); });
  ok('Episodio successivo: negli ultimi secondi compare il riquadro con il conto alla rovescia', await p.evaluate(() => /Prossimo episodio/.test((document.querySelector('.pnextep') || {}).textContent || '')));
  await key('Escape'); await sleep(200);
  ok('Indietro lo annulla subito (resta nel player)', await p.evaluate(() => !document.querySelector('.pnextep') && window.__app.router.current.isPlayer && window.__app.router.current.nextOff));
  await p.evaluate(() => { const c = window.__app.router.current; c.nextOff = false; c._checkNext(); }); await sleep(200);
  await key('ArrowRight', 2); await key('Enter'); await sleep(300);
  ok('"Disattiva" lo spegne nelle impostazioni', await p.evaluate(() => window.__app.store.settings().autoNext === false && !document.querySelector('.pnextep')));
  await p.evaluate(() => { window.__app.store.settings().autoNext = true; const c = window.__app.router.current; c.nextOff = false; c._checkNext(); }); await sleep(200);
  await key('Enter'); await sleep(800);
  ok('"Guarda ora" passa all\'episodio successivo', await p.evaluate(() => window.__app.router.current.i === 1));
  await p.evaluate(() => window.__app.router.current._exit()); await sleep(400);
  // tema chiaro e sfondi
  await p.evaluate(() => window.__app.router.home()); await sleep(200);
  await p.evaluate(() => window.__app.router.push(new window.__app.SettingsScreen())); await sleep(400);
  await p.evaluate(() => { const s = window.__app.router.current; s.show(s.cats.findIndex(c => c.id === 'look')); const r = s.rows.find(r => r._it.label === 'Tema'); window.__app.nav.focus(r); r.click(); }); await sleep(400);
  await key('ArrowDown'); await key('Enter'); await sleep(400);
  ok('Tema chiaro attivato (sfondo del tema chiaro scelto da solo)', await p.evaluate(() => document.body.classList.contains('light') && /^l\d/.test(window.__app.store.settings().wallpaper) && /l1-alba/.test(document.getElementById('bg').style.backgroundImage)));
  ok('Tema chiaro: testi scuri, selezione magenta', await p.evaluate(() => getComputedStyle(document.body).color === 'rgb(42, 15, 46)'));
    await p.evaluate(() => { const s = window.__app.router.current; const r = s.rows.find(r => r._it.label === 'Sfondo'); window.__app.nav.focus(r); r.click(); }); await sleep(400);
  ok('Scelta sfondo con miniature', await p.evaluate(() => document.querySelectorAll('.wpick .wpc .wpt').length === 5 && /thumbs\/l1-alba\.jpg/.test(document.querySelector('.wpick .wpt').style.backgroundImage)));
  await key('ArrowRight'); await key('Enter'); await sleep(300);
  ok('…scelta con il telecomando', await p.evaluate(() => window.__app.store.settings().wallpaper === 'l2-petali'));
  const thumbs = await p.evaluate(async () => { const r = await fetch('wallpapers/thumbs/01-aurora.jpg'); return r.ok; });
  ok('Miniature disponibili anche per gli sfondi scuri', thumbs);
  // ---- 2.7: canali preferiti e archivi in Home
  await p.evaluate(() => { const s = window.__app.store, st = s.settings(); st.theme = 'dark'; st.wallpaper = '01-aurora';
    ['3', '7', '12'].forEach(id => s.toggleFav(s.favKey('x1', 'live', id), { kind: 'live', src: 'x1', id: id, name: 'Canale ' + id, logo: 'http://localhost:9100/img/l1.png' }));
    s.addSource({ id: 'n1', type: 'webdav', name: 'NAS casa', url: 'http://localhost:9100/dav/' }); s.save(true); window.__app.applyUi(); window.__app.router.home(); });
  await sleep(800);
  ok('Home: riga "Canali preferiti" della sorgente scelta', await p.evaluate(() => document.querySelectorAll('.home .favrow2 .ccard').length === 3));
  await p.evaluate(() => document.querySelectorAll('.home .favrow2 .ccard')[1].click());
  await wait(() => window.__app.router.current.isPlayer, 15000); await sleep(600);
  ok('…OK apre il canale e nel player ▲▼ scorre solo tra i preferiti', await p.evaluate(() => { const c = window.__app.router.current; return c.o.list.length === 3 && c.i === 1; }));
  await key('ArrowUp'); await sleep(500);
  ok('…▲ passa al preferito successivo', await p.evaluate(() => window.__app.router.current.cur.title === 'Canale 12'));
  await p.evaluate(() => window.__app.router.current._exit()); await sleep(500);
  await p.evaluate(() => window.__app.router.home()); await sleep(400);
  ok('Home: riga "File di rete" con le tessere degli archivi', await p.evaluate(() => /NAS casa/.test(document.querySelector('.home .filerow').textContent)));
  await p.evaluate(() => document.querySelector('.home .filerow .ccard').click()); await sleep(1500);
  ok('…OK apre direttamente l\'archivio', await p.evaluate(() => /NAS casa/.test((document.querySelector('.screen.files .crumb') || {}).textContent || '')));
  // ---- Android: aggiornamento dell'APK dall'app e chiavette USB (plugin nativo simulato)
  const ap = await b.newPage(); ap.on('pageerror', e => errs.push(e.message));
  await ap.setUserAgent('Mozilla/5.0 (Linux; Android 12; Streaming Stick 140 Build/STT2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36');
  await ap.evaluateOnNewDocument(() => {
    window.__mxVersionUrl = 'http://localhost:9100/version.json'; window.__log = [];
    const L = {};
    window.Capacitor = { Plugins: { MaxSystem: {
      info: async () => ({ version: '2.6.0', sdk: 31, canInstall: true }),
      installApk: async o => { window.__log.push('install ' + o.url); (L.apkProgress || []).forEach(f => f({ p: 50 })); return { started: true }; },
      usbVolumes: async () => ({ volumes: [{ id: 'AB12-34CD', name: 'SanDisk USB', granted: false }] }),
      usbGrant: async o => { window.__log.push('grant ' + o.id); return { tree: 'content://com.android.externalstorage.documents/tree/AB12-34CD%3A' }; },
      usbList: async o => ({ items: o.doc ? [{ doc: 'AB12-34CD:Film/a.mkv', name: 'a.mkv', dir: false, size: 1e9, mtime: 0, uri: 'content://x/a.mkv' }] : [{ doc: 'AB12-34CD:Film', name: 'Film', dir: true, size: 0, mtime: 0, uri: 'content://x/Film' }, { doc: 'AB12-34CD:b.mp4', name: 'b.mp4', dir: false, size: 5e8, mtime: 0, uri: 'content://x/b.mp4' }] }),
      addListener: async (ev, f) => { (L[ev] = L[ev] || []).push(f); return { remove() { } }; }
    } } };
  });
  await ap.goto('http://localhost:8787/app/'); await sleep(1500);
  const ak = async (k, n) => { for (let i = 0; i < (n || 1); i++) { await ap.keyboard.press(k); await sleep(180); } };
  const aw = (fn, ms) => ap.waitForFunction(fn, { timeout: ms || 12000, polling: 100 }).then(() => true).catch(() => false);
  ok('Android: APK più vecchio -> dopo l\'avvio propone l\'aggiornamento dall\'app', await aw(() => /versione 2\.7\.0/.test((document.querySelector('.modal') || {}).textContent || ''), 15000));
  await ak('Enter'); await sleep(600);
  ok('…"Aggiorna ora" scarica e installa l\'APK della release', await ap.evaluate(() => window.__log.some(x => /install .*MAXENTA-2\.7\.0-android-tv\.apk/.test(x))));
  ok('Android: la chiavetta USB compare nella riga "File di rete"', await aw(() => /SanDisk USB/.test((document.querySelector('.home .filerow') || {}).textContent || ''), 8000));
  await ap.evaluate(() => [...document.querySelectorAll('.home .filerow .ccard')].find(c => /SanDisk/.test(c.textContent)).click()); await sleep(500);
  await ak('Enter'); await sleep(1200);
  ok('…la prima volta chiede il permesso e poi apre la chiavetta', await ap.evaluate(() => window.__log.some(x => x === 'grant AB12-34CD') && /SanDisk USB/.test((document.querySelector('.screen.files .crumb') || {}).textContent || '') && window.__app.router.current.entries.length === 2));
  await ap.close();
  // ---- 2.8: "Continua a guardare" più furbo
  await p.evaluate(() => { const s = window.__app.store; s.get().contClearedAt = 0;
    const m = s.favKey('x1', 'movie', '840'); s.addRecent(m, { kind: 'movie', src: 'x1', id: '840', name: 'Film finito' }); s.markWatched(m); s.clearProgress(m);
    const ep = (id, n) => ({ kind: 'episode', src: 'x1', id: id, name: 'La serie di prova', show: 'La serie di prova', series: '77', seriesItem: { id: '77', name: 'La serie di prova' }, sub: 'S01E0' + n });
    s.addRecent(s.favKey('x1', 'ep', '901'), ep('901', 1)); s.setProgress(s.favKey('x1', 'ep', '901'), 300, 1500);
    s.addRecent(s.favKey('x1', 'ep', '902'), Object.assign(ep('902', 2), { upnext: 1 }));
    window.__app.router.home(); window.__app.router.current.refresh(); });
  await sleep(500);
  const cont = await p.evaluate(() => [...document.querySelectorAll('.home .contbox:not(.listrow):not(.liverow):not(.favrow2):not(.filerow) .ccard:not(.xcard)')].map(c => c.textContent));
  ok('Continua a guardare: i film finiti spariscono', !cont.some(t => /Film finito/.test(t)), cont.join(' | '));
  ok('…una sola tessera per serie, con il prossimo episodio', cont.filter(t => /La serie di prova/.test(t)).length === 1 && cont.some(t => /Prossimo: S01E02/.test(t)));
  await p.evaluate(() => { const c = [...document.querySelectorAll('.home .ccard')].find(x => /Prossimo: S01E02/.test(x.textContent)); c.click(); });
  ok('…aperto dalla Home, il player conosce tutti gli episodi della serie', await wait(() => { const c = window.__app.router.current; return c.isPlayer && c.o.list.length === 5 && c.i === 1; }, 15000));
  ok('…e l\'informazione "DOPO" del player non è più disegnata come un riquadro', await p.evaluate(() => [...document.querySelectorAll('.pnext')].every(e => getComputedStyle(e).position !== 'absolute')));
  await p.evaluate(() => window.__app.router.current._exit()); await sleep(400);
  console.log('Errori JS: ' + errs.length, errs.slice(0, 4));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await b.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(1); });
