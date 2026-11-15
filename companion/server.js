#!/usr/bin/env node
/*
 * MAXENTA — companion (zero dipendenze, Node 14+)
 *
 * Fa tre cose, tutte sulla rete locale:
 *  1) RELAY: la TV non può fare da server HTTP, quindi il telefono parla con questo programma e la TV
 *     si collega a lui (Server-Sent Events). Così il telefono diventa tastiera, telecomando e
 *     può inviare playlist, sorgenti Xtream/NAS e URL da riprodurre.
 *  2) PROXY CORS: /proxy?url=... aggiunge gli header CORS, inoltra Range/PROPFIND/Authorization,
 *     decomprime i .gz (guide XMLTV) e riscrive i manifest HLS. Serve quando il server IPTV/NAS non
 *     manda CORS e la TV lo impone.
 *  3) HOSTING dell'app: /app/ serve la cartella www (utile per VIDAA/browser TV e per provare).
 *
 *  Avvio:   node server.js            (porta 8787)   PORT=9000 node server.js
 *  Opzioni: ALLOW_PUBLIC=1  consente client non-LAN (sconsigliato)   TOKEN=xxx  richiede ?token=xxx sul proxy
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const PORT = +process.env.PORT || 8787;
const ALLOW_PUBLIC = process.env.ALLOW_PUBLIC === '1';
const TOKEN = process.env.TOKEN || '';
const WWW = process.env.WWW || path.join(__dirname, '..', 'www');
const PHONE_PAGE = path.join(__dirname, 'remote.html');

const rooms = new Map(); // room -> { tv:Set<res>, phone:Set<res> }
function room(id) { id = String(id).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); if (!rooms.has(id)) rooms.set(id, { tv: new Set(), phone: new Set() }); return rooms.get(id); }

function isLan(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip) || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
}

function cors(res, extra) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PROPFIND');
  res.setHeader('Access-Control-Allow-Headers', '*, Authorization, Range, Depth, Content-Type, X-Proxy-Method');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  if (extra) for (const k in extra) res.setHeader(k, extra[k]);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sse(req, res, set) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', 'X-Accel-Buffering': 'no' });
  res.write(': ok\n\n');
  set.add(res);
  const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (e) { /* */ } }, 20000);
  req.on('close', () => { clearInterval(ka); set.delete(res); });
}
function broadcast(set, msg) {
  const data = 'data: ' + JSON.stringify(msg) + '\n\n';
  set.forEach(r => { try { r.write(data); } catch (e) { /* */ } });
  return set.size;
}

