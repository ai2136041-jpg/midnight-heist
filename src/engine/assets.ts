/**
 * Cached asset loading. Every URL is fetched once; callers share the same promise.
 * Models keep their own scale/placement logic, so this layer only loads and caches.
 */
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type AssetProgress = { loaded: number; total: number; url: string }

export class Assets {
  private readonly gltfLoader = new GLTFLoader()
  private readonly textureLoader = new THREE.TextureLoader()
  private readonly gltfs = new Map<string, Promise<GLTF>>()
  private readonly textures = new Map<string, Promise<THREE.Texture>>()
  private pending = 0
  private finished = 0
  onProgress?: (progress: AssetProgress) => void

  gltf(url: string): Promise<GLTF> {
    const cached = this.gltfs.get(url)
    if (cached) return cached
    const promise = this.track(url, new Promise<GLTF>((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, error => reject(error instanceof Error ? error : new Error(`Failed to load ${url}`)))
    }))
    this.gltfs.set(url, promise)
    return promise
  }

  texture(url: string, configure?: (texture: THREE.Texture) => void): Promise<THREE.Texture> {
    const cached = this.textures.get(url)
    if (cached) return cached
    const promise = this.track(url, new Promise<THREE.Texture>((resolve, reject) => {
      this.textureLoader.load(url, texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        configure?.(texture)
        resolve(texture)
      }, undefined, error => reject(error instanceof Error ? error : new Error(`Failed to load ${url}`)))
    }))
    this.textures.set(url, promise)
    return promise
  }

  /** Warm the cache and resolve when every asset is ready. */
  async load(sources: { gltf?: string[]; texture?: string[] }): Promise<void> {
    await Promise.all([
      ...(sources.gltf ?? []).map(url => this.gltf(url)),
      ...(sources.texture ?? []).map(url => this.texture(url)),
    ])
  }

  private track<T>(url: string, promise: Promise<T>): Promise<T> {
    this.pending += 1
    const report = () => this.onProgress?.({ loaded: this.finished, total: this.pending, url })
    report()
    return promise.then(
      value => { this.finished += 1; report(); return value },
      error => { this.finished += 1; report(); throw error },
    )
  }

  dispose(): void {
    for (const promise of this.gltfs.values()) promise.then(gltf => disposeObject(gltf.scene)).catch(() => undefined)
    for (const promise of this.textures.values()) promise.then(texture => texture.dispose()).catch(() => undefined)
    this.gltfs.clear()
    this.textures.clear()
  }
}

/** Release every geometry/material/texture under `root` exactly once. */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()
  root.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
  })
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) value.dispose()
    }
    material.dispose()
  }
}
