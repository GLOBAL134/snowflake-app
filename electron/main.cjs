const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const { DesktopWindowTracker } = require('./windowTracker.cjs');

let tray = null;
let settingsWin = null;
let sandboxWin = null;
let overlaySessions = [];
let wallpaperWins = [];
let tracker = null;
let cursorTimer = null;

let currentSettings = {
  isPaused: false,
  intensity: 'steady',
  windStrength: 0,
  activeTool: 'mitten',
  garlandMode: 'wave',
  autoPlowEnabled: true,
  plowOnWindows: true,
  plowStyle: 'tractor',
  customPlowDataUrl: null,
  customPlowVersion: 0,
  liveWallpaperEnabled: false,
  pauseOnFullscreen: true,
  launchAtLogin: false,
  virtualWindowsEnabled: false,
  tiltWindEnabled: false
};

const devUrl = process.env.SNOWFLAKE_DEV_URL || null;

function loadWindow(win, mode, extra = {}) {
  const query = { mode, ...extra };
  if (devUrl) {
    const qs = new URLSearchParams(query).toString();
    win.loadURL(`${devUrl}/?${qs}`);
    return;
  }
  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  win.loadFile(indexHtml, { query });
}

function broadcastSettings() {
  const targets = [
    ...overlaySessions.map((s) => s.win),
    ...wallpaperWins,
    settingsWin,
    sandboxWin
  ];
  for (const w of targets) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('sf:settings-sync', currentSettings);
    }
  }
}

function createOverlayWindows() {
  for (const s of overlaySessions) {
    if (!s.win.isDestroyed()) s.win.close();
  }
  overlaySessions = [];

  const displays = screen.getAllDisplays();
  displays.forEach((disp, idx) => {
    const win = new BrowserWindow({
      x: disp.bounds.x,
      y: disp.bounds.y,
      width: disp.bounds.width,
      height: disp.bounds.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, 'pop-up-menu');
    } else {
      win.setAlwaysOnTop(true, 'screen-saver');
    }
    win.setIgnoreMouseEvents(true, { forward: true });

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('sf:settings-sync', currentSettings);
    });
    loadWindow(win, 'electron-overlay', { screen: String(idx) });
    overlaySessions.push({ win, display: disp, index: idx });
  });
}

function syncWallpaperWindows() {
  const shouldShow = currentSettings.liveWallpaperEnabled;
  if (!shouldShow) {
    for (const w of wallpaperWins) {
      if (!w.isDestroyed()) w.close();
    }
    wallpaperWins = [];
    return;
  }

  if (wallpaperWins.length > 0) return;
  const displays = screen.getAllDisplays();
  for (const disp of displays) {
    const win = new BrowserWindow({
      x: disp.bounds.x,
      y: disp.bounds.y,
      width: disp.bounds.width,
      height: disp.bounds.height,
      type: process.platform === 'darwin' ? 'desktop' : undefined,
      frame: false,
      transparent: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.setIgnoreMouseEvents(true);
    if (process.platform !== 'darwin') {
      win.blur();
    }
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('sf:settings-sync', currentSettings);
    });
    loadWindow(win, 'electron-wallpaper');
    wallpaperWins.push(win);
  }
}

function createTrayAndSettings() {
  const iconFile =
    process.platform === 'darwin'
      ? path.join(__dirname, 'trayIconTemplate.png')
      : path.join(__dirname, 'trayIcon.png');
  const icon = nativeImage.createFromPath(iconFile);
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('SnowFlake');

  settingsWin = new BrowserWindow({
    width: 326,
    height: 590,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  settingsWin.webContents.once('did-finish-load', () => {
    settingsWin.webContents.send('sf:settings-sync', currentSettings);
  });
  loadWindow(settingsWin, 'electron-settings');

  settingsWin.on('blur', () => {
    if (settingsWin && settingsWin.isVisible()) {
      settingsWin.hide();
    }
  });

  tray.on('click', () => toggleSettingsPopover());
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Настройки SnowFlake', click: () => showSettingsPopover() },
      { label: 'Открыть окно-песочницу', click: () => openSandboxWindow() },
      { type: 'separator' },
      { label: 'Выпустить снегоуборщик', click: () => broadcastAction('triggerPlow') },
      { label: 'Убрать снег', click: () => broadcastAction('clearSnow') },
      { type: 'separator' },
      { label: 'Выйти', click: () => app.quit() }
    ]);
    tray.popUpContextMenu(menu);
  });
}

function toggleSettingsPopover() {
  if (!settingsWin) return;
  if (settingsWin.isVisible()) {
    settingsWin.hide();
  } else {
    showSettingsPopover();
  }
}

