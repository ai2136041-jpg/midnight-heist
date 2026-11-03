import * as THREE from 'three'
import { CONFIG, DIFFICULTY, type Difficulty } from './config'
import type { Grid, Vec2 } from './grid'
import type { GuardDef, HideDef } from './levels'
import type { Models } from './models'
import type { NoiseEvent } from './noise'
import { Character } from './player'
import { ConeFan } from './world'

export type GuardState = 'patrol' | 'look' | 'suspicious' | 'inspect' | 'chase' | 'search' | 'checkHide' | 'blind'
export type GuardEvent = 'suspicious' | 'chase' | 'lost' | 'calm' | 'blind' | 'caught' | 'found'

export type Senses = {
  grid: Grid
  player: Vec2
  playerHidden: boolean
  playerHideSpot?: HideDef
  playerNoisy: boolean
  events: NoiseEvent[]
  smoke: Array<{ x: number; z: number; r: number }>
  dawnAlert: boolean
  hides: HideDef[]
  level: number
  difficulty: Difficulty
  speedMul: number
  hearMul: number
  time: number
}

const TAU = Math.PI * 2
const angDiff = (a: number, b: number) => {
  let d = b - a
  while (d > Math.PI) d -= TAU
  while (d < -Math.PI) d += TAU
  return d
}

function iconTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(8,10,20,0.85)'
  g.beginPath()
  g.arc(48, 48, 42, 0, TAU)
  g.fill()
  g.lineWidth = 5
  g.strokeStyle = color
  g.stroke()
  g.fillStyle = color
  g.font = 'bold 66px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 48, 52)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
let ICONS: { q: THREE.CanvasTexture; e: THREE.CanvasTexture } | undefined
const icons = () => (ICONS ??= { q: iconTexture('?', '#ffd54a'), e: iconTexture('!', '#ff4458') })

export class Guard {
  readonly char: Character
  readonly cone: ConeFan
  readonly icon: THREE.Sprite
  readonly pos: Vec2
  yaw = 0
  state: GuardState = 'patrol'
  detect = 0
  alert = 0
  lastKnown: Vec2 = { x: 0, z: 0 }
  caughtPlayer = false
  /** True once this guard has ever reacted to the player (Ghost bonus tracking). */
  detectedPlayer = false
  blindTimer = 0
  private routeIdx: number
  private routeDir = 1
  private path: Vec2[] = []
  private pathIdx = 0
  private timer = 0
  private lookBase = 0
  private repath = 0
  private stuck = 0
  private stuckCount = 0
  private loseTimer = 0
  private stepAcc = 0
  private wander = 0
  private checking?: HideDef
  private hearRepath = 0
  private moving = false
  private curSpeed = 0

