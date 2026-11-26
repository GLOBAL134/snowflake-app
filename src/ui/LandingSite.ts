import { removeBackgroundAndCrop } from '../core/BackgroundRemover';
import { SnowSimulation } from '../core/SnowSimulation';
import {
  GARLAND_MODE_LABELS,
  INTENSITY_CONFIGS,
  PLOW_STYLES,
  SNOW_TOOL_LABELS,
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

const RELEASE_BASE = 'https://github.com/GLOBAL134/snowflake-app/releases/download/v2.4.0';

export const DOWNLOAD_URLS = {
  macPkg: `${RELEASE_BASE}/SnowFlake-2.4.0-arm64.pkg`,
  macDmg: `${RELEASE_BASE}/SnowFlake-2.4.0-arm64.dmg`,
  winExe: `${RELEASE_BASE}/SnowFlake-Setup-2.4.0-x64.exe`,
  linuxDeb: `${RELEASE_BASE}/snowflake-crossplatform_2.4.0_amd64.deb`,
  linuxAppImage: `${RELEASE_BASE}/SnowFlake-2.4.0.AppImage`,
  androidApk: `${RELEASE_BASE}/SnowFlake-Android.apk`,
  iosIpa: `${RELEASE_BASE}/SnowFlake-iOS-unsigned.ipa`
};

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

export function mountLandingSite(
  appRoot: HTMLDivElement,
  initialSettings: AppSettings,
  onEnterFullscreen: () => void
): void {
  document.documentElement.classList.add('mode-landing');

  let settings: AppSettings = {
    ...initialSettings,
    liveWallpaperEnabled: true,
    isPaused: false
  };

  let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    const pwaBtn = appRoot.querySelector('#sf-pwa-install-btn') as HTMLButtonElement | null;
    if (pwaBtn) pwaBtn.textContent = '📲 Установить приложение (PWA)';
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
  const primaryCTA = getPrimaryCTA(visitorOS);

  const page = document.createElement('div');
  page.className = 'landing-page';
  page.innerHTML = `
    <header class="land-nav">
      <a href="#" class="land-logo">
        <span aria-hidden="true">❄️</span>
        <span>SnowFlake</span>
        <span class="land-badge">v2.4</span>
      </a>
      <nav class="land-links">
        <a href="#demo">Демо</a>
        <a href="#features">Возможности</a>
        <a href="#download">Скачать</a>
      </nav>
      <div class="land-nav-actions">
        <button type="button" class="sf-btn sf-btn-small" id="nav-fullscreen-btn">▶ На весь экран</button>
        <a href="#download" class="sf-btn sf-btn-small sf-btn-primary">Скачать</a>
      </div>
    </header>

    <main class="land-main">
      <section class="land-hero">
        <div class="hero-pill">macOS · Windows · Linux · Android · iOS</div>
        <h1 class="hero-title">Зимняя атмосфера и физика снега для любого вашего устройства</h1>
        <p class="hero-sub">
          Снегопад, настоящие сугробы на окнах и панели задач, качающиеся гирлянды,
          лепка снеговиков, умный снегоуборщик и живой зимний домик — попробуйте прямо на странице
          или установите на устройство в один клик.
        </p>
        <div class="hero-ctas">
          <a href="${primaryCTA.href}" class="land-cta-primary" ${primaryCTA.isAnchor ? '' : 'download'}>
            ${primaryCTA.label}
          </a>
          <button type="button" class="land-cta-secondary" id="hero-demo-btn">
            ✨ Попробовать вживую ниже
          </button>
          <button type="button" class="land-cta-ghost" id="hero-fullscreen-btn">
            🖥 Весь экран (PWA)
          </button>
        </div>
        <div class="hero-platforms-strip">
          <span>✓ Авто-установщик .pkg/.dmg для Mac</span>
          <span>✓ One-Click .exe для Windows</span>
          <span>✓ .apk для Android и PWA для iOS</span>
        </div>
      </section>

      <section id="demo" class="land-section">
        <div class="section-head">
          <h2>Интерактивная демонстрация</h2>
          <p>
            Снег уже падает прямо поверх этой страницы. Потяните окна внизу — гирлянды закачаются,
            а сугробы осыплются! Переключитесь на <strong>«Снеговик»</strong>, чтобы скатать снежные комы.
          </p>
        </div>

        <div class="demo-shell">
          <div class="demo-controls" id="demo-controls"></div>
          <div class="demo-stage" id="demo-stage">
            <div class="demo-stage-hint" id="demo-stage-hint">
              💡 Двигайте карточки мышью или пальцем — снег осыпается с крыш, а варежка смахивает сугробы
            </div>
            <div class="demo-window" data-win-id="demo-1" style="left: 6%; top: 56px; width: 290px; height: 145px;">
              <div class="vw-titlebar">
                <span class="vw-dots"><span></span><span></span><span></span></span>
                <span class="vw-title">❄️ Потяни и потряси окно</span>
              </div>
              <div class="vw-body">
                Сугробы копятся прямо на верхней кромке окна. При резком движении снег рассыпается хлопьями!
              </div>
            </div>
            <div class="demo-window" data-win-id="demo-2" style="right: 6%; top: 138px; width: 280px; height: 138px;">
              <div class="vw-titlebar">
                <span class="vw-dots"><span></span><span></span><span></span></span>
                <span class="vw-title">🚜 Гирлянды и снегоуборщик</span>
              </div>
              <div class="vw-body">
                Нажмите «Выпустить сейчас», чтобы трактор или пингвин проехался по окну и расчистил снег.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" class="land-section">
        <div class="section-head">
          <h2>Как работает SnowFlake</h2>
          <p>Все эффекты работают в реальном времени на GPU (WebGL2 / Metal)</p>
        </div>

        <div class="features-grid">
          <article class="feature-card">
            <div class="feature-icon">🏔</div>
            <h3>Живые сугробы и перекрытия</h3>
            <p>Снег плавно нарастает на нижней кромке экрана, Dock/панели задач и заголовках окон, учитывая перекрытие окон друг другом.</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">🧤</div>
            <h3>Варежка и Снеговик</h3>
            <p>Смахивайте снег курсором или пальцем в режиме «Варежка» или скатайте 3 кома и соберите снеговика с шарфом и морковкой.</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">🚜</div>
            <h3>Умный снегоуборщик</h3>
            <p>Трактор, ретро-грузовик, снегоход, пингвин или ваше собственное фото (фон удалится автоматически) с физикой прыжков и подвески.</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">✨</div>
            <h3>Качающиеся гирлянды</h3>
            <p>Огоньки в режиме «Волна» или «Мерцание» крепятся к верхнему краю окон и раскачиваются по законам физики при перемещении.</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">🏡</div>
            <h3>Живые обои «Зимний домик»</h3>
            <p>Звёздное небо, луна, заснеженные ели, дым из трубы и пульсирующий тёплый свет в окнах уютного домика.</p>
          </article>
          <article class="feature-card">
            <div class="feature-icon">📱</div>
            <h3>Адаптация под все устройства</h3>
            <p>На Mac и Windows — прозрачный оверлей из трея поверх всех программ; на iOS и Android — touch-управление и ветер от наклона телефона.</p>
          </article>
        </div>
      </section>

      <section id="download" class="land-section">
        <div class="section-head">
          <h2>Скачать для всех устройств в 1 клик</h2>
          <p>Выберите вашу платформу — установка запускается сразу после открытия файла</p>
        </div>

        <div class="download-grid">
          <div class="dl-card ${visitorOS === 'mac' ? 'dl-card-featured' : ''}">
            <div class="dl-head">
              <span class="dl-os-icon">🍎</span>
              <div>
                <h3>macOS</h3>
                <span class="dl-meta">Apple Silicon (M1–M4) · macOS 12+</span>
              </div>
            </div>
            <p class="dl-desc">Нативный оверлей в меню-баре поверх всех окон, отслеживание Dock и автозапуск.</p>
            <div class="dl-actions">
              <a href="${DOWNLOAD_URLS.macPkg}" class="sf-btn sf-btn-primary dl-btn" download>
                ⬇ Скачать установщик (.pkg)
              </a>
              <a href="${DOWNLOAD_URLS.macDmg}" class="sf-btn dl-btn-sec" download>
                Образ (.dmg)
              </a>
            </div>
          </div>

          <div class="dl-card ${visitorOS === 'windows' ? 'dl-card-featured' : ''}">
            <div class="dl-head">
              <span class="dl-os-icon">🪟</span>
              <div>
                <h3>Windows ПК</h3>
                <span class="dl-meta">Windows 10 / 11 (64-bit)</span>
              </div>
            </div>
            <p class="dl-desc">One-Click установщик: открываете файл — приложение само ставится и появляется в трее.</p>
            <div class="dl-actions">
              <a href="${DOWNLOAD_URLS.winExe}" class="sf-btn sf-btn-primary dl-btn" download>
                ⬇ Скачать установщик (.exe)
              </a>
            </div>
          </div>

          <div class="dl-card ${visitorOS === 'android' ? 'dl-card-featured' : ''}">
            <div class="dl-head">
              <span class="dl-os-icon">🤖</span>
              <div>
                <h3>Android</h3>
                <span class="dl-meta">Android 8+ · Телефоны и планшеты</span>
              </div>
            </div>
            <p class="dl-desc">Свайпы пальцем, лепка снеговиков, ветер наклоном телефона и живой домик.</p>
            <div class="dl-actions">
              <a href="${DOWNLOAD_URLS.androidApk}" class="sf-btn sf-btn-primary dl-btn" download>
                ⬇ Скачать APK
              </a>
              <button type="button" class="sf-btn dl-btn-sec sf-pwa-trigger">
                📲 Установить PWA
              </button>
            </div>
          </div>

          <div class="dl-card ${visitorOS === 'ios' ? 'dl-card-featured' : ''}">
            <div class="dl-head">
              <span class="dl-os-icon">📱</span>
              <div>
                <h3>iOS (iPhone / iPad)</h3>
                <span class="dl-meta">iOS 15+ · Установка через Safari</span>
              </div>
            </div>
            <p class="dl-desc">Apple не разрешает ставить неподписанные .ipa прямо из браузера — установите в 2 касания через Safari («Поделиться» → «На экран „Домой“») или через AltStore/Sideloadly.</p>
            <div class="dl-actions">
              <button type="button" class="sf-btn sf-btn-primary dl-btn sf-ios-guide-btn">
                📲 Установить на iPhone
              </button>
              <a href="${DOWNLOAD_URLS.iosIpa}" class="sf-btn dl-btn-sec" download title="Требует AltStore / Sideloadly / Xcode">
                .ipa (AltStore)
              </a>
            </div>
          </div>

          <div class="dl-card ${visitorOS === 'linux' ? 'dl-card-featured' : ''}">
            <div class="dl-head">
              <span class="dl-os-icon">🐧</span>
              <div>
                <h3>Linux</h3>
                <span class="dl-meta">Ubuntu / Debian / AppImage (x64)</span>
              </div>
            </div>
            <p class="dl-desc">Готовый пакет .deb для автоматической установки и универсальный AppImage.</p>
            <div class="dl-actions">
              <a href="${DOWNLOAD_URLS.linuxDeb}" class="sf-btn sf-btn-primary dl-btn" download>
                ⬇ Скачать .deb
              </a>
              <a href="${DOWNLOAD_URLS.linuxAppImage}" class="sf-btn dl-btn-sec" download>
                .AppImage
              </a>
            </div>
          </div>

          <div class="dl-card">
            <div class="dl-head">
              <span class="dl-os-icon">🌐</span>
              <div>
                <h3>Веб / PWA</h3>
                <span class="dl-meta">Любой браузер без установки</span>
              </div>
            </div>
            <p class="dl-desc">Запустите полноэкранный SnowFlake прямо сейчас в браузере или установите как веб-приложение.</p>
            <div class="dl-actions">
              <button type="button" class="sf-btn sf-btn-primary dl-btn" id="dl-open-web-btn">
                ▶ Запустить на весь экран
              </button>
              <button type="button" class="sf-btn dl-btn-sec" id="sf-pwa-install-btn">
                📲 Установить PWA
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="land-footer">
      <span>❄️ SnowFlake v2.4 — кроссплатформенный зимний оверлей и живые обои</span>
      <a href="https://github.com/GLOBAL134/snowflake-app" target="_blank" rel="noopener">GitHub проекта</a>
    </footer>

    <div class="ios-modal hidden" id="ios-install-modal">
      <div class="ios-modal-card">
        <div class="sf-header">
          <strong>📲 Установка на iPhone / iPad / Android</strong>
          <button type="button" class="sf-icon-close" id="ios-modal-close">✕</button>
        </div>
        <ol class="ios-steps">
          <li>Нажмите кнопку <strong>«Поделиться»</strong> (квадрат со стрелкой вверх) внизу экрана Safari на iPhone или меню <strong>⋮</strong> в Chrome на Android.</li>
          <li>Выберите пункт <strong>«На экран „Домой“»</strong> (или <strong>«Установить приложение»</strong>).</li>
          <li>Откройте иконку <strong>SnowFlake</strong> — приложение запустится в полноэкранном режиме без рамок браузера!</li>
        </ol>
        <div class="sf-row-gap">
          <button type="button" class="sf-btn sf-btn-primary sf-flex-1" id="ios-modal-launch">▶ Открыть полноэкранный режим</button>
          <a href="${DOWNLOAD_URLS.iosIpa}" class="sf-btn" download>Скачать .ipa</a>
        </div>
      </div>
    </div>
  `;

  appRoot.appendChild(page);

  // Wire navigation & fullscreen triggers
  const openFullscreen = () => onEnterFullscreen();
  page.querySelector('#nav-fullscreen-btn')!.addEventListener('click', openFullscreen);
  page.querySelector('#hero-fullscreen-btn')!.addEventListener('click', openFullscreen);
  page.querySelector('#dl-open-web-btn')!.addEventListener('click', openFullscreen);
  page.querySelector('#hero-demo-btn')!.addEventListener('click', () => {
    page.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' });
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
  page.querySelector('.sf-ios-guide-btn')?.addEventListener('click', () => iosModal.classList.remove('hidden'));
  page.querySelector('.sf-pwa-trigger')?.addEventListener('click', () => void openInstallHelper());
  page.querySelector('#sf-pwa-install-btn')?.addEventListener('click', () => void openInstallHelper());
  page.querySelector('#ios-modal-close')?.addEventListener('click', () => iosModal.classList.add('hidden'));
  page.querySelector('#ios-modal-launch')?.addEventListener('click', openFullscreen);
  iosModal.addEventListener('click', (e) => {
    if (e.target === iosModal) iosModal.classList.add('hidden');
  });

  // Build interactive demo controls bar
  const controlsRoot = page.querySelector('#demo-controls') as HTMLDivElement;
  const demoStage = page.querySelector('#demo-stage') as HTMLDivElement;
  const demoHint = page.querySelector('#demo-stage-hint') as HTMLDivElement;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/heic,image/gif';
  fileInput.style.display = 'none';
  page.appendChild(fileInput);

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
      renderControls();
      sim.triggerPlowManually(settings.plowOnWindows);
    } catch {
      // ignore invalid file
    }
  });

  const renderControls = () => {
    controlsRoot.innerHTML = '';

    // Row 1: Intensity + Tool + Garland
    const groupInt = makeControlGroup('Снегопад');
    (['light', 'steady', 'blizzard'] as SnowIntensity[]).forEach((id) => {
      const b = makeSegBtn(INTENSITY_CONFIGS[id].label, settings.intensity === id, () => {
        settings = { ...settings, intensity: id };
        renderControls();
      });
      groupInt.appendChild(b);
    });

    const groupTool = makeControlGroup('Инструмент');
    (['mitten', 'snowman', 'none'] as SnowTool[]).forEach((id) => {
      const b = makeSegBtn(SNOW_TOOL_LABELS[id], settings.activeTool === id, () => {
        settings = { ...settings, activeTool: id };
        demoStage.classList.toggle('snowman-active', id === 'snowman');
        demoHint.textContent =
          id === 'snowman'
            ? '☃️ Режим снеговика: зажмите и тяните внутри этой области, чтобы скатать шар и поставить на окно!'
            : '💡 Двигайте карточки мышью или пальцем — снег осыпается с крыш, а варежка смахивает сугробы';
        renderControls();
      });
      groupTool.appendChild(b);
    });

    const groupGar = makeControlGroup('Гирлянды');
    (['wave', 'twinkle', 'off'] as GarlandMode[]).forEach((id) => {
      const b = makeSegBtn(GARLAND_MODE_LABELS[id], settings.garlandMode === id, () => {
        settings = { ...settings, garlandMode: id };
        renderControls();
      });
      groupGar.appendChild(b);
    });

    // Wind group
    const groupWind = document.createElement('div');
    groupWind.className = 'demo-ctrl-group';
    groupWind.innerHTML = `<span class="demo-ctrl-lbl">Ветер</span>`;
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

    // Plow + Actions group
    const groupPlow = makeControlGroup('Снегоуборщик');
    for (const meta of PLOW_STYLES) {
      const b = makeSegBtn(meta.icon, settings.plowStyle === meta.id, () => {
        settings = { ...settings, plowStyle: meta.id };
        renderControls();
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
    triggerBtn.textContent = '▶ Пустить';
    triggerBtn.addEventListener('click', () => sim.triggerPlowManually(true));
    groupPlow.appendChild(triggerBtn);

    const groupAct = document.createElement('div');
    groupAct.className = 'demo-ctrl-group';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'sf-btn sf-btn-mini';
    clearBtn.textContent = '❄️ Убрать снег';
    clearBtn.addEventListener('click', () => sim.clearAllSnow());

    const clearManBtn = document.createElement('button');
    clearManBtn.type = 'button';
    clearManBtn.className = 'sf-btn sf-btn-mini';
    clearManBtn.textContent = '🗑 Снеговики';
    clearManBtn.addEventListener('click', () => sim.clearSnowmen());

    const cabinBtn = document.createElement('button');
    cabinBtn.type = 'button';
    cabinBtn.className = `sf-btn sf-btn-mini ${settings.liveWallpaperEnabled ? 'sf-btn-primary' : ''}`;
    cabinBtn.textContent = '🏡 Домик';
    cabinBtn.addEventListener('click', () => {
      settings = { ...settings, liveWallpaperEnabled: !settings.liveWallpaperEnabled };
      wallpaperCanvas.style.display = settings.liveWallpaperEnabled ? 'block' : 'none';
      renderControls();
    });

    groupAct.appendChild(clearBtn);
    groupAct.appendChild(clearManBtn);
    groupAct.appendChild(cabinBtn);

    controlsRoot.appendChild(groupInt);
    controlsRoot.appendChild(groupTool);
    controlsRoot.appendChild(groupGar);
    controlsRoot.appendChild(groupWind);
    controlsRoot.appendChild(groupPlow);
    controlsRoot.appendChild(groupAct);
  };

  renderControls();

  // Setup draggable demo windows inside #demo-stage
  const demoCards: DemoCard[] = [];
  let zTop = 10;
  demoStage.querySelectorAll('.demo-window').forEach((node) => {
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
      const stageRect = demoStage.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      origX = elRect.left - stageRect.left;
      origY = elRect.top - stageRect.top;
      el.style.right = 'auto';
      el.style.left = `${origX}px`;
      el.style.top = `${origY}px`;
      startX = e.clientX;
      startY = e.clientY;
      el.style.zIndex = String(++zTop);
      // Move to front in Z-order list
      const idx = demoCards.findIndex((c) => c.el === el);
      if (idx > 0) {
        const [item] = demoCards.splice(idx, 1);
        demoCards.unshift(item);
      }
      e.stopPropagation();
    });

    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const stageRect = demoStage.getBoundingClientRect();
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

  // Pointer interactions: mitten hover anywhere on page + snowman rolling inside demoStage
  let rollingPointerId: number | null = null;

  window.addEventListener('pointermove', (e) => {
    if (settings.activeTool === 'mitten') {
      sim.setPointerPosition({ x: e.clientX, y: window.innerHeight - e.clientY });
    }
  });

  demoStage.addEventListener('pointerdown', (e) => {
    if (settings.activeTool !== 'snowman') return;
    rollingPointerId = e.pointerId;
    try {
      demoStage.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    sim.beginRollingBall({ x: e.clientX, y: window.innerHeight - e.clientY });
  });

  demoStage.addEventListener('pointermove', (e) => {
    if (settings.activeTool === 'snowman' && rollingPointerId === e.pointerId) {
      sim.continueRollingBall({ x: e.clientX, y: window.innerHeight - e.clientY });
    }
  });

  const endRoll = (e: PointerEvent) => {
    if (rollingPointerId !== e.pointerId) return;
    rollingPointerId = null;
    sim.releaseRollingBall();
  };
  demoStage.addEventListener('pointerup', endRoll);
  demoStage.addEventListener('pointercancel', endRoll);

  // Sync window positions of demoCards into SnowSimulation
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

  // Pre-seed a gentle amount of snow on demo windows so visitors immediately see snowdrifts
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

function getPrimaryCTA(os: DetectedOS): { label: string; href: string; isAnchor?: boolean } {
  switch (os) {
    case 'mac':
      return { label: '⬇ Скачать для Mac (.pkg)', href: DOWNLOAD_URLS.macPkg };
    case 'windows':
      return { label: '⬇ Скачать для Windows (.exe)', href: DOWNLOAD_URLS.winExe };
    case 'android':
      return { label: '⬇ Скачать для Android (.apk)', href: DOWNLOAD_URLS.androidApk };
    case 'ios':
      return { label: '📲 Установить на iPhone / iPad', href: '#download', isAnchor: true };
    case 'linux':
      return { label: '⬇ Скачать для Linux (.deb)', href: DOWNLOAD_URLS.linuxDeb };
  }
}
