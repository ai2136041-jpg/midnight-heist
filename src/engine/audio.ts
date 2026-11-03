import type { NoiseKind } from '../game/noise'
import type { MoveKind } from '../game/player'

/** Small procedural audio layer: no external files, starts only after the first user gesture. */
export class Audio {
  private ctx?: globalThis.AudioContext
  private master?: GainNode
  private music?: GainNode
  private sfx?: GainNode
  private musicTimer?: number
  private musicVol = 0.6
  private sfxVol = 0.85
  private muted = false
  private threat = 0
  private nextBeat = 0

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.music = this.ctx.createGain()
      this.sfx = this.ctx.createGain()
      this.music.connect(this.master)
      this.sfx.connect(this.master)
      this.master.connect(this.ctx.destination)
      this.scheduleMusic()
    }
    this.ctx.resume().catch(() => undefined)
    this.apply()
  }
  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVol = music; this.sfxVol = sfx; this.muted = muted; this.apply()
  }
  private apply(): void {
    if (!this.ctx) return
    this.music?.gain.setTargetAtTime(this.muted ? 0 : this.musicVol * 0.18, this.ctx.currentTime, 0.04)
    this.sfx?.gain.setTargetAtTime(this.muted ? 0 : this.sfxVol, this.ctx.currentTime, 0.04)
  }
  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.1, out = this.sfx): void {
    if (!this.ctx || !out || this.muted) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator(); const g = this.ctx.createGain()
    osc.type = type; osc.frequency.setValueAtTime(freq, now)
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(g); g.connect(out); osc.start(now); osc.stop(now + duration + 0.02)
  }
  private scheduleMusic(): void {
    if (!this.ctx || this.musicTimer) return
    const tick = () => {
      if (!this.ctx) return
      const base = this.threat > 1 ? 110 : this.threat > 0 ? 146.83 : 73.42
      this.tone(base, 0.48, 'triangle', 0.08, this.music)
      this.tone(base * 1.5, 0.22, 'sine', 0.035, this.music)
      this.musicTimer = window.setTimeout(tick, this.threat > 1 ? 420 : 780)
    }
    tick()
  }
  setThreat(value: number): void { this.threat = Math.max(0, Math.min(2, value)) }
  step(kind: MoveKind): void {
    const f = kind === 'sprint' ? 95 : kind === 'sneak' ? 180 : 130
    this.tone(f, 0.06, 'square', kind === 'sprint' ? 0.045 : 0.025)
  }
  noise(kind: NoiseKind): void {
    if (kind === 'player') return
    const map: Record<string, [number, number]> = { steal: [680, 0.16], coin: [900, 0.12], lock: [420, 0.18], alarm: [180, 0.5], glass: [1200, 0.28], laser: [260, 0.12], maker: [300, 0.22] }
    const [f, d] = map[kind] ?? [240, 0.1]
    this.tone(f, d, kind === 'glass' ? 'sawtooth' : 'sine', 0.1)
  }
  alert(kind: 'question' | 'exclamation'): void {
    this.tone(kind === 'exclamation' ? 260 : 520, 0.18, 'sawtooth', 0.13)
  }
  coin(): void { this.tone(880, 0.09, 'sine', 0.12); window.setTimeout(() => this.tone(1320, 0.12, 'sine', 0.1), 65) }
  caught(): void { this.tone(80, 0.65, 'sawtooth', 0.2) }
  /** Tension heartbeat while hidden; intensity 0..1 raises volume and rate. */
  heartbeat(intensity: number): void {
    if (!this.ctx || this.muted) return
    const now = this.ctx.currentTime
    const period = 1.05 - intensity * 0.55
    if (now < this.nextBeat) return
    this.nextBeat = now + period
    const volume = 0.04 + intensity * 0.13
    this.tone(62, 0.13, 'sine', volume)
    window.setTimeout(() => this.tone(48, 0.17, 'sine', volume * 0.85), 150)
  }
  dispose(): void { if (this.musicTimer) window.clearTimeout(this.musicTimer); this.ctx?.close().catch(() => undefined) }
}
