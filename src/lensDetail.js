import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { loadModel } from "./loader.js";
import { logSceneStructure } from "./sceneInspector.js";
import { classifyMesh } from "./meshCategoryMap.js";
import { createFrameMaterial } from "./frameMaterial.js";
import { createLensMaterial } from "./lensMaterial.js";
import { createTextMaterial } from "./textMaterial.js";
import { createAcetateMaterial, fitAcetatePatternScale } from "./acetateMaterial.js";
import { getProduct } from "./data/products.js";
import { PART_SPECS, getMaterialState, setMaterialPreset } from "./materialState.js";
import { createLoadingTransition } from "./loadingTransition.js";
import { loadStudioEnvironment, createShadowCatcherGround } from "./environment.js";
import { gsap, EASE, DUR } from "./motion.js";
import { initPageTransitionLinks, revealStage } from "./pageTransition.js";

initPageTransitionLinks();

// ==========================================================================
// The Table showcase view — the product resting on the display riser of a finished,
// light-baked studio room, with a switcher to change which room is shown.
//
// Every studio*.glb here is a full COMBINED-lighting bake (one *_BakeImg per surface,
// plugged into base color on the lightmap UV set), so each room is rendered UNLIT — the
// bake already contains all the light. The only runtime lights exist to light the
// PRODUCT; they don't touch the baked room. All geometry is authored in metres,
// consistent with the ~0.157m-wide eyewear, so no scale conversion is needed.
//
// Rooms are a plain config list: adding another (e.g. studio2.glb) is one more entry
// with its own GLB-derived bounds / riser height / camera framing — the loader, camera
// clamp, post-processing, and switcher UI all read from the list, so none of them need
// to change. Bounds, riserTopY and camera values below are read straight from each GLB's
// accessor bounds, per room, never guessed or shared between rooms.
// ==========================================================================
const ROOMS = [
  {
    id: "studio1",
    label: "Studio 1",
    url: "/models/studio1.glb",
    riserTopY: 0.68, // Room_Table_Riser top (accessor Ymax)
    bounds: { x: 2.0, z: 2.0, floor: 0.0, ceil: 3.0 }, // interior wall/floor/ceiling faces
    // Same framing as the On Mannequin view of this room — kept identical on purpose.
    camera: { position: new THREE.Vector3(0.34, 1.01, 0.82), target: new THREE.Vector3(0, 0.95, 0), min: 0.4, max: 3.2 },
    productScale: 1, // life size, resting directly on the riser
    exposure: 1.25, // its known-good exposure — unchanged
    // scene.environmentIntensity, which applies only to materials with a null envMap. The
    // room (unlit bake) and the product materials all carry explicit envMaps, so in this
    // room nothing currently reads it. Left at 1.0 as a neutral default.
    envIntensity: 1.0,
  },
  {
    id: "studio2",
    label: "Studio 2",
    url: "/models/studio2.glb",
    riserTopY: 0.78, // Room2_Table_Riser top (accessor Ymax)
    bounds: { x: 2.75, z: 2.75, floor: 0.0, ceil: 3.0 }, // interior wall faces / floor / ceiling
    // Same framing as the On Mannequin view of this room — kept identical on purpose.
    camera: { position: new THREE.Vector3(0.34, 1.11, 0.84), target: new THREE.Vector3(0, 1.05, 0), min: 0.4, max: 4.2 },
    productScale: 1, // life size, resting directly on the riser
    // Re-enabled now that the over-bright bake this was switched off for is gone (see
    // `marble` below). threshold 1.05 was too low the first time this was tuned: at this
    // room's real brightness (direct rig + per-material envMapIntensity + the shared
    // envBoost below, all stacking) most of the marble body itself was clearing it, so the
    // WHOLE room bloomed into a soft haze that erased the coffer seams and niche edges —
    // not just the strips lighting up. Threshold and radius are both pulled in so bloom
    // reads as a tight warm glow confined to the strips, not a room-wide wash.
    bloom: { strength: 0.14, radius: 0.2, threshold: 1.35 },
    // Also inherited from the bake era, when 1.25 over-exposed an already-bright room. Worth
    // revisiting now that the room's brightness comes from the light rig instead.
    exposure: 1.0,
    // ---- Carrara marble, real-time lit ----
    // studio2's baked textures are no longer used: `marble` routes every surface in the room
    // to one shared polished white stone material (see makeMarbleMaterial), and the GLB's
    // bake is disposed on load rather than applied. That also retires this room's
    // over-bright white bake, which was the thing blowing out.
    // Routes every surface through STUDIO2_PALETTE, which varies roughness/reflectivity per
    // surface type rather than painting the whole room one white.
    marble: true,
    // Marble is a LIT surface, unlike the bake it replaces, so the room now needs real light.
    realtimeLighting: true,
    // The shared rig defaults to studio3's warm rose key, which would render white Carrara as
    // cream. Neutral-to-cool and much stronger on the fill: a white marble room is mostly
    // bounce, and its ceiling only ever sees the hemisphere and ambient terms.
    // Warm cream throughout, reversing an earlier "neutral-to-cool" call — that choice was
    // made to keep white Carrara from reading as jaundiced cream. The brief now IS a warm
    // cream boutique, so the room rig matches: only hue moves here, not intensity — the
    // fill/ambient levels below are the same ones already re-balanced against the key to
    // keep the room's directional falloff (see that fix's own history) and are left alone.
    roomRig: {
      keyColor: 0xfff1d9,
      keyIntensity: 14,
      fillSky: 0xfff0da,
      fillGround: 0xe8dcc4,
      fillIntensity: 0.55,
      ambientColor: 0xfff2de,
      ambientIntensity: 0.26,
      // The shared key's DEFAULT position (1.1, 2.85, 0.9) sits just 0.15m under this
      // room's 3.0m ceiling. At that clearance the cone's outer edge clips the ceiling and
      // the back-wall/ceiling corner at a near-grazing angle — and a grazing hit turns even
      // a soft penumbra into what looks like a hard-edged shadow wedge, because the
      // intersecting surface is nearly parallel to the cone boundary right there. That
      // wedge is what actually showed up: not a real shadow (every room mesh has
      // castShadow=false — see loadRoomModel), the spotlight's own cone edge painted onto
      // the ceiling. Lower and more central keeps the cone's footprint on the table/bust,
      // well clear of the ceiling plane entirely, rather than trying to out-soften a
      // grazing angle that stays hard-edged at any penumbra.
      keyPosition: new THREE.Vector3(0.55, 2.35, 0.6),
      keyTarget: new THREE.Vector3(0, 0.85, 0),
    },
    // Now inert in this room, and kept only so the value is explicit rather than implied.
    // scene.environmentIntensity applies solely to materials with a null envMap, and every
    // surface here holds one explicitly: the room stone, the bust and the product materials
    // all opt in (see forEachRoomEnvMaterial / applyEnvToMaterials). studio3's procedural
    // walls are the one remaining consumer of this setting.
    envIntensity: 0.3,
    // Well below DEFAULT_ENV_BOOST (1.45). That boost was tuned for rooms that needed
    // help — studio1's dim bake, studio3's matte procedural walls — and this room is the
    // opposite case: every surface is near-white, roughness ~0.1, full clearcoat, so it is
    // already the most reflective room in the set (its own STUDIO2_PALETTE comment already
    // calls it "the brightest room"). Applying the shared boost on top of that amplified
    // its own bake's brightness back into itself through every mirror-polished surface
    // (floor, table, shelves) — the actual mechanism behind "blown out" here, not any one
    // light. This is the primary fix; the bloom/roomRig changes alongside it are secondary,
    // repairing the contrast that was lost while the room sat over-amplified.
    envBoost: 0.45,
    productLight: { key: 1.15, fill: 0.5 },
    // See the comment at keyLight.castShadow in applyRoomConfig: this room's real walls/
    // floor/ceiling all receive shadows (unlike the baked rooms), so keyLight and roomKey
    // casting two independent, differently-angled product shadows onto the same surfaces
    // was producing doubled/misaligned shadow edges. roomKey's is the room-aware one; this
    // just stops keyLight from also casting.
    keyShadow: false,
    // Drops the ceiling below the cove slit (y 2.97). The recess is geometry, not a bake
    // artifact, so this is still needed with marble.
    ceilingOffsetY: -0.05,
    // A full lit frame around each niche's RECESSED BACK PANEL — top, bottom, and both
    // sides — sitting flush against it rather than floating in the opening.
    //
    // The `mount` values are the actual difference from a first pass at this: that version
    // mounted every strip at ~-2.79/±2.79, which measuring the GLB directly (Room2_Niche_
    // Interior / Room2_SideNicheL_Interior / Room2_SideNicheR_Interior accessor bounds)
    // turns out to be the niche's OPENING plane — where the wall face would be if the
    // recess weren't cut into it — not the recessed panel itself. Each niche is a real
    // cavity: the back niche's floor/back panel sits at Z -2.840, a further 0.09m behind
    // that -2.750 opening; the side niches recess 0.07m to X ∓2.820. Mounting the strips at
    // the opening left them hanging in mid-air inside the cavity, which is exactly what
    // read as "floating" rather than "resting on the panel". `mount` below is each niche's
    // true back-panel depth, nudged ~5mm proud of it to avoid z-fighting with that surface
    // — flush, not buried in it.
    //
    // yCenter/halfWidth/halfHeight are the niche interior's own measured extents:
    //   back niche:  X ±0.948, Y 1.002–2.498 (centre 1.75, half 0.748)
    //   side niches: Z ±0.548, Y 1.152–2.148 (centre 1.65, half 0.498)
    accentStrips: [
      ...nicheFrameStrips({ axis: "z", mount: -2.835, yCenter: 1.75, halfWidth: 0.948, halfHeight: 0.748, color: "#ffb877", intensity: 1.6 }),
      ...nicheFrameStrips({ axis: "x", mount: -2.815, yCenter: 1.65, halfWidth: 0.548, halfHeight: 0.498, color: "#ffb877", intensity: 1.6 }),
      ...nicheFrameStrips({ axis: "x", mount: 2.815, yCenter: 1.65, halfWidth: 0.548, halfHeight: 0.498, color: "#ffb877", intensity: 1.6 }),
      // Closes the ceiling cove into a full ring around the room. The back/left/right
      // channels are real geometry (Room2_CoveSlit_Back/Left/Right, lit via STUDIO2_PALETTE's
      // `cove` entry) — there is no Room2_CoveSlit_Front in the GLB, so the fourth side is
      // this one glow strip standing in for it. Same y-band as the real channels
      // (2.973-2.995, centre 2.984) so the ring reads as one continuous line, not three
      // real segments and a mismatched fourth.
      { position: [0, 2.984, 2.745], width: 5.5, height: 0.02, color: "#ffd6a0", intensity: 2.0 },
    ],
    // A small grid of recessed ceiling downlights over the table — the room's only OTHER
    // light besides the cove ring and the rig itself, matching a boutique's actual mixed
    // lighting (perimeter cove + a few functional downlights) rather than cove alone.
    // floorY targets are the table top / floor beneath each fixture, not the room centre,
    // so the pools land on the surfaces a viewer would expect them to.
    downlights: [
      { position: [-0.8, 2.95, -0.6], floorY: 0.73 },
      { position: [0.8, 2.95, -0.6], floorY: 0.73 },
      { position: [-0.8, 2.95, 0.6], floorY: 0 },
      { position: [0.8, 2.95, 0.6], floorY: 0 },
    ],
    // Marble is a genuine PBR surface, so its table legs are live brass too (see
    // STUDIO2_PALETTE's `leg` entry) — nothing in this room stays baked any more.
  },
  {
    id: "studio3",
    label: "Studio 3",
    url: "/models/studio3.glb",
    riserTopY: 0.81, // Room3_Table_Riser top (accessor Ymax) — sits higher than studio1
    bounds: { x: 2.75, z: 2.75, floor: 0.0, ceil: 3.0 }, // a larger room than studio1 (±2.75 vs ±2.0)
    // Near-level framing, pulled back: the previous view pitched ~11° DOWN, so its top edge
    // only reached ~1.7m at the back wall and the 3.0m ceiling sat entirely above frame.
    // Looking level from further back brings the ceiling into shot.
    // Same framing as the On Mannequin view of this room — kept identical on purpose.
    camera: { position: new THREE.Vector3(0.38, 1.14, 0.88), target: new THREE.Vector3(0, 1.08, 0), min: 0.4, max: 4.2 },
    productScale: 1, // life size, resting directly on the riser
    rods: true, // rod caps/collars + brass fixtures use live PBR brass (see makeRodMaterial)
    // Studio 3 is fully real-time: its baked lightmaps are never applied (and are disposed on
    // load), surfaces are procedural rose-gold PBR (see STUDIO3_PALETTE) and are lit by the
    // live room rig. Studio 1 is unaffected and stays baked/unlit.
    procedural: true,
    realtimeLighting: true,
    productLight: { key: 0.4, fill: 0.1 }, // the room spot does most of the work now
    // Zero post-processing for this room: bloom / vignette / OutputPass are bypassed entirely
    // (see renderFrame), and exposure is neutral so nothing is tone-pushed.
    postProcessing: false,
    exposure: 1.0,
    // studio3 bakes its live rig rather than a lightmap, and its room spot already does
    // most of the work on the product (see productLight), so its IBL stays at full weight.
    envIntensity: 1.0,
    shadowRadius: 4, // crisper contact shadow for the big product (studio1 stays soft at 10)
    // Warm accent pool beneath the slab, now only a hint. At higher values it spilled past the
    // slab edges and made the whole suspended slab read as a glowing light fixture rather than
    // a table with a product on it (clearly visible in the screenshot).
    underSlabGlow: { y: 0.74, width: 2.5, depth: 1.4, color: "#ff9f52", intensity: 0.06 },
    // Uplight so the ceiling is an actual lit surface rather than the dark gap above the
    // room. Sits below the 3.0m ceiling and points straight up; intensity is the dial if the
    // pool reads too hot at the centre or dies off too fast into the corners (it has decay 2,
    // so it is very sensitive to the gap between `y` and `targetY`).
    // decay 1, not the physical 2. The ceiling is 5.5m square and the fixture sits about a
    // metre under it, so with inverse-square the centre is ~28x brighter than the corners:
    // a hot spot directly overhead and unlit corners, which is what the camera actually sees
    // at this near-level framing. Linear falloff drops that ratio to ~4x, which still gives
    // the surface a gradient but lights the whole plane.
    ceilingWash: {
      y: 2.0,
      targetY: 3.2,
      color: "#ffcf9e",
      // Deliberately soft and low now that the coffers carry the surface. A stronger pool
      // just re-creates the smooth sky gradient; the wash only needs to give the panels
      // enough falloff to read as receding, not to be the thing you look at.
      intensity: 2.2,
      decay: 1,
      angle: Math.PI / 2.2,
      penumbra: 1.0,
    },
    // Optional per-room `bloom: { strength, radius, threshold }` override goes here if needed.
  },
  // Studio 2 (studio2.glb) drops in as one more entry — same shape, values from its own
  // GLB — with no changes to the loader, camera clamp, post-processing, or switcher.
];

