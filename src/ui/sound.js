// Suoni di navigazione sintetizzati con Web Audio (nessun file): leggerissimi, disattivabili nelle impostazioni.
import { settings } from '../core/store.js';

let ctx = null, last = 0;
function ac() {
  if (ctx) return ctx;
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return null;
  try { ctx = new A(); } catch (e) { ctx = null; }
  return ctx;
}
function tone(f1, f2, ms, vol, type) {
  const c = ac(); if (!c) return;
  if (c.state === 'suspended' && c.resume) c.resume();
  const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + ms / 1000);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + ms / 1000 + 0.02);
}
const on = () => settings().sounds !== false;
export const Sound = {
  move() { if (!on()) return; const n = Date.now(); if (n - last < 45) return; last = n; tone(1500, 1250, 45, 0.035); },
  ok() { if (!on()) return; tone(700, 1050, 90, 0.06, 'triangle'); },
  back() { if (!on()) return; tone(620, 420, 80, 0.045, 'triangle'); }
};
// contatore delle selezioni: aumenta a ogni cambio di elemento selezionato (focus, liste, barra)
export const Sel = { v: 0 };
