/**
 * Level definitions. Every level is a grid configuration (LevelParams) fed to one deterministic
 * room-based generator: levels 1-10 are fixed designs (explicit params + seed), levels 11+ are
 * generated Endless levels from the same scaling rules. Output is a plain `Layout` (no three.js).
 *
 * Coordinates: tile (tx,tz) covers [tx,tx+1) x [tz,tz+1); +z is "south" (towards the camera).
 * Direction convention: yaw angle a -> direction (sin a, cos a); yaw 0 faces south.
 */
import { CONFIG } from './config'
import { BONE_BY_LEVEL, pickFossil, type FossilId } from './collection'
import { Grid, SURFACE_CARPET, SURFACE_MARBLE, SURFACE_WOOD, type Vec2 } from './grid'
import {
  cameraCount, dawnSeconds, guardCount, isVault, laserCount, lockedDoorCount, slotsOf, valueOf,
  type Tier,
} from './rules'

export type Theme = 'lobby' | 'gallery' | 'hall' | 'office' | 'vault'
export type PropKind = 'statue' | 'urn' | 'pedestal' | 'case' | 'table' | 'locker' | 'bench' | 'plinth'
export type HideKind = 'locker' | 'curtain' | 'table' | 'corner' | 'vent'

export type Room = { id: number; col: number; row: number; x0: number; z0: number; x1: number; z1: number; cx: number; cz: number; theme: Theme; locked: boolean }
export type PropDef = { kind: PropKind; x: number; z: number; w: number; d: number; yaw: number }
export type HideDef = { id: number; kind: HideKind; x: number; z: number; yaw: number; room: number }
export type ArtifactDef = { id: number; tier: Tier; fossil: FossilId; x: number; z: number; tx: number; tz: number; locked: boolean; room: number; value: number; slots: number }
export type BoneDef = { part: number; x: number; z: number; tx: number; tz: number; room: number }
export type DoorDef = { tx: number; tz: number; orient: 'v' | 'h'; key: number; a: number; b: number }
export type LaserDef = { x1: number; z1: number; x2: number; z2: number; period: number; onTime: number; offset: number }
export type CameraDef = { x: number; z: number; yaw: number; sweep: number; phase: number; room: number }
export type KeycardDef = { key: number; x: number; z: number; tx: number; tz: number }
export type GuardDef = { route: Vec2[]; startIndex: number; room: number }
export type WindowDef = { tx: number; tz: number; side: 'n' | 'e' | 'w' }

export type Layout = {
  level: number
  seed: number
  grid: Grid
  w: number
  h: number
  rooms: Room[]
  props: PropDef[]
  hides: HideDef[]
  artifacts: ArtifactDef[]
  /** Mandatory dinosaur bone for this level (campaign levels 1-10). */
  bone: BoneDef
  doors: DoorDef[]
  lasers: LaserDef[]
  cameras: CameraDef[]
  keycards: KeycardDef[]
  guards: GuardDef[]
  windows: WindowDef[]
  paintings: Array<{ tx: number; tz: number }>
  lamps: Vec2[]
  start: Vec2
  exit: { x: number; z: number; w: number }
  entryRoom: number
  vault: boolean
  tutorial: boolean
  dawnSeconds: number
  totalValue: number
  slotsOfAll: number
}

export type LevelParams = {
  seed: number
  cols: number
  rows: number
  wMin: number
  wMax: number
  hMin: number
  hMax: number
  extraEdges: number
  commons: number
  rares: number
  legendaries: number
  tutorial?: boolean
  /** Rooms (by id) guards may patrol; default all unlocked rooms except the entry. */
  guardRooms?: number[]
  commonRooms?: number[]
  rareRooms?: number[]
}

