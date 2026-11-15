// Stack di finestre modali: menu, conferme, toast
import { h } from '../core/util.js';
import * as nav from '../core/nav.js';
import { icon } from './icons.js';

const stack = [];
let root = null;
function layer() { return root || (root = document.getElementById('modals')); }

export function top() { return stack.length ? stack[stack.length - 1] : null; }

export function open(content, o) {
  o = o || {};
  const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal ' + (o.cls || '') }, content));
  const m = {
    el: back, cancelable: o.cancelable !== false, onKey: o.onKey || null,
    prevScope: nav.getScope(), prevFocus: nav.getFocus(),
    close(result) {
      const i = stack.indexOf(m); if (i < 0) return;
      stack.splice(i, 1); back.parentNode && back.parentNode.removeChild(back);
      nav.setScope(m.prevScope); if (m.prevFocus && document.body.contains(m.prevFocus)) nav.focus(m.prevFocus, true);
      if (m.onClose) m.onClose(result);
    }
  };
  layer().appendChild(back);
  stack.push(m);
  nav.setScope(back);
  if (o.focus) nav.focus(o.focus); else nav.focusFirst(back);
  return m;
}

// menu(titolo, [{label, sub, value, icon, danger}]) -> Promise<value|null>
export function menu(title, items, o) {
  return new Promise(res => {
    let m;
    const rows = items.map(it => h('div', {
      class: 'mrow' + (it.danger ? ' danger' : ''), 'data-f': 1,
      onclick: () => m.close(it.value)
    }, it.icon ? icon(it.icon) : null, h('div', { class: 'mtxt' }, h('div', { class: 'm1', text: it.label }), it.sub ? h('div', { class: 'm2', text: it.sub }) : null)));
    const box = h('div', { class: 'mlist', 'data-scroll': 1 }, rows);
    m = open([h('div', { class: 'mtitle', text: title }), box], { cls: 'menu' });
    m.onClose = r => res(r === undefined ? null : r);
    if (o && o.focusIndex != null && rows[o.focusIndex]) nav.focus(rows[o.focusIndex]);
  });
}

export function confirm(title, text, yes, no) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (done) return; done = true; m.close(v); res(v); };
    const m = open([
      h('div', { class: 'mtitle', text: title }),
      text ? h('div', { class: 'mbody', text: text }) : null,
      h('div', { class: 'mbtns' },
        h('div', { class: 'btn', 'data-f': 1, onclick: () => fin(false), text: no || 'Annulla' }),
        h('div', { class: 'btn primary', 'data-f': 1, onclick: () => fin(true), text: yes || 'OK' }))
    ], { cls: 'confirm' });
    m.onClose = () => { if (!done) { done = true; res(false); } };
    nav.focus(m.el.querySelector('.btn.primary'));
  });
}

let toastT = null;
export function toast(msg, ms) {
  let t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.className = 'show';
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = ''; }, ms || 3200);
}
