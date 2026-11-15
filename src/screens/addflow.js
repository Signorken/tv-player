// "Aggiungi sorgente" senza digitare: incolla, trascina, scegli un file, cerca nella rete, cartella del computer
import { uid } from '../core/util.js';
import * as store from '../core/store.js';
import { router } from '../core/router.js';
import * as Modal from '../ui/modal.js';
import { detect, hostName } from '../core/detect.js';
import { platform } from '../core/platform.js';
import { createSource, TYPE_LABEL } from '../sources/index.js';
import { showLoading, hideLoading } from '../core/session.js';
import { PlayerScreen } from './player.js';
import { sourceForm } from './settings.js';
import { PairScreen } from './settings.js';

function short(s, n) { s = String(s || ''); return s.length > (n || 70) ? s.slice(0, (n || 70) - 1) + '…' : s; }
function refreshCurrent() { const c = router.current; if (c && c.refresh) c.refresh(); else if (c && c.load && c.list) c.load(); }

export function playUrl(url, name) {
  const live = /\.(m3u8|ts)(\?|$)/i.test(url) || !/\.[a-z0-9]{2,4}(\?|$)/i.test(url.split('#')[0]);
  router.push(new PlayerScreen({
    kind: live ? 'live' : 'vod', list: [{ id: url, num: '' }], index: 0,
    resolve: it => ({ url: it.id, title: name || 'Flusso', sub: 'Aperto da link/file' })
  }));
}

async function verifyAndReport(cfg) {
  try { const msg = await createSource(cfg).test(); Modal.toast('✓ ' + cfg.name + ': ' + msg, 4500); return true; }
  catch (e) { Modal.toast('Sorgente aggiunta, ma la verifica non è riuscita: ' + e.message, 6500); return false; }
}

// Testo incollato/trascinato -> sorgente
export async function addFromText(text) {
  showLoading('Analizzo il contenuto…');
  let d; try { d = await detect(text); } finally { hideLoading(); }
  if (!d) { Modal.toast('Non riconosco né un link né una playlist IPTV in questo testo', 4000); return false; }
  if (d.type === 'unknown') {
    const t = await Modal.menu('Cos\'è questo indirizzo?  ' + short(d.url, 60), [
      { label: 'Playlist M3U', value: 'm3u', icon: 'list' },
      { label: 'NAS — WebDAV', value: 'webdav', icon: 'folder' },
      { label: 'NAS — indice HTTP (lista di file)', value: 'http', icon: 'folder' },
      { label: 'Un flusso video da guardare subito', value: 'stream', icon: 'play' }]);
    if (!t) return false;
    d = { type: t, name: d.name, url: d.url };
  }
  if (d.type === 'stream') { playUrl(d.url, d.name); return true; }
  const lines = [TYPE_LABEL[d.type] || d.type, d.name];
  if (d.user) lines.push('Utente: ' + d.user);
  if (d.url) lines.push(short(d.url));
  if (!(await Modal.confirm('Aggiungere questa sorgente?', lines.join('\n'), 'Aggiungi', 'Annulla'))) return false;
  const cfg = { id: uid(), type: d.type, name: d.name };
  if (d.type === 'm3ufile') await store.idbSet('file:' + cfg.id, d.text);
  else { cfg.url = d.url; if (d.user) { cfg.user = d.user; cfg.pass = d.pass; } if (d.epgMode) cfg.epgMode = d.epgMode; }
  store.addSource(cfg);
  refreshCurrent();
  await verifyAndReport(cfg);
  return true;
}

export async function addFromClipboard() {
  let t = '';
  try { t = window.desktop && window.desktop.readClipboard ? await window.desktop.readClipboard() : await navigator.clipboard.readText(); } catch (e) { /* */ }
  if (!t) { Modal.toast('Gli appunti sono vuoti. Copia un link o una playlist e riprova (oppure premi Ctrl+V).', 4500); return false; }
  return addFromText(t);
}

