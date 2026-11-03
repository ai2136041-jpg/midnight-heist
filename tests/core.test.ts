import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/game/config'
import { Grid } from '../src/game/grid'
import { buildLevel } from '../src/game/levels'
import {
  BONE_BY_LEVEL, BONE_PARTS, CAMPAIGN_LEVELS, FOSSIL_BY_ID, FOSSIL_IDS, FOSSIL_POOLS,
  collectedFossilCount, pendingBones, pendingFossils, pickFossil,
} from '../src/game/collection'
import {
  bagSpeedMul, buyGadget, buyUpgrade, cameraCount, dawnSeconds, emptyGadgets, emptyUpgrades, ghostBonus, guardCount,
  guardSpeedMul, hearingMul, laserCount, lockedDoorCount, movementNoise, starRating, upgradePrice, valueOf,
} from '../src/game/rules'

describe('scaling rules', () => {
  it('guards = 1 + floor((level-1)/2), capped at 6', () => {
    expect([1, 2, 3, 4, 5, 9, 10, 11, 12, 30].map(guardCount)).toEqual([1, 1, 2, 2, 3, 5, 5, 6, 6, 6])
  })
  it('speed +4% and hearing +3% per level', () => {
    expect(guardSpeedMul(1)).toBeCloseTo(1)
    expect(guardSpeedMul(11)).toBeCloseTo(1.4)
    expect(hearingMul(11)).toBeCloseTo(1.3)
  })
  it('security unlocks: cameras 4, lasers 6, locked doors 8', () => {
    expect(cameraCount(3)).toBe(0)
    expect(cameraCount(4)).toBe(1)
    expect(laserCount(5)).toBe(0)
    expect(laserCount(6)).toBe(1)
    expect(lockedDoorCount(7)).toBe(0)
    expect(lockedDoorCount(8)).toBe(1)
  })
  it('dawn timer stays between 3 and 4 minutes on Normal', () => {
    for (let l = 1; l <= 60; l += 1) {
      const s = dawnSeconds(l)
      expect(s).toBeGreaterThanOrEqual(180)
      expect(s).toBeLessThanOrEqual(240)
    }
  })
})

describe('noise and loot', () => {
  it('carpet is quieter than marble/wood and sprint louder than walk', () => {
    const u = emptyUpgrades()
    expect(movementNoise('walk', 1, u)).toBeLessThan(movementNoise('walk', 2, u))
    expect(movementNoise('walk', 2, u)).toBeLessThan(movementNoise('walk', 0, u))
    expect(movementNoise('sprint', 0, u)).toBeGreaterThan(movementNoise('walk', 0, u))
    expect(movementNoise('still', 0, u)).toBe(0)
    u.quiet = 2
    expect(movementNoise('walk', 0, u)).toBeLessThan(CONFIG.noise.walk * CONFIG.noise.surfaceMarble)
  })
  it('heavier bag slows the player', () => {
    expect(bagSpeedMul(0, 4)).toBe(1)
    expect(bagSpeedMul(4, 4)).toBeCloseTo(1 - CONFIG.player.bagSlowdown)
  })
  it('stars and ghost bonus', () => {
    const base = { loot: 0, possible: 1000, secondsLeft: 100, dawnSeconds: 200, ghost: false }
    expect(starRating(base)).toBe(1)
    expect(starRating({ ...base, loot: 600 })).toBe(2)
    expect(starRating({ ...base, loot: 900 })).toBe(3)
    expect(starRating({ ...base, loot: 900, secondsLeft: 10 })).toBe(2)
    expect(ghostBonus(1000, true)).toBe(200)
    expect(ghostBonus(1000, false)).toBe(0)
    expect(valueOf('legendary', 1)).toBeGreaterThan(valueOf('rare', 1))
  })
})

