import * as THREE from 'three'

export function createBoneModel(part: number): THREE.Object3D {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0xf1e3c4, roughness: 0.56, metalness: 0.02, emissive: 0x3b2f16, emissiveIntensity: 0.24 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3124, roughness: 0.85 })

  const sphere = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, m = mat): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), m)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    group.add(mesh)
    return mesh
  }
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.rotation.set(0, ry, rz)
    group.add(mesh)
    return mesh
  }
  const cone = (r: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, m = mat): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), m)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    group.add(mesh)
    return mesh
  }
  const rod = (len: number, r = 0.045): THREE.Group => {
    const g = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, len, 8), mat)
    shaft.rotation.z = Math.PI / 2
    const a = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 10, 8), mat)
    a.position.x = len / 2
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 10, 8), mat)
    b.position.x = -len / 2
    g.add(shaft, a, b)
    return g
  }
  const add = (obj: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
    obj.position.set(x, y, z)
    obj.rotation.set(rx, ry, rz)
    group.add(obj)
  }

  switch (part) {
    case 0: {
      box(0.34, 0.24, 0.3, 0, 0.17, 0)
      box(0.24, 0.16, 0.26, 0.23, 0.115, 0)
      box(0.07, 0.12, 0.2, -0.19, 0.27, 0)
      for (const side of [-1, 1]) sphere(0.043, 0.075, 0.23, side * 0.14, 1, 1, 1, dark)
      for (let i = 0; i < 5; i += 1) cone(0.025, 0.11, 0.15 + i * 0.04, 0.005, 0.12, Math.PI)
      box(0.3, 0.02, 0.04, 0.04, 0.06, -0.09)
      break
    }
    case 1: {
      add(rod(0.5, 0.035), 0, 0.08, 0)
      for (const side of [-1, 1]) box(0.05, 0.2, 0.07, side * 0.23, 0.16, 0, 0, side * 0.25)
      for (let i = 0; i < 7; i += 1) cone(0.022, 0.1, -0.21 + i * 0.07, 0.15, 0)
      box(0.5, 0.03, 0.055, 0, 0.11, 0)
      break
    }
    case 2: {
      for (let row = 0; row < 2; row += 1) {
        for (let i = 0; i < 6; i += 1) {
          const x = -0.25 + i * 0.1
          cone(0.03, 0.17, x, 0.08 + row * 0.015, row === 0 ? -0.055 : 0.055, row === 0 ? 0.18 : -0.18)
        }
      }
      box(0.6, 0.03, 0.14, 0, 0.015, 0)
      break
    }
    case 3: {
      for (let i = 0; i < 4; i += 1) {
        const x = -0.24 + i * 0.16
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 10), mat)
        disc.rotation.z = Math.PI / 2
        disc.position.set(x, 0.1, 0)
        group.add(disc)
        cone(0.035, 0.1, x, 0.22, 0)
        for (const side of [-1, 1]) box(0.05, 0.03, 0.1, x, 0.1, side * 0.1)
      }
      break
    }
    case 4: {
      box(0.5, 0.035, 0.045, 0, 0.32, 0)
      for (let i = 0; i < 6; i += 1) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15 + (i % 2) * 0.02, 0.022, 6, 16, Math.PI * 1.15), mat)
        rib.rotation.y = Math.PI / 2
        rib.rotation.z = 0.34
        rib.position.set(-0.22 + i * 0.09, 0.18, 0)
        group.add(rib)
      }
      break
    }
    case 5: {
      add(rod(0.66, 0.03), 0, 0.07, 0)
      for (let i = 0; i < 8; i += 1) {
        const x = -0.31 + i * 0.088
        sphere(0.05, x, 0.09, 0)
        cone(0.026, 0.12 - Math.abs(i - 4) * 0.012, x, 0.2, 0)
      }
      break
    }
    case 6: {
      box(0.16, 0.13, 0.24, 0, 0.14, 0)
      for (const side of [-1, 1]) {
        sphere(0.13, side * 0.18, 0.18, -0.01, 0.7, 0.55, 1.25)
        const socket = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), mat)
        socket.position.set(side * 0.18, 0.1, 0.1)
        socket.rotation.x = Math.PI / 2
        group.add(socket)
      }
      cone(0.04, 0.14, 0, 0.3, -0.03)
      break
    }
    case 7: {
      for (let i = 0; i < 9; i += 1) {
        const t = i / 8
        const r = 0.062 - t * 0.038
        sphere(r, -0.33 + i * 0.085, 0.08 + Math.sin(t * Math.PI) * 0.05, Math.sin(t * 4) * 0.04)
        if (i < 7) cone(0.022, 0.08 - t * 0.04, -0.33 + i * 0.085, 0.17 + Math.sin(t * Math.PI) * 0.05, Math.sin(t * 4) * 0.04)
      }
      break
    }
    case 8: {
      add(rod(0.24, 0.038), -0.03, 0.09, 0, 0, 0, 0.4)
      add(rod(0.2, 0.032), 0.13, 0.1, 0.03, 0, 0, -0.45)
      sphere(0.055, 0.22, 0.07, 0.05)
      for (const z of [-0.06, 0, 0.06]) cone(0.02, 0.12, 0.28, 0.07, z, 0, 0, -Math.PI / 2)
      break
    }
    case 9: {
      add(rod(0.3, 0.052), -0.07, 0.11, 0, 0, 0, 0.32)
      add(rod(0.27, 0.04), 0.12, 0.13, 0.02, 0, 0, -0.42)
      box(0.24, 0.05, 0.12, 0.28, 0.035, 0.03)
      for (const z of [-0.07, 0, 0.07]) cone(0.023, 0.13, 0.4, 0.035, z, 0, 0, -Math.PI / 2)
      break
    }
  }
  group.traverse(o => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  return group
}
export function createSkeletonModel(): THREE.Group {
  const group = new THREE.Group()
  // Positions derived from the schematic 2D layout, scaled to world units.
  const scale = 0.012
  const positions: Array<{ part: number; x: number; y: number; z: number; ry: number }> = [
    { part: 0, x: 87, y: 92, z: 0, ry: 0 },      // skull
    { part: 1, x: 80, y: 113, z: 0, ry: 0 },     // jaw
    { part: 2, x: 90, y: 113, z: 0.3, ry: 0 },    // teeth
    { part: 3, x: 127, y: 82, z: 0, ry: 0 },      // neck
    { part: 4, x: 170, y: 110, z: 0, ry: 0 },     // ribs
    { part: 5, x: 170, y: 77, z: 0, ry: 0 },      // spine
    { part: 6, x: 222, y: 107, z: 0, ry: 0 },     // pelvis
    { part: 7, x: 270, y: 88, z: 0, ry: 0 },      // tail
    { part: 8, x: 140, y: 145, z: 0.6, ry: 0 },   // forelimb
    { part: 9, x: 210, y: 150, z: 0.6, ry: 0 },   // hindlimb
  ]
  for (const p of positions) {
    const bone = createBoneModel(p.part)
    bone.position.set((p.x - 160) * scale, (120 - p.y) * scale, p.z * scale)
    bone.rotation.y = p.ry
    group.add(bone)
  }
  return group
}