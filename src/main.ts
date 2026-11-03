import './styles/main.css'
import { Vector3 } from 'three'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { Renderer, suggestQuality } from './engine/renderer'
import { SaveStore, type BookEntry, type SaveData } from './engine/save'
import { Game, type RunResult } from './game/game'
import { GADGETS, GADGET_IDS, UPGRADES, UPGRADE_IDS, type GadgetId, type UpgradeId } from './game/config'
import {
  BONE_BY_LEVEL, BONE_COUNT, BONE_PARTS, CAMPAIGN_LEVELS, FOSSILS, FOSSIL_BY_ID, FOSSIL_IDS,
  collectedFossilCount, pendingBones, pendingFossils, pickText, type BonePart, type FossilId, type FossilType,
} from './game/collection'
import { bagCapacity, buyGadget, buyUpgrade, ghostBonus, starRating, upgradePrice } from './game/rules'
import { mountBoneViewer, disposeAllBoneViewers } from './game/boneViewer'
import { mountSkeletonViewer, disposeAllSkeletonViewers } from './game/skeletonViewer'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const ui = document.querySelector<HTMLDivElement>('#ui')!

  const save = new SaveStore()
  if (!save.data.quality) save.update({ quality: suggestQuality() })
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const input = new Input(canvas)
  const audio = new Audio()
  const renderer = new Renderer(canvas, save.data.quality)
  const applyAudio = () => audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
  applyAudio()

  const game = new Game(renderer, input, audio, () => save.data, {
    event: (name, data) => {
      if (name === 'won' || name === 'lost') {
        const result = data as RunResult
        if (result.phase === 'won') {
          const bonus = ghostBonus(result.loot, result.ghost)
          const stars = starRating({
            loot: result.loot,
            possible: result.possible,
            secondsLeft: result.secondsLeft,
            dawnSeconds: game.layout.dawnSeconds,
            ghost: result.ghost,
          })
          const bones = result.bone >= 0 && !save.data.bones.includes(result.bone)
            ? [...save.data.bones, result.bone].sort((a, b) => a - b)
            : save.data.bones
          const fossils = { ...save.data.fossils }
          for (const id of result.fossils) fossils[id] = (fossils[id] ?? 0) + 1
          save.update({
            money: save.data.money + result.loot + bonus,
            level: Math.min(CAMPAIGN_LEVELS, result.level + 1),
            bestLevel: Math.max(save.data.bestLevel, Math.min(CAMPAIGN_LEVELS, result.level + 1)),
            started: true,
            tutorialDone: result.level === 1 ? true : save.data.tutorialDone,
            ghosts: save.data.ghosts + (result.ghost ? 1 : 0),
            stars: { ...save.data.stars, [String(result.level)]: Math.max(save.data.stars[String(result.level)] ?? 0, stars) },
            bones,
            fossils,
          })
          setTimeout(() => showMuseum({
            banner: { level: result.level, loot: result.loot, stars, bonus, ghost: result.ghost },
          }), 450)
        } else {
          save.update({ started: true })
          setTimeout(() => showResult(result), 700)
        }
      }
      if (name === 'loot') toast(`+$${(data as { value?: number })?.value ?? 0}`)
      if (name === 'bone') {
        const part = BONE_PARTS[(data as { part: number })?.part ?? 0]
        if (part) toast(i18n.t('boneFound', { name: pickText(part.name, i18n.locale) }))
      }
      if (name === 'message' && typeof data === 'string') toast(i18n.t(data))
    },
  })
  game.setReducedMotion(save.data.reducedMotion)
  game.setGlow(save.data.glow)

  // ---------- shared helpers ----------
  const $ = <T extends Element = HTMLElement>(selector: string) => ui.querySelector<T>(selector)
  const toast = (text: string) => {
    if (!text) return
    const node = document.createElement('div')
    node.className = 'toast'
    node.textContent = text
    ui.append(node)
    setTimeout(() => node.remove(), 1600)
  }

  type HudRefs = {
    level: HTMLElement
    bone: HTMLElement
    bag: HTMLElement
    bagFill: HTMLElement
    noise: HTMLElement
    dawn: HTMLElement
    dawnFill: HTMLElement
    stamina: HTMLElement
    gadget: HTMLElement
    radar: HTMLElement
    center: HTMLElement
    hint: HTMLElement
    minimap: HTMLCanvasElement
    offscreen: HTMLElement
  }
  let refs: HudRefs | null = null
  const arrows: HTMLElement[] = []
  let lastMinimap = 0
  const project = new Vector3()

  const hudMarkup = () => `<div class="hud">
    <div class="hud-left">
      <div class="chip" id="hud-level"></div>
      <div class="chip bone-chip" id="hud-bone"></div>
      <div class="chip"><span id="hud-bag"></span><div class="meter"><div class="fill" id="hud-bagfill"></div></div></div>
      <div class="chip">${i18n.t('noise')}<div class="meter"><div class="fill noise" id="hud-noise"></div></div></div>
      <div class="chip hidden" id="hud-radar"></div>
    </div>
    <div class="hud-right">
      <div class="chip"><span id="hud-dawn"></span><div class="meter"><div class="fill dawn" id="hud-dawnfill"></div></div></div>
      <div class="chip">${i18n.t('stamina')}<div class="meter"><div class="fill stamina" id="hud-stamina"></div></div></div>
      <div class="chip" id="hud-gadget"></div>
    </div>
    <button class="pause-btn" id="pause" aria-label="${i18n.t('paused')}">Ⅱ</button>
    <canvas id="minimap" class="minimap${save.data.minimap ? '' : ' hidden'}" aria-hidden="true"></canvas>
    <div id="offscreen" class="offscreen"></div>
    <div class="vignette"></div>
    <div class="center" id="hud-center"></div>
    <div class="hint" id="hud-hint"></div>
    <div class="touch">
      <div class="touch-stick" id="stick"><i></i></div>
      <div class="touch-actions">
        <button id="touch-sprint">RUN</button>
        <button id="touch-use">Q</button>
        <button id="touch-interact">E</button>
      </div>
    </div>
  </div>`

  const wireTouch = () => {
    const stick = $('#stick')
    if (stick) {
      const move = (event: PointerEvent) => {
        const rect = stick.getBoundingClientRect()
        const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)))
        const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)))
        input.setTouchMove(x, y)
      }
      stick.addEventListener('pointerdown', event => { stick.setPointerCapture(event.pointerId); move(event) })
      stick.addEventListener('pointermove', event => { if (event.buttons) move(event) })
      stick.addEventListener('pointerup', () => input.setTouchMove(0, 0))
      stick.addEventListener('pointercancel', () => input.setTouchMove(0, 0))
    }
    const bindings = [['touch-sprint', 'sprint'], ['touch-use', 'tool'], ['touch-interact', 'interact']] as const
    for (const [id, action] of bindings) {
      const button = $('#' + id)
      button?.addEventListener('pointerdown', event => { event.preventDefault(); input.setTouchButton(action, true) })
      button?.addEventListener('pointerup', () => input.setTouchButton(action, false))
      button?.addEventListener('pointercancel', () => input.setTouchButton(action, false))
    }
  }

  const buildHud = () => {
    ui.innerHTML = hudMarkup()
    refs = {
      level: $('#hud-level')!, bone: $('#hud-bone')!, bag: $('#hud-bag')!, bagFill: $('#hud-bagfill')!, noise: $('#hud-noise')!,
      dawn: $('#hud-dawn')!, dawnFill: $('#hud-dawnfill')!, stamina: $('#hud-stamina')!,
      gadget: $('#hud-gadget')!, radar: $('#hud-radar')!, center: $('#hud-center')!, hint: $('#hud-hint')!,
      minimap: $('#minimap') as HTMLCanvasElement, offscreen: $('#offscreen')!,
    }
    arrows.length = 0
    for (let i = 0; i < game.guards.length; i += 1) {
      const arrow = document.createElement('div')
      arrow.className = 'guard-arrow'
      arrow.textContent = '▲'
      arrow.style.display = 'none'
      refs.offscreen.append(arrow)
      arrows.push(arrow)
    }
    wireTouch()
    updateHud()
  }

  const TIER_COLOR: Record<string, string> = { common: '#ece4cf', rare: '#6fd0ff', legendary: '#ffb84d' }

  /** Top-down schematic of the floor. Walls/exit/player are always visible; the minimap upgrade adds loot and guards. */
  const drawMinimap = () => {
    const canvas = refs?.minimap
    if (!canvas || canvas.classList.contains('hidden') || !game.layout) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = 176
    const h = 150
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== Math.floor(w * dpr)) {
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
    }
    const grid = game.layout.grid
    const pad = 8
    const scale = Math.min((w - pad * 2) / grid.w, (h - pad * 2) / grid.h)
    const ox = (w - grid.w * scale) / 2
    const oy = (h - grid.h * scale) / 2
    const at = (x: number, z: number): [number, number] => [ox + x * scale, oy + z * scale]

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(6,9,19,0.78)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = 'rgba(58,74,120,0.20)'
    for (let tz = 0; tz < grid.h; tz += 1) {
      for (let tx = 0; tx < grid.w; tx += 1) {
        if (grid.isWall(tx, tz)) continue
        ctx.fillRect(ox + tx * scale, oy + tz * scale, scale + 0.4, scale + 0.4)
      }
    }
    ctx.fillStyle = 'rgba(126,144,198,0.62)'
    for (let tz = 0; tz < grid.h; tz += 1) {
      for (let tx = 0; tx < grid.w; tx += 1) {
        if (grid.isWall(tx, tz)) ctx.fillRect(ox + tx * scale, oy + tz * scale, scale + 0.4, scale + 0.4)
      }
    }

    const exit = game.layout.exit
    const [ex, ez] = at(exit.x - exit.w / 2, exit.z - 0.4)
    ctx.fillStyle = 'rgba(79,220,154,0.85)'
    ctx.fillRect(ex, ez, exit.w * scale, scale * 0.9)

    // The mandatory bone is always shown: it is the objective, not optional loot.
    if (!game.boneTaken) {
      const [bx, bz] = at(game.layout.bone.x, game.layout.bone.z)
      ctx.fillStyle = '#ffd24a'
      ctx.beginPath()
      ctx.arc(bx, bz, 3.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,210,74,0.55)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(bx, bz, 5.6, 0, Math.PI * 2)
      ctx.stroke()
    }

    const upgraded = save.data.upgrades.minimap > 0
    if (upgraded) {
      for (const a of game.layout.artifacts) {
        if (game.world.artifacts.get(a.id)?.taken) continue
        const [px, py] = at(a.x, a.z)
        ctx.fillStyle = TIER_COLOR[a.tier] ?? '#fff'
        ctx.beginPath()
        ctx.arc(px, py, 2.1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const g of game.guards) {
      const [px, py] = at(g.pos.x, g.pos.z)
      if (upgraded || g.state === 'chase') {
        ctx.fillStyle = g.state === 'chase' ? '#ff4d5e' : g.state === 'patrol' || g.state === 'look' ? 'rgba(210,220,245,0.9)' : '#ffb84d'
        ctx.beginPath()
        ctx.arc(px, py, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (game.radarTimer > 0) {
      const [px, py] = at(game.player.pos.x, game.player.pos.z)
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160)
      ctx.strokeStyle = `rgba(120,200,255,${0.25 + pulse * 0.35})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 9 + pulse * 5, 0, Math.PI * 2)
      ctx.stroke()
    }

    const [px, py] = at(game.player.pos.x, game.player.pos.z)
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(Math.PI / 2 - game.player.yaw)
    ctx.fillStyle = '#ffd469'
    ctx.beginPath()
    ctx.moveTo(4.6, 0)
    ctx.lineTo(-3.4, 3)
    ctx.lineTo(-1.6, 0)
    ctx.lineTo(-3.4, -3)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /** Edge arrows for guards that are outside the camera frustum. */
  const drawGuardArrows = () => {
    const cam = game.camera.camera
    game.guards.forEach((guard, i) => {
      const arrow = arrows[i]
      if (!arrow) return
      project.set(guard.pos.x, 1.1, guard.pos.z).project(cam)
      let x = project.x
      let y = project.y
      const behind = project.z > 1
      if (behind) { x = -x; y = -y }
      const edge = 0.93
      const outside = behind || Math.abs(x) > edge || Math.abs(y) > edge
      if (!outside) { arrow.style.display = 'none'; return }
      const norm = Math.max(Math.abs(x) / edge, Math.abs(y) / edge, 1e-4)
      x /= norm
      y /= norm
      arrow.style.display = 'block'
      arrow.style.left = `${(x * 0.5 + 0.5) * 100}%`
      arrow.style.top = `${(-y * 0.5 + 0.5) * 100}%`
      const angle = (Math.atan2(-y, x) * 180) / Math.PI
      arrow.style.transform = `translate(-50%,-50%) rotate(${angle + 90}deg)`
      arrow.className = `guard-arrow${guard.state === 'chase' ? ' chase' : guard.state === 'patrol' || guard.state === 'look' ? '' : ' warn'}`
    })
  }

  const tutorialHint = (): string => {
    if (save.data.tutorialDone || game.level !== 1) return ''
    if (!game.boneTaken) {
      if (game.player.distanceMoved > 2) return 'tutorialBone'
      return 'tutorialMove'
    }
    if (game.bagSlots > 0) return 'tutorialExit'
    if (game.guards.some(g => g.state !== 'patrol' && g.state !== 'look')) return 'tutorialHide'
    if (game.player.distanceMoved > 1.5) return 'tutorialSteal'
    return 'tutorialMove'
  }

  const updateHud = () => {
    if (!refs || game.mode !== 'playing' || !game.layout) return
    const h = game.hud()
    refs.level.textContent = `${i18n.t('level', { n: game.level })} · $${save.data.money}`
    const part = BONE_BY_LEVEL(game.level)
    if (h.boneTaken) {
      refs.bone.textContent = `${i18n.t('bone')}: ${i18n.t('secured')}`
      refs.bone.classList.add('done')
    } else {
      refs.bone.textContent = `${i18n.t('bone')}: ${pickText(part.name, i18n.locale)}`
      refs.bone.classList.remove('done')
    }
    refs.bag.textContent = `${i18n.t('bag')} ${h.slots}/${h.capacity}`
    refs.bagFill.style.width = `${Math.min(100, Number(h.slots) / Math.max(1, Number(h.capacity)) * 100)}%`
    refs.noise.style.width = `${Math.min(100, Number(h.noise) * 100)}%`
    refs.dawn.textContent = `${i18n.t('dawn')} ${Math.ceil(Number(h.time))}s`
    refs.dawnFill.style.width = `${Math.max(0, Number(h.time) / game.layout.dawnSeconds * 100)}%`
    refs.stamina.style.width = `${Math.max(0, Math.min(100, Number(h.stamina)))}%`
    refs.gadget.textContent = `${i18n.t('gadget')}: ${i18n.t(h.gadget === 'noise' ? 'noiseMaker' : String(h.gadget))} ×${Number((h.gadgets as Record<string, number>)[String(h.gadget)] ?? 0)}`
    if (h.radarUnlocked) {
      refs.radar.classList.remove('hidden')
      if (Number(h.radarTimer) > 0) refs.radar.textContent = `${i18n.t('radar')}: ${i18n.t('radarActive')}`
      else if (Number(h.radarCooldown) > 0) refs.radar.textContent = `${i18n.t('radar')}: ${Math.ceil(Number(h.radarCooldown))}s`
      else refs.radar.textContent = `${i18n.t('radar')}: ${i18n.t('radarReady')} [R]`
    } else {
      refs.radar.classList.add('hidden')
    }
    if (h.interactionLabel) {
      refs.center.innerHTML = `<div class="prompt">${i18n.t(String(h.interactionLabel))}<div class="progress"><i style="width:${Number(h.interaction) * 100}%"></i></div></div>`
    } else if (refs.center.firstChild) {
      refs.center.innerHTML = ''
    }
    const hint = tutorialHint()
    if (hint) {
      refs.hint.textContent = i18n.t(hint)
      refs.hint.classList.add('show')
    } else {
      refs.hint.classList.remove('show')
    }
    const now = performance.now()
    if (now - lastMinimap > 66) {
      lastMinimap = now
      drawMinimap()
    }
    drawGuardArrows()
  }

  // ---------- screens ----------
  type ExamState = { kind: 'bone' | 'fossil'; id: string; stage: 0 | 1 | 2 }
  let exam: ExamState | null = null
  /** A mounted bone the player clicked in the hall (read-only card). */
  let boneInfo: number | null = null
  let museumBanner: { level: number; loot: number; stars: number; bonus: number; ghost: boolean } | null = null

  /** How many specimens are still waiting on the lab table. */
  const pendingSpecimens = () => ({
    bones: pendingBones(save.data.bones, save.data.studiedBones),
    fossils: pendingFossils(save.data.fossils, save.data.studiedFossils),
  })
  const pendingCount = () => {
    const p = pendingSpecimens()
    return p.bones.length + p.fossils.length
  }

  const showTitle = () => {
    refs = null
    exam = null
    boneInfo = null
    disposeAllBoneViewers()
    disposeAllSkeletonViewers()
    const started = save.data.started
    const pending = pendingCount()
    const studied = save.data.studiedBones.length
    const fossils = collectedFossilCount(save.data.fossils)
    const hasMuseum = save.data.bones.length > 0 || save.data.book.length > 0 || save.data.completed
    ui.innerHTML = `<div class="screen"><div class="panel">
      <h1 class="title">${i18n.t('title')}</h1>
      <p class="subtitle">${i18n.t('subtitle')}</p>
      <div class="title-progress">
        <span>${i18n.t('bonesProgress', { n: studied, total: BONE_COUNT })}</span>
        <span>${i18n.t('fossilsProgress', { n: fossils, total: FOSSILS.length })}</span>
      </div>
      ${save.data.completed ? `<p class="complete-badge">${i18n.t('campaignComplete')}</p>` : ''}
      ${save.data.completed
        ? `<button class="btn primary" id="museum">${i18n.t('viewMuseum')}</button>`
        : `<button class="btn primary" id="play">${i18n.t(started ? 'continue' : 'play')}${started ? ` · ${i18n.t('level', { n: save.data.level })}` : ''}</button>`}
      ${hasMuseum && !save.data.completed ? `<button class="btn museum-btn" id="museum">${i18n.t('museum')}${pending > 0 ? ` • ${i18n.t('newSpecimens', { n: pending })}` : ''}</button>` : ''}
      <button class="btn" id="shop">${i18n.t('shop')} · $${save.data.money}</button>
      <button class="btn" id="settings">${i18n.t('settings')}</button>
      ${save.data.completed ? `<button class="btn" id="new-campaign">${i18n.t('newCampaign')}</button>` : ''}
      <p class="small desktop-help">WASD / arrows · Shift sneak · Space sprint · E interact · Q gadget · C cycle · Esc pause · wheel zoom</p>
    </div></div>`
  }

  const showSettings = () => {
    refs = null
    ui.innerHTML = `<div class="screen"><div class="panel"><h2>${i18n.t('settings')}</h2>
      <div class="settings">
        <label>${i18n.t('language')}<select id="lang"><option value="en">English</option><option value="ar">العربية</option></select></label>
        <label>${i18n.t('quality')}<select id="quality"><option value="low">${i18n.t('low')}</option><option value="medium">${i18n.t('medium')}</option><option value="high">${i18n.t('high')}</option></select></label>
        <label>${i18n.t('difficulty')}<select id="diff"><option value="easy">${i18n.t('easy')}</option><option value="normal">${i18n.t('normal')}</option><option value="hard">${i18n.t('hard')}</option></select></label>
        <label>${i18n.t('music')}<input id="music" type="range" min="0" max="1" step="0.05"></label>
        <label>${i18n.t('effects')}<input id="sfx" type="range" min="0" max="1" step="0.05"></label>
        <label>${i18n.t('muted')}<input id="muted" type="checkbox"></label>
        <label>${i18n.t('reducedMotion')}<input id="motion" type="checkbox"></label>
        <label>${i18n.t('minimap')}<input id="minimap-toggle" type="checkbox"></label>
        <label>${i18n.t('glow')}<input id="glow-toggle" type="checkbox"></label>
      </div>
      <button class="btn" id="save-settings">${i18n.t('back')}</button>
    </div></div>`
    const lang = $('#lang') as HTMLSelectElement
    const quality = $('#quality') as HTMLSelectElement
    const difficulty = $('#diff') as HTMLSelectElement
    const music = $('#music') as HTMLInputElement
    const sfx = $('#sfx') as HTMLInputElement
    const muted = $('#muted') as HTMLInputElement
    const motion = $('#motion') as HTMLInputElement
    const minimap = $('#minimap-toggle') as HTMLInputElement
    const glow = $('#glow-toggle') as HTMLInputElement
    lang.value = i18n.locale
    quality.value = save.data.quality
    difficulty.value = save.data.difficulty
    music.value = String(save.data.musicVolume)
    sfx.value = String(save.data.sfxVolume)
    muted.checked = save.data.muted
    motion.checked = save.data.reducedMotion
    minimap.checked = save.data.minimap
    glow.checked = save.data.glow
  }

  const showPause = () => {
    if (ui.querySelector('#resume')) return
    refs = null
    ui.innerHTML = `<div class="screen"><div class="panel"><h2>${i18n.t('paused')}</h2>
      <button class="btn primary" id="resume">${i18n.t('resume')}</button>
      <button class="btn" id="quit">${i18n.t('quit')}</button>
    </div></div>`
  }

  const resume = () => {
    game.resume()
    input.clearPresses()
    buildHud()
  }

  const showResult = (result: RunResult, extra?: { bonus: number; stars: number }) => {
    refs = null
    exam = null
    const won = result.phase === 'won'
    const stars = extra?.stars ? '★'.repeat(extra.stars) + '☆'.repeat(3 - extra.stars) : ''
    ui.innerHTML = `<div class="screen"><div class="panel">
      <h2>${won ? i18n.t('escaped') : i18n.t('failed')}</h2>
      ${won ? `<p>${i18n.t('loot')}: $${result.loot}</p>
        ${extra?.bonus ? `<p>${i18n.t('ghost')}: +$${extra.bonus}</p>` : ''}
        <p class="stars">${stars}</p>` : `<p>${i18n.t('lostLoot')}</p><p class="small">${i18n.t('safeMoney')}</p>`}
      <p>${i18n.t('time')}: ${Math.ceil(result.secondsLeft)}s</p>
      <button class="btn primary" id="again">${won ? i18n.t('museum') : i18n.t('restart')}</button>
      <button class="btn" id="home">${i18n.t('quit')}</button>
    </div></div>`
  }

  // ---------- museum / lab / field book ----------
  const tx = (text: { en: string; ar: string }) => esc(pickText(text, i18n.locale))
  const sourceLevel = () => (save.data.level >= CAMPAIGN_LEVELS ? CAMPAIGN_LEVELS : Math.max(1, save.data.level - 1))

  /** Small inline illustrations for the fossil cabinet and examination cards. */
  const fossilIcon = (id: FossilId): string => {
    const c = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'
    const art: Record<FossilId, string> = {
      ammonite: `<path d="M24 25c0-5 6-8 10-4s2 11-4 13-14-2-14-10S22 8 32 9s15 12 11 22" ${c}/>`,
      trilobite: `<ellipse cx="24" cy="24" rx="7" ry="14" ${c}/><path d="M17 19h14M17 24h14M17 29h14M10 17l5 3M10 24h5M10 31l5-3M38 17l-5 3M38 24h-5M38 31l-5-3" ${c}/>`,
      fern: `<path d="M24 39V8M24 31l-9-4M24 27l9-5M24 21l-8-4M24 18l8-4M24 12l-6-3M24 10l6-3" ${c}/>`,
      fish: `<path d="M8 24c6-9 22-11 30-2-8 12-22 12-30 2Z" ${c}/><path d="M38 22l7-7v18z" ${c}/><circle cx="15" cy="22" r="1.6" fill="currentColor"/>`,
      leaf: `<path d="M24 40C12 30 11 14 24 7c13 7 12 23 0 33Z" ${c}/><path d="M24 38V9M24 24l-7-5M24 20l7-5M24 30l-6-4M24 28l6-4" ${c}/>`,
      shell: `<path d="M11 35c-2-13 4-24 13-26 9 2 15 13 13 26" ${c}/><path d="M24 9 15 36M24 9l9 27M24 9v27M16 28h16" ${c}/>`,
      insect: `<ellipse cx="24" cy="26" rx="7" ry="11" ${c}/><circle cx="24" cy="12" r="4" ${c}/><path d="M17 18C9 12 7 18 12 23M31 18c8-6 10 0 5 5M17 27l-7 6M31 27l7 6M17 33l-6 7M31 33l6 7M24 10V5" ${c}/>`,
      footprint: `<ellipse cx="24" cy="31" rx="8" ry="9" ${c}/><ellipse cx="14" cy="16" rx="3.5" ry="6" transform="rotate(-25 14 16)" ${c}/><ellipse cx="24" cy="11" rx="3.5" ry="6.5" ${c}/><ellipse cx="34" cy="16" rx="3.5" ry="6" transform="rotate(25 34 16)" ${c}/>`,
      coral: `<circle cx="24" cy="24" r="13" /><circle cx="18" cy="18" r="4" /><circle cx="30" cy="18" r="4" /><circle cx="18" cy="30" r="4" /><circle cx="30" cy="30" r="4" /><circle cx="24" cy="24" r="3" />`,
      sharktooth: `<path d="M24 8 L14 38 L24 32 L34 38 Z" /><path d="M20 22 L24 30 L28 22" />`,
      egg: `<ellipse cx="24" cy="26" rx="9" ry="13" /><path d="M18 20 Q24 16 30 20" />`,
      petrifiedwood: `<rect x="12" y="16" width="24" height="16" rx="3" />,<path d="M14 20 L34 20 M14 24 L34 24 M14 28 L34 28" />`,
    }
    return `<svg viewBox="0 0 48 48" aria-hidden="true">${art[id]}</svg>`
  }

  /**
   * Schematic theropod skeleton: ten independently lit pieces. Filled pieces are
   * assembled; dashed pieces are still missing. Missing parts are never clickable.
   */
  const skeletonSvg = (focus?: number): string => {
    const part = (id: number, art: string) => {
      const collected = save.data.bones.includes(id)
      const cls = `bone-part${collected ? ' on' : ''}${focus === id ? ' focus' : ''}`
      const info = collected ? ` data-bone-info="${id}" role="button" tabindex="0"` : ''
      return `<g class="${cls}"${info}><title>${esc(pickText(BONE_PARTS[id].name, i18n.locale))}</title>${art}</g>`
    }
    return `<svg class="skeleton-svg" viewBox="0 0 360 200" role="img" aria-label="${i18n.t('boneHall')}">
      <path class="dino-silhouette" d="M47 69 C39 87 39 112 51 127 L70 139 L90 133 L94 112 L112 103 L138 108 L158 95 L190 91 L212 98 L231 95 L260 88 C281 82 303 74 321 59 C312 80 297 91 279 97 L251 110 L234 127 L221 149 L212 144 L218 123 L195 129 L179 153 L170 147 L177 125 L150 131 L130 147 L121 141 L136 122 L120 111 L96 115 L80 115 L68 129 L59 121 C52 107 54 88 61 76 Z"/>
      <path class="skeleton-baseline" d="M40 178h284"/>
      ${part(0, `<path class="bone-fill" d="M62 79c13-14 40-13 50 4 6 10 2 22-8 29l-5 10-20 2-8-12-15-10z"/><circle class="bone-hole" cx="87" cy="92" r="5"/>`)}
      ${part(1, `<path class="bone-fill" d="M64 113l32 5 10 7-9 6-32-4-7-8z"/>`)}
      ${part(2, `<path class="bone-teeth" d="M70 113l4 8 4-7 4 9 4-7 4 9 4-7 4 8 4-7"/>`)}
      ${part(3, `<path class="bone-line" d="M114 91C124 86 132 80 138 71"/><circle class="bone-joint" cx="118" cy="88" r="3.2"/><circle class="bone-joint" cx="127" cy="82" r="3.2"/><circle class="bone-joint" cx="135" cy="74" r="3.2"/>`)}
      ${part(4, `<path class="bone-line" d="M151 92c8 14 8 28 0 42M164 90c9 16 9 31 0 47M177 89c9 17 9 32 0 49M190 90c8 16 8 30 0 45M203 94c7 13 7 25 0 37"/>`)}
      ${part(5, `<path class="bone-line" d="M130 77C160 68 188 70 216 88"/><circle class="bone-joint" cx="143" cy="75" r="2.6"/><circle class="bone-joint" cx="157" cy="73" r="2.6"/><circle class="bone-joint" cx="171" cy="73" r="2.6"/><circle class="bone-joint" cx="185" cy="76" r="2.6"/><circle class="bone-joint" cx="199" cy="81" r="2.6"/>`)}
      ${part(6, `<path class="bone-fill" d="M205 98c9-13 26-14 35-2 6 8 4 19-4 25l-13 10-16-8-8-16z"/><circle class="bone-hole" cx="213" cy="107" r="4"/>`)}
      ${part(7, `<path class="bone-line" d="M235 101C257 92 280 87 307 70"/><circle class="bone-joint" cx="248" cy="97" r="2.4"/><circle class="bone-joint" cx="262" cy="93" r="2.2"/><circle class="bone-joint" cx="276" cy="88" r="2"/><circle class="bone-joint" cx="291" cy="81" r="1.8"/><circle class="bone-joint" cx="304" cy="72" r="1.5"/>`)}
      ${part(8, `<path class="bone-line" d="M146 123l-8 22-10 14"/><path class="bone-claw" d="M128 159l-2 8M122 157l-4 7M136 160l0 8"/>`)}
      ${part(9, `<path class="bone-line" d="M207 127l7 27-11 23"/><path class="bone-claw" d="M203 177l-4 8M195 180l-2 8M210 179l1 8"/>`)}
    </svg>`
  }

  const bookEntryHtml = (entry: BookEntry, index: number): string => {
    const bone = entry.kind === 'bone' ? BONE_PARTS.find(b => b.key === entry.id) : undefined
    const fossil = entry.kind === 'fossil' ? FOSSIL_BY_ID[entry.id as FossilId] : undefined
    if (!bone && !fossil) return ''
    const name = bone ? tx(bone.name) : tx(fossil!.name)
    const period = bone ? tx(bone.period) : tx(fossil!.period)
    const fact = bone ? tx(bone.fact) : tx(fossil!.fact)
    const text = bone ? tx(bone.book) : tx(fossil!.book)
    return `<article class="book-entry" data-book-entry="${entry.kind}:${entry.id}">
      <header>
        <span class="entry-icon">${bone ? '🦴' : `<span class="mini-fossil">${fossilIcon(fossil!.id)}</span>`}</span>
        <div><b>${name}</b><small>${bone ? i18n.t('boneSpecimen') : i18n.t('fossilSpecimen')} · ${i18n.t('foundAtLevel', { n: entry.level })}</small></div>
        <span class="entry-no">#${index + 1}</span>
      </header>
      <p>${text}</p>
      <p class="entry-fact">${period} · ${fact}</p>
    </article>`
  }

  const specimenCards = (): string => {
    const pending = pendingSpecimens()
    const bones = pending.bones.map(id => {
      const part = BONE_PARTS[id]
      return `<button class="specimen-card bone" data-examine="bone:${id}">
        <span class="specimen-icon">🦴</span>
        <span class="specimen-body"><b>${tx(part.name)}</b><small>${i18n.t('boneSpecimen')} · ${tx(part.period)}</small></span>
        <span class="specimen-go">${i18n.t('examine')}</span>
      </button>`
    })
    const fossils = pending.fossils.map(id => {
      const fossil = FOSSIL_BY_ID[id]
      return `<button class="specimen-card fossil" data-examine="fossil:${id}">
        <span class="specimen-icon">${fossilIcon(id)}</span>
        <span class="specimen-body"><b>${tx(fossil.name)}</b><small>${i18n.t('fossilSpecimen')} · ${tx(fossil.period)}</small></span>
        <span class="specimen-go">${i18n.t('examine')}</span>
      </button>`
    })
    if (bones.length + fossils.length === 0) {
      return `<div class="empty-lab"><span>✓</span><p>${i18n.t('noSpecimens')}</p><small>${i18n.t('noSpecimensHint')}</small></div>`
    }
    return [...bones, ...fossils].join('')
  }

  const examMarkup = (): string => {
    if (!exam) return ''
    const isBone = exam.kind === 'bone'
    const bone = isBone ? BONE_PARTS[Number(exam.id)] : undefined
    const fossil = !isBone ? FOSSIL_BY_ID[exam.id as FossilId] : undefined
    if (!bone && !fossil) return ''
    const name = bone ? tx(bone.name) : tx(fossil!.name)
    const latin = bone ? esc(bone.latin) : tx(fossil!.latin)
    const period = bone ? tx(bone.period) : tx(fossil!.period)
    const fact = bone ? tx(bone.fact) : tx(fossil!.fact)
    const recovered = bone ? tx(bone.recovered) : i18n.t('fossilRecovered')
    const bookText = bone ? tx(bone.book) : tx(fossil!.book)
    const stages = [i18n.t('stageClean'), i18n.t('stageAnalyze'), i18n.t('stageRegister')]
    return `<div class="exam-overlay">
      <div class="exam-card">
        <button class="exam-close" data-exam-close="1" aria-label="${i18n.t('close')}">×</button>
        <div class="exam-visual ${isBone ? 'is-bone' : 'is-fossil'}">
          ${isBone ? `<canvas class="bone-3d-canvas" data-bone-canvas="${Number(exam.id)}" width="300" height="220"></canvas>` : `<div class="exam-fossil-icon">${fossilIcon(fossil!.id)}</div>`}
        </div>
        <p class="eyebrow">${isBone ? i18n.t('boneSpecimen') : i18n.t('fossilSpecimen')}</p>
        <h2>${name}</h2>
        <p class="latin">${latin}</p>
        <div class="exam-steps">${stages.map((stage, i) => `<span class="${i <= exam!.stage ? 'on' : ''} ${i < exam!.stage ? 'done' : ''}"><i>${i + 1}</i>${stage}</span>`).join('')}</div>
        ${exam.stage === 0 ? `<p class="exam-hint">${i18n.t('cleanHint')}</p>
          <button class="btn primary" data-exam-action="clean">${i18n.t('scanClean')}</button>` : ''}
        ${exam.stage === 1 ? `<div class="exam-data">
            <div><span>${i18n.t('period')}</span><b>${period}</b></div>
            <div><span>${i18n.t('measurements')}</span><b>${fact}</b></div>
            <div><span>${i18n.t('recovered')}</span><b>${recovered}</b></div>
          </div>
          <p class="small">${i18n.t('analyzeHint')}</p>
          <button class="btn primary" data-exam-action="register">${i18n.t('scanRegister')}</button>` : ''}
        ${exam.stage === 2 ? `<div class="book-preview">
            <span class="eyebrow">${i18n.t('bookEntry')}</span>
            <p>${bookText}</p>
            <p class="entry-fact">${period} · ${fact}</p>
          </div>
          <button class="btn primary" data-exam-action="done">${i18n.t('close')}</button>` : ''}
      </div>
    </div>`
  }

  /** Read-only card for a bone already mounted in the hall. */
  /**
   * A single, larger bone illustration used in the lab examination cards.
   * The hall uses the schematic skeleton; the lab shows the specimen on its own.
   */
  const boneDetailSvg = (part: number): string => {
    const grad = '<defs>'
      + '<radialGradient id="labSlab" cx="50%" cy="42%" r="62%">'
      + '<stop offset="0%" stop-color="#2a3350"/><stop offset="60%" stop-color="#131a2e"/><stop offset="100%" stop-color="#070a14"/>'
      + '</radialGradient>'
      + '<linearGradient id="labBone" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#faf0d6"/><stop offset="45%" stop-color="#e6d6a8"/><stop offset="100%" stop-color="#b9a36e"/>'
      + '</linearGradient>'
      + '</defs>'
    const slab = '<rect width="220" height="180" rx="14" fill="url(#labSlab)"/>'
      + '<ellipse cx="110" cy="160" rx="78" ry="9" fill="rgba(0,0,0,0.55)"/>'
    const B = 'fill="url(#labBone)" stroke="#8a7340" stroke-width="1.4" stroke-linejoin="round"'
    const ink = 'fill="none" stroke="#b9a36e" stroke-width="1.4"'
    let body = ''
    switch (part) {
      case 0: // skull
        body = '<ellipse cx="110" cy="80" rx="58" ry="50" ' + B + '/>'
          + '<path d="M78 124 L78 146 L142 146 L142 124 Q110 134 78 124 Z" ' + B + '/>'
          + '<ellipse cx="86" cy="76" rx="12" ry="10" fill="#12172a" stroke="none"/>'
          + '<ellipse cx="134" cy="76" rx="12" ry="10" fill="#12172a" stroke="none"/>'
          + '<path d="M103 92 L99 110 L121 110 L117 92 Z" fill="#12172a" stroke="none"/>'
          + '<path d="M84 146 L90 154 L98 146 L106 154 L114 146 L122 154 L130 146 L138 154 L146 146" ' + ink + '/>'
        break
      case 1: // jaw
        body = '<path d="M34 88 Q60 52 110 48 Q160 52 186 88 L178 110 Q148 128 110 132 Q72 128 42 110 Z" ' + B + '/>'
          + '<path d="M50 96 L54 112 L62 96 L68 114 L76 96 L84 114 L92 96 L100 114 L108 96 L116 114 L124 96 L132 114 L140 96 L148 114 L156 96 L164 114 L172 96 L178 112" ' + ink + '/>'
        break
      case 2: // teeth
        body = '<rect x="36" y="86" width="148" height="22" rx="8" ' + B + '/>'
        for (let i = 0; i < 7; i++) {
          const x = 50 + i*19
          body += '<path d="M' + x + ' 86 L' + (x+5) + ' 60 L' + (x+10) + ' 86 Z" fill="url(#labBone)" stroke="#8a7340" stroke-width="1"/>'
          body += '<path d="M' + x + ' 108 L' + (x+5) + ' 134 L' + (x+10) + ' 108 Z" fill="url(#labBone)" stroke="#8a7340" stroke-width="1"/>'
        }
        break
      case 3: // neck
        for (let i = 0; i < 4; i++) {
          const x = 46 + i*44
          body += '<ellipse cx="' + x + '" cy="92" rx="17" ry="22" ' + B + '/>'
          body += '<rect x="' + (x-4) + '" y="62" width="8" height="10" rx="3" ' + B + '/>'
          body += '<path d="M' + (x-15) + ' 86 Q' + (x-23) + ' 92 ' + (x-15) + ' 98" ' + ink + '/>'
          body += '<path d="M' + (x+15) + ' 86 Q' + (x+23) + ' 92 ' + (x+15) + ' 98" ' + ink + '/>'
        }
        break
      case 4: // ribs
        for (let i = 0; i < 6; i++) {
          const x = 42 + i*24
          const h = 44 + (i%2)*8
          body += '<path d="M' + x + ' 152 Q' + (x-8) + ' ' + (152-h/2) + ' ' + (x+2) + ' ' + (152-h) + ' Q' + (x+12) + ' ' + (152-h-4) + ' ' + (x+20) + ' ' + (152-h) + '" fill="none" stroke="url(#labBone)" stroke-width="7" stroke-linecap="round"/>'
          body += '<circle cx="' + x + '" cy="152" r="4" fill="#b9a36e" stroke="none"/>'
        }
        body += '<rect x="34" y="148" width="152" height="8" rx="4" ' + B + '/>'
        break
      case 5: // spine
        body = '<rect x="30" y="86" width="160" height="12" rx="6" ' + B + '/>'
        for (let i = 0; i < 9; i++) {
          const x = 36 + i*18
          const h = 28 - Math.abs(i-4)*3
          body += '<path d="M' + x + ' 86 L' + (x-3) + ' ' + (86-h) + ' L' + (x+3) + ' ' + (86-h) + ' Z" fill="url(#labBone)" stroke="#8a7340" stroke-width="1"/>'
          body += '<circle cx="' + x + '" cy="92" r="3" fill="#b9a36e" stroke="none"/>'
        }
        break
      case 6: // pelvis
        body = '<path d="M70 62 C50 72 44 96 52 120 L80 138 L110 128 L140 138 L168 120 C176 96 170 72 150 62 L130 74 L110 68 L90 74 Z" ' + B + '/>'
          + '<circle cx="86" cy="118" r="9" fill="#12172a" stroke="none"/>'
          + '<circle cx="134" cy="118" r="9" fill="#12172a" stroke="none"/>'
          + '<path d="M100 52 L110 68 L120 52" ' + ink + '/>'
        break
      case 7: // tail
        for (let i = 0; i < 9; i++) {
          const t = i/8
          const r = 13 - t*9
          const x = 40 + i*16
          const y = 92 + Math.sin(t*Math.PI)*6
          body += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r + '" ry="' + (r*0.85) + '" ' + B + '/>'
        }
        break
      case 8: // forelimb (upright)
        body = '<rect x="95" y="30" width="30" height="60" rx="10" ' + B + '/>'
          + '<rect x="98" y="92" width="24" height="46" rx="8" ' + B + '/>'
          + '<ellipse cx="110" cy="148" rx="16" ry="10" ' + B + '/>'
          + '<line x1="98" y1="150" x2="92" y2="172" stroke="url(#labBone)" stroke-width="4" stroke-linecap="round"/>'
          + '<line x1="110" y1="152" x2="110" y2="176" stroke="url(#labBone)" stroke-width="4" stroke-linecap="round"/>'
          + '<line x1="122" y1="150" x2="128" y2="172" stroke="url(#labBone)" stroke-width="4" stroke-linecap="round"/>'
          + '<circle cx="92" cy="174" r="3" fill="#b9a36e" stroke="none"/>'
          + '<circle cx="110" cy="178" r="3" fill="#b9a36e" stroke="none"/>'
          + '<circle cx="128" cy="174" r="3" fill="#b9a36e" stroke="none"/>'
        break
      case 9: // hindlimb (upright)
        body = '<rect x="92" y="24" width="36" height="68" rx="12" ' + B + '/>'
          + '<rect x="96" y="94" width="28" height="50" rx="9" ' + B + '/>'
          + '<rect x="90" y="146" width="40" height="12" rx="6" ' + B + '/>'
          + '<line x1="96" y1="158" x2="90" y2="178" stroke="url(#labBone)" stroke-width="4" stroke-linecap="round"/>'
          + '<line x1="110" y1="158" x2="110" y2="180" stroke="url(#labBone)" stroke-width="4" stroke-linecap="round"/>'
          + '<line x1="124" y1="158" x2="130" y2="178" stroke="url(#labBone)" stroke-width="4" stroke-linecap="round"/>'
          + '<circle cx="90" cy="180" r="3" fill="#b9a36e" stroke="none"/>'
          + '<circle cx="110" cy="182" r="3" fill="#b9a36e" stroke="none"/>'
          + '<circle cx="130" cy="180" r="3" fill="#b9a36e" stroke="none"/>'
        break
    }
    return '<svg class="bone-detail-svg" viewBox="0 0 220 180" role="img" aria-label="bone">' + grad + slab + '<g filter="none">' + body + '</g></svg>'
  }

  const boneInfoMarkup = (): string => {
    if (boneInfo === null) return ''
    const part = BONE_PARTS[boneInfo]
    if (!part) return ''
    const studied = save.data.studiedBones.includes(boneInfo)
    return `<div class="exam-overlay" data-bone-info-close="1">
      <div class="exam-card bone-info-card" role="dialog" aria-modal="true">
        <button class="exam-close" data-bone-info-close="1" aria-label="${i18n.t('close')}">×</button>
        <div class="exam-visual is-bone"><canvas class="bone-3d-canvas" data-bone-canvas="` + boneInfo + `" width="300" height="220"></canvas></div>
        <p class="eyebrow">${i18n.t('boneSpecimen')}</p>
        <h2>${tx(part.name)}</h2>
        <p class="latin">${esc(part.latin)}</p>
        <div class="exam-data">
          <div><span>${i18n.t('period')}</span><b>${tx(part.period)}</b></div>
          <div><span>${i18n.t('measurements')}</span><b>${tx(part.fact)}</b></div>
          <div><span>${i18n.t('recovered')}</span><b>${tx(part.recovered)}</b></div>
        </div>
        ${studied
          ? `<div class="book-preview"><span class="eyebrow">${i18n.t('bookEntry')}</span><p>${tx(part.book)}</p></div>`
          : `<p class="exam-hint">${i18n.t('notStudiedYet')}</p>`}
      </div>
    </div>`
  }

  const museumMarkup = (): string => {
    const pending = pendingSpecimens()
    const allDone = pending.bones.length + pending.fossils.length === 0
    const studied = save.data.studiedBones.length
    const collected = collectedFossilCount(save.data.fossils)
    const studiedFossils = FOSSIL_IDS.filter(id => (save.data.studiedFossils[id] ?? 0) > 0).length
    const cabinet = FOSSILS.map(f => {
      const count = save.data.fossils[f.id] ?? 0
      const studiedFossil = (save.data.studiedFossils[f.id] ?? 0) > 0
      return `<div class="fossil-tile${count > 0 ? ' collected' : ''}${studiedFossil ? ' studied' : ''}" title="${tx(f.name)}">
        <span class="fossil-icon">${fossilIcon(f.id)}</span>
        <b>${tx(f.name)}</b>
        <span class="fossil-count">${count > 0 ? `×${count}` : i18n.t('notFound')}</span>
        ${studiedFossil ? '<span class="stamp">✓</span>' : ''}
      </div>`
    }).join('')
    const entries = save.data.book.map(bookEntryHtml).filter(Boolean).join('') || `<p class="book-empty">${i18n.t('bookEmpty')}</p>`
    const banner = museumBanner
      ? `<div class="museum-banner">
          <b>${i18n.t('levelComplete', { n: museumBanner.level })}</b>
          <span>+$${museumBanner.loot}${museumBanner.bonus ? ` · ${i18n.t('ghost')} +$${museumBanner.bonus}` : ''} · ${'★'.repeat(museumBanner.stars)}${'☆'.repeat(3 - museumBanner.stars)}</span>
        </div>`
      : ''
    return `<div class="museum-screen">
      <header class="museum-head">
        <div class="museum-title">
          <p class="eyebrow">${i18n.t('museumEyebrow')}</p>
          <h1>${i18n.t('museum')}</h1>
          <p class="museum-sub">${i18n.t('museumSub')}</p>
        </div>
        <div class="museum-progress">
          <span class="progress-pill"><b>${studied}/${BONE_COUNT}</b> ${i18n.t('bones')}</span>
          <span class="progress-pill"><b>${collected}/${FOSSILS.length}</b> ${i18n.t('fossils')}</span>
          <span class="progress-pill"><b>${studiedFossils}/${FOSSILS.length}</b> ${i18n.t('studied')}</span>
        </div>
        <div class="museum-head-actions">
          <button class="btn tiny" id="museum-menu">${i18n.t('backToMenu')}</button>
        </div>
      </header>
      ${banner}
      <main class="museum-main">
        <section class="museum-hall">
          <div class="hall-head"><div><h2>${i18n.t('boneHall')}</h2><p>${i18n.t('boneHallSub')}</p></div><span class="hall-count">${studied}/${BONE_COUNT}</span></div>
n          <p class="small footer-hint">${i18n.t('mountHint')}</p>

          <div class="bone-legend">${BONE_PARTS.map((b, i) => `<span class="${save.data.bones.includes(i) ? 'on' : ''}">${save.data.bones.includes(i) ? '🦴' : '·'} ${tx(b.name)}</span>`).join('')}</div>
          <div class="hall-head fossil-head"><div><h2>${i18n.t('fossilCabinet')}</h2><p>${i18n.t('fossilCabinetSub')}</p></div><span class="hall-count">${collected}/${FOSSILS.length}</span></div>
          <div class="fossil-grid">${cabinet}</div>
        </section>
        <aside class="museum-lab">
          <div class="lab-head"><div><h2>${i18n.t('lab')}</h2><p>${allDone ? i18n.t('labDone') : i18n.t('labPending', { n: pending.bones.length + pending.fossils.length })}</p></div><span class="lab-badge">${i18n.t('specimens')} ${pending.bones.length + pending.fossils.length}</span></div>
          <div class="specimen-list">${specimenCards()}</div>
          <div class="book-panel">
            <div class="book-head"><div><h2>${i18n.t('assistantBook')}</h2><p>${i18n.t('bookAuthor')}</p></div><span class="book-count">${save.data.book.length}</span></div>
            <p class="book-intro">${i18n.t('bookIntro')}</p>
            <div class="book-entries">${entries}</div>
          </div>
          <div class="museum-footer">
            <button class="btn" id="museum-shop">${i18n.t('shop')} · $${save.data.money}</button>
            <button class="btn primary" id="museum-next" ${allDone ? '' : 'disabled'}>${save.data.completed ? i18n.t('finale') : i18n.t('nextLevel')}</button>
          </div>
          ${allDone ? '' : `<p class="small footer-hint">${i18n.t('studyFirst')}</p>`}
        </aside>
      </main>
    </div>${examMarkup()}${boneInfoMarkup()}`
  }

  const renderMuseum = () => {
    refs = null
    disposeAllBoneViewers()
    disposeAllSkeletonViewers()
    ui.innerHTML = museumMarkup()
    ui.querySelectorAll<HTMLCanvasElement>('.bone-3d-canvas').forEach(canvas => {
      const part = Number(canvas.dataset.boneCanvas)
      if (Number.isFinite(part)) mountBoneViewer(canvas, part)
    })
    const skelCanvas = ui.querySelector<HTMLCanvasElement>('.skeleton-3d-canvas')
    if (skelCanvas) { try { mountSkeletonViewer(skelCanvas); console.log('skeleton mounted ok') } catch (e) { console.error('skeleton mount failed:', e) } }
  }

  const showMuseum = (context?: { banner?: typeof museumBanner }) => {
    if (context?.banner) museumBanner = context.banner
    exam = null
    boneInfo = null
    renderMuseum()
  }

  const registerSpecimen = () => {
    if (!exam) return
    if (exam.kind === 'bone') {
      const id = Number(exam.id)
      if (!save.data.studiedBones.includes(id)) {
        const studiedBones = [...save.data.studiedBones, id].sort((a, b) => a - b)
        const completed = studiedBones.length >= BONE_COUNT
        save.update({
          studiedBones,
          completed,
          book: [...save.data.book, { kind: 'bone', id: BONE_PARTS[id].key, level: sourceLevel() }],
        })
      }
    } else {
      const id = exam.id as FossilId
      const owned = save.data.fossils[id] ?? 0
      if ((save.data.studiedFossils[id] ?? 0) < owned) {
        save.update({
          studiedFossils: { ...save.data.studiedFossils, [id]: owned },
          book: [...save.data.book, { kind: 'fossil', id, level: sourceLevel() }],
        })
      }
    }
    exam.stage = 2
    audio.coin()
    renderMuseum()
  }

  const closeExam = () => {
    const completed = save.data.completed
    exam = null
    if (completed) showFinale()
    else renderMuseum()
  }

  const advanceExam = (action: string) => {
    if (!exam) return
    if (action === 'clean') { exam.stage = 1; renderMuseum() }
    else if (action === 'register') registerSpecimen()
    else if (action === 'done') closeExam()
  }

  const showFinale = () => {
    refs = null
    exam = null
    boneInfo = null
    disposeAllBoneViewers()
    disposeAllSkeletonViewers()
    ui.innerHTML = `<div class="screen finale-screen"><div class="panel finale-panel">
      <p class="eyebrow">${i18n.t('campaignComplete')}</p>
      <h1 class="finale-title">${i18n.t('finaleTitle')}</h1>
      <div class="finale-skeleton">${skeletonSvg()}</div>
      <p class="finale-body">${i18n.t('finaleBody')}</p>
      <div class="finale-stats">
        <span><b>${save.data.studiedBones.length}/10</b> ${i18n.t('bones')}</span>
        <span><b>${collectedFossilCount(save.data.fossils)}/8</b> ${i18n.t('fossils')}</span>
        <span><b>${save.data.book.length}</b> ${i18n.t('bookEntries')}</span>
      </div>
      <button class="btn primary" id="museum">${i18n.t('viewMuseum')}</button>
      <button class="btn" id="new-campaign">${i18n.t('newCampaign')}</button>
      <button class="btn" id="home">${i18n.t('backToMenu')}</button>
    </div></div>`
  }


  const showShop = (returnTo: 'title' | 'museum' = 'title') => {
    refs = null
    disposeAllBoneViewers()
    disposeAllSkeletonViewers()
    const draw = () => {
      const data = save.data
      const upgrades = UPGRADE_IDS.map(id => {
        const tier = data.upgrades[id]
        const max = UPGRADES[id].tiers
        const price = upgradePrice(id, tier)
        const label = i18n.t(({ speed: 'speed', bag: 'bagUpgrade', quiet: 'quiet', stamina: 'staminaUpgrade', lockpick: 'lockpick', radar: 'radarUpgrade' } as Record<UpgradeId, string>)[id] ?? id)
        const pips = `${tier}/${max}`
        return `<div class="shop-row"><div><b>${label}</b> <span class="small">${pips}</span></div>
          <button class="btn small-btn" data-upgrade="${id}" ${price === undefined ? 'disabled' : ''}>${price === undefined ? i18n.t('max') : `$${price}`}</button></div>`
      }).join('')
      const gadgets = GADGET_IDS.map(id => {
        const owned = data.gadgets[id]
        const max = GADGETS[id].max
        const label = i18n.t(id === 'noise' ? 'noiseMaker' : id)
        return `<div class="shop-row"><div><b>${label}</b> <span class="small">${owned}/${max}</span></div>
          <button class="btn small-btn" data-gadget="${id}" ${owned >= max ? 'disabled' : ''}>${owned >= max ? i18n.t('max') : `$${GADGETS[id].price}`}</button></div>`
      }).join('')
      ui.innerHTML = `<div class="screen"><div class="panel shop-panel">
        <h2>${i18n.t('shop')}</h2>
        <p class="money">$${data.money} · ${i18n.t('bag')} ${bagCapacity(data.upgrades)}</p>
        <div class="shop-grid">${upgrades}${gadgets}</div>
        <button class="btn primary" id="shop-next">${returnTo === 'museum' ? i18n.t('backToMuseum') : i18n.t('next')}</button>
        <button class="btn" id="shop-home">${returnTo === 'museum' ? i18n.t('backToMenu') : i18n.t('quit')}</button>
      </div></div>`
    }
    draw()

    ui.querySelectorAll<HTMLElement>('[data-upgrade]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.upgrade as UpgradeId
        const purchase = buyUpgrade(save.data.money, save.data.upgrades, id)
        if (purchase.ok) {
          save.update({ money: purchase.money, upgrades: { ...save.data.upgrades } })
          audio.coin()
        } else {
          toast(i18n.t(purchase.reason === 'poor' ? 'noMoney' : 'max'))
        }
        draw()
      })
    })
    ui.querySelectorAll<HTMLElement>('[data-gadget]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.gadget as GadgetId
        const purchase = buyGadget(save.data.money, save.data.gadgets, id)
        if (purchase.ok) {
          save.update({ money: purchase.money, gadgets: { ...save.data.gadgets } })
          audio.coin()
        } else {
          toast(i18n.t(purchase.reason === 'poor' ? 'noMoney' : 'max'))
        }
        draw()
      })
    })
    $('#shop-next')?.addEventListener('click', () => {
      if (returnTo === 'museum') showMuseum()
      else start(save.data.level)
    })
    $('#shop-home')?.addEventListener('click', showTitle)
  }

  // ---------- flow ----------
  const showLevelIntro = () => {
    const card = document.createElement('div')
    card.className = 'level-intro'
    card.innerHTML = `<b>${i18n.t('level', { n: game.level })}</b><span>${i18n.t('introSubtitle')}</span>`
    ui.append(card)
    requestAnimationFrame(() => card.classList.add('show'))
    setTimeout(() => {
      card.classList.remove('show')
      setTimeout(() => card.remove(), 550)
    }, 2300)
  }

  let starting = false
  const start = async (level: number) => {
    if (starting) return
    // A night never begins while specimens from the previous night are still on the lab table.
    if (pendingCount() > 0) {
      showMuseum()
      toast(i18n.t('studyFirst'))
      return
    }
    starting = true
    audio.unlock()
    ui.innerHTML = `<div class="screen"><div class="panel"><h1 class="title">${i18n.t('title')}</h1><p class="subtitle">${i18n.t('loading')}</p><div class="progress"><i style="width:70%;animation:pulse 1s infinite alternate"></i></div></div></div>`
    try {
      await game.start(level)
      buildHud()
      showLevelIntro()
    } catch (error) {
      console.error(error)
      refs = null
      ui.innerHTML = `<div class="screen"><div class="panel"><h2>${i18n.t('loadFailed')}</h2><button class="btn" id="retry">${i18n.t('restart')}</button></div></div>`
      $('#retry')?.addEventListener('click', () => start(level))
    } finally {
      starting = false
    }
  }

  // One delegated listener survives every screen re-render.
  ui.addEventListener('click', event => {
    const source = event.target as Element | null
    const examAction = source?.closest<HTMLElement>('[data-exam-action]')
    if (examAction?.dataset.examAction) { advanceExam(examAction.dataset.examAction); return }
    if (source?.closest('[data-bone-info-close]')) {
      // Only close when the backdrop or the close button is the actual target of a bone card.
      if (boneInfo !== null) { boneInfo = null; renderMuseum() }
      return
    }
    if (source?.closest('[data-exam-close]')) { closeExam(); return }
    const examine = source?.closest<HTMLElement>('[data-examine]')
    if (examine?.dataset.examine) {
      const [kind, ...rest] = examine.dataset.examine.split(':')
      const specimen = rest.join(':')
      if ((kind === 'bone' || kind === 'fossil') && specimen) {
        boneInfo = null
        exam = { kind, id: specimen, stage: 0 }
        renderMuseum()
      }
      return
    }
    const boneNode = source?.closest<SVGElement>('[data-bone-info]')
    if (boneNode && boneInfo === null) {
      boneInfo = Number(boneNode.dataset.boneInfo)
      if (Number.isFinite(boneInfo)) renderMuseum()
      else boneInfo = null
      return
    }
    const target = source?.closest<HTMLElement>('button, [data-nav]')
    if (!target) return
    const id = target.id
    if (id === 'play' || id === 'cont') start(save.data.level)
    else if (id === 'museum') showMuseum()
    else if (id === 'museum-menu') showTitle()
    else if (id === 'museum-shop') showShop('museum')
    else if (id === 'museum-next') {
      if (save.data.completed) showFinale()
      else if (pendingCount() === 0) start(save.data.level)
      else toast(i18n.t('studyFirst'))
    }
    else if (id === 'new-campaign') {
      if (window.confirm(i18n.t('newCampaignConfirm'))) {
        save.update({ level: 1, bones: [], fossils: {}, studiedBones: [], studiedFossils: {}, book: [], completed: false, started: false })
        museumBanner = null
        showTitle()
      }
    }
    else if (id === 'settings') showSettings()
    else if (id === 'shop') showShop()
    else if (id === 'pause') { game.togglePause(); if (game.mode === 'paused') showPause() }
    else if (id === 'resume') resume()
    else if (id === 'quit' || id === 'home') showTitle()
    else if (id === 'again') {
      if (game.result?.phase === 'won') showMuseum()
      else start(game.result?.level ?? save.data.level)
    }
    else if (id === 'save-settings') {
      const locale = ($('#lang') as HTMLSelectElement).value as 'en' | 'ar'
      const quality = ($('#quality') as HTMLSelectElement).value as SaveData['quality']
      const difficulty = ($('#diff') as HTMLSelectElement).value as SaveData['difficulty']
      const musicVolume = Number(($('#music') as HTMLInputElement).value)
      const sfxVolume = Number(($('#sfx') as HTMLInputElement).value)
      const muted = ($('#muted') as HTMLInputElement).checked
      const reducedMotion = ($('#motion') as HTMLInputElement).checked
      const minimap = ($('#minimap-toggle') as HTMLInputElement).checked
      const glow = ($('#glow-toggle') as HTMLInputElement).checked
      save.update({ locale, quality, difficulty, musicVolume, sfxVolume, muted, reducedMotion, minimap, glow })
      i18n.set(locale)
      renderer.applyQuality(quality)
      applyAudio()
      game.setQuality(quality)
      game.setReducedMotion(reducedMotion)
      game.setGlow(glow)
      showTitle()
    }
  })

  // Esc while paused resumes even though the simulation is frozen.
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && game.mode === 'paused') resume()
  })

  showTitle()
  if (import.meta.env.DEV) {
    ;(window as Window & { __midnight?: unknown }).__midnight = { game, save, input, i18n, renderer, start, showTitle, showShop, showSettings }
  }
  const loop = new GameLoop({
    beforeFrame: () => input.update(),
    step: dt => game.step(dt),
    render: (_alpha, dt) => {
      if (game.mode === 'playing') updateHud()
      else if (game.mode === 'paused') showPause()
      game.render(1, dt)
    },
  })
  loop.start()
}

boot().catch(error => {
  console.error(error)
  const ui = document.querySelector('#ui')
  if (ui) ui.innerHTML = `<div class="screen"><div class="panel">Failed to start: ${esc(String(error))}</div></div>`
})
