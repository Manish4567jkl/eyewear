import * as THREE from "three";

const TWEEN_DURATION = 0.8; // seconds

// f0 is the metal's base reflectance (specular color at normal incidence). For a real
// metal this — not the "albedo" — is what gives it its color; gold/silver/copper values
// are the standard measured spectral approximations. baseColor is blended in only as a
// subtle tint on top (see FRAME_F0_TINT_AMOUNT below), not as the dominant color source.
const FRAME_PRESETS = {
  // Values below are tuned for *swatch-scale distinction*, not just per-preset physical
  // accuracy in isolation — at a 56–130px preview sphere, several of these read as
  // "similarly bright metallic blob" when their roughness is low enough that the render
  // is almost entirely a tone-mapped specular highlight (which compresses toward white
  // regardless of f0 hue). Roughness nudged up a touch and f0/baseColor pushed further
  // apart per-metal so each one's actual hue carries past the highlight, at a glance,
  // at small size — the ACES/exposure pipeline itself (swatchRenderer.js) is unchanged.
  polishedGold: {
    baseColor: new THREE.Color(0xffc94a),
    f0: new THREE.Color(1.0, 0.766, 0.336),
    metalness: 1.0,
    roughness: 0.09,
  },
  brushedSilver: {
    baseColor: new THREE.Color(0xb9c1c9), // cooled from a near-neutral grey so it doesn't
    f0: new THREE.Color(0.88, 0.93, 0.98), // read as "dim gold" next to polishedGold
    metalness: 1.0,
    roughness: 0.46, // pushed further into "brushed/matte" vs. gold's mirror gloss
  },
  gunmetal: {
    baseColor: new THREE.Color(0x20242a), // noticeably darker/cooler — was reading too
    f0: new THREE.Color(0.09, 0.1, 0.13), // close to titanium/graphite at a glance
    metalness: 1.0,
    roughness: 0.3,
  },
  roseGold: {
    baseColor: new THREE.Color(0xdb8873), // more saturated pink, not pale peach — was
    f0: new THREE.Color(1.0, 0.58, 0.52), // reading too close to champagne/copper
    metalness: 1.0,
    roughness: 0.16,
  },
  matteBlack: {
    baseColor: new THREE.Color(0x1a1a1a),
    f0: new THREE.Color(0.15, 0.15, 0.16), // low-metalness coated finish, not a pure metal
    metalness: 0.3,
    roughness: 0.42,
  },
  titanium: {
    baseColor: new THREE.Color(0xb8bcc2),
    f0: new THREE.Color(0.542, 0.497, 0.449),
    metalness: 1.0,
    roughness: 0.3,
  },
  champagne: {
    baseColor: new THREE.Color(0xf0dfb0),
    f0: new THREE.Color(0.95, 0.86, 0.66), // pale gold alloy, lighter than pure gold
    metalness: 1.0,
    roughness: 0.18, // was almost identical-highlight to polishedGold at swatch size
  },
  copper: {
    baseColor: new THREE.Color(0xc07350),
    f0: new THREE.Color(0.955, 0.638, 0.538),
    metalness: 1.0,
    roughness: 0.15,
  },
  graphite: {
    baseColor: new THREE.Color(0x2e3236),
    f0: new THREE.Color(0.26, 0.27, 0.3), // dark steel/graphite-coated
    metalness: 1.0,
    roughness: 0.35,
  },
};

// How much of the metal's specular color comes from baseColor vs. its physical f0.
// Nudged up from 0.15 so each preset's hue reads a little more even under tone-mapped
// highlights — still low enough that metals are clearly f0-driven, not albedo-driven.
const FRAME_F0_TINT_AMOUNT = 0.2;

export const FRAME_PRESET_NAMES = Object.keys(FRAME_PRESETS);

/** Swatch metadata for the UI — actual preset color/metalness/roughness, not a guess. */
export function getFramePresetSwatch(presetName) {
  const preset = FRAME_PRESETS[presetName];
  if (!preset) return null;
  return {
    hex: `#${preset.baseColor.getHexString()}`,
    metalness: preset.metalness,
    roughness: preset.roughness,
  };
}

/**
 * Frame material: MeshPhysicalMaterial extended via onBeforeCompile so it keeps
 * three's existing PBR + IBL (scene.environment) reflection pipeline, while exposing
 * u_baseColor / u_f0 / u_metalness / u_roughness as the uniforms driving the look.
 *
 * Physically, a metal's diffuseColor.rgb IS what three's lights_physical_fragment chunk
 * uses as the specular tint once metalness reaches 1 (material.specularColorBlended =
 * mix(vec3(0.04), diffuseColor.rgb, metalnessFactor)) — so overriding diffuseColor.rgb to
 * be f0-driven (rather than a flat baseColor multiply) is what actually fixes "gold reads
 * muddy/brown": a generic hex color is a poor stand-in for gold's real spectral f0.
 */
