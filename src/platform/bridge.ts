import type { AppSettings, Point, RuntimePlatform, WindowSnapshot } from '../core/types';

export interface ElectronAPI {
  mode: RuntimePlatform;
  screenIndex: number;
  platformOS: string;
  onSettingsSync: (cb: (settings: AppSettings) => void) => () => void;
  sendSettingsUpdate: (patch: Partial<AppSettings>) => void;
  onAction: (cb: (action: string) => void) => () => void;
  sendAction: (action: string) => void;
  onWindowSnapshot: (cb: (snapshot: WindowSnapshot) => void) => () => void;
  onGlobalCursor: (cb: (pt: Point | null) => void) => () => void;
  closeSettings: () => void;
  quitApp: () => void;
  setIgnoreMouseEvents: (ignore: boolean) => void;
  setLaunchAtLogin: (enable: boolean) => void;
  openSandboxWindow: () => void;
}

declare global {
  interface Window {
    snowflakeElectron?: ElectronAPI;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export function detectRuntimePlatform(): RuntimePlatform {
  if (window.snowflakeElectron) {
    return window.snowflakeElectron.mode;
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    return 'mobile';
  }
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) {
    return 'mobile';
  }
  return 'web';
}

export function isMobileLike(): boolean {
  if (window.Capacitor?.isNativePlatform?.()) return true;
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
    return true;
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}
