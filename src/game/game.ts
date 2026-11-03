import { Assets } from '../engine/assets'
import { Input } from '../engine/input'
import { Audio } from '../engine/audio'
import { Renderer } from '../engine/renderer'
import { CONFIG, type Difficulty } from './config'
import { buildLevel, type Layout } from './levels'
import { Models } from './models'
import { NoiseBus } from './noise'
import { Player } from './player'
import { Guard, type GuardEvent } from './guard'
import { GameCamera } from './camera'
import { Security } from './security'
import { Particles } from './fx'
import { World } from './world'
import { bagCapacity, movementNoise, slotsOf, valueOf, guardSpeedMul, hearingMul, radarTier, type Gadgets, type Upgrades } from './rules'
import type { FossilId } from './collection'
import type { SaveData } from '../engine/save'

export type GameMode = 'title' | 'playing' | 'paused' | 'ended'
export type RunResult = { phase: 'won' | 'lost'; loot: number; possible: number; secondsLeft: number; ghost: boolean; level: number; bone: number; fossils: FossilId[] }
export type GameHooks = { event?: (name: string, data?: unknown) => void }

export class Game {
  readonly camera = new GameCamera()
  readonly noise = new NoiseBus()
  readonly models = new Models()
  readonly assets = new Assets()
  readonly particles = new Particles()
  mode: GameMode = 'title'
  level = 1
  difficulty: Difficulty = 'normal'
  money = 0
  upgrades!: Upgrades
  gadgets!: Gadgets
  selectedGadget: keyof Gadgets = 'coin'
  layout!: Layout
  world!: World
  player!: Player
  guards: Guard[] = []
  security!: Security
  timeLeft = 0
  noiseLevel = 0
  /** Seconds of active radar reveal, and seconds until it can be used again. */
  radarTimer = 0
  radarCooldown = 0
  bagValue = 0
  bagSlots = 0
  interaction = 0
  interactionLabel = ''
  /** The mandatory dinosaur bone for this level. */
  boneTaken = false
  bonePart = 0
  result?: RunResult
  private takenFossils: FossilId[] = []
  private needBoneNotice = 0
  private layoutModelsLoaded = false
  private hooks: GameHooks
  private readonly renderer: Renderer
  private readonly input: Input
  private readonly audio: Audio
  private hidden = false
  private smoke: Array<{ x:number; z:number; r:number; ttl:number }> = []
  private runGhost = true
  private hiddenMoveTime = 0
  private glow = true

