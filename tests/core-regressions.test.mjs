import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const THREE = require("three")
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function("require", "module", "exports", outputText)((name) => name in mocks ? mocks[name] : require(name), loaded, loaded.exports)
  return loaded.exports
}
const { geoOffset, gpsDisplayPosition, bearingDifference } = load("src/lib/ar/geo.ts")
const { yawTowardViewer } = load("src/lib/ar/billboard.ts")
const { playSpatialVideoMuted, enableSpatialAudio, muteSpatialAudio } = load("src/lib/ar/spatial-media.ts")
const { getActionUrl } = load("src/lib/ar/actions.ts")
const { selectPrimaryScene } = load("src/lib/scenes.ts")
const { createProjectSchema } = load("src/lib/schemas/index.ts")
const objectGeometry = load("src/lib/ar/object-geometry.ts")
const { validateCollectionMembers } = load("src/lib/ar/collection-validation.ts")

test("collections reject mixed technologies, other organizations and unpublished projects", () => {
  const marker = (id, overrides = {}) => ({ id, organization_id: "owner", tracking_mode: "marker", status: "published", project_markers: [{ image_url: "https://example.com/marker.png" }], ...overrides })
  const first = marker("one")
  const second = marker("two")
  assert.equal(validateCollectionMembers("marker", "owner", ["one", "two"], [first, second]), null)
  assert.match(validateCollectionMembers("marker", "owner", ["one", "two"], [first, marker("two", { tracking_mode: "gps" })]), /tecnologia/)
  assert.match(validateCollectionMembers("marker", "owner", ["one", "two"], [first, marker("two", { organization_id: "other" })]), /organização/)
  assert.match(validateCollectionMembers("marker", "owner", ["one", "two"], [first, marker("two", { status: "draft" })]), /publicados/)
  assert.match(validateCollectionMembers("marker", "owner", ["one", "two"], [first, marker("two", { project_markers: [] })]), /marcador/)
  assert.match(validateCollectionMembers("marker", "owner", ["one", "one"], [first]), /diferentes/)
  const gps = (id, coordinates = true) => ({ id, organization_id: "owner", tracking_mode: "gps", status: "published", latitude: coordinates ? 0 : null, longitude: 0 })
  assert.equal(validateCollectionMembers("gps", "owner", ["a", "b"], [gps("a"), gps("b")]), null)
  assert.match(validateCollectionMembers("gps", "owner", ["a", "b"], [gps("a"), gps("b", false)]), /coordenadas/)
})

test("new projects default to marker tracking and accept markerless modes", () => {
  const base = { name: "Experiência", type: "business_card" }
  assert.equal(createProjectSchema.parse(base).tracking_mode, "marker")
  assert.equal(createProjectSchema.parse({ ...base, tracking_mode: "surface" }).tracking_mode, "surface")
  assert.equal(createProjectSchema.safeParse({ ...base, tracking_mode: "gps" }).success, false)
  assert.equal(createProjectSchema.parse({ ...base, tracking_mode: "gps", latitude: 0, longitude: 0 }).activation_radius, 100)
  assert.equal(createProjectSchema.safeParse({ ...base, tracking_mode: "gps", latitude: 91, longitude: 0 }).success, false)
})

test("GPS preserves geographic directions and meters", () => {
  const north = geoOffset(0, 0, 0.001, 0)
  assert.ok(Math.abs(north.distance - 111.195) < 0.01)
  assert.equal(north.bearing, 0)
  assert.ok(north.north > 0 && north.east === 0)
  const east = geoOffset(0, 0, 0, 0.001)
  assert.equal(east.bearing, 90)
  assert.ok(east.east > 111)
  assert.equal(geoOffset(-23.5, -46.6, -23.5, -46.6).distance, 0)
})
test("GPS handles the antimeridian without a world-spanning jump", () => {
  const point = geoOffset(0, 179.999, 0, -179.999)
  assert.ok(point.distance > 222 && point.distance < 223)
  assert.ok(point.east > 0)
})

