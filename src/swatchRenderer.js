import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createFrameMaterial } from "./frameMaterial.js";
import { createLensMaterial } from "./lensMaterial.js";
import { createTextMaterial } from "./textMaterial.js";
import { createAcetateMaterial } from "./acetateMaterial.js";

// A tiny, permanent offscreen rig — one renderer/scene/sphere shared by every swatch,
// reused across the whole panel. Materials are swapped onto the same sphere and the
// result is copied out to its own <canvas> per preset, so we pay for one WebGL context
// instead of one per tile. Results are cached by preset so re-opening a tab (or the
// active tile enlarging) never re-renders anything that's already been drawn once.
let renderer = null;
let scene = null;
let camera = null;
let sphere = null;
const cache = new Map();

function ensureRig() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); // output size is already chosen in physical pixels — no double scaling
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  scene.environmentIntensity = 1.2;

  // Every metal/text swatch was rendering as solid black (bar a pinpoint highlight)
  // for any preset with low enough roughness that its look depends on real IBL rather
  // than the two direct lights below. The cause: this rig used to be handed the main
  // product stage's `envMap` — a PMREM texture baked by *that* WebGLRenderer's own GL
  // context. A render-target texture's pixel data lives on the GPU of the context that
  // produced it; a second, independent WebGLRenderer (this one) has no way to read it,
  // so `scene.environment` was silently a no-op here even though it was assigned.
  // Fix: bake a small environment of our own, with our own renderer's own
  // PMREMGenerator, so this context actually has real reflection data to sample.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0.05, 2.35);
  camera.lookAt(0, 0, 0);

  // Same two-light setup as the product stage (key + soft fill), scaled down — a
  // swatch is meant to read as "the same material, seen up close," not a new mood.
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(1.2, 1.6, 1.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(-1.4, 0.3, 0.9);
  scene.add(fill);

  sphere = new THREE.Mesh(new THREE.SphereGeometry(0.62, 96, 96));
  scene.add(sphere);
}

/**
 * Historically this pointed the rig at the real studio HDRI once it resolved — that
 * was the bug (see ensureRig's comment). The rig now bakes its own environment
 * synchronously and no longer depends on the product stage's envMap at all, so this is
 * kept only so the existing call site in main.js doesn't need to change; it just makes
 * sure the rig (and its own environment) exists, and clears any stale cached renders.
 */
export function setSwatchEnvironment() {
  ensureRig();
  cache.clear();
}

/** Always true once the rig exists — its environment is self-contained, not fetched. */
export function isSwatchEnvironmentReady() {
  ensureRig();
  return true;
}

// Deep, near-black stage tones the panel can pick between — never light enough to
// compete with the material's own reflections, but distinct from one another so the
// choice is actually visible. User-selectable via the panel's stage picker.
const STAGE_BACKGROUNDS = [
  { id: "charcoal", label: "Charcoal", hex: 0x14110d },
  { id: "bottleGreen", label: "Bottle Green", hex: 0x0d1712 },
  { id: "aubergine", label: "Aubergine", hex: 0x150e17 },
  { id: "espresso", label: "Espresso", hex: 0x1c140d },
];

let activeBackgroundId = STAGE_BACKGROUNDS[0].id;

export function getStageBackgrounds() {
  return STAGE_BACKGROUNDS;
}

export function getActiveStageBackground() {
  return activeBackgroundId;
}

export function setStageBackground(id) {
  if (id === activeBackgroundId || !STAGE_BACKGROUNDS.some((bg) => bg.id === id)) return;
  activeBackgroundId = id;
  cache.clear(); // every cached render used the old stage color — force a redraw
}

function buildPreviewMaterial(category, presetName, frameOverride) {
  if (category === "lens") return createLensMaterial(presetName);

  if (category === "acetate") return createAcetateMaterial(presetName);

  if (category === "text") {
    const material = createTextMaterial(presetName === "matchFrame" ? "silver" : presetName);
    if (presetName === "matchFrame" && frameOverride) {
      material.color.copy(frameOverride.baseColor);
      material.metalness = frameOverride.metalness;
      material.roughness = frameOverride.roughness;
    }
    return material;
  }

  // frame / handles / hinge all share the exact same finish shader and preset table.
  return createFrameMaterial(presetName);
}

/**
 * Renders (or returns the cached render of) a preset as a small lit sphere and hands
 * back the actual <canvas> element — callers append it directly rather than reading
 * pixels back into an <img>, since a canvas is cheaper and just as swappable in the DOM.
 */
export function getSwatchCanvas({ category, presetName, size = 320, frameOverride, cacheKey }) {
  ensureRig();
  const key = cacheKey ?? `${category}:${presetName}:${size}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const material = buildPreviewMaterial(category, presetName, frameOverride);
  sphere.material = material;

  renderer.setSize(size, size, false);
  // Baked into the render itself (not left to whatever CSS sits behind the canvas) —
  // an opaque dark stage instead of transparent, so the material's own reflections and
  // color read with real contrast rather than blending into the panel's light ivory.
  const stage = STAGE_BACKGROUNDS.find((bg) => bg.id === activeBackgroundId) ?? STAGE_BACKGROUNDS[0];
  renderer.setClearColor(stage.hex, 1);
  renderer.render(scene, camera);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(renderer.domElement, 0, 0, size, size);

  material.dispose();
  cache.set(key, canvas);
  return canvas;
}

export function clearSwatchCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
