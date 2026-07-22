import { resolve } from "path";
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, rmSync } from "fs";
import { defineConfig } from "vite";
import { COLLECTIONS, PRODUCTS } from "./src/data/products.js";

// DRACOLoader.js references its own bundled decoder via static `new URL(..., import.meta.url)`
// calls (see node_modules/three/examples/jsm/loaders/DRACOLoader.js) — Vite/Rollup treats those
// as asset imports and copies the referenced files into dist/assets/ unconditionally, even though
// our own DRACOLoader instance (see src/loader.js) always calls setDecoderPath("/draco/") and so
// never actually fetches them at runtime. This asset-URL handling happens ahead of the normal
// resolve/alias pipeline, so aliasing the specifiers away doesn't stop Rollup from emitting them
// (confirmed: tried it, files still land in dist/assets/ unchanged). Deleting the emitted files by
// exact byte match in closeBundle below is what actually works — nothing ever fetches them, so
// removing them post-build is safe; public/draco/ (fetched via setDecoderPath) is the only copy
// that's real.
const DEAD_DRACO_ASSETS = [
  "draco_decoder.js",
  "draco_decoder.wasm",
  "draco_wasm_wrapper.js",
  "gltf/draco_decoder.wasm",
  "gltf/draco_wasm_wrapper.js",
].map((p) => resolve(__dirname, "node_modules/three/examples/jsm/libs/draco", p));

// Clean, data-driven routes (/collections/<slug>/, /products/<slug>/) over a plain
// Vite MPA with no server framework: one physical template file per route *type*
// (collection-template.html / product-template.html), dev requests for any slug are
// rewritten to that template, and the build step copies the built template's output
// into every slug's own folder — so adding a product/collection to
// src/data/products.js is enough to make its route real everywhere.
function dataDrivenRoutes() {
  return {
    name: "data-driven-routes",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (/^\/products\/[^/]+\/?$/.test(url)) {
          req.url = "/product-template.html";
        } else if (/^\/collections\/[^/]+\/?$/.test(url)) {
          req.url = "/collection-template.html";
        }
        next();
      });
    },
    closeBundle() {
      const outDir = resolve(__dirname, "dist");
      const productTemplate = resolve(outDir, "product-template.html");
      const collectionTemplate = resolve(outDir, "collection-template.html");
      if (!existsSync(productTemplate) || !existsSync(collectionTemplate)) return;

      for (const product of PRODUCTS) {
        const dir = resolve(outDir, "products", product.slug);
        mkdirSync(dir, { recursive: true });
        copyFileSync(productTemplate, resolve(dir, "index.html"));
      }
      for (const collection of COLLECTIONS) {
        const dir = resolve(outDir, "collections", collection.slug);
        mkdirSync(dir, { recursive: true });
        copyFileSync(collectionTemplate, resolve(dir, "index.html"));
      }
      // "all" is a synthetic "Shop All" view handled specially by collection.js, not a
      // real entry in COLLECTIONS — still needs its own generated route.
      const allDir = resolve(outDir, "collections", "all");
      mkdirSync(allDir, { recursive: true });
      copyFileSync(collectionTemplate, resolve(allDir, "index.html"));

      // The top-level template files themselves aren't real routes — clean them up
      // now that every slug has its own copy.
      rmSync(productTemplate, { force: true });
      rmSync(collectionTemplate, { force: true });

      // See DEAD_DRACO_ASSETS above — strip three.js's own unused decoder bundle by
      // exact byte match, since Rollup gives each copy an unpredictable content hash.
      const assetsDir = resolve(outDir, "assets");
      if (existsSync(assetsDir)) {
        const deadBuffers = DEAD_DRACO_ASSETS.filter(existsSync).map((p) => readFileSync(p));
        for (const file of readdirSync(assetsDir)) {
          const filePath = resolve(assetsDir, file);
          const buf = readFileSync(filePath);
          if (deadBuffers.some((dead) => dead.length === buf.length && dead.equals(buf))) {
            rmSync(filePath);
          }
        }
      }

      if (readdirSync(outDir).length === 0) rmSync(outDir, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [dataDrivenRoutes()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        configurator: resolve(__dirname, "configurator.html"),
        productTemplate: resolve(__dirname, "product-template.html"),
        collectionTemplate: resolve(__dirname, "collection-template.html"),
        mannequin: resolve(__dirname, "mannequin.html"),
        lensDetail: resolve(__dirname, "lens-detail.html"),
        flaneur: resolve(__dirname, "flaneur.html"),
        nightEditor: resolve(__dirname, "night-editor.html"),
        contrarian: resolve(__dirname, "contrarian.html"),
      },
    },
  },
});
