// Aggiornamenti automatici da GitHub Releases (electron-updater).
// Il repository si legge da package.json > repository (impostato dal workflow CI). Per prove locali: UPDATE_FEED_URL=http://host:porta/
'use strict';
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let autoUpdater = null, send = () => { }, repo = null, manual = false, state = 'idle', info = null;
const canAuto = () => process.platform === 'win32' || process.platform === 'darwin' || !!process.env.APPIMAGE || !!process.env.UPDATE_FEED_URL;

const cfgFile = () => path.join(app.getPath('userData'), 'update.json');
function repoFromUser() {
  try { const j = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); const m = /^([\w.-]+)\/([\w.-]+)$/.exec(j.repo || ''); return m ? { owner: m[1], repo: m[2] } : null; } catch (e) { return null; }
}
// "utente/repo" scelto dall'utente nell'app (per build non compilate dalla CI)
function setRepo(text) {
  const m = /(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(text || '').trim());
  if (!m) return false;
  try { fs.writeFileSync(cfgFile(), JSON.stringify({ repo: m[1] + '/' + m[2] })); } catch (e) { return false; }
  return init(send);
}
function repoFromPackage() {
  const u = repoFromUser(); if (u) return u;
  try {
    const u = (require('../package.json').repository || {}).url || '';
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(u);
    return m && m[1] !== 'OWNER' ? { owner: m[1], repo: m[2] } : null;
  } catch (e) { return null; }
}

function init(sendFn) {
  send = sendFn;
  repo = repoFromPackage();
  if (!repo && !process.env.UPDATE_FEED_URL) return false;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.removeAllListeners();
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
    if (process.env.UPDATE_FEED_URL) { autoUpdater.setFeedURL({ provider: 'generic', url: process.env.UPDATE_FEED_URL }); autoUpdater.forceDevUpdateConfig = true; }
    else autoUpdater.setFeedURL({ provider: 'github', owner: repo.owner, repo: repo.repo });
    autoUpdater.on('update-available', i => {
      info = i; state = 'available';
      send({ state: 'available', version: i.version, auto: canAuto(), notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 400) : '' });
    });
    autoUpdater.on('update-not-available', () => { state = 'idle'; if (manual) send({ state: 'none', version: app.getVersion() }); manual = false; });
    autoUpdater.on('download-progress', p => send({ state: 'progress', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', i => { state = 'ready'; send({ state: 'ready', version: i.version }); });
    autoUpdater.on('error', e => { const was = state; state = 'idle'; if (manual || was === 'downloading') send({ state: 'error', message: String(e && e.message || e).slice(0, 200), page: releasesUrl() }); manual = false; });
    return true;
  } catch (e) { autoUpdater = null; return false; }
}

function releasesUrl() { return repo ? 'https://github.com/' + repo.owner + '/' + repo.repo + '/releases/latest' : ''; }

// silent=true: all'avvio, avvisa solo se c'è una versione nuova
function check(silent) {
  if (!autoUpdater) { if (!silent) send({ state: 'disabled', version: app.getVersion() }); return; }
  manual = !silent; state = 'checking';
  autoUpdater.checkForUpdates().catch(e => { state = 'idle'; if (manual) send({ state: 'error', message: String(e.message || e).slice(0, 200), page: releasesUrl() }); manual = false; });
}
function download() {
  if (!autoUpdater) return;
  if (!canAuto()) { const u = releasesUrl(); if (u) shell.openExternal(u); return; } // .deb/.rpm: aggiornamento manuale
  state = 'downloading'; autoUpdater.downloadUpdate().catch(() => { });
}
function install() { if (autoUpdater && state === 'ready') autoUpdater.quitAndInstall(false, true); }
function openPage() { const u = releasesUrl(); if (u) shell.openExternal(u); }

module.exports = { setRepo, init, check, download, install, openPage, version: () => app.getVersion() };
