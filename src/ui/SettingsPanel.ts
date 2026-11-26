import { removeBackgroundAndCrop } from '../core/BackgroundRemover';
import {
  GARLAND_MODE_LABELS,
  INTENSITY_CONFIGS,
  PLOW_STYLES,
  SNOW_TOOL_LABELS,
  type AppSettings,
  type GarlandMode,
  type PlowStyle,
  type RuntimePlatform,
  type SnowIntensity,
  type SnowTool
} from '../core/types';
import { MotionWindController } from '../platform/motionWind';

export interface SettingsPanelCallbacks {
  onUpdate: (patch: Partial<AppSettings>) => void;
  onClearSnow: () => void;
  onClearSnowmen: () => void;
  onTriggerPlow: () => void;
  onToggleLaunchAtLogin: (enable: boolean) => void;
  onToggleTiltWind: (enable: boolean) => Promise<boolean>;
  onClose: () => void;
  onOpenSandbox?: () => void;
  onQuit?: () => void;
}

export class SettingsPanel {
  readonly root: HTMLDivElement;
  private readonly platform: RuntimePlatform;
  private readonly callbacks: SettingsPanelCallbacks;
  private fileInput: HTMLInputElement;
  private currentSettings: AppSettings;

  // Dynamic elements updated on state sync
  private pauseBtn!: HTMLButtonElement;
  private windLabelEl!: HTMLSpanElement;
  private windSlider!: HTMLInputElement;
  private customPhotoBtn!: HTMLButtonElement;
  private customPhotoRow!: HTMLDivElement;
  private liveWallCheckbox!: HTMLInputElement;
  private autoPlowCheckbox!: HTMLInputElement;
  private plowWinCheckbox!: HTMLInputElement;
  private pauseFSCheckbox?: HTMLInputElement;
  private launchCheckbox?: HTMLInputElement;
  private virtualWinCheckbox?: HTMLInputElement;
  private tiltWindCheckbox?: HTMLInputElement;

