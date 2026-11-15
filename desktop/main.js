// MAXENTA per computer (Windows, macOS, Linux): stesso codice dell'app per TV dentro una finestra Electron.
'use strict';
const { app, BrowserWindow, ipcMain, dialog, clipboard, session, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { discover } = require('./discover');
const dlna = require('./dlna');
const menu = require('./menu');
const updater = require('./updater');
const transcode = require('./transcode');

// l'app si chiama MAXENTA, ma i dati restano nella cartella storica 'TV Player' (sorgenti, preferiti e progressi non si perdono)
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'TV Player'));
let win = null, readyForPaths = false, pendingPaths = [], userAgent = '';
const PLAYLIST_EXT = /\.(m3u8?|txt)$/i;
const READABLE_EXT = /\.(nfo|m3u8?|txt|xml)$/i;

// ---- una sola istanza; i file aperti con doppio clic arrivano alla finestra già aperta
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    argv.filter(a => PLAYLIST_EXT.test(a) && fs.existsSync(a)).forEach(openPath);
  });
}
app.on('open-file', (e, p) => { e.preventDefault(); openPath(p); }); // macOS
function openPath(p) { if (readyForPaths && win) win.webContents.send('open-path', p); else pendingPaths.push(p); }

// ---- posizione e dimensione finestra
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; } }
function saveState() {
  if (!win || win.isDestroyed()) return;
  try { const b = win.isMaximized() || win.isFullScreen() ? (loadState().bounds || null) : win.getBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ bounds: b, max: win.isMaximized() })); } catch (e) { /* */ }
}

