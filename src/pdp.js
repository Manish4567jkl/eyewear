import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModel } from "./loader.js";
import { logSceneStructure } from "./sceneInspector.js";
import { createFrameMaterial, FRAME_PRESET_NAMES, getFramePresetSwatch } from "./frameMaterial.js";
import {
  createLensMaterial,
  LENS_PRESET_NAMES,
  LENS_COATING_NAMES,
  getLensPresetSwatch,
} from "./lensMaterial.js";
import { createTextMaterial, TEXT_PRESET_NAMES, getTextPresetSwatch } from "./textMaterial.js";
import {
  createAcetateMaterial,
  fitAcetatePatternScale,
  ACETATE_PRESET_NAMES,
  getAcetatePresetSwatch,
} from "./acetateMaterial.js";
import { classifyMesh } from "./meshCategoryMap.js";
import { loadStudioEnvironment, createShadowCatcherGround } from "./environment.js";
import { setSwatchEnvironment, getSwatchCanvas, isSwatchEnvironmentReady } from "./swatchRenderer.js";
import { createBackdrop, BACKDROP_PRESETS, getBackdropThumbnail, isPresetLight } from "./backdrop.js";
import { gsap, crossfadeText, EASE, DUR } from "./motion.js";
import { getProduct, getCollection } from "./data/products.js";
import { createLoadingTransition, navigateWithLoadingTransition } from "./loadingTransition.js";
import { initPageTransitionLinks, revealStage } from "./pageTransition.js";

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

// This page (the 3D View/Configurator) is no longer a landing experience anywhere on
// the site — On Mannequin is the default wherever a link would have led here, so any
// direct visit (bookmark, typed URL, a card that still points at /products/<slug>/)
// forwards straight to that page for this same product instead of rendering the 3D
// View first. replace(), not a plain href set, so the redirect doesn't leave a
// products/<slug>/ entry in history to bounce back into. Thrown after to halt this
// script rather than let the (about-to-be-unloaded) page keep doing real work below.
window.location.replace(`/mannequin.html?slug=${product.slug}`);
throw new Error("[pdp] Redirecting to On Mannequin — the Configurator is no longer a landing page.");

const collection = getCollection(product.collection);
document.title = `Thorne & Vale — ${product.name}`;

// Shared-element continuity: matches the swatch view-transition-name set on the
// collection grid card and home's collection plate (see collection.js/home.js) so a
// Chromium browser morphs that exact card into this stage on click — see
// view-transitions.css for the timing/easing this pairs with.
document.querySelector("#stage").style.viewTransitionName = `product-${product.slug}`;

// Acetate products load a different model and go through a different material/rail
// pipeline entirely — see acetateMaterial.js and the mesh classification below.
const isAcetate = product.frameConstruction === "acetate";
const MODEL_URL = product.model ?? DEFAULT_MODEL_URL;

// ---------- Breadcrumb, from data ----------
document.querySelector("#breadcrumb").innerHTML = `
  <a href="/index.html" data-nav-direction="back">Home</a><span class="sep">/</span>
  <a href="/collections/${collection.slug}/" data-nav-direction="back">${collection.name}</a><span class="sep">/</span>
  <span class="current">${product.name}</span>`;

initPageTransitionLinks();

// ==========================================================================
// Below this point: the exact same 3D configurator/render pipeline the original
// single-product build used, just seeded from `product` instead of hardcoded values.
// ==========================================================================

const canvas = document.querySelector("#app");
const stageEl = document.querySelector("#stage");

// Hidden until the model + environment are actually ready (see the loading transition
// wiring near init(), below) — otherwise the canvas shows an empty, unlit clear color
// for however long the load takes, which is exactly the jarring gap the loader exists
// to cover.
canvas.style.opacity = "0";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
// scene.background is set each frame from the backdrop capture (see animate()), so
// three clears and draws it itself — autoClear stays on, unlike the previous
// manual two-pass composite this replaced.
renderer.autoClear = true;

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

