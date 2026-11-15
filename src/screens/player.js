// Schermata di riproduzione a tutto schermo (live con zapping, film/episodi con seek e ripresa)
import { h, fmtClock, fmtDur } from '../core/util.js';
import * as store from '../core/store.js';
import { Epg } from '../core/epg.js';
import { Engine } from '../ui/engine.js';
import * as Modal from '../ui/modal.js';
import { icon } from '../ui/icons.js';
import { platform, toggleFullscreen } from '../core/platform.js';
import { router } from '../core/router.js';
import * as nav from '../core/nav.js';
import { VList } from '../ui/vlist.js';
import { remPx } from '../ui/chrome.js';
import { Rail } from '../ui/shell.js';
import { startEpg } from '../core/session.js';

// Finestrella: un solo player alla volta può restare attivo in un angolo mentre si naviga
Rail.mini = () => Mini.player && Mini.player.cur ? Mini.player.cur.title : '';
Rail.onRoute = () => { if (Mini.focused) { Mini.focused = false; if (Mini.player) Mini.player.el.classList.remove('mfocus'); } };
Rail.expandMini = () => { if (Mini.player) { Mini.unfocus(); Mini.player.expand(); } };
export const Mini = { player: null, focused: false, _prev: null,
  close() { const p = this.player; this.unfocus(); this.player = null; if (p) { p.destroy(); if (p.el.parentNode) p.el.parentNode.removeChild(p.el); } Rail.sync(); },
  // la finestrella si raggiunge col cursore (Giù/Destra dal bordo dello schermo)
  focusFrom(dir) {
    const p = this.player; if (!p || this.focused || (dir !== 'down' && dir !== 'right')) return false;
    this._prev = nav.getFocus(); if (this._prev) this._prev.classList.remove('focused');
    const s = router.current; if (s && s.onRailEnter) s.onRailEnter();
    this.focused = true; p.el.classList.add('mfocus'); return true;
  },
  unfocus() {
    if (!this.focused) return;
    this.focused = false; if (this.player) this.player.el.classList.remove('mfocus');
    const s = router.current;
    if (s && s.onRailExit) s.onRailExit();
    else if (this._prev && document.body.contains(this._prev)) nav.focus(this._prev, true);
  },
  onFocusKey(a) {
    const k = a.a;
    if (k === 'ok') { this.unfocus(); this.player.expand(); return true; }
    if (k === 'menu') { this.menu(); return true; }
    if (k === 'up' || k === 'left' || k === 'back') { this.unfocus(); return true; }
    return k === 'down' || k === 'right';
  },
  async menu() {
    const r = await Modal.menu(this.player.cur ? this.player.cur.title : 'In riproduzione', [{ label: 'Torna a schermo intero', value: 'x', icon: 'full' }, { label: 'Chiudi la finestrella', value: 'c', icon: 'x' }]);
    if (r === 'x') { this.unfocus(); this.player.expand(); } else if (r === 'c') this.close();
  },
  onKey(a) {
    const p = this.player; if (!p) return false;
    if (a.a === 'blue' || a.a === 'playpause' || a.a === 'play') { this.unfocus(); p.expand(); return true; }
    if (a.a === 'stop') { this.close(); return true; }
    if (a.a === 'pause') { p.video.pause(); return true; }
    return false;
  } };

