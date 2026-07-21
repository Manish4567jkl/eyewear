import * as THREE from "three";

const TWEEN_DURATION = 0.8; // seconds

// Reference path length the absorption values below were solved against — the head-on
// thickness a fragment sees at u_thickness's default. Kept here (rather than as a bare
// number in two places) because the swatch preview has to run the same math the shader
// does or the tile lies about the tint.
const REFERENCE_PATH_LENGTH = 1.2;

// ---------------------------------------------------------------------------
// Absorption coefficients are Beer-Lambert k, per RGB channel: higher = more absorbed =
// less transmitted. They aren't eyeballed — each preset was solved backwards from the
// transmittance a real lens of that category has (T = exp(-k * d), so k = -ln(T) / d at
// d = REFERENCE_PATH_LENGTH). A "gray 15%" lens really does pass ~15-28% of visible
// light, which is why the previous values read as barely-there: they were solved for
// transmittances in the 70-90% range, i.e. lightly tinted opticals rather than
// sunglasses. Bottom/top pairs drive the vertical gradient.
//
//   gradientPower  shapes the bottom->top ramp. 1 = linear. Higher pushes the darkening
//                  into the top of the lens, which is what an actual gradient lens does.
//   reflectivity   Schlick F0: how much of the surface reads as reflective coating at
//                  normal incidence, before the fresnel edge boost.
//   coatColor      the tint of the coating's own reflection.
//   iridescence    thin-film hue shift across viewing angle. Real mirror coatings are
//                  multi-layer interference films and visibly shift hue toward their
//                  edges; a flat mirror tint is the tell of a fake one.
//   minOpacity     floor for the composited alpha. A dark lens must stay dark even
//                  where its own transmittance math would let the frame show through.
// ---------------------------------------------------------------------------
const LENS_PRESETS = {
  // Seven tints, chosen so no two read alike in a swatch row: nothing, neutral dark,
  // olive, warm, pink, a gradient, and a mirror. Near-duplicates (a second brown, a
  // second grey, "clear vs anti-reflective") were cut rather than kept for the count.
  clear: {
    absorptionBottom: new THREE.Vector3(0.04, 0.04, 0.04),
    absorptionTop: new THREE.Vector3(0.04, 0.04, 0.04),
    gradientPower: 1.0,
    reflectivity: 0.05,
    coatColor: new THREE.Color(0xdfefff),
    iridescence: 0.0,
    minOpacity: 0.07,
  },
  gray: {
    absorptionBottom: new THREE.Vector3(1.06, 1.06, 1.03),
    absorptionTop: new THREE.Vector3(1.64, 1.64, 1.58),
    gradientPower: 1.15,
    reflectivity: 0.05,
    coatColor: new THREE.Color(0xdfefff),
    iridescence: 0.0,
    minOpacity: 0.72,
  },
  green: {
    // G15 — the classic olive-green aviator glass, not a bright green.
    absorptionBottom: new THREE.Vector3(0.88, 0.67, 1.06),
    absorptionTop: new THREE.Vector3(1.34, 1.06, 1.58),
    gradientPower: 1.15,
    reflectivity: 0.05,
    coatColor: new THREE.Color(0xdfefff),
    iridescence: 0.0,
    minOpacity: 0.72,
  },
  amber: {
    absorptionBottom: new THREE.Vector3(0.14, 0.58, 1.77),
    absorptionTop: new THREE.Vector3(0.43, 1.0, 2.5),
    gradientPower: 1.2,
    reflectivity: 0.05,
    coatColor: new THREE.Color(0xffe3b8),
    iridescence: 0.0,
    minOpacity: 0.6,
  },
  rose: {
    absorptionBottom: new THREE.Vector3(0.21, 0.67, 0.5),
    absorptionTop: new THREE.Vector3(0.43, 1.06, 0.81),
    gradientPower: 1.2,
    reflectivity: 0.05,
    coatColor: new THREE.Color(0xffe0ea),
    iridescence: 0.0,
    minOpacity: 0.52,
  },
  // Light at the bottom, dark at the brow — the shape, not just the colour, is what
  // distinguishes this from `gray`.
  gradientSmoke: {
    absorptionBottom: new THREE.Vector3(0.24, 0.24, 0.23),
    absorptionTop: new THREE.Vector3(1.92, 1.92, 1.84),
    gradientPower: 1.7, // holds the light bottom, then falls off hard near the brow
    reflectivity: 0.05,
    coatColor: new THREE.Color(0xdfefff),
    iridescence: 0.0,
    minOpacity: 0.42,
  },
  // Heavy absorption behind a high-F0 interference film: almost nothing gets through,
  // and what you see is the coating's own reflection.
  mirror: {
    absorptionBottom: new THREE.Vector3(2.6, 2.6, 2.6),
    absorptionTop: new THREE.Vector3(2.6, 2.6, 2.6),
    gradientPower: 1.0,
    reflectivity: 0.82,
    coatColor: new THREE.Color(0xdce9f5),
    iridescence: 0.18,
    minOpacity: 0.95,
  },

  // Not a tint, and deliberately not part of the seven — this is the *coating* option
  // opticals choose between (see LENS_COATING_NAMES). Clear absorption, but with the
  // near-zero reflectance real AR coatings exist for (glass stays legible, no glare
  // hides the eyes behind it) and the faint cool-violet residual bloom that is the
  // actual visible artifact of a multi-layer AR stack. Next to `clear` in a tint row it
  // would read as a duplicate, which is why it isn't in one.
  antiReflective: {
    absorptionBottom: new THREE.Vector3(0.04, 0.04, 0.04),
    absorptionTop: new THREE.Vector3(0.04, 0.04, 0.04),
    gradientPower: 1.0,
    reflectivity: 0.012,
    coatColor: new THREE.Color(0xcdd8ef),
    iridescence: 0.25,
    minOpacity: 0.05,
  },
};

