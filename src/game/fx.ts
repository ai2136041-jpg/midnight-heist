import * as THREE from 'three'

type Pool = {
  points: THREE.Points
  pos: Float32Array
  col: Float32Array
  size: Float32Array
  alpha: Float32Array
  vel: Float32Array
  life: Float32Array
  max: Float32Array
  s0: Float32Array
  s1: Float32Array
  a0: Float32Array
  grav: Float32Array
  drag: Float32Array
  cursor: number
  count: number
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.0, r) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`

function makePool(count: number, additive: boolean): Pool {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const alpha = new Float32Array(count)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage))
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 600 } },
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 20
  return {
    points, pos, col, size, alpha, count, cursor: 0,
    vel: new Float32Array(count * 3), life: new Float32Array(count), max: new Float32Array(count),
    s0: new Float32Array(count), s1: new Float32Array(count), a0: new Float32Array(count),
    grav: new Float32Array(count), drag: new Float32Array(count),
  }
}

export type Spawn = {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; life: number; s0: number; s1?: number
  color: number; alpha?: number; gravity?: number; drag?: number
}

/** Pooled billboard particles: additive sparkles/glass and normal-blended smoke/dust. */
export class Particles {
  readonly group = new THREE.Group()
  private glow = makePool(420, true)
  private soft = makePool(260, false)
  private tmp = new THREE.Color()
  /** Reduced-motion players get far fewer particles. */
  density = 1

  constructor() {
    this.group.add(this.glow.points, this.soft.points)
  }

  setViewport(heightPx: number): void {
    for (const p of [this.glow, this.soft]) (p.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx * 0.9
  }

  spawn(s: Spawn, additive = true): void {
    if (this.density < 1 && Math.random() > this.density) return
    const p = additive ? this.glow : this.soft
    const i = p.cursor
    p.cursor = (p.cursor + 1) % p.count
    p.pos[i * 3] = s.x
    p.pos[i * 3 + 1] = s.y
    p.pos[i * 3 + 2] = s.z
    p.vel[i * 3] = s.vx ?? 0
    p.vel[i * 3 + 1] = s.vy ?? 0
    p.vel[i * 3 + 2] = s.vz ?? 0
    p.life[i] = s.life
    p.max[i] = s.life
    p.s0[i] = s.s0
    p.s1[i] = s.s1 ?? s.s0
    p.a0[i] = s.alpha ?? 1
    p.grav[i] = s.gravity ?? 0
    p.drag[i] = s.drag ?? 0
    this.tmp.setHex(s.color)
    p.col[i * 3] = this.tmp.r
    p.col[i * 3 + 1] = this.tmp.g
    p.col[i * 3 + 2] = this.tmp.b
  }

  update(dt: number): void {
    for (const p of [this.glow, this.soft]) {
      for (let i = 0; i < p.count; i += 1) {
        if (p.life[i] <= 0) {
          p.alpha[i] = 0
          continue
        }
        p.life[i] -= dt
        const t = 1 - Math.max(0, p.life[i]) / p.max[i]
        const drag = Math.max(0, 1 - p.drag[i] * dt)
        p.vel[i * 3] *= drag
        p.vel[i * 3 + 1] = (p.vel[i * 3 + 1] - p.grav[i] * dt) * drag
        p.vel[i * 3 + 2] *= drag
        p.pos[i * 3] += p.vel[i * 3] * dt
        p.pos[i * 3 + 1] = Math.max(0.02, p.pos[i * 3 + 1] + p.vel[i * 3 + 1] * dt)
        p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt
        p.size[i] = p.s0[i] + (p.s1[i] - p.s0[i]) * t
        p.alpha[i] = p.a0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85)
      }
      const g = p.points.geometry
      for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true
    }
  }

  clear(): void {
    this.glow.life.fill(0)
    this.soft.life.fill(0)
  }

  // --- ready-made bursts
  shards(x: number, z: number): void {
    for (let i = 0; i < 34; i += 1) {
      const a = Math.random() * 6.28
      const v = 1.2 + Math.random() * 3
      this.spawn({ x, y: 0.8 + Math.random() * 0.6, z, vx: Math.cos(a) * v, vy: 1.5 + Math.random() * 3, vz: Math.sin(a) * v, life: 0.9 + Math.random() * 0.6, s0: 0.12, s1: 0.04, color: i % 3 === 0 ? 0xffffff : 0x9fdcff, gravity: 9, drag: 0.6 })
    }
  }
  sparkle(x: number, y: number, z: number, color: number, n = 10): void {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * 6.28
      this.spawn({ x, y, z, vx: Math.cos(a) * 0.8, vy: 0.8 + Math.random() * 1.4, vz: Math.sin(a) * 0.8, life: 0.7 + Math.random() * 0.5, s0: 0.14, s1: 0.02, color, drag: 1.2 })
    }
  }
  smoke(x: number, z: number, radius: number): void {
    for (let i = 0; i < 6; i += 1) {
      const a = Math.random() * 6.28
      const r = Math.random() * radius * 0.8
      this.spawn({ x: x + Math.cos(a) * r, y: 0.3 + Math.random() * 0.8, z: z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.4, vy: 0.2, vz: (Math.random() - 0.5) * 0.4, life: 2.2, s0: 1.1, s1: 2.6, color: 0xb8c0cc, alpha: 0.38 }, false)
    }
  }
  dust(x: number, z: number): void {
    this.spawn({ x, y: 0.08, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3, vz: (Math.random() - 0.5) * 0.4, life: 0.55, s0: 0.1, s1: 0.32, color: 0x9aa4b8, alpha: 0.25 }, false)
  }
  /** Slow floating dust motes in the moonlight. */
  mote(x: number, y: number, z: number): void {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: 0.05, vz: (Math.random() - 0.5) * 0.15, life: 4, s0: 0.05, s1: 0.05, color: 0xbfd4ff, alpha: 0.5 })
  }
  confetti(x: number, z: number, color: number): void {
    for (let i = 0; i < 18; i += 1) {
      const a = Math.random() * 6.28
      this.spawn({ x, y: 1.2, z, vx: Math.cos(a) * 1.6, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * 1.6, life: 1.2, s0: 0.1, s1: 0.05, color, gravity: 7, drag: 0.5 })
    }
  }
}
