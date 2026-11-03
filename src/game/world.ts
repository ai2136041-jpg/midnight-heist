import * as THREE from 'three'
import { SURFACE_CARPET, SURFACE_WOOD, type Grid } from './grid'
import { FOSSIL_BY_ID, type FossilId } from './collection'
import type { Layout, PropDef, Room } from './levels'
import { createBoneModel } from './boneModel'
import type { Models } from './models'
import type { Quality } from '../engine/save'

export const TIER_COLOR = { common: 0x8ecbff, rare: 0xc58bff, legendary: 0xffd24a } as const
export const WALL_H = 2.5

/** Translucent floor cone clipped by walls (guard flashlight / security camera view). */
export class ConeFan {
  readonly mesh: THREE.Mesh
  private pos: Float32Array
  private col: Float32Array
  private tmp = new THREE.Color()
  constructor(color: number, private readonly segments = 18, opacity = 0.42) {
    const n = segments + 2
    this.pos = new Float32Array(n * 3)
    this.col = new Float32Array(n * 4)
    const idx: number[] = []
    for (let i = 0; i < segments; i += 1) idx.push(0, i + 1, i + 2)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    geo.setIndex(idx)
    this.tmp.setHex(color)
    for (let i = 0; i < n; i += 1) {
      this.col[i * 4] = this.tmp.r
      this.col[i * 4 + 1] = this.tmp.g
      this.col[i * 4 + 2] = this.tmp.b
      this.col[i * 4 + 3] = i === 0 ? opacity : 0.02
    }
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
  }
  setColor(color: number): void {
    this.tmp.setHex(color)
    for (let i = 0; i < this.segments + 2; i += 1) {
      this.col[i * 4] = this.tmp.r
      this.col[i * 4 + 1] = this.tmp.g
      this.col[i * 4 + 2] = this.tmp.b
    }
    ;(this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
  update(grid: Grid, x: number, z: number, yaw: number, half: number, range: number): void {
    this.pos[0] = x
    this.pos[1] = 0.04
    this.pos[2] = z
    for (let i = 0; i <= this.segments; i += 1) {
      const a = yaw - half + (2 * half * i) / this.segments
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      const d = grid.raycast(x, z, dx, dz, range)
      this.pos[(i + 1) * 3] = x + dx * d
      this.pos[(i + 1) * 3 + 1] = 0.04
      this.pos[(i + 1) * 3 + 2] = z + dz * d
    }
    ;(this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}

type Occluder = { obj: THREE.Object3D; x: number; z: number; h: number; s: number; baseY: number }
export type OccTarget = { x: number; z: number; h: number }

export type ArtifactVisual = {
  group: THREE.Group
  halo: THREE.Sprite
  model: THREE.Object3D
  dome?: THREE.Object3D
  baseY: number
  phase: number
  taken: boolean
  color: number
}

export type BoneVisual = {
  group: THREE.Group
  halo: THREE.Sprite
  model: THREE.Object3D
  baseY: number
  phase: number
  taken: boolean
}

const rngFrom = (seed: number) => {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

const radialTex = (inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') =>
  canvasTex(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, inner)
    gr.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.35)'))
    gr.addColorStop(1, outer)
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })

export class World {
  readonly scene = new THREE.Scene()
  readonly root = new THREE.Group()
  readonly moon: THREE.DirectionalLight
  readonly ambient: THREE.AmbientLight
  readonly hemi: THREE.HemisphereLight
  readonly lampLights: THREE.PointLight[] = []
  readonly spots: THREE.SpotLight[] = []
  readonly artifacts = new Map<number, ArtifactVisual>()
  readonly boneVis: BoneVisual
  readonly keycardVis = new Map<number, THREE.Mesh>()
  readonly doorVis = new Map<number, { group: THREE.Group; open: number; light: THREE.Mesh }>()
  readonly laserVis: Array<{ beam: THREE.Mesh; glow: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = []
  readonly curtainVis = new Map<number, { drape: THREE.Mesh; closed: number }>()
  readonly hideMarker: THREE.Sprite
  readonly cameraHeads: THREE.Group[] = []
  readonly exitBeam: THREE.Mesh
  readonly walls: THREE.InstancedMesh
  private wallList: Array<{ tx: number; tz: number; s: number }> = []
  private occluders: Occluder[] = []
  private lampPositions: THREE.Vector3[]
  private lampAssign: number[] = []
  private floorTex!: THREE.CanvasTexture
  private time = 0
  private quality: Quality = 'high'
  private glowOn = true

  constructor(readonly layout: Layout, private readonly models: Models, quality: Quality, anisotropy = 4) {
    this.scene.background = new THREE.Color(0x070a14)
    this.scene.fog = new THREE.FogExp2(0x070a14, 0.02)
    this.scene.add(this.root)

    this.ambient = new THREE.AmbientLight(0x6f7fb5, 1.15)
    this.hemi = new THREE.HemisphereLight(0x7f98d8, 0x1a1420, 0.55)
    this.moon = new THREE.DirectionalLight(0xa8bcff, 1.35)
    this.moon.position.set(-7, 15, -6)
    this.moon.shadow.camera.left = -15
    this.moon.shadow.camera.right = 15
    this.moon.shadow.camera.top = 15
    this.moon.shadow.camera.bottom = -15
    this.moon.shadow.camera.near = 1
    this.moon.shadow.camera.far = 50
    this.moon.shadow.bias = -0.0005
    this.moon.shadow.normalBias = 0.04
    this.scene.add(this.ambient, this.hemi, this.moon, this.moon.target)

    this.buildFloor(anisotropy)
    this.walls = this.buildWalls()
    this.buildWindows()
    this.buildPaintings()
    this.lampPositions = layout.lamps.map(l => new THREE.Vector3(l.x, 2.3, l.z))
    this.buildLamps()
    this.buildProps()
    this.buildHides()
    this.buildDoors()
    this.buildArtifacts()
    this.boneVis = this.buildBone()
    this.buildLasers()
    this.buildCameras()
    this.exitBeam = this.buildExit()
    this.hideMarker = this.buildHideMarker()
    this.setQuality(quality)
  }

  // ---------------------------------------------------------------- materials / textures
  private buildFloor(anisotropy: number): void {
    const { layout } = this
    const ppt = 32
    const W = layout.w * ppt
    const H = layout.h * ppt
    const rng = rngFrom(layout.seed)
    const roomAt = (tx: number, tz: number): Room | undefined => layout.rooms.find(r => tx >= r.x0 && tx <= r.x1 && tz >= r.z0 && tz <= r.z1)
    this.floorTex = canvasTex(W, H, g => {
      g.fillStyle = '#0a0d18'
      g.fillRect(0, 0, W, H)
      for (let tz = 0; tz < layout.h; tz += 1) {
        for (let tx = 0; tx < layout.w; tx += 1) {
          if (layout.grid.wall[layout.grid.idx(tx, tz)]) continue
          const x = tx * ppt
          const y = tz * ppt
          const surf = layout.grid.surface[layout.grid.idx(tx, tz)]
          const room = roomAt(tx, tz)
          if (surf === SURFACE_CARPET) {
            g.fillStyle = (tx + tz) % 2 ? '#5b2030' : '#561d2d'
            g.fillRect(x, y, ppt, ppt)
            g.strokeStyle = 'rgba(214,170,92,0.28)'
            g.lineWidth = 1.2
            g.beginPath()
            g.moveTo(x + ppt / 2, y + 5)
            g.lineTo(x + ppt - 5, y + ppt / 2)
            g.lineTo(x + ppt / 2, y + ppt - 5)
            g.lineTo(x + 5, y + ppt / 2)
            g.closePath()
            g.stroke()
          } else if (surf === SURFACE_WOOD) {
            for (let k = 0; k < 4; k += 1) {
              const l = 38 + rng() * 10
              g.fillStyle = `hsl(28,${34 + rng() * 8}%,${l * 0.62}%)`
              g.fillRect(x, y + k * (ppt / 4), ppt, ppt / 4)
              g.fillStyle = 'rgba(0,0,0,0.35)'
              g.fillRect(x, y + k * (ppt / 4), ppt, 1)
            }
            g.fillStyle = 'rgba(0,0,0,0.25)'
            g.fillRect(x + ((tx * 7 + tz * 3) % 3) * 9 + 4, y, 1, ppt)
          } else {
            const vaultRoom = room?.theme === 'vault'
            const base = vaultRoom ? ((tx + tz) % 2 ? 24 : 30) : room?.theme === 'lobby' ? ((tx + tz) % 2 ? 52 : 62) : (tx + tz) % 2 ? 40 : 48
            g.fillStyle = `hsl(${vaultRoom ? 42 : 222},${vaultRoom ? 18 : 14}%,${base * 0.55}%)`
            g.fillRect(x, y, ppt, ppt)
            g.strokeStyle = 'rgba(255,255,255,0.07)'
            g.lineWidth = 1
            g.beginPath()
            g.moveTo(x + rng() * ppt, y)
            g.bezierCurveTo(x + rng() * ppt, y + 10, x + rng() * ppt, y + 20, x + rng() * ppt, y + ppt)
            g.stroke()
            g.fillStyle = 'rgba(0,0,0,0.28)'
            g.fillRect(x, y, ppt, 1)
            g.fillRect(x, y, 1, ppt)
          }
          // soft contact shadow along adjacent walls
          const edge = (dx: number, dz: number, ex: number, ey: number, ew: number, eh: number, gx0: number, gy0: number, gx1: number, gy1: number) => {
            if (!layout.grid.wall[layout.grid.idx(tx + dx, tz + dz)]) return
            const gr = g.createLinearGradient(gx0, gy0, gx1, gy1)
            gr.addColorStop(0, 'rgba(0,0,0,0.55)')
            gr.addColorStop(1, 'rgba(0,0,0,0)')
            g.fillStyle = gr
            g.fillRect(ex, ey, ew, eh)
          }
          edge(0, -1, x, y, ppt, 12, x, y, x, y + 12)
          edge(0, 1, x, y + ppt - 12, ppt, 12, x, y + ppt, x, y + ppt - 12)
          edge(-1, 0, x, y, 12, ppt, x, y, x + 12, y)
          edge(1, 0, x + ppt - 12, y, 12, ppt, x + ppt, y, x + ppt - 12, y)
        }
      }
      // exit pad
      const ex = (layout.exit.x - layout.exit.w / 2) * ppt
      const ez = (layout.exit.z - 0.5) * ppt
      g.fillStyle = 'rgba(40,200,120,0.22)'
      g.fillRect(ex, ez, layout.exit.w * ppt, ppt)
      g.strokeStyle = 'rgba(80,255,170,0.8)'
      g.lineWidth = 2
      g.strokeRect(ex + 2, ez + 2, layout.exit.w * ppt - 4, ppt - 4)
      g.fillStyle = 'rgba(120,255,190,0.75)'
      for (let i = 0; i < layout.exit.w; i += 1) {
        const cx = ex + i * ppt + ppt / 2
        g.beginPath()
        g.moveTo(cx - 7, ez + 11)
        g.lineTo(cx + 7, ez + 11)
        g.lineTo(cx, ez + 22)
        g.closePath()
        g.fill()
      }
    })
    this.floorTex.anisotropy = anisotropy
    this.floorTex.generateMipmaps = true
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.w, layout.h),
      new THREE.MeshStandardMaterial({ map: this.floorTex, roughness: 0.62, metalness: 0.05 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(layout.w / 2, 0, layout.h / 2)
    floor.receiveShadow = true
    this.root.add(floor)
  }

  private buildWalls(): THREE.InstancedMesh {
    const { layout } = this
    const side = canvasTex(64, 128, g => {
      g.fillStyle = '#323a5a'
      g.fillRect(0, 0, 64, 128)
      g.fillStyle = '#272d49'
      g.fillRect(0, 70, 64, 58)
      g.fillStyle = 'rgba(214,170,92,0.8)'
      g.fillRect(0, 68, 64, 3)
      g.fillStyle = 'rgba(255,255,255,0.03)'
      for (let i = 0; i < 8; i += 1) g.fillRect(i * 8, 0, 1, 68)
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(0, 122, 64, 6)
    })
    side.anisotropy = 4
    const sideMat = new THREE.MeshStandardMaterial({ map: side, roughness: 0.92 })
    const topMat = new THREE.MeshStandardMaterial({ color: 0x5a6590, roughness: 0.8, emissive: 0x1a2038, emissiveIntensity: 0.6 })
    const botMat = new THREE.MeshStandardMaterial({ color: 0x15192a })
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mats = [sideMat, sideMat, topMat, botMat, sideMat, sideMat]
    const list: Array<{ tx: number; tz: number; s: number }> = []
    for (let tz = 0; tz < layout.h; tz += 1) {
      for (let tx = 0; tx < layout.w; tx += 1) {
        if (!layout.grid.wall[layout.grid.idx(tx, tz)]) continue
        // skip wall tiles buried inside thick wall masses (never visible)
        let open = false
        for (let dz = -1; dz <= 1 && !open; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = tx + dx
          const nz = tz + dz
          if (layout.grid.inside(nx, nz) && !layout.grid.wall[layout.grid.idx(nx, nz)]) {
            open = true
            break
          }
        }
        if (open) list.push({ tx, tz, s: 1 })
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mats, list.length)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    const m = new THREE.Matrix4()
    list.forEach((w, i) => {
      m.compose(new THREE.Vector3(w.tx + 0.5, WALL_H / 2, w.tz + 0.5), new THREE.Quaternion(), new THREE.Vector3(1, WALL_H, 1))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    this.wallList = list
    this.root.add(mesh)
    return mesh
  }

  private buildWindows(): void {
    const { layout } = this
    const glassTex = canvasTex(64, 96, g => {
      g.fillStyle = '#0f1830'
      g.fillRect(0, 0, 64, 96)
      const gr = g.createLinearGradient(0, 0, 0, 96)
      gr.addColorStop(0, '#a9c4ff')
      gr.addColorStop(1, '#3a5aa8')
      g.fillStyle = gr
      g.fillRect(6, 6, 52, 84)
      g.fillStyle = '#0f1830'
      g.fillRect(30, 6, 4, 84)
      g.fillRect(6, 44, 52, 4)
      g.fillStyle = '#fff'
      for (let i = 0; i < 6; i += 1) g.fillRect(10 + ((i * 17) % 44), 10 + ((i * 29) % 30), 2, 2)
    })
    const patchTex = canvasTex(128, 256, g => {
      const gr = g.createLinearGradient(0, 0, 0, 256)
      gr.addColorStop(0, 'rgba(170,200,255,0.95)')
      gr.addColorStop(1, 'rgba(170,200,255,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 128, 256)
      g.fillStyle = 'rgba(0,0,0,0.85)'
      g.fillRect(60, 0, 8, 256)
      g.fillRect(0, 100, 128, 8)
    })
    const winMat = new THREE.MeshBasicMaterial({ map: glassTex, toneMapped: false })
    const patchMat = new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
    const winGeo = new THREE.PlaneGeometry(1.0, 1.5)
    const patchGeo = new THREE.PlaneGeometry(1.5, 2.6)
    for (const w of layout.windows) {
      const win = new THREE.Mesh(winGeo, winMat)
      const patch = new THREE.Mesh(patchGeo, patchMat)
      patch.rotation.x = -Math.PI / 2
      patch.renderOrder = 2
      if (w.side === 'n') {
        win.position.set(w.tx + 0.5, 1.45, w.tz + 1.012)
        patch.position.set(w.tx + 0.5, 0.025, w.tz + 1 + 1.45)
      } else if (w.side === 'w') {
        win.position.set(w.tx + 1.012, 1.45, w.tz + 0.5)
        win.rotation.y = Math.PI / 2
        patch.rotation.z = -Math.PI / 2
        patch.position.set(w.tx + 1 + 1.45, 0.025, w.tz + 0.5)
      } else {
        win.position.set(w.tx - 0.012, 1.45, w.tz + 0.5)
        win.rotation.y = -Math.PI / 2
        patch.rotation.z = Math.PI / 2
        patch.position.set(w.tx - 1.45, 0.025, w.tz + 0.5)
      }
      this.root.add(win, patch)
    }
  }

  private buildPaintings(): void {
    const rng = rngFrom(this.layout.seed + 9)
    const palettes = [['#1d3a5c', '#e0b24a', '#c85a3a'], ['#2c4b3a', '#d8d2a8', '#7a3b52'], ['#3b2a52', '#7cc0d8', '#e07a8a']]
    const texes = palettes.map((p, i) => canvasTex(96, 72, g => {
      g.fillStyle = p[0]
      g.fillRect(0, 0, 96, 72)
      for (let k = 0; k < 7; k += 1) {
        g.fillStyle = p[1 + (k % 2)]
        g.globalAlpha = 0.65
        g.beginPath()
        g.ellipse(rng() * 96, rng() * 72, 8 + rng() * 22, 5 + rng() * 14, rng() * 3, 0, 6.28)
        g.fill()
      }
      g.globalAlpha = 1
      g.fillStyle = `rgba(0,0,0,${0.12 + i * 0.04})`
      g.fillRect(0, 56, 96, 16)
    }))
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a6a2e, roughness: 0.5, metalness: 0.4 })
    for (const p of this.layout.paintings) {
      const tex = texes[Math.floor(rng() * texes.length)]
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }))
      art.position.set(p.tx + 0.5, 1.5, p.tz + 1.03)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.83, 0.05), frameMat)
      frame.position.set(p.tx + 0.5, 1.5, p.tz + 1.015)
      this.root.add(frame, art)
    }
  }

  private buildLamps(): void {
    const glow = radialTex('rgba(255,196,130,0.9)')
    const mat = new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
    for (const p of this.lampPositions) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat)
      m.rotation.x = -Math.PI / 2
      m.position.set(p.x, 0.03, p.z)
      m.renderOrder = 1
      this.root.add(m)
    }
    for (let i = 0; i < 6; i += 1) {
      const l = new THREE.PointLight(0xffc48a, 0, 11, 1.6)
      l.visible = false
      this.lampLights.push(l)
      this.scene.add(l)
    }
    for (let i = 0; i < 3; i += 1) {
      const s = new THREE.SpotLight(0xfff2cc, 0, 8, 0.52, 0.6, 1.4)
      s.visible = false
      this.spots.push(s)
      this.scene.add(s, s.target)
    }
  }

