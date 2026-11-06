import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const THREE = require("three")
function load(path, mocks = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  const loaded = { exports: {} }
  new Function("require", "module", "exports", outputText)((name) => name in mocks ? mocks[name] : require(name), loaded, loaded.exports)
  return loaded.exports
}
const actions = load("src/lib/ar/actions.ts")
const interactions = load("src/lib/ar/scene-interactions.ts", { "./actions": actions })
const { locateGpsProjects, gpsRadarPosition, loadGpsScenes } = load("src/lib/ar/gps-collection.ts", { "./geo": load("src/lib/ar/geo.ts") })
const { createClickParticles } = load("src/lib/ar/click-particles.ts")
const { registerSceneInteraction, pickSceneInteractionAt, activateSceneInteraction, attachSceneClicks } = interactions
const bounds = { left: 10, top: 20, width: 400, height: 800 }
function target(id, distance = 5, effect = "none") {
  const group = new THREE.Group()
  group.position.z = -distance
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  group.add(mesh)
  registerSceneInteraction(group, { id, action: `https://example.com/${id}`, clickEffect: effect }, `project-${id}`)
  return group
}

test("touch raycast opens only the nearest visible project's URL and preserves attribution", () => {
  const camera = new THREE.PerspectiveCamera(60, 0.5, 0.1, 10000)
  const near = target("near"), far = target("far", 10)
  const hiddenParent = new THREE.Group()
  hiddenParent.add(target("hidden", 2)); hiddenParent.visible = false
  const hit = pickSceneInteractionAt([far, near, hiddenParent], camera, bounds, 210, 420)
  assert.equal(hit.interaction.objectId, "near")
  assert.equal(hit.interaction.projectId, "project-near")
  const original = globalThis.window
  const opened = [], events = []
  const popup = { opener: "original", location: { replace: url => opened.push(url) } }
  globalThis.window = { open: () => popup }
  try {
    activateSceneInteraction(hit, { burst: () => assert.fail("effect is off") }, (event, metadata) => events.push({ event, metadata }))
    assert.deepEqual(opened, ["https://example.com/near"])
    assert.equal(popup.opener, null)
    assert.equal(events[0].metadata.project_id, "project-near")
    near.visible = false
    assert.equal(pickSceneInteractionAt([near, far, hiddenParent], camera, bounds, 210, 420).interaction.objectId, "far")
    far.visible = false
    assert.equal(pickSceneInteractionAt([near, far, hiddenParent], camera, bounds, 210, 420), null)
  } finally { globalThis.window = original }
})

test("picking uses the whole transformed image rather than an arbitrary radius at its center", () => {
  const camera = new THREE.PerspectiveCamera(60, 0.5, 0.1, 100)
  const image = target("banner")
  image.scale.set(3, 2, 1)
  image.rotation.y = 0.2
  assert.ok(pickSceneInteractionAt([image], camera, bounds, 370, 420))
  assert.equal(pickSceneInteractionAt([image], camera, bounds, 210, 30), null)
  assert.equal(pickSceneInteractionAt([image], camera, bounds, 5, 420), null)
})

test("one canvas click fires one action, excludes controls/VR and cleans up listeners", () => {
  const canvas = new EventTarget()
  canvas.getBoundingClientRect = () => bounds
  const camera = new THREE.PerspectiveCamera(60, 0.5, 0.1, 100)
  const original = globalThis.window
  let allowed = true, calls = 0
  globalThis.window = { open: () => ({ location: { replace: () => calls++ } }) }
  const off = attachSceneClicks(canvas, [target("banner")], camera, { burst() {} }, { enabled: () => allowed })
  const click = () => { const event = new Event("click"); Object.assign(event, { clientX: 210, clientY: 420 }); canvas.dispatchEvent(event) }
  try {
    click(); assert.equal(calls, 1)
    allowed = false; click(); assert.equal(calls, 1)
    allowed = true; off(); click(); assert.equal(calls, 1)
  } finally { off(); globalThis.window = original }
})