/*
 opts: {
   list: [item], index, kind: 'live'|'vod',
   resolve(item) -> { url, alt, title, sub, logo, key, num, ch (canale per EPG), src (sorgente per EPG breve), info }
   onIndex(i), onClose()
 }
*/
export class PlayerScreen {
  constructor(opts) {
    this.isPlayer = true;
    this.o = opts; this.i = opts.index || 0; this.live = opts.kind === 'live';
    this.video = h('video', { class: 'pv', playsinline: true, autoplay: true });
    this.info = h('div', { class: 'pinfo' });
    this.spin = h('div', { class: 'pspin' }, h('div', { class: 'spinner' }), h('div', { class: 'ptxt', text: 'Caricamento…' }));
    this.msg = h('div', { class: 'pmsg' });
    this.seekBox = h('div', { class: 'pseek' });
    this.numBox = h('div', { class: 'pnum' });
    this.clock = h('div', { class: 'pclock' });
    this.miniUi = h('div', { class: 'miniui' }, h('div', { class: 'mini-t' }), h('div', { class: 'mini-h', text: platform.isDesktop ? 'Clic: espandi' : '▶‖: schermo intero · Stop: chiudi' }),
      h('div', { class: 'mini-x', title: 'Chiudi', text: '✕', onclick: e => { e.stopPropagation(); Mini.close(); } }));
    this.el = h('div', { class: 'screen player' }, this.video, this.clock, this.numBox, this.seekBox, this.msg, this.spin, this.info, this.miniUi);
    this.el.addEventListener('click', e => { if (this.mini && !(e.target.classList && e.target.classList.contains('mini-x'))) { e.stopPropagation(); this.expand(); } }, true);
    this.engine = new Engine(this.video);
    this.engine.onPlaying = () => { clearTimeout(this.slowT1); clearTimeout(this.slowT2); this.spin.classList.remove('show'); clearTimeout(this.spinT); this.msg.classList.remove('show'); };
    this.engine.onFail = why => { clearTimeout(this.slowT1); clearTimeout(this.slowT2); this.spin.classList.remove('show'); this.say(this.live ? 'Canale non raggiungibile' : 'Impossibile riprodurre il file', (this.live ? 'Prova un altro canale o un altro formato (Impostazioni > Formato live). Se la playlist è in uso su un altro dispositivo, il provider potrebbe consentire una sola connessione' : 'Dettagli: ' + (why || 'sconosciuto')) + (why ? '' : '')); this.showInfo(); };
    this.hideT = null; this.loadT = null; this.numT = null; this.seekT = null; this.pend = 0; this.lastSave = 0;
    this.cur = null; this.finished = false;
    const v = this.video;
    v.addEventListener('waiting', () => { clearTimeout(this.spinT); this.spinT = setTimeout(() => this.spin.classList.add('show'), 600); });
    v.addEventListener('playing', () => { clearTimeout(this.spinT); this.spin.classList.remove('show'); this._tickBar(); });
    v.addEventListener('timeupdate', () => this._onTime());
    const awake = on => { if (window.desktop && window.desktop.keepAwake) window.desktop.keepAwake(on); };
    v.addEventListener('playing', () => awake(true)); v.addEventListener('pause', () => awake(false)); v.addEventListener('ended', () => awake(false));
    this._awakeOff = () => awake(false);
    v.addEventListener('pause', () => { if (!this.live) { this.showInfo(true); } });
    v.addEventListener('ended', () => this._ended());
    this.clockT = setInterval(() => { this.clock.textContent = fmtClock(Date.now()); if (this.shown) this._tickBar(); }, 1000);
    if (platform.isDesktop) this._buildDesk();
  }

