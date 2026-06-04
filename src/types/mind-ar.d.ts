declare module "mind-ar/dist/mindar-image.prod.js" {
  export class Compiler {
    compileImageTargets(images: HTMLImageElement[], progressCallback?: (percent: number) => void): Promise<any>
    exportData(): Uint8Array
    importData(buffer: Uint8Array): any
  }

  export class Controller {
    constructor(config: any)
    addImageTargets(src: string): Promise<any>
    processVideo(video: HTMLVideoElement): void
    stopProcessVideo(): void
    dummyRun(video: HTMLVideoElement): Promise<void>
    getProjectionMatrix(): number[]
    inputWidth: number
    inputHeight: number
  }

  export class UI {
    constructor(config: any)
    showLoading(): void
    hideLoading(): void
    showScanning(): void
    hideScanning(): void
    showCompatibility(): void
  }
}

declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import * as THREE from "three"

  export class MindARThree {
    constructor(config: {
      container: HTMLElement
      imageTargetSrc: string
      maxTrack?: number
      filterMinCF?: number | null
      filterBeta?: number | null
      warmupTolerance?: number | null
      missTolerance?: number | null
      uiLoading?: string
      uiScanning?: string
      uiError?: string
      userDeviceId?: string | null
      environmentDeviceId?: string | null
    })

    scene: THREE.Scene
    cssScene: THREE.Scene
    renderer: THREE.WebGLRenderer
    cssRenderer: any
    camera: THREE.PerspectiveCamera
    video: HTMLVideoElement
    anchors: any[]

    start(): Promise<void>
    stop(): void
    switchCamera(): void
    resize(): void
    addAnchor(targetIndex: number): {
      group: THREE.Group
      targetIndex: number
      onTargetFound: (() => void) | null
      onTargetLost: (() => void) | null
      onTargetUpdate: (() => void) | null
      css: boolean
      visible: boolean
    }
    addCSSAnchor(targetIndex: number): any
  }
}

declare module "mind-ar" {
  export { Compiler } from "mind-ar/dist/mindar-image.prod.js"
  export { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js"
}

interface Window {
  MINDAR?: {
    IMAGE?: {
      Controller: any
      Compiler: any
      MindARThree: any
      UI: any
      tf: any
    }
  }
}
