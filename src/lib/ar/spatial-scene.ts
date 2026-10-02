import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { ArSceneObject } from "@/lib/mindar"
import { yawTowardViewer } from "@/lib/ar/billboard"
import { enableSpatialAudio, muteSpatialAudio, playSpatialVideoMuted } from "@/lib/ar/spatial-media"
import { BUTTON_CAPTION_SIZE, BUTTON_CAPTION_Y, BUTTON_PLANE_SIZE, imagePlaneSize, VIDEO_PLANE_SIZE } from "@/lib/ar/object-geometry"

const buttonStyles: Record<string, { color: string; label: string; icon?: string }> = {
  "botao-whatsapp": { color: "#25D366", label: "WhatsApp", icon: "/whatsapp-icon.svg" },
  "botao-site": { color: "#3b82f6", label: "Site" },
  "botao-instagram": { color: "#E4405F", label: "Instagram" },
  "botao-ligar": { color: "#22c55e", label: "Ligar", icon: "/phone-icon.svg" },
  "botao-email": { color: "#ef4444", label: "Email" },
}

function spatialButtonTexture(type: string) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext("2d")!
  const style = buttonStyles[type]
  ctx.fillStyle = style?.color ?? "#666"
  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  if (style?.icon) {
    const icon = new Image()
    icon.onload = () => { ctx.drawImage(icon, 12, 12, 104, 104); texture.needsUpdate = true }
    icon.src = style.icon
  } else {
    ctx.fillStyle = "white"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = "bold 38px sans-serif"
    ctx.fillText((style?.label ?? type).slice(0, 2).toUpperCase(), 64, 65)
  }
  texture.needsUpdate = true
  return texture
}

function spatialCaptionTexture(label: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 256; canvas.height = 64
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "rgba(0,0,0,0.5)"
  ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 12); ctx.fill()
  ctx.fillStyle = "white"
  ctx.font = "bold 28px sans-serif"
  ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillText(label, 128, 34, 240)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

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
  const viewer = new THREE.Vector3()
  const objectPosition = new THREE.Vector3()
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
        group.add(new THREE.Mesh(
          new THREE.PlaneGeometry(...BUTTON_PLANE_SIZE),
          new THREE.MeshBasicMaterial({ map: spatialButtonTexture(object.type), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: object.opacity }),
        ))
        if (object.showCaption !== false) {
          const caption = new THREE.Mesh(
            new THREE.PlaneGeometry(...BUTTON_CAPTION_SIZE),
            new THREE.MeshBasicMaterial({ map: spatialCaptionTexture(buttonStyles[object.type]?.label ?? object.name), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: object.opacity }),
          )
          caption.position.set(0, BUTTON_CAPTION_Y, 0.02)
          group.add(caption)
        }
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
        const image = texture.image as { width?: number; height?: number } | null
        const size = object.type === "imagem"
          ? imagePlaneSize(image?.width ?? 0, image?.height ?? 0)
          : VIDEO_PLANE_SIZE
        group.add(new THREE.Mesh(new THREE.PlaneGeometry(...size), material))
      }
    }
    return {
      root, dispose,
      play: () => playSpatialVideoMuted(media),
      enableAudio: () => enableSpatialAudio(media),
      muteAudio: () => muteSpatialAudio(media),
      update: (delta: number, elapsed: number, viewerPosition?: THREE.Vector3) => {
        mixers.forEach((mixer) => mixer.update(delta))
        if (viewerPosition) viewer.copy(viewerPosition)
        root.updateWorldMatrix(true, true)
        animated.forEach(({ group, object }) => {
          if (object.animationType === "float") group.position.y = object.position[1] + Math.sin(elapsed * 2) * 0.03
          if (object.animationType === "rotate") group.rotation.y = object.rotation[1] + elapsed * 0.5
          if (object.animationType === "pulse") group.scale.fromArray(object.scale).multiplyScalar(1 + Math.sin(elapsed * 3) * 0.05)
          if (object.faceCamera && viewerPosition) {
            group.getWorldPosition(objectPosition)
            const yaw = yawTowardViewer(objectPosition.x, objectPosition.z, viewer.x, viewer.z)
            if (yaw !== null) group.rotation.y = yaw
          }
        })
      },
    }
  } catch (error) { dispose(); throw error }
}