  // ---- controlli per mouse (solo desktop)
  _buildDesk() {
    const v = this.video, B = (ic, tip, fn, cls) => h('div', { class: 'cbtn ' + (cls || ''), title: tip, onclick: e => { e.stopPropagation(); fn(); this.showInfo(); } }, icon(ic));
    this.bPlay = B('pause', 'Pausa / Riproduci (Spazio)', () => this._toggle(), 'big');
    this.bVol = B('vol', 'Muto (M)', () => { v.muted = !v.muted; this._syncDesk(); });
    this.vol = h('input', { class: 'vslide', type: 'range', min: 0, max: 100, value: Math.round((v.volume || 1) * 100), title: 'Volume' });
    this.vol.oninput = () => { v.volume = this.vol.value / 100; v.muted = false; this._syncDesk(); };
    this.vol.onclick = e => e.stopPropagation();
    const left = [];
    if (!this.live) left.push(B('rw', 'Indietro di 10 s (←)', () => this._seek(-10)));
    left.push(this.bPlay);
    if (!this.live) left.push(B('ff', 'Avanti di 10 s (→)', () => this._seek(10)));
    left.push(B('prev', this.live ? 'Canale precedente (▼)' : 'Precedente', () => this._step(-1)), B('next', this.live ? 'Canale successivo (▲)' : 'Successivo', () => this._step(1)));
    this.dbar = h('div', { class: 'dbar' }, h('div', { class: 'pdl' }, left), h('div', { class: 'pdr' }, this.bVol, this.vol,
      B('list', 'Audio e sottotitoli', () => this.trackMenu()), B('gear', 'Opzioni', () => this.mainMenu()), B('full', 'Schermo intero (F)', () => toggleFullscreen())));
    this.dback = h('div', { class: 'cbtn pclose', title: 'Riduci a finestrella (Esc) — Stop chiude', onclick: e => { e.stopPropagation(); if (!(store.settings().miniPlayer !== false && this.minimize())) this._exit(); } }, icon('back'));
    if (!this.live) {
      this.seekBar = h('div', { class: 'pseekbar', title: 'Vai a…' }, h('div', { class: 'pseekfill' }));
      this.seekBar.onclick = e => { e.stopPropagation(); const d = this._d(); if (!d || !this.engine.canSeek()) return; const r = this.seekBar.getBoundingClientRect(); this.engine.seekTo(Math.max(0, Math.min(d - 1, (e.clientX - r.left) / r.width * d))); this.showInfo(); };
      this.dbar.insertBefore(this.seekBar, this.dbar.firstChild);
    }
    this.el.classList.add('desk');
    this.el.appendChild(this.dbar); this.el.appendChild(this.dback);
    this.el.addEventListener('mousemove', () => { if (!this.mini) this.showInfo(); });
    this.el.addEventListener('click', () => { if (this.mini) return; if (this.live) { if (this.shown) this.hideInfo(); else this.showInfo(); } else this._toggle(); });
    this.el.addEventListener('dblclick', () => { if (!this.mini) toggleFullscreen(); });
    this.el.addEventListener('wheel', e => { e.preventDefault(); this._vol(e.deltaY < 0 ? 5 : -5); }, { passive: false });
    v.addEventListener('play', () => this._syncDesk()); v.addEventListener('pause', () => this._syncDesk()); v.addEventListener('volumechange', () => this._syncDesk());
  }
  _syncDesk() {
    if (!this.dbar) return;
    const v = this.video;
    this.bPlay.firstChild.replaceWith(icon(v.paused ? 'play' : 'pause'));
    this.bVol.firstChild.replaceWith(icon(v.muted || v.volume === 0 ? 'mute' : 'vol'));
    this.vol.value = v.muted ? 0 : Math.round(v.volume * 100);
  }
  _play() { const p = this.video.play(); if (p && p.catch) p.catch(() => { }); }
  _toggle() { const v = this.video; if (v.paused) this._play(); else v.pause(); this.showInfo(); }
  _vol(d) { const v = this.video; v.muted = false; v.volume = Math.max(0, Math.min(1, v.volume + d / 100)); this.say('Volume ' + Math.round(v.volume * 100) + '%', '', 900); }
  _prevChannel() { if (this.prevI === undefined) { this.say('Nessun canale precedente', '', 1500); return; } this.play(this.prevI); }
  _step(d) { const n = this.i + d; if (this.live) this.play(n); else if (n >= 0 && n < this.o.list.length) this.play(n); }