  private intensityBtns = new Map<SnowIntensity, HTMLButtonElement>();
  private toolBtns = new Map<SnowTool, HTMLButtonElement>();
  private garlandBtns = new Map<GarlandMode, HTMLButtonElement>();
  private plowBtns = new Map<PlowStyle, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    platform: RuntimePlatform,
    initialSettings: AppSettings,
    callbacks: SettingsPanelCallbacks
  ) {
    this.platform = platform;
    this.currentSettings = initialSettings;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.className =
      platform === 'electron-settings' ? 'sf-panel sf-panel-tray' : 'sf-panel sf-panel-floating';

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png,image/jpeg,image/webp,image/heic,image/gif';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => {
      void this.handleFileSelected();
    });
    this.root.appendChild(this.fileInput);

    this.buildDOM();
    this.applySettings(initialSettings);
    parent.appendChild(this.root);
  }

  private buildDOM(): void {
    const isElectronTray = this.platform === 'electron-settings';
    const isDesktopElectron =
      this.platform === 'electron-settings' || this.platform === 'electron-sandbox';
    const showVirtualWindows = !isElectronTray;
    const showTiltWind = !isElectronTray && MotionWindController.isSupported();

    const body = document.createElement('div');
    body.className = 'sf-panel-inner';

    // Header
    const header = document.createElement('div');
    header.className = 'sf-header';
    header.innerHTML = `
      <div class="sf-brand">
        <span class="sf-brand-icon" aria-hidden="true">❄️</span>
        <span class="sf-brand-title">SnowFlake</span>
      </div>
      <div class="sf-header-actions">
        <button type="button" class="sf-btn sf-btn-small sf-pause-btn"></button>
        <button type="button" class="sf-icon-close" title="Закрыть (Esc)" aria-label="Закрыть">✕</button>
      </div>
    `;
    this.pauseBtn = header.querySelector('.sf-pause-btn') as HTMLButtonElement;
    this.pauseBtn.addEventListener('click', () => {
      this.callbacks.onUpdate({ isPaused: !this.currentSettings.isPaused });
    });
    header.querySelector('.sf-icon-close')!.addEventListener('click', () => {
      this.callbacks.onClose();
    });
    body.appendChild(header);
    body.appendChild(this.makeDivider());

    // Snow intensity
    const intSec = this.makeSection('Снегопад');
    const intSeg = document.createElement('div');
    intSeg.className = 'sf-segmented';
    (['light', 'steady', 'blizzard'] as SnowIntensity[]).forEach((id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-seg-btn';
      btn.textContent = INTENSITY_CONFIGS[id].label;
      btn.addEventListener('click', () => this.callbacks.onUpdate({ intensity: id }));
      intSeg.appendChild(btn);
      this.intensityBtns.set(id, btn);
    });
    intSec.appendChild(intSeg);
    body.appendChild(intSec);

    // Wind
    const windSec = document.createElement('div');
    windSec.className = 'sf-section';
    const windTop = document.createElement('div');
    windTop.className = 'sf-row-between';
    windTop.innerHTML = `<span class="sf-label">Ветер</span><span class="sf-meta sf-wind-val">Штиль</span>`;
    this.windLabelEl = windTop.querySelector('.sf-wind-val') as HTMLSpanElement;
    windSec.appendChild(windTop);

    this.windSlider = document.createElement('input');
    this.windSlider.type = 'range';
    this.windSlider.min = '-1';
    this.windSlider.max = '1';
    this.windSlider.step = '0.02';
    this.windSlider.className = 'sf-slider';
    this.windSlider.addEventListener('input', () => {
      this.callbacks.onUpdate({ windStrength: parseFloat(this.windSlider.value) });
    });
    windSec.appendChild(this.windSlider);

    const windPresets = document.createElement('div');
    windPresets.className = 'sf-row-between sf-wind-presets';
    const presets: Array<[string, number]> = [
      ['← Запад', -0.65],
      ['Штиль', 0],
      ['Восток →', 0.65]
    ];
    for (const [label, val] of presets) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-btn sf-btn-mini';
      b.textContent = label;
      b.addEventListener('click', () => this.callbacks.onUpdate({ windStrength: val }));
      windPresets.appendChild(b);
    }
    windSec.appendChild(windPresets);
    body.appendChild(windSec);
    body.appendChild(this.makeDivider());

    // Tool
    const toolSec = this.makeSection('Инструмент');
    const toolSeg = document.createElement('div');
    toolSeg.className = 'sf-segmented';
    (['none', 'mitten', 'snowman'] as SnowTool[]).forEach((id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-seg-btn';
      btn.textContent = SNOW_TOOL_LABELS[id];
      btn.addEventListener('click', () => {
        this.callbacks.onUpdate({ activeTool: id });
        if (id === 'snowman' && !isElectronTray) {
          this.callbacks.onClose();
        }
      });
      toolSeg.appendChild(btn);
      this.toolBtns.set(id, btn);
    });
    toolSec.appendChild(toolSeg);

    const toolActions = document.createElement('div');
    toolActions.className = 'sf-row-gap';
    const clearSnowBtn = document.createElement('button');
    clearSnowBtn.type = 'button';
    clearSnowBtn.className = 'sf-btn sf-btn-small sf-flex-1';
    clearSnowBtn.textContent = '❄️ Лопата (убрать снег)';
    clearSnowBtn.addEventListener('click', () => this.callbacks.onClearSnow());

    const clearSnowmenBtn = document.createElement('button');
    clearSnowmenBtn.type = 'button';
    clearSnowmenBtn.className = 'sf-btn sf-btn-small';
    clearSnowmenBtn.title = 'Убрать снеговиков';
    clearSnowmenBtn.textContent = '🗑';
    clearSnowmenBtn.addEventListener('click', () => this.callbacks.onClearSnowmen());

    toolActions.appendChild(clearSnowBtn);
    toolActions.appendChild(clearSnowmenBtn);
    toolSec.appendChild(toolActions);
    body.appendChild(toolSec);
    body.appendChild(this.makeDivider());

    // Garlands & Live wallpaper
    const garSec = this.makeSection('Гирлянды на окнах');
    const garSeg = document.createElement('div');
    garSeg.className = 'sf-segmented';
    (['off', 'twinkle', 'wave'] as GarlandMode[]).forEach((id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-seg-btn';
      btn.textContent = GARLAND_MODE_LABELS[id];
      btn.addEventListener('click', () => this.callbacks.onUpdate({ garlandMode: id }));
      garSeg.appendChild(btn);
      this.garlandBtns.set(id, btn);
    });
    garSec.appendChild(garSeg);

    const liveRow = this.makeToggle('Живые обои (Зимний домик)', (checked) => {
      this.callbacks.onUpdate({ liveWallpaperEnabled: checked });
    });
    this.liveWallCheckbox = liveRow.input;
    garSec.appendChild(liveRow.el);

    if (showVirtualWindows) {
      const vwRow = this.makeToggle('Интерактивные окна-карточки', (checked) => {
        this.callbacks.onUpdate({ virtualWindowsEnabled: checked });
      });
      this.virtualWinCheckbox = vwRow.input;
      garSec.appendChild(vwRow.el);
    }

    if (showTiltWind) {
      const tiltRow = this.makeToggle('Ветер наклоном устройства', async (checked) => {
        const ok = await this.callbacks.onToggleTiltWind(checked);
        if (!ok && this.tiltWindCheckbox) {
          this.tiltWindCheckbox.checked = false;
        }
      });
      this.tiltWindCheckbox = tiltRow.input;
      garSec.appendChild(tiltRow.el);
    }

    body.appendChild(garSec);
    body.appendChild(this.makeDivider());

    // Snowplow
    const plowSec = document.createElement('div');
    plowSec.className = 'sf-section';
    const plowTop = document.createElement('div');
    plowTop.className = 'sf-row-between';
    const plowTitle = document.createElement('span');
    plowTitle.className = 'sf-label';
    plowTitle.textContent = 'Снегоуборщик';
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'sf-btn sf-btn-mini sf-btn-primary';
    triggerBtn.textContent = 'Выпустить сейчас';
    triggerBtn.addEventListener('click', () => this.callbacks.onTriggerPlow());
    plowTop.appendChild(plowTitle);
    plowTop.appendChild(triggerBtn);
    plowSec.appendChild(plowTop);

    const row1 = document.createElement('div');
    row1.className = 'sf-plow-grid-3';
    const row2 = document.createElement('div');
    row2.className = 'sf-plow-grid-2';

    PLOW_STYLES.forEach((meta, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-plow-btn';
      btn.textContent = `${meta.icon} ${meta.label}`;
      btn.addEventListener('click', () => {
        this.callbacks.onUpdate({ plowStyle: meta.id });
        if (meta.id === 'custom' && !this.currentSettings.customPlowDataUrl) {
          this.fileInput.click();
        }
      });
      if (idx < 3) row1.appendChild(btn);
      else row2.appendChild(btn);
      this.plowBtns.set(meta.id, btn);
    });
    plowSec.appendChild(row1);
    plowSec.appendChild(row2);

    this.customPhotoRow = document.createElement('div');
    this.customPhotoRow.className = 'sf-custom-photo-row';
    this.customPhotoBtn = document.createElement('button');
    this.customPhotoBtn.type = 'button';
    this.customPhotoBtn.className = 'sf-btn sf-btn-small sf-full-w';
    this.customPhotoBtn.addEventListener('click', () => this.fileInput.click());
    this.customPhotoRow.appendChild(this.customPhotoBtn);
    plowSec.appendChild(this.customPhotoRow);

    const autoPlowRow = this.makeToggle('Выезжать автоматически при сугробе', (checked) => {
      this.callbacks.onUpdate({ autoPlowEnabled: checked });
    });
    this.autoPlowCheckbox = autoPlowRow.input;
    plowSec.appendChild(autoPlowRow.el);

    const plowWinRow = this.makeToggle('Чистить также сугробы на окнах', (checked) => {
      this.callbacks.onUpdate({ plowOnWindows: checked });
    });
    this.plowWinCheckbox = plowWinRow.input;
    plowSec.appendChild(plowWinRow.el);
    body.appendChild(plowSec);

    if (window.SnowFlakeAndroid) {
      body.appendChild(this.makeDivider());
      const androidSec = this.makeSection('Android: рабочий стол и оверлей');
      const overlayBtn = document.createElement('button');
      overlayBtn.type = 'button';
      overlayBtn.className = 'sf-btn sf-btn-small sf-full-w';
      const syncOverlayText = () => {
        const running = window.SnowFlakeAndroid?.isOverlayRunning() ?? false;
        overlayBtn.textContent = running
          ? '⏹ Выключить снег поверх всех экранов'
          : '❄️ Снег поверх всех приложений';
        overlayBtn.classList.toggle('sf-btn-primary', running);
      };
      syncOverlayText();
      overlayBtn.addEventListener('click', () => {
        window.SnowFlakeAndroid?.toggleOverlay();
        setTimeout(syncOverlayText, 120);
      });

      const wallpaperBtn = document.createElement('button');
      wallpaperBtn.type = 'button';
      wallpaperBtn.className = 'sf-btn sf-btn-small sf-full-w';
      wallpaperBtn.textContent = '🏡 Живые обои рабочего стола';
      wallpaperBtn.addEventListener('click', () => {
        window.SnowFlakeAndroid?.openLiveWallpaperPicker();
      });

      androidSec.appendChild(overlayBtn);
      androidSec.appendChild(wallpaperBtn);
      body.appendChild(androidSec);
    }

    if (isDesktopElectron) {
      body.appendChild(this.makeDivider());
      const sysSec = document.createElement('div');
      sysSec.className = 'sf-section';

      if (isElectronTray) {
        const fsRow = this.makeToggle('Пауза в полноэкранном режиме', (checked) => {
          this.callbacks.onUpdate({ pauseOnFullscreen: checked });
        });
        this.pauseFSCheckbox = fsRow.input;
        sysSec.appendChild(fsRow.el);
      }

      const launchRow = this.makeToggle('Запускать вместе с системой', (checked) => {
        this.callbacks.onToggleLaunchAtLogin(checked);
      });
      this.launchCheckbox = launchRow.input;
      sysSec.appendChild(launchRow.el);

      if (isElectronTray && this.callbacks.onOpenSandbox) {
        const sbBtn = document.createElement('button');
        sbBtn.type = 'button';
        sbBtn.className = 'sf-btn sf-btn-small sf-full-w';
        sbBtn.textContent = '🪟 Открыть окно-песочницу';
        sbBtn.addEventListener('click', () => this.callbacks.onOpenSandbox?.());
        sysSec.appendChild(sbBtn);
      }

      if (this.callbacks.onQuit) {
        const footer = document.createElement('div');
        footer.className = 'sf-footer';
        const quitBtn = document.createElement('button');
        quitBtn.type = 'button';
        quitBtn.className = 'sf-link-btn';
        quitBtn.textContent = 'Выйти из SnowFlake';
        quitBtn.addEventListener('click', () => this.callbacks.onQuit?.());
        footer.appendChild(quitBtn);
        sysSec.appendChild(footer);
      }

      body.appendChild(sysSec);
    }

    this.root.appendChild(body);
  }

  private makeSection(title: string): HTMLDivElement {
    const sec = document.createElement('div');
    sec.className = 'sf-section';
    const lbl = document.createElement('span');
    lbl.className = 'sf-label';
    lbl.textContent = title;
    sec.appendChild(lbl);
    return sec;
  }

  private makeDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'sf-divider';
    return hr;
  }

  private makeToggle(
    label: string,
    onChange: (checked: boolean) => void | Promise<void>
  ): { el: HTMLLabelElement; input: HTMLInputElement } {
    const el = document.createElement('label');
    el.className = 'sf-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      void onChange(input.checked);
    });
    const text = document.createElement('span');
    text.textContent = label;
    el.appendChild(input);
    el.appendChild(text);
    return { el, input };
  }

  private async handleFileSelected(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;

    this.customPhotoBtn.disabled = true;
    this.customPhotoBtn.textContent = 'Обрабатываем фото…';
    try {
      const processed = await removeBackgroundAndCrop(file);
      this.callbacks.onUpdate({
        customPlowDataUrl: processed,
        customPlowVersion: this.currentSettings.customPlowVersion + 1,
        plowStyle: 'custom'
      });
      this.callbacks.onTriggerPlow();
    } catch {
      this.customPhotoBtn.textContent = 'Не удалось загрузить фото';
    } finally {
      this.customPhotoBtn.disabled = false;
    }
  }

  applySettings(settings: AppSettings): void {
    this.currentSettings = settings;

    this.pauseBtn.textContent = settings.isPaused ? '▶ Старт' : '⏸ Пауза';
    this.pauseBtn.classList.toggle('sf-btn-primary', settings.isPaused);

    for (const [id, btn] of this.intensityBtns) {
      btn.classList.toggle('active', settings.intensity === id);
    }

    this.windSlider.value = String(settings.windStrength);
    this.windLabelEl.textContent = this.formatWindLabel(settings.windStrength);

    for (const [id, btn] of this.toolBtns) {
      btn.classList.toggle('active', settings.activeTool === id);
    }

    for (const [id, btn] of this.garlandBtns) {
      btn.classList.toggle('active', settings.garlandMode === id);
    }

    for (const [id, btn] of this.plowBtns) {
      btn.classList.toggle('active', settings.plowStyle === id);
    }

    this.customPhotoRow.style.display = settings.plowStyle === 'custom' ? 'block' : 'none';
    this.customPhotoBtn.textContent = settings.customPlowDataUrl
      ? '🖼 Сменить фото…'
      : '🖼 Выбрать фото (фон уберётся сам)…';

    this.liveWallCheckbox.checked = settings.liveWallpaperEnabled;
    this.autoPlowCheckbox.checked = settings.autoPlowEnabled;
    this.plowWinCheckbox.checked = settings.plowOnWindows;
    if (this.pauseFSCheckbox) this.pauseFSCheckbox.checked = settings.pauseOnFullscreen;
    if (this.launchCheckbox) this.launchCheckbox.checked = settings.launchAtLogin;
    if (this.virtualWinCheckbox) this.virtualWinCheckbox.checked = settings.virtualWindowsEnabled;
    if (this.tiltWindCheckbox) this.tiltWindCheckbox.checked = settings.tiltWindEnabled;
  }

  private formatWindLabel(wind: number): string {
    if (Math.abs(wind) < 0.08) return 'Штиль';
    const dir = wind < 0 ? 'Запад' : 'Восток';
    const pct = Math.round(Math.abs(wind) * 100);
    return `${dir} ${pct}%`;
  }
}
