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
  ok('Episodio successivo: negli ultimi secondi compare il riquadro con il conto alla rovescia', await p.evaluate(() => /Prossimo episodio/.test((document.querySelector('.pnext') || {}).textContent || '')));
  await key('Escape'); await sleep(200);
  ok('Indietro lo annulla subito (resta nel player)', await p.evaluate(() => !document.querySelector('.pnext') && window.__app.router.current.isPlayer && window.__app.router.current.nextOff));
  await p.evaluate(() => { const c = window.__app.router.current; c.nextOff = false; c._checkNext(); }); await sleep(200);
  await key('ArrowRight', 2); await key('Enter'); await sleep(300);
  ok('"Disattiva" lo spegne nelle impostazioni', await p.evaluate(() => window.__app.store.settings().autoNext === false && !document.querySelector('.pnext')));
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
  console.log('Errori JS: ' + errs.length, errs.slice(0, 4));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await b.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(1); });
