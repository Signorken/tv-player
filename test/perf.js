// Banco di prova prestazioni: CPU rallentata (predefinito 12x ≈ Cortex-A35 della Thomson Streaming Stick 140, il minimo supportato).
// Misura per ogni tasto il tempo fino al fotogramma successivo (mediana / peggiore) e i "long task" del thread principale.
// Uso: node test/perf.js [rallentamento] [anim]   (servono companion e test/demo.js)
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RATE = +process.argv[2] || 12, ANIM = process.argv[3] !== 'noanim';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const c = await p.target().createCDPSession();
  await p.goto('http://localhost:8787/app/'); await sleep(300);
  await p.evaluate(a => { localStorage.clear(); }, ANIM);
  await p.reload(); await sleep(400);
  await p.evaluate(a => {
    const s = window.__app.store, st = s.settings(); st.lowPower = !a; st.sounds = true; st.proxyMedia = true;
    s.addSource({ id: 'demo', type: 'xtream', name: 'Demo', url: 'http://localhost:9110', user: 'd', pass: 'd', epgMode: 'short' }); s.setActive('demo');
    for (let i = 0; i < 8; i++) { const k = s.favKey('demo', 'movie', String(500 + i)); s.addRecent(k, { kind: 'movie', src: 'demo', id: String(500 + i), name: 'Film ' + i, poster: 'http://localhost:9110/img/m' + i + '.jpg' }); s.setProgress(k, 600, 6000); }
    for (let i = 1; i <= 6; i++) s.addRecent(s.favKey('demo', 'live', String(i)), { kind: 'live', src: 'demo', id: String(i), name: 'C' + i, logo: 'http://localhost:9110/img/c' + (i - 1) + '.png' });
    s.save(true);
  }, ANIM);
  const t0 = Date.now(); await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.__app && window.__app.router.current); const boot = Date.now() - t0;
  await sleep(1500);
  await c.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await p.evaluate(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { } });
  const res = {};
  const press = async (name, k, n, gap) => {
    const r = [];
    for (let i = 0; i < n; i++) {
      r.push(await p.evaluate(k => new Promise(res => { const s = performance.now(); document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - s))); }), k));
      await sleep(gap || 120);
    }
    r.sort((a, b) => a - b);
    const prev = res[name]; const m = Math.round(r[r.length >> 1]), x = Math.round(r[r.length - 1]);
    res[name] = prev ? prev + ' | ' + m + '/' + x : m + '/' + x;
  };
  await press('home destra', 'ArrowRight', 8); await press('home giù/su', 'ArrowDown', 3); await press('home giù/su', 'ArrowUp', 3);
  await press('barra apri', 'ArrowLeft', 1); await press('barra su/giù', 'ArrowDown', 6); await press('barra chiudi', 'ArrowRight', 1);
  await p.evaluate(() => window.__app.router.current.openVod('movie', 'all'));
  await p.waitForFunction(() => window.__app.router.current.loaded, { timeout: 60000 }); await sleep(2500);
  await press('ondemand griglia', 'ArrowRight', 6); await press('ondemand griglia', 'ArrowDown', 4);
  await press('ondemand categorie', 'ArrowLeft', 4); await press('ondemand categorie', 'ArrowDown', 6, 250);
  await press('ondemand tasto tenuto', 'ArrowDown', 12, 40);
  await p.evaluate(() => window.__app.router.home()); await sleep(800);
  await p.evaluate(() => window.__app.router.current.openLive());
  await p.waitForFunction(() => window.__app.router.current.all, { timeout: 60000 }); await sleep(2500);
  await press('live giù', 'ArrowDown', 15); await press('live tasto tenuto', 'ArrowDown', 20, 40); await press('live pagina', 'PageDown', 4);
  await press('live categorie', 'ArrowLeft', 1); await press('live categorie', 'ArrowDown', 4, 250);
  await press('apri impostazioni', 'Escape', 1);
  await p.evaluate(() => window.__app.router.current.openSettings && window.__app.router.current.openSettings()); await sleep(1500);
  await press('impostazioni', 'ArrowDown', 5); await press('impostazioni', 'ArrowRight', 1); await press('impostazioni', 'ArrowDown', 5);
  const lt = await p.evaluate(() => window.__lt);
  const m = await p.metrics();
  console.log(JSON.stringify({ rallentamento: RATE + 'x', animazioni: ANIM, avvio_ms: boot, tasti_ms_mediana_peggiore: res, longtask: { n: lt.length, max: Math.round(Math.max.apply(null, lt.concat([0]))) }, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodi: m.Nodes }, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
