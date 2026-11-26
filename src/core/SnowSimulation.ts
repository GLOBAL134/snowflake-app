import {
  INTENSITY_CONFIGS,
  isWindowSurfaceKey,
  type AppSettings,
  type Point,
  type Rect,
  type SurfaceKey,
  type WindowSnapshot
} from './types';

export interface Snowflake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  wobblePhase: number;
  wobbleSpeed: number;
  life: number;
  isClump: boolean;
  canSettle: boolean;
  sourceSurface: SurfaceKey | null;
  seed: number;
}

export interface Snowball {
  id: string;
  surfaceKey: SurfaceKey | null;
  x: number;
  y: number;
  radius: number;
  vy: number;
  stackLevel: number;
  parentId: string | null;
  hasFace: boolean;
  hopY: number;
  hopVy: number;
  wobbleX: number;
  wobbleVx: number;
}

export interface SnowplowState {
  active: boolean;
  targetKey: SurfaceKey;
  x: number;
  worldY: number;
  vy: number;
  airVx: number;
  slipVx: number;
  isAirborne: boolean;
  pitch: number;
  pitchVel: number;
  squash: number;
  squashVel: number;
  direction: number;
  speed: number;
  alpha: number;
  cooldown: number;
}

let nextBallId = 1;
function genId(): string {
  return `sb_${nextBallId++}`;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export class SnowSurface {
  readonly key: SurfaceKey;
  readonly shapeSeed: number;
  localRect: Rect;
  readonly binWidth = 4.0;
  heights: number[] = [];
  organicCap: number[] = [];
  occluded: boolean[] = [];
  heightCap: number[] = [];
  garlandOccluded: boolean[] = [];
  lastSeen: number;

  driftSquash = 0;
  driftSquashVel = 0;

  pendingDx = 0;
  pendingDy = 0;
  frameDx = 0;
  frameDy = 0;
  prevTopY = 0;
  smoothVx = 0;
  smoothVy = 0;
  prevSmoothVx = 0;
  prevSmoothVy = 0;
  accelX = 0;
  accelY = 0;

  garlandSwayX = 0;
  garlandSwayVx = 0;
  garlandSwayY = 0;
  garlandSwayVy = 0;

  constructor(key: SurfaceKey, localRect: Rect, now: number) {
    this.key = key;
    this.shapeSeed = Math.random() * 100.0;
    this.localRect = { ...localRect };
    this.prevTopY = this.computeTopY(localRect);
    const count = Math.max(2, Math.ceil(this.effectiveWidth / this.binWidth));
    this.heights = new Array(count).fill(0);
    this.organicCap = new Array(count).fill(18.0);
    this.occluded = new Array(count).fill(false);
    this.heightCap = new Array(count).fill(this.maxDriftHeight);
    this.garlandOccluded = new Array(count).fill(false);
    this.lastSeen = now;
    this.rebuildOrganicCap(count);
  }

  get cornerInset(): number {
    if (this.key === 'screenBottom') return 0;
    if (this.key === 'dock') return 18;
    return 11;
  }

  get effectiveMinX(): number {
    return this.localRect.x + this.cornerInset;
  }

  get effectiveMaxX(): number {
    return Math.max(this.effectiveMinX + 4.0, this.localRect.x + this.localRect.width - this.cornerInset);
  }

  get effectiveWidth(): number {
    return Math.max(4.0, this.localRect.width - this.cornerInset * 2.0);
  }

  private computeTopY(rect: Rect): number {
    const maxY = rect.y + rect.height;
    if (this.key === 'dock') {
      return Math.max(4.0, maxY - 0.5);
    }
    return maxY;
  }

  get topY(): number {
    return this.computeTopY(this.localRect);
  }

  get maxDriftHeight(): number {
    if (this.key === 'screenBottom') return 34.0;
    if (this.key === 'dock') return 17.0;
    return 23.0;
  }

  private rebuildOrganicCap(count: number): void {
    const caps = new Array<number>(count);
    const baseMax = this.maxDriftHeight;
    const taperBins = this.key === 'screenBottom' ? 0.0 : 9.0;

    for (let b = 0; b < count; b++) {
      const xPx = b * this.binWidth;
      const w1 = Math.sin(xPx * 0.015 + this.shapeSeed);
      const w2 = Math.sin(xPx * 0.037 + this.shapeSeed * 2.1) * 0.52;
      const w3 = Math.sin(xPx * 0.079 - this.shapeSeed * 1.3) * 0.24;
      const wave = (w1 + w2 + w3) / 1.76;
      let cap = baseMax * (0.68 + 0.32 * wave);

      if (taperBins > 0) {
        const dEdge = Math.min(b + 1, count - b);
        if (dEdge < taperBins) {
          const t = dEdge / taperBins;
          cap *= Math.sin(t * Math.PI * 0.5);
        }
      }
      caps[b] = Math.max(2.5, cap);
    }
    this.organicCap = caps;
  }

  effectiveCap(b: number): number {
    return Math.min(this.organicCap[b], this.heightCap[b]);
  }

  updateRect(newRect: Rect, now: number): void {
    const dx = newRect.x - this.localRect.x;
    const dy = (newRect.y + newRect.height) - (this.localRect.y + this.localRect.height);

    if (Math.abs(dx) < 380 && Math.abs(dy) < 380) {
      this.pendingDx += dx;
      this.pendingDy += dy;
    } else {
      this.pendingDx = 0;
      this.pendingDy = 0;
      this.smoothVx = 0;
      this.smoothVy = 0;
    }

    this.localRect = { ...newRect };
    this.lastSeen = now;
    const newCount = Math.max(2, Math.ceil(this.effectiveWidth / this.binWidth));
    if (newCount !== this.heights.length) {
      const resizedH = new Array<number>(newCount).fill(0);
      const oldCount = this.heights.length;
      if (oldCount > 1 && newCount > 1) {
        for (let i = 0; i < newCount; i++) {
          const t = (i / (newCount - 1)) * (oldCount - 1);
          const lo = Math.floor(t);
          const hi = Math.min(oldCount - 1, lo + 1);
          const frac = t - lo;
          resizedH[i] = this.heights[lo] * (1.0 - frac) + this.heights[hi] * frac;
        }
      }
      this.heights = resizedH;
      this.occluded = new Array<boolean>(newCount).fill(false);
      this.heightCap = new Array<number>(newCount).fill(this.maxDriftHeight);
      this.garlandOccluded = new Array<boolean>(newCount).fill(false);
      this.rebuildOrganicCap(newCount);
    }
  }

  binIndex(localX: number): number | null {
    const idx = Math.floor((localX - this.effectiveMinX) / this.binWidth);
    if (idx < 0 || idx >= this.heights.length) return null;
    return idx;
  }

  addSnow(localX: number, amount: number): boolean {
    const idx = this.binIndex(localX);
    if (idx === null) return false;
    if (this.occluded[idx]) return false;
    const cap = this.effectiveCap(idx);
    if (cap < 1.5 || this.heights[idx] >= cap) return false;

    const kernel: Array<[number, number]> = [
      [-2, 0.25],
      [-1, 0.62],
      [0, 1.0],
      [1, 0.62],
      [2, 0.25]
    ];
    for (const [off, w] of kernel) {
      const b = idx + off;
      if (b >= 0 && b < this.heights.length && !this.occluded[b]) {
        const c = this.effectiveCap(b);
        this.heights[b] = Math.min(c, this.heights[b] + amount * w);
      }
    }
    return true;
  }

  relax(): void {
    const n = this.heights.length;
    if (n <= 2) return;
    const maxSlope = 1.1;
    for (let i = 0; i < n - 1; i++) {
      const diff = this.heights[i] - this.heights[i + 1];
      if (diff > maxSlope) {
        const transfer = (diff - maxSlope) * 0.30;
        this.heights[i] -= transfer;
        this.heights[i + 1] += transfer;
      } else if (diff < -maxSlope) {
        const transfer = (-diff - maxSlope) * 0.30;
        this.heights[i + 1] -= transfer;
        this.heights[i] += transfer;
      }
    }
    if (this.key !== 'screenBottom') {
      this.heights[0] *= 0.65;
      this.heights[n - 1] *= 0.65;
      if (n > 5) {
        this.heights[1] = Math.min(this.heights[1], this.heights[0] + 2.2);
        this.heights[n - 2] = Math.min(this.heights[n - 2], this.heights[n - 1] + 2.2);
        this.heights[2] = Math.min(this.heights[2], this.heights[1] + 2.8);
        this.heights[n - 3] = Math.min(this.heights[n - 3], this.heights[n - 2] + 2.8);
      }
    }
  }

  snowStats(): { avg: number; peak: number; visibleBins: number } {
    let sum = 0;
    let peak = 0;
    let count = 0;
    for (let i = 0; i < this.heights.length; i++) {
      if (this.occluded[i]) continue;
      const h = Math.min(this.heights[i], this.effectiveCap(i));
      sum += h;
      if (h > peak) peak = h;
      count++;
    }
    return { avg: count > 0 ? sum / count : 0, peak, visibleBins: count };
  }

  clear(): void {
    this.heights.fill(0);
    this.driftSquash = 0;
    this.driftSquashVel = 0;
  }
}

export class SnowSimulation {
  width: number;
  height: number;
  topReservedInset = 0;

  flakes: Snowflake[] = [];
  looseSnow: Snowflake[] = [];
  surfaces = new Map<SurfaceKey, SnowSurface>();
  orderedSurfaceKeys: SurfaceKey[] = ['screenBottom'];
  snowballs: Snowball[] = [];
  rollingBall: { x: number; y: number; radius: number } | null = null;
  plow: SnowplowState = {
    active: false,
    targetKey: 'screenBottom',
    x: -140,
    worldY: 0,
    vy: 0,
    airVx: 0,
    slipVx: 0,
    isAirborne: false,
    pitch: 0,
    pitchVel: 0,
    squash: 0,
    squashVel: 0,
    direction: 1,
    speed: 195,
    alpha: 1,
    cooldown: 0
  };
  isFullscreenHidden = false;
  time = 0;

  private frameCounter = 0;
  private pointerLocal: Point | null = null;
  private lastPointerLocal: Point | null = null;
  private readonly maxLooseParticles = 1400;

  constructor(width: number, height: number, topReservedInset = 0) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.topReservedInset = topReservedInset;
    this.ensureBottomSurface(this.nowSec());
  }

  private nowSec(): number {
    return typeof performance !== 'undefined' ? performance.now() * 0.001 : Date.now() * 0.001;
  }

  get menuBarBottomY(): number {
    return Math.min(this.height - 2.0, this.height - this.topReservedInset);
  }

  updateViewport(width: number, height: number, topReservedInset = this.topReservedInset): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.topReservedInset = topReservedInset;
    this.ensureBottomSurface(this.nowSec());
  }

  private ensureBottomSurface(now: number): void {
    const rect: Rect = { x: 0, y: 0, width: this.width, height: 0 };
    const existing = this.surfaces.get('screenBottom');
    if (existing) {
      existing.updateRect(rect, now);
    } else {
      this.surfaces.set('screenBottom', new SnowSurface('screenBottom', rect, now));
    }
  }

  setPointerPosition(localBottomLeft: Point | null): void {
    this.pointerLocal = localBottomLeft ? { ...localBottomLeft } : null;
    if (!localBottomLeft) {
      this.lastPointerLocal = null;
    }
  }

  syncWindows(snapshot: WindowSnapshot, pauseOnFullscreen: boolean, nowOverride?: number): void {
    const now = nowOverride ?? this.nowSec();
    this.isFullscreenHidden = pauseOnFullscreen && Boolean(snapshot.isFullscreen);
    this.ensureBottomSurface(now);

    const activeKeys = new Set<SurfaceKey>(['screenBottom']);
    const localDockRect = snapshot.dockRect ? { ...snapshot.dockRect } : null;

    if (localDockRect) {
      activeKeys.add('dock');
      const existing = this.surfaces.get('dock');
      if (existing) {
        existing.updateRect(localDockRect, now);
      } else {
        this.surfaces.set('dock', new SnowSurface('dock', localDockRect, now));
      }
    }

    const localWindowsInZOrder: Array<[SurfaceKey, Rect]> = [];
    const screenBounds: Rect = { x: 0, y: 0, width: this.width, height: this.height };
    const maxAllowedTop = this.menuBarBottomY + 2.0;

    for (const win of snapshot.windows) {
      const local = win.rect;
      if (!rectsIntersect(local, screenBounds)) continue;
      const topY = local.y + local.height;
      if (topY < 16 || topY > maxAllowedTop) continue;

      const key: SurfaceKey = `window:${win.id}`;
      activeKeys.add(key);
      localWindowsInZOrder.push([key, local]);

      const surf = this.surfaces.get(key);
      if (surf) {
        surf.updateRect(local, now);
      } else {
        this.surfaces.set(key, new SnowSurface(key, local, now));
      }
    }

    const menuBottom = this.menuBarBottomY;
    for (let i = 0; i < localWindowsInZOrder.length; i++) {
      const [key, rect] = localWindowsInZOrder[i];
      const surf = this.surfaces.get(key);
      if (!surf) continue;
      const topY = rect.y + rect.height;
      const baseCap = Math.max(0, Math.min(surf.maxDriftHeight, menuBottom - topY - 1.0));

      const driftOccluders: Array<[number, number]> = [];
      const headroomLimiters: Array<[number, number, number]> = [];
      const garlandOccluders: Array<[number, number]> = [];

      for (let j = 0; j < i; j++) {
        const fRect = localWindowsInZOrder[j][1];
        const fMinX = fRect.x;
        const fMaxX = fRect.x + fRect.width;
        const fMinY = fRect.y;
        const fMaxY = fRect.y + fRect.height;

        if (fMaxX <= surf.effectiveMinX || fMinX >= surf.effectiveMaxX) continue;

        if (fMinY <= topY + 2.0 && fMaxY >= topY - 2.0) {
          driftOccluders.push([fMinX, fMaxX]);
        } else if (fMinY > topY + 2.0 && fMinY < topY + surf.maxDriftHeight + 2.0) {
          headroomLimiters.push([fMinX, fMaxX, Math.max(0, fMinY - topY - 2.0)]);
        }

        if (fMinY <= topY - 3.0 && fMaxY >= topY - 7.0) {
          garlandOccluders.push([fMinX, fMaxX]);
        }
      }

      const binCount = surf.heights.length;
      const effMinX = surf.effectiveMinX;
      const bw = surf.binWidth;
      const sw = this.width;

      for (let b = 0; b < binCount; b++) {
        const bx = effMinX + (b + 0.5) * bw;
        if (bx < 0 || bx > sw) {
          surf.occluded[b] = true;
          surf.garlandOccluded[b] = true;
          surf.heightCap[b] = 0;
          continue;
        }

        let isOcc = false;
        for (const [ox0, ox1] of driftOccluders) {
          if (bx >= ox0 && bx <= ox1) {
            isOcc = true;
            break;
          }
        }
        surf.occluded[b] = isOcc;

        let cap = baseCap;
        if (!isOcc && headroomLimiters.length > 0) {
          for (const [hx0, hx1, hCap] of headroomLimiters) {
            if (bx >= hx0 && bx <= hx1 && hCap < cap) {
              cap = hCap;
            }
          }
        }
        surf.heightCap[b] = cap;

        let isGarOcc = false;
        for (const [gx0, gx1] of garlandOccluders) {
          if (bx >= gx0 && bx <= gx1) {
            isGarOcc = true;
            break;
          }
        }
        surf.garlandOccluded[b] = isGarOcc;
      }
    }

    const dockSurf = this.surfaces.get('dock');
    if (dockSurf) {
      for (let b = 0; b < dockSurf.heights.length; b++) {
        const bx = dockSurf.effectiveMinX + (b + 0.5) * dockSurf.binWidth;
        const offScreen = bx < 0 || bx > this.width;
        dockSurf.occluded[b] = offScreen;
        dockSurf.heightCap[b] = offScreen ? 0 : dockSurf.maxDriftHeight;
        dockSurf.garlandOccluded[b] = true;
      }
    }

    const bottom = this.surfaces.get('screenBottom');
    if (bottom) {
      for (let b = 0; b < bottom.heights.length; b++) {
        const bx = (b + 0.5) * bottom.binWidth;
        let occ = false;
        if (localDockRect) {
          if (bx >= localDockRect.x && bx <= localDockRect.x + localDockRect.width) {
            occ = true;
          }
        }
        bottom.occluded[b] = occ;
        bottom.heightCap[b] = occ ? 0 : bottom.maxDriftHeight;
        bottom.garlandOccluded[b] = true;
      }
    }

    const staleKeys: SurfaceKey[] = [];
    for (const [key, surf] of this.surfaces) {
      if (key === 'screenBottom' || activeKeys.has(key)) continue;
      const grace = key === 'dock' ? 0.15 : 0.45;
      if (now - surf.lastSeen > grace) {
        staleKeys.push(key);
      }
    }

    for (const stale of staleKeys) {
      const oldSurf = this.surfaces.get(stale);
      if (oldSurf) {
        this.burstEntireDriftIntoLooseSnow(oldSurf);
      }
      this.surfaces.delete(stale);
      this.snowballs = this.snowballs.filter((b) => b.surfaceKey !== stale);
      if (this.plow.active && this.plow.targetKey === stale) {
        this.plow.targetKey = this.surfaces.has('dock') ? 'dock' : 'screenBottom';
        this.plow.isAirborne = true;
        this.plow.airVx = this.plow.direction * this.plow.speed;
      }
    }

    const ordered: SurfaceKey[] = ['screenBottom'];
    for (let i = localWindowsInZOrder.length - 1; i >= 0; i--) {
      ordered.push(localWindowsInZOrder[i][0]);
    }
    if (this.surfaces.has('dock')) {
      ordered.push('dock');
    }
    this.orderedSurfaceKeys = ordered;
  }

  private burstEntireDriftIntoLooseSnow(surf: SnowSurface): void {
    const n = surf.heights.length;
    for (let b = 0; b < n; b += 2) {
      if (this.looseSnow.length >= this.maxLooseParticles) break;
      const h = surf.heights[b];
      if (h < 1.5 || surf.occluded[b]) continue;
      const bx = surf.effectiveMinX + (b + 0.5) * surf.binWidth;
      this.looseSnow.push({
        x: bx,
        y: surf.topY + randRange(1, Math.max(2, h)),
        vx: randRange(-45, 45),
        vy: randRange(15, 85),
        radius: randRange(2.2, 5.0),
        alpha: 0.94,
        wobblePhase: randRange(0, 6.28),
        wobbleSpeed: randRange(2, 5),
        life: randRange(1.4, 2.4),
        isClump: h > 5.0 && Math.random() < 0.5,
        canSettle: true,
        sourceSurface: surf.key,
        seed: randRange(0, 10)
      });
    }
  }

  private spawnFlake(randomY: boolean, settings: AppSettings): Snowflake {
    const cfg = INTENSITY_CONFIGS[settings.intensity];
    const w = Math.max(1, this.width);
    const h = Math.max(1, this.height);
    const depth = Math.random();
    const r = 1.2 + depth * depth * 3.4;
    const baseSpeed = (26.0 + r * 14.0) * cfg.speedMultiplier;
    return {
      x: randRange(-30, w + 30),
      y: randomY ? randRange(0, h) : h + randRange(2, 45),
      vx: randRange(-10, 10),
      vy: -baseSpeed * randRange(0.85, 1.15),
      radius: r,
      alpha: 0.42 + depth * 0.54,
      wobblePhase: randRange(0, Math.PI * 2),
      wobbleSpeed: randRange(1.0, 2.6),
      life: 1.0,
      isClump: false,
      canSettle: false,
      sourceSurface: null,
      seed: 0
    };
  }

  step(dt: number, settings: AppSettings, isMobileDevice = false): void {
    this.time += dt;
    this.frameCounter++;

    if (settings.isPaused || this.isFullscreenHidden) return;

    this.updateSurfaceMotionPhysics(dt);

    const cfg = INTENSITY_CONFIGS[settings.intensity];
    const targetCount = isMobileDevice ? Math.round(cfg.flakeCount * 0.72) : cfg.flakeCount;

    if (this.flakes.length < targetCount) {
      const addCount = Math.min(16, targetCount - this.flakes.length);
      for (let i = 0; i < addCount; i++) {
        this.flakes.push(this.spawnFlake(this.flakes.length < targetCount / 2, settings));
      }
    } else if (this.flakes.length > targetCount) {
      this.flakes.splice(this.flakes.length - Math.min(12, this.flakes.length - targetCount));
    }

    const windForce = settings.windStrength * (settings.intensity === 'blizzard' ? 250.0 : 150.0);
    const w = this.width;

    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.wobblePhase += f.wobbleSpeed * dt;
      const wobbleX = Math.sin(f.wobblePhase) * (12.0 + f.radius * 2.8);
      const prevY = f.y;

      f.x += (f.vx + windForce + wobbleX) * dt;
      f.y += f.vy * dt;

      if (f.x < -25) f.x = w + 20;
      if (f.x > w + 25) f.x = -20;

      let landed = false;
      for (let k = this.orderedSurfaceKeys.length - 1; k >= 0; k--) {
        const key = this.orderedSurfaceKeys[k];
        const surf = this.surfaces.get(key);
        if (!surf) continue;
        if (f.x < surf.effectiveMinX || f.x > surf.effectiveMaxX) continue;
        const bin = surf.binIndex(f.x);
        if (bin === null || surf.occluded[bin]) continue;

        const visibleH = Math.min(surf.heights[bin], surf.effectiveCap(bin));
        const landY = surf.topY + visibleH;
        if (prevY >= landY - 3.5 && f.y <= landY + 2.5) {
          const chance = key === 'screenBottom' ? 0.95 : key === 'dock' ? 0.88 : 0.56;
          if (Math.random() < chance) {
            const amount = f.radius * 0.40 * cfg.accumulationMultiplier;
            if (surf.addSnow(f.x, amount)) {
              landed = true;
              break;
            }
          }
        }
      }

      if (landed || f.y < -10) {
        this.flakes[i] = this.spawnFlake(false, settings);
      }
    }

    if (this.frameCounter % 2 === 0) {
      for (const surf of this.surfaces.values()) {
        surf.relax();
      }
    }

    if (settings.activeTool === 'mitten') {
      this.handleMittenHover();
    } else {
      this.lastPointerLocal = null;
    }

    if (this.looseSnow.length > 0) {
      const remaining: Snowflake[] = [];
      for (const p of this.looseSnow) {
        const prevY = p.y;
        p.wobblePhase += p.wobbleSpeed * dt;
        const flutter = p.isClump ? Math.sin(p.wobblePhase) * 14.0 : Math.sin(p.wobblePhase) * 28.0;
        p.x += (p.vx + windForce * (p.isClump ? 0.30 : 0.55) + flutter) * dt;
        p.y += p.vy * dt;

        const dragPow = p.isClump ? 0.48 : 0.16;
        const grav = p.isClump ? 660.0 : 310.0;
        p.vx *= Math.pow(dragPow, dt);
        p.vy -= grav * dt;
        if (!p.isClump && p.vy < -160.0) {
          p.vy = -160.0;
        }
        p.life -= dt * (p.isClump ? 0.55 : 0.65);

        if (
          p.isClump &&
          p.radius > 4.2 &&
          p.vy < -80 &&
          remaining.length < this.maxLooseParticles - 8 &&
          Math.floor(Math.random() * 29) === 0
        ) {
          p.radius *= 0.84;
          remaining.push({
            x: p.x + randRange(-3, 3),
            y: p.y + randRange(-2, 3),
            vx: p.vx * 0.4 + randRange(-30, 30),
            vy: p.vy * 0.3 + randRange(-10, 20),
            radius: randRange(1.5, 2.8),
            alpha: 0.85,
            wobblePhase: randRange(0, 6.28),
            wobbleSpeed: randRange(2, 5),
            life: randRange(0.7, 1.2),
            isClump: false,
            canSettle: true,
            sourceSurface: p.sourceSurface,
            seed: 0
          });
        }

        let settled = false;
        if (p.canSettle && p.vy < -15.0) {
          for (let k = this.orderedSurfaceKeys.length - 1; k >= 0; k--) {
            const key = this.orderedSurfaceKeys[k];
            if (key === p.sourceSurface && p.life > 1.35) continue;
            const surf = this.surfaces.get(key);
            if (!surf) continue;
            if (p.x < surf.effectiveMinX || p.x > surf.effectiveMaxX) continue;
            const bin = surf.binIndex(p.x);
            if (bin === null || surf.occluded[bin]) continue;
            const landY = surf.topY + Math.min(surf.heights[bin], surf.effectiveCap(bin));
            if (prevY >= landY - 5.0 && p.y <= landY + 4.0) {
              const deposit = p.isClump ? p.radius * 0.55 : p.radius * 0.28;
              surf.addSnow(p.x, deposit);
              settled = true;
              break;
            }
          }
        }

        if (!settled && p.life > 0 && p.y > -20 && p.x > -45 && p.x < w + 45) {
          p.alpha = clamp(p.life * 1.1, 0, 0.96);
          remaining.push(p);
        }
      }
      this.looseSnow = remaining;
    }

    this.updateSnowballs(dt);
    this.updateSnowplow(dt, settings);
  }

  private updateSurfaceMotionPhysics(dt: number): void {
    const smoothAlpha = 1.0 - Math.exp(-dt / 0.032);

    for (const surf of this.surfaces.values()) {
      const dx = surf.pendingDx;
      const dy = surf.pendingDy;
      surf.frameDx = dx;
      surf.frameDy = dy;
      surf.pendingDx = 0;
      surf.pendingDy = 0;

      const oldTopY = surf.prevTopY;
      surf.prevTopY = surf.topY;

      if (surf.key === 'screenBottom') continue;

      const instVx = clamp(dx / dt, -2400, 2400);
      const instVy = clamp(dy / dt, -2400, 2400);

      surf.prevSmoothVx = surf.smoothVx;
      surf.prevSmoothVy = surf.smoothVy;
      surf.smoothVx += (instVx - surf.smoothVx) * smoothAlpha;
      surf.smoothVy += (instVy - surf.smoothVy) * smoothAlpha;

      if (Math.abs(surf.smoothVx) < 1.5 && dx === 0) surf.smoothVx = 0;
      if (Math.abs(surf.smoothVy) < 1.5 && dy === 0) surf.smoothVy = 0;

      surf.accelX = (surf.smoothVx - surf.prevSmoothVx) / dt;
      surf.accelY = (surf.smoothVy - surf.prevSmoothVy) / dt;

      if (isWindowSurfaceKey(surf.key)) {
        const targetForceX = -surf.accelX * 0.0014 - surf.smoothVx * 0.0035;
        const targetForceY = -surf.accelY * 0.0010;
        surf.garlandSwayVx += (targetForceX - 110.0 * surf.garlandSwayX - 11.5 * surf.garlandSwayVx) * dt;
        surf.garlandSwayX = clamp(surf.garlandSwayX + surf.garlandSwayVx * dt, -7.5, 7.5);

        surf.garlandSwayVy += (targetForceY - 110.0 * surf.garlandSwayY - 11.5 * surf.garlandSwayVy) * dt;
        surf.garlandSwayY = clamp(surf.garlandSwayY + surf.garlandSwayVy * dt, -4.5, 5.5);
      }

      const squashForce = surf.accelY * 0.000045;
      surf.driftSquashVel += (squashForce - 135.0 * surf.driftSquash - 12.0 * surf.driftSquashVel) * dt;
      surf.driftSquash = clamp(surf.driftSquash + surf.driftSquashVel * dt, -0.22, 0.24);

      const n = surf.heights.length;
      if (n <= 2) continue;

      const dropFast = dy < -2.0 && surf.smoothVy < -120.0;
      const upwardToss = surf.accelY < -1400.0 && surf.prevSmoothVy > 95.0;
      const hardShake =
        Math.abs(surf.accelX) > 2200.0 || Math.hypot(surf.smoothVx, surf.smoothVy) > 420.0;

      if ((dropFast || upwardToss || hardShake) && this.looseSnow.length < this.maxLooseParticles) {
        let strength = 0;
        if (dropFast) {
          strength = Math.max(strength, Math.min(1.0, (-surf.smoothVy - 110.0) / 520.0));
        }
        if (upwardToss) {
          strength = Math.max(strength, Math.min(1.0, surf.prevSmoothVy / 450.0));
        }
        if (hardShake) {
          strength = Math.max(
            strength,
            Math.min(
              0.85,
              Math.max(
                (Math.abs(surf.accelX) - 2200.0) / 6000.0,
                (Math.hypot(surf.smoothVx, surf.smoothVy) - 420.0) / 750.0
              )
            )
          );
        }

        const spawnBaseY = dropFast ? Math.max(surf.topY + 2.0, oldTopY) : surf.topY;
        const stepBins = Math.max(1, Math.floor(4.0 - strength * 2.5));
        const offset = this.frameCounter % stepBins;

        for (let b = offset; b < n; b += stepBins) {
          if (this.looseSnow.length >= this.maxLooseParticles) break;
          const h = surf.heights[b];
          if (surf.occluded[b] || h < 1.8) continue;
          if (Math.random() > 0.28 + strength * 0.56) continue;

          const shave = Math.min(h * 0.42, 0.9 + strength * 3.2);
          surf.heights[b] -= shave;
          if (surf.heights[b] < 0.25) surf.heights[b] = 0;

          const bx = surf.effectiveMinX + (b + 0.5) * surf.binWidth + randRange(-3, 3);
          const by = spawnBaseY + randRange(Math.max(1.0, h * 0.3), Math.max(2.5, h + 2.0));

          const makeClump = shave > 1.4 && Math.random() < 0.46;
          let launchVy: number;
          if (upwardToss) {
            launchVy = surf.prevSmoothVy * randRange(0.45, 0.95) + randRange(50, 160);
          } else if (dropFast) {
            launchVy = randRange(15, 95);
          } else {
            launchVy = randRange(45, 155);
          }

          const launchVx = surf.smoothVx * randRange(0.22, 0.58) + randRange(-75, 75);

          this.looseSnow.push({
            x: bx,
            y: by,
            vx: launchVx,
            vy: launchVy,
            radius: makeClump ? randRange(3.2, 6.4) : randRange(1.5, 3.4),
            alpha: makeClump ? randRange(0.88, 0.98) : randRange(0.65, 0.92),
            wobblePhase: randRange(0, 6.28),
            wobbleSpeed: randRange(2.0, 5.5),
            life: randRange(1.25, 2.2),
            isClump: makeClump,
            canSettle: true,
            sourceSurface: surf.key,
            seed: randRange(0, 10)
          });

          if (makeClump && this.looseSnow.length < this.maxLooseParticles) {
            this.looseSnow.push({
              x: bx + randRange(-5, 5),
              y: by + randRange(-2, 5),
              vx: launchVx * 0.7 + randRange(-55, 55),
              vy: launchVy * 0.85 + randRange(10, 65),
              radius: randRange(1.4, 2.8),
              alpha: randRange(0.55, 0.85),
              wobblePhase: randRange(0, 6.28),
              wobbleSpeed: randRange(2.5, 6.0),
              life: randRange(0.9, 1.6),
              isClump: false,
              canSettle: true,
              sourceSurface: surf.key,
              seed: randRange(0, 10)
            });
          }
        }
      }

      if (Math.abs(surf.smoothVx) > 150.0 || Math.abs(surf.accelX) > 1300.0) {
        const pushDir = surf.smoothVx + surf.accelX * 0.04 > 0 ? -1 : 1;
        const flow = Math.min(
          0.18,
          (Math.abs(surf.smoothVx) * 0.00022 + Math.abs(surf.accelX) * 0.000018) * (dt * 60.0)
        );
        if (pushDir < 0) {
          for (let b = 1; b < n; b++) {
            if (!surf.occluded[b] && !surf.occluded[b - 1] && surf.heights[b] > 1.0) {
              const move = surf.heights[b] * flow;
              surf.heights[b] -= move;
              surf.heights[b - 1] = Math.min(surf.effectiveCap(b - 1), surf.heights[b - 1] + move);
            }
          }
        } else {
          for (let b = n - 2; b >= 0; b--) {
            if (!surf.occluded[b] && !surf.occluded[b + 1] && surf.heights[b] > 1.0) {
              const move = surf.heights[b] * flow;
              surf.heights[b] -= move;
              surf.heights[b + 1] = Math.min(surf.effectiveCap(b + 1), surf.heights[b + 1] + move);
            }
          }
        }
      }
    }
  }

  private handleMittenHover(): void {
    const localMouse = this.pointerLocal;
    if (!localMouse) {
      this.lastPointerLocal = null;
      return;
    }

    const prev = this.lastPointerLocal ?? localMouse;
    this.lastPointerLocal = { ...localMouse };

    if (
      localMouse.x < -20 ||
      localMouse.x > this.width + 20 ||
      localMouse.y < -20 ||
      localMouse.y > this.height + 20
    ) {
      return;
    }

    const dx = localMouse.x - prev.x;
    const dy = localMouse.y - prev.y;
    const speed = Math.hypot(dx, dy);
    if (speed <= 1.2) return;

    this.brushSnowAt(localMouse.x, localMouse.y, dx, dy, speed);
  }

  brushSnowAt(x: number, y: number, dx = 0, dy = 0, speed = 10): void {
    const brushRadius = 34.0;
    for (const surf of this.surfaces.values()) {
      if (x + brushRadius < surf.effectiveMinX || x - brushRadius > surf.effectiveMaxX) continue;
      if (Math.abs(y - (surf.topY + 10)) > brushRadius + surf.maxDriftHeight) continue;

      const startBin = Math.max(0, Math.floor((x - brushRadius - surf.effectiveMinX) / surf.binWidth));
      const endBin = Math.min(
        surf.heights.length - 1,
        Math.ceil((x + brushRadius - surf.effectiveMinX) / surf.binWidth)
      );
      if (startBin > endBin) continue;

      for (let b = startBin; b <= endBin; b++) {
        if (surf.occluded[b] || surf.heights[b] < 0.4) continue;
        const bx = surf.effectiveMinX + (b + 0.5) * surf.binWidth;
        const by = surf.topY + Math.min(surf.heights[b], surf.effectiveCap(b)) * 0.5;
        const dist = Math.hypot(bx - x, by - y);
        if (dist < brushRadius) {
          const strength = 1.0 - dist / brushRadius;
          const removed = Math.min(surf.heights[b], strength * (5.2 + Math.min(speed, 24.0) * 0.5));
          surf.heights[b] -= removed;

          if (removed > 0.7 && this.looseSnow.length < this.maxLooseParticles) {
            const clump = removed > 2.4 && Math.random() < 0.5;
            this.looseSnow.push({
              x: bx,
              y: surf.topY + surf.heights[b] + 2,
              vx: dx * 4.5 + randRange(-60, 60),
              vy: Math.max(40, dy * 3.2 + randRange(50, 150)),
              radius: clump ? randRange(3.0, 5.2) : randRange(1.6, 3.4),
              alpha: 0.94,
              wobblePhase: randRange(0, 6.28),
              wobbleSpeed: randRange(2, 5),
              life: randRange(0.8, 1.45),
              isClump: clump,
              canSettle: true,
              sourceSurface: surf.key,
              seed: randRange(0, 10)
            });
          }
        }
      }
    }
  }

  // MARK: - Snowballs & Snowmen

  beginRollingBall(localPoint: Point): void {
    this.rollingBall = { x: localPoint.x, y: localPoint.y, radius: 7.5 };
  }

  continueRollingBall(localPoint: Point): void {
    if (!this.rollingBall) return;
    const dist = Math.hypot(localPoint.x - this.rollingBall.x, localPoint.y - this.rollingBall.y);
    this.rollingBall.x = localPoint.x;
    this.rollingBall.y = localPoint.y;

    let scooped = 0;
    for (const surf of this.surfaces.values()) {
      const bin = surf.binIndex(localPoint.x);
      if (
        bin !== null &&
        Math.abs(localPoint.y - (surf.topY + surf.heights[bin])) < this.rollingBall.radius + 26
      ) {
        const take = Math.min(surf.heights[bin], dist * 0.24);
        surf.heights[bin] -= take;
        scooped += take;
      }
    }
    this.rollingBall.radius = Math.min(24.0, this.rollingBall.radius + dist * 0.055 + scooped * 0.16);
  }

  releaseRollingBall(): void {
    if (!this.rollingBall) return;
    const ball = this.rollingBall;
    this.rollingBall = null;
    this.snowballs.push({
      id: genId(),
      surfaceKey: null,
      x: ball.x,
      y: ball.y,
      radius: ball.radius,
      vy: -35.0,
      stackLevel: 0,
      parentId: null,
      hasFace: false,
      hopY: 0,
      hopVy: 0,
      wobbleX: 0,
      wobbleVx: 0
    });
  }

  resolvedPosition(ball: Snowball): Point {
    if (ball.surfaceKey) {
      const surf = this.surfaces.get(ball.surfaceKey);
      if (surf) {
        return {
          x: surf.effectiveMinX + ball.x + ball.wobbleX,
          y: surf.topY + ball.y + ball.hopY
        };
      }
    }
    return { x: ball.x, y: ball.y };
  }

  private updateSnowballs(dt: number): void {
    for (const b of this.snowballs) {
      if (!b.surfaceKey || b.surfaceKey === 'screenBottom') continue;
      const surf = this.surfaces.get(b.surfaceKey);
      if (!surf) continue;

      if (surf.frameDy < -1.0 && surf.smoothVy < -85.0) {
        b.hopY = Math.min(90.0, b.hopY - surf.frameDy * 0.92);
      }
      if (surf.accelY < -1100.0 && surf.prevSmoothVy > 90.0 && b.hopY < 4.0) {
        b.hopVy = Math.max(b.hopVy, Math.min(460.0, surf.prevSmoothVy * 0.85));
      }

      if (b.hopY > 0.001 || Math.abs(b.hopVy) > 0.001) {
        b.hopVy -= 1120.0 * dt;
        b.hopY += b.hopVy * dt;
        if (b.hopY <= 0) {
          b.hopY = 0;
          b.hopVy = b.hopVy < -110.0 ? -b.hopVy * 0.36 : 0;
        }
      }

      const levelMult = (b.stackLevel + 1) * 0.65;
      const forceX = -surf.accelX * 0.0022 * levelMult;
      b.wobbleVx += (forceX - 95.0 * b.wobbleX - 9.0 * b.wobbleVx) * dt;
      b.wobbleX = clamp(b.wobbleX + b.wobbleVx * dt, -14.0 * levelMult, 14.0 * levelMult);
    }

    for (let i = 0; i < this.snowballs.length; i++) {
      const b = this.snowballs[i];
      if (b.surfaceKey !== null) continue;

      const prevY = b.y;
      b.vy -= 560.0 * dt;
      b.y += b.vy * dt;

      let landed = false;

      for (let j = 0; j < this.snowballs.length; j++) {
        if (j === i) continue;
        const other = this.snowballs[j];
        if (!other.surfaceKey || other.stackLevel >= 2) continue;
        if (this.snowballs.some((s) => s.parentId === other.id)) continue;

        const otherPos = this.resolvedPosition(other);
        const dx = Math.abs(b.x - otherPos.x);
        const snapY = otherPos.y + other.radius + b.radius * 0.72;
        if (dx < Math.max(other.radius, b.radius) * 1.2 && prevY >= snapY - 12 && b.y <= snapY + 8) {
          const surf = this.surfaces.get(other.surfaceKey);
          if (surf) {
            b.surfaceKey = other.surfaceKey;
            b.x = other.x;
            b.y = otherPos.y - surf.topY - other.hopY + other.radius + b.radius * 0.72;
            b.vy = 0;
            b.stackLevel = other.stackLevel + 1;
            b.parentId = other.id;
            b.hasFace = true;
            other.hasFace = false;
            landed = true;
            break;
          }
        }
      }

      if (!landed) {
        for (let k = this.orderedSurfaceKeys.length - 1; k >= 0; k--) {
          const key = this.orderedSurfaceKeys[k];
          const surf = this.surfaces.get(key);
          if (!surf) continue;
          if (b.x < surf.effectiveMinX + 4 || b.x > surf.effectiveMaxX - 4) continue;
          const bin = surf.binIndex(b.x);
          if (bin === null || surf.occluded[bin]) continue;

          const targetY = surf.topY + Math.min(surf.heights[bin] * 0.35, 6) + b.radius * 0.85;
          if (prevY >= targetY - 10 && b.y <= targetY + 6) {
            b.surfaceKey = key;
            b.x = b.x - surf.effectiveMinX;
            b.y = targetY - surf.topY;
            b.vy = 0;
            b.stackLevel = 0;
            landed = true;
            break;
          }
        }
      }

      if (!landed && b.y < -40) {
        b.surfaceKey = 'screenBottom';
        b.x = clamp(b.x, 20, Math.max(20, this.width - 20));
        b.y = b.radius * 0.85;
        b.vy = 0;
      }
    }
  }

  // MARK: - Smart Multi-Surface Snowplow

  private pickBestPlowTarget(
    allowWindows: boolean,
    minAvg: number,
    minPeak: number,
    exclude: SurfaceKey | null = null
  ): SurfaceKey | null {
    let bestKey: SurfaceKey | null = null;
    let bestScore = -1;
    const menuBottom = this.menuBarBottomY;
    const hasDock = this.surfaces.has('dock');

    for (const [key, surf] of this.surfaces) {
      if (key === exclude) continue;
      if (isWindowSurfaceKey(key)) {
        if (!allowWindows) continue;
        if (surf.effectiveWidth < 200) continue;
        if (menuBottom - surf.topY < 72) continue;
      }

      const stats = surf.snowStats();
      const minBins = key === 'screenBottom' && hasDock ? 70 : 25;
      if (stats.visibleBins < minBins) continue;

      if (stats.avg < minAvg && stats.peak < minPeak) continue;

      const priorityBonus = key === 'dock' ? 3.5 : key === 'screenBottom' ? 1.5 : 0.0;
      const score = stats.avg + stats.peak * 0.35 + priorityBonus;
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    return bestKey;
  }

  launchPlow(key: SurfaceKey): void {
    const surf = this.surfaces.get(key);
    if (!surf) return;

    this.plow.active = true;
    this.plow.targetKey = key;
    this.plow.direction = Math.random() < 0.5 ? 1.0 : -1.0;
    this.plow.worldY = surf.topY;
    this.plow.vy = 0;
    this.plow.airVx = this.plow.direction * this.plow.speed;
    this.plow.slipVx = 0;
    this.plow.isAirborne = false;
    this.plow.pitch = 0;
    this.plow.pitchVel = 0;
    this.plow.squash = 0;
    this.plow.squashVel = 0;
    this.plow.cooldown = 0;

    if (key === 'screenBottom') {
      this.plow.x = this.plow.direction > 0 ? -110 : this.width + 110;
      this.plow.alpha = 1.0;
    } else {
      const entryX = surf.effectiveMinX - 42;
      const exitX = surf.effectiveMaxX + 42;
      this.plow.x = this.plow.direction > 0 ? entryX : exitX;
      this.plow.alpha = 0.0;
    }
  }

  triggerPlowManually(allowWindows: boolean): void {
    const excludeKey: SurfaceKey | null = this.plow.active ? this.plow.targetKey : null;

    const snowy = this.pickBestPlowTarget(allowWindows, 0.5, 1.2, excludeKey);
    if (snowy) {
      this.launchPlow(snowy);
      return;
    }

    if (allowWindows && excludeKey === 'dock') {
      const menuBottom = this.menuBarBottomY;
      for (let k = this.orderedSurfaceKeys.length - 1; k >= 0; k--) {
        const key = this.orderedSurfaceKeys[k];
        if (!isWindowSurfaceKey(key)) continue;
        const surf = this.surfaces.get(key);
        if (surf && surf.effectiveWidth >= 200 && menuBottom - surf.topY >= 72) {
          this.launchPlow(key);
          return;
        }
      }
    }

    const snowyAny = this.pickBestPlowTarget(allowWindows, 0.4, 1.0);
    if (snowyAny) {
      this.launchPlow(snowyAny);
    } else if (this.surfaces.has('dock')) {
      this.launchPlow('dock');
    } else {
      this.launchPlow('screenBottom');
    }
  }

  private spawnLandingSnowPuff(x: number, y: number, impactSpeed: number, surface: SurfaceKey): void {
    const count = Math.min(22, Math.max(6, Math.floor(impactSpeed / 32.0)));
    for (let i = 0; i < count; i++) {
      if (this.looseSnow.length >= this.maxLooseParticles) break;
      const clump = Math.random() < 0.5;
      this.looseSnow.push({
        x: x + randRange(-30, 30),
        y: y + randRange(2, 8),
        vx: randRange(-155, 155),
        vy: randRange(85, Math.min(280, 120 + impactSpeed * 0.38)),
        radius: clump ? randRange(3.0, 5.4) : randRange(1.6, 3.2),
        alpha: 0.95,
        wobblePhase: randRange(0, 6.28),
        wobbleSpeed: randRange(2, 5),
        life: randRange(0.75, 1.35),
        isClump: clump,
        canSettle: true,
        sourceSurface: surface,
        seed: randRange(0, 10)
      });
    }
  }

  private updateSnowplow(dt: number, settings: AppSettings): void {
    const plow = this.plow;
    if (plow.cooldown > 0) {
      plow.cooldown -= dt;
    }

    if (!plow.active) {
      if (settings.autoPlowEnabled && plow.cooldown <= 0) {
        const target = this.pickBestPlowTarget(settings.plowOnWindows, 5.5, 10.5);
        if (target) {
          this.launchPlow(target);
        }
      }
      return;
    }

    const surf = this.surfaces.get(plow.targetKey);
    if (!surf) {
      plow.active = false;
      return;
    }

    const ledgeY = surf.topY;
    const ledgeVy = surf.smoothVy;
    const prevWorldY = plow.worldY;

    if (!plow.isAirborne) {
      const slipImpulse = -surf.accelX * 0.015 * dt;
      plow.slipVx = clamp((plow.slipVx + slipImpulse) * Math.pow(0.015, dt), -220, 220);
      plow.x += surf.frameDx + (plow.direction * plow.speed + plow.slipVx) * dt;
      plow.airVx = plow.direction * plow.speed + surf.smoothVx * 0.72;
      plow.pitchVel += (-surf.accelX * 0.00028 * plow.direction) * dt * 60.0;
    } else {
      plow.x += plow.airVx * dt;
      const targetVx = plow.direction * plow.speed;
      plow.airVx += (targetVx - plow.airVx) * (1.0 - Math.exp(-dt * 1.6));
    }

    const gravity = 1220.0;
    plow.vy -= gravity * dt;
    plow.worldY += plow.vy * dt;

    const ceilingY = this.menuBarBottomY - 62.0;
    if (plow.worldY > ceilingY) {
      plow.worldY = ceilingY;
      if (plow.vy > 0) plow.vy = -plow.vy * 0.2;
    }

    const overTargetSpan =
      plow.targetKey === 'screenBottom' ||
      (plow.x >= surf.effectiveMinX - 52.0 && plow.x <= surf.effectiveMaxX + 52.0);

    if (overTargetSpan && plow.worldY <= ledgeY) {
      const relVy = plow.vy - ledgeVy;
      plow.worldY = ledgeY;

      if (relVy < -145.0) {
        const impact = -relVy;
        plow.vy = ledgeVy + impact * 0.36;
        plow.isAirborne = plow.vy - ledgeVy > 75.0;
        plow.squash = Math.min(1.0, impact / 460.0);
        plow.squashVel = -impact * 0.006;
        plow.pitchVel += impact * 0.0085 * (Math.random() < 0.5 ? 1.0 : -0.8);
        this.spawnLandingSnowPuff(plow.x, ledgeY, impact, plow.targetKey);
      } else {
        plow.isAirborne = false;
        plow.vy = ledgeVy > 85.0 ? Math.min(680.0, ledgeVy * 0.96) : Math.min(0, ledgeVy);
      }
    } else {
      if (!plow.isAirborne && plow.worldY > ledgeY + 2.0) {
        plow.isAirborne = true;
        plow.pitchVel += Math.min(4.8, Math.max(1.2, Math.abs(plow.vy) * 0.008));
      }

      if (!overTargetSpan && plow.isAirborne && plow.vy < 0) {
        for (let k = this.orderedSurfaceKeys.length - 1; k >= 0; k--) {
          const key = this.orderedSurfaceKeys[k];
          if (key === plow.targetKey) continue;
          const lower = this.surfaces.get(key);
          if (!lower) continue;
          if (plow.x < lower.effectiveMinX - 10 || plow.x > lower.effectiveMaxX + 10) continue;
          if (prevWorldY >= lower.topY - 8 && plow.worldY <= lower.topY + 4) {
            plow.targetKey = key;
            plow.worldY = lower.topY;
            const impact = Math.abs(plow.vy);
            plow.vy = impact * 0.36;
            plow.isAirborne = plow.vy > 75.0;
            plow.squash = Math.min(1.0, impact / 460.0);
            plow.pitchVel += impact * 0.009;
            this.spawnLandingSnowPuff(plow.x, lower.topY, impact, key);
            break;
          }
        }
        if (plow.worldY <= 0) {
          plow.targetKey = 'screenBottom';
          plow.worldY = 0;
          const impact = Math.abs(plow.vy);
          plow.vy = impact * 0.32;
          plow.isAirborne = plow.vy > 75.0;
          plow.squash = Math.min(1.0, impact / 460.0);
          this.spawnLandingSnowPuff(plow.x, 0, impact, 'screenBottom');
        }
      }
    }

    const targetPitch = plow.isAirborne ? clamp(plow.vy * 0.00075, -0.34, 0.38) : 0.0;
    const pitchSpring = plow.isAirborne ? 24.0 : 120.0;
    const pitchDamp = plow.isAirborne ? 4.5 : 13.0;
    plow.pitchVel += ((targetPitch - plow.pitch) * pitchSpring - plow.pitchVel * pitchDamp) * dt;
    plow.pitch = clamp(plow.pitch + plow.pitchVel * dt, -0.48, 0.48);

    const squashSpring = 190.0;
    const squashDamp = 15.0;
    plow.squashVel += (-plow.squash * squashSpring - plow.squashVel * squashDamp) * dt;
    plow.squash = clamp(plow.squash + plow.squashVel * dt, -0.25, 1.0);

    const activeSurf = this.surfaces.get(plow.targetKey);
    if (!activeSurf) {
      plow.active = false;
      return;
    }

    let minBound: number;
    let maxBound: number;
    if (plow.targetKey === 'screenBottom') {
      minBound = -120;
      maxBound = this.width + 120;
      plow.alpha = 1.0;
    } else {
      minBound = activeSurf.effectiveMinX - 48;
      maxBound = activeSurf.effectiveMaxX + 48;
      if (plow.isAirborne) {
        plow.alpha = 1.0;
      } else {
        const dIn = plow.x - minBound;
        const dOut = maxBound - plow.x;
        plow.alpha = clamp(Math.min(dIn, dOut) / 36.0, 0.0, 1.0);
      }
    }

    const heightAboveLedge = plow.worldY - activeSurf.topY;
    if (heightAboveLedge < 22.0) {
      const bladeX = plow.x + plow.direction * 42.0;
      const clearHalfW = 28.0;
      const startBin = Math.max(
        0,
        Math.floor((bladeX - clearHalfW - activeSurf.effectiveMinX) / activeSurf.binWidth)
      );
      const endBin = Math.min(
        activeSurf.heights.length - 1,
        Math.ceil((bladeX + clearHalfW - activeSurf.effectiveMinX) / activeSurf.binWidth)
      );

      if (startBin <= endBin) {
        for (let b = startBin; b <= endBin; b++) {
          if (activeSurf.occluded[b]) continue;
          const h = activeSurf.heights[b];
          if (h > 0.3 && heightAboveLedge <= h + 8.0) {
            activeSurf.heights[b] = 0;
            if (this.looseSnow.length < this.maxLooseParticles && Math.random() < 0.5) {
              const bx = activeSurf.effectiveMinX + (b + 0.5) * activeSurf.binWidth;
              const clump = h > 5.0 && Math.random() < 0.5;
              this.looseSnow.push({
                x: bx,
                y: activeSurf.topY + randRange(3, Math.max(6, h)),
                vx: plow.direction * randRange(105, 210) + activeSurf.smoothVx * 0.25,
                vy: randRange(115, 255),
                radius: clump ? randRange(3.0, 5.2) : randRange(1.8, 3.6),
                alpha: 0.96,
                wobblePhase: randRange(0, 6.28),
                wobbleSpeed: randRange(2, 5),
                life: randRange(0.65, 1.2),
                isClump: clump,
                canSettle: false,
                sourceSurface: activeSurf.key,
                seed: randRange(0, 10)
              });
            }
          }
        }
      }

      this.snowballs = this.snowballs.filter((ball) => {
        if (ball.surfaceKey !== plow.targetKey) return true;
        const worldX = activeSurf.effectiveMinX + ball.x;
        return Math.abs(worldX - bladeX) >= 30;
      });
    }

    const offScreen = plow.x < -160 || plow.x > this.width + 160;
    const finishedSurface =
      !plow.isAirborne &&
      ((plow.direction > 0 && plow.x > maxBound) || (plow.direction < 0 && plow.x < minBound));
    if (offScreen || finishedSurface) {
      plow.active = false;
      plow.cooldown = 12.0;
    }
  }

  clearAllSnow(): void {
    for (const surf of this.surfaces.values()) {
      for (let b = 0; b < surf.heights.length; b += 4) {
        if (surf.heights[b] > 1.5 && this.looseSnow.length < this.maxLooseParticles) {
          const bx = surf.effectiveMinX + b * surf.binWidth;
          this.looseSnow.push({
            x: bx,
            y: surf.topY + Math.min(surf.heights[b], surf.effectiveCap(b)),
            vx: randRange(-65, 65),
            vy: randRange(55, 150),
            radius: randRange(1.8, 3.8),
            alpha: 0.92,
            wobblePhase: randRange(0, 6.28),
            wobbleSpeed: randRange(2, 5),
            life: randRange(0.6, 1.05),
            isClump: false,
            canSettle: false,
            sourceSurface: null,
            seed: 0
          });
        }
      }
      surf.clear();
    }
  }

  clearSnowmen(): void {
    this.snowballs = [];
    this.rollingBall = null;
  }
}