test("GPS perspective follows real distance while keeping the scene in front of the camera on arrival", () => {
  const far = gpsDisplayPosition({ distance: 200, bearing: 90 }, 12)
  const near = gpsDisplayPosition({ distance: 20, bearing: 90 }, 5)
  assert.equal(far.atTarget, false)
  assert.ok(Math.abs(far.east - 200) < 0.0001)
  assert.ok(Math.abs(far.north) < 0.0001)
  assert.ok(Math.abs(near.east - 20) < 0.0001)
  assert.ok(far.east > near.east)
  const close = gpsDisplayPosition({ distance: 4, bearing: 90 }, 15, 180)
  assert.ok(Math.abs(close.east - 4) < 0.0001)
  const walkToward = gpsDisplayPosition(geoOffset(0, 0, 0, 0.0001), 3)
  const walkAway = gpsDisplayPosition(geoOffset(0, 0, 0, 0.001), 3)
  assert.ok(walkAway.east > walkToward.east * 9)
  const arrival = gpsDisplayPosition({ distance: 0, bearing: 0 }, 15, 180)
  assert.equal(arrival.atTarget, true)
  assert.ok(Math.abs(arrival.north + 3) < 0.0001)
  assert.ok(Math.abs(arrival.east) < 0.0001)
  assert.equal(bearingDifference(10, 350), 20)
  assert.equal(bearingDifference(350, 10), -20)
})
test("spatial objects turn their front toward the viewer on the horizontal plane", () => {
  assert.equal(yawTowardViewer(0, -6, 0, 0), 0)
  assert.equal(yawTowardViewer(6, 0, 0, 0), -Math.PI / 2)
  assert.equal(yawTowardViewer(-6, 0, 0, 0), Math.PI / 2)
  assert.equal(yawTowardViewer(0, 0, 0, 0), null)
})
test("GPS and surface render saved object scale with the studio's video and image proportions", async () => {
  const { buildSpatialScene } = load("src/lib/ar/spatial-scene.ts", {
    "three/examples/jsm/loaders/GLTFLoader.js": { GLTFLoader: class {} },
    "@/lib/ar/billboard": { yawTowardViewer },
    "@/lib/ar/spatial-media": { playSpatialVideoMuted, enableSpatialAudio, muteSpatialAudio },
    "@/lib/ar/object-geometry": objectGeometry,
  })
  const originalDocument = globalThis.document
  const originalLoadAsync = THREE.TextureLoader.prototype.loadAsync
  const context = { beginPath() {}, arc() {}, fill() {}, roundRect() {}, fillText() {} }
  globalThis.document = { createElement: (tag) => tag === "canvas" ? { getContext: () => context } : { pause() {}, removeAttribute() {}, load() {} } }
  THREE.TextureLoader.prototype.loadAsync = async () => new THREE.Texture({ width: 1200, height: 800 })
  const base = { name: "Objeto", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1.4, 0.8, 1], opacity: 1, visible: true, animationType: null, faceCamera: false }
  let scene
  try {
    scene = await buildSpatialScene([
      { ...base, id: "video", type: "video-mp4", assetUrl: "/test.mp4" },
      { ...base, id: "chroma", type: "video-chromakey", assetUrl: "/test.mp4" },
      { ...base, id: "image", type: "imagem", assetUrl: "/test.png" },
      { ...base, id: "button", type: "botao-site", showCaption: true },
    ])
    const [video, chroma, image, button] = scene.root.children
    for (const group of [video, chroma]) {
      const mesh = group.children[0]
      assert.equal(mesh.geometry.parameters.width, 1.5)
      assert.equal(mesh.geometry.parameters.height, 0.85)
      assert.deepEqual(group.scale.toArray(), base.scale)
      assert.equal(mesh.geometry.parameters.height * group.scale.y, 0.68)
    }
    assert.equal(image.children[0].geometry.parameters.width, 1.5)
    assert.equal(image.children[0].geometry.parameters.height, 1)
    assert.deepEqual(image.scale.toArray(), base.scale)
    assert.equal(button.children[0].geometry.parameters.width, 0.5)
    assert.equal(button.children[0].geometry.parameters.height, 0.5)
    assert.equal(button.children[1].geometry.parameters.height, 0.15)
    assert.deepEqual(button.scale.toArray(), base.scale)
  } finally {
    scene?.dispose()
    THREE.TextureLoader.prototype.loadAsync = originalLoadAsync
    globalThis.document = originalDocument
  }
})
test("spatial video starts muted and enables sound only on explicit playback", async () => {
  const video = { tagName: "VIDEO", muted: true, plays: 0, play() { this.plays++; return Promise.resolve() }, pause() {} }
  const audio = { tagName: "AUDIO", muted: false, plays: 0, play() { this.plays++; return Promise.resolve() }, pause() { this.paused = true } }
  await playSpatialVideoMuted([video, audio])
  assert.equal(video.plays, 1)
  assert.equal(video.muted, true)
  assert.equal(audio.plays, 0)
  assert.equal(await enableSpatialAudio([video, audio]), true)
  assert.equal(video.muted, false)
  assert.equal(audio.plays, 1)
  muteSpatialAudio([video, audio])
  assert.equal(video.muted, true)
  assert.equal(audio.paused, true)
})
test("scene selection preserves public behavior and gives deterministic ties", () => {
  const scenes = [
    { id: "b", created_at: "2026-01-01", scene_objects: [{}] },
    { id: "a", created_at: "2026-01-01", scene_objects: [{}] },
    { id: "c", created_at: "2025-01-01", scene_objects: [] },
  ]
  assert.equal(selectPrimaryScene(scenes).id, "a")
  assert.equal(scenes[0].id, "b")
  assert.equal(selectPrimaryScene([]), null)
  assert.equal(selectPrimaryScene([...scenes, { id: "d", scene_objects: [{}, {}] }]).id, "d")
})
test("AR actions reject executable URLs and preserve supported contact actions", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "url:javascript:alert(1)", "//evil.test", "email:a@b.com?body=x"]) assert.equal(getActionUrl(value), null)
  assert.equal(getActionUrl("url:https://example.com"), "https://example.com/")
  assert.equal(getActionUrl("whatsapp:+55 (11) 99999-0000"), "https://wa.me/5511999990000")
  assert.equal(getActionUrl("tel:+55 (11) 2222-3333"), "tel:+551122223333")
})

