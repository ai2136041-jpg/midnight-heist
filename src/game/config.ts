/**
 * Midnight Heist - every tuning value lives here (speeds, radii, prices, scaling).
 * Change numbers here first; rules/tests read the same values.
 */
export const DEFAULT_CONFIG = {
  player: {
    radius: 0.28,
    sneakSpeed: 1.5,
    walkSpeed: 3.1,
    sprintSpeed: 5.2,
    acceleration: 16,
    deceleration: 20,
    turnSpeed: 12,
    /** Joystick magnitude below this is a gentle push = sneak. */
    joystickSneak: 0.55,
    staminaMax: 100,
    sprintDrain: 30,
    staminaRegen: 20,
    staminaRegenDelay: 0.9,
    /** Sprint can start again only above this stamina after exhaustion. */
    sprintResume: 25,
    /** Speed lost at a completely full bag (fraction). */
    bagSlowdown: 0.32,
    hideEnterTime: 0.35,
  },
  noise: {
    /** Noise radius in tiles for every action (before surface/upgrades). */
    sneak: 1.3,
    walk: 4,
    sprint: 8.5,
    steal: 3.5,
    glass: 11,
    lockFail: 7,
    coin: 6.5,
    noiseMaker: 11,
    laser: 12,
    surfaceMarble: 1.25,
    surfaceWood: 1.0,
    surfaceCarpet: 0.6,
    /** Each wall between a sound and a guard shrinks its reach by this fraction. */
    wallDampen: 0.3,
    ringSmooth: 9,
  },
  guard: {
    radius: 0.3,
    patrolSpeed: 1.7,
    suspiciousSpeed: 2.6,
    searchSpeed: 2.2,
    chaseSpeed: 4.1,
    turnSpeed: 7,
    hearing: 1,
    flashRange: 5.2,
    flashHalfAngle: 0.5,
    /** Seconds in the beam before it becomes a chase. */
    detectTime: 0.45,
    /** Seconds of repeated loud noise next to a guard that turn "suspicious" into "chase". */
    alertToChase: 1.2,
    catchDistance: 0.85,
    searchMin: 5,
    searchMax: 8,
    lookPauseMin: 1.4,
    lookPauseMax: 3.2,
    /** Chase is dropped after this long without line of sight. */
    loseSightTime: 1.4,
    /** Distance (tiles) at which a guard senses you without light even when quiet. */
    senseDistance: 1.2,
  },
  security: {
    cameraRange: 6.5,
    cameraHalfAngle: 0.4,
    cameraSweep: 0.85,
    cameraPeriod: 7,
    cameraDetect: 0.55,
    laserOn: 2.2,
    laserOff: 2.2,
  },
  scale: {
    guardSpeedPerLevel: 0.04,
    hearingPerLevel: 0.03,
    maxGuards: 6,
    /** Level cap for the multiplicative scaling so Endless stays playable. */
    scaleCap: 40,
    valuePerLevel: 0.1,
    dawnAlertFraction: 0.25,
    dawnAlertSpeed: 1.12,
    dawnAlertHearing: 1.25,
  },
  loot: {
    commonValue: 150,
    rareValue: 450,
    legendaryValue: 1500,
    commonSlots: 1,
    rareSlots: 2,
    legendarySlots: 3,
    commonSteal: 1.0,
    rareSteal: 1.5,
    legendaryPickDuration: 1.2,
    baseBag: 4,
    ghostBonus: 0.2,
    starTwo: 0.5,
    starThree: 0.8,
    starThreeTime: 0.2,
  },
  run: {
    dawnBase: 240,
    dawnMin: 185,
    dawnPerLevel: 6,
    exitHold: 0.8,
  },
  gadgets: {
    coinThrow: 6.5,
    smokeThrow: 5,
    smokeRadius: 3,
    smokeDuration: 5,
    noiseMakerDelay: 1.2,
    cooldown: 0.8,
  },
  camera: {
    fov: 38,
    distance: 17,
    tilt: 65,
    follow: 6,
    lookAhead: 1.6,
    minZoom: 0.62,
    maxZoom: 1.4,
  },
} as const

/** Difficulty modifiers (Easy / Normal / Hard). */
export const DIFFICULTY = {
  easy: { hearing: 0.85, speed: 0.92, detect: 1.35, dawn: 1.2, search: 0.8 },
  normal: { hearing: 1, speed: 1, detect: 1, dawn: 1, search: 1 },
  hard: { hearing: 1.2, speed: 1.08, detect: 0.8, dawn: 0.9, search: 1.2 },
} as const
export type Difficulty = keyof typeof DIFFICULTY

export type UpgradeId = 'speed' | 'bag' | 'quiet' | 'stamina' | 'lockpick' | 'radar' | 'minimap'
export type GadgetId = 'coin' | 'smoke' | 'noise'
export const UPGRADE_IDS: UpgradeId[] = ['speed', 'bag', 'quiet', 'stamina', 'lockpick', 'radar', 'minimap']
export const GADGET_IDS: GadgetId[] = ['coin', 'smoke', 'noise']

/** Shop table. Price of tier t (0-based) = round(base * growth^t / 10) * 10. */
export const UPGRADES: Record<UpgradeId, { tiers: number; base: number; growth: number; perTier: number }> = {
  speed: { tiers: 5, base: 300, growth: 1.65, perTier: 0.06 },
  bag: { tiers: 4, base: 350, growth: 1.8, perTier: 1 },
  quiet: { tiers: 5, base: 350, growth: 1.7, perTier: 0.09 },
  stamina: { tiers: 4, base: 250, growth: 1.7, perTier: 0.25 },
  lockpick: { tiers: 4, base: 300, growth: 1.75, perTier: 0.18 },
  radar: { tiers: 3, base: 600, growth: 1.9, perTier: 1 },
  minimap: { tiers: 1, base: 500, growth: 1, perTier: 1 },
}
export const GADGETS: Record<GadgetId, { price: number; max: number }> = {
  coin: { price: 80, max: 9 },
  smoke: { price: 220, max: 6 },
  noise: { price: 150, max: 6 },
}
/** Radar: seconds revealed and cooldown per tier (index = owned tier). */
export const RADAR_TIERS = [
  { reveal: 0, cooldown: 0 },
  { reveal: 2.5, cooldown: 30 },
  { reveal: 3.5, cooldown: 24 },
  { reveal: 4.5, cooldown: 18 },
] as const

// Gameplay always reads active values here. Source defaults remain immutable for
// Tweak Reset and Save with Manus; Apply never writes source or local storage.
type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
