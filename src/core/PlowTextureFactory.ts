import type { PlowStyle } from './types';

export interface PlowSpriteResult {
  canvas: HTMLCanvasElement;
  widthPt: number;
  heightPt: number;
}

/**
 * Generates high-DPI procedural snowplow sprites matching PlowTextureFactory.swift.
 * Note: Canvas2D Y-axis points downward, while CoreGraphics in macOS pointed upward,
 * so we apply a vertical flip transform `translate(56, 84 - 2); scale(1, -1)` so the
 * exact drawing coordinates from PlowTextureFactory.swift render upright!
 */
export async function makePlowSprite(
  style: PlowStyle,
  customDataUrl: string | null
): Promise<PlowSpriteResult> {
  const widthPt = 150;
  const heightPt = 84;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = widthPt * scale;
  canvas.height = heightPt * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { canvas, widthPt, heightPt };
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  // Flip Y to match CoreGraphics bottom-up coordinates used in PlowTextureFactory.swift
  ctx.translate(56, heightPt - 2);
  ctx.scale(1, -1);

  switch (style) {
    case 'tractor':
      drawTractor(ctx, false);
      break;
    case 'retroTractor':
      drawTractor(ctx, true);
      break;
    case 'snowmobile':
      drawSnowmobile(ctx);
      break;
    case 'penguin':
      drawPenguin(ctx);
      break;
    case 'custom':
      if (customDataUrl) {
        try {
          const img = await loadCustomImage(customDataUrl);
          drawCustom(ctx, img);
        } catch {
          drawTractor(ctx, false);
        }
      } else {
        drawTractor(ctx, false);
      }
      break;
  }

  ctx.restore();
  return { canvas, widthPt, heightPt };
}

function loadCustomImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fillEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTractor(ctx: CanvasRenderingContext2D, retro: boolean): void {
  const bodyColor = retro ? 'rgba(36, 148, 163, 1)' : 'rgba(230, 56, 51, 1)';
  const accentColor = retro ? 'rgba(245, 199, 66, 1)' : 'rgba(252, 199, 41, 1)';

  // Headlight beam
  ctx.fillStyle = 'rgba(255, 242, 166, 0.26)';
  ctx.beginPath();
  ctx.moveTo(24, 26);
  ctx.lineTo(90, 42);
  ctx.lineTo(90, 2);
  ctx.closePath();
  ctx.fill();

  // Exhaust pipe
  ctx.fillStyle = 'rgba(56, 61, 71, 1)';
  ctx.fillRect(14, 34, 5, 18);

  // Cabin
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-36, 20, 32, 32);
  ctx.fillStyle = 'rgba(204, 237, 255, 0.95)';
  ctx.fillRect(-30, 30, 20, 16);
  ctx.fillStyle = accentColor;
  ctx.fillRect(-40, 51, 40, 5);

  // Hood
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-6, 16, 34, 22);

  // Plow blade
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(28, 14);
  ctx.lineTo(42, 1);
  ctx.quadraticCurveTo(34, 16, 52, 27);
  ctx.lineTo(44, 29);
  ctx.quadraticCurveTo(30, 16, 34, 8);
  ctx.closePath();
  ctx.fill();

  drawWheel(ctx, -22, 15, 15);
  drawWheel(ctx, 16, 10, 10);
}

function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.fillStyle = 'rgba(36, 38, 46, 1)';
  fillEllipse(ctx, cx - radius, cy - radius, radius * 2, radius * 2);
  const rimR = radius * 0.52;
  ctx.fillStyle = 'rgba(245, 199, 61, 1)';
  fillEllipse(ctx, cx - rimR, cy - rimR, rimR * 2, rimR * 2);
  const hubR = radius * 0.2;
  ctx.fillStyle = 'rgba(56, 56, 64, 1)';
  fillEllipse(ctx, cx - hubR, cy - hubR, hubR * 2, hubR * 2);
}

function drawSnowmobile(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(41, 46, 56, 1)';
  ctx.fillRect(-36, 2, 42, 11);

  ctx.strokeStyle = 'rgba(56, 61, 71, 1)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(10, 3);
  ctx.lineTo(42, 3);
  ctx.lineTo(50, 11);
  ctx.stroke();

  ctx.fillStyle = 'rgba(36, 138, 242, 1)';
  ctx.beginPath();
  ctx.moveTo(-34, 13);
  ctx.lineTo(34, 13);
  ctx.lineTo(20, 31);
  ctx.lineTo(-26, 25);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(214, 245, 255, 0.90)';
  ctx.beginPath();
  ctx.moveTo(8, 29);
  ctx.lineTo(20, 41);
  ctx.lineTo(14, 41);
  ctx.lineTo(2, 29);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(250, 194, 46, 1)';
  ctx.fillRect(42, 2, 9, 24);
}

function drawPenguin(ctx: CanvasRenderingContext2D): void {
  // Feet
  ctx.fillStyle = 'rgba(250, 143, 31, 1)';
  fillEllipse(ctx, -10, 0, 12, 6);
  fillEllipse(ctx, 2, 0, 12, 6);

  // Body
  ctx.fillStyle = 'rgba(36, 41, 56, 1)';
  fillEllipse(ctx, -16, 4, 32, 42);
  ctx.fillStyle = 'rgba(250, 250, 255, 1)';
  fillEllipse(ctx, -8, 8, 20, 30);

  // Scarf
  ctx.fillStyle = 'rgba(230, 51, 56, 1)';
  ctx.fillRect(-13, 31, 26, 6);

  // Eye
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
  fillEllipse(ctx, 4, 37, 6, 6);
  ctx.fillStyle = 'rgba(26, 26, 26, 1)';
  fillEllipse(ctx, 6.5, 39, 3, 3);

  // Beak
  ctx.fillStyle = 'rgba(250, 143, 31, 1)';
  ctx.beginPath();
  ctx.moveTo(13, 38);
  ctx.lineTo(23, 35);
  ctx.lineTo(13, 32);
  ctx.closePath();
  ctx.fill();

  // Shovel handle & blade
  ctx.strokeStyle = 'rgba(148, 92, 41, 1)';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.moveTo(6, 24);
  ctx.lineTo(38, 10);
  ctx.stroke();

  ctx.fillStyle = 'rgba(230, 56, 51, 1)';
  ctx.fillRect(36, 2, 14, 22);
}

function drawCustom(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const maxDim = 70;
  const aspect = img.width / Math.max(1, img.height);
  const drawW = aspect >= 1 ? maxDim : maxDim * aspect;
  const drawH = aspect >= 1 ? maxDim / aspect : maxDim;

  // Undo Y-flip locally so the uploaded photo isn't drawn upside down!
  ctx.save();
  ctx.translate(0, 2 + drawH * 0.5);
  ctx.scale(1, -1);
  ctx.drawImage(img, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
  ctx.restore();

  ctx.fillStyle = 'rgba(250, 199, 46, 0.96)';
  ctx.fillRect(drawW * 0.5 + 3, 2, 10, 28);
}
