import { makePlowSprite } from '../core/PlowTextureFactory';
import {
  isWindowSurfaceKey,
  type AppSettings,
  type PlowStyle
} from '../core/types';
import { SnowSimulation, SnowSurface, type Snowflake } from '../core/SnowSimulation';

const GARLAND_COLORS = [
  'rgb(255, 77, 66)',
  'rgb(255, 204, 56)',
  'rgb(61, 224, 122)',
  'rgb(82, 189, 255)',
  'rgb(255, 143, 46)'
];

/**
 * Fallback 2D renderer when WebGL2 is unavailable or disabled on older devices/drivers.
 */
export class Canvas2DSnowRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private smoothedHeights: number[] = [];

  private plowCanvas: HTMLCanvasElement | null = null;
  private plowSizePt = { width: 150, height: 84 };
  private cachedPlowStyle: PlowStyle | null = null;
  private cachedCustomVersion = -1;
  private plowLoading = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx = ctx;
    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    const pxW = Math.max(1, Math.round(this.cssWidth * this.dpr));
    const pxH = Math.max(1, Math.round(this.cssHeight * this.dpr));
    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
    }
  }

  render(sim: SnowSimulation, settings: AppSettings): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (settings.isPaused || sim.isFullscreenHidden) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Flip Y so bottom-left simulation coordinates map cleanly
    ctx.translate(0, this.cssHeight);
    ctx.scale(1, -1);

    for (const key of sim.orderedSurfaceKeys) {
      const surf = sim.surfaces.get(key);
      if (!surf) continue;
      if (isWindowSurfaceKey(key) && settings.garlandMode !== 'off') {
        this.drawGarland(surf, sim.time, settings.garlandMode);
      }
      this.drawSnowdrift(surf);
    }

    this.drawSnowmen(sim);
    this.drawFlakes(sim.flakes);
    this.drawFlakes(sim.looseSnow);

    if (sim.plow.active) {
      this.ensurePlowSprite(settings);
      this.drawSnowplow(sim);
    }

    ctx.restore();
  }

  private ensurePlowSprite(settings: AppSettings): void {
    const needsRebuild =
      this.cachedPlowStyle !== settings.plowStyle ||
      (settings.plowStyle === 'custom' && this.cachedCustomVersion !== settings.customPlowVersion);
    if (!needsRebuild || this.plowLoading) return;

    this.plowLoading = true;
    const style = settings.plowStyle;
    const ver = settings.customPlowVersion;
    makePlowSprite(style, settings.customPlowDataUrl)
      .then((res) => {
        this.plowCanvas = res.canvas;
        this.plowSizePt = { width: res.widthPt, height: res.heightPt };
        this.cachedPlowStyle = style;
        this.cachedCustomVersion = ver;
      })
      .finally(() => {
        this.plowLoading = false;
      });
  }

  private drawSnowdrift(surf: SnowSurface): void {
    const n = surf.heights.length;
    if (n <= 2) return;
    if (this.smoothedHeights.length < n) {
      this.smoothedHeights = new Array<number>(n).fill(0);
    }

    const squashMult = 1.0 + surf.driftSquash;
    const weights = [0.12, 0.22, 0.32, 0.22, 0.12];
    for (let b = 0; b < n; b++) {
      if (surf.occluded[b]) {
        this.smoothedHeights[b] = 0;
        continue;
      }
      let acc = 0;
      let wSum = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = b + k;
        if (idx >= 0 && idx < n && !surf.occluded[idx]) {
          const w = weights[k + 2];
          acc += Math.min(surf.heights[idx], surf.effectiveCap(idx)) * w;
          wSum += w;
        }
      }
      this.smoothedHeights[b] = (wSum > 0 ? acc / wSum : 0) * squashMult;
    }

    const ctx = this.ctx;
    const topEdgeY = surf.topY;
    const effMinX = surf.effectiveMinX;
    const bw = surf.binWidth;
    const isWindowSurf = isWindowSurfaceKey(surf.key);

    let i = 0;
    while (i < n) {
      while (i < n && (surf.occluded[i] || this.smoothedHeights[i] < 0.45)) i++;
      if (i >= n) break;
      const start = i;
      while (i < n && !surf.occluded[i] && this.smoothedHeights[i] >= 0.45) i++;
      const end = i - 1;
      if (end - start + 1 < 2) continue;

      ctx.beginPath();
      const xStart = effMinX + start * bw;
      ctx.moveTo(xStart, topEdgeY);
      for (let b = start; b <= end; b++) {
        const x = effMinX + (b + 0.5) * bw;
        ctx.lineTo(x, topEdgeY + this.smoothedHeights[b]);
      }
      const xEnd = effMinX + (end + 1) * bw;
      ctx.lineTo(xEnd, topEdgeY);
      for (let b = end; b >= start; b--) {
        const x = effMinX + (b + 0.5) * bw;
        const lip = isWindowSurf ? Math.min(2.4, this.smoothedHeights[b] * 0.18) : 0;
        ctx.lineTo(x, topEdgeY - lip);
      }
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, topEdgeY - 2, 0, topEdgeY + surf.maxDriftHeight);
      grad.addColorStop(0, 'rgba(198, 218, 245, 0.96)');
      grad.addColorStop(0.55, 'rgba(238, 246, 255, 0.98)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  private drawGarland(surf: SnowSurface, time: number, mode: 'twinkle' | 'wave'): void {
    const spacing = 26;
    const count = Math.floor(surf.effectiveWidth / spacing);
    if (count < 3) return;
    const ctx = this.ctx;
    const topY = surf.topY;
    const swayX = surf.garlandSwayX;
    const swayY = surf.garlandSwayY;

    for (let k = 0; k < count; k++) {
      const x1 = surf.effectiveMinX + k * spacing;
      const x2 = Math.min(surf.effectiveMaxX, x1 + spacing);
      const midX = (x1 + x2) * 0.5;
      const midBin = surf.binIndex(midX);
      if (midBin === null || surf.garlandOccluded[midBin]) continue;

      ctx.strokeStyle = 'rgba(31, 61, 41, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, topY - 0.5);
      ctx.lineTo(midX + swayX * 0.85, topY - 4.2 + swayY);
      ctx.lineTo(x2, topY - 0.5);
      ctx.stroke();

      const phase =
        mode === 'wave'
          ? 0.55 + 0.45 * Math.sin(time * 3.2 - k * 0.52)
          : 0.48 + 0.52 * Math.sin(time * (2.0 + (k % 5) * 0.45) + k * 2.13);

      const bx = midX + swayX;
      const by = topY - 5.2 + swayY * 1.1;
      const col = GARLAND_COLORS[k % GARLAND_COLORS.length];

      ctx.save();
      ctx.globalAlpha = 0.28 * phase;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(bx, by, 8.5 + phase * 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.65 + 0.35 * phase;
      ctx.beginPath();
      ctx.arc(bx, by, 3.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSnowmen(sim: SnowSimulation): void {
    const ctx = this.ctx;
    const sorted = [...sim.snowballs].sort((a, b) => a.stackLevel - b.stackLevel);
    for (const ball of sorted) {
      const pos = sim.resolvedPosition(ball);
      this.drawBall(pos.x, pos.y, ball.radius);

      if (ball.stackLevel === 1) {
        ctx.strokeStyle = 'rgba(92, 56, 31, 0.95)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(pos.x - ball.radius * 0.78, pos.y + ball.radius * 0.15);
        ctx.lineTo(pos.x - ball.radius * 1.65, pos.y + ball.radius * 0.55);
        ctx.moveTo(pos.x + ball.radius * 0.78, pos.y + ball.radius * 0.15);
        ctx.lineTo(pos.x + ball.radius * 1.65, pos.y + ball.radius * 0.55);
        ctx.stroke();

        ctx.fillStyle = 'rgba(224, 41, 46, 0.96)';
        ctx.fillRect(
          pos.x - ball.radius * 0.74,
          pos.y + ball.radius * 0.52,
          ball.radius * 1.48,
          Math.max(3.6, ball.radius * 0.28)
        );
      }

      if (ball.hasFace) {
        ctx.fillStyle = '#1a1e26';
        ctx.beginPath();
        ctx.arc(pos.x - ball.radius * 0.34, pos.y + ball.radius * 0.26, 1.8, 0, Math.PI * 2);
        ctx.arc(pos.x + ball.radius * 0.34, pos.y + ball.radius * 0.26, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgb(250, 117, 26)';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y + 2.2);
        ctx.lineTo(pos.x + ball.radius * 0.78, pos.y - 0.5);
        ctx.lineTo(pos.x, pos.y - 2.6);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (sim.rollingBall) {
      this.drawBall(sim.rollingBall.x, sim.rollingBall.y, sim.rollingBall.radius);
    }
  }

  private drawBall(cx: number, cy: number, r: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy + r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c8daf0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFlakes(list: Snowflake[]): void {
    const ctx = this.ctx;
    for (const f of list) {
      ctx.fillStyle = `rgba(248, 252, 255, ${f.alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * (f.isClump ? 1.15 : 1.0), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSnowplow(sim: SnowSimulation): void {
    if (!this.plowCanvas) return;
    const plow = sim.plow;
    if (plow.alpha <= 0.01) return;

    const ctx = this.ctx;
    const engineBob = plow.isAirborne ? 0 : Math.abs(Math.sin(sim.time * 11.5)) * 1.5;
    const pivotX = plow.x;
    const pivotY = plow.worldY + engineBob - 1.0;

    const dir = plow.direction >= 0 ? 1 : -1;
    const sq = plow.squash;
    const scaleY = Math.max(0.76, 1 - sq * 0.16);
    const scaleX = Math.min(1.18, 1 + sq * 0.11);

    ctx.save();
    ctx.globalAlpha = plow.alpha;
    ctx.translate(pivotX, pivotY);
    ctx.rotate(plow.pitch * dir);
    // Undo bottom-up Y flip when drawing Canvas2D sprite
    ctx.scale(dir * scaleX, -scaleY);
    ctx.drawImage(
      this.plowCanvas,
      -56,
      -this.plowSizePt.height,
      this.plowSizePt.width,
      this.plowSizePt.height
    );
    ctx.restore();
  }
}
