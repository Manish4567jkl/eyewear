import { gsap, SplitText, EASE, DUR } from "./motion.js";

// This is a plain multi-page site (real <a href> navigations, no client-side router),
// so a "page transition" here means two halves that never touch the same JS runtime:
// an exit choreography played on THIS document just before a real navigation fires,
// and an entrance choreography played on the DESTINATION document once its own script
// boots. The two halves agree on "which way" the visitor is moving via a one-shot
// sessionStorage flag, since that's the only channel that survives a real page load.
const NAV_STORAGE_KEY = "mv-nav";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function toEls(target) {
  if (!target) return [];
  if (typeof target === "string") return Array.from(document.querySelectorAll(target));
  if (target instanceof Element) return [target];
  // Arrays/NodeLists — including arrays that mix selector strings and elements, as
  // revealStage()'s `body` callers commonly pass (e.g. ["#breadcrumb", "#desc"]).
  if (typeof target.length === "number") return Array.from(target).flatMap(toEls);
  return [];
}

function toEl(target) {
  if (!target) return null;
  if (target instanceof Element) return target;
  if (typeof target === "string") return document.querySelector(target);
  return null;
}

export function storeDirection(direction) {
  try {
    sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({ direction }));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — entrance just falls back to "forward".
  }
}

/** Reads and clears the one-shot direction flag left by the page that navigated here. */
export function consumeStoredDirection() {
  try {
    const raw = sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return "forward";
    sessionStorage.removeItem(NAV_STORAGE_KEY);
    return JSON.parse(raw).direction === "back" ? "back" : "forward";
  } catch {
    return "forward";
  }
}

/**
 * Plays the "leaving this page" half of a transition: page furniture fades out
 * staggered (text before media, per the brief), and — if a specific clicked element
 * is given — that element leads the motion with a brief scale/brighten pop before the
 * cut, signaling "this is where we're going." Resolves once settled, so callers can
 * await it before firing the real navigation.
 */
export function runExitTransition({ leadEl, textEls, mediaEls } = {}) {
  const lead = leadEl instanceof Element ? leadEl : null;
  // Opacity composites down the DOM tree — a data-exit container that happens to be an
  // *ancestor* of the lead element (e.g. a card grid fading out while one of its own
  // cards is the lead) would drag the lead's brightness/scale pop down with it as it
  // fades. Excluding that ancestor keeps the lead's own treatment the one thing that
  // stays fully visible through the cut.
  const notLeadAncestor = (el) => !lead || !el.contains(lead);
  const text = (textEls ? toEls(textEls) : toEls('[data-exit="text"]')).filter(notLeadAncestor);
  const media = (mediaEls ? toEls(mediaEls) : toEls('[data-exit="media"]')).filter(notLeadAncestor);

  if (prefersReducedMotion()) return Promise.resolve();

  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });

    if (text.length) {
      tl.to(text, { opacity: 0, scale: 0.97, y: -6, duration: DUR.exit, ease: EASE.exit, stagger: 0.1 }, 0);
    }
    if (media.length) {
      tl.to(media, { opacity: 0, scale: 0.97, duration: DUR.exit, ease: EASE.exit }, 0.12);
    }
    if (lead) {
      // Pops forward — deliberately *not* faded to 0 like the rest of the page: it
      // should still read as the largest thing on screen right up to the real
      // navigation cut, both as the strongest "this is where you're going" signal and
      // so a Chromium shared-element morph (see view-transitions.css) starts its
      // cross-document snapshot from a fully visible frame, not a faded one. Scale only
      // — `filter` was here too, but unlike scale/opacity it isn't compositor-only, so
      // it forces a full repaint of the lead element every frame of every single
      // navigation on the site, which read as choppy right at the moment it mattered
      // most.
      tl.to(lead, { scale: 1.05, duration: DUR.exit * 0.6, ease: EASE.hoverIn }, 0);
    }
    if (!text.length && !media.length && !lead) {
      // Nothing tagged for exit on this page yet — a plain body fade beats an instant cut.
      tl.to(document.body, { opacity: 0, duration: DUR.exit, ease: EASE.exit }, 0);
    }
  });
}