// ---- proxy
function proxy(req, res, u) {
  const target = u.searchParams.get('url');
  if (!target || !/^https?:\/\//i.test(target)) { res.writeHead(400); res.end('bad url'); return; }
  if (TOKEN && u.searchParams.get('token') !== TOKEN) { res.writeHead(403); res.end('forbidden'); return; }
  const gunzip = u.searchParams.get('gunzip') === '1';
  const auth = u.searchParams.get('auth');
  const method = (req.headers['x-proxy-method'] || req.method).toUpperCase();
  const headers = {};
  ['range', 'depth', 'content-type', 'if-range', 'user-agent'].forEach(h => { if (req.headers[h]) headers[h] = req.headers[h]; });
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (auth) headers.authorization = 'Basic ' + auth;
  if (!headers['user-agent']) headers['user-agent'] = 'TVPlayer/1.0';
  headers['accept-encoding'] = gunzip ? 'identity' : 'identity';

  let hops = 0;
  const go = (urlStr, bodyBuf) => {
    let tu; try { tu = new URL(urlStr); } catch (e) { res.writeHead(400); res.end('bad url'); return; }
    const lib = tu.protocol === 'https:' ? https : http;
    const h = Object.assign({}, headers, { host: tu.host });
    if (bodyBuf && bodyBuf.length) h['content-length'] = bodyBuf.length;
    const up = lib.request({ method: method, hostname: tu.hostname, port: tu.port || (tu.protocol === 'https:' ? 443 : 80), path: tu.pathname + tu.search, headers: h, rejectUnauthorized: false }, ur => {
      if ([301, 302, 303, 307, 308].indexOf(ur.statusCode) >= 0 && ur.headers.location && hops++ < 6) { ur.resume(); go(new URL(ur.headers.location, tu).toString(), bodyBuf); return; }
      const ct = String(ur.headers['content-type'] || '');
      const isM3U8 = /mpegurl/i.test(ct) || /\.m3u8?(\?|$)/i.test(tu.pathname);
      const out = {};
      ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'].forEach(k => { if (ur.headers[k]) out[k] = ur.headers[k]; });
      if (gunzip || isM3U8) delete out['content-length'];
      cors(res);
      if (isM3U8 && ur.statusCode === 200) {
        // riscrive gli URI del manifest in modo che passino dal proxy
        const chunks = []; ur.on('data', c => chunks.push(c));
        ur.on('end', () => {
          const base = tu.toString(); const self = '/proxy?' + (TOKEN ? 'token=' + encodeURIComponent(TOKEN) + '&' : '') + (auth ? 'auth=' + encodeURIComponent(auth) + '&' : '') + 'url=';
          const wrap = x => { try { return self + encodeURIComponent(new URL(x, base).toString()); } catch (e) { return x; } };
          const txt = Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map(l => {
            if (!l) return l;
            if (l[0] === '#') return l.replace(/URI="([^"]+)"/g, (m, g) => 'URI="' + wrap(g) + '"');
            return wrap(l.trim());
          }).join('\n');
          res.writeHead(ur.statusCode, Object.assign(out, { 'content-type': 'application/vnd.apple.mpegurl' })); res.end(txt);
        });
        return;
      }
      res.writeHead(ur.statusCode, out);
      let stream = ur;
      if (gunzip) { const gz = zlib.createGunzip(); gz.on('error', () => res.end()); ur.pipe(gz); stream = gz; }
      stream.pipe(res);
      req.on('close', () => { try { ur.destroy(); } catch (e) { /* */ } });
    });
    up.setTimeout(30000, () => up.destroy(new Error('timeout')));
    up.on('error', e => { if (!res.headersSent) { cors(res); res.writeHead(502); } res.end('proxy error: ' + e.message); });
    if (bodyBuf && bodyBuf.length) up.write(bodyBuf);
    up.end();
  };
  if (method === 'GET' || method === 'HEAD') go(target);
  else readBody(req, 5e6).then(b => go(target, b)).catch(() => { res.writeHead(413); res.end(); });
}

// ---- file statici dell'app
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(res, root, rel) {
  let p = path.normalize(path.join(root, rel)); if (p.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress;
  if (!ALLOW_PUBLIC && !isLan(ip)) { res.writeHead(403); res.end('LAN only'); return; }
  let u; try { u = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); res.end(); return; }
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
  const p = u.pathname;
  let m;
  if (p === '/proxy') return proxy(req, res, u);
  if (p === '/remote' || p === '/') { fs.readFile(PHONE_PAGE, (e, b) => { if (e) { res.writeHead(500); res.end('remote.html mancante'); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(b); }); return; }
  if (p === '/app') { res.writeHead(301, { Location: '/app/' }); res.end(); return; }
  if (p.indexOf('/app/') === 0) return serveStatic(res, WWW, p.slice(5));
  if ((m = /^\/r\/([A-Za-z0-9]+)\/(tv-events|phone-events)$/.exec(p))) {
    const r = room(m[1]); cors(res);
    sse(req, res, m[2] === 'tv-events' ? r.tv : r.phone);
    if (m[2] === 'phone-events') broadcast(r.tv, { t: 'hello' }); else broadcast(r.phone, { t: 'tv-online' });
    return;
  }
  if ((m = /^\/r\/([A-Za-z0-9]+)\/(to-tv|to-phone)$/.exec(p)) && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req, 30e6)).toString('utf8') || '{}');
      const r = room(m[1]); cors(res);
      const n = broadcast(m[2] === 'to-tv' ? r.tv : r.phone, body);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, delivered: n }));
    } catch (e) { cors(res); res.writeHead(400); res.end('bad request'); }
    return;
  }
  if (p === '/health') { cors(res); res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces(); const ips = [];
  Object.keys(nets).forEach(k => nets[k].forEach(n => { if (n.family === 'IPv4' && !n.internal) ips.push(n.address); }));
  console.log('MAXENTA companion in ascolto sulla porta ' + PORT);
  ips.forEach(ip => console.log('  indirizzo da inserire nella TV:  http://' + ip + ':' + PORT + '    |  app per browser TV: http://' + ip + ':' + PORT + '/app/'));
});
