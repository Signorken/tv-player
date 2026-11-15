#!/bin/sh
# Compila src/ -> www/app.js (ES2015/Chromium 53+, compatibile con webOS 4 / Tizen 4 e successivi)
set -e
cd "$(dirname "$0")"
npx esbuild src/main.js --bundle --minify --target=chrome53 --format=iife --outfile=www/app.js --log-level=warning
echo "OK: www/app.js $(wc -c < www/app.js) byte"
