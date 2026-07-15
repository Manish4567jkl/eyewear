import { gsap, EASE, DUR } from "./motion.js";
import { COLLECTIONS, PRODUCTS, formatPrice } from "./data/products.js";
import { swatchGradient } from "./swatchGradient.js";

/**
 * Click-to-open mega menu, replacing the old hover-dropdown. Hover chains break the
 * instant the cursor drifts off a narrow trigger before reaching the panel (and don't
 * exist at all on touch), so this is click/tap to open, and stays open until the visitor
 * explicitly closes it — click the trigger again, click anywhere outside, or press
 * Escape. Same interaction model on desktop and mobile, no separate hamburger system
 * needed since the panel itself goes full-width/scrollable under the header at narrow
 * widths (see the .mega-menu CSS in base.css).
 *
 * Content (both collections, every product under each, with a thumbnail) is built here
 * from the products data rather than hardcoded per page, so a new product or collection
 * shows up in the nav automatically.
 */
export function initNav() {
  const trigger = document.querySelector("#nav-collections-trigger");
  const menu = document.querySelector("#nav-mega-menu");
  const menuInner = menu?.querySelector(".mega-menu-inner");
  if (!trigger || !menu || !menuInner) return;

  menuInner.innerHTML = COLLECTIONS.map((collection) => {
    const products = PRODUCTS.filter((p) => p.collection === collection.id);
    return `
      <div class="mega-menu-column">
        <a class="mega-menu-collection-link" href="/collections/${collection.slug}/" data-collection-slug="${collection.slug}">
          <span class="mega-menu-collection-name">${collection.name}</span>
          <span class="mega-menu-view-all">View All <span class="glyph">→</span></span>
        </a>
        <div class="mega-menu-products">
          ${products
            .map(
              (p) => `
            <a class="mega-menu-product" href="/products/${p.slug}/">
              <span class="mega-menu-product-swatch" style="background:${swatchGradient(p)}"></span>
              <span class="mega-menu-product-info">
                <span class="mega-menu-product-name">${p.name}</span>
                <span class="mega-menu-product-price">${formatPrice(p.price)}</span>
              </span>
            </a>`,
            )
            .join("")}
        </div>
      </div>`;
  }).join("");

  let isOpen = false;

  function openMenu() {
    if (isOpen) return;
    isOpen = true;
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    menu.classList.add("open");
    gsap.fromTo(
      menu,
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: DUR.reveal, ease: EASE.entrance, overwrite: true },
    );
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeydown);
  }

  function closeMenu() {
    if (!isOpen) return;
    isOpen = false;
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("open"); // pointer-events:none immediately, opacity fades via the tween below
    gsap.to(menu, { opacity: 0, y: -10, duration: DUR.snap, ease: EASE.hoverOut, overwrite: true });
    document.removeEventListener("click", handleOutsideClick, true);
    document.removeEventListener("keydown", handleKeydown);
  }

  function handleOutsideClick(event) {
    if (menu.contains(event.target) || trigger.contains(event.target)) return;
    closeMenu();
  }

  function handleKeydown(event) {
    if (event.key === "Escape") closeMenu();
  }

  trigger.addEventListener("click", () => (isOpen ? closeMenu() : openMenu()));

  // The back-forward cache can restore a page with the menu mid-open from before the
  // visitor navigated away — force it closed on every (re)show so "back" always lands
  // on a clean, predictable state rather than whatever it happened to be left in.
  window.addEventListener("pageshow", closeMenu);

  // ---------- Active state: brass underline on wherever the visitor actually is ----------
  const path = window.location.pathname;
  const collectionMatch = path.match(/\/collections\/([^/]+)\/?$/);
  const shopAllLink = document.querySelector("#nav-shop-all");

  if (collectionMatch && collectionMatch[1] === "all") {
    shopAllLink?.classList.add("active");
  } else if (collectionMatch) {
    trigger.classList.add("active");
    menu.querySelector(`[data-collection-slug="${collectionMatch[1]}"]`)?.classList.add("active");
  }
}
