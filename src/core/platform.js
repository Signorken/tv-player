// Rilevamento piattaforma e funzioni specifiche (registrazione tasti, uscita app, ecc.)
const ua = navigator.userAgent || '';
let name = 'web';
if (window.desktop) name = 'desktop';
else if (/Tizen/i.test(ua) || typeof window.tizen !== 'undefined') name = 'tizen';
else if (/Web0S|webOS|NetCast/i.test(ua) || typeof window.webOS !== 'undefined') name = 'webos';
else if (/VIDAA|Hisense|Vestel/i.test(ua)) name = 'vidaa';
else if (/\bAFT[A-Z0-9]*\b|Amazon/i.test(ua) && /Android/i.test(ua)) name = 'firetv';
else if (/Android/i.test(ua)) name = 'android';

export const platform = { name, isTV: name !== 'web' && name !== 'desktop', isDesktop: name === 'desktop' };

export function toggleFullscreen() {
  try {
    if (window.desktop && window.desktop.toggleFullscreen) { window.desktop.toggleFullscreen(); return; }
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const e = d.documentElement; (e.requestFullscreen || e.webkitRequestFullscreen).call(e); }
  } catch (e) { /* */ }
}

export function initPlatform() {
  try {
    if (name === 'tizen' && window.tizen && window.tizen.tvinputdevice) {
      // Tizen: i tasti multimediali/colorati vanno registrati esplicitamente
      const keys = ['MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaPlayPause',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown', 'Info',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      keys.forEach(k => { try { window.tizen.tvinputdevice.registerKey(k); } catch (e) { /* alcuni modelli non li hanno */ } });
    }
  } catch (e) { /* ignore */ }
  try {
    // Android (Capacitor): tasto indietro fisico -> azione 'back'
    const cap = window.Capacitor;
    if (cap && cap.Plugins && cap.Plugins.App) {
      cap.Plugins.App.addListener('backButton', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, key: 'Escape', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 27, key: 'Escape', bubbles: true }));
      });
    }
  } catch (e) { /* ignore */ }
}

export function exitApp() {
  try {
    if (name === 'tizen' && window.tizen) { window.tizen.application.getCurrentApplication().exit(); return; }
    if (name === 'webos') { if (window.webOS && window.webOS.platformBack) { window.webOS.platformBack(); return; } }
    const cap = window.Capacitor;
    if (cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.exitApp) { cap.Plugins.App.exitApp(); return; }
  } catch (e) { /* ignore */ }
  try { window.close(); } catch (e) { /* ignore */ }
}