  constructor(readonly id: number, readonly def: GuardDef, models: Models, private readonly onEvent: (g: Guard, e: GuardEvent) => void, private readonly onStep: (g: Guard) => void) {
    this.char = new Character(models, 'guard', 0x8a3a3a)
    this.pos = { x: def.route[def.startIndex].x, z: def.route[def.startIndex].z }
    this.routeIdx = (def.startIndex + 1) % def.route.length
    this.cone = new ConeFan(0xfff0b0, 20, 0.5)
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: icons().q, transparent: true, depthTest: false, opacity: 0 }))
    this.icon.scale.setScalar(0.62)
    this.icon.renderOrder = 40
    this.char.root.add(this.icon)
    this.char.root.position.set(this.pos.x, 0, this.pos.z)
  }

  reset(): void {
    const s = this.def.route[this.def.startIndex]
    this.pos.x = s.x
    this.pos.z = s.z
    this.state = 'patrol'
    this.detect = 0
    this.alert = 0
    this.caughtPlayer = false
    this.detectedPlayer = false
    this.routeIdx = (this.def.startIndex + 1) % this.def.route.length
    this.routeDir = 1
    this.path = []
    this.checking = undefined
    this.blindTimer = 0
  }

  // ------------------------------------------------------------------ helpers
  private setState(s: GuardState): void {
    this.state = s
    this.timer = 0
    this.stuck = 0
  }
  private pathTo(grid: Grid, t: Vec2): boolean {
    this.path = grid.findPath(this.pos, t, CONFIG.guard.radius, false)
    this.pathIdx = 0
    this.repath = 0
    return this.path.length > 0
  }
  private turnTo(target: number, dt: number, rate = CONFIG.guard.turnSpeed): void {
    this.yaw += angDiff(this.yaw, target) * Math.min(1, rate * dt)
  }
  /** Walk along the current path; returns true when the end was reached. */
  private follow(grid: Grid, dt: number, speed: number): boolean {
    this.moving = false
    this.curSpeed = 0
    if (this.pathIdx >= this.path.length) return true
    const wp = this.path[this.pathIdx]
    const dx = wp.x - this.pos.x
    const dz = wp.z - this.pos.z
    const d = Math.hypot(dx, dz)
    const last = this.pathIdx === this.path.length - 1
    if (d < (last ? 0.12 : 0.28)) {
      this.pathIdx += 1
      return this.pathIdx >= this.path.length
    }
    const want = Math.atan2(dx, dz)
    this.turnTo(want, dt)
    const align = Math.max(0.25, Math.cos(Math.min(1.4, Math.abs(angDiff(this.yaw, want)))))
    const step = Math.min(d, speed * align * dt)
    const bx = this.pos.x
    const bz = this.pos.z
    grid.moveCircle(this.pos, (dx / d) * step, (dz / d) * step, CONFIG.guard.radius)
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz)
    this.moving = moved > 0.002
    this.curSpeed = moved / Math.max(dt, 1e-6)
    this.stepAcc += moved
    if (this.stepAcc > (speed > 3 ? 1.3 : 0.9)) {
      this.stepAcc = 0
      this.onStep(this)
    }
    // stuck detection: no real progress for a while -> repath, then snap to a free tile
    if (moved < step * 0.2) this.stuck += dt
    else this.stuck = Math.max(0, this.stuck - dt)
    if (this.stuck > 0.9) {
      this.stuck = 0
      this.stuckCount += 1
      if (this.stuckCount > 2) {
        const f = grid.nearestFree(this.pos.x, this.pos.z, 3)
        if (f) {
          this.pos.x = f.x
          this.pos.z = f.z
        }
        this.stuckCount = 0
      }
      const goal = this.path[this.path.length - 1]
      this.pathTo(grid, goal)
    }
    return false
  }

  private startChase(s: Senses): void {
    if (this.state === 'chase') return
    this.detectedPlayer = true
    this.setState('chase')
    this.lastKnown = { x: s.player.x, z: s.player.z }
    this.loseTimer = 0
    this.alert = 1
    this.repath = 0
    this.onEvent(this, 'chase')
  }
  private investigate(s: Senses, x: number, z: number): void {
    this.lastKnown = { x, z }
    if (this.state === 'chase' || this.state === 'blind') return
    const first = this.state === 'patrol' || this.state === 'look'
    this.setState('suspicious')
    if (!this.pathTo(s.grid, { x, z })) {
      this.setState('inspect')
      this.timer = 2
    }
    this.detectedPlayer = true
    if (first) this.onEvent(this, 'suspicious')
  }
  private resumePatrol(s: Senses): void {
    this.checking = undefined
    this.setState('patrol')
    // go back to the nearest waypoint of the route
    let best = 0
    let bd = Infinity
    this.def.route.forEach((w, i) => {
      const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    this.routeIdx = best
    this.pathTo(s.grid, this.def.route[best])
    this.alert = 0
    this.onEvent(this, 'calm')
  }

  // ------------------------------------------------------------------ main update
  update(dt: number, s: Senses): void {
    const diff = DIFFICULTY[s.difficulty]
    const dawn = s.dawnAlert
    const speedScale = s.speedMul * (dawn ? CONFIG.scale.dawnAlertSpeed : 1)
    const hearScale = s.hearMul * (dawn ? CONFIG.scale.dawnAlertHearing : 1)
    this.caughtPlayer = false

    // --- smoke blinds a guard for a few seconds
    if (this.state !== 'blind' && this.state !== 'chase' || s.smoke.length > 0) {
      for (const c of s.smoke) {
        if (this.state !== 'blind' && Math.hypot(this.pos.x - c.x, this.pos.z - c.z) < c.r) {
          this.setState('blind')
          this.blindTimer = 5
          this.detect = 0
          this.lastKnown = { x: this.pos.x, z: this.pos.z }
          this.onEvent(this, 'blind')
        }
      }
    }
    const blind = this.state === 'blind'
    const toPlayer = Math.hypot(s.player.x - this.pos.x, s.player.z - this.pos.z)
    const eye = { x: this.pos.x, z: this.pos.z }

    // --- sight (flashlight cone + very close proximity)
    let sees = false
    if (!blind && !s.playerHidden) {
      const range = CONFIG.guard.flashRange
      const ang = Math.abs(angDiff(this.yaw, Math.atan2(s.player.x - this.pos.x, s.player.z - this.pos.z)))
      const inCone = toPlayer <= range && ang <= CONFIG.guard.flashHalfAngle
      const close = toPlayer < 1.1
      if ((inCone || close) && s.grid.los(eye.x, eye.z, s.player.x, s.player.z)) sees = true
      if (this.state === 'chase' && toPlayer < 7 && s.grid.los(eye.x, eye.z, s.player.x, s.player.z)) sees = true
    }
    if (sees) {
      const closeness = 1.4 - toPlayer / CONFIG.guard.flashRange
      this.detect = Math.min(1.2, this.detect + (dt / (CONFIG.guard.detectTime * diff.detect)) * Math.max(0.5, closeness))
      this.lastKnown = { x: s.player.x, z: s.player.z }
      if (this.state !== 'chase' && this.detect > 0.25 && (this.state === 'patrol' || this.state === 'look')) this.investigate(s, s.player.x, s.player.z)
      if (this.detect >= 1 || toPlayer < 1.1) this.startChase(s)
    } else {
      this.detect = Math.max(0, this.detect - dt * 1.4)
    }

    // --- hearing
    if (!blind && !s.playerHidden) {
      let heard = false
      for (const ev of s.events) {
        if (!ev.player && ev.kind === 'player') continue
        const direct = Math.hypot(ev.x - this.pos.x, ev.z - this.pos.z)
        const walls = ev.radius > 100 ? 0 : s.grid.wallsBetween(this.pos.x, this.pos.z, ev.x, ev.z)
        const eff = direct * (1 + CONFIG.noise.wallDampen * walls)
        const reach = ev.radius * hearScale
        if (eff > reach) continue
        heard = true
        const closeness = ev.radius > 100 ? 1 : 1 - eff / reach
        if (ev.kind === 'player') {
          this.alert = Math.min(1.5, this.alert + (0.3 + 0.7 * closeness) * dt / (CONFIG.guard.alertToChase * 0.6))
          this.hearRepath -= dt
          const farFromTarget = Math.hypot(this.lastKnown.x - ev.x, this.lastKnown.z - ev.z) > 1.2
          if (this.state !== 'chase' && (this.hearRepath <= 0 || this.state === 'patrol' || this.state === 'look') && (farFromTarget || this.state === 'patrol' || this.state === 'look')) {
            this.hearRepath = 0.5
            this.investigate(s, ev.x, ev.z)
          }
        } else {
          this.alert = Math.min(1.5, this.alert + 0.5 * closeness + 0.25)
          this.investigate(s, ev.x, ev.z)
          if (ev.kind === 'glass' && closeness > 0.45) this.alert = 1.2
        }
        if (this.alert >= 1 && ev.player && toPlayer < 5 && s.grid.los(eye.x, eye.z, s.player.x, s.player.z) && !s.playerHidden) this.startChase(s)
      }
      if (!heard) this.alert = Math.max(0, this.alert - dt * 0.25)
    } else if (!blind) {
      this.alert = Math.max(0, this.alert - dt * 0.5)
    }

    // --- state machine
    const sp = (base: number) => base * speedScale
    switch (this.state) {
      case 'patrol': {
        if (this.path.length === 0 || this.pathIdx >= this.path.length) {
          if (!this.pathTo(s.grid, this.def.route[this.routeIdx])) this.advanceRoute()
        }
        if (this.follow(s.grid, dt, sp(CONFIG.guard.patrolSpeed))) {
          this.lookBase = this.yaw
          this.setState('look')
          this.timer = CONFIG.guard.lookPauseMin + Math.random() * (CONFIG.guard.lookPauseMax - CONFIG.guard.lookPauseMin)
          this.advanceRoute()
          this.path = []
        }
        break
      }
      case 'look': {
        this.timer -= dt
        this.moving = false
        this.curSpeed = 0
        const t = CONFIG.guard.lookPauseMax - this.timer
        this.yaw = this.lookBase + Math.sin(t * 1.5) * 0.95
        if (this.timer <= 0) {
          this.setState('patrol')
          this.path = []
        }
        break
      }
      case 'suspicious': {
        if (this.follow(s.grid, dt, sp(CONFIG.guard.suspiciousSpeed))) {
          this.setState('inspect')
          this.timer = 2.6
          this.lookBase = this.yaw
        }
        break
      }
      case 'inspect': {
        this.timer -= dt
        this.moving = false
        this.curSpeed = 0
        this.yaw = this.lookBase + Math.sin((2.6 - this.timer) * 2.2) * 1.2
        if (this.timer <= 0) {
          if (this.alert > 0.55) {
            this.setState('search')
            this.timer = (CONFIG.guard.searchMin + Math.random() * (CONFIG.guard.searchMax - CONFIG.guard.searchMin)) * diff.search
            this.wander = 0
            this.path = []
          } else this.resumePatrol(s)
        }
        break
      }
      case 'chase': {
        const los = !s.playerHidden && s.grid.los(eye.x, eye.z, s.player.x, s.player.z)
        if (los) {
          this.lastKnown = { x: s.player.x, z: s.player.z }
          this.loseTimer = 0
        } else this.loseTimer += dt
        this.repath -= dt
        if (this.repath <= 0 || this.pathIdx >= this.path.length) {
          this.repath = 0.28
          this.pathTo(s.grid, this.lastKnown)
          this.repath = 0.28
        }
        this.follow(s.grid, dt, sp(CONFIG.guard.chaseSpeed))
        if (los && toPlayer < CONFIG.guard.catchDistance && !s.playerHidden) {
          this.caughtPlayer = true
          this.onEvent(this, 'caught')
        }
        const reached = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) < 0.7
        if (s.playerHidden && (reached || this.loseTimer > CONFIG.guard.loseSightTime) || (!los && this.loseTimer > CONFIG.guard.loseSightTime * 1.6)) {
          this.setState('search')
          this.timer = (CONFIG.guard.searchMin + Math.random() * (CONFIG.guard.searchMax - CONFIG.guard.searchMin)) * diff.search
          this.wander = 0
          this.path = []
          this.detect = 0.3
          this.alert = 0.8
          this.onEvent(this, 'lost')
        }
        break
      }
      case 'search': {
        this.timer -= dt
        if (this.path.length === 0 || this.pathIdx >= this.path.length) {
          this.wander += 1
          const chk = this.wander === 2 && s.level >= 5 ? this.nearestHide(s) : undefined
          if (chk) {
            this.checking = chk
            this.setState('checkHide')
            this.timer = 0
            this.pathTo(s.grid, { x: chk.x, z: chk.z + 1 })
            break
          }
          const a = Math.random() * TAU
          const r = this.wander === 1 ? 0 : 1.5 + Math.random() * 2.5
          const pt = s.grid.nearestFree(this.lastKnown.x + Math.cos(a) * r, this.lastKnown.z + Math.sin(a) * r, 3)
          if (pt) this.pathTo(s.grid, pt)
        }
        const done = this.follow(s.grid, dt, sp(CONFIG.guard.searchSpeed))
        if (done) {
          // look around at the point
          this.yaw += dt * 2.2
          if (this.pathIdx >= this.path.length) this.path = []
        }
        if (this.timer <= 0) this.resumePatrol(s)
        break
      }
      case 'checkHide': {
        const chk = this.checking
        if (!chk) {
          this.setState('search')
          this.timer = 3
          break
        }
        const arrived = this.follow(s.grid, dt, sp(CONFIG.guard.suspiciousSpeed))
        if (arrived) {
          this.timer += dt
          this.moving = false
          this.curSpeed = 0
          this.turnTo(Math.atan2(chk.x - this.pos.x, chk.z - this.pos.z), dt)
          if (this.timer > 0.9) {
            if (s.playerHidden && s.playerHideSpot?.id === chk.id) {
              this.onEvent(this, 'found')
              this.startChase(s)
              this.caughtPlayer = true
            } else {
              this.checking = undefined
              this.setState('search')
              this.timer = 3
              this.path = []
            }
          }
        }
        break
      }
      case 'blind': {
        this.blindTimer -= dt
        this.moving = false
        this.curSpeed = 0
        this.yaw += dt * 1.4
        if (this.blindTimer <= 0) {
          this.setState('search')
          this.timer = 5 * diff.search
          this.wander = 0
          this.path = []
        }
        break
      }
    }
    this.syncVisual(dt, s, blind)
  }

  private advanceRoute(): void {
    const n = this.def.route.length
    if (n < 2) return
    let next = this.routeIdx + this.routeDir
    if (next >= n || next < 0) {
      this.routeDir *= -1
      next = this.routeIdx + this.routeDir
    }
    this.routeIdx = Math.max(0, Math.min(n - 1, next))
  }

  private nearestHide(s: Senses): HideDef | undefined {
    let best: HideDef | undefined
    let bd = 5.5
    for (const h of s.hides) {
      const d = Math.hypot(h.x - this.lastKnown.x, h.z - this.lastKnown.z)
      if (d < bd) {
        bd = d
        best = h
      }
    }
    return best
  }

  private syncVisual(dt: number, s: Senses, blind: boolean): void {
    const ch = this.char
    ch.root.position.set(this.pos.x, 0, this.pos.z)
    ch.faceYaw(this.yaw)
    if (this.moving && this.curSpeed > 0.3) {
      if (this.state === 'chase' || this.curSpeed > 3.2) ch.play('run', { speed: Math.max(0.8, this.curSpeed / 4.2) })
      else ch.play('walk', { speed: Math.max(0.6, this.curSpeed / 1.7) })
    } else if (this.state === 'look' || this.state === 'inspect') {
      ch.play(ch.has('look_around') ? 'look_around' : 'idle', { speed: 1 })
    } else ch.play('idle')
    ch.update(dt)
    // flashlight cone
    const coneColor = this.state === 'chase' ? 0xff4458 : this.state === 'suspicious' || this.state === 'inspect' || this.state === 'search' || this.state === 'checkHide' ? 0xffb347 : 0xfff0b0
    this.cone.setColor(coneColor)
    this.cone.mesh.visible = !blind
    if (!blind) this.cone.update(s.grid, this.pos.x, this.pos.z, this.yaw, CONFIG.guard.flashHalfAngle, CONFIG.guard.flashRange)
    // alert icon
    const mat = this.icon.material as THREE.SpriteMaterial
    const q = this.state === 'suspicious' || this.state === 'inspect' || this.state === 'search' || this.state === 'checkHide'
    const e = this.state === 'chase'
    const showDetect = this.detect > 0.12 && !e
    mat.map = e ? icons().e : icons().q
    mat.opacity += ((e || q || showDetect ? 1 : 0) - mat.opacity) * Math.min(1, dt * 10)
    const bob = 2.45 + Math.sin(s.time * 6) * 0.04
    this.icon.position.set(0, bob / 1, 0)
    this.icon.scale.setScalar(e ? 0.78 + Math.sin(s.time * 14) * 0.05 : 0.55 + this.detect * 0.25)
    if (blind) mat.opacity = 0.5
  }

  /** For HUD / audio: how threatening this guard currently is (0 calm .. 2 chase). */
  get threat(): number {
    if (this.state === 'chase') return 2
    if (this.state === 'suspicious' || this.state === 'inspect' || this.state === 'search' || this.state === 'checkHide') return 1
    return 0
  }
}
