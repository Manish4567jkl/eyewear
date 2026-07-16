import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModel } from "./loader.js";
import { logSceneStructure } from "./sceneInspector.js";
import { createFrameMaterial, FRAME_PRESET_NAMES, getFramePresetSwatch } from "./frameMaterial.js";
import { createLensMaterial, LENS_PRESET_NAMES, getLensPresetSwatch } from "./lensMaterial.js";
import { createTextMaterial, TEXT_PRESET_NAMES, getTextPresetSwatch } from "./textMaterial.js";
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
import { gsap, EASE, DUR } from "./motion.js";

const MODEL_URL = "/models/aviator-glass3.glb";

const canvas = document.querySelector("#app");
const stageEl = document.querySelector("#stage");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// ACES already protects highlights from clipping, so a modest lift here adds punch to
// polished-metal specular response without any real risk of blowing anything out.
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
// The backdrop is rendered as its own pass before the product scene each frame (see
// animate() below), so the canvas can't be auto-cleared between the two — otherwise
// the second render() call would wipe out the backdrop pass that just ran.
renderer.autoClear = false;

const scene = new THREE.Scene();

// A shader-based backdrop, entirely separate from scene.environment (which is what
// actually lights the metal/lens materials via IBL) — see backdrop.js. It has its own
// scene/camera and is drawn first each frame; scene.background is deliberately left
// unset so the product scene renders transparent over whatever the backdrop pass left
// in the color buffer.
const backdrop = createBackdrop();

// Modest global default. The metal materials (frame/hinge/handles) now get their own
// envMap assigned explicitly below once the HDRI loads, via material.setEnvironment() —
// that keeps them off the WebGLRenderer code path that otherwise force-overwrites a
// material's envMapIntensity with this scene-level value whenever material.envMap is
// null, so their own (much higher, "hero" reflection) envMapIntensity actually sticks.
scene.environmentIntensity = 1.2;

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0.3, 0.2, 0.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// The 3D viewport is now a real grid column (#stage), not the full window with a panel
// floating over it, so the camera just needs to match that column's own size — no more
// view-offset trick to dodge a floating panel; the stage element is the whole frame now.
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

// Real studio HDRI drives PBR reflections/ambient lighting on the frame metal.
loadStudioEnvironment(renderer, "/studio_small_09_2k.hdr")
  .then((envMap) => {
    scene.environment = envMap;
    // Explicit per-material envMap so each metal material's own (higher) envMapIntensity
    // actually takes effect — see the comment on scene.environmentIntensity above.
    frameMaterial.setEnvironment(envMap);
    hingeMaterial.setEnvironment(envMap);
    handlesMaterial.setEnvironment(envMap);

    // Swatches are gated on the same HDRI — metal/text previews render flat without it,
    // so the rail shows a skeleton shimmer until this resolves, then redraws for real.
    setSwatchEnvironment(envMap);
    materialRail?.rerenderActive();
  })
  .catch((error) => {
    console.error("Failed to load studio HDRI environment:", error);
  });

// Key light: mainly exists so the ground plane gets a real contact shadow — most of the
// even, ambient fill now comes from the HDRI via scene.environmentIntensity above.
const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.0);
keyLight.position.set(0.35, 0.45, 0.3); // soft key, roughly 45° above/front
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.radius = 10;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);
scene.add(keyLight.target);

// Soft fill on the opposite side, no shadow — keeps the key light from reading as a
// single hard-sided highlight so the product looks evenly lit from most angles.
const fillLight = new THREE.DirectionalLight(0xf5f0ff, 0.3);
fillLight.position.set(-0.4, 0.25, -0.2);
scene.add(fillLight);

const shadowGround = createShadowCatcherGround();
scene.add(shadowGround);

const gridHelper = new THREE.GridHelper(1, 20);
gridHelper.visible = false;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(0.5);
axesHelper.visible = false;
scene.add(axesHelper);

