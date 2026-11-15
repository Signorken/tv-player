// Client del "relay" del companion: permette di usare lo smartphone come tastiera, telecomando
// e per inviare sorgenti/playlist/URL alla TV (le web app TV non possono fare da server HTTP).
import { settings } from './store.js';

let es = null, connected = false, phone = false;
const handlers = [];

export const Remote = {
  base() { return (settings().companion || '').replace(/\/+$/, ''); },
  room() { return settings().room; },
  configured() { return !!this.base(); },
  pairUrl() { return this.base() + '/remote?room=' + this.room(); },
  get connected() { return connected; },
  get phoneSeen() { return phone; },
  onMessage(fn) { handlers.push(fn); },

  start() {
    this.stop();
    if (!this.configured() || typeof EventSource === 'undefined') return;
    try {
      es = new EventSource(this.base() + '/r/' + this.room() + '/tv-events');
      es.onopen = () => { connected = true; };
      es.onerror = () => { connected = false; };
      es.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'hello') phone = true;
        for (let i = 0; i < handlers.length; i++) { try { handlers[i](m); } catch (e) { /* */ } }
      };
    } catch (e) { connected = false; }
  },
  stop() { if (es) { es.close(); es = null; } connected = false; },

  // TV -> telefono (es. titolo del campo che si sta compilando)
  send(msg) {
    if (!this.configured()) return;
    try {
      fetch(this.base() + '/r/' + this.room() + '/to-phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }).catch(() => { });
    } catch (e) { /* */ }
  }
};
