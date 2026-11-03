import * as THREE from 'three'
import { CONFIG } from './config'
import type { Input } from '../engine/input'

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera
  private zoom = 1
  private shake = 0
  private shakeTime = 0
  private last = new THREE.Vector3()
  constructor() {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 100)
    this.camera.rotation.order = 'YXZ'
  }
  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix() }
  bump(amount = 0.25): void { this.shake = Math.max(this.shake, amount); this.shakeTime = 0 }
  update(dt: number, focus: { x: number; z: number }, input?: Input): void {
    if (input) this.zoom = Math.max(CONFIG.camera.minZoom, Math.min(CONFIG.camera.maxZoom, this.zoom + input.takeZoom() * 0.08))
    const dist = CONFIG.camera.distance * this.zoom
    const tilt = THREE.MathUtils.degToRad(CONFIG.camera.tilt)
    const ahead = { x: 0, z: CONFIG.camera.lookAhead }
    const target = new THREE.Vector3(focus.x + ahead.x, 0, focus.z + ahead.z)
    const desired = new THREE.Vector3(focus.x, dist * Math.sin(tilt), focus.z + dist * Math.cos(tilt))
    desired.y = Math.max(8, desired.y)
    this.last.lerp(desired, 1 - Math.exp(-CONFIG.camera.follow * dt))
    if (this.shake > 0) {
      this.shakeTime += dt
      const fall = Math.exp(-this.shakeTime * 8)
      this.last.x += Math.sin(this.shakeTime * 55) * this.shake * fall
      this.last.z += Math.cos(this.shakeTime * 47) * this.shake * fall
      this.last.y += Math.sin(this.shakeTime * 63) * this.shake * 0.4 * fall
      this.shake *= Math.exp(-dt * 3)
    }
    this.camera.position.copy(this.last)
    this.camera.lookAt(target)
  }
}
