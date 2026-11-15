// Lista/griglia virtualizzata: solo ~20 nodi DOM, anche con 50.000 canali.
// Gestisce da sola la selezione e i tasti direzionali.
import { h } from '../core/util.js';
import { Sel } from './sound.js';

export class VList {
  /**
   * opts: { cols=1, rowH (px o function(width)->px), build(): node, fill(node,item,index), onSelect(item,i), onChange(item,i), onEdge(dir), onMenu(item,i) }
   */
  constructor(opts) {
    this.o = opts; this.cols = opts.cols || 1;
    this.items = []; this.sel = 0; this.top = 0; this.active = false;
    this.pool = [];
    this.inner = h('div', { class: 'vl-in' });
    this.el = h('div', { class: 'vl' + (this.cols > 1 ? ' vl-grid' : '') }, this.inner);
    this.W = 0; this.H = 0; this.rowH = 60;
    this._wh = 0;
    // rotella del mouse: scorre di qualche riga alla volta (accumula i micro-scatti dei touchpad)
    this.el.addEventListener('wheel', ev => {
      if (!this.items.length) return;
      ev.preventDefault();
      this._wh += ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaY;
      const steps = Math.trunc(this._wh / 60);
      if (steps) { this._wh -= steps * 60; this.select(this.sel + steps * this.cols * (ev.shiftKey ? 5 : 1)); }
    }, { passive: false });
  }

  _click(n, ev) {
    if (n._idx == null || !this.items.length) return;
    const i = n._idx, was = this.sel === i && this.active;
    if (!this.active) { this.active = true; if (this.o.onActivate) this.o.onActivate(); }
    if (this.sel !== i) this.select(i); else this.render();
    // un clic: seleziona e, se non è richiesto il doppio clic, apre subito
    if (this.o.clickOpen === false && !was) return;
    if (this.o.onSelect) this.o.onSelect(this.items[i], i);
  }

  measure() {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !H) return false;
    this.W = W; this.H = H;
    const rh = typeof this.o.rowH === 'function' ? this.o.rowH(W) : this.o.rowH;
    // dimensioni invariate e nodi già pronti: niente da riscrivere (evita ricalcoli di stile a ogni tasto)
    if (rh === this.rowH && W === this._mW && H === this._mH && this.pool.length) return true;
    this._mW = W; this._mH = H;
    this.rowH = rh;
    this.visRows = Math.max(1, Math.floor(H / rh));
    const need = (Math.ceil(H / rh) + 1) * this.cols;
    while (this.pool.length < need) {
      const n = this.o.build();
      n.classList.add('vl-row');
      n.style.position = 'absolute';
      n.addEventListener('click', ev => this._click(n, ev));
      n.addEventListener('contextmenu', ev => { if (n._idx == null) return; ev.preventDefault(); this.select(n._idx, true); if (this.o.onMenu) this.o.onMenu(this.items[n._idx], n._idx); });
      this.inner.appendChild(n);
      this.pool.push(n);
    }
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].style.height = rh + 'px';
      this.pool[i].style.width = (W / this.cols) + 'px';
    }
    return true;
  }

  setItems(items, keep) {
    this.items = items || [];
    if (!keep) { this.sel = 0; this.top = 0; }
    else if (this.sel >= this.items.length) this.sel = Math.max(0, this.items.length - 1);
    this.render();
  }

  setActive(a) { this.active = a; this.render(); }
  current() { return this.items[this.sel]; }
  select(i, silent) {
    if (!this.items.length) return;
    const ns = Math.max(0, Math.min(this.items.length - 1, i));
    if (ns !== this.sel) Sel.v++;
    this.sel = ns;
    this.render();
    if (!silent && this.o.onChange) this.o.onChange(this.items[this.sel], this.sel);
  }

  render() {
    if (!this.measure()) { this._pending = true; return; }
    const cols = this.cols, n = this.items.length;
    const totalRows = Math.ceil(n / cols);
    const selRow = Math.floor(this.sel / cols);
    // scroll "centrato"
    let top = selRow - Math.floor((this.visRows - 1) / 2);
    top = Math.max(0, Math.min(top, Math.max(0, totalRows - this.visRows)));
    this.top = top;
    const cw = this.W / cols;
    for (let k = 0; k < this.pool.length; k++) {
      const node = this.pool[k];
      const row = top + Math.floor(k / cols), col = k % cols;
      const idx = row * cols + col;
      if (idx >= n || row >= totalRows) { if (!node._hid) { node._hid = true; node.style.display = 'none'; } continue; }
      if (node._hid !== false) { node._hid = false; node.style.display = ''; }
      const tx = 'translate(' + (col * cw) + 'px,' + ((row - top) * this.rowH) + 'px)';
      if (node._tx !== tx) { node._tx = tx; node.style.transform = tx; }
      this.o.fill(node, this.items[idx], idx);
      const on = this.active && idx === this.sel;
      if (node._on !== on) { node._on = on; node.classList.toggle('focused', on); }
      const isSel = idx === this.sel;
      if (node._sel !== isSel) { node._sel = isSel; node.classList.toggle('sel', isSel); }
      node._idx = idx;
    }
  }

  // da chiamare quando il contenitore diventa visibile
  relayout() { this._pending = false; this.render(); }

  handleKey(a) {
    const cols = this.cols, n = this.items.length;
    if (a === 'down') {
      if (this.sel + cols < n) { this.select(this.sel + cols); return true; }
      if (cols > 1 && Math.floor(this.sel / cols) < Math.floor((n - 1) / cols)) { this.select(n - 1); return true; }
      if (this.o.onEdge) return !!this.o.onEdge('down');
      return true;
    }
    if (a === 'up') {
      if (this.sel - cols >= 0) { this.select(this.sel - cols); return true; }
      if (this.o.onEdge) return !!this.o.onEdge('up');
      return true;
    }
    if (a === 'left') {
      if (cols > 1 && this.sel % cols > 0) { this.select(this.sel - 1); return true; }
      if (this.o.onEdge) return !!this.o.onEdge('left');
      return false;
    }
    if (a === 'right') {
      if (cols > 1 && this.sel % cols < cols - 1 && this.sel + 1 < n) { this.select(this.sel + 1); return true; }
      if (this.o.onEdge) return !!this.o.onEdge('right');
      return false;
    }
    if (a === 'chdown') { this.select(this.sel + this.visRows * cols); return true; }
    if (a === 'chup') { this.select(this.sel - this.visRows * cols); return true; }
    if (a === 'ok') { if (n && this.o.onSelect) this.o.onSelect(this.items[this.sel], this.sel); return true; }
    if (a === 'menu') { if (n && this.o.onMenu) this.o.onMenu(this.items[this.sel], this.sel); return true; }
    // salto rapido con le cifre (prime lettere) non gestito qui
    return false;
  }
}
