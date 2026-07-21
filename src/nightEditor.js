import { gsap, EASE, DUR } from "./motion.js";
import { initPageTransitionLinks, revealStage } from "./pageTransition.js";

// ==========================================================================
// Six "reading plates" — each a different editorial legibility challenge, in
// the Night Editor's own voice (proofing copy at 2am, not writing it fresh).
// `html` is rendered into both the dim and lamp-lit text layers (see below);
// `marks` are the small hidden proofing marks scattered across that plate,
// revealed by proximity to the lens rather than by clicking.
// ==========================================================================
const MARK_GLYPHS = {
  note: "✎",
  stet: "◌",
  correction: "‸",
  registration: "⊕",
};

const MARK_LABELS = {
  note: "Margin note",
  stet: "Stet mark",
  correction: "Correction",
  registration: "Registration mark",
};

const PLATES = [
  {
    numeral: "I",
    name: "Long-Form",
    html: `
      <p class="ne-dropcap">The best editing is invisible. A reader should never feel the seam where a
      clumsy sentence became a clean one — only that the piece, somehow, reads like it always meant to
      say exactly this. Which is the whole difficulty of the job: the better the pass, the less anyone
      will ever know it happened.</p>
      <p>He keeps two pens at the desk and uses neither for writing. One marks what has to change; the
      other marks what's allowed to stay exactly as strange as it already is. Telling them apart, six
      nights a week, is most of the actual skill.</p>
      <p>By midnight the piece has usually been read four times and improved twice — the other two passes
      are for confidence, not correction, and he's stopped pretending otherwise.</p>`,
    marks: [
      { x: 90, y: 8, type: "note", text: "“Invisible” is doing a lot of work in this sentence — keep it, don't soften it." },
      { x: 8, y: 42, type: "stet", text: "Editor tried to cut this line twice. It survived both times." },
      { x: 92, y: 70, type: "note", text: "True the other three nights too, but this is the only one he'll admit to in print." },
    ],
  },
  {
    numeral: "II",
    name: "Proof Pages",
    html: `
      <div class="ne-proof-cols">
        <p>Second pass, eleven-forty. The lede holds; the middle sags. Cut the third graf entirely — it
        repeats the second, just slower. Tighten the kicker. Confirm the pull quote still lands after the
        cut, since it was set against a sentence that no longer exists.</p>
        <p>Run the corrected proof past the desk once more before it ships. Nothing goes out on a first
        read, not even the short ones — especially not the short ones, which hide their weak joints better
        than anything long enough to sag on its own.</p>
        <p>Third pass, one-fifteen. Quieter now. The changes left are small: a comma restored, a widow
        fixed, one word swapped for a plainer one that means exactly the same thing but reads half a beat
        faster.</p>
      </div>`,
    marks: [
      { x: 80, y: 14, type: "correction", text: "Third paragraph struck in full — repeats paragraph two, at half the pace." },
      { x: 10, y: 48, type: "stet", text: "“Stet” — Latin for “let it stand.” Overrides an earlier correction." },
      { x: 84, y: 76, type: "note", text: "One-fifteen is the good hour. Nothing left to cut, only things left to notice." },
    ],
  },
  {
    numeral: "III",
    name: "Fine Print",
    html: `
      <ol class="ne-footnotes">
        <li>Measurements taken at 21°C under D65 illumination, the same standard used across every plate
        in this issue.</li>
        <li>Tolerance ±0.4mm across the bridge, per batch — checked against three separate production runs
        before the figure was allowed to print.</li>
        <li>See Materials, Plate 06, for the full lens coating spec and its accompanying revision history.</li>
        <li>Weights quoted per temple, not per pair; the pair figure is a sum, not a separate measurement.</li>
        <li>Hinge torque tested to 40,000 open/close cycles, roughly a decade of ordinary handling.</li>
        <li>Any figure not footnoted here was confirmed against the same source, just not repeated twice.</li>
      </ol>`,
    marks: [
      { x: 88, y: 18, type: "note", text: "Tolerance confirmed against three separate batches before this printed." },
      { x: 10, y: 60, type: "registration", text: "Aligns this footnote block to the master proof — nudged 0.2mm on the last pass." },
      { x: 82, y: 84, type: "stet", text: "Someone asked whether footnote six was necessary. It stayed anyway." },
    ],
  },
  {
    numeral: "IV",
    name: "Corrections",
    html: `
      <p class="ne-corrections">The frame doesn't <del>compete with</del> <ins>complete</ins> the face.
      Grade 5 titanium, <del>hand</del> <ins>mirror</ins>-polished, <del>a</del> <ins>the</ins> hinge doing
      more work than the logo ever will. The lens sits <del>flush against</del> <ins>close to</ins> the
      brow without <del>ever </del>touching it, and the weight — what little of it there is — disappears
      somewhere around the second hour, <del>not the first</del> <ins>every time</ins>.</p>`,
    marks: [
      { x: 84, y: 12, type: "correction", text: "“Compete with” read as adversarial. “Complete” was the actual claim being made." },
      { x: 8, y: 46, type: "note", text: "Query: confirm “mirror-polished” against the finish sheet before this goes to print." },
      { x: 88, y: 72, type: "correction", text: "“Not the first” was a hedge nobody asked for. Cut it, kept the confidence." },
    ],
  },
  {
    numeral: "V",
    name: "Micro Type",
    html: `
      <div class="ne-caption-block">
        <p>FIG. 03 — THE CASSIAN, GRAY TINT</p>
        <p>PHOTOGRAPHED · SABAE, JAPAN</p>
        <p>PROOF 02 OF 04 · NOT FOR REPRODUCTION</p>
        <p>© THORNE &amp; VALE — ISSUE NO. 07</p>
        <p>SET IN BODONI MODA &amp; SPACE MONO</p>
        <p>TRACKING +2, LEADING 1.4× — CHECKED AT ARM'S LENGTH, NOT ON SCREEN</p>
        <p>COLOR PROOF 3 OF 3 — APPROVED 01:52 AM</p>
      </div>`,
    marks: [
      { x: 86, y: 20, type: "registration", text: "Aligns the four-color proof to the black plate — off by a hair here, corrected next pass." },
      { x: 10, y: 58, type: "note", text: "Checked at arm's length on purpose — screen zoom lies about what a reader will actually see." },
    ],
  },
  {
    numeral: "VI",
    name: "Specifications",
    html: `
      <dl class="ne-spec-list">
        <div><dt>Weight</dt><dd>3.4g / temple</dd></div>
        <div><dt>Hinge</dt><dd>5-barrel, micro-blasted</dd></div>
        <div><dt>Lens</dt><dd>Mineral glass, gray</dd></div>
        <div><dt>Origin</dt><dd>Sabae, Japan</dd></div>
        <div><dt>Coating</dt><dd>Anti-reflective, both sides</dd></div>
        <div><dt>Cycles tested</dt><dd>40,000 open/close</dd></div>
        <div><dt>Bridge tolerance</dt><dd>±0.4mm</dd></div>
      </dl>`,
    marks: [
      { x: 84, y: 16, type: "note", text: "Weight verified on a calibrated scale, not the spec sheet — the two disagreed by 0.1g." },
      { x: 10, y: 68, type: "registration", text: "Every figure on this sheet ships to the printer exactly as it appears here — no rounding for style." },
    ],
  },
];

