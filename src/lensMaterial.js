import * as THREE from "three";

const TWEEN_DURATION = 0.8; // seconds

// Absorption coefficients (Beer-Lambert k, per RGB channel). Higher = more absorbed
// = less transmitted in that channel. Bottom/top pairs drive the vertical gradient.
// reflectivity is a Schlick-style base reflectance (F0): how much of the surface
// reads as reflective coating at normal incidence, before the fresnel edge boost.
const LENS_PRESETS = {
  clear: {
    absorptionBottom: new THREE.Vector3(0.05, 0.05, 0.05),
    absorptionTop: new THREE.Vector3(0.05, 0.05, 0.05),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  amber: {
    absorptionBottom: new THREE.Vector3(0.12, 0.35, 1.35),
    absorptionTop: new THREE.Vector3(0.3, 0.65, 1.9),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  green: {
    absorptionBottom: new THREE.Vector3(0.85, 0.1, 0.75),
    absorptionTop: new THREE.Vector3(1.3, 0.2, 1.1),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  gray: {
    absorptionBottom: new THREE.Vector3(0.45, 0.45, 0.45),
    absorptionTop: new THREE.Vector3(0.95, 0.95, 0.95),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  blue: {
    absorptionBottom: new THREE.Vector3(0.55, 0.35, 0.1),
    absorptionTop: new THREE.Vector3(0.85, 0.55, 0.2),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  brown: {
    absorptionBottom: new THREE.Vector3(0.35, 0.55, 1.1),
    absorptionTop: new THREE.Vector3(0.55, 0.85, 1.5),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  rose: {
    absorptionBottom: new THREE.Vector3(0.2, 0.45, 0.25),
    absorptionTop: new THREE.Vector3(0.32, 0.6, 0.35),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  purple: {
    absorptionBottom: new THREE.Vector3(0.35, 0.7, 0.32),
    absorptionTop: new THREE.Vector3(0.5, 0.85, 0.45),
    reflectivity: 0.04,
    rimColor: new THREE.Color(0xdfefff),
  },
  mirror: {
    absorptionBottom: new THREE.Vector3(2.6, 2.6, 2.6),
    absorptionTop: new THREE.Vector3(2.6, 2.6, 2.6),
    reflectivity: 0.78,
    rimColor: new THREE.Color(0xdce9f5),
  },
  // Opticals-only "coating" option — same clear absorption as `clear`, but with the
  // near-zero reflectance real AR coatings are chosen for (glass stays legible, no
  // glare hides the eyes behind it) and a faint cool-violet residual rim tint, which is
  // the actual visible artifact of a multi-layer AR coating rather than a guess.
  antiReflective: {
    absorptionBottom: new THREE.Vector3(0.05, 0.05, 0.05),
    absorptionTop: new THREE.Vector3(0.05, 0.05, 0.05),
    reflectivity: 0.01,
    rimColor: new THREE.Color(0xcdd8ef),
  },
};

export const LENS_PRESET_NAMES = Object.keys(LENS_PRESETS);

/**
 * Swatch metadata for the UI. There's no single "color" for a Beer-Lambert lens, so
 * this approximates the visible tint by running the same transmittance formula the
 * shader uses, at the material's default thickness, and blending in the reflectivity.
 */
export function getLensPresetSwatch(presetName) {
  const preset = LENS_PRESETS[presetName];
  if (!preset) return null;

  const pathLength = 1.2; // matches u_thickness default in createLensMaterial
  const transmittance = new THREE.Vector3(
    Math.exp(-preset.absorptionBottom.x * pathLength),
    Math.exp(-preset.absorptionBottom.y * pathLength),
    Math.exp(-preset.absorptionBottom.z * pathLength),
  );
  const tintColor = new THREE.Color(transmittance.x, transmittance.y, transmittance.z);
  const swatchColor = tintColor.clone().lerp(preset.rimColor, preset.reflectivity);

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
uniform vec3 u_absorptionBottom;
uniform vec3 u_absorptionTop;
uniform float u_thickness;
uniform vec3 u_rimColor;
uniform float u_reflectivity;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal; // curved lens shell: light the far side too

  vec3 viewDir = normalize(vViewPosition);
  float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);

  // Vertical gradient tint, driven by local UV.y (top-heavy fades supported).
  vec3 absorption = mix(u_absorptionBottom, u_absorptionTop, clamp(vUv.y, 0.0, 1.0));

  // Path length grows toward grazing angles, but tempered — a thin manufactured lens
  // doesn't get dramatically "thicker" at an angle the way a slab of glass would, so the
  // floor here is much higher than a literal 1/cos falloff. Without this, the curved
  // edges of the lens shell were racing toward near-zero transmittance and reading as
  // opaque black glass regardless of how light the tint looked head-on.
  float pathLength = u_thickness / max(ndv, 0.5);
  vec3 transmittance = exp(-absorption * pathLength);

  // Schlick-style reflectance: u_reflectivity is the base (F0) at normal incidence,
  // rising to full reflection at grazing angles. Mirror-style presets push F0 high
  // so the coating reads as reflective rather than purely transmissive.
  float fresnel = pow(1.0 - ndv, 4.0);
  float reflectance = clamp(u_reflectivity + (1.0 - u_reflectivity) * fresnel, 0.0, 1.0);
  vec3 color = mix(transmittance, u_rimColor, reflectance);

  // Clearcoat-style specular sweep: a tight, bright highlight from a fixed virtual light
  // direction, layered on top of (and independent from) the fresnel reflectance above —
  // this reads as the lens's own outer coating gloss rather than a flat tinted surface.
  vec3 highlightDir = normalize(vec3(0.4, 0.6, 0.7));
  vec3 halfDir = normalize(viewDir + highlightDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), 120.0);
  color += specular * 0.6;

  float alpha = clamp(1.0 - dot(transmittance, vec3(0.3333)), 0.08, 0.95);

  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Lens material: raw ShaderMaterial implementing Beer-Lambert absorption.
 * Double-sided with a manual gl_FrontFacing flip so the backface of a curved lens
 * shell still shades correctly.
 */
export function createLensMaterial(initialPreset = "clear") {
  const preset = LENS_PRESETS[initialPreset];

  const uniforms = {
    u_absorptionBottom: { value: preset.absorptionBottom.clone() },
    u_absorptionTop: { value: preset.absorptionTop.clone() },
    u_thickness: { value: 1.2 },
    u_rimColor: { value: preset.rimColor.clone() },
    u_reflectivity: { value: preset.reflectivity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const tween = {
    active: false,
    t: 0,
    from: { bottom: new THREE.Vector3(), top: new THREE.Vector3(), rimColor: new THREE.Color(), reflectivity: 0 },
    to: { bottom: new THREE.Vector3(), top: new THREE.Vector3(), rimColor: new THREE.Color(), reflectivity: 0 },
  };

  material.setLensTint = function setLensTint(presetName) {
    const nextPreset = LENS_PRESETS[presetName];
    if (!nextPreset) {
      console.warn(
        `[lensMaterial] Unknown tint preset "${presetName}". Available: ${LENS_PRESET_NAMES.join(", ")}`,
      );
      return;
    }

    tween.from.bottom.copy(uniforms.u_absorptionBottom.value);
    tween.from.top.copy(uniforms.u_absorptionTop.value);
    tween.from.rimColor.copy(uniforms.u_rimColor.value);
    tween.from.reflectivity = uniforms.u_reflectivity.value;

    tween.to.bottom.copy(nextPreset.absorptionBottom);
    tween.to.top.copy(nextPreset.absorptionTop);
    tween.to.rimColor.copy(nextPreset.rimColor);
    tween.to.reflectivity = nextPreset.reflectivity;

    tween.t = 0;
    tween.active = true;
  };

  material.updateLensTween = function updateLensTween(delta) {
    if (!tween.active) return;

    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    uniforms.u_absorptionBottom.value.copy(tween.from.bottom).lerp(tween.to.bottom, k);
    uniforms.u_absorptionTop.value.copy(tween.from.top).lerp(tween.to.top, k);
    uniforms.u_rimColor.value.copy(tween.from.rimColor).lerp(tween.to.rimColor, k);
    uniforms.u_reflectivity.value = THREE.MathUtils.lerp(tween.from.reflectivity, tween.to.reflectivity, k);

    if (tween.t >= 1) tween.active = false;
  };

  return material;
}
