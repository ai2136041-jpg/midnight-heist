export type NoiseKind = 'player' | 'steal' | 'glass' | 'coin' | 'maker' | 'laser' | 'lock' | 'alarm'
export type NoiseEvent = { x: number; z: number; radius: number; kind: NoiseKind; player: boolean }

/** One-step event bus: gameplay emits, guards consume in the same step, visuals subscribe. */
export class NoiseBus {
  events: NoiseEvent[] = []
  private subs: Array<(e: NoiseEvent) => void> = []
  emit(x: number, z: number, radius: number, kind: NoiseKind, player = false): void {
    const e = { x, z, radius, kind, player }
    this.events.push(e)
    for (const fn of this.subs) fn(e)
  }
  onEmit(fn: (e: NoiseEvent) => void): void {
    this.subs.push(fn)
  }
  clear(): void {
    this.events.length = 0
  }
}
