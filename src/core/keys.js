// Normalizzazione tasti: telecomandi Tizen / webOS / VIDAA / Android TV + tastiera fisica
const CODE = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 29443: 'ok', 65376: 'ok',
  27: 'back', 461: 'back', 10009: 'back', 8: 'back', 166: 'back',
  415: 'play', 19: 'pause', 179: 'playpause', 10252: 'playpause', 413: 'stop', 178: 'stop',
  417: 'ff', 228: 'ff', 412: 'rw', 227: 'rw', 176: 'next', 177: 'prev',
  427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
  112: 'red', 113: 'green', 114: 'yellow', 115: 'blue',
  457: 'info', 10073: 'info', 458: 'guide', 93: 'menu', 46: 'del'
};
const NAME = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok',
  Escape: 'back', GoBack: 'back', BrowserBack: 'back',
  MediaPlay: 'play', MediaPause: 'pause', MediaPlayPause: 'playpause', MediaStop: 'stop',
  MediaFastForward: 'ff', MediaRewind: 'rw', MediaTrackNext: 'next', MediaTrackPrevious: 'prev',
  ChannelUp: 'chup', ChannelDown: 'chdown', PageUp: 'chup', PageDown: 'chdown',
  ColorF0Red: 'red', ColorF1Green: 'green', ColorF2Yellow: 'yellow', ColorF3Blue: 'blue',
  Info: 'info', ContextMenu: 'menu'
};

export function actionFor(e) {
  const k = e.keyCode;
  if ((k >= 48 && k <= 57)) return { a: 'num', d: k - 48 };
  if ((k >= 96 && k <= 105)) return { a: 'num', d: k - 96 };
  let a = NAME[e.key] || CODE[k];
  return a ? { a: a } : null;
}

function isTyping(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.readOnly;
}

// handler(action, event). OK viene emesso al rilascio; tenendolo premuto >600ms emette 'menu'.
export function installKeys(handler) {
  // Android: l'APK segnala Indietro tenuto premuto con un evento (la pagina non vede la durata del tasto)
  window.addEventListener('maxenta-longback', () => handler({ a: 'longback' }));
  let okDown = false, okLong = false, okT = null, bkDown = false, bkLong = false, bkT = null;
  window.addEventListener('keydown', function (e) {
    if (isTyping(e.target)) {
      if (e.keyCode === 27 || e.keyCode === 10009 || e.keyCode === 461) { e.preventDefault(); handler({ a: 'back' }, e); }
      else if (e.keyCode === 13) { e.preventDefault(); handler({ a: 'inputEnter' }, e); }
      return;
    }
    const act = actionFor(e);
    if (!act) {
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) handler({ a: 'char', c: e.key }, e);
      return;
    }
    e.preventDefault();
    if (act.a === 'ok') {
      // OK lungo: un timer (non i keydown ripetuti, che alcuni telecomandi Samsung/LG non inviano)
      if (okDown) return;
      okDown = true; okLong = false;
      clearTimeout(okT);
      okT = setTimeout(() => { if (okDown && !okLong) { okLong = true; handler({ a: 'menu' }, e); } }, 650);
      return;
    }
    if (act.a === 'back' && e.keyCode !== 8) {
      // Indietro: breve = indietro, tenuto premuto = chiudi (player / finestrella) — per i telecomandi senza Stop
      if (bkDown) return;
      bkDown = true; bkLong = false; clearTimeout(bkT);
      bkT = setTimeout(() => { if (bkDown && !bkLong) { bkLong = true; handler({ a: 'longback' }, e); } }, 800);
      return;
    }
    if (act.a === 'back' && e.keyCode === 8) { handler({ a: 'backspace' }, e); return; }
    handler(act, e);
  }, true);
  window.addEventListener('keyup', function (e) {
    if (isTyping(e.target)) return;
    const act = actionFor(e);
    if (act && act.a === 'back' && e.keyCode !== 8) {
      e.preventDefault(); clearTimeout(bkT);
      if (bkDown && !bkLong) handler(act, e);
      bkDown = false; bkLong = false; return;
    }
    if (act && act.a === 'ok') {
      e.preventDefault();
      clearTimeout(okT);
      if (okDown && !okLong) handler(act, e);
      okDown = false; okLong = false;
    }
  }, true);
}
