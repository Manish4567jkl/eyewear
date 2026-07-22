import { gsap, EASE, DUR } from "./motion.js";
import { initPageTransitionLinks, revealStage } from "./pageTransition.js";

// ==========================================================================
// The six waypoints of the Flâneur's day, ported from the illustrated map at
// /flaneurmap.webp (its own baked-in labels/times/observations are the source
// of truth for those fields). x/y are percentages of the map image, read off
// the artwork's stop markers by eye — good enough for a 34px hotspot target.
// The weather/duration/mood/artifact fields are the richer layer this page
// adds on top of what's drawn on the map itself.
// ==========================================================================
const WAYPOINTS = [
  {
    no: "01",
    time: "08:42",
    title: "Bookshop",
    x: 46.8,
    y: 14.5,
    text: "Found a book on Japanese design. Sat with it for twelve minutes before deciding to buy it.",
    weather: "Cool, clear",
    duration: "24 min",
    mood: "Curious",
    artifact: {
      type: "receipt",
      label: "Bookshop receipt",
      front: ["THE QUIET PAGE", "— — — — — — — — —", "Japanese Design,", "a survey", "1 × ¥2,400", "08:44 · CASH"],
      back: "Kept for the smell of new paper.",
    },
  },
  {
    no: "02",
    time: "09:17",
    title: "Coffee Shop",
    x: 37.0,
    y: 45.1,
    text: "Double espresso, taken standing at the counter. Sketched the room in the notebook margins.",
    weather: "Cool, clear",
    duration: "18 min",
    mood: "Awake",
    artifact: null,
  },
  {
    no: "03",
    time: "11:03",
    title: "Art Gallery",
    x: 51.9,
    y: 58.0,
    text: "A quiet room, almost empty. The light was perfect, so he stayed longer than planned.",
    weather: "Overcast",
    duration: "52 min",
    mood: "Absorbed",
    artifact: {
      type: "pass",
      label: "Exhibition pass",
      front: ["GALLERY IX", "SILENT ROOMS", "ADMIT ONE", "11:05"],
      back: "Room 3. Stood in front of the same canvas twice.",
    },
  },
  {
    no: "04",
    time: "15:22",
    title: "Old Bridge",
    x: 69.6,
    y: 25.2,
    text: "Watched the river for a long time. Thought, deliberately, about nothing at all.",
    weather: "Overcast, breezy",
    duration: "31 min",
    mood: "Still",
    artifact: {
      type: "photo",
      label: "Folded photograph",
      front: "A photo of the water, slightly overexposed.",
      back: "Written on the back: “the same river, apparently.”",
    },
  },
  {
    no: "05",
    time: "17:48",
    title: "Notes",
    x: 73.4,
    y: 57.6,
    text: "Rain started. Sat under an awning and wrote three lines before heading home.",
    weather: "Light rain",
    duration: "9 min",
    mood: "Reflective",
    artifact: {
      type: "note",
      label: "Handwritten note",
      front: "“Everything slower today. On purpose.”",
      back: "Torn from the same notebook as the bookshop sketch.",
    },
  },
  {
    no: "06",
    time: "19:03",
    title: "Home",
    x: 69.6,
    y: 81.1,
    text: "Tea, the unfinished book, and enough silence to hear the rain properly.",
    weather: "Rain, indoors",
    duration: "—",
    mood: "Unhurried",
    artifact: null,
  },
];

const $ = (sel, root = document) => root.querySelector(sel);

initPageTransitionLinks();
revealStage({
  eyebrow: ".fl-eyebrow",
  headline: ".fl-title",
  body: [".breadcrumb", ".fl-tagline"],
  media: "#fl-panel",
});

const hotspotsEl = $("#fl-hotspots");
const spotlightEl = $("#fl-spotlight");
const annotationEl = $("#fl-annotation");
const mapWrapEl = $("#fl-map-wrap");
const segments = Array.from(document.querySelectorAll(".fl-route-segment"));

let active = null; // index into WAYPOINTS, or null for the idle state

// ---------------------------------------------------------------------------
// Hotspots — one per waypoint, positioned by percentage so they track the map
// image at any width without needing a resize listener.
// ---------------------------------------------------------------------------
hotspotsEl.innerHTML = WAYPOINTS.map(
  (w, i) => `
    <button
      type="button"
      class="fl-hotspot"
      data-index="${i}"
      style="left:${w.x}%; top:${w.y}%; --fl-pulse-delay:${(i * 0.35).toFixed(2)}s"
      aria-label="${w.no} — ${w.title}, ${w.time}"
    >
      <span class="fl-hotspot-pulse"></span>
      <span class="fl-hotspot-ring"></span>
      <span class="fl-hotspot-dot"></span>
    </button>`,
).join("");