test("blocked new tabs fall back to the same page without losing the image action", () => {
  const original = globalThis.window
  globalThis.window = { open: () => null, location: { href: "" } }
  try {
    const hit = pickSceneInteractionAt([target("coupon")], new THREE.PerspectiveCamera(60, 0.5, 0.1, 100), bounds, 210, 420)
    activateSceneInteraction(hit, { burst() {} })
    assert.equal(globalThis.window.location.href, "https://example.com/coupon")
  } finally { globalThis.window = original }
})

test("particles work without a link, reject executable links and never change the original image", () => {
  const scene = new THREE.Scene(), image = target("banner", 5, "particles")
  scene.add(image)
  registerSceneInteraction(image, { id: "effect-only", action: "javascript:alert(1)", clickEffect: "particles" })
  const camera = new THREE.PerspectiveCamera(60, 0.5, 0.1, 100)
  const hit = pickSceneInteractionAt([image], camera, bounds, 210, 420)
  assert.equal(hit.interaction.action, null)
  const effects = createClickParticles(scene)
  const transform = image.matrixWorld.clone()
  activateSceneInteraction(hit, effects)
  assert.equal(scene.children.length, 2)
  effects.update(0.2)
  assert.equal(image.visible, true)
  assert.ok(image.matrixWorld.equals(transform))
  assert.deepEqual(image.scale.toArray(), [1, 1, 1])
  for (let i = 0; i < 8; i++) effects.burst(hit)
  assert.equal(scene.children.length, 4) // at most three bursts
  effects.update(1)
  assert.deepEqual(scene.children, [image])
  effects.dispose()
})

test("particles respect reduced motion and remain disabled on old objects", () => {
  const scene = new THREE.Scene(), image = target("banner", 5)
  scene.add(image)
  const hit = pickSceneInteractionAt([image], new THREE.PerspectiveCamera(60, 0.5, 0.1, 100), bounds, 210, 420)
  assert.equal(hit.interaction.effect, "none")
  const original = globalThis.window
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  try { createClickParticles(scene).burst(hit); assert.equal(scene.children.length, 1) } finally { globalThis.window = original }
})

test("walking between collection GPS points updates every radius and real perspective distance independently", () => {
  const projects = [
    { id: "a", name: "Loja A", latitude: 0, longitude: 0, activationRadius: 20 },
    { id: "b", name: "Loja B", latitude: 0, longitude: 0.001, activationRadius: 30 },
    { id: "c", name: "Loja C", latitude: 0.00005, longitude: 0, activationRadius: 40 },
  ]
  const bearings = [null, null, null]
  const atA = locateGpsProjects(projects, { latitude: 0, longitude: 0.00005, accuracy: 5 }, bearings)
  assert.deepEqual(atA.map(p => p.inRange), [true, false, true])
  const atB = locateGpsProjects(projects, { latitude: 0, longitude: 0.00095, accuracy: 5 }, bearings)
  assert.deepEqual(atB.map(p => p.inRange), [false, true, false])
  assert.ok(atB[0].distance > atA[0].distance)
  assert.ok(atB[1].distance < atA[1].distance)
  assert.ok(Math.abs(Math.hypot(atB[1].east, atB[1].north) - atB[1].distance) < 1e-6)
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000)
  const height = distance => new THREE.Vector3(0, 0.5, -distance).project(camera).y
  assert.ok(height(atB[1].distance) > height(atA[1].distance))
})

test("radar is heading-relative, shows points on all sides and clamps distant projects to its edge", () => {
  assert.deepEqual(gpsRadarPosition({ distance: 25, bearing: 0 }, 0, 50), { x: 50, y: 30, beyondRange: false })
  const east = gpsRadarPosition({ distance: 25, bearing: 90 }, 0, 50)
  assert.equal(east.x, 70); assert.ok(Math.abs(east.y - 50) < 1e-6)
  const facingEast = gpsRadarPosition({ distance: 25, bearing: 90 }, 90, 50)
  assert.equal(facingEast.x, 50); assert.equal(facingEast.y, 30)
  const behind = gpsRadarPosition({ distance: 500, bearing: 180 }, 0, 50)
  assert.equal(behind.y, 90); assert.equal(behind.beyondRange, true)
})