// The tint palette the UI offers: exactly seven, each visually distinct. This is
// deliberately NOT Object.keys(LENS_PRESETS) — `antiReflective` is a coating, not a
// tint, and belongs only to the optical rail's coating toggle.
export const LENS_PRESET_NAMES = [
  "clear",
  "gray",
  "green",
  "amber",
  "rose",
  "gradientSmoke",
  "mirror",
];

/** The two coating choices an optical frame picks between. */
export const LENS_COATING_NAMES = ["clear", "antiReflective"];

/**
 * Swatch metadata for the UI. There's no single "color" for a Beer-Lambert lens, so
 * this approximates the visible tint by running the same transmittance formula the
 * shader uses, at the reference path length, then blending in the coating reflection by
 * the same Schlick weight — so a mirror tile reads as its coating and a gray tile reads
 * as gray, matching what the 3D view will actually show.
 */
export function getLensPresetSwatch(presetName) {
  const preset = LENS_PRESETS[presetName];
  if (!preset) return null;

  // Midpoint of the gradient, so gradient presets show their average rather than their
  // lightest edge.
  const k = preset.absorptionBottom
    .clone()
    .lerp(preset.absorptionTop, Math.pow(0.5, preset.gradientPower));
  const tintColor = new THREE.Color(
    Math.exp(-k.x * REFERENCE_PATH_LENGTH),
    Math.exp(-k.y * REFERENCE_PATH_LENGTH),
    Math.exp(-k.z * REFERENCE_PATH_LENGTH),
  );
  const swatchColor = tintColor.lerp(preset.coatColor, preset.reflectivity);

  return { hex: `#${swatchColor.getHexString()}`, reflectivity: preset.reflectivity };
}

const VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
// The lens is the one material on the frame that isn't a MeshPhysicalMaterial, and a
// ShaderMaterial writes gl_FragColor straight to the framebuffer — it does not get
// three's output pipeline for free the way the metal and acetate do. Every renderer in
// this app runs ACES tone mapping into an sRGB output (see main.js / pdp.js /
// homeViewer.js / swatchRenderer.js), so without these chunks the lens's linear values
// were being written as if they were already sRGB: tints came out washed and pale, and
// the studio reflection blew out to white, while the frame beside it was correctly
// tone-mapped. That mismatch — not the absorption values — is why the tint read as
// "barely there" no matter how far the coefficients were pushed.
//
// Only the *application* chunks are added, at the end of main(). WebGLProgram already
// injects tonemapping_pars_fragment and colorspace_pars_fragment into every non-raw
// ShaderMaterial's prefix (WebGLProgram.js lines ~772/778), so including the pars here
// too would redefine AgXToneMapping/sRGBTransferOETF/etc. and fail to link.
uniform vec3 u_absorptionBottom;
uniform vec3 u_absorptionTop;
uniform vec3 u_coatColor;
uniform float u_thickness;
uniform float u_gradientPower;
uniform float u_reflectivity;
uniform float u_iridescence;
uniform float u_minOpacity;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

// A procedural studio, sampled along the reflection vector in view space.
//
// This material is a raw ShaderMaterial and so has no access to scene.environment's
// IBL — which is why the previous version fell back to a single Blinn-Phong dot, and
// why the lens read as a flat tinted decal with a hotspot on it. What actually sells
// glass is a *shaped* reflection with structure: a bright ceiling softbox, a second
// smaller kicker, and a dark floor, so the highlight stretches and slides across the
// curvature as the frame turns instead of sitting still.
vec3 lensStudio(vec3 r) {
  float horizon = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.02, 0.025, 0.032), vec3(0.30, 0.34, 0.40), pow(horizon, 1.4));

  // Main overhead softbox: broad, soft-edged, slightly forward of the viewer.
  vec3 keyDir = normalize(vec3(0.30, 0.80, 0.52));
  float key = smoothstep(0.55, 0.99, dot(r, keyDir));
  base += vec3(1.6, 1.55, 1.45) * key;

  // A tighter, cooler kicker from the opposite side — gives the second, smaller glint
  // that keeps a curved lens from looking like it lives under one bare bulb.
  vec3 kickDir = normalize(vec3(-0.70, 0.25, 0.60));
  float kick = smoothstep(0.80, 0.995, dot(r, kickDir));
  base += vec3(0.55, 0.68, 0.9) * kick;

  return base;
}

// Thin-film interference approximation: the coating's reflected hue rotates with the
// optical path through the film, which tracks viewing angle.
vec3 lensIridescence(float ndv, float amount) {
  float phase = (1.0 - ndv) * 7.0;
  vec3 shift = 0.5 + 0.5 * cos(phase + vec3(0.0, 2.09, 4.19));
  return mix(vec3(1.0), shift * 1.35, amount);
}

