import { gsap, SplitText, crossfadeText, EASE, DUR } from "./motion.js";
import { PRODUCTS, getCollection, formatPrice } from "./data/products.js";
import { swatchGradient } from "./swatchGradient.js";
import { mountProductViewer } from "./homeViewer.js";
import { navigateWithLoadingTransition } from "./loadingTransition.js";
import { initPageTransitionLinks, consumeStoredDirection } from "./pageTransition.js";

// ==========================================================================
// This homepage is a faithful build of the finalized Claude Design handoff
// (Thorne & Vale Homepage.dc.html): a single-viewport, wheel/arrow-paginated
// "magazine" of 9 plates, not a normal scrolling page — so it intentionally
// does not use Lenis (there is nothing to smooth-scroll; the root element is
// overflow:hidden and pages are turned via transform, not document scroll).
// GSAP still drives the couple of tweened moments the handoff calls for.
// ==========================================================================

const ANGLE_ROMAN = ["i", "ii", "iii", "iv"];
const ANGLE_DEGREES = [10, 80, 190, 260];

// The configurator plate reproduces the finalized mockup's own room/color/tint
// taxonomy verbatim (Studio/Archive/Table — a viewing context, not a product picker;
// every room configures the same frame). Each named color/tint carries the real
// material/lens preset it renders as (see frameMaterial.js/lensMaterial.js) — the
// nearest real equivalent to the mockup's arbitrary flat color, since those exact
// hues don't exist as shader presets.
const CONFIGURATOR_MODEL_PRODUCT = PRODUCTS.find((p) => p.slug === "the-ostrande");

const ROOMS = [
  {
    numeral: "I",
    name: "Studio",
    desc: "Cool neutrals, shot on seamless.",
    colors: [
      { name: "Graphite", hex: "#2e3236", preset: "gunmetal" },
      { name: "Bone", hex: "#e7e3db", preset: "titanium" },
      { name: "Steel", hex: "#8b9299", preset: "brushedSilver" },
    ],
    tints: [
      { name: "Clear", hex: "#dfe9f0", preset: "clear" },
      { name: "Smoke", hex: "#4c545c", preset: "gray" },
      { name: "Ash", hex: "#9aa4ac", preset: "gradientSmoke" },
    ],
  },
  {
    numeral: "II",
    name: "Archive",
    desc: "Muted tones, archival paper backdrop.",
    colors: [
      { name: "Charcoal", hex: "#26282b", preset: "matteBlack" },
      { name: "Pearl", hex: "#efeee9", preset: "titanium" },
      { name: "Slate", hex: "#7e8891", preset: "brushedSilver" },
    ],
    tints: [
      { name: "Clear", hex: "#dfe9f0", preset: "clear" },
      { name: "Graphite", hex: "#565f66", preset: "gray" },
      { name: "Fog", hex: "#c7cdd2", preset: "blue" },
    ],
  },
  {
    numeral: "III",
    name: "Table",
    desc: "Flat-lay light, one accent of moss.",
    colors: [
      { name: "Ink", hex: "#1c1e21", preset: "matteBlack" },
      { name: "Chalk", hex: "#e3e1da", preset: "titanium" },
      { name: "Moss", hex: "#5c6b4f", preset: "gunmetal" },
    ],
    tints: [
      { name: "Clear", hex: "#dfe9f0", preset: "clear" },
      { name: "Smoke", hex: "#4c545c", preset: "gray" },
      { name: "Sage", hex: "#7c9070", preset: "green" },
    ],
  },
];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Real material specs, ported from each product's own spec sheet (see products.js)
// rather than invented figures — the materials plate is a summary of what's already
// true elsewhere on the site.
const MATERIAL_ROWS = [
  { name: "Grade 5 Titanium", weight: "3.4g / temple", origin: "Sabae, Japan", finish: "Hand-polished" },
  { name: "Italian Acetate", weight: "11g / front", origin: "Cadore, Italy", finish: "Hand-cut" },
  { name: "Gunmetal Hinge", weight: "1.6g / hinge", origin: "Bologna, Italy", finish: "Micro-blasted" },
  { name: "Mineral Glass", weight: "2.2g / lens", origin: "Suzhou, China", finish: "Hand-ground" },
];

