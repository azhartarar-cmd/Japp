/** Scene flow, fixed-timestep loop, input mapping, audio hookup. */
import { AudioEngine } from './audio/audio';
import { H, STEP_DT, W } from './config';
import { evaluate } from './game/scoring';
import { isUnlocked, loadSave, recordResult, writeSave } from './game/save';
import { NO_INPUT, PlayerInput, World, WorldEvent } from './game/world';
import { Input } from './input';
import { LEVELS } from './levels';
import { Framebuffer } from './render/framebuffer';
import { drawWorld } from './render/renderer';
import { Menu } from './ui/menu';
import {
  drawCaught,
  drawComplete,
  drawLevelSelect,
  drawPauseOverlay,
  drawTitle,
  Result,
} from './ui/screens';

type Scene = 'title' | 'select' | 'playing' | 'paused' | 'complete' | 'caught';

interface MenuDef {
  menu: Menu;
  actions: (() => void)[];
}

export class App {
  private fb = new Framebuffer();
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private input: Input;
  private audio = new AudioEngine();
  private save = loadSave();

  private scene: Scene = 'title';
  private world: World | null = null;
  private levelIndex = 0;
  private result: Result | null = null;
  private sceneTime = 0;
  private acc = 0;
  private last = 0;

  private menus: Record<'title' | 'select' | 'paused' | 'complete' | 'caught', MenuDef>;

  constructor(
    private canvas: HTMLCanvasElement,
    private scan: HTMLElement,
  ) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(W, H);
    this.input = new Input(canvas);
    this.audio.setMuted(this.save.muted);

    this.menus = {
      title: this.makeMenu(),
      select: this.makeMenu(),
      paused: this.makeMenu(),
      complete: this.makeMenu(),
      caught: this.makeMenu(),
    };
    this.rebuildMenus();

