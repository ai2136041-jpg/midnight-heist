/**
 * Tile grid used by player, guards and security: circle-vs-tile collision, line of sight,
 * cone raycasts and A* pathfinding. Pure logic, no three.js, unit tested.
 * Tile (tx, tz) covers world x in [tx, tx+1), z in [tz, tz+1).
 */
export type Vec2 = { x: number; z: number }

export const SURFACE_MARBLE = 0
export const SURFACE_CARPET = 1
export const SURFACE_WOOD = 2
export type Surface = typeof SURFACE_MARBLE | typeof SURFACE_CARPET | typeof SURFACE_WOOD

export class Grid {
  /** 1 = blocks movement (wall, prop, closed locked door). */
  readonly solid: Uint8Array
  /** 1 = blocks sight. */
  readonly opaque: Uint8Array
  /** 1 = structural wall (never changes). */
  readonly wall: Uint8Array
  readonly surface: Uint8Array
  /** Locked door tiles by index -> key id. */
  readonly locked = new Map<number, number>()

  constructor(readonly w: number, readonly h: number) {
    const n = w * h
    this.solid = new Uint8Array(n)
    this.opaque = new Uint8Array(n)
    this.wall = new Uint8Array(n)
    this.surface = new Uint8Array(n)
  }

  idx(tx: number, tz: number): number {
    return tz * this.w + tx
  }
  inside(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.w && tz < this.h
  }
  isSolid(tx: number, tz: number): boolean {
    return !this.inside(tx, tz) || this.solid[this.idx(tx, tz)] === 1
  }
  isOpaque(tx: number, tz: number): boolean {
    return !this.inside(tx, tz) || this.opaque[this.idx(tx, tz)] === 1
  }
  isWall(tx: number, tz: number): boolean {
    return !this.inside(tx, tz) || this.wall[this.idx(tx, tz)] === 1
  }
  surfaceAt(x: number, z: number): number {
    const tx = Math.floor(x)
    const tz = Math.floor(z)
    return this.inside(tx, tz) ? this.surface[this.idx(tx, tz)] : SURFACE_MARBLE
  }

  /** Move a circle by (dx, dz) and push it out of solid tiles. Returns true when it hit something. */
  moveCircle(p: Vec2, dx: number, dz: number, r: number): boolean {
    p.x += dx
    p.z += dz
    let hit = false
    for (let iter = 0; iter < 3; iter += 1) {
      let moved = false
      const x0 = Math.floor(p.x - r)
      const x1 = Math.floor(p.x + r)
      const z0 = Math.floor(p.z - r)
      const z1 = Math.floor(p.z + r)
      for (let tz = z0; tz <= z1; tz += 1) {
        for (let tx = x0; tx <= x1; tx += 1) {
          if (!this.isSolid(tx, tz)) continue
          const cx = Math.max(tx, Math.min(p.x, tx + 1))
          const cz = Math.max(tz, Math.min(p.z, tz + 1))
          let ox = p.x - cx
          let oz = p.z - cz
          const d2 = ox * ox + oz * oz
          if (d2 >= r * r) continue
          hit = true
          moved = true
          if (d2 < 1e-9) {
            // Centre inside a tile (teleport/spawn): shove along the shallowest axis.
            const left = p.x - tx
            const right = tx + 1 - p.x
            const up = p.z - tz
            const down = tz + 1 - p.z
            const m = Math.min(left, right, up, down)
            if (m === left) p.x = tx - r
            else if (m === right) p.x = tx + 1 + r
            else if (m === up) p.z = tz - r
            else p.z = tz + 1 + r
            continue
          }
          const d = Math.sqrt(d2)
          ox /= d
          oz /= d
          p.x = cx + ox * r
          p.z = cz + oz * r
        }
      }
      if (!moved) break
    }
    return hit
  }

