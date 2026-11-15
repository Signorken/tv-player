// Rete: fetch con timeout, Basic auth, fallback automatico sul proxy CORS del companion.
import { settings } from './store.js';

function withTimeout(p, ms, ctl) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { /* */ } rej(new Error('Timeout')); }, ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}

export function proxyBase() {
  return (settings().companion || '').replace(/\/+$/, '');
}

export function isProxied(url) {
  const b = proxyBase();
  return !!b && (url.indexOf(b + '/proxy?') === 0 || url.indexOf('/proxy?') === 0);
}

export function viaProxy(url, opts) {
  const b = proxyBase();
  if (!b || isProxied(url)) return url;
  let q = b + '/proxy?url=' + encodeURIComponent(url);
  if (opts && opts.auth) q += '&auth=' + encodeURIComponent(btoa(opts.auth));
  if (opts && opts.gunzip) q += '&gunzip=1';
  return q;
}

// URL per elementi media (video): usa il proxy solo se richiesto nelle impostazioni
export function mediaUrl(url, auth) {
  if (settings().proxyMedia && proxyBase()) return viaProxy(url, { auth: auth });
  return url;
}

export async function request(url, o) {
  o = o || {};
  const timeout = o.timeout || 25000;
  const headers = o.headers ? Object.assign({}, o.headers) : {};
  if (o.auth) headers['Authorization'] = 'Basic ' + btoa(unescape(encodeURIComponent(o.auth)));
  const attempt = (u, hdr) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const init = { method: o.method || 'GET', headers: hdr, body: o.body, signal: ctl ? ctl.signal : undefined, cache: 'no-store' };
    return withTimeout(fetch(u, init), timeout, ctl);
  };
  let res;
  if (o.forceProxy && proxyBase()) {
    res = await attempt(viaProxy(url, { auth: o.auth, gunzip: o.gunzip }), o.method ? { 'Content-Type': 'text/xml' } : {});
  } else {
    try {
      res = await attempt(url, headers);
    } catch (e) {
      if (!proxyBase() || /Timeout/.test(e.message)) throw e;
      // probabile blocco CORS / mixed content: riprova tramite companion
      const ph = {};
      if (o.headers && o.headers.Depth) ph.Depth = o.headers.Depth;
      if (o.method) ph['X-Proxy-Method'] = o.method;
      res = await attempt(viaProxy(url, { auth: o.auth, gunzip: o.gunzip }), ph);
    }
  }
  if (!res.ok && res.status !== 207) {
    const hint = { 401: 'credenziali non valide', 403: 'accesso negato (limite connessioni, IP o app non consentiti dal provider)', 404: 'risorsa non trovata', 429: 'troppe richieste o connessioni simultanee', 458: 'limite connessioni raggiunto', 509: 'limite connessioni raggiunto', 884: 'limite connessioni raggiunto' }[res.status];
    const e = new Error('HTTP ' + res.status + (hint ? ' - ' + hint : '')); e.status = res.status; throw e;
  }
  return res;
}

export async function fetchText(url, o) { return (await request(url, o)).text(); }
export async function fetchJSON(url, o) {
  const t = await fetchText(url, o);
  try { return JSON.parse(t); } catch (e) { throw new Error('Risposta non valida dal server'); }
}

// testo di un file eventualmente .gz
export async function fetchMaybeGz(url, o) {
  o = o || {};
  if (/\.gz(\?|$)/i.test(url)) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const r = await request(url, o);
        return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      } catch (e) { /* fallback proxy */ }
    }
    if (proxyBase()) return fetchText(url, Object.assign({}, o, { forceProxy: true, gunzip: true, timeout: 90000 }));
    throw new Error('File .gz: serve il companion (gunzip) su questo televisore');
  }
  return fetchText(url, Object.assign({ timeout: 90000 }, o));
}
