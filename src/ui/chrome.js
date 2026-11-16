import { h } from '../core/util.js';
import { icon } from './icons.js';
import { router } from '../core/router.js';

// Barra superiore: titolo a sinistra, pulsanti a destra. buttons: [{label, icon, onclick}]
export function header(title, sub, buttons) {
  const right = h('div', { class: 'hd-r' });
  const btns = (buttons || []).map(b => {
    const e = h('div', { class: 'btn small' + (b.tab !== undefined ? ' tab' + (b.tab ? ' on' : '') : ''), 'data-f': 1, onclick: b.onclick }, b.icon ? icon(b.icon) : null, b.label ? h('span', { text: b.label }) : null);
    right.appendChild(e); return e;
  });
  const t = h('div', { class: 'hd-t', text: title }), s = h('div', { class: 'hd-s', text: sub || '' });
  const bk = h('div', { class: 'backbtn', title: 'Indietro', onclick: () => router.back() }, icon('back'));
  const el = h('div', { class: 'hd' }, h('div', { class: 'hd-l' }, bk, h('div', { class: 'hd-lt' }, t, s)), right);
  return { el: el, buttons: btns, setTitle: x => { t.textContent = x; }, setSub: x => { s.textContent = x || ''; } };
}

export function hints(list) {
  // list: [['red','Preferito'], ['green','Cerca'], ['ok','Guarda']]
  return h('div', { class: 'hints' }, list.map(x => h('div', { class: 'hint' }, h('span', { class: 'hk ' + x[0], text: ({ red: '', green: '', yellow: '', blue: '', ok: 'OK', menu: 'OK lungo', back: '↩' })[x[0]] }), h('span', { text: x[1] }))));
}

export function remPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }

export function img(cls) {
  const i = h('img', { class: cls || '' });
  i.decoding = 'async'; // decodifica fuori dal thread principale (scorrimento più fluido)
  i.onerror = () => { i.style.visibility = 'hidden'; i._bad = i.getAttribute('src'); };
  i.onload = () => { i.style.visibility = ''; };
  return i;
}
// immagini TMDB (usate da molti provider, a volte in risoluzione originale fino a 2000 px):
// si chiede direttamente la misura che serve. Decodificare una locandina enorme su una chiavetta costa più che disegnarla.
const TMDB = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(original|w\d+(_and_h\d+[a-z0-9_]*)?)(\/)/;
export function smallImg(src, big) {
  if (!src || src.indexOf('tmdb.org') < 0) return src;
  return src.replace(TMDB, '$1' + (big ? 'w500' : 'w342') + '$4');
}
export function setImg(i, src) {
  src = smallImg(src, i.classList && (i.classList.contains('ipost') || i.classList.contains('dpost')));
  const cur = i.getAttribute('src') || '';
  if (cur === (src || '')) return;
  if (!src) { i.removeAttribute('src'); i.style.visibility = 'hidden'; return; }
  i.style.visibility = 'hidden';
  i.setAttribute('src', src);
}
