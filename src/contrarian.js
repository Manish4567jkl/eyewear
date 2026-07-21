import { initPageTransitionLinks, revealStage } from "./pageTransition.js";

// ==========================================================================
// Selected Takes — an archive box, not a screening. Every artifact here is
// process, never a finished frame: nothing in this data documents a film,
// only the making of one. See contrarian.css for the "scattered on a table"
// composition itself; this file only supplies data + the handful of real
// interactions (contact-sheet/notes inspector, script annotations, shot-list
// → contact-sheet highlight, the film strip's manual drag).
// ==========================================================================

// A rotation of faded, vintage-print color casts (hue + chroma, consumed by
// contrarian.css's oklch() gradients) — real polaroid stock drifts warm,
// green, rose, or blue depending on age and chemistry, never a neutral gray.
// Each placeholder gets a different one off this list rather than all of
// them sharing one hue-rotated gray-brown gradient. Chroma stays low on
// purpose — a faded print is barely tinted, not a saturated color block;
// anything much above this reads as glossy packaging, not old film stock.
const POLAROID_TONES = [
  { h: 55, c: 0.028 }, // warm amber
  { h: 195, c: 0.02 }, // faded teal
  { h: 20, c: 0.026 }, // dusty rose
  { h: 145, c: 0.016 }, // sage
  { h: 38, c: 0.032 }, // sepia
  { h: 250, c: 0.017 }, // cool slate
  { h: 95, c: 0.024 }, // olive/mustard
  { h: 300, c: 0.018 }, // faded lavender
];

function toneStyle(i, driftSeed = i * 37) {
  const t = POLAROID_TONES[i % POLAROID_TONES.length];
  return `--co-tone:${driftSeed % 100}; --co-hue:${t.h}; --co-chroma:${t.c}`;
}

const CONTACT_FRAMES = [
  { no: "01", caption: "Rehearsal, take two", detail: "Blocking only — no camera rolling yet. Marks taped to the floor, still visible in the bottom of frame." },
  { no: "02", caption: "Camera setup, dolly track", detail: "Track laid for the push-in on Sc. 14. Twenty minutes to level on an uneven floor." },
  { no: "03", caption: "Lighting adjustment", detail: "Key softened with a 216 diffusion after the first look ran too hard across her face.", selected: true },
  { no: "04", caption: "Empty set, 6:40 AM", detail: "Called early to shoot the room before anyone had touched it." },
  { no: "05", caption: "Prop table, before strike", detail: "Continuity reference — every item logged before the next setup moves it." },
  { no: "06", caption: "Actor waiting", detail: "Between setups. Not a performance — just the wait, kept anyway.", selected: true },
  { no: "07", caption: "Costume fitting, final pass", detail: "Last adjustment before the fitting was signed off for the shoot." },
  { no: "08", caption: "Location scout, north wall", detail: "Light logged at three points across the afternoon before anything was booked." },
  { no: "09", caption: "Slate — Sc. 14, Take 3", detail: "Third take. Kept for the timing, not the line reading.", selected: true },
  { no: "10", caption: "Coffee break, 11:20", detail: "Eleven minutes behind schedule by now. Nobody minded." },
];

const SHOT_LIST = [
  { scene: "14", shot: "2", lens: "35mm", move: "Static", duration: "0:14", notes: "Hold longer", frame: 2 },
  { scene: "14", shot: "3", lens: "50mm", move: "Slow push", duration: "0:22", notes: "Stance breaks early", frame: 5 },
  { scene: "09", shot: "1", lens: "24mm", move: "Handheld", duration: "0:31", notes: "Natural light only", frame: 3 },
  { scene: "09", shot: "4", lens: "85mm", move: "Static", duration: "0:09", notes: "Don't cut", frame: 8 },
];

const STORYBOARDS = [
  { scene: "SC. 14 — INT. KITCHEN, MORNING", note: "Wide, static. Let the room breathe before she enters." },
  { scene: "SC. 09 — EXT. ROOFTOP, DUSK", note: "Push in slow. No cut on the line." },
];

const STILLS = [
  { caption: "Location scout — north wall", detail: "Shot at three points across the afternoon to log how the light actually moved through the room." },
  { caption: "Set dressing, before strike", detail: "Kept for the file, not the frame — nothing in this shot was ever meant to be seen." },
];

const DIRECTOR_NOTES = ["Hold longer.", "Natural light only.", "Try a wider lens.", "Don't cut."];

