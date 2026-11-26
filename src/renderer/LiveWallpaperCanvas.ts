interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

interface SmokePuff {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/**
 * Port of LiveWallpaperView.swift ("Живые обои: Зимний домик").
 * Uses bottom-up transform so all coordinates match the original Cocoa drawing 1:1.
 */
export class LiveWallpaperCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private time = 0;
  private stars: Star[] = [];
  private smokePuffs: SmokePuff[] = [];
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for LiveWallpaper');
    this.ctx = ctx;

    for (let i = 0; i < 75; i++) {
      this.stars.push({
        x: Math.random(),
        y: 0.42 + Math.random() * 0.56,
        r: 0.8 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2
      });
    }
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

  tickAndDraw(dt: number, paused: boolean): void {
    if (!paused) {
      this.time += dt;
      const w = this.cssWidth;
      const h = this.cssHeight;
      if (Math.floor(this.time * 30) % 10 === 0 && this.smokePuffs.length < 22) {
        const cabinX = w < 520 ? w * 0.66 : w * 0.72;
        const chimneyX = cabinX + 46;
        const chimneyY = h * 0.20 + 132;
        this.smokePuffs.push({ x: chimneyX, y: chimneyY, r: 7, alpha: 0.48 });
      }
      const next: SmokePuff[] = [];
      for (const p of this.smokePuffs) {
        p.y += 22 * dt;
        p.x += (10 + Math.sin(this.time * 1.5 + p.y * 0.03) * 8) * dt;
        p.r += 7.5 * dt;
        p.alpha -= 0.08 * dt;
        if (p.alpha > 0.02) next.push(p);
      }
      this.smokePuffs = next;
    }

    this.draw();
  }

  draw(): void {
    const ctx = this.ctx;
    const w = this.cssWidth;
    const h = this.cssHeight;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Flip Y to bottom-up coordinates like LiveWallpaperView.swift
    ctx.translate(0, h);
    ctx.scale(1, -1);

    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgb(10, 20, 46)');
    grad.addColorStop(0.55, 'rgb(26, 46, 87)');
    grad.addColorStop(1, 'rgb(46, 74, 117)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (const s of this.stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 1.8 + s.phase));
      ctx.fillStyle = `rgba(240, 247, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const moonX = w * 0.22;
    const moonY = h * 0.78;
    ctx.fillStyle = 'rgba(242, 247, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(250, 245, 219, 0.95)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
    ctx.fill();

    // Distant snowy hill
    ctx.fillStyle = 'rgb(41, 64, 99)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h * 0.28);
    ctx.quadraticCurveTo(w * 0.28, h * 0.38, w * 0.55, h * 0.25);
    ctx.quadraticCurveTo(w * 0.80, h * 0.19, w, h * 0.30);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();

    const treeXs = [0.06, 0.12, 0.19, 0.26, 0.35, 0.44, 0.54, 0.86, 0.93];
    for (let i = 0; i < treeXs.length; i++) {
      const cx = w * treeXs[i];
      const baseY = h * (0.20 + (i % 3) * 0.025);
      const treeH = 95 + (i % 4) * 28;
      this.drawPine(cx, baseY, treeH);
    }

    // Foreground snow bank
    ctx.fillStyle = 'rgb(209, 227, 247)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h * 0.20);
    ctx.quadraticCurveTo(w * 0.5, h * 0.26, w, h * 0.21);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();

    for (const p of this.smokePuffs) {
      ctx.fillStyle = `rgba(224, 235, 250, ${p.alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const cabinX = w < 520 ? w * 0.66 : w * 0.72;
    this.drawCabin(cabinX, h * 0.20);

    ctx.restore();
  }

  private drawPine(bx: number, by: number, height: number): void {
    const ctx = this.ctx;
    for (let tier = 0; tier < 3; tier++) {
      const y0 = by + tier * height * 0.26;
      const y1 = y0 + height * 0.45;
      const halfW = height * 0.28 * (1.0 - tier * 0.22);

      ctx.fillStyle = 'rgb(23, 46, 61)';
      ctx.beginPath();
      ctx.moveTo(bx, y1);
      ctx.lineTo(bx - halfW, y0);
      ctx.lineTo(bx + halfW, y0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(214, 232, 250, 0.9)';
      ctx.beginPath();
      ctx.moveTo(bx, y1);
      ctx.lineTo(bx - halfW * 0.42, y1 - (y1 - y0) * 0.36);
      ctx.lineTo(bx + halfW * 0.42, y1 - (y1 - y0) * 0.36);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawCabin(ox: number, oy: number): void {
    const ctx = this.ctx;

    // Chimney
    ctx.fillStyle = 'rgb(92, 61, 56)';
    ctx.fillRect(ox + 36, oy + 84, 20, 48);

    // Cabin walls
    ctx.fillStyle = 'rgb(77, 48, 36)';
    ctx.fillRect(ox - 68, oy, 136, 76);

    const glowPulse = 0.88 + 0.12 * Math.sin(this.time * 2.1);
    const winRects = [
      { x: ox - 48, y: oy + 24, w: 32, h: 30 },
      { x: ox + 16, y: oy + 24, w: 32, h: 30 }
    ];
    for (const wr of winRects) {
      ctx.fillStyle = `rgba(255, 184, 66, ${(0.18 * glowPulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(
        wr.x + wr.w * 0.5,
        wr.y + wr.h * 0.5,
        wr.w * 0.5 + 24,
        wr.h * 0.5 + 22,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = `rgba(255, 209, 102, ${(0.96 * glowPulse).toFixed(3)})`;
      ctx.fillRect(wr.x, wr.y, wr.w, wr.h);

      ctx.strokeStyle = 'rgb(71, 41, 26)';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(wr.x, wr.y, wr.w, wr.h);
      ctx.beginPath();
      ctx.moveTo(wr.x + wr.w * 0.5, wr.y);
      ctx.lineTo(wr.x + wr.w * 0.5, wr.y + wr.h);
      ctx.moveTo(wr.x, wr.y + wr.h * 0.5);
      ctx.lineTo(wr.x + wr.w, wr.y + wr.h * 0.5);
      ctx.stroke();
    }

    // Snowy roof
    ctx.fillStyle = 'rgb(235, 245, 255)';
    ctx.beginPath();
    ctx.moveTo(ox - 86, oy + 72);
    ctx.lineTo(ox, oy + 132);
    ctx.lineTo(ox + 86, oy + 72);
    ctx.closePath();
    ctx.fill();

    // Cabin garland lights
    const colors = [
      [255, 82, 71],
      [255, 209, 64],
      [77, 224, 128],
      [89, 189, 255]
    ];
    for (let i = 0; i < 11; i++) {
      const bx = ox - 75 + i * 15;
      const by = oy + 71;
      const brightness = 0.5 + 0.5 * Math.sin(this.time * 3.5 - i * 0.6);
      const [r, g, b] = colors[i % colors.length];
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.45 + 0.55 * brightness).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
