// Samsung Tizen: lettore AVPlay (webapis.avplay). Il video sta sul piano video della TV, sotto la pagina.
// Le coordinate di setDisplayRect sono riferite a 1920×1080 qualunque sia la risoluzione dell'app.
export function avplayAvailable() { return !!(window.webapis && window.webapis.avplay); }
export function avplayBackend() {
  const av = window.webapis.avplay;
  let obj = document.getElementById('avplayer');
  if (!obj) {
    obj = document.createElement('object'); obj.id = 'avplayer'; obj.setAttribute('type', 'application/avplayer');
    obj.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:-1';
    document.body.insertBefore(obj, document.body.firstChild);
  }
  let st = { state: 'idle', error: '', ended: false, buffering: false, start: 0 }, subFn = null, lastRect = null;
  const listener = {
    onbufferingstart() { st.buffering = true; },
    onbufferingcomplete() { st.buffering = false; },
    onstreamcompleted() { st.ended = true; },
    onerror(e) { st.error = 'avplay ' + e; },
    onevent() { },
    onsubtitlechange(d, text) { if (subFn) subFn(text || ''); },
    oncurrentplaytime() { }
  };
  const applyRect = () => {
    const r = lastRect; if (!r) return;
    const k = 1920 / (r.vw || window.innerWidth || 1920), kh = 1080 / (r.vh || window.innerHeight || 1080);
    try { if (r.full) av.setDisplayRect(0, 0, 1920, 1080); else av.setDisplayRect(Math.round(r.x * k), Math.round(r.y * kh), Math.round(r.w * k), Math.round(r.h * kh)); } catch (e) { /* */ }
  };
  const info = () => { try { return av.getTotalTrackInfo() || []; } catch (e) { return []; } };
  const extra = t => { try { return JSON.parse(t.extra_info || '{}'); } catch (e) { return {}; } };
  return {
    name: 'AVPlay',
    open(url) {
      try { av.stop(); av.close(); } catch (e) { /* */ }
      st = { state: 'loading', error: '', ended: false, buffering: true };
      av.open(url);
      av.setListener(listener);
      applyRect();
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* */ }
      av.prepareAsync(() => { st.state = 'ready'; st.buffering = false; try { av.play(); } catch (e) { st.error = 'avplay play'; } }, e => { st.error = 'avplay prepare ' + e; });
    },
    play() { try { av.play(); } catch (e) { /* */ } },
    pause() { try { av.pause(); } catch (e) { /* */ } },
    seek(ms) { try { av.seekTo(ms, () => { }, () => { }); } catch (e) { /* */ } },
    stop() { try { av.stop(); av.close(); } catch (e) { /* */ } st.state = 'idle'; },
    rect(r) { lastRect = r; applyRect(); },
    fit(m) { try { av.setDisplayMethod(m === 'cover' ? 'PLAYER_DISPLAY_MODE_FULL_SCREEN' : 'PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* */ } },
    status() {
      let s = '', pos = 0, dur = 0, w = 0, h = 0;
      try { s = av.getState(); pos = av.getCurrentTime(); dur = av.getDuration(); } catch (e) { /* */ }
      info().forEach(t => { if (t.type === 'VIDEO') { const x = extra(t); w = +x.Width || w; h = +x.Height || h; } });
      return Promise.resolve({
        pos: pos, dur: dur > 0 ? dur : -1, live: !(dur > 0), w: w, h: h, error: st.error,
        playing: s === 'PLAYING' && !st.buffering,
        state: st.ended ? 'ended' : st.buffering ? 'buffering' : (s === 'PLAYING' || s === 'PAUSED' || s === 'READY') ? 'ready' : 'buffering'
      });
    },
    tracks() {
      const out = { audio: [], text: [] };
      let cur = {}; try { (av.getCurrentStreamInfo() || []).forEach(t => { cur[t.type] = t.index; }); } catch (e) { /* */ }
      info().forEach(t => {
        const x = extra(t), lang = x.language || x.track_lang || '';
        if (t.type === 'AUDIO') out.audio.push({ g: t.index, t: t.index, lang: lang, codec: x.fourCC || '', ch: +x.channels || 0, on: cur.AUDIO === t.index });
        if (t.type === 'TEXT' || t.type === 'SUBTITLE') out.text.push({ g: t.index, t: t.index, lang: lang, label: lang, on: false });
      });
      return Promise.resolve(out);
    },
    select(type, g) {
      try {
        if (type === 'audio') av.setSelectTrack('AUDIO', g);
        else if (g < 0) { av.setSilentSubtitle(true); if (subFn) subFn(''); } else { av.setSilentSubtitle(false); av.setSelectTrack('TEXT', g); }
      } catch (e) { /* */ }
    },
    onSubtitle(fn) { subFn = fn; }
  };
}
