// Single source of truth for every collection/product on the site. The home page's
// collection tiles, the collection grid/filters, and the PDP template all read from
// this file — adding a product here is enough to make it real (routing is generated
// from these slugs too, see vite.config.js).

export const COLLECTIONS = [
  {
    id: "heritage",
    slug: "heritage",
    name: "The Heritage Collection",
    eyebrow: "The Heritage Collection",
    tagline: "Aviator lines, aerospace titanium.",
    description:
      "The original line — bold, aviator-rooted silhouettes in aerospace-grade titanium and hand-lacquered " +
      "acetate, finished by hand in runs of under two hundred.",
  },
  {
    id: "meridian",
    slug: "meridian",
    name: "The Meridian Collection",
    eyebrow: "The Meridian Collection",
    tagline: "Cleaner lines, cut for a sharper edge.",
    description:
      "Where Heritage argues with weight and history, Meridian argues with precision — cleaner profiles " +
      "and bolder combination materials, built for a sharper, more contemporary presence.",
  },
];

// Reused as a fallback whenever a product doesn't define its own bespoke `craft` steps —
// the flagship product overrides this with a piece-specific making-of story.
export const DEFAULT_CRAFT_STEPS = [
  {
    media: "media-metal",
    caption: "Hinge detail — grade 5 titanium",
    eyebrow: "Metal",
    heading: "Aerospace-grade titanium",
    body:
      "Every frame begins as a solid titanium billet, milled and hand-polished over eleven stages. The " +
      "alloy is chosen for what it refuses to do: it will not corrode, will not fatigue at the hinge, and " +
      "will not add weight the face has to carry.",
  },
  {
    media: "media-lens",
    caption: "Lens edge — hand-ground optical glass",
    eyebrow: "Lens",
    heading: "Hand-ground optical glass",
    body:
      "We use mineral glass over polymer for its optical clarity and resistance to scratching, ground and " +
      "edge-polished by hand to sit flush within the frame without a visible seam.",
  },
  {
    media: "media-temple",
    caption: "Temple — spring-loaded barrel hinge",
    eyebrow: "Construction",
    heading: "Assembled by hand, in small runs",
    body:
      "Each temple is fitted with a spring-loaded barrel hinge and set by a single craftsperson from start " +
      "to finish. We build in runs of under two hundred, which is slower, and, we think, worth it.",
  },
];

const DEFAULT_ACETATE_SPECS = [
  [
    { label: "Frame Material", value: "Hand-Cut Italian Acetate" },
    { label: "Finish", value: "Lacquered, Hand-Buffed" },
    { label: "Hinge", value: "Spring-Loaded Metal Barrel Hinge" },
    { label: "Weight", value: "26 Grams" },
  ],
  [
    { label: "Lens Material", value: "Mineral Glass" },
    { label: "Lens Treatment", value: "Polarized, Anti-Reflective" },
    { label: "Atelier", value: "Outside Geneva" },
    { label: "Production", value: "Made to Order" },
  ],
];

