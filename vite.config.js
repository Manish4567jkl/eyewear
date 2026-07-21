import { resolve } from "path";
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "fs";
import { defineConfig } from "vite";
import { COLLECTIONS, PRODUCTS } from "./src/data/products.js";

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
