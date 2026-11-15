#!/bin/sh
# Prepara le cartelle pronte da impacchettare per ogni piattaforma in dist/
set -e
cd "$(dirname "$0")/.."
./build.sh
rm -rf dist && mkdir -p dist
for p in tizen webos vidaa web; do
  mkdir -p "dist/$p"
  cp -r www/. "dist/$p/"
  [ -d "packaging/$p" ] && cp -r packaging/$p/* "dist/$p/" 2>/dev/null || true
  # TV: guscio che si aggiorna da solo (vedi packaging/shell/loader.js)
  [ "$p" != web ] && node scripts/shell.js "dist/$p"
done
echo "OK:"
ls dist
echo
echo "Tizen:  tizen package -t wgt -s <profilo-certificato> -- dist/tizen"
echo "webOS:  ares-package dist/webos"
echo "VIDAA / browser TV: pubblica dist/vidaa su un web server o usa  node companion/server.js  -> http://IP:8787/app/"
echo "Android TV: packaging/android/setup.sh"
