import { gsap, SplitText, initSmoothScroll, EASE, DUR } from "./motion.js";
import { initCraftSequence } from "./craftSequence.js";
import { initBackgroundCrossfade } from "./bgCrossfade.js";
import { initNav } from "./nav.js";

const lenis = initSmoothScroll();

// ---------- Header: solid backdrop past the first scroll step ----------
const header = document.querySelector("#site-header");
lenis.on("scroll", ({ scroll }) => {
  header.classList.toggle("solid", scroll > 24);
});

initNav();

// ==========================================================================
// Hero: a single woven timeline, not a slideshow of separate cues. Each
// element starts before the previous one has finished (negative overlaps),
// and the product name reveals character-by-character with a small
// overshoot — the one moment on the page allowed to feel like it "arrives."
// ==========================================================================

const heroTitleSplit = SplitText.create(".hero-title", { type: "chars" });

// The title itself still carries the page's baseline `.reveal { opacity: 0 }` (the
// pre-JS flash guard) — now that the actual reveal happens per-character below, the
// parent has to be un-hidden explicitly, or it stays invisible forever with nothing
// left to bring it back to opacity: 1.
gsap.set(".hero-title", { opacity: 1 });

gsap.set(".hero-copy .eyebrow", { y: 12 });
gsap.set(heroTitleSplit.chars, { yPercent: 130, opacity: 0 });
gsap.set(".hero-desc", { y: 14 });
gsap.set(".hero-copy .text-link", { y: 10 });
gsap.set(".hero-visual", { scale: 0.96 });

gsap
  .timeline({ delay: 0.1 })
  .to(".hero-copy .eyebrow", { opacity: 1, y: 0, duration: DUR.reveal, ease: EASE.entrance })
  .to(
    heroTitleSplit.chars,
    { yPercent: 0, opacity: 1, duration: 0.65, ease: EASE.overshoot, stagger: 0.022 },
    "-=0.3",
  )
  .to(".hero-visual", { opacity: 1, scale: 1, duration: DUR.revealLg, ease: EASE.entrance }, "-=0.55")
  .to(".hero-desc", { opacity: 1, y: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.5")
  .to(".hero-copy .text-link", { opacity: 1, y: 0, duration: DUR.reveal, ease: EASE.entrance }, "-=0.35");

// ---------- Hero: parallax on scroll-out ----------
gsap.to(".hero-copy", {
  yPercent: -16,
  ease: EASE.scrub,
  scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
});
gsap.to(".hero-visual", {
  yPercent: -6,
  ease: EASE.scrub,
  scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
});

// ==========================================================================
// Statement lines: an oversized single moment, split word-by-word so it
// arrives with the same weighted-reveal language as everything else, not a
// plain fade — these exist purely for pacing between sections.
// ==========================================================================
gsap.utils.toArray(".statement-text").forEach((el) => {
  const split = SplitText.create(el, { type: "words" });
  gsap.set(el, { opacity: 1 });
  gsap.set(split.words, { opacity: 0, yPercent: 60 });
  gsap.to(split.words, {
    opacity: 1,
    yPercent: 0,
    duration: 0.5,
    ease: EASE.entrance,
    stagger: 0.05,
    scrollTrigger: { trigger: el, start: "top 85%" },
  });
});

gsap.utils.toArray(".statement .eyebrow").forEach((el) => {
  gsap.from(el, {
    opacity: 0,
    y: 12,
    duration: DUR.reveal,
    ease: EASE.entrance,
    scrollTrigger: { trigger: el, start: "top 90%" },
  });
});

// ==========================================================================
// Collections: two full-bleed cinematic panels — each its own moment as it
// scrolls into view, not a staggered grid entrance.
// ==========================================================================
gsap.utils.toArray(".collection-tile").forEach((tile) => {
  gsap.from(tile.querySelector(".tile-copy"), {
    opacity: 0,
    y: 40,
    duration: DUR.revealLg,
    ease: EASE.entrance,
    scrollTrigger: { trigger: tile, start: "top 70%" },
  });
  gsap.fromTo(
    tile.querySelector(".tile-mood"),
    { scale: 1.12 },
    {
      scale: 1,
      ease: EASE.scrub,
      scrollTrigger: { trigger: tile, start: "top bottom", end: "top top", scrub: true },
    },
  );
});

// ==========================================================================
// Craft: pinned, scroll-scrubbed editorial sequence (shared with every PDP).
// The page background itself crossfades ink → cream → ink around this section,
// not just the content over a static backdrop.
// ==========================================================================
initCraftSequence("#craft");
initBackgroundCrossfade("#craft");

// ---------- Configurator CTA + footer: simple weighted rise ----------
gsap.from(".configurator-cta", {
  opacity: 0,
  y: 20,
  duration: DUR.revealLg,
  ease: EASE.entrance,
  scrollTrigger: { trigger: ".configurator-cta", start: "top 80%" },
});
