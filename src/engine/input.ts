/**
 * Unified input for a top-down game: keyboard, touch (virtual stick + buttons) and gamepad all feed
 * one action state. Gameplay reads `move`/`held()`/`consume()`; it never checks raw keys.
 */
export type Action = 'interact' | 'tool' | 'cycle' | 'gadget1' | 'gadget2' | 'gadget3' | 'radar' | 'pause' | 'sneak' | 'sprint' | 'smash' | 'confirm' | 'cancel'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  interact: ['KeyE'],
  tool: ['KeyQ'],
  cycle: ['KeyC', 'Tab'], gadget1: ['Digit1'], gadget2: ['Digit2'], gadget3: ['Digit3'],
  radar: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  sneak: ['ShiftLeft', 'ShiftRight'],
  sprint: ['Space', 'ControlLeft', 'ControlRight'],
  smash: ['KeyF'],
  confirm: ['Enter', 'NumpadEnter'],
  cancel: [],
}
const MOVE_KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }
// Standard gamepad: A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Back=8 Start=9
const PAD_BINDINGS: Record<Action, number[]> = {
  interact: [0], tool: [2], cycle: [3], gadget1: [], gadget2: [], gadget3: [], radar: [1], pause: [9], sneak: [4], sprint: [7, 5], smash: [6], confirm: [0], cancel: [1],
}

export class Input {
  /** Movement intent: x right, y forward (screen up), length <= 1. */
  readonly move = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  /** Touch stick magnitude (0..1) so gameplay can map a light push to sneaking. */
  touchMagnitude = 0
  /** Accumulated zoom request (wheel / pinch), consumed by the camera. */
  private zoom = 0
  private keys = new Set<string>()
  private held_ = new Set<Action>()
  private pressed_ = new Set<Action>()
  private touchMove = { x: 0, y: 0 }
  private touchButtons = new Set<Action>()
  private padPrev: boolean[] = []
  private listeners: Array<() => void> = []
  /** When true (text fields etc.), keyboard actions are ignored. */
  blocked = false

  constructor(canvas: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', e => {
      if (e.repeat) return
      this.keys.add(e.code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
        if (codes.includes(e.code)) this.pressed_.add(action)
      }
      const typing = (e.target as HTMLElement | null)?.matches?.('input[type=text], textarea')
      if (!typing && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow'))) e.preventDefault()
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => {
      this.keys.clear()
      this.touchButtons.clear()
    })
    on(canvas, 'wheel', e => {
      this.pressed_.add(e.deltaY > 0 ? 'cycle' : 'gadget1')
      e.preventDefault()
    }, { passive: false })
  }

  setTouchMove(x: number, y: number): void {
    this.method = 'touch'
    this.touchMove.x = x
    this.touchMove.y = y
    this.touchMagnitude = Math.hypot(x, y)
  }
  setTouchButton(action: Action, down: boolean): void {
    this.method = 'touch'
    if (down && !this.touchButtons.has(action)) this.pressed_.add(action)
    if (down) this.touchButtons.add(action)
    else this.touchButtons.delete(action)
  }
  /** Pinch gesture: positive = zoom out. */
  addZoom(delta: number): void {
    this.zoom += delta
  }
  takeZoom(): number {
    const z = this.zoom
    this.zoom = 0
    return z
  }

  update(): void {
    const k = (codes: string[]) => !this.blocked && codes.some(code => this.keys.has(code))
    let x = (k(MOVE_KEYS.right) ? 1 : 0) - (k(MOVE_KEYS.left) ? 1 : 0)
    let y = (k(MOVE_KEYS.up) ? 1 : 0) - (k(MOVE_KEYS.down) ? 1 : 0)
    this.held_.clear()
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (k(codes)) this.held_.add(action)
    for (const action of this.touchButtons) this.held_.add(action)
    let mag = Math.hypot(x, y) > 0 ? 1 : 0
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      x = this.touchMove.x
      y = this.touchMove.y
      mag = Math.hypot(x, y)
    }
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v)
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
      const dy = (pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0)
      if (lx !== 0 || ly !== 0 || dx !== 0 || dy !== 0) {
        this.method = 'gamepad'
        x = dx || lx
        y = dy || -ly
        mag = Math.hypot(x, y)
        this.touchMagnitude = 0
      }
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) {
        if (buttons.some(i => pad.buttons[i]?.pressed)) this.held_.add(action)
        if (buttons.some(i => pad.buttons[i]?.pressed && !this.padPrev[i])) this.pressed_.add(action)
      }
      this.padPrev = pad.buttons.map(b => b.pressed)
    }
    const len = Math.hypot(x, y)
    this.move.x = len > 1 ? x / len : x
    this.move.y = len > 1 ? y / len : y
    void mag
  }

  held(action: Action): boolean {
    return this.held_.has(action)
  }
  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }
  /** Read and clear a press: exactly one trigger per physical press, even with several steps per frame. */
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }
  clearPresses(): void {
    this.pressed_.clear()
  }
  endFrame(): void {
    this.pressed_.clear()
  }
  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