  constructor(renderer: Renderer, input: Input, audio: Audio, private readonly getSave: () => SaveData, hooks: GameHooks = {}) {
    this.renderer = renderer; this.input = input; this.audio = audio; this.hooks = hooks
    this.syncSave()
  }
  /** Pull the latest shop/settings values from the save before a level starts. */
  private syncSave(): void {
    const save = this.getSave()
    this.level = save.level
    this.money = save.money
    this.upgrades = structuredClone(save.upgrades)
    this.gadgets = structuredClone(save.gadgets)
    this.selectedGadget = save.selectedGadget
    this.difficulty = save.difficulty
    this.glow = save.glow !== false
    this.particles.density = save.reducedMotion ? 0.25 : 1
  }
  async load(): Promise<void> {
    if (this.layoutModelsLoaded) return
    await this.models.load(this.assets); this.layoutModelsLoaded = true
  }
  async start(level = this.level): Promise<void> {
    await this.load()
    this.syncSave()
    this.level = level; this.result = undefined; this.layout = buildLevel(level); this.security = new Security(this.layout)
    this.world?.dispose(); this.world = new World(this.layout, this.models, this.renderer.quality, this.renderer.shadowMapSize)
    this.world.setGlow(this.glow)
    this.world.scene.add(this.particles.group)
    this.player = new Player(this.models, { step: (kind,x,z) => this.emitStep(kind,x,z) })
    this.player.reset(this.layout.start.x, this.layout.start.z, this.upgrades)
    this.world.root.add(this.player.root)
    this.guards = this.layout.guards.map((d,i) => new Guard(i,d,this.models,(g,e) => this.guardEvent(g,e),g => this.noise.emit(g.pos.x,g.pos.z,0.35,'player',false)))
    for (const g of this.guards) { this.world.root.add(g.char.root, g.cone.mesh); }
    this.timeLeft = this.layout.dawnSeconds; this.noiseLevel = 0; this.bagValue = 0; this.bagSlots = 0; this.interaction = 0; this.hidden = false; this.runGhost = true; this.mode = 'playing'
    this.radarTimer = 0; this.radarCooldown = 0
    this.boneTaken = false; this.bonePart = this.layout.bone.part; this.takenFossils = []; this.needBoneNotice = 0
    this.hooks.event?.('started', { level })
  }
  pause(): void { if (this.mode === 'playing') this.mode = 'paused' }
  resume(): void { if (this.mode === 'paused') this.mode = 'playing' }
  togglePause(): void { if (this.mode === 'playing') this.pause(); else if (this.mode === 'paused') this.resume() }
  setQuality(q: 'low'|'medium'|'high'): void { this.renderer.applyQuality(q); this.world?.setQuality(q, this.renderer.shadowMapSize) }
  setReducedMotion(v: boolean): void { this.particles.density = v ? 0.25 : 1 }
  setGlow(v: boolean): void { this.glow = v; this.world?.setGlow(v) }
  private emitStep(kind: 'still'|'sneak'|'walk'|'sprint', x:number,z:number): void {
    const radius = movementNoise(kind, this.layout.grid.surfaceAt(x,z), this.upgrades)
    if (!this.hidden && radius > 0) { this.noise.emit(x,z,radius,'player',true); this.noiseLevel = Math.min(1, Math.max(this.noiseLevel, radius / CONFIG.noise.sprint)); this.particles.dust(x,z); this.audio.step(kind) }
  }
  private guardEvent(_g: Guard, e: GuardEvent): void {
    if (e === 'suspicious') this.audio.alert('question')
    if (e === 'chase' || e === 'caught' || e === 'found') { this.audio.alert('exclamation'); this.runGhost = false }
    if (e === 'caught') this.capture()
  }
  private capture(): void {
    if (this.mode !== 'playing') return
    this.player.setCaught(); this.mode = 'ended'; this.result = { phase:'lost', loot:0, possible:this.layout.totalValue, secondsLeft:this.timeLeft, ghost:false, level:this.level, bone:-1, fossils:[] }; this.audio.caught(); this.hooks.event?.('lost', this.result)
  }
  private nearestArtifact(): { id:number; d:number } | undefined {
    let out: {id:number;d:number}|undefined
    for (const a of this.layout.artifacts) if (!this.world.artifacts.get(a.id)?.taken) { const d=Math.hypot(a.x-this.player.pos.x,a.z-this.player.pos.z); if (d < 1.35 && (!out || d<out.d)) out={id:a.id,d} }
    return out
  }
  private atBone(): boolean {
    if (this.boneTaken || this.world.boneVis.taken) return false
    const b = this.layout.bone
    return Math.hypot(b.x - this.player.pos.x, b.z - this.player.pos.z) < 1.35
  }
  private takeBone(): void {
    if (this.boneTaken) return
    const b = this.layout.bone
    this.boneTaken = true
    this.world.takeBone()
    this.noise.emit(b.x, b.z, CONFIG.noise.steal, 'steal', false)
    this.particles.sparkle(b.x, 1.5, b.z, 0xffd24a)
    this.audio.coin()
    this.hooks.event?.('bone', b)
  }
  private nearestHide(): { x:number; z:number; id:number; d:number } | undefined {
    let out: {x:number;z:number;id:number;d:number}|undefined
    for (const h of this.layout.hides) { const d=Math.hypot(h.x-this.player.pos.x,h.z-this.player.pos.z); if (d<1.5 && (!out||d<out.d)) out={x:h.x,z:h.z,id:h.id,d} }
    return out
  }
  private interact(dt:number, intent: { mx:number; mz:number }): void {
    if (this.hidden) {
      this.interactionLabel='leaveHide'
      if (this.input.consume('interact')) { this.player.leaveHide(this.layout.grid); this.hidden=false; this.interactionLabel=''; this.hiddenMoveTime = 0; return }
      if (Math.hypot(intent.mx, intent.mz) > 0.08) this.hiddenMoveTime += dt; else this.hiddenMoveTime = 0
      if (this.hiddenMoveTime >= 0.3) { this.player.leaveHide(this.layout.grid); this.hidden=false; this.interactionLabel=''; this.hiddenMoveTime = 0 }
      return
    }
    const boneNear = this.atBone()
    if (boneNear) {
      this.interactionLabel = 'takeBone'
      if (this.input.held('interact')) {
        this.interaction += dt / 1.4
        this.player.working = true
        if (this.interaction >= 1) { this.takeBone(); this.interaction = 0; this.player.working = false }
      } else this.interaction = 0
      return
    }
    const hide = this.nearestHide(); const art = this.nearestArtifact();
    if (hide && !art) { this.interactionLabel='hide'; if (this.input.held('interact') && this.player.hideCooldown <= 0) { const blocked = this.guards.some(g => g.state === 'chase' && this.layout.grid.los(g.pos.x,g.pos.z,this.player.pos.x,this.player.pos.z)); if (blocked) { this.interaction=0; this.hooks.event?.('message','guardWatching') } else { this.interaction += dt / 0.4; if(this.interaction>=1){ this.player.enterHide(this.layout.hides.find(h=>h.id===hide.id)!); this.hidden=true; this.input.consume('interact'); this.interaction=0; this.hiddenMoveTime=0 } } } else this.interaction=0; return }
    if (art) { const def=this.layout.artifacts[art.id]; this.interactionLabel='steal'; const dur=def.tier==='legendary'?CONFIG.loot.legendaryPickDuration:def.tier==='rare'?CONFIG.loot.commonSteal*1.4:CONFIG.loot.commonSteal; if(this.input.held('interact')){this.interaction+=dt/dur;this.player.working=true;if(this.interaction>=1){this.collect(def.id);this.interaction=0}} else {this.interaction=0;this.player.working=false} return }
    this.interaction=0; this.interactionLabel=''
  }
  private collect(id:number): void { const a=this.layout.artifacts[id]; if(this.bagSlots+slotsOf(a.tier)>bagCapacity(this.upgrades)) return; this.bagSlots+=slotsOf(a.tier); this.bagValue+=valueOf(a.tier,this.level); this.takenFossils.push(a.fossil); this.world.takeArtifact(id); this.noise.emit(a.x,a.z,CONFIG.noise.steal,'steal',false); this.particles.sparkle(a.x,1.5,a.z,0xffd24a); this.audio.coin(); this.hooks.event?.('loot',a) }
  private useGadget(): void { const kind=this.selectedGadget; if(this.gadgets[kind]<=0){this.hooks.event?.('message','outOfStock');this.audio.noise('alarm');return} this.gadgets[kind]-=1; const x=this.player.pos.x+Math.sin(this.player.yaw)*2.5, z=this.player.pos.z+Math.cos(this.player.yaw)*2.5; if(kind==='smoke'){this.smoke.push({x:this.player.pos.x,z:this.player.pos.z,r:CONFIG.gadgets.smokeRadius,ttl:CONFIG.gadgets.smokeDuration});this.particles.smoke(this.player.pos.x,this.player.pos.z,CONFIG.gadgets.smokeRadius)} else this.noise.emit(x,z,kind==='coin'?CONFIG.noise.coin:CONFIG.noise.noiseMaker,kind==='coin'?'coin':'maker',false); this.audio.noise(kind==='smoke'?'maker':kind==='coin'?'coin':'maker'); this.runGhost=false }
  leaveHiding(): void { if (this.player?.hidden) { this.player.leaveHide(this.layout.grid); this.hidden = false } }
  step(dt:number): void {
    if(this.mode!=='playing') return
    // Events belong to this fixed step: clear the previous step before the player emits new sound,
    // then hand the fresh list to every guard below.
    this.noise.clear()
    this.timeLeft=Math.max(0,this.timeLeft-dt); if(this.timeLeft<=0){this.mode='ended';this.result={phase:'lost',loot:0,possible:this.layout.totalValue,secondsLeft:0,ghost:false,level:this.level,bone:-1,fossils:[]};this.hooks.event?.('lost',this.result);return}
    if(this.input.consume('pause')) {this.pause();return}
    if(this.input.consume('tool')) this.useGadget()
    this.radarTimer=Math.max(0,this.radarTimer-dt); this.radarCooldown=Math.max(0,this.radarCooldown-dt)
    if(this.input.consume('radar')) { const tier=radarTier(this.upgrades); if(tier.reveal>0&&this.radarCooldown<=0){this.radarTimer=tier.reveal;this.radarCooldown=tier.cooldown;this.audio.noise('lock')} else if(tier.reveal<=0) this.hooks.event?.('message','radarLocked') }
    const ids=['coin','smoke','noise'] as const
    if(this.input.consume('gadget1')) this.selectedGadget=ids[0]
    if(this.input.consume('gadget2')) this.selectedGadget=ids[1]
    if(this.input.consume('gadget3')) this.selectedGadget=ids[2]
    if(this.input.consume('cycle')) this.selectedGadget=ids[(ids.indexOf(this.selectedGadget)+1)%3]
    const intent={mx:this.input.move.x,mz:-this.input.move.y,sneak:this.input.held('sneak')||this.input.touchMagnitude<0.55&&this.input.touchMagnitude>0,sprint:this.input.held('sprint')}
    this.player.update(dt,intent,this.layout.grid,this.upgrades,this.bagSlots,bagCapacity(this.upgrades),false)
    const atExit = Math.abs(this.player.pos.x-this.layout.exit.x)<this.layout.exit.w/2&&this.player.pos.z>this.layout.exit.z-0.8
    if (atExit) {
      if (!this.boneTaken) {
        // The bone is mandatory: the exit stays sealed until it is in the bag.
        this.interactionLabel = 'needBone'
        this.interaction = 0
        this.needBoneNotice = Math.max(0, this.needBoneNotice - dt)
        if (this.input.held('interact') && this.needBoneNotice <= 0) {
          this.needBoneNotice = 2.5
          this.hooks.event?.('message', 'needBone')
        }
      } else {
        // The exit hold must own `interaction`: interact() clears it every step otherwise.
        this.interactionLabel = 'exit'
        if (this.input.held('interact')) {
          this.interaction += dt/CONFIG.run.exitHold
          if (this.interaction>=1) { this.mode='ended'; this.result={phase:'won',loot:this.bagValue,possible:this.layout.totalValue,secondsLeft:this.timeLeft,ghost:this.runGhost,level:this.level,bone:this.layout.bone.part,fossils:[...this.takenFossils]}; this.hooks.event?.('won',this.result) }
        } else this.interaction=0
      }
    } else {
      this.needBoneNotice = 0
      this.interact(dt, intent)
    }
    for(const k of this.layout.keycards){const c=this.world.keycardVis.get(k.key);if(c?.visible&&Math.hypot(k.x-this.player.pos.x,k.z-this.player.pos.z)<0.8){this.world.takeKeycard(k.key);this.world.setLockedDoorOpen(k.key);for(const d of this.layout.doors)if(d.key===k.key)d.key=0}}
    for(const s of this.smoke)s.ttl-=dt;this.smoke=this.smoke.filter(s=>s.ttl>0)
    this.noiseLevel*=Math.exp(-CONFIG.noise.ringSmooth*dt);this.security.update(dt)
    const senses={grid:this.layout.grid,player:this.player.pos,playerHidden:this.player.hidden,playerHideSpot:this.player.hideSpot,playerNoisy:this.noiseLevel>0.1,events:this.noise.events,smoke:this.smoke,dawnAlert:this.timeLeft<this.layout.dawnSeconds*0.25,hides:this.layout.hides,level:this.level,difficulty:this.difficulty,speedMul:guardSpeedMul(this.level,this.difficulty),hearMul:hearingMul(this.level,this.difficulty),time:this.security.t}
    for(const g of this.guards)g.update(dt,senses)
    if(this.security.laserDanger(this.player.pos)||this.security.cameraSees(this.player.pos,this.layout.grid)){this.runGhost=false}
    this.audio.setThreat(Math.max(...this.guards.map(g=>g.threat),0))
    if (this.hidden) {
      const nearest = Math.min(...this.guards.map(g => Math.hypot(g.pos.x-this.player.pos.x, g.pos.z-this.player.pos.z)))
      if (nearest < 7) this.audio.heartbeat(Math.max(0, 1 - nearest / 7))
    }
    this.particles.update(dt)
  }
  render(_alpha=1,dt=1/60): void { if(!this.world)return; this.camera.update(dt,this.player?.pos??this.layout.start,this.input);this.world.update(dt,this.player.pos,this.camera.camera.position,[{x:this.player.pos.x,z:this.player.pos.z,h:1.7},...this.guards.map(g=>({x:g.pos.x,z:g.pos.z,h:1.85}))],this.layout.lasers.map((_,i)=>this.security.laserOn(i)));this.renderer.render(this.world.scene,this.camera.camera) }
  hud(): Record<string,unknown> { return {mode:this.mode,level:this.level,money:this.money,loot:this.bagValue,slots:this.bagSlots,capacity:bagCapacity(this.upgrades),noise:this.noiseLevel,time:this.timeLeft,stamina:this.player?.stamina??0,gadget:this.selectedGadget,gadgets:this.gadgets,hidden:this.player?.hidden??false,interaction:this.interaction,interactionLabel:this.interactionLabel,result:this.result,radarTimer:this.radarTimer,radarCooldown:this.radarCooldown,radarUnlocked:radarTier(this.upgrades).reveal>0,boneTaken:this.boneTaken,bonePart:this.layout?.bone.part??0,fossils:[...this.takenFossils]} }
}