const DEFAULT_MODEL_URL = "/models/aviator-glass3.glb";
const CASSIAN_MODEL_URL = "/models/acetate.glb";
const CORBIN_MODEL_URL = "/models/cool-sunglasses.glb"; // the product's real, declared model — used for identity/category lookups
const CORBIN_FOLDED_MODEL_URL = "/models/folded-corbin.glb"; // stand-in actually loaded here, see loadProduct

const canvas = document.querySelector("#mannequin-app");
const stageEl = document.querySelector("#mannequin-stage");
const statusEl = document.querySelector("#mannequin-status");

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// Hidden until the first room, product, and environment have all resolved, then faded in
// — so the scene never shows a blank or half-built canvas.
canvas.style.opacity = "0";
const sceneLoader = createLoadingTransition({ palette: "light", plateNumber: "03" });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// Tone mapping exposure is a GLOBAL renderer setting, so it's re-asserted per room in
// applyRoomConfig from each room's `exposure` (studio1 = 1.25, studio3 = its own value) —
// switching rooms never leaves studio1 on studio3's exposure or vice-versa. This is just
// the pre-load default until the first room applies its config.
const DEFAULT_EXPOSURE = 1.25;
renderer.toneMappingExposure = DEFAULT_EXPOSURE;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
// The scene is static once loaded (only the camera orbits), so re-rendering shadow maps every
// frame is pure waste — especially now that procedural rooms add a second shadow-casting
// light. Shadows are refreshed on demand instead (applyRoomConfig sets needsUpdate on boot
// and on every room switch).
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 100);
camera.position.copy(ROOMS[0].camera.position);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Pan is disabled so the orbit centre stays locked on the product — keeps rotation natural
// AND removes the one way the target itself could be dragged into a wall, leaving only
// rotate + zoom to move the camera, both of which the box clamp below fully contains.
controls.enablePan = false;
controls.target.copy(ROOMS[0].camera.target);
controls.minDistance = ROOMS[0].camera.min;
controls.maxDistance = ROOMS[0].camera.max;
controls.update();

// Each room is a box, so OrbitControls' spherical min/maxDistance can't keep the camera
// inside it — a radius small enough to clear the nearest surface (the floor) would forbid
// any useful pull-back. Instead the camera position is clamped to the active room's
// interior box every frame (see animate); CAM_MIN/MAX are re-derived per room from its own
// bounds by applyRoomConfig(). CAM_MARGIN insets from the faces so the camera never clips.
const CAM_MARGIN = 0.18;
const CAM_MIN = new THREE.Vector3(-ROOMS[0].bounds.x + CAM_MARGIN, ROOMS[0].bounds.floor + CAM_MARGIN, -ROOMS[0].bounds.z + CAM_MARGIN);
const CAM_MAX = new THREE.Vector3(ROOMS[0].bounds.x - CAM_MARGIN, ROOMS[0].bounds.ceil - CAM_MARGIN, ROOMS[0].bounds.z - CAM_MARGIN);

// ==========================================================================
// Post-processing — RenderPass → UnrealBloomPass → OutputPass. Bloom sits in linear HDR
// (before tone map) so it keys off true brightness; OutputPass does the single ACES tone
// map + sRGB encode at the very end (tone mapping happening once is what avoids blowout).
// Conservative values: only the very brightest pixels (the HDR gold strips) cross the
// threshold — the tabletop and product do not bloom. Rooms may override per-config.
// ==========================================================================
const BLOOM_STRENGTH = 0.16;
const BLOOM_RADIUS = 0.28;
const BLOOM_THRESHOLD = 0.94;