test("a slow or failed GPS scene does not prevent other projects loading, and late assets are disposed", async () => {
  const loaded = [], failed = [], disposed = []
  let release
  const content = index => ({ dispose: () => disposed.push(index) })
  await loadGpsScenes(5, async index => {
    if (index === 0) return new Promise(resolve => { release = () => resolve(content(index)) })
    if (index === 1) throw new Error("404")
    return content(index)
  }, { signal: new AbortController().signal, loaded: index => loaded.push(index), failed: index => failed.push(index), timeoutMs: 20 })
  assert.deepEqual(loaded.sort(), [2, 3, 4])
  assert.deepEqual(failed.sort(), [0, 1])
  release(); await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(disposed, [0])
})

test("closing GPS during loading prevents new scenes and disposes late results", async () => {
  const controller = new AbortController()
  const completions = [], disposed = []
  let starts = 0
  const loading = loadGpsScenes(20, async index => {
    starts++
    return new Promise(resolve => completions.push(() => resolve({ dispose: () => disposed.push(index) })))
  }, { signal: controller.signal, loaded: () => assert.fail("closed session"), failed: () => assert.fail("not a loading failure") })
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await loading
  assert.equal(starts, 3)
  completions.forEach(release => release())
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(disposed, [0, 1, 2])
})