// File trascinati/scelti: playlist -> sorgente; video -> riproduzione
function readFile(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }); }
export async function importFiles(files) {
  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = f.name || 'file';
    if (/\.(m3u8?|txt)$/i.test(name) || (f.size < 40e6 && !/\.(mp4|mkv|avi|mov|ts|webm)$/i.test(name))) {
      try {
        const text = (await readFile(f)).replace(/^﻿/, '');
        if (/^\s*#EXTM3U/i.test(text) && !/#EXT-X-(STREAM-INF|TARGETDURATION)/.test(text.slice(0, 4000))) {
          const id = uid(); await store.idbSet('file:' + id, text);
          const cfg = { id: id, type: 'm3ufile', name: name.replace(/\.[^.]+$/, '') };
          store.addSource(cfg); added++; refreshCurrent();
          await verifyAndReport(cfg);
          continue;
        }
        if (text.trim()) { await addFromText(text); continue; }
      } catch (e) { /* prova come video */ }
    }
    if (/\.(mp4|mkv|avi|mov|ts|webm|m4v)$/i.test(name)) {
      let url = '';
      try { if (window.desktop && window.desktop.pathForFile) { const p = window.desktop.pathForFile(f); if (p) { const { toFileUrl } = await import('../sources/shared.js'); url = toFileUrl(p); } } } catch (e) { /* */ }
      playUrl(url || URL.createObjectURL(f), name.replace(/\.[^.]+$/, ''));
      return;
    }
    Modal.toast('Formato non riconosciuto: ' + name, 3500);
  }
  return added;
}

export function pickPlaylistFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl';
  inp.style.display = 'none'; document.body.appendChild(inp);
  inp.onchange = () => { if (inp.files && inp.files.length) importFiles(inp.files); setTimeout(() => inp.remove(), 1000); };
  inp.click();
}

export async function addFolderFlow() {
  if (!window.desktop) { Modal.toast('Disponibile solo nell\'app per computer'); return; }
  const p = await window.desktop.pickFolder();
  if (!p) return;
  const name = p.split(/[\\/]/).filter(Boolean).pop() || p;
  const cfg = { id: uid(), type: 'local', name: name, path: p };
  store.addSource(cfg); refreshCurrent();
  Modal.toast('Cartella aggiunta: ' + name + ' — la trovi in “File di rete”', 4000);
}

// Ricerca automatica di NAS (WebDAV/HTTP via mDNS) e server DLNA/UPnP
export async function discoverFlow() {
  if (!window.desktop || !window.desktop.discover) { Modal.toast('La ricerca in rete richiede l\'app per computer'); return; }
  showLoading('Cerco dispositivi nella rete locale…', 'NAS, server DLNA/UPnP, WebDAV (circa 4 secondi)');
  let found = [];
  try { found = await window.desktop.discover(4000); } catch (e) { /* */ }
  hideLoading();
  if (!found.length) {
    if (await Modal.confirm('Nessun dispositivo trovato', 'Il NAS potrebbe non annunciarsi in rete o il firewall blocca la ricerca. Puoi incollare il suo indirizzo (Ctrl+V) oppure scegliere una cartella già montata dal sistema.', 'Scegli una cartella', 'Chiudi')) addFolderFlow();
    return;
  }
  const label = { dlna: 'DLNA/UPnP', webdav: 'WebDAV', http: 'Server web', smb: 'Condivisione Windows (SMB)' };
  const items = found.map((f, i) => ({ label: f.name, sub: (label[f.kind] || f.kind) + '  •  ' + (f.host || ''), value: i, icon: f.kind === 'dlna' ? 'video' : 'folder' }));
  const pick = await Modal.menu('Dispositivi trovati (' + found.length + ')', items);
  if (pick == null) return;
  const f = found[pick];
  if (f.kind === 'smb') {
    if (await Modal.confirm('Condivisione Windows (SMB)', 'Le condivisioni SMB non si leggono direttamente: aprila dal sistema (Esplora risorse, Finder o file manager) in modo che compaia come cartella, poi scegli quella cartella qui.', 'Scegli cartella', 'Annulla')) addFolderFlow();
    return;
  }
  const cfg = { id: uid(), type: f.kind, name: f.name };
  if (f.kind === 'dlna') cfg.control = f.control; else cfg.url = f.url;
  if (f.kind === 'dlna') cfg.url = f.url;
  showLoading('Verifico ' + f.name + '…');
  let err = null; try { await createSource(cfg).test(); } catch (e) { err = e; }
  hideLoading();
  if (err && /401|403/.test(err.message)) { Modal.toast('Questo server richiede utente e password'); sourceForm(f.kind, cfg); return; }
  if (err) { if (!(await Modal.confirm('Verifica non riuscita', err.message + '\n\nAggiungerlo comunque?', 'Aggiungi', 'Annulla'))) return; }
  store.addSource(cfg); refreshCurrent();
  Modal.toast(err ? 'Aggiunto: ' + f.name : '✓ Aggiunto: ' + f.name, 3500);
}