// Sharpness: the renderer's antialias:true does NOT apply to EffectComposer's offscreen
// render targets, which is why the composited image reads soft/aliased. Give the composer a
// 4× multisampled HDR target so geometry edges (rods, slab, product) resolve crisply.
const rtSize = renderer.getDrawingBufferSize(new THREE.Vector2());
const composerTarget = new THREE.WebGLRenderTarget(rtSize.x, rtSize.y, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
composer.addPass(bloomPass);

composer.addPass(new OutputPass());

// Vignette — a single, resolution-INDEPENDENT display-space pass (samples tDiffuse at the
// exact uv and multiplies by a distance-from-centre falloff; deliberately none of the
// texture-offset math that broke the earlier custom pass). Strength is driven per-room in
// applyRoomConfig, and defaults to 0 → completely inert, so studio1 is untouched.
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.0 },
    uInner: { value: 0.4 }, // distance where darkening starts
    uOuter: { value: 0.78 }, // distance where darkening reaches full strength
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uInner;
    uniform float uOuter;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      color.rgb *= 1.0 - uStrength * smoothstep(uInner, uOuter, d);
      gl_FragColor = color;
    }
  `,
};
const vignettePass = new ShaderPass(VignetteShader);
composer.addPass(vignettePass);

function resize() {
  const w = stageEl.clientWidth || 1;
  const h = stageEl.clientHeight || 1;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
}
resize();
new ResizeObserver(resize).observe(stageEl);

// The studio HDRI is now only a FALLBACK, used until the first room has been baked (and if
// a bake ever fails). Each room supplies its own IBL instead — see bakeRoomEnvironment.
//
// Why it can't stay the primary source: one bright, neutral studio HDRI was lighting the
// product identically in all three rooms, none of which look anything like that HDRI. The
// eyewear picked up hot, cool studio reflections while sitting in a dim warm room, so its
// speculars sat far above the room's own value range — which is what blew out (and why the
// per-room `exposure` values exist, dragging the whole image down to compensate for a
// product that was lit too hot in the first place).
scene.environmentIntensity = 1.1;
const environmentPromise = loadStudioEnvironment(renderer, "/studio_small_09_2k.hdr")
  .then((envMap) => {
    fallbackEnvMap = envMap;
    // A room bake always wins. On a slow HDRI fetch this can resolve after a room has
    // already baked its own environment, and clobbering that would put the generic studio
    // lighting back — the exact thing the bake exists to replace.
    if (roomEnvMap) return;
    scene.environment = envMap;
    sharedEnvMap = envMap; // kept so materials built later (on a glasses swap) get it too
    applyEnvToMaterials(productMaterials, envMap);
  })
  .catch((error) => console.error("[lensDetail] Failed to load studio HDRI:", error));

// Product lighting only (the baked rooms don't respond to lights). Key aimed at the product
// on the riser, kept moderate so its specular on the polished metal stays below the bloom
// threshold (a hotter key haloed the glasses); fill + IBL keep the product well-lit.
const keyLight = new THREE.DirectionalLight(0xfff4e6, 0.7);
keyLight.position.set(0.4, 1.7, 0.7);
keyLight.target.position.set(0, ROOMS[0].riserTopY, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.radius = 10;
keyLight.shadow.bias = -0.0005;
// Bounds the shadow camera to roughly the product itself (a pair of glasses, well under 0.2m
// across) instead of THREE's default +/-5 orthographic box. That default was
// never sized for this subject: a 10m box over a 1024px map is ~1cm per texel, which reads as
// a blocky, jagged shadow edge rather than a clean contact shadow — invisible while the only
// receiver was the small hidden contact-shadow plane under the product, but obvious once real
// room surfaces (studio2's walls/floor/ceiling) started receiving it. ~1.1m x 1.2m here is
// ~1mm per texel instead, an order of magnitude crisper, and near/far are tightened to the
// light's actual ~1.1-1.3m throw across all three rooms' riser heights instead of the
// default 0.5-500 range, for depth precision.
keyLight.shadow.camera.left = -0.6;
keyLight.shadow.camera.right = 0.6;
keyLight.shadow.camera.top = 0.7;
keyLight.shadow.camera.bottom = -0.5;
keyLight.shadow.camera.near = 0.3;
keyLight.shadow.camera.far = 2.5;
keyLight.shadow.camera.updateProjectionMatrix();
scene.add(keyLight, keyLight.target);

const fillLight = new THREE.DirectionalLight(0xf5f0ff, 0.45);
fillLight.position.set(-0.4, 1.1, -0.2);
scene.add(fillLight);

// Real-time ROOM lighting rig — only added to the scene for rooms with procedural (unlit-
// baked rooms ignore lights entirely, but these would still hit the product, so the rig is
// attached/detached per room rather than left in permanently). Warm key roughly aligned with
// the product key so the two shadow directions agree, plus a hemisphere fill so nothing goes
// black. Deliberately just two lights (one shadow caster) to keep the cost down.
const roomLightRig = new THREE.Group();
roomLightRig.name = "RoomLightRig";

// A SPOT, not a directional: a directional light has no distance falloff, so it lights every
// wall evenly and the room reads flat. A spot with decay lets the light pool over the table
// and genuinely fall off into dark corners — the whole point of the moody look.
// Lowered from 30: the spot's hot centre was clipping to white on the pale tabletop/underslab
// area, losing all colour detail there. Brightness is instead carried by the much stronger
// ambient fill below, which lifts the whole room evenly (including the corners) rather than
// blowing out one pool.
const ROOM_KEY_INTENSITY = 11;
const ROOM_FILL_INTENSITY = 0.5; // hemisphere: directional bounce (sky above / ground below)
const ROOM_AMBIENT_INTENSITY = 0.3; // uniform floor of light so no surface can go pure black
// Rig colours are the DEFAULTS (studio3's warm rose room). A room can override any of them
// via `roomRig` in its config — see applyRoomConfig. Studio3 passes none, so it is unchanged.
const ROOM_KEY_COLOR = 0xffd9b0;
const ROOM_FILL_SKY = 0xffd0c4;
const ROOM_FILL_GROUND = 0xc2969a;
const ROOM_AMBIENT_COLOR = 0xffe6dc;
const roomKey = new THREE.SpotLight(ROOM_KEY_COLOR, ROOM_KEY_INTENSITY, 0, Math.PI / 3.2, 0.7, 2);
// Defaults are studio3's validated position — close under its 3.0m ceiling, aimed down at
// the table. `roomRig.keyPosition`/`keyTarget` can override both per room (see
// applyRoomConfig); studio3 passes neither, so it is unaffected by anything below.
const ROOM_KEY_POSITION = new THREE.Vector3(1.1, 2.85, 0.9);
const ROOM_KEY_TARGET = new THREE.Vector3(0, 0.8, 0);
roomKey.position.copy(ROOM_KEY_POSITION);
roomKey.target.position.copy(ROOM_KEY_TARGET);
roomKey.castShadow = true;
roomKey.shadow.mapSize.set(1024, 1024);
roomKey.shadow.camera.near = 0.5;
roomKey.shadow.camera.far = 12;
roomKey.shadow.bias = -0.0008;
roomKey.shadow.radius = 6;

// Ground colour lifted from near-black (#2a1c20) to a dusty mauve. This matters specifically
// for the CEILING: a hemisphere light shades by normal direction — surfaces facing up get the
// sky colour, surfaces facing down get the ground colour. The ceiling faces down into the
// room, so it was being handed an almost-black colour and rendering as a void.
// Ground colour is now close to the sky colour. A hemisphere light shades by normal: up-facing
// surfaces get the sky tone, DOWN-facing get the ground tone — and the ceiling faces down. With
// a dark ground colour the ceiling was handed almost no light and read as a void no matter what
// material it had. Keeping the two tones close means the ceiling lands at a similar brightness
// to the walls, which is what makes it read as part of the same room.
const roomFill = new THREE.HemisphereLight(ROOM_FILL_SKY, ROOM_FILL_GROUND, ROOM_FILL_INTENSITY);

// Direction-independent baseline so nothing in the room can render as pure black. At the
// DEFAULT key position/angle (studio3) the spot's cone doesn't reach the ceiling, so without
// this the ceiling had no light source whatsoever. A room with a brighter/more reflective
// ceiling that overrides keyPosition (see studio2) still needs this as its floor regardless.
const roomAmbient = new THREE.AmbientLight(ROOM_AMBIENT_COLOR, ROOM_AMBIENT_INTENSITY);

roomLightRig.add(roomKey, roomKey.target, roomFill, roomAmbient);

// Soft contact shadow so the product reads as resting on the riser, not floating — a
// transparent, shadow-only catcher laid just above the active room's riser top (the unlit
// bake can't receive a dynamic shadow, so this thin catcher is what grounds the product).
// Sized generously so it still catches the whole contact shadow when the product is scaled
// up per room (studio3 hero-sizes it); the ShadowMaterial is invisible except where a
// shadow actually falls, so an oversized catcher costs nothing visually.
const shadowGround = createShadowCatcherGround(1.2);
shadowGround.position.y = ROOMS[0].riserTopY + 0.001;
scene.add(shadowGround);

// Rooms can opt out of the whole post chain (`postProcessing: false`). When off we render
// straight through the renderer — bloom, vignette and OutputPass are bypassed entirely
// rather than merely turned down, and the canvas's own MSAA handles antialiasing.
let usePostProcessing = true;
function renderFrame() {
  if (usePostProcessing) composer.render();
  else renderer.render(scene, camera);
}

const frameTimer = new THREE.Timer();

function animate() {
  requestAnimationFrame(animate);
  // Skip all work while the tab is backgrounded — nothing is visible to update anyway.
  if (document.hidden) return;
  frameTimer.update();
  // Finish/tint changes tween toward their target, so they must be advanced every frame.
  updateProductTweens(frameTimer.getDelta());
  controls.update();
  // Contain the camera after OrbitControls has moved it (covers drag, zoom and the easing
  // tail from damping), so it slides along a wall/floor/ceiling instead of punching through.
  camera.position.clamp(CAM_MIN, CAM_MAX);
  renderFrame();
}
// NOTE: animate() is deliberately NOT started here. It calls updateProductTweens(), which
// reads module state (productMaterials) declared further down — starting the loop at this
// point would hit the temporal dead zone on the very first synchronous frame. It is started
// at the bottom of the module, once every declaration above it has been initialised.

// ---------- Recessed-panel edge lighting ----------
// Rooms whose walls carry recessed panels (studio1's Room_Wall*_Panel*) get each panel's
// perimeter traced with flush, self-lit ADDITIVE strips — a warm gold cove-light accent.
// Rooms without such panels (studio3) simply get zero strips. Because the room renders
// unlit, a real area light would do nothing; a flat emissive plane is even + flicker-free.
const STRIP_LIGHT_COLOR = "#ffab63"; // ~2850K warm amber
// Softer/whiter than the amber strip colour above — a recessed downlight reads as a
// near-white halogen source, distinct from the richer amber used for cove/niche accents.
const DOWNLIGHT_COLOR = "#fff2df";
// Additive brightness in HDR (2.0): reads as a confident gold accent AND — since warm gold
// is intrinsically low-luminance — pushes the strip cores above the bloom threshold so
// bloom catches the strips (and only the strips). ACES keeps the core from going white.
const STRIP_INTENSITY = 2.0;
const STRIP_GLOW_WIDTH = 0.05; // total soft width; the bright core is the middle sliver
const STRIP_PROUD = 0.03; // proud of the panel face, into the room, so it never z-fights the wall
const STRIP_CORE_INSET = 0.03; // where the bright line sits, inside the panel border

// Grayscale falloff across the strip thickness (V axis): a narrow bright core with soft
// shoulders fading to zero. Drives the additive amount; the hue comes from the material
// color. Built once and SHARED across all rooms — never disposed on room teardown.
let softStripTexture = null;
function getSoftStripTexture() {
  if (softStripTexture) return softStripTexture;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0.0, "rgba(255,255,255,0)");
  g.addColorStop(0.4, "rgba(255,255,255,0.16)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.16)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  softStripTexture = new THREE.CanvasTexture(c);
  softStripTexture.colorSpace = THREE.SRGBColorSpace;
  return softStripTexture;
}

// Traces panel perimeters found under `roomRoot`, adding the strip meshes into
// `targetGroup` (the room's own group) so they tear down together with the room.
function addPanelEdgeLighting(roomRoot, targetGroup) {
  const panels = [];
  roomRoot.traverse((o) => {
    if (o.isMesh && /Panel/i.test(o.name)) panels.push(o);
  });
  if (!panels.length) return 0;

  const glowMaterial = new THREE.MeshBasicMaterial({
    map: getSoftStripTexture(),
    color: new THREE.Color(STRIP_LIGHT_COLOR).multiplyScalar(STRIP_INTENSITY),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
    side: THREE.DoubleSide,
    fog: false,
  });

  let stripCount = 0;
  panels.forEach((panel) => {
    const box = new THREE.Box3().setFromObject(panel);
    const { min, max } = box;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const isFront = (min.z + max.z) / 2 > 0;
    const mountZ = isFront ? min.z - STRIP_PROUD : max.z + STRIP_PROUD;

    const innerW = max.x - min.x - 2 * STRIP_CORE_INSET;
    const innerH = max.y - min.y - 2 * STRIP_CORE_INSET;

    const addStrip = (length, x, y, vertical) => {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(length, STRIP_GLOW_WIDTH), glowMaterial);
      strip.position.set(x, y, mountZ);
      if (vertical) strip.rotation.z = Math.PI / 2;
      targetGroup.add(strip);
      stripCount += 1;
    };

    addStrip(innerW, cx, max.y - STRIP_CORE_INSET, false);
    addStrip(innerW, cx, min.y + STRIP_CORE_INSET, false);
    addStrip(innerH, min.x + STRIP_CORE_INSET, cy, true);
    addStrip(innerH, max.x - STRIP_CORE_INSET, cy, true);
  });
  return stripCount;
}

// Soft radial falloff (bright centre → transparent edge), shared across rooms — used by the
// under-slab light pool so its edges melt away rather than reading as a hard rectangle.
let radialGlowTexture = null;
function getRadialGlowTexture() {
  if (radialGlowTexture) return radialGlowTexture;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(0.75, "rgba(255,255,255,0.14)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  radialGlowTexture = new THREE.CanvasTexture(c);
  radialGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return radialGlowTexture;
}

// Warm accent strips for architectural recesses (studio2's wall niches). Same additive
// soft-edged approach as the panel strips: a thin plane carrying the gaussian falloff texture,
// so it reads as a gentle glowing line rather than a hard bright bar. Because the baked rooms
// are unlit, this is self-illuminated geometry — it glows, it doesn't cast light.
/**
 * The 4 accent-strip configs (top/bottom/near/far) that frame a niche's entire recess,
 * rather than the single top-edge bar this room shipped with — a lit frame around the
 * opening instead of one line across the top of it.
 *
 * `axis` is which wall the niche is cut into: "z" for the back wall, where a PlaneGeometry's
 * local X/Y map straight onto world X/Y with no rotation, or "x" for a side wall, where the
 * strips need rotationY so their local X maps onto world Z instead — same convention the
 * room's original single top strips already used (compare the sign of rotationY below
 * against those).
 */
function nicheFrameStrips({
  axis,
  mount,
  alongCenter = 0,
  yCenter,
  halfWidth,
  halfHeight,
  inset = 0.06,
  thickness = 0.05,
  color,
  intensity,
}) {
  const innerW = halfWidth * 2 - inset * 2;
  const innerH = halfHeight * 2 - inset * 2;
  const rotationY = axis === "x" ? (mount < 0 ? Math.PI / 2 : -Math.PI / 2) : undefined;
  // axis "z": along-wall runs on world X, mount is the fixed Z (the wall face).
  // axis "x": along-wall runs on world Z, mount is the fixed X (the wall face).
  const point = (along, y) => (axis === "z" ? [along, y, mount] : [mount, y, along]);

  return [
    { position: point(alongCenter, yCenter + halfHeight - inset), width: innerW, height: thickness, rotationY, color, intensity },
    { position: point(alongCenter, yCenter - halfHeight + inset), width: innerW, height: thickness, rotationY, color, intensity },
    { position: point(alongCenter - halfWidth + inset, yCenter), width: thickness, height: innerH, rotationY, color, intensity },
    { position: point(alongCenter + halfWidth - inset, yCenter), width: thickness, height: innerH, rotationY, color, intensity },
  ];
}

function addAccentStrips(strips, targetGroup) {
  strips.forEach((s) => {
    const material = new THREE.MeshBasicMaterial({
      map: getSoftStripTexture(),
      color: new THREE.Color(s.color).multiplyScalar(s.intensity),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), material);
    mesh.position.set(s.position[0], s.position[1], s.position[2]);
    if (s.rotationY) mesh.rotation.y = s.rotationY;
    mesh.name = "AccentStrip";
    targetGroup.add(mesh);
  });
}

// An elegant warm light pool beneath the table slab — a single horizontal additive plane
// with a soft radial falloff, so it reads as light genuinely emanating from under the slab
// rather than a hard-edged rectangle. Added into the room group so it tears down with it.
/**
 * An uplight aimed at the ceiling.
 *
 * The room's key is a spot at y 2.85 pointing DOWN at the table, so it never illuminates the
 * ceiling at all — which left the hemisphere's ground term and the flat ambient as the only
 * things reaching it, and neither has any direction, so the ceiling had no gradient and read
 * as a flat void. A dedicated wash pointing straight up gives it a real pool of light and a
 * falloff toward the corners, which is what makes it read as a roof over the room.
 *
 * Deliberately not a shadow caster: it exists to shape a surface nothing else reaches, and
 * the room already has one shadow-casting light.
 */
function addCeilingWash(cfg, targetGroup) {
  const light = new THREE.SpotLight(
    new THREE.Color(cfg.color ?? 0xffd9b0),
    cfg.intensity ?? 5,
    cfg.distance ?? 0,
    cfg.angle ?? Math.PI / 2.6,
    cfg.penumbra ?? 0.9,
    cfg.decay ?? 2,
  );
  light.position.set(cfg.x ?? 0, cfg.y ?? 2.2, cfg.z ?? 0);
  light.target.position.set(cfg.x ?? 0, cfg.targetY ?? 3.2, cfg.z ?? 0);
  light.castShadow = false;
  light.name = "CeilingWash";
  targetGroup.add(light, light.target);
}

/**
 * Small recessed ceiling downlights: a glowing disc flush with the ceiling (the visible
 * fixture) plus a real spot aimed straight down (the pool it casts on the floor/table).
 * Neither half alone reads as a downlight — the disc without the spot is a bright dot
 * with nothing to justify it, the spot without the disc is a pool with no visible source.
 */
function addDownlights(configs, targetGroup) {
  const discMaterial = new THREE.MeshBasicMaterial({
    map: getRadialGlowTexture(),
    color: new THREE.Color(DOWNLIGHT_COLOR).multiplyScalar(2.4),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
    side: THREE.DoubleSide,
    fog: false,
  });

  configs.forEach((cfg) => {
    const [x, y, z] = cfg.position;

    const disc = new THREE.Mesh(new THREE.PlaneGeometry(cfg.discSize ?? 0.09, cfg.discSize ?? 0.09), discMaterial);
    disc.position.set(x, y, z);
    disc.rotation.x = -Math.PI / 2; // flush with the ceiling, facing straight down
    disc.name = "DownlightFixture";
    targetGroup.add(disc);

    const spot = new THREE.SpotLight(
      new THREE.Color(cfg.color ?? DOWNLIGHT_COLOR),
      cfg.intensity ?? 5,
      cfg.distance ?? 0,
      cfg.angle ?? Math.PI / 10,
      cfg.penumbra ?? 0.5,
      cfg.decay ?? 2,
    );
    spot.position.set(x, y, z);
    spot.target.position.set(x, cfg.floorY ?? 0, z);
    spot.castShadow = false;
    spot.name = "Downlight";
    targetGroup.add(spot, spot.target);
  });
}

function addUnderSlabGlow(cfg, targetGroup) {
  const material = new THREE.MeshBasicMaterial({
    map: getRadialGlowTexture(),
    color: new THREE.Color(cfg.color).multiplyScalar(cfg.intensity),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.depth), material);
  pool.rotation.x = -Math.PI / 2; // lay it flat, just under the slab
  pool.position.set(0, cfg.y, 0);
  targetGroup.add(pool);
}

// ---------- Procedural rose-gold surfaces (opt-in via room config `procedural`) ----------
// Studio 3 drops its baked lightmaps entirely and is dressed in real-time PBR instead: a
// warm rose palette lit by the live room rig below. Studio 1 is untouched and still uses
// its baked unlit path.
//
// Rose-gold family, matched against each surface's source material name. Ordered so the
// more specific names (Floor/Ceiling/Baseboard/Table) win before the generic Wall rule.
// All surfaces are MeshStandardMaterial with metalness 0, differing only in colour, roughness
// and environment contribution.
//
// IMPORTANT on the earlier "walls change shade with camera angle" bug: the dominant cause was
// image-based specular from scene.environment (envMapIntensity was non-zero), which tints an
// ENTIRE wall differently as you orbit. That is why every matte surface below is pinned to
// `envIntensity: 0`. What remains is only the direct-light specular lobe from the single room
// spot — a small, localised sheen where the light actually falls, which is exactly the
// "gentle highlight" a satin wall needs. The floor is the one surface given a real
// environment contribution, because it's meant to be reflective.
//
// Order matters: /Riser/ is tested before /Table/ since "Room3_Table_Riser" contains both.
const STUDIO3_PALETTE = [
  // Deep rose/mauve. envIntensity dropped 0.5 → 0.08: at 0.5 the floor was mirroring the bright
  // studio HDRI and washing out to pale grey instead of reading as dark rose (visible in the
  // screenshot as a near-white floor). Gloss now comes from the light, not the environment.
  { key: "floor", match: /Floor/i, color: "#4f3038", roughness: 0.3, envIntensity: 0.08 },
  // Ceiling: deep like the floor but fully matte (roughness 0.95, zero environment) so it has
  // no sheen at all. It needs to be markedly darker than the walls — when it sat close to the
  // wall value there was no tonal break at the junction and the eye read the wall as simply
  // continuing upward into shadow, i.e. "no roof". The depth is what makes it read as a solid
  // enclosing plane rather than open space.
  // Dark and fully matte. This is the version that actually reads as a solid roof — attempts to
  // light it or lift its value made it wash toward grey and read as empty space again.
  // Lifted well clear of both its original near-black (#241620) AND the walls (#63444a).
  // A first attempt at #70535a still read as "no roof", and the reason is contrast, not
  // brightness: a ceiling only registers as a surface when there is a visible boundary where
  // the wall stops. Barely-lighter-than-the-wall gives no such edge, so the eye reads the
  // room as open at the top. This is deliberately a clear step lighter than the walls.
  {
    key: "ceiling",
    match: /Ceiling/i,
    color: "#96757d",
    roughness: 0.9,
    envIntensity: 0.5,
    // Coffered field, inset from the walls. Proportions matter more than the effect here:
    //   panelSize 1.375 divides the 5.5m room EXACTLY 4 times, so no panel is cut by a wall
    //     and the grid is symmetric about the room's centre line. An arbitrary size leaves
    //     ragged part-panels at the edges, which is what reads as laid-in tile.
    //   seamWidth 18mm is a joinery reveal. The first pass used 55mm, which at this ceiling
    //     height is a structural-looking channel, not a shadow line.
    //   seamColor is a deep rose a step down from the ceiling tone, NOT near-black. High
    //     contrast makes the grid graphic and cheap; a tonal seam reads as depth.
    coffer: {
      panelSize: 1.375,
      seamWidth: 0.018,
      seamColor: "#4a2f35",
      seamStrength: 0.7,
      roomHalf: 2.75,
      borderInset: 0.5,
    },
  },
  // polygonOffset: true — the baseboard mesh is glued exactly flush against the wall (see
  // makeProceduralRoomMaterial's note), which z-fights without it.
  { key: "baseboard", match: /Baseboard/i, color: "#463036", roughness: 0.45, envIntensity: 0, polygonOffset: true },
  // Riser: deeper warm taupe so the product still reads clearly against it, a touch glossier.
  { key: "riser", match: /Riser/i, color: "#a17f70", roughness: 0.26, envIntensity: 0 },
  // Tabletop slab: warm stone. Muted from #dcc6ab — that value plus the spot was clipping the
  // slab to flat white (it read as a lit panel, not a surface), losing all stone colour.
  { key: "table", match: /Table|Slab/i, color: "#b8a189", roughness: 0.3, envIntensity: 0 },
  // Walls: one shared material instance across all 4 (the /Ceiling/i half of this pattern
  // never actually matches anything — the ceiling entry above it already claims every
  // Ceiling mesh, since STUDIO3_PALETTE.find() takes the first match). Was a single flat
  // dusty rose with nothing else going on; now tall recessed panels framed by a thin reveal
  // (see makePaneledWallMaterial), the wall equivalent of the ceiling's own coffering.
  {
    key: "wall",
    match: /Wall|Ceiling/i,
    color: "#63444a",
    roughness: 0.38,
    envIntensity: 0,
    // panelWidth matches the ceiling's own coffer size (1.375, dividing the 5.5m room
    // exactly 4 times) so the two elements read as one considered architectural language
    // rather than two independently-sized grids. fieldBottom/fieldTop border the panel
    // field within the wall — an unbroken seam running into the baseboard or ceiling line
    // reads as a construction seam, not moulding.
    panel: {
      panelWidth: 1.375,
      seamWidth: 0.018,
      seamColor: "#3a262b",
      seamStrength: 0.65,
      fieldBottom: 0.42,
      fieldTop: 2.6,
    },
  },
];
const STUDIO3_FALLBACK = { key: "fallback", color: "#63444a", roughness: 0.38, envIntensity: 0 };

// Flat, untextured surface: a single uniform colour, no maps of any kind.
//
// side: DoubleSide matters. Every surface in studio3.glb is authored `doubleSided: true`, but
// a replacement material defaults to FrontSide — which silently backface-culled the ceiling
// (a plane whose normal points up) when viewed from inside, showing as an open gap at the top
// of the room. Honouring the source's double-sidedness closes it using the real ceiling
// geometry, so it lines up with the walls exactly instead of a bolted-on plane.
/**
 * A coffered ceiling — panel grid with recessed seams.
 *
 * A flat plane under a single soft wash produces a smooth radial gradient and nothing else,
 * and that reads as open sky rather than a roof no matter what colour or intensity it is
 * given: the eye has no cue that the surface is a built object. Regular seams supply that
 * cue. They also give the perspective something to converge along, which is most of what
 * tells you a ceiling is a bounded plane overhead rather than an open expanse.
 *
 * Grid is evaluated in world XZ so panels stay square and aligned to the room regardless of
 * how the plane happens to be UV-mapped.
 */
function makeCofferedCeilingMaterial(spec) {
  const coffer = spec.coffer ?? {};
  const uniforms = {
    u_seamColor: { value: new THREE.Color(coffer.seamColor ?? 0x4a2f35) },
    u_panelSize: { value: coffer.panelSize ?? 1.375 },
    u_seamWidth: { value: coffer.seamWidth ?? 0.018 },
    u_seamStrength: { value: coffer.seamStrength ?? 0.7 },
    u_roomHalf: { value: coffer.roomHalf ?? 2.75 },
    u_borderInset: { value: coffer.borderInset ?? 0.5 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: 0.0,
    envMapIntensity: spec.envIntensity ?? 0,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    Object.keys(uniforms).forEach((key) => {
      shader.uniforms[key] = uniforms[key];
    });

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vCeilWorld;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vCeilWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec3 u_seamColor;
      uniform float u_panelSize;
      uniform float u_seamWidth;
      uniform float u_seamStrength;
      uniform float u_roomHalf;
      uniform float u_borderInset;
      varying vec3 vCeilWorld;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      `vec2 ceilP = vCeilWorld.xz;
      vec2 ceilAbs = abs( ceilP );
      float ceilExtent = max( ceilAbs.x, ceilAbs.y );
      float ceilField = u_roomHalf - u_borderInset;

      // Seam distance is carried in METRES, not cell fractions, so the reveal keeps the same
      // physical width whatever the panel size is set to.
      vec2 ceilCell = fract( ceilP / u_panelSize );
      vec2 ceilEdge = min( ceilCell, 1.0 - ceilCell ) * u_panelSize;
      float ceilBorder = min( ceilEdge.x, ceilEdge.y );
      // u_seamWidth (18mm) is a fixed WORLD distance; at typical room viewing distances
      // that's sub-pixel in screen space, which a raw smoothstep over it aliases rather than
      // anti-aliases — invisible in a still frame, but shimmering as the camera moves, since
      // each frame lands at a different sub-pixel phase against the pattern. fwidth() gives
      // the on-screen footprint of one pixel in this quantity's units, so flooring the
      // transition width at ~1.5x that keeps the edge always at least a couple of screen
      // pixels wide — genuinely soft up close, cleanly anti-aliased from a distance, instead
      // of a line that's either too thin to render correctly or crawling.
      float ceilBorderAA = max( u_seamWidth, fwidth( ceilBorder ) * 1.5 );
      float ceilGrid = 1.0 - smoothstep( 0.0, ceilBorderAA, ceilBorder );

      // The coffered field stops short of the walls, leaving a plain margin all round. A grid
      // running edge-to-edge gets cut arbitrarily by the walls into part-panels, which is the
      // single thing that most makes a ceiling read as laid-in office tile rather than as
      // joinery set into a room.
      float ceilFieldAA = max( u_seamWidth, fwidth( ceilExtent ) * 1.5 );
      ceilGrid *= 1.0 - smoothstep( ceilField - ceilFieldAA, ceilField, ceilExtent );

      // One fine reveal tracing the edge of that field — the shadow gap of an inset panel.
      float ceilPerimDist = abs( ceilExtent - ceilField );
      float ceilPerimAA = max( u_seamWidth, fwidth( ceilPerimDist ) * 1.5 );
      float ceilPerimeter = 1.0 - smoothstep( 0.0, ceilPerimAA, ceilPerimDist );

      float ceilSeam = max( ceilGrid, ceilPerimeter ) * u_seamStrength;
      vec4 diffuseColor = vec4( mix( diffuse, u_seamColor, ceilSeam ), opacity );`,
    );

    // The reveal is a shadowed gap, not a polished surface — breaking the specular along it
    // keeps the seams reading as depth rather than as a drawn-on grid.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp( roughnessFactor + ceilSeam * 0.2, 0.02, 1.0 );`,
    );
  };

  material.customProgramCacheKey = () => "studioCofferedCeiling";
  return material;
}