describe('shop', () => {
  it('prices rise per tier and purchases are validated', () => {
    expect(upgradePrice('speed', 1)!).toBeGreaterThan(upgradePrice('speed', 0)!)
    expect(upgradePrice('speed', 5)).toBeUndefined()
    const ups = emptyUpgrades()
    expect(buyUpgrade(10, ups, 'speed')).toEqual({ ok: false, reason: 'poor' })
    const r = buyUpgrade(1000, ups, 'speed')
    expect(r.ok).toBe(true)
    expect(ups.speed).toBe(1)
    const g = emptyGadgets()
    expect(buyGadget(1000, g, 'coin').ok).toBe(true)
    expect(g.coin).toBe(1)
  })
})

describe('grid', () => {
  it('slides along walls and never ends inside a solid tile', () => {
    const g = new Grid(10, 10)
    for (let i = 0; i < 10; i += 1) {
      g.solid[g.idx(i, 0)] = 1
      g.solid[g.idx(0, i)] = 1
    }
    const p = { x: 3.5, z: 1.5 }
    for (let i = 0; i < 100; i += 1) g.moveCircle(p, -0.08, -0.08, 0.28)
    expect(p.x).toBeGreaterThanOrEqual(1.28 - 1e-6)
    expect(p.z).toBeGreaterThanOrEqual(1.28 - 1e-6)
    expect(g.clear(p.x, p.z, 0.28 - 1e-3)).toBe(true)
  })
  it('line of sight is blocked by opaque tiles and A* routes around them', () => {
    const g = new Grid(12, 8)
    for (let z = 0; z < 7; z += 1) {
      g.solid[g.idx(6, z)] = 1
      g.opaque[g.idx(6, z)] = 1
    }
    expect(g.los(2.5, 3.5, 9.5, 3.5)).toBe(false)
    expect(g.los(2.5, 3.5, 5.5, 3.5)).toBe(true)
    const path = g.findPath({ x: 2.5, z: 3.5 }, { x: 9.5, z: 3.5 })
    expect(path.length).toBeGreaterThan(1)
    expect(path[path.length - 1].x).toBeCloseTo(9.5)
    // the detour must pass through the gap at z=7
    expect(path.some(pt => pt.z > 6.5)).toBe(true)
  })
})

