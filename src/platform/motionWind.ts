export type TiltCallback = (windNormalized: number) => void;

export class MotionWindController {
  private active = false;
  private handler: ((ev: DeviceOrientationEvent) => void) | null = null;
  private onWind: TiltCallback;

  constructor(onWind: TiltCallback) {
    this.onWind = onWind;
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  async enable(): Promise<boolean> {
    if (this.active) return true;
    if (!MotionWindController.isSupported()) return false;

    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DOE.requestPermission === 'function') {
      try {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      } catch {
        return false;
      }
    }

    this.handler = (ev: DeviceOrientationEvent) => {
      if (ev.gamma == null) return;
      // Map phone tilt (-45° ... +45°) smoothly to wind (-1.0 ... +1.0)
      const norm = Math.max(-1, Math.min(1, ev.gamma / 42));
      const deadzoned = Math.abs(norm) < 0.06 ? 0 : norm;
      this.onWind(Number(deadzoned.toFixed(2)));
    };
    window.addEventListener('deviceorientation', this.handler);
    this.active = true;
    return true;
  }

  disable(): void {
    if (!this.active) return;
    if (this.handler) {
      window.removeEventListener('deviceorientation', this.handler);
      this.handler = null;
    }
    this.active = false;
  }
}
