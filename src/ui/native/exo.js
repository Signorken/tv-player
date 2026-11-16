// Android: lettore ExoPlayer (plugin nativo MaxPlayer incluso nell'APK, vedi packaging/android/MaxPlayerPlugin.java)
const P = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MaxPlayer;
export function exoAvailable() { return !!P(); }
export function exoBackend() {
  const p = P(), dpr = () => window.devicePixelRatio || 1;
  return {
    name: 'ExoPlayer',
    open(url) { return p.load({ url: url, ua: navigator.userAgent }); },
    play() { return p.play(); },
    pause() { return p.pause(); },
    seek(ms) { return p.seek({ ms: ms }); },
    stop() { return p.stop(); },
    rect(r) { const d = dpr(); return p.rect({ full: !!r.full, x: Math.round(r.x * d), y: Math.round(r.y * d), w: Math.round(r.w * d), h: Math.round(r.h * d) }); },
    fit(m) { return p.fit({ mode: m === 'cover' ? 'cover' : 'contain' }); },
    status() { return p.status(); },
    tracks() { return p.tracks(); },
    select(type, g, t) { return p.select({ type: type, g: g, t: t }); }
  };
}
