import './styles.css';
import { SnowSimulation } from './core/SnowSimulation';
import { StateStore } from './core/state';
import type { AppSettings, Point, RuntimePlatform } from './core/types';
import { detectRuntimePlatform, isMobileLike } from './platform/bridge';
import { MotionWindController } from './platform/motionWind';
import { Canvas2DSnowRenderer } from './renderer/Canvas2DSnowRenderer';
import { LiveWallpaperCanvas } from './renderer/LiveWallpaperCanvas';
import { WebGLSnowRenderer } from './renderer/WebGLSnowRenderer';
import { mountLandingSite } from './ui/LandingSite';
import { SettingsPanel } from './ui/SettingsPanel';
import { SnowmanHUD } from './ui/SnowmanHUD';
import { VirtualWindowsLayer } from './ui/VirtualWindowsLayer';

function toBottomLeft(clientX: number, clientY: number, vh: number): Point {
  return { x: clientX, y: vh - clientY };
}

function isStandalonePWA(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function shouldBootLandingSite(platform: RuntimePlatform): boolean {
  if (window.snowflakeElectron) return false;
  if (window.Capacitor?.isNativePlatform?.()) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('fullscreen') === '1' || params.get('app') === '1') return false;
  if (isStandalonePWA()) return false;
  return platform === 'web' || platform === 'mobile';
}

function bootstrap(): void {
  const platform: RuntimePlatform = detectRuntimePlatform();
  const electron = window.snowflakeElectron;
  const store = new StateStore(platform);
  const appRoot = document.getElementById('app') as HTMLDivElement;

  if (shouldBootLandingSite(platform)) {
    mountLandingSite(appRoot, store.get(), () => {
      const url = new URL(window.location.href);
      url.searchParams.set('fullscreen', '1');
      window.location.href = url.toString();
    });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    return;
  }

  if (platform === 'electron-settings') {
    document.documentElement.classList.add('mode-tray-settings');
    runElectronSettingsMode(appRoot, store);
    return;
  }

  if (platform === 'electron-wallpaper') {
    document.documentElement.classList.add('mode-wallpaper');
    runElectronWallpaperMode(appRoot, store);
    return;
  }

  if (platform === 'electron-overlay') {
    document.documentElement.classList.add('mode-overlay');
  } else {
    document.documentElement.classList.add('mode-standalone');
  }

  runSnowScene(appRoot, platform, store, electron);
}

function runElectronSettingsMode(appRoot: HTMLDivElement, store: StateStore): void {
  const electron = window.snowflakeElectron!;

  const updateSettings = (patch: Partial<AppSettings>) => {
    store.update(patch);
    electron.sendSettingsUpdate(patch);
  };

  const panel = new SettingsPanel(appRoot, 'electron-settings', store.get(), {
    onUpdate: updateSettings,
    onClearSnow: () => electron.sendAction('clearSnow'),
    onClearSnowmen: () => electron.sendAction('clearSnowmen'),
    onTriggerPlow: () => electron.sendAction('triggerPlow'),
    onToggleLaunchAtLogin: (enable) => {
      updateSettings({ launchAtLogin: enable });
      electron.setLaunchAtLogin(enable);
    },
    onToggleTiltWind: async () => false,
    onClose: () => electron.closeSettings(),
    onOpenSandbox: () => {
      electron.openSandboxWindow();
      electron.closeSettings();
    },
    onQuit: () => electron.quitApp()
  });

  electron.onSettingsSync((synced) => {
    store.replace(synced);
    panel.applySettings(synced);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      electron.closeSettings();
    }
  });
}

