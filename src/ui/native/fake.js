import { tr } from '../../core/i18n.js';
// Lettore nativo FINTO, solo per le prove automatiche (window.__fakeNative = true):
// simula ExoPlayer/AVPlay usando un <video> nascosto, così si collaudano player, finestrella e "buchi" nell'interfaccia.
export function fakeAvailable() { return !!window.__fakeNative; }
export function fakeBackend() {
  const v = document.createElement('video'); v.muted = true; v.style.cssText = 'position:absolute;width:2px;height:2px;left:-10px;top:-10px';
  document.body.appendChild(v);
  const log = window.__fakeLog = [];
  let ended = false, err = '';
  v.addEventListener('ended', () => { ended = true; });
  v.addEventListener('error', () => { err = 'fake error'; });
  return {
    name: tr('Prova'),
    open(u) { ended = false; err = ''; log.push('open'); v.src = u; v.play().catch(() => { }); },
    play() { log.push('play'); v.play().catch(() => { }); },
    pause() { log.push('pause'); v.pause(); },
    seek(ms) { log.push('seek ' + ms); v.currentTime = ms / 1000; },
    stop() { log.push('stop'); v.removeAttribute('src'); v.load(); },
    rect(r) { log.push('rect ' + (r.full ? 'full' : Math.round(r.w) + 'x' + Math.round(r.h))); window.__fakeRect = r; },
    fit(m) { log.push('fit ' + m); },
    status() {
      if (window.__fakeFail) return Promise.resolve({ error: 'finto errore' });
      return Promise.resolve({ pos: v.currentTime * 1000, dur: isFinite(v.duration) ? v.duration * 1000 : -1, live: !isFinite(v.duration), playing: !v.paused && v.readyState >= 3,
        state: ended ? 'ended' : v.readyState >= 3 ? 'ready' : 'buffering', w: v.videoWidth, h: v.videoHeight, dropped: 0, total: 0, error: err });
    },
    tracks() { return Promise.resolve({ audio: [{ g: 0, t: 0, lang: 'it', label: tr('Italiano'), on: true }, { g: 0, t: 1, lang: 'en', label: tr('English'), on: false }], text: [{ g: 1, t: 0, lang: 'it', label: tr('Italiano'), on: false }] }); },
    select(type, g, t) { log.push('select ' + type + ' ' + g + ' ' + t); }
  };
}
