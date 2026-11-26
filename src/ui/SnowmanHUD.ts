export class SnowmanHUD {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, isTouch: boolean, onExit: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'snowman-hud hidden';

    const hint = isTouch
      ? '☃️ Режим снеговика: проведите пальцем, чтобы скатать шар'
      : '☃️ Режим снеговика: зажмите и тяните мышь, чтобы скатать шар';

    this.el.innerHTML = `
      <span class="snowman-hud-text">${hint}</span>
      <button type="button" class="sf-btn sf-btn-small sf-btn-primary snowman-hud-done">
        Готово${isTouch ? '' : ' (Esc)'}
      </button>
    `;

    const btn = this.el.querySelector('.snowman-hud-done') as HTMLButtonElement;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onExit();
    });
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());

    parent.appendChild(this.el);
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }
}
