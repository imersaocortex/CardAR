import * as THREE from "three"
import type { SceneHit } from "./scene-interactions"

// A bounded, short-lived effect in world space. It never changes object scale,
// visibility, media playback or the URL associated with the object.
export function createClickParticles(scene: THREE.Scene) {
  const active: { points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>; velocity: Float32Array; age: number; size: number }[] = []
  const remove = (burst: typeof active[number]) => {
    scene.remove(burst.points)
    burst.points.geometry.dispose()
    burst.points.material.dispose()
  }
  return {
    burst(hit: SceneHit) {
      if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
      if (active.length >= 3) remove(active.shift()!)
      const size = Math.max(0.03, Math.min(new THREE.Box3().setFromObject(hit.group).getSize(new THREE.Vector3()).length() * 0.3, 4))
      const count = 64
      const positions = new Float32Array(count * 3)
      const velocity = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)
      for (let index = 0; index < count; index++) {
        const angle = index * 2.399963
        const speed = size * (0.5 + Math.random())
        velocity.set([Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.5) * speed], index * 3)
        new THREE.Color(index % 3 === 0 ? "#ffffff" : index % 2 ? "#22d3ee" : "#a78bfa").toArray(colors, index * 3)
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: size * 0.045, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }))
      points.position.copy(hit.point)
      points.frustumCulled = false
      points.renderOrder = 10
      scene.add(points)
      active.push({ points, velocity, age: 0, size })
    },
    update(delta: number) {
      for (let index = active.length - 1; index >= 0; index--) {
        const burst = active[index]
        burst.age += delta
        if (burst.age >= 0.8) { remove(burst); active.splice(index, 1); continue }
        const position = burst.points.geometry.getAttribute("position") as THREE.BufferAttribute
        for (let p = 0; p < position.count; p++) position.setXYZ(p,
          burst.velocity[p * 3] * burst.age,
          burst.velocity[p * 3 + 1] * burst.age - burst.size * burst.age ** 2 * 0.3,
          burst.velocity[p * 3 + 2] * burst.age,
        )
        position.needsUpdate = true
        burst.points.material.opacity = 1 - burst.age / 0.8
      }
    },
    dispose() { active.forEach(remove); active.length = 0 },
  }
}