// `type` drives the configurator: "sunglasses" gets the full lens-tint rail, "optical"
// gets a clear-only lens with an anti-reflective coating toggle instead.
//
// `frameConstruction` ("metal", the default, or "acetate") picks which .glb loads and
// which material pipeline applies — acetate frames are a single pigmented body (one
// color control, via `acetateColor`) with a separate metal hinge (`hingeFinish`), not
// the metal frame's per-part finish palette. `configuratorTabs` lists which rail tabs
// apply to this product; metal products default to the full frame/handles/hinge/lens/
// text set when omitted (see pdp.js), acetate products specify their own (no temple
// tab — the acetate body is one continuous piece — and no text tab unless the model
// actually has a logo mesh).
export const PRODUCTS = [
  {
    slug: "the-ostrande",
    name: "The Ostrande",
    collection: "heritage",
    type: "sunglasses",
    flagship: true,
    description:
      "Hand-finished aviator in aerospace-grade titanium, cut with a lowered bridge and a wider brow for " +
      "a quietly assertive line.",
    price: 1240,
    frameFinish: "gunmetal",
    lensTint: "clear",
    textColor: "silver",
    specs: [
      [
        { label: "Frame Material", value: "Grade 5 Titanium" },
        { label: "Finish", value: "Hand-Polished, 11 Stages" },
        { label: "Hinge", value: "Spring-Loaded Barrel Hinge" },
        { label: "Weight", value: "24 Grams" },
        { label: "Temple Length", value: "145mm" },
        { label: "Total Width", value: "140mm" },
      ],
      [
        { label: "Lens Material", value: "Mineral Glass" },
        { label: "Lens Treatment", value: "Polarized, Anti-Reflective" },
        { label: "Lens Width", value: "52mm" },
        { label: "Bridge Width", value: "20mm" },
        { label: "Atelier", value: "Outside Geneva" },
        { label: "Production", value: "Made to Order" },
      ],
    ],
    craft: [
      {
        media: "media-hinge",
        caption: "Hinge detail — grade 5 titanium",
        eyebrow: "Detail I",
        heading: "A billet, before it is a frame",
        body:
          "Each Ostrande begins as raw titanium stock, sourced for its purity and milled slightly oversized " +
          "so there is room to remove by hand what the machine could not. A single artisan carries the " +
          "piece through eleven polishing stages, working from coarse abrasive to a final rouge pass that " +
          "takes the surface from matte to mirror without ever softening the frame's original line.",
      },
      {
        media: "media-engraving",
        caption: "Temple — hand-set engraving",
        eyebrow: "Detail II",
        heading: "A signature, cut by hand",
        body:
          "The interior temple carries a shallow engraving, set by a single steady hand rather than a laser " +
          "— close up, the letterforms carry the faint, human irregularity that separates a made object " +
          "from a manufactured one. It is the last mark added before the piece is fitted with its hinge.",
      },
      {
        media: "media-lens-edge",
        caption: "Lens edge — hand-ground mineral glass",
        eyebrow: "Detail III",
        heading: "An edge you cannot see",
        body:
          "The lens is ground from mineral glass and edge-polished to sit flush within the frame with no " +
          "visible seam — a finish that exists only to be felt, not seen. We build in runs of under two " +
          "hundred, which is slower, and, we think, worth it.",
      },
    ],
  },
  {
    slug: "the-cassian",
    name: "The Cassian",
    collection: "heritage",
    type: "sunglasses",
    frameConstruction: "acetate",
    model: "/models/acetate.glb",
    description: "A squared acetate frame in deep charcoal, cut for a strong brow line.",
    price: 1050,
    acetateColor: "black",
    hingeFinish: "gunmetal",
    lensTint: "gray",
    configuratorTabs: ["frame", "hinge", "lens"],
    specs: DEFAULT_ACETATE_SPECS,
  },
  {
    // Hybrid combination frame: black acetate body (front + both temples + the
    // nosepad's plastic head all share one non-metallic "Black FRame" glTF material)
    // set in polished gold hardware (hinge bolt/screw + the nosepad's metal bracket
    // all share "gold.*" metallic materials) — the same acetate-body-plus-metal-
    // hardware pipeline as The Cassian, just with an extra metal nosepad piece lumped
    // into the shared hinge finish, same as acetate.glb's own multi-piece hardware.
    slug: "the-corbin",
    name: "The Corbin",
    collection: "meridian",
    type: "sunglasses",
    frameConstruction: "acetate",
    model: "/models/cool-sunglasses.glb",
    description: "A bold combination frame — black acetate body set in polished gold hardware, cut for a sharp, contemporary edge.",
    price: 1090,
    acetateColor: "black",
    hingeFinish: "polishedGold",
    lensTint: "green",
    configuratorTabs: ["frame", "hinge", "lens"],
    specs: DEFAULT_ACETATE_SPECS,
  },
];

export function getCollection(slug) {
  return COLLECTIONS.find((c) => c.slug === slug) ?? null;
}

export function getProduct(slug) {
  return PRODUCTS.find((p) => p.slug === slug) ?? null;
}

export function getCollectionProducts(collectionSlug) {
  return PRODUCTS.filter((p) => p.collection === collectionSlug);
}

export function getSiblingProducts(product, max = 3) {
  return PRODUCTS.filter((p) => p.collection === product.collection && p.slug !== product.slug).slice(0, max);
}

export function formatPrice(price) {
  return `$${price.toLocaleString("en-US")}`;
}