// Captured (rather than left as a bare fire-and-forget chain) so the loading
// transition below can gate on it alongside the model — "environment fully loaded"
// is part of what "ready" means for this scene, not just the mesh.
const environmentPromise = loadStudioEnvironment(renderer, "/studio_small_09_2k.hdr")
  .then((envMap) => {
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
// control, and (usually) no separate temple/handles mesh to control, so frameMaterial
// only exists for metal products. The Corbin is the one exception — see
// hasIndependentTemple below — so handlesMaterial isn't quite as simple as "metal only".
const frameMaterial = isAcetate ? null : createFrameMaterial(product.frameFinish);
const acetateMaterial = isAcetate ? createAcetateMaterial(product.acetateColor) : null;
const lensMaterial = createLensMaterial(product.lensTint);

const hingeMaterial = createFrameMaterial(isAcetate ? (product.hingeFinish ?? "gunmetal") : product.frameFinish);
hingeMaterial.setHingeFinish = hingeMaterial.setFrameFinish;

// The Corbin's temple ("Temple L"/"Temple L.001" in cool-sunglasses.glb) is a genuinely
// separate mesh from the front, unlike the Cassian/other acetate builds where front and
// temple are one continuous piece — it's just lumped into the same "acetate"
// classifyMesh() category as the front by meshCategoryMap.js (see that file's own
// comment on why). Matched by product slug rather than touching that shared map, which
// lensDetail.js/mannequinScene.js/homeViewer.js also read and aren't being given an
// independent Temple control here — see the isCorbinTemple check in init() below.
const hasIndependentTemple = product.slug === "the-corbin";
const handlesMaterial = hasIndependentTemple
  ? createAcetateMaterial(product.templeColor ?? product.acetateColor)
  : isAcetate
    ? null
    : createFrameMaterial(product.frameFinish);
if (handlesMaterial) {
  handlesMaterial.setHandlesFinish = hasIndependentTemple ? handlesMaterial.setAcetateColor : handlesMaterial.setFrameFinish;
}

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

    const acetateMeshes = [];
    const handlesMeshes = [];

    model.traverse((object) => {
      if (!object.isMesh) return;

      const category = classifyMesh(object, MODEL_URL);
      // See hasIndependentTemple's own comment above — this is the one place that
      // override actually applies, pulling the Corbin's temple mesh out of the
      // "acetate" category it shares with the front in meshCategoryMap.js.
      const isCorbinTemple = hasIndependentTemple && /^Temple/i.test(object.name);

      if (isCorbinTemple) handlesMeshes.push(object);
      else if (category === "acetate") acetateMeshes.push(object);

      if (isCorbinTemple) {
        object.material = handlesMaterial;
      } else if (category === "lens") {
        object.material = lensMaterial;
      } else if (category === "hinge") {
        object.material = hingeMaterial;
      } else if (category === "acetate") {
        object.material = acetateMaterial;
      } else if (category === "handles") {
        object.material = handlesMaterial;
      } else if (category === "text") {
        // The Ostrande's "text" mesh is the real Carrera wordmark baked into that
        // source asset — hidden outright rather than recolored (see DEFAULT_TABS
        // below, which no longer offers a Text swatch for the same reason).
        object.visible = false;
      } else if (category === "frame") {
        object.material = frameMaterial;
      } else {
        console.warn(`[materialAssignment] Mesh "${object.name}" did not match any known category.`);
        object.material = placeholderMaterial;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });

    // Acetate pigment is authored in "blotches across the frame", so it needs the
    // frame's real object-space size before it renders.
    if (acetateMaterial) fitAcetatePatternScale(acetateMaterial, acetateMeshes);
    // The Corbin's temple is its own separate acetateMaterial instance (see
    // hasIndependentTemple above), so it needs this same fit run against its own
    // meshes — the front's fit above only measured acetateMeshes, which no longer
    // includes the temple now that it's pulled into handlesMeshes instead.
    if (hasIndependentTemple) fitAcetatePatternScale(handlesMaterial, handlesMeshes);

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

// Shown the instant this page's script runs (covering the gap this page previously
// left blank while the model loaded) and dismissed only once both the model and the
// environment have actually resolved — never on a guessed timeout. See
// navigateWithLoadingTransition in src/loadingTransition.js for the matching overlay
// shown on the homepage before the click that lands here.
const sceneLoader = createLoadingTransition({ palette: "dark", plateNumber: "03" });

Promise.all([init(), environmentPromise]).then(() => {
  // The model/environment promises resolving only means the data is in memory — the
  // GPU hasn't compiled shaders for these materials yet, and that compile (custom
  // frame/acetate/lens/text materials, done lazily on whichever render call first
  // touches them) can itself take seconds. Forcing it now, synchronously, before the
  // reveal — rather than letting it happen on the next animate() frame after the
  // canvas is already visible — is what makes "loader gone" actually mean "the first
  // frame is ready to render," not just "the fetch finished."
  renderer.compile(backdrop.scene, backdrop.camera);
  scene.background = backdrop.capture(renderer);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);

  gsap.to(canvas, { opacity: 1, duration: DUR.revealLg, ease: EASE.entrance });
  sceneLoader.hide();
  controlsPanel.classList.add("panel-visible");
  // The panel itself slides/fades in as a block via its own CSS transition (see
  // #controls.panel-visible) — this staggers its actual content (eyebrow → title →
  // rail chrome) inside that same motion, rather than the rail arriving as one flat
  // block. Fires only once the rail is fully built (all the buildX() calls further
  // down this file have already run synchronously by the time this promise settles).
  revealStage({
    eyebrow: ".configurator-eyebrow",
    headline: "#configurator-title",
    body: ["#breadcrumb", ".rail-tabs", ".mode-list", ".angles-row"],
  });
});

const timer = new THREE.Timer();

// The backdrop capture is a full extra render pass (see backdrop.js) on top of the main
// scene render, every frame. Its own drift is deliberately "barely perceptible" (see its
// shader comment), so re-capturing on every other frame instead of every frame halves that
// pass's cost with no visible difference — the texture just persists between captures.
let backdropTexture = null;
let backdropFrame = 0;

function animate() {
  requestAnimationFrame(animate);
  // Skip all work while the tab is backgrounded — nothing is visible to update anyway.
  if (document.hidden) return;
  timer.update();
  const delta = timer.getDelta();
  backdrop.update(delta);
  frameMaterial?.updateFrameTween(delta);
  acetateMaterial?.updateAcetateTween(delta);
  lensMaterial.updateLensTween(delta);
  hingeMaterial.updateFrameTween(delta);
  if (hasIndependentTemple) handlesMaterial?.updateAcetateTween(delta);
  else handlesMaterial?.updateFrameTween(delta);
  textMaterial.updateTextTween(delta);
  controls.update();

  // The backdrop is captured to a texture and assigned as scene.background rather than
  // being blitted as a manual pre-pass. Visually identical — three draws a background
  // texture as a fullscreen quad ahead of the scene — but it also makes the backdrop
  // visible to the transmission pass, which is what lets translucent acetate actually
  // refract what is behind it.
  backdropFrame++;
  if (!backdropTexture || backdropFrame % 2 === 0) {
    backdropTexture = backdrop.capture(renderer);
  }
  scene.background = backdropTexture;
  renderer.render(scene, camera);
}

animate();

function formatPresetLabel(name) {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// A faint colored halo behind each tile, tinted from that preset's own real swatch hex
// (not a guess) — meant to hint the metal/tint/color before the eye even settles on the
// sphere render itself, so presets that read similarly at a glance (see frameMaterial.js)
// are still quick to tell apart. Purely a backdrop behind the tile; the active tile's own
// red selection ring (.tile-wrap.active .tile) is untouched.
function getTileTintHex(category, name, frameOverride) {
  if (category === "lens") return getLensPresetSwatch(name)?.hex;
  if (category === "acetate") return getAcetatePresetSwatch(name)?.hex;
  if (category === "text") {
    if (name === "matchFrame" && frameOverride) return `#${frameOverride.baseColor.getHexString()}`;
    return getTextPresetSwatch(name)?.hex;
  }
  return getFramePresetSwatch(name)?.hex;
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
    crossfadeText(headingEl, `${section.tabLabel} — ${formatPresetLabel(section.activeName)}`);
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

      const extras = section.getSwatchExtras?.(name);
      const tintHex = getTileTintHex(section.swatchCategory, name, extras?.frameOverride);
      if (tintHex) tileWrap.style.setProperty("--tile-tint", tintHex);

      const tileEl = document.createElement("div");
      tileEl.className = "tile";
      applyTileVisual(tileEl, section.swatchCategory, name, extras);
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

const ANGLE_ROMAN = ["i", "ii", "iii", "iv"];
const ANGLE_DEGREES = [10, 80, 190, 260];

// "On Mannequin" and "Lens Detail" have no dedicated view built yet — each links out
// to its own placeholder page, consistent with how they're wired on the homepage's
// Plate 03 (see src/home.js). "3D View" is the only real, in-place mode here, so it's
// just a permanently-active label, not a button with nothing else to switch to.
function buildFramingAndAngles(container) {
  const modeListEl = document.createElement("div");
  modeListEl.className = "mode-list";
  modeListEl.innerHTML = `
    <span class="mode-item is-active">3D View</span>
    <a class="mode-item" href="/mannequin.html">On Mannequin</a>
    <a class="mode-item" href="/lens-detail.html">Lens Detail</a>`;

  const anglesRowEl = document.createElement("div");
  anglesRowEl.className = "angles-row";
  anglesRowEl.innerHTML =
    `<span class="angles-label">fig.</span>` +
    ANGLE_ROMAN.map((rn, i) => `<button type="button" class="angle-btn" data-index="${i}">${rn}</button>`).join("");

  container.append(modeListEl, anglesRowEl);

  // These hand off to a different page's own 3D scene (mannequin.html/lens-detail.html
  // are both the light "paper" palette) — intercept so the loading transition plays
  // before the hard navigation, same as the homepage's VIEW PLATE crosshair.
  modeListEl.querySelectorAll("a.mode-item").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigateWithLoadingTransition(link.getAttribute("href"), { palette: "light", plateNumber: "03", leadEl: link });
    });
  });

  const angleButtons = Array.from(anglesRowEl.querySelectorAll(".angle-btn"));
  // Mirrors the homepage plate: stays null (no explicit pick yet) rather than 0, so a
  // future "resume auto-rotate" style check elsewhere could still tell "never touched"
  // from "picked the first one" — displayIndex just backfills the default for display.
  let currentAngleIndex = null;

  function renderAngleActiveStates() {
    const displayIndex = currentAngleIndex ?? 0;
    angleButtons.forEach((btn, i) => btn.classList.toggle("is-active", i === displayIndex));
  }

  function setAngle(i) {
    currentAngleIndex = i;
    const target = controls.target;
    const offset = camera.position.clone().sub(target);
    const radius = Math.hypot(offset.x, offset.z);
    const rad = (ANGLE_DEGREES[i] * Math.PI) / 180;
    camera.position.x = target.x + radius * Math.sin(rad);
    camera.position.z = target.z + radius * Math.cos(rad);
    controls.update();
    renderAngleActiveStates();
  }

  angleButtons.forEach((btn) => btn.addEventListener("click", () => setAngle(Number(btn.dataset.index))));
  renderAngleActiveStates();
}

