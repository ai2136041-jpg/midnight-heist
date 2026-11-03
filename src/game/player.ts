import * as THREE from 'three'
import { CONFIG } from './config'
import type { Grid, Vec2 } from './grid'
import type { HideDef } from './levels'
import type { Models } from './models'
import { bagSpeedMul, speedBonus, sprintDrain, staminaMax, type NoiseKind, type Upgrades } from './rules'

type MoveKind = 'still' | 'sneak' | 'walk' | 'sprint'
export type { MoveKind }
/** Rotation (radians) applied to generated character models so their front matches the move direction. */
export const MODEL_YAW_OFFSET = Math.PI / 2

export type Intent = {
  /** World-space direction, length <= 1 (+x right, +z towards the camera). */
  mx: number
  mz: number
  sneak: boolean
  sprint: boolean
}

export type PlayerEvents = {
  step: (kind: MoveKind, x: number, z: number) => void
}

/** Shared animated-character helper (used by the player and the guards). */
export class Character {
  readonly root = new THREE.Group()
  readonly inner = new THREE.Group()
  private mixer?: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private current = ''
  private lean = 0
  private leanTarget = 0
  constructor(models: Models, name: 'thief' | 'guard', fallbackColor: number) {
    this.root.add(this.inner)
    const inst = models.instance(name)
    if (inst) {
      this.inner.add(inst)
      this.mixer = new THREE.AnimationMixer(inst)
      for (const clip of models.clips(name)) {
        const a = this.mixer.clipAction(clip)
        this.actions.set(clip.name, a)
      }
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.7 }))
      body.position.y = 0.75
      body.castShadow = true
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff }))
      nose.position.set(0.25, 1.2, 0)
      this.inner.add(body, nose)
    }
  }
  has(name: string): boolean {
    return this.actions.has(name)
  }
  play(name: string, opts: { fade?: number; speed?: number; once?: boolean } = {}): void {
    const a = this.actions.get(name)
    if (!a) return
    if (this.current !== name) {
      const prev = this.actions.get(this.current)
      a.reset()
      a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, opts.once ? 1 : Infinity)
      a.clampWhenFinished = !!opts.once
      a.enabled = true
      a.setEffectiveWeight(1)
      a.fadeIn(opts.fade ?? 0.2).play()
      prev?.fadeOut(opts.fade ?? 0.2)
      this.current = name
    }
    a.setEffectiveTimeScale(opts.speed ?? 1)
  }
  setLean(v: number): void {
    this.leanTarget = v
  }
  update(dt: number): void {
    this.mixer?.update(dt)
    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 10)
    this.inner.rotation.z = -this.lean
    this.inner.position.y = -Math.abs(this.lean) * 0.12
  }
  faceYaw(yaw: number): void {
    // Direction convention: yaw -> (sin yaw, cos yaw). Models face +x at rotation 0 after normalisation.
    this.root.rotation.y = yaw - MODEL_YAW_OFFSET
  }
  get animationNames(): string[] {
    return [...this.actions.keys()]
  }
}

export class Player {
  readonly char: Character
  readonly pos: Vec2 = { x: 0, z: 0 }
  readonly vel: Vec2 = { x: 0, z: 0 }
  yaw = 0
  stamina = 100
  exhausted = false
  private regenTimer = 0
  kind: MoveKind = 'still'
  hidden = false
  hideCooldown = 0
  hideBlend = 0
  hideSpot?: HideDef
  hideTime = 0
  caught = false
  working = false
  private enterFrom: Vec2 = { x: 0, z: 0 }
  private stepAcc = 0
  distanceMoved = 0
  hurtTimer = 0

