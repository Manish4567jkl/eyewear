import { getProduct } from "./data/products.js";
import { swatchGradient } from "./swatchGradient.js";

// Same lightweight "product image" stand-in the collection grid/look-cards use
// elsewhere on the site — no 3D scene needed for a coming-soon stub.
const product = getProduct(document.body.dataset.productSlug);
const imageEl = document.querySelector("#product-image");
if (product && imageEl) {
  imageEl.style.background = swatchGradient(product);
}