  _sameAs(m) {
    const it = this.o.list[this.i]; if (!it || !m || !m.cur) return false;
    const r = this.o.resolve(it);
    return (r.key && r.key === m.cur.key) || (r.url && r.url === m.cur.url);
  }
  onShow() {
    const m = Mini.player;
    if (m && m !== this && !this.started && this._sameAs(m)) {
      // stesso film/episodio/canale già in riproduzione nella finestrella: torna a schermo intero senza ricaricare
      this.started = true; this.dup = true;
      setTimeout(() => { if (router.current === this) router.back(); m.expand(); }, 0);
      return;
    }
    if (m && m !== this) Mini.close(); // un altro contenuto parte: chiude la finestrella
    if (!this.started) { this.started = true; this.play(this.i); }
  }
  // riduce a finestrella in un angolo: il video continua mentre si naviga nell'app
  minimize() {
    if (this.mini || !router.detach(this)) return false;
    this.closeDrawer();
    this.mini = true; Mini.player = this; Rail.sync();
    this.el.classList.add('mini'); this.miniUi.firstChild.textContent = this.cur ? this.cur.title : '';
    this.hideInfo(); this.msg.classList.remove('show'); this.seekBox.classList.remove('show');
    return true;
  }
  expand() {
    if (!this.mini) return;
    this.mini = false; Mini.player = null; Mini.focused = false;
    this.el.classList.remove('mini', 'mfocus');
    router.push(this);
    this.showInfo();
  }
  onHide() { }
  destroy() {
    clearInterval(this.clockT); clearTimeout(this.hideT); clearTimeout(this.loadT); clearTimeout(this.seekT); clearTimeout(this.numT); clearTimeout(this.spinT);
    if (this.dup) { this.engine.destroy(); return; }
    this._saveProgress(true);
    if (this._awakeOff) this._awakeOff();
    this.engine.destroy();
    if (this.o.onClose) this.o.onClose(this.i);
  }

  // ---- riproduzione
  play(i) {
    const list = this.o.list;
    if (!list.length) return;
    const ni = (i + list.length) % list.length;
    if (this.live && this.cur && ni !== this.i) this.prevI = this.i;
    this.i = ni;
    const item = list[this.i];
    const r = this.cur = this.o.resolve(item);
    this.finished = false; this.fetching = false;
    if (this.o.onIndex) this.o.onIndex(this.i, item);
    this.msg.classList.remove('show');
    this.spin.classList.add('show');
    this.ptxt = this.ptxt || this.spin.querySelector('.ptxt'); this.ptxt.textContent = 'Caricamento…';
    clearTimeout(this.slowT1); clearTimeout(this.slowT2);
    if (!this.live) {
      this.slowT1 = setTimeout(() => { this.ptxt.textContent = 'Il server risponde lentamente…'; }, 8000);
      this.slowT2 = setTimeout(() => { this.ptxt.textContent = 'Ancora in attesa. Se la playlist è in uso su un altro dispositivo il provider può bloccare il flusso (Indietro per annullare)'; }, 20000);
    }
    this._renderInfo();
    this.showInfo();
    if (r.key) store.addRecent(r.key, Object.assign({ name: r.title, logo: r.logo || '', sub: r.sub || '' }, r.meta || {}));
    // zapping: attende un attimo per non martellare il server
    clearTimeout(this.loadT);
    this.loadT = setTimeout(() => {
      let startAt = 0;
      if (!this.live && r.key) { const p = store.getProgress(r.key); if (p && p.pos > 30 && p.dur && p.pos < p.dur - 60) startAt = p.pos; }
      if (startAt) this.say('Ripresa da ' + fmtDur(startAt), '', 2500);
      this.engine.load(r.url, { live: this.live, alt: r.alt, startAt: startAt });
    }, this.live ? 250 : 0);
    if (this.live && r.ch) this._loadEpg(r);
    if (this.live && r.src && r.src.epgUrl && !this._epgStarted) { this._epgStarted = true; startEpg(r.src, this.o.list, () => { if (this.cur) this._renderInfo(); }); }
  }

  async _loadEpg(r) {
    if (Epg.list(r.ch) || !r.src || !r.src.shortEpg) return;
    const cur = this.cur;
    const l = await r.src.shortEpg(r.ch);
    if (l && l.length) { Epg.setShort(r.ch, l); if (this.cur === cur) this._renderInfo(); }
  }

  _ended() {
    if (this.live) return;
    this._clearProgress();
    if (this.o.list.length > 1 && this.i < this.o.list.length - 1) this.play(this.i + 1);
    else this._exit();
  }

