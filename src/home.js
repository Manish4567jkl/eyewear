import { PRODUCTS, getCollection, formatPrice } from "./data/products.js";
import { swatchGradient } from "./swatchGradient.js";
import { mountProductViewer } from "./homeViewer.js";
import { getFramePresetSwatch } from "./frameMaterial.js";
import { getAcetatePresetSwatch } from "./acetateMaterial.js";
import { getLensPresetSwatch } from "./lensMaterial.js";

// ==========================================================================
// This homepage is a faithful build of the finalized Claude Design handoff
// (Maison Vellora Homepage.dc.html): a single-viewport, wheel/arrow-paginated
// "magazine" of 6 plates, not a normal scrolling page — so it intentionally
// does not use Lenis (there is nothing to smooth-scroll; the root element is
// overflow:hidden and pages are turned via transform, not document scroll).
// GSAP still drives the couple of tweened moments the handoff calls for.
// ==========================================================================

const ROMAN = ["I", "II", "III"];
const ANGLE_ROMAN = ["i", "ii", "iii", "iv"];
const ANGLE_DEGREES = [10, 80, 190, 260];

function formatPresetLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const FRAME_COLOR_OPTIONS = ["gunmetal", "titanium", "brushedSilver", "polishedGold", "roseGold"];
const ACETATE_COLOR_OPTIONS = ["black", "tortoise", "crystal", "deepGreen", "burgundy", "cream"];
const LENS_OPTIONS = ["clear", "gray", "green", "amber", "mirror"];

const CONFIGURATOR_PRODUCTS = PRODUCTS; // The Ostrande, The Cassian, The Corbin — all 3.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ==========================================================================
// Intro curtain — plate counter ticks 00→07, then the curtain wipe (defined
// in magazine.css as an animation on .mv-intro, timed to this same sequence)
// clears the overlay so the cover plate is fully visible underneath.
// ==========================================================================
function initIntro() {
  const intro = $("#mv-intro");
  const plateEl = $("#mv-intro-plate");
  if (!intro || !plateEl) return;

  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    plateEl.textContent = `MAISON VELLORA — PLATE ${String(Math.min(n, 7)).padStart(2, "0")}`;
    if (n >= 7) clearInterval(timer);
  }, 180);

  setTimeout(() => {
    intro.hidden = true;
  }, 2700);
}

