import { removeBackgroundAndCrop } from '../core/BackgroundRemover';
import { SnowSimulation } from '../core/SnowSimulation';
import {
  PLOW_STYLES,
  type AppSettings,
  type GarlandMode,
  type SnowIntensity,
  type SnowTool,
  type TrackedWindow,
  type WindowSnapshot
} from '../core/types';
import { Canvas2DSnowRenderer } from '../renderer/Canvas2DSnowRenderer';
import { LiveWallpaperCanvas } from '../renderer/LiveWallpaperCanvas';
import { WebGLSnowRenderer } from '../renderer/WebGLSnowRenderer';
import { detectInitialLang, saveLang, STRINGS, type Lang } from './i18n';

const TRIBUTE_PAY_URL = 'https://web.tribute.tg/s/1dXM';
const UNLOCK_STORAGE_KEY = 'snowflake_unlock_code_v1';

interface DownloadLinks {
  macPkg: string;
  macDmg: string;
  winExe: string;
  linuxDeb: string;
  linuxAppImage: string;
  androidApk: string;
  iosIpa: string;
}

type DetectedOS = 'mac' | 'windows' | 'linux' | 'android' | 'ios';

function detectVisitorOS(): DetectedOS {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'mac';
}

interface DemoCard {
  id: string;
  el: HTMLDivElement;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

async function verifyUnlockCode(code: string): Promise<DownloadLinks | null> {
  try {
    const res = await fetch('./api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; downloads?: DownloadLinks };
    if (data.ok && data.downloads) {
      try {
        localStorage.setItem(UNLOCK_STORAGE_KEY, code.trim());
      } catch {
        // ignore
      }
      return data.downloads;
    }
    return null;
  } catch {
    return null;
  }
}

export function mountLandingSite(
  appRoot: HTMLDivElement,
  initialSettings: AppSettings,
  onEnterFullscreen: () => void
): void {
  document.documentElement.classList.add('mode-landing');

  let lang: Lang = detectInitialLang();
  let downloads: DownloadLinks | null = null;
  let settings: AppSettings = {
    ...initialSettings,
    liveWallpaperEnabled: true,
    isPaused: false
  };

  let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
  });

  // Fixed background canvases covering viewport
  const wallpaperCanvas = document.createElement('canvas');
  wallpaperCanvas.className = 'landing-bg-canvas';
  appRoot.appendChild(wallpaperCanvas);
  const wallpaper = new LiveWallpaperCanvas(wallpaperCanvas);

  const snowCanvas = document.createElement('canvas');
  snowCanvas.className = 'landing-snow-canvas';
  appRoot.appendChild(snowCanvas);

  let renderer: WebGLSnowRenderer | Canvas2DSnowRenderer | null = null;
  try {
    renderer = new WebGLSnowRenderer(snowCanvas);
  } catch {
    try {
      renderer = new Canvas2DSnowRenderer(snowCanvas);
    } catch {
      renderer = null;
    }
  }

  const sim = new SnowSimulation(window.innerWidth, window.innerHeight, 0);
  const visitorOS = detectVisitorOS();

