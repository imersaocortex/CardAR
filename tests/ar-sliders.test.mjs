import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const THREE = require("three")
function load(path, mocks = {}, globals = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function("require", "module", "exports", ...Object.keys(globals), outputText)(
    (name) => name in mocks ? mocks[name] : require(name), loaded, loaded.exports, ...Object.values(globals),
  )
  return loaded.exports
}
const transitions = load("src/lib/sliders/transitions.ts")
const { parseSliderLink, resolveSliderContent } = load("src/lib/sliders/model.ts", { "./transitions": transitions })
const { serializeExperience, experienceSliderIds } = load("src/lib/ar/serialize-experience.ts", {
  "@/lib/scenes": load("src/lib/scenes.ts"),
})
const opened = []
const { attachSceneClicks, registerSceneInteraction } = load("src/lib/ar/scene-interactions.ts", {
  "./actions": load("src/lib/ar/actions.ts"),
}, {
  window: { open: () => ({ location: { replace: (url) => opened.push(url) } }) },
})
const assetId = "cfe965f0-3af8-4b56-be17-c526a631c372"
const content = { name: "Catálogo", width: 1080, height: 1920, fit: "contain", transition: "none", images: [{ id: assetId, url: "https://example.test/image.webp", name: "Produto" }] }

test("slider URLs are local and published content resolves only available images from its asset map", () => {
  const origin = "https://www.cortexar.space", slug = "z12abc123abc123abc123"
  assert.equal(parseSliderLink(`${origin}/sliders/${slug}`, origin), slug)
  assert.equal(parseSliderLink(`https://untrusted.test/sliders/${slug}`, origin), null)
  assert.equal(parseSliderLink(`/anything/sliders/${slug}`, origin), null)
  const { images, transition, ...layout } = content
  const draft = { ...layout, assetIds: [assetId, "e2a4b8bd-0cdc-4bbd-b909-ed0641b7bd01"] }
  const assets = new Map([[assetId, images[0]]])
  assert.deepEqual(resolveSliderContent(draft, assets), { ...content, transition })
  assert.deepEqual(resolveSliderContent({ ...draft, transition: "zoom" }, assets), { ...content, transition: "zoom" })
  assert.equal(resolveSliderContent({ ...draft, transition: "unknown" }, assets), null)
  assert.equal(resolveSliderContent(draft, new Map()), null)
  assert.equal(resolveSliderContent({ ...draft, width: 1e6 }, new Map([[assetId, images[0]]])), null)
})

test("image links belong to individual positions, including repeated and missing assets", () => {
  const missingId = "e2a4b8bd-0cdc-4bbd-b909-ed0641b7bd01"
  const { images, ...layout } = content
  const assets = new Map([[assetId, images[0]]])
  const draft = { ...layout, assetIds: [assetId, missingId, assetId], imageLinks: [" https://example.test/a ", "", "https://example.test/b"] }
  assert.deepEqual(resolveSliderContent(draft, assets).images.map(({ link }) => link), ["https://example.test/a", "https://example.test/b"])
  for (const link of ["javascript:alert(1)", "data:text/html,test", "//example.test", "https://name:password@example.test/"]) {
    assert.equal(resolveSliderContent({ ...draft, imageLinks: [link] }, assets), null, link)
  }
  assert.equal(resolveSliderContent({ ...draft, imageLinks: ["", "", "", ""] }, assets), null)
})

