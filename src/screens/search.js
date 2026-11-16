// Ricerca unica: canali, film e serie della sorgente scelta in alto, in tre gruppi.
import { h } from '../core/util.js';
import * as store from '../core/store.js';
import * as nav from '../core/nav.js';
import { router } from '../core/router.js';
import { header, hints, img, setImg } from '../ui/chrome.js';
import { promptText } from '../ui/keyboard.js';
import * as Modal from '../ui/modal.js';
import { openSource, liveOpts, showLoading, hideLoading } from '../core/session.js';
import { PlayerScreen } from './player.js';
import { DetailScreen } from './detail.js';
import { tr } from '../core/i18n.js';

const MAX = 40; // per gruppo: abbastanza per trovare, poco per la memoria della TV
function fold(s) {
  s = String(s || '').toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s;
}
// tutte le parole cercate devono comparire nel titolo (in qualsiasi ordine)
function matcher(q) {
  const w = fold(q).split(/\s+/).filter(Boolean);
  return name => { const n = fold(name); for (let i = 0; i < w.length; i++) if (n.indexOf(w[i]) < 0) return false; return true; };
}

export class SearchScreen {
  constructor(query) {
    this.railId = 'search';
    this.query = query || '';
    this.hd = header(tr('Cerca'), '', [{ icon: 'search', label: tr('Nuova ricerca'), onclick: () => this.ask() }]);
    this.body = h('div', { class: 'sbody2', 'data-scroll': 1 });
    this.el = h('div', { class: 'screen search' }, this.hd.el, this.body, hints([['ok', tr('Apri')], ['back', tr('Indietro')]]));
  }
  async onShow(first) {
    if (!first) return;
    if (!this.query) { const ok = await this.ask(true); if (!ok) router.back(); return; }
    this.run();
  }
  async ask(first) {
    const q = await promptText({ title: tr('Cerca canali, film e serie'), value: this.query, quick: false, hint: tr('Cerca nella sorgente scelta in alto') });
    if (q === null || !q.trim()) { if (!first && this.firstEl) nav.focus(this.firstEl); return false; }
    this.query = q.trim(); this.run(); return true;
  }
  async run() {
    const cfg = store.activeSource();
    if (!cfg) { Modal.toast(tr('Nessuna sorgente')); return; }
    let src;
    try { src = this.src = await openSource(cfg); } catch (e) { Modal.toast(tr('Errore: ') + e.message, 5000); return; }
    showLoading(tr('Ricerca…'), '“' + this.query + '”');
    const m = matcher(this.query), safe = p => Promise.resolve().then(p).catch(() => null);
    const r = await Promise.all([safe(() => src.live()), safe(() => src.vodItems('')), safe(() => src.seriesItems ? src.seriesItems('') : [])]);
    hideLoading();
    const live = r[0] ? r[0].items.filter(c => m(c.name)) : [];
    const movies = (r[1] || []).filter(x => m(x.name)), series = (r[2] || []).filter(x => m(x.name));
    this.hd.setSub(cfg.name + ' · “' + this.query + '”');
    this.render(live, movies, series);
  }
  render(live, movies, series) {
    this.body.innerHTML = ''; this.body.scrollTop = 0; this.firstEl = null;
    const sec = (title, list, card) => {
      if (!list.length) return;
      this.body.appendChild(h('div', { class: 'conthd' }, h('div', { class: 'contt', text: title }), h('span', { class: 'contnote', text: list.length > MAX ? MAX + ' / ' + list.length : String(list.length) })));
      const box = h('div', { class: 'sgrid' });
      list.slice(0, MAX).forEach((it, i) => { const c = card(it, i); box.appendChild(c); if (!this.firstEl) this.firstEl = c; });
      this.body.appendChild(box);
    };
    sec(tr('Canali'), live, (ch, i) => {
      const im = img(); setImg(im, ch.logo);
      return h('div', { class: 'ccard lcard', 'data-f': 1, onclick: () => router.push(new PlayerScreen(liveOpts(this.src, live, i))) }, h('div', { class: 'cthumb' }, im), h('div', { class: 'cname', text: ch.name }));
    });
    const vcard = kind => it => {
      const im = img(); setImg(im, it.poster);
      return h('div', { class: 'ccard', 'data-f': 1, onclick: () => router.push(new DetailScreen(this.src, kind, it)) },
        h('div', { class: 'cthumb' }, im, h('div', { class: 'kbadge ' + (kind === 'series' ? 'k-s' : 'k-m'), text: kind === 'series' ? tr('SERIE TV') : tr('FILM') })), h('div', { class: 'cname', text: it.name }));
    };
    sec(tr('Film'), movies, vcard('movie'));
    sec(tr('Serie TV'), series, vcard('series'));
    if (!this.firstEl) {
      this.body.appendChild(h('div', { class: 'empty' }, h('div', { class: 'e1', text: tr('Nessun risultato') }), h('div', { class: 'e2', text: tr('Prova con meno parole o controlla come è scritto il titolo.') })));
      nav.focus(this.hd.buttons[0]);
    } else nav.focus(this.firstEl);
  }
  onRailEnter() { }
  onKey(a) {
    if (a.a === 'green') { this.ask(); return true; }
    return false;
  }
}
