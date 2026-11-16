// Guida TV a griglia: canali in verticale, orari in orizzontale (finestra di 2 ore che scorre).
// Leggera per le chiavette: si disegnano solo le righe visibili e la guida si scarica solo per quelle.
import { h, fmtClock } from '../core/util.js';
import { router } from '../core/router.js';
import { Epg } from '../core/epg.js';
import { header, hints, img, setImg, remPx } from '../ui/chrome.js';
import * as Modal from '../ui/modal.js';
import { liveOpts, startEpg } from '../core/session.js';
import { PlayerScreen } from './player.js';
import { Rail } from '../ui/shell.js';
import { tr } from '../core/i18n.js';

const SPAN = 2 * 3600000, STEP = 30 * 60000;
const floorStep = t => Math.floor(t / STEP) * STEP;

export class GuideScreen {
  constructor(src, channels, index, onIndex) {
    this.railId = 'live';
    this.src = src; this.chs = channels || []; this.onIndex = onIndex;
    this.row = Math.max(0, Math.min(this.chs.length - 1, index || 0)); this.top = 0;
    this.t0 = floorStep(Date.now()); this.ft = Date.now(); // ft = orario "a fuoco" quando si cambia riga
    this.req = {}; this.queue = []; this.busy = 0;
    this.hd = header(tr('Guida TV'), src.name, []);
    this.dT = h('div', { class: 'gdt' }); this.dM = h('div', { class: 'gdm' }); this.dP = h('div', { class: 'gdp' });
    this.detail = h('div', { class: 'gdet' }, this.dT, this.dM, this.dP);
    this.ruler = h('div', { class: 'gruler' });
    this.grid = h('div', { class: 'ggrid' });
    this.el = h('div', { class: 'screen guide' }, this.hd.el, this.detail, h('div', { class: 'ghead' }, h('div', { class: 'gcorner' }), this.ruler), this.grid,
      hints([['ok', tr('Guarda')], ['back', tr('Indietro')]]));
  }
  onHide() { clearInterval(this.tick); }
  destroy() { clearInterval(this.tick); }
  onShow(first) {
    // ogni 30 s: linea dell'ora attuale e programma "in onda" aggiornati
    clearInterval(this.tick); this.tick = setInterval(() => { if (router.current === this) this.render(); }, 30000);
    if (first && this.src.epgUrl) startEpg(this.src, this.chs, () => { if (router.current === this) this.render(); });
    this.layout(); this.render();
  }
  layout() {
    const H = this.grid.clientHeight || 400;
    this.rowH = Math.round(remPx() * 3.4);
    this.n = Math.max(3, Math.floor(H / this.rowH));
    if (this.rowEls && this.rowEls.length === this.n) return;
    this.grid.innerHTML = '';
    this.rowEls = [];
    for (let i = 0; i < this.n; i++) {
      const im = img(), num = h('span', { class: 'gnum' }), nm = h('span', { class: 'gname' });
      const track = h('div', { class: 'gtrack' });
      const r = h('div', { class: 'grow', style: 'height:' + this.rowH + 'px' }, h('div', { class: 'gch' }, num, h('div', { class: 'glogo' }, im), nm), track);
      r._im = im; r._num = num; r._nm = nm; r._track = track;
      this.grid.appendChild(r); this.rowEls.push(r);
    }
    this.nowLine = h('div', { class: 'gnow' });
  }
  // guida del canale; se manca (o è scaduta) la si richiede, al massimo una volta al minuto per canale
  progs(ch) {
    const l = Epg.list(ch), q = this.req[ch.id];
    if (!l && this.src.shortEpg && (!q || (q.st !== 'loading' && Date.now() - q.t > 60000))) { this.req[ch.id] = { st: 'loading', t: Date.now() }; this.queue.push(ch); this.pump(); }
    return l || [];
  }
  loading(ch) { const q = this.req[ch.id]; return !!q && q.st === 'loading'; }
  // al massimo 3 richieste alla volta al server
  pump() {
    while (this.busy < 3 && this.queue.length) {
      const ch = this.queue.shift();
      const vis = this.chs.indexOf(ch); if (vis < this.top || vis >= this.top + this.n) { delete this.req[ch.id]; continue; }
      this.busy++;
      let ok = false;
      this.src.shortEpg(ch, 12).then(l => { if (l && l.length) { Epg.setShort(ch, l); ok = true; } }).catch(() => {}).then(() => {
        this.req[ch.id] = { st: ok ? 'done' : 'fail', t: Date.now() };
        this.busy--; if (router.current === this) this.render(); this.pump();
      });
    }
  }
  render() {
    if (!this.chs.length) { this.dT.textContent = tr('Nessun canale'); return; }
    if (this.row < this.top) this.top = this.row;
    if (this.row >= this.top + this.n) this.top = this.row - this.n + 1;
    const t0 = this.t0, t1 = t0 + SPAN, now = Date.now();
    // righello orari
    this.ruler.innerHTML = '';
    for (let t = t0; t < t1; t += STEP) this.ruler.appendChild(h('div', { class: 'gtick', style: 'left:' + ((t - t0) / SPAN * 100) + '%', text: fmtClock(t) }));
    this.sel = null;
    for (let i = 0; i < this.n; i++) {
      const r = this.rowEls[i], ci = this.top + i, ch = this.chs[ci];
      r.style.visibility = ch ? '' : 'hidden';
      r._track.innerHTML = '';
      if (!ch) continue;
      r._num.textContent = ch.num || ''; r._nm.textContent = ch.name; setImg(r._im, ch.logo);
      r.classList.toggle('on', ci === this.row);
      const ps = this.progs(ch).filter(p => p[1] > t0 && p[0] < t1);
      if (ci === this.row) this.rowProgs = ps;
      if (!ps.length) {
        const b = h('div', { class: 'gprog empty', style: 'left:0;width:100%' }, h('span', { text: this.loading(ch) ? tr('Caricamento…') : tr('Guida programmi non disponibile') }));
        if (ci === this.row) { b.classList.add('focused'); this.sel = null; }
        r._track.appendChild(b);
      }
      ps.forEach(p => {
        const a = Math.max(p[0], t0), z = Math.min(p[1], t1);
        const b = h('div', { class: 'gprog' + (p[0] <= now && p[1] > now ? ' live' : '') + (p[1] <= now ? ' past' : ''), style: 'left:' + ((a - t0) / SPAN * 100) + '%;width:' + ((z - a) / SPAN * 100) + '%' }, h('span', { text: p[2] }));
        if (ci === this.row && p[0] <= this.ft && p[1] > this.ft) { b.classList.add('focused'); this.sel = p; }
        r._track.appendChild(b);
      });
      if (ci === this.row && ps.length && !this.sel) { // nessun programma sull'orario a fuoco: il più vicino
        let best = ps[0]; ps.forEach(p => { if (Math.abs(p[0] - this.ft) < Math.abs(best[0] - this.ft)) best = p; });
        this.sel = best; this.ft = Math.max(best[0], t0) + 1;
        r._track.children[ps.indexOf(best)].classList.add('focused');
      }
    }
    if (now >= t0 && now < t1) { this.nowLine.style.left = ((now - t0) / SPAN * 100) + '%'; this.nowLine.style.height = (this.ruler.offsetHeight + this.grid.clientHeight) + 'px'; this.ruler.appendChild(this.nowLine); }
    // dettaglio del programma selezionato
    const ch = this.chs[this.row], p = this.sel;
    this.dT.textContent = p ? p[2] : ch.name;
    this.dM.textContent = (ch.num ? ch.num + '  ' : '') + ch.name + (p ? '  ·  ' + fmtClock(p[0]) + '–' + fmtClock(p[1]) + (p[0] <= now && p[1] > now ? '  ·  ' + tr('in onda') : '') : '');
    this.dP.textContent = p && p[3] ? p[3] : '';
  }
  moveRow(d) {
    const n = Math.max(0, Math.min(this.chs.length - 1, this.row + d));
    if (n === this.row) return;
    this.row = n; this.render();
  }
  moveProg(d) {
    const ps = this.rowProgs || [], i = this.sel ? ps.indexOf(this.sel) : -1;
    const nx = i >= 0 ? ps[i + d] : null;
    if (nx) { this.ft = Math.max(nx[0], this.t0) + 1; if (nx[0] >= this.t0 + SPAN - STEP / 2 || nx[1] <= this.t0 + STEP / 2) this.t0 = floorStep(nx[0]); this.render(); return; }
    // fuori dalla finestra: sposta l'orario di mezz'ora
    const min = floorStep(Date.now() - 2 * 3600000), max = floorStep(Date.now() + 24 * 3600000);
    const t = Math.max(min, Math.min(max, this.t0 + d * STEP));
    if (t === this.t0) return;
    this.t0 = t; this.ft = d > 0 ? t + SPAN - STEP + 1 : t + 1; this.render();
  }
  async ok() {
    const ch = this.chs[this.row], p = this.sel, now = Date.now();
    if (!ch) return;
    if (p && p[0] > now) {
      const go = await Modal.confirm(p[2], fmtClock(p[0]) + '–' + fmtClock(p[1]) + '  ·  ' + ch.name + (p[3] ? '\n\n' + p[3] : ''), tr('Guarda il canale'), tr('Chiudi'));
      if (!go) return;
    }
    if (this.onIndex) this.onIndex(this.row);
    router.push(new PlayerScreen(liveOpts(this.src, this.chs, this.row)));
  }
  onRailEnter() { }
  onKey(a) {
    const k = a.a;
    if (k === 'up') { this.moveRow(-1); return true; }
    if (k === 'down') { this.moveRow(1); return true; }
    if (k === 'chup' || k === 'pageup') { this.moveRow(-this.n); return true; }
    if (k === 'chdown' || k === 'pagedown') { this.moveRow(this.n); return true; }
    if (k === 'right') { this.moveProg(1); return true; }
    if (k === 'left') {
      // a inizio giornata (ora attuale, primo programma) Sinistra porta alla barra laterale
      const ps = this.rowProgs || [], first = !this.sel || ps.indexOf(this.sel) <= 0;
      if (first && this.t0 <= floorStep(Date.now())) { Rail.enter(); return true; }
      this.moveProg(-1); return true;
    }
    if (k === 'ok') { this.ok(); return true; }
    if (k === 'back' && this.onIndex) this.onIndex(this.row);
    return false;
  }
}
