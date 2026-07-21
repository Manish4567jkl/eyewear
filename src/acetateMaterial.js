import * as THREE from "three";

const TWEEN_DURATION = 0.8; // seconds — matches frameMaterial/lensMaterial/textMaterial

// ---------------------------------------------------------------------------
// Acetate as a thick absorbing block, not a tinted surface.
//
// The previous two versions of this material both modelled acetate as a *diffuse
// surface* — a base colour, plus a fresnel rim blend standing in for translucency. That
// is the reason it read as cheap plastic no matter how the colours were tuned: a rim
// blend brightens the silhouette edge, but it carries no image of what is behind the
// frame, no dependence on how far light actually travelled through the material, and no
// scattering. Real acetate is a 4-6mm block of dyed cellulose. You see *through* it, the
// colour deepens with the distance light travels inside it, and what comes through is a
// blurred version of the room behind — which is precisely why a crystal or honey frame
// looks expensive and a flat-shaded one doesn't.
//
// So this version actually transmits:
//
//   1. The environment is sampled along a *refracted* view ray (IOR 1.53, cellulose
//      acetate) at a deliberately high roughness, giving the blurred, scattered image of
//      what's behind the frame rather than a mirror of it.
//   2. That transmitted light is absorbed by Beer-Lambert through the pigment —
//      transmittance = pigment ^ pathLength — so colour genuinely deepens with depth.
//      Crystal stays bright and glassy, black extinguishes almost everything, honey
//      glows amber where the section is thin.
//   3. Path length grows at grazing angles and is modulated by the pigment layer, so
//      thin sections (temple tips, rim edges) light up and dense pigment blocks light.
//   4. Diffuse response is scaled *down* as translucency rises, so a crystal frame reads
//      as transmitting rather than as a lit white solid.
//
// Why this rather than MeshPhysicalMaterial.transmission: three's transmission feature
// refracts a captured render target built from `scene.background` plus other opaque
// objects (WebGLRenderer.renderTransmissionPass). This app never sets scene.background —
// the visible backdrop is a separate hand-rolled pass (backdrop.js) composited before
// the product scene, invisible to that capture — so transmission had nothing but
// near-black to blend toward. Sampling the PMREM environment directly needs no render
// target, costs one texture fetch, and behaves identically on every page.
//
// All of it rides on three's own PBR/IBL pipeline via onBeforeCompile, the same
// technique frameMaterial.js uses. Injection points were read off three r185's actual
// meshphysical shader: `vNormal`/`vViewPosition` exist before the diffuseColor line,
// `roughnessFactor` at the roughnessmap chunk, and `normal`/`geometryViewDir`/`envMap`/
// `envMapIntensity` are all in scope at the `outgoingLight` line where the transmitted
// term is added.
// ---------------------------------------------------------------------------

