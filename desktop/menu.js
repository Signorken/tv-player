// Menu nativo in italiano
'use strict';
const { Menu } = require('electron');

function build(win, send) {
  const mac = process.platform === 'darwin';
  const tpl = [];
  if (mac) tpl.push({ label: 'MAXENTA', submenu: [{ role: 'about', label: 'Informazioni su MAXENTA' }, { type: 'separator' }, { role: 'hide', label: 'Nascondi' }, { role: 'hideOthers', label: 'Nascondi altri' }, { role: 'unhide', label: 'Mostra tutto' }, { type: 'separator' }, { role: 'quit', label: 'Esci da MAXENTA' }] });
  tpl.push({
    label: 'File', submenu: [
      { label: 'Incolla link o playlist dagli appunti', accelerator: 'CmdOrCtrl+Shift+V', click: () => send('paste') },
      { label: 'Apri file playlist…', accelerator: 'CmdOrCtrl+O', click: () => send('openfile') },
      { label: 'Aggiungi cartella del computer…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('folder') },
      { label: 'Cerca NAS e server nella rete', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('discover') },
      { label: 'Altre opzioni di aggiunta…', click: () => send('add') },
      { type: 'separator' },
      { label: 'Impostazioni', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
      { type: 'separator' },
      mac ? { role: 'close', label: 'Chiudi finestra' } : { role: 'quit', label: 'Esci' }
    ]
  });
  tpl.push({ label: 'Modifica', submenu: [{ role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' }, { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' }, { role: 'selectAll', label: 'Seleziona tutto' }] });
  tpl.push({
    label: 'Vista', submenu: [
      { label: 'Home', accelerator: 'CmdOrCtrl+H', click: () => send('home') },
      { label: 'Schermo intero', accelerator: mac ? 'Ctrl+Cmd+F' : 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
      { type: 'separator' },
      { role: 'zoomIn', label: 'Ingrandisci' }, { role: 'zoomOut', label: 'Riduci' }, { role: 'resetZoom', label: 'Dimensione normale' },
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Strumenti sviluppatore' }
    ]
  });
  tpl.push({ label: 'Aiuto', submenu: [{ label: 'Controlla aggiornamenti…', click: () => send('update') }] });
  return Menu.buildFromTemplate(tpl);
}
module.exports = { build };