export function createFrameMaterial(initialPreset = "gunmetal") {
  const preset = FRAME_PRESETS[initialPreset];

  const uniforms = {
    u_baseColor: { value: preset.baseColor.clone() },
    u_f0: { value: preset.f0.clone() },
    u_metalness: { value: preset.metalness },
    u_roughness: { value: preset.roughness },
  };

  const material = new THREE.MeshPhysicalMaterial({
    metalness: preset.metalness,
    roughness: preset.roughness,
    envMapIntensity: 1.4,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.u_baseColor = uniforms.u_baseColor;
    shader.uniforms.u_f0 = uniforms.u_f0;
    shader.uniforms.u_metalness = uniforms.u_metalness;
    shader.uniforms.u_roughness = uniforms.u_roughness;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec3 u_baseColor;
      uniform vec3 u_f0;
      uniform float u_metalness;
      uniform float u_roughness;`,
    );

    // diffuseColor.rgb becomes the metal's specular tint further down this same chunk
    // (mix(0.04, diffuseColor.rgb, metalnessFactor)), so this is where f0 actually reaches
    // the reflection. At metalness 1 it's ~85% f0 / 15% baseColor tint; at lower metalness
    // (matteBlack) baseColor dominates instead, since that's acting as real diffuse albedo.
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      `vec3 specularTint = mix( u_f0, u_baseColor, ${FRAME_F0_TINT_AMOUNT} );
      vec4 diffuseColor = vec4( diffuse * mix( u_baseColor, specularTint, u_metalness ), opacity );`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "float roughnessFactor = roughness;",
      "float roughnessFactor = u_roughness;",
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "float metalnessFactor = metalness;",
      "float metalnessFactor = u_metalness;",
    );
  };

  // Custom uniforms change the compiled output, so give the material its own program cache key.
  material.customProgramCacheKey = () => "eyewearFrameMaterial";

  // Explicitly assigning envMap (once the HDRI resolves) keeps this material off the
  // "material.envMap === null" branch in WebGLRenderer that otherwise overwrites
  // envMapIntensity with scene.environmentIntensity — i.e. this is what makes the
  // material's own envMapIntensity above actually take effect, independent of whatever
  // the background/global exposure is set to.
  material.setEnvironment = function setEnvironment(envMap) {
    material.envMap = envMap;
    material.needsUpdate = true;
  };

  const tween = {
    active: false,
    t: 0,
    from: { baseColor: new THREE.Color(), f0: new THREE.Color(), metalness: 0, roughness: 0 },
    to: { baseColor: new THREE.Color(), f0: new THREE.Color(), metalness: 0, roughness: 0 },
  };

  material.setFrameFinish = function setFrameFinish(presetName) {
    const nextPreset = FRAME_PRESETS[presetName];
    if (!nextPreset) {
      console.warn(
        `[frameMaterial] Unknown finish preset "${presetName}". Available: ${FRAME_PRESET_NAMES.join(", ")}`,
      );
      return;
    }

    tween.from.baseColor.copy(uniforms.u_baseColor.value);
    tween.from.f0.copy(uniforms.u_f0.value);
    tween.from.metalness = uniforms.u_metalness.value;
    tween.from.roughness = uniforms.u_roughness.value;

    tween.to.baseColor.copy(nextPreset.baseColor);
    tween.to.f0.copy(nextPreset.f0);
    tween.to.metalness = nextPreset.metalness;
    tween.to.roughness = nextPreset.roughness;

    tween.t = 0;
    tween.active = true;
  };

  material.updateFrameTween = function updateFrameTween(delta) {
    if (!tween.active) return;

    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    uniforms.u_baseColor.value.copy(tween.from.baseColor).lerp(tween.to.baseColor, k);
    uniforms.u_f0.value.copy(tween.from.f0).lerp(tween.to.f0, k);
    uniforms.u_metalness.value = THREE.MathUtils.lerp(tween.from.metalness, tween.to.metalness, k);
    uniforms.u_roughness.value = THREE.MathUtils.lerp(tween.from.roughness, tween.to.roughness, k);

    material.metalness = uniforms.u_metalness.value;
    material.roughness = uniforms.u_roughness.value;

    if (tween.t >= 1) tween.active = false;
  };

  material.getFinishState = function getFinishState() {
    return {
      baseColor: uniforms.u_baseColor.value.clone(),
      metalness: uniforms.u_metalness.value,
      roughness: uniforms.u_roughness.value,
    };
  };

  return material;
}