/**
 * Paneled walls — tall recessed panels framed by a thin reveal, the wall equivalent of the
 * coffered ceiling above. A single flat colour on a wall this size reads as plain no matter
 * how it's lit; the coffered ceiling already proved the fix for that (regular seams give the
 * eye a cue that the surface is a built object, and something for perspective to converge
 * along) — this applies the same language to the walls rather than inventing a second one.
 * Vertical panels (wainscoting-style), not a square grid, so it reads as wall moulding and
 * doesn't repeat the ceiling's own look.
 *
 * All 4 studio3 walls share ONE material instance (see STUDIO3_PALETTE), so the grid can't
 * be computed from a single fixed world axis pair the way the ceiling's world-XZ grid can —
 * front/back walls run along world X, left/right run along world Z. The fragment shader
 * picks the pair per-fragment from the surface NORMAL instead (these walls are axis-aligned,
 * so the dominant normal axis tells you which world axis is "through" the wall and which is
 * "along" it), so one shared instance still grids correctly on all four.
 */
function makePaneledWallMaterial(spec) {
  const panel = spec.panel ?? {};
  const uniforms = {
    u_seamColor: { value: new THREE.Color(panel.seamColor ?? 0x3a262b) },
    u_panelWidth: { value: panel.panelWidth ?? 1.375 },
    u_seamWidth: { value: panel.seamWidth ?? 0.018 },
    u_seamStrength: { value: panel.seamStrength ?? 0.65 },
    u_fieldBottom: { value: panel.fieldBottom ?? 0.42 },
    u_fieldTop: { value: panel.fieldTop ?? 2.6 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: 0.0,
    envMapIntensity: spec.envIntensity ?? 0,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    Object.keys(uniforms).forEach((key) => {
      shader.uniforms[key] = uniforms[key];
    });

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vWallWorld;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vWallWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec3 u_seamColor;
      uniform float u_panelWidth;
      uniform float u_seamWidth;
      uniform float u_seamStrength;
      uniform float u_fieldBottom;
      uniform float u_fieldTop;
      varying vec3 vWallWorld;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      `vec3 wallN = normalize( vNormal );
      // Axis-aligned walls only: whichever world axis the normal points along is the
      // through-wall axis, so the OTHER horizontal axis is the one panels run along.
      float wallAlong = ( abs( wallN.x ) > abs( wallN.z ) ) ? vWallWorld.z : vWallWorld.x;
      float wallY = vWallWorld.y;

      // u_seamWidth is a fixed world distance (18mm) — sub-pixel at typical viewing
      // distances, which a raw smoothstep over it aliases into a line that shimmers as the
      // camera moves rather than anti-aliasing cleanly (see the matching note in the
      // coffered ceiling shader, which had the same bug). fwidth() floors each transition's
      // width at roughly a pixel and a half on screen, so it stays soft up close and clean
      // anti-aliased from a distance instead of crawling.
      float wallCellX = fract( wallAlong / u_panelWidth );
      float wallEdgeX = min( wallCellX, 1.0 - wallCellX ) * u_panelWidth;
      float wallEdgeXAA = max( u_seamWidth, fwidth( wallEdgeX ) * 1.5 );
      float wallVerticalSeam = 1.0 - smoothstep( 0.0, wallEdgeXAA, wallEdgeX );

      // The panel field is bordered top and bottom (baseboard and cornice height) rather
      // than running the full floor-to-ceiling wall — an unbroken vertical seam running
      // into the baseboard and ceiling line reads as a construction seam, not moulding.
      float wallTopDist = abs( wallY - u_fieldTop );
      float wallBottomDist = abs( wallY - u_fieldBottom );
      float wallTopAA = max( u_seamWidth, fwidth( wallTopDist ) * 1.5 );
      float wallBottomAA = max( u_seamWidth, fwidth( wallBottomDist ) * 1.5 );
      float wallTopSeam = 1.0 - smoothstep( 0.0, wallTopAA, wallTopDist );
      float wallBottomSeam = 1.0 - smoothstep( 0.0, wallBottomAA, wallBottomDist );
      float wallInField = step( u_fieldBottom, wallY ) * step( wallY, u_fieldTop );

      float wallSeam = max( wallVerticalSeam * wallInField, max( wallTopSeam, wallBottomSeam ) ) * u_seamStrength;
      vec4 diffuseColor = vec4( mix( diffuse, u_seamColor, wallSeam ), opacity );`,
    );

    // Same reasoning as the coffered ceiling: the reveal is a shadowed gap, so it should
    // read as rougher/less specular than the panel face, not as a drawn-on line.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp( roughnessFactor + wallSeam * 0.2, 0.02, 1.0 );`,
    );
  };

  material.customProgramCacheKey = () => "studioPaneledWall";
  return material;
}

function makeProceduralRoomMaterial(spec) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: 0.0,
    envMapIntensity: spec.envIntensity ?? 0,
    side: THREE.DoubleSide,
  });

  // Set on the baseboard: it's authored as a thin trim box glued flush against the wall,
  // and the two meshes' touching faces sit at the EXACT same depth (confirmed against the
  // GLB directly — e.g. Room3_WallBack's inner face and Room3_Baseboard_Back both sit at
  // Z -2.750, over the whole area where they overlap). Two different meshes occupying the
  // identical plane is z-fighting by definition: the depth test has no reliable winner, so
  // it flickers between the wall colour and the baseboard colour at that seam, and WHICH
  // one wins shifts with the camera's exact position/angle because the two meshes reach
  // that shared depth through slightly different floating-point paths — which is exactly
  // why it reads as "glitching on camera movement" rather than being simply wrong.
  // polygonOffset nudges this material's rendered depth slightly toward the camera at the
  // GPU level (no geometry edit needed, and no visible shift in the baseboard's actual
  // position), so it wins that depth test unconditionally instead of by chance.
  if (spec.polygonOffset) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -4;
  }

  return material;
}

// ---------- Polished white Carrara ----------
/**
 * Unveined polished stone: a near-white body under a full clearcoat.
 *
 * This started out as a procedurally veined slab (world-space turbulence bands, a second
 * crossing vein set, soft clouding). All of that is gone — the room is meant to read as
 * clean white stone, and veining on the walls fought the product rather than framing it.
 * What's left is deliberately just a material: the look now comes entirely from the polish
 * (clearcoat + low roughness) and what that polish reflects, which is the whole point of a
 * white room and is also far cheaper than a five-octave noise field per fragment.
 */
function makeMarbleMaterial(spec = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.color ?? spec.base ?? 0xf4f4f1),
    roughness: spec.roughness ?? 0.1,
    metalness: spec.metalness ?? 0,
    clearcoat: spec.clearcoat ?? 1.0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.035,
    envMapIntensity: spec.envIntensity ?? 0.55,
    side: THREE.DoubleSide,
  });

  // Cove slits are light fixtures cut into the wall, not stone — they need to emit rather
  // than merely be pale, or the room loses the one element that explains where its light is
  // coming from.
  if (spec.emissive) {
    material.emissive = new THREE.Color(spec.emissive);
    material.emissiveIntensity = spec.emissiveIntensity ?? 1;
  }

  // Opts this material into an explicit envMap once the room bake exists (see
  // bakeRoomEnvironment). Without it WebGLRenderer overwrites envMapIntensity with
  // scene.environmentIntensity for any material whose envMap is null — which would tie the
  // stone's gloss to the bust's ambient level and make the two impossible to balance
  // separately. It matters more here than it did with veining: with no pattern, reflection
  // is the only thing giving these surfaces form.
  material.userData.wantsRoomEnv = true;

  // Same fix as makeProceduralRoomMaterial's baseboard entry, needed here too: studio2's
  // GLB was built from the same template as studio3's, and its baseboard meshes are
  // likewise glued exactly flush against the wall — confirmed directly against the GLB
  // (e.g. Room2_WallBack's inner face and Room2_Baseboard_Back both sit at Z -2.750).
  // Coincident depth between two different meshes z-fights, and which one wins flickers
  // with the camera's exact position, which is what "glitches on camera movement" was.
  if (spec.polygonOffset) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -4;
  }

  return material;
}

