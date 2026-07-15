import { gsap, SplitText, EASE, DUR } from "./motion.js";

/**
 * The pinned, scroll-scrubbed "Craft" editorial sequence — identical behavior on the
 * home page and every product page (only the copy/media differ, via craft.css's shared
 * class names). Desktop pins the section for its scroll range while steps crossfade/
 * wipe in; mobile disables the pin and falls back to a plain stacked reveal.
 */
export function initCraftSequence(sectionSelector = "#craft") {
  const mm = gsap.matchMedia();

  mm.add("(min-width: 901px)", () => {
    gsap.from(`${sectionSelector} .craft-head`, {
      opacity: 0,
      y: 18,
      duration: DUR.reveal,
      ease: EASE.entrance,
      scrollTrigger: { trigger: `${sectionSelector} .craft-head`, start: "top 85%" },
    });

    const steps = gsap.utils.toArray(`${sectionSelector} .craft-step`);
    const media = steps.map((step) => step.querySelector(".craft-media"));
    const texts = steps.map((step) => step.querySelector(".craft-text"));
    const dots = gsap.utils.toArray(`${sectionSelector} .craft-progress-dot`);

    const wordSplits = steps.map((step) => SplitText.create(step.querySelector(".craft-body"), { type: "words" }));

    gsap.set(steps, { opacity: 0 });
    gsap.set(steps[0], { opacity: 1 });
    gsap.set(media, { clipPath: "inset(0 100% 0 0)" });
    gsap.set(media[0], { clipPath: "inset(0 0% 0 0)" });
    gsap.set(texts, { y: 20 });
    gsap.set(texts[0], { y: 0 });
    wordSplits.forEach((split) => gsap.set(split.words, { opacity: 0, yPercent: 60 }));
    gsap.set(wordSplits[0].words, { opacity: 1, yPercent: 0 });
    dots[0]?.classList.add("active");

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionSelector,
        start: "top top",
        end: "+=250%",
        scrub: 0.4,
        pin: `${sectionSelector} .craft-pin`,
        anticipatePin: 1,
      },
    });

    steps.forEach((step, i) => {
      tl.to({}, { duration: 0.45 });
      if (i === steps.length - 1) return;
      const next = i + 1;

      tl.to(media[i], { clipPath: "inset(0 0 0 100%)", duration: 0.3, ease: EASE.entrance }, ">")
        .to(step, { opacity: 0, duration: 0.2 }, "<")
        .to(steps[next], { opacity: 1, duration: 0.2 }, "<0.03")
        .fromTo(
          media[next],
          { clipPath: "inset(0 100% 0 0)" },
          { clipPath: "inset(0 0% 0 0)", duration: 0.35, ease: EASE.entrance },
          "<",
        )
        .fromTo(texts[next], { y: 20 }, { y: 0, duration: 0.3, ease: EASE.entrance }, "<0.05")
        .to(
          wordSplits[next].words,
          { opacity: 1, yPercent: 0, duration: 0.3, ease: EASE.entrance, stagger: 0.014 },
          "<0.06",
        )
        .call(() => dots.forEach((dot, di) => dot.classList.toggle("active", di === next)));
    });
  });

  mm.add("(max-width: 900px)", () => {
    gsap.from(`${sectionSelector} .craft-head`, {
      opacity: 0,
      y: 18,
      duration: DUR.reveal,
      ease: EASE.entrance,
      scrollTrigger: { trigger: `${sectionSelector} .craft-head`, start: "top 85%" },
    });

    gsap.utils.toArray(`${sectionSelector} .craft-step`).forEach((step) => {
      gsap.from(step, {
        opacity: 0,
        y: 26,
        duration: DUR.reveal,
        ease: EASE.entrance,
        scrollTrigger: { trigger: step, start: "top 85%" },
      });
    });
  });

  return mm;
}

/** Renders the shared craft-step DOM into a `.craft-stack` container from plain data. */
export function renderCraftSteps(stackEl, steps) {
  stackEl.innerHTML = steps
    .map(
      (step, i) => `
      <div class="craft-step${i % 2 === 1 ? " reverse" : ""}">
        <div class="craft-media ${step.media}">
          <div class="craft-caption">${step.caption}</div>
        </div>
        <div class="craft-text">
          <div class="eyebrow">${step.eyebrow}</div>
          <h3 class="craft-heading">${step.heading}</h3>
          <p class="craft-body">${step.body}</p>
        </div>
      </div>`,
    )
    .join("");

  const progressEl = stackEl.parentElement.querySelector(".craft-progress");
  if (progressEl) {
    progressEl.innerHTML = steps.map(() => `<span class="craft-progress-dot"></span>`).join("");
  }
}
