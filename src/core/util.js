import { tr } from './i18n.js';
// Utility leggere, compatibili con Chromium datato (webOS 4 / Tizen 4+)
export const $ = (s, r) => (r || document).querySelector(s);

function flatten(a, out) {
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (Array.isArray(x)) flatten(x, out); else out.push(x);
  }
  return out;
}

// Mini "hyperscript": h('div', {class:'x', onclick:fn}, child, 'testo')
export function h(tag, props) {
  const e = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e[k] = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  const kids = flatten(Array.prototype.slice.call(arguments, 2), []);
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function pad(n, w) { let s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; }
export const clockOpt = { h12: false };
export function fmtClock(ms) {
  const d = new Date(ms), hh = d.getHours();
  if (clockOpt.h12) return ((hh % 12) || 12) + ':' + pad(d.getMinutes()) + (hh < 12 ? ' AM' : ' PM');
  return pad(hh) + ':' + pad(d.getMinutes());
}
export function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss);
}
export function fmtSize(b) {
  if (!b && b !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; b = Number(b);
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + ' ' + u[i];
}
export function tick() { return new Promise(r => setTimeout(r, 0)); }
export function debounce(fn, ms) {
  let t = null;
  const d = function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(() => fn.apply(self, a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export function norm(s) {
  s = String(s || '').toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/[^a-z0-9]+/g, '');
}
export function b64utf8(s) {
  try { return decodeURIComponent(escape(atob(s))); } catch (e) { try { return atob(s); } catch (e2) { return s || ''; } }
}
export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, g) => {
    switch (g) {
      case 'amp': return '&'; case 'lt': return '<'; case 'gt': return '>'; case 'quot': return '"'; case 'apos': return "'";
    }
    const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
    return isNaN(code) ? m : String.fromCharCode(code);
  });
}
const loaded = {};
export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error(tr('Impossibile caricare ') + src)); };
    document.head.appendChild(s);
  });
  return loaded[src];
}
export function extOf(u) {
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(u || '').split('?')[0] + (u && u.indexOf('?') > 0 ? '?' : ''));
  return m ? m[1].toLowerCase() : '';
}