// ---------- Studio 2 surface palette ----------
// One material for the whole room was a mistake: studio2 is not a plain box. It has three
// niches with shelves, cove slits, baseboards, a table with legs and a riser — real
// articulation that a single shared white erased completely, which is why the room read as
// empty. Everything below stays in the white-stone family; separation comes from ROUGHNESS
// and REFLECTIVITY far more than from colour, which is how a monochrome material palette
// actually reads as varied rather than as several mismatched whites.
//
// Order matters — `find` takes the first match, so the specific patterns precede the general
// ones (Shelf before Niche, CoveSlit and Niche before Wall, Riser and Leg before Table).
const STUDIO2_PALETTE = [
  // Light slits: the perimeter ceiling cove. Warmed and brightened slightly from a first
  // pass (#fff6e8 body / 1.6 emissive) — with the room's overall brightness pulled down
  // (see envBoost below) this needed more headroom to read as a clear warm line rather
  // than getting lost.
  { key: "cove", match: /CoveSlit/i, color: "#fff2df", roughness: 0.9, clearcoat: 0, envIntensity: 0, emissive: "#ffd6a0", emissiveIntensity: 1.9 },
  // Display shelves: the most polished stone in the room, because things are shown on them.
  { key: "shelf", match: /Shelf/i, color: "#f0e7d6", roughness: 0.07, clearcoatRoughness: 0.03, envIntensity: 0.6 },
  // Niche interiors: darker and honed, NOT polished. A recess that reflects as brightly as
  // the wall around it stops reading as a recess at all — this is what gives the back wall depth.
  { key: "niche", match: /Niche/i, color: "#d9cfc0", roughness: 0.62, clearcoat: 0.1, envIntensity: 0.1 },
  // A darker band grounding the wall/floor junction.
  // polygonOffset: true — glued exactly flush against the wall; see makeMarbleMaterial's note.
  { key: "baseboard", match: /Baseboard/i, color: "#c2b6a4", roughness: 0.25, clearcoat: 0.8, envIntensity: 0.35, polygonOffset: true },
  { key: "riser", match: /Riser/i, color: "#d1c3ac", roughness: 0.2, clearcoat: 0.9, envIntensity: 0.4 },
  // Brass legs — the one non-stone material, carrying the room's own accent warmth.
  { key: "leg", match: /Leg/i, color: "#b08d5a", metalness: 1.0, roughness: 0.25, clearcoat: 0.3, envIntensity: 0.9 },
  // The hero surface: the highest-gloss slab in the room, directly under the product.
  { key: "table", match: /Table/i, color: "#f1e8d8", roughness: 0.05, clearcoatRoughness: 0.02, envIntensity: 0.7 },
  // Mirror-polished floor. This is what puts something under the table instead of blank white.
  { key: "floor", match: /Floor/i, color: "#e8ddc9", roughness: 0.06, clearcoatRoughness: 0.02, envIntensity: 0.8 },
  { key: "ceiling", match: /Ceiling/i, color: "#f5ecdd", roughness: 0.72, clearcoat: 0, envIntensity: 0.08 },
  // Lightened and given real sheen — was honed matte (#f2e9da, roughness 0.55, clearcoat
  // 0.15) on the theory that walls should recede behind the floor/table. Still clearly
  // behind those two (which sit at the 1.0 clearcoat default this palette otherwise uses),
  // so the room keeps its hierarchy of hero surfaces vs. backdrop — just a paler, glossier
  // backdrop than before.
  { key: "wall", match: /Wall/i, color: "#f7f0e2", roughness: 0.24, clearcoat: 0.6, envIntensity: 0.32 },
];
const STUDIO2_FALLBACK = { key: "wall-fallback", color: "#f7f0e2", roughness: 0.24, clearcoat: 0.6, envIntensity: 0.32 };

// ---------- Per-room material treatments (opt-in via room config) ----------
// A brighter, more saturated gold than the previous #c19a5b — see the metalness note below
// for why the old tone was reading dark rather than dull.
const ROD_COLOR = "#d9ac5e";
// This has already been tuned once in each direction and overshot both times, because the
// room's own lighting changed under it rather than the material being wrong in isolation:
//   - Originally roughness 0.35 against the old bright generic studio HDRI reflected that
//     HDRI as a near-uniform soft wash — reading pale/ivory, not metallic. Roughness was
//     dropped to 0.15 to fix that (sharp, high-contrast specular catches read as "polished
//     metal").
//   - Once studio3 got its OWN baked room environment (a deliberately dark, moody plum
//     room — see STUDIO3_PALETTE), that same tight 0.15 lobe had far less bright content to
//     catch. metalness 1.0 means NO diffuse term at all — a true metal's colour comes
//     entirely from what it reflects — so against a dark environment the rods read as
//     almost pure black except at the one or two angles that happen to catch a direct
//     light's specular glint. That's what "dark, not golden" was.
// Fix: metalness pulled back from a true 1.0 so a real (if small) diffuse term survives —
// the rods now have a warm gold FLOOR brightness from ambient/direct light everywhere along
// their length, not just at glint angles — and roughness raised a little further so the
// specular lobe is wide enough to pick up ambient brightness generally rather than needing
// one precise reflection angle. Still reads as polished, not satin.
const ROD_ROUGHNESS = 0.26;
const ROD_METALNESS = 0.82;
// Given its own explicit envMap (see loadRoomModel's material loop and wantsRoomEnv) rather
// than being left on the implicit path, where WebGLRenderer silently overwrites
// envMapIntensity with scene.environmentIntensity every frame — a room-wide dial tuned for
// the walls/floor, not for this one accent metal. Pushed well past the walls' own env
// intensity because a metal needs much more reflected light than a diffuse stone surface
// to read as bright at all.
const ROD_ENV_INTENSITY = 2.4;

// Live polished brass for the rods/caps/collars, replacing their broken bake — a true metal
// so it reacts to the scene lights + HDRI as warm gold with clear specular highlights.
function makeRodMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ROD_COLOR),
    metalness: ROD_METALNESS,
    roughness: ROD_ROUGHNESS,
    envMapIntensity: ROD_ENV_INTENSITY,
  });
  // Same opt-in the room stone/bust use — see makeMarbleMaterial's note on why this has to
  // be explicit rather than left to scene.environment's implicit fallback.
  material.userData.wantsRoomEnv = true;
  return material;
}

// ---------- Room loading / teardown ----------
// Loads a room GLB into its own group (per-config materials + panel strips), WITHOUT
// adding it to the scene — the caller decides when to swap it in.
async function loadRoomModel(config) {
  const gltf = await loadModel(config.url);
  const room = gltf.scene;
  room.updateMatrixWorld(true);

  // One material instance per surface type for this room, so (for example) all four walls
  // share the exact same material object rather than four separately-built lookalikes that
  // could drift apart.
  const sharedMaterials = new Map();
  function getSharedMaterial(key, build) {
    if (!sharedMaterials.has(key)) {
      const built = build();
      built.name = `${config.id}-${key}`;
      sharedMaterials.set(key, built);
    }
    return sharedMaterials.get(key);
  }

  let missingBake = 0;
  room.traverse((object) => {
    if (!object.isMesh) return;
    const src = object.material;
    const srcName = src?.name ?? "";
    // Each surface's bake is its base-color texture on the lightmap UV set (GLTFLoader put
    // it on `uv1` because glTF flagged texCoord=1). Reusing the same texture keeps its
    // channel=1 and sRGB colorspace.
    // Blender can wire a bake into either slot, and the two rooms differ: studio1 puts it in
    // baseColorTexture, studio2 puts it in emissiveTexture with baseColorFactor authored BLACK
    // and no baseColorTexture at all. Read whichever slot actually holds it — using only `.map`
    // would render studio2 completely black.
    const bakedMap = src?.map ?? src?.emissiveMap ?? null;
    const bakeInEmissive = !src?.map && !!src?.emissiveMap;

    // Diagnostic: what the GLB actually exported for each surface, per room — so studio1 vs
    // studio3 material types/props can be compared in the console.
    console.log(
      `[lensDetail:${config.id}] mesh "${object.name}" src=${src?.type} name="${srcName}" ` +
        `map=${!!src?.map} emissiveMap=${!!src?.emissiveMap} metalness=${src?.metalness} roughness=${src?.roughness}`,
    );

    let material;
    let litSurface = false;
    if (config.rods && /Rod|Brass/i.test(srcName)) {
      // Rod caps/collars (and the brass fixture material): their bake doesn't display
      // correctly → live brass instead. Shared so every rod is identical.
      material = getSharedMaterial("rod", makeRodMaterial);
      litSurface = true;
    } else if (config.marble) {
      // Studio 2: white stone, but matched PER SURFACE (see STUDIO2_PALETTE). One shared
      // material for the whole room flattened its niches, shelves, cove slits and table
      // into a single blank white. Each palette entry is still one shared instance, so
      // surfaces of a kind cannot drift apart. The GLB's bake textures are never applied
      // and are disposed below.
      const spec = STUDIO2_PALETTE.find((p) => p.match.test(srcName)) ?? STUDIO2_FALLBACK;
      material = getSharedMaterial(spec.key, () => makeMarbleMaterial(spec));
      litSurface = true;
    } else if (config.procedural) {
      // Studio 3: no baked texture at all — a flat procedural surface lit in real time. All 4
      // walls resolve to the same palette entry and therefore the SAME material instance, so
      // they cannot drift apart. The GLB's bake textures are never applied (disposed below).
      const spec = STUDIO3_PALETTE.find((p) => p.match.test(srcName)) ?? STUDIO3_FALLBACK;
      material = getSharedMaterial(spec.key, () =>
        spec.coffer
          ? makeCofferedCeilingMaterial(spec)
          : spec.panel
            ? makePaneledWallMaterial(spec)
            : makeProceduralRoomMaterial(spec),
      );
      litSurface = true;
    } else {
      // Baked rooms (studio1, studio2): unlit MeshBasicMaterial showing the bake as its sole
      // appearance — zero contribution from scene lights or environment, so the colour is
      // static from every camera angle (this is what prevents the view-dependent shifting).
      if (!bakedMap) missingBake += 1;
      material = new THREE.MeshBasicMaterial({
        map: bakedMap,
        // When the bake sits in the emissive slot, baseColorFactor is authored black — using
        // it would multiply the bake to nothing, so the tint must be white instead.
        color: bakeInEmissive
          ? new THREE.Color(0xffffff)
          : src?.color
            ? src.color.clone()
            : new THREE.Color(0xffffff),
      });
      material.name = srcName;
    }
    object.material = material;
    // Lit surfaces RECEIVE shadows only. They must never CAST: the room is a closed box, so a
    // shadow-casting ceiling/wall would occlude the directional key and black out the whole
    // interior. The product (and its contact shadow) is the caster.
    object.castShadow = false;
    object.receiveShadow = litSurface;

    // Free any source textures the new material didn't carry over (e.g. studio3's separate
    // emissive-bake texture, or the rods' now-unused bake), keeping the shared strip texture.
    if (src) {
      const kept = new Set([material.map, material.emissiveMap, softStripTexture].filter(Boolean));
      [src.map, src.emissiveMap].forEach((t) => {
        if (t && !kept.has(t)) t.dispose();
      });
      src.dispose?.();
    }
  });

  const roomGroup = new THREE.Group();
  roomGroup.name = `room-${config.id}`;
  roomGroup.add(room);
  roomGroup.updateMatrixWorld(true); // so panel world bounds are correct before tracing strips

  const strips = addPanelEdgeLighting(room, roomGroup);
  if (config.underSlabGlow) addUnderSlabGlow(config.underSlabGlow, roomGroup);
  if (config.accentStrips) addAccentStrips(config.accentStrips, roomGroup);
  if (config.ceilingWash) addCeilingWash(config.ceilingWash, roomGroup);
  if (config.downlights) addDownlights(config.downlights, roomGroup);

  // Nudge the ceiling down when a room needs it. studio2 has a cove-slit recess just below the
  // ceiling line (its geometry sits behind the wall face at y 2.97–2.99); at the ceiling's
  // authored height that channel is visible from inside as a black gap along the wall/ceiling
  // seam. Dropping the ceiling slightly caps the opening from below and hides it.
  if (config.ceilingOffsetY) {
    roomGroup.traverse((o) => {
      if (o.isMesh && /ceiling/i.test(o.name)) o.position.y += config.ceilingOffsetY;
    });
  }


  const box = new THREE.Box3().setFromObject(room);
  const size = box.getSize(new THREE.Vector3());
  console.log(
    `[lensDetail] ${config.id} loaded — size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}, ${strips} strip(s).`,
  );
  if (missingBake > 0) {
    console.warn(`[lensDetail] ${missingBake} ${config.id} surface(s) had no baked texture — check the export.`);
  }
  logSceneStructure(room, config.id);
  return roomGroup;
}

// Frees a torn-down room's GPU resources. The big per-room bake textures are disposed; the
// SHARED soft-strip texture is deliberately skipped so it survives for the next room.
function disposeRoomGroup(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      [m.map, m.emissiveMap].forEach((t) => {
        if (t && t !== softStripTexture && t !== radialGlowTexture) t.dispose();
      });
      m.dispose();
    });
  });
}

