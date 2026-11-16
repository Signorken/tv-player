// Android (APK): versione, aggiornamento dell'APK dall'app, chiavette USB. Usa il plugin nativo MaxSystem (MaxSystemPlugin.java).
import * as Modal from '../ui/modal.js';
import { showLoading, setLoading, hideLoading } from './session.js';
import { platform } from './platform.js';
import { tr } from './i18n.js';

const VERSION_URL = 'https://raw.githubusercontent.com/Signorken/tv-player/updates/version.json';
const P = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MaxSystem;
const isAndroidApk = () => (platform.name === 'android' || platform.name === 'firetv') && !!window.Capacitor;
function cmp(a, b) { a = String(a || '0').split('.'); b = String(b || '0').split('.'); for (let i = 0; i < 3; i++) { const d = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0); if (d) return d; } return 0; }
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* */ } } };

export const Android = {
  get available() { return !!P(); },
  async info() { const p = P(); return p ? p.info() : null; },

  // ---------- aggiornamento dell'APK
  async latest(fresh) {
    // all'avvio il guscio ha appena letto version.json: si riusa
    if (!fresh && window.__mxLatest && window.__mxLatest.version) return window.__mxLatest;
    const r = await fetch((window.__mxVersionUrl || VERSION_URL) + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  },
  /** all'avvio (auto) o da Impostazioni (manual): se serve un APK più nuovo propone di installarlo */
  async check(manual) {
    if (!isAndroidApk()) return false;
    let r; try { r = await this.latest(manual); } catch (e) { if (manual) Modal.toast(tr('Verifica non riuscita')); return false; }
    if (!r.apk) { if (manual) Modal.toast(tr('L\'app è aggiornata')); return false; }
    const p = P();
    if (!p) {
      // APK precedente alla 2.7: non sa installarsi da solo, lo si dice una volta per versione
      if (!manual && ls.get('mx.apkhint') === r.apk) return false;
      ls.set('mx.apkhint', r.apk);
      await Modal.confirm(tr('Nuova app disponibile'), tr('Questa versione dell\'app va installata una volta a mano (APK ') + r.apk + tr(' da GitHub). Dalla prossima si aggiornerà da sola, da dentro l\'app.'), 'OK', '');
      return true;
    }
    const inf = await p.info();
    if (cmp(inf.version, r.apk) >= 0) { if (manual) Modal.toast(tr('L\'app è aggiornata') + ' (v' + inf.version + ')'); return false; }
    if (!manual && Number(ls.get('mx.apksnooze') || 0) > Date.now()) return false;
    const go = await Modal.confirm(tr('Aggiornamento dell\'app'), tr('È disponibile la versione ') + r.version + tr(' dell\'app (hai la ') + inf.version + tr('). La scarico e la installo? Sorgenti, preferiti e liste restano.'), tr('Aggiorna ora'), tr('Più tardi'));
    if (!go) { ls.set('mx.apksnooze', String(Date.now() + 24 * 3600000)); return false; }
    return this.install(r.apkUrl);
  },
  async install(url) {
    const p = P(); if (!p) return false;
    let h = null;
    try {
      h = await p.addListener('apkProgress', e => setLoading(e.p >= 0 ? e.p + '%' : ''));
      showLoading(tr('Scarico l\'aggiornamento…'), '');
      const res = await p.installApk({ url: url });
      hideLoading();
      if (res && res.needPermission) {
        await Modal.confirm(tr('Un permesso, una volta sola'), tr('Nella schermata che si è aperta attiva "Consenti da questa fonte" per MAXENTA, poi torna indietro: l\'aggiornamento riparte.'), 'OK', '');
        return this.install(url);
      }
      return true;
    } catch (e) {
      hideLoading(); Modal.toast(tr('Aggiornamento non riuscito') + ': ' + (e.message || e), 6000); return false;
    } finally { if (h && h.remove) h.remove(); }
  },

  // ---------- chiavette USB
  async usbVolumes() { const p = P(); if (!p) return []; try { return (await p.usbVolumes()).volumes || []; } catch (e) { return []; } },
  async usbGrant(id) { const p = P(); const r = await p.usbGrant({ id: id }); return r && r.tree; },
  async usbList(tree, doc) { return (await P().usbList({ tree: tree, doc: doc || '' })).items || []; },
  onUsb(cb) { const p = P(); if (p && p.addListener) p.addListener('usbChange', cb); }
};