const SCRIPT_LINES = [
  { type: "slug", text: "14   INT. KITCHEN — MORNING" },
  { type: "action", text: "Light comes low through the blinds. Nothing moves." },
  { type: "character", text: "MARGOT" },
  { type: "dialogue", text: "You said you'd be gone by now.", highlight: true },
  { type: "dialogue", text: "I was going to leave a note.", strike: true },
  { type: "action", text: "He doesn't answer. Neither of them expected one." },
  { type: "character", text: "MARGOT (CONT'D)" },
  { type: "dialogue", text: "Then don't leave one." },
];

const SCRIPT_ANNOTATIONS = [
  { top: "20%", text: "Cut the blinds line in coverage — keep it for the wide only." },
  { top: "48%", text: "“I was going to leave a note” played better unfinished. Actor's instinct, not a script note." },
  { top: "78%", text: "This is the take. Circled twice in dailies." },
];

const FILM_FRAMES = [
  { exposed: true },
  { exposed: true },
  { exposed: false },
  { exposed: true },
  { exposed: true, damaged: true },
  { exposed: true },
  { exposed: false },
  { exposed: true },
  { exposed: true },
  { exposed: true },
  { exposed: false },
  { exposed: true },
  { exposed: true },
  { exposed: true, damaged: true },
  { exposed: false },
  { exposed: true },
  { exposed: true },
  { exposed: true },
  { exposed: false },
  { exposed: true },
  { exposed: true },
  { exposed: true },
  { exposed: false },
  { exposed: true },
  { exposed: true },
  { exposed: true, damaged: true },
  { exposed: true },
  { exposed: false },
];

const $ = (sel, root = document) => root.querySelector(sel);

initPageTransitionLinks();
revealStage({
  eyebrow: ".co-eyebrow",
  headline: ".co-title",
  body: [".co-tagline"],
  media: "#co-board",
});

const boardEl = $("#co-board");
const backdropEl = $("#co-backdrop");

// ---------------------------------------------------------------------------
// Shared inspector — a single "light table" overlay reused by the contact
// sheet frames and the director's notes card, the two artifacts whose whole
// point is a second, closer layer of detail. Everything else on the board
// (storyboards, lighting diagram) reveals its second layer in place, on
// hover, with no overlay needed.
// ---------------------------------------------------------------------------
let inspectorEl = document.createElement("div");
inspectorEl.className = "co-inspector";
document.body.appendChild(inspectorEl);

function openInspector(html) {
  inspectorEl.innerHTML = html;
  boardEl.classList.add("has-expanded");
  backdropEl.classList.add("is-visible");
  inspectorEl.classList.add("is-visible");
}

function closeInspector() {
  boardEl.classList.remove("has-expanded");
  backdropEl.classList.remove("is-visible");
  inspectorEl.classList.remove("is-visible");
}

backdropEl.addEventListener("click", closeInspector);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInspector();
});

// ---------------------------------------------------------------------------
// Contact sheet
// ---------------------------------------------------------------------------
function renderContactSheet() {
  $("#co-slot-contact").innerHTML = `
    <article class="co-artifact co-contact-sheet">
      <header class="co-artifact-label">CONTACT SHEET — ROLL 14</header>
      <div class="co-frames" id="co-frames">
        ${CONTACT_FRAMES.map(
          (f, i) => `
          <button type="button" class="co-frame" data-index="${i}" aria-label="Frame ${f.no} — ${f.caption}">
            <span class="co-frame-photo" style="${toneStyle(i)}"></span>
            ${f.selected ? '<span class="co-grease-circle" aria-hidden="true"></span>' : ""}
            <span class="co-frame-no">${f.no}</span>
          </button>`,
        ).join("")}
      </div>
    </article>`;

  $("#co-frames").addEventListener("click", (e) => {
    const btn = e.target.closest(".co-frame");
    if (!btn) return;
    const frame = CONTACT_FRAMES[Number(btn.dataset.index)];
    openInspector(`
      <div class="co-inspector-photo" style="${toneStyle(Number(btn.dataset.index))}"></div>
      <div class="co-inspector-body">
        <span class="co-inspector-label">FRAME ${frame.no} — ROLL 14</span>
        <h3 class="co-inspector-title">${frame.caption}</h3>
        <p class="co-inspector-text">${frame.detail}</p>
        ${frame.selected ? '<span class="co-inspector-tag">Marked for selects</span>' : ""}
      </div>`);
  });
}