// ---------- Model switcher: swap to a different frame entirely ----------
// This whole page is seeded from ONE product resolved from the URL at module load (see
// slugFromPath/`product` at the top of the file) — MODEL_URL, isAcetate, every material, and
// railSections are all fixed to it. Rebuilding all of that live for a different product would
// mean re-deriving every one of those rather than reusing what's already correct. Each product
// already has its own fully working PDP behind its own URL — including its own designated
// swatches (metal frame finishes vs. acetate color, via isAcetate/railSections above) — so
// this reuses that outright: a real navigation, with the same loading-transition wipe already
// used for the mode-list's On Mannequin/Lens Detail links, not a live in-scene swap.
const MODEL_SWITCHER_PRODUCTS = [
  { slug: "the-ostrande", name: "The Ostrande" },
  { slug: "the-cassian", name: "The Cassian" },
  { slug: "the-corbin", name: "The Corbin" },
];

function buildModelSwitcher(container) {
  const headingEl = document.createElement("div");
  headingEl.className = "backdrop-picker-heading";
  headingEl.textContent = "Model";
  headingEl.style.marginBottom = "12px";

  const listEl = document.createElement("div");
  listEl.className = "mode-list";

  MODEL_SWITCHER_PRODUCTS.forEach((p) => {
    const isActive = p.slug === product.slug;
    const el = document.createElement(isActive ? "span" : "a");
    el.className = `mode-item${isActive ? " is-active" : ""}`;
    el.textContent = p.name;
    if (!isActive) {
      el.setAttribute("href", `/products/${p.slug}/`);
      el.addEventListener("click", (e) => {
        e.preventDefault();
        navigateWithLoadingTransition(`/products/${p.slug}/`, { palette: "light", plateNumber: "03", leadEl: el });
      });
    }
    listEl.appendChild(el);
  });

  container.append(headingEl, listEl);
}