// Dev helpers are keyboard-only now (no on-screen hint) — state changes still log.
window.addEventListener("keydown", (event) => {
  if (event.key === "g" || event.key === "G") {
    gridHelper.visible = !gridHelper.visible;
    console.log(`[inspector] grid helper ${gridHelper.visible ? "on" : "off"}`);
  }
  if (event.key === "a" || event.key === "A") {
    axesHelper.visible = !axesHelper.visible;
    console.log(`[inspector] axes helper ${axesHelper.visible ? "on" : "off"}`);
  }
});

// Fallback for anything that matches neither category below — visible, but flagged.
const placeholderMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  roughness: 0.5,
  metalness: 0.1,
});

const INITIAL_FRAME_FINISH = "gunmetal";

const frameMaterial = createFrameMaterial(INITIAL_FRAME_FINISH);
const lensMaterial = createLensMaterial("clear");

// Hinge reuses the exact same frame shader as a separate material instance, so its
// finish can diverge from the frame's after load. Alias for the naming this task asks for.
const hingeMaterial = createFrameMaterial(INITIAL_FRAME_FINISH);
hingeMaterial.setHingeFinish = hingeMaterial.setFrameFinish;

// Handles (temple arms) get their own instance too, defaulting to match frame, so a
// future "TEMPLE FINISH" UI row is a small addition rather than a refactor — no button
// row is wired up yet, per this task's "don't change the UI" scope.
const handlesMaterial = createFrameMaterial(INITIAL_FRAME_FINISH);
handlesMaterial.setHandlesFinish = handlesMaterial.setFrameFinish;

const textMaterial = createTextMaterial("silver");

// Classification is name-based against aviator-glass3.glb's actual scene graph
// (verified against the real console.table output, not guessed): frame/handles/hinge/
// lens/gap/bridge are all literal node names. "Nose_pad_001" is NOT a traversable mesh
// name, though — GLTFLoader wraps its multi-primitive mesh in a Group (the group gets
// renamed "Nose_pad_001"), while its two actual Mesh children keep their own glTF names,
// sanitized (dots/spaces stripped) to "Cube001" and "Cube001_1". Those two are matched
// here instead so the nosepad still gets frame material rather than silently keeping
// whatever the group's name implied. "carrera-logo" isn't in the frame/hinge/lens spec
// at all, so it's still identified by its "logo" material name, per the earlier
// brand-text-mesh task.
const NAME_TO_CATEGORY = {
  frame: "frame",
  handles: "handles",
  hinge: "hinge",
  lens: "lens",
  gap: "frame",
  bridge: "frame",
  Cube001: "frame", // Nose_pad_001 group child (glass-material sub-part)
  Cube001_1: "frame", // Nose_pad_001 group child (metal-bracket sub-part)
};

function classifyMesh(mesh) {
  if (mesh.name in NAME_TO_CATEGORY) return NAME_TO_CATEGORY[mesh.name];

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.some((m) => m && m.name === "logo")) return "text";

  return "unknown";
}

