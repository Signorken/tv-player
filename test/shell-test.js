// Prova del guscio auto-aggiornante delle TV: aggiornamento, funzionamento offline, scarto di una versione difettosa.
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..'), TMP = '/tmp/shelltest';
const res = []; const ok = (n, c, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); };
function serve(dir, port, cors) {
  return http.createServer((q, r) => {
    let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
    if (!state.online && cors) { r.writeHead(503); return r.end(); }
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); return r.end(); }
      const h = { 'Content-Type': /\.html$/.test(f) ? 'text/html' : /\.css$/.test(f) ? 'text/css' : /\.js$/.test(f) ? 'application/javascript' : 'application/octet-stream' };
      if (cors) h['Access-Control-Allow-Origin'] = '*';
      r.writeHead(200, h); r.end(b);
    });
  }).listen(port);
}
const state = { online: true };
(async () => {
  cp.execSync('rm -rf ' + TMP + ' && mkdir -p ' + TMP + '/upd');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'))); const orig = pkg.version;
  // "online" la versione 9.9.0
  const setVer = v => { pkg.version = v; fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n'); };
  try {
    setVer('9.9.0'); cp.execSync('node scripts/build.js', { cwd: ROOT });
    fs.copyFileSync(path.join(ROOT, 'www/app.js'), TMP + '/upd/app.js'); fs.copyFileSync(path.join(ROOT, 'www/css/app.css'), TMP + '/upd/app.css');
    fs.writeFileSync(TMP + '/upd/version.json', JSON.stringify({ version: '9.9.0', minShell: 1 }));
    // pacchetto installato: versione originale
    setVer(orig); cp.execSync('node scripts/build.js', { cwd: ROOT });
    cp.execSync('cp -r www ' + TMP + '/tv', { cwd: ROOT });
    cp.execSync('node scripts/shell.js ' + TMP + '/tv', { cwd: ROOT, env: Object.assign({}, process.env, { UPDATE_BASE: 'http://localhost:9201/' }) });
  } finally { setVer(orig); }
  const s1 = serve(TMP + '/tv', 9200, false), s2 = serve(TMP + '/upd', 9201, true);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 720 } });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const info = () => p.evaluate(() => ({ shell: window.__shell, app: !!window.__app, ver: (document.getElementById('ver') || {}).textContent }));
  await p.goto('http://localhost:9200/'); await sleep(2500);
  let i = await info();
  ok('primo avvio: scarica e avvia la versione online', i.app && i.shell.version === '9.9.0' && i.ver === 'v9.9.0', JSON.stringify(i));
  ok('avviso "aggiornata alla versione"', i.shell.updatedFrom === orig || i.shell.updatedFrom === '', JSON.stringify(i.shell));
  state.online = false;
  await p.reload(); await sleep(4500);
  i = await info();
  ok('senza rete: usa la copia salvata', i.app && i.shell.version === '9.9.0', JSON.stringify(i));
  // aggiornamento difettoso: viene scartato e si torna alla versione inclusa
  state.online = true;
  fs.writeFileSync(TMP + '/upd/app.js', 'throw new Error("rotto");' + ' '.repeat(60000));
  fs.writeFileSync(TMP + '/upd/version.json', JSON.stringify({ version: '9.9.1', minShell: 1 }));
  await p.reload(); await sleep(11000); await sleep(2500);
  i = await info();
  ok('versione difettosa scartata: riparte da sola', i.app && i.shell.version !== '9.9.1', JSON.stringify(i));
  // guscio troppo vecchio per l'aggiornamento: nessun download
  await p.evaluate(() => { localStorage.clear(); });
  fs.writeFileSync(TMP + '/upd/version.json', JSON.stringify({ version: '9.9.2', minShell: 5 }));
  await p.reload(); await sleep(2500);
  i = await info();
  ok('aggiornamento che richiede un guscio nuovo: resta la versione inclusa', i.app && i.shell.version === orig, JSON.stringify(i));
  console.log('Errori pagina (attesi solo "rotto"):', errs.filter(e => !/rotto/.test(e)).slice(0, 3));
  const f = res.filter(x => !x).length; console.log('RISULTATO: ' + (res.length - f) + '/' + res.length);
  await b.close(); s1.close(); s2.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERRORE TEST', e); process.exit(1); });
