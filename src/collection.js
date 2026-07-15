import { gsap, initSmoothScroll, EASE, DUR } from "./motion.js";
import { swatchGradient } from "./swatchGradient.js";
import { initNav } from "./nav.js";
import { COLLECTIONS, PRODUCTS, getCollection, getCollectionProducts, formatPrice } from "./data/products.js";

const lenis = initSmoothScroll();

const header = document.querySelector("#site-header");
lenis.on("scroll", ({ scroll }) => {
  header.classList.toggle("solid", scroll > 24);
});

initNav();

function slugFromPath() {
  const match = window.location.pathname.match(/\/collections\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

// "All Eyewear" is a synthetic view, not a real entry in COLLECTIONS (it would
// otherwise leak into the home page's two curated Collections tiles and the
// mega-menu's two named columns) — handled entirely as a routing special-case here.
const ALL_EYEWEAR = {
  slug: "all",
  name: "All Eyewear",
  eyebrow: "The Full Range",
  description:
    "Every silhouette across both collections in one place — aviators, opticals, and combination frames, " +
    "for browsing without committing to a line first.",
};

const slug = slugFromPath();
const isAllView = slug === "all";
const collection = isAllView ? ALL_EYEWEAR : getCollection(slug);

document.title = collection ? `Maison Vellora — ${collection.name}` : "Maison Vellora — Collection Not Found";

const breadcrumbEl = document.querySelector("#breadcrumb");
const eyebrowEl = document.querySelector("#collection-eyebrow");
const titleEl = document.querySelector("#collection-title");
const descEl = document.querySelector("#collection-desc");
const tabsEl = document.querySelector("#filter-tabs");
const flagshipEl = document.querySelector("#flagship-band");
const gridEl = document.querySelector("#product-grid");
const gridSectionEl = document.querySelector(".product-grid-section");

// Both collections share the same ink/charcoal surface — Atelier Noir doesn't run a
// multi-hue tone system — and are told apart only by their glow accent, the same
// distinction the home page's Collections tiles use: brass (warm/aviator) for
// Heritage, cream (cooler/contemporary) for Meridian.
const COLLECTION_TONE = {
  heritage: { accent: "var(--brass)" },
  meridian: { accent: "var(--cream)" },
};

if (!collection) {
  breadcrumbEl.innerHTML = `<a href="/index.html">Home</a>`;
  eyebrowEl.textContent = "Not Found";
  titleEl.textContent = "Collection Not Found";
  descEl.textContent = "That collection doesn't exist. Try one of the collections below.";
  tabsEl.remove();
  flagshipEl.remove();
  gridEl.innerHTML = COLLECTIONS.map(
    (c) => `<a class="product-card" href="/collections/${c.slug}/"><h3 class="product-name">${c.name}</h3></a>`,
  ).join("");
} else {
  breadcrumbEl.innerHTML = `<a href="/index.html">Home</a><span class="sep">/</span><span class="current">${collection.name}</span>`;
  eyebrowEl.textContent = collection.eyebrow;
  titleEl.textContent = collection.name;
  descEl.textContent = collection.description;

  const tone = COLLECTION_TONE[collection.slug] ?? COLLECTION_TONE.heritage;
  gridSectionEl.style.setProperty("--grid-accent", tone.accent);

  const products = isAllView ? PRODUCTS : getCollectionProducts(collection.slug);

  // Only offer a filter tab for a type that's actually represented here, and skip the
  // whole tab bar when every product is the same type — a filter that always returns
  // either everything or nothing is its own kind of dead UI.
  const presentTypes = new Set(products.map((p) => p.type));
  const TYPE_LABELS = { sunglasses: "Sunglasses", optical: "Opticals" };
  const FILTERS =
    presentTypes.size > 1
      ? [{ id: "all", label: "All" }, ...[...presentTypes].map((id) => ({ id, label: TYPE_LABELS[id] ?? id }))]
      : [];

  let activeFilter = "all";

  // Cycles secondary cards through three deliberately unequal sizes/vertical offsets —
  // a magazine layout, not a repeating grid unit.
  const SIZE_CYCLE = ["size-medium", "size-small", "size-large"];

  function flagshipHtml(product) {
    return `
      <div class="flagship-visual" style="background:${swatchGradient(product)}">
        <span class="flagship-type-tag">${product.type === "optical" ? "Optical" : "Sunglasses"}</span>
      </div>
      <div class="flagship-copy">
        <div class="eyebrow">The Flagship Piece</div>
        <h2 class="flagship-name">${product.name}</h2>
        <p class="flagship-desc">${product.description}</p>
        <p class="flagship-price">From ${formatPrice(product.price)}</p>
        <a class="text-link underlined" href="/products/${product.slug}/">View ${product.name} <span class="glyph">→</span></a>
      </div>`;
  }

  function cardHtml(product, sizeClass) {
    return `
      <a class="product-card ${sizeClass}" href="/products/${product.slug}/">
        <div class="product-swatch" style="background:${swatchGradient(product)}">
          <span class="product-type-tag">${product.type === "optical" ? "Optical" : "Sunglasses"}</span>
        </div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-desc">${product.description}</p>
        <span class="product-price">From ${formatPrice(product.price)}</span>
        <span class="text-link">View <span class="glyph">→</span></span>
      </a>`;
  }

  function renderGrid() {
    const filtered = activeFilter === "all" ? products : products.filter((p) => p.type === activeFilter);

    if (!filtered.length) {
      flagshipEl.style.display = "none";
      gridEl.innerHTML = `<div class="empty-state">No pieces in this category yet.</div>`;
      return;
    }

    const [flagship, ...rest] = filtered;

    flagshipEl.style.display = "";
    flagshipEl.style.setProperty("--flagship-accent", tone.accent);
    flagshipEl.innerHTML = flagshipHtml(flagship);
    gsap.from(flagshipEl.querySelector(".flagship-copy"), {
      opacity: 0,
      y: 24,
      duration: DUR.revealLg,
      ease: EASE.entrance,
    });

    // A collection with only one product (its flagship) has nothing left for the
    // editorial grid — hide the whole section rather than leaving an empty padded gap
    // below the flagship band.
    if (!rest.length) {
      gridSectionEl.style.display = "none";
      return;
    }

    gridSectionEl.style.display = "";
    gridEl.innerHTML = rest.map((product, i) => cardHtml(product, SIZE_CYCLE[i % SIZE_CYCLE.length])).join("");

    gsap.from(gridEl.querySelectorAll(".product-card"), {
      opacity: 0,
      y: 30,
      stagger: 0.06,
      duration: DUR.reveal,
      ease: EASE.entrance,
    });
  }

  if (!FILTERS.length) {
    tabsEl.style.display = "none";
  } else {
    tabsEl.innerHTML = FILTERS.map(
      (f) => `<button type="button" class="filter-tab${f.id === activeFilter ? " active" : ""}" data-filter="${f.id}">${f.label}</button>`,
    ).join("");

    tabsEl.querySelectorAll(".filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.filter;
        tabsEl.querySelectorAll(".filter-tab").forEach((b) => b.classList.toggle("active", b === btn));
        renderGrid();
      });
    });
  }

  renderGrid();
}

gsap.from("#collection-title", { opacity: 0, y: 18, duration: DUR.revealLg, ease: EASE.entrance, delay: 0.1 });
gsap.from("#collection-desc", { opacity: 0, y: 14, duration: DUR.reveal, ease: EASE.entrance, delay: 0.25 });
gsap.to("#filter-tabs", { opacity: 1, duration: DUR.reveal, ease: EASE.entrance, delay: 0.35 });