function createWindow() {
  const st = loadState(), b = st.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1280, height: b.height || 720, x: b.x, y: b.y, minWidth: 900, minHeight: 560,
    backgroundColor: '#0a0e15', title: 'MAXENTA', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      // L'app è locale e carica solo flussi multimediali: serve per leggere playlist/EPG/NAS di altri server senza CORS e per usare file://
      webSecurity: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false
    }
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  require('electron').Menu.setApplicationMenu(menu.build(win, cmd => win && win.webContents.send('menu', cmd)));
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.on('close', saveState);
  win.on('closed', () => { win = null; });
  // niente navigazioni o finestre esterne: i link aperti vanno al browser di sistema
  win.webContents.on('will-navigate', (e, url) => { if (!/^file:/.test(url)) { e.preventDefault(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// User-Agent personalizzato per i server IPTV che filtrano i browser
function setupUserAgent() {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (userAgent) d.requestHeaders['User-Agent'] = userAgent;
    cb({ requestHeaders: d.requestHeaders });
  });
}

// ---- IPC
ipcMain.on('renderer-ready', () => { readyForPaths = true; pendingPaths.splice(0).forEach(openPath); });
// schermo e sistema restano attivi finché un video è in riproduzione
let awakeId = null;
ipcMain.handle('power:keep', (e, on) => {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep');
  else if (!on && awakeId !== null) { try { powerSaveBlocker.stop(awakeId); } catch (er) { /* */ } awakeId = null; }
  return awakeId !== null;
});
ipcMain.handle('discover', (e, ms) => discover(ms));
ipcMain.handle('dlna:browse', (e, control, id) => {
  if (!/^https?:\/\//i.test(String(control))) throw new Error('Indirizzo DLNA non valido');
  return dlna.browse(control, id);
});
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Scegli la cartella con i tuoi film e video', properties: ['openDirectory'] });
  return r.canceled || !r.filePaths.length ? '' : r.filePaths[0];
});
// ---- condivisioni di rete SMB (NAS visibili in "Rete" di Windows / Finder)
function smbParse(t) {
  t = String(t || '').trim().replace(/^smb:\/\//i, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = t.split('/').filter(Boolean);
  return { host: parts[0] || '', share: parts[1] || '', rest: parts.slice(2) };
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Il NAS non risponde (timeout)')), ms))]);
ipcMain.handle('smb:shares', async (e, host) => {
  host = smbParse(host).host;
  if (!/^[\w.-]+$/.test(host) || process.platform !== 'win32') return [];
  return new Promise(res => require('child_process').execFile('net', ['view', '\\\\' + host], { timeout: 12000, windowsHide: true, encoding: 'latin1' }, (err, out) => {
    if (err && !out) return res([]);
    const names = [];
    String(out).split(/\r?\n/).forEach(l => { const m = /^(\S.*?)\s{2,}(Disk|Disco|Platte|Disque|Schijf|Dysk)\b/i.exec(l); if (m && !/\$$/.test(m[1].trim())) names.push(m[1].trim()); });
    res(names);
  }));
});
ipcMain.handle('smb:resolve', async (e, text) => {
  const t = String(text || '').trim();
  if (/^(\/|[a-z]:[\\/])/i.test(t) && !/^smb:/i.test(t)) { await withTimeout(fs.promises.readdir(t), 10000); return { path: t }; }
  const { host, share, rest } = smbParse(t);
  if (!host || !share) throw new Error('Scrivi l\'indirizzo completo, ad esempio \\\\NAS\\video');
  let p;
  if (process.platform === 'win32') p = '\\\\' + host + '\\' + [share].concat(rest).join('\\');
  else if (process.platform === 'darwin') {
    p = '/Volumes/' + [share].concat(rest).join('/');
    if (!fs.existsSync('/Volumes/' + share)) { shell.openExternal('smb://' + host + '/' + share); await new Promise(r => setTimeout(r, 6000)); }
  } else {
    const uid = process.getuid ? process.getuid() : 1000;
    p = '/run/user/' + uid + '/gvfs/smb-share:server=' + host + ',share=' + share + (rest.length ? '/' + rest.join('/') : '');
    if (!fs.existsSync(p)) { try { require('child_process').execFile('gio', ['mount', 'smb://' + host + '/' + share], { timeout: 15000 }, () => { }); } catch (err) { /* */ } await new Promise(r => setTimeout(r, 4000)); }
  }
  try { await withTimeout(fs.promises.readdir(p), 12000); } catch (err) {
    throw new Error(process.platform === 'darwin' ? 'Cartella non raggiungibile. Se è comparsa una richiesta di accesso nel Finder, inserisci le credenziali e riprova' : 'Cartella non raggiungibile (' + (err.code || err.message) + '). Controlla nome, condivisione e credenziali salvate nel sistema');
  }
  return { path: p };
});
ipcMain.handle('fs:list', async (e, dir) => {
  const names = await fs.promises.readdir(String(dir), { withFileTypes: true });
  const out = [];
  for (const d of names) {
    if (d.name.charAt(0) === '.') continue;
    try {
      const full = path.join(dir, d.name), st = await fs.promises.stat(full);
      out.push({ name: d.name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
    } catch (err) { /* permessi / link spezzati */ }
  }
  return out;
});
ipcMain.handle('fs:read', async (e, p) => {
  p = String(p);
  if (!READABLE_EXT.test(p)) throw new Error('Tipo di file non consentito');
  const st = await fs.promises.stat(p);
  if (st.size > 60 * 1024 * 1024) throw new Error('File troppo grande');
  return fs.promises.readFile(p, 'utf8');
});
ipcMain.handle('update:version', () => app.getVersion());
ipcMain.handle('update:check', () => updater.check(false));
ipcMain.handle('update:download', () => updater.download());
ipcMain.handle('update:install', () => updater.install());
ipcMain.handle('update:setrepo', (e, t) => updater.setRepo(t));
ipcMain.handle('update:page', () => updater.openPage());
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('set-ua', (e, ua) => { userAgent = String(ua || '').slice(0, 300); transcode.setUserAgent(userAgent); });
ipcMain.handle('ff:probe', (e, url) => transcode.probe(String(url)));
ipcMain.handle('ff:url', (e, url, o) => transcode.streamUrl(String(url), o || {}));
ipcMain.handle('ff:stop', () => transcode.stopAll());
ipcMain.handle('fullscreen', (e, mode) => { if (!win) return; win.setFullScreen(mode === 'toggle' ? !win.isFullScreen() : mode === 'on'); });

app.whenReady().then(() => {
  setupUserAgent();
  createWindow();
  updater.init(m => { if (win && !win.isDestroyed()) win.webContents.send('update', m); });
  win.webContents.once('did-finish-load', () => setTimeout(() => updater.check(true), 6000));
  process.argv.slice(1).filter(a => PLAYLIST_EXT.test(a) && fs.existsSync(a)).forEach(openPath);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', () => transcode.stopAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
