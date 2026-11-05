const { app, BrowserWindow, ipcMain, screen, session, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { mergeNotes, cleanAudios } = require('./shared/sync-core.js');
const { isValid: isValidColor } = require('./shared/colors.js');

const APP_NAME = 'Task-it';
app.setName(APP_NAME);
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));

const PORT = 5174;
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, 'assets', 'icon.png');
let store;
let mainWin = null;
const noteWins = new Map();
let syncStatus = { state: 'starting', peers: 0 };

// Modos de fixar: 'top' (vermelho) = sempre por cima, mesmo com Alt+Tab.
//                 'place' (azul)  = preso na posição, mas vai para trás com Alt+Tab.
const normPin = (p) => (p === true || p === 'top' ? 'top' : p === 'place' ? 'place' : false);

// ---------- armazenamento ----------
const dataFile = () => path.join(app.getPath('userData'), 'taskit.json');
const legacyFile = () => path.join(app.getPath('appData'), 'Post-it', 'postit.json');

function load() {
  let raw = null;
  for (const f of [dataFile(), legacyFile()]) {
    try {
      raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      break;
    } catch {}
  }
  store = raw || {};
  store.notes = (store.notes || []).map((n) => ({ title: '', audios: [], ...n, pinned: normPin(n.pinned) }));
  store.syncCode ||= 'postit-' + crypto.randomBytes(6).toString('hex');
  store.settings = { theme: 'dark', palettes: {}, ...(store.settings || {}) };
  // Notas que foram criadas e deixadas vazias não ficam poluindo a lista.
  for (const n of store.notes) if (!n.deleted && !n.pinned && isEmpty(n)) deleteNote(n);
  flush(); // o código precisa ser o mesmo para sempre, senão o celular perde o PC
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}
function flush() {
  clearTimeout(saveTimer);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(store, null, 2));
}

const find = (id) => store.notes.find((n) => n.id === id);
const isEmpty = (n) => !(n.text || '').trim() && !(n.title || '').trim() && !(n.audios || []).length;

function changed() {
  save();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('notes:changed', store.notes);
}

// ---------- janelas ----------
function createMain() {
  mainWin = new BrowserWindow({
    width: 380,
    height: 660,
    minWidth: 300,
    minHeight: 320,
    frame: false,
    backgroundColor: '#202020',
    title: APP_NAME,
    icon: ICON,
    webPreferences: { preload: PRELOAD, backgroundThrottling: false },
  });
  mainWin.loadFile(path.join(__dirname, 'renderer/index.html'));
  // Com notas abertas, fechar a lista só esconde (a sincronização continua viva).
  mainWin.on('close', (e) => {
    if (!app.isQuitting && noteWins.size > 0) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.on('closed', () => {
    mainWin = null;
    app.quit();
  });
}

function onSomeScreen(b) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x + 40 > a.x && b.x < a.x + a.width - 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40);
}

function defaultBounds() {
  const base = mainWin ? mainWin.getBounds() : { x: 100, y: 100, width: 0 };
  const step = (noteWins.size % 8) * 28;
  const b = { x: base.x + base.width + 16 + step, y: base.y + step, width: 320, height: 320 };
  return onSomeScreen(b) ? b : { x: 120 + step, y: 120 + step, width: 320, height: 320 };
}

function applyPin(w, mode) {
  // Só mexe no que mudou: reaplicar o mesmo estado no Windows pode sumir com a janela.
  if (w.isAlwaysOnTop() !== (mode === 'top')) w.setAlwaysOnTop(mode === 'top', 'floating');
  if (w.pinSkip !== (mode === 'top')) {
    w.pinSkip = mode === 'top';
    w.setSkipTaskbar(w.pinSkip);
  }
  if (w.isMovable() !== !mode) w.setMovable(!mode);
  if (!w.isVisible()) w.show();
}

function openNote(id) {
  const n = find(id);
  if (!n || n.deleted) return;
  let w = noteWins.get(id);
  if (w) {
    w.show();
    w.focus();
    return;
  }
  const b = n.bounds && onSomeScreen(n.bounds) ? n.bounds : defaultBounds();
  w = new BrowserWindow({
    ...b,
    minWidth: 220,
    minHeight: 180,
    frame: false,
    backgroundColor: '#fff7b1',
    title: APP_NAME,
    icon: ICON,
    webPreferences: { preload: PRELOAD },
  });
  applyPin(w, n.pinned);
  w.loadFile(path.join(__dirname, 'renderer/note.html'), { query: { id } });
  noteWins.set(id, w);

  const saveBounds = () => {
    const m = find(id);
    if (m && !w.isDestroyed()) {
      m.bounds = w.getBounds();
      save();
    }
  };
  w.on('moved', saveBounds);
  w.on('resized', saveBounds);
  w.on('closed', () => {
    noteWins.delete(id);
    const m = find(id);
    // Fechar um post-it fixado = desafixar (exceto quando o app está saindo).
    if (!app.isQuitting && m && !m.deleted && (m.pinned || isEmpty(m))) {
      m.pinned = false;
      if (isEmpty(m)) deleteNote(m); // fechou uma nota vazia: some
      changed();
    }
    if (!app.isQuitting && mainWin && !mainWin.isVisible() && noteWins.size === 0) mainWin.show();
  });
}

function setPinned(id, mode) {
  const n = find(id);
  if (!n) return;
  const next = normPin(mode);
  if (next === n.pinned && noteWins.has(id)) return; // nada mudou
  n.pinned = next;
  if (n.pinned) openNote(id);
  const w = noteWins.get(id);
  if (w) applyPin(w, n.pinned);
  changed();
}