void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal; // curved lens shell: light the far side too

  vec3 viewDir = normalize(vViewPosition);
  float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);

  // Vertical gradient tint. gradientPower biases where the ramp happens: >1 keeps the
  // bottom of the lens light and concentrates the darkening up near the brow, which is
  // how a real gradient lens is coated.
  float gradientT = pow(clamp(vUv.y, 0.0, 1.0), u_gradientPower);
  vec3 absorption = mix(u_absorptionBottom, u_absorptionTop, gradientT);

  // Path length grows toward grazing angles, but tempered — a thin manufactured lens
  // doesn't get dramatically "thicker" at an angle the way a slab of glass would, so
  // the floor here is much higher than a literal 1/cos falloff. Without it the curved
  // edges of the shell race toward zero transmittance and read as opaque black.
  float pathLength = u_thickness / max(ndv, 0.42);
  vec3 transmittance = exp(-absorption * pathLength);

  // Schlick reflectance: u_reflectivity is F0 at normal incidence, rising to full
  // reflection at grazing angles.
  float fresnel = pow(1.0 - ndv, 5.0);
  float reflectance = clamp(u_reflectivity + (1.0 - u_reflectivity) * fresnel, 0.0, 1.0);

  vec3 reflectDir = reflect(-viewDir, normal);
  vec3 coat = u_coatColor * lensIridescence(ndv, u_iridescence);
  vec3 reflection = lensStudio(reflectDir) * coat;

  vec3 color = transmittance * (1.0 - reflectance) + reflection * reflectance;

  // Alpha: a dark lens has to *stay* dark. Driving opacity off transmitted luminance
  // (rather than the old flat cap) means a 15%-transmittance gray reads as a real
  // sunglass lens, while "clear" stays nearly invisible; the reflectance term then
  // makes the grazing edges opaque, which is where a lens hides the frame behind it.
  float tintLuminance = dot(transmittance, vec3(0.2126, 0.7152, 0.0722));
  float alpha = u_minOpacity + (1.0 - u_minOpacity) * (1.0 - tintLuminance);
  alpha = clamp(alpha + reflectance * 0.55, u_minOpacity, 1.0);

  gl_FragColor = vec4(color, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Uniform names are `u_` + preset key, so the tween can be driven off these lists alone.
const TWEENED_VECTORS = ["absorptionBottom", "absorptionTop"];
const TWEENED_COLORS = ["coatColor"];
const TWEENED_SCALARS = ["gradientPower", "reflectivity", "iridescence", "minOpacity"];

/**
 * Lens material: raw ShaderMaterial implementing Beer-Lambert absorption over a
 * procedural studio reflection. Double-sided with a manual gl_FrontFacing flip so the
 * backface of a curved lens shell still shades correctly.
 */
export function createLensMaterial(initialPreset = "clear") {
  const preset = LENS_PRESETS[initialPreset] ?? LENS_PRESETS.clear;

  const uniforms = {
    u_absorptionBottom: { value: preset.absorptionBottom.clone() },
    u_absorptionTop: { value: preset.absorptionTop.clone() },
    u_coatColor: { value: preset.coatColor.clone() },
    u_thickness: { value: REFERENCE_PATH_LENGTH },
    u_gradientPower: { value: preset.gradientPower },
    u_reflectivity: { value: preset.reflectivity },
    u_iridescence: { value: preset.iridescence },
    u_minOpacity: { value: preset.minOpacity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const tween = { active: false, t: 0, from: {}, to: {} };
  TWEENED_VECTORS.forEach((key) => {
    tween.from[key] = new THREE.Vector3();
    tween.to[key] = new THREE.Vector3();
  });
  TWEENED_COLORS.forEach((key) => {
    tween.from[key] = new THREE.Color();
    tween.to[key] = new THREE.Color();
  });
  TWEENED_SCALARS.forEach((key) => {
    tween.from[key] = 0;
    tween.to[key] = 0;
  });

  const uniformKey = (key) => `u_${key}`;

  material.setLensTint = function setLensTint(presetName) {
    const nextPreset = LENS_PRESETS[presetName];
    if (!nextPreset) {
      console.warn(
        `[lensMaterial] Unknown tint preset "${presetName}". Available: ${LENS_PRESET_NAMES.join(", ")}`,
      );
      return;
    }

    [...TWEENED_VECTORS, ...TWEENED_COLORS].forEach((key) => {
      tween.from[key].copy(uniforms[uniformKey(key)].value);
      tween.to[key].copy(nextPreset[key]);
    });
    TWEENED_SCALARS.forEach((key) => {
      tween.from[key] = uniforms[uniformKey(key)].value;
      tween.to[key] = nextPreset[key];
    });

    tween.t = 0;
    tween.active = true;
  };

  material.updateLensTween = function updateLensTween(delta) {
    if (!tween.active) return;

    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    [...TWEENED_VECTORS, ...TWEENED_COLORS].forEach((key) => {
      uniforms[uniformKey(key)].value.copy(tween.from[key]).lerp(tween.to[key], k);
    });
    TWEENED_SCALARS.forEach((key) => {
      uniforms[uniformKey(key)].value = THREE.MathUtils.lerp(tween.from[key], tween.to[key], k);
    });

    if (tween.t >= 1) tween.active = false;
  };

  return material;
}
