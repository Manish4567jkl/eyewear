import { gsap, EASE } from "./motion.js";
import { runExitTransition, storeDirection } from "./pageTransition.js";

// A short, atmospheric default set — any call site can pass its own `phrases` to fit
// the specific scene (see product-template.html/mannequinScene.js/main.js call sites).
const DEFAULT_PHRASES = ["Preparing the plate…", "Polishing the frame…", "Adjusting the light…"];

const PHRASE_INTERVAL_MS = 2200;
const FADE_IN_S = 0.18;
const FADE_OUT_S = 0.35;
// How long the pre-navigation overlay holds the page before handing off to the real
// `location.href` navigation — long enough for the fade-in above, and for the
// underlying page's own runExitTransition() (see navigateWithLoadingTransition below)
// to actually read as motion through the loader rather than being cut off instantly.
const NAV_HANDOFF_MS = 240;

function buildOverlay(palette, plateNumber) {
  const el = document.createElement("div");
  el.className = "mv-loader";
  el.dataset.palette = palette;
  el.innerHTML = `
    <div class="mv-loader-corner mv-loader-corner--tl"></div>
    <div class="mv-loader-corner mv-loader-corner--tr"></div>
    <div class="mv-loader-corner mv-loader-corner--bl"></div>
    <div class="mv-loader-corner mv-loader-corner--br"></div>
    <div class="mv-loader-crosshair" aria-hidden="true">
      <div class="mv-loader-ring"></div>
      <div class="mv-loader-h"></div>
      <div class="mv-loader-v"></div>
    </div>
    <div class="mv-loader-phrase"></div>
    <div class="mv-loader-bar"><div class="mv-loader-bar-fill is-indeterminate"></div></div>
    <div class="mv-loader-plate">PLATE ${plateNumber}</div>
  `;
  return el;
}

/**
 * Mounts the full-viewport editorial loading overlay and returns a controller. Shows
 * immediately with a quick fade-in, cycles through atmospheric phrases on its own
 * timer (so a slow load reads as "still working," never frozen), and only leaves via
 * `hide()` — there is no built-in timeout, since the caller is expected to call
 * `hide()` from the resolution of its own real load promise (see `runLoadingTransition`
 * below), not a guessed delay.
 */
export function createLoadingTransition({
  mount = document.body,
  palette = "dark",
  plateNumber = "03",
  phrases = DEFAULT_PHRASES,
} = {}) {
  const el = buildOverlay(palette, plateNumber);
  mount.appendChild(el);

  const phraseEl = el.querySelector(".mv-loader-phrase");
  phraseEl.textContent = phrases[0];

  let phraseIndex = 0;
  const phraseTimer =
    phrases.length > 1
      ? setInterval(() => {
          phraseIndex = (phraseIndex + 1) % phrases.length;
          gsap.to(phraseEl, {
            opacity: 0,
            y: -4,
            duration: 0.14,
            ease: EASE.hoverIn,
            onComplete: () => {
              phraseEl.textContent = phrases[phraseIndex];
              gsap.fromTo(phraseEl, { opacity: 0, y: 4 }, { opacity: 0.92, y: 0, duration: 0.14, ease: EASE.hoverOut });
            },
          });
        }, PHRASE_INTERVAL_MS)
      : null;

  gsap.set(el, { opacity: 0 });
  gsap.to(el, { opacity: 1, duration: FADE_IN_S, ease: "power1.out" });

  let hidden = false;
  function hide() {
    if (hidden) return Promise.resolve();
    hidden = true;
    if (phraseTimer) clearInterval(phraseTimer);
    return new Promise((resolve) => {
      gsap.to(el, {
        opacity: 0,
        duration: FADE_OUT_S,
        ease: EASE.entrance,
        onComplete: () => {
          el.remove();
          resolve();
        },
      });
    });
  }

  return { el, hide };
}

/**
 * Wraps a scene's own load promise (typically `Promise.all([loadModel(...),
 * loadStudioEnvironment(...)])`, joined by the caller) — shows the loader now, hides
 * it exactly when that promise settles. The gate is the real asset promise, never a
 * fixed timeout, per the loading-transition spec.
 */
export async function runLoadingTransition(loadPromise, options) {
  const loader = createLoadingTransition(options);
  try {
    const result = await loadPromise;
    await loader.hide();
    return result;
  } catch (error) {
    await loader.hide();
    throw error;
  }
}

/**
 * For click-triggered hard navigations on this plain multi-page site (VIEW PLATE, On
 * Mannequin, Lens Detail, Enter the full configurator) — shows the overlay immediately
 * so the click reads as instant feedback, then hands off to the real navigation once
 * the fade-in has had a moment to actually play. `palette` should match the
 * *destination* page (not the page the click originated on): the destination mounts
 * its own instance of this same component on boot and keeps it up until its own scene
 * is ready, so the two overlays read as one continuous transition across the page
 * boundary rather than a color jump at the seam.
 *
 * Also fires the page's own runExitTransition() alongside the loader mount (pass
 * `leadEl` for the specific clicked element to lead the motion) — so the underlying
 * content is seen animating out *through* the loader's fade-in, not hard-cutting
 * behind an opaque cover.
 */
export function navigateWithLoadingTransition(href, { leadEl, direction, ...loaderOptions } = {}) {
  createLoadingTransition({ mount: document.body, ...loaderOptions });
  runExitTransition({ leadEl });
  storeDirection(direction === "back" ? "back" : "forward");
  setTimeout(() => {
    window.location.href = href;
  }, NAV_HANDOFF_MS);
}
