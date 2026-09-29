/** Keyboard + mouse state, with per-frame edge detection. */
import { H, W } from './config';

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyP', 'KeyM', 'KeyC', 'Escape', 'Enter', 'Tab',
]);

export interface Click {
  x: number;
  y: number;
  button: number;
}

export class Input {
  private held = new Set<string>();
  private edges = new Set<string>();
  private clickQueue: Click[] = [];
  mouse: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('mousemove', (e) => (this.mouse = this.toGame(e)));
    canvas.addEventListener('mouseleave', () => (this.mouse = null));
    canvas.addEventListener('mousedown', (e) => {
      const p = this.toGame(e);
      this.mouse = p;
      this.clickQueue.push({ ...p, button: e.button });
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private toGame(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /** Key went down since the last `endFrame`. */
  pressed(...codes: string[]): boolean {
    return codes.some((c) => this.edges.has(c));
  }

  takeClicks(): Click[] {
    const c = this.clickQueue;
    this.clickQueue = [];
    return c;
  }

  endFrame(): void {
    this.edges.clear();
  }
}