const element = { id: "2fd30d57-8249-4436-88ae-bba0f3982473", type: "imagem", name: "Teste", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], opacity: 1, visible: true, faceCamera: true, duration: 0, chromaKeyTolerance: 0, chromaKeySmoothness: 0 }
function studio(rpc) {
  return load("src/store/index.ts", {
    "@/lib/supabase/client": { createClient: () => ({ rpc }) },
    "@/lib/mock-data": { mockElements: [], mockLayers: [] },
    "@/lib/scenes": { selectPrimaryScene },
  }).useStudioStore
}
test("failed persistence never marks an unsaved scene as saved", async () => {
  const store = studio(async () => ({ error: { message: "offline" }, data: null }))
  store.setState({ projectId: "project", elements: [element], isSaved: false })
  await assert.rejects(store.getState().saveScene(), /Não foi possível salvar/)
  assert.equal(store.getState().isSaved, false)
})
test("save retains IDs and zero-valued settings", async () => {
  let saved
  const store = studio(async (_name, payload) => { saved = payload; return { data: "scene", error: null } })
  store.setState({ projectId: "project", elements: [element], isSaved: false })
  await store.getState().saveScene()
  assert.equal(saved.p_objects[0].id, element.id)
  assert.equal(saved.p_objects[0].chroma_key_tolerance, 0)
  assert.equal(saved.p_objects[0].duration, 0)
  assert.equal(saved.p_objects[0].face_camera, true)
  assert.equal(store.getState().sceneId, "scene")
  assert.equal(store.getState().isSaved, true)
  store.getState().updateElement(element.id, { faceCamera: false })
  await store.getState().saveScene()
  assert.equal(saved.p_objects[0].face_camera, false)
})
test("edits made during an in-flight save remain unsaved", async () => {
  let finish
  const store = studio(() => new Promise((resolve) => { finish = resolve }))
  store.setState({ projectId: "project", elements: [element], isSaved: false })
  const saving = store.getState().saveScene()
  store.getState().updateElement(element.id, { name: "Changed while saving" })
  finish({ data: "scene", error: null })
  await saving
  assert.equal(store.getState().isSaved, false)
})
test("finishing a save cannot replace the newly opened project's scene", async () => {
  let finish
  const store = studio(() => new Promise((resolve) => { finish = resolve }))
  store.setState({ projectId: "first", elements: [element], isSaved: false })
  const saving = store.getState().saveScene()
  store.setState({ projectId: "second", sceneId: "second-scene", elements: [] })
  finish({ data: "first-scene", error: null })
  await saving
  assert.equal(store.getState().sceneId, "second-scene")
})
