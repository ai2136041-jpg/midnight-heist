import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Assets } from '../engine/assets'

const urls = import.meta.glob('../../assets/models/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const url = (name: string) => urls[`../../assets/models/${name}.glb`]

export type ModelName = 'thief' | 'guard' | 'common' | 'rare' | 'legendary' | 'statue' | 'locker' | 'urn'
const FILES: Record<ModelName, string> = {
  thief: 'thief_anim', guard: 'guard_anim', common: 'artifact_common', rare: 'artifact_rare',
  legendary: 'artifact_legendary', statue: 'statue', locker: 'locker', urn: 'urn',
}
/** Target heights in world units (1 tile = 1 unit). */
export const MODEL_HEIGHT: Record<ModelName, number> = {
  thief: 1.7, guard: 1.85, common: 0.55, rare: 0.55, legendary: 0.6, statue: 1.9, locker: 1.9, urn: 1.15,
}

export class Models {
  private gltf = new Map<ModelName, GLTF>()
  failed = new Set<ModelName>()

  async load(assets: Assets): Promise<void> {
    await Promise.all((Object.keys(FILES) as ModelName[]).map(async name => {
      try {
        const u = url(FILES[name])
        if (!u) throw new Error('missing url')
        this.gltf.set(name, await assets.gltf(u))
      } catch (e) {
        console.warn(`model ${name} unavailable, using primitive fallback`, e)
        this.failed.add(name)
      }
    }))
  }

  has(name: ModelName): boolean {
    return this.gltf.has(name)
  }

  clips(name: ModelName): THREE.AnimationClip[] {
    return this.gltf.get(name)?.animations ?? []
  }

  /** A fresh instance scaled to its target height, feet on y=0 and centred on x/z. Undefined when unavailable. */
  instance(name: ModelName, heightScale = 1): THREE.Group | undefined {
    const g = this.gltf.get(name)
    if (!g) return undefined
    const inner = cloneSkinned(g.scene) as THREE.Object3D
    inner.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(inner)
    const size = box.getSize(new THREE.Vector3())
    const target = MODEL_HEIGHT[name] * heightScale
    const s = size.y > 1e-4 ? target / size.y : 1
    const centre = box.getCenter(new THREE.Vector3())
    const wrapper = new THREE.Group()
    inner.scale.multiplyScalar(s)
    inner.position.set(-centre.x * s, -box.min.y * s, -centre.z * s)
    wrapper.add(inner)
    inner.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mesh.material = mats.map(m => {
        const c = (m as THREE.MeshStandardMaterial).clone()
        if ('metalness' in c) {
          c.metalness = Math.min(c.metalness ?? 0, 0.25)
          c.roughness = Math.max(c.roughness ?? 0.8, 0.7)
        }
        return c
      })
      if (!Array.isArray(mesh.material)) return
      if (mesh.material.length === 1) mesh.material = mesh.material[0]
    })
    wrapper.userData.height = target
    return wrapper
  }
}