  /** True when a circle of radius r centred at (x,z) overlaps no solid tile. */
  clear(x: number, z: number, r: number): boolean {
    const x0 = Math.floor(x - r)
    const x1 = Math.floor(x + r)
    const z0 = Math.floor(z - r)
    const z1 = Math.floor(z + r)
    for (let tz = z0; tz <= z1; tz += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (!this.isSolid(tx, tz)) continue
        const cx = Math.max(tx, Math.min(x, tx + 1))
        const cz = Math.max(tz, Math.min(z, tz + 1))
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false
      }
    }
    return true
  }

  /** Distance along a ray to the first opaque tile, capped at maxDist (DDA). */
  raycast(x: number, z: number, dx: number, dz: number, maxDist: number): number {
    let tx = Math.floor(x)
    let tz = Math.floor(z)
    if (this.isOpaque(tx, tz)) return 0
    const stepX = dx > 0 ? 1 : -1
    const stepZ = dz > 0 ? 1 : -1
    const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx)
    const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz)
    let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? tx + 1 - x : x - tx) * tDeltaX)
    let tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? tz + 1 - z : z - tz) * tDeltaZ)
    let dist = 0
    while (dist < maxDist) {
      if (tMaxX < tMaxZ) {
        dist = tMaxX
        tMaxX += tDeltaX
        tx += stepX
      } else {
        dist = tMaxZ
        tMaxZ += tDeltaZ
        tz += stepZ
      }
      if (dist >= maxDist) return maxDist
      if (this.isOpaque(tx, tz)) return dist
    }
    return maxDist
  }

  /** Line of sight between two points (opaque tiles block). */
  los(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0
    const dz = z1 - z0
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) return true
    return this.raycast(x0, z0, dx / len, dz / len, len) >= len - 1e-4
  }

  /** Number of wall tiles crossed by the segment (sound dampening). */
  wallsBetween(x0: number, z0: number, x1: number, z1: number): number {
    const dx = x1 - x0
    const dz = z1 - z0
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) return 0
    let count = 0
    let last = -1
    const steps = Math.ceil(len / 0.4)
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps
      const tx = Math.floor(x0 + dx * t)
      const tz = Math.floor(z0 + dz * t)
      const id = tz * this.w + tx
      if (id === last) continue
      last = id
      if (this.isWall(tx, tz) || (this.inside(tx, tz) && this.opaque[id] === 1 && this.solid[id] === 1 && this.wall[id] === 1)) count += 1
    }
    return count
  }

  /** Straight walk of a circle from a to b without touching solid tiles. */
  walkable(a: Vec2, b: Vec2, r: number): boolean {
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(len / 0.25))
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      if (!this.clear(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r)) return false
    }
    return true
  }

  nearestFree(x: number, z: number, maxRadius = 6): Vec2 | undefined {
    const tx = Math.floor(x)
    const tz = Math.floor(z)
    for (let r = 0; r <= maxRadius; r += 1) {
      let best: Vec2 | undefined
      let bestD = Infinity
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const nx = tx + dx
          const nz = tz + dz
          if (this.isSolid(nx, nz)) continue
          const d = (nx + 0.5 - x) ** 2 + (nz + 0.5 - z) ** 2
          if (d < bestD) {
            bestD = d
            best = { x: nx + 0.5, z: nz + 0.5 }
          }
        }
      }
      if (best) return best
    }
    return undefined
  }

  /**
   * A* over free tiles (8-neighbour, no corner cutting) with a small penalty next to walls, then
   * string-pulled into a few waypoints that a circle of radius `r` can walk. Locked doors are
   * ignored when `throughLocks` is true (guards own the keys). Empty when unreachable.
   */
  findPath(from: Vec2, to: Vec2, r = 0.3, throughLocks = true): Vec2[] {
    const blocked = (tx: number, tz: number) => {
      if (!this.inside(tx, tz)) return true
      const i = this.idx(tx, tz)
      if (this.solid[i] === 0) return false
      return !(throughLocks && this.locked.has(i))
    }
    let sx = Math.floor(from.x)
    let sz = Math.floor(from.z)
    let gx = Math.floor(to.x)
    let gz = Math.floor(to.z)
    if (blocked(sx, sz)) {
      const f = this.nearestFree(from.x, from.z, 3)
      if (!f) return []
      sx = Math.floor(f.x)
      sz = Math.floor(f.z)
    }
    if (blocked(gx, gz)) {
      const f = this.nearestFree(to.x, to.z, 4)
      if (!f) return []
      gx = Math.floor(f.x)
      gz = Math.floor(f.z)
    }
    const n = this.w * this.h
    const g = new Float32Array(n).fill(Infinity)
    const from_ = new Int32Array(n).fill(-1)
    const closed = new Uint8Array(n)
    const heap: Array<[number, number]> = []
    const push = (f: number, id: number) => {
      heap.push([f, id])
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (heap[p][0] <= heap[i][0]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    }
    const pop = (): number => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length > 0) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const rr = l + 1
          let m = i
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr
          if (m === i) break
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top[1]
    }
    const start = this.idx(sx, sz)
    const goal = this.idx(gx, gz)
    g[start] = 0
    push(0, start)
    const SQ = Math.SQRT2
    const dirs: Array<[number, number, number]> = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ], [1, -1, SQ], [-1, 1, SQ], [-1, -1, SQ],
    ]
    let found = false
    while (heap.length > 0) {
      const cur = pop()
      if (closed[cur]) continue
      closed[cur] = 1
      if (cur === goal) {
        found = true
        break
      }
      const cx = cur % this.w
      const cz = (cur - cx) / this.w
      for (const [ddx, ddz, cost] of dirs) {
        const nx = cx + ddx
        const nz = cz + ddz
        if (blocked(nx, nz)) continue
        if (ddx !== 0 && ddz !== 0 && (blocked(cx + ddx, cz) || blocked(cx, cz + ddz))) continue
        const id = this.idx(nx, nz)
        if (closed[id]) continue
        let extra = 0
        if (blocked(nx + 1, nz) || blocked(nx - 1, nz) || blocked(nx, nz + 1) || blocked(nx, nz - 1)) extra = 0.35
        const ng = g[cur] + cost + extra
        if (ng < g[id]) {
          g[id] = ng
          from_[id] = cur
          const h = Math.hypot(nx - gx, nz - gz)
          push(ng + h, id)
        }
      }
    }
    if (!found) return []
    const tiles: Vec2[] = []
    for (let c = goal; c !== -1; c = from_[c]) {
      const cx = c % this.w
      tiles.push({ x: cx + 0.5, z: (c - cx) / this.w + 0.5 })
    }
    tiles.reverse()
    // The path ends at the exact target when it is free so guards reach the noise spot.
    if (!blocked(Math.floor(to.x), Math.floor(to.z)) && this.clear(to.x, to.z, Math.min(r, 0.28))) tiles[tiles.length - 1] = { x: to.x, z: to.z }
    // String pulling: skip waypoints while a straight walk stays clear.
    const out: Vec2[] = []
    let anchor: Vec2 = from
    let i = 0
    while (i < tiles.length) {
      let far = i
      for (let j = tiles.length - 1; j > i; j -= 1) {
        if (this.walkable(anchor, tiles[j], r * 0.9)) {
          far = j
          break
        }
      }
      out.push(tiles[far])
      anchor = tiles[far]
      i = far + 1
    }
    return out
  }

  /** BFS flood fill over free (non-solid) tiles; locked doors count as passable when asked. */
  reachable(from: Vec2, throughLocks = false): Uint8Array {
    const seen = new Uint8Array(this.w * this.h)
    const sx = Math.floor(from.x)
    const sz = Math.floor(from.z)
    if (!this.inside(sx, sz)) return seen
    const stack = [this.idx(sx, sz)]
    seen[stack[0]] = 1
    while (stack.length > 0) {
      const c = stack.pop()!
      const cx = c % this.w
      const cz = (c - cx) / this.w
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx
        const nz = cz + dz
        if (!this.inside(nx, nz)) continue
        const id = this.idx(nx, nz)
        if (seen[id]) continue
        if (this.solid[id] === 1 && !(throughLocks && this.locked.has(id))) continue
        seen[id] = 1
        stack.push(id)
      }
    }
    return seen
  }
}
