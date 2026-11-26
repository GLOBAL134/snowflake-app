import type { AppSettings, RuntimePlatform } from './types';

const STORAGE_KEY = 'snowflake_settings_v2';

export function getDefaultSettings(platform: RuntimePlatform): AppSettings {
  const isOverlay =
    platform === 'electron-overlay' ||
    platform === 'electron-settings' ||
    platform === 'electron-wallpaper';

  return {
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
    liveWallpaperEnabled: !isOverlay,
    pauseOnFullscreen: true,
    launchAtLogin: false,
    virtualWindowsEnabled: !isOverlay,
    tiltWindEnabled: false
  };
}

export class StateStore {
  private settings: AppSettings;
  private listeners = new Set<(settings: AppSettings) => void>();

  constructor(platform: RuntimePlatform) {
    this.settings = this.load(platform);
  }

  get(): AppSettings {
    return this.settings;
  }

  update(patch: Partial<AppSettings>, persist = true): void {
    this.settings = { ...this.settings, ...patch };
    if (persist) {
      this.save();
    }
    this.emit();
  }

  replace(next: AppSettings, persist = true): void {
    this.settings = { ...next };
    if (persist) {
      this.save();
    }
    this.emit();
  }

  subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }

  private load(platform: RuntimePlatform): AppSettings {
    const defaults = getDefaultSettings(platform);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...defaults,
        ...parsed,
        // Never persist paused across cold launches
        isPaused: false
      };
    } catch {
      return defaults;
    }
  }

  save(): void {
    try {
      const toSave = { ...this.settings, isPaused: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Ignore quota or private-browsing storage errors
    }
  }
}