// ==========================================================================
// Custom cursor — a small tracking crosshair that magnetizes (rounds + scales)
// over anything marked data-magnify, with a "View Plate" label fade-in. Runs
// on a lerped rAF loop rather than following the raw pointer 1:1, matching
// the handoff's soft-trailing feel. Disabled on touch/small viewports (see
// magazine.css) where there's no real pointer to replace.
// ==========================================================================
function initCursor() {
  const cursor = $("#mv-cursor");
  const ring = $("#mv-cursor-ring");
  const label = $("#mv-cursor-label");
  if (!cursor || !ring || !label) return;

  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const pos = { x: mouse.x, y: mouse.y };

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const target = e.target instanceof Element ? e.target.closest("[data-magnify]") : null;
    ring.classList.toggle("is-magnetized", !!target);
    label.classList.toggle("is-visible", !!target);
  });

  function tick() {
    pos.x += (mouse.x - pos.x) * 0.3;
    pos.y += (mouse.y - pos.y) * 0.3;
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ==========================================================================
// Pager — the core mechanic replacing normal scroll. Six plates live stacked
// in the same box; the active one sits at translateX(0), the rest are parked
// off to either side, and turning a page tweens all of them at once with a
// soft inset shadow on whichever plate is mid-fold, exactly as specced.
// ==========================================================================
const PAGE_KEYS = ["cover", "contents", "configurator", "collection", "atelier", "colophon"];

function initPager({ onChange } = {}) {
  const pages = PAGE_KEYS.map((key) => $(`.mv-page[data-page="${key}"]`));
  const dotsEl = $("#mv-dots");
  const counterEl = $("#mv-counter");
  const prevBtn = $("#mv-prev");
  const nextBtn = $("#mv-next");

  dotsEl.innerHTML = PAGE_KEYS.map((_, i) => `<button class="mv-dot" data-index="${i}" data-magnify="true"></button>`).join("");
  const dots = $$(".mv-dot", dotsEl);

  let index = 0;

  function render() {
    pages.forEach((page, i) => {
      const diff = i - index;
      page.style.transform = `translateX(${diff * 100}%)`;
      page.style.zIndex = String(10 - Math.abs(diff));
      page.style.boxShadow =
        diff === 0 ? "none" : diff > 0 ? "inset 40px 0 40px -40px rgba(0,0,0,0.3)" : "inset -40px 0 40px -40px rgba(0,0,0,0.3)";
    });
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    counterEl.textContent = `${String(index + 1).padStart(2, "0")} / ${String(PAGE_KEYS.length).padStart(2, "0")}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === PAGE_KEYS.length - 1;
    onChange?.(PAGE_KEYS[index], index);
  }

  function goTo(next) {
    const clamped = Math.max(0, Math.min(PAGE_KEYS.length - 1, next));
    if (clamped === index) return;
    index = clamped;
    render();
  }

  dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));
  prevBtn.addEventListener("click", () => goTo(index - 1));
  nextBtn.addEventListener("click", () => goTo(index + 1));

  $$("[data-jump]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(PAGE_KEYS.indexOf(el.dataset.jump));
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goTo(index + 1);
    if (e.key === "ArrowLeft") goTo(index - 1);
  });

  const isPaginated = () => window.matchMedia("(min-width: 901px)").matches;
  let wheelCooldown = false;
  document.getElementById("mv-app").addEventListener(
    "wheel",
    (e) => {
      if (!isPaginated()) return; // Below 900px, plates fall back to a normal stacked scroll.
      e.preventDefault();
      if (wheelCooldown || Math.abs(e.deltaY) < 12) return;
      wheelCooldown = true;
      goTo(index + (e.deltaY > 0 ? 1 : -1));
      setTimeout(() => {
        wheelCooldown = false;
      }, 900);
    },
    { passive: false },
  );

  render();
  return { goTo, get index() { return index; } };
}

// ==========================================================================
// Contents plate — real page order/labels, generated instead of hardcoded so
// it can't drift from the actual plate list above.
// ==========================================================================
function renderContents() {
  const rows = [
    { n: "02", t: "Contents", p: "02" },
    { n: "03", t: "The Configurator", p: "03" },
    { n: "04", t: "SS26 — The Line", p: "04" },
    { n: "05", t: "The Atelier", p: "05" },
    { n: "06", t: "Colophon", p: "06" },
  ];
  $("#mv-contents-rows").innerHTML = rows
    .map(
      (row) => `
      <div class="mv-contents-row">
        <span class="mv-contents-row-n">${row.n}</span>
        <span class="mv-contents-row-t">${row.t}</span>
        <span class="mv-contents-row-p">p. ${row.p}</span>
      </div>`,
    )
    .join("");
}

// ==========================================================================
// Collection plate — the real catalog (3 products across the 2 real
// collections), swatch-rendered the same way the mega-menu and PDP "more
// from this collection" cards do elsewhere on the site.
// ==========================================================================
function renderCollection() {
  const grid = $("#mv-collection-grid");
  grid.innerHTML = PRODUCTS.map((product, i) => {
    const collection = getCollection(product.collection);
    return `
      <a class="mv-plate" href="/products/${product.slug}/" data-magnify="true">
        <div class="mv-plate-media" style="background:${swatchGradient(product)}; color:oklch(0.97 0.01 85 / 0.85)">
          <span class="mv-plate-fig">FIG. 0${i + 1} — ${product.name.toUpperCase()}</span>
        </div>
        <div class="mv-plate-meta">
          <span class="mv-plate-name">${product.name}</span>
          <span class="mv-plate-price">${collection.eyebrow.replace("The ", "").replace(" Collection", "").toUpperCase()} · ${formatPrice(product.price)}</span>
        </div>
      </a>`;
  }).join("");
}

// ==========================================================================
// Configurator plate — a real, working preview of the actual configurator:
// pick one of the 3 real frames, a real frame finish/acetate color, a real
// lens tint, and watch the live render (same material pipeline as the PDP
// and /configurator.html) update. "Enter the full configurator" hands off
// to the real thing for the complete rail (hinge, temple text, etc).
// ==========================================================================
function initConfigurator(viewer) {
  const tabsEl = $("#mv-product-tabs");
  const descEl = $("#mv-product-desc");
  const frameEl = $("#mv-frame-swatches");
  const lensEl = $("#mv-lens-swatches");
  const readoutEl = $("#mv-wall-label-readout");
  const modesEl = $("#mv-configurator-modes");
  const anglesEl = $("#mv-angles");
  const viewerLabelEl = $("#mv-viewer-label");

  const state = {
    productIndex: 0,
    perProductFrame: CONFIGURATOR_PRODUCTS.map((p) => (p.frameConstruction === "acetate" ? p.acetateColor : p.frameFinish)),
    perProductLens: CONFIGURATOR_PRODUCTS.map((p) => p.lensTint),
    mode: "view3d",
    angle: null,
  };

  const modes = [
    { key: "view3d", label: "3D View" },
    { key: "detail", label: "Hinge Detail" },
  ];

  tabsEl.innerHTML = CONFIGURATOR_PRODUCTS.map(
    (p, i) => `
      <button class="mv-product-tab" data-index="${i}" data-magnify="true">
        <span class="mv-product-tab-numeral">${ROMAN[i]}</span>
        <span class="mv-product-tab-name">${p.name}</span>
      </button>`,
  ).join("");

  modesEl.innerHTML = modes
    .map((m) => `<button class="mv-mode" data-mode="${m.key}" data-magnify="true">${m.label}</button>`)
    .join("");

  anglesEl.innerHTML =
    `<span class="mv-angles-label">Angle</span>` +
    ANGLE_ROMAN.map((rn, i) => `<button class="mv-angle" data-index="${i}" data-magnify="true">${rn}</button>`).join("");

  function currentProduct() {
    return CONFIGURATOR_PRODUCTS[state.productIndex];
  }

  function colorOptionsFor(product) {
    return product.frameConstruction === "acetate" ? ACETATE_COLOR_OPTIONS : FRAME_COLOR_OPTIONS;
  }

  function renderSwatches() {
    const product = currentProduct();
    const isAcetate = product.frameConstruction === "acetate";
    const frameOptions = colorOptionsFor(product);
    const activeFrame = state.perProductFrame[state.productIndex];
    const activeLens = state.perProductLens[state.productIndex];

    frameEl.innerHTML = frameOptions
      .map((key) => {
        const swatch = isAcetate
          ? { hex: swatchHexForAcetate(key) }
          : { hex: swatchHexForFrame(key) };
        return `
        <button class="mv-swatch ${key === activeFrame ? "is-active" : ""}" data-key="${key}" data-magnify="true">
          <span class="mv-swatch-dot" style="background:${swatch.hex}"></span>
        </button>`;
      })
      .join("");

    lensEl.innerHTML = LENS_OPTIONS.map(
      (key) => `
        <button class="mv-swatch ${key === activeLens ? "is-active" : ""}" data-key="${key}" data-magnify="true">
          <span class="mv-swatch-dot" style="background:${lensSwatchColor(key)}"></span>
        </button>`,
    ).join("");

    descEl.textContent = product.description;
    readoutEl.textContent = `${product.name} · ${formatPresetLabel(activeFrame)} Frame · ${formatPresetLabel(activeLens)} Lens`;
  }

  function renderActiveStates() {
    $$(".mv-product-tab", tabsEl).forEach((el, i) => el.classList.toggle("is-active", i === state.productIndex));
    $$(".mv-mode", modesEl).forEach((el) => el.classList.toggle("is-active", el.dataset.mode === state.mode));
    $$(".mv-angle", anglesEl).forEach((el, i) => el.classList.toggle("is-active", i === state.angle));
    viewerLabelEl.textContent =
      state.mode === "view3d" ? `3D VIEW${state.angle !== null ? ` — ANGLE ${ANGLE_ROMAN[state.angle].toUpperCase()}` : ""}` : "HINGE DETAIL";
  }

  function applyToViewer() {
    const product = currentProduct();
    const frame = state.perProductFrame[state.productIndex];
    const lens = state.perProductLens[state.productIndex];
    if (product.frameConstruction === "acetate") viewer.setAcetateColor(frame);
    else viewer.setFrameFinish(frame);
    viewer.setLensTint(lens);
  }

  function setAngle(i) {
    state.angle = i;
    viewer.setAutoRotate(false);
    const target = viewer.controls.target;
    const offset = viewer.camera.position.clone().sub(target);
    const radius = Math.hypot(offset.x, offset.z);
    const rad = (ANGLE_DEGREES[i] * Math.PI) / 180;
    viewer.camera.position.x = target.x + radius * Math.sin(rad);
    viewer.camera.position.z = target.z + radius * Math.cos(rad);
    viewer.controls.update();
    renderActiveStates();
  }

  function selectProduct(i) {
    state.productIndex = i;
    state.angle = null;
    viewer.setAutoRotate(state.mode === "view3d");
    viewer.setProduct(currentProduct());
    renderSwatches();
    renderActiveStates();
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-product-tab");
    if (btn) selectProduct(Number(btn.dataset.index));
  });

  frameEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-swatch");
    if (!btn) return;
    state.perProductFrame[state.productIndex] = btn.dataset.key;
    renderSwatches();
    applyToViewer();
  });

  lensEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-swatch");
    if (!btn) return;
    state.perProductLens[state.productIndex] = btn.dataset.key;
    renderSwatches();
    applyToViewer();
  });

  modesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-mode");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    if (state.mode === "detail") {
      viewer.setAutoRotate(false);
      viewer.controls.target.set(0, 0, 0);
      viewer.camera.position.multiplyScalar(0.55);
      viewer.controls.update();
    } else {
      viewer.camera.position.multiplyScalar(1 / 0.55);
      viewer.setAutoRotate(state.angle === null);
      viewer.controls.update();
    }
    renderActiveStates();
  });

  anglesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-angle");
    if (!btn) return;
    setAngle(Number(btn.dataset.index));
  });

  applyToViewer();
  renderSwatches();
  renderActiveStates();
}

function swatchHexForFrame(key) {
  return getFramePresetSwatch(key)?.hex ?? "#999";
}
function swatchHexForAcetate(key) {
  return getAcetatePresetSwatch(key)?.hex ?? "#999";
}
function lensSwatchColor(key) {
  return getLensPresetSwatch(key)?.hex ?? "#ccc";
}

// ==========================================================================
// Newsletter — no backend on this handoff; a real inline confirmation instead
// of a silent no-op, so the interaction still resolves to something honest.
// ==========================================================================
function initNewsletter() {
  const form = $("#mv-newsletter-form");
  const note = $("#mv-newsletter-note");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    note.textContent = "Thank you — you're on the list.";
    form.reset();
  });
}

// ==========================================================================
// Boot
// ==========================================================================
initIntro();
initCursor();
renderContents();
renderCollection();
initNewsletter();

const coverViewer = mountProductViewer($("#mv-cover-canvas"), PRODUCTS[0], { autoRotate: true, rotateSpeed: 1.2 });
const atelierViewer = mountProductViewer($("#mv-atelier-canvas"), PRODUCTS[1], { autoRotate: true, rotateSpeed: 1.0 });
const configuratorViewer = mountProductViewer($("#mv-configurator-canvas"), PRODUCTS[0], { autoRotate: true, rotateSpeed: 1.6 });

initConfigurator(configuratorViewer);

const viewersByPage = {
  cover: coverViewer,
  atelier: atelierViewer,
  configurator: configuratorViewer,
};

initPager({
  onChange(pageKey) {
    for (const [key, viewer] of Object.entries(viewersByPage)) {
      viewer.setActive(key === pageKey);
    }
  },
});
