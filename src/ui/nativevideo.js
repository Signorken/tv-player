// "Elemento video" che comanda un lettore nativo (ExoPlayer su Android, AVPlay su Samsung Tizen).
// Il video viene disegnato dall'hardware SOTTO la pagina: l'interfaccia resta sopra, con "buchi" trasparenti dove si vede il video.
// Si comporta come un <video> per ciò che usano player ed Engine: play/pause, currentTime, duration, eventi, tracce, objectFit.
import { router } from '../core/router.js';

// backend: { name, open(url, o), play(), pause(), seek(ms), stop(), rect(r), fit(mode), status() -> Promise<{pos,dur,playing,state,w,h,dropped,total,error}>,
//            tracks() -> Promise<{audio:[{g,t,lang,label,codec,ch,on}], text:[...]}>, select(type, g, t), onSubtitle(fn) }
export class NativeVideo {
  constructor(el, backend) {
    this.el = el; this.b = backend; this.isNative = true; this.backendName = backend.name;
    this._h = {}; this._src = ''; this.paused = true; this.muted = false; this.volume = 1; this.error = null;
    this._pos = 0; this._dur = NaN; this._w = 0; this._h2 = 0; this._q = { droppedVideoFrames: 0, totalVideoFrames: 0 };
    this._st = ''; this._playing = false; this._meta = false; this._ended = false; this._errd = false;
    this._tr = { audio: [], text: [] }; this._fit = 'contain'; this._timer = null; this._lastRect = '';
    const self = this;
    this.style = {
      get objectFit() { return self._fit; },
      set objectFit(v) { self._fit = v || 'contain'; try { self.b.fit(self._fit); } catch (e) { /* */ } }
    };
    if (backend.onSubtitle) backend.onSubtitle(t => this._emit('subtitle', t));
  }

  // ---- eventi
  addEventListener(t, fn, o) { (this._h[t] = this._h[t] || []).push({ fn: fn, once: !!(o && o.once) }); }
  removeEventListener(t, fn) { const l = this._h[t]; if (l) this._h[t] = l.filter(x => x.fn !== fn); }
  _emit(t, d) {
    const l = (this._h[t] || []).slice();
    this._h[t] = (this._h[t] || []).filter(x => !x.once);
    l.forEach(x => { try { x.fn.call(this, { type: t, target: this, detail: d }); } catch (e) { setTimeout(() => { throw e; }); } });
  }

  // ---- proprietà come <video>
  get src() { return this._src; }
  set src(u) { this._open(u); }
  get currentTime() { return this._pos; }
  set currentTime(t) { this._pos = Math.max(0, +t || 0); try { this.b.seek(Math.round(this._pos * 1000)); } catch (e) { /* */ } this._emit('seeking'); }
  get duration() { return this._dur; }
  get videoWidth() { return this._w; }
  get videoHeight() { return this._h2; }
  get readyState() { return this._meta ? 4 : 0; }
  get seekable() { const d = this._dur; return { length: isFinite(d) ? 1 : 0, start: () => 0, end: () => d }; }
  get audioTracks() { return this._audioList(); }
  get textTracks() { return this._textList(); }
  getVideoPlaybackQuality() { return this._q; }
  canPlayType() { return 'maybe'; }
  getBoundingClientRect() { return this.el.getBoundingClientRect(); }
  load() { }
  removeAttribute(a) { if (a === 'src') this._stop(); }
  play() {
    if (!this._src) return Promise.resolve();
    this.paused = false; try { this.b.play(); } catch (e) { /* */ }
    this._emit('play'); return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true; try { this.b.pause(); } catch (e) { /* */ }
    this._emit('pause');
  }

