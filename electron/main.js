// Keystage desktop shell (Electron main process).
// Serves the web app from a private app:// origin (a secure context, so Web MIDI is allowed),
// grants MIDI access without a prompt, and keeps audio running in the background.

const { app, BrowserWindow, Menu, net, powerSaveBlocker, protocol, screen, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'app://keystage';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    title: 'Keystage',
    backgroundColor: '#0e0f13',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // keep audio and MIDI responsive when the window is minimised or behind other windows
      backgroundThrottling: false,
      // a desktop instrument should make sound without an extra click
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => {
    // on laptop-sized screens use the whole screen so the keyboard is never cut off
    const { width, height } = screen.getDisplayMatching(win.getBounds()).workAreaSize;
    if (width < 1400 || height < 950) win.maximize();
    win.show();
  });
  win.loadURL(`${ORIGIN}/index.html`);

  // Never navigate the instrument window away; open web links in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  win.on('closed', () => {
    win = null;
  });
}

function serveAppFiles() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function allowMidi() {
  const ses = session.defaultSession;
  // Electron reports every Web MIDI request as 'midiSysex', even when the page asks for sysex: false.
  // Keystage only reads notes and controllers; it never sends system-exclusive messages.
  const allowed = (permission) => permission === 'midi' || permission === 'midiSysex';
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed(permission));
}

function buildMenu() {
  const template = [
    {
      label: 'Keystage',
      submenu: [
        { role: 'togglefullscreen', label: 'Full Screen', accelerator: 'F11' },
        { type: 'separator' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'reload', label: 'Reload' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Keystage' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  serveAppFiles();
  allowMidi();
  buildMenu();
  // a screen saver or display sleep in the middle of a set would be bad
  powerSaveBlocker.start('prevent-display-sleep');
  createWindow();
});

app.on('window-all-closed', () => app.quit());
