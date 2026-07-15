import { gsap } from "./motion.js";

/**
 * The one new signature motion moment: as the page scrolls into a designated light
 * zone (the Craft section) and back out, the actual page background color crossfades
 * smoothly along with it — not just content fading over a static backdrop. Scrubbed to
 * scroll position so it reads as cinematic rather than a discrete on/off cut.
 *
 * Timed to complete *before* Craft's own pin engages (pin starts at "top top"; this
 * finishes by "top 20%"), so by the time the pinned, dark-ink-text craft content is
 * actually on screen the background has already fully settled to cream.
 */
export function initBackgroundCrossfade(sectionSelector = "#craft") {
  const section = document.querySelector(sectionSelector);
  if (!section) return;

  gsap.to("body", {
    backgroundColor: "#f2ece1",
    ease: "none",
    scrollTrigger: { trigger: section, start: "top 80%", end: "top 20%", scrub: true },
  });

  gsap.to("body", {
    backgroundColor: "#0c0b0a",
    ease: "none",
    scrollTrigger: { trigger: section, start: "bottom 80%", end: "bottom 20%", scrub: true },
  });
}