export async function addSourceFlow(preType) {
  let t = preType;
  if (!t) {
    const d = platform.isDesktop, items = [];
    if (d) {
      items.push({ label: 'Incolla un link o una playlist dagli appunti', sub: 'Riconosco da solo M3U, Xtream (anche da get.php?username=…) e NAS', value: 'clip', icon: 'clip' });
      items.push({ label: 'Scegli un file playlist (.m3u / .m3u8)…', sub: 'Oppure trascinalo nella finestra', value: 'file', icon: 'list' });
      items.push({ label: 'Cerca NAS e server nella rete locale', sub: 'DLNA/UPnP, WebDAV: nessun indirizzo da scrivere', value: 'discover', icon: 'cloud' });
      items.push({ label: 'Cartella del computer o NAS già montato', sub: 'Esplora risorse / Finder / SMB montato', value: 'folder', icon: 'folder' });
    }
    if (d) items.push({ label: d ? 'Xtream Codes — inserimento guidato' : 'Xtream Codes (server + utente + password)', sub: 'Live, film, serie con locandine e trame', value: 'xtream', icon: 'cloud' });
    items.push({ label: d ? 'Playlist M3U da indirizzo web — manuale' : 'Playlist M3U da indirizzo web', sub: 'URL di una lista .m3u/.m3u8 con canali o film', value: 'm3u', icon: 'list' });
    if (!d) items.push({ label: d ? 'Xtream Codes — inserimento guidato' : 'Xtream Codes (server + utente + password)', sub: 'Live, film, serie con locandine e trame', value: 'xtream', icon: 'cloud' });
    items.push({ label: 'NAS / server di rete — WebDAV', sub: 'Synology, QNAP, TrueNAS, Nextcloud, rclone…', value: 'webdav', icon: 'folder' });
    items.push({ label: 'NAS / server di rete — indice HTTP', sub: 'nginx/apache autoindex, miniserve, caddy file_server', value: 'http', icon: 'folder' });
    if (!d) items.push({ label: 'Playlist da file del telefono / PC', sub: 'Invio dal telefono tramite companion', value: 'phone', icon: 'phone' });
    if (platform.name === 'web') items.push({ label: 'Scegli un file playlist dal dispositivo…', value: 'file', icon: 'list' });
    t = await Modal.menu('Che sorgente vuoi aggiungere?', items);
  }
  if (!t) return;
  if (t === 'clip') return addFromClipboard();
  if (t === 'file') return pickPlaylistFile();
  if (t === 'discover') return discoverFlow();
  if (t === 'folder') return addFolderFlow();
  if (t === 'phone') { router.push(new PairScreen()); return; }
  sourceForm(t, null);
}