const $ = (sel, root = document) => root.querySelector(sel);

initPageTransitionLinks();
revealStage({
  eyebrow: ".ne-eyebrow",
  headline: ".ne-title",
  body: [".ne-tagline"],
  media: "#ne-panel",
});

const plateNavEl = $("#ne-plates");
const readingEl = $("#ne-reading");
const watermarkEl = $("#ne-watermark");
const textEl = $("#ne-text");
const marksEl = $("#ne-marks");
const detailEl = $("#ne-detail");

let activePlate = 0;
let activeMark = null;
let containerRect = null;

plateNavEl.innerHTML = PLATES.map(
  (p, i) => `
    <button type="button" class="ne-plate-tab" data-index="${i}">
      <span class="ne-plate-numeral">${p.numeral}</span>
      <span class="ne-plate-name">${p.name}</span>
    </button>`,
).join("");
const plateTabs = Array.from(document.querySelectorAll(".ne-plate-tab"));

function renderIdleDetail() {
  detailEl.innerHTML = `
    <div class="ne-detail-idle">
      <span class="ne-detail-idle-mark">${MARK_GLYPHS.note}</span>
      <p>Move the lens across the page —<br />marks reveal themselves as you read.</p>
    </div>`;
}

function renderMarkDetail(mark) {
  detailEl.innerHTML = `
    <div class="ne-detail-entry">
      <span class="ne-detail-glyph">${MARK_GLYPHS[mark.type]}</span>
      <span class="ne-detail-label">${MARK_LABELS[mark.type]}</span>
      <p class="ne-detail-text">${mark.text}</p>
    </div>`;
}

