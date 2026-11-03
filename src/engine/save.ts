/**
 * Versioned local save. Everything the player keeps between sessions lives in one JSON record.
 * Corrupt or foreign data falls back to defaults instead of crashing.
 */
import { GADGET_IDS, GADGETS, UPGRADE_IDS, UPGRADES, type Difficulty, type GadgetId } from '../game/config'
import { BONE_PARTS, FOSSIL_IDS } from '../game/collection'
import { emptyGadgets, emptyUpgrades, type Gadgets, type Upgrades } from '../game/rules'

export type Locale = 'en' | 'ar'
export type Quality = 'low' | 'medium' | 'high'
export type BookEntry = { kind: 'bone' | 'fossil'; id: string; level: number }
export type SaveData = {
  version: 2
  /** '' = never chosen; follows the browser language until the player picks one. */
  locale: Locale | ''
  musicVolume: number
  sfxVolume: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  glow: boolean
  minimap: boolean
  difficulty: Difficulty
  tutorialDone: boolean
  /** Banked money (only loot that escaped through the exit). */
  money: number
  /** Next level to play. */
  level: number
  bestLevel: number
  upgrades: Upgrades
  gadgets: Gadgets
  selectedGadget: GadgetId
  /** Best stars per level number. */
  stars: Record<string, number>
  ghosts: number
  /** True once a run was started, so the menu can offer Continue. */
  started: boolean
  /** Collected dinosaur bone parts (0-9), one per campaign level. */
  bones: number[]
  /** Collected fossil counts by type (a fossil can be found more than once). */
  fossils: Record<string, number>
  /** Bone parts already examined and recorded in the book. */
  studiedBones: number[]
  /** Fossil types studied. A type is studied once; its collected count stays for the cabinet. */
  studiedFossils: Record<string, number>
  /** The assistant's field book, in the order entries were written. */
  book: BookEntry[]
  /** True after the tenth bone has been examined. */
  completed: boolean
}

export const SAVE_KEY = 'midnight-heist.save'

export function defaultSave(): SaveData {
  return {
    version: 2, locale: '', musicVolume: 0.6, sfxVolume: 0.85, muted: false, quality: 'high', reducedMotion: false, glow: true,
    minimap: true, difficulty: 'normal', tutorialDone: false, money: 0, level: 1, bestLevel: 1, upgrades: emptyUpgrades(),
    gadgets: emptyGadgets(), selectedGadget: 'coin', stars: {}, ghosts: 0, started: false,
    bones: [], fossils: {}, studiedBones: [], studiedFossils: {}, book: [], completed: false,
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback

const BONE_KEYS = new Set(BONE_PARTS.map(b => b.key))
const FOSSIL_KEY_SET = new Set<string>(FOSSIL_IDS)

/** Keep only unique, in-range integers from an untrusted array (out-of-range ids are dropped, not clamped). */
function intSet(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) return []
  const out = new Set<number>()
  for (const raw of value) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const n = Math.floor(raw)
    if (n < min || n > max) continue
    out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

/** Counts keyed by known fossil ids, capped so a corrupt save cannot inflate the cabinet. */
function countRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const id of FOSSIL_IDS) {
    const n = int((value as Record<string, unknown>)[id], 0, 99, 0)
    if (n > 0) out[id] = n
  }
  return out
}

function bookEntries(value: unknown): BookEntry[] {
  if (!Array.isArray(value)) return []
  const out: BookEntry[] = []
  for (const raw of value.slice(0, 200)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const kind = entry.kind === 'bone' || entry.kind === 'fossil' ? entry.kind : undefined
    const id = typeof entry.id === 'string' ? entry.id : ''
    if (!kind || !id) continue
    if (kind === 'bone' && !BONE_KEYS.has(id)) continue
    if (kind === 'fossil' && !FOSSIL_KEY_SET.has(id)) continue
    out.push({ kind, id, level: int(entry.level, 1, 9999, 1) })
  }
  return out
}

/** Parse untrusted stored JSON into valid SaveData (pure; unit tested). */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch {
    return base
  }
  if (data.version !== 2) return base
  const upgrades = emptyUpgrades()
  const rawUps = (data.upgrades && typeof data.upgrades === 'object' ? data.upgrades : {}) as Record<string, unknown>
  for (const id of UPGRADE_IDS) upgrades[id] = int(rawUps[id], 0, UPGRADES[id].tiers, 0)
  const gadgets = emptyGadgets()
  const rawG = (data.gadgets && typeof data.gadgets === 'object' ? data.gadgets : {}) as Record<string, unknown>
  for (const id of GADGET_IDS) gadgets[id] = int(rawG[id], 0, GADGETS[id].max, 0)
  const stars: Record<string, number> = {}
  const rawStars = (data.stars && typeof data.stars === 'object' ? data.stars : {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(rawStars)) if (/^\d{1,5}$/.test(k)) stars[k] = int(v, 0, 3, 0)
  const level = int(data.level, 1, 9999, 1)
  const bones = intSet(data.bones, 0, BONE_PARTS.length - 1)
  const studiedBones = intSet(data.studiedBones, 0, BONE_PARTS.length - 1).filter(id => bones.includes(id))
  const fossils = countRecord(data.fossils)
  const studiedFossils = countRecord(data.studiedFossils)
  for (const id of Object.keys(studiedFossils)) studiedFossils[id] = Math.min(studiedFossils[id], fossils[id] ?? 0)
  return {
    version: 2,
    locale: data.locale === 'en' || data.locale === 'ar' ? data.locale : '',
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    glow: data.glow !== false,
    minimap: data.minimap !== false,
    difficulty: data.difficulty === 'easy' || data.difficulty === 'hard' ? data.difficulty : 'normal',
    tutorialDone: data.tutorialDone === true,
    money: int(data.money, 0, 999_999_999, 0),
    level,
    bestLevel: Math.max(level, int(data.bestLevel, 1, 9999, level)),
    upgrades,
    gadgets,
    selectedGadget: data.selectedGadget === 'smoke' || data.selectedGadget === 'noise' ? data.selectedGadget : 'coin',
    stars,
    ghosts: int(data.ghosts, 0, 999_999, 0),
    started: data.started === true,
    bones,
    fossils,
    studiedBones,
    studiedFossils,
    book: bookEntries(data.book),
    completed: data.completed === true,
  }
}

export class SaveStore {
  data: SaveData
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw)
  }
  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    this.flush()
  }
  flush(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // Private browsing or quota: the game keeps working with in-memory state.
    }
  }
  /** Wipe progress but keep the player's settings. */
  resetProgress(): void {
    const keep = this.data
    const fresh = defaultSave()
    this.data = { ...fresh, locale: keep.locale, musicVolume: keep.musicVolume, sfxVolume: keep.sfxVolume, muted: keep.muted, quality: keep.quality, reducedMotion: keep.reducedMotion, glow: keep.glow, minimap: keep.minimap, difficulty: keep.difficulty }
    this.flush()
  }
}
