import { describe, expect, it } from 'vitest'
import { defaultSave, parseSave, SaveStore } from '../src/engine/save'
import { detectLocale, DICTIONARY_KEYS, isRtl, resolveLocale } from '../src/engine/i18n'

describe('save', () => {
  it('recovers corrupt data and clamps progress', () => {
    expect(parseSave('{bad').level).toBe(1)
    const s = parseSave(JSON.stringify({ version: 2, level: -5, money: 10.8, upgrades: { speed: 99 }, gadgets: { smoke: -2 }, locale: 'ar' }))
    expect(s.level).toBe(1); expect(s.money).toBe(10); expect(s.upgrades.speed).toBe(5); expect(s.gadgets.smoke).toBe(0); expect(s.locale).toBe('ar')
  })
  it('writes updates to a storage-like object', () => {
    const db = new Map<string,string>(); const storage = { getItem:(k:string)=>db.get(k)??null, setItem:(k:string,v:string)=>void db.set(k,v), removeItem:(k:string)=>void db.delete(k) }
    const store = new SaveStore(storage); store.update({ money: 250, started: true }); expect(JSON.parse(db.get('midnight-heist.save')!).money).toBe(250)
    expect(defaultSave().version).toBe(2)
  })
  it('keeps bones, fossils and book entries without trusting the file', () => {
    const s = parseSave(JSON.stringify({
      version: 2, bones: [0, 3, 3, 99, -1], fossils: { ammonite: 2, fish: 1.9, bogus: 7, shell: -3 },
      studiedBones: [0, 7], studiedFossils: { ammonite: 5, fish: 2 },
      book: [
        { kind: 'bone', id: 'skull', level: 1 }, { kind: 'bone', id: 'tail', level: 8 },
        { kind: 'fossil', id: 'ammonite', level: 2 }, { kind: 'fossil', id: 'nope', level: 2 },
        { kind: 'x', id: 'skull', level: 1 }, { kind: 'bone', id: 'skull', level: 99999 },
      ],
      completed: 'yes',
    }))
    expect(s.bones).toEqual([0, 3])
    expect(s.fossils).toEqual({ ammonite: 2, fish: 1 })
    // A studied bone must exist in the collection.
    expect(s.studiedBones).toEqual([0])
    // Studying can never exceed what was collected.
    expect(s.studiedFossils).toEqual({ ammonite: 2, fish: 1 })
    expect(s.book).toEqual([
      { kind: 'bone', id: 'skull', level: 1 },
      { kind: 'bone', id: 'tail', level: 8 },
      { kind: 'fossil', id: 'ammonite', level: 2 },
      { kind: 'bone', id: 'skull', level: 9999 },
    ])
    expect(s.completed).toBe(false)
  })
  it('keeps collecting the ten bones across nights', () => {
    let s = defaultSave()
    expect(s.bones).toEqual([]); expect(s.completed).toBe(false); expect(s.book).toEqual([])
    const db = new Map<string,string>(); const storage = { getItem:(k:string)=>db.get(k)??null, setItem:(k:string,v:string)=>void db.set(k,v), removeItem:(k:string)=>void db.delete(k) }
    const store = new SaveStore(storage)
    for (let id = 0; id < 10; id += 1) {
      store.update({ bones: [...store.data.bones, id], studiedBones: [...store.data.studiedBones, id] })
      s = store.data
    }
    expect(s.bones).toHaveLength(10)
    expect(s.studiedBones).toHaveLength(10)
  })
})
describe('locale', () => {
  it('detects Arabic and resolves saved choices', () => {
    expect(detectLocale(['ar-SA'])).toBe('ar'); expect(detectLocale(['en-US'])).toBe('en'); expect(resolveLocale('en',['ar'])).toBe('en'); expect(isRtl('ar')).toBe(true)
  })
  it('both dictionaries define exactly the same keys', () => {
    expect(DICTIONARY_KEYS.ar.slice().sort()).toEqual(DICTIONARY_KEYS.en.slice().sort())
    expect(DICTIONARY_KEYS.en.length).toBeGreaterThan(120)
  })
})