// ---------------------------------------------------------------------------
// Shot list — hovering a row highlights the frame(s) it references.
// ---------------------------------------------------------------------------
function renderShotList() {
  $("#co-slot-shotlist").innerHTML = `
    <article class="co-artifact co-shotlist">
      <header class="co-artifact-label">SHOT LIST — SC. 09 / 14</header>
      <table class="co-shotlist-table">
        <thead>
          <tr><th>Sc.</th><th>Sh.</th><th>Lens</th><th>Move</th><th>Dur.</th></tr>
        </thead>
        <tbody>
          ${SHOT_LIST.map(
            (s, i) => `
            <tr class="co-shotlist-row" data-frame="${s.frame}" tabindex="0">
              <td>${s.scene}</td><td>${s.shot}</td><td>${s.lens}</td><td>${s.move}</td><td>${s.duration}</td>
            </tr>`,
          ).join("")}
        </tbody>
      </table>
    </article>`;

  const rows = document.querySelectorAll(".co-shotlist-row");
  rows.forEach((row) => {
    const frameEl = () => document.querySelector(`.co-frame[data-index="${row.dataset.frame}"]`);
    const on = () => frameEl()?.classList.add("is-referenced");
    const off = () => frameEl()?.classList.remove("is-referenced");
    row.addEventListener("mouseenter", on);
    row.addEventListener("mouseleave", off);
    row.addEventListener("focus", on);
    row.addEventListener("blur", off);
  });
}

// ---------------------------------------------------------------------------
// Storyboards — sketch/photo crossfade is pure CSS (:hover), no JS needed.
// ---------------------------------------------------------------------------
function renderStoryboards() {
  STORYBOARDS.forEach((sb, i) => {
    $(`#co-slot-storyboard-${i}`).innerHTML = `
      <article class="co-artifact co-storyboard">
        <div class="co-storyboard-frame">
          <svg class="co-storyboard-sketch" viewBox="0 0 120 80" aria-hidden="true">
            <rect x="4" y="4" width="112" height="72" fill="none" stroke="currentColor" stroke-width="1.2" />
            <path d="M20 55 Q30 30 45 50 T78 45" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" />
            <circle cx="30" cy="35" r="8" fill="none" stroke="currentColor" stroke-width="1" />
            <path d="M90 20 L104 12 L104 28 Z" fill="currentColor" opacity="0.7" />
          </svg>
          <span class="co-storyboard-photo" style="${toneStyle(i + 3, (i * 61) % 100)}"></span>
        </div>
        <span class="co-artifact-label">${sb.scene}</span>
        <p class="co-storyboard-note">${sb.note}</p>
      </article>`;
  });
}

// ---------------------------------------------------------------------------
// Annotated script — click toggles a layer of margin annotations.
// ---------------------------------------------------------------------------
function renderScript() {
  $("#co-slot-script").innerHTML = `
    <article class="co-artifact co-script" id="co-script">
      <header class="co-artifact-label">SHOOTING SCRIPT — P. 14</header>
      <div class="co-script-page">
        ${SCRIPT_LINES.map((l) => {
          if (l.type === "slug") return `<p class="co-script-slug">${l.text}</p>`;
          if (l.type === "character") return `<p class="co-script-character">${l.text}</p>`;
          if (l.type === "action") return `<p class="co-script-action">${l.text}</p>`;
          return `<p class="co-script-dialogue ${l.highlight ? "is-highlighted" : ""}">${l.strike ? `<del>${l.text}</del>` : l.text}</p>`;
        }).join("")}
        <div class="co-script-annotations">
          ${SCRIPT_ANNOTATIONS.map((a) => `<span class="co-script-annotation" style="top:${a.top}">${a.text}</span>`).join("")}
        </div>
      </div>
      <p class="co-script-hint">Click to see the margins</p>
    </article>`;

  $("#co-script").addEventListener("click", () => {
    $("#co-script").classList.toggle("is-annotated");
  });
}