// ---------- Per-room image-based lighting ----------
// Bakes the room the product is actually standing in into an environment map, and uses that
// as scene.environment instead of the generic studio HDRI.
//
// This is the same technique three's own RoomEnvironment uses: PMREMGenerator.fromScene
// renders the scene into a cubemap and prefilters it by roughness. It suits these rooms
// unusually well because studio1/studio2 are BAKED — unlit MeshBasicMaterial carrying a
// lightmap — so rendering them *is* a radiometrically faithful capture of that room's
// light. studio3 is live PBR, so its bake picks up the real rig instead. Either way the
// eyewear ends up reflecting the walls, riser and warm panel strips that surround it,
// which is both more correct and much dimmer than a bright neutral studio sweep.
//
// Kept deliberately cheap: this runs once per room change, not per frame.
const roomPmrem = new THREE.PMREMGenerator(renderer);
// Global multiplier on every room's image-based lighting. Raised above 1 because the room
// bakes were reading under-lit: an interior bake integrates to far less irradiance than the
// open studio HDRI it replaced, so the switch to per-room IBL quietly dimmed every reflective
// surface in the app. Per-room `envBoost` overrides this.
const DEFAULT_ENV_BOOST = 1.45;
const ROOM_ENV_BLUR = 0.04; // slight prefilter blur, so panel strips read as soft sources
let roomEnvRT = null; // the render target backing roomEnvMap; disposed on room change
let roomEnvMap = null;
let fallbackEnvMap = null;

// Materials that opt into an explicit envMap (the room stone — see makeMarbleMaterial).
// Assigning the map rather than relying on scene.environment is what keeps their own
// envMapIntensity: the renderer overwrites it from scene.environmentIntensity for any
// material whose envMap is null, which would otherwise force every room surface to share
// one number.
function forEachRoomEnvMaterial(fn) {
  currentRoomGroup?.traverse((object) => {
    if (!object.isMesh) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    mats.forEach((m) => {
      if (m?.userData?.wantsRoomEnv) fn(m);
    });
  });
}

