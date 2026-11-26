import { makePlowSprite } from '../core/PlowTextureFactory';
import {
  isWindowSurfaceKey,
  type AppSettings,
  type PlowStyle
} from '../core/types';
import { SnowSimulation, SnowSurface, type Snowflake } from '../core/SnowSimulation';

const SOLID_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aColor;
uniform vec2 uViewportSize;
out vec4 vColor;
void main() {
  vec2 ndc = (aPos / uViewportSize) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vColor = aColor;
}
`;

const SOLID_FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() {
  float a = vColor.a;
  fragColor = vec4(vColor.rgb * a, a);
}
`;

const DRIFT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec2 aLocalPos;
layout(location = 3) in vec2 aMeta;
uniform vec2 uViewportSize;
out vec2 vUv;
out vec2 vLocalPos;
out vec2 vMeta;
void main() {
  vec2 ndc = (aPos / uViewportSize) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = aUv;
  vLocalPos = aLocalPos;
  vMeta = aMeta;
}
`;

const DRIFT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vLocalPos;
in vec2 vMeta;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float thickness = max(1.0, vMeta.x);
  float v = vUv.y;
  float edgeMask = vUv.x;

  float nSoft = valueNoise(vLocalPos * 0.22);
  float nFine = valueNoise(vLocalPos * 0.65);
  float sparkle = step(0.965, hash21(floor(vLocalPos * 0.85)));

  float distTopPx = (1.0 - v) * thickness;
  float distBotPx = v * thickness;

  float topAlpha = smoothstep(0.0, 1.7 + nSoft * 0.9, distTopPx + (nFine - 0.5) * 0.8);
  float botAlpha = smoothstep(0.0, 1.8, distBotPx + nSoft * 0.45);
  float alpha = topAlpha * botAlpha * smoothstep(0.0, 0.9, edgeMask) * 0.97;
  if (alpha < 0.01) discard;

  vec3 shadowSnow = vec3(0.76, 0.85, 0.96);
  vec3 midSnow    = vec3(0.93, 0.965, 1.0);
  vec3 crestSnow  = vec3(1.0, 1.0, 1.0);

  float shadeT = smoothstep(0.05, 0.82, v + (nSoft - 0.5) * 0.20);
  vec3 col = mix(shadowSnow, midSnow, smoothstep(0.0, 0.55, shadeT));
  col = mix(col, crestSnow, smoothstep(0.45, 0.95, shadeT));

  col += (nFine - 0.5) * 0.035;
  col = mix(col, vec3(1.0, 1.0, 1.0), sparkle * 0.35 * smoothstep(0.3, 0.9, v));
  col = clamp(col, 0.0, 1.0);

  fragColor = vec4(col * alpha, alpha);
}
`;

const CIRCLE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aParams;
uniform vec2 uViewportSize;
out vec2 vUv;
out vec4 vColor;
out vec2 vParams;
void main() {
  vec2 ndc = (aPos / uViewportSize) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = aUv;
  vColor = aColor;
  vParams = aParams;
}
`;

const CIRCLE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in vec2 vParams;
out vec4 fragColor;

void main() {
  float d = length(vUv);
  if (d > 1.0) discard;

  float mode = vParams.y;
  if (mode > 2.5) {
    float seed = vParams.x;
    float ang = atan(vUv.y, vUv.x);
    float wobble = 0.14 * sin(ang * 3.0 + seed) + 0.09 * cos(ang * 5.0 - seed * 1.7);
    float rEdge = 0.86 + wobble;
    float edge = 1.0 - smoothstep(rEdge - 0.32, rEdge + 0.06, d);
    if (edge < 0.01) discard;

    float light = clamp(0.62 + 0.45 * (vUv.y * 0.8 - vUv.x * 0.35), 0.0, 1.0);
    vec3 col = mix(vec3(0.80, 0.88, 0.98), vec3(1.0, 1.0, 1.0), light);
    float a = vColor.a * edge;
    fragColor = vec4(col * a, a);
  } else if (mode > 1.5) {
    float edge = 1.0 - smoothstep(0.86, 1.0, d);
    vec2 lightDir = normalize(vec2(-0.45, 0.55));
    float z = sqrt(max(0.0, 1.0 - d * d));
    vec3 n = normalize(vec3(vUv.x, vUv.y, z));
    float diff = clamp(dot(n, normalize(vec3(lightDir, 0.72))), 0.0, 1.0);
    vec3 shade = mix(vec3(0.76, 0.85, 0.96), vec3(1.0, 1.0, 1.0), 0.38 + 0.62 * diff);
    float a = vColor.a * edge;
    fragColor = vec4(shade * a, a);
  } else if (mode > 0.5) {
    float glow = exp(-d * d * 4.2) * (1.0 - smoothstep(0.7, 1.0, d));
    float a = vColor.a * glow;
    fragColor = vec4(vColor.rgb * a, a * 0.75);
  } else {
    float soft = max(0.12, vParams.x);
    float edge = 1.0 - smoothstep(1.0 - soft, 1.0, d);
    float a = vColor.a * edge;
    fragColor = vec4(vColor.rgb * a, a);
  }
}
`;

