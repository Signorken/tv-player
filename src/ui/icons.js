// Icone SVG inline (nessun font di icone/emoji: sulle TV spesso mancano)
const P = {
  tv: 'M3 5h18a1 1 0 011 1v11a1 1 0 01-1 1h-7l1 2H9l1-2H3a1 1 0 01-1-1V6a1 1 0 011-1zm1 2v9h16V7z',
  film: 'M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zm12-8v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zM9 6v12h6V6z',
  series: 'M4 6h13v2H4zm0 4h13v2H4zm0 4h9v2H4zm13 0l5 3-5 3z',
  folder: 'M3 5h6l2 2h10a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1z',
  star: 'M12 2l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2 9.3l7-.8z',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm9 5v-2l-2.2-.7a7 7 0 00-.7-1.6l1.1-2-1.4-1.4-2 1.1a7 7 0 00-1.6-.7L13 3h-2l-.7 2.2a7 7 0 00-1.6.7l-2-1.1-1.4 1.4 1.1 2a7 7 0 00-.7 1.6L3 11v2l2.2.7c.2.6.4 1.1.7 1.6l-1.1 2 1.4 1.4 2-1.1c.5.3 1 .5 1.6.7L11 21h2l.7-2.2c.6-.2 1.1-.4 1.6-.7l2 1.1 1.4-1.4-1.1-2c.3-.5.5-1 .7-1.6z',
  search: 'M10 3a7 7 0 015.3 11.6l5.4 5.4-1.4 1.4-5.4-5.4A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M6 4h4v16H6zm8 0h4v16h-4z',
  back: 'M15 5l-7 7 7 7',
  phone: 'M8 2h8a1 1 0 011 1v18a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1zm1 3v12h6V5zm3 14a1 1 0 100 2 1 1 0 000-2z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  cloud: 'M7 18a5 5 0 01-.6-9.96A6 6 0 0118 9a4.5 4.5 0 011 8.9V18z',
  video: 'M4 5h12a1 1 0 011 1v3.5l5-3v11l-5-3V18a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z',
  list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  refresh: 'M12 5V2L8 6l4 4V7a5 5 0 11-5 5H5a7 7 0 107-7z',
  trash: 'M6 7h12l-1 14H7zM9 3h6l1 2h4v2H4V5h4z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zm1 4v5l4 2-1 1.7-5-2.7V7z',
  check: 'M5 13l4 4 10-10',
  full: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
  vol: 'M4 9h4l5-4v14l-5-4H4zm11.5 3a3.5 3.5 0 00-2-3.2v6.4a3.5 3.5 0 002-3.2zm1.4-6.2a8 8 0 010 12.4l-1.2-1.6a6 6 0 000-9.2z',
  mute: 'M4 9h4l5-4v14l-5-4H4zm12 1.4L17.4 9l1.6 1.6L20.6 9 22 10.4 20.4 12 22 13.6 20.6 15 19 13.4 17.4 15 16 13.6 17.6 12z',
  prev: 'M6 5h2v14H6zm3 7l10-7v14z',
  next: 'M16 5h2v14h-2zM5 5l10 7L5 19z',
  rw: 'M11 6v12L2 12zm10 0v12l-9-6z',
  ff: 'M3 6v12l9-6zm10 0v12l9-6z',
  clip: 'M9 2h6v2h3a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1h3zm1 2v2h4V4zM7 6v14h10V6h-1v2H8V6z',
  info: 'M11 10h2v8h-2zm0-4h2v2h-2zM12 2a10 10 0 100 20 10 10 0 000-20z'
};
export function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.info);
  if (name === 'back' || name === 'check') { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.5'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
  else p.setAttribute('fill', 'currentColor');
  s.appendChild(p);
  return s;
}
