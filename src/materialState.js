import { getProduct } from "./data/products.js";
import { FRAME_PRESET_NAMES, getFramePresetSwatch } from "./frameMaterial.js";
import { ACETATE_PRESET_NAMES, getAcetatePresetSwatch } from "./acetateMaterial.js";
import { LENS_PRESET_NAMES, getLensPresetSwatch } from "./lensMaterial.js";
import { TEXT_PRESET_NAMES, getTextPresetSwatch } from "./textMaterial.js";

// ==========================================================================
// Per-SKU material selection store — the single source of truth for which preset each
// customizable part is currently wearing.
//
// This holds SELECTION NAMES only ("gunmetal", "clear"), never material instances. The
// presets themselves keep living in frameMaterial.js / acetateMaterial.js /
// lensMaterial.js / textMaterial.js, which both this store and the full configurator
// already import — so this is a new place to record *choices*, not a second copy of the
// material system.
//
// Scope note: right now only the On Mannequin view reads and writes this. The full
// configurator (main.js) keeps its own module-local selections and is deliberately NOT
// wired up here — it holds its state in local variables with hardcoded initial presets,
// so making it participate would mean editing it, which this task explicitly forbade.
// The store is shaped so that wiring is a later, additive change: read initial values
// from getMaterialState(slug) and write on select via setMaterialPreset(). Until then,
// treat "shared" as "shared preset definitions", not "synchronised selections".
// ==========================================================================

// The parts a frame can expose. Which of these actually appear on a given SKU is decided
// by the meshes present in its GLB (see meshCategoryMap.js), not by this list.
export const PART_IDS = ["frame", "acetate", "handles", "hinge", "lens", "text"];

// Per part: its display label, the preset vocabulary it draws from, and how to read a
// preset's swatch. Every entry points at the existing shared material modules.
export const PART_SPECS = {
  frame: { label: "Frame", presetNames: FRAME_PRESET_NAMES, getSwatch: getFramePresetSwatch },
  acetate: { label: "Frame", presetNames: ACETATE_PRESET_NAMES, getSwatch: getAcetatePresetSwatch },
  handles: { label: "Temple", presetNames: FRAME_PRESET_NAMES, getSwatch: getFramePresetSwatch },
  hinge: { label: "Hinge", presetNames: FRAME_PRESET_NAMES, getSwatch: getFramePresetSwatch },
  lens: { label: "Lens", presetNames: LENS_PRESET_NAMES, getSwatch: getLensPresetSwatch },
  text: { label: "Text", presetNames: TEXT_PRESET_NAMES, getSwatch: getTextPresetSwatch },
};

// slug -> { part: presetName }. Populated lazily from each product's authored defaults.
const selections = new Map();
const listeners = new Set();

// A SKU's starting point is whatever products.js already authored for it — so opening the
// mannequin view shows the product as designed, and the store only diverges once the user
// actually picks something.
function defaultsFor(slug) {
  const product = getProduct(slug);
  const metal = product?.frameFinish ?? "gunmetal";
  return {
    frame: metal,
    acetate: product?.acetateColor ?? "black",
    handles: metal,
    hinge: product?.hingeFinish ?? metal,
    lens: product?.lensTint ?? "clear",
    text: product?.textColor ?? "silver",
  };
}

/** Current selections for a SKU, seeded from its authored defaults on first read. */
export function getMaterialState(slug) {
  if (!selections.has(slug)) selections.set(slug, defaultsFor(slug));
  return selections.get(slug);
}

/**
 * Records a choice and notifies subscribers. Unknown preset names are rejected rather
 * than stored, so a typo can't put the store into a state no material can render.
 */
export function setMaterialPreset(slug, part, presetName) {
  const spec = PART_SPECS[part];
  if (!spec) {
    console.warn(`[materialState] Unknown part "${part}".`);
    return false;
  }
  if (!spec.presetNames.includes(presetName)) {
    console.warn(`[materialState] "${presetName}" is not a valid ${part} preset.`);
    return false;
  }
  const current = getMaterialState(slug);
  if (current[part] === presetName) return false;
  current[part] = presetName;
  listeners.forEach((fn) => fn({ slug, part, presetName }));
  return true;
}

export function subscribeMaterialState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