const TEX_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in float aAlpha;
uniform vec2 uViewportSize;
out vec2 vUv;
out float vAlpha;
void main() {
  vec2 ndc = (aPos / uViewportSize) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = aUv;
  vAlpha = aAlpha;
}
`;

const TEX_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vAlpha;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUv);
  fragColor = c * vAlpha;
}
`;

const GARLAND_COLORS: Array<[number, number, number]> = [
  [1.0, 0.3, 0.26],
  [1.0, 0.8, 0.22],
  [0.24, 0.88, 0.48],
  [0.32, 0.74, 1.0],
  [1.0, 0.56, 0.18]
];

interface Pipeline {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  uViewport: WebGLUniformLocation | null;
  uTex?: WebGLUniformLocation | null;
}

class FloatStream {
  data = new Float32Array(16384);
  len = 0;

  reset(): void {
    this.len = 0;
  }

  private ensure(extra: number): void {
    const needed = this.len + extra;
    if (needed <= this.data.length) return;
    let nextCap = this.data.length * 2;
    while (nextCap < needed) nextCap *= 2;
    const next = new Float32Array(nextCap);
    next.set(this.data.subarray(0, this.len));
    this.data = next;
  }

  push6(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ensure(6);
    const i = this.len;
    this.data[i] = a;
    this.data[i + 1] = b;
    this.data[i + 2] = c;
    this.data[i + 3] = d;
    this.data[i + 4] = e;
    this.data[i + 5] = f;
    this.len = i + 6;
  }

  push8(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number
  ): void {
    this.ensure(8);
    const i = this.len;
    this.data[i] = a;
    this.data[i + 1] = b;
    this.data[i + 2] = c;
    this.data[i + 3] = d;
    this.data[i + 4] = e;
    this.data[i + 5] = f;
    this.data[i + 6] = g;
    this.data[i + 7] = h;
    this.len = i + 8;
  }

  push10(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    j: number,
    k: number
  ): void {
    this.ensure(10);
    const i = this.len;
    this.data[i] = a;
    this.data[i + 1] = b;
    this.data[i + 2] = c;
    this.data[i + 3] = d;
    this.data[i + 4] = e;
    this.data[i + 5] = f;
    this.data[i + 6] = g;
    this.data[i + 7] = h;
    this.data[i + 8] = j;
    this.data[i + 9] = k;
    this.len = i + 10;
  }

  push5(a: number, b: number, c: number, d: number, e: number): void {
    this.ensure(5);
    const i = this.len;
    this.data[i] = a;
    this.data[i + 1] = b;
    this.data[i + 2] = c;
    this.data[i + 3] = d;
    this.data[i + 4] = e;
    this.len = i + 5;
  }

  view(): Float32Array {
    return this.data.subarray(0, this.len);
  }
}