// Seven finishes, chosen to span the range the shader can actually express — two dense
// solids, one pattern, two near-clear, two saturated mid-density — rather than a long
// list of neighbouring browns that a swatch row can't tell apart.
//
// Per preset:
//   pigmentDeep/Mid/Light  the three-tone pigment ramp the pattern selects between
//   patternAmount   0 = uniform pigment, 1 = full three-tone mottling
//   patternScale    higher = finer, busier mottling
//   patternStretch  per-axis squash of the noise domain; streaks run along the low axis
//   patternContrast higher = harder-edged blotches (horn), lower = soft clouds
//   layerDepth      how far the deep pigment layer sits beneath the surface layer
//   transmission     how much of the surface is see-through (three's transmission)
//   thicknessScale   optical depth of the block, as a fraction of the frame's own size
//   attenuationScale how far light travels inside before the pigment absorbs it, again
//                    relative to frame size. Short = dense/opaque, long = water-clear.
//
// thicknessScale and attenuationScale are *relative* because three's thickness and
// attenuationDistance are in world units, and these GLBs are authored at wildly
// different scales — see setPatternSpaceScale.
const ACETATE_PRESETS = {
  // Dense, warm-undertoned black. Almost nothing transmits — only the very thinnest
  // sections show the brown that real "black" acetate is actually dyed with.
  black: {
    pigmentDeep: new THREE.Color(0x090807),
    pigmentMid: new THREE.Color(0x15120f),
    pigmentLight: new THREE.Color(0x3a2a1e),
    patternAmount: 0.25,
    patternScale: 3.0,
    patternStretch: new THREE.Vector3(0.5, 1.0, 1.0),
    patternContrast: 0.6,
    layerDepth: 0.4,
    roughness: 0.08,
    clearcoat: 0.95,
    clearcoatRoughness: 0.04,
    sheen: 0.25,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(0x6b5040),
    transmission: 0.25,
    thicknessScale: 0.3,
    attenuationScale: 0.02,
  },
  // The hero pattern. Mottled havana with real depth — dark inclusions blocking light
  // against blonde patches that glow through.
  tortoise: {
    pigmentDeep: new THREE.Color(0x2a1408),
    pigmentMid: new THREE.Color(0x7a4a1e),
    pigmentLight: new THREE.Color(0xd9a15a),
    patternAmount: 1.0,
    patternScale: 5.0,
    patternStretch: new THREE.Vector3(0.45, 1.0, 1.0),
    patternContrast: 0.95,
    layerDepth: 0.6,
    roughness: 0.09,
    clearcoat: 0.92,
    clearcoatRoughness: 0.05,
    sheen: 0.3,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xd9a56b),
    transmission: 0.8,
    thicknessScale: 0.25,
    attenuationScale: 0.08,
  },
  // Water-clear. The showcase for the transmission path — you should be able to almost
  // read the room through it.
  crystal: {
    pigmentDeep: new THREE.Color(0xdedcd4),
    pigmentMid: new THREE.Color(0xf2f0e9),
    pigmentLight: new THREE.Color(0xfffefb),
    patternAmount: 0.18,
    patternScale: 2.4,
    patternStretch: new THREE.Vector3(0.55, 1.0, 1.0),
    patternContrast: 0.5,
    layerDepth: 0.75,
    roughness: 0.05,
    clearcoat: 0.97,
    clearcoatRoughness: 0.03,
    sheen: 0.18,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color(0xffffff),
    transmission: 1.0,
    thicknessScale: 0.22,
    attenuationScale: 0.9,
  },
  // Amber, lit from within. Low density but strongly coloured, so it glows rather than
  // darkens as the section thickens.
  honey: {
    pigmentDeep: new THREE.Color(0x8a4a12),
    pigmentMid: new THREE.Color(0xc9781f),
    pigmentLight: new THREE.Color(0xf5c070),
    patternAmount: 0.5,
    patternScale: 3.4,
    patternStretch: new THREE.Vector3(0.5, 1.0, 1.0),
    patternContrast: 0.7,
    layerDepth: 0.7,
    roughness: 0.07,
    clearcoat: 0.94,
    clearcoatRoughness: 0.04,
    sheen: 0.28,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(0xffcf8a),
    transmission: 1.0,
    thicknessScale: 0.25,
    attenuationScale: 0.22,
  },
  // Translucent grey — the neutral counterpart to crystal, and the finish that shows the
  // scattering most clearly because nothing else competes with it.
  smoke: {
    pigmentDeep: new THREE.Color(0x2c2e31),
    pigmentMid: new THREE.Color(0x585a5e),
    pigmentLight: new THREE.Color(0x9ea2a8),
    patternAmount: 0.3,
    patternScale: 2.6,
    patternStretch: new THREE.Vector3(0.55, 1.0, 1.0),
    patternContrast: 0.55,
    layerDepth: 0.7,
    roughness: 0.06,
    clearcoat: 0.95,
    clearcoatRoughness: 0.035,
    sheen: 0.22,
    sheenRoughness: 0.32,
    sheenColor: new THREE.Color(0xdfe3ea),
    transmission: 0.95,
    thicknessScale: 0.24,
    attenuationScale: 0.18,
  },
  // Bottle green: near-black in the thick front, unmistakably green where light gets
  // through the temples.
  deepGreen: {
    pigmentDeep: new THREE.Color(0x0b1d15),
    pigmentMid: new THREE.Color(0x1d3b2b),
    pigmentLight: new THREE.Color(0x4f8664),
    patternAmount: 0.4,
    patternScale: 3.6,
    patternStretch: new THREE.Vector3(0.45, 1.0, 1.0),
    patternContrast: 0.7,
    layerDepth: 0.6,
    roughness: 0.08,
    clearcoat: 0.93,
    clearcoatRoughness: 0.045,
    sheen: 0.3,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0x6fd6a0),
    transmission: 0.85,
    thicknessScale: 0.26,
    attenuationScale: 0.1,
  },
  // Deep wine. Same construction as deepGreen at a warmer hue, so the pair reads as a
  // considered two-colour offering rather than two arbitrary darks.
  burgundy: {
    pigmentDeep: new THREE.Color(0x2b0c0f),
    pigmentMid: new THREE.Color(0x5f2529),
    pigmentLight: new THREE.Color(0xb05a62),
    patternAmount: 0.4,
    patternScale: 3.6,
    patternStretch: new THREE.Vector3(0.45, 1.0, 1.0),
    patternContrast: 0.7,
    layerDepth: 0.6,
    roughness: 0.08,
    clearcoat: 0.93,
    clearcoatRoughness: 0.045,
    sheen: 0.3,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xd98a8a),
    transmission: 0.85,
    thicknessScale: 0.26,
    attenuationScale: 0.1,
  },
};

