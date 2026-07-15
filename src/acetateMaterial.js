import * as THREE from "three";

const TWEEN_DURATION = 0.8; // seconds — matches frameMaterial/lensMaterial/textMaterial

// ---------------------------------------------------------------------------
// Why this isn't native MeshPhysicalMaterial.transmission (a previous version used it):
//
// Three.js's transmission feature refracts a captured "what's behind this object"
// render target — built from `scene.background` plus the scene's other opaque objects
// (see WebGLRenderer.renderTransmissionPass). This app never sets `scene.background`;
// the visible backdrop is a separate hand-rolled shader pass (backdrop.js) composited
// manually before the product scene each frame, entirely invisible to three.js's
// internal capture. Confirmed by reading WebGLRenderer.js directly: with no
// scene.background and no bright objects behind the glasses, transmission had a real,
// correctly-wired value but nothing but near-black to blend toward — indistinguishable
// from the opaque base color, exactly the "extreme value does nothing" symptom. Setting
// scene.background to fix that would paint over the custom backdrop for every product
// on the site, so that's not on the table.
//
// Fix: a fresnel-driven rim-light blend, patched into the compiled fragment shader via
// onBeforeCompile — the same technique frameMaterial.js already uses for its metal f0
// shader, confirmed safe by reading three.js's actual meshphysical fragment shader
// source: `vNormal` and `vViewPosition` are both top-level varyings available before
// `vec4 diffuseColor = vec4( diffuse, opacity );` is computed, so patching that exact
// line (frameMaterial.js's own injection point) works here too. This is also a more
// geometrically apt approximation than literal transmission for this asset: a thin
// cylindrical temple arm inherently presents grazing-angle surface across most of its
// visible width, while the flat frame front doesn't — so a per-fragment fresnel term
// naturally produces "temple glows, frame front stays rich" with zero dependency on
// scene composition or a thickness map that doesn't exist on this mesh.
// ---------------------------------------------------------------------------
const ACETATE_PRESETS = {
  tortoise: {
    color: new THREE.Color(0x6b4226),
    roughness: 0.1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    sheen: 0.35,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xd9a56b),
    rimColor: new THREE.Color(0xe0ab74),
    translucence: 0.5,
  },
  black: {
    color: new THREE.Color(0x141210),
    roughness: 0.09,
    clearcoat: 0.9,
    clearcoatRoughness: 0.05,
    sheen: 0.25,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(0x6b5040),
    // Classic "black" acetate is rarely a true neutral black up close — it carries a
    // warm brown undertone that only shows at thin, backlit edges.
    rimColor: new THREE.Color(0x8a6a52),
    translucence: 0.4,
  },
  crystal: {
    color: new THREE.Color(0xf0eee6),
    roughness: 0.08,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04,
    sheen: 0.2,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color(0xffffff),
    rimColor: new THREE.Color(0xffffff),
    translucence: 0.7, // genuinely reads as see-through, unlike every other preset here
  },
  deepGreen: {
    color: new THREE.Color(0x1f3a2e),
    roughness: 0.1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    sheen: 0.35,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0x6fd6a0),
    rimColor: new THREE.Color(0x7fe6b0),
    translucence: 0.55,
  },
  burgundy: {
    color: new THREE.Color(0x5c2a2a),
    roughness: 0.1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    sheen: 0.35,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xd98a8a),
    rimColor: new THREE.Color(0xe09a9a),
    translucence: 0.55,
  },
  cream: {
    color: new THREE.Color(0xe8ddc4),
    roughness: 0.11,
    clearcoat: 0.8,
    clearcoatRoughness: 0.07,
    sheen: 0.3,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xfff0d0),
    rimColor: new THREE.Color(0xfff6e5),
    translucence: 0.45,
  },
};

export const ACETATE_PRESET_NAMES = Object.keys(ACETATE_PRESETS);

/** Swatch metadata for the UI — actual preset color/roughness, not a guess. */
export function getAcetatePresetSwatch(presetName) {
  const preset = ACETATE_PRESETS[presetName];
  if (!preset) return null;
  return { hex: `#${preset.color.getHexString()}`, roughness: preset.roughness };
}

const TWEENED_SCALARS = ["roughness", "clearcoat", "clearcoatRoughness", "sheen", "sheenRoughness"];
const TWEENED_COLORS = ["color", "sheenColor"];

/**
 * Acetate frame material: a single MeshPhysicalMaterial instance meant to be shared
 * across every mesh that makes up the acetate body (frame front + temples both — see
 * the mesh classification in pdp.js) — acetate frames are one continuous pigmented
 * piece, not a per-part metal palette, so there's exactly one color control, not one
 * per mesh.
 */
