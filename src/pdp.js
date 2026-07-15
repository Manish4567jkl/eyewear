import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModel } from "./loader.js";
import { logSceneStructure } from "./sceneInspector.js";
import { createFrameMaterial, FRAME_PRESET_NAMES, getFramePresetSwatch } from "./frameMaterial.js";
import { createLensMaterial, LENS_PRESET_NAMES } from "./lensMaterial.js";
import { createTextMaterial, TEXT_PRESET_NAMES, getTextPresetSwatch } from "./textMaterial.js";
import { createAcetateMaterial, ACETATE_PRESET_NAMES } from "./acetateMaterial.js";
import { classifyMesh } from "./meshCategoryMap.js";
import { swatchGradient } from "./swatchGradient.js";
import { loadStudioEnvironment, createShadowCatcherGround } from "./environment.js";
import {
  setSwatchEnvironment,
  getSwatchCanvas,
  isSwatchEnvironmentReady,
  getStageBackgrounds,
  setStageBackground,
  getActiveStageBackground,
} from "./swatchRenderer.js";
import { createBackdrop, BACKDROP_PRESETS, getBackdropThumbnail } from "./backdrop.js";
import { gsap, SplitText, initSmoothScroll, EASE, DUR } from "./motion.js";
import { initCraftSequence, renderCraftSteps } from "./craftSequence.js";
import { initBackgroundCrossfade } from "./bgCrossfade.js";
import {
  getProduct,
  getCollection,
  getSiblingProducts,
  formatPrice,
  DEFAULT_CRAFT_STEPS,
} from "./data/products.js";

const DEFAULT_MODEL_URL = "/models/aviator-glass3.glb";

