import * as THREE from "three";

// A shader-based backdrop, entirely separate from scene.environment (which is what
// actually lights the metal/lens materials via IBL). This module only ever touches
// what's visually behind the product — a fullscreen gradient quad rendered first each
// frame, with the product scene drawn over it afterward — so switching backdrops can
// never change how the frame/lens shaders look.
export const BACKDROP_PRESETS = [
  {
    id: "abyss",
    label: "Abyss",
    topColor: new THREE.Color(0x0d1a2e),
    bottomColor: new THREE.Color(0x010305),
    glowColor: new THREE.Color(0x4fa8ff),
    glowStrength: 0.4,
    glowRadius: 0.42,
    vignette: 0.34,
  },
  {
    id: "arcticCyan",
    label: "Arctic Cyan",
    topColor: new THREE.Color(0x063a42),
    bottomColor: new THREE.Color(0x010f12),
    glowColor: new THREE.Color(0x2ee8f0),
    glowStrength: 0.38,
    glowRadius: 0.44,
    vignette: 0.32,
  },
  {
    id: "voidEmerald",
    label: "Void Emerald",
    topColor: new THREE.Color(0x0c2e26),
    bottomColor: new THREE.Color(0x020806),
    glowColor: new THREE.Color(0x2ee6b8),
    glowStrength: 0.38,
    glowRadius: 0.44,
    vignette: 0.32,
  },
  {
    id: "pineNoir",
    label: "Pine Noir",
    topColor: new THREE.Color(0x0f2818),
    bottomColor: new THREE.Color(0x030a05),
    glowColor: new THREE.Color(0x7dfa9e),
    glowStrength: 0.34,
    glowRadius: 0.46,
    vignette: 0.32,
  },
  {
    id: "noirViolet",
    label: "Noir Violet",
    topColor: new THREE.Color(0x241030),
    bottomColor: new THREE.Color(0x04020a),
    glowColor: new THREE.Color(0x9d6fff),
    glowStrength: 0.36,
    glowRadius: 0.44,
    vignette: 0.32,
  },
  {
    id: "electricOrchid",
    label: "Electric Orchid",
    topColor: new THREE.Color(0x3a0f38),
    bottomColor: new THREE.Color(0x0a020a),
    glowColor: new THREE.Color(0xff5fd1),
    glowStrength: 0.4,
    glowRadius: 0.42,
    vignette: 0.34,
  },
  {
    id: "bloodGarnet",
    label: "Blood Garnet",
    topColor: new THREE.Color(0x4a0e18),
    bottomColor: new THREE.Color(0x100205),
    glowColor: new THREE.Color(0xff4d5e),
    glowStrength: 0.38,
    glowRadius: 0.44,
    vignette: 0.32,
  },
  {
    id: "graphite",
    label: "Graphite",
    topColor: new THREE.Color(0x232527),
    bottomColor: new THREE.Color(0x050506),
    glowColor: new THREE.Color(0xc8d6de),
    glowStrength: 0.28,
    glowRadius: 0.44,
    vignette: 0.32,
  },
  {
    id: "onyxIce",
    label: "Onyx Ice",
    topColor: new THREE.Color(0x16181c),
    bottomColor: new THREE.Color(0x030304),
    glowColor: new THREE.Color(0x9fd6ff),
    glowStrength: 0.32,
    glowRadius: 0.42,
    vignette: 0.34,
  },
  {
    id: "glacier",
    label: "Glacier",
    topColor: new THREE.Color(0xd5e6f2),
    bottomColor: new THREE.Color(0x6f9ab8),
    glowColor: new THREE.Color(0xeaf6ff),
    glowStrength: 0.3,
    glowRadius: 0.58,
    vignette: 0.12,
  },
];

const PRESETS_BY_ID = new Map(BACKDROP_PRESETS.map((preset) => [preset.id, preset]));

// Every overlay laid over the stage (close-plate, brand mark, breadcrumb) is styled cream-on-
// dark, matching the rest of the site's own dark backgrounds — which held while every backdrop
// preset was itself dark. Presets like Glacier break that assumption, so callers use this to
// decide whether those overlays need to flip to dark-on-light instead of guessing per preset id
// (which would silently go stale the next time the palette changes, exactly as happened here).
// Relative luminance (ITU-R BT.709 weights) of the gradient's midpoint, not gonna bother
// per-pixel — a two-stop vertical gradient's overall brightness is well represented by it.
export function isPresetLight(presetId) {
  const preset = PRESETS_BY_ID.get(presetId);
  if (!preset) return false;
  const r = (preset.topColor.r + preset.bottomColor.r) / 2;
  const g = (preset.topColor.g + preset.bottomColor.g) / 2;
  const b = (preset.topColor.b + preset.bottomColor.b) / 2;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5;
}