    window.addEventListener('resize', () => this.layout());
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => document.hidden && this.autoPause());
    this.layout();
    this.applyCrt();
  }

  start(): void {
    this.last = performance.now();
    const loop = (ts: number): void => {
      this.frame(Math.min(0.1, (ts - this.last) / 1000));
      this.last = ts;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Test/debug hook. */
  get debug() {
    return { scene: this.scene, world: this.world, level: this.levelIndex, save: this.save };
  }

  // ---- layout -----------------------------------------------------------------

  /** Integer scaling in device pixels, letterboxed by the black page background. */
  private layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H)));
    this.canvas.style.width = `${(W * k) / dpr}px`;
    this.canvas.style.height = `${(H * k) / dpr}px`;
    this.scan.style.width = this.canvas.style.width;
    this.scan.style.height = this.canvas.style.height;
    this.scan.style.setProperty('--px', `${k / dpr}px`);
  }

  private applyCrt(): void {
    this.scan.classList.toggle('on', this.save.crt);
  }

  // ---- menus ------------------------------------------------------------------

  private makeMenu(): MenuDef {
    return { menu: new Menu([], 100), actions: [] };
  }

  private set(def: MenuDef, y: number, entries: [string, () => void, boolean?][]): void {
    const prev = def.menu.index;
    def.menu.y = y;
    def.menu.items = entries.map(([label, , enabled]) => ({ label, enabled }));
    def.actions = entries.map(([, fn]) => fn);
    def.menu.index = Math.min(prev, entries.length - 1);
    if (def.menu.current.enabled === false) def.menu.move(1);
  }

  private rebuildMenus(): void {
    const ids = LEVELS.map((l) => l.id);
    const crt = (): [string, () => void] => [
      `CRT SCANLINES: ${this.save.crt ? 'ON' : 'OFF'}`,
      () => {
        this.save.crt = !this.save.crt;
        this.applyCrt();
        this.persist();
        this.rebuildMenus();
      },
    ];
    const snd = (): [string, () => void] => [
      `SOUND: ${this.audio.muted ? 'OFF' : 'ON'}`,
      () => this.toggleMute(),
    ];

    this.set(this.menus.title, 104, [
      ['PLAY', () => this.startLevel(this.nextLevelIndex())],
      ['LEVEL SELECT', () => this.go('select')],
      crt(),
      snd(),
    ]);

    this.set(this.menus.select, 44, [
      ...LEVELS.map((l, i): [string, () => void, boolean] => [
        `${i + 1}. ${l.name}`,
        () => this.startLevel(i),
        isUnlocked(this.save, ids, i),
      ]),
      ['BACK', () => this.go('title')],
    ]);

    this.set(this.menus.paused, 66, [
      ['RESUME', () => this.go('playing')],
      ['RESTART LEVEL', () => this.startLevel(this.levelIndex)],
      ['LEVEL SELECT', () => this.go('select')],
      crt(),
      snd(),
      ['QUIT TO TITLE', () => this.go('title')],
    ]);

    const hasNext = this.levelIndex + 1 < LEVELS.length;
    this.set(this.menus.complete, 122, [
      ...(hasNext ? [['NEXT LEVEL', () => this.startLevel(this.levelIndex + 1)] as [string, () => void]] : []),
      ['PLAY AGAIN', () => this.startLevel(this.levelIndex)],
      ['LEVEL SELECT', () => this.go('select')],
    ]);

    this.set(this.menus.caught, 100, [
      ['TRY AGAIN', () => this.startLevel(this.levelIndex)],
      ['LEVEL SELECT', () => this.go('select')],
    ]);
  }

  private toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.save.muted = this.audio.muted;
    this.persist();
    this.rebuildMenus();
  }

  private persist(): void {
    writeSave(this.save);
  }

  private nextLevelIndex(): number {
    const ids = LEVELS.map((l) => l.id);
    for (let i = 0; i < LEVELS.length; i++) {
      if (isUnlocked(this.save, ids, i) && !this.save.completed[ids[i]]) return i;
    }
    return 0;
  }

  // ---- scene control ------------------------------------------------------------

  private go(scene: Scene): void {
    this.scene = scene;
    this.sceneTime = 0;
    this.acc = 0;
    this.rebuildMenus();
    if (scene === 'select') {
      const m = this.menus.select.menu;
      m.index = Math.min(this.levelIndex, m.items.length - 1);
    }
  }

  private startLevel(i: number): void {
    this.levelIndex = i;
    this.world = new World(LEVELS[i], (Date.now() & 0xffff) + 1);
    this.result = null;
    this.go('playing');
  }

  private autoPause(): void {
    if (this.scene === 'playing') this.go('paused');
  }

  // ---- frame ------------------------------------------------------------------------

  private frame(dt: number): void {
    this.sceneTime += dt;
    const anyKey = this.input.pressed(
      'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'KeyR',
    );
    const clicks = this.input.takeClicks();
    if (anyKey || clicks.length) this.audio.unlock();

    if (this.input.pressed('KeyM')) this.toggleMute();
    if (this.input.pressed('KeyC')) this.menus.title.actions[2]();

    switch (this.scene) {
      case 'playing':
        this.framePlaying(dt, clicks);
        break;
      case 'title':
      case 'select':
      case 'paused':
      case 'complete':
      case 'caught':
        this.frameMenu(this.scene, clicks);
        break;
    }
    this.render();
    this.input.endFrame();
  }

  private frameMenu(scene: 'title' | 'select' | 'paused' | 'complete' | 'caught', clicks: { x: number; y: number }[]): void {
    const def = this.menus[scene];
    const inp = this.input;
    if (inp.pressed('ArrowDown', 'KeyS') && def.menu.move(1)) this.audio.blip();
    if (inp.pressed('ArrowUp', 'KeyW') && def.menu.move(-1)) this.audio.blip();

    if (inp.mouse) {
      const h = def.menu.hit(inp.mouse.x, inp.mouse.y);
      if (h >= 0 && def.menu.items[h].enabled !== false && h !== def.menu.index) {
        def.menu.index = h;
      }
    }
    let activate = inp.pressed('Enter', 'Space');
    for (const c of clicks) {
      const h = def.menu.hit(c.x, c.y);
      if (h >= 0 && def.menu.items[h].enabled !== false) {
        def.menu.index = h;
        activate = true;
      }
    }
    if (activate) {
      this.audio.blip(true);
      def.actions[def.menu.index]?.();
      return;
    }
    if (inp.pressed('Escape')) {
      if (scene === 'paused') this.go('playing');
      else if (scene === 'select') this.go('title');
      else if (scene === 'complete' || scene === 'caught') this.go('select');
    }
    if (inp.pressed('KeyR') && (scene === 'paused' || scene === 'caught' || scene === 'complete')) {
      this.startLevel(this.levelIndex);
    }
  }

  private framePlaying(dt: number, clicks: { x: number; y: number; button: number }[]): void {
    const world = this.world!;
    const inp = this.input;
    if (inp.pressed('KeyR')) return this.startLevel(this.levelIndex);
    if (inp.pressed('Escape', 'KeyP')) return this.go('paused');

    const base: PlayerInput = {
      ...NO_INPUT,
      dx: (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0),
      dy: (inp.down('KeyS', 'ArrowDown') ? 1 : 0) - (inp.down('KeyW', 'ArrowUp') ? 1 : 0),
      sneak: inp.down('ShiftLeft', 'ShiftRight'),
      run: inp.down('Space'),
    };
    // One-shot actions ride on the first simulation step of this frame.
    const oneShot: Partial<PlayerInput> = { bell: inp.pressed('KeyE') };
    for (const c of clicks) {
      if (c.button === 0) oneShot.throwAt = { x: c.x - world.ox, y: c.y - world.oy };
      else if (c.button === 2) oneShot.bell = true;
    }

    this.acc += dt;
    let first = true;
    while (this.acc >= STEP_DT) {
      this.acc -= STEP_DT;
      world.update(STEP_DT, first ? { ...base, ...oneShot } : base);
      first = false;
      this.handleEvents(world.drainEvents());
      if (world.status !== 'playing') break;
    }
  }

  private handleEvents(events: WorldEvent[]): void {
    const a = this.audio;
    for (const e of events) {
      switch (e.type) {
        case 'sound': {
          const s = e.sound;
          if (s.source === 'player') a.step(s.surface, s.gait ?? 'walk');
          else if (s.source === 'pebble') a.pebble(s.surface);
          else if (s.source === 'bell') a.bell();
          break;
        }
        case 'pebbleThrown':
          a.pebbleThrow();
          break;
        case 'guardStep':
          a.guardStep(e.surface, e.intensity, e.pan, e.hunting);
          break;
        case 'guardAlert':
          a.guardAlert(e.to === 'hunting' ? 'hunting' : 'suspicious', e.intensity, e.pan);
          break;
        case 'beacon':
          a.beacon(e.kind, e.intensity, e.pan);
          break;
        case 'artifact':
          a.pickup();
          break;
        case 'caught':
          a.fail();
          this.go('caught');
          break;
        case 'complete':
          a.victory();
          this.finishLevel();
          break;
      }
    }
  }

  private finishLevel(): void {
    const world = this.world!;
    const level = LEVELS[this.levelIndex];
    const { score, rank } = evaluate(level, world.stats);
    const { newBest, bestRank } = recordResult(this.save, level.id, {
      rank,
      score,
      time: world.stats.time,
      sounds: world.stats.sounds,
    });
    this.persist();
    this.result = {
      rank,
      score,
      sounds: world.stats.sounds,
      pebbles: world.stats.pebblesUsed,
      bell: world.stats.bellUsed,
      time: world.stats.time,
      newBest,
      bestRank,
    };
    this.go('complete');
  }

  private render(): void {
    const fb = this.fb;
    const t = this.sceneTime;
    switch (this.scene) {
      case 'title':
        drawTitle(fb, this.menus.title.menu, t, 'A STEALTH GAME OF SOUND');
        break;
      case 'select': {
        const ids = LEVELS.map((l) => l.id);
        drawLevelSelect(
          fb,
          this.menus.select.menu,
          LEVELS.map((l, i) => ({
            name: l.name,
            unlocked: isUnlocked(this.save, ids, i),
            best: this.save.completed[l.id]?.rank ?? null,
          })),
          t,
        );
        break;
      }
      case 'playing':
        drawWorld(fb, this.world!, { mouse: this.input.mouse });
        break;
      case 'paused':
        drawWorld(fb, this.world!, { mouse: null });
        drawPauseOverlay(fb, this.menus.paused.menu);
        break;
      case 'complete':
        drawComplete(fb, this.menus.complete.menu, this.result!, LEVELS[this.levelIndex].name);
        break;
      case 'caught':
        drawCaught(fb, this.menus.caught.menu, t);
        break;
    }
    fb.flush(this.img);
    this.ctx.putImageData(this.img, 0, 0);
  }
}