function runElectronWallpaperMode(appRoot: HTMLDivElement, store: StateStore): void {
  const electron = window.snowflakeElectron!;
  const bgCanvas = document.createElement('canvas');
  bgCanvas.className = 'wallpaper-canvas';
  appRoot.appendChild(bgCanvas);

  const wallpaper = new LiveWallpaperCanvas(bgCanvas);
  const onResize = () => wallpaper.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);

  electron.onSettingsSync((synced) => {
    store.replace(synced, false);
  });

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) * 0.001));
    last = now;
    wallpaper.tickAndDraw(dt, store.get().isPaused);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function runSnowScene(
  appRoot: HTMLDivElement,
  platform: RuntimePlatform,
  store: StateStore,
  electron: Window['snowflakeElectron']
): void {
  const isOverlay = platform === 'electron-overlay';
  const mobileUI = isMobileLike();

  // Optional live wallpaper canvas (used in Web, Mobile, and Electron Sandbox)
  let wallpaperCanvas: HTMLCanvasElement | null = null;
  let wallpaper: LiveWallpaperCanvas | null = null;
  if (!isOverlay) {
    wallpaperCanvas = document.createElement('canvas');
    wallpaperCanvas.className = 'wallpaper-canvas';
    appRoot.appendChild(wallpaperCanvas);
    wallpaper = new LiveWallpaperCanvas(wallpaperCanvas);
  }

  // Virtual draggable windows (Web / Mobile / Electron Sandbox)
  let virtualWindows: VirtualWindowsLayer | null = null;
  if (!isOverlay) {
    virtualWindows = new VirtualWindowsLayer(appRoot);
  }

  // Main WebGL2 Snow Canvas
  const snowCanvas = document.createElement('canvas');
  snowCanvas.className = 'snow-canvas';
  appRoot.appendChild(snowCanvas);

  let renderer: WebGLSnowRenderer | Canvas2DSnowRenderer;
  try {
    renderer = new WebGLSnowRenderer(snowCanvas);
  } catch {
    try {
      renderer = new Canvas2DSnowRenderer(snowCanvas);
    } catch (err) {
      const msg = document.createElement('div');
      msg.className = 'fatal-error';
      msg.textContent = err instanceof Error ? err.message : 'Ошибка инициализации графики';
      appRoot.appendChild(msg);
      return;
    }
  }

  const getTopInset = () => (isOverlay ? 0 : 0);
  const sim = new SnowSimulation(window.innerWidth, window.innerHeight, getTopInset());

  // Snowman HUD
  const exitSnowmanMode = () => {
    const patch: Partial<AppSettings> = { activeTool: 'mitten' };
    store.update(patch);
    electron?.sendSettingsUpdate(patch);
  };
  const snowmanHud = new SnowmanHUD(appRoot, mobileUI, exitSnowmanMode);

  // Settings UI + Floating Toggle Button for standalone / mobile / web
  let settingsOpen = false;
  let settingsPanel: SettingsPanel | null = null;
  let settingsBackdrop: HTMLDivElement | null = null;
  let fabBtn: HTMLButtonElement | null = null;

  const motionWind = new MotionWindController((wind) => {
    store.update({ windStrength: wind });
  });

  const applySettingsToScene = (s: AppSettings) => {
    if (wallpaperCanvas) {
      wallpaperCanvas.style.display = s.liveWallpaperEnabled ? 'block' : 'none';
      document.body.classList.toggle('no-wallpaper', !s.liveWallpaperEnabled);
    }
    if (virtualWindows) {
      virtualWindows.setVisible(s.virtualWindowsEnabled);
      virtualWindows.setInteractive(s.activeTool !== 'snowman' && !s.isPaused);
    }
    const isSnowman = s.activeTool === 'snowman' && !s.isPaused;
    snowmanHud.setVisible(isSnowman);
    // Keep snowCanvas click-through unless Snowman mode is active so virtual windows remain draggable!
    snowCanvas.style.pointerEvents = isSnowman ? 'auto' : 'none';
    snowCanvas.style.cursor = isSnowman ? 'crosshair' : 'default';

    if (isOverlay && electron) {
      electron.setIgnoreMouseEvents(!isSnowman);
    }

    if (fabBtn) {
      fabBtn.classList.toggle('paused', s.isPaused);
    }
    settingsPanel?.applySettings(s);
  };

  if (!isOverlay) {
    fabBtn = document.createElement('button');
    fabBtn.type = 'button';
    fabBtn.className = 'sf-fab';
    fabBtn.title = 'Настройки SnowFlake';
    fabBtn.setAttribute('aria-label', 'Настройки SnowFlake');
    fabBtn.innerHTML = '<span>❄️</span>';
    appRoot.appendChild(fabBtn);

    settingsBackdrop = document.createElement('div');
    settingsBackdrop.className = 'sf-backdrop hidden';
    appRoot.appendChild(settingsBackdrop);

    const setSettingsOpen = (open: boolean) => {
      settingsOpen = open;
      settingsBackdrop?.classList.toggle('hidden', !open);
      settingsPanel?.root.classList.toggle('open', open);
    };

    fabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSettingsOpen(!settingsOpen);
    });
    settingsBackdrop.addEventListener('click', () => setSettingsOpen(false));

    settingsPanel = new SettingsPanel(appRoot, platform, store.get(), {
      onUpdate: (patch) => {
        store.update(patch);
        electron?.sendSettingsUpdate(patch);
      },
      onClearSnow: () => sim.clearAllSnow(),
      onClearSnowmen: () => sim.clearSnowmen(),
      onTriggerPlow: () => sim.triggerPlowManually(store.get().plowOnWindows),
      onToggleLaunchAtLogin: (enable) => {
        store.update({ launchAtLogin: enable });
        electron?.setLaunchAtLogin(enable);
      },
      onToggleTiltWind: async (enable) => {
        if (enable) {
          const ok = await motionWind.enable();
          store.update({ tiltWindEnabled: ok });
          return ok;
        }
        motionWind.disable();
        store.update({ tiltWindEnabled: false });
        return true;
      },
      onClose: () => setSettingsOpen(false),
      onQuit: electron ? () => electron.quitApp() : undefined
    });
  }

  store.subscribe((s) => applySettingsToScene(s));
  applySettingsToScene(store.get());

  // Electron IPC listeners (overlay / sandbox)
  if (electron) {
    electron.onSettingsSync((synced) => {
      store.replace(synced, false);
    });
    electron.onAction((action) => {
      if (action === 'clearSnow') sim.clearAllSnow();
      else if (action === 'clearSnowmen') sim.clearSnowmen();
      else if (action === 'triggerPlow') sim.triggerPlowManually(store.get().plowOnWindows);
    });
    if (isOverlay) {
      electron.onWindowSnapshot((snap) => {
        sim.syncWindows(snap, store.get().pauseOnFullscreen);
      });
      electron.onGlobalCursor((pt) => {
        sim.setPointerPosition(pt);
      });
    }
  }

  // Pointer & touch interactions (Snowman rolls on snowCanvas; Mitten listens on window so cards stay draggable)
  let activePointerId: number | null = null;
  let mittenPointerId: number | null = null;

  snowCanvas.addEventListener('pointerdown', (e) => {
    const s = store.get();
    if (s.isPaused || s.activeTool !== 'snowman') return;
    const pt = toBottomLeft(e.clientX, e.clientY, window.innerHeight);
    activePointerId = e.pointerId;
    try {
      snowCanvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    sim.beginRollingBall(pt);
  });

  snowCanvas.addEventListener('pointermove', (e) => {
    const s = store.get();
    if (s.isPaused || s.activeTool !== 'snowman' || activePointerId !== e.pointerId) return;
    const pt = toBottomLeft(e.clientX, e.clientY, window.innerHeight);
    sim.continueRollingBall(pt);
  });

  const endSnowmanPointer = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    if (store.get().activeTool === 'snowman') {
      sim.releaseRollingBall();
    }
  };
  snowCanvas.addEventListener('pointerup', endSnowmanPointer);
  snowCanvas.addEventListener('pointercancel', endSnowmanPointer);

  if (!isOverlay) {
    window.addEventListener('pointerdown', (e) => {
      const s = store.get();
      if (s.isPaused || s.activeTool !== 'mitten') return;
      mittenPointerId = e.pointerId;
      sim.setPointerPosition(toBottomLeft(e.clientX, e.clientY, window.innerHeight));
    });
    window.addEventListener('pointermove', (e) => {
      const s = store.get();
      if (s.isPaused || s.activeTool !== 'mitten') return;
      if (e.pointerType === 'mouse' || mittenPointerId === e.pointerId) {
        sim.setPointerPosition(toBottomLeft(e.clientX, e.clientY, window.innerHeight));
      }
    });
    const endMitten = (e: PointerEvent) => {
      if (mittenPointerId === e.pointerId) {
        mittenPointerId = null;
        if (e.pointerType !== 'mouse') sim.setPointerPosition(null);
      }
    };
    window.addEventListener('pointerup', endMitten);
    window.addEventListener('pointercancel', endMitten);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (store.get().activeTool === 'snowman') {
        exitSnowmanMode();
      } else if (settingsOpen) {
        settingsBackdrop?.classList.add('hidden');
        settingsPanel?.root.classList.remove('open');
        settingsOpen = false;
      }
    }
  });

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.resize(w, h);
    wallpaper?.resize(w, h);
    virtualWindows?.handleResize();
    sim.updateViewport(w, h, getTopInset());
  };
  window.addEventListener('resize', handleResize);

  // Main render loop
  let lastTime = performance.now();
  let lastWallpaperDraw = 0;

  const tick = (now: number) => {
    const dt = Math.min(0.04, Math.max(0.001, (now - lastTime) * 0.001));
    lastTime = now;

    const currentSettings = store.get();

    if (virtualWindows && currentSettings.virtualWindowsEnabled) {
      sim.syncWindows(
        virtualWindows.captureSnapshot(window.innerHeight),
        currentSettings.pauseOnFullscreen,
        now * 0.001
      );
    } else if (!isOverlay) {
      sim.syncWindows({ windows: [] }, currentSettings.pauseOnFullscreen, now * 0.001);
    }

    sim.step(dt, currentSettings, mobileUI);
    renderer.render(sim, currentSettings);

    if (wallpaper && currentSettings.liveWallpaperEnabled && now - lastWallpaperDraw >= 32) {
      const wdt = lastWallpaperDraw === 0 ? dt : Math.min(0.08, (now - lastWallpaperDraw) * 0.001);
      lastWallpaperDraw = now;
      wallpaper.tickAndDraw(wdt, currentSettings.isPaused);
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  // Register PWA service worker for Web/Mobile browsers (skip Electron file://)
  if (
    platform !== 'electron-overlay' &&
    platform !== 'electron-sandbox' &&
    'serviceWorker' in navigator &&
    location.protocol.startsWith('http')
  ) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

bootstrap();