export const ACETATE_PRESET_NAMES = Object.keys(ACETATE_PRESETS);

/**
 * Normalizes an acetate material's pigment frequency against the meshes wearing it.
 *
 * The pattern is evaluated in object space (so it stays locked to the frame instead of
 * swimming across it on the turntable), which means it has to be measured in object
 * space too — geometry bounding boxes, not the model's world-space size, since the
 * nodes carry their own scales. All the acetate meshes share one material and one
 * authoring space, so the union of their boxes is the right extent to divide by.
 */
export function fitAcetatePatternScale(material, meshes) {
  if (!material?.setPatternSpaceScale || !meshes?.length) return;

  const box = new THREE.Box3();
  meshes.forEach((mesh) => {
    const geometry = mesh?.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
  });
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  material.setPatternSpaceScale(Math.max(size.x, size.y, size.z));
}

/**
 * Swatch metadata for the UI. The pattern makes "the colour" ambiguous, so this reports
 * the mid pigment, lifted toward the light pigment in proportion to how much of the
 * frame is actually pattern and how much light the block lets through — a translucent
 * finish genuinely reads lighter than its pigment alone.
 */
export function getAcetatePresetSwatch(presetName) {
  const preset = ACETATE_PRESETS[presetName];
  if (!preset) return null;
  const lift = 0.25 * preset.patternAmount + 0.2 * preset.transmission;
  const swatch = preset.pigmentMid.clone().lerp(preset.pigmentLight, Math.min(lift, 0.6));
  return { hex: `#${swatch.getHexString()}`, roughness: preset.roughness };
}

// Material properties three itself owns, tweened directly on the material.
const TWEENED_SCALARS = ["roughness", "clearcoat", "clearcoatRoughness", "sheen", "sheenRoughness"];
const TWEENED_COLORS = ["sheenColor"];

// Our own uniforms, tweened on uniform.value. Split by type so the tween loop can just
// lerp/copy without a per-key type check. Uniform names are "u_" + key.
const UNIFORM_SCALARS = ["patternAmount", "patternScale", "patternContrast", "layerDepth"];

// Transmission is three's own material property, so it tweens like roughness does. The
// other two are derived from frame size rather than copied straight off the preset, so
// they're applied in applyOpticalScale() instead of being tweened directly.
const TRANSMISSION_SCALARS = ["transmission"];
const UNIFORM_COLORS = ["pigmentDeep", "pigmentMid", "pigmentLight"];
const UNIFORM_VECTORS = ["patternStretch"];

const ACETATE_PATTERN_GLSL = /* glsl */ `
// Cheap 3D value noise. Prefixed "ac" throughout so nothing here can collide with a
// three.js shader chunk function of the same name.
float acHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float acNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(acHash(i + vec3(0.0, 0.0, 0.0)), acHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(acHash(i + vec3(0.0, 1.0, 0.0)), acHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(acHash(i + vec3(0.0, 0.0, 1.0)), acHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(acHash(i + vec3(0.0, 1.0, 1.0)), acHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float acFbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * acNoise(p);
    p = p * 2.03 + vec3(19.19, 7.31, 3.77);
    a *= 0.5;
  }
  return v;
}

// Domain-warped fbm. The warp is what turns generic blobs into the swirled, drawn-out
// streaks that read as pressed pigment rather than camouflage.
float acPigment(vec3 p) {
  vec3 warp = vec3(acFbm(p * 1.7), acFbm(p * 1.7 + 31.4), acFbm(p * 1.7 + 57.1)) - 0.5;
  return acFbm(p + warp * 1.25);
}
`;