export function createAcetateMaterial(initialPreset = "black") {
  const preset = ACETATE_PRESETS[initialPreset];

  const uniforms = {
    u_rimColor: { value: preset.rimColor.clone() },
    u_translucence: { value: preset.translucence },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: preset.color.clone(),
    metalness: 0,
    roughness: preset.roughness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    sheen: preset.sheen,
    sheenRoughness: preset.sheenRoughness,
    sheenColor: preset.sheenColor.clone(),
    ior: 1.53, // typical cellulose acetate IOR — still feeds the base specular F0 even without transmission
    envMapIntensity: 1.3, // a touch hotter than the scene default so the clearcoat/sheen highlights actually read
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.u_rimColor = uniforms.u_rimColor;
    shader.uniforms.u_translucence = uniforms.u_translucence;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec3 u_rimColor;
      uniform float u_translucence;`,
    );

    // vNormal/vViewPosition are both declared as top-level varyings above main() in
    // three.js's compiled physical shader, so they're already valid here — same
    // injection point frameMaterial.js uses for its own onBeforeCompile patch.
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      `vec3 acetateN = normalize( vNormal );
      vec3 acetateV = normalize( vViewPosition );
      float acetateNdotV = clamp( dot( acetateN, acetateV ), 0.0, 1.0 );
      float acetateFresnel = pow( 1.0 - acetateNdotV, 2.2 );
      vec3 acetateBase = mix( diffuse, u_rimColor, acetateFresnel * u_translucence );
      vec4 diffuseColor = vec4( acetateBase, opacity );`,
    );
  };

  // Custom uniforms change the compiled output, so give the material its own program
  // cache key — otherwise WebGLRenderer can reuse a cached program compiled for a
  // different physical material that doesn't have these uniforms.
  material.customProgramCacheKey = () => "eyewearAcetateMaterial";

  // Explicit envMap assignment (once the HDRI resolves) keeps this material off the
  // "material.envMap === null" branch in WebGLRenderer that otherwise force-overwrites
  // envMapIntensity with the scene-level value — same reasoning as frameMaterial.js's
  // setEnvironment, so the clearcoat/sheen highlights above stay predictably lit.
  material.setEnvironment = function setEnvironment(envMap) {
    material.envMap = envMap;
    material.needsUpdate = true;
  };

  const tween = {
    active: false,
    t: 0,
    from: { rimColor: new THREE.Color(), translucence: 0 },
    to: { rimColor: new THREE.Color(), translucence: 0 },
  };
  TWEENED_SCALARS.forEach((key) => {
    tween.from[key] = 0;
    tween.to[key] = 0;
  });
  TWEENED_COLORS.forEach((key) => {
    tween.from[key] = new THREE.Color();
    tween.to[key] = new THREE.Color();
  });

  material.setAcetateColor = function setAcetateColor(presetName) {
    const nextPreset = ACETATE_PRESETS[presetName];
    if (!nextPreset) {
      console.warn(
        `[acetateMaterial] Unknown preset "${presetName}". Available: ${ACETATE_PRESET_NAMES.join(", ")}`,
      );
      return;
    }

    TWEENED_SCALARS.forEach((key) => {
      tween.from[key] = material[key];
      tween.to[key] = nextPreset[key];
    });
    TWEENED_COLORS.forEach((key) => {
      tween.from[key].copy(material[key]);
      tween.to[key].copy(nextPreset[key]);
    });
    tween.from.rimColor.copy(uniforms.u_rimColor.value);
    tween.to.rimColor.copy(nextPreset.rimColor);
    tween.from.translucence = uniforms.u_translucence.value;
    tween.to.translucence = nextPreset.translucence;

    tween.t = 0;
    tween.active = true;
  };

  material.updateAcetateTween = function updateAcetateTween(delta) {
    if (!tween.active) return;

    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    TWEENED_SCALARS.forEach((key) => {
      material[key] = THREE.MathUtils.lerp(tween.from[key], tween.to[key], k);
    });
    TWEENED_COLORS.forEach((key) => {
      material[key].copy(tween.from[key]).lerp(tween.to[key], k);
    });
    uniforms.u_rimColor.value.copy(tween.from.rimColor).lerp(tween.to.rimColor, k);
    uniforms.u_translucence.value = THREE.MathUtils.lerp(tween.from.translucence, tween.to.translucence, k);

    if (tween.t >= 1) tween.active = false;
  };

  return material;
}