  _t() { return this.engine.time() || 0; }
  _d() { const d = this.engine.duration(); return d && isFinite(d) ? d : 0; }
  _onTime() {
    if (this.live || !this.cur) return;
    if (this.shown) this._tickBar();
    const now = Date.now();
    if (now - this.lastSave > 10000) { this.lastSave = now; this._saveProgress(); }
  }
  _saveProgress(force) {
    const t = this._t(), d = this._d();
    if (this.live || !this.cur || !this.cur.key || !d || this.finished) return;
    if (t > 20) {
      if (t > d - 45) { store.clearProgress(this.cur.key); store.markWatched(this.cur.key); } else store.setProgress(this.cur.key, t, d);
    }
  }
  _clearProgress() { this.finished = true; if (this.cur && this.cur.key) { store.clearProgress(this.cur.key); store.markWatched(this.cur.key); } }

  // ---- overlay informativo
  _renderInfo() {
    const r = this.cur; if (!r) return;
    this.info.innerHTML = '';
    const logo = h('div', { class: 'plogo' });
    if (r.logo) { const im = h('img', { src: r.logo }); im.onerror = () => { im.style.display = 'none'; }; logo.appendChild(im); }
    const head = h('div', { class: 'ph' },
      this.live ? h('div', { class: 'pch', text: r.num || '' }) : null,
      h('div', { class: 'pt', text: r.title || '' }));
    const body = [head];
    if (this.live) {
      const nn = r.ch ? Epg.nowNext(r.ch) : null;
      if (nn && nn.now) {
        const p = (Date.now() - nn.now[0]) / (nn.now[1] - nn.now[0]);
        body.push(h('div', { class: 'pnow' }, h('span', { class: 'pbadge', text: 'ORA' }), h('span', { text: ' ' + fmtClock(nn.now[0]) + '–' + fmtClock(nn.now[1]) + '  ' + nn.now[2] })));
        body.push(h('div', { class: 'pbar' }, h('div', { class: 'pfill', style: 'width:' + Math.max(0, Math.min(100, p * 100)) + '%' })));
        if (nn.now[3]) body.push(h('div', { class: 'pdesc', text: nn.now[3] }));
        if (nn.next) body.push(h('div', { class: 'pnext' }, h('span', { class: 'pbadge dim', text: 'DOPO' }), h('span', { text: ' ' + fmtClock(nn.next[0]) + '  ' + nn.next[2] })));
      } else if (r.sub) body.push(h('div', { class: 'psub', text: r.sub }));
      else body.push(h('div', { class: 'psub', text: 'Guida programmi non disponibile' }));
    } else {
      if (r.sub) body.push(h('div', { class: 'psub', text: r.sub }));
      this.tbar = h('div', { class: 'pbar big' }, h('div', { class: 'pfill' }));
      this.ttime = h('div', { class: 'ptime' });
      body.push(this.tbar, this.ttime);
      this._tickBar();
    }
    this.info.appendChild(logo);
    this.info.appendChild(h('div', { class: 'pbody' }, body));
    this.info.appendChild(h('div', { class: 'phints', text: platform.isDesktop ? (this.live ? 'Clic: mostra/nascondi  •  Doppio clic: schermo intero  •  Rotella: volume  •  ▲▼ canale  •  Spazio: pausa  •  Esc: chiudi' : 'Clic: pausa  •  Doppio clic: schermo intero  •  Rotella: volume  •  ←→ ±10 s  •  Spazio: pausa  •  Esc: chiudi') : this.live ? '▲▼ Cambia canale   ◀ Canali   ▶ Opzioni   OK Pausa' : '◀▶ ±10 s   OK Pausa/Riprendi   Indietro: finestrella' }));
  }
  _tickBar() {
    if (this.live || !this.tbar) return;
    const v = this.video, d = this._d();
    if (d) {
      const t = this.pend ? Math.max(0, Math.min(d, this._t() + this.pend)) : this._t();
      this.tbar.firstChild.style.width = (t / d * 100) + '%';
      if (this.seekBar) this.seekBar.firstChild.style.width = (t / d * 100) + '%';
      this.ttime.textContent = fmtDur(t) + ' / ' + fmtDur(d) + (v.paused ? '   ‖ in pausa' : '');
    }
  }
  showInfo(keep) {
    this.shown = true; this.info.classList.add('show'); this.clock.classList.add('show'); this.el.classList.remove('idle');
    clearTimeout(this.hideT);
    if (!keep) this.hideT = setTimeout(() => this.hideInfo(), 5000);
    this._tickBar();
  }
  hideInfo() { this.shown = false; this.info.classList.remove('show'); this.clock.classList.remove('show'); if (this.dbar) this.el.classList.add('idle'); }
  say(t, sub, ms) {
    this.msg.innerHTML = '';
    this.msg.appendChild(h('div', { class: 'm1', text: t }));
    if (sub) this.msg.appendChild(h('div', { class: 'm2', text: sub }));
    this.msg.classList.add('show');
    if (ms) { clearTimeout(this._msgT); this._msgT = setTimeout(() => this.msg.classList.remove('show'), ms); }
  }