/**
 * Acetate frame material: a single MeshPhysicalMaterial instance meant to be shared
 * across every mesh that makes up the acetate body (frame front + temples both — see
 * the mesh classification in meshCategoryMap.js) — acetate frames are one continuous
 * pigmented piece, not a per-part palette, so there's exactly one colour control.
 */
export function createAcetateMaterial(initialPreset = "black") {
  const preset = ACETATE_PRESETS[initialPreset] ?? ACETATE_PRESETS.black;

  const uniforms = {
    u_pigmentDeep: { value: preset.pigmentDeep.clone() },
    u_pigmentMid: { value: preset.pigmentMid.clone() },
    u_pigmentLight: { value: preset.pigmentLight.clone() },
    u_patternStretch: { value: preset.patternStretch.clone() },
    u_patternAmount: { value: preset.patternAmount },
    u_patternScale: { value: preset.patternScale },
    u_patternContrast: { value: preset.patternContrast },
    u_layerDepth: { value: preset.layerDepth },
    // Object-space normalizer — see setPatternSpaceScale. Default 1 (object space is
    // already roughly unit-sized), overridden once the real geometry is known.
    u_patternSpaceScale: { value: 1 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, // the pigment supplies the colour; this must not tint it
    metalness: 0,
    roughness: preset.roughness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    sheen: preset.sheen,
    sheenRoughness: preset.sheenRoughness,
    sheenColor: preset.sheenColor.clone(),
    ior: 1.53, // cellulose acetate — drives both the specular F0 and the refracted ray
    // Dielectric, not metal — a metal-grade reflection boost here pushes the clearcoat
    // highlight past where the tone curve still holds detail.
    envMapIntensity: 1.0,
    // Must be non-zero at construction: three compiles USE_TRANSMISSION off the initial
    // value, and a material that starts at 0 never gets the transmission code path even
    // if the property is raised later.
    transmission: Math.max(preset.transmission, 0.001),
  });

  material.onBeforeCompile = (shader) => {
    Object.keys(uniforms).forEach((key) => {
      shader.uniforms[key] = uniforms[key];
    });

    // Object space, not world space: the pigment must be locked to the frame so it
    // doesn't swim across the surface when the model rotates on the turntable.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vAcetateObjPos;
      varying vec3 vAcetateObjNormal;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vAcetateObjPos = position;
      vAcetateObjNormal = normalize( normal );`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec3 u_pigmentDeep;
      uniform vec3 u_pigmentMid;
      uniform vec3 u_pigmentLight;
      uniform vec3 u_patternStretch;
      uniform float u_patternAmount;
      uniform float u_patternScale;
      uniform float u_patternContrast;
      uniform float u_layerDepth;
      uniform float u_patternSpaceScale;
      varying vec3 vAcetateObjPos;
      varying vec3 vAcetateObjNormal;
      ${ACETATE_PATTERN_GLSL}`,
    );

    // vNormal/vViewPosition are top-level varyings in three's compiled physical shader,
    // so they're valid here. `acetatePattern` and `acetatePigment` declared at this
    // point stay in scope for the roughness and transmission patches further down.
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      `vec3 acetateN = normalize( vNormal );
      vec3 acetateV = normalize( vViewPosition );
      float acetateNdotV = clamp( dot( acetateN, acetateV ), 0.0, 1.0 );

      vec3 acetateObjP = vAcetateObjPos * u_patternSpaceScale;
      vec3 acetateP = acetateObjP * u_patternStretch * u_patternScale;

      // Surface pigment layer.
      float acetateSurface = acPigment( acetateP );

      // Deep pigment layer: the same field sampled further into the block along the
      // surface normal, at a different frequency and phase. Because the offset runs
      // along the normal, the two layers slide against each other as the viewing angle
      // changes — the parallax that makes pigment read as suspended *inside* a solid
      // block rather than printed on its surface.
      vec3 acetateDeepP = ( acetateObjP - vAcetateObjNormal * u_layerDepth * 0.35 )
        * u_patternStretch * u_patternScale * 1.45 + 13.7;
      float acetateDeep = acPigment( acetateDeepP );

      // Head-on you look down through the block and the deep layer shows; at grazing
      // angles the surface layer dominates.
      float acetatePattern = mix( acetateSurface, acetateDeep, 0.42 * acetateNdotV + 0.12 );
      acetatePattern = clamp( ( acetatePattern - 0.5 ) * ( 1.0 + u_patternContrast * 2.0 ) + 0.5, 0.0, 1.0 );

      // Three-tone ramp: dark inclusions -> dominant mid body -> blonde patches. A real
      // pigment sheet is not a two-colour lerp.
      vec3 acetatePigment = mix(
        mix( u_pigmentDeep, u_pigmentMid, smoothstep( 0.0, 0.55, acetatePattern ) ),
        u_pigmentLight,
        smoothstep( 0.58, 0.95, acetatePattern )
      );
      acetatePigment = mix( u_pigmentMid, acetatePigment, u_patternAmount );

      // Transmission handles the energy balance: three's transmission_fragment mixes
      // totalDiffuse toward the refracted result by material.transmission, so the diffuse
      // term must stay the full pigment here rather than being hand-attenuated.
      vec4 diffuseColor = vec4( acetatePigment * diffuse, opacity );`,
    );

    // Micro-variation in the polish. Real hand-polished acetate is not perfectly even;
    // a few percent of roughness wobble is the difference between "polished cellulose"
    // and "injection-moulded plastic".
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp( roughnessFactor * ( 0.85 + 0.3 * acetatePattern ), 0.02, 1.0 );`,
    );

    // Per-fragment pigmented transmission.
    //
    // three's transmission_fragment chunk drives absorption from the flat
    // `attenuationColor` uniform, which would tint the whole frame one colour. Swapping
    // in the per-fragment pigment means light transmitting through a dark tortoise
    // inclusion is extinguished while light through an adjacent blonde patch comes out
    // amber — the pigment reads as suspended in the block rather than printed on it.
    // Same for thickness: dense pattern areas present a longer optical path.
    shader.fragmentShader = shader.fragmentShader.replace(
      "material.attenuationColor = attenuationColor;",
      "material.attenuationColor = acetatePigment;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "material.thickness = thickness;",
      "material.thickness = thickness * ( 0.75 + 0.5 * acetatePattern );",
    );
  };

  // Custom uniforms change the compiled output, so give the material its own program
  // cache key — otherwise WebGLRenderer can reuse a cached program compiled for a
  // different physical material that doesn't have these uniforms.
  material.customProgramCacheKey = () => "eyewearAcetateMaterial";

  // Explicit envMap assignment (once the HDRI resolves) keeps this material off the
  // "material.envMap === null" branch in WebGLRenderer that otherwise force-overwrites
  // envMapIntensity with the scene-level value — same reasoning as frameMaterial.js's
  // setEnvironment. It is also what switches USE_ENVMAP on, so the transmission term
  // above is live only once there is a real environment to transmit.
  material.setEnvironment = function setEnvironment(envMap) {
    material.envMap = envMap;
    material.needsUpdate = true;
  };

  /**
   * Normalizes the pigment frequency against the frame's real size.
   *
   * patternScale is authored as "roughly how many blotches across the frame", which is
   * only meaningful if object space is unit-sized. GLB authoring units vary wildly
   * between the models this app loads (a frame exported in metres is ~0.14 across, one
   * exported in Blender units can be ~14), and at those extremes the same patternScale
   * is either a single flat blob or invisible dust. Prefer fitAcetatePatternScale().
   */
  material.setPatternSpaceScale = function setPatternSpaceScale(largestExtent) {
    if (!Number.isFinite(largestExtent) || largestExtent <= 0) return;
    uniforms.u_patternSpaceScale.value = 1 / largestExtent;
    frameExtent = largestExtent;
    applyOpticalScale();
  };

  /**
   * Turns the active preset's *relative* optical depths into three's world-unit
   * thickness/attenuationDistance.
   *
   * Both properties are absolute world-space distances, so a preset authored against a
   * frame exported in metres would be wildly wrong on one exported in Blender units —
   * attenuationDistance in particular is an exponential falloff, so being off by 100x
   * is the difference between water-clear and solid black. Expressing them as fractions
   * of the frame's own size and resolving here keeps every preset scale-independent.
   */
  function applyOpticalScale() {
    material.thickness = activePreset.thicknessScale * frameExtent;
    material.attenuationDistance = activePreset.attenuationScale * frameExtent;
  }

  /**
   * Turns transmission off for scenes with nothing behind the frame to refract.
   *
   * three builds the transmission pass from scene.background plus the scene's opaque
   * objects. In a scene with neither — an alpha canvas meant to composite over the page,
   * like homeViewer's — that pass is empty, and a transmissive frame samples black and
   * renders as a dark silhouette. Falling back to the opaque pigment there is correct,
   * not a workaround: with nothing behind it, there is genuinely nothing to see through.
   */
  material.setTransmissionEnabled = function setTransmissionEnabled(enabled) {
    transmissionEnabled = enabled;
    material.transmission = enabled ? Math.max(activePreset.transmission, 0.001) : 0.001;
  };

  // Live optical state. frameExtent starts at 1 (object space assumed unit-sized) and is
  // replaced the moment real geometry is measured; activePreset is what applyOpticalScale
  // reads, so it must track the *target* of a tween, not its start.
  let frameExtent = 1;
  let activePreset = preset;
  let transmissionEnabled = true;
  applyOpticalScale();

  const tween = { active: false, t: 0, from: {}, to: {} };
  [...TWEENED_SCALARS, ...TRANSMISSION_SCALARS].forEach((key) => {
    tween.from[key] = 0;
    tween.to[key] = 0;
  });
  [...TWEENED_COLORS, ...UNIFORM_COLORS].forEach((key) => {
    tween.from[key] = new THREE.Color();
    tween.to[key] = new THREE.Color();
  });
  UNIFORM_VECTORS.forEach((key) => {
    tween.from[key] = new THREE.Vector3();
    tween.to[key] = new THREE.Vector3();
  });
  UNIFORM_SCALARS.forEach((key) => {
    tween.from[key] = 0;
    tween.to[key] = 0;
  });

  const uniformKey = (key) => `u_${key}`;

  material.setAcetateColor = function setAcetateColor(presetName) {
    const nextPreset = ACETATE_PRESETS[presetName];
    if (!nextPreset) {
      console.warn(
        `[acetateMaterial] Unknown preset "${presetName}". Available: ${ACETATE_PRESET_NAMES.join(", ")}`,
      );
      return;
    }

    [...TWEENED_SCALARS, ...TRANSMISSION_SCALARS].forEach((key) => {
      tween.from[key] = material[key];
      tween.to[key] = nextPreset[key];
    });
    // Transmission is forced to ~0 wherever there's nothing behind the frame to refract,
    // and a preset change must not quietly switch it back on.
    if (!transmissionEnabled) {
      tween.from.transmission = 0.001;
      tween.to.transmission = 0.001;
    }
    TWEENED_COLORS.forEach((key) => {
      tween.from[key].copy(material[key]);
      tween.to[key].copy(nextPreset[key]);
    });
    [...UNIFORM_COLORS, ...UNIFORM_VECTORS].forEach((key) => {
      tween.from[key].copy(uniforms[uniformKey(key)].value);
      tween.to[key].copy(nextPreset[key]);
    });
    UNIFORM_SCALARS.forEach((key) => {
      tween.from[key] = uniforms[uniformKey(key)].value;
      tween.to[key] = nextPreset[key];
    });

    // Thickness and attenuationDistance are stepped rather than tweened: both are
    // exponential-falloff inputs, so interpolating them produces a visibly non-linear
    // lurch, and the pigment colours crossfading over the same 0.8s already carry the
    // transition. activePreset must be updated here (not when the tween lands) so a
    // resize or a re-fit mid-tween resolves against the finish being switched to.
    activePreset = nextPreset;
    applyOpticalScale();

    tween.t = 0;
    tween.active = true;
  };

  material.updateAcetateTween = function updateAcetateTween(delta) {
    if (!tween.active) return;

    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    [...TWEENED_SCALARS, ...TRANSMISSION_SCALARS].forEach((key) => {
      material[key] = THREE.MathUtils.lerp(tween.from[key], tween.to[key], k);
    });
    TWEENED_COLORS.forEach((key) => {
      material[key].copy(tween.from[key]).lerp(tween.to[key], k);
    });
    [...UNIFORM_COLORS, ...UNIFORM_VECTORS].forEach((key) => {
      uniforms[uniformKey(key)].value.copy(tween.from[key]).lerp(tween.to[key], k);
    });
    UNIFORM_SCALARS.forEach((key) => {
      uniforms[uniformKey(key)].value = THREE.MathUtils.lerp(tween.from[key], tween.to[key], k);
    });

    if (tween.t >= 1) tween.active = false;
  };

  return material;
}
