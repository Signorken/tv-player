// Indicatore prestazioni (Impostazioni › Aspetto): fotogrammi al secondo, ritardo dei tasti, profilo e dispositivo.
// Attivo solo se richiesto: quando è spento non gira nulla.
import { Perf } from '../core/perf.js';
import { settings } from '../core/store.js';

let el = null, on = false, frames = 0, last = 0, fps = 0, keys = [], raf = 0, tmr = 0;
function loop(t) { frames++; raf = requestAnimationFrame(loop); }
function onKey() {
  const s = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => { keys.push(performance.now() - s); if (keys.length > 20) keys.shift(); }));
}
function paint() {
  const now = performance.now();
  fps = Math.round(frames * 1000 / Math.max(1, now - last)); frames = 0; last = now;
  const sorted = keys.slice().sort((a, b) => a - b);
  const med = sorted.length ? Math.round(sorted[sorted.length >> 1]) : 0, worst = sorted.length ? Math.round(sorted[sorted.length - 1]) : 0;
  el.textContent = fps + ' fps · tasti ' + med + '/' + worst + ' ms · ' + (Perf.mode(settings().perf) === 'lite' ? 'leggero' : 'qualità') +
    ' · ' + (Perf.mem ? Perf.mem + ' GB · ' : '') + (Perf.cores ? Perf.cores + ' core · ' : '') + 'test ' + Perf.score + ' ms';
}
export const Hud = {
  show(v) {
    if (v === on) return; on = v;
    if (v) {
      el = el || document.createElement('div'); el.id = 'hud'; document.body.appendChild(el);
      last = performance.now(); frames = 0; raf = requestAnimationFrame(loop); tmr = setInterval(paint, 1000);
      document.addEventListener('keydown', onKey, true);
    } else {
      cancelAnimationFrame(raf); clearInterval(tmr); document.removeEventListener('keydown', onKey, true);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }
};