async function init() {
  try {
    const gltf = await loadModel(MODEL_URL);
    const model = gltf.scene;

    logSceneStructure(model, "eyewear_test.glb");

    model.traverse((object) => {
      if (!object.isMesh) return;

      const category = classifyMesh(object);
      if (category === "lens") {
        object.material = lensMaterial;
      } else if (category === "hinge") {
        object.material = hingeMaterial;
      } else if (category === "handles") {
        object.material = handlesMaterial;
      } else if (category === "text") {
        object.material = textMaterial;
      } else if (category === "frame") {
        object.material = frameMaterial;
      } else {
        console.warn(
          `[materialAssignment] Mesh "${object.name}" did not match any known category — left on the placeholder material.`,
        );
        object.material = placeholderMaterial;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });

    // Center and frame the model regardless of its authored origin/scale.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    // Closer than before — the model was reading as a small object lost in a huge
    // empty frame. Slightly elevated three-quarter angle for a flattering default.
    const distance = maxDim * 2.6;
    camera.position.set(distance * 0.55, distance * 0.35, distance * 0.75);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();

    // Ground plane sits just under the model's lowest point, sized and shadow-framed
    // to match this model's scale (the plane/light were created generic, at unit scale).
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

const timer = new THREE.Timer();

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const delta = timer.getDelta();
  backdrop.update(delta);
  frameMaterial.updateFrameTween(delta);
  lensMaterial.updateLensTween(delta);
  hingeMaterial.updateFrameTween(delta);
  handlesMaterial.updateFrameTween(delta);
  textMaterial.updateTextTween(delta);
  controls.update();

  // Two passes into the same (manually-cleared) color buffer: the backdrop fills the
  // whole canvas first, then the product scene draws over it. Depth is cleared in
  // between so the product's own depth testing among its meshes starts fresh — the
  // backdrop quad itself never writes depth (see backdrop.js), so this is purely to be
  // explicit/defensive, not to fix any actual z-fighting.
  renderer.clear(true, true, true);
  renderer.render(backdrop.scene, backdrop.camera);
  renderer.clearDepth();
  renderer.render(scene, camera);
}

animate();

function formatPresetLabel(name) {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Swatches are real lit-sphere renders (see swatchRenderer.js), not CSS gradients — this
 * just drops the cached <canvas> into the tile, or a shimmer skeleton if the studio HDRI
 * that metal/text finishes need for reflections hasn't resolved yet.
 */
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

/**
 * "Material Rail" — one category visible at a time via a plain-text tab nav, a
 * horizontal filmstrip of rendered material spheres below it. The active preset's
 * sphere renders hero-sized; neighbors recede in both size and opacity, so the strip
 * reads as "what you're wearing" flanked by alternatives, not a flat swatch grid.
 *
 * Hovering a tile previews that finish live on the model (section.preview) without
 * committing it — only a click (or the prev/next rail arrows) commits via onSelect.
 */
function buildMaterialRail(container, sections, { onSelectionChange } = {}) {
  const tabsEl = document.createElement("div");
  tabsEl.className = "rail-tabs";

  // One shared underline that slides/resizes to whichever tab is active, instead of
  // each tab drawing its own static underline on activation — a shared-layout-style
  // transition rather than an instant jump between tabs.
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
  let currentTiles = new Map(); // presetName -> tile-wrap element, valid only for the rendered section

  function updateHeading(section) {
    headingEl.textContent = `${section.tabLabel} — ${formatPresetLabel(section.activeName)}`;
  }

  // The tilt is a pure hover affordance — "tilting a material sample under light".
  // Tracking uses quickTo with a short, sharp snap (DUR.snap/EASE.hoverIn) so the tile
  // reads as tightly, directly connected to the pointer rather than chasing it loosely.
  // The release on mouseleave is deliberately a *separate*, slightly slower/softer tween
  // (DUR.release/EASE.hoverOut) rather than reusing the same quickTo setters — that
  // asymmetry (snap in fast, ease out a touch slower) is what reads as considered rather
  // than a single symmetric transition. A small overshoot scale pop on enter/leave adds
  // the last bit of "physical object" weight.
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
    // Center the active (hero-sized) tile immediately — without this, the initial
    // render and each tab switch can leave it clipped by the track's edge-fade mask
    // instead of sitting in frame.
    currentTiles.get(section.activeName)?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  // A small overshoot on the slide/resize — a shared-layout-style transition, not an
  // instant jump — kept short (0.32s) so it reads as a snap-with-a-little-bounce rather
  // than a slow glide between tabs.
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

/**
 * Small row of dot buttons letting the panel pick which deep backdrop the material
 * swatches render against (see swatchRenderer.js's STAGE_BACKGROUNDS) — each dot shows
 * its own actual color so the choice is legible at a glance, not a text dropdown.
 */
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

/**
 * The scene backdrop picker — square tiles (a gradient plane reads more honestly as a
 * square than a sphere) each showing an actual render of that preset's shader. This is
 * scene-level, not a material, so it's its own compact control rather than a rail tab:
 * switching it doesn't touch camera position, material selections, or the model.
 */
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

// Tracks the *target* frame preset name, not the live (mid-tween) material state —
// frameMaterial.getFinishState() reads the animating uniform, which is still at the
// old value the instant setFrameFinish() is called, so using it here would make
// "matchFrame" always lag one selection behind. The preset's known values are correct
// immediately, with no race against the 0.8s tween.
let currentFramePresetName = INITIAL_FRAME_FINISH;

function frameSwatchAsTextOverride() {
  const swatch = getFramePresetSwatch(currentFramePresetName);
  return {
    baseColor: new THREE.Color(swatch.hex),
    metalness: swatch.metalness,
    roughness: swatch.roughness,
  };
}

// "matchFrame" has no fixed color — its tile mirrors whatever the frame currently is,
// and if it's the active text selection, the text material itself follows the frame too.
function refreshMatchFrameLink() {
  materialRail.refreshTile("text", "matchFrame");
  if (materialRail.getActiveName("text") === "matchFrame") {
    textMaterial.setTextColor("matchFrame", frameSwatchAsTextOverride());
  }
}

const railSections = [
  {
    id: "frame",
    tabLabel: "Frame",
    swatchCategory: "frame",
    presetNames: FRAME_PRESET_NAMES,
    getSwatch: getFramePresetSwatch,
    activeName: INITIAL_FRAME_FINISH,
    preview: (name) => frameMaterial.setFrameFinish(name),
    onSelect: (name) => {
      currentFramePresetName = name;
      refreshMatchFrameLink();
    },
  },
  {
    id: "handles",
    tabLabel: "Temple",
    swatchCategory: "frame",
    presetNames: FRAME_PRESET_NAMES,
    getSwatch: getFramePresetSwatch,
    activeName: INITIAL_FRAME_FINISH,
    preview: (name) => handlesMaterial.setHandlesFinish(name),
    onSelect: () => {},
  },
  {
    id: "hinge",
    tabLabel: "Hinge",
    swatchCategory: "frame",
    presetNames: FRAME_PRESET_NAMES,
    getSwatch: getFramePresetSwatch,
    activeName: INITIAL_FRAME_FINISH,
    preview: (name) => hingeMaterial.setHingeFinish(name),
    onSelect: () => {},
  },
  {
    id: "lens",
    tabLabel: "Lens",
    swatchCategory: "lens",
    presetNames: LENS_PRESET_NAMES,
    getSwatch: getLensPresetSwatch,
    activeName: "clear",
    preview: (name) => lensMaterial.setLensTint(name),
    onSelect: () => {},
  },
  {
    id: "text",
    tabLabel: "Text",
    swatchCategory: "text",
    presetNames: TEXT_PRESET_NAMES,
    getSwatch: (name) => (name === "matchFrame" ? getFramePresetSwatch(currentFramePresetName) : getTextPresetSwatch(name)),
    activeName: "silver",
    preview: (name) =>
      textMaterial.setTextColor(name, name === "matchFrame" ? frameSwatchAsTextOverride() : undefined),
    onSelect: () => {},
    getSwatchExtras: (name) =>
      name === "matchFrame"
        ? { frameOverride: frameSwatchAsTextOverride(), cacheKey: `text:matchFrame:${currentFramePresetName}` }
        : {},
  },
];

// Deterministic flourish, not a real serial system — a stable-looking reference code
// derived purely from the current selections, so it changes the moment they do.
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

// Running summary of every category's current selection, styled as a spec/appraisal
// card rather than a plain label/value list — visible regardless of which tab is open.
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
  summaryRefEl.textContent = `Ref. ${computeReferenceCode(railSections)}`;
}

const materialRail = buildMaterialRail(controlsPanel, railSections, { onSelectionChange: updateSummary });
buildStagePicker(controlsPanel, { onChange: () => materialRail.rerenderActive() });
controlsPanel.appendChild(summaryEl);
updateSummary();

// Single orchestrated entrance for the whole card — no per-tile stagger.
requestAnimationFrame(() => {
  controlsPanel.classList.add("panel-visible");
});

