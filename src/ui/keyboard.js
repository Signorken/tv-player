// Tastiera a schermo navigabile col telecomando + supporto tastiera fisica, tastiera di sistema e telefono
import { h } from '../core/util.js';
import * as nav from '../core/nav.js';
import * as Modal from './modal.js';
import { Remote } from '../core/remote.js';
import { platform } from '../core/platform.js';

const L1 = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const L2 = ['!@#$%^&*()', '-_=+/\\|:;', '"\'?,.<>~`', '[]{}()@#_'];
const QUICK = ['http://', 'https://', 'www.', '.com', '.it', ':8080'];

export const active = { prompt: null };

// promptText({title, value, password, hint, quick}) -> Promise<string|null>
export function promptText(o) {
  return new Promise(res => {
    let shift = false, caps = false, sym = false, shown = !o.password, lastPhysical = 0, finished = false;
    const input = h('input', { class: 'kb-input', type: o.password ? 'password' : 'text', readonly: true, value: o.value || '', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const hint = h('div', { class: 'kb-hint', text: o.hint || '' });
    const keysBox = h('div', { class: 'kb-keys' });
    let m;

    const setVal = v => { input.value = v; };
    const up = () => (shift || caps) && !sym;
    const add = ch => { input.value += (up() ? ch.toUpperCase() : ch); if (shift && !caps && !sym) { shift = false; build('keep'); } };
    const del = () => { input.value = input.value.slice(0, -1); };
    const finish = v => { if (finished) return; finished = true; active.prompt = null; Remote.send({ t: 'prompt-end' }); m.close(v); res(v); };

    function key(label, fn, cls) {
      return h('div', { class: 'key ' + (cls || ''), 'data-f': 1, onclick: fn, text: label });
    }
    let keepCh = null;
    function build(focusKey) {
      const f = nav.getFocus(); keepCh = f && f._ch;
      keysBox.innerHTML = '';
      const rows = sym ? L2 : L1;
      let toFocus = null;
      rows.forEach((r, ri) => {
        const row = h('div', { class: 'kb-row' });
        if (ri === 3) row.appendChild(key(caps ? '⇪ ABC' : shift ? '⇧ Abc' : '⇧ abc', () => { if (caps) { caps = false; shift = false; } else if (shift) { caps = true; } else shift = true; build('shift'); }, 'wide shiftk' + (shift || caps ? ' on' : '') + (caps ? ' caps' : '')));
        r.split('').forEach(ch => {
          const k = key(up() ? ch.toUpperCase() : ch, () => add(ch)); k._ch = ch;
          row.appendChild(k);
        });
        if (ri === 3) row.appendChild(key('⌫', del, 'wide'));
        keysBox.appendChild(row);
      });
      const r5 = h('div', { class: 'kb-row' },
        key(sym ? 'ABC' : '123 #', () => { sym = !sym; build('sym'); }, 'wide' + (sym ? ' on' : '')),
        key('@', () => add('@')), key('.', () => add('.')),
        key('spazio', () => add(' '), 'space'),
        key('/', () => add('/')), key(':', () => add(':')), key('-', () => add('-')));
      keysBox.appendChild(r5);
      if (o.quick !== false) keysBox.appendChild(h('div', { class: 'kb-row quick' }, QUICK.map(q => key(q, () => { input.value += q; }, 'q'))));
      if (focusKey === 'shift') toFocus = keysBox.querySelector('.shiftk');
      if (focusKey === 'keep' && keepCh) toFocus = [].slice.call(keysBox.querySelectorAll('.key')).find(k => k._ch === keepCh) || null;
      if (focusKey === 'sym') toFocus = r5.firstChild;
      if (toFocus) nav.focus(toFocus);
    }
    build();

    const D = platform.isDesktop;
    const pasteBtn = async () => { let t = ''; try { t = window.desktop && window.desktop.readClipboard ? await window.desktop.readClipboard() : await navigator.clipboard.readText(); } catch (e) { /* */ } if (t) { input.value = t.trim(); input.focus(); } };
    const acts = h('div', { class: 'kb-acts' },
      h('div', { class: 'btn', 'data-f': 1, text: 'Annulla', onclick: () => finish(null) }),
      D ? h('div', { class: 'btn', 'data-f': 1, text: 'Incolla', onclick: pasteBtn }) : null,
      D ? null : h('div', { class: 'btn', 'data-f': 1, text: 'Cancella tutto', onclick: () => setVal('') }),
      D ? null : h('div', { class: 'btn', 'data-f': 1, text: 'Tastiera di sistema', onclick: () => sysKeyboard() }),
      o.password ? h('div', { class: 'btn', 'data-f': 1, text: 'Mostra/nascondi', onclick: () => { shown = !shown; input.type = shown ? 'text' : 'password'; } }) : null,
      h('div', { class: 'btn primary', 'data-f': 1, text: 'OK', onclick: () => finish(input.value) }));

    function sysKeyboard() {
      // Mostra la tastiera nativa della TV (o quella del telefono se abbinato all'app remote del produttore)
      input.readOnly = false; input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* */ }
      input.onblur = () => { input.readOnly = true; input.onblur = null; };
    }

    m = Modal.open([
      h('div', { class: 'mtitle', text: o.title || 'Inserisci testo' }),
      input, hint, D ? null : keysBox, acts,
      D ? null : h('div', { class: 'kb-tip', text: 'Puoi anche scrivere con una tastiera Bluetooth/USB o dal telefono (Impostazioni > Telefono remoto).' })
    ], { cls: 'kb' + (D ? ' kbd-desk' : ''), focus: null });
    if (D) { input.readOnly = false; setTimeout(() => { input.focus(); try { input.select(); } catch (e) { /* */ } }, 30); }
    // focus iniziale sul tasto "q" (o sul pulsante OK se si sta solo confermando)
    if (!D) { const first = keysBox.querySelectorAll('.key')[11] || keysBox.querySelector('.key'); nav.focus(first); }

    m.onKey = (a, e) => {
      if (a.a === 'num') { lastPhysical = Date.now(); input.value += String(a.d); return true; }
      if (a.a === 'char') { lastPhysical = Date.now(); input.value += a.c; return true; }
      if (a.a === 'backspace') { lastPhysical = Date.now(); del(); return true; }
      if (a.a === 'back') { finish(null); return true; }
      if (a.a === 'inputEnter') { finish(input.value); return true; }
      if (a.a === 'ok' && Date.now() - lastPhysical < 2500) { finish(input.value); return true; } // Invio da tastiera fisica
      return false;
    };
    m.onClose = r => { if (!finished) { finished = true; active.prompt = null; Remote.send({ t: 'prompt-end' }); res(null); } };
    Remote.send({ t: 'prompt', title: o.title || '', value: o.value || '', password: !!o.password });
    active.prompt = { setValue: setVal, getValue: () => input.value, submit: () => finish(input.value), cancel: () => finish(null) };
  });
}