function bakeRoomEnvironment(config) {
  if (!currentRoomGroup) return false;

  // Nothing that isn't the room may appear in the room's own lighting: a product that
  // contributes to the environment it is lit by feeds back on itself.
  const hidden = [];
  [productModel, shadowGround].forEach((object) => {
    if (object?.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });

  // fromScene always captures from the world origin, which in these rooms is the middle of
  // the floor. Sampling there would fill the lower hemisphere with floor and clip the
  // ceiling coves that supply most of the room's light. Shifting the scene down by the
  // product's own centre height for the duration of the bake puts the capture point where
  // the glasses actually sit, so what they reflect is what a viewer sees around them.
  // Measured fresh off the live model each time: lying flat (see positionProductOnRiser)
  // the product's world-space height above the riser is just its frame thickness.
  const productWorldBox = productModel ? new THREE.Box3().setFromObject(productModel) : null;
  const eyeY = productWorldBox ? (productWorldBox.min.y + productWorldBox.max.y) / 2 : config.riserTopY + 0.02;
  scene.position.y -= eyeY;

  // Room surfaces are lit partly by the environment, so leaving the previous map bound
  // while capturing would compound each bake into the next one. Materials holding an
  // explicit envMap have to be cleared too — nulling scene.environment alone doesn't
  // disable those.
  const previousEnv = scene.environment;
  scene.environment = null;
  forEachRoomEnvMaterial((m) => {
    m.envMap = null;
    m.needsUpdate = true;
  });
  scene.updateMatrixWorld(true);

  let baked = null;
  try {
    baked = roomPmrem.fromScene(scene, ROOM_ENV_BLUR, 0.1, 30);
  } catch (error) {
    console.error(`[lensDetail] Room environment bake failed for ${config.id}:`, error);
  }

  scene.position.y += eyeY;
  scene.updateMatrixWorld(true);
  hidden.forEach((object) => (object.visible = true));

  if (!baked) {
    // Leave the scene on whatever it had rather than unlit.
    scene.environment = previousEnv ?? fallbackEnvMap;
    return false;
  }

  roomEnvRT?.dispose();
  roomEnvRT = baked;
  roomEnvMap = baked.texture;

  const boost = config.envBoost ?? DEFAULT_ENV_BOOST;

  scene.environment = roomEnvMap;
  scene.environmentIntensity = (config.envIntensity ?? 1.0) * boost;

  // Metal/acetate take envMap explicitly (see each material's setEnvironment) so their own
  // envMapIntensity survives — WebGLRenderer overwrites it from the scene value for any
  // material whose envMap is null.
  sharedEnvMap = roomEnvMap;
  applyEnvToMaterials(productMaterials, roomEnvMap, boost);

  forEachRoomEnvMaterial((m) => {
    m.envMap = roomEnvMap;
    scaleEnvIntensity(m, boost);
    m.needsUpdate = true;
  });
  return true;
}

// Re-points every room-specific setting (camera framing + clamp bounds, key/shadow height,
// product placement, optional bloom override) at the given room config.
function applyRoomConfig(config) {
  CAM_MIN.set(-config.bounds.x + CAM_MARGIN, config.bounds.floor + CAM_MARGIN, -config.bounds.z + CAM_MARGIN);
  CAM_MAX.set(config.bounds.x - CAM_MARGIN, config.bounds.ceil - CAM_MARGIN, config.bounds.z - CAM_MARGIN);

  camera.position.copy(config.camera.position);
  controls.target.copy(config.camera.target);
  controls.minDistance = config.camera.min;
  controls.maxDistance = config.camera.max;
  controls.update();

  keyLight.target.position.set(0, config.riserTopY, 0);
  keyLight.target.updateMatrixWorld();
  // Rooms with their own real-time rig (see roomKey below) already cast a proper,
  // room-scaled contact shadow for the product. keyLight casting a SECOND shadow from a
  // different angle on top of that, onto the same real receiving surfaces, is what the rest
  // of "weird shadows throughout the room" was: two overlapping product shadows with
  // different softness/bias never designed to agree with each other. Defaults to on
  // (studio1/studio3 keep exactly the single-shadow look they already had); studio2 turns
  // it off via `keyShadow: false` and relies solely on roomKey's shadow.
  keyLight.castShadow = config.keyShadow ?? true;
  shadowGround.position.y = config.riserTopY + 0.001;

  positionProductOnRiser(config.riserTopY, config.productScale ?? 1);

  // Per-room exposure: tone mapping is a global renderer setting, so each room re-asserts
  // its own value here — studio1 keeps 1.25 and is never changed by switching to studio3.
  renderer.toneMappingExposure = config.exposure ?? DEFAULT_EXPOSURE;

  // Whole post chain on/off per room. When off, animate() renders straight through the
  // renderer, so bloom / vignette / OutputPass contribute nothing at all.
  usePostProcessing = config.postProcessing !== false;

  // Drives the customize panel's per-room palette (see body[data-room] in lens-detail.html),
  // so the strip is themed to whichever room it's sitting in.
  document.body.dataset.room = config.id;

  // Per-room vignette (0 = off, so studio1 renders exactly as before).
  vignettePass.uniforms.uStrength.value = config.vignette ?? 0;

  // Per-room contact-shadow softness. studio1 keeps its soft default (10); studio3 tightens
  // it so the enlarged product casts a crisp, well-defined contact shadow rather than a
  // vague soft grey pool (a candidate for the reported "grey blob").
  keyLight.shadow.radius = config.shadowRadius ?? 10;

  // Real-time room rig: attached only for procedural rooms. Unlit-baked rooms ignore lights,
  // but the rig would still brighten the PRODUCT, so it's detached rather than left in.
  if (config.realtimeLighting) {
    // The rig is one shared set of lights, so a room that borrows it must be able to
    // re-colour it. Studio3's warm rose key would render white Carrara as cream.
    const rig = config.roomRig ?? {};
    roomKey.color.set(rig.keyColor ?? ROOM_KEY_COLOR);
    roomKey.intensity = rig.keyIntensity ?? ROOM_KEY_INTENSITY;
    roomKey.position.copy(rig.keyPosition ?? ROOM_KEY_POSITION);
    roomKey.target.position.copy(rig.keyTarget ?? ROOM_KEY_TARGET);
    roomKey.target.updateMatrixWorld();
    roomFill.color.set(rig.fillSky ?? ROOM_FILL_SKY);
    roomFill.groundColor.set(rig.fillGround ?? ROOM_FILL_GROUND);
    roomFill.intensity = rig.fillIntensity ?? ROOM_FILL_INTENSITY;
    roomAmbient.color.set(rig.ambientColor ?? ROOM_AMBIENT_COLOR);
    roomAmbient.intensity = rig.ambientIntensity ?? ROOM_AMBIENT_INTENSITY;
    if (!roomLightRig.parent) scene.add(roomLightRig);
  } else if (roomLightRig.parent) {
    scene.remove(roomLightRig);
  }

  // Product key/fill are dialled back in rooms that have their own live rig (the rig already
  // lights the product); studio1 keeps its original 0.7 / 0.45 untouched.
  keyLight.intensity = config.productLight?.key ?? 0.7;
  fillLight.intensity = config.productLight?.fill ?? 0.45;

  // A procedural room has real surfaces that receive shadows, so the invisible contact-shadow
  // catcher is redundant there; unlit-baked rooms still need it to ground the product.
  shadowGround.visible = !config.realtimeLighting;

  const b = config.bloom ?? {};
  bloomPass.strength = b.strength ?? BLOOM_STRENGTH;
  bloomPass.radius = b.radius ?? BLOOM_RADIUS;
  bloomPass.threshold = b.threshold ?? BLOOM_THRESHOLD;

  // Last: the room has to be fully placed (riser height, ceiling nudge, light rig attached
  // or detached, product seated) before it can be captured, or the bake would record a
  // room that no longer matches the one on screen.
  bakeRoomEnvironment(config);

  // Shadow maps are re-rendered on demand rather than every frame — the scene is static
  // (only the camera moves), so one update per room change is enough. Asserted after the
  // bake, since the bake's own renders would otherwise consume the pending update.
  renderer.shadowMap.needsUpdate = true;
}

// ---------- Product (loaded once, repositioned per room) ----------
// The same three real products as the On Mannequin view, shown resting directly on the
// riser instead of worn — no face fit needed, so unlike that view there's nothing per-model
// to tune here.
const GLASSES = [{ slug: "the-ostrande" }, { slug: "the-cassian" }, { slug: "the-corbin" }];

// Materials are rebuilt per product on every swap (each has its own finishes/tints), rather
// than being module-level singletons — that is what lets a swapped-in model keep its real
// configurator materials instead of falling back to a default look.
let productMaterials = null;
let sharedEnvMap = null;

// Materials are built from the SHARED selection store rather than straight off the product
// record, so a swatch choice survives a room switch or a frame swap: the store is the source
// of truth and the product's authored values are merely what seeds it (see materialState.js).
function buildProductMaterials(prod) {
  const acetate = prod?.frameConstruction === "acetate";
  const state = getMaterialState(prod?.slug);
  const mats = {
    isAcetate: acetate,
    frame: acetate ? null : createFrameMaterial(state.frame),
    acetate: acetate ? createAcetateMaterial(state.acetate) : null,
    lens: createLensMaterial(state.lens),
    hinge: createFrameMaterial(state.hinge),
    handles: acetate ? null : createFrameMaterial(state.handles),
    text: createTextMaterial(state.text),
  };
  if (sharedEnvMap) applyEnvToMaterials(mats, sharedEnvMap);
  return mats;
}

// Applies a stored selection to the live material for that part. Each material exposes its
// own setter from the shared material modules; these tween internally, which is why
// animate() pumps them (see updateProductTweens).
function applyPartPreset(part, presetName) {
  const mats = productMaterials;
  if (!mats) return;
  if (part === "frame") mats.frame?.setFrameFinish(presetName);
  else if (part === "acetate") mats.acetate?.setAcetateColor(presetName);
  else if (part === "handles") mats.handles?.setFrameFinish(presetName);
  else if (part === "hinge") mats.hinge?.setFrameFinish(presetName);
  else if (part === "lens") mats.lens?.setLensTint(presetName);
  else if (part === "text") mats.text?.setTextColor(presetName);
  renderer.shadowMap.needsUpdate = true;
}

// The finish/tint setters animate toward their target, so their tweens must be advanced
// every frame. The mannequin view previously set materials once at load and never changed
// them, so nothing pumped these — without this, a swatch click would appear to do nothing.
function updateProductTweens(delta) {
  const mats = productMaterials;
  if (!mats) return;
  mats.frame?.updateFrameTween?.(delta);
  mats.handles?.updateFrameTween?.(delta);
  mats.hinge?.updateFrameTween?.(delta);
  mats.acetate?.updateAcetateTween?.(delta);
  mats.lens?.updateLensTween?.(delta);
  mats.text?.updateTextTween?.(delta);
}

// Scales a material's envMapIntensity by the room's boost WITHOUT losing its authored
// value. Each material's own figure is meaningful and they differ deliberately (polished
// metal reflects far harder than acetate), so the boost has to multiply the ratio rather
// than overwrite it — and the base has to be remembered, or repeated room switches would
// compound the multiplier every time.
function scaleEnvIntensity(material, boost) {
  if (!material || !("envMapIntensity" in material)) return;
  if (material.userData.baseEnvMapIntensity === undefined) {
    material.userData.baseEnvMapIntensity = material.envMapIntensity;
  }
  material.envMapIntensity = material.userData.baseEnvMapIntensity * boost;
}

function applyEnvToMaterials(mats, envMap, boost = 1) {
  if (!mats) return;
  mats.frame?.setEnvironment?.(envMap);
  mats.hinge?.setEnvironment?.(envMap);
  mats.handles?.setEnvironment?.(envMap);
  mats.acetate?.setEnvironment?.(envMap);
  [mats.frame, mats.hinge, mats.handles, mats.acetate].forEach((m) => scaleEnvIntensity(m, boost));
}

let productModel = null;
let productRestMeshes = []; // frame/lens body only — see where this is built in loadProduct
let currentProductModelUrl = null; // set in loadProduct — picks this product's own tuned pose below

// Lens-up: the glasses resting on the plinth, lens face toward the ceiling — the whole
// point of this room versus On Mannequin's worn framing (that page seats the same three
// models on a face; this one shows them set down, the way you'd actually inspect a lens).
//
// +Z is each model's authored "front" (the lens-forward face — the On Mannequin scene seats
// a frame on the bust by pushing its bbox max.z toward the face), so rotating -90° about X
// swings that forward-facing normal to point straight up. There's no rig to fold the
// temples closed — every model here is a static mesh (see foldOstrandeTemples for the one
// exception) — so an unfolded pair stays in its authored open position, just laid flat
// rather than worn.
//
// Confirmed poses, picked by hand rather than guessed — each is the angle that reads as
// genuinely resting on the plinth instead of propped on one edge, for that specific model's
// own proportions (and, for the Ostrande, per-room where studio3's framing needed more tilt).
const OSTRANDE_ROTATION_DEG = { x: -36, y: 0, z: 0 };
const OSTRANDE_ROTATION_DEG_STUDIO3 = { x: -45.5, y: 0, z: 0 }; // studio3's own framing needed a steeper angle
const CASSIAN_ROTATION_DEG = { x: -68.5, y: 0, z: 0 };
// Not yet hand-tuned — falls through to the Ostrande's angle below as a starting point.
const CORBIN_ROTATION_DEG = null;

function getAutoRotationDeg() {
  if (currentProductModelUrl === CASSIAN_MODEL_URL) return CASSIAN_ROTATION_DEG;
  if (currentProductModelUrl === CORBIN_MODEL_URL && CORBIN_ROTATION_DEG) return CORBIN_ROTATION_DEG;
  if (currentProductModelUrl === DEFAULT_MODEL_URL && ROOMS[activeRoomIndex]?.id === "studio3") {
    return OSTRANDE_ROTATION_DEG_STUDIO3;
  }
  return OSTRANDE_ROTATION_DEG;
}

// Baked-in downward nudge so the Corbin actually sits on the plinth without needing the
// tweaker's H slider touched at all — its Lens material reads as floating even though
// box.min.y lands exactly on the riser (verified directly against the geometry).
const CORBIN_Y_OFFSET = -0.012;
const CORBIN_Y_OFFSET_STUDIO3 = -0.003; // studio3 was sinking below the plinth at the default offset

function getAutoYOffset() {
  if (currentProductModelUrl !== CORBIN_MODEL_URL) return 0;
  return ROOMS[activeRoomIndex]?.id === "studio3" ? CORBIN_Y_OFFSET_STUDIO3 : CORBIN_Y_OFFSET;
}

// Centred on X/Z and rested on the riser top by measuring the ROTATED world bbox fresh each
// time, rather than a bbox measured before rotation — which axis is "down" changes once the
// model is lying on its back, so a pre-rotation measurement can't answer that.
//
// The box comes from productRestMeshes (the frame/lens body, temples excluded — see where
// it's built in loadProduct), not the whole model: an open temple's tip is the lowest point
// of the full model by a wide margin post-flip, and resting on that propped the frame up in
// the air on the temples like legs instead of laying the lens on the plinth.
function positionProductOnRiser(riserTopY, scale = 1) {
  if (!productModel) return;
  const autoDeg = getAutoRotationDeg();
  productModel.rotation.set(
    THREE.MathUtils.degToRad(autoDeg.x),
    THREE.MathUtils.degToRad(autoDeg.y),
    THREE.MathUtils.degToRad(autoDeg.z),
  );
  productModel.scale.setScalar(scale);
  productModel.position.set(0, 0, 0);
  productModel.updateMatrixWorld(true);
  const box = new THREE.Box3();
  productRestMeshes.forEach((mesh) => box.expandByObject(mesh));
  const center = box.getCenter(new THREE.Vector3());
  productModel.position.set(-center.x, riserTopY - box.min.y + getAutoYOffset(), -center.z);
}


// ---------------------------------------------------------------------------
// Folds a model's temples closed for the lens-up display — confirmed working on the Ostrande
// (pose, pivot, and rest angle all checked in the browser), then reused for the Cassian below.
// Both models bake every mesh's position straight into its vertices — no joints, no hinge rig
// — but each has its temples as a single mesh SEPARATE from the frame/lens body ("handles" on
// the Ostrande, "Temple" on the Cassian), covering both left and right sides in one combined
// geometry with no left/right split in the source data. The Corbin fuses its temples into the
// same continuous mesh as the front instead, so this isn't possible there without re-authoring
// that asset.
//
// What this does: splits that single combined mesh into left/right halves by vertex position,
// pivots each half around a point taken from the TEMPLE's own geometry — its highest-Z
// vertices on that side, i.e. the edge nearest the frame (see attachmentPivot below for why:
// pivoting around a point that's actually part of the geometry being rotated is what keeps
// that edge attached with no gap, versus a separate hinge hardware mesh's centroid used in an
// earlier version, which left one) — and rotates it 90° inward around the model's own (pre
// lens-up-flip) Y axis, so each temple swings from pointing backward (-Z) to pointing sideways
// across the frame, toward the opposite lens (±X) — tips meeting near the bridge, same as a
// real folded pair viewed from above.
//
// The fold angle is 90°, not something closer to 180°, for a reason specific to this room: the
// product is laid lens-up by rotating it about X afterward (see positionProductOnRiser /
// OSTRANDE_ROTATION_DEG), and that rotation maps local +Z toward world +Y (up). A temple
// folded toward +Z — which reads as "flat, alongside the frame" in the model's own native
// orientation — is exactly the direction that flip turns vertical, so it ends up sticking
// straight up off the plinth instead of lying flat. Folding toward ±X instead survives the
// flip: local X stays untouched by a rotation about X alone, so it stays horizontal in the
// final lens-up pose.
//
// Isolated and kept trivially reversible even though it's confirmed good on the Ostrande:
// nothing outside this function and its call sites (in loadProduct, gated per model) is
// touched. Set FOLD_OSTRANDE_TEMPLES / FOLD_CASSIAN_TEMPLE to false to fall back to that
// model's stock open-temple mesh with no other change needed.
// ---------------------------------------------------------------------------
const FOLD_OSTRANDE_TEMPLES = true;
const FOLD_CASSIAN_TEMPLE = true;
const FOLD_ANGLE = THREE.MathUtils.degToRad(90);

function splitAndFoldTemple(templeMesh, namePrefix, zClearance = 0) {
  const handlesGeo = templeMesh.geometry.toNonIndexed();
  const posAttr = handlesGeo.getAttribute("position");
  const uvAttr = handlesGeo.getAttribute("uv");

  // The pivot is taken from the TEMPLE's own geometry — its highest-Z vertices on that side,
  // i.e. the edge nearest the frame — rather than the separate hinge mesh's centroid (the
  // first version of this used that). The hinge hardware's geometric centre doesn't
  // necessarily land exactly on the point the temple mesh's own vertices start from, and
  // rotating around a pivot that isn't part of the geometry being rotated is exactly what
  // left a visible gap between the folded temple and the frame. Pivoting around a point
  // that IS part of the temple's own mesh guarantees that edge stays put — zero gap, by
  // construction, not by tuning a coordinate.
  function attachmentPivot(sign) {
    let maxZ = -Infinity;
    for (let i = 0; i < posAttr.count; i += 1) {
      if (Math.sign(posAttr.getX(i) || 1) !== sign) continue;
      maxZ = Math.max(maxZ, posAttr.getZ(i));
    }
    const EPS = 0.003; // groups the hinge-end loop of vertices, not just one stray point
    const v = new THREE.Vector3();
    const sum = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < posAttr.count; i += 1) {
      if (Math.sign(posAttr.getX(i) || 1) !== sign) continue;
      if (posAttr.getZ(i) < maxZ - EPS) continue;
      v.fromBufferAttribute(posAttr, i);
      sum.add(v);
      count += 1;
    }
    return count ? sum.divideScalar(count) : new THREE.Vector3();
  }

  // Triangle-at-a-time (never split mid-face) into a left and a right geometry, using each
  // triangle's centroid X to decide which side it belongs to.
  function buildSide(sign, pivot, foldAngle) {
    const positions = [];
    const uvs = [];
    const v = new THREE.Vector3();
    for (let tri = 0; tri < posAttr.count; tri += 3) {
      let cx = 0;
      for (let k = 0; k < 3; k += 1) cx += posAttr.getX(tri + k);
      if (Math.sign(cx / 3 || 1) !== sign) continue;
      for (let k = 0; k < 3; k += 1) {
        const i = tri + k;
        v.fromBufferAttribute(posAttr, i);
        positions.push(v.x, v.y, v.z);
        if (uvAttr) uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      }
    }
    if (!positions.length) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (uvs.length) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

    // Fold about the hinge pivot: translate it to the origin, rotate, translate back.
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(foldAngle));
    geo.translate(pivot.x, pivot.y, pivot.z);
    // Extra backward nudge, away from the frame's own Z-depth — some models (the Cassian) have
    // no natural hinge-hardware gap between the temple's own attachment edge and the frame's
    // back face the way the Ostrande does, so folding flush against that pivot lands the temple
    // at almost the exact same depth as the frame itself and reads as clipped/merged into it
    // rather than folded neatly behind it. Zero by default (the Ostrande needs none of this).
    if (zClearance) geo.translate(0, 0, -zClearance);
    // Recomputed rather than carrying the rotated originals across — simpler than rotating
    // the normals by the same matrix and just as correct for a rigid transform.
    geo.computeVertexNormals();
    return geo;
  }

  // Left (negative X) folds toward +X, right toward -X — each swings in across the frame
  // toward the opposite lens rather than further outward.
  const leftGeo = buildSide(-1, attachmentPivot(-1), -FOLD_ANGLE);
  const rightGeo = buildSide(1, attachmentPivot(1), FOLD_ANGLE);

  const group = new THREE.Group();
  group.name = `${namePrefix}-group`;
  [
    [`${namePrefix}-left`, leftGeo],
    [`${namePrefix}-right`, rightGeo],
  ].forEach(([name, geo]) => {
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, templeMesh.material);
    mesh.name = name; // matches the /temple|handle/i rest-anchor exclusion in loadProduct
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

async function loadProduct(prod) {
  const rawModelUrl = prod?.model ?? DEFAULT_MODEL_URL;
  // Lens Detail shows the Corbin pre-folded instead of open: its temple is fused into the same
  // continuous mesh as the frame in the source asset, so — unlike the Ostrande/Cassian — there
  // is no way to split and fold it at runtime (see splitAndFoldTemple's own comment). A separate
  // GLB with the temple folded closed by hand in Blender stands in for it here ONLY; every
  // other page (Configurator, PDP, On Mannequin) still loads the original open-temple export,
  // so classifyMesh below is keyed to that ORIGINAL url, not this stand-in one — the folded
  // file reuses the exact same node names, so the same category map still applies correctly.
  const fetchUrl = rawModelUrl === CORBIN_MODEL_URL ? CORBIN_FOLDED_MODEL_URL : rawModelUrl;
  try {
    const gltf = await loadModel(fetchUrl);
    const model = gltf.scene;
    const mats = buildProductMaterials(prod);
    productMaterials = mats;
    currentProductModelUrl = rawModelUrl;

    // Meshes grouped by the category that classifyMesh already resolves. This is what the
    // strip reads to decide which part labels to show, so the label set always reflects the
    // geometry this SKU actually has rather than a hardcoded list.
    const meshesByCategory = new Map();

    model.traverse((object) => {
      if (!object.isMesh) return;
      const category = classifyMesh(object, rawModelUrl);
      if (!meshesByCategory.has(category)) meshesByCategory.set(category, []);
      meshesByCategory.get(category).push(object);
      if (category === "lens") object.material = mats.lens;
      else if (category === "hinge") object.material = mats.hinge;
      else if (category === "acetate") object.material = mats.acetate;
      else if (category === "handles") object.material = mats.handles;
      else if (category === "text") object.material = mats.text;
      else if (category === "frame") object.material = mats.frame;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    // Acetate pigment is authored in "blotches across the frame", so it needs the
    // frame's real object-space size before it renders.
    fitAcetatePatternScale(mats.acetate, meshesByCategory.get("acetate"));

    // See splitAndFoldTemple's own comment for why this is gated to exactly these two
    // models. Wrapped in try/catch so a bad split (e.g. a future re-export of the GLB
    // changing the temple node's layout) falls back to the stock open mesh instead of
    // breaking product load entirely.
    if (FOLD_OSTRANDE_TEMPLES && rawModelUrl === DEFAULT_MODEL_URL) {
      const handlesMesh = meshesByCategory.get("handles")?.[0];
      if (handlesMesh) {
        try {
          const folded = splitAndFoldTemple(handlesMesh, "handles-folded");
          handlesMesh.parent?.add(folded);
          handlesMesh.parent?.remove(handlesMesh);
          handlesMesh.geometry?.dispose();
        } catch (error) {
          console.error("[lensDetail] Temple fold failed, keeping the stock open mesh:", error);
        }
      }
    }

    // The Cassian's front and temples are separate nodes ("Frame"/"Temple") that just happen
    // to share the "acetate" material category (one continuous pigmented body, one material),
    // so meshesByCategory can't isolate "Temple" alone — matched by its exact node name instead.
    //
    // "Cube" has to fold too, not just "Temple": it's a metal wire core running the full length
    // inside the acetate temple (same ~0.065 to -0.070 Z span as Temple itself, on both sides),
    // categorized separately as "hinge" hardware and normally invisible, tucked inside the
    // acetate shell. Folding only Temple and leaving Cube in its original unfolded position
    // left its tail sticking straight out past the now-folded temple — exactly the still-
    // extending "wire" that kept showing up in the rendered result even after Temple's own
    // fold was verified correct in isolation.
    if (FOLD_CASSIAN_TEMPLE && rawModelUrl === CASSIAN_MODEL_URL) {
      // 8mm clearance: the Cassian's Temple attachment edge sits almost exactly at the
      // Frame's own back face (no separate hinge-hardware gap like the Ostrande has), so
      // folding flush against that pivot reads as clipped into the frame — see zClearance's
      // own comment in splitAndFoldTemple.
      const CASSIAN_FOLD_CLEARANCE = 0.008;
      const foldNamedNode = (nodeName, namePrefix) => {
        let mesh = null;
        model.traverse((object) => {
          if (object.isMesh && object.name === nodeName) mesh = object;
        });
        if (!mesh) return;
        try {
          const folded = splitAndFoldTemple(mesh, namePrefix, CASSIAN_FOLD_CLEARANCE);
          mesh.parent?.add(folded);
          mesh.parent?.remove(mesh);
          mesh.geometry?.dispose();
        } catch (error) {
          console.error(`[lensDetail] Cassian ${nodeName} fold failed, keeping the stock open mesh:`, error);
        }
      };
      foldNamedNode("Temple", "temple-folded");
      foldNamedNode("Cube", "temple-core-folded");
    }

    setAvailablePartsFromMeshes(meshesByCategory);

    // Which meshes positionProductOnRiser rests/centres on — the frame/lens body, not the
    // temples. Matched by NAME rather than category: the Ostrande's temples get their own
    // "handles" category, but the two acetate models lump "Frame" and "Temple" into the
    // same "acetate" category (one continuous pigmented body, one material), so category
    // alone can't tell them apart on those models. Name matches across all three GLBs
    // ("handles", "Temple", "Temple L", "Temple L.001", and the folded Ostrande's own
    // "handles-folded-*" pieces below).
    //
    // Why this matters: temples extend backward when worn (-Z), and the lens-up flip in
    // positionProductOnRiser maps -Z to world DOWN. An open (unfolded) temple's tip becomes
    // by far the lowest point of the whole model, so resting on the model's own full bbox
    // props the frame up in the air on the temples like legs — which is exactly the "not how
    // glasses are supposed to be placed" result on the two products that can't be folded
    // (see foldOstrandeTemples's comment on why only the Ostrande's temples are separable).
    // Resting on the frame/lens body alone keeps the actual lens flush on the plinth
    // regardless of what the temples are doing.
    const restAnchorMeshes = [];
    model.traverse((object) => {
      if (!object.isMesh) return;
      if (/temple|handle/i.test(object.name)) return;
      restAnchorMeshes.push(object);
    });
    productRestMeshes = restAnchorMeshes.length ? restAnchorMeshes : [model];

    scene.add(model);
    productModel = model;
    // Final scale + placement is applied per room by applyRoomConfig → positionProductOnRiser.
    console.log(`[lensDetail] ${fetchUrl} loaded OK.`);
    return true;
  } catch (error) {
    console.error(`[lensDetail] Failed to load product model (${fetchUrl}):`, error);
    setStatus("Product model failed to load — see console.");
    return false;
  }
}

// ---------- Material strip ----------
// A caption line beneath the plate: the parts this SKU exposes, as small-caps labels with
// tick separators, each opening its own swatch row directly underneath. It lives in the
// strip band below the 3D stage, so none of it can overlap the product shot.
//
// The label set is derived from the meshes the loaded model actually has (see
// setAvailablePartsFromMeshes) — no fixed slot count, no per-SKU special casing.
const PART_ORDER = ["frame", "acetate", "handles", "hinge", "lens", "text"];

const stripEl = document.querySelector("#material-strip");
const partsEl = document.querySelector("#material-parts");
const customizeToggleEl = document.querySelector("#customize-toggle");
let customizeOn = false;

// The strip is absent until asked for: the plate is full-bleed, and engaging Customize gives
// the strip its band (the stage shrinks to match, so the two never overlap). Closing it also
// closes any open swatch row, so re-opening always starts from labels only.
function setCustomizeMode(on) {
  customizeOn = on;
  document.body.classList.toggle("is-customizing", on);
  if (!on) setOpenPart(null);
  if (customizeToggleEl) {
    customizeToggleEl.classList.toggle("is-active", on);
    customizeToggleEl.setAttribute("aria-pressed", String(on));
    customizeToggleEl.textContent = on ? "Done" : "Customize";
  }
}

customizeToggleEl?.addEventListener("click", () => setCustomizeMode(!customizeOn));
// partId -> { labelEl, rowEl }
const partViews = new Map();
// Only one row may be open at a time; this is the part whose row is showing.
let openPart = null;
// The parts the currently-worn frame actually has geometry for, in display order.
let availableParts = [];

// Records which categories this model exposes. classifyMesh has already resolved every mesh
// to a category, so a part appears only if there is real geometry wearing that material AND
// a preset vocabulary to offer for it.
function setAvailablePartsFromMeshes(meshesByCategory) {
  availableParts = PART_ORDER.filter((part) => PART_SPECS[part] && meshesByCategory.has(part));
  console.log(`[lensDetail] strip parts: ${availableParts.join(", ") || "none"}`);
}

// Every preset the part has, in authored order — the palettes are the point of this
// screen, and truncating to the first few (as this used to) hid most of the acetate and
// lens vocabulary behind no affordance at all. The row scrolls horizontally instead
// (see .mv-swatch-row in magazine.css), so a long palette costs layout height nothing.
function presetsForPart(part) {
  return PART_SPECS[part].presetNames;
}

function swatchFill(part, presetName) {
  return PART_SPECS[part].getSwatch(presetName)?.hex ?? "#8a8d92";
}

// "polishedGold" -> "Polished Gold". Matches how the full Configurator titles its presets.
function formatPresetName(name) {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function currentSlug() {
  return GLASSES[activeGlassesIndex].slug;
}

// Selecting a label closes whichever row was open — the underline and the row are driven by
// the same `is-active` class, so they can never disagree.
function setOpenPart(part) {
  openPart = openPart === part ? null : part;
  partViews.forEach(({ labelEl }, id) => {
    const active = id === openPart;
    labelEl.classList.toggle("is-active", active);
    labelEl.setAttribute("aria-expanded", String(active));
  });
}

// Rebuilt whenever the worn SKU changes, because which parts exist — and which presets they
// offer — is per-model. The label row simply grows or shrinks with availableParts.
function buildMaterialStrip() {
  if (!partsEl) return;
  partsEl.innerHTML = "";
  partViews.clear();
  openPart = null;

  const slug = currentSlug();
  const state = getMaterialState(slug);

  availableParts.forEach((part, index) => {
    if (index > 0) {
      const tick = document.createElement("span");
      tick.className = "mv-part-tick";
      tick.setAttribute("aria-hidden", "true");
      tick.textContent = "·";
      partsEl.appendChild(tick);
    }

    const spec = PART_SPECS[part];
    const active = state[part];

    const labelEl = document.createElement("button");
    labelEl.type = "button";
    labelEl.className = "mv-part-label";
    labelEl.dataset.part = part;
    labelEl.setAttribute("aria-expanded", "false");
    labelEl.append(document.createTextNode(spec.label));

    const rowEl = document.createElement("span");
    rowEl.className = "mv-swatch-row";

    presetsForPart(part).forEach((presetName) => {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "mv-swatch" + (presetName === active ? " is-active" : "");
      sw.dataset.part = part;
      sw.dataset.preset = presetName;
      sw.title = `${spec.label} — ${presetName}`;
      sw.setAttribute("aria-label", `${spec.label}: ${presetName}`);
      sw.setAttribute("aria-pressed", String(presetName === active));
      const ringEl = document.createElement("span");
      ringEl.className = "mv-swatch-ring";
      ringEl.style.setProperty("--swatch-fill", swatchFill(part, presetName));

      // Each swatch names its own finish, so the row is identifiable rather than a line of
      // anonymous colour dots.
      const nameEl = document.createElement("span");
      nameEl.className = "mv-swatch-name";
      nameEl.textContent = formatPresetName(presetName);

      sw.append(ringEl, nameEl);
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        selectPartPreset(part, presetName);
      });
      rowEl.appendChild(sw);
    });

    labelEl.appendChild(rowEl);
    labelEl.addEventListener("click", () => setOpenPart(part));

    partsEl.appendChild(labelEl);
    partViews.set(part, { labelEl, rowEl });
  });
}

// Writes the choice to the shared store first, then reflects it on the live material and in
// the row — the store is the source of truth, the scene is a view of it.
function selectPartPreset(part, presetName) {
  const slug = currentSlug();
  if (!setMaterialPreset(slug, part, presetName)) return;
  applyPartPreset(part, presetName);

  partViews.get(part)?.rowEl.querySelectorAll(".mv-swatch").forEach((sw) => {
    const active = sw.dataset.preset === presetName;
    sw.classList.toggle("is-active", active);
    sw.setAttribute("aria-pressed", String(active));
  });
}

// ---------- Glasses switching ----------
let activeGlassesIndex = 0;
let swappingGlasses = false;

// Frees the outgoing frame's GPU resources. Its materials are per-product (rebuilt on every
// swap), so unlike the shared room textures they can be disposed outright.
function disposeProductModel(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => m?.dispose?.());
  });
}