// The three real products stand in for the mockup's fictional "rooms" of wearer —
// each dossier recommends the actual frame that fits its stated use case.
const WEARER_DATA = [
  {
    numeral: "I",
    figLabel: "A",
    name: "The Night Editor",
    quote: "I read galleys until my eyes give up. These don't.",
    bio: "Closes the proof at 2am, six nights a week. Needs glare cut without color shift under a desk lamp.",
    rec: "THE CASSIAN · GRAY TINT",
    figCaption: "DESK LAMP, 2AM",
    no: "01",
    // See the `studyHref` note on The Flâneur below — same mechanism.
    studyHref: "/night-editor.html",
    studyLabel: "Reading Study",
  },
  {
    numeral: "II",
    figLabel: "B",
    name: "The Flâneur",
    quote: "Built for the walk, not the desk.",
    bio: "Three hours on foot before lunch, rain or otherwise. Wants weight she forgets she's wearing.",
    rec: "THE OSTRANDE · TITANIUM",
    figCaption: "ON FOOT, RAIN",
    no: "04",
    // Dossiers with a real destination beyond this tab carry a studyHref — see
    // initWearer(), which is what makes the placeholder image clickable only for
    // entries that have one.
    studyHref: "/flaneur.html",
    studyLabel: "Movement Study",
  },
  {
    numeral: "III",
    figLabel: "C",
    name: "The Contrarian",
    quote: "If I'm going to stand out, I'll do it on purpose.",
    bio: "One bold frame, worn everywhere, on everything. Gold hardware is the point, not an accident.",
    rec: "THE CORBIN · GREEN TINT",
    figCaption: "SHARP EDGE, GOLD",
    no: "09",
    studyHref: "/contrarian.html",
    studyLabel: "Selected Takes",
  },
];

const TENETS_DATA = [
  { text: "Design the hinge before the logo.", gloss: "Structure earns the signature, not the other way round." },
  { text: "If it needs a manual, it's not finished.", gloss: "A frame should explain itself in one glance." },
  { text: "One color says more than five.", gloss: "Restraint is a design decision, not a limitation." },
  { text: "Comfort is not a compromise.", gloss: "Nobody wears the beautiful pair that hurts by hour three." },
  { text: "We test in daylight, not renders.", gloss: "A render has never once caught a bad hinge." },
  {
    text: "The frame should disappear. You shouldn't.",
    gloss: "The best compliment is the one about your face, not your glasses.",
  },
];

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
    plateEl.textContent = `THORNE & VALE — PLATE ${String(Math.min(n, 7)).padStart(2, "0")}`;
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
const PAGE_KEYS = [
  "cover",
  "contents",
  "configurator",
  "collection",
  "atelier",
  "materials",
  "wearer",
  "manifesto",
  "colophon",
];