function buildBackdropPicker(container, backdropInstance, { onChange } = {}) {
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
      onChange?.();
    });

    rowEl.appendChild(tileWrap);
    tiles.set(preset.id, tileWrap);
  });

  wrapEl.append(headingEl, rowEl);
  container.appendChild(wrapEl);
}

const controlsPanel = document.querySelector("#controls");
const configuratorTitleEl = document.querySelector("#configurator-title");

// "Backdrop — Frame" — mirrors the homepage plate's live title treatment, kept in
// sync with just these two selections (frameSection is defined further down; this
// is only ever invoked after it exists, via the callbacks wired below).
function updateConfiguratorTitle() {
  const activeBackdrop = BACKDROP_PRESETS.find((preset) => preset.id === backdrop.getActiveId());
  configuratorTitleEl.textContent = `${activeBackdrop?.label ?? ""} — ${formatPresetLabel(frameSection.activeName)}`;

  // The close-plate/brand/breadcrumb overlays sitting on #stage are styled cream-on-dark,
  // matching the rest of the site — which held only because every backdrop used to be dark.
  // Presets like Glacier are light, so those overlays need to flip to dark-on-light or they
  // disappear into it (see the .stage-bg-light rules below). This is the one place both the
  // initial load and every later backdrop swap already funnel through.
  document.body.classList.toggle("stage-bg-light", isPresetLight(backdrop.getActiveId()));
}