describe('level generation', () => {
  it('every level 1-40 is deterministic, closed and fully reachable', () => {
    for (let level = 1; level <= 40; level += 1) {
      const a = buildLevel(level)
      const b = buildLevel(level)
      expect(Array.from(a.grid.solid)).toEqual(Array.from(b.grid.solid))
      expect(a.guards.length).toBe(guardCount(level))
      expect(a.artifacts.length).toBeGreaterThanOrEqual(4)
      const open = a.grid.reachable(a.start, false)
      const all = a.grid.reachable(a.start, true)
      // border is solid
      for (let x = 0; x < a.w; x += 1) {
        expect(a.grid.solid[a.grid.idx(x, 0)]).toBe(1)
        expect(a.grid.solid[a.grid.idx(x, a.h - 1)]).toBe(1)
      }
      for (const art of a.artifacts) {
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => all[a.grid.idx(art.tx + dx, art.tz + dz)] === 1)
        expect(near, `level ${level} artifact ${art.id}`).toBe(true)
      }
      for (const g of a.guards) for (const w of g.route) expect(all[a.grid.idx(Math.floor(w.x), Math.floor(w.z))], `level ${level} guard waypoint`).toBe(1)
      // keycards for locked doors are reachable without a key (no softlock)
      for (const k of a.keycards) expect(open[a.grid.idx(k.tx + 0, k.tz + 1)] === 1 || open[a.grid.idx(k.tx, k.tz - 1)] === 1 || open[a.grid.idx(k.tx + 1, k.tz)] === 1 || open[a.grid.idx(k.tx - 1, k.tz)] === 1).toBe(true)
      expect(a.grid.locked.size > 0).toBe(a.doors.some(d => d.key > 0))
      expect(a.cameras.length).toBe(Math.min(cameraCount(level), a.rooms.length - 1))
      if (level >= 6) expect(a.lasers.length).toBeGreaterThan(0)
      if (level % 5 === 0) expect(a.artifacts.some(x => x.tier === 'legendary')).toBe(true)
    }
  })
  it('guards never start next to the player and can path between their waypoints', () => {
    for (let level = 1; level <= 20; level += 1) {
      const a = buildLevel(level)
      for (const g of a.guards) {
        expect(Math.hypot(g.route[0].x - a.start.x, g.route[0].z - a.start.z)).toBeGreaterThan(5)
        for (let i = 1; i < g.route.length; i += 1) expect(a.grid.findPath(g.route[i - 1], g.route[i]).length, `level ${level}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('campaign collection', () => {
  it('ten named bone parts, one per campaign level, never reused', () => {
    expect(BONE_PARTS).toHaveLength(10)
    expect(CAMPAIGN_LEVELS).toBe(10)
    expect(new Set(BONE_PARTS.map(b => b.key)).size).toBe(10)
    for (let level = 1; level <= 10; level += 1) expect(BONE_BY_LEVEL(level).id).toBe(level - 1)
    // Endless levels clamp to the last campaign piece.
    expect(BONE_BY_LEVEL(14).id).toBe(9)
    expect(BONE_BY_LEVEL(0).id).toBe(0)
  })

  it('every level places its mandatory bone on a reachable pedestal', () => {
    for (let level = 1; level <= 40; level += 1) {
      const a = buildLevel(level)
      expect(a.bone, `level ${level}`).toBeTruthy()
      expect(a.bone.part, `level ${level}`).toBe(BONE_BY_LEVEL(level).id)
      const idx = a.grid.idx(a.bone.tx, a.bone.tz)
      expect(a.grid.solid[idx], `level ${level} bone tile is inside the room`).toBe(1)
      const open = a.grid.reachable(a.start, false)
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => open[a.grid.idx(a.bone.tx + dx, a.bone.tz + dz)] === 1)
      expect(near, `level ${level} bone must be reachable`).toBe(true)
      // never placed on top of another artifact pedestal
      expect(a.artifacts.some(art => art.tx === a.bone.tx && art.tz === a.bone.tz)).toBe(false)
    }
  })

  it('fossils are valid, tier-appropriate and valid in the cabinet', () => {
    expect(FOSSIL_IDS).toHaveLength(12)
    for (const level of [1, 3, 5, 10]) {
      for (const art of buildLevel(level).artifacts) expect(FOSSIL_IDS).toContain(art.fossil)
    }
    const used = new Set<typeof FOSSIL_IDS[number]>()
    const first = pickFossil('common', used, () => 0)
    used.add(first)
    expect(FOSSIL_POOLS.common).toContain(first)
    // prefers a type not yet used this level
    expect(pickFossil('common', used, () => 0)).not.toBe(first)
    // every type is described in both languages
    for (const id of FOSSIL_IDS) {
      expect(FOSSIL_BY_ID[id].name.ar.length).toBeGreaterThan(1)
      expect(FOSSIL_BY_ID[id].name.en.length).toBeGreaterThan(1)
      expect(FOSSIL_BY_ID[id].book.ar).not.toBe(FOSSIL_BY_ID[id].book.en)
    }
  })

  it('pending specimens and progress counters', () => {
    expect(pendingBones([0, 1, 2], [0])).toEqual([1, 2])
    expect(pendingFossils({ ammonite: 2, fish: 1 }, { ammonite: 1 })).toEqual(['ammonite', 'fish'])
    expect(pendingFossils({ ammonite: 1 }, { ammonite: 1 })).toEqual([])
    expect(collectedFossilCount({ ammonite: 1, fish: 0, shell: 3 })).toBe(2)
    expect(collectedFossilCount({})).toBe(0)
  })
})
