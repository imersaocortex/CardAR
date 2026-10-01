import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { ArSceneObject } from "@/lib/mindar"

export function disposeSpatialGroup(group: THREE.Object3D) {
  const textures = new Set<THREE.Texture>()
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value)
      }
      material.dispose()
    }
  })
  textures.forEach((texture) => texture.dispose())
}

export async function buildSpatialScene(objects: ArSceneObject[]) {
  const root = new THREE.Group()
  const media: HTMLMediaElement[] = []
  const mixers: THREE.AnimationMixer[] = []
  const animated: { group: THREE.Group; object: ArSceneObject }[] = []
  const loader = new GLTFLoader()
  const dispose = () => {
    media.forEach((element) => { element.pause(); element.removeAttribute("src"); element.load() })
    mixers.forEach((mixer) => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()) })
    disposeSpatialGroup(root)
  }
  try {
    for (const object of objects.filter((item) => item.visible)) {
      const group = new THREE.Group()
      root.add(group)
      group.position.fromArray(object.position)
      group.rotation.set(...object.rotation)
      group.scale.fromArray(object.scale)
      animated.push({ group, object })
      if (object.type.startsWith("modelo-3d") && object.assetUrl) {
        const gltf = await loader.loadAsync(object.assetUrl)
        group.add(gltf.scene)
        gltf.scene.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            material.opacity *= object.opacity
            material.transparent ||= object.opacity < 1
          }
        })
        if (object.animationType === "embedded" && gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(gltf.scene)
          mixer.clipAction(gltf.animations[0]).play()
          mixers.push(mixer)
        }
      } else if (object.type === "audio" && object.assetUrl) {
        const audio = new Audio(object.assetUrl)
        audio.loop = true
        media.push(audio)
      } else if (object.type.startsWith("botao-")) {
        const canvas = document.createElement("canvas")
        canvas.width = 512; canvas.height = 128
        const ctx = canvas.getContext("2d")!
        ctx.fillStyle = "#6d28d9"; ctx.fillRect(0, 0, 512, 128)
        ctx.fillStyle = "white"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center"
        ctx.fillText(object.name.slice(0, 30), 256, 76, 470)
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: object.opacity })))
      } else if (object.assetUrl && (object.type === "imagem" || object.type.startsWith("video-"))) {
        let texture: THREE.Texture
        if (object.type === "imagem") {
          texture = await new THREE.TextureLoader().loadAsync(object.assetUrl)
        } else {
          const video = document.createElement("video")
          video.crossOrigin = "anonymous"; video.playsInline = true; video.loop = true; video.muted = true
          video.src = object.assetUrl
          media.push(video)
          texture = new THREE.VideoTexture(video)
        }
        texture.colorSpace = THREE.SRGBColorSpace
        const material = object.type === "video-chromakey" ? new THREE.ShaderMaterial({
          uniforms: {
            map: { value: texture }, key: { value: new THREE.Color(object.chromaKeyColor || "#00ff00") },
            tolerance: { value: object.chromaKeyTolerance ?? 0.3 }, smoothness: { value: Math.max(object.chromaKeySmoothness ?? 0.1, 0.001) },
            opacity: { value: object.opacity },
          },
          vertexShader: "varying vec2 uvCoord; void main(){uvCoord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
          fragmentShader: "uniform sampler2D map;uniform vec3 key;uniform float tolerance,smoothness,opacity;varying vec2 uvCoord;void main(){vec4 c=texture2D(map,uvCoord);float a=smoothstep(tolerance-smoothness,tolerance+smoothness,distance(c.rgb,key));gl_FragColor=vec4(c.rgb,c.a*a*opacity);}",
          transparent: true, side: THREE.DoubleSide,
        }) : new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: object.opacity, side: THREE.DoubleSide })
        group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material))
      }
    }
    return {
      root, dispose,
      play: () => Promise.allSettled(media.map((element) => element.play())),
      update: (delta: number, elapsed: number) => {
        mixers.forEach((mixer) => mixer.update(delta))
        animated.forEach(({ group, object }) => {
          if (object.animationType === "float") group.position.y = object.position[1] + Math.sin(elapsed * 2) * 0.03
          if (object.animationType === "rotate") group.rotation.y = object.rotation[1] + elapsed * 0.5
          if (object.animationType === "pulse") group.scale.fromArray(object.scale).multiplyScalar(1 + Math.sin(elapsed * 3) * 0.05)
        })
      },
    }
  } catch (error) { dispose(); throw error }
}