  // ---- tasti
  onKey(a) {
    const k = a.a, v = this.video;
    if (k === 'char') {
      const c = a.c.toLowerCase();
      if (c === ' ') { this._toggle(); return true; }
      if (c === 'f') { toggleFullscreen(); return true; }
      if (c === 'm') { v.muted = !v.muted; this.say(v.muted ? 'Muto' : 'Audio attivo', '', 900); return true; }
      if (c === '+' || c === '=') { this._vol(5); return true; }
      if (c === '-') { this._vol(-5); return true; }
      if (c === 'i') { if (this.shown) this.hideInfo(); else this.showInfo(); return true; }
      if (c === 'p' && this.live) { this._prevChannel(); return true; }
      return true;
    }
    if (this.drawer) return this.drawer.onKey(a);
    if (k === 'num' && this.live) { this._digit(a.d); return true; }
    if (k === 'prev' && this.live) { this._prevChannel(); return true; }
    if (k === 'chup' || (this.live && k === 'up')) { this._step(1); return true; }
    if (k === 'chdown' || (this.live && k === 'down')) { this._step(-1); return true; }
    if (!this.live && (k === 'next' || k === 'prev')) { this._step(k === 'next' ? 1 : -1); return true; }
    if (k === 'rw' || k === 'ff') { if (!this.live) this._seek(k === 'rw' ? -30 : 30); return true; }
    // Sinistra/Destra: con le informazioni visibili (dopo OK) scorrono il film di 10 s, altrimenti aprono i pannelli
    if (k === 'left' || k === 'right') {
      if (!this.live && this.shown) { this._seek(k === 'left' ? -10 : 10); return true; }
      if (k === 'left') this.listDrawer(); else this.optionsDrawer();
      return true;
    }
    if (k === 'up' || k === 'down') return true;
    // OK: prima mostra le informazioni, poi pausa / riprendi
    if (k === 'ok') {
      if (!this.shown) this.showInfo();
      else { if (v.paused) this._play(); else v.pause(); this.showInfo(v.paused); }
      return true;
    }
    if (k === 'playpause') { if (v.paused) this._play(); else v.pause(); this.showInfo(); return true; }
    if (k === 'play') { this._play(); return true; }
    if (k === 'pause') { v.pause(); return true; }
    if (k === 'info') { if (this.shown) this.hideInfo(); else this.showInfo(); return true; }
    if (k === 'blue') { this.optionsDrawer('tracks'); return true; }
    if (k === 'red') { this.toggleFav(); return true; }
    if (k === 'menu') { this.optionsDrawer(); return true; }
    if (k === 'back' || k === 'backspace') { if (store.settings().miniPlayer !== false && this.minimize()) return true; this._exit(); return true; }
    if (k === 'stop') { this._exit(); return true; }
    return true; // il player consuma tutto
  }

  _exit() {
    import('../core/router.js').then(m => m.router.back());
  }