function initPager({ onChange } = {}) {
  const pages = PAGE_KEYS.map((key) => $(`.mv-page[data-page="${key}"]`));
  const dotsEl = $("#mv-dots");
  const counterEl = $("#mv-counter");
  const prevBtn = $("#mv-prev");
  const nextBtn = $("#mv-next");

  dotsEl.innerHTML = PAGE_KEYS.map((_, i) => `<button class="mv-dot" data-index="${i}" data-magnify="true"></button>`).join("");
  const dots = $$(".mv-dot", dotsEl);

  let index = 0;
  let previousIndex = 0;

  // The counter/dots/crosshair are chrome that lives outside .mv-pages entirely —
  // already persistent across a page turn with zero extra work. What was missing was
  // giving the turn itself real, directional motion: the leaving plate eases OUT on the
  // page's exit curve, the arriving plate eases IN on its entrance curve, rather than
  // both ends of the turn sharing one symmetric CSS transition.
  function positionPlates(animate) {
    pages.forEach((page, i) => {
      const diff = i - index;
      page.style.zIndex = String(10 - Math.abs(diff));
      page.style.boxShadow =
        diff === 0 ? "none" : diff > 0 ? "inset 40px 0 40px -40px rgba(0,0,0,0.3)" : "inset -40px 0 40px -40px rgba(0,0,0,0.3)";

      // A page whose old AND new position are both outside the ±1 window that's ever
      // actually on screen (xPercent between -100 and 100) never crosses the viewport
      // during this turn — snapping it instantly instead of tweening it means a
      // single-step wheel/arrow turn only animates the ~2-3 plates the visitor can
      // actually see, not all nine full-viewport plates (most of them holding a live
      // Three.js canvas) every single time. A multi-page jump from clicking a dot
      // further down the list still sweeps visibly through the plates in between, so
      // those stay tweened.
      const prevDiff = i - previousIndex;
      const staysOffscreen = Math.abs(diff) >= 2 && Math.abs(prevDiff) >= 2;

      if (!animate || staysOffscreen) {
        gsap.set(page, { xPercent: diff * 100 });
        return;
      }
      const isLeaving = i === previousIndex;
      gsap.to(page, {
        xPercent: diff * 100,
        duration: isLeaving ? 0.85 : 1.05,
        ease: isLeaving ? EASE.exit : EASE.entrance,
        overwrite: "auto",
      });
    });
  }

  // A quick scale-pulse on the crosshair ring at the instant of a page turn — the
  // "leading" cue for this same-document nav, standing in for the "clicked element
  // pops forward" treatment used on real cross-document link clicks.
  function pulseCursor() {
    const ring = $("#mv-cursor-ring");
    if (!ring) return;
    gsap.fromTo(ring, { scale: 1 }, { scale: 1.35, duration: 0.15, ease: EASE.hoverIn, yoyo: true, repeat: 1 });
  }

  function render(animate = true) {
    positionPlates(animate);
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    counterEl.textContent = `${String(index + 1).padStart(2, "0")} / ${String(PAGE_KEYS.length).padStart(2, "0")}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === PAGE_KEYS.length - 1;
    if (animate) {
      // Let the wipe read as leading the motion — content reveal follows a beat behind
      // rather than racing it flush.
      gsap.delayedCall(0.15, () => onChange?.(PAGE_KEYS[index], index));
    } else {
      onChange?.(PAGE_KEYS[index], index);
    }
    previousIndex = index;
  }

  // Guards every entry point (dots, prev/next, arrow keys, data-jump links) against
  // firing mid-turn — without it, a rapid double-click/keypress retriggers goTo()
  // before the current tween finishes, and GSAP's overwrite:"auto" cuts the plate off
  // mid-flight to chase the new target. That interruption is what read as the turn
  // "not working" — it wasn't ignoring the input, it was restarting on top of itself.
  let isTransitioning = false;

  function goTo(next) {
    const clamped = Math.max(0, Math.min(PAGE_KEYS.length - 1, next));
    if (clamped === index || isTransitioning) return;
    index = clamped;
    isTransitioning = true;
    pulseCursor();
    render(true);
    setTimeout(() => {
      isTransitioning = false;
    }, 1100); // matches positionPlates' longest tween (1.05s) plus a small margin
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
      // Held at least as long as the turn's own longest tween (1.05s — see
      // positionPlates) so a fast wheel spin can't fire the next turn mid-animation
      // and cut the current one off; that overlap was part of what read as choppy.
      setTimeout(() => {
        wheelCooldown = false;
      }, 1150);
    },
    { passive: false },
  );

  render(false);
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
    { n: "06", t: "Materials", p: "06" },
    { n: "07", t: "The Wearer", p: "07" },
    { n: "08", t: "Manifesto", p: "08" },
    { n: "09", t: "Colophon", p: "09" },
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
  const total = String(PRODUCTS.length).padStart(2, "0");
  grid.innerHTML = PRODUCTS.map((product, i) => {
    const collection = getCollection(product.collection);
    return `
      <a class="mv-plate" href="/products/${product.slug}/" data-magnify="true" data-lead>
        <div class="mv-plate-media" style="background:${swatchGradient(product)}; color:oklch(0.97 0.01 85 / 0.85); view-transition-name: product-${product.slug}">
          <span class="mv-plate-counter">${String(i + 1).padStart(2, "0")} / ${total}</span>
          <span class="mv-plate-fig">FIG. 0${i + 1} — ${product.name.toUpperCase()}</span>
          <div class="mv-plate-meta">
            <span class="mv-plate-name" style="view-transition-name: product-name-${product.slug}">${product.name}</span>
            <span class="mv-plate-price">${collection.eyebrow.replace("The ", "").replace(" Collection", "").toUpperCase()} · ${formatPrice(product.price)}</span>
          </div>
        </div>
      </a>`;
  }).join("");
}

// ==========================================================================
// Materials plate — a static spec-sheet readout of the same four materials
// used across the real product specs (see MATERIAL_ROWS above), generated
// rather than hardcoded into the markup so it stays a single source of truth.
// ==========================================================================
function renderMaterials() {
  $("#mv-materials-rows").innerHTML = MATERIAL_ROWS.map(
    (row) => `
      <div class="mv-materials-row">
        <span class="mv-materials-row-name">${row.name}</span>
        <span class="mv-materials-row-meta">${row.weight}</span>
        <span class="mv-materials-row-meta">${row.origin}</span>
        <span class="mv-materials-row-meta is-right">${row.finish}</span>
      </div>`,
  ).join("");
}

// ==========================================================================
// The Wearer plate — three dossiers, one active at a time, matching the
// finalized mockup's tab-switcher interaction.
// ==========================================================================
function initWearer() {
  const tabsEl = $("#mv-wearer-tabs");
  const quoteEl = $("#mv-wearer-quote");
  const bioEl = $("#mv-wearer-bio");
  const recEl = $("#mv-wearer-rec");
  const imageEl = $("#mv-wearer-image");
  const captionEl = $("#mv-wearer-image-caption");
  const hintEl = $("#mv-wearer-image-hint");
  const noEl = $("#mv-wearer-no");

  let active = 0;

  tabsEl.innerHTML = WEARER_DATA.map(
    (w, i) => `
      <button class="mv-wearer-tab" data-index="${i}" data-magnify="true">
        <span class="mv-wearer-tab-numeral">${w.numeral}</span>
        <span class="mv-wearer-tab-name">${w.name}</span>
      </button>`,
  ).join("");
  const tabs = $$(".mv-wearer-tab", tabsEl);

  function render() {
    const dossier = WEARER_DATA[active];
    tabs.forEach((tab, i) => tab.classList.toggle("is-active", i === active));
    crossfadeText(quoteEl, `"${dossier.quote}"`);
    crossfadeText(bioEl, dossier.bio);
    recEl.textContent = `REC. — ${dossier.rec}`;
    captionEl.textContent = `FIG. 07${dossier.figLabel} — ${dossier.figCaption}`;
    noEl.textContent = `NO. ${dossier.no} / EDITION SS26`;

    // Only dossiers with a studyHref have a real destination behind their placeholder
    // image (Night Editor → its reading study, Flâneur → its movement-study map) —
    // every other dossier's card stays inert chrome.
    const explorable = Boolean(dossier.studyHref);
    imageEl.classList.toggle("is-explorable", explorable);
    imageEl.tabIndex = explorable ? 0 : -1;
    if (explorable) {
      imageEl.href = dossier.studyHref;
      hintEl.textContent = `${dossier.studyLabel} →`;
    }
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-wearer-tab");
    if (!btn) return;
    active = Number(btn.dataset.index);
    render();
  });

  render();
}

// ==========================================================================
// Manifesto plate — a prev/next tenet cycler, matching the finalized mockup.
// ==========================================================================
function initManifesto() {
  const textEl = $("#mv-manifesto-text");
  const glossEl = $("#mv-manifesto-gloss");
  const counterEl = $("#mv-manifesto-counter");
  const dotsEl = $("#mv-manifesto-dots");
  const prevBtn = $("#mv-manifesto-prev");
  const nextBtn = $("#mv-manifesto-next");

  let active = 0;

  dotsEl.innerHTML = TENETS_DATA.map((_, i) => `<button class="mv-manifesto-dot" data-index="${i}" data-magnify="true"></button>`).join("");
  const dots = $$(".mv-manifesto-dot", dotsEl);

  function render() {
    const tenet = TENETS_DATA[active];
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === active));
    counterEl.textContent = `TENET ${String(active + 1).padStart(2, "0")} / ${String(TENETS_DATA.length).padStart(2, "0")}`;
    crossfadeText(textEl, tenet.text);
    crossfadeText(glossEl, tenet.gloss);
  }

  function goTo(next) {
    active = (next + TENETS_DATA.length) % TENETS_DATA.length;
    render();
  }

  prevBtn.addEventListener("click", () => goTo(active - 1));
  nextBtn.addEventListener("click", () => goTo(active + 1));
  dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));

  render();
}

// ==========================================================================
// Configurator plate — Studio/Archive/Table, exactly as the finalized mockup
// specifies, with its static placeholder swapped for The Ostrande live-rendered via
// the site's real Three.js pipeline. "Enter the full configurator" hands off to the
// real thing for the complete rail (hinge, temple text, product choice, etc).
// ==========================================================================
function initConfigurator(viewer) {
  const tabsEl = $("#mv-room-tabs");
  const descEl = $("#mv-room-desc");
  const frameEl = $("#mv-frame-swatches");
  const lensEl = $("#mv-lens-swatches");
  const readoutEl = $("#mv-wall-label-readout");
  const modesEl = $("#mv-configurator-modes");
  const anglesEl = $("#mv-angles");
  const viewerLabelEl = $("#mv-viewer-label");

  const state = {
    activeRoom: 0,
    perRoomColor: ROOMS.map(() => 0),
    perRoomTint: ROOMS.map(() => 0),
    mode: "view3d",
    angle: null,
  };

  // "On Mannequin" and "Lens Detail" have no dedicated view built yet — each links out
  // to its own placeholder page instead of faking an in-place preview that doesn't exist.
  const modes = [
    { key: "view3d", label: "3D View" },
    { key: "mannequin", label: "On Mannequin", href: "/mannequin.html" },
    { key: "table", label: "Lens Detail", href: "/lens-detail.html" },
  ];

  tabsEl.innerHTML = ROOMS.map(
    (room, i) => `
      <button class="mv-room-tab" data-index="${i}" data-magnify="true">
        <span class="mv-room-tab-numeral">${room.numeral}.</span>
        <span class="mv-room-tab-name">${room.name}</span>
      </button>`,
  ).join("");

  modesEl.innerHTML = modes
    .map((m) =>
      m.href
        ? `<a class="mv-mode" data-mode="${m.key}" href="${m.href}" data-magnify="true">${m.label}</a>`
        : `<button class="mv-mode" data-mode="${m.key}" data-magnify="true">${m.label}</button>`,
    )
    .join("");

  anglesEl.innerHTML =
    `<span class="mv-angles-label">fig.</span>` +
    ANGLE_ROMAN.map((rn, i) => `<button class="mv-angle" data-index="${i}" data-magnify="true">${rn}</button>`).join("");

  function currentRoom() {
    return ROOMS[state.activeRoom];
  }

  // Rebuilds the swatch buttons — only needed when the room (and so its color/tint
  // option set) changes. A same-room pick just needs updateSwatchActiveStates() below,
  // so the ring/scale CSS transition on the existing dot actually gets to play.
  function buildSwatches() {
    const room = currentRoom();
    const activeColorIdx = state.perRoomColor[state.activeRoom];
    const activeTintIdx = state.perRoomTint[state.activeRoom];

    frameEl.innerHTML = room.colors
      .map(
        (c, i) => `
        <button class="mv-swatch ${i === activeColorIdx ? "is-active" : ""}" data-index="${i}" data-magnify="true">
          <span class="mv-swatch-dot" style="background:${c.hex}"></span>
        </button>`,
      )
      .join("");

    lensEl.innerHTML = room.tints
      .map(
        (t, i) => `
        <button class="mv-swatch mv-swatch--tint ${i === activeTintIdx ? "is-active" : ""}" data-index="${i}" data-magnify="true">
          <span class="mv-swatch-dot" style="background:${t.hex}"></span>
        </button>`,
      )
      .join("");

    crossfadeText(descEl, room.desc);
    updateReadout();
  }

  function updateSwatchActiveStates() {
    const activeColorIdx = state.perRoomColor[state.activeRoom];
    const activeTintIdx = state.perRoomTint[state.activeRoom];
    $$(".mv-swatch", frameEl).forEach((el, i) => el.classList.toggle("is-active", i === activeColorIdx));
    $$(".mv-swatch", lensEl).forEach((el, i) => el.classList.toggle("is-active", i === activeTintIdx));
    updateReadout();
  }

  function updateReadout() {
    const room = currentRoom();
    const color = room.colors[state.perRoomColor[state.activeRoom]];
    const tint = room.tints[state.perRoomTint[state.activeRoom]];
    crossfadeText(readoutEl, `${room.name} · ${color.name} Frame · ${tint.name} Lens`);
  }

  function renderActiveStates() {
    $$(".mv-room-tab", tabsEl).forEach((el, i) => el.classList.toggle("is-active", i === state.activeRoom));
    $$(".mv-mode", modesEl).forEach((el) => el.classList.toggle("is-active", el.dataset.mode === state.mode));
    // The mockup's default is angle "i", label "ANGLE I" — state.angle stays null (rather
    // than 0) until a user explicitly picks one, so the auto-rotate-resume checks elsewhere
    // can tell "never picked" from "picked the first one"; displayAngle just backfills that
    // default for the label/highlight without touching the rotation logic.
    const displayAngle = state.angle ?? 0;
    $$(".mv-angle", anglesEl).forEach((el, i) => el.classList.toggle("is-active", i === displayAngle));
    const label =
      state.mode === "view3d"
        ? `3D VIEW — ANGLE ${ANGLE_ROMAN[displayAngle].toUpperCase()}`
        : state.mode === "mannequin"
          ? "ON MANNEQUIN"
          : "LENS DETAIL — TABLE";
    crossfadeText(viewerLabelEl, label);
  }

  function applyToViewer() {
    const room = currentRoom();
    const color = room.colors[state.perRoomColor[state.activeRoom]];
    const tint = room.tints[state.perRoomTint[state.activeRoom]];
    viewer.setFrameFinish(color.preset);
    viewer.setLensTint(tint.preset);
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

  function selectRoom(i) {
    state.activeRoom = i;
    state.angle = null;
    viewer.setAutoRotate(state.mode === "view3d");
    buildSwatches();
    applyToViewer();
    renderActiveStates();
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-room-tab");
    if (btn) selectRoom(Number(btn.dataset.index));
  });

  frameEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-swatch");
    if (!btn) return;
    state.perRoomColor[state.activeRoom] = Number(btn.dataset.index);
    updateSwatchActiveStates();
    applyToViewer();
  });

  lensEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-swatch");
    if (!btn) return;
    state.perRoomTint[state.activeRoom] = Number(btn.dataset.index);
    updateSwatchActiveStates();
    applyToViewer();
  });

  modesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-mode");
    if (!btn) return;
    // Mannequin/Lens Detail are real links now (see `modes` above) — intercept just
    // long enough to play the loading transition before handing off to the real
    // navigation, rather than running the in-place preview switch below.
    if (btn.tagName === "A") {
      e.preventDefault();
      navigateWithLoadingTransition(btn.getAttribute("href"), { palette: "light", plateNumber: "03", leadEl: btn });
      return;
    }
    const nextMode = btn.dataset.mode;
    const wasDetail = state.mode === "table";
    const isDetail = nextMode === "table";
    state.mode = nextMode;

    if (isDetail && !wasDetail) {
      viewer.setAutoRotate(false);
      viewer.controls.target.set(0, 0, 0);
      viewer.camera.position.multiplyScalar(0.55);
      viewer.controls.update();
    } else if (!isDetail && wasDetail) {
      viewer.camera.position.multiplyScalar(1 / 0.55);
      viewer.controls.update();
    }
    viewer.setAutoRotate(nextMode === "view3d" && state.angle === null);
    renderActiveStates();
  });

  anglesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mv-angle");
    if (!btn) return;
    setAngle(Number(btn.dataset.index));
  });

  // The "View Plate" crosshair CTA (see initCursor) hovers this same viewer — clicking
  // it hands off to the real product page it's previewing. Gated on movement since
  // mousedown so it doesn't fire mid-orbit-drag (the viewer's OrbitControls already
  // owns drag-to-rotate).
  const viewerEl = $("#mv-viewer");
  let viewerPointerDown = null;
  viewerEl.addEventListener("pointerdown", (e) => {
    viewerPointerDown = { x: e.clientX, y: e.clientY };
  });
  viewerEl.addEventListener("click", (e) => {
    const start = viewerPointerDown;
    viewerPointerDown = null;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
    navigateWithLoadingTransition(`/products/${CONFIGURATOR_MODEL_PRODUCT.slug}/`, {
      palette: "dark",
      plateNumber: "03",
      leadEl: viewerEl,
    });
  });

  // "Enter the full configurator →" hands off to a different page's own 3D scene —
  // same treatment as the crosshair CTA above and the mannequin/lens-detail modes.
  const enterConfiguratorEl = $(".mv-wall-label-cta");
  enterConfiguratorEl?.addEventListener("click", (e) => {
    e.preventDefault();
    navigateWithLoadingTransition(enterConfiguratorEl.getAttribute("href"), {
      palette: "light",
      plateNumber: "03",
      leadEl: enterConfiguratorEl,
    });
  });

  applyToViewer();
  buildSwatches();
  renderActiveStates();
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
// Per-plate entrance choreography — each page turn is a discrete event (not a
// continuous scroll), so rather than a flat crossfade, the newly active plate's own
// key elements reset and reveal every time it comes forward: split-text stagger for
// the cover headline, a clip-path wipe for its plate photo, a light stagger for the
// configurator rail and collection grid, a scale-pop for the atelier's stat. Contents
// and Colophon are left to a plain fade — restraint matters as much as motion here.
// ==========================================================================
let coverTitleSplit = null;

function animatePlateEntrance(pageKey) {
  if (pageKey === "cover") {
    // Only the very first play of this plate (landing here from a real cross-document
    // navigation — brand logo, breadcrumb, Close Plate) should read the one-shot
    // direction flag; later in-session visits back to this plate via the pager just
    // get the default forward entrance, since consumeStoredDirection() clears the flag
    // on first read.
    const dir = consumeStoredDirection();
    const xOff = dir === "back" ? -14 : 14;

    const titleEl = $(".mv-cover-title");
    if (!coverTitleSplit) coverTitleSplit = SplitText.create(titleEl, { type: "chars" });
    gsap.set(titleEl, { opacity: 1 });
    gsap.set(coverTitleSplit.chars, { yPercent: 130, opacity: 0 });
    gsap.set(".mv-cover-plate", { clipPath: "inset(0 0 100% 0)" });
    gsap.set(".mv-cover-issue, .mv-cover-sub", { opacity: 0, y: 12, x: xOff });

    gsap
      .timeline()
      .to(".mv-cover-issue", { opacity: 0.7, y: 0, x: 0, duration: DUR.reveal, ease: EASE.entrance })
      .to(coverTitleSplit.chars, { yPercent: 0, opacity: 1, duration: 0.6, ease: EASE.overshoot, stagger: 0.018 }, "-=0.25")
      .to(".mv-cover-sub", { opacity: 0.85, y: 0, x: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.35")
      .to(".mv-cover-plate", { clipPath: "inset(0 0 0% 0)", duration: 0.9, ease: EASE.entrance }, "-=0.55");
  } else if (pageKey === "configurator") {
    gsap.from([".mv-room-tabs", ".mv-room-desc", ".mv-swatch-cols", ".mv-mode-list", ".mv-angles", ".mv-wall-label"], {
      opacity: 0,
      y: 14,
      stagger: 0.06,
      duration: DUR.reveal,
      ease: EASE.entrance,
    });
    gsap.from(".mv-configurator-stage", { opacity: 0, scale: 0.97, duration: DUR.revealLg, ease: EASE.entrance });
  } else if (pageKey === "collection") {
    gsap.from(".mv-collection-grid .mv-plate", {
      opacity: 0,
      y: 20,
      stagger: 0.08,
      duration: DUR.reveal,
      ease: EASE.entrance,
    });
  } else if (pageKey === "atelier") {
    gsap.set(".mv-atelier-plate", { clipPath: "inset(0 100% 0 0)" });
    gsap.to(".mv-atelier-plate", { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: EASE.entrance });
    gsap.fromTo(
      ".mv-atelier-number",
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 0.55, ease: EASE.overshoot },
    );
    gsap.from([".mv-atelier-caption", ".mv-atelier-body"], {
      opacity: 0,
      y: 12,
      stagger: 0.06,
      duration: DUR.reveal,
      ease: EASE.entrance,
      delay: 0.15,
    });
  } else {
    gsap.from(".mv-page[data-page='" + pageKey + "'] > *", {
      opacity: 0,
      duration: DUR.reveal,
      ease: EASE.entrance,
    });
  }
}

// ==========================================================================
// Boot
// ==========================================================================
initIntro();
initCursor();
initPageTransitionLinks();
renderContents();
renderCollection();
renderMaterials();
initWearer();
initManifesto();
initNewsletter();

// The cover plate box is wider than the other viewers (1/1 vs. their tighter crops), which
// on its own just reveals more empty space around the same-sized frame — distanceScale
// pulls the camera in a bit to keep the product reading as appropriately sized in the
// extra width rather than looking small and lost in it.
const coverViewer = mountProductViewer($("#mv-cover-canvas"), PRODUCTS[0], {
  autoRotate: true,
  rotateSpeed: 1.2,
  distanceScale: 0.85,
});
const atelierViewer = mountProductViewer($("#mv-atelier-canvas"), PRODUCTS[1], { autoRotate: true, rotateSpeed: 1.0 });
const configuratorViewer = mountProductViewer($("#mv-configurator-canvas"), CONFIGURATOR_MODEL_PRODUCT, {
  autoRotate: true,
  rotateSpeed: 1.6,
});

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
    animatePlateEntrance(pageKey);
  },
});