/** Designed parameters for levels 1-10 (deterministic); beyond that Endless scales them. */
export function paramsForLevel(level: number): LevelParams {
  const n = Math.max(1, Math.floor(level))
  const designed: Record<number, Partial<LevelParams>> = {
    1: { cols: 2, rows: 2, wMin: 9, wMax: 9, hMin: 7, hMax: 7, extraEdges: 1, commons: 3, rares: 1, legendaries: 0, tutorial: true, guardRooms: [1, 3], commonRooms: [0, 0, 3], rareRooms: [1] },
    2: { cols: 3, rows: 2, wMin: 8, wMax: 10, hMin: 6, hMax: 8, extraEdges: 1, commons: 4, rares: 1, legendaries: 0 },
    3: { cols: 3, rows: 2, wMin: 8, wMax: 10, hMin: 6, hMax: 8, extraEdges: 2, commons: 4, rares: 2, legendaries: 1 },
    4: { cols: 3, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 2, commons: 5, rares: 2, legendaries: 1 },
    5: { cols: 3, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 2, commons: 5, rares: 2, legendaries: 1 },
    6: { cols: 4, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 3, commons: 6, rares: 3, legendaries: 1 },
    7: { cols: 4, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 3, commons: 6, rares: 3, legendaries: 1 },
    8: { cols: 4, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 3, commons: 7, rares: 3, legendaries: 1 },
    9: { cols: 4, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 4, commons: 7, rares: 4, legendaries: 1 },
    10: { cols: 4, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 4, commons: 7, rares: 4, legendaries: 1 },
  }
  const base: LevelParams = { seed: 1000 + n * 7919, cols: 4, rows: 3, wMin: 8, wMax: 9, hMin: 6, hMax: 7, extraEdges: 4, commons: 7, rares: 4, legendaries: 1 }
  const d = designed[n]
  if (d) return { ...base, ...d, seed: 1000 + n * 7919 }
  // Endless: bigger every few levels, always the same scaling rules for threats.
  const big = n % 3 === 0
  return { ...base, cols: 4, rows: big ? 4 : 3, extraEdges: 4 + (n % 3), commons: 7 + (n % 3), rares: 4 + Math.floor((n - 10) / 8), legendaries: 1 }
}

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildLevel(level: number): Layout {
  const p = paramsForLevel(level)
  const rng = mulberry32(p.seed)
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1))
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const vault = isVault(level)
  const colW = Array.from({ length: p.cols }, () => ri(p.wMin, p.wMax))
  const rowH = Array.from({ length: p.rows }, () => ri(p.hMin, p.hMax))
  const W = 1 + colW.reduce((s, v) => s + v + 1, 0)
  const H = 1 + rowH.reduce((s, v) => s + v + 1, 0)
  const grid = new Grid(W, H)
  grid.solid.fill(1)
  grid.opaque.fill(1)
  grid.wall.fill(1)
  const rooms: Room[] = []
  let zAcc = 1
  for (let row = 0; row < p.rows; row += 1) {
    let xAcc = 1
    for (let col = 0; col < p.cols; col += 1) {
      const x0 = xAcc
      const z0 = zAcc
      const x1 = x0 + colW[col] - 1
      const z1 = z0 + rowH[row] - 1
      rooms.push({ id: row * p.cols + col, col, row, x0, z0, x1, z1, cx: Math.floor((x0 + x1) / 2), cz: Math.floor((z0 + z1) / 2), theme: 'hall', locked: false })
      xAcc += colW[col] + 1
    }
    zAcc += rowH[row] + 1
  }
  const carve = (tx: number, tz: number, surface: number) => {
    const i = grid.idx(tx, tz)
    grid.solid[i] = 0
    grid.opaque[i] = 0
    grid.wall[i] = 0
    grid.surface[i] = surface
  }
  const entryRoom = p.tutorial ? (p.rows - 1) * p.cols : (p.rows - 1) * p.cols + (level % 2 === 0 ? p.cols - 1 : 0)

  // --- room graph: random spanning tree + extra edges (loops for patrols)
  const adj = new Map<number, number[]>(rooms.map(r => [r.id, []]))
  const edges: Array<[number, number]> = []
  const connect = (a: number, b: number) => {
    edges.push([a, b])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  const neighbours = (r: Room) => rooms.filter(o => (Math.abs(o.col - r.col) + Math.abs(o.row - r.row)) === 1)
  const seen = new Set<number>([entryRoom])
  const stack = [entryRoom]
  while (stack.length > 0) {
    const cur = rooms[stack[stack.length - 1]]
    const next = shuffle(neighbours(cur).filter(o => !seen.has(o.id)))
    if (next.length === 0) {
      stack.pop()
      continue
    }
    seen.add(next[0].id)
    connect(cur.id, next[0].id)
    stack.push(next[0].id)
  }
  const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  const candidates = shuffle(rooms.flatMap(a => neighbours(a).filter(b => b.id > a.id && !has(a.id, b.id)).map(b => [a.id, b.id] as [number, number])))
  for (let i = 0; i < Math.min(p.extraEdges, candidates.length); i += 1) connect(candidates[i][0], candidates[i][1])

  // BFS distance from entry for themes / vault selection.
  const dist = new Map<number, number>([[entryRoom, 0]])
  const queue = [entryRoom]
  while (queue.length > 0) {
    const c = queue.shift()!
    for (const n of adj.get(c)!) if (!dist.has(n)) {
      dist.set(n, dist.get(c)! + 1)
      queue.push(n)
    }
  }
  const leaves = rooms.filter(r => r.id !== entryRoom && adj.get(r.id)!.length === 1)
  const farthest = [...rooms].filter(r => r.id !== entryRoom).sort((a, b) => dist.get(b.id)! - dist.get(a.id)! || a.id - b.id)
  const vaultRoom = vault ? (leaves.length > 0 ? [...leaves].sort((a, b) => dist.get(b.id)! - dist.get(a.id)! || a.id - b.id)[0] : farthest[0]) : undefined
  const themes: Theme[] = ['gallery', 'hall', 'office', 'gallery', 'hall']
  rooms.forEach((r, i) => {
    r.theme = r.id === entryRoom ? 'lobby' : r.id === vaultRoom?.id ? 'vault' : themes[(i + ri(0, 4)) % themes.length]
  })
  if (p.tutorial) for (const r of rooms) r.theme = r.id === entryRoom ? 'lobby' : r.id === 1 ? 'gallery' : r.id === 0 ? 'hall' : 'office'
  const surfaceOf = (t: Theme) => (t === 'gallery' ? SURFACE_CARPET : t === 'office' ? SURFACE_WOOD : SURFACE_MARBLE)
  for (const r of rooms) for (let z = r.z0; z <= r.z1; z += 1) for (let x = r.x0; x <= r.x1; x += 1) carve(x, z, surfaceOf(r.theme))

  // --- doors (2 tiles wide)
  const doors: DoorDef[] = []
  edges.forEach(([ia, ib]) => {
    const a = rooms[ia]
    const b = rooms[ib]
    const [lo, hi] = a.col < b.col || a.row < b.row ? [a, b] : [b, a]
    if (lo.row === hi.row) {
      const tz = ri(lo.z0 + 1, lo.z1 - 2)
      const tx = lo.x1 + 1
      carve(tx, tz, grid.surface[grid.idx(lo.x1, tz)])
      carve(tx, tz + 1, grid.surface[grid.idx(lo.x1, tz + 1)])
      doors.push({ tx, tz, orient: 'v', key: 0, a: lo.id, b: hi.id })
    } else {
      const tx = ri(lo.x0 + 1, lo.x1 - 2)
      const tz = lo.z1 + 1
      carve(tx, tz, grid.surface[grid.idx(tx, lo.z1)])
      carve(tx + 1, tz, grid.surface[grid.idx(tx + 1, lo.z1)])
      doors.push({ tx, tz, orient: 'h', key: 0, a: lo.id, b: hi.id })
    }
  })
  const doorTiles = (d: DoorDef): Array<[number, number]> => (d.orient === 'v' ? [[d.tx, d.tz], [d.tx, d.tz + 1]] : [[d.tx, d.tz], [d.tx + 1, d.tz]])

  // --- entrance / exit zone (3 tiles wide on the south wall of the entry room)
  const er = rooms[entryRoom]
  const exit = { x: er.cx + 0.5, z: er.z1 + 0.5, w: 3 }
  const start: Vec2 = { x: exit.x, z: exit.z }

  // --- reserved tiles: doorways and the exit zone stay clear of props
  const reserved = new Set<number>()
  const reserve = (tx: number, tz: number, r = 1) => {
    for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (grid.inside(tx + dx, tz + dz)) reserved.add(grid.idx(tx + dx, tz + dz))
  }
  for (const d of doors) for (const [tx, tz] of doorTiles(d)) reserve(tx, tz, 1)
  for (let dx = -2; dx <= 2; dx += 1) reserve(er.cx + dx, er.z1, 1)

  // --- locked rooms (level 8+): leaf rooms get a locked door
  const lockedRooms: Room[] = []
  const wantLocks = lockedDoorCount(level)
  const lockCandidates = shuffle(leaves.filter(r => r.id !== vaultRoom?.id)).sort((a, b) => dist.get(b.id)! - dist.get(a.id)! )
  const lockPool = vaultRoom ? [vaultRoom, ...lockCandidates] : lockCandidates
  for (const r of lockPool) {
    if (lockedRooms.length >= wantLocks) break
    if (p.tutorial) break
    if (!lockedRooms.includes(r)) lockedRooms.push(r)
  }
  let keyId = 1
  for (const r of lockedRooms) {
    r.locked = true
    const d = doors.find(dd => dd.a === r.id || dd.b === r.id)!
    d.key = keyId
    for (const [tx, tz] of doorTiles(d)) {
      grid.solid[grid.idx(tx, tz)] = 1
      grid.opaque[grid.idx(tx, tz)] = 1
      grid.locked.set(grid.idx(tx, tz), keyId)
    }
    keyId += 1
  }

  // --- placement helpers (each placement keeps every doorway/artifact reachable)
  const mustReach: Vec2[] = [start]
  for (const d of doors) for (const [tx, tz] of doorTiles(d)) mustReach.push({ x: tx + 0.5, z: tz + 0.5 })
  const artifactTiles: Array<[number, number]> = []
  const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const connected = (): boolean => {
    const seenTiles = grid.reachable(start, true)
    for (const m of mustReach) if (!seenTiles[grid.idx(Math.floor(m.x), Math.floor(m.z))]) return false
    for (const [tx, tz] of artifactTiles) {
      if (!nbrs.some(([dx, dz]) => grid.inside(tx + dx, tz + dz) && seenTiles[grid.idx(tx + dx, tz + dz)] === 1)) return false
    }
    return true
  }
  const props: PropDef[] = []
  const tileFree = (tx: number, tz: number) => grid.inside(tx, tz) && grid.solid[grid.idx(tx, tz)] === 0 && !reserved.has(grid.idx(tx, tz))
  const place = (kind: PropKind, tx: number, tz: number, w: number, d: number, yaw = 0, opaque = false): boolean => {
    for (let dz = 0; dz < d; dz += 1) for (let dx = 0; dx < w; dx += 1) if (!tileFree(tx + dx, tz + dz)) return false
    for (let dz = 0; dz < d; dz += 1) for (let dx = 0; dx < w; dx += 1) {
      grid.solid[grid.idx(tx + dx, tz + dz)] = 1
      if (opaque) grid.opaque[grid.idx(tx + dx, tz + dz)] = 1
    }
    if (!connected()) {
      for (let dz = 0; dz < d; dz += 1) for (let dx = 0; dx < w; dx += 1) {
        grid.solid[grid.idx(tx + dx, tz + dz)] = 0
        grid.opaque[grid.idx(tx + dx, tz + dz)] = 0
      }
      return false
    }
    props.push({ kind, x: tx + w / 2, z: tz + d / 2, w, d, yaw })
    return true
  }
  /** Interior tile at least `margin` away from the room walls, shuffled. */
  const interior = (r: Room, margin = 1): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let z = r.z0 + margin; z <= r.z1 - margin; z += 1) for (let x = r.x0 + margin; x <= r.x1 - margin; x += 1) out.push([x, z])
    return shuffle(out)
  }
  const hides: HideDef[] = []
  const hideIn = (room: number) => hides.filter(h => h.room === room).length
  const addHide = (kind: HideKind, x: number, z: number, yaw: number, room: number) => hides.push({ id: hides.length, kind, x, z, yaw, room })

  // --- windows, paintings, lamps
  const windows: WindowDef[] = []
  const paintings: Array<{ tx: number; tz: number }> = []
  const lamps: Vec2[] = []
  for (const r of rooms) {
    lamps.push({ x: r.cx + 0.5, z: r.cz + 0.5 })
    if (r.row === 0) for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) windows.push({ tx: x, tz: 0, side: 'n' })
    if (r.col === 0 && r.id % 2 === 0) windows.push({ tx: 0, tz: r.cz, side: 'w' })
    if (r.col === p.cols - 1 && r.id % 2 === 1) windows.push({ tx: W - 1, tz: r.cz, side: 'e' })
    // paintings on the south-facing side of the room's north wall
    if (r.row > 0 || r.theme !== 'lobby') {
      const xs = shuffle(Array.from({ length: r.x1 - r.x0 - 1 }, (_, i) => r.x0 + 1 + i))
      for (const x of xs.slice(0, 2)) if (!windows.some(w => w.tx === x && w.tz === r.z0 - 1)) paintings.push({ tx: x, tz: r.z0 - 1 })
    }
  }

  // --- hiding spots: curtains/vents at north-wall windows, lockers, corners, tables
  for (const r of rooms) {
    const wantLockers = r.theme === 'office' ? 2 : r.theme === 'lobby' ? 1 : r.theme === 'vault' ? 0 : 1
    const northRow = shuffle(Array.from({ length: r.x1 - r.x0 + 1 }, (_, i) => r.x0 + i))
    let lockers = 0
    for (const x of northRow) {
      if (lockers >= wantLockers) break
      if (windows.some(w => w.tx === x && w.tz === r.z0 - 1)) continue
      if (place('locker', x, r.z0, 1, 1, 0, true)) {
        addHide('locker', x + 0.5, r.z0 + 0.5, 0, r.id)
        lockers += 1
      }
    }
    // curtain on a north window of this room
    const win = windows.find(w => w.side === 'n' && w.tx >= r.x0 && w.tx <= r.x1 && w.tz === r.z0 - 1)
    if (win && tileFree(win.tx, r.z0)) addHide('curtain', win.tx + 0.5, r.z0 + 0.5, 0, r.id)
    else if (r.theme !== 'vault') {
      const vx = northRow.find(x => tileFree(x, r.z0) && !windows.some(w => w.tx === x && w.tz === r.z0 - 1) && !paintings.some(pp => pp.tx === x && pp.tz === r.z0 - 1))
      if (vx !== undefined && rng() < 0.6) addHide('vent', vx + 0.5, r.z0 + 0.5, 0, r.id)
    }
    if (rng() < 0.7 && tileFree(r.x1, r.z1) && !(r.id === entryRoom && Math.abs(r.x1 - r.cx) < 3)) addHide('corner', r.x1 + 0.5, r.z1 + 0.5, 0, r.id)
  }

  // --- artifacts (fossils)
  const artifacts: ArtifactDef[] = []
  const usedFossils = new Set<FossilId>()
  const unlockedRooms = rooms.filter(r => r.id !== entryRoom && !r.locked)
  const addArtifact = (tier: Tier, room: Room, near?: [number, number], locked = false): boolean => {
    const spots = near ? [near] : interior(room, 1)
    for (const [tx, tz] of spots) {
      if (!tileFree(tx, tz)) continue
      // keep pedestals two tiles apart from other artifacts for readability
      if (artifacts.some(a => Math.hypot(a.tx - tx, a.tz - tz) < 3)) continue
      artifactTiles.push([tx, tz])
      if (!place(tier === 'legendary' ? 'case' : tier === 'rare' ? 'plinth' : 'pedestal', tx, tz, 1, 1)) {
        artifactTiles.pop()
        continue
      }
      const fossil = pickFossil(tier, usedFossils, rng)
      usedFossils.add(fossil)
      artifacts.push({ id: artifacts.length, tier, fossil, x: tx + 0.5, z: tz + 0.5, tx, tz, locked: tier === 'legendary' || locked, room: room.id, value: valueOf(tier, level), slots: slotsOf(tier) })
      return true
    }
    return false
  }
  const roomsFor = (ids: number[] | undefined, count: number): Room[] => {
    if (ids) return ids.map(i => rooms[i])
    const pool = shuffle(unlockedRooms)
    return Array.from({ length: count }, (_, i) => pool[i % pool.length])
  }
  if (vaultRoom) addArtifact('legendary', vaultRoom, [vaultRoom.cx, vaultRoom.cz])
  const lockedBonus = lockedRooms.filter(r => r.id !== vaultRoom?.id)
  for (const r of lockedBonus) {
    addArtifact('rare', r)
    addArtifact('common', r)
  }
  if (!vaultRoom && p.legendaries > 0) {
    const hall = shuffle(unlockedRooms).sort((a, b) => Number(b.theme === 'hall') - Number(a.theme === 'hall'))[0]
    addArtifact('legendary', hall)
  }
  for (const r of roomsFor(p.rareRooms, p.rares)) addArtifact('rare', r)
  for (const r of roomsFor(p.commonRooms, p.commons)) addArtifact('common', r)

  // --- mandatory bone: hidden in the farthest reachable room, never behind a locked door
  const bonePart = BONE_BY_LEVEL(level).id
  let bone: BoneDef | undefined
  const boneRooms = [...unlockedRooms].sort((a, b) => dist.get(b.id)! - dist.get(a.id)! || a.id - b.id)
  const tryBoneIn = (room: Room): boolean => {
    for (const [tx, tz] of interior(room, 1)) {
      if (!tileFree(tx, tz)) continue
      artifactTiles.push([tx, tz])
      if (place('pedestal', tx, tz, 1, 1)) {
        bone = { part: bonePart, x: tx + 0.5, z: tz + 0.5, tx, tz, room: room.id }
        return true
      }
      artifactTiles.pop()
    }
    return false
  }
  for (const room of boneRooms) {
    if (tryBoneIn(room)) break
  }
  if (!bone) {
    // Last resort: clear the middle of the entry room so the mandatory item can never be missing.
    const room = rooms[entryRoom]
    const tx = room.cx
    const tz = room.cz
    const idx = grid.idx(tx, tz)
    for (let i = props.length - 1; i >= 0; i -= 1) {
      const prop = props[i]
      if (Math.abs(prop.x - (tx + 0.5)) < 1 && Math.abs(prop.z - (tz + 0.5)) < 1) props.splice(i, 1)
    }
    grid.solid[idx] = 0
    grid.opaque[idx] = 1
    props.push({ kind: 'pedestal', x: tx + 0.5, z: tz + 0.5, w: 1, d: 1, yaw: 0 })
    bone = { part: bonePart, x: tx + 0.5, z: tz + 0.5, tx, tz, room: room.id }
  }

  // --- filler props per theme (kept away from doorways by `reserved`)
  const filler: Record<Theme, Array<[PropKind, number, number]>> = {
    lobby: [['urn', 1, 1], ['bench', 2, 1]],
    gallery: [['statue', 1, 1], ['urn', 1, 1], ['statue', 1, 1]],
    hall: [['case', 1, 2], ['statue', 1, 1], ['case', 2, 1]],
    office: [['table', 2, 1], ['table', 2, 1], ['urn', 1, 1]],
    vault: [['statue', 1, 1], ['statue', 1, 1]],
  }
  for (const r of rooms) {
    const list = filler[r.theme]
    let placed = 0
    for (const [kind, w, d] of list) {
      for (const [tx, tz] of interior(r, 1).slice(0, 14)) {
        if (props.some(pp => Math.hypot(pp.x - (tx + w / 2), pp.z - (tz + d / 2)) < 2.4)) continue
        if (place(kind, tx, tz, w, d, kind === 'bench' ? 0 : rng() * 0.6 - 0.3, kind === 'statue')) {
          if (kind === 'table') addHide('table', tx + w / 2, tz + d / 2, 0, r.id)
          placed += 1
          break
        }
      }
    }
    if (placed === 0 && hideIn(r.id) === 0) addHide('corner', r.x1 + 0.5, r.z1 + 0.5, 0, r.id)
  }

  // --- keycards (reachable without crossing a locked door)
  const keycards: KeycardDef[] = []
  const openReach = grid.reachable(start, false)
  for (let k = 1; k < keyId; k += 1) {
    const room = shuffle(rooms.filter(r => !r.locked && r.id !== entryRoom))[0] ?? rooms[entryRoom]
    const cell = interior(room, 1).find(([tx, tz]) => tileFree(tx, tz) && openReach[grid.idx(tx, tz)] === 1 && !artifacts.some(a => Math.hypot(a.tx - tx, a.tz - tz) < 2))
    if (cell) {
      if (place('pedestal', cell[0], cell[1], 1, 1)) keycards.push({ key: k, x: cell[0] + 0.5, z: cell[1] + 0.5, tx: cell[0], tz: cell[1] })
    }
    if (!keycards.some(c => c.key === k)) {
      // Fallback: unlock the door so the level can never softlock.
      for (const [id, key] of [...grid.locked]) if (key === k) {
        grid.solid[id] = 0
        grid.opaque[id] = 0
        grid.locked.delete(id)
      }
      const dd = doors.find(d => d.key === k)
      if (dd) dd.key = 0
    }
  }

  // --- security: lasers across doorways, ceiling cameras on north walls
  const lasers: LaserDef[] = []
  const laserWanted = laserCount(level)
  const laserDoors = shuffle(doors.filter(d => d.key === 0 && d.a !== entryRoom && d.b !== entryRoom)).sort((a, b) => Number(isVaultDoor(b)) - Number(isVaultDoor(a)))
  function isVaultDoor(d: DoorDef) { return !!vaultRoom && (d.a === vaultRoom.id || d.b === vaultRoom.id) }
  for (const d of laserDoors.slice(0, laserWanted)) {
    const cyc = CONFIG.security.laserOn + CONFIG.security.laserOff
    const off = rng() * cyc
    if (d.orient === 'v') lasers.push({ x1: d.tx + 0.5, z1: d.tz, x2: d.tx + 0.5, z2: d.tz + 2, period: cyc, onTime: CONFIG.security.laserOn, offset: off })
    else lasers.push({ x1: d.tx, z1: d.tz + 0.5, x2: d.tx + 2, z2: d.tz + 0.5, period: cyc, onTime: CONFIG.security.laserOn, offset: off })
  }
  const cameras: CameraDef[] = []
  const camRooms = shuffle(rooms.filter(r => r.id !== entryRoom && !r.locked)).sort((a, b) => Number(b.id === vaultRoom?.id) - Number(a.id === vaultRoom?.id))
  for (const r of camRooms.slice(0, cameraCount(level))) {
    const x = r.cx + 0.5 + (rng() < 0.5 ? -1.5 : 1.5)
    cameras.push({ x, z: r.z0 - 0.02, yaw: 0, sweep: CONFIG.security.cameraSweep, phase: rng() * 6.28, room: r.id })
  }

  // --- guard routes
  const guardCandidates = (p.guardRooms ? p.guardRooms.map(i => rooms[i]) : rooms).filter(r => !r.locked && (p.guardRooms || r.id !== entryRoom || level >= 4))
  const wayTile = (r: Room): Vec2 => {
    const jx = r.cx + ri(-1, 1)
    const jz = r.cz + ri(-1, 1)
    return grid.nearestFree(jx + 0.5, jz + 0.5, 4) ?? { x: r.cx + 0.5, z: r.cz + 0.5 }
  }
  const guards: GuardDef[] = []
  const nGuards = guardCount(level)
  const routeLen = Math.min(6, 2 + Math.floor((level + 1) / 2))
  const openFromStart = grid.reachable(start, true)
  for (let g = 0; g < nGuards; g += 1) {
    const firstPool = guardCandidates.filter(r => Math.hypot(r.cx + 0.5 - start.x, r.cz + 0.5 - start.z) > 7)
    const startRoom = (firstPool.length > 0 ? firstPool : guardCandidates)[(g * 2 + ri(0, 1)) % Math.max(1, (firstPool.length > 0 ? firstPool : guardCandidates).length)]
    const seq: Room[] = [startRoom]
    let last = -1
    while (seq.length < routeLen) {
      const cur = seq[seq.length - 1]
      const options = (adj.get(cur.id) ?? []).map(i => rooms[i]).filter(r => guardCandidates.includes(r) && r.id !== last)
      const nxt = options.length > 0 ? pick(options) : seq.length > 1 ? seq[seq.length - 2] : cur
      last = cur.id
      if (nxt === cur) break
      seq.push(nxt)
    }
    if (seq.length < 2) seq.push(guardCandidates.find(r => r.id !== startRoom.id) ?? startRoom)
    const route = seq.map(wayTile).filter(t => openFromStart[grid.idx(Math.floor(t.x), Math.floor(t.z))] === 1)
    if (route.length >= 2) guards.push({ route, startIndex: 0, room: startRoom.id })
    else if (route.length === 1) guards.push({ route: [route[0], { x: route[0].x + 0.01, z: route[0].z }], startIndex: 0, room: startRoom.id })
  }

  const totalValue = artifacts.reduce((s, a) => s + a.value, 0)
  return {
    level, seed: p.seed, grid, w: W, h: H, rooms, props, hides, artifacts, bone: bone!, doors, lasers, cameras, keycards, guards, windows, paintings, lamps,
    start, exit, entryRoom, vault, tutorial: !!p.tutorial, dawnSeconds: dawnSeconds(level), totalValue, slotsOfAll: artifacts.reduce((s, a) => s + a.slots, 0),
  }
}