test("AR slider animates only the image layers, then settles and cancels work on disposal", () => {
  const transforms = []
  let callback
  let reducedMotion = false
  const motion = load("src/lib/sliders/transitions.ts", {}, {
    window: { matchMedia: () => ({ matches: reducedMotion }) },
  })
  const { createSliderMesh } = load("src/lib/ar/slider-mesh.ts", {
    "../sliders/transitions": motion,
    "./object-geometry": { imagePlaneSize: () => [1, 1] },
  }, {
    document: { createElement: () => ({
      getContext: () => new Proxy({
        translate: (x, y) => transforms.push([x, y]),
      }, { get: (target, property) => target[property] ?? (() => {}) }),
    }) },
    Image: class { complete = true; naturalWidth = 100; naturalHeight = 100; removeAttribute() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => { callback = fn; return 1 },
    cancelAnimationFrame: () => { callback = null },
  })
  const { mesh, dispose } = createSliderMesh({
    ...content, width: 800, height: 800, transition: "slide", images: [
      { ...content.images[0], link: "https://example.test/first" },
      { ...content.images[0], link: "https://example.test/second" },
    ],
  }, 1)
  mesh.onBeforeRender()
  const center = new THREE.Vector2(0.5, 0.5)
  assert.equal(mesh.userData.sliderControl(center), "https://example.test/first")
  assert.equal(mesh.userData.sliderControl(new THREE.Vector2(0.88, 0.5)), undefined)
  assert.equal(mesh.userData.sliderControl(center), undefined)
  assert.deepEqual(transforms.splice(0), [[0, 0], [800, 0]])
  callback(motion.sliderTransitionDuration / 2)
  assert.deepEqual(transforms.splice(0), [[-700, 0], [100, 0]])
  callback(motion.sliderTransitionDuration)
  assert.deepEqual(transforms, [])
  assert.equal(mesh.userData.sliderControl(center), "https://example.test/second")
  reducedMotion = true
  callback = null
  mesh.userData.sliderControl(new THREE.Vector2(0.5, 0.5), -1)
  assert.equal(callback, null)
  reducedMotion = false
  mesh.userData.sliderControl(new THREE.Vector2(0.5, 0.5), -1)
  assert.equal(typeof callback, "function")
  dispose()
  assert.equal(callback, null)
  assert.equal(motion.sliderMotion("fade", 1, 0.5, true).opacity, 0.5)
  assert.equal(motion.sliderMotion("zoom", 1, 0, true).scale, 0.88)
})

test("suspended or unpublished sliders are omitted while existing scene objects still ship", () => {
  const base = { id: "object", type: "imagem", asset_url: "/legacy.webp", visible: true }
  const slider = { ...base, id: "widget", type: "slider", slider_id: "slider", asset_url: null }
  const project = { id: "project", tracking_mode: "gps", scenes: [{ id: "scene", scene_objects: [base, slider] }] }
  assert.deepEqual(experienceSliderIds([project]), ["slider"])
  assert.deepEqual(serializeExperience(project).scene.objects.map(({ id }) => id), ["object"])
  assert.equal(serializeExperience(project, new Map([["slider", null]])).scene.objects.length, 1)
  const eligible = serializeExperience(project, new Map([["slider", content]]))
  assert.equal(eligible.scene.objects[0].assetUrl, "/legacy.webp")
  assert.deepEqual(eligible.scene.objects[1].slider, content)
  assert.deepEqual(experienceSliderIds([{ ...project, tracking_mode: "surface" }]), [])
  assert.equal(serializeExperience({ ...project, tracking_mode: "surface" }, new Map([["slider", content]])).scene.objects.length, 1)
})

test("projected taps and swipes reach only the visible slider touched", () => {
  const canvas = new EventTarget()
  canvas.style = { touchAction: "auto" }
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 })
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  const changes = []
  function group(x, name) {
    const root = new THREE.Group()
    root.position.set(x, 0, -5)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
    plane.userData.sliderControl = (uv, direction) => {
      changes.push([name, direction ?? null, Math.round(uv.y * 100)])
      return direction ? undefined : `https://example.test/${name}`
    }
    root.add(plane)
    registerSceneInteraction(root, { id: name, type: "slider" }, name)
    return root
  }
  const first = group(-1.2, "A"), second = group(1.2, "B")
  const detach = attachSceneClicks(canvas, [first, second], camera, { burst: () => assert.fail("Unexpected click effect") }, { sliders: true })
  const emit = (name, x) => canvas.dispatchEvent(Object.assign(new Event(name), { isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: 200 }))
  try {
    emit("click", 120)
    emit("pointerdown", 315)
    emit("pointerup", 260)
    emit("click", 260)
    assert.deepEqual(changes, [["A", null, 50], ["B", 1, 50]])
    assert.deepEqual(opened, ["https://example.test/A"])
    emit("pointerdown", 120)
    emit("pointerup", 280)
    assert.equal(changes.length, 2)
    second.visible = false
    emit("pointerdown", 280)
    emit("click", 280)
    assert.equal(changes.length, 2)
  } finally {
    detach()
  }
  assert.equal(canvas.style.touchAction, "auto")
  emit("click", 120)
  assert.equal(changes.length, 2)
})
