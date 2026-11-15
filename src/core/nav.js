// Navigazione spaziale leggera: sceglie l'elemento [data-f] più vicino nella direzione premuta.
let scope = document.body;
let current = null;

export function setScope(el) { scope = el || document.body; }
export function getScope() { return scope; }
export function getFocus() { return current; }

function visible(el) {
  if (el.hasAttribute('data-off')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(root) {
  const list = (root || scope).querySelectorAll('[data-f]');
  const out = [];
  for (let i = 0; i < list.length; i++) if (visible(list[i])) out.push(list[i]);
  return out;
}

export function focus(el, noScroll) {
  if (current && current !== el) current.classList.remove('focused');
  current = el || null;
  if (!el) return;
  el.classList.add('focused');
  if (!noScroll) ensureVisible(el);
  if (el.onfocusnav) el.onfocusnav();
}

// scorri il contenitore [data-scroll] più vicino per rendere visibile l'elemento
function ensureVisible(el) {
  const box = el.closest('[data-scroll]');
  if (!box) return;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (r.top < b.top + 8) box.scrollTop -= (b.top + 8 - r.top);
  else if (r.bottom > b.bottom - 8) box.scrollTop += (r.bottom - b.bottom + 8);
  if (r.left < b.left + 8) box.scrollLeft -= (b.left + 8 - r.left);
  else if (r.right > b.right - 8) box.scrollLeft += (r.right - b.right + 8);
}

export function focusFirst(root) {
  const f = focusables(root);
  if (f.length) { focus(f[0]); return f[0]; }
  return null;
}

export function move(dir) {
  const list = focusables();
  if (!list.length) return false;
  if (!current || list.indexOf(current) < 0) { focus(list[0]); return true; }
  const c = current.getBoundingClientRect();
  let best = null, bestScore = Infinity;
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    let prim, sec;
    if (dir === 'right') { prim = r.left - c.right; if (r.left + r.width / 2 <= c.left + c.width / 2) continue; sec = gap(c.top, c.bottom, r.top, r.bottom); }
    else if (dir === 'left') { prim = c.left - r.right; if (r.left + r.width / 2 >= c.left + c.width / 2) continue; sec = gap(c.top, c.bottom, r.top, r.bottom); }
    else if (dir === 'down') { prim = r.top - c.bottom; if (r.top + r.height / 2 <= c.top + c.height / 2) continue; sec = gap(c.left, c.right, r.left, r.right); }
    else { prim = c.top - r.bottom; if (r.top + r.height / 2 >= c.top + c.height / 2) continue; sec = gap(c.left, c.right, r.left, r.right); }
    if (prim < -2) prim = 0; // sovrapposti
    const score = prim + sec * 3 + (sec > 0 ? 40 : 0);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { focus(best); return true; }
  return false;
}

function gap(a1, a2, b1, b2) {
  if (b1 >= a2) return b1 - a2;
  if (a1 >= b2) return a1 - b2;
  return 0;
}

export function activate() {
  if (current && document.body.contains(current)) { current.click(); return true; }
  return false;
}