  _digit(d) {
    this.numBuf = (this.numBuf || '') + d;
    this.numBox.textContent = this.numBuf; this.numBox.classList.add('show');
    clearTimeout(this.numT);
    const go = () => {
      const n = this.numBuf; this.numBuf = ''; this.numBox.classList.remove('show');
      const idx = this.o.list.findIndex(c => String(c.num) === n);
      if (idx >= 0) this.play(idx); else this.say('Canale ' + n + ' non trovato', '', 1500);
    };
    if (this.numBuf.length >= 4) go(); else this.numT = setTimeout(go, 1800);
  }

  _seek(sec) {
    const v = this.video; if (!this._d() || !this.engine.canSeek()) { this.say('Questo contenuto non permette di scorrere', '', 1500); return; }
    // pressioni ripetute accelerano
    const now = Date.now();
    const accel = (this._lastSeek && now - this._lastSeek < 450) ? Math.min(6, (this._seekN = (this._seekN || 1) + 1)) : (this._seekN = 1);
    this._lastSeek = now;
    this.pend += sec * accel;
    const t = Math.max(0, Math.min(this._d(), this._t() + this.pend));
    this.seekBox.textContent = (this.pend > 0 ? '+' : '') + this.pend + ' s  →  ' + fmtDur(t);
    this.seekBox.classList.add('show');
    this.showInfo(true);
    clearTimeout(this.seekT);
    this.seekT = setTimeout(() => {
      this.engine.seekTo(Math.max(0, Math.min(this._d() - 1, this._t() + this.pend)));
      this.pend = 0; this.seekBox.classList.remove('show'); this.showInfo(); this._tickBar();
    }, 600);
  }

  // ---- pannelli laterali (telecomandi senza tasti colorati: Sinistra = elenco, Destra = opzioni)
  _drawer(side, title, items, opt) {
    this.closeDrawer();
    opt = opt || {};
    const list = new VList({
      rowH: () => Math.round(remPx() * (opt.tall ? 3.4 : 3.0)),
      build: () => h('div', { class: 'row drow' }, h('span', { class: 'dn' }), h('span', { class: 'dl' }), h('span', { class: 'dv' })),
      fill: (n, it) => { if (n._it === it) return; n._it = it; const d = opt.fmt ? opt.fmt(it) : it; n.children[0].textContent = d.num || ''; n.children[1].textContent = d.label || ''; n.children[2].textContent = d.value || ''; n.classList.toggle('on', !!d.on); },
      onSelect: (it, i) => opt.pick(it, i)
    });
    const el = h('div', { class: 'pdrawer ' + side }, h('div', { class: 'pdt', text: title }), list.el, h('div', { class: 'pdh', text: side === 'left' ? 'OK: apri · ▶ o Indietro: chiudi' : 'OK: scegli · ◀ o Indietro: chiudi' }));
    this.el.appendChild(el);
    this.hideInfo();
    const d = this.drawer = { el: el, list: list, side: side, back: opt.back,
      onKey: a => {
        const k = a.a;
        if (k === 'back' || (side === 'left' && k === 'right') || (side === 'right' && k === 'left')) { if (d.back) d.back(); else this.closeDrawer(); return true; }
        if (k === 'left' || k === 'right') return true;
        list.handleKey(k); return true;
      } };
    list.setItems(items);
    list.sel = Math.max(0, opt.sel || 0);
    list.setActive(true);
    requestAnimationFrame(() => { el.classList.add('show'); list.relayout(); });
    return d;
  }
  closeDrawer() { if (!this.drawer) return; const el = this.drawer.el; this.drawer = null; if (el.parentNode) el.parentNode.removeChild(el); }

  listDrawer() {
    const list = this.o.list;
    if (list.length < 2) { this.say(this.live ? 'Nessun altro canale' : 'Nessun altro episodio', '', 1500); return; }
    this._drawer('left', this.live ? 'Canali' : 'Episodi', list, {
      sel: this.i, tall: true,
      fmt: it => { const r = this.o.resolve(it); return { num: this.live ? r.num : (it.season != null ? it.season + '×' + it.num : ''), label: this.live ? r.title : (it.title || r.sub || r.title), on: it === list[this.i] }; },
      pick: (it, i) => { this.closeDrawer(); if (i !== this.i) this.play(i); else this.showInfo(); }
    });
  }

