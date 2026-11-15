// Convertitore al volo (ffmpeg) per i contenuti VOD che il player integrato non riesce a riprodurre o a "scorrere":
//  - codec non supportati (HEVC/H.265, AC3/E-AC3/DTS, container strani) -> video H.264 + audio AAC
//  - server senza supporto Range (timeline bloccata) -> ffmpeg legge il file da solo e riparte dal punto richiesto (-ss)
// Il flusso esce da un server HTTP locale (solo 127.0.0.1, con token casuale) come MP4 frammentato.
'use strict';
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { Readable } = require('stream');
const { net } = require('electron');

let ffPath = null, server = null, port = 0, token = '', userAgent = '';
const procs = new Set();

function ffmpegPath() {
  if (ffPath) return ffPath;
  let p = null;
  try { p = require('ffmpeg-static'); } catch (e) { /* */ }
  if (p) p = p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep).replace('app.asar/', 'app.asar.unpacked/');
  if (p && fs.existsSync(p)) return (ffPath = p);
  return (ffPath = 'ffmpeg'); // ffmpeg di sistema, se presente
}

function okUrl(u) { return /^(https?|file):\/\//i.test(String(u)); }
// ffmpeg non legge mai da Internet: passa da un relay locale (risoluzione DNS, HTTPS, redirect, User-Agent e proxy di sistema li gestisce Electron;
// i ffmpeg "statici" per Linux possono addirittura andare in crash risolvendo nomi di dominio).
function localSrc(u) {
  if (/^file:/i.test(u)) return fileURLToPath(u);
  return 'http://127.0.0.1:' + port + '/t/' + token + '/p?u=' + encodeURIComponent(u);
}
function inputArgs(u, ss) {
  const a = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-rw_timeout', '30000000'];
  if (ss > 0) a.push('-ss', String(ss));
  a.push('-i', localSrc(u));
  return a;
}

// Info sul file: durata, codec, tracce audio
function probe(url) {
  return start().then(() => new Promise(resolve => {
    if (!okUrl(url)) return resolve({ error: 'URL non valido' });
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', localSrc(url)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '', done = false;
    const fin = v => { if (done) return; done = true; clearTimeout(t); try { p.kill('SIGKILL'); } catch (e) { /* */ } resolve(v); };
    const t = setTimeout(() => fin({ error: 'Il server non risponde (timeout)' }), 30000);
    p.stderr.on('data', d => { err += d; if (err.length > 200000) err = err.slice(0, 200000); });
    p.on('error', e => fin({ error: 'ffmpeg non disponibile: ' + e.message }));
    p.on('close', () => {
      const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const dur = d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : 0;
      const v = /Stream #0:\d+[^:]*: Video: (\w+)/.exec(err);
      const audio = [];
      const re = /Stream #0:(\d+)(?:\((\w+)\))?[^:]*: Audio: (\w+)/g; let m;
      while ((m = re.exec(err))) audio.push({ idx: audio.length, lang: m[2] || '', codec: m[3] });
      if (!v && !audio.length) return fin({ error: (/(HTTP error \d+[^\n]*|Server returned[^\n]*|Connection[^\n]*|No such file[^\n]*|Invalid data[^\n]*)/.exec(err) || [])[1] || 'Formato non riconosciuto' });
      fin({ duration: dur, vcodec: v ? v[1] : '', audio: audio });
    });
  }));
}

// relay HTTP: inoltra a ffmpeg il file remoto con supporto Range
async function relay(req, res, src) {
  if (!/^https?:\/\//i.test(String(src))) { res.writeHead(400); return res.end(); }
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  try {
    const h = {}; if (req.headers.range) h.Range = req.headers.range; if (userAgent) h['User-Agent'] = userAgent;
    const r = await net.fetch(src, { headers: h, signal: ac.signal, redirect: 'follow', bypassCustomProtocolHandlers: true });
    const out = { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' };
    ['content-length', 'content-range', 'accept-ranges'].forEach(k => { const v = r.headers.get(k); if (v) out[k] = v; });
    res.writeHead(r.status, out);
    if (!r.body) return res.end();
    Readable.fromWeb(r.body).on('error', () => { try { res.end(); } catch (e) { /* */ } }).pipe(res);
  } catch (e) { try { if (!res.headersSent) res.writeHead(502); res.end(); } catch (x) { /* */ } }
}

function start() {
  return new Promise(resolve => {
    if (server) return resolve(port);
    token = crypto.randomBytes(12).toString('hex');
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const m = /^\/t\/([0-9a-f]+)\/([sp])$/.exec(u.pathname);
      if (!m || m[1] !== token) { res.writeHead(403); return res.end(); }
      if (m[2] === 'p') return relay(req, res, u.searchParams.get('u'));
      const src = u.searchParams.get('u'), ss = Math.max(0, parseFloat(u.searchParams.get('ss')) || 0), v = u.searchParams.get('v') || 'copy', a = u.searchParams.get('a') || 'copy', ai = parseInt(u.searchParams.get('ai'), 10) || 0;
      if (!okUrl(src)) { res.writeHead(400); return res.end(); }
      const args = inputArgs(src, ss).concat(['-map', '0:v:0?', '-map', '0:a:' + ai + '?', '-sn', '-dn']);
      if (v === 'copy') args.push('-c:v', 'copy'); else args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '23', '-pix_fmt', 'yuv420p', '-vf', 'scale=-2:min(ih\\,1080)');
      if (a === 'copy') args.push('-c:a', 'copy'); else args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
      args.push('-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
      const p = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
      procs.add(p);
      let err = '';
      p.stderr.on('data', d => { err += d; });
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      p.stdout.pipe(res);
      p.on('error', () => { try { res.end(); } catch (e) { /* */ } });
      p.on('close', () => { procs.delete(p); try { res.end(); } catch (e) { /* */ } });
      res.on('close', () => { try { p.kill('SIGKILL'); } catch (e) { /* */ } });
    });
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(port); });
  });
}

async function streamUrl(url, o) {
  o = o || {};
  await start();
  const q = new URLSearchParams({ u: url, ss: String(o.ss || 0), v: o.v || 'copy', a: o.a || 'copy', ai: String(o.ai || 0) });
  return 'http://127.0.0.1:' + port + '/t/' + token + '/s?' + q.toString();
}

function stopAll() { procs.forEach(p => { try { p.kill('SIGKILL'); } catch (e) { /* */ } }); procs.clear(); }
function setUserAgent(ua) { userAgent = String(ua || ''); }

module.exports = { probe, streamUrl, stopAll, setUserAgent };