// ---------------------------------------------------------------------------
// Lighting diagram — hover reveals the resulting still, pure CSS crossfade.
// ---------------------------------------------------------------------------
function renderLighting() {
  $("#co-slot-lighting").innerHTML = `
    <article class="co-artifact co-lighting">
      <header class="co-artifact-label">LIGHTING — SC. 14</header>
      <div class="co-lighting-frame">
        <svg class="co-lighting-diagram" viewBox="0 0 140 100" aria-hidden="true">
          <circle cx="70" cy="55" r="9" fill="none" stroke="currentColor" stroke-width="1.2" />
          <text x="70" y="58" font-size="6" text-anchor="middle" fill="currentColor">S</text>
          <rect x="20" y="20" width="10" height="18" fill="none" stroke="currentColor" stroke-width="1" />
          <line x1="30" y1="29" x2="62" y2="50" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 2" />
          <rect x="110" y="30" width="10" height="18" fill="none" stroke="currentColor" stroke-width="1" />
          <line x1="110" y1="39" x2="79" y2="52" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 2" />
          <rect x="55" y="82" width="30" height="6" fill="none" stroke="currentColor" stroke-width="1" />
          <text x="20" y="16" font-size="5.5" fill="currentColor">KEY</text>
          <text x="110" y="26" font-size="5.5" fill="currentColor">FILL</text>
          <text x="56" y="96" font-size="5.5" fill="currentColor">REFLECTOR</text>
        </svg>
        <span class="co-lighting-photo" style="${toneStyle(5, 44)}"></span>
      </div>
    </article>`;
}

// ---------------------------------------------------------------------------
// Production stills
// ---------------------------------------------------------------------------
function renderStills() {
  STILLS.forEach((s, i) => {
    $(`#co-slot-still-${i}`).innerHTML = `
      <article class="co-artifact co-still">
        <span class="co-still-photo" style="${toneStyle(i + 6, (i * 53 + 20) % 100)}"></span>
        <span class="co-artifact-label">${s.caption}</span>
      </article>`;
  });
}

// ---------------------------------------------------------------------------
// Director's notes — small card, click expands to the full notebook page.
// ---------------------------------------------------------------------------
function renderNotesCard() {
  $("#co-slot-notes").innerHTML = `
    <article class="co-artifact co-notes-card" id="co-notes-card" tabindex="0">
      <p class="co-notes-quote">“${DIRECTOR_NOTES[0]}”</p>
      <span class="co-notes-hint">Notebook, p. 3</span>
    </article>`;

  $("#co-notes-card").addEventListener("click", () => {
    openInspector(`
      <div class="co-inspector-body co-inspector-body--notes">
        <span class="co-inspector-label">DIRECTOR'S NOTES — NOTEBOOK, P. 3</span>
        <ul class="co-notes-list">
          ${DIRECTOR_NOTES.map((n) => `<li>“${n}”</li>`).join("")}
        </ul>
        <p class="co-inspector-text">Written between setups, not after. None of these made it into the shot list — they didn't need to.</p>
      </div>`);
  });
}

// ---------------------------------------------------------------------------
// Film strip — manual drag, no inertia. Direct 1:1 tracking while the
// pointer is down; releasing just stops, exactly where it is.
// ---------------------------------------------------------------------------
function renderFilmstrip() {
  $("#co-slot-filmstrip").innerHTML = `
    <article class="co-artifact co-filmstrip">
      <header class="co-artifact-label">WORKPRINT — B-ROLL, UNCUT</header>
      <div class="co-filmstrip-viewport" id="co-filmstrip-viewport">
        <div class="co-filmstrip-track" id="co-filmstrip-track">
          ${FILM_FRAMES.map(
            (f, i) => `
            <span class="co-filmstrip-frame ${f.exposed ? "is-exposed" : ""} ${f.damaged ? "is-damaged" : ""}" style="${toneStyle(i, (i * 29) % 100)}"></span>`,
          ).join("")}
        </div>
      </div>
    </article>`;

  const viewport = $("#co-filmstrip-viewport");
  const track = $("#co-filmstrip-track");
  let dragging = false;
  let startX = 0;
  let startTranslate = 0;
  let current = 0;
  let maxDrag = 0;

  function computeBounds() {
    maxDrag = Math.max(0, track.scrollWidth - viewport.clientWidth);
  }

  function apply(x) {
    current = Math.min(0, Math.max(-maxDrag, x));
    track.style.transform = `translateX(${current}px)`;
  }

  viewport.addEventListener("pointerdown", (e) => {
    computeBounds();
    dragging = true;
    startX = e.clientX;
    startTranslate = current;
    viewport.classList.add("is-dragging");
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    apply(startTranslate + (e.clientX - startX));
  });

  function endDrag() {
    dragging = false;
    viewport.classList.remove("is-dragging");
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  new ResizeObserver(computeBounds).observe(viewport);
}

renderContactSheet();
renderShotList();
renderStoryboards();
renderScript();
renderLighting();
renderStills();
renderNotesCard();
renderFilmstrip();
