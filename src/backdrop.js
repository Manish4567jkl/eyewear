import * as THREE from "three";

// A shader-based backdrop, entirely separate from scene.environment (which is what
// actually lights the metal/lens materials via IBL). This module only ever touches
// what's visually behind the product — a fullscreen gradient quad rendered first each
// frame, with the product scene drawn over it afterward — so switching backdrops can
// never change how the frame/lens shaders look.
export const BACKDROP_PRESETS = [
  {
    id: "studioIvory",
    label: "Studio Ivory",
    topColor: new THREE.Color(0xf7f5f1),
    bottomColor: new THREE.Color(0xe2dbcd),
    glowColor: new THREE.Color(0xffffff),
    glowStrength: 0.32,
    glowRadius: 0.55,
    vignette: 0.12,
  },
  {
    id: "midnight",
    label: "Midnight",
    topColor: new THREE.Color(0x211e1a),
    bottomColor: new THREE.Color(0x030302),
    glowColor: new THREE.Color(0x8b7355),
    glowStrength: 0.3,
    glowRadius: 0.48,
    vignette: 0.26,
  },
  {
    id: "dune",
    label: "Dune",
    topColor: new THREE.Color(0xe9cda3),
    bottomColor: new THREE.Color(0xaa5636),
    glowColor: new THREE.Color(0xfff1d2),
    glowStrength: 0.28,
    glowRadius: 0.6,
    vignette: 0.1,
  },
  {
    id: "slate",
    label: "Slate",
    topColor: new THREE.Color(0xc7cfd6),
    bottomColor: new THREE.Color(0x555f6a),
    glowColor: new THREE.Color(0xe4ecf5),
    glowStrength: 0.24,
    glowRadius: 0.55,
    vignette: 0.14,
  },
  {
    id: "emeraldDepth",
    label: "Emerald Depth",
    topColor: new THREE.Color(0x123529),
    bottomColor: new THREE.Color(0x020f09),
    glowColor: new THREE.Color(0x37b384),
    glowStrength: 0.4,
    glowRadius: 0.48,
    vignette: 0.24,
  },
];

const PRESETS_BY_ID = new Map(BACKDROP_PRESETS.map((preset) => [preset.id, preset]));

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

  function resize(width, height) {
    uniforms.u_resolution.value.set(width, height);
  }

  return { scene, camera, setPreset, update, resize, getActiveId: () => activeId };
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
