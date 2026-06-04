"use client"

export async function compileMarkerImage(imageUrl: string): Promise<Uint8Array> {
  const mindarModule = await import("mind-ar/dist/mindar-image.prod.js")
  const Compiler = mindarModule.Compiler || (window as any).MINDAR?.IMAGE?.Compiler
  if (!Compiler) {
    throw new Error("MINDAR.IMAGE.Compiler not available")
  }

  const img = new Image()
  img.crossOrigin = "anonymous"
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load marker image"))
  })
  img.src = imageUrl
  await loaded

  const compiler = new Compiler()
  const progressCallback = (percent: number) => {
    // progress can be captured by caller if needed
  }

  await compiler.compileImageTargets([img], progressCallback)
  const buffer = compiler.exportData()
  return buffer
}