function deleteNote(n) {
  Object.assign(n, { deleted: true, text: '', title: '', audios: [], pinned: false, updatedAt: Date.now() });
  noteWins.get(n.id)?.close();
}

// ---------- IPC ----------
ipcMain.handle('notes:list', () => store.notes);

ipcMain.handle('notes:create', () => {
  const now = Date.now();
  const n = { id: crypto.randomUUID(), title: '', text: '', color: 'yellow', audios: [], createdAt: now, updatedAt: now, deleted: false, pinned: false };
  store.notes.unshift(n);
  changed();
  openNote(n.id);
  return n;
});

ipcMain.handle('notes:update', (_e, id, patch) => {
  const n = find(id);
  if (!n || !patch) return;
  let dirty = false;
  for (const k of ['text', 'title']) {
    if (typeof patch[k] === 'string' && patch[k] !== n[k]) {
      n[k] = patch[k];
      dirty = true;
    }
  }
  if (typeof patch.color === 'string' && isValidColor(patch.color) && patch.color !== n.color) {
    n.color = patch.color;
    dirty = true;
  }
  if (Array.isArray(patch.audios)) {
    n.audios = cleanAudios(patch.audios);
    dirty = true;
  }
  if (dirty) {
    n.updatedAt = Date.now();
    changed();
  }
});

ipcMain.handle('notes:delete', (_e, ids) => {
  for (const id of [].concat(ids)) {
    const n = find(id);
    if (n && !n.deleted) deleteNote(n);
  }
  changed();
});

// Exceção dia/noite de uma nota só (fica neste aparelho, não muda a data da nota).
ipcMain.handle('notes:shade', (_e, id, shade) => {
  const n = find(id);
  if (!n) return;
  n.shade = shade === 'light' || shade === 'dark' ? shade : null;
  changed();
});
ipcMain.handle('notes:pin',(_e, id, mode) => setPinned(id, mode));
ipcMain.handle('notes:open', (_e, id) => openNote(id));

ipcMain.handle('notes:merge', (_e, remote) => {
  const { merged, changed: didChange } = mergeNotes(store.notes, remote);
  if (didChange) {
    store.notes = merged;
    for (const n of merged) if (n.deleted) noteWins.get(n.id)?.close();
    changed();
  }
  return didChange;
});

ipcMain.handle('sync:info', async () => {
  const url = `http://${lanIp()}:${PORT}/?code=${store.syncCode}`;
  return { code: store.syncCode, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }), status: syncStatus };
});

ipcMain.on('sync:status', (_e, s) => {
  syncStatus = s;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('sync:status', s);
});

// ---------- tema (claro/escuro + 3 cores personalizadas por modo) ----------
const { parseColor } = require('./shared/colors.js');
ipcMain.handle('settings:get', () => store.settings);
ipcMain.handle('settings:set', (_e, patch) => {
  const s = store.settings;
  if (patch && (patch.theme === 'dark' || patch.theme === 'light')) s.theme = patch.theme;
  if (patch && patch.palettes) {
    for (const mode of ['dark', 'light']) {
      const p = patch.palettes[mode];
      if (p === null) delete s.palettes[mode];
      else if (p) {
        const clean = {};
        for (const k of ['bg', 'card', 'text']) if (parseColor(p[k])) clean[k] = parseColor(p[k]);
        s.palettes[mode] = clean;
      }
    }
  }
  save();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', s);
  return s;
});
ipcMain.on('win:bg', (e, hex) => {
  if (parseColor(hex)) BrowserWindow.fromWebContents(e.sender)?.setBackgroundColor(parseColor(hex));
});

ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('main:show', () => {
  if (!mainWin) return;
  mainWin.show();
  mainWin.focus();
});

// ---------- servidor local que entrega o app do celular ----------
function lanIp() {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
  const pick = all.find((i) => /^192\.168\./.test(i.address)) || all.find((i) => /^(10|172)\./.test(i.address)) || all[0];
  return pick ? pick.address : 'localhost';
}

function startMobileServer() {
  const routes = {
    '/': 'mobile/index.html',
    '/index.html': 'mobile/index.html',
    '/manifest.json': 'mobile/manifest.json',
    '/sw.js': 'mobile/sw.js',
    '/apple-touch-icon.png': 'mobile/apple-touch-icon.png',
    '/icon-192.png': 'mobile/icon-192.png',
    '/icon-512.png': 'mobile/icon-512.png',
    '/sync-core.js': 'shared/sync-core.js',
    '/sync-net.js': 'shared/sync-net.js',
    '/colors.js': 'shared/colors.js',
    '/peerjs.min.js': 'node_modules/peerjs/dist/peerjs.min.js',
  };
  const types = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'text/javascript; charset=utf-8', png: 'image/png' };
  http
    .createServer((req, res) => {
      const file = routes[new URL(req.url, 'http://x').pathname];
      if (!file) {
        res.writeHead(404);
        return res.end();
      }
      fs.readFile(path.join(__dirname, file), (err, data) => {
        if (err) {
          res.writeHead(500);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': types[file.split('.').pop()], 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    })
    .on('error', (e) => console.error('Servidor do celular:', e.message))
    .listen(PORT, '0.0.0.0');
}

// ---------- ciclo de vida ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    }
  });
  app.on('before-quit', () => {
    app.isQuitting = true;
    flush();
  });
  app.whenReady().then(() => {
    // Microfone para as notas de áudio (só as páginas do próprio app pedem).
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    load();
    createMain();
    for (const n of store.notes) if (n.pinned && !n.deleted) openNote(n.id);
    startMobileServer();
  });
}
