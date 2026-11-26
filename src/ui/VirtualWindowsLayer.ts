import type { TrackedWindow, WindowSnapshot } from '../core/types';

interface VirtualCard {
  id: string;
  title: string;
  subtitle: string;
  xRatio: number;
  yRatio: number;
  width: number;
  height: number;
  el: HTMLDivElement;
}

/**
 * Interactive draggable winter cards for Web, iOS, Android, and Electron Sandbox mode.
 * Exposes their bounding rects in bottom-left coordinates to SnowSimulation so
 * snowdrifts, garlands, snowballs, and snowplows interact with them just like OS windows.
 */
export class VirtualWindowsLayer {
  private readonly container: HTMLDivElement;
  private cards: VirtualCard[] = [];
  private visible = false;
  private zCounter = 10;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'virtual-windows-layer';
    parent.appendChild(this.container);
    this.createDefaultCards();
  }

  private createDefaultCards(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isNarrow = w < 640;

    const specs = isNarrow
      ? [
          {
            id: 'card-1',
            title: '❄️ Зимнее окно',
            subtitle: 'Потяните окно вверх-вниз — снег осыплется, а гирлянда качнётся',
            x: Math.max(16, (w - Math.min(280, w - 32)) * 0.5),
            y: Math.max(76, h * 0.19),
            width: Math.min(280, w - 32),
            height: 112
          },
          {
            id: 'card-2',
            title: '☃️ Совет',
            subtitle: 'Переключайте «Варежку» и «Снеговика» в настройках справа вверху',
            x: Math.max(20, (w - Math.min(250, w - 40)) * 0.5),
            y: Math.max(210, h * 0.44),
            width: Math.min(250, w - 40),
            height: 102
          }
        ]
      : [
          {
            id: 'card-1',
            title: '❄️ Зимнее окно',
            subtitle: 'Перетаскивайте окно — гирлянды качаются, а сугробы осыпаются!',
            x: Math.round(w * 0.14),
            y: Math.round(h * 0.22),
            width: 310,
            height: 150
          },
          {
            id: 'card-2',
            title: '☃️ Мастерская снеговиков',
            subtitle: 'Включите инструмент «Снеговик», скатайте 3 шара и поставьте их друг на друга',
            x: Math.round(w * 0.52),
            y: Math.round(h * 0.36),
            width: 300,
            height: 140
          }
        ];

    for (const s of specs) {
      const el = document.createElement('div');
      el.className = 'virtual-window';
      el.style.width = `${s.width}px`;
      el.style.height = `${s.height}px`;
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y}px`;
      el.innerHTML = `
        <div class="vw-titlebar">
          <span class="vw-dots"><span></span><span></span><span></span></span>
          <span class="vw-title">${s.title}</span>
        </div>
        <div class="vw-body">${s.subtitle}</div>
      `;

      const card: VirtualCard = {
        id: s.id,
        title: s.title,
        subtitle: s.subtitle,
        xRatio: s.x / Math.max(1, w),
        yRatio: s.y / Math.max(1, h),
        width: s.width,
        height: s.height,
        el
      };
      this.attachDrag(card);
      this.container.appendChild(el);
      this.cards.push(card);
    }
  }

  private attachDrag(card: VirtualCard): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      card.el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(card.el.style.left || '0');
      origTop = parseFloat(card.el.style.top || '0');
      card.el.style.zIndex = String(++this.zCounter);
      // Put moved card at front of array (top Z-order)
      this.cards = [card, ...this.cards.filter((c) => c !== card)];
      e.stopPropagation();
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nextX = Math.max(4, Math.min(vw - card.width - 4, origLeft + (e.clientX - startX)));
      const nextY = Math.max(54, Math.min(vh - card.height - 20, origTop + (e.clientY - startY)));
      card.el.style.left = `${nextX}px`;
      card.el.style.top = `${nextY}px`;
      card.xRatio = nextX / Math.max(1, vw);
      card.yRatio = nextY / Math.max(1, vh);
      e.stopPropagation();
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        card.el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.stopPropagation();
    };

    card.el.addEventListener('pointerdown', onDown);
    card.el.addEventListener('pointermove', onMove);
    card.el.addEventListener('pointerup', onUp);
    card.el.addEventListener('pointercancel', onUp);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }

  setInteractive(interactive: boolean): void {
    this.container.style.pointerEvents = interactive ? 'auto' : 'none';
    for (const c of this.cards) {
      c.el.style.pointerEvents = interactive ? 'auto' : 'none';
    }
  }

  handleResize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const c of this.cards) {
      const clampedW = Math.min(c.width, Math.max(180, vw - 24));
      c.el.style.width = `${clampedW}px`;
      const x = Math.max(4, Math.min(vw - clampedW - 4, parseFloat(c.el.style.left || '0')));
      const y = Math.max(54, Math.min(vh - c.height - 20, parseFloat(c.el.style.top || '0')));
      c.el.style.left = `${x}px`;
      c.el.style.top = `${y}px`;
    }
  }

  captureSnapshot(viewportHeight: number): WindowSnapshot {
    if (!this.visible) {
      return { windows: [] };
    }
    const windows: TrackedWindow[] = [];
    for (const card of this.cards) {
      const r = card.el.getBoundingClientRect();
      windows.push({
        id: card.id,
        rect: {
          x: r.left,
          y: viewportHeight - r.bottom,
          width: r.width,
          height: r.height
        }
      });
    }
    return { windows };
  }
}
