import type { Layout } from './levels'
import type { Grid, Vec2 } from './grid'
import { CONFIG } from './config'

export class Security {
  private time = 0
  constructor(readonly layout: Layout) {}
  update(dt: number): void { this.time += dt }
  laserOn(index: number): boolean {
    const l = this.layout.lasers[index]
    if (!l) return false
    return ((this.time + l.offset) % l.period) < l.onTime
  }
  laserDanger(pos: Vec2): boolean {
    return this.layout.lasers.some((l, i) => this.laserOn(i) && distanceToSegment(pos.x, pos.z, l.x1, l.z1, l.x2, l.z2) < 0.34)
  }
  cameraSees(pos: Vec2, grid: Grid): boolean {
    return this.layout.cameras.some(c => {
      const dx = pos.x - c.x; const dz = pos.z - c.z
      const d = Math.hypot(dx, dz)
      const yaw = c.yaw + Math.sin(this.time / CONFIG.security.cameraPeriod + c.phase) * c.sweep
      let a = Math.atan2(dx, dz) - yaw
      while (a > Math.PI) a -= Math.PI * 2
      while (a < -Math.PI) a += Math.PI * 2
      return d < CONFIG.security.cameraRange && Math.abs(a) < CONFIG.security.cameraHalfAngle && grid.los(c.x, c.z, pos.x, pos.z)
    })
  }
  get t(): number { return this.time }
}
function distanceToSegment(px:number,pz:number,x1:number,z1:number,x2:number,z2:number):number {
  const dx=x2-x1,dz=z2-z1; const q=dx*dx+dz*dz; const u=q?Math.max(0,Math.min(1,((px-x1)*dx+(pz-z1)*dz)/q)):0
  return Math.hypot(px-(x1+u*dx),pz-(z1+u*dz))
}
