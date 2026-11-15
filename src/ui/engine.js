// Motore di riproduzione con fallback a catena: nativo / hls.js / mpegts.js
import { loadScript, extOf } from '../core/util.js';
import { settings } from '../core/store.js';
import { mediaUrl } from '../core/net.js';
import { platform } from '../core/platform.js';

function nativeHls(v) { return !!(v.canPlayType && (v.canPlayType('application/vnd.apple.mpegurl') || v.canPlayType('application/x-mpegURL'))); }

export class Engine {
  constructor(video) {
    this.v = video; this.hls = null; this.mp = null; this.attempts = []; this.ai = -1;
    this.onFail = null; this.onPlaying = null; this.gen = 0; this.timer = null;
    this.ff = null; this.fails = []; this.forceFf = false;
    const self = this;
    this._err = function () {
      const e = video.error, code = e ? ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][e.code] || e.code : '?';
      if (self.ff && self.ff.v === 'copy' && !self.ff.retried) { self.ff.retried = true; self._ffStart(self.time(), 'tx'); return; } // H.264 non decodificabile (es. 10 bit): ricodifica
      self._next('errore ' + code);
    };
    this._play = function () { clearTimeout(self.timer); if (self.onPlaying) self.onPlaying(); self._afterPlaying(); };
    this._meta = function () { clearTimeout(self.timer); self._checkSeekable(); };
    video.addEventListener('error', this._err);
    video.addEventListener('playing', this._play);
    video.addEventListener('loadedmetadata', this._meta);
  }

  // ---- convertitore ffmpeg (solo app per computer)
  ffAvailable() { return platform.isDesktop && !!(window.desktop && window.desktop.ffProbe) && settings().transcode !== 'never'; }
  time() { return this.ff ? this.ff.off + (this.v.currentTime || 0) : this.v.currentTime; }
  duration() { return this.ff ? this.ff.dur : this.v.duration; }
  canSeek() { return this.ff ? this.ff.dur > 0 : true; }
  seekTo(t) {
    if (this.ff) { this._ffStart(Math.max(0, t), this.ff.v); return; }
    try { this.v.currentTime = t; } catch (e) { /* */ }
  }
  async _ffStart(off, vmode) {
    const f = this.ff, gen = this.gen; if (!f) return;
    const a = f.audio[f.ai];
    f.off = off; f.v = vmode;
    const url = await window.desktop.ffUrl(f.src, { ss: off, v: vmode, a: a && a.codec === 'aac' ? 'copy' : 'aac', ai: f.ai });
    if (gen !== this.gen || this.ff !== f) return;
    this.v.src = url;
    const p = this.v.play(); if (p && p.catch) p.catch(() => { });
  }
  async _ffBegin(a, gen) {
    this.timer = setTimeout(() => { if (gen === this.gen) this._next('timeout convertitore'); }, 90000);
    const info = await window.desktop.ffProbe(a.u);
    if (gen !== this.gen || this.attempts[this.ai] !== a) return;
    if (info.error) { this._next('convertitore: ' + info.error); return; }
    this.ff = { src: a.u, off: 0, dur: info.duration || 0, audio: info.audio.length ? info.audio : [{ idx: 0, codec: 'aac', lang: '' }], ai: 0, v: 'copy', retried: false };
    this.ff.v = info.vcodec === 'h264' ? 'copy' : 'tx';
    await this._ffStart(this.startAt || 0, this.ff.v);
  }
  // il file parte ma la timeline non scorre (server senza Range): passa al convertitore
  _checkSeekable() {
    if (this.live || this.ff || !this.ffAvailable()) return;
    const a = this.attempts[this.ai], n = this.attempts[this.ai + 1];
    if (!a || a.eng !== 'native' || !n || n.eng !== 'ff') return;
    const v = this.v, d = v.duration, sk = v.seekable;
    const ok = isFinite(d) && d > 0 && sk && sk.length && sk.end(sk.length - 1) >= d - 2;
    if (!ok) { this.startAt = v.currentTime || this.startAt; this._next('timeline non scorrevole'); }
  }
  // audio non decodificabile (AC3/E-AC3/DTS): il video parte muto -> converti
  _afterPlaying() {
    if (this.live || this.ff || !this.ffAvailable()) return;
    const a = this.attempts[this.ai], n = this.attempts[this.ai + 1], gen = this.gen;
    if (!a || a.eng !== 'native' || !n || n.eng !== 'ff') return;
    clearTimeout(this._silT);
    this._silT = setTimeout(() => {
      if (gen !== this.gen || this.ff) return;
      const v = this.v;
      if (!v.paused && v.currentTime > 1.5 && typeof v.webkitAudioDecodedByteCount === 'number' && v.webkitAudioDecodedByteCount === 0 && !v.muted) { this.startAt = v.currentTime; this._next('audio non supportato'); }
    }, 4500);
  }

  plan(url, live, alt) {
    const out = [];
    const mk = (u) => {
      const e = extOf(u), isHls = e === 'm3u8' || /m3u8/i.test(u), isTs = e === 'ts' || (live && !e && !isHls);
      if (isHls) { if (nativeHls(this.v)) { out.push({ u: u, eng: 'native' }); out.push({ u: u, eng: 'hls' }); } else { out.push({ u: u, eng: 'hls' }); out.push({ u: u, eng: 'native' }); } }
      else if (isTs) { out.push({ u: u, eng: 'mpegts' }); out.push({ u: u, eng: 'native' }); }
      else out.push({ u: u, eng: 'native' });
    };
    mk(url); if (alt) mk(alt);
    if (!live && this.ffAvailable()) {
      const m = settings().transcode;
      if (this.forceFf || m === 'always') out.unshift({ u: url, eng: 'ff' }); else out.push({ u: url, eng: 'ff' });
    }
    return out;
  }

  load(url, o) {
    o = o || {};
    this._teardown();
    this.gen++;
    this.live = !!o.live; this.startAt = o.startAt || 0; this.muted = !!o.muted; this.forceFf = !!o.ff; this.fails = []; this.ff = null;
    this.attempts = this.plan(url, this.live, o.alt);
    this.ai = -1;
    this._next('start');
  }

  _next(why) {
    clearTimeout(this.timer);
    this._teardown(true);
    this.ai++;
    if (why !== 'start') this.fails.push(why);
    if (this.ai >= this.attempts.length) { if (this.attempts.length && this.onFail) this.onFail(this.fails.join(' → ')); this.attempts = []; return; }
    const a = this.attempts[this.ai], gen = this.gen, v = this.v;
    v.muted = this.muted;
    // se dopo 18 s non parte, prova il metodo successivo
    this.timer = setTimeout(() => { if (gen === this.gen) this._next('timeout'); }, this.live ? 18000 : 60000);
    const url = mediaUrl(a.u);
    const startAt = this.startAt;
    const seekOnMeta = () => { if (startAt > 0) { try { v.currentTime = startAt; } catch (e) { /* */ } } };
    if (a.eng === 'ff') { this._ffBegin(a, gen); return; }
    if (a.eng === 'native') {
      v.src = url;
      v.addEventListener('loadedmetadata', seekOnMeta, { once: true });
      const p = v.play(); if (p && p.catch) p.catch(() => { });
    } else if (a.eng === 'hls') {
      loadScript('vendor/hls.min.js').then(() => {
        if (gen !== this.gen || this.ai < 0 || this.attempts[this.ai] !== a) return;
        const Hls = window.Hls;
        if (!Hls || !Hls.isSupported()) { this._next('hls unsupported'); return; }
        const bs = settings().bufferSec || 20;
        const proxied = url !== a.u;
        const hls = new Hls({
          enableWorker: true, lowLatencyMode: false, maxBufferLength: bs, maxMaxBufferLength: bs * 2, backBufferLength: 15,
          manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3, startPosition: startAt > 0 ? startAt : -1,
          xhrSetup: proxied ? (xhr, u) => { xhr.open('GET', mediaUrl(u), true); } : undefined
        });
        this.hls = hls;
        let netRetry = 0, mediaRetry = 0;
        hls.on(Hls.Events.ERROR, (ev, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netRetry++ < 2) { hls.startLoad(); return; }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetry++ < 2) { hls.recoverMediaError(); return; }
          this._next('hls ' + d.details);
        });
        hls.loadSource(url); hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { const p = v.play(); if (p && p.catch) p.catch(() => { }); });
      }).catch(() => this._next('hls load'));
    } else if (a.eng === 'mpegts') {
      loadScript('vendor/mpegts.js').then(() => {
        if (gen !== this.gen || this.ai < 0 || this.attempts[this.ai] !== a) return;
        const M = window.mpegts;
        if (!M || !M.isSupported()) { this._next('mpegts unsupported'); return; }
        const mp = M.createPlayer({ type: 'mse', isLive: this.live, url: url }, {
          enableWorker: true, enableStashBuffer: true, stashInitialSize: 384, liveBufferLatencyChasing: this.live,
          liveBufferLatencyMaxLatency: 12, liveBufferLatencyMinRemain: 1.5, autoCleanupSourceBuffer: true
        });
        this.mp = mp;
        mp.on(M.Events.ERROR, () => this._next('mpegts error'));
        mp.attachMediaElement(v); mp.load();
        const p = mp.play(); if (p && p.catch) p.catch(() => { });
      }).catch(() => this._next('mpegts load'));
    }
  }

  _teardown(keepList) {
    if (this.hls) { try { this.hls.destroy(); } catch (e) { /* */ } this.hls = null; }
    if (this.mp) { try { this.mp.pause(); this.mp.unload(); this.mp.detachMediaElement(); this.mp.destroy(); } catch (e) { /* */ } this.mp = null; }
    if (this.ff) { try { window.desktop.ffStop(); } catch (e) { /* */ } this.ff = null; }
    clearTimeout(this._silT);
    try { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); } catch (e) { /* */ }
    if (!keepList) { clearTimeout(this.timer); this.attempts = []; this.ai = -1; }
  }

  stop() { this.gen++; this._teardown(); }
  destroy() {
    this.stop();
    this.v.removeEventListener('error', this._err);
    this.v.removeEventListener('playing', this._play);
    this.v.removeEventListener('loadedmetadata', this._meta);
  }

  // tracce audio/sottotitoli disponibili
  tracks() {
    const out = { audio: [], text: [] };
    if (this.ff) { this.ff.audio.forEach((t, i) => out.audio.push({ i: i, label: (t.lang || 'Audio ' + (i + 1)) + ' (' + t.codec + ')', on: this.ff.ai === i })); return out; }
    if (this.hls) {
      (this.hls.audioTracks || []).forEach((t, i) => out.audio.push({ i: i, label: t.name || t.lang || ('Audio ' + (i + 1)), on: this.hls.audioTrack === i }));
      (this.hls.subtitleTracks || []).forEach((t, i) => out.text.push({ i: i, label: t.name || t.lang || ('Sub ' + (i + 1)), on: this.hls.subtitleTrack === i }));
    } else {
      const at = this.v.audioTracks;
      if (at) for (let i = 0; i < at.length; i++) out.audio.push({ i: i, label: at[i].label || at[i].language || ('Audio ' + (i + 1)), on: !!at[i].enabled });
      const tt = this.v.textTracks;
      if (tt) for (let i = 0; i < tt.length; i++) if (tt[i].kind === 'subtitles' || tt[i].kind === 'captions') out.text.push({ i: i, label: tt[i].label || tt[i].language || ('Sub ' + (i + 1)), on: tt[i].mode === 'showing' });
    }
    return out;
  }
  setAudio(i) {
    if (this.ff) { this.ff.ai = i; this._ffStart(this.time(), this.ff.v); return; }
    if (this.hls) { this.hls.audioTrack = i; return; }
    const at = this.v.audioTracks; if (at) for (let k = 0; k < at.length; k++) at[k].enabled = (k === i);
  }
  setText(i) {
    if (this.hls) { this.hls.subtitleTrack = i; this.hls.subtitleDisplay = i >= 0; return; }
    const tt = this.v.textTracks; if (tt) for (let k = 0; k < tt.length; k++) tt[k].mode = (k === i ? 'showing' : 'disabled');
  }
}
