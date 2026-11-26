/**
 * Cross-platform client-side foreground extraction (replaces macOS VisionHelper).
 * Preserves existing transparency if present; otherwise removes uniform/edge-connected
 * backgrounds via border flood-fill with soft alpha feathering and crops to bounds.
 */
export async function removeBackgroundAndCrop(fileOrUrl: File | string): Promise<string> {
  const img = await loadImage(fileOrUrl);
  const maxSrc = 320;
  const scale = Math.min(1, maxSrc / Math.max(1, img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;

  let alreadyTransparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 20) alreadyTransparent++;
  }

  // Only run background flood-fill if the image doesn't already have cutout transparency
  if (alreadyTransparent / totalPixels < 0.08) {
    removeBorderBackground(data, w, h);
    ctx.putImageData(imgData, 0, 0);
  }

  return cropToAlphaBounds(canvas, data, w, h);
}

function loadImage(fileOrUrl: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let revokeUrl: string | null = null;
    img.onload = () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      reject(err);
    };
    if (typeof fileOrUrl === 'string') {
      img.src = fileOrUrl;
    } else {
      revokeUrl = URL.createObjectURL(fileOrUrl);
      img.src = revokeUrl;
    }
  });
}

function removeBorderBackground(data: Uint8ClampedArray, w: number, h: number): void {
  // Sample edge colors (top, bottom, left, right)
  const samples: Array<[number, number, number]> = [];
  const stepX = Math.max(1, Math.floor(w / 12));
  const stepY = Math.max(1, Math.floor(h / 12));

  const addSample = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    if (data[idx + 3] > 200) {
      samples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  };

  for (let x = 0; x < w; x += stepX) {
    addSample(x, 0);
    addSample(x, h - 1);
  }
  for (let y = 0; y < h; y += stepY) {
    addSample(0, y);
    addSample(w - 1, y);
  }
  if (samples.length === 0) return;

  // Find dominant border color (median-like closest cluster to corners)
  const cornerIdx = [0, (w - 1) * 4, ((h - 1) * w) * 4, (h * w - 1) * 4];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const idx of cornerIdx) {
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  }
  bgR /= cornerIdx.length;
  bgG /= cornerIdx.length;
  bgB /= cornerIdx.length;

  const hardThresh = 46;
  const softThresh = 74;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const colorDist = (pIdx: number): number => {
    const off = pIdx * 4;
    const dr = data[off] - bgR;
    const dg = data[off + 1] - bgG;
    const db = data[off + 2] - bgB;
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.73;
  };

  const tryEnqueue = (x: number, y: number) => {
    const p = y * w + x;
    if (visited[p]) return;
    if (colorDist(p) <= softThresh) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryEnqueue(0, y);
    tryEnqueue(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const dist = colorDist(p);
    const off = p * 4;
    if (dist <= hardThresh) {
      data[off + 3] = 0;
    } else {
      const t = (dist - hardThresh) / (softThresh - hardThresh);
      data[off + 3] = Math.round(data[off + 3] * Math.min(1, Math.max(0, t)));
    }

    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) tryEnqueue(x - 1, y);
    if (x < w - 1) tryEnqueue(x + 1, y);
    if (y > 0) tryEnqueue(x, y - 1);
    if (y < h - 1) tryEnqueue(x, y + 1);
  }
}

function cropToAlphaBounds(
  srcCanvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  w: number,
  h: number
): string {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 18) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return srcCanvas.toDataURL('image/png');
  }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const outCtx = out.getContext('2d');
  if (!outCtx) return srcCanvas.toDataURL('image/png');
  outCtx.drawImage(srcCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out.toDataURL('image/png');
}