buildModelSwitcher(controlsPanel);
buildFramingAndAngles(controlsPanel);
buildBackdropPicker(controlsPanel, backdrop, { onChange: updateConfiguratorTitle });

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
        presetNames: LENS_COATING_NAMES,
        activeName: product.lensTint === "antiReflective" ? "antiReflective" : "clear",
        preview: (name) => lensMaterial.setLensTint(name),
        onSelect: () => {},
      }
    : {
        id: "lens",
        tabLabel: "Lens",
        swatchCategory: "lens",
        presetNames: LENS_PRESET_NAMES,
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
      onSelect: () => updateConfiguratorTitle(),
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
        updateConfiguratorTitle();
      },
    };

// No "Temple" tab for acetate builds where front and temple are one continuous piece
// sharing frameSection's own color control — nothing separate to configure. The
// Corbin is the one exception (see hasIndependentTemple above), with its own acetate
// color control distinct from the front's.
const handlesSection = hasIndependentTemple
  ? {
      id: "handles",
      tabLabel: "Temple",
      swatchCategory: "acetate",
      presetNames: ACETATE_PRESET_NAMES,
      activeName: product.templeColor ?? product.acetateColor,
      preview: (name) => handlesMaterial.setAcetateColor(name),
      onSelect: () => {},
    }
  : isAcetate
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
// `product.configuratorTabs` — see src/data/products.js. No "text" — the Ostrande's
// only "text" mesh is the Carrera wordmark baked into the source asset, hidden
// outright (see the "text" branch in init() above) rather than offered as a swatch.
const DEFAULT_TABS = ["frame", "handles", "hinge", "lens"];
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
const summaryDashEl = document.createElement("div");
summaryDashEl.className = "summary-dash";
summaryDashEl.textContent = "—";
const summaryRefEl = document.createElement("div");
summaryRefEl.className = "summary-ref";
summaryHeadEl.append(summaryTitleEl, summaryDashEl, summaryRefEl);

const summaryListEl = document.createElement("ul");
summaryListEl.className = "summary-list";

const summaryFootnoteEl = document.createElement("div");
summaryFootnoteEl.className = "summary-footnote";
summaryFootnoteEl.textContent = "Handcrafted to order";

summaryEl.append(summaryHeadEl, summaryListEl, summaryFootnoteEl);

// Persistent <li> value spans, built once — so a selection change crossfades the one
// row that actually changed (see crossfadeText in motion.js) instead of tearing down
// and rebuilding the whole list on every click, which would just snap.
let summaryValueEls = null;

function updateSummary() {
  const refCode = `Ref. ${computeReferenceCode(railSections)}`;

  if (!summaryValueEls) {
    summaryListEl.innerHTML = "";
    summaryValueEls = railSections.map((section) => {
      const item = document.createElement("li");
      const labelSpan = document.createElement("span");
      labelSpan.textContent = section.tabLabel;
      const valueSpan = document.createElement("span");
      valueSpan.textContent = formatPresetLabel(section.activeName);
      item.append(labelSpan, valueSpan);
      summaryListEl.appendChild(item);
      return valueSpan;
    });
    summaryRefEl.textContent = refCode;
  } else {
    railSections.forEach((section, i) => crossfadeText(summaryValueEls[i], formatPresetLabel(section.activeName)));
    crossfadeText(summaryRefEl, refCode);
  }
}

const materialRail = buildMaterialRail(controlsPanel, railSections, { onSelectionChange: updateSummary });
controlsPanel.appendChild(summaryEl);
updateSummary();
updateConfiguratorTitle();