// ==========================================================================
// Resolve the product this page is for from the URL (/products/<slug>/) — this whole
// file is now a template shared by every product, not hardcoded to any one of them.
// ==========================================================================
function slugFromPath() {
  const match = window.location.pathname.match(/\/products\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

const product = getProduct(slugFromPath());

if (!product) {
  document.querySelector("#page").innerHTML = `
    <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:18px;font-family:'Cormorant Garamond',serif;">
      <h1 style="font-style:italic;font-size:42px;margin:0;">Product Not Found</h1>
      <a href="/index.html" style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Return Home →</a>
    </div>`;
  throw new Error(`[pdp] No product found for slug "${slugFromPath()}"`);
}

const collection = getCollection(product.collection);
document.title = `Maison Vellora — ${product.name}`;

// Acetate products load a different model and go through a different material/rail
// pipeline entirely — see acetateMaterial.js and the mesh classification below.
const isAcetate = product.frameConstruction === "acetate";
const MODEL_URL = product.model ?? DEFAULT_MODEL_URL;

// ---------- Breadcrumb + hero copy, from data ----------
document.querySelector("#breadcrumb").innerHTML = `
  <a href="/index.html">Home</a><span class="sep">/</span>
  <a href="/collections/${collection.slug}/">${collection.name}</a><span class="sep">/</span>
  <span class="current">${product.name}</span>`;

document.querySelector("#hero-eyebrow").textContent = collection.eyebrow;
document.querySelector("#hero-name").textContent = product.name;
document.querySelector("#hero-description").textContent = product.description;
document.querySelector("#hero-cta").textContent = `Configure your own — from ${formatPrice(product.price)}`;

// ---------- Spec sheet, from data ----------
document.querySelector("#spec-columns").innerHTML = product.specs
  .map(
    (column) =>
      `<ul class="spec-list">${column
        .map((row) => `<li><span class="spec-label">${row.label}</span><span class="spec-value">${row.value}</span></li>`)
        .join("")}</ul>`,
  )
  .join("");

document.querySelector("#details-footnote").textContent =
  "Hand-finished in a small atelier outside Geneva — measurements vary by a millimeter, as hand work does.";

// ---------- Craft: bespoke story for the flagship, shared brand story otherwise ----------
const craftSteps = product.craft ?? DEFAULT_CRAFT_STEPS;
document.querySelector("#craft-title").textContent = product.craft
  ? `The Making of ${product.name}`
  : "Material as Argument";
renderCraftSteps(document.querySelector("#craft-stack"), craftSteps);

// ---------- More from the collection ----------
const siblings = getSiblingProducts(product, 3);
document.querySelector("#more-eyebrow").textContent = collection.eyebrow;
document.querySelector("#more-title").textContent = `More from ${collection.name}`;
document.querySelector("#look-grid").innerHTML = siblings
  .map(
    (sib) => `
    <a class="look-card reveal" href="/products/${sib.slug}/">
      <div class="look-swatch" style="background:${swatchGradient(sib)}"></div>
      <h3 class="look-name">${sib.name}</h3>
      <p class="look-desc">${sib.description}</p>
      <span class="text-link">View <span class="glyph">→</span></span>
    </a>`,
  )
  .join("");
if (siblings.length === 0) document.querySelector("#more-from-collection").style.display = "none";

// ==========================================================================
// Below this point: the exact same 3D configurator/render pipeline the original
// single-product build used, just seeded from `product` instead of hardcoded values.
// ==========================================================================

const canvas = document.querySelector("#app");
const stageEl = document.querySelector("#stage");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
const backdrop = createBackdrop();
scene.environmentIntensity = 1.2;

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0.3, 0.2, 0.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

function updateStageSize() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  backdrop.resize(w, h);
}

updateStageSize();
new ResizeObserver(updateStageSize).observe(stageEl);

const detailCanvas = document.querySelector("#detail-app");
const detailStageEl = document.querySelector(".rotate-stage-wrap");

let detailRenderer = null;
let detailCamera = null;
let detailControls = null;

if (detailCanvas && detailStageEl) {
  detailRenderer = new THREE.WebGLRenderer({ canvas: detailCanvas, antialias: true, alpha: true });
  detailRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  detailRenderer.outputColorSpace = THREE.SRGBColorSpace;
  detailRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  detailRenderer.toneMappingExposure = 1.15;
  detailRenderer.shadowMap.enabled = true;
  detailRenderer.shadowMap.type = THREE.VSMShadowMap;

  detailCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  detailCamera.position.set(0.3, 0.15, 0.42);

  detailControls = new OrbitControls(detailCamera, detailRenderer.domElement);
  detailControls.enableDamping = true;
  detailControls.enablePan = false;
  detailControls.autoRotate = true;
  detailControls.autoRotateSpeed = 2.4;
  detailControls.target.set(0, 0, 0);
  detailControls.minDistance = 0.01;
  detailControls.maxDistance = 100;

  detailControls.addEventListener("start", () => {
    detailControls.autoRotate = false;
  });
  detailControls.addEventListener("end", () => {
    detailControls.autoRotate = true;
  });

  function updateDetailStageSize() {
    const w = detailStageEl.clientWidth;
    const h = detailStageEl.clientHeight;
    detailRenderer.setSize(w, h);
    detailCamera.aspect = w / h;
    detailCamera.updateProjectionMatrix();
  }

  updateDetailStageSize();
  new ResizeObserver(updateDetailStageSize).observe(detailStageEl);
}

let mainEnvMap = null;
let detailEnvMap = null;

loadStudioEnvironment(renderer, "/studio_small_09_2k.hdr")
  .then((envMap) => {
    mainEnvMap = envMap;
    scene.environment = envMap;
    frameMaterial?.setEnvironment(envMap);
    hingeMaterial.setEnvironment(envMap);
    handlesMaterial?.setEnvironment(envMap);
    acetateMaterial?.setEnvironment(envMap);
    setSwatchEnvironment(envMap);
    materialRail?.rerenderActive();
  })
  .catch((error) => {
    console.error("Failed to load studio HDRI environment:", error);
  });

if (detailRenderer) {
  loadStudioEnvironment(detailRenderer, "/studio_small_09_2k.hdr")
    .then((envMap) => {
      detailEnvMap = envMap;
    })
    .catch((error) => {
      console.error("Failed to load detail-stage studio HDRI environment:", error);
    });
}

const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.0);
keyLight.position.set(0.35, 0.45, 0.3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.radius = 10;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);
scene.add(keyLight.target);

const fillLight = new THREE.DirectionalLight(0xf5f0ff, 0.3);
fillLight.position.set(-0.4, 0.25, -0.2);
scene.add(fillLight);

const shadowGround = createShadowCatcherGround();
scene.add(shadowGround);

const placeholderMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  roughness: 0.5,
  metalness: 0.1,
});

// Product data seeds the initial finish/tint/text instead of a hardcoded constant.
// Acetate frames have no per-part metal palette — one shared material, one color
// control — and no separate temple/handles mesh to control, so frameMaterial and
// handlesMaterial only exist for metal products.
const frameMaterial = isAcetate ? null : createFrameMaterial(product.frameFinish);
const acetateMaterial = isAcetate ? createAcetateMaterial(product.acetateColor) : null;
const lensMaterial = createLensMaterial(product.lensTint);

const hingeMaterial = createFrameMaterial(isAcetate ? (product.hingeFinish ?? "gunmetal") : product.frameFinish);
hingeMaterial.setHingeFinish = hingeMaterial.setFrameFinish;

const handlesMaterial = isAcetate ? null : createFrameMaterial(product.frameFinish);
if (handlesMaterial) handlesMaterial.setHandlesFinish = handlesMaterial.setFrameFinish;

const textMaterial = createTextMaterial(product.textColor ?? "silver");

// Mesh naming is per-model, not per-construction-type — verified against each model's
// actual scene graph, not guessed. Two different acetate-bodied models (acetate.glb,
// cool-sunglasses.glb) use entirely different node names for the same *kind* of part,
// so the category map is keyed by model URL, not by a single "acetate" vs "metal"
// switch — every new model just needs its own entry here.
async function init() {
  try {
    const gltf = await loadModel(MODEL_URL);
    const model = gltf.scene;

    logSceneStructure(model, "eyewear_test.glb");

    model.traverse((object) => {
      if (!object.isMesh) return;

      const category = classifyMesh(object, MODEL_URL);
      if (category === "lens") {
        object.material = lensMaterial;
      } else if (category === "hinge") {
        object.material = hingeMaterial;
      } else if (category === "acetate") {
        object.material = acetateMaterial;
      } else if (category === "handles") {
        object.material = handlesMaterial;
      } else if (category === "text") {
        object.material = textMaterial;
      } else if (category === "frame") {
        object.material = frameMaterial;
      } else {
        console.warn(`[materialAssignment] Mesh "${object.name}" did not match any known category.`);
        object.material = placeholderMaterial;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const distance = maxDim * 2.6;
    camera.position.set(distance * 0.55, distance * 0.35, distance * 0.75);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();

    if (detailCamera) {
      const detailDistance = maxDim * 3.1;
      detailCamera.position.set(detailDistance * 0.5, detailDistance * 0.3, detailDistance * 0.8);
      detailCamera.near = maxDim / 100;
      detailCamera.far = maxDim * 100;
      detailCamera.updateProjectionMatrix();
      detailControls.target.set(0, 0, 0);
      detailControls.minDistance = maxDim * 1.6;
      detailControls.maxDistance = maxDim * 7;
      detailControls.update();
    }

    shadowGround.position.y = box.min.y - center.y - maxDim * 0.02;
    shadowGround.scale.setScalar(maxDim * 8);

    keyLight.position.set(maxDim * 2, maxDim * 2.5, maxDim * 1.7);
    keyLight.target.position.set(0, 0, 0);
    fillLight.position.set(-maxDim * 2.3, maxDim * 1.4, -maxDim * 1.1);
    keyLight.shadow.camera.near = maxDim / 50;
    keyLight.shadow.camera.far = maxDim * 10;
    keyLight.shadow.camera.left = -maxDim * 1.5;
    keyLight.shadow.camera.right = maxDim * 1.5;
    keyLight.shadow.camera.top = maxDim * 1.5;
    keyLight.shadow.camera.bottom = -maxDim * 1.5;
    keyLight.shadow.camera.updateProjectionMatrix();

    scene.add(model);
  } catch (error) {
    console.error("Failed to load eyewear model:", error);
  }
}

init();

function applyEnvironment(envMap) {
  if (!envMap) return;
  scene.environment = envMap;
  if (frameMaterial) frameMaterial.envMap = envMap;
  hingeMaterial.envMap = envMap;
  if (handlesMaterial) handlesMaterial.envMap = envMap;
  if (acetateMaterial) acetateMaterial.envMap = envMap;
}

const timer = new THREE.Timer();

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const delta = timer.getDelta();
  backdrop.update(delta);
  frameMaterial?.updateFrameTween(delta);
  acetateMaterial?.updateAcetateTween(delta);
  lensMaterial.updateLensTween(delta);
  hingeMaterial.updateFrameTween(delta);
  handlesMaterial?.updateFrameTween(delta);
  textMaterial.updateTextTween(delta);
  controls.update();

  applyEnvironment(mainEnvMap);
  renderer.clear(true, true, true);
  renderer.render(backdrop.scene, backdrop.camera);
  renderer.clearDepth();
  renderer.render(scene, camera);

  if (detailRenderer) {
    applyEnvironment(detailEnvMap);
    detailControls.update();
    detailRenderer.render(scene, detailCamera);
  }
}

animate();

function formatPresetLabel(name) {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function applyTileVisual(tileEl, category, name, extras) {
  if (!isSwatchEnvironmentReady()) {
    tileEl.classList.add("pending");
    return;
  }
  tileEl.classList.remove("pending");
  const canvas = getSwatchCanvas({ category, presetName: name, size: 320, ...extras });
  tileEl.replaceChildren(canvas);
}

const RAIL_FADE_MS = 160;

function buildMaterialRail(container, sections, { onSelectionChange } = {}) {
  const tabsEl = document.createElement("div");
  tabsEl.className = "rail-tabs";

  const tabIndicatorEl = document.createElement("div");
  tabIndicatorEl.className = "rail-tab-indicator";
  tabsEl.appendChild(tabIndicatorEl);

  const headingEl = document.createElement("div");
  headingEl.className = "rail-heading";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "rail-nav prev";
  prevBtn.setAttribute("aria-label", "Previous finish");
  prevBtn.textContent = "‹";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "rail-nav next";
  nextBtn.setAttribute("aria-label", "Next finish");
  nextBtn.textContent = "›";

  const trackWrapEl = document.createElement("div");
  trackWrapEl.className = "rail-track-wrap";
  const trackEl = document.createElement("div");
  trackEl.className = "rail-track";
  trackWrapEl.appendChild(trackEl);

  const filmstripEl = document.createElement("div");
  filmstripEl.className = "rail-filmstrip";
  filmstripEl.append(prevBtn, trackWrapEl, nextBtn);

  container.append(tabsEl, headingEl, filmstripEl);

  const bySectionId = new Map(sections.map((section) => [section.id, section]));
  const tabButtons = new Map();
  let activeSectionId = sections[0].id;
  let currentTiles = new Map();

  function updateHeading(section) {
    headingEl.textContent = `${section.tabLabel} — ${formatPresetLabel(section.activeName)}`;
  }

  function attachTilt(tileEl) {
    const MAX_DEG = 10;
    gsap.set(tileEl, { transformPerspective: 600 });
    const setRotateX = gsap.quickTo(tileEl, "rotateX", { duration: DUR.snap, ease: EASE.hoverIn });
    const setRotateY = gsap.quickTo(tileEl, "rotateY", { duration: DUR.snap, ease: EASE.hoverIn });

    tileEl.addEventListener("mousemove", (event) => {
      const rect = tileEl.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setRotateX(-py * MAX_DEG);
      setRotateY(px * MAX_DEG);
    });
    tileEl.addEventListener("mouseenter", () => {
      gsap.to(tileEl, { scale: 1.04, duration: DUR.snap, ease: EASE.overshoot });
    });
    tileEl.addEventListener("mouseleave", () => {
      gsap.to(tileEl, { rotateX: 0, rotateY: 0, scale: 1, duration: DUR.release, ease: EASE.hoverOut });
    });
  }

  function selectPreset(section, name, { scroll = true } = {}) {
    section.preview(name);
    section.activeName = name;
    currentTiles.forEach((el, presetName) => el.classList.toggle("active", presetName === name));
    updateHeading(section);
    section.onSelect(name);
    onSelectionChange?.();
    if (scroll) currentTiles.get(name)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function renderSection(section) {
    trackEl.innerHTML = "";
    currentTiles = new Map();

    section.presetNames.forEach((name) => {
      const tileWrap = document.createElement("div");
      tileWrap.className = "tile-wrap";
      if (name === section.activeName) tileWrap.classList.add("active");

      const tileEl = document.createElement("div");
      tileEl.className = "tile";
      applyTileVisual(tileEl, section.swatchCategory, name, section.getSwatchExtras?.(name));
      attachTilt(tileEl);

      const underlineEl = document.createElement("div");
      underlineEl.className = "tile-underline";

      const labelEl = document.createElement("div");
      labelEl.className = "tile-label";
      labelEl.textContent = formatPresetLabel(name);

      tileWrap.append(tileEl, underlineEl, labelEl);
      tileWrap.addEventListener("click", () => selectPreset(section, name));
      tileWrap.addEventListener("mouseenter", () => {
        if (name !== section.activeName) section.preview(name);
      });
      tileWrap.addEventListener("mouseleave", () => {
        if (name !== section.activeName) section.preview(section.activeName);
      });

      trackEl.appendChild(tileWrap);
      currentTiles.set(name, tileWrap);
    });

    updateHeading(section);
    currentTiles.get(section.activeName)?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function moveTabIndicator(tabEl, { animate = true } = {}) {
    if (!tabEl) return;
    const target = { x: tabEl.offsetLeft, width: tabEl.offsetWidth };
    if (animate) {
      gsap.to(tabIndicatorEl, { ...target, duration: 0.32, ease: EASE.overshoot });
    } else {
      gsap.set(tabIndicatorEl, target);
    }
  }

  function showSection(id) {
    if (id === activeSectionId && trackEl.childElementCount > 0) return;
    activeSectionId = id;
    tabButtons.forEach((btn, btnId) => btn.classList.toggle("active", btnId === id));
    moveTabIndicator(tabButtons.get(id));

    trackWrapEl.classList.add("fading");
    window.setTimeout(() => {
      renderSection(bySectionId.get(id));
      trackWrapEl.classList.remove("fading");
    }, RAIL_FADE_MS);
  }

  function stepSelection(delta) {
    const section = bySectionId.get(activeSectionId);
    const names = section.presetNames;
    const currentIndex = names.indexOf(section.activeName);
    const nextIndex = (currentIndex + delta + names.length) % names.length;
    selectPreset(section, names[nextIndex]);
  }

  prevBtn.addEventListener("click", () => stepSelection(-1));
  nextBtn.addEventListener("click", () => stepSelection(1));

  sections.forEach((section) => {
    const tabEl = document.createElement("button");
    tabEl.type = "button";
    tabEl.className = "rail-tab";
    tabEl.textContent = section.tabLabel;
    tabEl.addEventListener("click", () => showSection(section.id));
    tabsEl.appendChild(tabEl);
    tabButtons.set(section.id, tabEl);
  });

  tabButtons.get(activeSectionId).classList.add("active");
  renderSection(bySectionId.get(activeSectionId));
  moveTabIndicator(tabButtons.get(activeSectionId), { animate: false });
  window.addEventListener("resize", () => moveTabIndicator(tabButtons.get(activeSectionId), { animate: false }));

  return {
    refreshTile(sectionId, presetName) {
      const section = bySectionId.get(sectionId);
      if (!section || activeSectionId !== sectionId) return;
      const tileWrap = currentTiles.get(presetName);
      if (tileWrap) {
        applyTileVisual(tileWrap.querySelector(".tile"), section.swatchCategory, presetName, section.getSwatchExtras?.(presetName));
      }
      if (section.activeName === presetName) updateHeading(section);
    },
    getActiveName(sectionId) {
      return bySectionId.get(sectionId)?.activeName;
    },
    rerenderActive() {
      renderSection(bySectionId.get(activeSectionId));
    },
  };
}

function buildStagePicker(container, { onChange } = {}) {
  const rowEl = document.createElement("div");
  rowEl.className = "stage-picker";

  const labelEl = document.createElement("div");
  labelEl.className = "stage-picker-label";
  labelEl.textContent = "Stage";

  const dotsEl = document.createElement("div");
  dotsEl.className = "stage-picker-dots";

  const buttons = new Map();
  getStageBackgrounds().forEach((bg) => {
    const dotEl = document.createElement("button");
    dotEl.type = "button";
    dotEl.className = "stage-dot";
    dotEl.style.setProperty("--dot-color", `#${bg.hex.toString(16).padStart(6, "0")}`);
    dotEl.setAttribute("aria-label", bg.label);
    dotEl.title = bg.label;
    if (bg.id === getActiveStageBackground()) dotEl.classList.add("active");

    dotEl.addEventListener("click", () => {
      setStageBackground(bg.id);
      buttons.forEach((el, id) => el.classList.toggle("active", id === bg.id));
      onChange?.();
    });

    dotsEl.appendChild(dotEl);
    buttons.set(bg.id, dotEl);
  });

  rowEl.append(labelEl, dotsEl);
  container.appendChild(rowEl);
}

function buildBackdropPicker(container, backdropInstance) {
  const wrapEl = document.createElement("div");
  wrapEl.className = "backdrop-picker";

  const headingEl = document.createElement("div");
  headingEl.className = "backdrop-picker-heading";
  headingEl.textContent = "Backdrop";

  const rowEl = document.createElement("div");
  rowEl.className = "backdrop-picker-row";

  const tiles = new Map();
  BACKDROP_PRESETS.forEach((preset) => {
    const tileWrap = document.createElement("div");
    tileWrap.className = "backdrop-tile-wrap";
    if (preset.id === backdropInstance.getActiveId()) tileWrap.classList.add("active");

    const tileEl = document.createElement("div");
    tileEl.className = "backdrop-tile";
    tileEl.appendChild(getBackdropThumbnail(preset.id, 160));

    const labelEl = document.createElement("div");
    labelEl.className = "backdrop-tile-label";
    labelEl.textContent = preset.label;

    tileWrap.append(tileEl, labelEl);
    tileWrap.addEventListener("click", () => {
      backdropInstance.setPreset(preset.id);
      tiles.forEach((el, id) => el.classList.toggle("active", id === preset.id));
    });

    rowEl.appendChild(tileWrap);
    tiles.set(preset.id, tileWrap);
  });

  wrapEl.append(headingEl, rowEl);
  container.appendChild(wrapEl);
}

const controlsPanel = document.querySelector("#controls");
buildBackdropPicker(controlsPanel, backdrop);

let currentFramePresetName = product.frameFinish ?? product.hingeFinish ?? "gunmetal";

function frameSwatchAsTextOverride() {
  const swatch = getFramePresetSwatch(currentFramePresetName);
  return {
    baseColor: new THREE.Color(swatch.hex),
    metalness: swatch.metalness,
    roughness: swatch.roughness,
  };
}

function refreshMatchFrameLink() {
  materialRail.refreshTile("text", "matchFrame");
  if (materialRail.getActiveName("text") === "matchFrame") {
    textMaterial.setTextColor("matchFrame", frameSwatchAsTextOverride());
  }
}

// Opticals have no tint to choose (clear lens only) — the rail's fourth tab becomes a
// "Coating" toggle (standard vs. anti-reflective) instead of the full tint palette.
const lensOrCoatingSection =
  product.type === "optical"
    ? {
        id: "lens",
        tabLabel: "Coating",
        swatchCategory: "lens",
        presetNames: ["clear", "antiReflective"],
        activeName: product.lensTint === "antiReflective" ? "antiReflective" : "clear",
        preview: (name) => lensMaterial.setLensTint(name),
        onSelect: () => {},
      }
    : {
        id: "lens",
        tabLabel: "Lens",
        swatchCategory: "lens",
        presetNames: LENS_PRESET_NAMES.filter((name) => name !== "antiReflective"),
        activeName: product.lensTint,
        preview: (name) => lensMaterial.setLensTint(name),
        onSelect: () => {},
      };

// Acetate frames are a single pigmented body — one shared material, one color
// control — rather than the metal frame's per-part finish palette, so the "Frame" tab
// itself is a different kind of section for acetate products, not just a relabeling.
const frameSection = isAcetate
  ? {
      id: "frame",
      tabLabel: "Frame",
      swatchCategory: "acetate",
      presetNames: ACETATE_PRESET_NAMES,
      activeName: product.acetateColor,
      preview: (name) => acetateMaterial.setAcetateColor(name),
      onSelect: () => {},
    }
  : {
      id: "frame",
      tabLabel: "Frame",
      swatchCategory: "frame",
      presetNames: FRAME_PRESET_NAMES,
      activeName: product.frameFinish,
      preview: (name) => frameMaterial.setFrameFinish(name),
      onSelect: (name) => {
        currentFramePresetName = name;
        refreshMatchFrameLink();
      },
    };

// No "Temple" tab for acetate — the body (front + temples) is one continuous piece
// sharing frameSection's own color control, so there's nothing separate to configure.
const handlesSection = isAcetate
  ? null
  : {
      id: "handles",
      tabLabel: "Temple",
      swatchCategory: "frame",
      presetNames: FRAME_PRESET_NAMES,
      activeName: product.frameFinish,
      preview: (name) => handlesMaterial.setHandlesFinish(name),
      onSelect: () => {},
    };

const sectionById = {
  frame: frameSection,
  handles: handlesSection,
  hinge: {
    id: "hinge",
    tabLabel: "Hinge",
    swatchCategory: "frame",
    presetNames: FRAME_PRESET_NAMES,
    activeName: isAcetate ? (product.hingeFinish ?? "gunmetal") : product.frameFinish,
    preview: (name) => hingeMaterial.setHingeFinish(name),
    onSelect: () => {},
  },
  lens: lensOrCoatingSection,
  text: {
    id: "text",
    tabLabel: "Text",
    swatchCategory: "text",
    presetNames: TEXT_PRESET_NAMES,
    getSwatch: (name) => (name === "matchFrame" ? getFramePresetSwatch(currentFramePresetName) : getTextPresetSwatch(name)),
    activeName: product.textColor,
    preview: (name) =>
      textMaterial.setTextColor(name, name === "matchFrame" ? frameSwatchAsTextOverride() : undefined),
    onSelect: () => {},
    getSwatchExtras: (name) =>
      name === "matchFrame"
        ? { frameOverride: frameSwatchAsTextOverride(), cacheKey: `text:matchFrame:${currentFramePresetName}` }
        : {},
  },
};

// Metal products default to the full tab set when a product doesn't specify one;
// acetate products (and any future variant) declare their own via
// `product.configuratorTabs` — see src/data/products.js.
const DEFAULT_TABS = ["frame", "handles", "hinge", "lens", "text"];
const railSections = (product.configuratorTabs ?? DEFAULT_TABS).map((id) => sectionById[id]).filter(Boolean);

function computeReferenceCode(sections) {
  const seed = sections.map((section) => section.activeName).join("|");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const serial = (hash % 9000) + 1000;
  const initials = sections
    .map((section) => (section.activeName.match(/[a-zA-Z]/)?.[0] ?? "X").toUpperCase())
    .join("");
  return `MV·${serial}·${initials}`;
}

const summaryEl = document.createElement("div");
summaryEl.className = "summary";

const summaryHeadEl = document.createElement("div");
summaryHeadEl.className = "summary-head";
const summaryTitleEl = document.createElement("div");
summaryTitleEl.className = "summary-title";
summaryTitleEl.textContent = "Your Configuration";
const summaryRefEl = document.createElement("div");
summaryRefEl.className = "summary-ref";
summaryHeadEl.append(summaryTitleEl, summaryRefEl);

const summaryListEl = document.createElement("ul");
summaryListEl.className = "summary-list";

const summaryFootnoteEl = document.createElement("div");
summaryFootnoteEl.className = "summary-footnote";
summaryFootnoteEl.textContent = "Handcrafted to order";

summaryEl.append(summaryHeadEl, summaryListEl, summaryFootnoteEl);

const keepsakeRefEl = document.querySelector("#keepsake-ref");

function updateSummary() {
  summaryListEl.innerHTML = "";
  railSections.forEach((section) => {
    const item = document.createElement("li");
    const labelSpan = document.createElement("span");
    labelSpan.textContent = section.tabLabel;
    const valueSpan = document.createElement("span");
    valueSpan.textContent = formatPresetLabel(section.activeName);
    item.append(labelSpan, valueSpan);
    summaryListEl.appendChild(item);
  });
  const refCode = `Ref. ${computeReferenceCode(railSections)}`;
  summaryRefEl.textContent = refCode;
  if (keepsakeRefEl) keepsakeRefEl.textContent = refCode;
}

const materialRail = buildMaterialRail(controlsPanel, railSections, { onSelectionChange: updateSummary });
buildStagePicker(controlsPanel, { onChange: () => materialRail.rerenderActive() });
controlsPanel.appendChild(summaryEl);
updateSummary();

requestAnimationFrame(() => {
  controlsPanel.classList.add("panel-visible");
});

// ==========================================================================
// Motion: smooth scroll + scroll-driven choreography.
// ==========================================================================

initSmoothScroll();

const heroNameSplit = SplitText.create("#hero .product-name", { type: "chars" });

gsap.set("#hero .product-name", { opacity: 1 });

gsap.set("#hero .eyebrow", { y: 12 });
gsap.set(heroNameSplit.chars, { yPercent: 130, opacity: 0 });
gsap.set("#hero .description", { y: 12 });
gsap.set("#hero .cta", { y: 8 });
gsap.set("#brand", { y: -8 });
gsap.set("#stage .breadcrumb", { y: -6 });

gsap
  .timeline({ delay: 0.1 })
  .to("#brand", { opacity: 0.85, y: 0, duration: DUR.reveal, ease: EASE.entrance })
  .to("#stage .breadcrumb", { opacity: 0.7, y: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.3")
  .to("#hero .eyebrow", { opacity: 1, y: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.3")
  .to(
    heroNameSplit.chars,
    { yPercent: 0, opacity: 1, duration: 0.6, ease: EASE.overshoot, stagger: 0.02 },
    "-=0.25",
  )
  .to("#hero .description", { opacity: 0.8, y: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.4")
  .to("#hero .cta", { opacity: 0.6, y: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.3");

gsap.to("#hero", {
  yPercent: -22,
  opacity: 0.2,
  ease: EASE.scrub,
  scrollTrigger: { trigger: "#page", start: "top top", end: "bottom top", scrub: true },
});

gsap.from(".details .section-head", {
  opacity: 0,
  y: 18,
  duration: DUR.reveal,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".details .section-head", start: "top 85%" },
});

gsap.to(".spec-list li", {
  opacity: 1,
  stagger: 0.06,
  duration: 0.4,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".spec-columns", start: "top 80%" },
});

gsap.from(".details-footnote", {
  opacity: 0,
  duration: DUR.reveal,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".details-footnote", start: "top 90%" },
});

// ---------- Craft: shared pinned sequence ----------
initCraftSequence("#craft");
initBackgroundCrossfade("#craft");

// ---------- Every Angle: scales in from slightly smaller with a soft blur-to-focus ---------
gsap.from(".rotate-section .section-head", {
  opacity: 0,
  y: 18,
  duration: DUR.reveal,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".rotate-section .section-head", start: "top 85%" },
});

gsap.fromTo(
  ".rotate-stage-wrap",
  { opacity: 0, scale: 0.92, filter: "blur(6px)" },
  {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    duration: DUR.revealLg,
    ease: EASE.entrance,
    scrollTrigger: { trigger: ".rotate-stage-wrap", start: "top 85%", once: true },
  },
);

// ---------- Presentation: icon trio stagger, then the keepsake card ----------
gsap.from(".presentation .section-head", {
  opacity: 0,
  y: 18,
  duration: DUR.reveal,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".presentation .section-head", start: "top 85%" },
});

gsap.from(".presentation-item", {
  opacity: 0,
  y: 24,
  stagger: 0.08,
  duration: DUR.reveal,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".presentation-grid", start: "top 85%" },
});

gsap.from(".keepsake-card", {
  opacity: 0,
  y: 20,
  scale: 0.97,
  duration: DUR.revealLg,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".keepsake-card", start: "top 88%" },
});

// ---------- More from the Collection: cards stagger in, scrub-tied ---------
gsap.from(".more-from-collection .section-head", {
  opacity: 0,
  y: 18,
  duration: DUR.reveal,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".more-from-collection .section-head", start: "top 85%" },
});

gsap.from(".look-card", {
  opacity: 0,
  y: 50,
  scale: 0.95,
  stagger: 0.08,
  ease: EASE.entrance,
  scrollTrigger: {
    trigger: ".look-grid",
    start: "top 85%",
    end: "top 40%",
    scrub: 0.4,
  },
});