async function switchGlasses(index) {
  if (swappingGlasses || index === activeGlassesIndex || !GLASSES[index]) return;
  swappingGlasses = true;
  setGlassesSwitcherEnabled(false);
  updateGlassesSwitcherActive(index);

  if (productModel) {
    productModel.parent?.remove(productModel);
    disposeProductModel(productModel);
    productModel = null;
  }

  const prod = getProduct(GLASSES[index].slug);
  const ok = await loadProduct(prod);
  if (ok) {
    activeGlassesIndex = index;
    // Re-seat on the riser, lens-up — positionProductOnRiser measures THIS model's own
    // rotated bbox fresh, so its proportions never drift from the last frame's.
    const roomConfig = ROOMS[activeRoomIndex];
    positionProductOnRiser(roomConfig.riserTopY, roomConfig.productScale ?? 1);
    // Which parts exist (and their stored selections) are per-SKU, so the label row is
    // rebuilt from the new frame's own parts rather than reused.
    buildMaterialStrip();
    renderer.shadowMap.needsUpdate = true;
    renderFrame();
  }

  swappingGlasses = false;
  setGlassesSwitcherEnabled(true);
}

const glassesSwitcherEl = document.querySelector("#glasses-switcher");

function buildGlassesSwitcher() {
  if (!glassesSwitcherEl) return;
  glassesSwitcherEl.innerHTML = GLASSES.map((g, i) => {
    const label = getProduct(g.slug)?.name ?? g.slug;
    return `<button type="button" class="mv-room-btn${i === activeGlassesIndex ? " is-active" : ""}" data-index="${i}" aria-pressed="${i === activeGlassesIndex}">${label}</button>`;
  }).join("");
  glassesSwitcherEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-room-btn");
    if (!btn) return;
    switchGlasses(Number(btn.dataset.index));
  });
}

function updateGlassesSwitcherActive(index) {
  if (!glassesSwitcherEl) return;
  glassesSwitcherEl.querySelectorAll(".mv-room-btn").forEach((btn, i) => {
    const active = i === index;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function setGlassesSwitcherEnabled(enabled) {
  if (!glassesSwitcherEl) return;
  glassesSwitcherEl.querySelectorAll(".mv-room-btn").forEach((btn) => {
    btn.disabled = !enabled;
  });
}

// ---------- Room switching ----------
let activeRoomIndex = 0;
let currentRoomGroup = null;
let switching = false;

async function switchRoom(index) {
  if (switching || index === activeRoomIndex || !ROOMS[index]) return;
  switching = true;
  setSwitcherEnabled(false);
  updateSwitcherActive(index); // reflect the choice immediately

  // Quick fade out on the site's easing, load, then fade back in — no hard cut.
  await gsap.to(canvas, { opacity: 0, duration: DUR.reveal, ease: EASE.entrance });

  if (currentRoomGroup) {
    scene.remove(currentRoomGroup);
    disposeRoomGroup(currentRoomGroup);
    currentRoomGroup = null;
  }

  const config = ROOMS[index];
  try {
    const roomGroup = await loadRoomModel(config);
    scene.add(roomGroup);
    currentRoomGroup = roomGroup;
    activeRoomIndex = index;
    applyRoomConfig(config);
    renderer.compile(scene, camera);
    renderFrame();
    setStatus(`${config.label} — the Ostrande on the display riser.`);
  } catch (error) {
    console.error(`[lensDetail] Failed to switch to ${config.id}:`, error);
    setStatus(`${config.label} failed to load — see console.`);
  }

  gsap.to(canvas, { opacity: 1, duration: DUR.revealLg, ease: EASE.entrance });
  switching = false;
  setSwitcherEnabled(true);
}

// ---------- Switcher UI (built from the ROOMS list — extensible by construction) ----------
const switcherEl = document.querySelector("#room-switcher");

function buildRoomSwitcher() {
  if (!switcherEl) return;
  switcherEl.innerHTML = ROOMS.map(
    (room, i) =>
      `<button type="button" class="mv-room-btn${i === activeRoomIndex ? " is-active" : ""}" data-index="${i}" aria-pressed="${i === activeRoomIndex}">${room.label}</button>`,
  ).join("");
  switcherEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-room-btn");
    if (!btn) return;
    switchRoom(Number(btn.dataset.index));
  });
}

function updateSwitcherActive(index) {
  if (!switcherEl) return;
  switcherEl.querySelectorAll(".mv-room-btn").forEach((btn, i) => {
    const active = i === index;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function setSwitcherEnabled(enabled) {
  if (!switcherEl) return;
  switcherEl.querySelectorAll(".mv-room-btn").forEach((btn) => {
    btn.disabled = !enabled;
  });
}

// ---------- Boot ----------
// Safe to start only here: every declaration the loop touches now exists (see the note at
// the animate() definition).
animate();

Promise.all([
  loadRoomModel(ROOMS[0])
    .then((group) => {
      scene.add(group);
      currentRoomGroup = group;
      return true;
    })
    .catch((error) => {
      console.error(`[lensDetail] Failed to load ${ROOMS[0].id}:`, error);
      return false;
    }),
  loadProduct(getProduct(GLASSES[activeGlassesIndex].slug)),
  environmentPromise,
]).then(([roomOk, productOk]) => {
  // applyRoomConfig places the product on the riser (positionProductOnRiser) once it — and
  // the room it's placed in — have both loaded.
  applyRoomConfig(ROOMS[0]);

  // Force shader compilation now, synchronously, before the reveal — otherwise it stalls
  // lazily on the first visible frame. Warm up through whichever render path this room uses.
  renderer.compile(scene, camera);
  renderFrame();

  gsap.to(canvas, { opacity: 1, duration: DUR.revealLg, ease: EASE.entrance });
  sceneLoader.hide();
  buildRoomSwitcher();
  buildGlassesSwitcher();
  buildMaterialStrip();
  if (roomOk && productOk) setStatus(`${ROOMS[0].label} — the Ostrande on the display riser.`);
  revealStage({
    eyebrow: ".ph-label",
    headline: ".ph-title",
    body: [".ph-brand", "#room-switcher", "#glasses-switcher", "#customize-bar"],
  });
});
