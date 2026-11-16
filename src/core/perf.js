// Profilo prestazioni. Riferimento minimo: Thomson Streaming Stick 140 (Amlogic S905Y4, 4× Cortex-A35, Mali-G31 MP2, 2 GB).
// "auto": sui televisori e sulle chiavette deboli (≤2 GB di RAM o CPU lenta al test d'avvio) si usa il profilo leggero.
import { platform } from './platform.js';

function bench() {
  // ~4 ms su un PC recente, oltre 12 ms su CPU come il Cortex-A35: si prende il migliore di 3 tentativi
  let best = 1e9;
  for (let k = 0; k < 3; k++) {
    const t = performance.now(); const a = [];
    for (let i = 0; i < 20000; i++) a.push((i * 7919) % 10007);
    a.sort((x, y) => x - y);
    let s = ''; for (let i = 0; i < 3000; i++) s += String.fromCharCode(65 + i % 26);
    const d = document.createElement('div');
    for (let i = 0; i < 300; i++) { const e = document.createElement('span'); e.textContent = s.slice(i, i + 5); d.appendChild(e); }
    best = Math.min(best, performance.now() - t);
  }
  return Math.round(best * 10) / 10;
}

export const Perf = {
  mem: navigator.deviceMemory || 0,
  cores: navigator.hardwareConcurrency || 0,
  score: 0,
  weak: false,
  detect() {
    try { this.score = bench(); } catch (e) { this.score = 0; }
    this.weak = !platform.isDesktop && ((this.mem && this.mem <= 2) || this.score > 12 || (this.cores && this.cores <= 2));
    return this.weak;
  },
  // profilo effettivo: 'full' | 'lite'
  mode(setting) { return setting === 'lite' || (setting !== 'full' && this.weak) ? 'lite' : 'full'; }
};