  optionsDrawer(sub) {
    const t = this.engine.tracks(), fav = this.cur && this.cur.key && store.isFav(this.cur.key);
    if (sub === 'audio' || sub === 'subs' || sub === 'tracks') {
      const items = [];
      if (sub !== 'subs') t.audio.forEach(a => items.push({ label: 'Audio: ' + a.label, on: a.on, act: () => this._setAudio(a, t) }));
      if (sub !== 'audio') { if (t.text.length) items.push({ label: 'Sottotitoli: nessuno', on: !t.text.some(x => x.on), act: () => this.engine.setText(-1) }); t.text.forEach(x => items.push({ label: 'Sottotitoli: ' + x.label, on: x.on, act: () => this.engine.setText(x.i) })); }
      if (!items.length) { this.say('Nessuna traccia alternativa', 'Questo contenuto ha una sola lingua', 2200); return; }
      this._drawer('right', sub === 'subs' ? 'Sottotitoli' : 'Audio', items, { fmt: x => ({ label: x.label, value: x.on ? '✓' : '', on: x.on }), pick: x => { x.act(); this.closeDrawer(); }, back: sub === 'tracks' ? null : () => this.optionsDrawer() });
      return;
    }
    const aOn = t.audio.find(a => a.on), sOn = t.text.find(x => x.on);
    const items = [];
    if (t.audio.length > 1) items.push({ label: 'Audio', value: aOn ? aOn.label.split('  (')[0] : '', go: () => this.optionsDrawer('audio') });
    if (t.text.length) items.push({ label: 'Sottotitoli', value: sOn ? sOn.label : 'nessuno', go: () => this.optionsDrawer('subs') });
    items.push({ label: fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti', value: fav ? '★' : '', go: () => { this.toggleFav(); this.closeDrawer(); } });
    items.push({ label: 'Formato immagine', value: this.video.style.objectFit === 'cover' ? 'Riempi' : 'Adatta', go: () => { this.video.style.objectFit = this.video.style.objectFit === 'cover' ? 'contain' : 'cover'; this.optionsDrawer(); } });
    if (this.live && this.prevI !== undefined) items.push({ label: 'Canale precedente', go: () => { this.closeDrawer(); this._prevChannel(); } });
    if (this.cur && this.cur.alt) items.push({ label: 'Prova il flusso alternativo', value: 'TS/HLS', go: () => { this.closeDrawer(); this.engine.load(this.cur.alt, { live: this.live }); } });
    if (!this.live) items.push({ label: 'Riparti dall\'inizio', go: () => { this.closeDrawer(); if (this.cur.key) store.clearProgress(this.cur.key); this.engine.seekTo(0); } });
    if (!this.live && this.engine.ffAvailable()) items.push({ label: this.engine.ff ? 'Usa il lettore nativo' : 'Non va? Usa il convertitore video', go: () => { this.closeDrawer(); this.engine.load(this.cur.url, { live: false, ff: !this.engine.ff, startAt: this._t() }); } });
    items.push({ label: 'Riduci a finestrella', value: 'continua a guardare', go: () => this.minimize() });
    items.push({ label: 'Chiudi il player', go: () => { this.closeDrawer(); this._exit(); } });
    this._drawer('right', 'Opzioni', items, { fmt: x => x, pick: x => x.go() });
  }
  _setAudio(a) {
    this.engine.setAudio(a.i);
    if (a.lang) { store.settings().audioLang = a.lang; store.save(); this.say('Audio: ' + a.label.split('  (')[0], 'Lo ricordo per i prossimi contenuti', 2500); }
  }
  trackMenu() { this.optionsDrawer('tracks'); }
  mainMenu() { this.optionsDrawer(); }

  toggleFav() {
    const r = this.cur; if (!r || !r.key) return;
    const on = store.toggleFav(r.key, Object.assign({ name: r.title, logo: r.logo || '', sub: r.sub || '' }, r.meta || {}));
    this.say(on ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti', '', 1500);
  }


}
