import { getFramePresetSwatch } from "./frameMaterial.js";
import { getAcetatePresetSwatch } from "./acetateMaterial.js";

function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((num >> 16) & 0xff) + percent);
  const g = clamp(((num >> 8) & 0xff) + percent);
  const b = clamp((num & 0xff) + percent);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * A flat CSS gradient standing in for a product render on cards/thumbnails — derived
 * from the product's actual configured material (acetate color or metal frame finish),
 * not a guess, so it stays correct as new construction types are added.
 */
export function swatchGradient(product) {
  const swatch =
    product.frameConstruction === "acetate"
      ? getAcetatePresetSwatch(product.acetateColor)
      : getFramePresetSwatch(product.frameFinish);
  const hex = swatch?.hex ?? "#a6825a";
  return `linear-gradient(160deg, ${shade(hex, 55)} 0%, ${hex} 55%, ${shade(hex, -70)} 100%)`;
}