export class WebGLSnowRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;

  private solidPipe!: Pipeline;
  private driftPipe!: Pipeline;
  private circlePipe!: Pipeline;
  private texPipe!: Pipeline;

  private solidVerts = new FloatStream();
  private driftVerts = new FloatStream();
  private circleVerts = new FloatStream();
  private texVerts = new FloatStream();
  private smoothedHeights: number[] = [];

  private plowTexture: WebGLTexture | null = null;
  private plowSizePt = { width: 150, height: 84 };
  private cachedPlowStyle: PlowStyle | null = null;
  private cachedCustomVersion = -1;
  private plowLoading = false;

  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      throw new Error('WebGL2 не поддерживается этим браузером или устройством');
    }
    this.gl = gl;
    this.initGL();
    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${log}`);
    }
    return shader;
  }

  private createProgram(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      throw new Error(`Program link error: ${log}`);
    }
    return prog;
  }

  private createPipeline(
    vsSrc: string,
    fsSrc: string,
    attribs: Array<{ loc: number; size: number; offsetFloats: number }>,
    strideFloats: number
  ): Pipeline {
    const gl = this.gl;
    const program = this.createProgram(vsSrc, fsSrc);
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const strideBytes = strideFloats * 4;
    for (const a of attribs) {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, strideBytes, a.offsetFloats * 4);
    }
    gl.bindVertexArray(null);
    return {
      program,
      vao,
      vbo,
      uViewport: gl.getUniformLocation(program, 'uViewportSize'),
      uTex: gl.getUniformLocation(program, 'uTex')
    };
  }

  private initGL(): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    this.solidPipe = this.createPipeline(
      SOLID_VS,
      SOLID_FS,
      [
        { loc: 0, size: 2, offsetFloats: 0 },
        { loc: 1, size: 4, offsetFloats: 2 }
      ],
      6
    );

    this.driftPipe = this.createPipeline(
      DRIFT_VS,
      DRIFT_FS,
      [
        { loc: 0, size: 2, offsetFloats: 0 },
        { loc: 1, size: 2, offsetFloats: 2 },
        { loc: 2, size: 2, offsetFloats: 4 },
        { loc: 3, size: 2, offsetFloats: 6 }
      ],
      8
    );

    this.circlePipe = this.createPipeline(
      CIRCLE_VS,
      CIRCLE_FS,
      [
        { loc: 0, size: 2, offsetFloats: 0 },
        { loc: 1, size: 2, offsetFloats: 2 },
        { loc: 2, size: 4, offsetFloats: 4 },
        { loc: 3, size: 2, offsetFloats: 8 }
      ],
      10
    );

    this.texPipe = this.createPipeline(
      TEX_VS,
      TEX_FS,
      [
        { loc: 0, size: 2, offsetFloats: 0 },
        { loc: 1, size: 2, offsetFloats: 2 },
        { loc: 2, size: 1, offsetFloats: 4 }
      ],
      5
    );
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    const pxW = Math.max(1, Math.round(this.cssWidth * dpr));
    const pxH = Math.max(1, Math.round(this.cssHeight * dpr));
    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
    }
    this.gl.viewport(0, 0, pxW, pxH);
  }

  render(sim: SnowSimulation, settings: AppSettings): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (settings.isPaused || sim.isFullscreenHidden) return;

    this.solidVerts.reset();
    this.driftVerts.reset();
    this.circleVerts.reset();
    this.texVerts.reset();

    this.buildSceneGeometry(sim, settings);

    const vw = this.cssWidth;
    const vh = this.cssHeight;

    if (this.solidVerts.len > 0) {
      this.drawStream(this.solidPipe, this.solidVerts.view(), 6, vw, vh);
    }
    if (this.driftVerts.len > 0) {
      this.drawStream(this.driftPipe, this.driftVerts.view(), 8, vw, vh);
    }
    if (this.circleVerts.len > 0) {
      this.drawStream(this.circlePipe, this.circleVerts.view(), 10, vw, vh);
    }
    if (this.texVerts.len > 0 && this.plowTexture) {
      gl.useProgram(this.texPipe.program);
      gl.uniform2f(this.texPipe.uViewport, vw, vh);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.plowTexture);
      if (this.texPipe.uTex) gl.uniform1i(this.texPipe.uTex, 0);
      gl.bindVertexArray(this.texPipe.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texPipe.vbo);
      const view = this.texVerts.view();
      gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, view.length / 5);
      gl.bindVertexArray(null);
    }
  }

  private drawStream(
    pipe: Pipeline,
    view: Float32Array,
    floatsPerVertex: number,
    vw: number,
    vh: number
  ): void {
    const gl = this.gl;
    gl.useProgram(pipe.program);
    gl.uniform2f(pipe.uViewport, vw, vh);
    gl.bindVertexArray(pipe.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pipe.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, view.length / floatsPerVertex);
    gl.bindVertexArray(null);
  }

  private buildSceneGeometry(sim: SnowSimulation, settings: AppSettings): void {
    for (const key of sim.orderedSurfaceKeys) {
      const surf = sim.surfaces.get(key);
      if (!surf) continue;
      if (isWindowSurfaceKey(key) && settings.garlandMode !== 'off') {
        this.appendGarland(surf, sim.time, settings.garlandMode);
      }
      this.appendSnowdrift(surf);
    }

    this.appendSnowmen(sim);
    this.appendFlakes(sim.flakes);
    this.appendFlakes(sim.looseSnow);

    if (sim.plow.active) {
      this.ensurePlowTexture(settings);
      this.appendSnowplowQuad(sim);
    }
  }

  private ensurePlowTexture(settings: AppSettings): void {
    const needsRebuild =
      this.cachedPlowStyle !== settings.plowStyle ||
      (settings.plowStyle === 'custom' && this.cachedCustomVersion !== settings.customPlowVersion);
    if (!needsRebuild || this.plowLoading) return;

    this.plowLoading = true;
    const targetStyle = settings.plowStyle;
    const targetVersion = settings.customPlowVersion;
    const customUrl = settings.customPlowDataUrl;

    makePlowSprite(targetStyle, customUrl)
      .then((res) => {
        const gl = this.gl;
        if (!this.plowTexture) {
          this.plowTexture = gl.createTexture();
        }
        gl.bindTexture(gl.TEXTURE_2D, this.plowTexture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, res.canvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

        this.plowSizePt = { width: res.widthPt, height: res.heightPt };
        this.cachedPlowStyle = targetStyle;
        this.cachedCustomVersion = targetVersion;
      })
      .finally(() => {
        this.plowLoading = false;
      });
  }

  private appendSnowdrift(surf: SnowSurface): void {
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

      for (let b = start; b <= end; b++) {
        const hCur = this.smoothedHeights[b];
        const hPrev = b > start ? this.smoothedHeights[b - 1] : 0.0;
        const hNext = b < end ? this.smoothedHeights[b + 1] : 0.0;

        const yL = b === start ? 0.0 : (hPrev + hCur) * 0.5;
        const yR = b === end ? 0.0 : (hCur + hNext) * 0.5;

        const lipL = isWindowSurf ? Math.min(2.6, yL * 0.20) : 0.0;
        const lipR = isWindowSurf ? Math.min(2.6, yR * 0.20) : 0.0;

        const thickL = Math.max(1.0, yL + lipL);
        const thickR = Math.max(1.0, yR + lipR);

        const edgeL = b === start ? 0.15 : 1.0;
        const edgeR = b === end ? 0.15 : 1.0;

        const xL = effMinX + b * bw;
        const xR = xL + bw;
        const localXL = b * bw;
        const localXR = localXL + bw;

        const botYL = topEdgeY - lipL;
        const botYR = topEdgeY - lipR;
        const topYL = topEdgeY + yL;
        const topYR = topEdgeY + yR;

        if (isWindowSurf && (yL > 1.5 || yR > 1.5)) {
          this.solidVerts.push6(xL, botYL - 2.6, 0.10, 0.16, 0.26, 0.0);
          this.solidVerts.push6(xR, botYR - 2.6, 0.10, 0.16, 0.26, 0.0);
          this.solidVerts.push6(xL, botYL + 0.6, 0.10, 0.16, 0.26, 0.26);
          this.solidVerts.push6(xR, botYR - 2.6, 0.10, 0.16, 0.26, 0.0);
          this.solidVerts.push6(xR, botYR + 0.6, 0.10, 0.16, 0.26, 0.26);
          this.solidVerts.push6(xL, botYL + 0.6, 0.10, 0.16, 0.26, 0.26);
        }

        // Triangle 1: BL, BR, TL
        this.driftVerts.push8(xL, botYL, edgeL, 0.0, localXL, -lipL, thickL, 0);
        this.driftVerts.push8(xR, botYR, edgeR, 0.0, localXR, -lipR, thickR, 0);
        this.driftVerts.push8(xL, topYL, edgeL, 1.0, localXL, yL, thickL, 0);
        // Triangle 2: BR, TR, TL
        this.driftVerts.push8(xR, botYR, edgeR, 0.0, localXR, -lipR, thickR, 0);
        this.driftVerts.push8(xR, topYR, edgeR, 1.0, localXR, yR, thickR, 0);
        this.driftVerts.push8(xL, topYL, edgeL, 1.0, localXL, yL, thickL, 0);
      }
    }
  }

  private appendGarland(surf: SnowSurface, time: number, mode: 'twinkle' | 'wave'): void {
    const spacing = 26.0;
    const spanW = surf.effectiveWidth;
    const count = Math.floor(spanW / spacing);
    if (count < 3) return;

    const topY = surf.topY;
    const swayX = surf.garlandSwayX;
    const swayY = surf.garlandSwayY;

    for (let k = 0; k < count; k++) {
      const x1 = surf.effectiveMinX + k * spacing;
      const x2 = Math.min(surf.effectiveMaxX, x1 + spacing);
      const midX = (x1 + x2) * 0.5;
      const midBin = surf.binIndex(midX);
      if (midBin === null || surf.garlandOccluded[midBin]) continue;

      const p0x = x1;
      const p0y = topY - 0.5;
      const p1x = midX + swayX * 0.85;
      const p1y = topY - 4.2 + swayY;
      const p2x = x2;
      const p2y = topY - 0.5;

      this.appendLineSegment(p0x, p0y, p1x, p1y, 0.75, 0.12, 0.24, 0.16, 0.72);
      this.appendLineSegment(p1x, p1y, p2x, p2y, 0.75, 0.12, 0.24, 0.16, 0.72);

      let phase = 0;
      if (mode === 'wave') {
        phase = 0.55 + 0.45 * Math.sin(time * 3.2 - k * 0.52);
      } else {
        const speed = 2.0 + (k % 5) * 0.45;
        phase = 0.48 + 0.52 * Math.sin(time * speed + k * 2.13);
      }

      const rgb = GARLAND_COLORS[k % GARLAND_COLORS.length];
      const bx = midX + swayX;
      const by = topY - 5.2 + swayY * 1.1;

      const glowR = 8.5 + phase * 5.0;
      this.appendCircle(bx, by, glowR, rgb[0], rgb[1], rgb[2], 0.48 * phase, 1.0, 1.0);
      this.appendCircle(bx, by, 3.0, rgb[0], rgb[1], rgb[2], 0.65 + 0.35 * phase, 0.25, 0.0);
      this.appendCircle(bx - 0.4, by + 0.4, 1.35, 1.0, 1.0, 1.0, 0.80 * phase, 0.45, 0.0);
    }
  }

  private appendSnowmen(sim: SnowSimulation): void {
    const sorted = [...sim.snowballs].sort((a, b) => a.stackLevel - b.stackLevel);
    for (const ball of sorted) {
      const pos = sim.resolvedPosition(ball);
      const cx = pos.x;
      const cy = pos.y;
      const r = ball.radius;

      this.appendCircle(cx, cy, r, 1, 1, 1, 0.99, 0.14, 2.0);

      if (ball.stackLevel === 1) {
        this.appendLineSegment(cx - r * 0.78, cy + r * 0.15, cx - r * 1.65, cy + r * 0.55, 1.2, 0.36, 0.22, 0.12, 0.95);
        this.appendLineSegment(cx + r * 0.78, cy + r * 0.15, cx + r * 1.65, cy + r * 0.55, 1.2, 0.36, 0.22, 0.12, 0.95);

        this.appendRect(cx - r * 0.74, cy + r * 0.52, r * 1.48, Math.max(3.6, r * 0.28), 0.88, 0.16, 0.18, 0.96);

        this.appendCircle(cx, cy + r * 0.16, 1.9, 0.12, 0.13, 0.16, 0.98, 0.2, 0);
        this.appendCircle(cx, cy - r * 0.24, 1.9, 0.12, 0.13, 0.16, 0.98, 0.2, 0);
      }

      if (ball.hasFace) {
        const eyeY = cy + r * 0.26;
        const eyeDX = r * 0.34;
        this.appendCircle(cx - eyeDX, eyeY, 1.8, 0.10, 0.12, 0.15, 1.0, 0.2, 0);
        this.appendCircle(cx + eyeDX, eyeY, 1.8, 0.10, 0.12, 0.15, 1.0, 0.2, 0);

        this.solidVerts.push6(cx, cy + 2.2, 0.98, 0.46, 0.10, 1.0);
        this.solidVerts.push6(cx + r * 0.78, cy - 0.5, 0.98, 0.46, 0.10, 1.0);
        this.solidVerts.push6(cx, cy - 2.6, 0.98, 0.46, 0.10, 1.0);
      }
    }

    if (sim.rollingBall) {
      this.appendCircle(sim.rollingBall.x, sim.rollingBall.y, sim.rollingBall.radius, 1, 1, 1, 0.98, 0.14, 2.0);
    }
  }

  private appendFlakes(list: Snowflake[]): void {
    for (const f of list) {
      if (f.isClump) {
        this.appendCircle(f.x, f.y, f.radius * 1.25, 0.98, 0.99, 1.0, f.alpha, f.seed, 3.0);
      } else {
        const softness = f.radius > 2.4 ? 0.52 : 0.42;
        this.appendCircle(f.x, f.y, f.radius * 1.22, 0.97, 0.99, 1.0, f.alpha, softness, 0.0);
      }
    }
  }

  private appendSnowplowQuad(sim: SnowSimulation): void {
    if (!this.plowTexture) return;
    const plow = sim.plow;
    const alpha = plow.alpha;
    if (alpha <= 0.01) return;

    const targetSurf = sim.surfaces.get(plow.targetKey);
    if (targetSurf) {
      const overSpan =
        plow.targetKey === 'screenBottom' ||
        (plow.x >= targetSurf.effectiveMinX - 20 && plow.x <= targetSurf.effectiveMaxX + 20);
      if (overSpan) {
        const alt = Math.max(0.0, plow.worldY - targetSurf.topY);
        const shadowFactor = Math.max(0.0, 1.0 - alt / 160.0);
        if (shadowFactor > 0.04) {
          const sRx = 36.0 * (0.45 + 0.55 * shadowFactor);
          const sRy = 5.0 * (0.55 + 0.45 * shadowFactor);
          this.appendEllipse(
            plow.x,
            targetSurf.topY + 1.0,
            sRx,
            sRy,
            0.06,
            0.10,
            0.18,
            0.34 * shadowFactor * alpha
          );
        }
      }
    }

    const engineBob = plow.isAirborne ? 0.0 : Math.abs(Math.sin(sim.time * 11.5)) * 1.5;
    const pivotX = plow.x;
    const pivotY = plow.worldY + engineBob - 1.0;

    const sq = plow.squash;
    const scaleY = Math.max(0.76, 1.0 - sq * 0.16);
    const scaleX = Math.min(1.18, 1.0 + sq * 0.11);

    const w = this.plowSizePt.width;
    const h = this.plowSizePt.height;
    const anchorX = 56.0;
    const dir = plow.direction >= 0 ? 1.0 : -1.0;

    const localLeft = dir > 0 ? -anchorX : -(w - anchorX);
    const localRight = localLeft + w;
    const localBot = 0.0;
    const localTop = h;

    const u0 = dir > 0 ? 0.0 : 1.0;
    const u1 = dir > 0 ? 1.0 : 0.0;

    const angle = plow.pitch * dir;
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const xform = (lx: number, ly: number): [number, number] => {
      const sx = lx * scaleX;
      const sy = ly * scaleY;
      return [pivotX + sx * c - sy * s, pivotY + sx * s + sy * c];
    };

    const [blX, blY] = xform(localLeft, localBot);
    const [brX, brY] = xform(localRight, localBot);
    const [tlX, tlY] = xform(localLeft, localTop);
    const [trX, trY] = xform(localRight, localTop);

    this.texVerts.push5(blX, blY, u0, 1.0, alpha);
    this.texVerts.push5(brX, brY, u1, 1.0, alpha);
    this.texVerts.push5(tlX, tlY, u0, 0.0, alpha);
    this.texVerts.push5(brX, brY, u1, 1.0, alpha);
    this.texVerts.push5(trX, trY, u1, 0.0, alpha);
    this.texVerts.push5(tlX, tlY, u0, 0.0, alpha);
  }

  private appendCircle(
    cx: number,
    cy: number,
    r: number,
    cr: number,
    cg: number,
    cb: number,
    ca: number,
    softness: number,
    mode: number
  ): void {
    const x0 = cx - r;
    const x1 = cx + r;
    const y0 = cy - r;
    const y1 = cy + r;

    this.circleVerts.push10(x0, y0, -1, -1, cr, cg, cb, ca, softness, mode);
    this.circleVerts.push10(x1, y0, 1, -1, cr, cg, cb, ca, softness, mode);
    this.circleVerts.push10(x0, y1, -1, 1, cr, cg, cb, ca, softness, mode);
    this.circleVerts.push10(x1, y0, 1, -1, cr, cg, cb, ca, softness, mode);
    this.circleVerts.push10(x1, y1, 1, 1, cr, cg, cb, ca, softness, mode);
    this.circleVerts.push10(x0, y1, -1, 1, cr, cg, cb, ca, softness, mode);
  }

  private appendEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    cr: number,
    cg: number,
    cb: number,
    ca: number
  ): void {
    const x0 = cx - rx;
    const x1 = cx + rx;
    const y0 = cy - ry;
    const y1 = cy + ry;

    this.circleVerts.push10(x0, y0, -1, -1, cr, cg, cb, ca, 0.95, 1.0);
    this.circleVerts.push10(x1, y0, 1, -1, cr, cg, cb, ca, 0.95, 1.0);
    this.circleVerts.push10(x0, y1, -1, 1, cr, cg, cb, ca, 0.95, 1.0);
    this.circleVerts.push10(x1, y0, 1, -1, cr, cg, cb, ca, 0.95, 1.0);
    this.circleVerts.push10(x1, y1, 1, 1, cr, cg, cb, ca, 0.95, 1.0);
    this.circleVerts.push10(x0, y1, -1, 1, cr, cg, cb, ca, 0.95, 1.0);
  }

  private appendLineSegment(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    hw: number,
    cr: number,
    cg: number,
    cb: number,
    ca: number
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len <= 0.001) return;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;

    const p0x = ax - nx;
    const p0y = ay - ny;
    const p1x = ax + nx;
    const p1y = ay + ny;
    const p2x = bx - nx;
    const p2y = by - ny;
    const p3x = bx + nx;
    const p3y = by + ny;

    this.solidVerts.push6(p0x, p0y, cr, cg, cb, ca);
    this.solidVerts.push6(p2x, p2y, cr, cg, cb, ca);
    this.solidVerts.push6(p1x, p1y, cr, cg, cb, ca);
    this.solidVerts.push6(p2x, p2y, cr, cg, cb, ca);
    this.solidVerts.push6(p3x, p3y, cr, cg, cb, ca);
    this.solidVerts.push6(p1x, p1y, cr, cg, cb, ca);
  }

  private appendRect(
    x: number,
    y: number,
    w: number,
    h: number,
    cr: number,
    cg: number,
    cb: number,
    ca: number
  ): void {
    this.solidVerts.push6(x, y, cr, cg, cb, ca);
    this.solidVerts.push6(x + w, y, cr, cg, cb, ca);
    this.solidVerts.push6(x, y + h, cr, cg, cb, ca);
    this.solidVerts.push6(x + w, y, cr, cg, cb, ca);
    this.solidVerts.push6(x + w, y + h, cr, cg, cb, ca);
    this.solidVerts.push6(x, y + h, cr, cg, cb, ca);
  }
}
