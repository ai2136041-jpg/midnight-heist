import * as THREE from 'three'
import { createSkeletonModel } from './boneModel'

export function mountSkeletonViewer(canvas: HTMLCanvasElement): void {
  const w = canvas.width || 600
  const h = canvas.height || 300
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h, false)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100)
  camera.position.set(0, 0.6, 3.2)
  camera.lookAt(0, 0.1, 0)

  const hemi = new THREE.HemisphereLight(0xfff0d6, 0x1a2040, 0.9)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff0d6, 1.1)
  key.position.set(2, 3, 2)
  key.castShadow = true
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x6fd0ff, 0.45)
  rim.position.set(-2, 1, -2)
  scene.add(rim)

  const model = createSkeletonModel()
  scene.add(model)

  const frames: string[] = []
  const total = 12
  for (let i = 0; i < total; i++) {
    model.rotation.y = (i / total) * Math.PI * 2
    renderer.render(scene, camera)
    frames.push(renderer.domElement.toDataURL('image/png'))
  }
  const img = document.createElement('img')
  img.src = frames[0]
  img.width = w
  img.height = h
  img.className = canvas.className
  img.style.borderRadius = '12px'
  img.dataset.boneFrames = JSON.stringify(frames)
  if (canvas.parentNode) canvas.parentNode.replaceChild(img, canvas)

  let idx = 0
  const iv = setInterval(() => {
    idx = (idx + 1) % total
    img.src = frames[idx]
  }, 120)
  ;(img as any).__iv = iv

  renderer.dispose()
}

export function disposeAllSkeletonViewers(): void {
  document.querySelectorAll('img[data-bone-frames]').forEach(img => {
    const iv = (img as any).__iv
    if (iv) clearInterval(iv)
  })
}