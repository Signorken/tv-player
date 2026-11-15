// Trasforma una copia di www/ in "guscio" auto-aggiornante per le TV: node scripts/shell.js <cartella>
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('uso: node scripts/shell.js <cartella>'); process.exit(1); }
const ver = require('../package.json').version;
const base = process.env.UPDATE_BASE || 'https://raw.githubusercontent.com/Signorken/tv-player/updates/';
const loader = fs.readFileSync(path.join(__dirname, '..', 'packaging', 'shell', 'loader.js'), 'utf8')
  .replace('__BUNDLED__', ver).replace('__BASE__', base);
const f = path.join(dir, 'index.html');
let html = fs.readFileSync(f, 'utf8');
html = html.replace('<link rel="stylesheet" href="css/app.css">', '<link id="appcss" rel="stylesheet" href="css/app.css">')
  .replace('<script src="app.js"></script>', '<script>\n' + loader + '</script>');
if (!/__shell|Controllo aggiornamenti/.test(html)) { console.error('index.html inatteso'); process.exit(1); }
fs.writeFileSync(f, html);
console.log('guscio ' + ver + ' -> ' + f);
