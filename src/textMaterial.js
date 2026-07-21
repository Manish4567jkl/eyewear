import * as THREE from "three";

const TWEEN_DURATION = 0.8; // seconds

// "matchFrame" has no fixed color of its own — main.js passes the frame's current
// getFinishState() as an override when this preset is selected. The values below
// are just the fallback if it's ever picked with no override supplied.
const TEXT_PRESETS = {
  matchFrame: { color: new THREE.Color(0xd6d6d6), metalness: 1.0, roughness: 0.3 },
  black: { color: new THREE.Color(0x0a0a0a), metalness: 0.2, roughness: 0.5 },
  white: { color: new THREE.Color(0xf5f5f5), metalness: 0.1, roughness: 0.4 },
  gold: { color: new THREE.Color(0xffd27a), metalness: 1.0, roughness: 0.15 },
  silver: { color: new THREE.Color(0xd6d6d6), metalness: 1.0, roughness: 0.25 },
  roseGold: { color: new THREE.Color(0xe0a08c), metalness: 1.0, roughness: 0.2 },
  // Tone-on-tone engraving rather than an applied metal marking — reads as debossed,
  // which is a genuinely different treatment from the five metals above it.
  cream: { color: new THREE.Color(0xe6dcc6), metalness: 0.1, roughness: 0.55 },
};

export const TEXT_PRESET_NAMES = Object.keys(TEXT_PRESETS);

/** Swatch metadata for the UI — actual preset color/metalness/roughness, not a guess. */
export function getTextPresetSwatch(presetName) {
  const preset = TEXT_PRESETS[presetName];
  if (!preset) return null;
  return {
    hex: `#${preset.color.getHexString()}`,
    metalness: preset.metalness,
    roughness: preset.roughness,
  };
}

/**
 * Brand text/logo material: plain MeshStandardMaterial, no absorption complexity —
 * just a tweened color/metalness/roughness swap.
 */
export function createTextMaterial(initialPreset = "silver") {
  const preset = TEXT_PRESETS[initialPreset];

  const material = new THREE.MeshStandardMaterial({
    color: preset.color.clone(),
    metalness: preset.metalness,
    roughness: preset.roughness,
  });

  const tween = {
    active: false,
    t: 0,
    from: { color: new THREE.Color(), metalness: 0, roughness: 0 },
    to: { color: new THREE.Color(), metalness: 0, roughness: 0 },
  };

  material.setTextColor = function setTextColor(presetName, overrideState) {
    const preset = TEXT_PRESETS[presetName];
    if (!preset) {
      console.warn(
        `[textMaterial] Unknown preset "${presetName}". Available: ${TEXT_PRESET_NAMES.join(", ")}`,
      );
      return;
    }

    const targetColor = overrideState?.baseColor ?? preset.color;
    const targetMetalness = overrideState?.metalness ?? preset.metalness;
    const targetRoughness = overrideState?.roughness ?? preset.roughness;

    tween.from.color.copy(material.color);
    tween.from.metalness = material.metalness;
    tween.from.roughness = material.roughness;

    tween.to.color.copy(targetColor);
    tween.to.metalness = targetMetalness;
    tween.to.roughness = targetRoughness;

    tween.t = 0;
    tween.active = true;
  };

  material.updateTextTween = function updateTextTween(delta) {
    if (!tween.active) return;

    tween.t = Math.min(1, tween.t + delta / TWEEN_DURATION);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smoothstep

    material.color.copy(tween.from.color).lerp(tween.to.color, k);
    material.metalness = THREE.MathUtils.lerp(tween.from.metalness, tween.to.metalness, k);
    material.roughness = THREE.MathUtils.lerp(tween.from.roughness, tween.to.roughness, k);

    if (tween.t >= 1) tween.active = false;
  };

  return material;
}
