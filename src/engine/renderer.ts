/**
 * WebGL renderer wrapper: one canvas, quality presets, automatic resize.
 * Quality only changes resolution and shadows; the scene itself owns its lights.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { Quality } from './save'

const PIXEL_RATIO: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 }
const SHADOW_MAP_SIZE: Record<Quality, number> = { low: 512, medium: 1024, high: 2048 }

/** Rough device guess used until the player picks a preset themselves. */
export function suggestQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(nav.userAgent)
  if (mobile || cores <= 2 || memory <= 2) return 'low'
  if (cores <= 4 || memory <= 4) return 'medium'
  return 'high'
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly canvas: HTMLCanvasElement
  quality: Quality
  /** Shadow map resolution for the current preset (also used as texture anisotropy cap). */
  shadowMapSize: number

  private pixelRatio = 1
  private composer?: EffectComposer
  private composerScene?: THREE.Scene
  private composerCamera?: THREE.Camera
  private readonly resizeObserver?: ResizeObserver
  private readonly onContextLost = (event: Event) => {
    event.preventDefault()
    console.warn('WebGL context lost; waiting for restore')
  }
  private readonly onContextRestored = () => {
    this.applyQuality(this.quality)
  }

  constructor(canvas: HTMLCanvasElement, quality: Quality = 'high') {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.16
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.autoClear = true
    this.quality = quality
    this.shadowMapSize = SHADOW_MAP_SIZE[quality]

    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(canvas)
    }
    window.addEventListener('resize', this.resize)
    this.applyQuality(quality)
    this.resize()
  }

  applyQuality(quality: Quality): void {
    this.quality = quality
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[quality])
    this.shadowMapSize = SHADOW_MAP_SIZE[quality]
    this.renderer.shadowMap.enabled = quality !== 'low'
    this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    if (quality !== 'high') this.disposeComposer()
    this.resize()
  }

  resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(width, height, false)
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio)
      this.composer.setSize(width, height)
    }
  }

  /** Soft bloom on the High preset: lamps, loot halos and lasers get a real glow. */
  private ensureComposer(scene: THREE.Scene, camera: THREE.Camera): EffectComposer {
    if (this.composer && this.composerScene === scene && this.composerCamera === camera) return this.composer
    this.disposeComposer()
    const composer = new EffectComposer(this.renderer)
    composer.setPixelRatio(this.pixelRatio)
    composer.addPass(new RenderPass(scene, camera))
    const size = this.renderer.getSize(new THREE.Vector2())
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.55, 0.78))
    this.composer = composer
    this.composerScene = scene
    this.composerCamera = camera
    this.resize()
    return composer
  }

  private disposeComposer(): void {
    if (!this.composer) return
    for (const pass of this.composer.passes) (pass as unknown as { dispose?: () => void }).dispose?.()
    this.composer.dispose()
    this.composer = undefined
    this.composerScene = undefined
    this.composerCamera = undefined
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (camera instanceof THREE.PerspectiveCamera) {
      const width = this.canvas.clientWidth || 1
      const height = this.canvas.clientHeight || 1
      const aspect = width / height
      if (Math.abs(camera.aspect - aspect) > 1e-4) {
        camera.aspect = aspect
        camera.updateProjectionMatrix()
      }
    }
    this.draw(scene, camera)
  }

  private draw(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.quality === 'high') this.ensureComposer(scene, camera).render()
    else this.renderer.render(scene, camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.resizeObserver?.disconnect()
    this.disposeComposer()
    this.renderer.dispose()
  }
}
