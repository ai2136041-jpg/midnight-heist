/**
 * Fixed-step game loop: simulation runs at a stable rate, rendering interpolates.
 * Gameplay only ever changes inside `step()`; `render()` is purely visual.
 */
export type GameLoopHooks = {
  /** Called once per animation frame before stepping (input polling, UI refresh). */
  beforeFrame?: () => void
  /** Fixed simulation step in seconds. */
  step: (dt: number) => void
  /** Draw with an interpolation alpha (0..1) for the time since the last step. */
  render: (alpha: number, dt: number) => void
}

export class GameLoop {
  readonly fixedStep: number
  private accumulator = 0
  private last = 0
  private raf = 0
  private running = false
  private readonly maxFrame = 0.25
  private readonly maxSteps = 5
  /** Smoothed frames per second, for debug overlays. */
  fps = 0

  constructor(private readonly hooks: GameLoopHooks, fixedStep = 1 / 60) {
    this.fixedStep = fixedStep
    this.tick = this.tick.bind(this)
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.accumulator = 0
    this.raf = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private tick(now: number): void {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)
    const frame = Math.min(this.maxFrame, Math.max(0, (now - this.last) / 1000))
    this.last = now
    this.accumulator += frame
    if (frame > 0) this.fps += (1 / frame - this.fps) * 0.1

    this.hooks.beforeFrame?.()

    let steps = 0
    while (this.accumulator >= this.fixedStep && steps < this.maxSteps) {
      this.hooks.step(this.fixedStep)
      this.accumulator -= this.fixedStep
      steps += 1
    }
    // If the frame was too slow, drop the backlog instead of spiralling.
    if (steps === this.maxSteps) this.accumulator = 0

    this.hooks.render(this.accumulator / this.fixedStep, frame)
  }
}