const TWEEN_DURATION = 0.5; // seconds — a cross-fade, not a snap

// A fullscreen NDC triangle-quad: the vertex shader ignores the camera entirely and
// writes clip position straight from local xy, so this always covers the viewport
// regardless of the (otherwise-unused) camera passed to renderer.render().
const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_topColor;
uniform vec3 u_bottomColor;
uniform vec3 u_glowColor;
uniform float u_glowStrength;
uniform float u_glowRadius;
uniform float u_vignette;

void main() {
  vec2 uv = vUv;
  vec2 p = uv - 0.5;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);

  // Barely-perceptible drift on the gradient stop and glow position — enough that the
  // backdrop reads as alive, not a static printed sweep.
  float drift = sin(u_time * 0.12) * 0.035;
  float t = clamp(uv.y + drift, 0.0, 1.0);
  vec3 color = mix(u_bottomColor, u_topColor, t);

  vec2 glowCenter = vec2(0.0, -0.05 + sin(u_time * 0.09) * 0.02);
  float dist = length(p - glowCenter);
  float glow = u_glowStrength * exp(-(dist * dist) / (u_glowRadius * u_glowRadius));
  color += u_glowColor * glow;

  float vig = smoothstep(0.95, 0.3, length(p));
  color = mix(color * (1.0 - u_vignette), color, vig);

  gl_FragColor = vec4(color, 1.0);
}
`;

function makeUniformState() {
  return {
    topColor: new THREE.Color(),
    bottomColor: new THREE.Color(),
    glowColor: new THREE.Color(),
    glowStrength: 0,
    glowRadius: 0,
    vignette: 0,
  };
}

function buildMaterial(initialPreset) {
  return new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_topColor: { value: initialPreset.topColor.clone() },
      u_bottomColor: { value: initialPreset.bottomColor.clone() },
      u_glowColor: { value: initialPreset.glowColor.clone() },
      u_glowStrength: { value: initialPreset.glowStrength },
      u_glowRadius: { value: initialPreset.glowRadius },
      u_vignette: { value: initialPreset.vignette },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

/**
 * Creates the backdrop as its own tiny scene + orthographic camera + fullscreen quad,
 * meant to be rendered *before* the product scene each frame (with depth cleared in
 * between) rather than assigned to scene.background — that's what makes an animated
 * gradient/glow possible instead of a flat fill, while staying completely outside the
 * product scene graph (so it can never feed into scene.environment/IBL).
 */
export function createBackdrop(initialPresetId = BACKDROP_PRESETS[0].id) {
  const initial = PRESETS_BY_ID.get(initialPresetId) ?? BACKDROP_PRESETS[0];

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const material = buildMaterial(initial);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  const uniforms = material.uniforms;
  let activeId = initial.id;
  const tween = { active: false, t: 0, from: makeUniformState(), to: makeUniformState() };

  function setPreset(id) {
    const preset = PRESETS_BY_ID.get(id);
    if (!preset || id === activeId) return;
    activeId = id;

    tween.from.topColor.copy(uniforms.u_topColor.value);
    tween.from.bottomColor.copy(uniforms.u_bottomColor.value);
    tween.from.glowColor.copy(uniforms.u_glowColor.value);
    tween.from.glowStrength = uniforms.u_glowStrength.value;
    tween.from.glowRadius = uniforms.u_glowRadius.value;
    tween.from.vignette = uniforms.u_vignette.value;

    tween.to.topColor.copy(preset.topColor);
    tween.to.bottomColor.copy(preset.bottomColor);
    tween.to.glowColor.copy(preset.glowColor);
    tween.to.glowStrength = preset.glowStrength;
    tween.to.glowRadius = preset.glowRadius;
    tween.to.vignette = preset.vignette;

    tween.t = 0;
    tween.active = true;
  }

  function update(delta) {
    uniforms.u_time.value += delta;

    if (!tween.active) return;
    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    uniforms.u_topColor.value.copy(tween.from.topColor).lerp(tween.to.topColor, k);
    uniforms.u_bottomColor.value.copy(tween.from.bottomColor).lerp(tween.to.bottomColor, k);
    uniforms.u_glowColor.value.copy(tween.from.glowColor).lerp(tween.to.glowColor, k);
    uniforms.u_glowStrength.value = THREE.MathUtils.lerp(tween.from.glowStrength, tween.to.glowStrength, k);
    uniforms.u_glowRadius.value = THREE.MathUtils.lerp(tween.from.glowRadius, tween.to.glowRadius, k);
    uniforms.u_vignette.value = THREE.MathUtils.lerp(tween.from.vignette, tween.to.vignette, k);

    if (tween.t >= 1) tween.active = false;
  }

  // ---------------------------------------------------------------------------
  // Capture target — see capture() below.
  //
  // Sized in physical pixels but capped: this texture is only ever read as a *background*
  // and as the source for the acetate's transmission pass (which three mips and blurs by
  // roughness anyway), so matching the canvas 1:1 buys nothing and costs fill rate on
  // high-DPI displays.
  let target = null;
  let targetWidth = 0;
  let targetHeight = 0;

  function ensureTarget(width, height) {
    // Capped well below the drawing buffer size: this is a soft gradient that transmission
    // blurs further by roughness anyway (see the comment above), so a high-res capture buys
    // no visible fidelity while costing real fill rate every single frame on high-DPI
    // displays. 900px is comfortably above what the blur/roughness sampling can resolve.
    const w = Math.max(2, Math.min(Math.round(width), 900));
    const h = Math.max(2, Math.min(Math.round(height), 900));
    if (target && targetWidth === w && targetHeight === h) return;

    target?.dispose();
    target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    // Marked sRGB so three converts on write and samples it back linearly — without
    // this the gradient is written raw and reads back over-bright when used as a
    // background or refracted through the acetate.
    target.texture.colorSpace = THREE.SRGBColorSpace;
    targetWidth = w;
    targetHeight = h;
  }

  /**
   * Renders the backdrop into an offscreen texture and returns it, for use as
   * `scene.background`.
   *
   * This module used to be rendered as a manual pass straight to the canvas before the
   * product scene, deliberately staying outside the scene graph. That worked visually,
   * but it made the backdrop invisible to three's transmission pass — which builds its
   * refraction source from `scene.background` plus the scene's opaque objects — so a
   * transmissive material had nothing behind it but black, and translucent acetate could
   * not be made to look translucent at all.
   *
   * Capturing to a texture and assigning it as the background is visually equivalent
   * (three draws a background texture as a fullscreen quad before the scene, which is
   * exactly what the manual pass did) while making the backdrop a real participant in
   * transmission. The animated gradient still animates: this is re-captured each frame.
   *
   * Deliberately does not feed scene.environment — the backdrop must never affect IBL.
   */
  function capture(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    ensureTarget(size.x, size.y);

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    return target.texture;
  }

  function resize(width, height) {
    uniforms.u_resolution.value.set(width, height);
  }

  function dispose() {
    target?.dispose();
    target = null;
  }

  return { scene, camera, setPreset, update, resize, capture, dispose, getActiveId: () => activeId };
}

// ---------- Miniature previews for the picker UI ----------
// A second, tiny offscreen rig — same pattern as swatchRenderer.js's material spheres —
// so each picker tile shows an actual render of that backdrop's shader rather than a
// hand-approximated CSS gradient standing in for it.
let thumbRenderer = null;
let thumbScene = null;
let thumbCamera = null;
let thumbMaterial = null;
const thumbCache = new Map();

function ensureThumbRig() {
  if (thumbRenderer) return;

  thumbRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  thumbRenderer.setPixelRatio(1);

  thumbScene = new THREE.Scene();
  thumbCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  thumbMaterial = buildMaterial(BACKDROP_PRESETS[0]);
  thumbMaterial.uniforms.u_time.value = 1.6; // a fixed, mid-motion moment — not frozen at t=0
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), thumbMaterial);
  thumbScene.add(quad);
}

export function getBackdropThumbnail(presetId, size = 160) {
  ensureThumbRig();
  const key = `${presetId}:${size}`;
  const cached = thumbCache.get(key);
  if (cached) return cached;

  const preset = PRESETS_BY_ID.get(presetId) ?? BACKDROP_PRESETS[0];
  const uniforms = thumbMaterial.uniforms;
  uniforms.u_topColor.value.copy(preset.topColor);
  uniforms.u_bottomColor.value.copy(preset.bottomColor);
  uniforms.u_glowColor.value.copy(preset.glowColor);
  uniforms.u_glowStrength.value = preset.glowStrength;
  uniforms.u_glowRadius.value = preset.glowRadius;
  uniforms.u_vignette.value = preset.vignette;
  uniforms.u_resolution.value.set(size, size);

  thumbRenderer.setSize(size, size, false);
  thumbRenderer.render(thumbScene, thumbCamera);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(thumbRenderer.domElement, 0, 0, size, size);
  thumbCache.set(key, canvas);
  return canvas;
}