function crossfadeDetail(render) {
  gsap.to(detailEl, {
    opacity: 0,
    y: 6,
    duration: DUR.snap,
    ease: EASE.hoverIn,
    onComplete: () => {
      render();
      gsap.fromTo(detailEl, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: DUR.release, ease: EASE.hoverOut });
    },
  });
}

function setActiveMark(mark) {
  if (mark === activeMark) return;
  activeMark = mark;
  crossfadeDetail(mark ? () => renderMarkDetail(mark) : renderIdleDetail);
}

function renderPlate(index, { animate = true } = {}) {
  activePlate = index;
  const plate = PLATES[index];

  plateTabs.forEach((tab, i) => tab.classList.toggle("is-active", i === index));

  const apply = () => {
    watermarkEl.textContent = plate.numeral;
    textEl.innerHTML = plate.html;
    marksEl.innerHTML = plate.marks
      .map(
        (m, i) => `
        <button type="button" class="ne-mark ne-mark--${m.type}" data-index="${i}" style="left:${m.x}%; top:${m.y}%"
          aria-label="${MARK_LABELS[m.type]}">
          ${MARK_GLYPHS[m.type]}
        </button>`,
      )
      .join("");
    setActiveMark(null);
  };

  if (!animate) {
    apply();
    return;
  }

  gsap.to(textEl, {
    opacity: 0,
    duration: DUR.snap,
    ease: EASE.hoverIn,
    onComplete: () => {
      apply();
      gsap.fromTo(textEl, { opacity: 0 }, { opacity: 1, duration: DUR.release, ease: EASE.hoverOut });
    },
  });
}

plateNavEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".ne-plate-tab");
  if (!btn) return;
  const index = Number(btn.dataset.index);
  if (index !== activePlate) renderPlate(index);
});

// ---------------------------------------------------------------------------
// The lens — a small warm-lit circle that follows the pointer. Implemented as
// a CSS mask on the "sharp" text layer (revealing the crisp, lamp-lit copy
// only near the cursor) plus a matching radial glow behind it, both driven by
// two CSS custom properties so the only per-move JS cost is setting numbers,
// not touching layout.
// ---------------------------------------------------------------------------
const REVEAL_RADIUS = 130; // px — how far a mark starts responding to the lens

function updateLens(clientX, clientY) {
  if (!containerRect) containerRect = readingEl.getBoundingClientRect();
  const x = clientX - containerRect.left;
  const y = clientY - containerRect.top;

  readingEl.style.setProperty("--lx", `${x}px`);
  readingEl.style.setProperty("--ly", `${y}px`);

  let closest = null;
  Array.from(marksEl.children).forEach((markEl, i) => {
    const mark = PLATES[activePlate].marks[i];
    const mx = (mark.x / 100) * containerRect.width;
    const my = (mark.y / 100) * containerRect.height;
    const reveal = Math.max(0, 1 - Math.hypot(x - mx, y - my) / REVEAL_RADIUS);
    markEl.style.setProperty("--reveal", reveal.toFixed(3));
    markEl.classList.toggle("is-near", reveal > 0.15);
    if (reveal > 0.82) closest = mark;
  });

  setActiveMark(closest);
}

readingEl.addEventListener("pointermove", (e) => {
  readingEl.classList.add("has-interacted");
  updateLens(e.clientX, e.clientY);
});

readingEl.addEventListener("pointerleave", () => {
  // Park the lens off to the side rather than snapping to 0,0 — reads as the
  // lamp being lifted away, not the page glitching.
  readingEl.style.setProperty("--lx", "-9999px");
  readingEl.style.setProperty("--ly", "-9999px");
});

marksEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".ne-mark");
  if (!btn) return;
  const mark = PLATES[activePlate].marks[Number(btn.dataset.index)];
  setActiveMark(mark);
});

new ResizeObserver(() => {
  containerRect = readingEl.getBoundingClientRect();
}).observe(readingEl);

renderIdleDetail();
renderPlate(0, { animate: false });