  constructor(models: Models, private readonly events: PlayerEvents) {
    this.char = new Character(models, 'thief', 0x3a4a8a)
    this.char.root.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = true
    })
  }

  get root(): THREE.Group {
    return this.char.root
  }

  reset(x: number, z: number, ups: Upgrades): void {
    this.pos.x = x
    this.pos.z = z
    this.vel.x = 0
    this.vel.z = 0
    this.yaw = 0
    this.stamina = staminaMax(ups)
    this.exhausted = false
    this.hidden = false
    this.hideCooldown = 0
    this.hideBlend = 0
    this.hideSpot = undefined
    this.caught = false
    this.working = false
    this.kind = 'still'
    this.stepAcc = 0
    this.distanceMoved = 0
    this.char.root.visible = true
    this.char.root.position.set(x, 0, z)
    this.char.play('idle', { fade: 0.01 })
  }

  enterHide(spot: HideDef): void {
    this.hideSpot = spot
    this.hidden = true
    this.hideTime = 0
    this.enterFrom = { x: this.pos.x, z: this.pos.z }
    this.vel.x = 0
    this.vel.z = 0
    this.kind = 'still'
  }

  leaveHide(grid: Grid): void {
    if (!this.hidden || this.hideCooldown > 0) return
    const spot = this.hideSpot
    if (spot) {
      const candidates = [{ x: spot.x, z: spot.z + 1.15 }, { x: spot.x + 1.1, z: spot.z }, { x: spot.x - 1.1, z: spot.z }, { x: spot.x, z: spot.z - 1.1 }]
      const f = candidates.find(p => grid.clear(p.x, p.z, CONFIG.player.radius)) ?? grid.nearestFree(spot.x, spot.z + 1.0, 5)
      if (f) { this.pos.x = f.x; this.pos.z = f.z }
    }
    this.hidden = false
    this.hideCooldown = 0.5
    this.hideSpot = undefined
  }

  update(dt: number, intent: Intent, grid: Grid, ups: Upgrades, bagUsed: number, bagCap: number, frozen: boolean): void {
    this.hideCooldown = Math.max(0, this.hideCooldown - dt)
    this.hurtTimer = Math.max(0, this.hurtTimer - dt)
    const maxStam = staminaMax(ups)
    if (this.caught) {
      this.char.update(dt)
      return
    }
    if (this.hidden) {
      this.hideTime += dt
      this.hideBlend = Math.min(1, this.hideBlend + dt / CONFIG.player.hideEnterTime)
      const spot = this.hideSpot!
      const t = this.hideBlend
      this.pos.x = this.enterFrom.x + (spot.x - this.enterFrom.x) * t
      this.pos.z = this.enterFrom.z + (spot.z - this.enterFrom.z) * t
      this.kind = 'still'
      this.stamina = Math.min(maxStam, this.stamina + CONFIG.player.staminaRegen * 1.5 * dt)
      this.char.root.visible = this.hideBlend < 0.7
      this.char.root.position.set(this.pos.x, 0, this.pos.z)
      this.char.update(dt)
      return
    }
    this.hideBlend = Math.max(0, this.hideBlend - dt * 4)
    this.char.root.visible = true

    const want = Math.hypot(intent.mx, intent.mz)
    let kind: MoveKind = 'still'
    if (!frozen && want > 0.08) {
      kind = intent.sneak ? 'sneak' : 'walk'
      if (intent.sprint && !intent.sneak && !this.exhausted && this.stamina > 1) kind = 'sprint'
    }
    this.kind = kind
    // stamina
    if (kind === 'sprint') {
      this.stamina = Math.max(0, this.stamina - sprintDrain(ups) * dt)
      this.regenTimer = CONFIG.player.staminaRegenDelay
      if (this.stamina <= 0) this.exhausted = true
    } else {
      this.regenTimer = Math.max(0, this.regenTimer - dt)
      if (this.regenTimer <= 0) this.stamina = Math.min(maxStam, this.stamina + CONFIG.player.staminaRegen * dt)
    }
    if (this.exhausted && this.stamina >= CONFIG.player.sprintResume) this.exhausted = false

    const base = kind === 'sneak' ? CONFIG.player.sneakSpeed : kind === 'sprint' ? CONFIG.player.sprintSpeed : kind === 'walk' ? CONFIG.player.walkSpeed : 0
    const speed = base * speedBonus(ups) * bagSpeedMul(bagUsed, bagCap)
    const dirLen = want > 1e-4 ? want : 1
    const tx = (intent.mx / dirLen) * speed
    const tz = (intent.mz / dirLen) * speed
    const rate = (want > 0.08 && !frozen ? CONFIG.player.acceleration : CONFIG.player.deceleration) * dt
    const dx = tx - this.vel.x
    const dz = tz - this.vel.z
    const dl = Math.hypot(dx, dz)
    if (dl <= rate || dl < 1e-6) {
      this.vel.x = tx
      this.vel.z = tz
    } else {
      this.vel.x += (dx / dl) * rate
      this.vel.z += (dz / dl) * rate
    }
    const before = { x: this.pos.x, z: this.pos.z }
    grid.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, CONFIG.player.radius)
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z)
    this.distanceMoved += moved
    const sp = moved / Math.max(dt, 1e-6)
    if (sp > 0.25) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z)
      let diff = targetYaw - this.yaw
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.yaw += diff * Math.min(1, CONFIG.player.turnSpeed * dt)
    }
    // footsteps
    if (kind !== 'still' && sp > 0.4) {
      this.stepAcc += moved
      const stride = kind === 'sprint' ? 1.35 : kind === 'walk' ? 0.95 : 0.7
      if (this.stepAcc >= stride) {
        this.stepAcc = 0
        this.events.step(kind, this.pos.x, this.pos.z)
      }
    }
    // animation
    const ch = this.char
    if (this.working) {
      ch.play('idle', { speed: 1 })
      ch.setLean(-0.45)
    } else if (sp < 0.3) {
      ch.play('idle', { speed: 1 })
      ch.setLean(0)
    } else if (kind === 'sprint') {
      ch.play('run', { speed: Math.max(0.8, sp / 4.2) })
      ch.setLean(-0.12)
    } else {
      ch.play('walk', { speed: Math.max(0.5, sp / 1.7) })
      ch.setLean(kind === 'sneak' ? -0.38 : 0)
    }
    ch.faceYaw(this.yaw)
    ch.root.position.set(this.pos.x, 0, this.pos.z)
    ch.update(dt)
  }

  setCaught(): void {
    this.caught = true
    this.char.setLean(0)
    if (this.char.has('frightened')) this.char.play('frightened', { once: true, fade: 0.15 })
  }

  /** Noise category used by the noise system for continuous footsteps. */
  get noiseKind(): NoiseKind | MoveKind {
    return this.kind
  }
}
