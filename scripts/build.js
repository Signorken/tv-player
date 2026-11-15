// Compila src/ -> www/app.js (ES2015/Chromium 53+): versione multipiattaforma di build.sh (funziona anche su Windows)
const esbuild = require('esbuild');
const fs = require('fs'), path = require('path');
esbuild.build({ entryPoints: [path.join(__dirname, '..', 'src', 'main.js')], bundle: true, minify: true, target: 'chrome53', format: 'iife', outfile: path.join(__dirname, '..', 'www', 'app.js'), logLevel: 'warning', define: { __VERSION__: JSON.stringify(require('../package.json').version) } })
  .then(() => console.log('OK: www/app.js ' + fs.statSync(path.join(__dirname, '..', 'www', 'app.js')).size + ' byte'))
  .catch(() => process.exit(1));