  const page = document.createElement('div');
  page.className = 'landing-page';
  appRoot.appendChild(page);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/heic,image/gif';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const processed = await removeBackgroundAndCrop(file);
      settings = {
        ...settings,
        customPlowDataUrl: processed,
        customPlowVersion: settings.customPlowVersion + 1,
        plowStyle: 'custom'
      };
      renderDemoControls();
      sim.triggerPlowManually(settings.plowOnWindows);
    } catch {
      // ignore invalid file
    }
  });

  // Persistent demo cards (preserved across language switches)
  const demoCards: DemoCard[] = [];
  let demoStageEl: HTMLDivElement | null = null;
  let demoHintEl: HTMLDivElement | null = null;
  let controlsRootEl: HTMLDivElement | null = null;
  let rollingPointerId: number | null = null;

  function renderPage(): void {
    const t = STRINGS[lang];
    const unlocked = downloads !== null;
    document.documentElement.lang = lang;

    page.innerHTML = `
      <header class="land-nav">
        <a href="#" class="land-logo">
          <span aria-hidden="true">❄️</span>
          <span>SnowFlake</span>
          <span class="land-badge">v2.4</span>
        </a>
        <nav class="land-links">
          <a href="#demo">${t.navDemo}</a>
          <a href="#features">${t.navFeatures}</a>
          <a href="#download">${t.navDownload}</a>
        </nav>
        <div class="land-nav-actions">
          <button type="button" class="sf-btn sf-btn-small lang-switch-btn" id="lang-toggle-btn">
            ${lang === 'en' ? '🌐 EN' : '🌐 RU'}
          </button>
          <button type="button" class="sf-btn sf-btn-small" id="nav-fullscreen-btn">${t.navFullscreen}</button>
          <a href="#download" class="sf-btn sf-btn-small sf-btn-primary">${unlocked ? '⬇ Download' : t.navBuy}</a>
        </div>
      </header>

      <main class="land-main">
        <section class="land-hero">
          <div class="hero-pill">${t.heroPill}</div>
          <h1 class="hero-title">${t.heroTitle}</h1>
          <p class="hero-sub">${t.heroSub}</p>
          <div class="hero-ctas">
            <button type="button" class="land-cta-primary" id="hero-buy-btn">
              ${unlocked ? t.heroUnlockedCta : t.heroBuyCta}
            </button>
            <button type="button" class="land-cta-secondary" id="hero-demo-btn">
              ${t.heroTryDemo}
            </button>
            <button type="button" class="land-cta-ghost" id="hero-fullscreen-btn">
              ${t.heroFullscreen}
            </button>
          </div>
          <div class="hero-platforms-strip">
            <span>${t.heroStrip1}</span>
            <span>${t.heroStrip2}</span>
            <span>${t.heroStrip3}</span>
          </div>
        </section>

        <section id="demo" class="land-section">
          <div class="section-head">
            <h2>${t.demoTitle}</h2>
            <p>${t.demoSub}</p>
          </div>

          <div class="demo-shell">
            <div class="demo-controls" id="demo-controls"></div>
            <div class="demo-stage ${settings.activeTool === 'snowman' ? 'snowman-active' : ''}" id="demo-stage">
              <div class="demo-stage-hint" id="demo-stage-hint">
                ${settings.activeTool === 'snowman' ? t.demoHintSnowman : t.demoHintDefault}
              </div>
              <div class="demo-window" data-win-id="demo-1" style="left: 6%; top: 56px; width: 290px; height: 145px;">
                <div class="vw-titlebar">
                  <span class="vw-dots"><span></span><span></span><span></span></span>
                  <span class="vw-title">${t.demoWin1Title}</span>
                </div>
                <div class="vw-body">${t.demoWin1Body}</div>
              </div>
              <div class="demo-window" data-win-id="demo-2" style="right: 6%; top: 138px; width: 280px; height: 138px;">
                <div class="vw-titlebar">
                  <span class="vw-dots"><span></span><span></span><span></span></span>
                  <span class="vw-title">${t.demoWin2Title}</span>
                </div>
                <div class="vw-body">${t.demoWin2Body}</div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" class="land-section">
          <div class="section-head">
            <h2>${t.featuresTitle}</h2>
            <p>${t.featuresSub}</p>
          </div>

          <div class="features-grid">
            ${t.features
              .map(
                (f) => `
              <article class="feature-card">
                <div class="feature-icon">${f.icon}</div>
                <h3>${f.title}</h3>
                <p>${f.desc}</p>
              </article>
            `
              )
              .join('')}
          </div>
        </section>

        <section id="download" class="land-section">
          <div class="section-head">
            <h2>${t.dlTitle}</h2>
            <p>${unlocked ? t.dlSubUnlocked : t.dlSubLocked}</p>
          </div>

          ${
            unlocked
              ? `<div class="unlock-banner unlock-banner-ok"><span>${t.dlUnlockedBadge}</span></div>`
              : `
            <div class="unlock-banner">
              <div class="unlock-banner-text">
                <strong>${t.dlLockedBannerTitle}</strong>
                <p>${t.dlLockedBannerDesc}</p>
              </div>
              <div class="unlock-banner-actions">
                <a href="${TRIBUTE_PAY_URL}" target="_blank" rel="noopener" class="land-cta-primary" id="tribute-pay-btn">
                  ${t.dlPayBtn}
                </a>
                <button type="button" class="sf-btn sf-btn-small" id="open-unlock-modal-btn">
                  ${t.dlHaveCodeBtn}
                </button>
              </div>
            </div>
          `
          }

          <div class="download-grid">
            <div class="dl-card ${visitorOS === 'mac' ? 'dl-card-featured' : ''}">
              <div class="dl-head">
                <span class="dl-os-icon">🍎</span>
                <div>
                  <h3>macOS</h3>
                  <span class="dl-meta">${t.dlMacMeta}</span>
                </div>
              </div>
              <p class="dl-desc">${t.dlMacDesc}</p>
              <div class="dl-actions">
                ${renderDownloadAction(unlocked ? downloads!.macPkg : null, t.dlMacPkg, t.dlLockedBtnPrefix, true)}
                ${renderDownloadAction(unlocked ? downloads!.macDmg : null, t.dlMacDmg, t.dlLockedBtnPrefix, false)}
              </div>
            </div>

            <div class="dl-card ${visitorOS === 'windows' ? 'dl-card-featured' : ''}">
              <div class="dl-head">
                <span class="dl-os-icon">🪟</span>
                <div>
                  <h3>Windows PC</h3>
                  <span class="dl-meta">${t.dlWinMeta}</span>
                </div>
              </div>
              <p class="dl-desc">${t.dlWinDesc}</p>
              <div class="dl-actions">
                ${renderDownloadAction(unlocked ? downloads!.winExe : null, t.dlWinExe, t.dlLockedBtnPrefix, true)}
              </div>
            </div>

            <div class="dl-card ${visitorOS === 'android' ? 'dl-card-featured' : ''}">
              <div class="dl-head">
                <span class="dl-os-icon">🤖</span>
                <div>
                  <h3>Android</h3>
                  <span class="dl-meta">${t.dlAndMeta}</span>
                </div>
              </div>
              <p class="dl-desc">${t.dlAndDesc}</p>
              <div class="dl-actions">
                ${renderDownloadAction(unlocked ? downloads!.androidApk : null, t.dlAndApk, t.dlLockedBtnPrefix, true)}
                <button type="button" class="sf-btn dl-btn-sec sf-pwa-trigger">${t.dlPwaBtn}</button>
              </div>
            </div>

            <div class="dl-card ${visitorOS === 'ios' ? 'dl-card-featured' : ''}">
              <div class="dl-head">
                <span class="dl-os-icon">📱</span>
                <div>
                  <h3>iOS (iPhone / iPad)</h3>
                  <span class="dl-meta">${t.dlIosMeta}</span>
                </div>
              </div>
              <p class="dl-desc">${t.dlIosDesc}</p>
              <div class="dl-actions">
                <button type="button" class="sf-btn sf-btn-primary dl-btn sf-ios-guide-btn">${t.dlIosGuideBtn}</button>
                ${renderDownloadAction(unlocked ? downloads!.iosIpa : null, t.dlIosIpa, t.dlLockedBtnPrefix, false)}
              </div>
            </div>

            <div class="dl-card ${visitorOS === 'linux' ? 'dl-card-featured' : ''}">
              <div class="dl-head">
                <span class="dl-os-icon">🐧</span>
                <div>
                  <h3>Linux</h3>
                  <span class="dl-meta">${t.dlLinuxMeta}</span>
                </div>
              </div>
              <p class="dl-desc">${t.dlLinuxDesc}</p>
              <div class="dl-actions">
                ${renderDownloadAction(unlocked ? downloads!.linuxDeb : null, t.dlLinuxDeb, t.dlLockedBtnPrefix, true)}
                ${renderDownloadAction(unlocked ? downloads!.linuxAppImage : null, '.AppImage', t.dlLockedBtnPrefix, false)}
              </div>
            </div>

            <div class="dl-card">
              <div class="dl-head">
                <span class="dl-os-icon">🌐</span>
                <div>
                  <h3>Web / PWA</h3>
                  <span class="dl-meta">${t.dlWebMeta}</span>
                </div>
              </div>
              <p class="dl-desc">${t.dlWebDesc}</p>
              <div class="dl-actions">
                <button type="button" class="sf-btn sf-btn-primary dl-btn" id="dl-open-web-btn">${t.dlWebLaunch}</button>
                <button type="button" class="sf-btn dl-btn-sec" id="sf-pwa-install-btn">${t.dlPwaBtn}</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer class="land-footer">
        <span>${t.footerCopy}</span>
        <a href="${TRIBUTE_PAY_URL}" target="_blank" rel="noopener">Tribute ($5)</a>
      </footer>

      <div class="ios-modal hidden" id="pay-unlock-modal">
        <div class="ios-modal-card">
          <div class="sf-header">
            <strong>💳 ${t.payModalTitle}</strong>
            <button type="button" class="sf-icon-close" id="pay-modal-close">✕</button>
          </div>
          <p class="pay-modal-p">${t.payModalStep1}</p>
          <a href="${TRIBUTE_PAY_URL}" target="_blank" rel="noopener" class="land-cta-primary pay-tribute-cta">
            ${t.payModalPayLink}
          </a>
          <p class="pay-modal-p">${t.payModalStep2}</p>
          <form class="unlock-form" id="unlock-form">
            <input type="text" class="unlock-input" id="unlock-code-input" placeholder="${t.dlCodePlaceholder}" autocomplete="off" />
            <button type="submit" class="sf-btn sf-btn-primary dl-btn">${t.dlUnlockBtn}</button>
          </form>
          <div class="unlock-error hidden" id="unlock-error-msg">${t.dlInvalidCode}</div>
        </div>
      </div>

      <div class="ios-modal hidden" id="ios-install-modal">
        <div class="ios-modal-card">
          <div class="sf-header">
            <strong>${t.iosModalTitle}</strong>
            <button type="button" class="sf-icon-close" id="ios-modal-close">✕</button>
          </div>
          <ol class="ios-steps">
            ${t.iosModalSteps.map((s) => `<li>${s}</li>`).join('')}
          </ol>
          <div class="sf-row-gap">
            <button type="button" class="sf-btn sf-btn-primary sf-flex-1" id="ios-modal-launch">${t.iosModalLaunch}</button>
          </div>
        </div>
      </div>
    `;

    wirePageEvents();
    setupDemoStage();
    renderDemoControls();
  }

  function renderDownloadAction(
    url: string | null,
    label: string,
    lockedPrefix: string,
    primary: boolean
  ): string {
    const cls = primary ? 'sf-btn sf-btn-primary dl-btn' : 'sf-btn dl-btn-sec';
    if (url) {
      return `<a href="${url}" class="${cls}" download>${label}</a>`;
    }
    return `<button type="button" class="${cls} sf-locked-dl-btn">${lockedPrefix}${label}</button>`;
  }

  function wirePageEvents(): void {
    page.querySelector('#lang-toggle-btn')!.addEventListener('click', () => {
      lang = lang === 'en' ? 'ru' : 'en';
      saveLang(lang);
      renderPage();
    });

    const openFullscreen = () => onEnterFullscreen();
    page.querySelector('#nav-fullscreen-btn')!.addEventListener('click', openFullscreen);
    page.querySelector('#hero-fullscreen-btn')!.addEventListener('click', openFullscreen);
    page.querySelector('#dl-open-web-btn')!.addEventListener('click', openFullscreen);
    page.querySelector('#hero-demo-btn')!.addEventListener('click', () => {
      page.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' });
    });

    const payModal = page.querySelector('#pay-unlock-modal') as HTMLDivElement;
    const openPayModal = () => {
      if (downloads) {
        page.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      payModal.classList.remove('hidden');
      const input = page.querySelector('#unlock-code-input') as HTMLInputElement | null;
      setTimeout(() => input?.focus(), 60);
    };

    page.querySelector('#hero-buy-btn')!.addEventListener('click', openPayModal);
    page.querySelector('#open-unlock-modal-btn')?.addEventListener('click', openPayModal);
    page.querySelectorAll('.sf-locked-dl-btn').forEach((btn) => {
      btn.addEventListener('click', openPayModal);
    });
    page.querySelector('#pay-modal-close')?.addEventListener('click', () => {
      payModal.classList.add('hidden');
    });
    payModal.addEventListener('click', (e) => {
      if (e.target === payModal) payModal.classList.add('hidden');
    });

    const unlockForm = page.querySelector('#unlock-form') as HTMLFormElement | null;
    unlockForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = page.querySelector('#unlock-code-input') as HTMLInputElement;
      const errEl = page.querySelector('#unlock-error-msg') as HTMLDivElement;
      errEl.classList.add('hidden');
      const result = await verifyUnlockCode(input.value);
      if (result) {
        downloads = result;
        payModal.classList.add('hidden');
        renderPage();
      } else {
        errEl.classList.remove('hidden');
      }
    });

    // PWA & iOS Install modal
    const iosModal = page.querySelector('#ios-install-modal') as HTMLDivElement;
    const openInstallHelper = async () => {
      if (deferredInstallPrompt) {
        await deferredInstallPrompt.prompt();
        deferredInstallPrompt = null;
        return;
      }
      iosModal.classList.remove('hidden');
    };
    page.querySelector('.sf-ios-guide-btn')?.addEventListener('click', () => {
      iosModal.classList.remove('hidden');
    });
    page.querySelector('.sf-pwa-trigger')?.addEventListener('click', () => void openInstallHelper());
    page.querySelector('#sf-pwa-install-btn')?.addEventListener('click', () => void openInstallHelper());
    page.querySelector('#ios-modal-close')?.addEventListener('click', () => iosModal.classList.add('hidden'));
    page.querySelector('#ios-modal-launch')?.addEventListener('click', openFullscreen);
    iosModal.addEventListener('click', (e) => {
      if (e.target === iosModal) iosModal.classList.add('hidden');
    });
  }

  function renderDemoControls(): void {
    if (!controlsRootEl) return;
    const t = STRINGS[lang];
    controlsRootEl.innerHTML = '';

    const groupInt = makeControlGroup(t.ctrlIntensity);
    (['light', 'steady', 'blizzard'] as SnowIntensity[]).forEach((id) => {
      groupInt.appendChild(
        makeSegBtn(t.intensityLabels[id], settings.intensity === id, () => {
          settings = { ...settings, intensity: id };
          renderDemoControls();
        })
      );
    });

    const groupTool = makeControlGroup(t.ctrlTool);
    (['mitten', 'snowman', 'none'] as SnowTool[]).forEach((id) => {
      groupTool.appendChild(
        makeSegBtn(t.toolLabels[id], settings.activeTool === id, () => {
          settings = { ...settings, activeTool: id };
          demoStageEl?.classList.toggle('snowman-active', id === 'snowman');
          if (demoHintEl) {
            demoHintEl.textContent = id === 'snowman' ? t.demoHintSnowman : t.demoHintDefault;
          }
          renderDemoControls();
        })
      );
    });

    const groupGar = makeControlGroup(t.ctrlGarland);
    (['wave', 'twinkle', 'off'] as GarlandMode[]).forEach((id) => {
      groupGar.appendChild(
        makeSegBtn(t.garlandLabels[id], settings.garlandMode === id, () => {
          settings = { ...settings, garlandMode: id };
          renderDemoControls();
        })
      );
    });

    const groupWind = document.createElement('div');
    groupWind.className = 'demo-ctrl-group';
    groupWind.innerHTML = `<span class="demo-ctrl-lbl">${t.ctrlWind}</span>`;
    const windRange = document.createElement('input');
    windRange.type = 'range';
    windRange.min = '-1';
    windRange.max = '1';
    windRange.step = '0.05';
    windRange.value = String(settings.windStrength);
    windRange.className = 'sf-slider demo-wind-slider';
    windRange.addEventListener('input', () => {
      settings = { ...settings, windStrength: parseFloat(windRange.value) };
    });
    groupWind.appendChild(windRange);

    const groupPlow = makeControlGroup(t.ctrlPlow);
    for (const meta of PLOW_STYLES) {
      const b = makeSegBtn(meta.icon, settings.plowStyle === meta.id, () => {
        settings = { ...settings, plowStyle: meta.id };
        renderDemoControls();
        if (meta.id === 'custom' && !settings.customPlowDataUrl) {
          fileInput.click();
        } else {
          sim.triggerPlowManually(true);
        }
      });
      b.title = meta.label;
      groupPlow.appendChild(b);
    }
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'sf-btn sf-btn-mini sf-btn-primary';
    triggerBtn.textContent = t.ctrlLaunch;
    triggerBtn.addEventListener('click', () => sim.triggerPlowManually(true));
    groupPlow.appendChild(triggerBtn);

    const groupAct = document.createElement('div');
    groupAct.className = 'demo-ctrl-group';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'sf-btn sf-btn-mini';
    clearBtn.textContent = t.ctrlClearSnow;
    clearBtn.addEventListener('click', () => sim.clearAllSnow());

    const clearManBtn = document.createElement('button');
    clearManBtn.type = 'button';
    clearManBtn.className = 'sf-btn sf-btn-mini';
    clearManBtn.textContent = t.ctrlClearSnowmen;
    clearManBtn.addEventListener('click', () => sim.clearSnowmen());

    const cabinBtn = document.createElement('button');
    cabinBtn.type = 'button';
    cabinBtn.className = `sf-btn sf-btn-mini ${settings.liveWallpaperEnabled ? 'sf-btn-primary' : ''}`;
    cabinBtn.textContent = t.ctrlCabin;
    cabinBtn.addEventListener('click', () => {
      settings = { ...settings, liveWallpaperEnabled: !settings.liveWallpaperEnabled };
      wallpaperCanvas.style.display = settings.liveWallpaperEnabled ? 'block' : 'none';
      renderDemoControls();
    });

    groupAct.appendChild(clearBtn);
    groupAct.appendChild(clearManBtn);
    groupAct.appendChild(cabinBtn);

    controlsRootEl.appendChild(groupInt);
    controlsRootEl.appendChild(groupTool);
    controlsRootEl.appendChild(groupGar);
    controlsRootEl.appendChild(groupWind);
    controlsRootEl.appendChild(groupPlow);
    controlsRootEl.appendChild(groupAct);
  }

  function setupDemoStage(): void {
    controlsRootEl = page.querySelector('#demo-controls') as HTMLDivElement;
    demoStageEl = page.querySelector('#demo-stage') as HTMLDivElement;
    demoHintEl = page.querySelector('#demo-stage-hint') as HTMLDivElement;

    demoCards.length = 0;
    let zTop = 10;
    demoStageEl.querySelectorAll('.demo-window').forEach((node) => {
      const el = node as HTMLDivElement;
      const id = el.dataset.winId || 'demo';
      demoCards.push({ id, el });

      let dragging = false;
      let startX = 0;
      let startY = 0;
      let origX = 0;
      let origY = 0;

      el.addEventListener('pointerdown', (e) => {
        if (settings.activeTool === 'snowman') return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        const stageRect = demoStageEl!.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        origX = elRect.left - stageRect.left;
        origY = elRect.top - stageRect.top;
        el.style.right = 'auto';
        el.style.left = `${origX}px`;
        el.style.top = `${origY}px`;
        startX = e.clientX;
        startY = e.clientY;
        el.style.zIndex = String(++zTop);
        const idx = demoCards.findIndex((c) => c.el === el);
        if (idx > 0) {
          const [item] = demoCards.splice(idx, 1);
          demoCards.unshift(item);
        }
        e.stopPropagation();
      });

      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const stageRect = demoStageEl!.getBoundingClientRect();
        const maxX = Math.max(8, stageRect.width - el.offsetWidth - 8);
        const maxY = Math.max(44, stageRect.height - el.offsetHeight - 12);
        const nx = Math.max(8, Math.min(maxX, origX + (e.clientX - startX)));
        const ny = Math.max(44, Math.min(maxY, origY + (e.clientY - startY)));
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
        e.stopPropagation();
      });

      const stopDrag = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      };
      el.addEventListener('pointerup', stopDrag);
      el.addEventListener('pointercancel', stopDrag);
    });

    demoStageEl.addEventListener('pointerdown', (e) => {
      if (settings.activeTool !== 'snowman') return;
      rollingPointerId = e.pointerId;
      try {
        demoStageEl!.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      sim.beginRollingBall({ x: e.clientX, y: window.innerHeight - e.clientY });
    });

    demoStageEl.addEventListener('pointermove', (e) => {
      if (settings.activeTool === 'snowman' && rollingPointerId === e.pointerId) {
        sim.continueRollingBall({ x: e.clientX, y: window.innerHeight - e.clientY });
      }
    });

    const endRoll = (e: PointerEvent) => {
      if (rollingPointerId !== e.pointerId) return;
      rollingPointerId = null;
      sim.releaseRollingBall();
    };
    demoStageEl.addEventListener('pointerup', endRoll);
    demoStageEl.addEventListener('pointercancel', endRoll);
  }

  window.addEventListener('pointermove', (e) => {
    if (settings.activeTool === 'mitten') {
      sim.setPointerPosition({ x: e.clientX, y: window.innerHeight - e.clientY });
    }
  });

  const captureDemoSnapshot = (): WindowSnapshot => {
    const vh = window.innerHeight;
    const windows: TrackedWindow[] = [];
    for (const c of demoCards) {
      const r = c.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      windows.push({
        id: c.id,
        rect: {
          x: r.left,
          y: vh - r.bottom,
          width: r.width,
          height: r.height
        }
      });
    }
    return { windows };
  };

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    wallpaper.resize(w, h);
    renderer?.resize(w, h);
    sim.updateViewport(w, h, 0);
  };
  window.addEventListener('resize', handleResize);

  // Initial render & check auto-unlock from URL (?unlock=CODE) or saved code
  renderPage();

  const urlCode = new URLSearchParams(window.location.search).get('unlock');
  let savedCode: string | null = null;
  try {
    savedCode = localStorage.getItem(UNLOCK_STORAGE_KEY);
  } catch {
    savedCode = null;
  }
  const candidateCode = urlCode || savedCode;
  if (candidateCode) {
    void verifyUnlockCode(candidateCode).then((res) => {
      if (res) {
        downloads = res;
        renderPage();
        if (urlCode) {
          page.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  }

  // Pre-seed gentle snowdrifts on demo windows
  sim.syncWindows(captureDemoSnapshot(), false, performance.now() * 0.001);
  for (const [, surf] of sim.surfaces) {
    const step = surf.binWidth;
    for (let x = surf.effectiveMinX + 8; x < surf.effectiveMaxX - 8; x += step) {
      surf.addSnow(x, 3.2 + Math.sin(x * 0.04) * 1.4);
    }
  }

  let last = performance.now();
  let lastWall = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.04, Math.max(0.001, (now - last) * 0.001));
    last = now;

    sim.syncWindows(captureDemoSnapshot(), false, now * 0.001);
    sim.step(dt, settings, visitorOS === 'android' || visitorOS === 'ios');
    renderer?.render(sim, settings);

    if (settings.liveWallpaperEnabled && now - lastWall >= 32) {
      const wdt = lastWall === 0 ? dt : Math.min(0.08, (now - lastWall) * 0.001);
      lastWall = now;
      wallpaper.tickAndDraw(wdt, false);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function makeControlGroup(title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'demo-ctrl-group';
  const lbl = document.createElement('span');
  lbl.className = 'demo-ctrl-lbl';
  lbl.textContent = title;
  el.appendChild(lbl);
  return el;
}

function makeSegBtn(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `sf-btn sf-btn-mini ${active ? 'sf-btn-primary' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
