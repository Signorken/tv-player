// Ricerca di NAS e server multimediali nella rete locale: SSDP (DLNA/UPnP) + mDNS (WebDAV/HTTP/SMB)
'use strict';
const dgram = require('dgram');
const os = require('os');
const { decode } = require('./dlna');

function lanAddrs() {
  const out = [], ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(n => (ifs[n] || []).forEach(a => { if (a.family === 'IPv4' && !a.internal) out.push(a.address); }));
  return out;
}

function ssdp(ms) {
  return new Promise(resolve => {
    const found = {}, socks = [];
    const msg = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n');
    lanAddrs().forEach(addr => {
      try {
        const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        s.on('error', () => { try { s.close(); } catch (e) { /* */ } });
        s.on('message', buf => { const m = /^location:\s*(\S+)/im.exec(buf.toString()); if (m) found[m[1]] = 1; });
        s.bind(0, addr, () => { try { s.send(msg, 1900, '239.255.255.250'); setTimeout(() => { try { s.send(msg, 1900, '239.255.255.250'); } catch (e) { /* */ } }, 700); } catch (e) { /* */ } });
        socks.push(s);
      } catch (e) { /* NIC non utilizzabile */ }
    });
    setTimeout(() => { socks.forEach(s => { try { s.close(); } catch (e) { /* */ } }); resolve(Object.keys(found)); }, ms);
  });
}

async function describe(location) {
  try {
    const r = await fetch(location, { signal: AbortSignal.timeout(3500) });
    const xml = await r.text();
    const name = (/<friendlyName>([^<]*)/.exec(xml) || [])[1];
    const svc = /<service>[\s\S]*?ContentDirectory[\s\S]*?<\/service>/i.exec(xml);
    const cu = svc && /<controlURL>([^<]*)/i.exec(svc[0]);
    if (!cu) return null;
    const base = (/<URLBase>([^<]*)/.exec(xml) || [])[1] || location;
    const control = new URL(decode(cu[1]), base).href;
    return { kind: 'dlna', name: decode(name || 'Server DLNA'), url: new URL(location).origin, host: new URL(location).hostname, control: control };
  } catch (e) { return null; }
}

function mdns(ms) {
  return new Promise(resolve => {
    let Bonjour; try { Bonjour = require('bonjour-service').Bonjour; } catch (e) { return resolve([]); }
    const res = [], seen = {};
    let b;
    try { b = new Bonjour(); } catch (e) { return resolve([]); }
    const NAS = /nas|diskstation|synology|qnap|truenas|freenas|unraid|media|plex|jellyfin|emby|nextcloud|files|miniserve|openmediavault|omv|cloud/i;
    const add = (type, kind) => {
      try {
        b.find({ type: type }, svc => {
          const ip = (svc.addresses || []).filter(a => /^\d+\.\d+\.\d+\.\d+$/.test(a))[0] || svc.host;
          if (!ip) return;
          const key = kind + ip + svc.port; if (seen[key]) return; seen[key] = 1;
          const path = (svc.txt && (svc.txt.path || svc.txt.PATH)) || '/';
          if (kind === 'http' && !NAS.test(svc.name || '')) return; // _http._tcp annuncia anche stampanti e router
          const scheme = type === 'webdavs' ? 'https' : 'http';
          res.push({ kind: kind, name: svc.name, host: ip, url: kind === 'smb' ? 'smb://' + ip : scheme + '://' + ip + ':' + svc.port + (String(path).charAt(0) === '/' ? path : '/' + path) });
        });
      } catch (e) { /* */ }
    };
    add('webdav', 'webdav'); add('webdavs', 'webdav'); add('http', 'http'); add('smb', 'smb');
    setTimeout(() => { try { b.destroy(); } catch (e) { /* */ } resolve(res); }, ms);
  });
}

async function discover(ms) {
  ms = Math.max(1500, Math.min(10000, ms || 4000));
  const [locs, md] = await Promise.all([ssdp(ms), mdns(ms)]);
  const dl = (await Promise.all(locs.map(describe))).filter(Boolean);
  const out = [], seen = {};
  dl.concat(md).forEach(d => { const k = d.kind + '|' + d.host + '|' + (d.control || d.url); if (!seen[k]) { seen[k] = 1; out.push(d); } });
  return out;
}

module.exports = { discover };