/**
 * One delegated click listener, called once per page's boot script, that intercepts
 * every same-origin, unmodified left-click on an internal link — nav, mega-menu,
 * product/collection cards, breadcrumbs, footer, brand logo — and routes it through
 * runExitTransition() before handing off to the real navigation. Nothing per-link to
 * wire up beyond marking a card's outer anchor `data-lead` (so the exit knows which
 * element should lead the motion) and, on back-navigation links (breadcrumbs, "Close
 * Plate", the brand logo), `data-nav-direction="back"` so the destination enters from
 * the opposite side.
 */
export function initPageTransitionLinks() {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;

    const raw = link.getAttribute("href");
    if (!raw || raw === "#") return;

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;
    // Same-document hash anchors are owned by Lenis's own anchor handler (see
    // initSmoothScroll in motion.js) or, on the homepage, the plate pager's data-jump —
    // a full exit/re-navigate would just be a jarring reload of the same page.
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;

    event.preventDefault();
    const leadEl = link.closest("[data-lead]") || null;
    const direction = link.dataset.navDirection === "back" ? "back" : "forward";
    storeDirection(direction);

    runExitTransition({ leadEl }).then(() => {
      window.location.href = link.href;
    });
  });
}

/**
 * The staged entrance choreography every destination page plays on boot: an eyebrow
 * label rises in, a SplitText headline staggers up with a small overshoot, supporting
 * content (breadcrumb, description, rail chrome) fades up staggered, then the hero
 * media settles in — the same shape as the homepage's proven cover-plate reveal (see
 * animatePlateEntrance("cover") in home.js), generalized for reuse. `direction`
 * ("forward"/"back") flips which side content enters from; when omitted it's read
 * from the one-shot flag the originating page's link click left behind.
 */
export function revealStage({ eyebrow, headline, headlineType = "chars", body, media, direction } = {}) {
  const dir = direction || consumeStoredDirection();
  const xOff = dir === "back" ? -16 : 16;

  const eyebrowEls = toEls(eyebrow);
  const headlineEl = toEl(headline);
  const bodyEls = toEls(body);
  const mediaEls = toEls(media);

  if (prefersReducedMotion()) {
    gsap.set([...eyebrowEls, ...bodyEls, ...mediaEls], { opacity: 1, clearProps: "transform" });
    if (headlineEl) gsap.set(headlineEl, { opacity: 1, clearProps: "transform" });
    return null;
  }

  const tl = gsap.timeline();

  if (eyebrowEls.length) {
    gsap.set(eyebrowEls, { opacity: 0, y: 12, x: xOff * 0.5 });
    tl.to(eyebrowEls, { opacity: 0.85, y: 0, x: 0, duration: DUR.reveal, ease: EASE.entrance }, 0);
  }

  if (headlineEl) {
    const split = SplitText.create(headlineEl, { type: headlineType });
    const targets = headlineType === "chars" ? split.chars : headlineType === "words" ? split.words : split.lines;
    gsap.set(headlineEl, { opacity: 1 });
    gsap.set(targets, { yPercent: 130, opacity: 0 });
    tl.to(
      targets,
      { yPercent: 0, opacity: 1, duration: 0.6, ease: EASE.overshoot, stagger: 0.018 },
      eyebrowEls.length ? "-=0.25" : 0,
    );
  }

  if (bodyEls.length) {
    gsap.set(bodyEls, { opacity: 0, y: 14, x: xOff * 0.4 });
    tl.to(bodyEls, { opacity: 1, y: 0, x: 0, duration: DUR.reveal, stagger: 0.06, ease: EASE.entrance }, "-=0.35");
  }

  if (mediaEls.length) {
    gsap.set(mediaEls, { opacity: 0, scale: 0.97 });
    tl.to(mediaEls, { opacity: 1, scale: 1, duration: DUR.revealLg, ease: EASE.entrance }, "-=0.4");
  }

  return tl;
}
