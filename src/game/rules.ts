/** Pure rules: difficulty scaling, shop prices, noise radius, bag weight, stars. Unit tested. */
import {
  CONFIG, DIFFICULTY, GADGETS, RADAR_TIERS, UPGRADES,
  type Difficulty, type GadgetId, type UpgradeId,
} from './config'
import { SURFACE_CARPET, SURFACE_WOOD } from './grid'

export type Tier = 'common' | 'rare' | 'legendary'
export type Upgrades = Record<UpgradeId, number>
export type Gadgets = Record<GadgetId, number>
export type NoiseKind = 'still' | 'sneak' | 'walk' | 'sprint'

export const emptyUpgrades = (): Upgrades => ({ speed: 0, bag: 0, quiet: 0, stamina: 0, lockpick: 0, radar: 0, minimap: 0 })
export const emptyGadgets = (): Gadgets => ({ coin: 0, smoke: 0, noise: 0 })

const lv = (level: number) => Math.min(Math.max(1, Math.floor(level)), CONFIG.scale.scaleCap)

/** Guards = 1 + floor((level-1)/2), max 6. */
export function guardCount(level: number): number {
  return Math.min(CONFIG.scale.maxGuards, 1 + Math.floor((Math.max(1, level) - 1) / 2))
}
/** +4% guard speed per level. */
export function guardSpeedMul(level: number, difficulty: Difficulty = 'normal'): number {
  return (1 + CONFIG.scale.guardSpeedPerLevel * (lv(level) - 1)) * DIFFICULTY[difficulty].speed
}
/** +3% hearing radius per level. */
export function hearingMul(level: number, difficulty: Difficulty = 'normal'): number {
  return (1 + CONFIG.scale.hearingPerLevel * (lv(level) - 1)) * DIFFICULTY[difficulty].hearing * CONFIG.guard.hearing
}
export const hasCameras = (level: number) => level >= 4
export const hasLasers = (level: number) => level >= 6
export const hasLockedDoors = (level: number) => level >= 8
export const isVault = (level: number) => level >= 5 && level % 5 === 0
export function cameraCount(level: number): number {
  return hasCameras(level) ? Math.min(5, 1 + Math.floor((level - 4) / 2)) : 0
}
export function laserCount(level: number): number {
  return hasLasers(level) ? Math.min(6, 1 + Math.floor((level - 6) / 1.5)) : 0
}
export function lockedDoorCount(level: number): number {
  return hasLockedDoors(level) ? (level >= 10 ? 2 : 1) : 0
}
/** Dawn timer seconds, about 3-4 minutes. */
export function dawnSeconds(level: number, difficulty: Difficulty = 'normal'): number {
  const base = Math.max(CONFIG.run.dawnMin, CONFIG.run.dawnBase - CONFIG.run.dawnPerLevel * (lv(level) - 1))
  return Math.round(base * DIFFICULTY[difficulty].dawn)
}

export function upgradeMaxTier(id: UpgradeId): number {
  return UPGRADES[id].tiers
}
/** Price of the next tier (tier = currently owned), or undefined when maxed. */
export function upgradePrice(id: UpgradeId, owned: number): number | undefined {
  const u = UPGRADES[id]
  if (owned >= u.tiers) return undefined
  return Math.round((u.base * u.growth ** owned) / 10) * 10
}
export function gadgetPrice(id: GadgetId): number {
  return GADGETS[id].price
}

export type Purchase = { ok: true; money: number } | { ok: false; reason: 'maxed' | 'poor' }
export function buyUpgrade(money: number, ups: Upgrades, id: UpgradeId): Purchase {
  const price = upgradePrice(id, ups[id])
  if (price === undefined) return { ok: false, reason: 'maxed' }
  if (money < price) return { ok: false, reason: 'poor' }
  ups[id] += 1
  return { ok: true, money: money - price }
}
export function buyGadget(money: number, gadgets: Gadgets, id: GadgetId): Purchase {
  if (gadgets[id] >= GADGETS[id].max) return { ok: false, reason: 'maxed' }
  if (money < GADGETS[id].price) return { ok: false, reason: 'poor' }
  gadgets[id] += 1
  return { ok: true, money: money - GADGETS[id].price }
}

export const speedBonus = (ups: Upgrades) => 1 + UPGRADES.speed.perTier * ups.speed
export const bagCapacity = (ups: Upgrades) => CONFIG.loot.baseBag + UPGRADES.bag.perTier * ups.bag
export const quietFactor = (ups: Upgrades) => 1 - UPGRADES.quiet.perTier * ups.quiet
export const staminaMax = (ups: Upgrades) => CONFIG.player.staminaMax * (1 + UPGRADES.stamina.perTier * ups.stamina)
/** Slower sprint drain with stamina upgrades. */
export const sprintDrain = (ups: Upgrades) => CONFIG.player.sprintDrain / (1 + 0.15 * ups.stamina)
/** Lockpick: wider sweet spot and slower marker per tier. */
export const lockpickZone = (ups: Upgrades) => 0.16 * (1 + UPGRADES.lockpick.perTier * ups.lockpick * 1.6)
export const lockpickSpeed = (ups: Upgrades) => 1.15 * (1 - 0.1 * ups.lockpick)
export const radarTier = (ups: Upgrades) => RADAR_TIERS[Math.min(ups.radar, RADAR_TIERS.length - 1)]

export function surfaceNoise(surface: number): number {
  if (surface === SURFACE_CARPET) return CONFIG.noise.surfaceCarpet
  if (surface === SURFACE_WOOD) return CONFIG.noise.surfaceWood
  return CONFIG.noise.surfaceMarble
}
/** Radius (tiles) of the player's footsteps for a movement kind on a surface. */
export function movementNoise(kind: NoiseKind, surface: number, ups: Upgrades): number {
  if (kind === 'still') return 0
  return CONFIG.noise[kind] * surfaceNoise(surface) * quietFactor(ups)
}

export function slotsOf(tier: Tier): number {
  return tier === 'common' ? CONFIG.loot.commonSlots : tier === 'rare' ? CONFIG.loot.rareSlots : CONFIG.loot.legendarySlots
}
export function valueOf(tier: Tier, level: number): number {
  const base = tier === 'common' ? CONFIG.loot.commonValue : tier === 'rare' ? CONFIG.loot.rareValue : CONFIG.loot.legendaryValue
  return Math.round((base * (1 + CONFIG.scale.valuePerLevel * (Math.max(1, level) - 1))) / 5) * 5
}
/** Heavier bag = slower player. */
export function bagSpeedMul(usedSlots: number, capacity: number): number {
  if (capacity <= 0) return 1
  return 1 - CONFIG.player.bagSlowdown * Math.min(1, usedSlots / capacity)
}

export type LevelResult = {
  loot: number
  possible: number
  secondsLeft: number
  dawnSeconds: number
  ghost: boolean
}
/** 1 star for escaping, 2 for half the loot, 3 for most of the loot with time to spare. */
export function starRating(r: LevelResult): number {
  if (r.loot <= 0) return 1
  const ratio = r.possible > 0 ? r.loot / r.possible : 1
  let stars = 1
  if (ratio >= CONFIG.loot.starTwo) stars = 2
  if (ratio >= CONFIG.loot.starThree && r.secondsLeft >= r.dawnSeconds * CONFIG.loot.starThreeTime) stars = 3
  return stars
}
export function ghostBonus(loot: number, ghost: boolean): number {
  return ghost ? Math.round((loot * CONFIG.loot.ghostBonus) / 5) * 5 : 0
}