function showSettingsPopover() {
  if (!settingsWin || !tray) return;
  const trayBounds = tray.getBounds();
  const winBounds = settingsWin.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const wa = disp.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width * 0.5 - winBounds.width * 0.5);
  x = Math.max(wa.x + 8, Math.min(wa.x + wa.width - winBounds.width - 8, x));

  let y;
  if (trayBounds.y < wa.y + wa.height * 0.5) {
    // Top bar (macOS / top Linux panel)
    y = Math.round(trayBounds.y + trayBounds.height + 6);
  } else {
    // Bottom taskbar (Windows)
    y = Math.round(trayBounds.y - winBounds.height - 6);
  }
  y = Math.max(wa.y + 8, Math.min(wa.y + wa.height - winBounds.height - 8, y));

  settingsWin.setPosition(x, y, false);
  settingsWin.show();
  settingsWin.focus();
}

function openSandboxWindow() {
  if (sandboxWin && !sandboxWin.isDestroyed()) {
    sandboxWin.focus();
    return;
  }
  sandboxWin = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 420,
    minHeight: 480,
    title: 'SnowFlake — Песочница',
    backgroundColor: '#0b1428',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  sandboxWin.webContents.once('did-finish-load', () => {
    sandboxWin.webContents.send('sf:settings-sync', {
      ...currentSettings,
      liveWallpaperEnabled: true,
      virtualWindowsEnabled: true
    });
  });
  loadWindow(sandboxWin, 'electron-sandbox');
  sandboxWin.on('closed', () => {
    sandboxWin = null;
  });
}

function broadcastAction(action) {
  for (const s of overlaySessions) {
    if (!s.win.isDestroyed()) s.win.webContents.send('sf:action', action);
  }
  if (sandboxWin && !sandboxWin.isDestroyed()) {
    sandboxWin.webContents.send('sf:action', action);
  }
}

function startCursorPolling() {
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = setInterval(() => {
    if (currentSettings.isPaused || currentSettings.activeTool !== 'mitten') return;
    const pt = screen.getCursorScreenPoint();
    for (const s of overlaySessions) {
      if (s.win.isDestroyed()) continue;
      const b = s.display.bounds;
      if (pt.x >= b.x - 20 && pt.x <= b.x + b.width + 20 && pt.y >= b.y - 20 && pt.y <= b.y + b.height + 20) {
        const local = {
          x: pt.x - b.x,
          y: b.height - (pt.y - b.y)
        };
        s.win.webContents.send('sf:global-cursor', local);
      } else {
        s.win.webContents.send('sf:global-cursor', null);
      }
    }
  }, 16);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  try {
    currentSettings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  } catch {
    // ignore
  }

  createOverlayWindows();
  createTrayAndSettings();
  startCursorPolling();

  tracker = new DesktopWindowTracker((perScreen) => {
    for (const s of overlaySessions) {
      if (s.win.isDestroyed()) continue;
      const snap = perScreen.get(s.index);
      if (snap) {
        s.win.webContents.send('sf:window-snapshot', snap);
      }
    }
  });
  tracker.start();

  screen.on('display-added', () => createOverlayWindows());
  screen.on('display-removed', () => createOverlayWindows());
  screen.on('display-metrics-changed', () => createOverlayWindows());

  ipcMain.on('sf:settings-update', (_event, patch) => {
    const prevWall = currentSettings.liveWallpaperEnabled;
    currentSettings = { ...currentSettings, ...patch };
    broadcastSettings();
    if (prevWall !== currentSettings.liveWallpaperEnabled) {
      syncWallpaperWindows();
    }
    const isSnowman = currentSettings.activeTool === 'snowman' && !currentSettings.isPaused;
    for (const s of overlaySessions) {
      if (!s.win.isDestroyed()) {
        s.win.setIgnoreMouseEvents(!isSnowman, { forward: true });
        if (typeof s.win.setFocusable === 'function') {
          s.win.setFocusable(isSnowman);
        }
        if (isSnowman) {
          s.win.focus();
        }
      }
    }
    if (isSnowman && settingsWin && settingsWin.isVisible()) {
      settingsWin.hide();
    }
  });

  ipcMain.on('sf:action', (_event, action) => {
    broadcastAction(action);
  });

  ipcMain.on('sf:close-settings', () => {
    settingsWin?.hide();
  });

  ipcMain.on('sf:quit', () => {
    app.quit();
  });

  ipcMain.on('sf:set-ignore-mouse', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  ipcMain.on('sf:set-launch-at-login', (_event, enable) => {
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(enable) });
      currentSettings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
    } catch {
      currentSettings.launchAtLogin = false;
    }
    broadcastSettings();
  });

  ipcMain.on('sf:open-sandbox', () => {
    openSandboxWindow();
  });
});

app.on('will-quit', () => {
  tracker?.stop();
  if (cursorTimer) clearInterval(cursorTimer);
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
