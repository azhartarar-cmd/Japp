import { C } from '../palette';
import { drawTextCentered, textWidth } from '../render/font';
import { Framebuffer } from '../render/framebuffer';

export interface MenuItem {
  label: string;
  enabled?: boolean;
}

export const MENU_LINE = 10;

/** A vertical list of items with keyboard/mouse selection. */
export class Menu {
  index = 0;
  constructor(
    public items: MenuItem[],
    /** Vertical position of the first item. */
    public y: number,
  ) {
    this.index = this.firstEnabled();
  }

  private firstEnabled(): number {
    const i = this.items.findIndex((it) => it.enabled !== false);
    return i < 0 ? 0 : i;
  }

  move(dir: number): boolean {
    const n = this.items.length;
    for (let s = 1; s <= n; s++) {
      const i = (this.index + dir * s + n * s) % n;
      if (this.items[i].enabled !== false) {
        const changed = i !== this.index;
        this.index = i;
        return changed;
      }
    }
    return false;
  }

  get current(): MenuItem {
    return this.items[this.index];
  }

  /** Item under a screen-space point, or -1. */
  hit(x: number, y: number): number {
    for (let i = 0; i < this.items.length; i++) {
      const top = this.y + i * MENU_LINE - 2;
      if (y >= top && y < top + MENU_LINE && Math.abs(x - 160) < 70) return i;
    }
    return -1;
  }

  draw(fb: Framebuffer): void {
    this.items.forEach((it, i) => {
      const sel = i === this.index;
      const enabled = it.enabled !== false;
      const y = this.y + i * MENU_LINE;
      const color = !enabled ? C.INK : sel ? C.WHITE : C.SLATE;
      drawTextCentered(fb, it.label, 160, y, color);
      if (sel) {
        const half = textWidth(it.label) / 2;
        drawTextCentered(fb, '>', 160 - half - 7, y, C.YELLOW);
        drawTextCentered(fb, '<', 160 + half + 7, y, C.YELLOW);
      }
    });
  }
}