test("GPS player follows two destinations, opens each image link, refreshes a stationary fix and stops all sensors", async () => {
  const keys = ["window", "document", "navigator", "screen", "DeviceOrientationEvent", "innerWidth", "innerHeight", "devicePixelRatio"]
  const saved = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const originalNow = Date.now
  let now = 1000000, watchSuccess, refreshSuccess, cleared = false, stopped = false, frame, renderedScene, camera
  const refs = [], states = [], mountEffects = [], timers = [], opened = [], analytics = []
  const canvas = new EventTarget()
  Object.assign(canvas, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }), remove() {} })
  const win = new EventTarget()
  Object.assign(win, { DeviceOrientationEvent: class {}, open: () => ({ location: { replace: url => opened.push(url) } }), setInterval: fn => { timers.push(fn); return 123456 } })
  const doc = new EventTarget(); doc.visibilityState = "visible"
  const globals = {
    window: win, document: doc, screen: { orientation: { angle: 0 } }, DeviceOrientationEvent: win.DeviceOrientationEvent,
    innerWidth: 400, innerHeight: 800, devicePixelRatio: 1,
    navigator: {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true } }] }) },
      geolocation: {
        watchPosition: callback => { watchSuccess = callback; return 7 },
        clearWatch: id => { assert.equal(id, 7); cleared = true },
        getCurrentPosition: callback => { refreshSuccess = callback },
      },
    },
  }
  for (const key of keys) Object.defineProperty(globalThis, key, { value: globals[key], configurable: true, writable: true })
  Date.now = () => now
  const contentRoots = [], disposed = []
  const React = {
    useRef: initial => { const ref = { current: initial }; refs.push(ref); return ref },
    useState: initial => { const i = states.length; states.push(initial); return [initial, value => { states[i] = typeof value === "function" ? value(states[i]) : value }] },
    useEffect: fn => mountEffects.push(fn),
  }
  const Renderer = class {
    domElement = canvas
    setPixelRatio() {} setSize() {} setViewport() {} dispose() {}
    setAnimationLoop(fn) { frame = fn }
    render(scene, cam) { renderedScene = scene; camera = cam }
  }
  const { GpsPlayer } = load("src/components/ar/gps-player.tsx", {
    react: React,
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    three: { ...THREE, WebGLRenderer: Renderer, Clock: class { elapsedTime = 0; getDelta() { this.elapsedTime += 0.016; return 0.016 } } },
    "three/addons/effects/StereoEffect.js": { StereoEffect: class {} },
    "@/lib/ar/spatial-scene": { buildSpatialScene: async (_objects, options) => {
      const root = target(options.projectId, 0)
      contentRoots.push(root)
      return { root, dispose: () => disposed.push(root), update() {}, play: async () => {}, pause() {}, muteAudio() {}, enableAudio: async () => true }
    } },
    "@/lib/ar/geo": load("src/lib/ar/geo.ts"),
    "@/lib/ar/gps-collection": { loadGpsScenes, locateGpsProjects },
    "@/lib/ar/scene-interactions": interactions,
    "@/lib/ar/click-particles": { createClickParticles },
    "@/components/ui/button": { Button: "button" },
    "lucide-react": { X: "x" }, "./ar-actions": { ArActions: "actions" },
    "./spatial-actions": { SpatialActions: "links" }, "./gps-radar": { GpsRadar: "radar" },
  })
  try {
    const projects = [
      { id: "a", name: "A", latitude: 0.00005, longitude: 0, activationRadius: 20, scene: { objects: [{ type: "imagem", visible: true, assetUrl: "test.png" }] } },
      { id: "b", name: "B", latitude: 0.00105, longitude: 0, activationRadius: 20, scene: { objects: [{ type: "imagem", visible: true, assetUrl: "test.png" }] } },
    ]
    const tree = GpsPlayer({ experience: projects[0], experiences: projects, siteName: "Test", hasWatermark: false, onInteraction: (...args) => analytics.push(args) })
    refs[0].current = { appendChild() {} }
    refs[1].current = refs[2].current = { play: async () => {} }
    const cleanups = mountEffects.map(fn => fn()).filter(Boolean)
    const findStart = node => {
      if (!node || typeof node !== "object") return null
      if (node.type === "button" && node.props.children === "Iniciar experiência GPS") return node.props.onClick
      return (Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]).map(findStart).find(Boolean)
    }
    await findStart(tree)()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(contentRoots.length, 2)
    const orient = () => { const event = new Event("deviceorientationabsolute"); Object.assign(event, { beta: 90, gamma: 0, alpha: 0, absolute: true }); win.dispatchEvent(event) }
    const fix = latitude => ({ coords: { latitude, longitude: 0, accuracy: 5 }, timestamp: now })
    orient(); watchSuccess(fix(0)); frame()
    const anchors = renderedScene.children.filter(child => child instanceof THREE.Group)
    assert.deepEqual(anchors.map(a => a.visible), [true, false])
    const click = () => { const event = new Event("click"); Object.assign(event, { clientX: 200, clientY: 400 }); canvas.dispatchEvent(event) }
    click(); assert.deepEqual(opened, ["https://example.com/a"])
    assert.equal(analytics[0][1].project_id, "project-a")
    now += 1000; orient(); watchSuccess(fix(0.001)); frame()
    assert.deepEqual(anchors.map(a => a.visible), [false, true])
    click(); assert.deepEqual(opened, ["https://example.com/a", "https://example.com/b"])
    assert.ok(Math.abs(anchors[1].position.z + 5.56) < 0.1)
    now += 31000; orient(); frame()
    assert.deepEqual(anchors.map(a => a.visible), [false, false])
    click(); assert.equal(opened.length, 2)
    timers[0](); refreshSuccess(fix(0.001)); frame()
    assert.deepEqual(anchors.map(a => a.visible), [false, true])
    assert.equal(contentRoots.length, 2) // no reload or media reset
    assert.ok(camera instanceof THREE.PerspectiveCamera)
    cleanups.forEach(fn => fn())
    assert.equal(cleared, true); assert.equal(stopped, true); assert.equal(frame, null)
    assert.equal(disposed.length, 2)
  } finally {
    Date.now = originalNow
    for (const key of keys) if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]
  }
})