  // ---- apertura / stato
  _open(u) {
    this._stop();
    if (!u) return;
    this._src = u; this.paused = false; this.error = null;
    this._pos = 0; this._dur = NaN; this._meta = false; this._ended = false; this._errd = false; this._playing = false; this._st = '';
    this._tr = { audio: [], text: [] };
    document.documentElement.classList.add('nv'); document.body.classList.add('nv');
    try { this.b.open(u, {}); } catch (e) { this._fail('open'); return; }
    this.sync(true);
    this._timer = setInterval(() => this._poll(), 250);
  }
  _stop() {
    clearInterval(this._timer); this._timer = null;
    if (this._src) { try { this.b.stop(); } catch (e) { /* */ } }
    this._src = ''; this._playing = false;
    document.documentElement.classList.remove('nv'); document.body.classList.remove('nv');
    clearHoles();
  }
  _fail(why) { if (this._errd) return; this._errd = true; this.error = { code: 4, message: why }; this._emit('error'); }
  async _poll() {
    if (!this._src || this._busy) return;
    // in pausa (o con la pagina nascosta) basta un controllo al secondo: meno chiamate al lettore nativo
    this._n = (this._n || 0) + 1;
    if (this._meta && (this.paused || document.hidden) && this._n % 4) return;
    this._busy = true;
    let s = null;
    try { s = await this.b.status(); } catch (e) { s = null; }
    this._busy = false;
    if (!s || !this._src) return;
    if (s.error) { this._fail(s.error); return; }
    const pos = (s.pos || 0) / 1000;
    this._dur = s.dur > 0 ? s.dur / 1000 : (s.live ? Infinity : this._dur);
    if (s.w) { this._w = s.w; this._h2 = s.h; }
    if (s.total != null) this._q = { droppedVideoFrames: s.dropped || 0, totalVideoFrames: s.total || 0 };
    if (!this._meta && (s.state === 'ready' || s.playing)) {
      this._meta = true; this._emit('loadedmetadata'); this._emit('loadeddata');
      this.b.tracks().then(t => { this._tr = t || this._tr; this._emit('tracks'); }).catch(() => { });
    }
    if (s.playing && !this._playing) { this._playing = true; this._emit('playing'); }
    if (!s.playing && this._playing && s.state === 'buffering') { this._playing = false; this._emit('waiting'); }
    if (!s.playing && this._playing && s.state !== 'buffering') this._playing = false;
    if (s.state === 'ended' && !this._ended) { this._ended = true; this._emit('ended'); }
    if (pos !== this._pos) { this._pos = pos; this._emit('timeupdate'); }
    this.sync();
  }

  // posizione del video: quella dell'elemento <video> della pagina (schermo intero o finestrella)
  sync(force) {
    const r = this.el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const full = r.width >= W - 2 && r.height >= H - 2;
    const key = full ? 'full' : [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    if (force || key !== this._lastRect) {
      this._lastRect = key;
      try { this.b.rect({ x: r.left, y: r.top, w: r.width, h: r.height, full: full, vw: W, vh: H }); } catch (e) { /* */ }
    }
    // finestrella: buco trasparente nello sfondo e nella schermata sotto, perché si veda il video
    if (full || !r.width) clearHoles(); else punch(r);
  }

  // ---- tracce come audioTracks / textTracks
  _audioList() {
    const self = this;
    return this._tr.audio.map(t => ({
      language: t.lang || '', label: t.label || '', codec: t.codec, ch: t.ch,
      get enabled() { return !!t.on; },
      set enabled(v) { if (v && !t.on) { self._tr.audio.forEach(x => { x.on = x === t; }); self.b.select('audio', t.g, t.t); } }
    }));
  }
  _textList() {
    const self = this;
    return this._tr.text.map(t => ({
      kind: 'subtitles', language: t.lang || '', label: t.label || t.lang || '',
      get mode() { return t.on ? 'showing' : 'disabled'; },
      set mode(v) {
        if (v === 'showing' && !t.on) { self._tr.text.forEach(x => { x.on = x === t; }); self.b.select('text', t.g, t.t); }
        else if (v !== 'showing' && t.on) { t.on = false; self.b.select('text', -1, -1); }
      }
    }));
  }
}

let holed = [];
function clearHoles() { holed.forEach(e => { e.style.webkitClipPath = e.style.clipPath = ''; }); holed = []; }
function punch(r) {
  const x1 = Math.round(r.left), y1 = Math.round(r.top), x2 = Math.round(r.right), y2 = Math.round(r.bottom);
  const targets = [document.getElementById('bg')];
  const cur = router.current; if (cur && cur.el && !cur.isPlayer) targets.push(cur.el);
  clearHoles();
  targets.forEach(e => {
    if (!e) return;
    const b = e.getBoundingClientRect(), ox = b.left, oy = b.top;
    const p = 'polygon(0 0,100% 0,100% 100%,0 100%,0 0,' + (x1 - ox) + 'px ' + (y1 - oy) + 'px,' + (x1 - ox) + 'px ' + (y2 - oy) + 'px,' + (x2 - ox) + 'px ' + (y2 - oy) + 'px,' + (x2 - ox) + 'px ' + (y1 - oy) + 'px,' + (x1 - ox) + 'px ' + (y1 - oy) + 'px,0 0)';
    e.style.webkitClipPath = p; e.style.clipPath = p; holed.push(e);
  });
}
