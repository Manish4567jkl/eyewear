import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, CustomEase, SplitText);

// Named, reference-grade bezier curves — not GSAP's generic power/expo presets, and not
// guessed. "expoOut" is the aggressive-deceleration curve used throughout premium sites
// for entrances (text, images, panels); "overshoot" is a small, deliberate over-travel
// for the handful of reveals that should read as having physical weight.
CustomEase.create("expoOut", "0.16, 1, 0.3, 1");
CustomEase.create("overshoot", "0.34, 1.56, 0.64, 1");
// A gentle, even ease-in-out — no violent acceleration at either end — for page-leave
// choreography. Replaces an earlier quintic-in curve ("0.7, 0, 0.84, 0") that stayed
// almost still through most of its run then rocketed away right at the cut: technically
// an "accelerate away" mirror of the entrance ease, but in practice it read as a sudden,
// hurried yank rather than one continuous unhurried motion.
CustomEase.create("smoothOut", "0.45, 0, 0.2, 1");

export const EASE = {
  entrance: "expoOut", // aggressive-decel entrance for text/images — the default "in" ease
  overshoot: "overshoot", // small over-travel + settle, for the reveals that should feel weighted
  exit: "smoothOut", // even, unhurried curve for page-leave choreography — see smoothOut above
  hoverIn: "power4.out", // hover/tilt "snap toward" — short, sharp deceleration
  hoverOut: "power2.out", // hover/tilt "release" — a touch softer/slower than the snap in
  scrub: "none", // linear — a scrub tween should never re-ease on top of the scroll input itself
};

// Durations in seconds. Kept short and named so a call site reads as intent, not a
// magic number: micro-interactions (hover/tilt) stay quick and responsive at
// 150–250ms, but page-leave/entrance choreography runs deliberately slower — this is
// a real cross-document navigation with a hard cut in the middle (no root cross-fade,
// see view-transitions.css), and a rushed exit/entrance either side of that cut reads
// as a hurried snap rather than one continuous, unhurried motion. Raised from an
// earlier, snappier pass (exit 0.48/reveal 0.62/revealLg 0.85) specifically because
// that read as "sliding fast," not as taking its time.
export const DUR = {
  snap: 0.15, // hover-in, tilt tracking
  release: 0.25, // hover-out, tilt reset
  exit: 0.85, // page-leave choreography, before the real navigation fires
  reveal: 0.9, // text/small-element entrances
  revealLg: 1.3, // image/panel entrances
};

/**
 * Lenis drives the actual scroll position; ScrollTrigger needs to recompute against
 * that smoothed position on every Lenis tick, and both need to share one rAF driver
 * (gsap.ticker) or they drift out of phase with each other — this is the standard
 * Lenis/GSAP integration, not a custom scheme.
 */
export function initSmoothScroll() {
  const lenis = new Lenis({
    // A duration+custom-easing curve reads as floaty/laggy under fast scroll input — a
    // plain lerp factor tracks the wheel/trackpad far more tightly while still rounding
    // off the physical scroll into something smoothed rather than raw. 0.1 is the "tight
    // but not raw" middle ground; much lower reads as sluggish, much higher stops smoothing.
    lerp: 0.1,
    smoothWheel: true,
  });

  lenis.on("scroll", ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  // Lenis already smooths the scroll itself — letting gsap's ticker *also* smooth for
  // lag would double up and read as sluggish rather than tight.
  gsap.ticker.lagSmoothing(0);

  // In-page anchors (nav links, "Explore the collection", etc.) need to go through
  // Lenis too, or they'll hard-jump and fight the smoothed scroll on the very next frame.
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -8 });
    });
  });

  // ScrollTrigger measures every trigger's start/end from the DOM layout *at the moment
  // each is created* — which, on first script execution, is often before web fonts (and
  // SplitText's word/char wrapping, which itself depends on final font metrics) have
  // settled. A pinned section earlier in the page then has a stale pin-spacer height,
  // which pushes every trigger below it out of sync with the real, post-swap layout.
  // Re-measuring after fonts/images settle (and once more shortly after, as a safety net
  // for anything that still reflows late) fixes that instead of masking it per-section.
  document.fonts?.ready?.then(() => ScrollTrigger.refresh());
  window.addEventListener("load", () => ScrollTrigger.refresh());
  setTimeout(() => ScrollTrigger.refresh(), 1200);

  return lenis;
}

/**
 * A short crossfade for a piece of text that changes in response to a user choice
 * (material rail heading, configuration summary values, wall-label readouts) — used so
 * an instant selection's surrounding UI update reads as part of the same motion as the
 * ~0.8s 3D material tween it accompanies (see TWEEN_DURATION in frameMaterial.js etc.),
 * not a separate instant snap sitting next to a smooth render change.
 */
export function crossfadeText(el, nextText, { duration = 0.28 } = {}) {
  if (!el || el.textContent === nextText) return;
  gsap.to(el, {
    opacity: 0,
    y: -4,
    duration: duration / 2,
    ease: EASE.hoverIn,
    onComplete: () => {
      el.textContent = nextText;
      gsap.fromTo(el, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: duration / 2, ease: EASE.hoverOut });
    },
  });
}

export { gsap, ScrollTrigger, SplitText };