  // ---------------------------------------------------------------- props
  private mat(color: number, rough = 0.7, metal = 0.05): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
  }

  private addProp(def: PropDef): void {
    const g = new THREE.Group()
    g.position.set(def.x, 0, def.z)
    g.rotation.y = def.yaw
    let h = 1
    switch (def.kind) {
      case 'statue': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), this.mat(0x4a4f63, 0.6))
        base.position.y = 0.175
        const m = this.models.instance('statue', 0.78)
        if (m) {
          m.position.y = 0.35
          g.add(m)
        } else {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.1, 8), this.mat(0xb8bdd0, 0.5))
          body.position.y = 0.95
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), this.mat(0xc6cbdc, 0.5))
          head.position.y = 1.7
          g.add(body, head)
        }
        g.add(base)
        h = 2.0
        break
      }
      case 'urn': {
        const m = this.models.instance('urn')
        if (m) g.add(m)
        else {
          const u = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 1.0, 10), this.mat(0x8a5a3a, 0.6))
          u.position.y = 0.5
          g.add(u)
        }
        h = 1.2
        break
      }
      case 'locker': {
        const m = this.models.instance('locker')
        if (m) {
          m.rotation.y = Math.PI
          g.rotation.y = 0
          g.add(m)
        } else {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.8), this.mat(0x4d6a8a, 0.5, 0.4))
          b.position.y = 0.95
          g.add(b)
        }
        h = 1.9
        break
      }
      case 'pedestal': {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.9, 12), this.mat(0xcdd2e2, 0.5))
        col.position.y = 0.45
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12), this.mat(0x9aa0b6, 0.4))
        top.position.y = 0.94
        g.add(col, top)
        h = 0.95
        break
      }
      case 'plinth': {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), this.mat(0x2d3350, 0.45, 0.2))
        col.position.y = 0.45
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.78), this.mat(0xc9a24a, 0.35, 0.7))
        trim.position.y = 0.93
        g.add(col, trim)
        h = 0.95
        break
      }
      case 'case': {
        const w = def.w
        const d = def.d
        const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.8, d * 0.92), this.mat(0x2a2f48, 0.5, 0.3))
        base.position.y = 0.4
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.9, 0.7, d * 0.9),
          new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false }),
        )
        glass.position.y = 1.15
        const frame = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: 0xe6c25a }))
        frame.position.copy(glass.position)
        g.add(base, glass, frame)
        h = 1.5
        break
      }
      case 'table': {
        const top = new THREE.Mesh(new THREE.BoxGeometry(def.w * 0.96, 0.1, def.d * 0.9), this.mat(0x6b4a2c, 0.55))
        top.position.y = 0.78
        g.add(top)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), this.mat(0x4a3220, 0.6))
          leg.position.set(sx * (def.w * 0.44), 0.39, sz * (def.d * 0.38))
          g.add(leg)
        }
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(def.w * 0.6, 0.02, def.d * 0.75), this.mat(0xe6dcc8, 0.9))
        cloth.position.y = 0.84
        g.add(cloth)
        h = 0.9
        break
      }
      case 'bench': {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(def.w * 0.9, 0.12, 0.5), this.mat(0x5a3a28, 0.6))
        seat.position.y = 0.45
        g.add(seat)
        for (const sx of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.42), this.mat(0x2d2a34, 0.5, 0.5))
          leg.position.set(sx * (def.w * 0.4), 0.22, 0)
          g.add(leg)
        }
        h = 0.55
        break
      }
    }
    g.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = def.kind !== 'case'
        m.receiveShadow = true
      }
    })
    this.root.add(g)
    if (h > 1.2) this.occluders.push({ obj: g, x: def.x, z: def.z, h, s: 1, baseY: 0 })
  }

  private buildProps(): void {
    for (const p of this.layout.props) this.addProp(p)
  }

  private buildHides(): void {
    for (const h of this.layout.hides) {
      if (h.kind === 'curtain') {
        const g = new THREE.Group()
        const tx = Math.floor(h.x)
        const tz = Math.floor(h.z)
        const cloth = this.mat(0x7a1f3a, 0.95)
        const rod = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), this.mat(0xc9a24a, 0.4, 0.7))
        rod.position.set(tx + 0.5, 2.15, tz + 0.06)
        for (const sx of [-1, 1]) {
          const fold = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.1, 0.16), cloth)
          fold.position.set(tx + 0.5 + sx * 0.5, 1.07, tz + 0.1)
          fold.castShadow = true
          g.add(fold)
        }
        const drape = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.05, 0.1), cloth)
        drape.position.set(tx + 0.5, 1.05, tz + 0.2)
        drape.scale.x = 0.001
        drape.castShadow = true
        g.add(rod, drape)
        this.root.add(g)
        this.curtainVis.set(h.id, { drape, closed: 0 })
      } else if (h.kind === 'vent') {
        const tx = Math.floor(h.x)
        const tz = Math.floor(h.z)
        const tex = canvasTex(64, 40, g => {
          g.fillStyle = '#1b1f2e'
          g.fillRect(0, 0, 64, 40)
          g.fillStyle = '#5b647c'
          for (let i = 0; i < 6; i += 1) g.fillRect(4, 4 + i * 6, 56, 3)
          g.strokeStyle = '#8a93ac'
          g.strokeRect(1, 1, 62, 38)
        })
        const v = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.4 }))
        v.position.set(tx + 0.5, 0.35, tz + 0.02)
        this.root.add(v)
      } else if (h.kind === 'corner') {
        const tex = radialTex('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)')
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        m.position.set(h.x, 0.035, h.z)
        m.renderOrder = 3
        this.root.add(m)
      }
    }
  }

  private buildDoors(): void {
    const { layout } = this
    const slabMat = this.mat(0x3a3f55, 0.4, 0.6)
    for (const d of layout.doors) {
      if (d.key === 0) continue
      const g = new THREE.Group()
      const long = 2
      const geo = d.orient === 'v' ? new THREE.BoxGeometry(0.36, 2.3, long) : new THREE.BoxGeometry(long, 2.3, 0.36)
      const slab = new THREE.Mesh(geo, slabMat)
      slab.castShadow = true
      const color = d.key === 1 ? 0xff4d5e : 0x4db3ff
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color }))
      if (d.orient === 'v') {
        slab.position.set(d.tx + 0.5, 1.15, d.tz + 1)
        light.position.set(d.tx + 0.5, 2.0, d.tz + 1)
      } else {
        slab.position.set(d.tx + 1, 1.15, d.tz + 0.5)
        light.position.set(d.tx + 1, 2.0, d.tz + 0.5)
      }
      g.add(slab, light)
      this.root.add(g)
      this.doorVis.set(d.key, { group: g, open: 0, light })
    }
  }

  private buildArtifacts(): void {
    const halo = radialTex('rgba(255,255,255,0.95)')
    for (const a of this.layout.artifacts) {
      const g = new THREE.Group()
      g.position.set(a.x, 0, a.z)
      const color = TIER_COLOR[a.tier]
      const model = this.fossilModel(a.fossil)
      const y = a.tier === 'legendary' ? 1.02 : 0.99
      model.position.y = y
      model.rotation.y = (a.id % 4) * 0.5 - 0.6
      g.add(model)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
      sprite.scale.setScalar(a.tier === 'legendary' ? 2.3 : 1.7)
      sprite.position.y = y + 0.3
      g.add(sprite)
      let dome: THREE.Object3D | undefined
      if (a.tier === 'rare') {
        dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xd8e8ff, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
        )
        dome.position.y = 0.96
        g.add(dome)
      }
      this.root.add(g)
      this.artifacts.set(a.id, { group: g, halo: sprite, model, dome, baseY: y, phase: a.id * 1.7, taken: false, color })
    }
    // keycards
    for (const k of this.layout.keycards) {
      const color = k.key === 1 ? 0xff4d5e : 0x4db3ff
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }))
      card.position.set(k.x, 1.2, k.z)
      this.root.add(card)
      this.keycardVis.set(k.key, card)
    }
  }

  /** A flat sediment slab with a raised fossil motif, distinct for every type. */
  private fossilModel(type: FossilId): THREE.Object3D {
    const fossil = FOSSIL_BY_ID[type]
    const group = new THREE.Group()
    const stone = new THREE.MeshStandardMaterial({ color: 0x4d4a42, roughness: 0.96 })
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.11, 12), stone)
    slab.position.y = 0.055
    slab.receiveShadow = true
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.345, 0.016, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0x9a8040, roughness: 0.45, metalness: 0.5 }),
    )
    rim.rotation.x = -Math.PI / 2
    rim.position.y = 0.112
    group.add(slab, rim)

    const mat = new THREE.MeshStandardMaterial({ color: fossil.tint, roughness: 0.78, emissive: fossil.tint, emissiveIntensity: 0.09 })
    const motif = new THREE.Group()
    motif.position.y = 0.115
    motif.rotation.y = 0.35
    group.add(motif)

    const sphere = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, m = mat): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), m)
      mesh.position.set(x, y, z)
      mesh.scale.set(sx, sy, sz)
      motif.add(mesh)
      return mesh
    }
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, m = mat): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.rotation.y = ry
      motif.add(mesh)
      return mesh
    }
    const cone = (r: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, m = mat): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), m)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rx, ry, rz)
      motif.add(mesh)
      return mesh
    }

    switch (type) {
      case 'ammonite': {
        for (const [radius, tube] of [[0.19, 0.045], [0.115, 0.032], [0.05, 0.026]] as const) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 22), mat)
          ring.rotation.x = -Math.PI / 2
          ring.position.y = 0.022
          motif.add(ring)
        }
        sphere(0.045, 0, 0.04, 0)
        break
      }
      case 'trilobite': {
        sphere(0.17, 0, 0.03, 0.02, 1, 0.24, 1.35)
        sphere(0.115, 0, 0.035, -0.2, 1, 0.32, 0.8)
        for (let i = 0; i < 3; i += 1) box(0.3, 0.018, 0.012, 0, 0.058, -0.06 + i * 0.08)
        for (const side of [-1, 1]) {
          sphere(0.025, side * 0.075, 0.075, -0.22, 1, 0.8, 1, new THREE.MeshStandardMaterial({ color: 0x2d2a24, roughness: 0.8 }))
          for (let i = 0; i < 3; i += 1) box(0.1, 0.012, 0.022, side * 0.19, 0.03, -0.07 + i * 0.08, side * 0.55)
        }
        break
      }
      case 'fern': {
        box(0.02, 0.016, 0.4, 0, 0.03, 0.02)
        for (let i = 0; i < 5; i += 1) {
          const z = -0.14 + i * 0.075
          const size = 0.12 - i * 0.012
          for (const side of [-1, 1]) box(size, 0.012, 0.032, side * (size / 2 + 0.015), 0.035, z, side * 0.45)
        }
        break
      }
      case 'fish': {
        sphere(0.19, 0, 0.035, 0, 1.15, 0.26, 0.5)
        cone(0.08, 0.14, -0.27, 0.03, 0, 0, 0, -Math.PI / 2)
        sphere(0.02, 0.12, 0.07, 0.06, 1, 1, 1, new THREE.MeshStandardMaterial({ color: 0x332f26, roughness: 0.7 }))
        box(0.12, 0.012, 0.1, 0.015, 0.085, 0)
        break
      }
      case 'leaf': {
        const shape = new THREE.Shape()
        shape.moveTo(0, -0.22)
        shape.bezierCurveTo(0.15, -0.08, 0.14, 0.09, 0, 0.23)
        shape.bezierCurveTo(-0.14, 0.09, -0.15, -0.08, 0, -0.22)
        const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false }), mat)
        leaf.rotation.x = -Math.PI / 2
        leaf.position.y = 0.02
        motif.add(leaf)
        box(0.012, 0.02, 0.42, 0, 0.045, 0)
        for (let i = 0; i < 4; i += 1) {
          const z = -0.12 + i * 0.08
          for (const side of [-1, 1]) box(0.08, 0.012, 0.012, side * 0.045, 0.045, z, side * 0.75)
        }
        break
      }
      case 'shell': {
        sphere(0.055, 0, 0.04, -0.15, 1, 0.5, 1)
        for (let i = -3; i <= 3; i += 1) {
          const ridge = box(0.035, 0.02, 0.24, i * 0.032, 0.04, 0.03, i * 0.2)
          ridge.rotation.x = 0.08
        }
        box(0.26, 0.018, 0.035, 0, 0.035, -0.12)
        break
      }
      case 'insect': {
        const amberMat = new THREE.MeshStandardMaterial({ color: 0xd79a32, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55 })
        sphere(0.24, 0, 0.035, 0, 1.15, 0.32, 1.45, amberMat).renderOrder = 2
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x33281a, roughness: 0.6 })
        sphere(0.035, 0, 0.085, 0.02, 1, 0.9, 2.6, bodyMat)
        sphere(0.04, 0, 0.09, -0.1, 1, 1, 1, bodyMat)
        for (const side of [-1, 1]) sphere(0.06, side * 0.055, 0.1, -0.01, 1.1, 0.18, 3.2, new THREE.MeshStandardMaterial({ color: 0xc9d8e8, roughness: 0.3, transparent: true, opacity: 0.5 }))
        for (let i = 0; i < 3; i += 1) for (const side of [-1, 1]) box(0.09, 0.01, 0.01, side * 0.075, 0.07, -0.06 + i * 0.055, side * 0.7)
        break
      }
      case 'footprint': {
        sphere(0.11, 0, 0.03, -0.06, 1, 0.22, 1.1)
        for (const [x, rz] of [[-0.1, 0.35], [0, 0], [0.1, -0.35]] as const) {
          sphere(0.038, x, 0.04, 0.13, 0.9, 0.35, 2.1)
          cone(0.018, 0.07, x, 0.045, 0.24, Math.PI / 2, 0, rz)
        }
        break
      }
    }
    group.traverse(o => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return group
  }

  /** Display-quality procedural bone. Every campaign piece has a recognisable silhouette. */
  private buildBone(): BoneVisual {
    const bone = this.layout.bone
    const group = new THREE.Group()
    group.position.set(bone.x, 0, bone.z)
    const model = createBoneModel(bone.part)
    model.position.y = 1.015
    model.rotation.y = 0.35
    model.scale.setScalar(0.98)
    group.add(model)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTex('rgba(255,240,190,0.95)'), color: 0xffcf5a, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    halo.scale.setScalar(2.15)
    halo.position.y = 1.3
    group.add(halo)
    this.root.add(group)
    return { group, halo, model, baseY: 1.015, phase: bone.part * 0.9, taken: false }
  }


  private buildLasers(): void {
    for (const l of this.layout.lasers) {
      const len = Math.hypot(l.x2 - l.x1, l.z2 - l.z1)
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.95, toneMapped: false })
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.045, 0.045), mat)
      const ang = Math.atan2(l.z2 - l.z1, l.x2 - l.x1)
      beam.position.set((l.x1 + l.x2) / 2, 0.55, (l.z1 + l.z2) / 2)
      beam.rotation.y = -ang
      const glowMat = new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,60,80,0.8)'), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.6, 1.0), glowMat)
      glow.rotation.x = -Math.PI / 2
      glow.rotation.z = ang
      glow.position.set((l.x1 + l.x2) / 2, 0.04, (l.z1 + l.z2) / 2)
      glow.renderOrder = 4
      for (const [x, z] of [[l.x1, l.z1], [l.x2, l.z2]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), this.mat(0x2b2f40, 0.4, 0.6))
        post.position.set(x, 0.35, z)
        this.root.add(post)
      }
      this.root.add(beam, glow)
      this.laserVis.push({ beam, glow, mat })
    }
  }

  private buildCameras(): void {
    for (const c of this.layout.cameras) {
      const g = new THREE.Group()
      g.position.set(c.x, 2.15, c.z + 0.2)
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.46), this.mat(0x2a2e3e, 0.4, 0.6))
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b4b }))
      lens.position.set(0, 0, 0.24)
      body.castShadow = true
      g.add(body, lens)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), this.mat(0x555a70, 0.5, 0.6))
      arm.position.set(c.x, 2.3, c.z + 0.1)
      this.root.add(arm, g)
      this.cameraHeads.push(g)
    }
  }

  private buildExit(): THREE.Mesh {
    const { exit } = this.layout
    const tex = canvasTex(8, 128, g => {
      const gr = g.createLinearGradient(0, 128, 0, 0)
      gr.addColorStop(0, 'rgba(90,255,170,0.55)')
      gr.addColorStop(1, 'rgba(90,255,170,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 8, 128)
    })
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(exit.w, 2.6, 0.9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    beam.position.set(exit.x, 1.3, exit.z)
    beam.renderOrder = 6
    this.root.add(beam)
    // doorway frame in the outer wall
    const frameMat = this.mat(0x2fd08a, 0.4, 0.3)
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(exit.w + 0.3, 0.14, 0.4), frameMat)
    lintel.position.set(exit.x, 2.2, exit.z + 0.5)
    this.root.add(lintel)
    return beam
  }

  private buildHideMarker(): THREE.Sprite {
    const tex = canvasTex(64, 64, g => {
      g.fillStyle = 'rgba(10,14,28,0.9)'
      g.beginPath()
      g.arc(32, 32, 28, 0, 6.28)
      g.fill()
      g.strokeStyle = '#8fe3ff'
      g.lineWidth = 3
      g.stroke()
      g.fillStyle = '#8fe3ff'
      g.beginPath()
      g.moveTo(32, 14)
      g.lineTo(46, 30)
      g.lineTo(38, 30)
      g.lineTo(38, 48)
      g.lineTo(26, 48)
      g.lineTo(26, 30)
      g.lineTo(18, 30)
      g.closePath()
      g.fill()
    })
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }))
    s.scale.setScalar(0.62)
    s.renderOrder = 30
    this.root.add(s)
    return s
  }

  // ---------------------------------------------------------------- runtime
  setGlow(v: boolean): void {
    this.glowOn = v
    for (const a of this.artifacts.values()) a.halo.visible = v
    this.boneVis.halo.visible = v
  }

  setQuality(q: Quality, shadowMapSize = 1024): void {
    this.quality = q
    const lamps = q === 'low' ? 2 : q === 'medium' ? 4 : 6
    this.lampLights.forEach((l, i) => {
      l.visible = i < lamps
    })
    const spots = q === 'low' ? 1 : q === 'medium' ? 2 : 3
    this.spots.forEach((s, i) => {
      s.visible = i < spots
    })
    this.moon.castShadow = q !== 'low'
    this.moon.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    this.moon.shadow.map?.dispose()
    this.moon.shadow.map = null
  }

  get activeSpots(): number {
    return this.spots.filter(s => s.visible).length
  }

  /** Per-frame: lamp assignment, moon follow, artifact bobbing, doors, lasers, occlusion cut-aways. */
  update(dt: number, focus: { x: number; z: number }, cam: THREE.Vector3, targets: OccTarget[], laserOn: boolean[]): void {
    this.time += dt
    this.moon.target.position.set(focus.x, 0, focus.z)
    this.moon.position.set(focus.x - 7, 15, focus.z - 6)
    this.moon.target.updateMatrixWorld()

    // lamps: nearest lamps; each pooled light fades out before moving to a new lamp
    const order = this.lampPositions.map((p, i) => ({ i, d: (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 })).sort((a, b) => a.d - b.d)
    const want = order.slice(0, this.lampLights.filter(l => l.visible).length).map(o => o.i)
    const free = want.filter(i => !this.lampAssign.includes(i))
    this.lampLights.forEach((l, k) => {
      if (!l.visible) return
      const assigned = this.lampAssign[k]
      const keep = assigned !== undefined && want.includes(assigned)
      if (keep) {
        l.intensity += (26 - l.intensity) * Math.min(1, dt * 5)
      } else {
        l.intensity -= l.intensity * Math.min(1, dt * 8)
        if (l.intensity < 0.6) {
          const nxt = free.shift()
          if (nxt !== undefined) {
            this.lampAssign[k] = nxt
            l.position.copy(this.lampPositions[nxt])
          } else {
            this.lampAssign[k] = -1
          }
        }
      }
    })

    for (const a of this.artifacts.values()) {
      if (a.taken) continue
      a.model.position.y = a.baseY + Math.sin(this.time * 2 + a.phase) * 0.05
      a.model.rotation.y += dt * 1.1
      const m = (a.halo.material as THREE.SpriteMaterial)
      m.opacity = 0.5 + 0.28 * Math.sin(this.time * 3 + a.phase)
    }
    if (!this.boneVis.taken) {
      this.boneVis.model.position.y = this.boneVis.baseY + Math.sin(this.time * 1.7 + this.boneVis.phase) * 0.035
      this.boneVis.model.rotation.y += dt * 0.35
      const bm = this.boneVis.halo.material as THREE.SpriteMaterial
      bm.opacity = 0.52 + 0.24 * Math.sin(this.time * 2.4 + this.boneVis.phase)
    }
    this.layout.keycards.forEach(k => {
      const c = this.keycardVis.get(k.key)
      if (c && c.visible) {
        c.position.y = 1.2 + Math.sin(this.time * 2.4 + k.key) * 0.06
        c.rotation.y += dt * 1.6
      }
    })
    for (const d of this.doorVis.values()) {
      const target = d.open
      d.group.position.y += (target * 2.35 - d.group.position.y) * Math.min(1, dt * 4)
      d.group.visible = d.group.position.y < 2.3
    }
    this.layout.lasers.forEach((l, i) => {
      const v = this.laserVis[i]
      if (!v) return
      const on = laserOn[i]
      const phase = (this.time + l.offset) % l.period
      const warn = !on && l.period - phase < 0.5
      v.beam.visible = on || warn
      v.glow.visible = on
      v.mat.opacity = on ? 0.95 : 0.25 + 0.2 * Math.sin(this.time * 40)
    })
    for (const c of this.curtainVis.values()) {
      const s = 0.001 + c.closed * 0.999
      c.drape.scale.x = s
    }
    this.exitBeam.material instanceof THREE.MeshBasicMaterial && (this.exitBeam.material.opacity = 0.4 + 0.15 * Math.sin(this.time * 2.2))

    this.applyOcclusion(dt, cam, targets)
  }

  /** Cut walls/tall props down when they stand between the camera and a unit (smooth, not popping). */
  private applyOcclusion(dt: number, cam: THREE.Vector3, targets: OccTarget[]): void {
    const m = new THREE.Matrix4()
    const k = Math.min(1, dt * 10)
    const pos = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    let dirty = false
    const blocks = (cx: number, cz: number, h: number): boolean => {
      for (const t of targets) {
        // 2D segment camera(xz) -> target
        const sx = t.x - cam.x
        const sz = t.z - cam.z
        const len2 = sx * sx + sz * sz
        if (len2 < 1e-6) continue
        const u = ((cx - cam.x) * sx + (cz - cam.z) * sz) / len2
        if (u <= 0 || u >= 1.0) continue
        const px = cam.x + sx * u
        const pz = cam.z + sz * u
        const lateral = Math.hypot(cx - px, cz - pz)
        if (lateral > 0.95) continue
        const rayY = cam.y + (t.h - cam.y) * u
        if (rayY < h + 0.55) return true
      }
      return false
    }
    this.wallList.forEach((w, i) => {
      const near = targets.some(t => Math.abs(t.x - w.tx - 0.5) < 3.2 && w.tz + 0.5 >= t.z - 1 && w.tz + 0.5 - t.z < 5)
      const target = near && blocks(w.tx + 0.5, w.tz + 0.5, WALL_H) ? 0.16 : 1
      if (Math.abs(target - w.s) < 0.002) return
      w.s += (target - w.s) * k
      if (Math.abs(target - w.s) < 0.004) w.s = target
      const h = WALL_H * w.s
      pos.set(w.tx + 0.5, h / 2, w.tz + 0.5)
      sc.set(1, h, 1)
      m.compose(pos, q, sc)
      this.walls.setMatrixAt(i, m)
      dirty = true
    })
    if (dirty) this.walls.instanceMatrix.needsUpdate = true
    for (const o of this.occluders) {
      const near = targets.some(t => Math.abs(t.x - o.x) < 2.5 && o.z >= t.z - 0.5 && o.z - t.z < 4)
      const target = near && blocks(o.x, o.z, o.h) ? 0.3 : 1
      if (Math.abs(target - o.s) < 0.002) continue
      o.s += (target - o.s) * k
      o.obj.scale.y = o.s
      o.obj.visible = true
    }
  }

  setLockedDoorOpen(key: number): void {
    const d = this.doorVis.get(key)
    if (d) d.open = 1
  }

  takeArtifact(id: number): THREE.Vector3 | undefined {
    const a = this.artifacts.get(id)
    if (!a) return undefined
    a.taken = true
    a.group.visible = false
    return a.group.position.clone()
  }

  takeBone(): THREE.Vector3 | undefined {
    if (this.boneVis.taken) return undefined
    this.boneVis.taken = true
    this.boneVis.group.visible = false
    return this.boneVis.group.position.clone()
  }

  takeKeycard(key: number): void {
    const c = this.keycardVis.get(key)
    if (c) c.visible = false
  }

  /** Where the hide-spot hint floats (above the spot). */
  placeHideMarker(x: number, z: number, opacity: number): void {
    this.hideMarker.position.set(x, 2.35, z)
    ;(this.hideMarker.material as THREE.SpriteMaterial).opacity = opacity
  }

  get qualityLevel(): Quality {
    return this.quality
  }

  dispose(): void {
    this.scene.traverse(o => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(x => x.dispose())
      else mat?.dispose?.()
    })
    this.floorTex.dispose()
  }
}