const hotspots = Array.from(document.querySelectorAll(".fl-hotspot"));

function renderIdleAnnotation() {
  annotationEl.innerHTML = `
    <div class="fl-annotation-idle">
      <span class="fl-annotation-idle-mark">✦</span>
      <p>Six stops. No fixed order —<br />choose a waypoint to begin.</p>
    </div>`;
}

function artifactMarkup(artifact) {
  if (!artifact) return "";
  const front = Array.isArray(artifact.front)
    ? artifact.front.map((line) => `<span>${line}</span>`).join("")
    : `<span>${artifact.front}</span>`;
  return `
    <button type="button" class="fl-artifact fl-artifact--${artifact.type}" aria-label="Inspect the ${artifact.label.toLowerCase()}">
      <span class="fl-artifact-inner">
        <span class="fl-artifact-face fl-artifact-front">${front}</span>
        <span class="fl-artifact-face fl-artifact-back"><span>${artifact.back}</span></span>
      </span>
    </button>
    <p class="fl-artifact-label">${artifact.label} — tap to flip</p>`;
}

function renderActiveAnnotation(index) {
  const w = WAYPOINTS[index];
  annotationEl.innerHTML = `
    <div class="fl-annotation-entry">
      <div class="fl-annotation-head">
        <span class="fl-annotation-index">${w.no} / ${String(WAYPOINTS.length).padStart(2, "0")}</span>
        <span class="fl-annotation-time">${w.time}</span>
      </div>
      <h3 class="fl-annotation-title">${w.title}</h3>
      <p class="fl-annotation-text">${w.text}</p>
      <dl class="fl-meta fl-annotation-chips">
        <div class="fl-meta-row"><dt>Weather</dt><dd>${w.weather}</dd></div>
        <div class="fl-meta-row"><dt>Duration</dt><dd>${w.duration}</dd></div>
        <div class="fl-meta-row"><dt>Mood</dt><dd>${w.mood}</dd></div>
      </dl>
      ${w.artifact ? `<div class="fl-artifact-slot">${artifactMarkup(w.artifact)}</div>` : ""}
      <button type="button" class="text-link underlined fl-annotation-close">
        <span class="glyph">←</span> Back to the map
      </button>
    </div>`;

  const artifactBtn = annotationEl.querySelector(".fl-artifact");
  artifactBtn?.addEventListener("click", () => artifactBtn.classList.toggle("is-flipped"));

  annotationEl.querySelector(".fl-annotation-close")?.addEventListener("click", () => setActive(null));
}

function crossfadeAnnotation(render) {
  gsap.to(annotationEl, {
    opacity: 0,
    y: 6,
    duration: DUR.snap,
    ease: EASE.hoverIn,
    onComplete: () => {
      render();
      gsap.fromTo(annotationEl, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: DUR.release, ease: EASE.hoverOut });
    },
  });
}

function setActive(index) {
  if (index === active) return;
  active = index;

  hotspots.forEach((el, i) => el.classList.toggle("is-active", i === index));

  segments.forEach((seg) => seg.classList.remove("is-highlighted"));
  if (index !== null) {
    segments[index - 1]?.classList.add("is-highlighted");
    segments[index]?.classList.add("is-highlighted");
  }

  if (index === null) {
    spotlightEl.style.opacity = "0";
  } else {
    const w = WAYPOINTS[index];
    spotlightEl.style.setProperty("--fl-sx", `${w.x}%`);
    spotlightEl.style.setProperty("--fl-sy", `${w.y}%`);
    spotlightEl.style.opacity = "1";
  }

  mapWrapEl.classList.add("has-interacted");
  crossfadeAnnotation(index === null ? renderIdleAnnotation : () => renderActiveAnnotation(index));
}

hotspots.forEach((el, i) => {
  el.addEventListener("mouseenter", () => setActive(i));
  el.addEventListener("focus", () => setActive(i));
  el.addEventListener("click", () => setActive(i));
});

mapWrapEl.addEventListener("mouseleave", () => {
  // Only the hover-driven state clears on mouse-out — a click (device without
  // hover, or a deliberate tap) should hold until something else is chosen.
  if (!matchMedia("(hover: hover)").matches) return;
  setActive(null);
});

renderIdleAnnotation();
