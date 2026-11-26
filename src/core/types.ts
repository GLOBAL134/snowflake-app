export type SnowIntensity = 'light' | 'steady' | 'blizzard';
export type SnowTool = 'none' | 'mitten' | 'snowman';
export type GarlandMode = 'off' | 'twinkle' | 'wave';
export type PlowStyle = 'tractor' | 'retroTractor' | 'snowmobile' | 'penguin' | 'custom';

export interface IntensityConfig {
  id: SnowIntensity;
  label: string;
  flakeCount: number;
  speedMultiplier: number;
  accumulationMultiplier: number;
}

export const INTENSITY_CONFIGS: Record<SnowIntensity, IntensityConfig> = {
  light: {
    id: 'light',
    label: 'Лёгкий',
    flakeCount: 130,
    speedMultiplier: 0.76,
    accumulationMultiplier: 0.75
  },
  steady: {
    id: 'steady',
    label: 'Ровный',
    flakeCount: 300,
    speedMultiplier: 1.0,
    accumulationMultiplier: 1.25
  },
  blizzard: {
    id: 'blizzard',
    label: 'Метель',
    flakeCount: 600,
    speedMultiplier: 1.65,
    accumulationMultiplier: 1.9
  }
};

export const SNOW_TOOL_LABELS: Record<SnowTool, string> = {
  none: 'Обычный',
  mitten: 'Варежка',
  snowman: 'Снеговик'
};

export const GARLAND_MODE_LABELS: Record<GarlandMode, string> = {
  off: 'Выкл',
  twinkle: 'Мерцание',
  wave: 'Волна'
};

export interface PlowStyleMeta {
  id: PlowStyle;
  label: string;
  icon: string;
}

export const PLOW_STYLES: PlowStyleMeta[] = [
  { id: 'tractor', label: 'Трактор', icon: '🚜' },
  { id: 'retroTractor', label: 'Ретро', icon: '🚙' },
  { id: 'snowmobile', label: 'Снегоход', icon: '🛷' },
  { id: 'penguin', label: 'Пингвин', icon: '🐧' },
  { id: 'custom', label: 'Своё фото', icon: '🖼' }
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Surface identifier in bottom-left screen coordinate space.
 * Window surfaces use `window:<id>`.
 */
export type SurfaceKey = 'screenBottom' | 'dock' | `window:${string}`;

export function isWindowSurfaceKey(key: SurfaceKey): boolean {
  return key.startsWith('window:');
}

export interface TrackedWindow {
  id: string;
  /** Bottom-left global or screen-local rect (y=0 at bottom). */
  rect: Rect;
}

export interface WindowSnapshot {
  windows: TrackedWindow[];
  dockRect?: Rect;
  isFullscreen?: boolean;
}

export interface AppSettings {
  isPaused: boolean;
  intensity: SnowIntensity;
  windStrength: number; // -1.0 ... 1.0
  activeTool: SnowTool;
  garlandMode: GarlandMode;
  autoPlowEnabled: boolean;
  plowOnWindows: boolean;
  plowStyle: PlowStyle;
  customPlowDataUrl: string | null;
  customPlowVersion: number;
  liveWallpaperEnabled: boolean;
  pauseOnFullscreen: boolean;
  launchAtLogin: boolean;
  virtualWindowsEnabled: boolean;
  tiltWindEnabled: boolean;
}

export type RuntimePlatform =
  | 'electron-overlay'
  | 'electron-settings'
  | 'electron-wallpaper'
  | 'electron-sandbox'
  | 'mobile'
  | 'web';
