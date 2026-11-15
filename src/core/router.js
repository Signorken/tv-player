// Router a pila: ogni schermata ha { el, onShow(first), onHide(), onKey(a,e), destroy() }
import * as nav from './nav.js';

const stack = [];
let box = null;

export const router = {
  init(el) { box = el; },
  get current() { return stack.length ? stack[stack.length - 1] : null; },
  get depth() { return stack.length; },

  push(screen) {
    const cur = this.current;
    if (cur) { cur._lf = nav.getFocus(); cur.el.style.display = 'none'; if (cur.onHide) cur.onHide(); }
    if (screen.el.parentNode !== box) box.appendChild(screen.el);
    stack.push(screen);
    nav.setScope(screen.el);
    if (screen.onShow) screen.onShow(true);
    this._chg();
    return screen;
  },

  // toglie la schermata corrente dalla pila SENZA distruggerla (es. player ridotto a finestrella)
  detach(screen) {
    if (this.current !== screen || stack.length < 2) return false;
    stack.pop();
    const p = this.current;
    p.el.style.display = '';
    nav.setScope(p.el);
    if (p.onShow) p.onShow(false);
    if (p._lf && document.body.contains(p._lf)) nav.focus(p._lf, true);
    this._chg();
    return true;
  },

  back() {
    if (stack.length < 2) return false;
    const s = stack.pop();
    if (s.onHide) s.onHide();
    if (s.destroy) s.destroy();
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    const p = this.current;
    p.el.style.display = '';
    nav.setScope(p.el);
    if (p.onShow) p.onShow(false);
    if (p._lf && document.body.contains(p._lf)) nav.focus(p._lf, true);
    this._chg();
    return true;
  },

  // sostituisce la schermata corrente (es. dopo il salvataggio di un form)
  replace(screen) {
    const s = stack.pop();
    if (s) { if (s.onHide) s.onHide(); if (s.destroy) s.destroy(); if (s.el.parentNode) s.el.parentNode.removeChild(s.el); }
    const cur = this.current;
    if (cur) cur.el.style.display = 'none';
    box.appendChild(screen.el);
    stack.push(screen);
    nav.setScope(screen.el);
    if (screen.onShow) screen.onShow(true);
    this._chg();
  },

  onChange: null,
  _chg() { if (this.onChange) this.onChange(); },
  home() { while (stack.length > 1) this.back(); }
};
